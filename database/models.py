from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum


class UserBase(BaseModel):
    """Base model for User with common fields"""
    username: str = Field(..., min_length=3, max_length=50, description="Username")
    email: EmailStr = Field(..., description="User email address")
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict, description="User settings as JSON")


class UserCreate(UserBase):
    """Model for creating a new user"""
    password: str = Field(..., min_length=8, description="User password")


class UserUpdate(BaseModel):
    """Model for updating user information"""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
    settings: Optional[Dict[str, Any]] = None


class User(UserBase):
    """Complete User model"""
    id: int = Field(..., description="User ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    """Base model for Project with common fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Project name")
    description: Optional[str] = Field(None, max_length=1000, description="Project description")
    frontend_starter_file: Optional[str] = Field(None, description="Frontend starter file content")
    html_starter_file: Optional[str] = Field(None, description="HTML starter file content")
    css_starter_file: Optional[str] = Field(None, description="CSS starter file content")


class ProjectCreate(ProjectBase):
    """Model for creating a new project"""
    pass


class ProjectUpdate(BaseModel):
    """Model for updating project information"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    frontend_starter_file: Optional[str] = None
    html_starter_file: Optional[str] = None
    css_starter_file: Optional[str] = None


class Project(ProjectBase):
    """Complete Project model"""
    id: int = Field(..., description="Project ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CodeBase(BaseModel):
    """Base model for Code with common fields"""
    filename: str = Field(..., min_length=1, max_length=255, description="Code filename")
    code: str = Field(..., description="Code content")
    has_issue: bool = Field(default=False, description="Whether the code has issues")


class CodeCreate(CodeBase):
    """Model for creating new code"""
    user_id: int = Field(..., description="User ID who owns this code")
    project_id: int = Field(..., description="Project ID this code belongs to")


class CodeUpdate(BaseModel):
    """Model for updating code"""
    filename: Optional[str] = Field(None, min_length=1, max_length=255)
    code: Optional[str] = None
    has_issue: Optional[bool] = None


class Code(CodeBase):
    """Complete Code model"""
    id: int = Field(..., description="Code ID")
    user_id: int = Field(..., description="User ID who owns this code")
    project_id: int = Field(..., description="Project ID this code belongs to")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubmissionBase(BaseModel):
    """Base model for Submission with common fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Submission name")
    description: Optional[str] = Field(None, max_length=1000, description="Submission description")
    frontend_file: Optional[str] = Field(None, description="Frontend file content")
    html_file: Optional[str] = Field(None, description="HTML file content")
    css_file: Optional[str] = Field(None, description="CSS file content")


class SubmissionCreate(SubmissionBase):
    """Model for creating a new submission"""
    user_id: int = Field(..., description="User ID who made this submission")
    project_id: int = Field(..., description="Project ID this submission belongs to")


class SubmissionUpdate(BaseModel):
    """Model for updating submission"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    frontend_file: Optional[str] = None
    html_file: Optional[str] = None
    css_file: Optional[str] = None


class Submission(SubmissionBase):
    """Complete Submission model"""
    id: int = Field(..., description="Submission ID")
    user_id: int = Field(..., description="User ID who made this submission")
    project_id: int = Field(..., description="Project ID this submission belongs to")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubmissionFeedbackBase(BaseModel):
    """Base model for SubmissionFeedback with common fields"""
    rating: int = Field(..., ge=1, le=5, description="Rating from 1 to 5")


class SubmissionFeedbackCreate(SubmissionFeedbackBase):
    """Model for creating new submission feedback"""
    user_id: int = Field(..., description="User ID who gave this feedback")
    submission_id: int = Field(..., description="Submission ID this feedback is for")


class SubmissionFeedbackUpdate(BaseModel):
    """Model for updating submission feedback"""
    rating: Optional[int] = Field(None, ge=1, le=5)


class SubmissionFeedback(SubmissionFeedbackBase):
    """Complete SubmissionFeedback model"""
    id: int = Field(..., description="Feedback ID")
    user_id: int = Field(..., description="User ID who gave this feedback")
    submission_id: int = Field(..., description="Submission ID this feedback is for")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Response models for API endpoints
class UserResponse(User):
    """User response model (excludes password)"""
    pass


class ProjectResponse(Project):
    """Project response model"""
    pass


class CodeResponse(Code):
    """Code response model"""
    pass


class SubmissionResponse(Submission):
    """Submission response model"""
    pass


class SubmissionFeedbackResponse(SubmissionFeedback):
    """Submission feedback response model"""
    pass


# Password Reset Models
class PasswordResetRequest(BaseModel):
    """Model for requesting password reset"""
    username_or_email: str = Field(..., description="Username or email address")


class PasswordResetConfirm(BaseModel):
    """Model for confirming password reset"""
    token: str = Field(..., description="Password reset token")
    new_password: str = Field(..., min_length=8, description="New password")


class PasswordResetTokenBase(BaseModel):
    """Base model for PasswordResetToken with common fields"""
    user_id: int = Field(..., description="User ID")
    token: str = Field(..., description="Reset token")
    expires_at: datetime = Field(..., description="Token expiration time")
    used: bool = Field(default=False, description="Whether token has been used")


class PasswordResetTokenCreate(PasswordResetTokenBase):
    """Model for creating a password reset token"""
    pass


class PasswordResetToken(PasswordResetTokenBase):
    """Complete PasswordResetToken model"""
    id: int = Field(..., description="Token ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class PasswordResetTokenResponse(PasswordResetToken):
    """Password reset token response model"""
    pass


# Models with relationships for detailed responses
class CodeWithUser(BaseModel):
    """Code model with user information"""
    id: int
    filename: str
    code: str
    has_issue: bool
    user_id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime]
    user: UserResponse

    class Config:
        from_attributes = True


class SubmissionWithUser(BaseModel):
    """Submission model with user information"""
    id: int
    name: str
    description: Optional[str]
    frontend_file: Optional[str]
    html_file: Optional[str]
    css_file: Optional[str]
    user_id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime]
    user: UserResponse

    class Config:
        from_attributes = True


class SubmissionFeedbackWithUser(BaseModel):
    """Submission feedback model with user information"""
    id: int
    rating: int
    user_id: int
    submission_id: int
    created_at: datetime
    updated_at: Optional[datetime]
    user: UserResponse

    class Config:
        from_attributes = True
