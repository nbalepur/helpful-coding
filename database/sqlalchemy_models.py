from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Float
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
    can_view_submissions = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    code_logs = relationship("Code", back_populates="user")
    ai_trace_logs = relationship("AssistantLog", back_populates="user")
    submissions = relationship("Submission", back_populates="user")
    ai_suggestions = relationship("CodePreference", back_populates="user")
    submission_feedback = relationship("SubmissionFeedback", back_populates="voter")


class Project(Base):
    """Project table"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    label = Column(String(255), nullable=True, index=True)
    description = Column(Text)
    # Store raw files array (names, languages, content paths/inline)
    files = Column(JSON)
    examples = Column(Text, nullable=True)  # HTML or plain text examples for task instructions
    test_cases = Column(JSON, nullable=True)  # For completion tasks: array of test case definitions
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    code_logs = relationship("Code", back_populates="project")
    ai_trace_logs = relationship("AssistantLog", back_populates="project")
    submissions = relationship("Submission", back_populates="project")
    ai_suggestions = relationship("CodePreference", back_populates="project")
    submission_feedback = relationship("SubmissionFeedback", back_populates="project")


class Code(Base):
    """Code table (code snapshots / logs)"""
    __tablename__ = "code_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    code = Column(JSON, nullable=False)
    mode = Column(String(50), nullable=False, default="regular")
    code_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="code_logs")
    project = relationship("Project", back_populates="code_logs")


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
    """AI suggestions (user selections from AI suggestions)"""
    __tablename__ = "ai_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    suggestion_id = Column(String(255), nullable=False, index=True)
    suggestions = Column(JSON, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    user_selection = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="ai_suggestions")
    project = relationship("Project", back_populates="ai_suggestions")


class AssistantLog(Base):
    """AI trace logs (streamed assistant interactions)"""
    __tablename__ = "ai_trace_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    query = Column(Text)
    trace = Column(JSON, nullable=False)  # list of streamed events (text, tool_call, suggestions) sent to frontend
    summary = Column(Text, nullable=False)
    suggestions = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="ai_trace_logs")
    project = relationship("Project", back_populates="ai_trace_logs")


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


class SubmissionQuestion(Base):
    """Submission questions (auto-generated questions about submissions)"""
    __tablename__ = "submission_questions"

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
