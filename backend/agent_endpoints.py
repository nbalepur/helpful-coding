from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
import os
import json
import tempfile
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Union, Any
import contextlib
import pathlib
import hashlib
import logging
import re
from openai import OpenAI
from pydantic import BaseModel

from aider.coders import Coder
from aider.models import Model
from aider.io import InputOutput
from replace_code import parse_search_replace_block, apply_search_replace_in_memory
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import (
    get_db,
    CodePreferenceCRUD,
    CodePreferenceCreate,
    CodePreferenceUpdate,
    ProjectCRUD,
    ProjectCreate,
    AssistantLogCRUD,
    AssistantLogCreate,
)
from database.sqlalchemy_models import Project, User

# --------------------------
# IO that captures everything
# --------------------------
class CapturingIO(InputOutput):
    """
    IO shim that prints and also appends messages to `self.messages`.
    """
    def __init__(self, **kw):
        super().__init__(**kw)
        self.messages: List[str] = []
        self.pretty = False  # turn off Rich/pretty so coder.show_pretty() is False

    
    def _record(self, *args, **kwargs):
        import time
        msg = " ".join(str(a) for a in args)
        self.messages.append(msg)

    # Aider emits via these hooks (cover them all to be safe):
    def print(self, *args, **kwargs):
        self._record(*args, **kwargs)

    def error(self, *args, **kwargs):
        self._record(*args, **kwargs)

    def tool_output(self, *args, **kwargs):
        self._record(*args, **kwargs)

    def tool_warning(self, *args, **kwargs):
        self._record(*args, **kwargs)

    def assistant_output(self, *args, **kwargs):
        self._record(*args, **kwargs)

    def ai_output(self, *args, **kwargs):
        self._record(*args, **kwargs)

    def markdown(self, *args, **kwargs):
        self._record(*args, **kwargs)



# --------------------------
# Helper: build a coder
# --------------------------
def make_coder(fnames: List[str], model_name: str | None = None) -> tuple[Coder, CapturingIO]:
    model_name = model_name or AIDER_MODEL
    model = Model(model_name)
    io = CapturingIO(yes=False)                 # auto-confirm; no printing
    coder = Coder.create(main_model=model, io=io, fnames=fnames)
    coder.edit_format = "diff"                 # compact, preview-friendly edits
    coder.suggest_shell_commands = False       # avoid /run prompts
    coder.detect_urls = False
    coder.verbose = False
    coder.auto_commits = False
    coder.dirty_commits = False
    return coder, io

def run_and_capture_silent(query: str, fnames: List[str], model_name: str | None = None):
    coder, io = make_coder(fnames, model_name or AIDER_MODEL)
    io.pretty = False
    coder.stream = True
    coder.suggest_shell_commands = False
    coder.dry_run = True

    chunks: List[str] = []
    
    with open(os.devnull, "w") as devnull, \
         contextlib.redirect_stdout(devnull), \
         contextlib.redirect_stderr(devnull):
        for chunk in coder.run_stream(query):
            chunks.append(chunk)

    final_text = "".join(chunks)
    return {"messages": io.messages, "chunks": chunks, "finalText": final_text}

router = APIRouter(tags=["Chat"]) 

logger = logging.getLogger(__name__)

# Model configuration from environment
AIDER_MODEL = os.getenv("AIDER_MODEL", "gpt-4.1")
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "gpt-4o-2024-08-06")


def _slugify_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower())
    return slug.strip("-")


def _parse_optional_int(value: Union[str, int, None]) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return int(stripped)
        except ValueError:
            return None
    return None


def _prepare_suggestions(raw_suggestions: Optional[List[str]]) -> List[str]:
    cleaned: List[str] = []
    if not raw_suggestions:
        return cleaned

    seen = set()
    for suggestion in raw_suggestions:
        if not isinstance(suggestion, str):
            continue
        text = suggestion.strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)

    cleaned.sort(key=lambda s: s.casefold())
    return cleaned


def _compute_suggestion_id(suggestions: List[str]) -> str:
    normalized = "|".join(s.casefold() for s in suggestions)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _resolve_user_id(db: Session, raw_user_id: Optional[Union[str, int]]) -> Optional[int]:
    value = _parse_optional_int(raw_user_id)
    if value is None:
        return None

    exists = db.query(User.id).filter(User.id == value).first()
    if exists:
        return value

    logger.debug("Skipping user %s for code preference log; user not found", raw_user_id)
    return None


def _resolve_project_id(
    db: Session,
    *,
    project_id: Optional[int],
    task_slug: Optional[str],
    task_name: Optional[str],
) -> Optional[int]:
    if project_id:
        return project_id

    slug = (task_slug or "").strip().lower()
    name = (task_name or "").strip()

    try:
        if slug:
            rows = db.query(Project.id, Project.name).all()
            for pid, existing_name in rows:
                if _slugify_name(existing_name) == slug:
                    return pid

        if name:
            existing_project = (
                db.query(Project)
                .filter(func.lower(Project.name) == name.lower())
                .first()
            )
            if existing_project:
                return existing_project.id

        if name:
            created = ProjectCRUD.create(
                db,
                ProjectCreate(
                    name=name,
                    description=None,
                    frontend_starter_file=None,
                    html_starter_file=None,
                    css_starter_file=None,
                ),
            )
            return created.id
    except Exception as exc:
        logger.error(
            "Failed to resolve or create project for slug='%s', name='%s': %s",
            task_slug,
            task_name,
            exc,
            exc_info=True,
        )

    return None


def _log_code_preference_entry(
    db: Session,
    *,
    suggestions: Optional[List[str]],
    project_id: Optional[int],
    user_id: Optional[int],
    user_selection: Optional[str],
    allow_update: bool = True,
) -> Optional[int]:
    prepared = _prepare_suggestions(suggestions)
    if not prepared:
        return None
    if project_id is None:
        logger.debug("Skipping code preference logging because project_id is missing")
        return None

    suggestion_id = _compute_suggestion_id(prepared)
    selection_value = user_selection.strip() if isinstance(user_selection, str) else None
    if selection_value == "":
        selection_value = None

    try:
        if allow_update:
            existing = CodePreferenceCRUD.get_by_signature(
                db,
                suggestion_id=suggestion_id,
                project_id=project_id,
                user_id=user_id,
            )

            if existing and selection_value is None:
                update_fields: Dict[str, Any] = {}

                if existing.suggestions != prepared:
                    update_fields["suggestions"] = prepared

                if update_fields:
                    CodePreferenceCRUD.update(
                        db,
                        existing.id,
                        CodePreferenceUpdate(**update_fields),
                    )
                return existing.id

        entry = CodePreferenceCRUD.create(
            db,
            CodePreferenceCreate(
                suggestion_id=suggestion_id,
                suggestions=prepared,
                project_id=project_id,
                user_id=user_id,
                user_selection=selection_value,
            ),
        )
        return entry.id
    except Exception as exc:
        logger.error("Failed to persist code preference entry: %s", exc, exc_info=True)
        return None

# --------------------------
# In-memory message history in OpenAI format (ephemeral)
# --------------------------
# Structure: [ {"role": "user"|"assistant"|"system", "content": str } ]
MESSAGE_HISTORY: List[Dict[str, str]] = []

def _append_history(entry: Dict[str, str]) -> None:
    try:
        if not isinstance(entry, dict):
            return
        role = entry.get("role")
        content = entry.get("content")
        if role in {"user", "assistant", "system"} and isinstance(content, str):
            MESSAGE_HISTORY.append({"role": role, "content": content})
            # Cap list size to avoid unbounded growth
            if len(MESSAGE_HISTORY) > 1000:
                del MESSAGE_HISTORY[: len(MESSAGE_HISTORY) - 1000]
    except Exception:
        # Best-effort only
        pass

# --------------------------
# Temporary workspace helpers
# --------------------------
def _create_temp_workspace(incoming_files: Dict[str, str]) -> tuple[List[str], str, Dict[str, str]]:
    """Create a fresh temporary workspace populated with incoming files."""
    repo_root = Path(__file__).resolve().parent.parent
    tmp_root = repo_root / "tmp"
    tmp_root.mkdir(parents=True, exist_ok=True)
    temp_dir_path = Path(tempfile.mkdtemp(prefix="aider_", dir=str(tmp_root)))

    file_map = {
        "index.html": incoming_files.get("html") or incoming_files.get("index.html", ""),
        "frontend.js": incoming_files.get("js") or incoming_files.get("frontend.js", ""),
        "styles.css": incoming_files.get("css") or incoming_files.get("styles.css", ""),
    }

    fnames: List[str] = []
    for fname, content in file_map.items():
        fpath = temp_dir_path / fname
        # Always sync incoming editor contents to disk before a run
        try:
            fpath.write_text(content or "", encoding="utf-8")
        except Exception:
            # Ensure file exists even on write issues
            try:
                fpath.touch(exist_ok=True)
            except Exception:
                pass
        fnames.append(str(fpath))

    return fnames, str(temp_dir_path), file_map
class SummaryResponse(BaseModel):
    summary: str
    suggestions: list[str]


class CodePreferenceLogPayload(BaseModel):
    suggestions: List[str]
    user_selection: Optional[str] = None
    project_id: Optional[int] = None
    task_id: Optional[str] = None
    task_name: Optional[str] = None
    user_id: Optional[Union[int, str]] = None

def _generate_summary_and_suggestions(api_key: str, user_query: str, changed_files: list, final_files_map: Dict[str, str]) -> Dict[str, any]:
    """Call OpenAI to summarize changes and propose follow-up suggestions.

    Returns a dict: {"summary": str, "suggestions": List[str]}
    """
    try:
        client = OpenAI(api_key=api_key)

        # Build language-keyed maps used by parse_code()
        key_to_fname = {"html": "index.html", "css": "styles.css", "js": "frontend.js"}

        # Edits: prefer SEARCH/REPLACE block, else snippet
        edits_map = {}
        try:
            for entry in (changed_files or []):
                ftype = entry.get("type")
                if not ftype:
                    continue
                code_str = entry.get("edit_block") or entry.get("content_snippet") or ""
                edits_map[ftype] = code_str
        except Exception:
            edits_map = {}

        # Final files (language keyed)
        final_lang_map = {
            "html": (final_files_map or {}).get("html", ""),
            "css": (final_files_map or {}).get("css", ""),
            "js": (final_files_map or {}).get("js", ""),
        }

        def parse_code(d: dict) -> str:
            out = ''
            for k in ['html', 'css', 'js']:
                fname = key_to_fname.get(k, k)
                if d.get(k):
                    out += f"<{fname}>```{k}\n{d[k]}\n</{fname}>\n```\n"
            return out.strip()


        prompt = """
You are an expert at summarizing actions that an AI assistant took after being prompted by a user and providing brilliant suggestions for the user to improve their code.

This is what the user asked the assistant to do:
<query>
{user_query}
</query>

These are the final versions of files after edits (only changed files included):
<final_files>
{final_files_blob}
</final_files>

These are the changes that the assistant made to the code (with optional SEARCH/REPLACE edit blocks when available):
<changes>
{edits_blob}
</changes>

Using this information your job is to generate:
1. A summary of the changes that the assistant made to the code.
2. A list of suggestions for the user to improve their code.

<summary instructions>
- The summary should be written in first person as if you were the one who made edits to the code. Use "I" as appropriate.
- You must discuss which files were edited and the specific changes to each file.
- Be subtle in how the changes address the user's request; do not quote the user's request.
- Be concise. The summary should be a maximum of two sentences.
</summary instructions>

<suggestions instructions>
- Generate exactly three suggestions.
- The suggestions should either be: 1) general writing improvements to the user's code; 2) a new feature that the user could add; or 3) a bug/vulnerability that the user could fix.
- The user's goal is to build an interface that other users can vote on based on how fun and cool they find it, so your suggestions should be tailored such that the user can win the competition and get the most votes. Do not mention the competition in your suggestions.
- Only generate suggestions that are feasible to implement. The user only has access to HTML, CSS, and JavaScript, one file of each. They can mainly only use the default language features without implementing external libraries or packages. The user's UI will be hosted in an isolated iframe, so it's not possible to store any data or make it multi-player. 
- The suggestions should be framed as follow-up actions that you could take, i.e. commands. For example: "Add [new feature]".
- Look at the past conversation history and generate at least some suggestions that you have not previously proposed.
- Be concise. Each suggestion should be no more than ten words.
</suggestions instructions>

<format instructions>
Generate your output as a json with two keys: 1) "summary" with a string value of the summary; and 2) "suggestions" with a list of strings value of the suggestions.
{{
    "summary": "insert summary",
    "suggestions": ["insert suggestion 1", "insert suggestion 2", "insert suggestion 3"]
}}
Do not generate anything else
</format instructions>
"""

        # Use new Responses API with Pydantic parsing
        resp = client.responses.parse(
            model=SUMMARY_MODEL,
            input=[
                {"role": "system", "content": "Summarize changes and propose follow-ups as JSON."},
                {"role": "user", "content": prompt.format(user_query=user_query, final_files_blob=parse_code(final_lang_map), edits_blob=parse_code(edits_map))},
            ],
            temperature=1.0,
            text_format=SummaryResponse,
        )
        parsed: SummaryResponse = resp.output_parsed  # type: ignore
        return {"summary": parsed.summary, "suggestions": parsed.suggestions}
    except Exception as e:
        print(f"[agent_stream] summary helper error: {e}")
        return {"summary": "", "suggestions": []}



@router.post("/api/agent-chat")
async def agent_chat_endpoint(request_data: dict):
    """Non-streaming agent run using Aider; returns messages and changed files."""
    try:
        print("[agent_chat] called")
        prompt = request_data.get("prompt", "")
        incoming_files = request_data.get("files", {})

        if not prompt:
            return JSONResponse(status_code=400, content={"error": "Prompt is required"})

        # Prepare temp workspace with the required filenames (repo-local tmp directory)
        repo_root = Path(__file__).resolve().parent.parent
        tmp_root = repo_root / "tmp"
        tmp_root.mkdir(parents=True, exist_ok=True)
        temp_dir = tempfile.mkdtemp(prefix="aider_", dir=str(tmp_root))
        try:
            print(f"[agent_chat] temp_dir: {temp_dir}")
            print(f"[agent_chat] incoming files keys: {list(incoming_files.keys())}")
            file_map = {
                "index.html": incoming_files.get("index.html", ""),
                "frontend.js": incoming_files.get("frontend.js", ""),
                "styles.css": incoming_files.get("styles.css", ""),
            }

            fnames = []
            for fname, content in file_map.items():
                fpath = Path(temp_dir) / fname
                fpath.write_text(content or "", encoding="utf-8")
                fnames.append(str(fpath))
            print(f"[agent_chat] wrote files: {fnames}")

            # Run silent capture
            print(f"[agent_chat] running run_and_capture_silent, prompt_len={len(prompt)}")
            result = run_and_capture_silent(prompt, fnames)
            print(f"[agent_chat] completed; messages={len(result.get('messages', []))}")

            # Read back any changed files
            changed_files = []
            for fpath in fnames:
                p = Path(fpath)
                changed_files.append({
                    "path": p.name,
                    "content": p.read_text(encoding="utf-8")
                })
            print(f"[agent_chat] returning changedFiles={len(changed_files)}")

            return {
                "messages": result.get("messages", []),
                "changedFiles": changed_files
            }
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"[agent_chat] cleaned temp_dir: {temp_dir}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"Agent error: {str(e)}"})


@router.post("/api/agent-chat/stream")
async def agent_chat_stream(request_data: dict, db: Session = Depends(get_db)):
    """Streaming agent run that emits message/tool_start/tool_result events.

    Behavior:
    - Accumulate chunks until a newline. Each newline becomes a message event unless it matches a filename.
    - If a newline equals one of {index.html, frontend.js, styles.css}, emit tool_start for that file,
      then capture content inside triple backtick fences as the edit and emit tool_result when closed.
    """
    try:
        print("[agent_stream] called")
        prompt = request_data.get("prompt", "")
        incoming_files = request_data.get("files", {})
        task_slug = request_data.get("taskId") or request_data.get("task_id")
        task_name = request_data.get("taskName") or request_data.get("task_name")
        user_id_value = _resolve_user_id(db, request_data.get("userId") or request_data.get("user_id"))
        project_id_value = _parse_optional_int(request_data.get("projectId") or request_data.get("project_id"))
        resolved_project_id = _resolve_project_id(
            db,
            project_id=project_id_value,
            task_slug=task_slug,
            task_name=task_name,
        )

        if not prompt:
            return JSONResponse(status_code=400, content={"error": "Prompt is required"})

        # Record initial user prompt to history
        try:
            if prompt:
                _append_history({"role": "user", "content": prompt})
        except Exception:
            pass

        def event_generator(prompt_=prompt):
            print(f"[agent_stream] incoming files keys: {list(incoming_files.keys())}")
            # Use persistent workspace and coder; sync incoming to disk
            fnames, temp_dir, file_map = _create_temp_workspace(incoming_files)
            print(f"[agent_stream] temp_dir: {temp_dir}")

            # Maintain in-memory contents for each filename (no further disk writes during stream until end)
            file_contents: Dict[str, str] = {}
            initial_contents: Dict[str, str] = {}
            # Track raw SEARCH/REPLACE blocks per filename for summarization
            changed_edit_blocks: Dict[str, str] = {}
            file_diff_stats: Dict[str, Dict[str, int]] = {}
            summary_text: str = ""
            assistant_log_suggestions: List[str] = []
            for fname, content in file_map.items():
                stripped = (content or "").rstrip("\n")
                file_contents[fname] = stripped
                initial_contents[fname] = stripped
            print(f"[agent_stream] using files: {fnames}")

            # Fresh coder per request
            coder, io = make_coder(fnames)
            io.pretty = False
            coder.stream = True
            coder.suggest_shell_commands = False
            coder.dry_run = True
            print(f"[agent_stream] start streaming; prompt_len={len(prompt_)}")

            buffer = ""
            in_tool = False
            current_filename = None
            in_fence = False
            fence_lang_seen = False
            edit_lines = []
            raw_lines: List[str] = []
            message_accum = ""

            filenames = {"index.html", "frontend.js", "styles.css"}
            filetype_map = {
                "index.html": "html",
                "frontend.js": "js",
                "styles.css": "css",
            }

            # Use shared helpers from replace_code.py

            def _sanitize_message_text(text: str) -> str:
                if not text:
                    return text
                # Remove tmp/aider_<random>/ prefixes and bare tmp/aider_<random> tokens
                s = re.sub(r"tmp\/aider_[^\/\s]+\/", "", text)
                s = re.sub(r"tmp\/aider_[^\/\s]+", "", s)
                return s

            try:
                for chunk in coder.run_stream(prompt_):
                    text = str(chunk)
                    buffer += text

                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)

                        if not in_tool:
                            stripped = line.strip()
                            basename = Path(stripped).name if stripped else ""
                            if basename in filenames:
                                # Before switching to tool, flush any accumulated assistant text
                                if message_accum:
                                    yield (json.dumps({
                                        "state": "restate",
                                        "data": {"restate": _sanitize_message_text(message_accum)},
                                    }) + "\n").encode("utf-8")
                                    try:
                                        _append_history({"role": "assistant", "content": _sanitize_message_text(message_accum)})
                                    except Exception:
                                        pass
                                    message_accum = ""
                                in_tool = True
                                current_filename = basename
                                raw_lines = [line]
                                print(f"[agent_stream] tool_start: {current_filename}")
                                # Emit a tool start without assistant text; frontend will show the loading card
                                target_type = filetype_map.get(current_filename)
                                yield (json.dumps({
                                    "state": "signpost",
                                    "data": {
                                        "signpost": "",  # no assistant message
                                        "target_files": [target_type] if target_type else [],
                                    },
                                }) + "\n").encode("utf-8")
                                continue

                            # normal message line
                            if stripped:
                                message_accum += (line + "\n")
                            continue

                        # in_tool: look for fenced code block with file content
                        if not in_fence:
                            if line.strip().startswith("```"):
                                in_fence = True
                                fence_lang_seen = False
                                print(f"[agent_stream] fence_open for {current_filename}")
                                edit_lines = []
                                raw_lines.append(line)
                            # ignore other lines until fence starts, but forward as tool progress
                            elif line.strip():
                                print(f"[agent_stream] tool_progress for {current_filename}: {line[:120]}")
                                yield (json.dumps({
                                    "type": "tool_progress",
                                    "filename": current_filename,
                                    "content": line
                                }) + "\n").encode("utf-8")
                                raw_lines.append(line)
                        else:
                            if line.strip().startswith("```"):
                                # fence closed: finalize edit
                                content_str = "\n".join(edit_lines)
                                raw_lines.append(line)
                                # write to file
                                # compute diff stats vs old content (from memory)
                                old_text_current = file_contents.get(current_filename, "")
                                # If SEARCH/REPLACE block, dry-run apply without saving
                                sr = parse_search_replace_block(content_str)
                                if sr:
                                    orig_block, upd_block = sr
                                    target_name, new_text = apply_search_replace_in_memory(file_contents, orig_block, upd_block)
                                    if target_name and new_text is not None:
                                        # success, emit tool_result with updated content
                                        target_type = filetype_map.get(target_name)
                                        # update in-memory contents (strip trailing newlines)
                                        new_text_stripped = new_text.rstrip("\n")
                                        file_contents[target_name] = new_text_stripped
                                        # store edit block text for this file
                                        try:
                                            changed_edit_blocks[target_name] = content_str
                                        except Exception:
                                            pass
                                        try:
                                            import difflib
                                            a_lines = old_text_current.splitlines()
                                            b_lines = new_text_stripped.splitlines()
                                            additions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('+ '))
                                            deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('- '))
                                        except Exception:
                                            additions = 0
                                            deletions = 0
                                        existing_stats = file_diff_stats.get(target_name, {"additions": 0, "deletions": 0})
                                        existing_stats["additions"] = existing_stats.get("additions", 0) + additions
                                        existing_stats["deletions"] = existing_stats.get("deletions", 0) + deletions
                                        file_diff_stats[target_name] = existing_stats
                                        diff_stats = {target_type: {"additions": additions, "deletions": deletions}} if target_type else {}
                                        yield (json.dumps({
                                            "state": "tool_result",
                                            "data": {
                                                "target_files": [target_type] if target_type else [],
                                                "diff_stats": diff_stats,
                                                "filename": target_name,
                                                "updated_content": new_text_stripped,
                                            },
                                        }) + "\n").encode("utf-8")
                                        # reset state
                                        in_tool = False
                                        in_fence = False
                                        fence_lang_seen = False
                                        current_filename = None
                                        edit_lines = []
                                        raw_lines = []
                                        continue
                                    else:
                                        # fail
                                        yield (json.dumps({
                                            "state": "error",
                                            "data": {"message": "edit_fail: SEARCH block did not match any open files"},
                                        }) + "\n").encode("utf-8")
                                        in_tool = False
                                        in_fence = False
                                        fence_lang_seen = False
                                        current_filename = None
                                        edit_lines = []
                                        raw_lines = []
                                        continue

                                # Non S/R: update in-memory content only (strip trailing newlines)
                                content_str_stripped = content_str.rstrip("\n")
                                file_contents[current_filename] = content_str_stripped
                                print(f"[agent_stream] fence_close for {current_filename}; bytes={len(content_str)}")
                                # Print updated file name and content
                                try:
                                    print(f"[agent_stream] updated: {current_filename}")
                                    print(content_str_stripped)
                                except Exception:
                                    pass
                                target_type = filetype_map.get(current_filename)
                                # basic diff stats
                                try:
                                    import difflib
                                    a_lines = old_text_current.splitlines()
                                    b_lines = content_str.splitlines()
                                    diff = difflib.ndiff(a_lines, b_lines)
                                    additions = sum(1 for d in diff if d.startswith('+ ') )
                                    deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('- '))
                                except Exception:
                                    additions = 0
                                    deletions = 0
                                existing_stats = file_diff_stats.get(current_filename, {"additions": 0, "deletions": 0})
                                existing_stats["additions"] = existing_stats.get("additions", 0) + additions
                                existing_stats["deletions"] = existing_stats.get("deletions", 0) + deletions
                                file_diff_stats[current_filename] = existing_stats
                                diff_stats = {target_type: {"additions": additions, "deletions": deletions}} if target_type else {}
                                yield (json.dumps({
                                    "state": "tool_result",
                                    "data": {
                                        "target_files": [target_type] if target_type else [],
                                        "diff_stats": diff_stats,
                                        "filename": current_filename,
                                        "updated_content": content_str,
                                    },
                                }) + "\n").encode("utf-8")
                                # Log assistant ideation step (implicit content in messages already handled via restate)
                                # reset state for possible next tool
                                in_tool = False
                                in_fence = False
                                fence_lang_seen = False
                                current_filename = None
                                edit_lines = []
                                raw_lines = []
                            else:
                                # accumulate inside fence, skip first lang line after opening if needed
                                if fence_lang_seen:
                                    fence_lang_seen = False
                                else:
                                    edit_lines.append(line)
                                raw_lines.append(line)

                # Flush remaining buffer as message if any
                # If we are still inside a fence and the remaining buffer is a closing fence
                if in_fence and buffer.strip().startswith("```") and current_filename:
                    content_str = "\n".join(edit_lines)
                    old_text = file_contents.get(current_filename, "")
                    # Handle SEARCH/REPLACE at EOF (dry-run)
                    sr = parse_search_replace_block(content_str)
                    updated_payload_text = None
                    updated_target_name = current_filename
                    if sr:
                        orig_block, upd_block = sr
                        tname, new_text = apply_search_replace_in_memory(file_contents, orig_block, upd_block)
                        if tname and new_text is not None:
                            updated_payload_text = new_text.rstrip("\n")
                            updated_target_name = tname
                            file_contents[updated_target_name] = updated_payload_text
                            print(f"[agent_stream] fence_close (EOF) S/R applied in-memory for {updated_target_name}; bytes={len(new_text)}")
                            # store edit block for this file
                            try:
                                changed_edit_blocks[updated_target_name] = content_str
                            except Exception:
                                pass
                        else:
                            yield (json.dumps({
                                "state": "error",
                                "data": {"message": "edit_fail: SEARCH block did not match any open files"},
                            }) + "\n").encode("utf-8")
                            in_tool = False
                            in_fence = False
                            fence_lang_seen = False
                            current_filename = None
                            edit_lines = []
                            raw_lines = []
                            # still flush remaining buffer below
                            pass
                    else:
                        updated_payload_text = content_str.rstrip("\n")
                        file_contents[updated_target_name] = updated_payload_text
                        print(f"[agent_stream] fence_close (EOF) for {current_filename}; bytes={len(content_str)}")
                    # Print updated file name and content
                    try:
                        print(f"[agent_stream] updated: {updated_target_name}")
                        print(updated_payload_text)
                    except Exception:
                        pass
                    target_type = filetype_map.get(updated_target_name)
                    try:
                        import difflib
                        a_lines = old_text.splitlines()
                        b_lines = updated_payload_text.splitlines()
                        diff = difflib.ndiff(a_lines, b_lines)
                        additions = sum(1 for d in diff if d.startswith('+ ') )
                        deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('- '))
                    except Exception:
                        additions = 0
                        deletions = 0
                    existing_stats = file_diff_stats.get(updated_target_name, {"additions": 0, "deletions": 0})
                    existing_stats["additions"] = existing_stats.get("additions", 0) + additions
                    existing_stats["deletions"] = existing_stats.get("deletions", 0) + deletions
                    file_diff_stats[updated_target_name] = existing_stats
                    diff_stats = {target_type: {"additions": additions, "deletions": deletions}} if target_type else {}
                    yield (json.dumps({
                        "state": "tool_result",
                        "data": {
                            "target_files": [target_type] if target_type else [],
                            "diff_stats": diff_stats,
                            "filename": updated_target_name,
                            "updated_content": (updated_payload_text or content_str),
                        },
                    }) + "\n").encode("utf-8")
                    in_tool = False
                    in_fence = False
                    fence_lang_seen = False
                    current_filename = None
                    edit_lines = []
                    raw_lines = []
                    # We consumed the closing fence from the buffer; clear any leftover backticks
                    buffer = ""

                # Flush any remaining accumulated assistant text
                tail_text = (message_accum + buffer)
                if tail_text:
                    clean_tail = _sanitize_message_text(tail_text)
                    print(f"[agent_stream] flush message: {clean_tail[:120]}")
                    yield (json.dumps({
                        "state": "restate",
                        "data": {"restate": clean_tail},
                    }) + "\n").encode("utf-8")
                    try:
                        _append_history({"role": "assistant", "content": clean_tail})
                    except Exception:
                        pass

                # Persist updated contents back to disk for next run
                try:
                    for fname, content in file_contents.items():
                        Path(temp_dir).joinpath(fname).write_text(content or "", encoding="utf-8")
                except Exception:
                    pass

                # Emit completion with final files
                final_files_list = []
                for fname in ["index.html", "frontend.js", "styles.css"]:
                    final_files_list.append({"path": fname, "content": (file_contents.get(fname, "") or "").rstrip("\n")})

                # Only include changed files for the frontend diff editor
                final_files_map: Dict[str, str] = {}
                html_final = (file_contents.get("index.html", "") or "").rstrip("\n")
                css_final = (file_contents.get("styles.css", "") or "").rstrip("\n")
                js_final = (file_contents.get("frontend.js", "") or "").rstrip("\n")
                if html_final != (initial_contents.get("index.html", "") or "").rstrip("\n"):
                    final_files_map["html"] = html_final
                if css_final != (initial_contents.get("styles.css", "") or "").rstrip("\n"):
                    final_files_map["css"] = css_final
                if js_final != (initial_contents.get("frontend.js", "") or "").rstrip("\n"):
                    final_files_map["js"] = js_final

                # If there were changes, get a brief summary and suggestions from OpenAI
                if final_files_map:
                    try:
                        api_key = os.getenv("OPENAI_API_KEY")
                        if api_key:
                            changed_files = []
                            for ftype, content in final_files_map.items():
                                fname = "index.html" if ftype == "html" else ("styles.css" if ftype == "css" else "frontend.js")
                                snippet = content[:2000]
                                entry = {"type": ftype, "filename": fname, "content_snippet": snippet}
                                try:
                                    edit_block = changed_edit_blocks.get(fname)
                                    if edit_block:
                                        entry["edit_block"] = edit_block
                                except Exception:
                                    pass
                                changed_files.append(entry)

                            result = _generate_summary_and_suggestions(api_key, prompt_, changed_files, final_files_map)
                            summary_text = result.get("summary", "") or ""
                            suggestions_list_raw = result.get("suggestions", []) or []
                            assistant_log_suggestions = [s for s in suggestions_list_raw if isinstance(s, str)]

                            if summary_text:
                                # TODO: add previously-chosen actions so the user doesnt get them again
                                summary_text_to_emit = summary_text
                                yield (json.dumps({
                                    "state": "summary",
                                    "data": {"summary": summary_text_to_emit},
                                }) + "\n").encode("utf-8")
                                try:
                                    _append_history({"role": "assistant", "content": summary_text_to_emit})
                                except Exception:
                                    pass

                            if assistant_log_suggestions:
                                prepared_suggestions = _prepare_suggestions(assistant_log_suggestions[:3])
                                if prepared_suggestions:
                                    assistant_log_suggestions = prepared_suggestions
                                    _log_code_preference_entry(
                                        db,
                                        suggestions=prepared_suggestions,
                                        project_id=resolved_project_id,
                                        user_id=user_id_value,
                                        user_selection=None,
                                        allow_update=True,
                                    )
                                    yield (json.dumps({
                                        "state": "suggestions",
                                        "data": {"suggestions": prepared_suggestions},
                                    }) + "\n").encode("utf-8")
                                    try:
                                        _append_history({"role": "assistant", "content": "\n".join(prepared_suggestions)})
                                    except Exception:
                                        pass
                    except Exception as _summary_err:
                        print(f"[agent_stream] summary error: {_summary_err}")
                generated_code_payload: Dict[str, Any] = {}
                type_to_fname = {"html": "index.html", "css": "styles.css", "js": "frontend.js"}
                for ftype, fname in type_to_fname.items():
                    final_content = (final_files_map.get(ftype) or "").rstrip("\n")
                    if final_content:
                        stats = file_diff_stats.get(fname, {})
                        generated_code_payload[ftype] = {
                            "content": final_content,
                            "diff_stats": {
                                "additions": stats.get("additions", 0),
                                "deletions": stats.get("deletions", 0),
                                "total_changes": stats.get("additions", 0) + stats.get("deletions", 0),
                            },
                        }

                try:
                    if generated_code_payload and resolved_project_id and user_id_value is not None:
                        AssistantLogCRUD.create(
                            db,
                            AssistantLogCreate(
                                user_id=user_id_value,
                                project_id=resolved_project_id,
                                query=prompt_,
                                generated_code=generated_code_payload,
                                summary=summary_text,
                                suggestions=assistant_log_suggestions or [],
                            ),
                        )
                except Exception as log_error:
                    logger.error("Failed to persist assistant log entry: %s", log_error, exc_info=True)
                print(f"[agent_stream] complete; files={len(final_files_list)}")

                # yield (json.dumps({
                #     "state": "complete",
                #     "data": {
                #         "changedFiles": final_files_list,
                #         "final_files": final_files_map,
                #     },
                # }) + "\n").encode("utf-8")

            except Exception as stream_error:
                print(f"[agent_stream] error: {stream_error}")
                yield (json.dumps({
                    "state": "error",
                    "data": {"message": str(stream_error)},
                }) + "\n").encode("utf-8")
            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)
                print(f"[agent_stream] cleaned temp_dir: {temp_dir}")

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"Agent stream error: {str(e)}"})


# --------------------------
# Code preference logging endpoints
# --------------------------
@router.post("/api/code-preferences")
async def create_code_preference_entry(payload: CodePreferenceLogPayload, db: Session = Depends(get_db)):
    suggestions = _prepare_suggestions(payload.suggestions)
    if not suggestions:
        raise HTTPException(status_code=400, detail="No suggestions provided")

    user_id_value = _resolve_user_id(db, payload.user_id)
    project_id_value = _resolve_project_id(
        db,
        project_id=payload.project_id,
        task_slug=payload.task_id,
        task_name=payload.task_name,
    )

    if project_id_value is None:
        raise HTTPException(status_code=400, detail="Unable to resolve project for suggestions")

    user_selection = (payload.user_selection or "").strip()

    entry_id = _log_code_preference_entry(
        db,
        suggestions=suggestions,
        project_id=project_id_value,
        user_id=user_id_value,
        user_selection=user_selection,
        allow_update=False,
    )

    if not entry_id:
        raise HTTPException(status_code=500, detail="Failed to log code preference entry")

    return {"ok": True, "id": entry_id}


# --------------------------
# Message history endpoints
# --------------------------
@router.get("/api/agent-history")
async def get_agent_history():
    try:
        return {"history": MESSAGE_HISTORY}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/agent-history/clear")
async def clear_agent_history():
    try:
        MESSAGE_HISTORY.clear()
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})