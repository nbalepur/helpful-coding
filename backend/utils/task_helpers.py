"""
Shared helpers for task/project resolution and task metadata.
Used by tasks, submissions, and code routers.
"""
import json
import re
from typing import Dict, Any, List, Optional, Tuple

from sqlalchemy.orm import Session

from database.sqlalchemy_models import Project, SubmissionFeedback


def _slugify(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug


def resolve_project_from_task_id(db: Session, task_id: str) -> Optional[Project]:
    """Unified function to resolve Project from task_id. Always use this instead of project_id."""
    if not task_id:
        return None
    normalized_task_id = _slugify(task_id)
    for project in db.query(Project).all():
        if _slugify(project.name) == normalized_task_id:
            return project
    return None


def normalize_project_files(raw_files: Any) -> List[Dict[str, Any]]:
    """
    Ensure project.files is a list of file configs.
    Handles None, JSON strings, or already-parsed lists.
    """
    if isinstance(raw_files, list):
        return raw_files
    if isinstance(raw_files, str):
        try:
            parsed = json.loads(raw_files)
            if isinstance(parsed, list):
                return parsed
            print(f"[tasks-db] Parsed project.files string but got {type(parsed)} instead of list")
        except Exception as exc:
            print(f"[tasks-db] Could not parse project.files JSON string: {exc}")
    return []


def slugify(name: str) -> str:
    """Public alias for _slugify for use by other routers."""
    return _slugify(name)


# Required file names by task label (UI contract for researchers).
WEB_DEV_FILES = {"index.html", "styles.css", "frontend.js"}
COMPLETION_FILES = {"solution.py", "solution.js"}
ALLOWED_LABELS = {"open-ended", "replication", "debug_function", "write_function", "web_tutorial", "function_tutorial"}


def validate_project_files_for_label(
    project_files: List[Dict[str, Any]],
    label: Optional[str],
) -> Tuple[bool, Optional[str]]:
    """
    Assert that task label is one of the supported types and that file names
    match the contract for that label.
    - open-ended / replication / web_tutorial: exactly index.html, styles.css, frontend.js.
    - debug_function / write_function / function_tutorial: exactly one file, solution.py or solution.js.
    Returns (ok, error_message). error_message is set when ok is False.
    """
    if not label or not str(label).strip():
        return False, (
            "Task label is required and must be one of: "
            "open-ended, replication, debug_function, write_function, web_tutorial, function_tutorial."
        )
    label_lower = label.strip().lower()
    if label_lower not in ALLOWED_LABELS:
        return False, (
            f"Task label must be one of: open-ended, replication, debug_function, write_function, web_tutorial, function_tutorial; got: {label!r}."
        )
    names = [str(f.get("name", "")).strip() for f in project_files if f.get("name")]

    if label_lower in ("open-ended", "replication", "web_tutorial"):
        name_set = set(names)
        if name_set != WEB_DEV_FILES:
            missing = WEB_DEV_FILES - name_set
            extra = name_set - WEB_DEV_FILES
            parts = []
            if missing:
                parts.append(f"missing: {sorted(missing)}")
            if extra:
                parts.append(f"unexpected: {sorted(extra)}")
            return False, (
                f"Tasks with label '{label}' must have exactly these three files: "
                f"index.html, styles.css, frontend.js. {'; '.join(parts)}."
            )
        return True, None

    if label_lower in ("debug_function", "write_function", "function_tutorial"):
        if len(names) != 1:
            return False, (
                f"Tasks with label '{label}' must have exactly one file "
                "(solution.py or solution.js)."
            )
        if names[0] not in COMPLETION_FILES:
            return False, (
                f"Tasks with label '{label}' must have solution.py or solution.js, "
                f"got: {names[0]}."
            )
        return True, None

    return True, None  # label_lower in ALLOWED_LABELS, so we've validated above


def build_rating_summary(feedback_entries: List[SubmissionFeedback]) -> Dict[str, Any]:
    """Build rating summary from submission feedback entries."""
    from collections import defaultdict

    if not feedback_entries:
        return {"average": None, "count": 0, "perMetric": {}}

    most_recent_by_voter: Dict[int, SubmissionFeedback] = {}
    for entry in feedback_entries:
        voter_id = entry.voter_id
        if voter_id not in most_recent_by_voter:
            most_recent_by_voter[voter_id] = entry

    per_metric_totals: Dict[str, float] = defaultdict(float)
    per_metric_counts: Dict[str, int] = defaultdict(int)
    averaged_scores_total = 0.0
    averaged_scores_count = 0

    for entry in most_recent_by_voter.values():
        scores = entry.scores or {}
        numeric_scores: List[float] = []
        for key, value in scores.items():
            try:
                score = float(value)
            except (TypeError, ValueError):
                continue
            numeric_scores.append(score)
            per_metric_totals[key] += score
            per_metric_counts[key] += 1

        if numeric_scores:
            averaged_scores_total += sum(numeric_scores) / len(numeric_scores)
            averaged_scores_count += 1

    average = (
        averaged_scores_total / averaged_scores_count if averaged_scores_count > 0 else None
    )
    per_metric_average = {
        key: (per_metric_totals[key] / per_metric_counts[key])
        for key in per_metric_totals.keys()
        if per_metric_counts[key] > 0
    }

    return {
        "average": round(average, 2) if average is not None else None,
        "count": averaged_scores_count,
        "perMetric": {key: round(value, 2) for key, value in per_metric_average.items()},
    }
