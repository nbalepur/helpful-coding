#!/usr/bin/env python3
"""
Database migration script using Alembic.
"""

import sys
import os
import subprocess
from pathlib import Path

# Add the parent directory to the path so we can import from database
sys.path.append(str(Path(__file__).parent.parent))

import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def run_alembic_command(command):
    """Run an alembic command"""
    try:
        result = subprocess.run(
            ["alembic"] + command.split(),
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent
        )
        
        if result.returncode == 0:
            logger.info(f"✅ Alembic command '{command}' completed successfully!")
            if result.stdout:
                logger.info(f"Output: {result.stdout}")
            return True
        else:
            logger.error(f"❌ Alembic command '{command}' failed!")
            logger.error(f"Error: {result.stderr}")
            return False
    except FileNotFoundError:
        logger.error("❌ Alembic not found. Please install alembic: pip install alembic")
        return False
    except Exception as e:
        logger.error(f"❌ Error running alembic command: {e}")
        return False


def init_alembic():
    """Initialize alembic if not already initialized"""
    alembic_dir = Path(__file__).parent.parent / "alembic"
    if not alembic_dir.exists():
        logger.info("Initializing Alembic...")
        return run_alembic_command("init alembic")
    else:
        logger.info("Alembic already initialized.")
        return True


def create_migration(message="Auto migration"):
    """Create a new migration"""
    logger.info(f"Creating migration: {message}")
    return run_alembic_command(f'revision --autogenerate -m "{message}"')


def apply_migrations():
    """Apply all pending migrations"""
    logger.info("Applying migrations...")
    return run_alembic_command("upgrade head")


def show_migration_history():
    """Show migration history"""
    logger.info("Migration history:")
    return run_alembic_command("history")


def show_current_revision():
    """Show current database revision"""
    logger.info("Current database revision:")
    return run_alembic_command("current")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        logger.info("Usage: python migrate.py <command> [message]")
        logger.info("Commands:")
        logger.info("  init                    - Initialize alembic")
        logger.info("  create [message]        - Create new migration")
        logger.info("  apply                   - Apply all migrations")
        logger.info("  history                 - Show migration history")
        logger.info("  current                 - Show current revision")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "init":
        success = init_alembic()
    elif command == "create":
        message = sys.argv[2] if len(sys.argv) > 2 else "Auto migration"
        success = create_migration(message)
    elif command == "apply":
        success = apply_migrations()
    elif command == "history":
        success = show_migration_history()
    elif command == "current":
        success = show_current_revision()
    else:
        logger.error(f"Unknown command: {command}")
        sys.exit(1)
    
    if success:
        logger.info("Migration operation completed successfully!")
        sys.exit(0)
    else:
        logger.error("Migration operation failed!")
        sys.exit(1)
