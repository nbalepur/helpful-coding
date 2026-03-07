from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
import os
import random
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
import time
from datetime import datetime, timedelta
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


# Post-test required tasks (replication): only stream summary, no follow-up ideas
POST_TEST_REQUIRED_TASK_NAMES = frozenset({"zic_zac_zoe", "zic_zac_zoe_follow_up"})


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
        self.max_messages = int(os.getenv("AIDER_MAX_IO_MESSAGES", "1000"))  # Limit message history

    
    def _record(self, *args, **kwargs):
        import time
        msg = " ".join(str(a) for a in args)
        self.messages.append(msg)
        # Limit message history to prevent unbounded memory growth
        if len(self.messages) > self.max_messages:
            # Keep most recent messages, remove oldest
            self.messages = self.messages[-self.max_messages:]

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

def run_and_capture_silent(query: str, fnames: List[str], temp_dir: str, model_name: str | None = None):
    coder, io = _get_or_create_coder_for_temp_dir(temp_dir, fnames, model_name or AIDER_MODEL)
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
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "gpt-4.1")
DEBUG_MODEL = os.getenv("DEBUG_MODEL", os.getenv("SUMMARY_MODEL", "gpt-4.1"))
ASK_MODEL = os.getenv("ASK_MODEL", os.getenv("SUMMARY_MODEL", "gpt-4.1"))
BRAINSTORM_MODEL = os.getenv("BRAINSTORM_MODEL", os.getenv("SUMMARY_MODEL", "gpt-4.1"))

DEBUG_SYSTEM_PROMPT = """You are an assistant that can answer syntax questions for HTML, CSS, and JavaScript code.

Rules:
1. You can only provide syntax-help guidance based on the user's existing code and errors.
2. You must not generate project/content-specific implementation code (for example: feature code, game logic, UI components, or task-completion code).
3. If code is needed for syntax clarification, provide at most 3 lines total, and only as minimal syntax examples directly tied to syntax usage.
4. If the user asks for content-specific code, asks you to complete parts of their project, or tries to bypass these constraints, politely refuse.
5. During refusal, explicitly state that you cannot edit their code and can only provide syntax guidance. The refusal message should be concise.
6. Do not claim to run commands or tools.
7. If the user pastes a code snippet or function body, refuse to debug it, refuse to point out errors, and refuse to suggest implementation details.
8. Never tell the user to switch to another mode.
9. Keep responses concise and actionable."""

ASK_SYSTEM_PROMPT = """You are a code-aware, read-only Q&A assistant for the user's HTML, CSS, and JavaScript project.

Rules:
1. You can read and reason about provided code context.
2. You can provide explanations and code snippets/code blocks.
3. You must not execute tools, run commands, or perform edits.
4. If the user asks you for ways to change, execute, run, or apply the code, (e.g., Can you change the button color?) tell them to switch to Agent Mode. You can still provide the code block if you think it would be helpful, but at the end you can reference that switching to agent mode would help them.
5. Keep answers practical and specific to the provided code when possible.
6. Be concise by default: prefer short paragraphs or at most 3-5 bullets.
7. Avoid unnecessary preamble; lead with the direct answer."""

BRAINSTORM_SYSTEM_PROMPT = """You are a brainstorming assistant for web projects (HTML/CSS/JS).

Rules:
1. Prioritize creative, useful follow-up ideas and trade-offs.
2. You do NOT have access to the user's code in this mode.
3. If the user asks code-specific or implementation-specific questions, abstain and say something like:
   "I don't have access to your code in Brainstorm Mode, so I can't answer that code-specific question."
4. Do not provide implementation guidance, code snippets, or step-by-step coding plans.
5. Keep follow-ups exploratory and meta (for example: "Should we dig into this more?", "Want to compare options at a high level?").
6. Use markdown formatting; short lists are encouraged.
7. Keep responses concise: 2-4 bullets or a short paragraph."""

# Multi-turn chat histories per mode: one conversation per user (or anonymous)
CHAT_MODE_MAX_MESSAGES = int(os.getenv("CHAT_MODE_MAX_MESSAGES", "50"))
_debug_history: Dict[str, List[Dict[str, str]]] = {}
_ask_history: Dict[str, List[Dict[str, str]]] = {}
_brainstorm_history: Dict[str, List[Dict[str, str]]] = {}

# --------------------------
# Temp directory UUID-based Coder instances for conversation history
# --------------------------
# Structure: {temp_dir_path: {"coder": Coder, "io": CapturingIO, "last_used": float}}
# Uses full temp directory path as key to ensure uniqueness
# 
# DEPLOYMENT NOTES:
# - These are in-memory global variables, so they're shared across all users on the same server process
# - However, each user gets their own Coder instance because cache_key includes the full path with user_id
# - Example: User 1 -> /tmp/1/aider_abc123, User 2 -> /tmp/2/aider_xyz789 (different keys)
# - If server restarts, all in-memory state is lost (but temp directories persist on disk)
# - For production with multiple servers: Each server has its own memory, so isolation is automatic
# - For serverless: Consider persisting UUID mapping to database/file to survive invocations
# - Memory management: Instances are evicted after inactivity or when hitting max limit
_coder_instances: Dict[str, Dict[str, Any]] = {}

# Memory management configuration
MAX_CODER_INSTANCES = int(os.getenv("AIDER_MAX_INSTANCES", "100"))  # Max instances in memory
INSTANCE_IDLE_TIMEOUT_SECONDS = int(os.getenv("AIDER_IDLE_TIMEOUT", "1800"))  # 30 minutes default

# Per-user active UUID tracking - persists until history is cleared
# Structure: {user_id: "uuid_string"}
# This ensures each user gets their own persistent session UUID
# 
# DEPLOYMENT NOTES:
# - In-memory dict, lost on server restart
# - On restart, users will get new UUIDs (but old temp dirs still exist on disk)
# - For production: Consider persisting to database or file to survive restarts
_user_active_uuid: Dict[int, str] = {}

def _extract_uuid_from_temp_dir(temp_dir: str) -> str:
    """Extract UUID from temp directory path like 'tmp/user_id/aider_<uuid>'."""
    # Extract the UUID part from paths like:
    # - /path/to/tmp/user_id/aider_abc123
    # - tmp/user_id/aider_abc123
    # - /path/to/tmp/user_id/aider_abc123/file.html
    path = Path(temp_dir)
    # Get the directory name (e.g., "aider_abc123")
    dir_name = path.name
    # Remove "aider_" prefix to get UUID
    if dir_name.startswith("aider_"):
        return dir_name[6:]  # Remove "aider_" prefix
    return dir_name

def _evict_inactive_instances():
    """Remove instances that haven't been used recently."""
    global _coder_instances
    current_time = time.time()
    keys_to_remove = []
    
    for cache_key, instance in _coder_instances.items():
        last_used = instance.get("last_used", 0)
        if current_time - last_used > INSTANCE_IDLE_TIMEOUT_SECONDS:
            keys_to_remove.append(cache_key)
    
    for key in keys_to_remove:
        logger.info(f"Evicting inactive Coder instance: {key}")
        del _coder_instances[key]
    
    return len(keys_to_remove)

def _evict_lru_instance():
    """Remove the least recently used instance when hitting max limit."""
    global _coder_instances
    if len(_coder_instances) == 0:
        return
    
    # Find instance with oldest last_used timestamp
    lru_key = min(
        _coder_instances.keys(),
        key=lambda k: _coder_instances[k].get("last_used", 0)
    )
    logger.info(f"Evicting LRU Coder instance (max limit reached): {lru_key}")
    del _coder_instances[lru_key]

def _extract_user_id_from_temp_dir(temp_dir: str) -> Optional[int]:
    """Extract user_id from temp directory path like 'tmp/user_id/aider_<uuid>'."""
    try:
        path = Path(temp_dir)
        # Path structure: .../tmp/user_id/aider_<uuid>
        # Get parent directory name which should be user_id
        parent = path.parent
        if parent.name and parent.name.isdigit():
            return int(parent.name)
        # Try grandparent if structure is different
        grandparent = parent.parent
        if grandparent.name and grandparent.name.isdigit():
            return int(grandparent.name)
    except (ValueError, AttributeError):
        pass
    return None

def _cleanup_other_user_instances(user_id: Optional[int], keep_temp_dir: str):
    """Remove all other Coder instances for a user, keeping only the specified one."""
    global _coder_instances
    if user_id is None:
        return
    
    keep_key = str(Path(keep_temp_dir).resolve())
    keys_to_remove = []
    
    for cache_key, instance in _coder_instances.items():
        if cache_key == keep_key:
            continue  # Keep this one
        
        temp_dir = instance.get("temp_dir", "")
        instance_user_id = _extract_user_id_from_temp_dir(temp_dir)
        
        if instance_user_id == user_id:
            keys_to_remove.append(cache_key)
    
    for key in keys_to_remove:
        logger.info(f"Removing duplicate instance for user {user_id}: {key}")
        del _coder_instances[key]
    
    return len(keys_to_remove)

def _get_or_create_coder_for_temp_dir(temp_dir: str, fnames: List[str], model_name: str | None = None) -> tuple[Coder, CapturingIO]:
    """Get or create a Coder instance for a specific temp directory UUID to maintain conversation history.
    
    Ensures each user only has one active instance at a time.
    """
    global _coder_instances
    
    # Clean up inactive instances periodically
    _evict_inactive_instances()
    
    uuid = _extract_uuid_from_temp_dir(temp_dir)
    temp_dir_path = Path(temp_dir)
    
    # Extract user_id to enforce one instance per user
    user_id = _extract_user_id_from_temp_dir(temp_dir)
    
    # Include full temp_dir path in key to ensure uniqueness (handles user_id folders)
    # This ensures we don't accidentally reuse coders across different user folders
    cache_key = str(temp_dir_path.resolve())
    
    # Get or create coder for this temp directory
    if cache_key not in _coder_instances:
        # Before creating new instance, ensure user doesn't have other instances
        if user_id is not None:
            _cleanup_other_user_instances(user_id, temp_dir)
        
        # Check if we're at max capacity
        if len(_coder_instances) >= MAX_CODER_INSTANCES:
            _evict_lru_instance()
        # Check if we're at max capacity
        if len(_coder_instances) >= MAX_CODER_INSTANCES:
            _evict_lru_instance()
        model_name = model_name or AIDER_MODEL
        model = Model(model_name)
        io = CapturingIO(yes=False)
        
        # Use files directly from the temp directory
        temp_fnames = []
        for fname in fnames:
            # If fname is already in temp_dir, use it directly
            fpath = Path(fname)
            if str(fpath.parent) == str(temp_dir_path):
                temp_fnames.append(fname)
            else:
                # Otherwise, use the file in temp_dir with same name
                temp_fpath = temp_dir_path / fpath.name
                if not temp_fpath.exists() and fpath.exists():
                    shutil.copy2(fpath, temp_fpath)
                elif not temp_fpath.exists():
                    temp_fpath.write_text("", encoding="utf-8")
                temp_fnames.append(str(temp_fpath))
        
        coder = Coder.create(main_model=model, io=io, fnames=temp_fnames)
        coder.edit_format = "diff"
        coder.suggest_shell_commands = False
        coder.detect_urls = False
        coder.verbose = False
        coder.auto_commits = False
        coder.dirty_commits = False
        
        _coder_instances[cache_key] = {
            "coder": coder,
            "io": io,
            "temp_dir": str(temp_dir_path),
            "last_used": time.time(),
            "user_id": user_id  # Store user_id for easier tracking
        }
    else:
        # Reuse existing coder - files are already in temp_dir
        instance = _coder_instances[cache_key]
        coder = instance["coder"]
        io = instance["io"]
        # Update last_used timestamp
        instance["last_used"] = time.time()
        
        # Ensure user doesn't have other instances (cleanup any duplicates)
        if user_id is not None:
            _cleanup_other_user_instances(user_id, temp_dir)
        
        # Update file paths to point to temp_dir
        temp_fnames = []
        for fname in fnames:
            fpath = Path(fname)
            if str(fpath.parent) == str(temp_dir_path):
                temp_fnames.append(fname)
            else:
                temp_fpath = temp_dir_path / fpath.name
                # Sync file if it exists and is different
                if fpath.exists() and str(fpath.resolve()) != str(temp_fpath.resolve()):
                    shutil.copy2(fpath, temp_fpath)
                elif not temp_fpath.exists():
                    temp_fpath.write_text("", encoding="utf-8")
                temp_fnames.append(str(temp_fpath))
        
        # Update coder's file list
        if hasattr(coder, 'fnames'):
            coder.fnames = temp_fnames
    
    return coder, io

def _clear_coder_for_temp_dir(temp_dir: str):
    """Clear the coder instance for a specific temp directory UUID."""
    global _coder_instances
    cache_key = str(Path(temp_dir).resolve())
    if cache_key in _coder_instances:
        del _coder_instances[cache_key]


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


def _resolve_assistant_mode(raw_mode: Optional[str], raw_assistant_mode: Optional[str]) -> str:
    """Normalize assistant mode labels for logging."""
    mode = str(raw_mode or "").strip().lower()
    assistant_mode = str(raw_assistant_mode or "").strip().lower()

    if assistant_mode in {"agent", "debug", "ask", "brainstorm"}:
        return assistant_mode

    if mode == "agent":
        return "agent"
    if mode in {"debug", "ask", "brainstorm"}:
        return mode
    return "agent"


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
def _create_temp_workspace(incoming_files: Dict[str, str], user_id: Optional[int] = None, temp_dir_uuid: Optional[str] = None) -> tuple[List[str], str, Dict[str, str]]:
    """Create or reuse a temporary workspace populated with incoming files.
    
    If temp_dir_uuid is provided, reuses existing directory.
    If not provided but user_id exists, reuses user's active UUID.
    Otherwise creates new one and stores it as user's active UUID.
    Workspace is organized as tmp/user_id/aider_<uuid> for easy cleanup.
    """
    global _user_active_uuid
    
    repo_root = Path(__file__).resolve().parent.parent
    tmp_root = repo_root / "tmp"
    
    # Organize by user_id if available, otherwise use "anonymous"
    user_folder = str(user_id) if user_id is not None else "anonymous"
    user_tmp_root = tmp_root / user_folder
    user_tmp_root.mkdir(parents=True, exist_ok=True)
    
    # Determine which UUID to use
    if temp_dir_uuid:
        # Use provided UUID
        final_uuid = temp_dir_uuid
    elif user_id is not None and user_id in _user_active_uuid:
        # Reuse user's active UUID
        final_uuid = _user_active_uuid[user_id]
    else:
        # Create new UUID
        final_uuid = None
    
    if final_uuid:
        # Reuse existing temp directory
        temp_dir_path = user_tmp_root / f"aider_{final_uuid}"
        if not temp_dir_path.exists():
            temp_dir_path.mkdir(parents=True, exist_ok=True)
    else:
        # Create new temp directory
        temp_dir_path = Path(tempfile.mkdtemp(prefix="aider_", dir=str(user_tmp_root)))
        # Extract UUID and store as user's active UUID
        extracted_uuid = _extract_uuid_from_temp_dir(str(temp_dir_path))
        if user_id is not None:
            _user_active_uuid[user_id] = extracted_uuid
    
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
    ideas: list[str]
    probabilities: list[float]


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
- Each idea should contribute toward improving at least one of the following: 1) task fulfillment - how well the interface adheres to the task requirements; 2) style - quality of the visual design: layout, colors, typography, and polish; 3) enjoyment - how engaging and satisfying it feels to interact with the UI; or 4) creativity - original touches or mechanics that make the UI stand out.
- Only generate ideas that are feasible to implement with HTML, CSS, and JavaScript. Do not suggest anything that requires custom assets, external libraries, or complex modalities (e.g. audio, video, etc.). Anything visual that you could implement with HTML, CSS, and JavaScript are fine. Do not suggest anything that would require a backend or persistent state tracking, like a persistent high score (per-session high score is fine) or a log-in page. If the user refreshes the website they are building, it should be fine if everything is reset.
- The ideas should be framed as follow-up actions that you could take, i.e. commands starting with a verb.
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

#         prompt = """
# You are an expert at summarizing actions that an AI assistant took after being prompted by a user and providing useful suggestions for the user to improve their code.

# This is what the user asked the assistant to do:
# <query>
# {user_query}
# </query>

# These are the final versions of files after edits (only changed files included):
# <final_files>
# {final_files_blob}
# </final_files>

# These are the changes that the assistant made to the code (with optional SEARCH/REPLACE edit blocks when available):
# <changes>
# {edits_blob}
# </changes>

# Using this information your job is to generate:
# 1. A summary of the changes that the assistant made to the code.
# 2. A list of ideas for the user to improve their code.

# <summary instructions>
# - The summary should be written in first person as if you were the one who made edits to the code. Use "I" as appropriate.
# - You must discuss which files were edited and the specific changes to each file.
# - Be subtle in how the changes address the user's request; do not quote the user's request.
# - Be concise. The summary should be a maximum of two sentences.
# </summary instructions>

# <idea instructions>
# - Generate 3 ideas with their corresponding probabilities, sampled from the full distribution.
# - At least one of the ideas should be sampled from the long tail of ideas, not the most common ones.
# - Each idea should contribute toward improving at least one of the following: 1) task fulfillment - how well the interface adheres to the task requirements; 2) style - quality of the visual design: layout, colors, typography, and polish; 3) enjoyment - how engaging and satisfying it feels to interact with the UI; or 4) creativity - original touches or mechanics that make the UI stand out.
# - Only generate ideas that are feasible to implement with HTML, CSS, and JavaScript. Do not suggest anything that requires custom assets, external libraries, or complex modalities (e.g. audio, video, etc.). Anything visual that you could implement with HTML, CSS, and JavaScript are fine. Do not suggest anything that would require a backend or persistent state tracking, like a persistent high score (per-session high score is fine) or a log-in page. If the user refreshes the website they are building, it should be fine if everything is reset.
# - The ideas should be framed as follow-up actions that you could take, i.e. commands starting with a verb.
# - Look at the past conversation history and generate new ideas that you have not proposed in the past.
# - Be concise. Each idea should be no more than ten words.
# </idea instructions>

# <idea bank>
# {idea_str}
# </idea bank>

# <format instructions>
# Generate your output as a json with two keys: 1) "summary" with a string value of the summary; 2) "ideas" with a list of strings value of the ideas; and 3) "probabilities" with a list of floats value of the probabilities of each idea based on your full distribution.
# {{
#     "summary": "insert summary",
#     "ideas": ["insert idea 1", "insert idea 2", "insert idea 3"],
#     "probabilities": [float probability 1, float probability 2, float probability 3],
# }}
# Do not generate anything else
# </format instructions>
# """

        resp = client.responses.parse(
            model=SUMMARY_MODEL,
            input=[
                {"role": "system", "content": "Summarize changes and propose follow-up ideas as JSON."},
                #{"role": "user", "content": prompt.format(user_query=user_query, idea_str=idea_str, final_files_blob=parse_code(final_lang_map), edits_blob=parse_code(edits_map))},
                {"role": "user", "content": prompt.format(user_query=user_query, final_files_blob=parse_code(final_lang_map), edits_blob=parse_code(edits_map))},
            ],
            temperature=1.0,
            text_format=SummaryResponse,
        )
        parsed: SummaryResponse = resp.output_parsed 
        return {"summary": parsed.summary, "suggestions": parsed.ideas}
    except Exception as e:
        print(f"[agent_stream] summary helper error: {e}")
        return {"summary": "", "suggestions": []}


def _format_code_context(incoming_files: Dict[str, Any]) -> str:
    normalized = {
        "index.html": str(incoming_files.get("html") or incoming_files.get("index.html") or ""),
        "styles.css": str(incoming_files.get("css") or incoming_files.get("styles.css") or ""),
        "frontend.js": str(incoming_files.get("js") or incoming_files.get("frontend.js") or ""),
    }
    sections: List[str] = []
    for file_name, content in normalized.items():
        if not content.strip():
            continue
        sections.append(f"<{file_name}>\n{content}\n</{file_name}>")
    return "\n\n".join(sections)


def _chat_mode_stream_impl(
    request_data: dict,
    db: Session,
    *,
    mode_name: str,
    system_prompt: str,
    model_name: str,
    history_store: Dict[str, List[Dict[str, str]]],
    include_code_context: bool,
):
    """Shared impl for debug/ask/brainstorm streaming modes."""
    prompt = (request_data.get("prompt") or request_data.get("message") or "").strip()
    if not prompt:
        return JSONResponse(status_code=400, content={"error": "Prompt is required"})

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return JSONResponse(
            status_code=503,
            content={"error": "OpenAI API key not configured"},
        )

    user_id_value = _resolve_user_id(db, request_data.get("userId") or request_data.get("user_id"))
    task_slug = request_data.get("taskId") or request_data.get("task_id")
    task_name = request_data.get("taskName") or request_data.get("task_name")
    project_id_value = _parse_optional_int(request_data.get("projectId") or request_data.get("project_id"))
    resolved_project_id = _resolve_project_id(
        db,
        project_id=project_id_value,
        task_slug=task_slug,
        task_name=task_name,
    )
    history_key = str(user_id_value) if user_id_value is not None else "_anon"
    history = list(history_store.get(history_key, []))
    if len(history) > CHAT_MODE_MAX_MESSAGES:
        history = history[-CHAT_MODE_MAX_MESSAGES:]

    user_content = prompt
    if include_code_context:
        context_blob = _format_code_context(request_data.get("files") or {})
        if context_blob:
            user_content = (
                f"User request:\n{prompt}\n\n"
                "Current project code context:\n"
                f"{context_blob}"
            )

    messages = [
        {"role": "system", "content": system_prompt},
        *[{"role": m["role"], "content": m["content"]} for m in history],
        {"role": "user", "content": user_content},
    ]

    client = OpenAI(api_key=api_key)
    stream = client.chat.completions.create(
        model=model_name,
        messages=messages,
        max_tokens=700,
        stream=True,
    )

    def event_generator():
        full_content: List[str] = []
        try:
            for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if getattr(delta, "content", None):
                    full_content.append(delta.content)
                    yield (json.dumps({"delta": delta.content}) + "\n").encode("utf-8")
            reply = "".join(full_content).strip()
            if history_key not in history_store:
                history_store[history_key] = []
            history_store[history_key].append({"role": "user", "content": prompt})
            history_store[history_key].append({"role": "assistant", "content": reply})
            if len(history_store[history_key]) > CHAT_MODE_MAX_MESSAGES:
                history_store[history_key] = history_store[history_key][-CHAT_MODE_MAX_MESSAGES:]
            try:
                if resolved_project_id and user_id_value is not None:
                    AssistantLogCRUD.create(
                        db,
                        AssistantLogCreate(
                            user_id=user_id_value,
                            project_id=resolved_project_id,
                            query=prompt,
                            generated_code={
                                "mode": mode_name,
                                "response": reply,
                            },
                            summary=reply or "",
                            suggestions=[],
                        ),
                    )
            except Exception as log_error:
                logger.error("Failed to persist %s assistant log entry: %s", mode_name, log_error, exc_info=True)
            yield (json.dumps({"done": True, "clearQuery": True}) + "\n").encode("utf-8")
        except Exception as e:
            logger.exception("%s stream error", mode_name)
            yield (json.dumps({"error": str(e)}) + "\n").encode("utf-8")

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    )


@router.post("/api/agent/stream")
async def agent_stream_unified(request_data: dict, db: Session = Depends(get_db)):
    """Streaming agent endpoint for edit-capable Agent Mode."""
    return await agent_chat_stream(request_data, db)


@router.post("/api/debug/stream")
async def debug_stream_endpoint(request_data: dict, db: Session = Depends(get_db)):
    """Streaming debug mode endpoint."""
    try:
        return _chat_mode_stream_impl(
            request_data,
            db,
            mode_name="debug",
            system_prompt=DEBUG_SYSTEM_PROMPT,
            model_name=DEBUG_MODEL,
            history_store=_debug_history,
            include_code_context=False,
        )
    except Exception as e:
        logger.exception("debug stream error")
        return JSONResponse(
            status_code=500,
            content={"error": f"Debug mode error: {str(e)}"},
        )


@router.post("/api/ask/stream")
async def ask_stream_endpoint(request_data: dict, db: Session = Depends(get_db)):
    """Streaming ask mode endpoint (code-aware, read-only Q&A)."""
    try:
        return _chat_mode_stream_impl(
            request_data,
            db,
            mode_name="ask",
            system_prompt=ASK_SYSTEM_PROMPT,
            model_name=ASK_MODEL,
            history_store=_ask_history,
            include_code_context=True,
        )
    except Exception as e:
        logger.exception("ask stream error")
        return JSONResponse(
            status_code=500,
            content={"error": f"Ask mode error: {str(e)}"},
        )


@router.post("/api/brainstorm/stream")
async def brainstorm_stream_endpoint(request_data: dict, db: Session = Depends(get_db)):
    """Streaming brainstorm mode endpoint."""
    try:
        return _chat_mode_stream_impl(
            request_data,
            db,
            mode_name="brainstorm",
            system_prompt=BRAINSTORM_SYSTEM_PROMPT,
            model_name=BRAINSTORM_MODEL,
            history_store=_brainstorm_history,
            include_code_context=False,
        )
    except Exception as e:
        logger.exception("brainstorm stream error")
        return JSONResponse(
            status_code=500,
            content={"error": f"Brainstorm mode error: {str(e)}"},
        )


def _clear_chat_history_for_mode(
    db: Session,
    request_data: dict,
    *,
    mode_name: str,
    history_store: Dict[str, List[Dict[str, str]]],
):
    """Clear a mode-specific conversation history for a user."""
    try:
        user_id_value = _resolve_user_id(db, request_data.get("userId") or request_data.get("user_id"))
        history_key = str(user_id_value) if user_id_value is not None else "_anon"
        if history_key in history_store:
            del history_store[history_key]
            logger.info("Cleared %s history for %s", mode_name, history_key)
        return {"ok": True}
    except Exception as e:
        logger.exception("%s clear error", mode_name)
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/debug/clear")
async def debug_clear_endpoint(request_data: dict, db: Session = Depends(get_db)):
    return _clear_chat_history_for_mode(
        db,
        request_data,
        mode_name="debug",
        history_store=_debug_history,
    )


@router.post("/api/ask/clear")
async def ask_clear_endpoint(request_data: dict, db: Session = Depends(get_db)):
    return _clear_chat_history_for_mode(
        db,
        request_data,
        mode_name="ask",
        history_store=_ask_history,
    )


@router.post("/api/brainstorm/clear")
async def brainstorm_clear_endpoint(request_data: dict, db: Session = Depends(get_db)):
    return _clear_chat_history_for_mode(
        db,
        request_data,
        mode_name="brainstorm",
        history_store=_brainstorm_history,
    )


@router.post("/api/agent-chat")
async def agent_chat_endpoint(request_data: dict, db: Session = Depends(get_db)):
    """Non-streaming agent run using Aider; returns messages and changed files."""
    try:
        prompt = request_data.get("prompt", "")
        incoming_files = request_data.get("files", {})
        user_id_value = _resolve_user_id(db, request_data.get("userId") or request_data.get("user_id"))
        temp_dir_uuid = request_data.get("tempDirUuid") or request_data.get("temp_dir_uuid")

        if not prompt:
            return JSONResponse(status_code=400, content={"error": "Prompt is required"})

        # Use the same workspace creation function
        fnames, temp_dir, file_map = _create_temp_workspace(incoming_files, user_id_value, temp_dir_uuid)
        try:
            # Run silent capture
            result = run_and_capture_silent(prompt, fnames, temp_dir)

            # Read back any changed files
            changed_files = []
            for fpath in fnames:
                p = Path(fpath)
                changed_files.append({
                    "path": p.name,
                    "content": p.read_text(encoding="utf-8")
                })

            # Return temp_dir UUID so frontend can reuse it
            temp_dir_uuid_emitted = _extract_uuid_from_temp_dir(temp_dir)
            return {
                "messages": result.get("messages", []),
                "changedFiles": changed_files,
                "tempDirUuid": temp_dir_uuid_emitted
            }
        finally:
            # Never delete temp_dir - we want to keep it for conversation history
            # It will only be deleted when user clears history
            pass
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
        prompt = request_data.get("prompt", "")
        incoming_files = request_data.get("files", {})
        temp_dir_uuid = request_data.get("tempDirUuid") or request_data.get("temp_dir_uuid")
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
        assistant_mode = _resolve_assistant_mode(
            request_data.get("mode"),
            request_data.get("assistantMode") or request_data.get("assistant_mode"),
        )

        if not prompt:
            return JSONResponse(status_code=400, content={"error": "Prompt is required"})

        # Record initial user prompt to history
        try:
            if prompt:
                _append_history({"role": "user", "content": prompt})
        except Exception:
            pass

        def event_generator(prompt_=prompt, temp_dir_uuid_=temp_dir_uuid, user_id_=user_id_value):
            # Use persistent workspace and coder; sync incoming to disk
            fnames, temp_dir, file_map = _create_temp_workspace(incoming_files, user_id_, temp_dir_uuid_)

            # Maintain in-memory contents for each filename (no further disk writes during stream until end)
            file_contents: Dict[str, str] = {}
            initial_contents: Dict[str, str] = {}
            # Track raw SEARCH/REPLACE blocks per filename for summarization
            changed_edit_blocks: Dict[str, str] = {}
            file_diff_stats: Dict[str, Dict[str, int]] = {}
            # Track which files have already had tool_result sent to prevent duplicates
            files_sent_tool_result: set = set()
            summary_text: str = ""
            assistant_log_suggestions: List[str] = []
            for fname, content in file_map.items():
                stripped = (content or "").rstrip("\n")
                file_contents[fname] = stripped
                initial_contents[fname] = stripped

            # Use temp directory UUID-based coder to maintain conversation history
            coder, io = _get_or_create_coder_for_temp_dir(temp_dir, fnames)
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

            def _strip_trailing_code_fence(text: str) -> str:
                """Remove trailing '```' markers that sometimes appear in generated code."""
                if not text:
                    return text
                # Strip trailing newlines first
                text = text.rstrip("\n\r")
                # Strip trailing '```' (with optional language specifier and whitespace) at the end of the string
                # Handle cases where '```' appears on its own line or inline at the end
                text = re.sub(r'[\n\r]*\s*```[a-zA-Z]*\s*$', '', text)
                # Also strip any remaining trailing whitespace after removing the fence
                text = text.rstrip()
                return text

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
                                edit_lines = []
                                raw_lines.append(line)
                            # ignore other lines until fence starts, but forward as tool progress
                            elif line.strip():
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
                                # Strip trailing code fence markers
                                content_str = _strip_trailing_code_fence(content_str)
                                raw_lines.append(line)
                                # write to file
                                # compute diff stats vs old content (from memory)
                                old_text_current = file_contents.get(current_filename, "")
                                # If SEARCH/REPLACE block, dry-run apply without saving
                                sr = parse_search_replace_block(content_str)
                                if sr:
                                    orig_block, upd_block = sr
                                    target_name, new_text = apply_search_replace_in_memory(file_contents, orig_block, upd_block, current_filename)
                                    if target_name and new_text is not None:
                                        # success, emit tool_result with updated content
                                        target_type = filetype_map.get(target_name)
                                        # update in-memory contents (strip trailing newlines and code fences)
                                        new_text_stripped = _strip_trailing_code_fence(new_text)
                                        file_contents[target_name] = new_text_stripped
                                        # store edit block text for this file
                                        try:
                                            changed_edit_blocks[target_name] = content_str
                                        except Exception:
                                            pass
                                        # Only send tool_result if we haven't already sent it for this file
                                        if target_name not in files_sent_tool_result:
                                            try:
                                                import difflib
                                                # Compare against initial content, not intermediate state
                                                old_text_initial = initial_contents.get(target_name, "")
                                                a_lines = old_text_initial.splitlines()
                                                b_lines = new_text_stripped.splitlines()
                                                additions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('+ '))
                                                deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('- '))
                                            except Exception:
                                                additions = 0
                                                deletions = 0
                                            # Store final diff stats (not accumulated)
                                            file_diff_stats[target_name] = {"additions": additions, "deletions": deletions}
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
                                            files_sent_tool_result.add(target_name)
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

                                # Non S/R: update in-memory content only (strip trailing newlines and code fences)
                                content_str_stripped = _strip_trailing_code_fence(content_str)
                                file_contents[current_filename] = content_str_stripped
                                target_type = filetype_map.get(current_filename)
                                # Only send tool_result if we haven't already sent it for this file
                                if current_filename not in files_sent_tool_result:
                                    # basic diff stats
                                    try:
                                        import difflib
                                        # Compare against initial content, not intermediate state
                                        old_text_initial = initial_contents.get(current_filename, "")
                                        a_lines = old_text_initial.splitlines()
                                        b_lines = content_str_stripped.splitlines()
                                        diff = difflib.ndiff(a_lines, b_lines)
                                        additions = sum(1 for d in diff if d.startswith('+ ') )
                                        deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('- '))
                                    except Exception:
                                        additions = 0
                                        deletions = 0
                                    # Store final diff stats (not accumulated)
                                    file_diff_stats[current_filename] = {"additions": additions, "deletions": deletions}
                                    diff_stats = {target_type: {"additions": additions, "deletions": deletions}} if target_type else {}
                                    yield (json.dumps({
                                        "state": "tool_result",
                                        "data": {
                                            "target_files": [target_type] if target_type else [],
                                            "diff_stats": diff_stats,
                                            "filename": current_filename,
                                            "updated_content": content_str_stripped,
                                        },
                                    }) + "\n").encode("utf-8")
                                    files_sent_tool_result.add(current_filename)
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
                    # Strip trailing code fence markers
                    content_str = _strip_trailing_code_fence(content_str)
                    old_text = file_contents.get(current_filename, "")
                    # Handle SEARCH/REPLACE at EOF (dry-run)
                    sr = parse_search_replace_block(content_str)
                    updated_payload_text = None
                    updated_target_name = current_filename
                    search_replace_failed = False
                    if sr:
                        orig_block, upd_block = sr
                        tname, new_text = apply_search_replace_in_memory(file_contents, orig_block, upd_block, current_filename)
                        if tname and new_text is not None:
                            updated_payload_text = _strip_trailing_code_fence(new_text)
                            updated_target_name = tname
                            file_contents[updated_target_name] = updated_payload_text
                            # store edit block for this file
                            try:
                                changed_edit_blocks[updated_target_name] = content_str
                            except Exception:
                                pass
                        else:
                            search_replace_failed = True
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
                    else:
                        updated_payload_text = _strip_trailing_code_fence(content_str)
                        file_contents[updated_target_name] = updated_payload_text
                    
                    # Only send tool_result if search/replace succeeded or it wasn't a search/replace block
                    if not search_replace_failed and updated_payload_text is not None:
                        target_type = filetype_map.get(updated_target_name)
                        # Only send tool_result if we haven't already sent it for this file
                        if updated_target_name not in files_sent_tool_result:
                            try:
                                import difflib
                                # Compare against initial content, not intermediate state
                                old_text_initial = initial_contents.get(updated_target_name, "")
                                a_lines = old_text_initial.splitlines()
                                b_lines = updated_payload_text.splitlines()
                                diff = difflib.ndiff(a_lines, b_lines)
                                additions = sum(1 for d in diff if d.startswith('+ ') )
                                deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('- '))
                            except Exception:
                                additions = 0
                                deletions = 0
                            # Store final diff stats (not accumulated)
                            file_diff_stats[updated_target_name] = {"additions": additions, "deletions": deletions}
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
                            files_sent_tool_result.add(updated_target_name)
                    
                    # Only reset state if we didn't already reset it due to search/replace failure
                    if not search_replace_failed:
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
                    yield (json.dumps({
                        "state": "restate",
                        "data": {"restate": clean_tail},
                    }) + "\n").encode("utf-8")
                    try:
                        _append_history({"role": "assistant", "content": clean_tail})
                    except Exception:
                        pass

                # Persist updated contents back to disk for next run
                # Files are already in temp_dir, so coder will see them on next request
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

                            # Skip follow-up ideas for replication post-test tasks (summary only)
                            if assistant_log_suggestions and (task_name or "") not in POST_TEST_REQUIRED_TASK_NAMES:
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
                generated_code_payload["mode"] = assistant_mode
                type_to_fname = {"html": "index.html", "css": "styles.css", "js": "frontend.js"}
                # Recalculate final diff stats for all changed files (in case file was edited multiple times)
                for ftype, fname in type_to_fname.items():
                    final_content = (final_files_map.get(ftype) or "").rstrip("\n")
                    if final_content:
                        # Calculate final diff stats comparing final state vs initial state
                        try:
                            import difflib
                            old_text_initial = initial_contents.get(fname, "")
                            a_lines = old_text_initial.splitlines()
                            b_lines = final_content.splitlines()
                            additions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('+ '))
                            deletions = sum(1 for d in difflib.ndiff(a_lines, b_lines) if d.startswith('- '))
                        except Exception:
                            # Fallback to stored stats if calculation fails
                            stats = file_diff_stats.get(fname, {})
                            additions = stats.get("additions", 0)
                            deletions = stats.get("deletions", 0)
                        generated_code_payload[ftype] = {
                            "content": final_content,
                            "diff_stats": {
                                "additions": additions,
                                "deletions": deletions,
                                "total_changes": additions + deletions,
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
                
                # Emit the temp_dir UUID so frontend can reuse it
                temp_dir_uuid_emitted = _extract_uuid_from_temp_dir(temp_dir)
                yield (json.dumps({
                    "state": "session_uuid",
                    "data": {"tempDirUuid": temp_dir_uuid_emitted},
                }) + "\n").encode("utf-8")

                # yield (json.dumps({
                #     "state": "complete",
                #     "data": {
                #         "changedFiles": final_files_list,
                #         "final_files": final_files_map,
                #     },
                # }) + "\n").encode("utf-8")

            except Exception as stream_error:
                yield (json.dumps({
                    "state": "error",
                    "data": {"message": str(stream_error)},
                }) + "\n").encode("utf-8")
            finally:
                # Never delete temp_dir - we want to keep it for conversation history
                # It will only be deleted when user clears history
                pass

        return StreamingResponse(
            event_generator(), 
            media_type="application/x-ndjson",
            headers={
                "X-Accel-Buffering": "no",  # Disable buffering in nginx
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            }
        )
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


def _clear_agent_impl(db: Session, request_data: dict, mode: str) -> dict:
    """Clear agent state. mode: 'agent' | 'debug' | 'ask' | 'brainstorm' | 'all'."""
    global _coder_instances, _user_active_uuid, _debug_history, _ask_history, _brainstorm_history
    user_id_value = _resolve_user_id(db, request_data.get("userId") or request_data.get("user_id"))
    cleared_instances = 0

    if mode in ("agent", "all"):
        MESSAGE_HISTORY.clear()
        if user_id_value is not None:
            keys_to_remove = []
            for cache_key, instance in _coder_instances.items():
                instance_user_id = instance.get("user_id")
                if instance_user_id == user_id_value:
                    keys_to_remove.append(cache_key)
                else:
                    temp_dir = instance.get("temp_dir", "")
                    if temp_dir and _extract_user_id_from_temp_dir(temp_dir) == user_id_value:
                        keys_to_remove.append(cache_key)
            for cache_key in keys_to_remove:
                logger.info(f"Clearing Aider instance for user {user_id_value}: {cache_key}")
                del _coder_instances[cache_key]
            cleared_instances = len(keys_to_remove)
            if user_id_value in _user_active_uuid:
                del _user_active_uuid[user_id_value]
            repo_root = Path(__file__).resolve().parent.parent
            user_tmp_root = repo_root / "tmp" / str(user_id_value)
            if user_tmp_root.exists():
                shutil.rmtree(user_tmp_root, ignore_errors=True)
                logger.info(f"Deleted temp directory for user {user_id_value}: {user_tmp_root}")
        else:
            logger.info("Clearing all Aider instances (no user_id provided)")
            cleared_instances = len(_coder_instances)
            _coder_instances.clear()
            _user_active_uuid.clear()

    if mode in ("debug", "all"):
        if user_id_value is not None:
            history_key = str(user_id_value)
            if history_key in _debug_history:
                del _debug_history[history_key]
                logger.info("Cleared debug history for %s", history_key)
        else:
            _debug_history.clear()
            logger.info("Cleared all debug history")

    if mode in ("ask", "all"):
        if user_id_value is not None:
            history_key = str(user_id_value)
            if history_key in _ask_history:
                del _ask_history[history_key]
                logger.info("Cleared ask history for %s", history_key)
        else:
            _ask_history.clear()
            logger.info("Cleared all ask history")

    if mode in ("brainstorm", "all"):
        if user_id_value is not None:
            history_key = str(user_id_value)
            if history_key in _brainstorm_history:
                del _brainstorm_history[history_key]
                logger.info("Cleared brainstorm history for %s", history_key)
        else:
            _brainstorm_history.clear()
            logger.info("Cleared all brainstorm history")

    return {"ok": True, "cleared_instances": cleared_instances}


@router.post("/api/agent/clear")
async def agent_clear_unified(request_data: dict, db: Session = Depends(get_db)):
    """Unified clear endpoint. Use mode to choose what to clear.
    - mode: 'agent' | 'debug' | 'ask' | 'brainstorm' | 'all' (default 'all')
    """
    try:
        mode = (request_data.get("mode") or "all").lower()
        if mode not in ("agent", "debug", "ask", "brainstorm", "all"):
            mode = "all"
        return _clear_agent_impl(db, request_data, mode)
    except Exception as e:
        logger.error(f"Error clearing agent: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/agent-history/clear")
async def clear_agent_history(request_data: dict, db: Session = Depends(get_db)):
    """Clear agent history for a user by deleting their entire temp folder and Aider instance.
    Also clears debug/ask/brainstorm conversation history for that user."""
    try:
        return _clear_agent_impl(db, request_data, "all")
    except Exception as e:
        logger.error(f"Error clearing agent history: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


# --------------------------
# Memory management and monitoring endpoints
# --------------------------
@router.get("/api/agent-instances/stats")
async def get_agent_instances_stats():
    """Get statistics about active Coder instances for monitoring."""
    global _coder_instances
    try:
        current_time = time.time()
        instances_info = []
        total_io_messages = 0
        user_instance_count: Dict[int, int] = {}
        
        for cache_key, instance in _coder_instances.items():
            last_used = instance.get("last_used", 0)
            age_seconds = current_time - last_used
            io = instance.get("io")
            io_message_count = len(io.messages) if io and hasattr(io, "messages") else 0
            total_io_messages += io_message_count
            user_id = instance.get("user_id")
            
            # Track instances per user
            if user_id is not None:
                user_instance_count[user_id] = user_instance_count.get(user_id, 0) + 1
            
            instances_info.append({
                "temp_dir": instance.get("temp_dir", ""),
                "user_id": user_id,
                "last_used_seconds_ago": int(age_seconds),
                "io_message_count": io_message_count,
            })
        
        # Sort by last_used (oldest first)
        instances_info.sort(key=lambda x: x["last_used_seconds_ago"], reverse=True)
        
        # Find users with multiple instances (shouldn't happen, but useful for debugging)
        users_with_multiple = {uid: count for uid, count in user_instance_count.items() if count > 1}
        
        return {
            "total_instances": len(_coder_instances),
            "max_instances": MAX_CODER_INSTANCES,
            "idle_timeout_seconds": INSTANCE_IDLE_TIMEOUT_SECONDS,
            "total_io_messages": total_io_messages,
            "unique_users": len(user_instance_count),
            "users_with_multiple_instances": users_with_multiple,  # Should be empty if working correctly
            "instances": instances_info[:20],  # Return top 20 oldest instances
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/agent-instances/cleanup")
async def cleanup_agent_instances():
    """Manually trigger cleanup of inactive instances."""
    try:
        evicted_count = _evict_inactive_instances()
        return {
            "ok": True,
            "evicted_count": evicted_count,
            "remaining_instances": len(_coder_instances),
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})