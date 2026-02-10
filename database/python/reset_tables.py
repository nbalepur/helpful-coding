import argparse
import sys
from pathlib import Path


def _ensure_repo_on_path() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))


def main() -> int:
    parser = argparse.ArgumentParser(description="Drop and recreate all database tables")
    parser.parse_args()

    _ensure_repo_on_path()
    from sqlalchemy import MetaData, text
    from database.config import Base, engine
    import database.sqlalchemy_models  # noqa: F401

    # Drop everything in the current schema, not just known models.
    if engine.dialect.name == "postgresql":
        with engine.connect() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
            conn.commit()
    else:
        reflected = MetaData()
        reflected.reflect(bind=engine)
        reflected.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)
    print("✅ Database tables dropped and recreated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
