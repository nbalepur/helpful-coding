from pydantic import BaseModel, Field, EmailStr, AliasChoices
from typing import Optional, Dict, Any, List
from datetime import datetime, date
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
    description: Optional[str] = Field(None, max_length=1000, description="Project description")
    frontend_starter_file: Optional[str] = Field(None, description="Frontend starter file content")
    html_starter_file: Optional[str] = Field(None, description="HTML starter file content")
    css_starter_file: Optional[str] = Field(None, description="CSS starter file content")
    files: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Raw file descriptors loaded from dummy_tasks.json",
    )
    code_start_date: Optional[date] = Field(
        None, description="Date when the coding phase opens (Anywhere on Earth)"
    )
    voting_start_date: Optional[date] = Field(
        None, description="Date when the voting phase opens (Anywhere on Earth)"
    )
    voting_end_date: Optional[date] = Field(
        None, description="Date when the voting phase closes (Anywhere on Earth)"
    )


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
    files: Optional[List[Dict[str, Any]]] = None
    code_start_date: Optional[date] = None
    voting_start_date: Optional[date] = None
    voting_end_date: Optional[date] = None


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
    generated_code: Dict[str, Any] = Field(
        ...,
        description="Generated code organized by language or context"
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
    generated_code: Optional[Dict[str, Any]] = None
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


# Code Data Models (for code_data.jsonl)
class CodeDataBase(BaseModel):
    """Base model for code data"""
    task_name: str = Field(..., description="Task name")
    test_cases_py: str = Field(..., description="Python test cases")
    test_cases_js: str = Field(..., description="JavaScript test cases")
    blank_code_py: str = Field(..., description="Blank Python code template")
    blank_code_js: str = Field(..., description="Blank JavaScript code template")
    model_code_py: str = Field(..., description="Model Python code solution")
    model_code_js: str = Field(..., description="Model JavaScript code solution")
    docstring_py: Optional[str] = Field(None, description="Python docstring")
    docstring_js: Optional[str] = Field(None, description="JavaScript docstring")


class CodeDataCreate(CodeDataBase):
    """Model for creating code data"""
    pass


class CodeDataUpdate(BaseModel):
    """Model for updating code data"""
    task_name: Optional[str] = None
    test_cases_py: Optional[str] = None
    test_cases_js: Optional[str] = None
    blank_code_py: Optional[str] = None
    blank_code_js: Optional[str] = None
    model_code_py: Optional[str] = None
    model_code_js: Optional[str] = None
    docstring_py: Optional[str] = None
    docstring_js: Optional[str] = None


class CodeData(CodeDataBase):
    """Complete code data model"""
    id: int = Field(..., description="Code data ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CodeDataResponse(CodeData):
    """Code data response model"""
    pass


# Experience Data Models (for experience_data.jsonl)
class ExperienceDataBase(BaseModel):
    """Base model for experience data"""
    question: str = Field(..., description="Survey question")
    choices: List[str] = Field(..., description="List of answer choices")
    type: str = Field(..., description="Type of question (e.g., 'mcqa', 'multi_select')")


class ExperienceDataCreate(ExperienceDataBase):
    """Model for creating experience data"""
    pass


class ExperienceDataUpdate(BaseModel):
    """Model for updating experience data"""
    question: Optional[str] = None
    choices: Optional[List[str]] = None
    type: Optional[str] = None


class ExperienceData(ExperienceDataBase):
    """Complete experience data model"""
    id: int = Field(..., description="Experience data ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExperienceDataResponse(ExperienceData):
    """Experience data response model"""
    pass


# MCQA Data Models (for mcqa_data.jsonl)
class MCQADataBase(BaseModel):
    """Base model for MCQA data"""
    name: Optional[str] = Field(None, description="Unique identifier for the question (e.g., 'choices_1', 'memory_2')")
    question: str = Field(..., description="Multiple choice question")
    choices: List[str] = Field(..., description="List of answer choices")
    answer: Optional[str] = Field(None, description="Correct answer (e.g., 'B', 'C')")
    type: str = Field(..., description="Type of question (e.g., 'ux')")


class MCQADataCreate(MCQADataBase):
    """Model for creating MCQA data"""
    pass


class MCQADataUpdate(BaseModel):
    """Model for updating MCQA data"""
    name: Optional[str] = None
    question: Optional[str] = None
    choices: Optional[List[str]] = None
    answer: Optional[str] = None
    type: Optional[str] = None


class MCQAData(MCQADataBase):
    """Complete MCQA data model"""
    id: int = Field(..., description="MCQA data ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MCQADataResponse(MCQAData):
    """MCQA data response model"""
    pass


# User MCQA Skill Response Models
class UserMCQASkillResponseBase(BaseModel):
    """Base model for user MCQA skill response"""
    user_id: int = Field(..., description="User ID who answered")
    question_id: str = Field(..., description="ID of the question")
    question_type: str = Field(..., description="Type of question: 'experience', 'nasa_tli', 'ux', 'frontend'")
    phase: Optional[str] = Field(None, description="Skill check phase: 'pre-test' or 'post-test'")
    answer_text: List[str] = Field(..., description="List of answer texts")
    answer_letter: List[str] = Field(..., description="List of answer letters (e.g., ['A', 'B'])")
    gold_answer_text: Optional[List[str]] = Field(None, description="List of correct answer texts (for MCQA questions)")
    gold_answer_letter: Optional[List[str]] = Field(None, description="List of correct answer letters (e.g., ['A', 'B'])")
    correct: bool = Field(..., description="True if correct, always True for experience/nasa_tli")


class UserMCQASkillResponseCreate(UserMCQASkillResponseBase):
    """Model for creating a user MCQA skill response"""
    pass


class UserMCQASkillResponseUpdate(BaseModel):
    """Model for updating a user MCQA skill response"""
    user_id: Optional[int] = None
    question_id: Optional[str] = None
    question_type: Optional[str] = None
    phase: Optional[str] = None
    answer_text: Optional[List[str]] = None
    answer_letter: Optional[List[str]] = None
    gold_answer_text: Optional[List[str]] = None
    gold_answer_letter: Optional[List[str]] = None
    correct: Optional[bool] = None


class UserMCQASkillResponse(UserMCQASkillResponseBase):
    """Complete user MCQA skill response model"""
    id: int = Field(..., description="Response ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class UserMCQASkillResponseResponse(UserMCQASkillResponse):
    """User MCQA skill response response model"""
    pass


# User Code Skill Response Models
class UserCodeSkillResponseBase(BaseModel):
    """Base model for user code skill response"""
    user_id: int = Field(..., description="User ID who answered")
    question_id: str = Field(..., description="ID of the code question")
    question_type: str = Field(..., description="Type of question: 'normal' or 'debug'")
    phase: Optional[str] = Field(None, description="Skill check phase: 'pre-test' or 'post-test'")
    py_code: Optional[str] = Field(None, description="User's Python code")
    js_code: Optional[str] = Field(None, description="User's JavaScript code")
    submitted_language: str = Field(..., description="Language used: 'python' or 'javascript'")
    state: str = Field(..., description="State: 'started', 'failed', 'passed', or 'reported'")


class UserCodeSkillResponseCreate(UserCodeSkillResponseBase):
    """Model for creating a user code skill response"""
    pass


class UserCodeSkillResponseUpdate(BaseModel):
    """Model for updating a user code skill response"""
    user_id: Optional[int] = None
    question_id: Optional[str] = None
    question_type: Optional[str] = None
    phase: Optional[str] = None
    py_code: Optional[str] = None
    js_code: Optional[str] = None
    submitted_language: Optional[str] = None
    state: Optional[str] = None


class UserCodeSkillResponse(UserCodeSkillResponseBase):
    """Complete user code skill response model"""
    id: int = Field(..., description="Response ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class UserCodeSkillResponseResponse(UserCodeSkillResponse):
    """User code skill response response model"""
    pass


# Report Skill Check Question Models
class ReportSkillCheckQuestionBase(BaseModel):
    """Base model for report skill check question"""
    user_id: int = Field(..., description="User ID who reported the question")
    question_id: str = Field(..., description="ID of the reported question")
    question_type: str = Field(..., description="Type of question: 'experience', 'nasa_tli', 'ux', 'frontend', 'coding'")
    phase: Optional[str] = Field(None, description="Skill check phase: 'pre-test' or 'post-test'")
    report_type: str = Field(..., description="Type of report: 'issue_stops_solving' or 'frustrated_unable_to_solve'")
    rationale: str = Field(..., min_length=1, description="Required rationale explaining the report")


class ReportSkillCheckQuestionCreate(ReportSkillCheckQuestionBase):
    """Model for creating a report skill check question"""
    pass


class ReportSkillCheckQuestionUpdate(BaseModel):
    """Model for updating a report skill check question"""
    user_id: Optional[int] = None
    question_id: Optional[str] = None
    question_type: Optional[str] = None
    phase: Optional[str] = None
    report_type: Optional[str] = None
    rationale: Optional[str] = None


class ReportSkillCheckQuestion(ReportSkillCheckQuestionBase):
    """Complete report skill check question model"""
    id: int = Field(..., description="Report ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class ReportSkillCheckQuestionResponse(ReportSkillCheckQuestion):
    """Report skill check question response model"""
    pass


class ComprehensionQuestionBase(BaseModel):
    """Base model for comprehension questions"""
    user_id: int = Field(..., description="User ID")
    project_id: int = Field(..., description="Project ID")
    question_name: str = Field(..., description="Name/identifier for the question")
    question: str = Field(..., description="The actual question text/stem")
    question_type: str = Field(..., description="Type of question: 'mcqa', 'multi_select', or 'free_response'")
    choices: Optional[List[str]] = Field(None, description="Array of choices for mcqa/multi_select questions")
    answer: Optional[str] = Field(None, description="Correct answer (for scoring)")
    user_answer: Optional[str] = Field(None, description="User's answer")
    score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Score from 0.0 to 1.0")


class ComprehensionQuestionCreate(ComprehensionQuestionBase):
    """Model for creating a comprehension question"""
    pass


class ComprehensionQuestionUpdate(BaseModel):
    """Model for updating a comprehension question"""
    question_name: Optional[str] = None
    question: Optional[str] = None
    question_type: Optional[str] = None
    choices: Optional[List[str]] = None
    answer: Optional[str] = None
    user_answer: Optional[str] = None
    score: Optional[float] = Field(None, ge=0.0, le=1.0)


class ComprehensionQuestion(ComprehensionQuestionBase):
    """Complete comprehension question model"""
    id: int = Field(..., description="Question ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ComprehensionQuestionResponse(ComprehensionQuestion):
    """Comprehension question response model"""
    pass


class GenerateComprehensionQuestionsRequest(BaseModel):
    """Request model for generating comprehension questions"""
    user_id: int = Field(..., description="User ID")
    project_id: int = Field(..., description="Project ID")
    submission_title: str = Field(..., description="Submission title")
    submission_description: str = Field(..., description="Submission description")
    submission_code: Dict[str, str] = Field(..., description="Submission code as key-value pairs")


# Navigation Event Models
class NavigationEventBase(BaseModel):
    """Base model for navigation events"""
    user_id: int = Field(..., description="User ID")
    question_id: Optional[str] = Field(None, description="Question ID or name")
    test_type: str = Field(..., description="Test type: 'pre-test' or 'post-test'")
    time_away_ms: Optional[int] = Field(None, description="Time away in milliseconds")


class NavigationEventCreate(NavigationEventBase):
    """Model for creating a navigation event"""
    pass


class NavigationEventUpdate(BaseModel):
    """Model for updating a navigation event"""
    user_id: Optional[int] = None
    question_id: Optional[str] = None
    test_type: Optional[str] = None
    time_away_ms: Optional[int] = None


class NavigationEvent(NavigationEventBase):
    """Complete navigation event model"""
    id: int = Field(..., description="Navigation event ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class NavigationEventResponse(NavigationEvent):
    """Navigation event response model"""
    pass
