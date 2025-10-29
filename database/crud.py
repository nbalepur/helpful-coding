from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from .sqlalchemy_models import User, Project, Code, Submission, SubmissionFeedback
from .models import (
    UserCreate, UserUpdate, User as UserPydantic,
    ProjectCreate, ProjectUpdate, Project as ProjectPydantic,
    CodeCreate, CodeUpdate, Code as CodePydantic,
    SubmissionCreate, SubmissionUpdate, Submission as SubmissionPydantic,
    SubmissionFeedbackCreate, SubmissionFeedbackUpdate, SubmissionFeedback as SubmissionFeedbackPydantic
)


class UserCRUD:
    """CRUD operations for User"""
    
    @staticmethod
    def create(db: Session, user: UserCreate) -> User:
        """Create a new user"""
        db_user = User(
            username=user.username,
            email=user.email,
            password=user.password,  # Should be hashed before saving
            settings=user.settings
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    def get_by_id(db: Session, user_id: int) -> Optional[User]:
        """Get user by ID"""
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def get_by_username(db: Session, username: str) -> Optional[User]:
        """Get user by username"""
        return db.query(User).filter(User.username == username).first()

    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        """Get user by email"""
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
        """Get all users with pagination"""
        return db.query(User).offset(skip).limit(limit).all()

    @staticmethod
    def update(db: Session, user_id: int, user_update: UserUpdate) -> Optional[User]:
        """Update user"""
        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            return None
        
        update_data = user_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_user, field, value)
        
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    def delete(db: Session, user_id: int) -> bool:
        """Delete user"""
        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            return False
        
        db.delete(db_user)
        db.commit()
        return True


class ProjectCRUD:
    """CRUD operations for Project"""
    
    @staticmethod
    def create(db: Session, project: ProjectCreate) -> Project:
        """Create a new project"""
        db_project = Project(
            name=project.name,
            description=project.description,
            frontend_starter_file=project.frontend_starter_file,
            html_starter_file=project.html_starter_file,
            css_starter_file=project.css_starter_file
        )
        db.add(db_project)
        db.commit()
        db.refresh(db_project)
        return db_project

    @staticmethod
    def get_by_id(db: Session, project_id: int) -> Optional[Project]:
        """Get project by ID"""
        return db.query(Project).filter(Project.id == project_id).first()

    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[Project]:
        """Get all projects with pagination"""
        return db.query(Project).offset(skip).limit(limit).all()

    @staticmethod
    def update(db: Session, project_id: int, project_update: ProjectUpdate) -> Optional[Project]:
        """Update project"""
        db_project = db.query(Project).filter(Project.id == project_id).first()
        if not db_project:
            return None
        
        update_data = project_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_project, field, value)
        
        db.commit()
        db.refresh(db_project)
        return db_project

    @staticmethod
    def delete(db: Session, project_id: int) -> bool:
        """Delete project"""
        db_project = db.query(Project).filter(Project.id == project_id).first()
        if not db_project:
            return False
        
        db.delete(db_project)
        db.commit()
        return True


class CodeCRUD:
    """CRUD operations for Code"""
    
    @staticmethod
    def create(db: Session, code: CodeCreate) -> Code:
        """Create new code"""
        db_code = Code(
            user_id=code.user_id,
            project_id=code.project_id,
            filename=code.filename,
            code=code.code,
            has_issue=code.has_issue
        )
        db.add(db_code)
        db.commit()
        db.refresh(db_code)
        return db_code

    @staticmethod
    def get_by_id(db: Session, code_id: int) -> Optional[Code]:
        """Get code by ID"""
        return db.query(Code).filter(Code.id == code_id).first()

    @staticmethod
    def get_by_user_and_project(db: Session, user_id: int, project_id: int) -> List[Code]:
        """Get all code for a user and project"""
        return db.query(Code).filter(
            Code.user_id == user_id,
            Code.project_id == project_id
        ).all()

    @staticmethod
    def get_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[Code]:
        """Get all code for a user"""
        return db.query(Code).filter(Code.user_id == user_id).offset(skip).limit(limit).all()

    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[Code]:
        """Get all codes with pagination"""
        return db.query(Code).offset(skip).limit(limit).all()

    @staticmethod
    def update(db: Session, code_id: int, code_update: CodeUpdate) -> Optional[Code]:
        """Update code"""
        db_code = db.query(Code).filter(Code.id == code_id).first()
        if not db_code:
            return None
        
        update_data = code_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_code, field, value)
        
        db.commit()
        db.refresh(db_code)
        return db_code

    @staticmethod
    def delete(db: Session, code_id: int) -> bool:
        """Delete code"""
        db_code = db.query(Code).filter(Code.id == code_id).first()
        if not db_code:
            return False
        
        db.delete(db_code)
        db.commit()
        return True


class SubmissionCRUD:
    """CRUD operations for Submission"""
    
    @staticmethod
    def create(db: Session, submission: SubmissionCreate) -> Submission:
        """Create new submission"""
        db_submission = Submission(
            user_id=submission.user_id,
            project_id=submission.project_id,
            name=submission.name,
            description=submission.description,
            frontend_file=submission.frontend_file,
            html_file=submission.html_file,
            css_file=submission.css_file
        )
        db.add(db_submission)
        db.commit()
        db.refresh(db_submission)
        return db_submission

    @staticmethod
    def get_by_id(db: Session, submission_id: int) -> Optional[Submission]:
        """Get submission by ID"""
        return db.query(Submission).filter(Submission.id == submission_id).first()

    @staticmethod
    def get_by_user_and_project(db: Session, user_id: int, project_id: int) -> List[Submission]:
        """Get all submissions for a user and project"""
        return db.query(Submission).filter(
            Submission.user_id == user_id,
            Submission.project_id == project_id
        ).all()

    @staticmethod
    def get_by_project(db: Session, project_id: int, skip: int = 0, limit: int = 100) -> List[Submission]:
        """Get all submissions for a project"""
        return db.query(Submission).filter(Submission.project_id == project_id).offset(skip).limit(limit).all()

    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[Submission]:
        """Get all submissions with pagination"""
        return db.query(Submission).offset(skip).limit(limit).all()

    @staticmethod
    def update(db: Session, submission_id: int, submission_update: SubmissionUpdate) -> Optional[Submission]:
        """Update submission"""
        db_submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not db_submission:
            return None
        
        update_data = submission_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_submission, field, value)
        
        db.commit()
        db.refresh(db_submission)
        return db_submission

    @staticmethod
    def delete(db: Session, submission_id: int) -> bool:
        """Delete submission"""
        db_submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not db_submission:
            return False
        
        db.delete(db_submission)
        db.commit()
        return True


class SubmissionFeedbackCRUD:
    """CRUD operations for SubmissionFeedback"""
    
    @staticmethod
    def create(db: Session, feedback: SubmissionFeedbackCreate) -> SubmissionFeedback:
        """Create new submission feedback"""
        db_feedback = SubmissionFeedback(
            user_id=feedback.user_id,
            submission_id=feedback.submission_id,
            rating=feedback.rating
        )
        db.add(db_feedback)
        db.commit()
        db.refresh(db_feedback)
        return db_feedback

    @staticmethod
    def get_by_id(db: Session, feedback_id: int) -> Optional[SubmissionFeedback]:
        """Get submission feedback by ID"""
        return db.query(SubmissionFeedback).filter(SubmissionFeedback.id == feedback_id).first()

    @staticmethod
    def get_by_submission(db: Session, submission_id: int) -> List[SubmissionFeedback]:
        """Get all feedback for a submission"""
        return db.query(SubmissionFeedback).filter(SubmissionFeedback.submission_id == submission_id).all()

    @staticmethod
    def get_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[SubmissionFeedback]:
        """Get all feedback given by a user"""
        return db.query(SubmissionFeedback).filter(SubmissionFeedback.user_id == user_id).offset(skip).limit(limit).all()

    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[SubmissionFeedback]:
        """Get all submission feedbacks with pagination"""
        return db.query(SubmissionFeedback).offset(skip).limit(limit).all()

    @staticmethod
    def update(db: Session, feedback_id: int, feedback_update: SubmissionFeedbackUpdate) -> Optional[SubmissionFeedback]:
        """Update submission feedback"""
        db_feedback = db.query(SubmissionFeedback).filter(SubmissionFeedback.id == feedback_id).first()
        if not db_feedback:
            return None
        
        update_data = feedback_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_feedback, field, value)
        
        db.commit()
        db.refresh(db_feedback)
        return db_feedback

    @staticmethod
    def delete(db: Session, feedback_id: int) -> bool:
        """Delete submission feedback"""
        db_feedback = db.query(SubmissionFeedback).filter(SubmissionFeedback.id == feedback_id).first()
        if not db_feedback:
            return False
        
        db.delete(db_feedback)
        db.commit()
        return True


# Async versions of CRUD operations
class AsyncUserCRUD:
    """Async CRUD operations for User"""
    
    @staticmethod
    async def create(db: AsyncSession, user: UserCreate) -> User:
        """Create a new user"""
        db_user = User(
            username=user.username,
            email=user.email,
            password=user.password,  # Should be hashed before saving
            settings=user.settings
        )
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        return db_user

    @staticmethod
    async def get_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
        """Get user by ID"""
        result = await db.execute(select(User).filter(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_username(db: AsyncSession, username: str) -> Optional[User]:
        """Get user by username"""
        result = await db.execute(select(User).filter(User.username == username))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
        """Get user by email"""
        result = await db.execute(select(User).filter(User.email == email))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_all(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[User]:
        """Get all users with pagination"""
        result = await db.execute(select(User).offset(skip).limit(limit))
        return result.scalars().all()

    @staticmethod
    async def update(db: AsyncSession, user_id: int, user_update: UserUpdate) -> Optional[User]:
        """Update user"""
        db_user = await AsyncUserCRUD.get_by_id(db, user_id)
        if not db_user:
            return None
        
        update_data = user_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_user, field, value)
        
        await db.commit()
        await db.refresh(db_user)
        return db_user

    @staticmethod
    async def delete(db: AsyncSession, user_id: int) -> bool:
        """Delete user"""
        db_user = await AsyncUserCRUD.get_by_id(db, user_id)
        if not db_user:
            return False
        
        await db.delete(db_user)
        await db.commit()
        return True
