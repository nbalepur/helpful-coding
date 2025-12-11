from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Date, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .config import Base


class User(Base):
    """User table"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)  # Should be hashed
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    codes = relationship("Code", back_populates="user")
    assistant_logs = relationship("AssistantLog", back_populates="user")
    submissions = relationship("Submission", back_populates="user")
    code_preferences = relationship("CodePreference", back_populates="user")
    submission_feedback = relationship("SubmissionFeedback", back_populates="voter")


class Project(Base):
    """Project table"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text)
    # Store raw files array from dummy_tasks.json (names, languages, content paths/inline)
    files = Column(JSON)
    code_start_date = Column(Date, nullable=True)
    voting_start_date = Column(Date, nullable=True)
    voting_end_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    codes = relationship("Code", back_populates="project")
    assistant_logs = relationship("AssistantLog", back_populates="project")
    submissions = relationship("Submission", back_populates="project")
    code_preferences = relationship("CodePreference", back_populates="project")
    submission_feedback = relationship("SubmissionFeedback", back_populates="project")


class Code(Base):
    """Code table"""
    __tablename__ = "codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    code = Column(JSON, nullable=False)
    mode = Column(String(50), nullable=False, default="regular")
    code_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="codes")
    project = relationship("Project", back_populates="codes")


class Submission(Base):
    """Submission table"""
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    code = Column(JSON, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    image = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="submissions")
    project = relationship("Project", back_populates="submissions")
    feedback_entries = relationship("SubmissionFeedback", back_populates="submission")


class SubmissionFeedback(Base):
    """Submission feedback table"""
    __tablename__ = "submission_feedback"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    voter_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scores = Column(JSON, nullable=False, default=dict)
    is_reported = Column(Boolean, nullable=False, default=False)
    is_saved = Column(Boolean, nullable=False, default=False)
    comment = Column(Text)
    report_type = Column(String(100), nullable=True)  # 'offensive', 'cheating', 'broken', 'bright_harsh', 'other'
    report_rationale = Column(Text, nullable=True)  # User's rationale for reporting
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    submission = relationship("Submission", back_populates="feedback_entries")
    project = relationship("Project", back_populates="submission_feedback")
    voter = relationship("User", back_populates="submission_feedback")
class CodePreference(Base):
    """CodePreference table"""
    __tablename__ = "code_preferences"

    id = Column(Integer, primary_key=True, index=True)
    suggestion_id = Column(String(255), nullable=False, index=True)
    suggestions = Column(JSON, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    user_selection = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="code_preferences")
    project = relationship("Project", back_populates="code_preferences")


class AssistantLog(Base):
    """Assistant log table"""
    __tablename__ = "assistant_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    query = Column(Text)
    generated_code = Column(JSON, nullable=False)
    summary = Column(Text, nullable=False)
    suggestions = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="assistant_logs")
    project = relationship("Project", back_populates="assistant_logs")


class PasswordResetToken(Base):
    """Password reset token table"""
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")


class CodeData(Base):
    """Code data table for storing code_data.jsonl entries"""
    __tablename__ = "code_data"

    id = Column(Integer, primary_key=True, index=True)
    task_name = Column(String(255), nullable=False, index=True)
    test_cases_py = Column(Text, nullable=False)
    test_cases_js = Column(Text, nullable=False)
    blank_code_py = Column(Text, nullable=False)
    blank_code_js = Column(Text, nullable=False)
    model_code_py = Column(Text, nullable=False)
    model_code_js = Column(Text, nullable=False)
    docstring_py = Column(Text, nullable=True)
    docstring_js = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ExperienceData(Base):
    """Experience data table for storing experience_data.jsonl entries"""
    __tablename__ = "experience_data"

    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text, nullable=False)
    choices = Column(JSON, nullable=False)  # List of strings
    type = Column(String(50), nullable=False, index=True)  # e.g., "mcqa", "multi_select"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class MCQAData(Base):
    """MCQA data table for storing mcqa_data.jsonl entries"""
    __tablename__ = "mcqa_data"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=True, index=True)  # Unique identifier (e.g., 'choices_1', 'memory_2')
    question = Column(Text, nullable=False)
    choices = Column(JSON, nullable=False)  # List of strings
    answer = Column(String(10), nullable=True)  # e.g., "B", "C"
    type = Column(String(50), nullable=False, index=True)  # e.g., "ux"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NasaTLIData(Base):
    """NASA Task Load Index data table for storing nasa_tli_data.jsonl entries"""
    __tablename__ = "nasa_tli_data"

    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text, nullable=False)
    choices = Column(JSON, nullable=False)  # List of strings
    type = Column(String(50), nullable=False, index=True)  # e.g., "mcqa"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class UserMCQASkillResponse(Base):
    """User MCQA skill response table for storing user answers to MCQA, experience, and NASA TLI questions"""
    __tablename__ = "user_mcqa_skill_responses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(String(255), nullable=False, index=True)  # Can be "experience_1", "nasa_1", or MCQA id
    question_type = Column(String(50), nullable=False, index=True)  # 'experience', 'nasa_tli', 'ux', 'frontend'
    phase = Column(String(20), nullable=True, index=True)  # 'pre-test' or 'post-test'
    answer_text = Column(JSON, nullable=False)  # List of answer texts
    answer_letter = Column(JSON, nullable=False)  # List of answer letters (e.g., ['A', 'B'])
    gold_answer_text = Column(JSON, nullable=True)  # List of correct answer texts (for MCQA questions)
    gold_answer_letter = Column(JSON, nullable=True)  # List of correct answer letters (e.g., ['A', 'B'])
    correct = Column(Boolean, nullable=False)  # True if correct, always True for experience/nasa_tli
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")


class UserCodeSkillResponse(Base):
    """User code skill response table for storing user code submissions and test results"""
    __tablename__ = "user_code_skill_responses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(String(255), nullable=False, index=True)  # ID of the code question
    question_type = Column(String(50), nullable=False, index=True)  # 'normal' or 'debug'
    phase = Column(String(20), nullable=True, index=True)  # 'pre-test' or 'post-test'
    py_code = Column(Text, nullable=True)  # User's Python code
    js_code = Column(Text, nullable=True)  # User's JavaScript code
    submitted_language = Column(String(20), nullable=False)  # 'python' or 'javascript'
    state = Column(String(20), nullable=False, index=True)  # 'started', 'failed', 'passed'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")


class SkillCheckAssignment(Base):
    """Skill check assignment table for storing per-user question assignments for pre/post tests"""
    __tablename__ = "skill_check_assignments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    # MCQA question ID assignments (MCQAData IDs)
    frontend_pre_test = Column(JSON, nullable=True)   # List of MCQAData IDs for frontend pre-test
    frontend_post_test = Column(JSON, nullable=True)  # List of MCQAData IDs for frontend post-test
    ux_pre_test = Column(JSON, nullable=True)        # List of MCQAData IDs for UX pre-test
    ux_post_test = Column(JSON, nullable=True)       # List of MCQAData IDs for UX post-test

    # Coding question assignments (CodeData.task_name values)
    code_pre_test = Column(JSON, nullable=True)      # List of CodeData.task_name for normal coding pre-test
    code_post_test = Column(JSON, nullable=True)     # List of CodeData.task_name for normal coding post-test
    debug_pre_test = Column(JSON, nullable=True)     # List of CodeData.task_name for debug coding pre-test
    debug_post_test = Column(JSON, nullable=True)    # List of CodeData.task_name for debug coding post-test

    # Sanity check question assignments
    sanity_ux_phase = Column(String(20), nullable=True)  # 'pre-test' or 'post-test' - which phase gets sanity_ux
    sanity_frontend_phase = Column(String(20), nullable=True)  # 'pre-test' or 'post-test' - which phase gets sanity_frontend

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User")


class ReportSkillCheckQuestion(Base):
    """Report skill check question table for storing user reports about skill check questions"""
    __tablename__ = "report_skill_check_questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(String(255), nullable=False, index=True)  # ID of the reported question
    question_type = Column(String(50), nullable=False, index=True)  # 'experience', 'nasa_tli', 'ux', 'frontend', 'coding'
    phase = Column(String(20), nullable=True, index=True)  # 'pre-test' or 'post-test'
    report_type = Column(String(100), nullable=False)  # 'issue_stops_solving' or 'frustrated_unable_to_solve'
    rationale = Column(Text, nullable=False)  # Required rationale from user
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")


class ComprehensionQuestion(Base):
    """Comprehension questions table for auto-generated questions about submissions"""
    __tablename__ = "comprehension_questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    question_name = Column(String(255), nullable=False)
    question = Column(Text, nullable=False)  # The actual question text/stem
    question_type = Column(String(50), nullable=False)  # 'mcqa', 'multi_select', 'free_response'
    choices = Column(JSON, nullable=True)  # Array of choices for mcqa/multi_select
    answer = Column(Text, nullable=True)  # Correct answer (for scoring)
    user_answer = Column(Text, nullable=True)  # User's answer
    score = Column(Float, nullable=True)  # Score (0.0 to 1.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User")
    project = relationship("Project")


class NavigationEvent(Base):
    """Navigation events table for tracking tab/window navigation during skill checks"""
    __tablename__ = "navigation_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(String(255), nullable=True, index=True)
    test_type = Column(String(50), nullable=False, index=True)  # 'pre-test' or 'post-test'
    time_away_ms = Column(Integer, nullable=True)  # Time away in milliseconds
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")
