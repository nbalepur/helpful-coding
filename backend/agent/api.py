"""
Agent API surface: one place for all agent HTTP endpoints.

This file defines the contract (routes, request/response shapes). Implementation
lives in agent.helpers and agent.generation / agent.instances / agent.code_preferences.

To build your own implementation:
  - Use these same paths and payloads.
  - Implement or replace the helpers used by each endpoint (see docstrings below).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from agent import helpers
from agent.code_preferences import resolve_project_id
from agent.code_preferences import parse_optional_int

router = APIRouter(tags=["Chat"])


# ---------------------------------------------------------------------------
# Execute request
# ---------------------------------------------------------------------------
@router.post(
    "/api/agent-execution/stream",
    summary="Execute agent request (streaming NDJSON)",
)
async def agent_chat_stream_endpoint(request_data: dict, db: Session = Depends(get_db)):
    """
    **POST /api/agent-execution/stream**

    Body: `{ "prompt", "files"?, "tempDirUuid"?, "userId"?, "projectId"?, "taskId"?, "taskName"?, "skipSuggestions"? }`
    Response: stream of NDJSON lines; `state` can be restate, signpost, tool_result, summary, suggestions, session_uuid, error.

    When skipSuggestions is true (e.g. for function tasks), summary is generated without suggestions and no suggestions event is emitted.

    Helper: `helpers.stream_events(prompt, incoming_files, temp_dir_uuid, user_id, project_id, db, skip_suggestions=...)`.
    """
    prompt = request_data.get("prompt", "")
    if not prompt:
        return JSONResponse(status_code=400, content={"error": "Prompt is required"})
    try:
        helpers.append_history({"role": "user", "content": prompt})
    except Exception:
        pass

    incoming_files = request_data.get("files", {})
    temp_dir_uuid = request_data.get("tempDirUuid") or request_data.get("temp_dir_uuid")
    task_slug = request_data.get("taskId") or request_data.get("task_id")
    task_name = request_data.get("taskName") or request_data.get("task_name")
    user_id_value = helpers.resolve_user_id(db, request_data.get("userId") or request_data.get("user_id"))
    project_id_value = parse_optional_int(request_data.get("projectId") or request_data.get("project_id"))
    resolved_project_id = resolve_project_id(
        db, project_id=project_id_value, task_slug=task_slug, task_name=task_name
    )
    skip_suggestions = bool(request_data.get("skipSuggestions") or request_data.get("skip_suggestions"))

    return StreamingResponse(
        helpers.stream_events(
            prompt, incoming_files, temp_dir_uuid, user_id_value, resolved_project_id, db,
            skip_suggestions=skip_suggestions,
        ),
        media_type="application/x-ndjson",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Generate summary + suggestions
# ---------------------------------------------------------------------------
@router.post(
    "/api/agent/summary",
    summary="Generate summary and suggestions from prompt + changed files",
)
async def generate_summary_endpoint(request_data: dict):
    """
    **POST /api/agent/summary**

    Body: `{ "prompt": str, "changedFiles": [{ type, filename?, content_snippet?, edit_block? }], "filesMap": { "<filename>": "<content>", ... } }`
    Response: `{ "summary": str, "suggestions": list[str] }`

    Helper: `helpers.generate_summary(prompt, changed_files, files_map)` (uses `generation.generate_summary_and_suggestions`).
    """
    prompt = request_data.get("prompt", "")
    changed_files = request_data.get("changedFiles") or request_data.get("changed_files") or []
    files_map = request_data.get("filesMap") or request_data.get("files_map") or {}
    result = helpers.generate_summary(prompt, changed_files, files_map)
    return result


# ---------------------------------------------------------------------------
# Agent history
# ---------------------------------------------------------------------------
@router.get(
    "/api/agent-history",
    summary="Get current message history",
)
async def get_agent_history_endpoint():
    """
    **GET /api/agent-history**

    Response: `{ "history": [{ "role", "content" }, ...] }`

    Helper: `helpers.get_message_history()`.
    """
    try:
        return {"history": helpers.get_message_history()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post(
    "/api/agent-history/clear",
    summary="Clear history",
)
async def clear_agent_history_endpoint(request_data: dict, db: Session = Depends(get_db)):
    """
    **POST /api/agent-history/clear**

    Body: `{ "userId"?: int }` — if provided, clear only that user's instances and temp dir; else clear all.
    Response: `{ "ok": true, "cleared_instances": int }`

    Clears in-memory message history, coder instances, and user temp dir. Use for “halt” / reset.

    Helper: `helpers.clear_agent_history(request_data, db)`.
    """
    return helpers.clear_agent_history(request_data, db)
