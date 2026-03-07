#!/usr/bin/env python3
"""
Migration: Add disqualification-related columns to submissions table.
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from database.config import get_db_engine
from sqlalchemy import inspect, text
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def run_migration():
    """Add disqualification fields to submissions if they do not already exist."""
    try:
        engine = get_db_engine()
        inspector = inspect(engine)

        if "submissions" not in inspector.get_table_names():
            logger.warning("⚠️  submissions table not found; skipping migration")
            return True

        existing_columns = {col["name"] for col in inspector.get_columns("submissions")}

        with engine.connect() as conn:
            trans = conn.begin()
            try:
                if "is_forced_timeout_submission" not in existing_columns:
                    logger.info("Adding submissions.is_forced_timeout_submission column...")
                    conn.execute(
                        text(
                            "ALTER TABLE submissions "
                            "ADD COLUMN is_forced_timeout_submission BOOLEAN NOT NULL DEFAULT FALSE"
                        )
                    )

                if "is_disqualified" not in existing_columns:
                    logger.info("Adding submissions.is_disqualified column...")
                    conn.execute(
                        text(
                            "ALTER TABLE submissions "
                            "ADD COLUMN is_disqualified BOOLEAN NOT NULL DEFAULT FALSE"
                        )
                    )

                if "disqualification_reason" not in existing_columns:
                    logger.info("Adding submissions.disqualification_reason column...")
                    conn.execute(
                        text(
                            "ALTER TABLE submissions "
                            "ADD COLUMN disqualification_reason VARCHAR(100)"
                        )
                    )

                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_submissions_is_forced_timeout_submission "
                        "ON submissions(is_forced_timeout_submission)"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_submissions_is_disqualified "
                        "ON submissions(is_disqualified)"
                    )
                )

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
