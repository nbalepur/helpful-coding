#!/usr/bin/env python3
"""
Database download/export script.
"""

import sys
import os
import json
import csv
from pathlib import Path
from datetime import datetime

# Add the parent directory to the path so we can import from database
sys.path.append(str(Path(__file__).parent.parent))

# Import from the parent directory
import config
import crud
import sqlalchemy_models
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def export_to_json(output_file):
    """Export all data to JSON file"""
    try:
        db = next(config.get_db())
        
        # Get all data
        users = crud.UserCRUD.get_all(db)
        projects = crud.ProjectCRUD.get_all(db)
        codes = crud.CodeCRUD.get_all(db)
        submissions = crud.SubmissionCRUD.get_all(db)
        
        # Convert to dictionaries
        data = {
            "export_timestamp": datetime.utcnow().isoformat(),
            "users": [user.__dict__ for user in users],
            "projects": [project.__dict__ for project in projects],
            "codes": [code.__dict__ for code in codes],
            "submissions": [submission.__dict__ for submission in submissions],
        }
        
        # Remove SQLAlchemy internal attributes
        for table_name in ["users", "projects", "codes", "submissions"]:
            for item in data[table_name]:
                if "_sa_instance_state" in item:
                    del item["_sa_instance_state"]
        
        # Write to file
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        
        logger.info(f"✅ Data exported to {output_file}")
        logger.info(f"Exported {len(users)} users, {len(projects)} projects, {len(codes)} codes, {len(submissions)} submissions")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error exporting to JSON: {e}")
        return False
    finally:
        db.close()


def export_to_csv(output_dir):
    """Export each table to separate CSV files"""
    try:
        db = next(config.get_db())
        
        # Create output directory
        Path(output_dir).mkdir(exist_ok=True)
        
        # Export users
        users = crud.UserCRUD.get_all(db)
        if users:
            with open(f"{output_dir}/users.csv", 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['id', 'username', 'email', 'settings', 'created_at', 'updated_at'])
                for user in users:
                    writer.writerow([user.id, user.username, user.email, json.dumps(user.settings), user.created_at, user.updated_at])
            logger.info(f"✅ Users exported to {output_dir}/users.csv")
        
        # Export projects
        projects = crud.ProjectCRUD.get_all(db)
        if projects:
            with open(f"{output_dir}/projects.csv", 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['id', 'name', 'description', 'frontend_starter_file', 'html_starter_file', 'css_starter_file', 'created_at', 'updated_at'])
                for project in projects:
                    writer.writerow([project.id, project.name, project.description, project.frontend_starter_file, project.html_starter_file, project.css_starter_file, project.created_at, project.updated_at])
            logger.info(f"✅ Projects exported to {output_dir}/projects.csv")
        
        # Export codes
        codes = crud.CodeCRUD.get_all(db)
        if codes:
            with open(f"{output_dir}/codes.csv", 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['id', 'user_id', 'project_id', 'code', 'mode', 'metadata', 'created_at', 'updated_at'])
                for code in codes:
                    writer.writerow([
                        code.id,
                        code.user_id,
                        code.project_id,
                        json.dumps(code.code),
                        code.mode,
                        json.dumps(code.code_metadata) if code.code_metadata is not None else None,
                        code.created_at,
                        code.updated_at
                    ])
            logger.info(f"✅ Codes exported to {output_dir}/codes.csv")
        
        # Export submissions
        submissions = crud.SubmissionCRUD.get_all(db)
        if submissions:
            with open(f"{output_dir}/submissions.csv", 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['id', 'user_id', 'project_id', 'title', 'description', 'code', 'scores', 'image', 'created_at', 'updated_at'])
                for submission in submissions:
                    writer.writerow([
                        submission.id,
                        submission.user_id,
                        submission.project_id,
                        submission.title,
                        submission.description,
                        json.dumps(submission.code),
                        json.dumps(submission.scores) if submission.scores is not None else None,
                        submission.image,
                        submission.created_at,
                        submission.updated_at
                    ])
            logger.info(f"✅ Submissions exported to {output_dir}/submissions.csv")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error exporting to CSV: {e}")
        return False
    finally:
        db.close()


def show_database_stats():
    """Show database statistics"""
    try:
        db = next(config.get_db())
        
        users_count = len(crud.UserCRUD.get_all(db))
        projects_count = len(crud.ProjectCRUD.get_all(db))
        codes_count = len(crud.CodeCRUD.get_all(db))
        submissions_count = len(crud.SubmissionCRUD.get_all(db))
        
        logger.info("📊 Database Statistics:")
        logger.info(f"  Users: {users_count}")
        logger.info(f"  Projects: {projects_count}")
        logger.info(f"  Code files: {codes_count}")
        logger.info(f"  Submissions: {submissions_count}")
        logger.info(f"  Total records: {users_count + projects_count + codes_count + submissions_count}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error getting database stats: {e}")
        return False
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        logger.info("Usage: python download.py <command> [output_file/dir]")
        logger.info("Commands:")
        logger.info("  json [file]             - Export to JSON file (default: data_export.json)")
        logger.info("  csv [dir]               - Export to CSV files (default: data_export/)")
        logger.info("  stats                   - Show database statistics")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "json":
        output_file = sys.argv[2] if len(sys.argv) > 2 else "data_export.json"
        success = export_to_json(output_file)
    elif command == "csv":
        output_dir = sys.argv[2] if len(sys.argv) > 2 else "data_export"
        success = export_to_csv(output_dir)
    elif command == "stats":
        success = show_database_stats()
    else:
        logger.error(f"Unknown command: {command}")
        sys.exit(1)
    
    if success:
        logger.info("Download operation completed successfully!")
        sys.exit(0)
    else:
        logger.error("Download operation failed!")
        sys.exit(1)
