"""
Coder instances, temp workspace, and cleanup for the agent.

Manages in-memory Aider Coder instances keyed by temp directory,
per-user active UUID, eviction (idle + LRU), and workspace creation.
Includes diagnostics endpoints: GET/POST /api/agent-instances/stats and cleanup.
"""
from __future__ import annotations

import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from aider.coders import Coder
from aider.io import InputOutput
from aider.models import Model

logger = logging.getLogger(__name__)


# Model config (used when creating coders)
AIDER_MODEL = os.getenv("AIDER_MODEL", "gpt-4.1-2025-04-14")
MAX_CODER_INSTANCES = int(os.getenv("AIDER_MAX_INSTANCES", "100"))
INSTANCE_IDLE_TIMEOUT_SECONDS = int(os.getenv("AIDER_IDLE_TIMEOUT", "1800"))


# --------------------------
# IO that captures everything
# --------------------------
class CapturingIO(InputOutput):
    """IO shim that appends Aider output to self.messages."""

    def __init__(self, **kw):
        super().__init__(**kw)
        self.messages: List[str] = []
        self.pretty = False
        self.max_messages = int(os.getenv("AIDER_MAX_IO_MESSAGES", "1000"))

    def _record(self, *args, **kwargs):
        msg = " ".join(str(a) for a in args)
        self.messages.append(msg)
        if len(self.messages) > self.max_messages:
            self.messages = self.messages[-self.max_messages :]

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
# Instance storage and lifecycle
# --------------------------
# {temp_dir_path: {"coder", "io", "temp_dir", "last_used", "user_id"}}
_coder_instances: Dict[str, Dict[str, Any]] = {}
# {user_id: "uuid_string"} — per-user active session UUID
_user_active_uuid: Dict[int, str] = {}


def extract_uuid_from_temp_dir(temp_dir: str) -> str:
    """Extract UUID from path like 'tmp/user_id/aider_<uuid>'."""
    path = Path(temp_dir)
    name = path.name
    if name.startswith("aider_"):
        return name[6:]
    return name


def _extract_user_id_from_temp_dir(temp_dir: str) -> Optional[int]:
    """Extract user_id from path like 'tmp/user_id/aider_<uuid>'."""
    try:
        path = Path(temp_dir)
        parent = path.parent
        if parent.name and parent.name.isdigit():
            return int(parent.name)
        grandparent = parent.parent
        if grandparent.name and grandparent.name.isdigit():
            return int(grandparent.name)
    except (ValueError, AttributeError):
        pass
    return None


def _evict_inactive_instances() -> int:
    """Remove instances idle longer than INSTANCE_IDLE_TIMEOUT_SECONDS."""
    global _coder_instances
    now = time.time()
    to_remove = [
        k for k, v in _coder_instances.items()
        if now - v.get("last_used", 0) > INSTANCE_IDLE_TIMEOUT_SECONDS
    ]
    for k in to_remove:
        logger.info("Evicting inactive Coder instance: %s", k)
        del _coder_instances[k]
    return len(to_remove)


def _evict_lru_instance() -> None:
    """Remove the least recently used instance when at max capacity."""
    global _coder_instances
    if not _coder_instances:
        return
    lru_key = min(
        _coder_instances.keys(),
        key=lambda k: _coder_instances[k].get("last_used", 0),
    )
    logger.info("Evicting LRU Coder instance: %s", lru_key)
    del _coder_instances[lru_key]


def _cleanup_other_user_instances(user_id: Optional[int], keep_temp_dir: str) -> int:
    """Remove all other Coder instances for this user, keep only keep_temp_dir."""
    global _coder_instances
    if user_id is None:
        return 0
    keep_key = str(Path(keep_temp_dir).resolve())
    to_remove = []
    for cache_key, instance in _coder_instances.items():
        if cache_key == keep_key:
            continue
        tid = instance.get("temp_dir", "")
        if _extract_user_id_from_temp_dir(tid) == user_id:
            to_remove.append(cache_key)
    for k in to_remove:
        logger.info("Removing duplicate instance for user %s: %s", user_id, k)
        del _coder_instances[k]
    return len(to_remove)


def make_coder(
    fnames: List[str],
    model_name: Optional[str] = None,
) -> Tuple[Coder, CapturingIO]:
    """Build a new Coder and CapturingIO for the given file list."""
    model = Model(model_name or AIDER_MODEL)
    io = CapturingIO(yes=False)
    coder = Coder.create(main_model=model, io=io, fnames=fnames)
    coder.edit_format = "diff"
    coder.suggest_shell_commands = False
    coder.detect_urls = False
    coder.verbose = False
    coder.auto_commits = False
    coder.dirty_commits = False
    return coder, io


def get_or_create_coder_for_temp_dir(
    temp_dir: str,
    fnames: List[str],
    model_name: Optional[str] = None,
) -> Tuple[Coder, CapturingIO]:
    """Get or create a Coder for this temp directory; enforces one active instance per user."""
    global _coder_instances

    _evict_inactive_instances()

    temp_path = Path(temp_dir)
    user_id = _extract_user_id_from_temp_dir(temp_dir)
    cache_key = str(temp_path.resolve())

    if cache_key not in _coder_instances:
        if user_id is not None:
            _cleanup_other_user_instances(user_id, temp_dir)
        while len(_coder_instances) >= MAX_CODER_INSTANCES:
            _evict_lru_instance()

        temp_fnames: List[str] = []
        for fname in fnames:
            fpath = Path(fname)
            if str(fpath.parent) == str(temp_path):
                temp_fnames.append(fname)
            else:
                temp_fpath = temp_path / fpath.name
                if not temp_fpath.exists() and fpath.exists():
                    shutil.copy2(fpath, temp_fpath)
                elif not temp_fpath.exists():
                    temp_fpath.write_text("", encoding="utf-8")
                temp_fnames.append(str(temp_fpath))

        coder, io = make_coder(temp_fnames, model_name or AIDER_MODEL)
        _coder_instances[cache_key] = {
            "coder": coder,
            "io": io,
            "temp_dir": str(temp_path),
            "last_used": time.time(),
            "user_id": user_id,
        }
    else:
        instance = _coder_instances[cache_key]
        coder = instance["coder"]
        io = instance["io"]
        instance["last_used"] = time.time()
        if user_id is not None:
            _cleanup_other_user_instances(user_id, temp_dir)

        temp_fnames = []
        for fname in fnames:
            fpath = Path(fname)
            if str(fpath.parent) == str(temp_path):
                temp_fnames.append(fname)
            else:
                temp_fpath = temp_path / fpath.name
                if fpath.exists() and str(fpath.resolve()) != str(temp_fpath.resolve()):
                    shutil.copy2(fpath, temp_fpath)
                elif not temp_fpath.exists():
                    temp_fpath.write_text("", encoding="utf-8")
                temp_fnames.append(str(temp_fpath))
        if hasattr(coder, "fnames"):
            coder.fnames = temp_fnames

    return coder, io


def create_temp_workspace(
    incoming_files: Dict[str, str],
    user_id: Optional[int] = None,
    temp_dir_uuid: Optional[str] = None,
    repo_root: Optional[Path] = None,
) -> Tuple[List[str], str, Dict[str, str]]:
    """
    Create or reuse a temp workspace under tmp/user_id/aider_<uuid>.
    Returns (fnames, temp_dir, file_map).
    """
    global _user_active_uuid
    if repo_root is None:
        repo_root = Path(__file__).resolve().parent.parent
    tmp_root = repo_root / "tmp"
    user_folder = str(user_id) if user_id is not None else "anonymous"
    user_tmp_root = tmp_root / user_folder
    user_tmp_root.mkdir(parents=True, exist_ok=True)

    if temp_dir_uuid:
        final_uuid = temp_dir_uuid
    elif user_id is not None and user_id in _user_active_uuid:
        final_uuid = _user_active_uuid[user_id]
    else:
        final_uuid = None

    if final_uuid:
        temp_dir_path = user_tmp_root / f"aider_{final_uuid}"
        if not temp_dir_path.exists():
            temp_dir_path.mkdir(parents=True, exist_ok=True)
    else:
        temp_dir_path = Path(tempfile.mkdtemp(prefix="aider_", dir=str(user_tmp_root)))
        final_uuid = extract_uuid_from_temp_dir(str(temp_dir_path))
        if user_id is not None:
            _user_active_uuid[user_id] = final_uuid

    # Support both legacy keys (html, css, js) and arbitrary filenames (e.g. solution.py for function tasks)
    file_map: Dict[str, str] = {}
    legacy = [
        ("html", "index.html"),
        ("js", "frontend.js"),
        ("css", "styles.css"),
    ]
    for key, default_fname in legacy:
        if key in incoming_files or default_fname in incoming_files:
            file_map[default_fname] = incoming_files.get(key) or incoming_files.get(default_fname, "")
    for key, content in incoming_files.items():
        if key not in ("html", "css", "js") and key not in file_map:
            file_map[key] = content
    # If no files were sent, keep legacy empty trio so Aider has a known workspace
    if not file_map:
        file_map = {"index.html": "", "frontend.js": "", "styles.css": ""}
    fnames = []
    for fname, content in file_map.items():
        fpath = temp_dir_path / fname
        try:
            fpath.write_text(content or "", encoding="utf-8")
        except Exception:
            try:
                fpath.touch(exist_ok=True)
            except Exception:
                pass
        fnames.append(str(fpath))

    return fnames, str(temp_dir_path), file_map


# --------------------------
# Clearing / halting
# --------------------------
def clear_instances_for_user(user_id: int) -> int:
    """Remove all Coder instances for this user and clear their active UUID. Returns count removed."""
    global _coder_instances, _user_active_uuid
    to_remove = []
    for cache_key, instance in _coder_instances.items():
        if instance.get("user_id") == user_id:
            to_remove.append(cache_key)
        else:
            tid = instance.get("temp_dir", "")
            if _extract_user_id_from_temp_dir(tid) == user_id:
                to_remove.append(cache_key)
    for k in to_remove:
        logger.info("Clearing Aider instance for user %s: %s", user_id, k)
        del _coder_instances[k]
    if user_id in _user_active_uuid:
        del _user_active_uuid[user_id]
    return len(to_remove)


def clear_all_instances() -> int:
    """Remove all Coder instances and active UUIDs. Returns count removed."""
    global _coder_instances, _user_active_uuid
    n = len(_coder_instances)
    _coder_instances.clear()
    _user_active_uuid.clear()
    logger.info("Cleared all Aider instances: %s", n)
    return n


def delete_user_temp_dir(user_id: int, repo_root: Optional[Path] = None) -> None:
    """Delete the entire tmp/user_id directory on disk."""
    if repo_root is None:
        repo_root = Path(__file__).resolve().parent.parent
    user_tmp_root = repo_root / "tmp" / str(user_id)
    if user_tmp_root.exists():
        shutil.rmtree(user_tmp_root, ignore_errors=True)
        logger.info("Deleted temp directory for user %s: %s", user_id, user_tmp_root)


def get_instances_stats() -> Dict[str, Any]:
    """Return stats about active Coder instances for monitoring."""
    global _coder_instances
    now = time.time()
    instances_info = []
    total_io = 0
    user_count: Dict[int, int] = {}
    for cache_key, instance in _coder_instances.items():
        last = instance.get("last_used", 0)
        io = instance.get("io")
        nmsg = len(io.messages) if io and hasattr(io, "messages") else 0
        total_io += nmsg
        uid = instance.get("user_id")
        if uid is not None:
            user_count[uid] = user_count.get(uid, 0) + 1
        instances_info.append({
            "temp_dir": instance.get("temp_dir", ""),
            "user_id": uid,
            "last_used_seconds_ago": int(now - last),
            "io_message_count": nmsg,
        })
    instances_info.sort(key=lambda x: x["last_used_seconds_ago"], reverse=True)
    multiple = {u: c for u, c in user_count.items() if c > 1}
    return {
        "total_instances": len(_coder_instances),
        "max_instances": MAX_CODER_INSTANCES,
        "idle_timeout_seconds": INSTANCE_IDLE_TIMEOUT_SECONDS,
        "total_io_messages": total_io,
        "unique_users": len(user_count),
        "users_with_multiple_instances": multiple,
        "instances": instances_info[:20],
    }


def cleanup_inactive_instances() -> Dict[str, int]:
    """Manually evict idle instances. Returns dict with evicted_count and remaining_instances."""
    evicted = _evict_inactive_instances()
    return {"evicted_count": evicted, "remaining_instances": len(_coder_instances)}


# --------------------------
# Diagnostics HTTP endpoints
# --------------------------
router = APIRouter(tags=["Agent instances"])


@router.get("/api/agent-instances/stats", summary="Get coder instance stats")
async def get_agent_instances_stats_endpoint():
    try:
        return get_instances_stats()
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/agent-instances/cleanup", summary="Clean up inactive coder instances")
async def cleanup_agent_instances_endpoint():
    try:
        result = cleanup_inactive_instances()
        return {"ok": True, **result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
