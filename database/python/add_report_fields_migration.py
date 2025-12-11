#!/usr/bin/env python3
"""
Migration script to add report_type and report_rationale columns to submission_feedback table.
Run this script to update your database schema.
"""

import sys
import os
from pathlib import Path

# Add the repository root to sys.path so we can import the package 'database'
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from database import config
from sqlalchemy import text
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def run_migration():
    """Add report_type and report_rationale columns to submission_feedback table"""
    try:
        logger.info("Starting migration: Adding report_type and report_rationale columns...")
        
        with config.engine.connect() as conn:
            # Check if columns already exist (PostgreSQL)
            if 'postgresql' in str(config.engine.url).lower():
                check_query = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'submission_feedback' 
                    AND column_name IN ('report_type', 'report_rationale')
                """)
                existing = conn.execute(check_query).fetchall()
                existing_columns = [row[0] for row in existing]
                
                if 'report_type' not in existing_columns:
                    logger.info("Adding report_type column...")
                    conn.execute(text("ALTER TABLE submission_feedback ADD COLUMN report_type VARCHAR(100)"))
                    conn.commit()
                    logger.info("✅ Added report_type column")
                else:
                    logger.info("⚠️  report_type column already exists, skipping...")
                
                if 'report_rationale' not in existing_columns:
                    logger.info("Adding report_rationale column...")
                    conn.execute(text("ALTER TABLE submission_feedback ADD COLUMN report_rationale TEXT"))
                    conn.commit()
                    logger.info("✅ Added report_rationale column")
                else:
                    logger.info("⚠️  report_rationale column already exists, skipping...")
            
            # SQLite support
            elif 'sqlite' in str(config.engine.url).lower():
                # SQLite doesn't support IF NOT EXISTS in ALTER TABLE ADD COLUMN
                # So we'll try to add and catch the error if it exists
                try:
                    logger.info("Adding report_type column...")
                    conn.execute(text("ALTER TABLE submission_feedback ADD COLUMN report_type VARCHAR(100)"))
                    conn.commit()
                    logger.info("✅ Added report_type column")
                except Exception as e:
                    if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                        logger.info("⚠️  report_type column already exists, skipping...")
                    else:
                        raise
                
                try:
                    logger.info("Adding report_rationale column...")
                    conn.execute(text("ALTER TABLE submission_feedback ADD COLUMN report_rationale TEXT"))
                    conn.commit()
                    logger.info("✅ Added report_rationale column")
                except Exception as e:
                    if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                        logger.info("⚠️  report_rationale column already exists, skipping...")
                    else:
                        raise
            
            logger.info("✅ Migration completed successfully!")
            return True
            
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    logger.info("Running migration to add report fields to submission_feedback table...")
    
    if run_migration():
        logger.info("Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("Migration failed!")
        sys.exit(1)

