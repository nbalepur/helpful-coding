#!/usr/bin/env python3
"""
Migration script to add question column to comprehension_questions table.
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
    """Add question column to comprehension_questions table"""
    try:
        logger.info("Starting migration: Adding question column to comprehension_questions table...")
        
        with config.engine.connect() as conn:
            # Check if table exists first
            if 'postgresql' in str(config.engine.url).lower():
                # Check if table exists
                table_check = text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'comprehension_questions'
                    )
                """)
                table_exists = conn.execute(table_check).scalar()
                
                if not table_exists:
                    logger.info("Table comprehension_questions does not exist. Creating it with all columns...")
                    # Create the table with all columns including question
                    create_table = text("""
                        CREATE TABLE comprehension_questions (
                            id SERIAL PRIMARY KEY,
                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                            question_name VARCHAR(255) NOT NULL,
                            question TEXT NOT NULL,
                            question_type VARCHAR(50) NOT NULL CHECK (question_type IN ('mcqa', 'multi_select', 'free_response')),
                            choices JSONB,
                            answer TEXT,
                            user_answer TEXT,
                            score FLOAT CHECK (score >= 0.0 AND score <= 1.0),
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP WITH TIME ZONE
                        )
                    """)
                    conn.execute(create_table)
                    conn.commit()
                    
                    # Create indexes
                    indexes = [
                        "CREATE INDEX IF NOT EXISTS idx_comprehension_questions_user_id ON comprehension_questions(user_id)",
                        "CREATE INDEX IF NOT EXISTS idx_comprehension_questions_project_id ON comprehension_questions(project_id)",
                        "CREATE INDEX IF NOT EXISTS idx_comprehension_questions_user_project ON comprehension_questions(user_id, project_id)"
                    ]
                    for idx_sql in indexes:
                        conn.execute(text(idx_sql))
                    conn.commit()
                    logger.info("✅ Created comprehension_questions table with question column")
                    return True
                
                # Check if column already exists
                check_query = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'comprehension_questions' 
                    AND column_name = 'question'
                """)
                column_exists = conn.execute(check_query).fetchone()
                
                if column_exists:
                    logger.info("⚠️  question column already exists, skipping...")
                    return True
                
                logger.info("Adding question column...")
                # Add the column as NOT NULL, but we need to handle existing rows
                # First add it as nullable, then update existing rows, then make it NOT NULL
                conn.execute(text("ALTER TABLE comprehension_questions ADD COLUMN question TEXT"))
                conn.commit()
                logger.info("✅ Added question column (nullable)")
                
                # Update existing rows to have a default question
                conn.execute(text("UPDATE comprehension_questions SET question = question_name WHERE question IS NULL"))
                conn.commit()
                logger.info("✅ Updated existing rows with default question values")
                
                # Now make it NOT NULL
                conn.execute(text("ALTER TABLE comprehension_questions ALTER COLUMN question SET NOT NULL"))
                conn.commit()
                logger.info("✅ Set question column to NOT NULL")
            
            # SQLite support
            elif 'sqlite' in str(config.engine.url).lower():
                # Check if table exists
                table_check = text("""
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='comprehension_questions'
                """)
                table_exists = conn.execute(table_check).fetchone()
                
                if not table_exists:
                    logger.info("Table comprehension_questions does not exist. Creating it with all columns...")
                    # SQLite doesn't support all PostgreSQL features, so we'll create a simpler version
                    create_table = text("""
                        CREATE TABLE comprehension_questions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            project_id INTEGER NOT NULL,
                            question_name VARCHAR(255) NOT NULL,
                            question TEXT NOT NULL,
                            question_type VARCHAR(50) NOT NULL,
                            choices TEXT,
                            answer TEXT,
                            user_answer TEXT,
                            score REAL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                        )
                    """)
                    conn.execute(create_table)
                    conn.commit()
                    logger.info("✅ Created comprehension_questions table with question column")
                    return True
                
                # Check if column exists
                try:
                    conn.execute(text("ALTER TABLE comprehension_questions ADD COLUMN question TEXT"))
                    conn.commit()
                    logger.info("✅ Added question column")
                    
                    # Update existing rows
                    conn.execute(text("UPDATE comprehension_questions SET question = question_name WHERE question IS NULL"))
                    conn.commit()
                    logger.info("✅ Updated existing rows with default question values")
                except Exception as e:
                    if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                        logger.info("⚠️  question column already exists, skipping...")
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
    logger.info("Running migration to add question column to comprehension_questions table...")
    
    if run_migration():
        logger.info("Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("Migration failed!")
        sys.exit(1)

