#!/usr/bin/env python3
"""
Load data from JSONL files into the database:
- data/code_data.jsonl -> code_data table
- data/experience_data.jsonl -> experience_data table
- data/mcqa_data.jsonl -> mcqa_data table
- data/nasa_tli_data.jsonl -> nasa_tli_data table
"""

import json
import os
from pathlib import Path
from typing import Dict, Any

import sys

# Ensure repository root on path so `database` can be imported
THIS_DIR = Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from database.config import SessionLocal, create_tables  # type: ignore
from database.sqlalchemy_models import CodeData, ExperienceData, MCQAData, NasaTLIData  # type: ignore


def load_code_data(db, data_path: Path) -> tuple[int, int]:
    """Load code_data.jsonl into code_data table. Returns (created, updated) counts."""
    if not data_path.exists():
        print(f"⚠️  Warning: {data_path} not found, skipping code data")
        return 0, 0

    created = 0
    updated = 0

    with open(data_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                data = json.loads(line)
                task_name = data.get("task_name")
                if task_name is None:
                    print(f"⚠️  Warning: Skipping line {line_num} - missing task_name")
                    continue

                # Check if entry with this task_name already exists
                existing = db.query(CodeData).filter(CodeData.task_name == task_name).first()

                code_data = {
                    "task_name": task_name,
                    "test_cases_py": data.get("test_cases_py", ""),
                    "test_cases_js": data.get("test_cases_js", ""),
                    "blank_code_py": data.get("blank_code_py", ""),
                    "blank_code_js": data.get("blank_code_js", ""),
                    "model_code_py": data.get("model_code_py", ""),
                    "model_code_js": data.get("model_code_js", ""),
                    "docstring_py": data.get("docstring_py"),
                    "docstring_js": data.get("docstring_js"),
                }

                if existing:
                    # Update existing entry
                    for key, value in code_data.items():
                        setattr(existing, key, value)
                    updated += 1
                else:
                    # Create new entry
                    db.add(CodeData(**code_data))
                    created += 1

            except json.JSONDecodeError as e:
                print(f"⚠️  Warning: Invalid JSON on line {line_num}: {e}")
                continue
            except Exception as e:
                print(f"⚠️  Warning: Error processing line {line_num}: {e}")
                continue

    return created, updated


def load_experience_data(db, data_path: Path) -> tuple[int, int]:
    """Load experience_data.jsonl into experience_data table. Returns (created, updated) counts."""
    if not data_path.exists():
        print(f"⚠️  Warning: {data_path} not found, skipping experience data")
        return 0, 0

    created = 0
    updated = 0

    with open(data_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                data = json.loads(line)
                question = data.get("question")
                if not question:
                    print(f"⚠️  Warning: Skipping line {line_num} - missing question")
                    continue

                # Check if entry with this question already exists
                existing = db.query(ExperienceData).filter(
                    ExperienceData.question == question
                ).first()

                exp_data = {
                    "question": question,
                    "choices": data.get("choices", []),
                    "type": data.get("type", ""),
                }

                if existing:
                    # Update existing entry
                    for key, value in exp_data.items():
                        setattr(existing, key, value)
                    updated += 1
                else:
                    # Create new entry
                    db.add(ExperienceData(**exp_data))
                    created += 1

            except json.JSONDecodeError as e:
                print(f"⚠️  Warning: Invalid JSON on line {line_num}: {e}")
                continue
            except Exception as e:
                print(f"⚠️  Warning: Error processing line {line_num}: {e}")
                continue

    return created, updated


def load_mcqa_data(db, data_path: Path) -> tuple[int, int]:
    """Load mcqa_data.jsonl into mcqa_data table. Returns (created, updated) counts."""
    if not data_path.exists():
        print(f"⚠️  Warning: {data_path} not found, skipping MCQA data")
        return 0, 0

    created = 0
    updated = 0

    with open(data_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                data = json.loads(line)
                question = data.get("question")
                if not question:
                    print(f"⚠️  Warning: Skipping line {line_num} - missing question")
                    continue
                
                name = data.get("name")
                if not name:
                    print(f"⚠️  Warning: Skipping line {line_num} - missing name")
                    continue

                # Check if entry with this name already exists
                existing = db.query(MCQAData).filter(
                    MCQAData.name == name
                ).first()

                mcqa_data = {
                    "name": name,
                    "question": question,
                    "choices": data.get("choices", []),
                    "answer": data.get("answer"),
                    "type": data.get("type", ""),
                }

                if existing:
                    # Update existing entry
                    for key, value in mcqa_data.items():
                        setattr(existing, key, value)
                    updated += 1
                else:
                    # Create new entry
                    db.add(MCQAData(**mcqa_data))
                    created += 1

            except json.JSONDecodeError as e:
                print(f"⚠️  Warning: Invalid JSON on line {line_num}: {e}")
                continue
            except Exception as e:
                print(f"⚠️  Warning: Error processing line {line_num}: {e}")
                continue

    return created, updated


def load_nasa_tli_data(db, data_path: Path) -> tuple[int, int]:
    """Load nasa_tli_data.jsonl into nasa_tli_data table. Returns (created, updated) counts."""
    if not data_path.exists():
        print(f"⚠️  Warning: {data_path} not found, skipping NASA TLI data")
        return 0, 0

    created = 0
    updated = 0

    with open(data_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                data = json.loads(line)
                question = data.get("question")
                if not question:
                    print(f"⚠️  Warning: Skipping line {line_num} - missing question")
                    continue

                # Check if entry with this question already exists
                existing = db.query(NasaTLIData).filter(
                    NasaTLIData.question == question
                ).first()

                nasa_tli_data = {
                    "question": question,
                    "choices": data.get("choices", []),
                    "type": data.get("type", ""),
                }

                if existing:
                    # Update existing entry
                    for key, value in nasa_tli_data.items():
                        setattr(existing, key, value)
                    updated += 1
                else:
                    # Create new entry
                    db.add(NasaTLIData(**nasa_tli_data))
                    created += 1

            except json.JSONDecodeError as e:
                print(f"⚠️  Warning: Invalid JSON on line {line_num}: {e}")
                continue
            except Exception as e:
                print(f"⚠️  Warning: Error processing line {line_num}: {e}")
                continue

    return created, updated


def main() -> int:
    """Main function to load all JSONL files"""
    # Ensure tables exist
    create_tables()

    data_dir = REPO_ROOT / "data"
    code_path = data_dir / "code_data.jsonl"
    experience_path = data_dir / "experience_data.jsonl"
    mcqa_path = data_dir / "mcqa_data.jsonl"
    nasa_tli_path = data_dir / "nasa_tli_data.jsonl"

    db = SessionLocal()
    try:
        # Load code data
        print("📝 Loading code_data.jsonl...")
        code_created, code_updated = load_code_data(db, code_path)
        print(f"   ✅ Code data: {code_created} created, {code_updated} updated")

        # Load experience data
        print("📝 Loading experience_data.jsonl...")
        exp_created, exp_updated = load_experience_data(db, experience_path)
        print(f"   ✅ Experience data: {exp_created} created, {exp_updated} updated")

        # Load MCQA data
        print("📝 Loading mcqa_data.jsonl...")
        mcqa_created, mcqa_updated = load_mcqa_data(db, mcqa_path)
        print(f"   ✅ MCQA data: {mcqa_created} created, {mcqa_updated} updated")

        # Load NASA TLI data
        print("📝 Loading nasa_tli_data.jsonl...")
        nasa_tli_created, nasa_tli_updated = load_nasa_tli_data(db, nasa_tli_path)
        print(f"   ✅ NASA TLI data: {nasa_tli_created} created, {nasa_tli_updated} updated")

        db.commit()

        # Print summary
        print("\n📊 Summary:")
        print(f"   Code data total: {db.query(CodeData).count()}")
        print(f"   Experience data total: {db.query(ExperienceData).count()}")
        print(f"   MCQA data total: {db.query(MCQAData).count()}")
        print(f"   NASA TLI data total: {db.query(NasaTLIData).count()}")

        return 0
    except Exception as e:
        db.rollback()
        print(f"❌ Error loading JSONL data: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

