"""
Code preference logging: suggestions, project resolution, and persistence.

Used when the agent emits follow-up suggestions and when the user submits
a selection. Includes the non-essential POST /api/code-preferences endpoint.
"""
from __future__ import annotations

import hashlib
import logging
import re
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import (
    get_db,
    CodePreferenceCRUD,
    CodePreferenceCreate,
    CodePreferenceUpdate,
    ProjectCRUD,
    ProjectCreate,
)
from database.models import CodePreferenceLogPayload
from database.sqlalchemy_models import Project

logger = logging.getLogger(__name__)


def slugify_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower())
    return slug.strip("-")


def parse_optional_int(value: Union[str, int, None]) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    stripped = (value or "").strip()
    if not stripped:
        return None
    try:
        return int(stripped)
    except ValueError:
        return None


def prepare_suggestions(raw_suggestions: Optional[List[str]]) -> List[str]:
    cleaned: List[str] = []
    if not raw_suggestions:
        return cleaned
    seen = set()
    for s in raw_suggestions:
        if not isinstance(s, str):
            continue
        text = s.strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    cleaned.sort(key=lambda x: x.casefold())
    return cleaned


def compute_suggestion_id(suggestions: List[str]) -> str:
    normalized = "|".join(s.casefold() for s in suggestions)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def resolve_project_id(
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
            for pid, existing_name in db.query(Project.id, Project.name).all():
                if slugify_name(existing_name) == slug:
                    return pid
        if name:
            existing = (
                db.query(Project)
                .filter(func.lower(Project.name) == name.lower())
                .first()
            )
            if existing:
                return existing.id
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
            "Failed to resolve or create project slug=%r name=%r: %s",
            task_slug,
            task_name,
            exc,
            exc_info=True,
        )
    return None


def log_code_preference_entry(
    db: Session,
    *,
    suggestions: Optional[List[str]],
    project_id: Optional[int],
    user_id: Optional[int],
    user_selection: Optional[str],
    allow_update: bool = True,
) -> Optional[int]:
    prepared = prepare_suggestions(suggestions)
    if not prepared or project_id is None:
        if project_id is None:
            logger.debug("Skipping code preference log: no project_id")
        return None
    suggestion_id = compute_suggestion_id(prepared)
    selection_value = (user_selection or "").strip() or None
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
                        db, existing.id, CodePreferenceUpdate(**update_fields)
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
        logger.error("Failed to persist code preference: %s", exc, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# HTTP endpoint (non-essential; kept here so api.py stays minimal)
# ---------------------------------------------------------------------------
router = APIRouter(tags=["Code preferences"])


@router.post("/api/code-preferences", summary="Log code preference / user selection")
async def create_code_preference_entry(payload: CodePreferenceLogPayload, db: Session = Depends(get_db)):
    suggestions = prepare_suggestions(payload.suggestions)
    if not suggestions:
        raise HTTPException(status_code=400, detail="No suggestions provided")
    from agent import helpers
    user_id_value = helpers.resolve_user_id(db, payload.user_id)
    project_id_value = resolve_project_id(
        db,
        project_id=payload.project_id,
        task_slug=payload.task_id,
        task_name=payload.task_name,
    )
    if project_id_value is None:
        raise HTTPException(status_code=400, detail="Unable to resolve project for suggestions")
    user_selection = (payload.user_selection or "").strip()
    entry_id = log_code_preference_entry(
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
