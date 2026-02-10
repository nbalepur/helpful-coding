"""
Code API: log code snapshots.
"""
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database.config import get_db
from database.sqlalchemy_models import User
from database.models import CodeCreate, CodeLogRequest
from database.crud import CodeCRUD

from utils.task_helpers import resolve_project_from_task_id

router = APIRouter(prefix="/api", tags=["Code"])


@router.post("/code-logs")
async def log_code_snapshot(payload: CodeLogRequest, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            return JSONResponse(status_code=400, content={"error": "User not found", "code": "user_not_found"})

        project = None
        if payload.task_id:
            project = resolve_project_from_task_id(db, payload.task_id)
        if project is None and payload.project_id is not None:
            from database.sqlalchemy_models import Project
            project = db.query(Project).filter(Project.id == payload.project_id).first()

        if project is None:
            return JSONResponse(status_code=400, content={"error": "Project not found", "code": "project_not_found"})

        code_payload = {key: (value or "") for key, value in (payload.code or {}).items()}
        if not code_payload:
            return JSONResponse(status_code=400, content={"error": "Code payload is empty"})

        metadata = dict(payload.metadata or {})
        if payload.event:
            metadata.setdefault("event", payload.event)
        metadata.setdefault("recorded_at", datetime.utcnow().isoformat())
        metadata.setdefault("code_keys", list(code_payload.keys()))
        metadata.setdefault("mode", payload.mode or "regular")
        if payload.task_id:
            metadata.setdefault("task_id", payload.task_id)
        metadata.setdefault("user_id", payload.user_id)

        code_create = CodeCreate(
            user_id=payload.user_id,
            project_id=project.id,
            code=code_payload,
            mode=payload.mode or "regular",
            metadata=metadata,
        )
        code_record = CodeCRUD.create(db, code_create)
        return {"success": True, "codeId": code_record.id}
    except Exception as e:
        print(f"Error logging code snapshot: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to log code snapshot"})
