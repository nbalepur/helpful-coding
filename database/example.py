"""
Example usage of the database package.

This file demonstrates how to use the database models and CRUD operations.
"""

from database import (
    UserCreate, ProjectCreate, CodeCreate, SubmissionCreate,
    UserCRUD, ProjectCRUD, CodeCRUD, SubmissionCRUD,
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
            code={
                "html": "<div id='game'></div>",
                "css": "#game { width: 100%; }",
                "js": "function playGame() { console.log('Game started!'); }"
            },
            mode="regular",
            metadata={"description": "Sample tic tac toe implementation"}
        )
        code = CodeCRUD.create(db, code_data)
        print(f"Created code entry with mode '{code.mode}' and ID: {code.id}")
        
        # Create a submission
        submission_data = SubmissionCreate(
            user_id=user.id,
            project_id=project.id,
            code={
                "html": "<div id='game'><div class='board'></div></div>",
                "css": ".board { display: grid; grid-template-columns: repeat(3, 1fr); }",
                "js": "function playGame() { console.log('AI opponent engaged!'); }",
            },
            title="My Tic Tac Toe Implementation",
            description="A complete tic tac toe game with AI opponent",
            scores={"initial_run": {"passed": True, "score": 0.9}},
            image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"  # Example preview (truncated)
        )
        submission = SubmissionCRUD.create(db, submission_data)
        print(f"Created submission: {submission.title} with ID: {submission.id}")
        
        # Retrieve data
        retrieved_user = UserCRUD.get_by_username(db, "john_doe")
        print(f"Retrieved user: {retrieved_user.username}")
        
        user_codes = CodeCRUD.get_by_user_and_project(db, user.id, project.id)
        print(f"User has {len(user_codes)} code files for this project")
        
        project_submissions = SubmissionCRUD.get_by_project(db, project.id)
        print(f"Project has {len(project_submissions)} submissions")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    example_usage()
