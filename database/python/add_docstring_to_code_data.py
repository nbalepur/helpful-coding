#!/usr/bin/env python3
"""
Migration script to add docstring_py and docstring_js columns to code_data table.
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
    """Add docstring_py and docstring_js columns to code_data table"""
    try:
        logger.info("Starting migration: Adding docstring_py and docstring_js columns to code_data table...")
        
        with config.engine.connect() as conn:
            # Check if table exists first
            if 'postgresql' in str(config.engine.url).lower():
                # Check if table exists
                table_check = text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'code_data'
                    )
                """)
                table_exists = conn.execute(table_check).scalar()
                
                if not table_exists:
                    logger.info("Table code_data does not exist. It will be created with all columns when tables are created.")
                    return True
                
                # Check if columns already exist
                check_query = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'code_data' 
                    AND column_name IN ('docstring_py', 'docstring_js')
                """)
                existing_columns = {row[0] for row in conn.execute(check_query).fetchall()}
                
                if 'docstring_py' in existing_columns and 'docstring_js' in existing_columns:
                    logger.info("⚠️  docstring_py and docstring_js columns already exist, skipping...")
                    return True
                
                # Add missing columns
                if 'docstring_py' not in existing_columns:
                    logger.info("Adding docstring_py column...")
                    conn.execute(text("ALTER TABLE code_data ADD COLUMN IF NOT EXISTS docstring_py TEXT"))
                    conn.commit()
                    logger.info("✅ Added docstring_py column")
                
                if 'docstring_js' not in existing_columns:
                    logger.info("Adding docstring_js column...")
                    conn.execute(text("ALTER TABLE code_data ADD COLUMN IF NOT EXISTS docstring_js TEXT"))
                    conn.commit()
                    logger.info("✅ Added docstring_js column")
            
            # SQLite support
            elif 'sqlite' in str(config.engine.url).lower():
                # Check if table exists
                table_check = text("""
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='code_data'
                """)
                table_exists = conn.execute(table_check).fetchone()
                
                if not table_exists:
                    logger.info("Table code_data does not exist. It will be created with all columns when tables are created.")
                    return True
                
                # Check if columns exist by trying to query them
                try:
                    # Try to query the columns to see if they exist
                    conn.execute(text("SELECT docstring_py, docstring_js FROM code_data LIMIT 1"))
                    logger.info("⚠️  docstring_py and docstring_js columns already exist, skipping...")
                    return True
                except Exception:
                    # Columns don't exist, add them
                    pass
                
                # Add columns
                try:
                    logger.info("Adding docstring_py column...")
                    conn.execute(text("ALTER TABLE code_data ADD COLUMN docstring_py TEXT"))
                    conn.commit()
                    logger.info("✅ Added docstring_py column")
                except Exception as e:
                    if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                        logger.info("⚠️  docstring_py column already exists, skipping...")
                    else:
                        raise
                
                try:
                    logger.info("Adding docstring_js column...")
                    conn.execute(text("ALTER TABLE code_data ADD COLUMN docstring_js TEXT"))
                    conn.commit()
                    logger.info("✅ Added docstring_js column")
                except Exception as e:
                    if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                        logger.info("⚠️  docstring_js column already exists, skipping...")
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
    logger.info("Running migration to add docstring columns to code_data table...")
    
    if run_migration():
        logger.info("Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("Migration failed!")
        sys.exit(1)

