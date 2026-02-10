import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Optional, Tuple

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sqlalchemy import MetaData, text
from database.config import Base, SessionLocal, engine
from database.sqlalchemy_models import Project  # noqa: F401


def _resolve_tasks_path(raw_path: str) -> Path:
    repo_root = Path(__file__).resolve().parent.parent
    path = Path(raw_path)
    if not path.is_absolute():
        path = repo_root / path
    return path

def _load_tasks(path: Path) -> List[Dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    tasks = payload.get("tasks", [])
    if not isinstance(tasks, list):
        raise ValueError("tasks.json must contain a top-level 'tasks' array")

    for task in tasks:
        for f in task.get("files") or []:
            ct = f.get("contentType")
            if ct not in {'path', 'raw'}:
                raise ValueError(
                    f"Task '{task.get('name', '?')}' file '{f.get('name', '?')}': "
                    f"contentType must be 'path' or 'raw', got {ct!r}"
                )

    return tasks


def _create_tables(reset: bool) -> None:
    if reset:
        if engine.dialect.name == "postgresql":
            with engine.connect() as conn:
                conn.execute(text("DROP SCHEMA public CASCADE"))
                conn.execute(text("CREATE SCHEMA public"))
                conn.commit()
                # Create tables on the same connection so it sees the empty schema
                Base.metadata.create_all(bind=conn)
                conn.commit()  # commit DDL so it's visible to other connections
            engine.dispose()  # clear pool so later sessions see the new tables
        else:
            reflected = MetaData()
            reflected.reflect(bind=engine)
            reflected.drop_all(bind=engine)
            Base.metadata.create_all(bind=engine)
    else:
        Base.metadata.create_all(bind=engine)


def _sync_projects(tasks: List[Dict]) -> Tuple[int, int]:
    created = 0
    updated = 0
    session = SessionLocal()
    try:
        existing = {project.name: project for project in session.query(Project).all()}
        for task in tasks:
            name = task.get("name")
            if not name:
                continue

            project = existing.get(name)
            is_new = project is None
            examples = task.get("example") or task.get("examples")
            test_cases = task.get("test_cases")

            if is_new:
                # Set all fields before add so we insert one full row (avoids bulk INSERT column-order issues)
                project = Project(
                    name=name,
                    title=task.get("title"),
                    label=task.get("label"),
                    description=task.get("description"),
                    files=task.get("files"),
                    examples=examples,
                    test_cases=test_cases,
                )
                session.add(project)
                session.flush()  # one INSERT per row; avoids bulk INSERT mapping
                created += 1
            else:
                changed = False
                for field, value in [
                    ("title", task.get("title")),
                    ("label", task.get("label")),
                    ("description", task.get("description")),
                    ("files", task.get("files")),
                    ("examples", examples),
                    ("test_cases", test_cases),
                ]:
                    if value is not None and getattr(project, field) != value:
                        setattr(project, field, value)
                        changed = True
                if changed:
                    updated += 1

        session.commit()
    finally:
        session.close()

    return created, updated


def main() -> int:
    parser = argparse.ArgumentParser(description="Create tables and load tasks.json")
    parser.add_argument(
        "--tasks-path",
        default="data/tasks.json",
        help="Path to tasks.json (absolute or relative to repo root)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop all tables before recreating them",
    )
    args = parser.parse_args()

    tasks_path = _resolve_tasks_path(args.tasks_path)
    if not tasks_path.exists():
        print(f"❌ tasks.json not found at {tasks_path}")
        return 1

    _create_tables(reset=args.reset)
    tasks = _load_tasks(tasks_path)
    created, updated = _sync_projects(tasks)

    print(f"✅ Loaded tasks from {tasks_path}")
    print(f"   Projects created: {created}")
    print(f"   Projects updated: {updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
