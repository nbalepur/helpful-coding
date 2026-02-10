import argparse
import sys
from pathlib import Path


def _ensure_repo_on_path() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))


def main() -> int:
    parser = argparse.ArgumentParser(description="Create all database tables")
    parser.parse_args()

    _ensure_repo_on_path()
    from database.config import create_tables
    import database.sqlalchemy_models  # noqa: F401

    create_tables()
    print("✅ Database tables created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
