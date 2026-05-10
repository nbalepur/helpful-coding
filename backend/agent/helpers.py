"""
Agent helpers: implementation for execution, history, summary, and clear/halt.

Used by agent.api. To build your own agent backend, implement or replace these
helpers and wire them to your own routes (see agent.api for the endpoint contract).
"""
from __future__ import annotations

import difflib
import json
import os
import logging
import re
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Union

from fastapi.responses import JSONResponse
import litellm
from sqlalchemy.orm import Session

from agent.replace_code import parse_search_replace_block, apply_search_replace_in_memory
from agent.instances import (
    create_temp_workspace,
    get_or_create_coder_for_temp_dir,
    extract_uuid_from_temp_dir,
    clear_instances_for_user,
    clear_all_instances,
    delete_user_temp_dir,
)
from agent.generation import generate_summary_and_suggestions, generate_summary_only
from agent.code_preferences import (
    prepare_suggestions,
    resolve_project_id,
    log_code_preference_entry,
    parse_optional_int,
)
from database import AssistantLogCRUD, AssistantLogCreate
from database.sqlalchemy_models import User

logger = logging.getLogger(__name__)
ALLOWED_TASK_TYPES = {"agent", "chat", "plan"}
PLAN_FILENAME = "plan.md"
PLAN_MODEL = os.getenv("PLAN_MODEL", os.getenv("SUMMARY_MODEL", "gpt-4.1-2025-04-14"))
CHATBOT_MODEL = os.getenv("CHATBOT_MODEL", PLAN_MODEL)

# --------------------------
# Message history (ephemeral)
# --------------------------
MESSAGE_HISTORY: List[Dict[str, str]] = []


def append_history(entry: Dict[str, str]) -> None:
    try:
        if not isinstance(entry, dict):
            return
        role = entry.get("role")
        content = entry.get("content")
        if role in {"user", "assistant", "system"} and isinstance(content, str):
            MESSAGE_HISTORY.append({"role": role, "content": content})
            if len(MESSAGE_HISTORY) > 1000:
                del MESSAGE_HISTORY[: len(MESSAGE_HISTORY) - 1000]
    except Exception:
        pass


def get_message_history() -> List[Dict[str, str]]:
    """Return current message history (for GET /api/agent-history)."""
    return list(MESSAGE_HISTORY)


def resolve_user_id(db: Session, raw_user_id: Optional[Union[str, int]]) -> Optional[int]:
    value = parse_optional_int(raw_user_id)
    if value is None:
        return None
    if db.query(User.id).filter(User.id == value).first():
        return value
    logger.debug("User not found for code preference: %s", raw_user_id)
    return None


# --------------------------
# Execute: streaming (event generator)
# --------------------------
def _sanitize_message_text(text: str) -> str:
    if not text:
        return text
    s = re.sub(r"tmp\/aider_[^\/\s]+\/", "", text)
    s = re.sub(r"tmp\/aider_[^\/\s]+", "", s)
    return s


def _strip_trailing_code_fence(text: str) -> str:
    if not text:
        return text
    text = text.rstrip("\n\r")
    text = re.sub(r"[\n\r]*\s*```[a-zA-Z]*\s*$", "", text)
    return text.rstrip()


def _emit_ndjson(obj: Dict[str, Any]) -> bytes:
    return (json.dumps(obj) + "\n").encode("utf-8")


def _resolve_plan_content(
    incoming_files: Optional[Dict[str, str]],
    explicit_plan_content: Optional[str] = None,
) -> str:
    if isinstance(explicit_plan_content, str):
        return explicit_plan_content
    for filename, content in (incoming_files or {}).items():
        if str(filename or "").strip().lower() == PLAN_FILENAME:
            return str(content or "")
    return ""


def _build_plan_context_blob(incoming_files: Optional[Dict[str, str]]) -> str:
    if not incoming_files:
        return ""
    snippets: List[str] = []
    budget = 12000
    consumed = 0
    for filename, content in incoming_files.items():
        name = str(filename or "")
        if not name or name.lower() == PLAN_FILENAME:
            continue
        raw = str(content or "")
        if not raw.strip():
            continue
        ext = Path(name).suffix.lower().lstrip(".") or "plaintext"
        lang = {"js": "javascript", "py": "python", "md": "markdown"}.get(ext, ext)
        room = max(0, budget - consumed)
        if room <= 0:
            break
        snippet = raw[:room]
        consumed += len(snippet)
        snippets.append(f"<{name}>\n```{lang}\n{snippet}\n```\n</{name}>")
    return "\n\n".join(snippets)


def _build_chat_context_blob(incoming_files: Optional[Dict[str, str]]) -> str:
    """Build a trimmed code-context blob for chat mode.

    Chat mode is advisory only; this context is provided so the model can reference code accurately
    and propose edits as fenced code blocks (without applying edits).
    """
    if not incoming_files:
        return ""
    snippets: List[str] = []
    for filename, content in incoming_files.items():
        name = str(filename or "")
        if not name:
            continue
        if name.lower() == PLAN_FILENAME:
            continue
        raw = str(content or "")
        if not raw.strip():
            continue
        ext = Path(name).suffix.lower().lstrip(".") or "plaintext"
        lang = {"js": "javascript", "py": "python", "md": "markdown"}.get(ext, ext)
        # Do not trim: include the full file contents for chat context.
        snippets.append(f"<{name}>\n```{lang}\n{raw}\n```\n</{name}>")
    return "\n\n".join(snippets)


def _build_chat_prompt(prompt: str, incoming_files: Optional[Dict[str, str]]) -> str:
    files_context = _build_chat_context_blob(incoming_files)
    template = """
You are VibeJam Chat Mode: a helpful coding assistant.

You will receive a user's question plus their current project files. Your job is to help the user by:
- answering their question with respect to their code base
- providing brief, relevant code snippets 

Hard rules (Chat Mode):
- Do NOT apply edits, do NOT claim you changed files, do NOT output patch/search-replace blocks.
- Do NOT output "SEARCH/REPLACE" or Aider-style replacement snippets.
- Only respond in natural language and optional fenced code blocks.
- If you include code, use fenced blocks with an appropriate language tag like ```html, ```css, ```javascript.

Encouragement:
- If the users' query indicates that they actually want to make edits automatically, suggest switching to Agent mode.

User request:
<user_request>
{user_prompt}
</user_request>

Current project file context (trimmed):
<files_context>
{files_context}
</files_context>
""".strip()
    return template.format(
        user_prompt=str(prompt or "").strip(),
        files_context=files_context or "(no files provided)",
    )


def generate_or_revise_plan(
    prompt: str,
    incoming_files: Optional[Dict[str, str]] = None,
    *,
    explicit_plan_content: Optional[str] = None,
) -> Dict[str, str]:
    previous_plan = _resolve_plan_content(incoming_files, explicit_plan_content=explicit_plan_content)
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {
            "planContent": previous_plan or f"# Plan\n\n{prompt}",
            "assistantMessage": "Plan updated without LLM (missing OPENAI_API_KEY).",
        }

    context_blob = _build_plan_context_blob(incoming_files)
    template = """
You are a planning assistant that writes and revises implementation plans for a request to implement a feature.

User request:
<user_request>
{user_prompt}
</user_request>

Here is the previous plan you may need to revise:
<previous_plan>
{previous_plan}
</previous_plan>

Current project file context (trimmed):
<files_context>
{files_context}
</files_context>

Instructions:
- Return a full revised plan document in markdown.
- If the previous plan is blank, create a complete first plan.
- If the previous plan exists, integrate the new user request by revising it.
- Keep the output implementation-focused and actionable.
- Do not wrap the result in code fences.
- Tailor the length of the plan based on the complexity of the request. Simpler requests can have shorter plans; complex requests can have longer plans
- Eventually, this plan will be fed into a coding agent that will be tasked to execute all of the requests in the plan. So make sure that the plan is clear such that someone could follow it and then execute it. For this same reason, you only need to focus on implementation steps, not testing, etc.


The format of the plan should be as follows:
<format>
## Plan: [summarized tl;dr of feature request]

#### Objective: [insert objective]

#### Implementation Steps:
1. numbered list of steps
...
n.

#### Constraints and Notes:
- bullet point list of steps
...
</format>
If you believe that any of these sections are not necessary, do not include them
"""

    try:
        response = litellm.completion(
            model=PLAN_MODEL,
            messages=[
                {"role": "system", "content": "Generate or revise a markdown implementation plan."},
                {
                    "role": "user",
                    "content": template.format(
                        user_prompt=prompt,
                        previous_plan=previous_plan,
                        files_context=context_blob or "(no files provided)",
                    ),
                },
            ],
            temperature=0.3,
        )
        plan_content = str(response.choices[0].message.content or "").strip()
        if not plan_content:
            plan_content = previous_plan or f"# Plan\n\n{prompt}"
        return {"planContent": plan_content, "assistantMessage": "Plan updated."}
    except Exception as error:
        logger.exception("Failed to generate/revise plan")
        fallback = previous_plan or f"# Plan\n\n{prompt}"
        return {"planContent": fallback, "assistantMessage": f"Plan generation error: {error}"}


def generate_plan_summary(
    prompt: str,
    previous_plan_content: str,
    plan_content: str,
) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        if not plan_content.strip():
            return "No plan content is available to summarize."
        return "Plan updated."

    summary_prompt = """
You summarize how a markdown plan changed after a user request.

User request:
<user_request>
{user_prompt}
</user_request>

Previous plan:
<previous_plan>
{previous_plan}
</previous_plan>

Updated plan:
<updated_plan>
{updated_plan}
</updated_plan>

Rules:
- Summarize only what was added, removed, or changed in the updated plan.
- Do not propose follow-up ideas or next-step suggestions.
- Keep it concise (max 3 short sentences).
- Return plain text only.
- Use first person to indicate that you wrote the plan.

At the end of the summary, briefly hint that the user can either keep making adjustments to the plan or can hit "Build" to execute the plan
"""
    try:
        response = litellm.completion(
            model=PLAN_MODEL,
            messages=[
                {"role": "system", "content": "Summarize plan changes only."},
                {
                    "role": "user",
                    "content": summary_prompt.format(
                        user_prompt=prompt,
                        previous_plan=previous_plan_content or "",
                        updated_plan=plan_content or "",
                    ),
                },
            ],
            temperature=0.2,
        )
        summary = str(response.choices[0].message.content or "").strip()
        return summary or "Plan updated."
    except Exception:
        logger.exception("Failed to generate plan summary")
        return "Plan updated, but summary generation failed."


def stream_plan_summary(
    prompt: str,
    previous_plan_content: str,
    plan_content: str,
) -> Iterator[bytes]:
    summary_text = generate_plan_summary(prompt, previous_plan_content, plan_content)
    if not summary_text:
        summary_text = "Plan updated."

    chunk_size = 120
    for idx in range(0, len(summary_text), chunk_size):
        chunk = summary_text[idx: idx + chunk_size]
        is_final = idx + chunk_size >= len(summary_text)
        yield _emit_ndjson({
            "event": "text",
            "content": chunk,
            "is_final": is_final,
            "metadata": {"task_type": "plan_summary"},
        })




def execute_agent(
    prompt: str,
    incoming_files: Dict[str, str],
    temp_dir_uuid: Optional[str],
    user_id_value: Optional[int],
    resolved_project_id: Optional[int],
    db: Session,
    *,
    skip_suggestions: bool = False,
) -> Iterator[bytes]:
    logger.info("Assistant task type selected: agent")
    return stream_events(
        prompt,
        incoming_files,
        temp_dir_uuid,
        user_id_value,
        resolved_project_id,
        db,
        skip_suggestions=skip_suggestions,
    )


def execute_chat(
    prompt: str,
    incoming_files: Dict[str, str],
    temp_dir_uuid: Optional[str],
    user_id_value: Optional[int],
    resolved_project_id: Optional[int],
    db: Session,
    *,
    skip_suggestions: bool = False,
) -> Iterator[bytes]:
    logger.info("Assistant task type selected: chat (LiteLLM)")

    def _generator() -> Iterator[bytes]:
        try:
            chat_prompt = _build_chat_prompt(prompt, incoming_files)
            response = litellm.completion(
                model=CHATBOT_MODEL,
                messages=[
                    {"role": "system", "content": "Chat mode: answer with text and optional fenced code blocks only."},
                    {"role": "user", "content": chat_prompt},
                ],
                temperature=0.3,
                stream=True,
            )

            parts: List[str] = []
            for chunk in response:
                if not chunk:
                    continue
                piece = ""
                try:
                    # LiteLLM streaming chunks typically expose delta.content
                    choice0 = chunk["choices"][0] if isinstance(chunk, dict) else None
                    delta = (choice0 or {}).get("delta") if isinstance(choice0, dict) else None
                    if isinstance(delta, dict):
                        piece = str(delta.get("content") or "")
                except Exception:
                    piece = ""
                if not piece:
                    continue
                parts.append(piece)
                yield _emit_ndjson({
                    "event": "text",
                    "content": piece,
                    "is_final": False,
                    "metadata": {"task_type": "chat", "chat_mode": "litellm_stream"},
                })

            final_text = _sanitize_message_text("".join(parts)).strip()
            if not final_text:
                final_text = "No response generated in chat mode."
            append_history({"role": "assistant", "content": final_text})
            yield _emit_ndjson({
                "event": "text",
                "content": "",
                "is_final": True,
                "metadata": {"task_type": "chat", "chat_mode": "litellm_stream"},
            })
        except Exception as chat_error:
            yield _emit_ndjson({
                "event": "text",
                "content": str(chat_error),
                "is_final": True,
                "metadata": {"is_error": True, "task_type": "chat", "chat_mode": "ask"},
            })

    return _generator()


def execute_plan(
    prompt: str,
    incoming_files: Dict[str, str],
    temp_dir_uuid: Optional[str],
    user_id_value: Optional[int],
    resolved_project_id: Optional[int],
    db: Session,
    *,
    skip_suggestions: bool = False,
) -> Iterator[bytes]:
    logger.info("Assistant task type selected: plan")

    def _generator() -> Iterator[bytes]:
        yield _emit_ndjson({
            "event": "text",
            "content": f"plan mode selected for prompt: {prompt}",
            "is_final": True,
            "metadata": {"task_type": "plan"},
        })

    return _generator()


def dispatch_execution(
    task_type: str,
    prompt: str,
    incoming_files: Dict[str, str],
    temp_dir_uuid: Optional[str],
    user_id_value: Optional[int],
    resolved_project_id: Optional[int],
    db: Session,
    *,
    skip_suggestions: bool = False,
) -> Iterator[bytes]:
    if task_type == "chat":
        return execute_chat(
            prompt,
            incoming_files,
            temp_dir_uuid,
            user_id_value,
            resolved_project_id,
            db,
            skip_suggestions=skip_suggestions,
        )
    if task_type == "plan":
        return execute_plan(
            prompt,
            incoming_files,
            temp_dir_uuid,
            user_id_value,
            resolved_project_id,
            db,
            skip_suggestions=skip_suggestions,
        )
    return execute_agent(
        prompt,
        incoming_files,
        temp_dir_uuid,
        user_id_value,
        resolved_project_id,
        db,
        skip_suggestions=skip_suggestions,
    )


def stream_events(
    prompt: str,
    incoming_files: Dict[str, str],
    temp_dir_uuid: Optional[str],
    user_id_value: Optional[int],
    resolved_project_id: Optional[int],
    db: Session,
    *,
    skip_suggestions: bool = False,
):
    """Generator that yields NDJSON bytes for the agent stream. Used by POST /api/agent-execution/stream.

    Event types (payload.event):
    - text: content (str), optional is_final, optional metadata (e.g. is_error).
    - tool_call: status (in_progress|finished), tool_name, tool_type (e.g. edit_file), metadata (filename, target_files, additions, deletions, updated_content for edit_file).
    - suggestions: suggestions (list[str]), optional metadata (only when skip_suggestions is False).
    Any event can include is_final and metadata. user_message is not streamed (it is the request).

    When skip_suggestions is True, summary is generated without suggestions and no suggestions event is emitted.
    """
    fnames, temp_dir, file_map = create_temp_workspace(incoming_files, user_id_value, temp_dir_uuid)
    file_contents: Dict[str, str] = {}
    initial_contents: Dict[str, str] = {}
    changed_edit_blocks: Dict[str, str] = {}
    file_diff_stats: Dict[str, Dict[str, int]] = {}
    files_sent_tool_result: set = set()
    summary_text = ""
    assistant_log_suggestions: List[str] = []

    for fname, content in file_map.items():
        stripped = (content or "").rstrip("\n")
        file_contents[fname] = stripped
        initial_contents[fname] = stripped

    coder, io = get_or_create_coder_for_temp_dir(temp_dir, fnames)
    io.pretty = False
    coder.stream = True
    coder.suggest_shell_commands = False
    coder.dry_run = True

    buffer = ""
    in_tool = False
    current_filename = None
    in_fence = False
    fence_lang_seen = False
    edit_lines = []
    message_accum = ""
    filenames = set(file_map.keys())
    _ext_to_type = {"html": "html", "css": "css", "js": "js", "py": "py", "ts": "ts", "json": "json"}
    filetype_map = {}
    for fname in filenames:
        ext = Path(fname).suffix.lstrip(".")
        filetype_map[fname] = _ext_to_type.get(ext, ext) if ext else "plaintext"
    trace_events: List[Dict[str, Any]] = []

    def emit(obj: dict) -> bytes:
        trace_events.append(obj)
        return (json.dumps(obj) + "\n").encode("utf-8")

    try:
        for chunk in coder.run_stream(prompt):
            text = str(chunk)
            buffer += text
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                if not in_tool:
                    stripped = line.strip()
                    basename = Path(stripped).name if stripped else ""
                    if basename in filenames:
                        if message_accum:
                            content = _sanitize_message_text(message_accum)
                            yield emit({"event": "text", "content": content, "metadata": {}})
                            append_history({"role": "assistant", "content": content})
                            message_accum = ""
                        in_tool = True
                        current_filename = basename
                        target_type = filetype_map.get(current_filename)
                        yield emit({
                            "event": "tool_call",
                            "status": "in_progress",
                            "tool_name": f"Editing {basename}",
                            "tool_type": "edit_file",
                            "metadata": {"filename": basename, "target_files": [target_type] if target_type else []},
                        })
                        continue
                    if stripped:
                        message_accum += line + "\n"
                    continue

                if not in_fence:
                    if line.strip().startswith("```"):
                        in_fence = True
                        fence_lang_seen = False
                        edit_lines = []
                    elif line.strip():
                        pass  # skip tool_progress lines; frontend uses tool_call in_progress/finished only
                else:
                    if line.strip().startswith("```"):
                        content_str = _strip_trailing_code_fence("\n".join(edit_lines))
                        sr = parse_search_replace_block(content_str)
                        if sr:
                            orig_block, upd_block = sr
                            target_name, new_text = apply_search_replace_in_memory(
                                file_contents, orig_block, upd_block, current_filename
                            )
                            if target_name and new_text is not None:
                                new_text_stripped = _strip_trailing_code_fence(new_text)
                                file_contents[target_name] = new_text_stripped
                                changed_edit_blocks[target_name] = content_str
                                if target_name not in files_sent_tool_result:
                                    old_initial = initial_contents.get(target_name, "")
                                    a_lines, b_lines = old_initial.splitlines(), new_text_stripped.splitlines()
                                    try:
                                        additions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith("+ "))
                                        deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith("- "))
                                    except Exception:
                                        additions = deletions = 0
                                    file_diff_stats[target_name] = {"additions": additions, "deletions": deletions}
                                    target_type = filetype_map.get(target_name)
                                    yield emit({
                                        "event": "tool_call",
                                        "status": "finished",
                                        "tool_name": f"Editing {target_name}",
                                        "tool_type": "edit_file",
                                        "metadata": {
                                            "filename": target_name,
                                            "target_files": [target_type] if target_type else [],
                                            "additions": additions,
                                            "deletions": deletions,
                                            "updated_content": new_text_stripped,
                                        },
                                    })
                                    files_sent_tool_result.add(target_name)
                                in_tool = in_fence = False
                                current_filename = None
                                edit_lines = []
                                continue
                            yield emit({"event": "text", "content": "edit_fail: SEARCH block did not match any open files", "is_final": False, "metadata": {"is_error": True}})
                            in_tool = in_fence = False
                            current_filename = None
                            edit_lines = []
                            continue

                        content_str_stripped = _strip_trailing_code_fence(content_str)
                        file_contents[current_filename] = content_str_stripped
                        target_type = filetype_map.get(current_filename)
                        if current_filename not in files_sent_tool_result:
                            old_initial = initial_contents.get(current_filename, "")
                            a_lines, b_lines = old_initial.splitlines(), content_str_stripped.splitlines()
                            try:
                                additions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith("+ "))
                                deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith("- "))
                            except Exception:
                                additions = deletions = 0
                            file_diff_stats[current_filename] = {"additions": additions, "deletions": deletions}
                            yield emit({
                                "event": "tool_call",
                                "status": "finished",
                                "tool_name": f"Editing {current_filename}",
                                "tool_type": "edit_file",
                                "metadata": {
                                    "filename": current_filename,
                                    "target_files": [target_type] if target_type else [],
                                    "additions": additions,
                                    "deletions": deletions,
                                    "updated_content": content_str_stripped,
                                },
                            })
                            files_sent_tool_result.add(current_filename)
                        in_tool = in_fence = False
                        current_filename = None
                        edit_lines = []
                    else:
                        if fence_lang_seen:
                            fence_lang_seen = False
                        else:
                            edit_lines.append(line)

        # Flush remaining buffer: closing fence at EOF
        if in_fence and buffer.strip().startswith("```") and current_filename:
            content_str = _strip_trailing_code_fence("\n".join(edit_lines))
            sr = parse_search_replace_block(content_str)
            updated_payload_text = None
            updated_target_name = current_filename
            search_replace_failed = False
            if sr:
                orig_block, upd_block = sr
                tname, new_text = apply_search_replace_in_memory(
                    file_contents, orig_block, upd_block, current_filename
                )
                if tname and new_text is not None:
                    updated_payload_text = _strip_trailing_code_fence(new_text)
                    updated_target_name = tname
                    file_contents[updated_target_name] = updated_payload_text
                    changed_edit_blocks[updated_target_name] = content_str
                else:
                    search_replace_failed = True
                    yield emit({"event": "text", "content": "edit_fail: SEARCH block did not match any open files", "is_final": False, "metadata": {"is_error": True}})
            else:
                updated_payload_text = _strip_trailing_code_fence(content_str)
                file_contents[updated_target_name] = updated_payload_text

            if not search_replace_failed and updated_payload_text is not None:
                target_type = filetype_map.get(updated_target_name)
                if updated_target_name not in files_sent_tool_result:
                    old_initial = initial_contents.get(updated_target_name, "")
                    a_lines, b_lines = old_initial.splitlines(), updated_payload_text.splitlines()
                    try:
                        additions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith("+ "))
                        deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith("- "))
                    except Exception:
                        additions = deletions = 0
                    file_diff_stats[updated_target_name] = {"additions": additions, "deletions": deletions}
                    yield emit({
                        "event": "tool_call",
                        "status": "finished",
                        "tool_name": f"Editing {updated_target_name}",
                        "tool_type": "edit_file",
                        "metadata": {
                            "filename": updated_target_name,
                            "target_files": [target_type] if target_type else [],
                            "additions": additions,
                            "deletions": deletions,
                            "updated_content": updated_payload_text or content_str,
                        },
                    })
                    files_sent_tool_result.add(updated_target_name)
            in_tool = in_fence = False
            current_filename = None
            edit_lines = []
            buffer = ""

        if message_accum or buffer:
            clean_tail = _sanitize_message_text(message_accum + buffer)
            yield emit({"event": "text", "content": clean_tail, "metadata": {}})
            append_history({"role": "assistant", "content": clean_tail})

        for fname, content in file_contents.items():
            Path(temp_dir).joinpath(fname).write_text(content or "", encoding="utf-8")

        final_files_map: Dict[str, str] = {}
        for fname in file_contents:
            final = (file_contents.get(fname, "") or "").rstrip("\n")
            initial = (initial_contents.get(fname, "") or "").rstrip("\n")
            if final != initial:
                final_files_map[fname] = final

        if final_files_map:
            api_key = os.environ.get("OPENAI_API_KEY")
            if api_key:
                changed_files = []
                for fname, content in final_files_map.items():
                    ftype = filetype_map.get(fname, "plaintext")
                    entry = {"type": ftype, "filename": fname, "content_snippet": content[:2000]}
                    if changed_edit_blocks.get(fname):
                        entry["edit_block"] = changed_edit_blocks[fname]
                    changed_files.append(entry)
                if skip_suggestions:
                    result = generate_summary_only(api_key, prompt, changed_files, final_files_map)
                    summary_text = result.get("summary", "") or ""
                    assistant_log_suggestions = []
                else:
                    result = generate_summary_and_suggestions(api_key, prompt, changed_files, final_files_map)
                    summary_text = result.get("summary", "") or ""
                    assistant_log_suggestions = [s for s in (result.get("suggestions") or []) if isinstance(s, str)]
                if summary_text:
                    yield emit({"event": "text", "content": summary_text, "is_final": True, "metadata": {}})
                    append_history({"role": "assistant", "content": summary_text})
                if not skip_suggestions and assistant_log_suggestions:
                    prepared = prepare_suggestions(assistant_log_suggestions[:3])
                    if prepared:
                        assistant_log_suggestions = prepared
                        log_code_preference_entry(
                            db, suggestions=prepared, project_id=resolved_project_id,
                            user_id=user_id_value, user_selection=None, allow_update=True,
                        )
                        yield emit({"event": "suggestions", "suggestions": prepared, "metadata": {}})
                        append_history({"role": "assistant", "content": "\n".join(prepared)})

            yield emit({"final_files": final_files_map, "summary": summary_text, "steps": []})

        if trace_events and resolved_project_id is not None and user_id_value is not None:
            try:
                AssistantLogCRUD.create(
                    db,
                    AssistantLogCreate(
                        user_id=user_id_value,
                        project_id=resolved_project_id,
                        query=prompt,
                        trace=trace_events,
                        summary=summary_text,
                        suggestions=assistant_log_suggestions or [],
                    ),
                )
            except Exception as log_error:
                logger.error("Failed to persist assistant log: %s", log_error, exc_info=True)

    except Exception as stream_error:
        yield emit({"event": "text", "content": str(stream_error), "is_final": True, "metadata": {"is_error": True}})


# --------------------------
# Generate summary (standalone)
# --------------------------
def generate_summary(
    prompt: str,
    changed_files: List[Dict[str, Any]],
    files_map: Dict[str, str],
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate summary and suggestions from a prompt and changed files.
    Returns {"summary": str, "suggestions": list[str]}.
    Helper: agent.generation.generate_summary_and_suggestions.
    """
    key = api_key or os.environ.get("OPENAI_API_KEY")
    if not key:
        return {"summary": "", "suggestions": []}
    return generate_summary_and_suggestions(key, prompt, changed_files, files_map or {})


# --------------------------
# Clear / halt
# --------------------------
def clear_agent_history(request_data: dict, db: Session) -> dict | JSONResponse:
    """Clear agent history: message history, coder instances, and user temp dir. (Halt/reset state.)"""
    try:
        MESSAGE_HISTORY.clear()
        user_id_value = resolve_user_id(db, request_data.get("userId") or request_data.get("user_id"))
        if user_id_value is not None:
            cleared = clear_instances_for_user(user_id_value)
            delete_user_temp_dir(user_id_value)
            return {"ok": True, "cleared_instances": cleared}
        cleared = clear_all_instances()
        return {"ok": True, "cleared_instances": cleared}
    except Exception as e:
        logger.exception("Error clearing agent history")
        return JSONResponse(status_code=500, content={"error": str(e)})
