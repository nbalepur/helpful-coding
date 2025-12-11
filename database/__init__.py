"""
Database package for Helpful Coding application.

This package provides:
- Pydantic models for data validation and serialization
- SQLAlchemy models for database operations
- CRUD operations for all entities
- Database configuration and connection management
"""

from .models import (
    # User models
    UserBase, UserCreate, UserUpdate, User, UserResponse,
    
    # Project models
    ProjectBase, ProjectCreate, ProjectUpdate, Project, ProjectResponse,
    
    # Code models
    CodeBase, CodeCreate, CodeUpdate, Code, CodeResponse,

    # CodePreference models
    CodePreferenceBase, CodePreferenceCreate, CodePreferenceUpdate, CodePreference, CodePreferenceResponse,
    
    # Submission models
    SubmissionBase, SubmissionCreate, SubmissionUpdate, Submission, SubmissionResponse,
    
    # Assistant log models
    AssistantLogBase, AssistantLogCreate, AssistantLogUpdate, AssistantLog, AssistantLogResponse,
)

from .sqlalchemy_models import (
    User as UserDB,
    Project as ProjectDB,
    Code as CodeDB,
    Submission as SubmissionDB,
    CodePreference as CodePreferenceDB,
    AssistantLog as AssistantLogDB,
)

from .config import (
    engine, async_engine, SessionLocal, AsyncSessionLocal, Base, metadata,
    get_db, get_async_db, create_tables, create_tables_async
)

from .crud import (
    UserCRUD,
    ProjectCRUD,
    CodeCRUD,
    SubmissionCRUD,
    CodePreferenceCRUD,
    AssistantLogCRUD,
    AsyncUserCRUD
)

__all__ = [
    # Pydantic models
    "UserBase", "UserCreate", "UserUpdate", "User", "UserResponse",
    "ProjectBase", "ProjectCreate", "ProjectUpdate", "Project", "ProjectResponse",
    "CodeBase", "CodeCreate", "CodeUpdate", "Code", "CodeResponse",
    "CodePreferenceBase", "CodePreferenceCreate", "CodePreferenceUpdate", "CodePreference", "CodePreferenceResponse",
    "SubmissionBase", "SubmissionCreate", "SubmissionUpdate", "Submission", "SubmissionResponse",
    "AssistantLogBase", "AssistantLogCreate", "AssistantLogUpdate", "AssistantLog", "AssistantLogResponse",
    
    # SQLAlchemy models 
    "UserDB", "ProjectDB", "CodeDB", "SubmissionDB", "CodePreferenceDB", "AssistantLogDB",
    
    # Database configuration
    "engine", "async_engine", "SessionLocal", "AsyncSessionLocal", "Base", "metadata",
    "get_db", "get_async_db", "create_tables", "create_tables_async",
    
    # CRUD operations
    "UserCRUD", "ProjectCRUD", "CodeCRUD", "SubmissionCRUD", "CodePreferenceCRUD", "AssistantLogCRUD",
    "AsyncUserCRUD"
]
