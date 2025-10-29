#!/usr/bin/env python3
"""
Database management script for creating tables.
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


if __name__ == "__main__":
    logger.info("Starting database table creation...")
    
    # Check database connection first
    if not check_database_connection():
        sys.exit(1)
    
    # Create tables
    if create_database_tables():
        logger.info("Database setup completed successfully!")
        sys.exit(0)
    else:
        logger.error("Database setup failed!")
        sys.exit(1)
