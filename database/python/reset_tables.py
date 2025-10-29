#!/usr/bin/env python3
"""
Database reset script - drops and recreates all tables.
"""

import sys
import os
from pathlib import Path

# Add the parent directory to the path so we can import from database
sys.path.append(str(Path(__file__).parent.parent))

# Import from the parent directory
import config
import sqlalchemy_models
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def reset_database():
    """Drop all tables and recreate them"""
    try:
        logger.info("Dropping all database tables...")
        
        # Drop all tables
        sqlalchemy_models.Base.metadata.drop_all(bind=config.engine)
        logger.info("✅ All tables dropped successfully!")
        
        logger.info("Creating fresh database tables...")
        sqlalchemy_models.Base.metadata.create_all(bind=config.engine)
        logger.info("✅ All tables created successfully!")
        
        return True
    except Exception as e:
        logger.error(f"❌ Error resetting database: {e}")
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


if __name__ == "__main__":
    logger.info("Starting database reset...")
    
    # Check database connection first
    if not check_database_connection():
        sys.exit(1)
    
    # Reset database
    if reset_database():
        logger.info("Database reset completed successfully!")
        sys.exit(0)
    else:
        logger.error("Database reset failed!")
        sys.exit(1)
