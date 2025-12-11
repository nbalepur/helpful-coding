#!/usr/bin/env python3
"""
Load tasks from data/dummy_tasks.json into the database `projects` table.

Maps common starter files by filename:
- index.html -> Project.html_starter_file
- styles.css -> Project.css_starter_file
- frontend.js -> Project.frontend_starter_file

Description is loaded from file if a repo-relative path is provided.
"""

import json
import os
from datetime import date
from pathlib import Path
from typing import Dict, Any, Optional

import sys

# Ensure repository root on path so `database` can be imported
THIS_DIR = Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from database.config import SessionLocal, create_tables  # type: ignore
from database.sqlalchemy_models import Project  # type: ignore


def read_text_file(repo_relative_path: str) -> str:
    """Deprecated: previously loaded file contents. Kept for reference."""
    try:
        abs_path = REPO_ROOT / repo_relative_path
        return abs_path.read_text(encoding="utf-8")
    except Exception as e:
        return f"// Error reading {repo_relative_path}: {e}"


def load_description(task: Dict[str, Any]) -> str:
    """Store description exactly as in dummy_tasks.json (string)."""
    desc = task.get("description", "")
    return desc or ""


def extract_files_json(task: Dict[str, Any]):
    """Return the raw files array (paths or inline) exactly as in dummy_tasks.json."""
    files = task.get("files")
    return files if isinstance(files, list) else []


def parse_date_field(task: Dict[str, Any], field_name: str) -> Optional[date]:
    """Parse ISO date strings (YYYY-MM-DD). Returns None if missing or invalid."""
    value = task.get(field_name)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        print(f"⚠️  Warning: Invalid date format for '{field_name}' in task '{task.get('name', '<unknown>')}'. "
              f"Expected YYYY-MM-DD, got '{value}'. Skipping this field.")
        return None


def main() -> int:
    # Ensure tables exist
    create_tables()

    data_path = REPO_ROOT / "data" / "dummy_tasks.json"
    if not data_path.exists():
        print(f"❌ Not found: {data_path}")
        return 1

    payload = json.loads(data_path.read_text(encoding="utf-8"))
    tasks = payload.get("tasks", [])

    db = SessionLocal()
    try:
        created = 0
        for task in tasks:
            name = task.get("name")
            if not name:
                continue

            # Upsert-like behavior: if a project with same name exists, update it
            existing = db.query(Project).filter(Project.name == name).first()

            description_text = load_description(task)
            files_json = extract_files_json(task)
            code_start = parse_date_field(task, "code_start_date")
            voting_start = parse_date_field(task, "voting_start_date")
            voting_end = parse_date_field(task, "voting_end_date")

            if existing:
                existing.description = description_text
                existing.files = files_json
                existing.code_start_date = code_start
                existing.voting_start_date = voting_start
                existing.voting_end_date = voting_end
            else:
                project = Project(
                    name=name,
                    description=description_text,
                    files=files_json,
                    code_start_date=code_start,
                    voting_start_date=voting_start,
                    voting_end_date=voting_end,
                )
                db.add(project)
                created += 1

        db.commit()
        print(f"✅ Loaded tasks into projects table. New created: {created}, total now: {db.query(Project).count()}")
        return 0
    except Exception as e:
        db.rollback()
        print(f"❌ Error loading tasks: {e}")
        return 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())


