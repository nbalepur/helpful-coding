from pydantic import BaseModel, Field, EmailStr, AliasChoices
from typing import Optional, Dict, Any, List, Union
from datetime import datetime


class UserBase(BaseModel):
    """Base model for User with common fields"""
    username: str = Field(..., min_length=3, max_length=50, description="Username")
    email: EmailStr = Field(..., description="User email address")
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict, description="User settings as JSON")
    can_view_submissions: bool = Field(default=False, description="Whether the user can view community submissions")


class UserCreate(UserBase):
    """Model for creating a new user"""
    password: str = Field(..., min_length=8, description="User password")


class UserUpdate(BaseModel):
    """Model for updating user information"""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
    settings: Optional[Dict[str, Any]] = None
    can_view_submissions: Optional[bool] = None


class User(UserBase):
    """Complete User model"""
    id: int = Field(..., description="User ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CodePreferenceBase(BaseModel):
    """Base model for code preferences"""
    suggestion_id: str = Field(..., description="Identifier for a set of code suggestions")
    suggestions: List[str] = Field(..., description="List of code suggestions")
    project_id: int = Field(..., description="Project ID these suggestions belong to")
    user_id: Optional[int] = Field(None, description="User ID who provided feedback")
    user_selection: Optional[str] = Field(None, description="Identifier of the suggestion selected by the user")


class CodePreferenceCreate(CodePreferenceBase):
    """Model for creating a code preference"""
    pass


class CodePreferenceUpdate(BaseModel):
    """Model for updating a code preference"""
    suggestion_id: Optional[str] = Field(None, description="Identifier for a set of code suggestions")
    suggestions: Optional[List[str]] = Field(None, description="List of code suggestions")
    project_id: Optional[int] = Field(None, description="Project ID these suggestions belong to")
    user_id: Optional[int] = Field(None, description="User ID who provided feedback")
    user_selection: Optional[str] = Field(None, description="Identifier of the suggestion selected by the user")


class CodePreference(CodePreferenceBase):
    """Complete code preference model"""
    id: int = Field(..., description="Code preference ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CodePreferenceResponse(CodePreference):
    """Code preference response model"""
    pass

class ProjectBase(BaseModel):
    """Base model for Project with common fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Project name")
    title: Optional[str] = Field(None, max_length=255, description="Project title")
    label: Optional[str] = Field(None, max_length=255, description="Project label (e.g., 'open-ended', 'replication')")
    description: Optional[str] = Field(None, max_length=1000, description="Project description")
    frontend_starter_file: Optional[str] = Field(None, description="Frontend starter file content")
    html_starter_file: Optional[str] = Field(None, description="HTML starter file content")
    css_starter_file: Optional[str] = Field(None, description="CSS starter file content")
    files: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Raw file descriptors for project files",
    )
    examples: Optional[str] = Field(None, description="HTML or plain text examples for task instructions")
    test_cases: Optional[List[Dict[str, Any]]] = Field(None, description="Test case definitions for completion tasks")


class ProjectCreate(ProjectBase):
    """Model for creating a new project"""
    pass


class ProjectUpdate(BaseModel):
    """Model for updating project information"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    title: Optional[str] = Field(None, max_length=255)
    label: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    frontend_starter_file: Optional[str] = None
    html_starter_file: Optional[str] = None
    css_starter_file: Optional[str] = None
    files: Optional[List[Dict[str, Any]]] = None
    examples: Optional[str] = None
    test_cases: Optional[List[Dict[str, Any]]] = None


class Project(ProjectBase):
    """Complete Project model"""
    id: int = Field(..., description="Project ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CodeBase(BaseModel):
    """Base model for Code with common fields"""
    code: Dict[str, str] = Field(
        ...,
        description="Code content organized by language",
        example={"html": "<html></html>", "css": "body {}", "js": "console.log('hello')"}
    )
    mode: str = Field(..., description="Code mode ('regular', 'diff', 'AI_generated', 'AI', 'keep', 'reject', 'keep_all', or 'reject_all')")
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Code metadata",
        validation_alias=AliasChoices("code_metadata", "metadata")
    )


class CodeCreate(CodeBase):
    """Model for creating new code"""
    user_id: int = Field(..., description="User ID who owns this code")
    project_id: int = Field(..., description="Project ID this code belongs to")


class CodeUpdate(BaseModel):
    """Model for updating code"""
    code: Optional[Dict[str, str]] = None
    mode: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        validation_alias=AliasChoices("code_metadata", "metadata")
    )


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
    code: Dict[str, Any] = Field(..., description="Submitted code organized by file or language")
    title: str = Field(..., min_length=1, max_length=255, description="Submission title")
    description: Optional[str] = Field(None, max_length=2000, description="Submission description")
    image: Optional[str] = Field(None, description="Preview image (URL, data URI, or encoded binary)")


class SubmissionCreate(SubmissionBase):
    """Model for creating a new submission"""
    user_id: int = Field(..., description="User ID who made this submission")
    project_id: int = Field(..., description="Project ID this submission belongs to")


class SubmissionUpdate(BaseModel):
    """Model for updating submission"""
    code: Optional[Dict[str, Any]] = None
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    image: Optional[str] = None


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
    """Base model for submission feedback"""
    submission_id: int = Field(..., description="Submission ID this feedback is associated with")
    project_id: int = Field(..., description="Project ID this feedback is associated with")
    voter_id: int = Field(..., description="User ID of the voter providing feedback")
    scores: Dict[str, Any] = Field(default_factory=dict, description="Feedback scores keyed by metric")
    is_reported: bool = Field(default=False, description="Whether the feedback has been reported")
    is_saved: bool = Field(default=False, description="Whether the submission has been saved by the voter")
    comment: Optional[str] = Field(None, max_length=2000, description="Optional feedback comment")
    report_type: Optional[str] = Field(None, description="Type of report: 'offensive', 'cheating', 'broken', 'bright_harsh', 'other'")
    report_rationale: Optional[str] = Field(None, description="User's rationale for reporting the submission")


class SubmissionFeedbackCreate(SubmissionFeedbackBase):
    """Model for creating new submission feedback"""
    pass


class SubmissionFeedbackUpdate(BaseModel):
    """Model for updating submission feedback"""
    submission_id: Optional[int] = None
    project_id: Optional[int] = None
    voter_id: Optional[int] = None
    scores: Optional[Dict[str, Any]] = None
    is_reported: Optional[bool] = None
    is_saved: Optional[bool] = None
    comment: Optional[str] = Field(None, max_length=2000)
    report_type: Optional[str] = None
    report_rationale: Optional[str] = None


class SubmissionFeedback(SubmissionFeedbackBase):
    """Complete submission feedback model"""
    id: int = Field(..., description="Submission feedback ID")
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


class AssistantLogBase(BaseModel):
    """Base model for assistant logs"""
    user_id: int = Field(..., description="User ID associated with the log entry")
    project_id: int = Field(..., description="Project ID associated with the log entry")
    query: Optional[str] = Field(None, description="Original user query or prompt")
    trace: List[Dict[str, Any]] = Field(
        ...,
        description="Full list of streamed events (text, tool_call, suggestions) sent to the frontend"
    )
    summary: str = Field(..., description="Summary of the assistant interaction")
    suggestions: List[str] = Field(
        default_factory=list,
        description="List of suggestions provided by the assistant"
    )


class AssistantLogCreate(AssistantLogBase):
    """Model for creating a new assistant log entry"""
    pass


class AssistantLogUpdate(BaseModel):
    """Model for updating an assistant log entry"""
    user_id: Optional[int] = None
    project_id: Optional[int] = None
    query: Optional[str] = None
    trace: Optional[List[Dict[str, Any]]] = None
    summary: Optional[str] = None
    suggestions: Optional[List[str]] = None


class AssistantLog(AssistantLogBase):
    """Complete assistant log model"""
    id: int = Field(..., description="Assistant log ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AssistantLogResponse(AssistantLog):
    """Assistant log response model"""
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


class SubmissionQuestionBase(BaseModel):
    """Base model for submission questions"""
    user_id: int = Field(..., description="User ID")
    project_id: int = Field(..., description="Project ID")
    question_name: str = Field(..., description="Name/identifier for the question")
    question: str = Field(..., description="The actual question text/stem")
    question_type: str = Field(..., description="Type of question: 'mcqa', 'multi_select', or 'free_response'")
    choices: Optional[List[str]] = Field(None, description="Array of choices for mcqa/multi_select questions")
    answer: Optional[str] = Field(None, description="Correct answer (for scoring)")
    user_answer: Optional[str] = Field(None, description="User's answer")
    score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Score from 0.0 to 1.0")


class SubmissionQuestionCreate(SubmissionQuestionBase):
    """Model for creating a submission question"""
    pass


class SubmissionQuestionUpdate(BaseModel):
    """Model for updating a submission question"""
    question_name: Optional[str] = None
    question: Optional[str] = None
    question_type: Optional[str] = None
    choices: Optional[List[str]] = None
    answer: Optional[str] = None
    user_answer: Optional[str] = None
    score: Optional[float] = Field(None, ge=0.0, le=1.0)


class SubmissionQuestion(SubmissionQuestionBase):
    """Complete submission question model"""
    id: int = Field(..., description="Question ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubmissionQuestionResponse(SubmissionQuestion):
    """Submission question response model"""
    pass


class GenerateSubmissionQuestionsRequest(BaseModel):
    """Request model for generating submission questions"""
    user_id: int = Field(..., description="User ID")
    project_id: int = Field(..., description="Project ID")
    submission_title: str = Field(..., description="Submission title")
    submission_description: str = Field(..., description="Submission description")
    submission_code: Dict[str, str] = Field(..., description="Submission code as key-value pairs")


class SaveTutorialSubmissionQuestionsRequest(BaseModel):
    """Request model for saving tutorial submission questions and answers"""
    user_id: int = Field(..., description="User ID")
    questions: List[Dict[str, Any]] = Field(..., description="List of question objects with id, question_name, question, question_type, choices, answer")
    answers: Dict[str, Any] = Field(..., description="Dictionary mapping question_name to user answer")


class EvaluateSubmissionRequest(BaseModel):
    """Request model for evaluating a submission"""
    user_id: int = Field(..., description="User ID")
    project_id: int = Field(..., description="Project ID")
    submission_title: str = Field(..., description="Submission title")
    submission_description: str = Field(..., description="Submission description")
    submission_code: Dict[str, str] = Field(..., description="Submission code as key-value pairs")


# ---------------------------------------------------------------------------
# API request models (from backend routers and agent)
# ---------------------------------------------------------------------------

class ModerationCheckRequest(BaseModel):
    """Request model for moderation check (title, description, image)"""
    title: str
    description: Optional[str] = None
    image: Optional[str] = None

    class Config:
        populate_by_name = True


class SubmissionRequest(BaseModel):
    """Request model for creating a submission"""
    user_id: int = Field(..., alias="userId", validation_alias=AliasChoices("userId", "user_id"))
    project_id: Optional[int] = Field(None, alias="projectId", validation_alias=AliasChoices("projectId", "project_id"))
    task_id: Optional[str] = Field(None, alias="taskId", validation_alias=AliasChoices("taskId", "task_id"))
    title: str
    description: Optional[str] = None
    code: Dict[str, Any]
    image: Optional[str] = None
    submission_answers: Optional[Dict[str, Any]] = Field(None, alias="submissionAnswers")

    class Config:
        populate_by_name = True


class SubmissionFeedbackRequest(BaseModel):
    """Request model for submission feedback"""
    voter_id: int = Field(..., alias="voterId", validation_alias=AliasChoices("voterId", "voter_id"))
    scores: Dict[str, int] = Field(default_factory=dict)
    comment: Optional[str] = None
    is_saved: Optional[bool] = Field(default=None, alias="isSaved", validation_alias=AliasChoices("isSaved", "is_saved"))
    is_reported: Optional[bool] = Field(default=None, alias="isReported", validation_alias=AliasChoices("isReported", "is_reported"))
    report_type: Optional[str] = Field(default=None, alias="reportType", validation_alias=AliasChoices("reportType", "report_type"))
    report_rationale: Optional[str] = Field(default=None, alias="reportRationale", validation_alias=AliasChoices("reportRationale", "report_rationale"))

    class Config:
        populate_by_name = True


class CodeLogRequest(BaseModel):
    """Request model for logging code snapshots"""
    user_id: int = Field(..., alias="userId", validation_alias=AliasChoices("userId", "user_id"))
    project_id: Optional[int] = Field(None, alias="projectId", validation_alias=AliasChoices("projectId", "project_id"))
    task_id: Optional[str] = Field(None, alias="taskId", validation_alias=AliasChoices("taskId", "task_id"))
    code: Dict[str, str]
    mode: Optional[str] = "regular"
    event: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default=None, validation_alias=AliasChoices("metadata", "code_metadata"))

    class Config:
        populate_by_name = True


class CodePreferenceLogPayload(BaseModel):
    """Request model for logging code preference / user selection"""
    suggestions: List[str]
    user_selection: Optional[str] = None
    project_id: Optional[int] = None
    task_id: Optional[str] = None
    task_name: Optional[str] = None
    user_id: Optional[Union[int, str]] = None


class SummaryResponse(BaseModel):
    """Response model for LLM summary generation (summary, ideas, probabilities)"""
    summary: str
    ideas: list[str]
    probabilities: list[float]


class SummaryOnlyResponse(BaseModel):
    """Response model for LLM summary-only generation (no suggestions)."""
    summary: str
