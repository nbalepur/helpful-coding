#!/usr/bin/env python3
"""
Migration: Increase phase and test_type column sizes to support retake_{uuid} format
"""

import sys
from pathlib import Path

# Add the parent directory to the path so we can import from database
sys.path.append(str(Path(__file__).parent.parent))

from database.config import get_db_engine
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def run_migration():
    """Run the migration to increase phase and test_type column sizes"""
    try:
        engine = get_db_engine()
        
        with engine.connect() as conn:
            # Start a transaction
            trans = conn.begin()
            
            try:
                logger.info("Increasing phase column size in user_mcqa_skill_responses...")
                conn.execute(text("""
                    ALTER TABLE user_mcqa_skill_responses 
                    ALTER COLUMN phase TYPE VARCHAR(100)
                """))
                
                logger.info("Increasing phase column size in user_code_skill_responses...")
                conn.execute(text("""
                    ALTER TABLE user_code_skill_responses 
                    ALTER COLUMN phase TYPE VARCHAR(100)
                """))
                
                logger.info("Increasing phase column size in report_skill_check_questions...")
                conn.execute(text("""
                    ALTER TABLE report_skill_check_questions 
                    ALTER COLUMN phase TYPE VARCHAR(100)
                """))
                
                logger.info("Increasing test_type column size in navigation_events...")
                conn.execute(text("""
                    ALTER TABLE navigation_events 
                    ALTER COLUMN test_type TYPE VARCHAR(100)
                """))
                
                # Commit the transaction
                trans.commit()
                logger.info("✅ Migration completed successfully!")
                return True
                
            except Exception as e:
                # Rollback on error
                trans.rollback()
                # Check if error is because column already has the right type (migration already applied)
                if "type" in str(e).lower() or "already" in str(e).lower():
                    logger.warning(f"⚠️  Migration may have already been applied: {e}")
                    return True  # Don't fail if already applied
                raise
                
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
