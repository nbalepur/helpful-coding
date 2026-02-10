"""
Shared utilities and helpers: task/project helpers, auth (tokens, password hashing, email).
"""
from .task_helpers import (
    slugify,
    resolve_project_from_task_id,
    normalize_project_files,
    build_rating_summary,
)

__all__ = [
    "slugify",
    "resolve_project_from_task_id",
    "normalize_project_files",
    "build_rating_summary",
]
