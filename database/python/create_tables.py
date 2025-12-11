#!/usr/bin/env python3
"""
Database management script for creating tables.
"""

import sys
import os
from pathlib import Path

# Add the repository root to sys.path so we can import the package 'database'
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

# Import via the package to enable relative imports inside modules
from database import config, sqlalchemy_models
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def create_database_tables():
    """Create all database tables"""
    try:
        logger.info("Creating database tables...")
        config.create_tables()
        logger.info("✅ Database tables created successfully!")
        return True
    except Exception as e:
        logger.error(f"❌ Error creating tables: {e}")
        return False


def check_database_connection():
    """Check if database connection is working"""
    try:
        with config.engine.connect() as conn:
            logger.info("✅ Database connection successful!")
            return True
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        return False


def run_post_creation_migrations():
    """Run migrations that need to happen after table creation"""
    try:
        import importlib.util
        
        # List of migrations to run in order
        migrations = [
            "add_question_to_comprehension_questions.py",
            "add_docstring_to_code_data.py",
        ]
        
        logger.info("Running post-creation migrations...")
        for migration_file in migrations:
            migration_path = Path(__file__).parent / migration_file
            if migration_path.exists():
                try:
                    spec = importlib.util.spec_from_file_location(
                        migration_file.replace(".py", "_migration"), 
                        migration_path
                    )
                    migration_module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(migration_module)
                    
                    if hasattr(migration_module, 'run_migration'):
                        if migration_module.run_migration():
                            logger.info(f"✅ {migration_file} completed successfully!")
                        else:
                            logger.warning(f"⚠️  {migration_file} may have failed (may be expected if already applied)")
                    else:
                        logger.warning(f"⚠️  {migration_file} does not have run_migration function")
                except Exception as e:
                    logger.warning(f"⚠️  Error running {migration_file} (may be expected if already applied): {e}")
            else:
                logger.warning(f"⚠️  Migration script {migration_file} not found, skipping")
        
        logger.info("✅ Post-creation migrations completed!")
        return True
    except Exception as e:
        logger.warning(f"⚠️  Migration error (may be expected if already applied): {e}")
        return True  # Don't fail if migration already applied


if __name__ == "__main__":
    logger.info("Starting database table creation...")
    
    # Check database connection first
    if not check_database_connection():
        sys.exit(1)
    
    # Create tables
    if create_database_tables():
        # Run post-creation migrations
        run_post_creation_migrations()
        logger.info("Database setup completed successfully!")
        sys.exit(0)
    else:
        logger.error("Database setup failed!")
        sys.exit(1)
