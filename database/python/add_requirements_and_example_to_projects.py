#!/usr/bin/env python3
"""
Migration: Add requirements and example columns to projects table.
"""

import sys
from pathlib import Path

# Add the parent directory to the path so we can import from database
sys.path.append(str(Path(__file__).parent.parent))

from database.config import get_db_engine
from sqlalchemy import inspect, text
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def run_migration():
    """Add requirements/example columns if they do not exist."""
    try:
        engine = get_db_engine()
        inspector = inspect(engine)

        if "projects" not in inspector.get_table_names():
            logger.warning("⚠️  projects table not found; skipping migration")
            return True

        existing_columns = {col["name"] for col in inspector.get_columns("projects")}

        with engine.connect() as conn:
            trans = conn.begin()
            try:
                if "requirements" not in existing_columns:
                    logger.info("Adding projects.requirements column...")
                    conn.execute(text("ALTER TABLE projects ADD COLUMN requirements JSON"))
                else:
                    logger.info("projects.requirements already exists")

                if "example" not in existing_columns:
                    logger.info("Adding projects.example column...")
                    conn.execute(text("ALTER TABLE projects ADD COLUMN example TEXT"))
                else:
                    logger.info("projects.example already exists")

                trans.commit()
                logger.info("✅ Migration completed successfully!")
                return True
            except Exception as exc:
                trans.rollback()
                logger.error(f"❌ Migration failed while applying statements: {exc}")
                return False
    except Exception as exc:
        logger.error(f"❌ Migration failed: {exc}")
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
