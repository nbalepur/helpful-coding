from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from .sqlalchemy_models import User, Project, Code, Submission, SubmissionFeedback, CodePreference, AssistantLog, UserMCQASkillResponse, UserCodeSkillResponse, ReportSkillCheckQuestion, NavigationEvent
from .models import (
    UserCreate, UserUpdate, User as UserPydantic,
    ProjectCreate, ProjectUpdate, Project as ProjectPydantic,
    CodeCreate, CodeUpdate, Code as CodePydantic,
    SubmissionCreate, SubmissionUpdate, Submission as SubmissionPydantic,
    SubmissionFeedbackCreate, SubmissionFeedbackUpdate,
    CodePreferenceCreate, CodePreferenceUpdate, CodePreference as CodePreferencePydantic,
    AssistantLogCreate, AssistantLogUpdate, AssistantLog as AssistantLogPydantic,
    UserMCQASkillResponseCreate, UserMCQASkillResponseUpdate, UserMCQASkillResponse as UserMCQASkillResponsePydantic,
    UserCodeSkillResponseCreate, UserCodeSkillResponseUpdate, UserCodeSkillResponse as UserCodeSkillResponsePydantic,
    ReportSkillCheckQuestionCreate, ReportSkillCheckQuestionUpdate, ReportSkillCheckQuestion as ReportSkillCheckQuestionPydantic,
    NavigationEventCreate, NavigationEventUpdate, NavigationEvent as NavigationEventPydantic,
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
            files=project.files,
            code_start_date=project.code_start_date,
            voting_start_date=project.voting_start_date,
            voting_end_date=project.voting_end_date,
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
        if "frontend_starter_file" in update_data:
            update_data.pop("frontend_starter_file")
        if "html_starter_file" in update_data:
            update_data.pop("html_starter_file")
        if "css_starter_file" in update_data:
            update_data.pop("css_starter_file")
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
            code=code.code,
            mode=code.mode,
            code_metadata=code.metadata
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
    def get_latest_by_user_and_project(db: Session, user_id: int, project_id: int) -> Optional[Code]:
        """Get the most recent code for a user and project"""
        return db.query(Code).filter(
            Code.user_id == user_id,
            Code.project_id == project_id
        ).order_by(Code.created_at.desc()).first()

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
        if "metadata" in update_data:
            setattr(db_code, "code_metadata", update_data.pop("metadata"))
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
            code=submission.code,
            title=submission.title,
            description=submission.description,
            image=submission.image,
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
        db_feedback = SubmissionFeedback(
            submission_id=feedback.submission_id,
            project_id=feedback.project_id,
            voter_id=feedback.voter_id,
            scores=feedback.scores,
            is_reported=feedback.is_reported,
            is_saved=feedback.is_saved,
            comment=feedback.comment,
            report_type=feedback.report_type,
            report_rationale=feedback.report_rationale,
        )
        db.add(db_feedback)
        db.commit()
        db.refresh(db_feedback)
        return db_feedback

    @staticmethod
    def get_by_id(db: Session, feedback_id: int) -> Optional[SubmissionFeedback]:
        return db.query(SubmissionFeedback).filter(SubmissionFeedback.id == feedback_id).first()

    @staticmethod
    def get_by_project(db: Session, project_id: int, skip: int = 0, limit: int = 100) -> List[SubmissionFeedback]:
        return (
            db.query(SubmissionFeedback)
            .filter(SubmissionFeedback.project_id == project_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_by_voter(db: Session, voter_id: int, skip: int = 0, limit: int = 100) -> List[SubmissionFeedback]:
        """Get all feedback entries for a voter, ordered by most recent first"""
        return (
            db.query(SubmissionFeedback)
            .filter(SubmissionFeedback.voter_id == voter_id)
            .order_by(SubmissionFeedback.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_by_submission_and_voter(db: Session, submission_id: int, voter_id: int) -> Optional[SubmissionFeedback]:
        """Get the most recent feedback for a submission and voter"""
        return (
            db.query(SubmissionFeedback)
            .filter(
                SubmissionFeedback.submission_id == submission_id,
                SubmissionFeedback.voter_id == voter_id,
            )
            .order_by(SubmissionFeedback.created_at.desc())
            .first()
        )

    @staticmethod
    def upsert(
        db: Session,
        submission_id: int,
        voter_id: int,
        project_id: int,
        scores: Dict[str, int],
        comment: Optional[str],
        is_saved: Optional[bool] = None,
        is_reported: Optional[bool] = None,
    ) -> SubmissionFeedback:
        existing = SubmissionFeedbackCRUD.get_by_submission_and_voter(db, submission_id, voter_id)
        timestamp = datetime.utcnow()
        if existing:
            # Only update scores and comment if they're provided (non-empty)
            if scores:
                existing.scores = scores
            if comment is not None:
                existing.comment = comment
            if is_saved is not None:
                existing.is_saved = is_saved
            if is_reported is not None:
                existing.is_reported = is_reported
            existing.updated_at = timestamp
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return existing

        feedback_create = SubmissionFeedbackCreate(
            submission_id=submission_id,
            project_id=project_id,
            voter_id=voter_id,
            scores=scores,
            is_reported=is_reported if is_reported is not None else False,
            is_saved=is_saved if is_saved is not None else False,
            comment=comment,
        )
        created = SubmissionFeedbackCRUD.create(db, feedback_create)
        created.updated_at = timestamp
        db.add(created)
        db.commit()
        db.refresh(created)
        return created

    @staticmethod
    def update(db: Session, feedback_id: int, feedback_update: SubmissionFeedbackUpdate) -> Optional[SubmissionFeedback]:
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
        db_feedback = db.query(SubmissionFeedback).filter(SubmissionFeedback.id == feedback_id).first()
        if not db_feedback:
            return False

        db.delete(db_feedback)
        db.commit()
        return True


class CodePreferenceCRUD:
    """CRUD operations for CodePreference"""

    @staticmethod
    def create(db: Session, preference: CodePreferenceCreate) -> CodePreference:
        """Create a new code preference"""
        db_preference = CodePreference(
            suggestion_id=preference.suggestion_id,
            suggestions=preference.suggestions,
            project_id=preference.project_id,
            user_id=preference.user_id,
            user_selection=preference.user_selection,
        )
        db.add(db_preference)
        db.commit()
        db.refresh(db_preference)
        return db_preference

    @staticmethod
    def get_by_id(db: Session, preference_id: int) -> Optional[CodePreference]:
        """Get code preference by ID"""
        return db.query(CodePreference).filter(CodePreference.id == preference_id).first()

    @staticmethod
    def get_by_suggestion_id(db: Session, suggestion_id: str) -> List[CodePreference]:
        """Get code preferences by suggestion identifier"""
        return db.query(CodePreference).filter(CodePreference.suggestion_id == suggestion_id).all()

    @staticmethod
    def get_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[CodePreference]:
        """Get code preferences for a user"""
        return (
            db.query(CodePreference)
            .filter(CodePreference.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[CodePreference]:
        """Get all code preferences with pagination"""
        return db.query(CodePreference).offset(skip).limit(limit).all()

    @staticmethod
    def get_by_signature(
        db: Session,
        *,
        suggestion_id: str,
        project_id: int,
        user_id: Optional[int],
    ) -> Optional[CodePreference]:
        """Get the most recent code preference by unique signature"""
        query = db.query(CodePreference).filter(
            CodePreference.suggestion_id == suggestion_id,
            CodePreference.project_id == project_id,
        )
        if user_id is None:
            query = query.filter(CodePreference.user_id.is_(None))
        else:
            query = query.filter(CodePreference.user_id == user_id)

        return query.order_by(CodePreference.created_at.desc()).first()

    @staticmethod
    def get_by_project(db: Session, project_id: int, skip: int = 0, limit: int = 100) -> List[CodePreference]:
        """Get code preferences for a project"""
        return (
            db.query(CodePreference)
            .filter(CodePreference.project_id == project_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def update(
        db: Session, preference_id: int, preference_update: CodePreferenceUpdate
    ) -> Optional[CodePreference]:
        """Update code preference"""
        db_preference = (
            db.query(CodePreference).filter(CodePreference.id == preference_id).first()
        )
        if not db_preference:
            return None

        update_data = preference_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_preference, field, value)

        db.commit()
        db.refresh(db_preference)
        return db_preference

    @staticmethod
    def delete(db: Session, preference_id: int) -> bool:
        """Delete code preference"""
        db_preference = (
            db.query(CodePreference).filter(CodePreference.id == preference_id).first()
        )
        if not db_preference:
            return False

        db.delete(db_preference)
        db.commit()
        return True


class AssistantLogCRUD:
    """CRUD operations for AssistantLog"""

    @staticmethod
    def create(db: Session, log: AssistantLogCreate) -> AssistantLog:
        db_log = AssistantLog(
            user_id=log.user_id,
            project_id=log.project_id,
            query=log.query,
            generated_code=log.generated_code,
            summary=log.summary,
            suggestions=log.suggestions,
        )
        db.add(db_log)
        db.commit()
        db.refresh(db_log)
        return db_log

    @staticmethod
    def update(db: Session, log_id: int, log_update: AssistantLogUpdate) -> Optional[AssistantLog]:
        db_log = db.query(AssistantLog).filter(AssistantLog.id == log_id).first()
        if not db_log:
            return None

        update_data = log_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_log, field, value)

        db.commit()
        db.refresh(db_log)
        return db_log

    @staticmethod
    def get_by_id(db: Session, log_id: int) -> Optional[AssistantLog]:
        return db.query(AssistantLog).filter(AssistantLog.id == log_id).first()

    @staticmethod
    def list_for_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[AssistantLog]:
        return (
            db.query(AssistantLog)
            .filter(AssistantLog.user_id == user_id)
            .order_by(AssistantLog.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def list_for_project(db: Session, project_id: int, skip: int = 0, limit: int = 100) -> List[AssistantLog]:
        return (
            db.query(AssistantLog)
            .filter(AssistantLog.project_id == project_id)
            .order_by(AssistantLog.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )


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


class UserMCQASkillResponseCRUD:
    """CRUD operations for UserMCQASkillResponse"""
    
    @staticmethod
    def create(db: Session, response: UserMCQASkillResponseCreate) -> UserMCQASkillResponse:
        """Create a new user MCQA skill response"""
        db_response = UserMCQASkillResponse(
            user_id=response.user_id,
            question_id=response.question_id,
            question_type=response.question_type,
            phase=response.phase,
            answer_text=response.answer_text,
            answer_letter=response.answer_letter,
            gold_answer_text=response.gold_answer_text,
            gold_answer_letter=response.gold_answer_letter,
            correct=response.correct,
        )
        db.add(db_response)
        db.commit()
        db.refresh(db_response)
        return db_response

    @staticmethod
    def get_by_id(db: Session, response_id: int) -> Optional[UserMCQASkillResponse]:
        """Get response by ID"""
        return db.query(UserMCQASkillResponse).filter(UserMCQASkillResponse.id == response_id).first()

    @staticmethod
    def get_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[UserMCQASkillResponse]:
        """Get all responses for a user"""
        return (
            db.query(UserMCQASkillResponse)
            .filter(UserMCQASkillResponse.user_id == user_id)
            .order_by(UserMCQASkillResponse.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_by_user_and_question(db: Session, user_id: int, question_id: str) -> List[UserMCQASkillResponse]:
        """Get all responses for a user and question"""
        return (
            db.query(UserMCQASkillResponse)
            .filter(
                UserMCQASkillResponse.user_id == user_id,
                UserMCQASkillResponse.question_id == question_id
            )
            .order_by(UserMCQASkillResponse.created_at.desc())
            .all()
        )

    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[UserMCQASkillResponse]:
        """Get all responses with pagination"""
        return (
            db.query(UserMCQASkillResponse)
            .order_by(UserMCQASkillResponse.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def update(db: Session, response_id: int, response_update: UserMCQASkillResponseUpdate) -> Optional[UserMCQASkillResponse]:
        """Update response"""
        db_response = db.query(UserMCQASkillResponse).filter(UserMCQASkillResponse.id == response_id).first()
        if not db_response:
            return None
        
        update_data = response_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_response, field, value)
        
        db.commit()
        db.refresh(db_response)
        return db_response

    @staticmethod
    def delete(db: Session, response_id: int) -> bool:
        """Delete response"""
        db_response = db.query(UserMCQASkillResponse).filter(UserMCQASkillResponse.id == response_id).first()
        if not db_response:
            return False
        
        db.delete(db_response)
        db.commit()
        return True


class UserCodeSkillResponseCRUD:
    """CRUD operations for UserCodeSkillResponse"""
    
    @staticmethod
    def create(db: Session, response: UserCodeSkillResponseCreate) -> UserCodeSkillResponse:
        """Create a new user code skill response"""
        db_response = UserCodeSkillResponse(
            user_id=response.user_id,
            question_id=response.question_id,
            question_type=response.question_type,
            phase=response.phase,
            py_code=response.py_code,
            js_code=response.js_code,
            submitted_language=response.submitted_language,
            state=response.state,
        )
        db.add(db_response)
        db.commit()
        db.refresh(db_response)
        return db_response

    @staticmethod
    def get_by_id(db: Session, response_id: int) -> Optional[UserCodeSkillResponse]:
        """Get response by ID"""
        return db.query(UserCodeSkillResponse).filter(UserCodeSkillResponse.id == response_id).first()

    @staticmethod
    def get_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[UserCodeSkillResponse]:
        """Get all responses for a user"""
        return (
            db.query(UserCodeSkillResponse)
            .filter(UserCodeSkillResponse.user_id == user_id)
            .order_by(UserCodeSkillResponse.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_by_user_and_question(db: Session, user_id: int, question_id: str) -> List[UserCodeSkillResponse]:
        """Get all responses for a user and question"""
        return (
            db.query(UserCodeSkillResponse)
            .filter(
                UserCodeSkillResponse.user_id == user_id,
                UserCodeSkillResponse.question_id == question_id
            )
            .order_by(UserCodeSkillResponse.created_at.desc())
            .all()
        )

    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[UserCodeSkillResponse]:
        """Get all responses with pagination"""
        return (
            db.query(UserCodeSkillResponse)
            .order_by(UserCodeSkillResponse.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def update(db: Session, response_id: int, response_update: UserCodeSkillResponseUpdate) -> Optional[UserCodeSkillResponse]:
        """Update response"""
        db_response = db.query(UserCodeSkillResponse).filter(UserCodeSkillResponse.id == response_id).first()
        if not db_response:
            return None
        
        update_data = response_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_response, field, value)
        
        db.commit()
        db.refresh(db_response)
        return db_response

    @staticmethod
    def delete(db: Session, response_id: int) -> bool:
        """Delete response"""
        db_response = db.query(UserCodeSkillResponse).filter(UserCodeSkillResponse.id == response_id).first()
        if not db_response:
            return False
        
        db.delete(db_response)
        db.commit()
        return True


class ReportSkillCheckQuestionCRUD:
    """CRUD operations for ReportSkillCheckQuestion"""
    
    @staticmethod
    def create(db: Session, report: ReportSkillCheckQuestionCreate) -> ReportSkillCheckQuestion:
        """Create a new report"""
        db_report = ReportSkillCheckQuestion(
            user_id=report.user_id,
            question_id=report.question_id,
            question_type=report.question_type,
            phase=report.phase,
            report_type=report.report_type,
            rationale=report.rationale,
        )
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
        return db_report
    
    @staticmethod
    def get_by_id(db: Session, report_id: int) -> Optional[ReportSkillCheckQuestion]:
        """Get report by ID"""
        return db.query(ReportSkillCheckQuestion).filter(ReportSkillCheckQuestion.id == report_id).first()
    
    @staticmethod
    def get_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[ReportSkillCheckQuestion]:
        """Get all reports by user"""
        return (
            db.query(ReportSkillCheckQuestion)
            .filter(ReportSkillCheckQuestion.user_id == user_id)
            .order_by(ReportSkillCheckQuestion.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    @staticmethod
    def get_by_question(db: Session, question_id: str, skip: int = 0, limit: int = 100) -> List[ReportSkillCheckQuestion]:
        """Get all reports for a specific question"""
        return (
            db.query(ReportSkillCheckQuestion)
            .filter(ReportSkillCheckQuestion.question_id == question_id)
            .order_by(ReportSkillCheckQuestion.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[ReportSkillCheckQuestion]:
        """Get all reports"""
        return (
            db.query(ReportSkillCheckQuestion)
            .order_by(ReportSkillCheckQuestion.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    @staticmethod
    def update(db: Session, report_id: int, report_update: ReportSkillCheckQuestionUpdate) -> Optional[ReportSkillCheckQuestion]:
        """Update report"""
        db_report = db.query(ReportSkillCheckQuestion).filter(ReportSkillCheckQuestion.id == report_id).first()
        if not db_report:
            return None
        
        update_data = report_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_report, key, value)
        
        db.commit()
        db.refresh(db_report)
        return db_report
    
    @staticmethod
    def delete(db: Session, report_id: int) -> bool:
        """Delete report"""
        db_report = db.query(ReportSkillCheckQuestion).filter(ReportSkillCheckQuestion.id == report_id).first()
        if not db_report:
            return False
        
        db.delete(db_report)
        db.commit()
        return True


class NavigationEventCRUD:
    """CRUD operations for NavigationEvent"""
    
    @staticmethod
    def create(db: Session, event: NavigationEventCreate) -> NavigationEvent:
        """Create a new navigation event"""
        db_event = NavigationEvent(
            user_id=event.user_id,
            question_id=event.question_id,
            test_type=event.test_type,
            time_away_ms=event.time_away_ms,
        )
        db.add(db_event)
        db.commit()
        db.refresh(db_event)
        return db_event
    
    @staticmethod
    def get_by_id(db: Session, event_id: int) -> Optional[NavigationEvent]:
        """Get navigation event by ID"""
        return db.query(NavigationEvent).filter(NavigationEvent.id == event_id).first()
    
    @staticmethod
    def get_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[NavigationEvent]:
        """Get all navigation events for a user"""
        return (
            db.query(NavigationEvent)
            .filter(NavigationEvent.user_id == user_id)
            .order_by(NavigationEvent.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    @staticmethod
    def get_by_user_and_test_type(db: Session, user_id: int, test_type: str, skip: int = 0, limit: int = 100) -> List[NavigationEvent]:
        """Get all navigation events for a user and test type"""
        return (
            db.query(NavigationEvent)
            .filter(
                NavigationEvent.user_id == user_id,
                NavigationEvent.test_type == test_type
            )
            .order_by(NavigationEvent.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[NavigationEvent]:
        """Get all navigation events with pagination"""
        return (
            db.query(NavigationEvent)
            .order_by(NavigationEvent.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
