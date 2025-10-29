"""
Example usage of the database package.

This file demonstrates how to use the database models and CRUD operations.
"""

from database import (
    UserCreate, ProjectCreate, CodeCreate, SubmissionCreate, SubmissionFeedbackCreate,
    UserCRUD, ProjectCRUD, CodeCRUD, SubmissionCRUD, SubmissionFeedbackCRUD,
    get_db, create_tables
)


def example_usage():
    """Example of how to use the database"""
    
    # Create tables
    create_tables()
    
    # Get database session
    db = next(get_db())
    
    try:
        # Create a user
        user_data = UserCreate(
            username="john_doe",
            email="john@example.com",
            password="secure_password123",
            settings={"theme": "dark", "notifications": True}
        )
        user = UserCRUD.create(db, user_data)
        print(f"Created user: {user.username} with ID: {user.id}")
        
        # Create a project
        project_data = ProjectCreate(
            name="Tic Tac Toe Game",
            description="A simple tic tac toe game implementation",
            frontend_starter_file="// Basic HTML structure",
            html_starter_file="<div id='game'></div>",
            css_starter_file="body { font-family: Arial; }"
        )
        project = ProjectCRUD.create(db, project_data)
        print(f"Created project: {project.name} with ID: {project.id}")
        
        # Create code for the user and project
        code_data = CodeCreate(
            user_id=user.id,
            project_id=project.id,
            filename="game.js",
            code="function playGame() { console.log('Game started!'); }",
            has_issue=False
        )
        code = CodeCRUD.create(db, code_data)
        print(f"Created code file: {code.filename} with ID: {code.id}")
        
        # Create a submission
        submission_data = SubmissionCreate(
            user_id=user.id,
            project_id=project.id,
            name="My Tic Tac Toe Implementation",
            description="A complete tic tac toe game with AI opponent",
            frontend_file="// Complete game implementation",
            html_file="<div id='game'><div class='board'></div></div>",
            css_file=".board { display: grid; grid-template-columns: repeat(3, 1fr); }"
        )
        submission = SubmissionCRUD.create(db, submission_data)
        print(f"Created submission: {submission.name} with ID: {submission.id}")
        
        # Create feedback for the submission
        feedback_data = SubmissionFeedbackCreate(
            user_id=user.id,
            submission_id=submission.id,
            rating=4
        )
        feedback = SubmissionFeedbackCRUD.create(db, feedback_data)
        print(f"Created feedback with rating: {feedback.rating} and ID: {feedback.id}")
        
        # Retrieve data
        retrieved_user = UserCRUD.get_by_username(db, "john_doe")
        print(f"Retrieved user: {retrieved_user.username}")
        
        user_codes = CodeCRUD.get_by_user_and_project(db, user.id, project.id)
        print(f"User has {len(user_codes)} code files for this project")
        
        project_submissions = SubmissionCRUD.get_by_project(db, project.id)
        print(f"Project has {len(project_submissions)} submissions")
        
        submission_feedbacks = SubmissionFeedbackCRUD.get_by_submission(db, submission.id)
        print(f"Submission has {len(submission_feedbacks)} feedback entries")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    example_usage()
