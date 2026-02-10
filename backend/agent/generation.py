"""
Core agent generation: executing the user request and generating the summary.

- run_and_capture_silent: run Aider (non-streaming) and return messages/changed files.
- generate_summary_and_suggestions: OpenAI call to summarize edits and suggest follow-ups.
"""
from __future__ import annotations

import contextlib
import os
from pathlib import Path
from typing import Any, Dict, List

from openai import OpenAI

from database.models import SummaryResponse, SummaryOnlyResponse
from agent.instances import AIDER_MODEL, get_or_create_coder_for_temp_dir
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "gpt-4.1-2025-04-14")


def run_and_capture_silent(
    query: str,
    fnames: List[str],
    temp_dir: str,
    model_name: str | None = None,
) -> Dict[str, Any]:
    """Run the coder on the given query (non-streaming), return messages and final text."""
    coder, io = get_or_create_coder_for_temp_dir(temp_dir, fnames, model_name or AIDER_MODEL)
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


_EXT_LANG = {"py": "python", "ts": "typescript", "js": "javascript", "html": "html", "css": "css", "json": "json"}


def _format_files_blob(files_map: Dict[str, str]) -> str:
    out: List[str] = []
    for fname, content in (files_map or {}).items():
        if not content:
            continue
        ext = Path(fname).suffix.lower().lstrip(".")
        lang = _EXT_LANG.get(ext, ext or "plaintext")
        out.append(f"<{fname}>\n```{lang}\n{content}\n</{fname}>\n```")
    return "\n".join(out).strip()


def _format_edits_blob(changed_files: list) -> str:
    out: List[str] = []
    for e in changed_files or []:
        fname = e.get("filename") or e.get("type") or "file"
        lang = e.get("type") or _EXT_LANG.get(Path(str(fname)).suffix.lower().lstrip("."), "plaintext")
        code = e.get("edit_block") or e.get("content_snippet") or ""
        if code:
            out.append(f"<{fname}>\n```{lang}\n{code}\n</{fname}>\n```")
    return "\n".join(out).strip()


def generate_summary_and_suggestions(
    api_key: str,
    user_query: str,
    changed_files: list,
    final_files_map: Dict[str, str],
) -> Dict[str, Any]:
    try:
        client = OpenAI(api_key=api_key)
        final_files_blob = _format_files_blob(final_files_map)
        edits_blob = _format_edits_blob(changed_files)

        prompt = """
You are an expert at summarizing actions that an AI assistant took after being prompted by a user and providing useful suggestions for the user to improve their code.

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
2. A list of ideas for the user to improve their code.

<summary instructions>
- The summary should be written in first person as if you were the one who made edits to the code. Use "I" as appropriate.
- You must discuss which files were edited and the specific changes to each file.
- Be subtle in how the changes address the user's request; do not quote the user's request.
- Be concise. The summary should be a maximum of two sentences.
</summary instructions>

<idea instructions>
- Generate 3 ideas with their corresponding probabilities, sampled from the full distribution.
- Each idea should improve the code or the task: e.g. task fulfillment, correctness, style, readability, edge cases, or user experience, depending on what fits the project (web UI, Python script, etc.).
- Only suggest ideas that are feasible given the file types and stack (e.g. for web: HTML/CSS/JS; for Python: standard library, tests, clarity). Do not suggest custom assets, external services, or out-of-scope changes.
- Frame each idea as a follow-up action the user could ask for, i.e. a short command starting with a verb.
- Be concise. Each idea should be no more than 10 words.
</idea instructions>

<format instructions>
Generate your output as a json with two keys: 1) "summary" with a string value of the summary; 2) "ideas" with a list of strings value of the ideas; and 3) "probabilities" with a list of floats value of the probabilities of each idea based on your full distribution.
{{
    "summary": "insert summary",
    "ideas": ["insert idea 1", "insert idea 2", "insert idea 3"],
    "probabilities": [float probability 1, float probability 2, float probability 3],
}}
Do not generate anything else
</format instructions>
"""

        resp = client.responses.parse(
            model=SUMMARY_MODEL,
            input=[
                {"role": "system", "content": "Summarize changes and propose follow-up ideas as JSON."},
                {
                    "role": "user",
                    "content": prompt.format(
                        user_query=user_query,
                        final_files_blob=final_files_blob,
                        edits_blob=edits_blob,
                    ),
                },
            ],
            temperature=1.0,
            text_format=SummaryResponse,
        )
        parsed: SummaryResponse = resp.output_parsed
        return {"summary": parsed.summary, "suggestions": parsed.ideas}
    except Exception as e:
        print(f"[agent_stream] summary helper error: {e}")
        return {"summary": "", "suggestions": []}


def generate_summary_only(
    api_key: str,
    user_query: str,
    changed_files: list,
    final_files_map: Dict[str, str],
) -> Dict[str, Any]:
    try:
        client = OpenAI(api_key=api_key)
        final_files_blob = _format_files_blob(final_files_map)
        edits_blob = _format_edits_blob(changed_files)

        prompt = """
You are an expert at summarizing actions that an AI assistant took after being prompted by a user.

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

Generate a summary of the changes that the assistant made to the code.

<summary instructions>
- The summary should be written in first person as if you were the one who made edits to the code. Use "I" as appropriate.
- You must discuss which files were edited and the specific changes to each file.
- Be subtle in how the changes address the user's request; do not quote the user's request.
- Be concise. The summary should be a maximum of two sentences.
</summary instructions>

<format instructions>
Generate your output as JSON with a single key "summary" and a string value.
{{ "summary": "insert summary" }}
Do not generate anything else.
</format instructions>
"""

        resp = client.responses.parse(
            model=SUMMARY_MODEL,
            input=[
                {"role": "system", "content": "Summarize changes as JSON (summary only)."},
                {
                    "role": "user",
                    "content": prompt.format(
                        user_query=user_query,
                        final_files_blob=final_files_blob,
                        edits_blob=edits_blob,
                    ),
                },
            ],
            temperature=1.0,
            text_format=SummaryOnlyResponse,
        )
        parsed: SummaryOnlyResponse = resp.output_parsed
        return {"summary": parsed.summary or ""}
    except Exception as e:
        print(f"[agent_stream] summary-only helper error: {e}")
        return {"summary": ""}
