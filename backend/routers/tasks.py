"""
Tasks API: list tasks from DB, get task files.
"""
import os
import re
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database.config import get_db
from database.sqlalchemy_models import Project, Code, Submission
from database.crud import CodeCRUD

from utils.task_helpers import (
    slugify,
    resolve_project_from_task_id,
    normalize_project_files,
    validate_project_files_for_label,
)

router = APIRouter(prefix="/api", tags=["Tasks"])


@router.get("/tasks-db")
async def list_tasks_from_db(
    user_id: Optional[int] = Query(default=None, alias="userId"),
    db: Session = Depends(get_db),
):
    try:
        projects = db.query(Project).order_by(Project.id.asc()).all()

        submissions_by_project = {}
        latest_code_by_project = {}

        if user_id:
            submission_rows = db.query(Submission.project_id).filter(
                Submission.user_id == user_id
            ).all()
            submissions_by_project = {row[0] for row in submission_rows}

            all_user_codes = db.query(
                Code.project_id,
                Code.code,
                Code.created_at,
                Code.id,
            ).filter(
                Code.user_id == user_id
            ).order_by(Code.project_id, Code.created_at.desc(), Code.id.desc()).all()

            for project_id, code_content, created_at, code_id in all_user_codes:
                if project_id not in latest_code_by_project:
                    latest_code_by_project[project_id] = code_content

        tasks = []
        for p in projects:
            status = "not-started"
            if user_id:
                if p.id in submissions_by_project:
                    status = "completed"
                elif p.id in latest_code_by_project:
                    user_code = latest_code_by_project[p.id]
                    if user_code:
                        status = "in-progress"

            example = p.examples or ""

            description = p.description or ""
            task_title = p.title or p.name
            if p.label and p.label.lower() == "replication" and task_title:
                prefix = f"Create your own version of {task_title}: "
                description_stripped = description.strip()
                if re.match(r"^\s*<p", description_stripped, re.IGNORECASE):
                    description = re.sub(
                        r"^(\s*<p[^>]*>)",
                        rf"\1{prefix}",
                        description_stripped,
                        flags=re.IGNORECASE,
                    )
                else:
                    description = f"<p><strong>{prefix}</strong></p>{description_stripped}"

            tasks.append({
                "id": slugify(p.name),
                "name": p.name,
                "title": task_title,
                "label": p.label or "",
                "description": description,
                "example": example,
                "projectId": p.id,
                "status": status,
            })
        response = JSONResponse(content={"tasks": tasks})
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/task-files-db")
async def get_task_files_from_db(
    taskId: str,
    userId: Optional[int] = None,
    db: Session = Depends(get_db),
):
    try:
        project = resolve_project_from_task_id(db, taskId)
        if not project:
            return JSONResponse(status_code=404, content={"error": "Task not found"})

        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        repo_root = os.path.abspath(os.path.join(backend_dir, ".."))

        def resolve_content(value: str) -> str:
            try:
                if isinstance(value, str) and value.startswith("data/"):
                    file_path = os.path.join(repo_root, value)
                    if os.path.exists(file_path):
                        with open(file_path, "r", encoding="utf-8") as f:
                            return f.read()
                    return f"// File not found: {value}"
                return value or ""
            except Exception as e:
                return f"// Error reading file: {str(e)}"

        def get_language_key_from_filename(filename: str) -> Optional[str]:
            lower = filename.lower()
            if lower.endswith(".html"):
                return "html"
            elif lower.endswith(".css"):
                return "css"
            elif lower.endswith((".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx")):
                return "js"
            elif lower.endswith(".py"):
                return "py"
            return None

        def get_saved_content(saved_code: Dict[str, Any], lang_key: Optional[str]) -> Optional[str]:
            if not lang_key:
                return None
            content = saved_code.get(lang_key)
            if content is not None and content != "":
                return content
            if lang_key == "py":
                content = saved_code.get("python")
                if content is not None and content != "":
                    return content
            return content if content is not None else None

        files: List[Dict[str, Any]] = []
        user_code = None
        project_files = normalize_project_files(project.files)

        ok, validation_error = validate_project_files_for_label(
            project_files, project.label
        )
        if not ok:
            return JSONResponse(
                status_code=400,
                content={"error": validation_error or "Invalid project files for task label."},
            )

        if userId and project:
            user_code = CodeCRUD.get_latest_by_user_and_project(db, user_id=userId, project_id=project.id)

        if user_code and user_code.code:
            saved_code = user_code.code
            for file_config in project_files:
                try:
                    name = file_config.get("name")
                    language = file_config.get("language", "plaintext")
                    lang_key = get_language_key_from_filename(name)
                    content = get_saved_content(saved_code, lang_key)
                    if content is None:
                        content = resolve_content(file_config.get("content", ""))
                    entry = file_config.get("entry")
                    files.append({
                        "id": name,
                        "name": name,
                        "type": "file",
                        "content": content,
                        "language": language,
                        **({"entry": entry} if entry is not None else {}),
                    })
                except Exception:
                    pass
        else:
            for file_config in project_files:
                try:
                    name = file_config.get("name")
                    language = file_config.get("language", "plaintext")
                    content = file_config.get("content", "")
                    entry = file_config.get("entry")
                    files.append({
                        "id": name,
                        "name": name,
                        "type": "file",
                        "content": resolve_content(content),
                        "language": language,
                        **({"entry": entry} if entry is not None else {}),
                    })
                except Exception:
                    pass

        return {
            "files": files,
            "projectId": project.id,
            "projectName": project.name,
            "testCases": project.test_cases,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
