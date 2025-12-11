import asyncio
import os
import threading
import subprocess
import tempfile
import signal
import psutil
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent))
from functools import lru_cache
import json
import random
import litellm
from typing import Dict, Any, List, Optional
from collections import defaultdict
from datetime import datetime, timedelta, date

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, Request, Query
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import openai
from dotenv import load_dotenv

from strategies.base import BaseStrategy
from models.chat import ChatModel
from parsers.endpoint_parser import EndpointParser
from services.onecompiler_service import OneCompilerService
from auth import verify_password, get_password_hash, create_access_token, verify_token, generate_reset_token, send_password_reset_email
from agent import OpenAIAgent

from pydantic import BaseModel, Field, AliasChoices
from database.config import get_db
from database.sqlalchemy_models import User, PasswordResetToken, Project, Submission, SubmissionFeedback, CodeData, ExperienceData, MCQAData, NasaTLIData, UserMCQASkillResponse, UserCodeSkillResponse, SkillCheckAssignment, ReportSkillCheckQuestion, ComprehensionQuestion, NavigationEvent
from database.models import (
    UserCreate,
    UserResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
    PasswordResetTokenCreate,
    CodeCreate,
    SubmissionCreate,
    SubmissionFeedbackCreate,
    SubmissionFeedback as SubmissionFeedbackModel,
    UserMCQASkillResponseCreate,
    UserCodeSkillResponseCreate,
    ReportSkillCheckQuestionCreate,
    ComprehensionQuestionCreate,
    ComprehensionQuestionResponse,
    GenerateComprehensionQuestionsRequest,
    NavigationEventCreate,
)
from database.crud import CodeCRUD, SubmissionCRUD, SubmissionFeedbackCRUD, UserMCQASkillResponseCRUD, UserCodeSkillResponseCRUD, ReportSkillCheckQuestionCRUD, NavigationEventCRUD
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

# Load environment variables from .env file
load_dotenv()

# No rate limiting needed - OneCompiler handles execution security

def setup_environment():
    """Set up environment variables if .env file doesn't exist."""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    
    if not os.path.exists(env_path):
        print("🔧 No .env file found. Let's create one!")
        print("Please enter your OpenAI API key:")
        
        api_key = input("OPENAI_API_KEY: ").strip()
        
        if not api_key:
            print("❌ No API key provided. Exiting.")
            exit(1)
        
        # Create .env file
        env_content = f"""# OpenAI API Configuration
OPENAI_API_KEY={api_key}

# AI Agent Configuration (optional)
# Model to use for the AI agent (default: gpt-4o)
AGENT_MODEL=gpt-4o

# RapidAPI Configuration (optional)
# Get your API key from: https://rapidapi.com/onecompiler/api/onecompiler-apis
RAPIDAPI_KEY=

# Execution Mode (optional)
# Set to True for local development (uses Python exec() - UNSAFE, only for development)
# Set to False for production (uses OneCompiler API - secure remote execution)
USE_LOCAL_EXECUTION=True

# Server Configuration (optional)
HOST=0.0.0.0
PORT=4828
DEBUG=True

# Email Configuration (Brevo)
# Get your API key from: https://app.brevo.com/settings/keys/api
BREVO_API_KEY=
FROM_EMAIL=noreply@helpfulcoding.com
FROM_NAME=Helpful Coding
RESET_LINK_BASE_URL=http://localhost:4827/reset-password

# Authentication Configuration
SECRET_KEY=your-secret-key-change-this-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=30
"""
        
        try:
            with open(env_path, 'w') as f:
                f.write(env_content)
            print("✅ .env file created successfully!")
            # Reload environment variables
            load_dotenv()
        except Exception as e:
            print(f"❌ Error creating .env file: {e}")
            exit(1)

# Set up environment if needed
setup_environment()

app = FastAPI(
    title="AI Coding Assistant Backend",
    description="Backend API for the AI Coding Assistant with authentication and code execution capabilities",
    version="1.0.0",
    tags_metadata=[
        {
            "name": "Authentication",
            "description": "User authentication endpoints for signup and login",
        },
        {
            "name": "Code Execution",
            "description": "Endpoints for executing and validating Python code",
        },
        {
            "name": "Tasks",
            "description": "Endpoints for managing coding tasks and test cases",
        },
        {
            "name": "Code",
            "description": "Endpoints for logging and managing user code snapshots",
        },
        {
            "name": "Chat",
            "description": "AI chat endpoints for code assistance",
        },
        {
            "name": "Submissions",
            "description": "Endpoints for logging project submissions",
        },
    ]
)
# Serve repository assets (e.g., images) with a stable URL: /assets/{path}
@app.get("/assets/{file_path:path}")
async def serve_asset(file_path: str):
    try:
        backend_dir = os.path.dirname(__file__)
        repo_root = os.path.abspath(os.path.join(backend_dir, ".."))
        abs_path = os.path.join(repo_root, file_path)
        if not os.path.exists(abs_path):
            return JSONResponse(status_code=404, content={"error": "Asset not found"})
        # Basic safe-guard to prevent directory traversal outside repo
        if not os.path.abspath(abs_path).startswith(repo_root):
            return JSONResponse(status_code=403, content={"error": "Forbidden"})
        
        # Determine content type based on file extension
        lower = file_path.lower()
        content_type = "application/octet-stream"
        if lower.endswith('.png'):
            content_type = "image/png"
        elif lower.endswith('.jpg') or lower.endswith('.jpeg'):
            content_type = "image/jpeg"
        elif lower.endswith('.gif'):
            content_type = "image/gif"
        elif lower.endswith('.svg'):
            content_type = "image/svg+xml"
        elif lower.endswith('.html') or lower.endswith('.htm'):
            content_type = "text/html; charset=utf-8"
        elif lower.endswith('.css'):
            content_type = "text/css; charset=utf-8"
        elif lower.endswith('.js'):
            content_type = "text/javascript; charset=utf-8"
        elif lower.endswith('.json'):
            content_type = "application/json; charset=utf-8"
        elif lower.endswith('.txt'):
            content_type = "text/plain; charset=utf-8"
        elif lower.endswith('.mp4'):
            content_type = "video/mp4"
        
        return FileResponse(abs_path, media_type=content_type)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4827",
        "http://127.0.0.1:4827",
        "http://localhost:3000",  # Legacy port support
        "http://127.0.0.1:3000",  # Legacy port support
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize chat model
try:
    chat_model = ChatModel()
    print("✅ Backend initialized successfully with Autocomplete strategy")
except ValueError as e:
    print(f"❌ Error: {e}")
    print("Please create a .env file in the backend directory with your OpenAI API key")
    exit(1)

from agent_endpoints import router as agent_router

# Store active Python processes
active_processes = {}

# Initialize endpoint parser
endpoint_parser = EndpointParser()

# Initialize OneCompiler service
rapidapi_key = os.getenv("RAPIDAPI_KEY")
onecompiler_service = OneCompilerService(rapidapi_key=rapidapi_key)

# Include agent router
app.include_router(agent_router)

# Python test file parser and executor
import re
import ast

def load_json_test_file(content: str, filename: str, test_type_prefix: str = "") -> List[Dict[str, Any]]:
    """Load test cases from a JSON file"""
    try:
        test_cases_raw = json.loads(content)
        
        # Convert to the expected format
        test_cases = []
        for test in test_cases_raw:
            # Add prefix to title based on test type
            original_title = test.get("title", "Uncategorized")
            prefixed_title = f"{test_type_prefix}: {original_title}" if test_type_prefix else original_title
            
            # Check if this is a frontend_interactive test
            if test.get("type") == "frontend_interactive":
                # Preserve the original structure for frontend interactive tests
                test_case = {
                    "title": prefixed_title,
                    "name": test.get("name", "Unknown Test"),
                    "description": test.get("description", ""),
                    "public": test.get("public", False),
                    "type": test.get("type"),  # Preserve type
                    "setup": test.get("setup"),  # Preserve setup
                    "steps": test.get("steps")  # Preserve steps
                }
            else:
                # Legacy format for backend tests
                test_case = {
                    "title": prefixed_title,
                    "name": test.get("name", "Unknown Test"),
                    "description": test.get("description", ""),
                    "public": test.get("public", False),
                    "metadata": {
                        "type": "endpoint",
                        "endpoint": test.get("endpoint", ""),
                        "input": test.get("input", {}),
                        "expected": test.get("expected")
                    }
                }
            test_cases.append(test_case)
        
        return test_cases
        
    except Exception as e:
        print(f"Error loading JSON test file {filename}: {e}")
        return []

@app.get("/")
async def root():
    return {"message": "AI Coding Assistant Backend is running!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Backend is operational"}


def _slugify(name: str) -> str:
    import re
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug


@lru_cache(maxsize=1)
def _load_dummy_task_metadata() -> Dict[str, Dict[str, Optional[str]]]:
    """
    Load fallback metadata from data/dummy_tasks.json keyed by slugified name.
    Ensures we preserve important dates if legacy DB rows are missing them.
    """
    try:
        repo_root = Path(__file__).resolve().parent.parent
        data_path = repo_root / "data" / "dummy_tasks.json"
        if not data_path.exists():
            print(f"[tasks-db] dummy_tasks.json not found at {data_path}")
            return {}

        payload = json.loads(data_path.read_text(encoding="utf-8"))
        tasks = payload.get("tasks", [])
        lookup: Dict[str, Dict[str, Optional[str]]] = {}

        for task in tasks:
            name = task.get("name")
            if not name:
                continue
            slug = _slugify(name)
            lookup[slug] = {
                "code_start_date": task.get("code_start_date"),
                "voting_start_date": task.get("voting_start_date"),
                "voting_end_date": task.get("voting_end_date"),
            }
        return lookup
    except Exception as exc:
        print(f"[tasks-db] Failed to load dummy task metadata: {exc}")
        return {}


_SYNC_LOCK = threading.Lock()
_SYNC_COMPLETED = False


def _sync_project_dates_from_dummy(db: Session) -> None:
    """
    Populate missing project date fields by syncing from dummy_tasks.json once.
    This writes the data into the database so future reads don't require fallbacks.
    """
    global _SYNC_COMPLETED
    if _SYNC_COMPLETED:
        return

    with _SYNC_LOCK:
        if _SYNC_COMPLETED:
            return

        dummy_meta = _load_dummy_task_metadata()
        if not dummy_meta:
            _SYNC_COMPLETED = True
            return

        updated = False

        for project in db.query(Project).all():
            meta = dummy_meta.get(_slugify(project.name))
            if not meta:
                continue

            def parse_date(value: Optional[str]) -> Optional[date]:
                if not value:
                    return None
                try:
                    return date.fromisoformat(value)
                except ValueError:
                    print(f"[tasks-db] Skipping invalid date '{value}' for project '{project.name}'")
                    return None

            code_start = project.code_start_date or parse_date(meta.get("code_start_date"))
            voting_start = project.voting_start_date or parse_date(meta.get("voting_start_date"))
            voting_end = project.voting_end_date or parse_date(meta.get("voting_end_date"))

            if (
                code_start != project.code_start_date or
                voting_start != project.voting_start_date or
                voting_end != project.voting_end_date
            ):
                project.code_start_date = code_start
                project.voting_start_date = voting_start
                project.voting_end_date = voting_end
                updated = True

        if updated:
            db.commit()

        _SYNC_COMPLETED = True


def build_rating_summary(feedback_entries: List[SubmissionFeedback]) -> Dict[str, Any]:
    if not feedback_entries:
        return {"average": None, "count": 0, "perMetric": {}}

    # Filter to only the most recent feedback per voter_id
    # Entries should be ordered by created_at desc, so first occurrence per voter is most recent
    most_recent_by_voter: Dict[int, SubmissionFeedback] = {}
    for entry in feedback_entries:
        voter_id = entry.voter_id
        # Only keep the first entry we see for each voter (most recent due to ordering)
        if voter_id not in most_recent_by_voter:
            most_recent_by_voter[voter_id] = entry

    # Now calculate averages using only the most recent feedback per voter
    per_metric_totals: Dict[str, float] = defaultdict(float)
    per_metric_counts: Dict[str, int] = defaultdict(int)
    averaged_scores_total = 0.0
    averaged_scores_count = 0

    for entry in most_recent_by_voter.values():
        scores = entry.scores or {}
        numeric_scores: List[float] = []
        for key, value in scores.items():
            try:
                score = float(value)
            except (TypeError, ValueError):
                continue
            numeric_scores.append(score)
            per_metric_totals[key] += score
            per_metric_counts[key] += 1

        if numeric_scores:
            averaged_scores_total += sum(numeric_scores) / len(numeric_scores)
            averaged_scores_count += 1

    average = (
        averaged_scores_total / averaged_scores_count if averaged_scores_count > 0 else None
    )
    per_metric_average = {
        key: (per_metric_totals[key] / per_metric_counts[key])
        for key in per_metric_totals.keys()
        if per_metric_counts[key] > 0
    }

    return {
        "average": round(average, 2) if average is not None else None,
        "count": averaged_scores_count,
        "perMetric": {key: round(value, 2) for key, value in per_metric_average.items()},
    }


class CodeLogRequest(BaseModel):
    user_id: int = Field(..., alias="userId", validation_alias=AliasChoices("userId", "user_id"))
    project_id: Optional[int] = Field(None, alias="projectId", validation_alias=AliasChoices("projectId", "project_id"))
    task_id: Optional[str] = Field(None, alias="taskId", validation_alias=AliasChoices("taskId", "task_id"))
    code: Dict[str, str]
    mode: Optional[str] = "regular"
    event: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default=None, validation_alias=AliasChoices("metadata", "code_metadata"))

    class Config:
        populate_by_name = True


class SubmissionRequest(BaseModel):
    user_id: int = Field(..., alias="userId", validation_alias=AliasChoices("userId", "user_id"))
    project_id: Optional[int] = Field(None, alias="projectId", validation_alias=AliasChoices("projectId", "project_id"))
    task_id: Optional[str] = Field(None, alias="taskId", validation_alias=AliasChoices("taskId", "task_id"))
    title: str
    description: Optional[str] = None
    code: Dict[str, Any]
    image: Optional[str] = None
    comprehension_answers: Optional[Dict[str, Any]] = Field(None, alias="comprehensionAnswers")

    class Config:
        populate_by_name = True


class SubmissionFeedbackRequest(BaseModel):
    voter_id: int = Field(..., alias="voterId", validation_alias=AliasChoices("voterId", "voter_id"))
    scores: Dict[str, int] = Field(default_factory=dict)
    comment: Optional[str] = None
    is_saved: Optional[bool] = Field(default=None, alias="isSaved", validation_alias=AliasChoices("isSaved", "is_saved"))
    is_reported: Optional[bool] = Field(default=None, alias="isReported", validation_alias=AliasChoices("isReported", "is_reported"))
    report_type: Optional[str] = Field(default=None, alias="reportType", validation_alias=AliasChoices("reportType", "report_type"))
    report_rationale: Optional[str] = Field(default=None, alias="reportRationale", validation_alias=AliasChoices("reportRationale", "report_rationale"))

    class Config:
        populate_by_name = True


@app.get("/api/tasks-db", tags=["Tasks"])
async def list_tasks_from_db(db: Session = Depends(get_db)):
    try:
        _sync_project_dates_from_dummy(db)
        projects = db.query(Project).order_by(Project.id.asc()).all()
        tasks = []
        for p in projects:
            tasks.append({
                "id": _slugify(p.name),
                "name": p.name,
                "description": p.description or "",
                "projectId": p.id,
                "codeStartDate": p.code_start_date.isoformat() if p.code_start_date else None,
                "votingStartDate": p.voting_start_date.isoformat() if p.voting_start_date else None,
                "votingEndDate": p.voting_end_date.isoformat() if p.voting_end_date else None,
                # Optional fields to keep UI happy with defaults
                "requirements": [],
                "videoDemo": None,
                "tags": [],
                "difficulty": "Beginner",
                "appType": "Widget",
                "estimatedTime": "30 min",
                "preview": "📦",
                "status": "not-started",
                "saved": False,
            })
        return {"tasks": tasks}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# Skill Check Question Selection Configuration
# Customize which questions are loaded by ID
# Note: 
# - debug coding questions: IDs 1-44 (inclusive)
# - normal coding questions: IDs 45 onward
# - ux questions: IDs 1-118 (inclusive)
# - frontend questions: IDs 119 onward
SKILL_CHECK_QUESTION_IDS = {
    "pre_test": {
        "experience": list(range(1, 11)),  # IDs 1-10
        "frontend": list(range(119, 129)),  # IDs 119-128 (10 questions)
        "ux": list(range(1, 11)),        # IDs 1-10
    },
    "post_test": {
        "nasa_tli": list(range(1, 7)),    # IDs 1-6 (all nasa_tli questions)
        "frontend": list(range(129, 139)),  # IDs 129-138 (10 questions)
        "ux": list(range(11, 21)),        # IDs 11-20
    }
}


def _select_code_tasks_for_assignment(db: Session) -> tuple[list[str], list[str], list[str], list[str]]:
    """
    Select coding tasks for pre-test and post-test assignments.
    Ensures pre and post use the same base task names but different variants (_1 vs _2).
    
    Returns:
        (code_normal_pre, code_normal_post, code_debug_pre, code_debug_post)
        as lists of CodeData.task_name strings.
    """
    # Load all coding questions
    all_code_data = db.query(CodeData).all()
    if not all_code_data:
        return [], [], [], []

    # Extract base names from task names (number, paren, prefix, string_shift)
    base_names = ["number", "paren", "prefix", "string_shift"]

    # Randomly select 2 base names for debug, 2 for normal
    random.shuffle(base_names)
    debug_base_names = base_names[:2]
    normal_base_names = base_names[2:]

    # Filter against actual CodeData entries to ensure tasks exist
    code_data_map = {q.task_name: q for q in all_code_data}

    code_normal_pre: list[str] = []
    code_normal_post: list[str] = []
    code_debug_pre: list[str] = []
    code_debug_post: list[str] = []

    # For normal tasks: same base names, different variants for pre vs post
    for base_name in normal_base_names:
        # Randomly assign which variant goes to pre and which to post
        variants = ["1", "2"]
        random.shuffle(variants)
        pre_variant = variants[0]
        post_variant = variants[1]
        
        pre_task = f"{base_name}_{pre_variant}"
        post_task = f"{base_name}_{post_variant}"
        
        # Only add if both tasks exist in the database
        if pre_task in code_data_map and post_task in code_data_map:
            code_normal_pre.append(pre_task)
            code_normal_post.append(post_task)

    # For debug tasks: same base names, different variants for pre vs post
    for base_name in debug_base_names:
        # Randomly assign which variant goes to pre and which to post
        variants = ["1", "2"]
        random.shuffle(variants)
        pre_variant = variants[0]
        post_variant = variants[1]
        
        pre_task = f"{base_name}_{pre_variant}"
        post_task = f"{base_name}_{post_variant}"
        
        # Only add if both tasks exist in the database
        if pre_task in code_data_map and post_task in code_data_map:
            code_debug_pre.append(pre_task)
            code_debug_post.append(post_task)

    return code_normal_pre, code_normal_post, code_debug_pre, code_debug_post


def _select_ux_questions_for_assignment(db: Session) -> tuple[list[str], list[str]]:
    """
    Select UX questions for pre-test and post-test assignments.
    Ensures pre and post use the same base tags but different variants (_1 vs _2).
    
    Returns:
        (ux_pre, ux_post) as lists of MCQAData.name strings.
    """
    # Load all UX questions
    all_ux_questions = db.query(MCQAData).filter(MCQAData.type == "ux").all()
    if not all_ux_questions:
        return [], []
    
    # Extract base tags from question names
    # UX tags: choices, memory, mobile, design_protocol, error, aesthetics, object, cognitive_ease, visual_order, excitement
    base_tags = ["choices", "memory", "mobile", "design_protocol", "error", 
                 "aesthetics", "object", "cognitive_ease", "visual_order", "excitement"]
    
    # Create a map of base_tag -> {name: question}
    questions_by_base = {}
    for q in all_ux_questions:
        if not q.name:
            continue
        # Extract base tag (everything before the last underscore and number)
        # e.g., "choices_1" -> "choices", "design_protocol_2" -> "design_protocol"
        if '_' in q.name:
            parts = q.name.rsplit('_', 1)
            if len(parts) == 2 and parts[1] in ['1', '2']:
                base_tag = parts[0]
                if base_tag not in questions_by_base:
                    questions_by_base[base_tag] = {}
                questions_by_base[base_tag][q.name] = q
    
    ux_pre: list[str] = []
    ux_post: list[str] = []
    
    # For each base tag, randomly assign variants to pre and post
    for base_tag in base_tags:
        if base_tag not in questions_by_base:
            continue
        
        tag_questions = questions_by_base[base_tag]
        variant_1 = f"{base_tag}_1"
        variant_2 = f"{base_tag}_2"
        
        # Only proceed if both variants exist
        if variant_1 in tag_questions and variant_2 in tag_questions:
            # Randomly assign which variant goes to pre and which to post
            variants = [variant_1, variant_2]
            random.shuffle(variants)
            ux_pre.append(variants[0])
            ux_post.append(variants[1])
    
    return ux_pre, ux_post


def _select_frontend_questions_for_assignment(db: Session) -> tuple[list[str], list[str]]:
    """
    Select frontend questions for pre-test and post-test assignments.
    Ensures pre and post use the same base tags but different variants (_1 vs _2).
    
    Returns:
        (frontend_pre, frontend_post) as lists of MCQAData.name strings.
    """
    # Load all frontend questions
    all_frontend_questions = db.query(MCQAData).filter(MCQAData.type == "frontend").all()
    if not all_frontend_questions:
        return [], []
    
    # Extract base tags from question names
    # Frontend tags: html_knowledge, html_recall, html_trace_code, html_change_code,
    #                css_knowledge, css_recall, css_trace_code, css_change_code,
    #                js_knowledge, js_recall, js_trace_code, js_change_code
    base_tags = [
        "html_knowledge", "html_recall", "html_trace_code", "html_change_code",
        "css_knowledge", "css_recall", "css_trace_code", "css_change_code",
        "js_knowledge", "js_recall", "js_trace_code", "js_change_code"
    ]
    
    # Create a map of base_tag -> {name: question}
    questions_by_base = {}
    for q in all_frontend_questions:
        if not q.name:
            continue
        # Extract base tag (everything before the last underscore and number)
        # e.g., "html_knowledge_1" -> "html_knowledge", "js_change_code_2" -> "js_change_code"
        if '_' in q.name:
            parts = q.name.rsplit('_', 1)
            if len(parts) == 2 and parts[1] in ['1', '2']:
                base_tag = parts[0]
                if base_tag not in questions_by_base:
                    questions_by_base[base_tag] = {}
                questions_by_base[base_tag][q.name] = q
    
    frontend_pre: list[str] = []
    frontend_post: list[str] = []
    
    # For each base tag, randomly assign variants to pre and post
    for base_tag in base_tags:
        if base_tag not in questions_by_base:
            continue
        
        tag_questions = questions_by_base[base_tag]
        variant_1 = f"{base_tag}_1"
        variant_2 = f"{base_tag}_2"
        
        # Only proceed if both variants exist
        if variant_1 in tag_questions and variant_2 in tag_questions:
            # Randomly assign which variant goes to pre and which to post
            variants = [variant_1, variant_2]
            random.shuffle(variants)
            frontend_pre.append(variants[0])
            frontend_post.append(variants[1])
    
    return frontend_pre, frontend_post


def _get_or_create_skill_check_assignment(db: Session, user_id: int) -> SkillCheckAssignment:
    """
    Get an existing skill check assignment for a user or create a new one.
    """
    assignment = (
        db.query(SkillCheckAssignment)
        .filter(SkillCheckAssignment.user_id == user_id)
        .first()
    )
    if assignment:
        return assignment

    # Select questions with variant assignment strategy
    # UX questions: same base tags, different variants (_1 vs _2) for pre and post
    ux_pre, ux_post = _select_ux_questions_for_assignment(db)
    
    # Frontend questions: same base tags, different variants (_1 vs _2) for pre and post
    frontend_pre, frontend_post = _select_frontend_questions_for_assignment(db)
    
    # Select coding tasks: same base names for pre and post, but different variants
    code_normal_pre, code_normal_post, code_debug_pre, code_debug_post = _select_code_tasks_for_assignment(db)

    # Randomly assign sanity check questions: one phase gets sanity_ux, the other gets sanity_frontend
    # Randomly decide which phase gets which sanity question
    if random.random() < 0.5:
        # Pre-test gets sanity_ux, post-test gets sanity_frontend
        sanity_ux_phase = "pre-test"
        sanity_frontend_phase = "post-test"
        # Insert sanity questions at random positions in the lists
        if ux_pre:
            insert_position = random.randint(0, len(ux_pre))
            ux_pre.insert(insert_position, "sanity_ux")
        else:
            ux_pre.append("sanity_ux")
        if frontend_post:
            insert_position = random.randint(0, len(frontend_post))
            frontend_post.insert(insert_position, "sanity_frontend")
        else:
            frontend_post.append("sanity_frontend")
    else:
        # Pre-test gets sanity_frontend, post-test gets sanity_ux
        sanity_ux_phase = "post-test"
        sanity_frontend_phase = "pre-test"
        # Insert sanity questions at random positions in the lists
        if frontend_pre:
            insert_position = random.randint(0, len(frontend_pre))
            frontend_pre.insert(insert_position, "sanity_frontend")
        else:
            frontend_pre.append("sanity_frontend")
        if ux_post:
            insert_position = random.randint(0, len(ux_post))
            ux_post.insert(insert_position, "sanity_ux")
        else:
            ux_post.append("sanity_ux")

    assignment = SkillCheckAssignment(
        user_id=user_id,
        frontend_pre_test=frontend_pre,
        frontend_post_test=frontend_post,
        ux_pre_test=ux_pre,
        ux_post_test=ux_post,
        code_pre_test=code_normal_pre,
        code_post_test=code_normal_post,
        debug_pre_test=code_debug_pre,
        debug_post_test=code_debug_post,
        sanity_ux_phase=sanity_ux_phase,
        sanity_frontend_phase=sanity_frontend_phase,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment

@app.get("/api/skill-check/questions", tags=["Tasks"])
async def get_skill_check_questions(
    mode: str = Query(..., description="Skill check mode: 'pre-test' or 'post-test'"),
    user_id: Optional[int] = Query(None, description="User ID for skill check assignment"),
    db: Session = Depends(get_db),
):
    """
    Load skill check questions based on mode.
    
    Pre-test:
    - All questions from experience_data
    - 10 questions from mcqa_data where type == 'frontend'
    - 10 questions from mcqa_data where type == 'ux'
    - 3 coding questions from code_data where type == 'normal'
    - 3 coding questions from code_data where type == 'debug'
    
    Post-test:
    - All questions from nasa_tli_data
    - 10 questions from mcqa_data where type == 'frontend'
    - 10 questions from mcqa_data where type == 'ux'
    - 3 coding questions from code_data where type == 'normal'
    - 3 coding questions from code_data where type == 'debug'
    """
    print(f"\n📋 QUESTIONS ENDPOINT CALLED: mode={mode}, user_id={user_id}")
    try:
        if mode not in ["pre-test", "post-test"]:
            return JSONResponse(
                status_code=400,
                content={"error": "Mode must be 'pre-test' or 'post-test'"}
            )
        
        config_key = "pre_test" if mode == "pre-test" else "post_test"
        question_ids = SKILL_CHECK_QUESTION_IDS[config_key]

        # For logged-in users, use (or create) a persistent skill check assignment
        assignment: Optional[SkillCheckAssignment] = None
        if user_id is not None:
            assignment = _get_or_create_skill_check_assignment(db, user_id)

        questions = []
        
        if mode == "pre-test":
            # Load experience questions
            experience_questions = db.query(ExperienceData).filter(
                ExperienceData.id.in_(question_ids["experience"])
            ).order_by(ExperienceData.id).all()  # Explicit ordering for consistency
            
            for q in experience_questions:
                questions.append({
                    "id": f"exp_{q.id}",
                    "type": "experience",
                    "question_type": q.type,  # 'mcqa' or 'multi_select'
                    "question": q.question,
                    "choices": q.choices,
                })
        else:
            # Load NASA TLI questions
            nasa_questions = db.query(NasaTLIData).filter(
                NasaTLIData.id.in_(question_ids["nasa_tli"])
            ).order_by(NasaTLIData.id).all()  # Explicit ordering for consistency
            
            for q in nasa_questions:
                questions.append({
                    "id": f"nasa_{q.id}",
                    "type": "nasa_tli",
                    "question_type": q.type,  # 'mcqa' or 'multi_select'
                    "question": q.question,
                    "choices": q.choices,
                })
        
        # Determine frontend question names based on assignment (if available)
        if assignment is not None:
            if mode == "pre-test":
                frontend_names = assignment.frontend_pre_test or []
            else:
                frontend_names = assignment.frontend_post_test or []
        else:
            # Fallback: use configured IDs and look up names (backward compatibility)
            frontend_ids = question_ids["frontend"]
            frontend_questions_by_id = db.query(MCQAData).filter(
                MCQAData.type == "frontend",
                MCQAData.id.in_(frontend_ids)
            ).all()
            frontend_names = [q.name for q in frontend_questions_by_id if q.name]

        # Load frontend questions by name
        frontend_questions_raw = db.query(MCQAData).filter(
            MCQAData.type == "frontend",
            MCQAData.name.in_(frontend_names)
        ).all() if frontend_names else []
        
        # Sort questions to match the order in frontend_names (assignment order)
        frontend_questions_map = {q.name: q for q in frontend_questions_raw}
        frontend_questions = [frontend_questions_map[name] for name in frontend_names if name in frontend_questions_map]
        
        # Check if we should inject sanity_frontend question in this phase
        # (Backward compatibility: if assignment was created before sanity questions were added to columns)
        should_inject_sanity_frontend = False
        if assignment is not None and assignment.sanity_frontend_phase and assignment.sanity_frontend_phase == mode:
            # Only inject if not already in the list (new assignments have it in the column)
            has_sanity = any(q.name == "sanity_frontend" for q in frontend_questions)
            if not has_sanity:
                should_inject_sanity_frontend = True
        
        # Inject sanity_frontend at a random position if needed
        if should_inject_sanity_frontend:
            sanity_frontend_q = db.query(MCQAData).filter(
                MCQAData.type == "frontend",
                MCQAData.name == "sanity_frontend"
            ).first()
            if sanity_frontend_q:
                # Insert at a random position within the frontend questions
                insert_position = random.randint(0, len(frontend_questions))
                frontend_questions.insert(insert_position, sanity_frontend_q)
        
        for q in frontend_questions:
            # Convert choices array to choiceA, choiceB, choiceC, choiceD format
            choices_dict = {}
            if len(q.choices) >= 1:
                choices_dict["choiceA"] = q.choices[0]
            if len(q.choices) >= 2:
                choices_dict["choiceB"] = q.choices[1]
            if len(q.choices) >= 3:
                choices_dict["choiceC"] = q.choices[2]
            if len(q.choices) >= 4:
                choices_dict["choiceD"] = q.choices[3]
            
            # Use name as ID if available, fallback to numeric id for backward compatibility
            question_id = f"frontend_{q.name}" if q.name else f"frontend_{q.id}"
            
            questions.append({
                "id": question_id,
                "type": "frontend",
                "question_type": "mcqa",
                "question": q.question,
                "answer": q.answer,
                "choices": q.choices,  # Keep original for reference
                **choices_dict,
            })
        
        # Determine UX question names based on assignment (if available)
        if assignment is not None:
            if mode == "pre-test":
                ux_names = assignment.ux_pre_test or []
            else:
                ux_names = assignment.ux_post_test or []
        else:
            # Fallback: use configured IDs and look up names (backward compatibility)
            ux_ids = question_ids["ux"]
            ux_questions_by_id = db.query(MCQAData).filter(
                MCQAData.type == "ux",
                MCQAData.id.in_(ux_ids)
            ).all()
            ux_names = [q.name for q in ux_questions_by_id if q.name]

        # Load UX questions by name
        ux_questions_raw = db.query(MCQAData).filter(
            MCQAData.type == "ux",
            MCQAData.name.in_(ux_names)
        ).all() if ux_names else []
        
        # Sort questions to match the order in ux_names (assignment order)
        ux_questions_map = {q.name: q for q in ux_questions_raw}
        ux_questions = [ux_questions_map[name] for name in ux_names if name in ux_questions_map]
        
        # Check if we should inject sanity_ux question in this phase
        # (Backward compatibility: if assignment was created before sanity questions were added to columns)
        should_inject_sanity_ux = False
        if assignment is not None and assignment.sanity_ux_phase and assignment.sanity_ux_phase == mode:
            # Only inject if not already in the list (new assignments have it in the column)
            has_sanity = any(q.name == "sanity_ux" for q in ux_questions)
            if not has_sanity:
                should_inject_sanity_ux = True
        
        # Inject sanity_ux at a random position if needed
        if should_inject_sanity_ux:
            sanity_ux_q = db.query(MCQAData).filter(
                MCQAData.type == "ux",
                MCQAData.name == "sanity_ux"
            ).first()
            if sanity_ux_q:
                # Insert at a random position within the UX questions
                insert_position = random.randint(0, len(ux_questions))
                ux_questions.insert(insert_position, sanity_ux_q)
        
        for q in ux_questions:
            # Convert choices array to choiceA, choiceB, choiceC, choiceD format
            choices_dict = {}
            if len(q.choices) >= 1:
                choices_dict["choiceA"] = q.choices[0]
            if len(q.choices) >= 2:
                choices_dict["choiceB"] = q.choices[1]
            if len(q.choices) >= 3:
                choices_dict["choiceC"] = q.choices[2]
            if len(q.choices) >= 4:
                choices_dict["choiceD"] = q.choices[3]
            
            # Use name as ID if available, fallback to numeric id for backward compatibility
            question_id = f"ux_{q.name}" if q.name else f"ux_{q.id}"
            
            questions.append({
                "id": question_id,
                "type": "ux",
                "question_type": "mcqa",
                "question": q.question,
                "answer": q.answer,
                "choices": q.choices,  # Keep original for reference
                **choices_dict,
            })
        
        # Determine coding task assignments (CodeData.task_name) based on assignment
        selected_tasks: list[tuple[str, str]] = []
        if assignment is not None:
            if mode == "pre-test":
                code_normal_names = assignment.code_pre_test or []
                code_debug_names = assignment.debug_pre_test or []
            else:
                code_normal_names = assignment.code_post_test or []
                code_debug_names = assignment.debug_post_test or []
            selected_tasks.extend((name, "normal") for name in code_normal_names)
            selected_tasks.extend((name, "debug") for name in code_debug_names)
        else:
            # Fallback: random selection logic (no persistent assignment)
            code_normal_names, code_debug_names = _select_code_tasks_for_assignment(db)
            selected_tasks.extend((name, "normal") for name in code_normal_names)
            selected_tasks.extend((name, "debug") for name in code_debug_names)

        # Load the selected coding questions
        selected_task_names = [task_name for task_name, _ in selected_tasks]
        code_questions = db.query(CodeData).filter(
            CodeData.task_name.in_(selected_task_names)
        ).all()
        
        # Create a mapping of task_name to code_data
        code_data_map = {q.task_name: q for q in code_questions}
        
        # Add questions in the order: normal tasks first, then debug tasks
        for task_name, code_type in selected_tasks:
            if task_name in code_data_map:
                q = code_data_map[task_name]
                # For normal tasks: show blank code (user implements from scratch)
                # For debug tasks: show model code (user debugs/fixes existing code)
                questions.append({
                    "id": f"code_{code_type}_{q.task_name}",
                    "type": "coding",
                    "question_type": "coding",
                    "task_id": q.task_name,  # Keep for backward compatibility
                    "python_code": q.blank_code_py if code_type == "normal" else q.model_code_py,
                    "js_code": q.blank_code_js if code_type == "normal" else q.model_code_js,
                    "test_cases": q.test_cases_py,  # Python test cases
                    "test_cases_py": q.test_cases_py,
                    "test_cases_js": q.test_cases_js,
                    "docstring_py": q.docstring_py or "",
                    "docstring_js": q.docstring_js or "",
                    "code_type": code_type,
                })
        
        # Debug: Print question IDs being returned
        question_ids_returned = [q.get("id", "NO_ID") for q in questions]
        print(f"📋 QUESTIONS ENDPOINT: Returning {len(questions)} questions")
        print(f"   Question IDs: {question_ids_returned[:10]}..." if len(question_ids_returned) > 10 else f"   Question IDs: {question_ids_returned}")
        
        return {
            "questions": questions,
            "total": len(questions),
            "mode": mode
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to load skill check questions: {str(e)}"}
        )


@app.post("/api/skill-check/run-tests", tags=["Tasks"])
async def run_skill_check_tests(request: dict):
    """
    Execute test cases for skill check coding questions.
    
    Request body:
    {
        "code": "...",           # User's code
        "test_cases": "...",     # Test cases (assert statements)
        "language": "python" | "javascript"
    }
    
    Returns:
    {
        "success": boolean,
        "all_passed": boolean,
        "error_message": string | null,  # First assertion failure error if any
        "stdout": string,
        "stderr": string
    }
    """
    try:
        code = request.get("code", "")
        test_cases = request.get("test_cases", "")
        language = request.get("language", "python")
        
        if not code:
            return JSONResponse(
                status_code=400,
                content={"error": "Code is required"}
            )
        
        if not test_cases:
            return JSONResponse(
                status_code=400,
                content={"error": "Test cases are required"}
            )
        
        if language not in ["python", "javascript"]:
            return JSONResponse(
                status_code=400,
                content={"error": "Language must be 'python' or 'javascript'"}
            )
        
        # Combine user code with test cases
        # Wrap test execution to stop on first failure and handle console.log separately
        if language == "python":
            # For Python: Just combine code and test cases (Python assertions already stop on first failure)
            combined_code = f"{code}\n{test_cases}"
        else:  # javascript
            # For JavaScript: Wrap test execution and handle console.log separately
            # Save original console methods
            js_wrapper = """
// Save original console methods
const _originalConsoleLog = console.log;
const _originalConsoleAssert = console.assert;

// Capture user console.log output separately
let userOutput = [];
console.log = function(...args) {
    userOutput.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};

// Wrap console.assert to stop on first failure
console.assert = function(condition, ...args) {
    if (!condition) {
        const message = args.length > 0 ? args[0] : 'Assertion failed';
        // Restore original console methods
        console.log = _originalConsoleLog;
        console.assert = _originalConsoleAssert;
        // Throw error to stop execution
        throw new Error(message);
    }
};

try {
"""
            js_wrapper_end = """
} catch (e) {
    // Restore console methods
    console.log = _originalConsoleLog;
    console.assert = _originalConsoleAssert;
    // Print user console.log output even on failure
    if (userOutput.length > 0) {
        console.log(userOutput.join('\\n'));
    }
    // Print error to stderr and exit
    // Format error message to match backend parsing expectations
    const errorMsg = e.message || 'Assertion failed';
    console.error('AssertionError: ' + errorMsg);
    process.exit(1);
}

// Restore console methods after successful execution
console.log = _originalConsoleLog;
console.assert = _originalConsoleAssert;
// Output user console.log statements to stdout (if any)
if (userOutput.length > 0) {
    console.log(userOutput.join('\\n'));
}
"""
            # Indent the test cases
            indented_test_cases = "\n".join("    " + line if line.strip() else line for line in test_cases.split("\n"))
            combined_code = f"{code}\n{js_wrapper}{indented_test_cases}\n{js_wrapper_end}"
        
        # Execute the code
        if language == "python":
            result = await onecompiler_service.execute_python(combined_code)
        else:  # javascript
            result = await onecompiler_service.execute_javascript(combined_code)
        
        # Check if execution service returned an error (e.g., API key missing, API failure)
        if not result.get("success", False) and result.get("error"):
            return {
                "success": False,
                "all_passed": False,
                "error_message": f"Execution error: {result.get('error')}",
                "stdout": result.get("stdout", ""),
                "stderr": result.get("stderr", result.get("error", "")),
                "exit_code": result.get("exit_code", 1)
            }
        
        # Parse results to determine if all tests passed
        # Tests pass ONLY if code compiles, runs without errors, and all assertions pass
        stderr = result.get("stderr", "")
        stdout = result.get("stdout", "")
        exit_code = result.get("exit_code", 1)
        
        # Combine outputs for error detection
        combined_output = (stderr + "\n" + stdout).lower()
        
        # Check for syntax/compilation errors (these should always fail tests)
        # If code doesn't compile, it cannot pass tests
        has_syntax_error = False
        
        if language == "python":
            # Python syntax/compilation errors
            syntax_error_indicators = [
                'syntaxerror',
                'syntax error',
                'indentationerror',
                'indentation error',
            ]
            has_syntax_error = any(indicator in combined_output for indicator in syntax_error_indicators)
        else:  # javascript
            # JavaScript syntax/compilation errors
            syntax_error_indicators = [
                'syntaxerror',
                'syntax error',
                'unexpected token',
                'unexpected identifier',
                'unexpected end of input',
            ]
            has_syntax_error = any(indicator in combined_output for indicator in syntax_error_indicators)
        
        # Check for assertion errors in output (even if exit_code is 0)
        # JavaScript assertions might throw but still exit with code 0
        has_assertion_error = (
            'assertionerror' in combined_output or 
            'assertion failed' in combined_output or
            'assertionerror' in stderr or
            'assertionerror' in stdout or
            'assertion failed' in stderr.lower() or
            'assertion failed' in stdout.lower()
        )
        
        # Check if there are any runtime errors in stderr (excluding warnings)
        # If stderr has content that's not a warning, it's likely an error
        has_runtime_error = False
        if stderr and stderr.strip():
            stderr_lower = stderr.lower().strip()
            # Check if it's not just a warning
            if not stderr_lower.startswith('warning'):
                # Check for common error patterns
                error_patterns = ['error', 'exception', 'failed', 'traceback']
                has_runtime_error = any(pattern in stderr_lower for pattern in error_patterns)
        
        # Tests pass ONLY if ALL of these conditions are met:
        # 1. Execution service succeeded (success=True)
        # 2. Exit code is 0 (code compiled and ran without errors)
        # 3. No syntax/compilation errors detected
        # 4. No assertion errors detected
        # 5. No runtime errors in stderr
        all_passed = (
            result.get("success", False) and  # Execution service succeeded
            exit_code == 0 and                # Code compiled and ran without errors
            not has_syntax_error and          # No syntax/compilation errors
            not has_assertion_error and      # No assertion failures
            not has_runtime_error            # No runtime errors
        )
        error_message = None
        
        # If execution failed or has errors, extract the error message
        if not all_passed:
            
            # Prioritize stderr for errors, but also check stdout
            error_output = stderr if stderr else stdout
            # Also check stdout if stderr doesn't have the error
            if error_output and not any(keyword in error_output.lower() for keyword in ['assertionerror', 'assertion failed', 'syntaxerror', 'syntax error', 'error', 'exception']):
                if stdout and any(keyword in stdout.lower() for keyword in ['assertionerror', 'assertion failed', 'syntaxerror', 'syntax error', 'error', 'exception']):
                    error_output = stdout
            
            if error_output:
                error_message = None
                error_output_trimmed = error_output.strip()
                
                if language == "python":
                    # Keep the full error output including traceback
                    # For syntax/compilation errors, this will show the full error
                    if has_syntax_error:
                        # For syntax/compilation errors, keep the full error message with traceback
                        error_message = error_output_trimmed or "Syntax/Compilation error"
                    elif 'AssertionError' in error_output_trimmed:
                        # For assertion errors, keep the full error including traceback
                        error_message = error_output_trimmed
                    else:
                        # For other errors (runtime errors, etc.), keep full error output including traceback
                        error_message = error_output_trimmed or "Execution error"
                    
                else:  # javascript
                    # For JavaScript, keep the full error output (no manual parsing)
                    # This includes syntax errors, assertion errors, and runtime errors
                    error_message = error_output_trimmed or "Error"
        
        return {
            "success": True,
            "all_passed": all_passed,
            "error_message": error_message,
            "stdout": result.get("stdout", ""),
            "stderr": result.get("stderr", ""),
            "exit_code": result.get("exit_code", 1)
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to execute test cases: {str(e)}"}
        )


@app.post("/api/skill-check/run-code", tags=["Tasks"])
async def run_skill_check_code(request: dict):
    """
    Execute user code with custom inputs for skill check coding questions.
    
    Request body:
    {
        "code": "...",           # User's code
        "function_name": "...",   # Name of function to call (optional, will try to detect)
        "inputs": {...},         # Dictionary of input parameter names to values
        "language": "python" | "javascript"
    }
    
    Returns:
    {
        "success": boolean,
        "stdout": string,
        "stderr": string,
        "result": any            # Return value of the function (if applicable)
    }
    """
    try:
        code = request.get("code", "")
        function_name = request.get("function_name", "")
        inputs = request.get("inputs", {})
        language = request.get("language", "python")
        
        if not code:
            return JSONResponse(
                status_code=400,
                content={"error": "Code is required"}
            )
        
        if language not in ["python", "javascript"]:
            return JSONResponse(
                status_code=400,
                content={"error": "Language must be 'python' or 'javascript'"}
            )
        
        # Build execution code that calls the function with inputs
        if language == "python":
            # For Python: try to detect function name if not provided
            if not function_name:
                # Simple regex to find function definitions
                import re
                func_match = re.search(r'def\s+(\w+)\s*\(', code)
                if func_match:
                    function_name = func_match.group(1)
            
            if function_name:
                # Build call with **kwargs
                inputs_str = ", ".join([f"{k}={repr(v)}" for k, v in inputs.items()])
                execution_code = f"{code}\n\n# Call the function with provided inputs\nresult = {function_name}({inputs_str})\nprint(result)"
            else:
                # If no function found, just execute the code and print any result
                execution_code = code
        else:  # javascript
            # For JavaScript: try to detect function name if not provided
            if not function_name:
                # Simple regex to find function definitions (function name() or const name = function() or const name = () =>)
                import re
                func_match = re.search(r'(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))', code)
                if func_match:
                    function_name = func_match.group(1) or func_match.group(2)
            
            if function_name:
                # Build call with inputs - properly format JavaScript object
                inputs_parts = []
                for k, v in inputs.items():
                    # Format value appropriately for JavaScript
                    if isinstance(v, str):
                        inputs_parts.append(f"{k}: {json.dumps(v)}")
                    elif isinstance(v, (int, float, bool)):
                        inputs_parts.append(f"{k}: {json.dumps(v)}")
                    elif isinstance(v, (list, dict)):
                        inputs_parts.append(f"{k}: {json.dumps(v)}")
                    else:
                        inputs_parts.append(f"{k}: {json.dumps(str(v))}")
                inputs_str = ", ".join(inputs_parts)
                execution_code = f"{code}\n\n// Call the function with provided inputs\nconst result = {function_name}({{{inputs_str}}});\nconsole.log(result);"
            else:
                # If no function found, just execute the code
                execution_code = code
        
        # Execute the code
        if language == "python":
            result = await onecompiler_service.execute_python(execution_code)
        else:  # javascript
            result = await onecompiler_service.execute_javascript(execution_code)
        
        # Check if execution service returned an error (e.g., API key missing, API failure)
        if not result.get("success", False) and result.get("error"):
            return {
                "success": False,
                "stdout": result.get("stdout", ""),
                "stderr": result.get("stderr", result.get("error", "")),
                "result": None,
                "exit_code": result.get("exit_code", 1),
                "error": result.get("error")
            }
        
        # Extract result from stdout if available
        stdout = result.get("stdout", "")
        stderr = result.get("stderr", "")
        
        # Try to parse the result from stdout (last line is usually the result)
        parsed_result = None
        if stdout:
            lines = stdout.strip().split('\n')
            if lines:
                last_line = lines[-1]
                # Try to parse as JSON or Python literal
                try:
                    parsed_result = json.loads(last_line)
                except:
                    # Try to evaluate as Python literal (for Python)
                    if language == "python":
                        try:
                            parsed_result = eval(last_line)
                        except:
                            parsed_result = last_line
                    else:
                        parsed_result = last_line
        
        return {
            "success": result.get("success", False),
            "stdout": stdout,
            "stderr": stderr,
            "result": parsed_result,
            "exit_code": result.get("exit_code", 1)
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to execute code: {str(e)}"}
        )


@app.post("/api/skill-check/log-mcqa-response", tags=["Tasks"])
async def log_mcqa_response(request: dict, db: Session = Depends(get_db)):
    """
    Log a user's MCQA response when they hit next question.
    
    Request body:
    {
        "user_id": int,
        "question_id": str,  # e.g., "experience_1", "nasa_1", or MCQA id
        "question_type": str,  # 'experience', 'nasa_tli', 'ux', 'frontend'
        "phase": str | null,  # 'pre-test' or 'post-test'
        "answer_text": List[str],  # List of answer texts
        "answer_letter": List[str],  # List of answer letters (e.g., ['A', 'B'])
    }
    """
    try:
        user_id = request.get("user_id")
        question_id = request.get("question_id")
        question_type = request.get("question_type")
        phase = request.get("phase")
        answer_text = request.get("answer_text", [])
        answer_letter = request.get("answer_letter", [])
        
        if not user_id or not question_id or not question_type:
            return JSONResponse(
                status_code=400,
                content={"error": "user_id, question_id, and question_type are required"}
            )
        
        # Determine if answer is correct and compute gold answers
        correct = True  # Default to True for experience/nasa_tli
        gold_answer_letter: list[str] = []
        gold_answer_text: list[str] = []
        if question_type in ['ux', 'frontend']:
            # For UX and frontend questions, check against MCQA database
            # Extract name or numeric ID from question_id (e.g., "frontend_choices_1" -> "choices_1", "ux_5" -> 5)
            try:
                mcqa_question = None
                if '_' in question_id:
                    # Try to extract name first (everything after the first underscore)
                    prefix, identifier = question_id.split('_', 1)
                    # Try to find by name first
                    mcqa_question = db.query(MCQAData).filter(MCQAData.name == identifier).first()
                    # If not found by name, try numeric ID (backward compatibility)
                    if not mcqa_question:
                        try:
                            mcqa_id = int(identifier)
                            mcqa_question = db.query(MCQAData).filter(MCQAData.id == mcqa_id).first()
                        except ValueError:
                            pass
                else:
                    # Try as numeric ID (backward compatibility)
                    mcqa_id = int(question_id)
                    mcqa_question = db.query(MCQAData).filter(MCQAData.id == mcqa_id).first()
                if mcqa_question and mcqa_question.answer:
                    # Correct answer is a single letter like "B" or multiple like "B,C"
                    gold_answer_letter = [a.strip().upper() for a in mcqa_question.answer.split(',')]
                    # Map gold letters to gold answer texts using MCQA choices
                    if mcqa_question.choices:
                        for letter in gold_answer_letter:
                            idx = ord(letter) - ord('A')
                            if 0 <= idx < len(mcqa_question.choices):
                                gold_answer_text.append(mcqa_question.choices[idx])
                    # Compare user's answer letters with correct answer
                    user_answers = [a.strip().upper() for a in answer_letter]
                    # Sort both for comparison (order doesn't matter for multi-select)
                    correct = sorted(gold_answer_letter) == sorted(user_answers)
                else:
                    # If no answer in DB, default to True and leave gold_* empty
                    correct = True
            except (ValueError, AttributeError):
                correct = True  # If parsing fails, default to True
        # For experience and nasa_tli, correct is always True (no right/wrong answers)
        
        # Create response
        response_create = UserMCQASkillResponseCreate(
            user_id=user_id,
            question_id=question_id,
            question_type=question_type,
             phase=phase,
            answer_text=answer_text,
            answer_letter=answer_letter,
            gold_answer_text=gold_answer_text,
            gold_answer_letter=gold_answer_letter,
            correct=correct,
        )
        
        response = UserMCQASkillResponseCRUD.create(db, response_create)
        
        return {
            "success": True,
            "response_id": response.id,
            "correct": correct
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to log MCQA response: {str(e)}"}
        )


@app.post("/api/skill-check/log-code-response", tags=["Tasks"])
async def log_code_response(request: dict, db: Session = Depends(get_db)):
    """
    Log a user's code response when they hit the test case button.
    
    Request body:
    {
        "user_id": int,
        "question_id": str,  # ID of the code question
        "question_type": str,  # 'normal' or 'debug'
        "phase": str | null,  # 'pre-test' or 'post-test'
        "py_code": str,  # User's Python code (optional)
        "js_code": str,  # User's JavaScript code (optional)
        "submitted_language": str,  # 'python' or 'javascript'
        "state": str,  # 'started', 'failed', or 'passed'
    }
    """
    try:
        user_id = request.get("user_id")
        question_id = request.get("question_id")
        question_type = request.get("question_type", "normal")
        phase = request.get("phase")
        py_code = request.get("py_code")
        js_code = request.get("js_code")
        submitted_language = request.get("submitted_language")
        state = request.get("state")
        
        if not user_id or not question_id or not submitted_language or not state:
            return JSONResponse(
                status_code=400,
                content={"error": "user_id, question_id, submitted_language, and state are required"}
            )
        
        if state not in ['started', 'failed', 'passed']:
            return JSONResponse(
                status_code=400,
                content={"error": "state must be 'started', 'failed', or 'passed'"}
            )
        
        if submitted_language not in ['python', 'javascript']:
            return JSONResponse(
                status_code=400,
                content={"error": "submitted_language must be 'python' or 'javascript'"}
            )
        
        # Create response
        response_create = UserCodeSkillResponseCreate(
            user_id=user_id,
            question_id=question_id,
            question_type=question_type,
            phase=phase,
            py_code=py_code,
            js_code=js_code,
            submitted_language=submitted_language,
            state=state,
        )
        
        response = UserCodeSkillResponseCRUD.create(db, response_create)
        
        return {
            "success": True,
            "response_id": response.id
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to log code response: {str(e)}"}
        )


@app.post("/api/skill-check/report-question", tags=["Tasks"])
async def report_skill_check_question(request: dict, db: Session = Depends(get_db)):
    """
    Report a skill check question with rationale.
    Also logs the response as incorrect with empty answers.
    
    Request body:
    {
        "user_id": int,
        "question_id": str,  # ID of the reported question
        "question_type": str,  # 'experience', 'nasa_tli', 'ux', 'frontend', 'coding'
        "phase": str | null,  # 'pre-test' or 'post-test'
        "report_type": str,  # 'issue_stops_solving', 'frustrated_unable_to_solve', or 'other'
        "rationale": str,  # Required rationale explaining the report
    }
    """
    try:
        user_id = request.get("user_id")
        question_id = request.get("question_id")
        question_type = request.get("question_type")
        phase = request.get("phase")
        report_type = request.get("report_type")
        rationale = request.get("rationale")
        
        if not user_id or not question_id or not question_type or not report_type or not rationale:
            return JSONResponse(
                status_code=400,
                content={"error": "user_id, question_id, question_type, report_type, and rationale are required"}
            )
        
        if report_type not in ['issue_stops_solving', 'frustrated_unable_to_solve', 'other']:
            return JSONResponse(
                status_code=400,
                content={"error": "report_type must be 'issue_stops_solving', 'frustrated_unable_to_solve', or 'other'"}
            )
        
        trimmed_rationale = rationale.strip()
        if not trimmed_rationale:
            return JSONResponse(
                status_code=400,
                content={"error": "rationale cannot be empty"}
            )
        
        # Check word count (minimum 10 words)
        word_count = len(trimmed_rationale.split())
        if word_count < 10:
            return JSONResponse(
                status_code=400,
                content={"error": f"rationale must be at least 10 words (currently {word_count} words)"}
            )
        
        # Create the report
        report_create = ReportSkillCheckQuestionCreate(
            user_id=user_id,
            question_id=question_id,
            question_type=question_type,
            phase=phase,
            report_type=report_type,
            rationale=trimmed_rationale,
        )
        
        report = ReportSkillCheckQuestionCRUD.create(db, report_create)
        
        # Also log the response as incorrect with empty answers
        if question_type == 'coding':
            # Log code response with empty code and reported state
            code_type = request.get("code_type", "normal")  # Assume normal if not provided
            code_response_create = UserCodeSkillResponseCreate(
                user_id=user_id,
                question_id=question_id,
                question_type=code_type,
                phase=phase,
                py_code='',
                js_code='',
                submitted_language='python',  # Default, doesn't matter since code is empty
                state='reported',
            )
            UserCodeSkillResponseCRUD.create(db, code_response_create)
        else:
            # Log MCQA response with empty answers and incorrect
            mcqa_response_create = UserMCQASkillResponseCreate(
                user_id=user_id,
                question_id=question_id,
                question_type=question_type,
                phase=phase,
                answer_text=[],
                answer_letter=[],
                gold_answer_text=None,
                gold_answer_letter=None,
                correct=False,
            )
            UserMCQASkillResponseCRUD.create(db, mcqa_response_create)
        
        return {
            "success": True,
            "report_id": report.id
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to report question: {str(e)}"}
        )


@app.get("/api/skill-check/completion-status", tags=["Tasks"])
async def get_skill_check_completion_status(
    user_id: int = Query(..., description="User ID to check completion status for"),
    phase: str = Query(..., description="Phase to check: 'pre-test' or 'post-test'"),
    db: Session = Depends(get_db),
):
    """
    Check if a user has completed all questions for a given phase of the skill check.
    
    Returns:
    {
        "completed": boolean,
        "has_responses": boolean,  # True if user has any responses for this phase
        "total_expected": int,
        "total_answered": int
    }
    """
    print(f"\n🔍 COMPLETION-STATUS CALLED: user_id={user_id}, phase={phase}")
    try:
        if phase not in ["pre-test", "post-test"]:
            return JSONResponse(
                status_code=400,
                content={"error": "Phase must be 'pre-test' or 'post-test'"}
            )
        
        # Get user's assignment to know which questions they should have answered
        assignment = (
            db.query(SkillCheckAssignment)
            .filter(SkillCheckAssignment.user_id == user_id)
            .first()
        )
        
        if not assignment:
            # No assignment means user hasn't started
            print(f"⚠️  No assignment found for user_id={user_id}")
            return {
                "completed": False,
                "has_responses": False,
                "total_expected": 0,
                "total_answered": 0,
                "current_question_index": 0
            }
        
        # Determine expected question IDs based on phase
        expected_mcqa_question_ids = set()
        expected_code_question_ids = set()
        
        if phase == "pre-test":
            # Experience questions: all 10 (stored as "exp_1", "exp_2", etc.)
            for i in range(1, 7):
                expected_mcqa_question_ids.add(f"exp_{i}")
            
            # Frontend questions from assignment (now stored as names)
            if assignment.frontend_pre_test:
                for mcqa_name in assignment.frontend_pre_test:
                    # Assignment now stores names directly
                    if mcqa_name:
                        expected_mcqa_question_ids.add(f"frontend_{mcqa_name}")
            
            # Add sanity_frontend if assigned to pre-test
            if assignment.sanity_frontend_phase and assignment.sanity_frontend_phase == "pre-test":
                expected_mcqa_question_ids.add("frontend_sanity_frontend")
            
            # UX questions from assignment (now stored as names)
            if assignment.ux_pre_test:
                for mcqa_name in assignment.ux_pre_test:
                    # Assignment now stores names directly
                    if mcqa_name:
                        expected_mcqa_question_ids.add(f"ux_{mcqa_name}")
            
            # Add sanity_ux if assigned to pre-test
            if assignment.sanity_ux_phase and assignment.sanity_ux_phase == "pre-test":
                expected_mcqa_question_ids.add("ux_sanity_ux")
            
            # Code normal questions from assignment
            if assignment.code_pre_test:
                for task_name in assignment.code_pre_test:
                    expected_code_question_ids.add(f"code_normal_{task_name}")
            
            # Code debug questions from assignment
            if assignment.debug_pre_test:
                for task_name in assignment.debug_pre_test:
                    expected_code_question_ids.add(f"code_debug_{task_name}")
        else:  # post-test
            # NASA TLI questions: all 6 (stored as "nasa_1", "nasa_2", etc.)
            for i in range(1, 7):
                expected_mcqa_question_ids.add(f"nasa_{i}")
            
            # Frontend questions from assignment (now stored as names)
            if assignment.frontend_post_test:
                for mcqa_name in assignment.frontend_post_test:
                    # Assignment now stores names directly
                    if mcqa_name:
                        expected_mcqa_question_ids.add(f"frontend_{mcqa_name}")
            
            # Add sanity_frontend if assigned to post-test
            if assignment.sanity_frontend_phase and assignment.sanity_frontend_phase == "post-test":
                expected_mcqa_question_ids.add("frontend_sanity_frontend")
            
            # UX questions from assignment (now stored as names)
            if assignment.ux_post_test:
                for mcqa_name in assignment.ux_post_test:
                    # Assignment now stores names directly
                    if mcqa_name:
                        expected_mcqa_question_ids.add(f"ux_{mcqa_name}")
            
            # Add sanity_ux if assigned to post-test
            if assignment.sanity_ux_phase and assignment.sanity_ux_phase == "post-test":
                expected_mcqa_question_ids.add("ux_sanity_ux")
            
            # Code normal questions from assignment
            if assignment.code_post_test:
                for task_name in assignment.code_post_test:
                    expected_code_question_ids.add(f"code_normal_{task_name}")
            
            # Code debug questions from assignment
            if assignment.debug_post_test:
                for task_name in assignment.debug_post_test:
                    expected_code_question_ids.add(f"code_debug_{task_name}")
        
        # Get all MCQA responses for this user and phase
        mcqa_responses = db.query(UserMCQASkillResponse).filter(
            UserMCQASkillResponse.user_id == user_id,
            UserMCQASkillResponse.phase == phase
        ).all()
        
        # Get all code responses for this user and phase
        # Only count as answered if state is 'passed' or 'reported' (not 'started' or 'failed')
        code_responses = db.query(UserCodeSkillResponse).filter(
            UserCodeSkillResponse.user_id == user_id,
            UserCodeSkillResponse.phase == phase,
            UserCodeSkillResponse.state.in_(['passed', 'reported'])
        ).all()
        
        # Track answered questions (use question_id)
        answered_mcqa_ids = {resp.question_id for resp in mcqa_responses}
        answered_code_ids = {resp.question_id for resp in code_responses}
        
        # Check if all expected questions are answered
        all_mcqa_answered = expected_mcqa_question_ids.issubset(answered_mcqa_ids)
        all_code_answered = expected_code_question_ids.issubset(answered_code_ids)
        
        total_expected = len(expected_mcqa_question_ids) + len(expected_code_question_ids)
        total_answered = len(answered_mcqa_ids) + len(answered_code_ids)
        has_responses = len(mcqa_responses) > 0 or len(code_responses) > 0
        completed = all_mcqa_answered and all_code_answered
        
        # Build complete ordered list of all question IDs (matching get_skill_check_questions order)
        # Then find first unanswered question in that list
        current_question_index = 0
        
        if not completed:
            # Build ordered list exactly as get_skill_check_questions does
            ordered_question_ids = []
            
            # Section 1: Experience/NASA TLI questions
            # Must query the same way as get_skill_check_questions to get same IDs and order
            config_key = "pre_test" if phase == "pre-test" else "post_test"
            question_ids_config = SKILL_CHECK_QUESTION_IDS[config_key]
            
            if phase == "pre-test":
                # Load experience questions exactly as get_skill_check_questions does
                experience_questions = db.query(ExperienceData).filter(
                    ExperienceData.id.in_(question_ids_config["experience"])
                ).order_by(ExperienceData.id).all()  # Explicit ordering to match questions endpoint
                # Use actual IDs from database (same as questions endpoint)
                for q in experience_questions:
                    ordered_question_ids.append(f"exp_{q.id}")
            else:
                # Load NASA TLI questions exactly as get_skill_check_questions does
                nasa_questions = db.query(NasaTLIData).filter(
                    NasaTLIData.id.in_(question_ids_config["nasa_tli"])
                ).order_by(NasaTLIData.id).all()  # Explicit ordering to match questions endpoint
                # Use actual IDs from database (same as questions endpoint)
                for q in nasa_questions:
                    ordered_question_ids.append(f"nasa_{q.id}")
            
            # Section 2: Frontend questions (from assignment, in assignment order)
            if assignment:
                if phase == "pre-test":
                    frontend_names = assignment.frontend_pre_test or []
                else:
                    frontend_names = assignment.frontend_post_test or []
            else:
                # Fallback: use configured IDs and look up names (backward compatibility)
                config_key = "pre_test" if phase == "pre-test" else "post_test"
                frontend_ids = SKILL_CHECK_QUESTION_IDS[config_key]["frontend"]
                frontend_questions_by_id = db.query(MCQAData).filter(
                    MCQAData.type == "frontend",
                    MCQAData.id.in_(frontend_ids)
                ).all()
                frontend_names = [q.name for q in frontend_questions_by_id if q.name]
            
            # Build frontend question IDs using same logic as get_skill_check_questions
            # Need to load questions to check if they have names
            if frontend_names:
                frontend_questions_raw = db.query(MCQAData).filter(
                    MCQAData.type == "frontend",
                    MCQAData.name.in_(frontend_names)
                ).all()
                frontend_questions_map = {q.name: q for q in frontend_questions_raw}
                # Sort to match assignment order
                for name in frontend_names:
                    if name in frontend_questions_map:
                        q = frontend_questions_map[name]
                        # Use name as ID if available, fallback to numeric id (same as get_skill_check_questions)
                        question_id = f"frontend_{q.name}" if q.name else f"frontend_{q.id}"
                        ordered_question_ids.append(question_id)
                
                # Add sanity_frontend if assigned to this phase
                if assignment and assignment.sanity_frontend_phase and assignment.sanity_frontend_phase == phase:
                    ordered_question_ids.append("frontend_sanity_frontend")
            
            # Section 3: UX questions (from assignment, in assignment order)
            if assignment:
                if phase == "pre-test":
                    ux_names = assignment.ux_pre_test or []
                else:
                    ux_names = assignment.ux_post_test or []
            else:
                # Fallback: use configured IDs and look up names (backward compatibility)
                config_key = "pre_test" if phase == "pre-test" else "post_test"
                ux_ids = SKILL_CHECK_QUESTION_IDS[config_key]["ux"]
                ux_questions_by_id = db.query(MCQAData).filter(
                    MCQAData.type == "ux",
                    MCQAData.id.in_(ux_ids)
                ).all()
                ux_names = [q.name for q in ux_questions_by_id if q.name]
            
            # Build UX question IDs using same logic as get_skill_check_questions
            if ux_names:
                ux_questions_raw = db.query(MCQAData).filter(
                    MCQAData.type == "ux",
                    MCQAData.name.in_(ux_names)
                ).all()
                ux_questions_map = {q.name: q for q in ux_questions_raw}
                # Sort to match assignment order
                for name in ux_names:
                    if name in ux_questions_map:
                        q = ux_questions_map[name]
                        # Use name as ID if available, fallback to numeric id (same as get_skill_check_questions)
                        question_id = f"ux_{q.name}" if q.name else f"ux_{q.id}"
                        ordered_question_ids.append(question_id)
                
                # Add sanity_ux if assigned to this phase
                if assignment and assignment.sanity_ux_phase and assignment.sanity_ux_phase == phase:
                    ordered_question_ids.append("ux_sanity_ux")
            
            # Section 4: Code normal questions (from assignment, in assignment order)
            if assignment:
                if phase == "pre-test":
                    code_normal_names = assignment.code_pre_test or []
                else:
                    code_normal_names = assignment.code_post_test or []
            else:
                code_normal_names = []
            
            for task_name in code_normal_names:
                ordered_question_ids.append(f"code_normal_{task_name}")
            
            # Section 5: Code debug questions (from assignment, in assignment order)
            if assignment:
                if phase == "pre-test":
                    code_debug_names = assignment.debug_pre_test or []
                else:
                    code_debug_names = assignment.debug_post_test or []
            else:
                code_debug_names = []
            
            for task_name in code_debug_names:
                ordered_question_ids.append(f"code_debug_{task_name}")
            
            # Find first unanswered question in the ordered list
            all_answered_ids = answered_mcqa_ids | answered_code_ids
            for idx, q_id in enumerate(ordered_question_ids):
                if q_id not in all_answered_ids:
                    current_question_index = idx
                    break
            else:
                # All questions answered (shouldn't happen if completed is False, but handle it)
                current_question_index = len(ordered_question_ids)
        
        return {
            "completed": completed,
            "has_responses": has_responses,
            "total_expected": total_expected,
            "total_answered": total_answered,
            "current_question_index": current_question_index
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to check completion status: {str(e)}"}
        )


@app.post("/api/skill-check/log-navigation-event", tags=["Tasks"])
async def log_navigation_event(request: dict, db: Session = Depends(get_db)):
    """
    Log a navigation event (tab switching, window focus changes) during skill checks.
    
    Request body:
    {
        "user_id": int,
        "question_id": str | null,  # ID of the question (optional)
        "test_type": str,  # 'pre-test' or 'post-test'
        "time_away_ms": int | null,  # Time away in milliseconds (optional, only when user returns)
    }
    """
    try:
        user_id = request.get("user_id")
        question_id = request.get("question_id")
        test_type = request.get("test_type")
        time_away_ms = request.get("time_away_ms")
        
        if not user_id or not test_type:
            return JSONResponse(
                status_code=400,
                content={"error": "user_id and test_type are required"}
            )
        
        if test_type not in ['pre-test', 'post-test']:
            return JSONResponse(
                status_code=400,
                content={"error": "test_type must be 'pre-test' or 'post-test'"}
            )
        
        # Create navigation event
        event_create = NavigationEventCreate(
            user_id=user_id,
            question_id=question_id,
            test_type=test_type,
            time_away_ms=time_away_ms,
        )
        
        event = NavigationEventCRUD.create(db, event_create)
        
        return {
            "success": True,
            "event_id": event.id
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to log navigation event: {str(e)}"}
        )


@app.get("/api/task-files-db", tags=["Tasks"])
async def get_task_files_from_db(taskId: str, userId: Optional[int] = None, db: Session = Depends(get_db)):
    try:
        # Find by slug of name
        _sync_project_dates_from_dummy(db)
        project = None
        for p in db.query(Project).all():
            if _slugify(p.name) == taskId:
                project = p
                break
        if not project:
            return JSONResponse(status_code=404, content={"error": "Task not found"})

        # Helper to resolve a repo-relative path (e.g., data/code_files/...) to file content
        def resolve_content(value: str) -> str:
            try:
                if isinstance(value, str) and value.startswith("data/"):
                    backend_dir = os.path.dirname(__file__)
                    repo_root = os.path.abspath(os.path.join(backend_dir, ".."))
                    file_path = os.path.join(repo_root, value)
                    if os.path.exists(file_path):
                        with open(file_path, "r", encoding="utf-8") as f:
                            return f.read()
                    return f"// File not found: {value}"
                return value or ""
            except Exception as e:
                return f"// Error reading file: {str(e)}"

        # Helper to determine language key from file name
        def get_language_key_from_filename(filename: str) -> Optional[str]:
            lower = filename.lower()
            if lower.endswith('.html'):
                return 'html'
            elif lower.endswith('.css'):
                return 'css'
            elif lower.endswith(('.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx')):
                return 'js'
            return None

        files = []
        user_code = None
        
        # If userId is provided, try to load saved code first
        if userId:
            user_code = CodeCRUD.get_latest_by_user_and_project(db, user_id=userId, project_id=project.id)
        
        # If user has saved code, use it; otherwise use project starter files
        if user_code and user_code.code:
            # Use saved user code, mapping language keys to file names
            saved_code = user_code.code
            for fileConfig in (project.files or []):
                try:
                    name = fileConfig.get("name")
                    language = fileConfig.get("language", "plaintext")
                    lang_key = get_language_key_from_filename(name)
                    
                    # If we have saved code for this language, use it; otherwise use default
                    if lang_key and lang_key in saved_code:
                        content = saved_code[lang_key] or ""
                    else:
                        # Fall back to project starter file
                        content = resolve_content(fileConfig.get("content", ""))
                    
                    files.append({
                        "id": name,
                        "name": name,
                        "type": "file",
                        "content": content,
                        "language": language,
                    })
                except Exception as e:
                    print(f"Error loading file from user code: {e}")
        else:
            # No saved code, use project starter files
            for fileConfig in (project.files or []):
                try:
                    name = fileConfig.get("name")
                    language = fileConfig.get("language", "plaintext")
                    content = fileConfig.get("content", "")
                    files.append({
                        "id": name,
                        "name": name,
                        "type": "file",
                        "content": resolve_content(content),
                        "language": language,
                    })
                except Exception as e:
                    print(f"Error loading file from project.files: {e}")

        return {
            "files": files,
            "projectId": project.id,
            "projectName": project.name,
            "codeStartDate": project.code_start_date.isoformat() if project.code_start_date else None,
            "votingStartDate": project.voting_start_date.isoformat() if project.voting_start_date else None,
            "votingEndDate": project.voting_end_date.isoformat() if project.voting_end_date else None,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/code-logs", tags=["Code"])
async def log_code_snapshot(payload: CodeLogRequest, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        project = None
        if payload.project_id is not None:
            project = db.query(Project).filter(Project.id == payload.project_id).first()

        if project is None and payload.task_id:
            slug = payload.task_id.lower()
            for candidate in db.query(Project).all():
                if _slugify(candidate.name) == slug:
                    project = candidate
                    break

        if project is None:
            return JSONResponse(status_code=404, content={"error": "Project not found"})

        code_payload = {key: (value or "") for key, value in (payload.code or {}).items()}
        if not code_payload:
            return JSONResponse(status_code=400, content={"error": "Code payload is empty"})

        metadata = dict(payload.metadata or {})
        if payload.event:
            metadata.setdefault("event", payload.event)
        metadata.setdefault("recorded_at", datetime.utcnow().isoformat())
        metadata.setdefault("code_keys", list(code_payload.keys()))
        metadata.setdefault("mode", payload.mode or "regular")
        if payload.task_id:
            metadata.setdefault("task_id", payload.task_id)
        metadata.setdefault("user_id", payload.user_id)

        code_create = CodeCreate(
            user_id=payload.user_id,
            project_id=project.id,
            code=code_payload,
            mode=payload.mode or "regular",
            metadata=metadata,
        )

        code_record = CodeCRUD.create(db, code_create)
        return {"success": True, "codeId": code_record.id}

    except Exception as e:
        print(f"Error logging code snapshot: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to log code snapshot"})


@app.post("/api/submissions", tags=["Submissions"])
async def create_submission(payload: SubmissionRequest, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        project = None
        if payload.project_id is not None:
            project = db.query(Project).filter(Project.id == payload.project_id).first()

        if project is None and payload.task_id:
            slug = _slugify(payload.task_id)
            for candidate in db.query(Project).all():
                if _slugify(candidate.name) == slug:
                    project = candidate
                    break

        if project is None:
            return JSONResponse(status_code=404, content={"error": "Project not found"})

        code_payload = {}
        for key, value in (payload.code or {}).items():
            try:
                code_payload[str(key)] = "" if value is None else str(value)
            except Exception:
                code_payload[str(key)] = ""

        if not code_payload:
            return JSONResponse(status_code=400, content={"error": "Submission code payload cannot be empty"})

        submission_create = SubmissionCreate(
            user_id=user.id,
            project_id=project.id,
            code=code_payload,
            title=payload.title.strip(),
            description=(payload.description or "").strip() or None,
            image=payload.image,
        )

        submission_record = SubmissionCRUD.create(db, submission_create)
        
        # Update comprehension questions with user answers and scores
        if payload.comprehension_answers:
            print(f"Updating comprehension answers for {len(payload.comprehension_answers)} questions")
            for question_name, user_answer in payload.comprehension_answers.items():
                # Find the most recent comprehension question for this user, project, and question_name
                question = db.query(ComprehensionQuestion).filter(
                    ComprehensionQuestion.user_id == payload.user_id,
                    ComprehensionQuestion.project_id == project.id,
                    ComprehensionQuestion.question_name == question_name
                ).order_by(ComprehensionQuestion.created_at.desc()).first()
                
                if question:
                    print(f"Found question: {question_name}, type: {question.question_type}, answer: {question.answer}, user_answer: {user_answer}")
                    # Parse user_answer - it should be a binary array for multi_select, string for others
                    parsed_user_answer = user_answer
                    if question.question_type == 'multi_select':
                        # user_answer should already be a binary array from frontend
                        if isinstance(user_answer, str):
                            import json
                            try:
                                parsed_user_answer = json.loads(user_answer)
                            except:
                                parsed_user_answer = user_answer
                        elif not isinstance(user_answer, list):
                            parsed_user_answer = []
                    else:
                        # For non-multi_select, keep as string
                        parsed_user_answer = str(user_answer) if user_answer else None
                    
                    # Update user_answer (store as JSON for multi_select, string for others)
                    question.user_answer = parsed_user_answer
                    
                    # Calculate score for self_report questions (extract number 1-5 from answer)
                    if question_name and question_name.startswith('self_report'):
                        try:
                            # user_answer is a string like "1 - Strongly disagree" or "5 - Strongly agree"
                            user_answer_str = str(parsed_user_answer) if parsed_user_answer else ""
                            # Extract the number at the start (1-5)
                            import re
                            match = re.match(r'^(\d+)', user_answer_str.strip())
                            if match:
                                score_value = int(match.group(1))
                                # Ensure it's between 1 and 5
                                if 1 <= score_value <= 5:
                                    question.score = float(score_value)
                                    print(f"  Question {question_name}: self_report score = {question.score}")
                                else:
                                    print(f"  Question {question_name}: invalid score value {score_value}, expected 1-5")
                                    question.score = None
                            else:
                                print(f"  Question {question_name}: could not extract score from answer '{user_answer_str}'")
                                question.score = None
                        except Exception as e:
                            print(f"  Error calculating self_report score for question {question_name}: {e}")
                            import traceback
                            traceback.print_exc()
                            question.score = None
                    
                    # Calculate score for multi_select questions that have an answer field
                    elif question.question_type == 'multi_select':
                        print(f"Processing multi_select question: {question_name}")
                        print(f"  question.answer: {question.answer}, type: {type(question.answer)}")
                        if question.answer is not None:
                            try:
                                # Parse the correct answer array (should be a list like [1, 0, 1, 0])
                                correct_answers = question.answer
                                if isinstance(correct_answers, str):
                                    # Handle PostgreSQL array format {0,1,1,0} or JSON format [0,1,1,0]
                                    if correct_answers.strip().startswith('{') and correct_answers.strip().endswith('}'):
                                        # PostgreSQL array format: {0,1,1,0} -> [0,1,1,0]
                                        array_str = correct_answers.strip()[1:-1]  # Remove curly braces
                                        correct_answers = [int(x.strip()) for x in array_str.split(',') if x.strip()]
                                    else:
                                        # Try JSON format
                                        import json
                                        correct_answers = json.loads(correct_answers)
                                
                                if not isinstance(correct_answers, list):
                                    print(f"  Warning: answer is not a list, got: {type(correct_answers)}")
                                    correct_answers = []
                                
                                # user_answer should already be a binary array [1, 0, 1, 0]
                                user_selected = parsed_user_answer if isinstance(parsed_user_answer, list) else []
                                print(f"  correct_answers: {correct_answers}, user_selected: {user_selected}")
                                
                                # Calculate score: percentage of correct matches
                                # Compare element by element: correct_answers[i] should match user_selected[i]
                                if len(correct_answers) == len(user_selected) and len(correct_answers) > 0:
                                    matches = sum(1 for i in range(len(correct_answers)) if correct_answers[i] == user_selected[i])
                                    question.score = matches / len(correct_answers)
                                    print(f"  Question {question_name}: score = {question.score} ({matches}/{len(correct_answers)} matches)")
                                else:
                                    question.score = 0.0
                                    print(f"  Question {question_name}: length mismatch - correct: {len(correct_answers)}, user: {len(user_selected)}")
                            except Exception as e:
                                print(f"  Error calculating score for question {question_name}: {e}")
                                import traceback
                                traceback.print_exc()
                                question.score = None
                        else:
                            print(f"  Question {question_name} has no answer field, skipping score calculation")
                    
                    # Calculate score for MCQA questions that have an answer field (e.g., sanity_check)
                    elif question.question_type == 'mcqa' and question.answer is not None:
                        print(f"Processing MCQA question: {question_name}")
                        print(f"  question.answer: {question.answer}, type: {type(question.answer)}, user_answer: {parsed_user_answer}")
                        try:
                            # Parse the correct answer (should be an integer index, 1-based)
                            correct_answer = question.answer
                            if isinstance(correct_answer, str):
                                correct_answer = int(correct_answer.strip())
                            elif not isinstance(correct_answer, (int, float)):
                                print(f"  Warning: answer is not a number, got: {type(correct_answer)}")
                                correct_answer = None
                            
                            if correct_answer is not None:
                                # Parse user_answer - it might be a string like "1 - Strongly disagree" or just "1"
                                user_answer_str = str(parsed_user_answer) if parsed_user_answer else ""
                                # Extract the number at the start (1-5 or whatever the index is)
                                import re
                                match = re.match(r'^(\d+)', user_answer_str.strip())
                                if match:
                                    user_answer_idx = int(match.group(1))
                                    # Compare the user's answer index with the correct answer index
                                    if user_answer_idx == correct_answer:
                                        question.score = 1.0
                                        print(f"  Question {question_name}: score = 1.0 (correct answer)")
                                    else:
                                        question.score = 0.0
                                        print(f"  Question {question_name}: score = 0.0 (user selected {user_answer_idx}, correct was {correct_answer})")
                                else:
                                    print(f"  Question {question_name}: could not extract index from answer '{user_answer_str}'")
                                    question.score = None
                            else:
                                print(f"  Question {question_name}: invalid answer format")
                                question.score = None
                        except Exception as e:
                            print(f"  Error calculating score for MCQA question {question_name}: {e}")
                            import traceback
                            traceback.print_exc()
                            question.score = None
                    
                    db.flush()
                    print(f"  Updated question {question_name}: user_answer={question.user_answer}, score={question.score}")
            
            db.commit()
        
        return {"success": True, "submissionId": submission_record.id}
    except Exception as e:
        print(f"Error creating submission: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to create submission"})


@app.get("/api/submissions", tags=["Submissions"])
async def list_submissions(
    project_id: Optional[int] = Query(default=None, alias="projectId"),
    task_id: Optional[str] = Query(default=None, alias="taskId"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    voter_id: Optional[int] = Query(default=None, alias="voterId"),
    filter_unseen: Optional[str] = Query(default=None, alias="filterUnseen"),
    filter_saved: Optional[str] = Query(default=None, alias="filterSaved"),
    filter_not_reported: Optional[str] = Query(default=None, alias="filterNotReported"),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(Submission)

        if project_id is not None:
            query = query.filter(Submission.project_id == project_id)
        elif task_id:
            slug = _slugify(task_id)
            project = None
            for candidate in db.query(Project).all():
                if _slugify(candidate.name) == slug:
                    project = candidate
                    break
            if project is None:
                return JSONResponse(status_code=404, content={"error": "Project not found for taskId"})
            query = query.filter(Submission.project_id == project.id)

        # Convert string query params to booleans - handle None and empty strings
        filter_unseen_bool = filter_unseen is not None and str(filter_unseen).lower() == "true"
        filter_saved_bool = filter_saved is not None and str(filter_saved).lower() == "true"
        filter_not_reported_bool = filter_not_reported is not None and str(filter_not_reported).lower() == "true"
        
        # Apply filters based on voter feedback if voter_id is provided
        if voter_id is not None and (filter_unseen_bool or filter_saved_bool or filter_not_reported_bool):
            from sqlalchemy import func
            from sqlalchemy.orm import aliased
            
            # Get all feedback for this voter, ordered by most recent first
            # Then we'll join to get the most recent feedback per submission
            feedback_alias = aliased(SubmissionFeedback)
            
            # Subquery: Get the most recent feedback timestamp for each submission
            most_recent_time_subq = (
                db.query(
                    SubmissionFeedback.submission_id,
                    func.max(SubmissionFeedback.created_at).label("max_created_at")
                )
                .filter(SubmissionFeedback.voter_id == voter_id)
                .group_by(SubmissionFeedback.submission_id)
                .subquery()
            )
            
            # Subquery: Get the actual most recent feedback record for each submission
            most_recent_feedback_subq = (
                db.query(
                    feedback_alias.submission_id,
                    feedback_alias.is_saved,
                    feedback_alias.is_reported
                )
                .join(
                    most_recent_time_subq,
                    (feedback_alias.submission_id == most_recent_time_subq.c.submission_id) &
                    (feedback_alias.created_at == most_recent_time_subq.c.max_created_at) &
                    (feedback_alias.voter_id == voter_id)
                )
                .subquery()
            )
            
            # Build OR conditions for filters (submission must match at least one checked filter)
            filter_conditions = []
            
            # LEFT OUTER JOIN to get feedback data (NULL if no feedback exists)
            query = query.outerjoin(
                most_recent_feedback_subq,
                Submission.id == most_recent_feedback_subq.c.submission_id
            )
            
            if filter_unseen_bool:
                # Submissions where user has no feedback at all (unseen)
                # The LEFT JOIN will have NULL submission_id for unseen submissions
                condition = most_recent_feedback_subq.c.submission_id.is_(None)
                filter_conditions.append(condition)
            
            if filter_saved_bool:
                # Submissions where user has saved (is_saved = True in most recent feedback)
                condition = most_recent_feedback_subq.c.is_saved == True
                filter_conditions.append(condition)
            
            if filter_not_reported_bool:
                # Submissions where user hasn't reported
                # This means: no feedback exists (unseen) OR feedback exists with is_reported = False
                # Since we're using LEFT JOIN, if submission_id IS NULL, then is_reported is also NULL
                # So we want: (submission_id IS NULL) OR (is_reported = False)
                condition = (
                    (most_recent_feedback_subq.c.submission_id.is_(None)) |
                    (most_recent_feedback_subq.c.is_reported == False)
                )
                filter_conditions.append(condition)
            
            # Apply AND logic: submission must match ALL filter conditions
            if filter_conditions:
                query = query.filter(and_(*filter_conditions))

        # Get all submissions for the project, ordered by most recent first
        all_submissions = (
            query.order_by(Submission.created_at.desc())
            .all()
        )
        
        # Group by user_id and keep only the most recent submission for each user
        most_recent_by_user: Dict[int, Submission] = {}
        for submission in all_submissions:
            user_id = submission.user_id
            if user_id not in most_recent_by_user:
                most_recent_by_user[user_id] = submission
            else:
                # Keep the most recent one (since we're already ordered by created_at desc)
                existing = most_recent_by_user[user_id]
                if submission.created_at and existing.created_at:
                    if submission.created_at > existing.created_at:
                        most_recent_by_user[user_id] = submission
        
        # Convert to list and apply pagination
        submissions = list(most_recent_by_user.values())
        # Sort by created_at descending (most recent first)
        # Use a very old date as fallback for None values
        min_date = datetime(1970, 1, 1)
        submissions.sort(key=lambda s: s.created_at if s.created_at else min_date, reverse=True)
        # Apply pagination
        submissions = submissions[skip:skip + limit]

        submission_ids = [submission.id for submission in submissions]
        feedback_summaries: Dict[int, Dict[str, Any]] = {}
        if submission_ids:
            # Order by created_at desc to make it easier to find most recent per voter
            feedback_entries = (
                db.query(SubmissionFeedback)
                .filter(SubmissionFeedback.submission_id.in_(submission_ids))
                .order_by(SubmissionFeedback.created_at.desc())
                .all()
            )
            feedback_by_submission: Dict[int, List[SubmissionFeedback]] = defaultdict(list)
            for entry in feedback_entries:
                feedback_by_submission[entry.submission_id].append(entry)

            for submission_id, entries in feedback_by_submission.items():
                feedback_summaries[submission_id] = build_rating_summary(entries)

        response: List[Dict[str, Any]] = []
        for submission in submissions:
            rating_summary = feedback_summaries.get(
                submission.id, {"average": None, "count": 0, "perMetric": {}}
            )
            response.append(
                {
                    "id": submission.id,
                    "title": submission.title,
                    "description": submission.description,
                    "image": submission.image,
                    "projectId": submission.project_id,
                    "userId": submission.user_id,
                    "createdAt": submission.created_at.isoformat() if submission.created_at else None,
                    "updatedAt": submission.updated_at.isoformat() if submission.updated_at else None,
                    "ratingSummary": rating_summary,
                }
            )

        return {"items": response, "count": len(response), "hasMore": len(response) == limit}
    except Exception as e:
        print(f"Error listing submissions: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to list submissions"})


@app.get("/api/submissions/{submission_id}", tags=["Submissions"])
async def get_submission_detail(submission_id: int, db: Session = Depends(get_db)):
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return JSONResponse(status_code=404, content={"error": "Submission not found"})

        return {
            "id": submission.id,
            "title": submission.title,
            "description": submission.description,
            "image": submission.image,
            "projectId": submission.project_id,
            "userId": submission.user_id,
            "createdAt": submission.created_at.isoformat() if submission.created_at else None,
            "updatedAt": submission.updated_at.isoformat() if submission.updated_at else None,
            "code": submission.code or {},
            "ratingSummary": build_rating_summary(
                db.query(SubmissionFeedback)
                .filter(SubmissionFeedback.submission_id == submission_id)
                .order_by(SubmissionFeedback.created_at.desc())
                .all()
            ),
        }
    except Exception as e:
        print(f"Error fetching submission detail: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to fetch submission"})


@app.post("/api/submissions/{submission_id}/feedback", tags=["Submissions"])
async def submit_submission_feedback(submission_id: int, payload: SubmissionFeedbackRequest, db: Session = Depends(get_db)):
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return JSONResponse(status_code=404, content={"error": "Submission not found"})

        normalized_scores: Dict[str, int] = {}
        for key, value in (payload.scores or {}).items():
            try:
                numeric_value = int(value)
            except (TypeError, ValueError):
                numeric_value = 0
            numeric_value = max(1, min(5, numeric_value))
            normalized_scores[str(key)] = numeric_value

        normalized_comment = (payload.comment or "").strip() or None
        normalized_report_type = (payload.report_type or "").strip() or None if payload.report_type else None
        normalized_report_rationale = (payload.report_rationale or "").strip() or None if payload.report_rationale else None

        # Always create a new record instead of updating
        feedback_create = SubmissionFeedbackCreate(
            submission_id=submission.id,
            project_id=submission.project_id,
            voter_id=payload.voter_id,
            scores=normalized_scores,
            comment=normalized_comment,
            is_saved=payload.is_saved if payload.is_saved is not None else False,
            is_reported=payload.is_reported if payload.is_reported is not None else False,
            report_type=normalized_report_type,
            report_rationale=normalized_report_rationale,
        )
        feedback_record = SubmissionFeedbackCRUD.create(db, feedback_create)
        return SubmissionFeedbackModel.from_orm(feedback_record)
    except Exception as e:
        print(f"Error submitting submission feedback: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to submit feedback"})


@app.get("/api/submissions/{submission_id}/feedback", tags=["Submissions"])
async def get_submission_feedback(
    submission_id: int,
    voter_id: Optional[int] = Query(default=None, alias="voterId"),
    db: Session = Depends(get_db),
):
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return JSONResponse(status_code=404, content={"error": "Submission not found"})

        if voter_id is not None:
            feedback = SubmissionFeedbackCRUD.get_by_submission_and_voter(db, submission_id, voter_id)
            if not feedback:
                return JSONResponse(status_code=404, content={"error": "Feedback not found"})
            return SubmissionFeedbackModel.from_orm(feedback)

        feedback_entries = (
            db.query(SubmissionFeedback)
            .filter(SubmissionFeedback.submission_id == submission_id)
            .order_by(SubmissionFeedback.created_at.desc())
            .all()
        )
        return [SubmissionFeedbackModel.from_orm(entry) for entry in feedback_entries]
    except Exception as e:
        print(f"Error fetching submission feedback: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to fetch feedback"})


@app.post("/api/comprehension-questions/generate", tags=["Comprehension Questions"])
async def generate_comprehension_questions(
    payload: GenerateComprehensionQuestionsRequest,
    db: Session = Depends(get_db)
):
    """
    Generate comprehension questions for a submission and store them in the database.
    This endpoint will auto-generate questions based on the submission content.
    """
    try:
        # Verify user exists
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        # Verify project exists
        project = db.query(Project).filter(Project.id == payload.project_id).first()
        if not project:
            return JSONResponse(status_code=404, content={"error": "Project not found"})

        # TODO: Implement question generation logic here
        # This is a placeholder - you will fill in the actual generation logic
        generated_questions = await _generate_comprehension_questions(
            submission_title=payload.submission_title,
            submission_description=payload.submission_description,
            submission_code=payload.submission_code
        )

        # Store questions in database
        created_questions = []
        for question_data in generated_questions:
            question_record = ComprehensionQuestion(
                user_id=payload.user_id,
                project_id=payload.project_id,
                question_name=question_data["question_name"],
                question=question_data["question"],
                question_type=question_data["question_type"],
                choices=question_data.get("choices"),
                answer=question_data.get("answer"),
                user_answer=None,
                score=None
            )
            db.add(question_record)
            db.flush()
            created_questions.append({
                "id": question_record.id,
                "question_name": question_record.question_name,
                "question": question_record.question,
                "question_type": question_record.question_type,
                "choices": question_record.choices
            })

        db.commit()

        return {
            "success": True,
            "questions": created_questions,
            "count": len(created_questions)
        }

    except Exception as e:
        db.rollback()
        print(f"Error generating comprehension questions: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to generate comprehension questions: {str(e)}"}
        )

def generate_distractor_functions(function_names: list[str]) -> list[str]:
    """
    Generate plausible function names that don't exist in the code.
    """

    random_model = random.choice(["openai/gpt-5.1-2025-11-13", "anthropic/claude-sonnet-4-5-20250929", "gemini/gemini-3-pro-preview"])
    backup_model = "gemini/gemini-3-pro-preview"


    prompt = """
<task>
You are an expert at generating function names that do not exist in a user's code but plausibly could.

Given a list of function names, generate exactly five function names that mimic the style of the existing function names, but do not actually exist. For example, if the existing function names are "playTurn" and "setupLogic", you could generate distractors like "endTurn" and "setupGame". We will eventually show these function names to users and ask them to identify which function names exist (the inputs you are given) and which do not exist (the function names you will generate), testing their comprehension of their own code.
</task>

Here are the existing function names:
<function_names>
{function_names}
</function_names>

<function requirements>
- Mimic the style and content of the existing function names
- None of the generated function names should be the same as the existing function names. This is extremely important.
</function requirements>

<format>
Generate your output as a JSON with the key "fake_function_names" and the value being an array of exactly five function names as strings:
{{
    "fake_function_names": ["function_name_1", "function_name_2", "function_name_3", "function_name_4", "function_name_5"]
}}

Do not generate anything else.
</format>
""".format(function_names=function_names).strip()

    for num_tries in range(3):
        response = litellm.completion(
            model=random_model if num_tries == 0 else backup_model,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        output = response.choices[0].message.content.replace('`', '').replace('json', '').strip()
        if "{" in output and "}" in output:
            output = output[output.index("{"):output.rindex("}")+1].strip()
        output = json.loads(output)
        if type(output.get("fake_function_names", [])) == list and len(output.get("fake_function_names", [])) == 5:
            return output["fake_function_names"]
    return []

def generate_ui_features(html_code: str, css_code: str, js_code: str) -> List[str]:

    random_model = random.choice(["openai/gpt-5.1-2025-11-13", "anthropic/claude-sonnet-4-5-20250929", "gemini/gemini-3-pro-preview"])
    backup_model = "gemini/gemini-3-pro-preview"

    prompt = """
<task>
You are an expert at generating a set of features that exist in a user's website, and a set of features that do not exist in a user's website.

Given the user's HTML, CSS, and JavaScript code, generate a set of five features that exist in the website, and a set of five features that do not exist in the website but plausibly could exist in the website. We will eventually show these features to users and ask them to identify which features exist and which do not exist, testing their comprehension of their own website.
</task>

Here is the HTML code:
<html>
{html}
</html>

Here is the CSS code:
<css>
{css}
</css>

Here is the JavaScript code:
<javascript>
{js}
</javascript>

<feature requirements>
- Each feature should be a concise sentence/phrase, no more than 10 words.
- All features should be user-centered, describing elements that the users can see and interact with, or certain functionalities present in the website.
- Features can span visual elements, certain stylings, and features. For example, "There is a button to toggle between light and dark mode" or "Users can upload a profile picture".
- When generating features that do exist in the webiste, make sure that they actually exist.
- When generating features that do not exist in the website, make sure that they do not exist. However, they should be things that plausibly could exist in this website.
- You never hallucinate.
- Generate exactly five real features and five fake features.
</feature requirements>

<format>
Generate your output as a JSON with two keys: 1) "real_features" - an array of five features that exist in the website; and 2) "fake_features" - an array of five features that do not exist in the website:
{{
    "real_features": ["feature_1", "feature_2", "feature_3", "feature_4", "feature_5"],
    "fake_features": ["feature_6", "feature_7", "feature_8", "feature_9", "feature_10"]
}}

Do not generate anything else.
</format>
""".format(html=html_code, css=css_code, js=js_code).strip()

    for num_tries in range(3):
        response = litellm.completion(
            model=random_model if num_tries == 0 else backup_model,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        output = response.choices[0].message.content.replace('`', '').replace('json', '').strip()
        if "{" in output and "}" in output:
            output = output[output.index("{"):output.rindex("}")+1].strip()
        output = json.loads(output)
        if type(output.get("real_features", [])) == list and type(output.get("fake_features", [])) == list and len(output.get("real_features", [])) == 5 and len(output.get("fake_features", [])) == 5:
            return output["real_features"], output["fake_features"]
    return [], []

def generate_ui_questions(submission_code: Dict[str, str]) -> List[Dict[str, Any]]:

    MAX_FEATURES_TO_SHOW = 4
    questions = []

    # 1) Get the user's current code - combine all JavaScript files
    js_code = ""
    html_code = ""
    css_code = ""
    
    for filename, code_content in submission_code.items():
        if filename.endswith('.js') or filename.endswith('.javascript'):
            js_code += code_content + "\n\n"
        elif filename.endswith('.html'):
            html_code += code_content + "\n\n"
        elif filename.endswith('.css'):
            css_code += code_content + "\n\n"

    real_features, fake_features = generate_ui_features(html_code, css_code, js_code)
    if len(real_features) == 0 or len(fake_features) == 0:
        return []
    all_features = real_features + fake_features
    random.shuffle(all_features)
    all_features = all_features[:MAX_FEATURES_TO_SHOW]
    
    questions.append({
        "question_name": "ui_features_distractors",
        "question": f"Which of the following features exist in your website? It is possible that all of these or none of these exist.",
        "question_type": "multi_select",
        "choices": [x for x in all_features],
        "answer": [1 if x in real_features else 0 for x in all_features]
    })
    return questions

def generate_js_questions(submission_code: Dict[str, str]) -> List[Dict[str, Any]]:
    """ 
    Generate comprehension questions based on the user's submitted code.
    
    Args:
        submission_code: Dictionary mapping filename to code content
        
    Returns:
        List of question dictionaries
    """
    MAX_FUNCTION_NAMES_TO_SHOW = 4
    questions = []
    
    # 1) Get the user's current code - combine all JavaScript files
    js_code = ""
    html_code = ""
    css_code = ""
    
    for filename, code_content in submission_code.items():
        if filename.endswith('.js') or filename.endswith('.javascript'):
            js_code += code_content + "\n\n"
        elif filename.endswith('.html'):
            html_code += code_content + "\n\n"
        elif filename.endswith('.css'):
            css_code += code_content + "\n\n"

    # Parse JavaScript functions
    functions_map = _parse_javascript_functions(js_code)

    if len(functions_map) == 0:
        return []

    real_function_names = list(functions_map.keys())
    fake_function_names = generate_distractor_functions(real_function_names)
    
    # Filter functions with more than 10 lines of code
    large_functions = {
        name: code 
        for name, code in functions_map.items() 
        if len(code.split('\n')) > 20
    }
    # Randomly sample one function if any exist
    if large_functions:
        sampled_function_name = random.choice(list(large_functions.keys()))
        sampled_function_code = large_functions[sampled_function_name]
        print(f"Sampled function '{sampled_function_name}':")
        print(sampled_function_code)
    else:
        # Pick the function with the largest lines
        function_lengths = {name: len(code.split('\n')) for name, code in functions_map.items()}
        sampled_function_name = max(function_lengths, key=function_lengths.get)
        sampled_function_code = functions_map[sampled_function_name]
        print(f"Sampled function '{sampled_function_name}' (largest lines):")
        print(sampled_function_code)

    real_function_names_minus_large = [name for name in real_function_names if name != sampled_function_name]
    if len(fake_function_names) > len(real_function_names_minus_large):
        random.shuffle(fake_function_names)
        fake_function_names = fake_function_names[:len(real_function_names_minus_large)]
    if len(real_function_names_minus_large) > len(fake_function_names):
        random.shuffle(real_function_names_minus_large)
        real_function_names_minus_large = real_function_names_minus_large[:len(fake_function_names)]
    all_function_names_to_show = real_function_names_minus_large + fake_function_names
    if len(all_function_names_to_show) > MAX_FUNCTION_NAMES_TO_SHOW:
        random.shuffle(all_function_names_to_show)
        all_function_names_to_show = all_function_names_to_show[:MAX_FUNCTION_NAMES_TO_SHOW]

    questions.append({
        "question_name": "function_names_distractors",
        "question": f"Which of the following JavaScript functions exist in your code? It is possible that all of these or none of these exist.",
        "question_type": "multi_select",
        "choices": [x + '()' for x in all_function_names_to_show],
        "answer": [0 if name in fake_function_names else 1 for name in all_function_names_to_show]
    })

    questions.append({
        "question_name": "explain_function",
        "question": f"Explain how the function {sampled_function_name}() works. Describe the inputs it uses, the steps it takes, what it returns, and how it modifies the interface. You may need to scroll to see the entire function.\n```{sampled_function_code}```",
        "question_type": "free_response",
        "choices": [],
        "answer": ''
    })

    return questions


def _parse_javascript_functions(js_code: str) -> Dict[str, str]:
    """
    Parse JavaScript code to extract functions and their definitions.
    Uses esprima to parse the AST and extract:
    - Function declarations: function foo() { ... }
    - Arrow functions: const bar = () => {}
    - Function expressions: const baz = function() {}
    
    Returns a dictionary mapping function names to their complete definitions.
    """
    import esprima
    
    functions_map = {}
    
    if not js_code:
        return functions_map
    
    try:
        # Parse the JavaScript code into an AST with location info
        tree = esprima.parseScript(js_code, loc=True, range=True)
        
        def extract_function_code(node):
            """Extract the source code for a function node using range."""
            if hasattr(node, 'range') and node.range:
                # Use range to extract the exact source code
                start, end = node.range
                return js_code[start:end]
            return None
        
        # Traverse the top-level statements in the program
        for node in tree.body:
            # Function declarations: function foo() { ... }
            if node.type == "FunctionDeclaration":
                if hasattr(node, 'id') and node.id:
                    func_name = node.id.name
                    func_code = extract_function_code(node)
                    if func_code:
                        functions_map[func_name] = func_code
            
            # Variable declarations that hold functions: const bar = () => {}
            elif node.type == "VariableDeclaration":
                for decl in node.declarations:
                    if hasattr(decl, 'id') and hasattr(decl, 'init') and decl.init:
                        var_name = decl.id.name if hasattr(decl.id, 'name') else None
                        init = decl.init
                        
                        # Arrow functions: const bar = () => {}
                        if init.type == "ArrowFunctionExpression":
                            if var_name:
                                func_code = extract_function_code(decl)
                                if func_code:
                                    functions_map[var_name] = func_code
                        
                        # Function expressions: const baz = function() {}
                        elif init.type == "FunctionExpression":
                            if var_name:
                                func_code = extract_function_code(decl)
                                if func_code:
                                    functions_map[var_name] = func_code
        
    except Exception as e:
        print(f"Error parsing JavaScript with esprima: {e}")
        # Return empty dict on error
        return functions_map
    
    return functions_map


def _generate_distractor_functions(existing_functions: List[str]) -> List[str]:
    """
    Generate plausible function names that don't exist in the code.
    """
    common_function_names = [
        "initialize", "setup", "configure", "validate", "process",
        "handleClick", "handleSubmit", "handleChange", "handleInput",
        "updateUI", "render", "display", "show", "hide",
        "calculate", "compute", "transform", "format", "parse",
        "fetchData", "saveData", "loadData", "deleteData",
        "checkStatus", "verify", "authenticate", "authorize"
    ]
    
    # Filter out functions that already exist
    distractors = [f for f in common_function_names if f not in existing_functions]
    
    # Also generate variations of existing function names
    for func in existing_functions[:3]:  # Limit to first 3 to avoid too many
        # Add prefixes/suffixes
        distractors.extend([
            f"init{func.capitalize()}",
            f"{func}Handler",
            f"handle{func.capitalize()}",
            f"{func}Async",
            f"validate{func.capitalize()}"
        ])
    
    # Return a reasonable number of distractors
    return distractors[:max(5, len(existing_functions) * 2)]


def _extract_existing_features(js_code: str, html_code: str, css_code: str) -> List[str]:
    """
    Extract features that exist in the code based on patterns.
    """
    features = []
    all_code = (js_code + " " + html_code + " " + css_code).lower()
    
    # Check for common features/patterns
    feature_patterns = {
        "Event Listeners": ["addeventlistener", "onclick", "onchange", "onsubmit", "oninput"],
        "DOM Manipulation": ["getelementbyid", "queryselector", "innerhtml", "textcontent", "appendchild"],
        "API Calls": ["fetch", "xmlhttprequest", "axios", "ajax"],
        "Local Storage": ["localstorage", "sessionstorage"],
        "Animations": ["setinterval", "settimeout", "requestanimationframe", "transition", "animation"],
        "Form Handling": ["form", "input", "textarea", "select", "submit"],
        "Data Validation": ["validate", "check", "verify", "test"],
        "Error Handling": ["try", "catch", "error", "throw"],
        "Async Operations": ["async", "await", "promise", "then", "catch"],
        "CSS Styling": ["classlist", "style", "css", "stylesheet"],
        "Responsive Design": ["media query", "@media", "viewport", "responsive"],
        "User Input": ["prompt", "confirm", "alert", "input", "textarea"]
    }
    
    for feature_name, patterns in feature_patterns.items():
        if any(pattern in all_code for pattern in patterns):
            features.append(feature_name)
    
    return features


def _generate_distractor_features(existing_features: List[str]) -> List[str]:
    """
    Generate plausible features that don't exist in the code.
    """
    all_possible_features = [
        "Event Listeners", "DOM Manipulation", "API Calls", "Local Storage",
        "Animations", "Form Handling", "Data Validation", "Error Handling",
        "Async Operations", "CSS Styling", "Responsive Design", "User Input",
        "WebSockets", "Service Workers", "IndexedDB", "WebGL",
        "Canvas Drawing", "Video/Audio Playback", "File Upload", "Drag and Drop",
        "Geolocation", "Camera Access", "Push Notifications", "Payment Processing"
    ]
    
    # Return features that don't exist
    return [f for f in all_possible_features if f not in existing_features]

async def _generate_comprehension_questions(
    submission_title: str,
    submission_description: str,
    submission_code: Dict[str, str]
) -> List[Dict[str, Any]]:
    """
    Generate comprehension questions based on the submission.
    Combines self-report questions with code-based questions.
    
    Returns a list of question dictionaries with the following structure:
    {
        "question_name": str,  # e.g., "purpose_1", "technology_2"
        "question": str,  # The actual question text/stem
        "question_type": str,  # "mcqa", "multi_select", or "free_response"
        "choices": Optional[List[str]],  # For mcqa/multi_select
        "answer": Optional[str]  # Correct answer for scoring
    }
    """

    SANITY_QUESTION_PROBABILITY = 0.5

    questions = []
    self_report_options = ["1 - Strongly disagree", "2 - Disagree", "3 - Neither agree nor disagree", "4 - Agree", "5 - Strongly agree"]
    
    # Add self-report questions
    prefix = "How much do you agree with this statement"
    questions.extend([
        {
            "question_name": "self_report_understanding",
            "question": f"{prefix}: I understand how my code works.",
            "question_type": "mcqa",
            "choices": self_report_options,
            "answer": ""
        },
        {
            "question_name": "self_report_review",
            "question": f"{prefix}: I read and reviewed all of the AI-generated code.",
            "question_type": "mcqa",
            "choices": self_report_options,
            "answer": ""
        },
        {
            "question_name": "self_report_explain",
            "question": f"{prefix}: I could explain how my code works to someone else.",
            "question_type": "mcqa",
            "choices": self_report_options,
            "answer": ""
        },
        {
            "question_name": "self_report_modify",
            "question": f"{prefix}: I could make modifications to my code without using AI tools.",
            "question_type": "mcqa",
            "choices": self_report_options,
             "answer": ""
         },
     ])

    num_self_report_questions = len(questions)
    
    # Add code-based questions (run in parallel)
    code_questions, ui_questions = await asyncio.gather(
        asyncio.to_thread(generate_js_questions, submission_code),
        asyncio.to_thread(generate_ui_questions, submission_code)
    )
    
    questions.extend(ui_questions)
    questions.extend(code_questions)

    if random.random() < SANITY_QUESTION_PROBABILITY:
        position_to_insert = random.randint(0, num_self_report_questions)
        choice_to_select = random.choice(self_report_options)
        sanity_question = {
            "question_name": "sanity_check",
            "question": f"{prefix}: Please select \"{choice_to_select}\" as your answer",
            "question_type": "mcqa",
            "choices": self_report_options,
            "answer": self_report_options.index(choice_to_select) + 1
        }
        questions.insert(position_to_insert, sanity_question)

    return questions


@app.get("/api/users/{user_id}/submission-feedback", tags=["Submissions"])
async def list_user_submission_feedback(
    user_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        feedback_entries = SubmissionFeedbackCRUD.get_by_voter(db, user_id, skip=skip, limit=limit)
        return [SubmissionFeedbackModel.from_orm(entry) for entry in feedback_entries]
    except Exception as e:
        print(f"Error listing user submission feedback: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to list submission feedback"})


@app.get("/api/users/{user_id}/submissions", tags=["Submissions"])
async def list_user_submissions(
    user_id: int,
    project_id: Optional[int] = Query(default=None, alias="projectId"),
    db: Session = Depends(get_db),
):
    """Get user's submissions. Returns only the most recent submission per project."""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        # Get all submissions for this user
        query = db.query(Submission).filter(Submission.user_id == user_id)
        
        if project_id is not None:
            query = query.filter(Submission.project_id == project_id)
        
        # Order by created_at descending to get most recent first
        all_submissions = query.order_by(Submission.created_at.desc()).all()
        
        # Group by project_id and keep only the most recent for each project
        most_recent_by_project: Dict[int, Submission] = {}
        for submission in all_submissions:
            if submission.project_id not in most_recent_by_project:
                most_recent_by_project[submission.project_id] = submission
        
        # Convert to response format
        response: List[Dict[str, Any]] = []
        for submission in most_recent_by_project.values():
            # Get rating summary for this submission
            feedback_entries = (
                db.query(SubmissionFeedback)
                .filter(SubmissionFeedback.submission_id == submission.id)
                .order_by(SubmissionFeedback.created_at.desc())
                .all()
            )
            rating_summary = build_rating_summary(feedback_entries)
            
            response.append({
                "id": submission.id,
                "title": submission.title,
                "description": submission.description,
                "image": submission.image,
                "projectId": submission.project_id,
                "userId": submission.user_id,
                "createdAt": submission.created_at.isoformat() if submission.created_at else None,
                "updatedAt": submission.updated_at.isoformat() if submission.updated_at else None,
                "code": submission.code or {},
                "ratingSummary": rating_summary,
            })
        
        # Sort by created_at descending (most recent first)
        response.sort(key=lambda x: x["createdAt"] or "", reverse=True)
        
        return {"items": response, "count": len(response)}
    except Exception as e:
        print(f"Error listing user submissions: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to list user submissions"})


@app.get("/api/users/{user_id}/submissions/check", tags=["Submissions"])
async def check_user_submission(
    user_id: int,
    project_id: Optional[int] = Query(default=None, alias="projectId"),
    task_id: Optional[str] = Query(default=None, alias="taskId"),
    db: Session = Depends(get_db),
):
    """Check if user has an existing submission for a project. Returns the most recent submission if exists."""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        project = None
        if project_id is not None:
            project = db.query(Project).filter(Project.id == project_id).first()
        elif task_id:
            slug = _slugify(task_id)
            for candidate in db.query(Project).all():
                if _slugify(candidate.name) == slug:
                    project = candidate
                    break

        if project is None:
            return JSONResponse(status_code=404, content={"error": "Project not found"})

        # Get the most recent submission for this user and project
        existing_submission = (
            db.query(Submission)
            .filter(
                Submission.user_id == user_id,
                Submission.project_id == project.id
            )
            .order_by(Submission.created_at.desc())
            .first()
        )

        if existing_submission:
            return {
                "exists": True,
                "submission": {
                    "id": existing_submission.id,
                    "title": existing_submission.title,
                    "description": existing_submission.description,
                    "createdAt": existing_submission.created_at.isoformat() if existing_submission.created_at else None,
                }
            }
        else:
            return {"exists": False, "submission": None}
    except Exception as e:
        print(f"Error checking user submission: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to check user submission"})


@app.get("/api/leaderboard", tags=["Submissions"])
async def get_leaderboard(db: Session = Depends(get_db)):
    """Get leaderboard with user rankings based on average rating and submission count"""
    try:
        # Get all users
        all_users = db.query(User).all()
        
        # Calculate stats for each user
        user_stats = []
        for user in all_users:
            # Get all submissions for this user
            user_submissions = db.query(Submission).filter(Submission.user_id == user.id).all()
            
            # Count unique project_ids (unique submissions per project)
            unique_projects = set()
            for submission in user_submissions:
                unique_projects.add(submission.project_id)
            submission_count = len(unique_projects)
            
            # Calculate average rating across all submissions
            all_ratings = []
            for submission in user_submissions:
                # Get all feedback for this submission
                feedback_entries = (
                    db.query(SubmissionFeedback)
                    .filter(SubmissionFeedback.submission_id == submission.id)
                    .order_by(SubmissionFeedback.created_at.desc())
                    .all()
                )
                
                if feedback_entries:
                    # Use the same logic as build_rating_summary to get average
                    rating_summary = build_rating_summary(feedback_entries)
                    if rating_summary["average"] is not None:
                        all_ratings.append(rating_summary["average"])
            
            # Calculate overall average rating
            average_rating = sum(all_ratings) / len(all_ratings) if all_ratings else 0.0
            
            user_stats.append({
                "user_id": user.id,
                "username": user.username,
                "average_rating": round(average_rating, 2),
                "submission_count": submission_count,
            })
        
        # Calculate normalized ranks
        # Sort by average rating (descending) and submission count (descending)
        sorted_by_rating = sorted(user_stats, key=lambda x: x["average_rating"], reverse=True)
        sorted_by_submissions = sorted(user_stats, key=lambda x: x["submission_count"], reverse=True)
        
        # Create rank maps
        rating_ranks = {}
        for rank, stat in enumerate(sorted_by_rating, start=1):
            rating_ranks[stat["user_id"]] = rank
        
        submission_ranks = {}
        for rank, stat in enumerate(sorted_by_submissions, start=1):
            submission_ranks[stat["user_id"]] = rank
        
        # Calculate overall rank (average of normalized ranks)
        # Normalize ranks to 0-1 scale, then average
        max_rank = len(user_stats)
        for stat in user_stats:
            rating_rank = rating_ranks[stat["user_id"]]
            submission_rank = submission_ranks[stat["user_id"]]
            
            # Normalize to 0-1 (lower rank = better, so we invert)
            normalized_rating = 1.0 - (rating_rank - 1) / max_rank if max_rank > 0 else 0
            normalized_submission = 1.0 - (submission_rank - 1) / max_rank if max_rank > 0 else 0
            
            # Average the normalized ranks (higher is better)
            overall_score = (normalized_rating + normalized_submission) / 2.0
            stat["overall_score"] = overall_score
        
        # Sort by overall score (descending)
        sorted_leaderboard = sorted(user_stats, key=lambda x: x["overall_score"], reverse=True)
        
        # Add final rank
        for rank, stat in enumerate(sorted_leaderboard, start=1):
            stat["rank"] = rank
        
        return sorted_leaderboard
    except Exception as e:
        print(f"Error fetching leaderboard: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": "Failed to fetch leaderboard"})


@app.post("/api/execute-endpoint", tags=["Code Execution"])
async def execute_endpoint(request_data: dict):
    """Execute Python code and optionally call a specific endpoint function using RapidAPI OneCompiler."""
    try:
        python_code = request_data.get("pythonCode", "")
        endpoint_name = request_data.get("endpoint", "")
        user_args = request_data.get("args", {})

        if not python_code:
            return JSONResponse(status_code=400, content={"error": "No Python code provided"})
        
        # Check if RapidAPI key is configured
        if not rapidapi_key:
            return JSONResponse(status_code=500, content={
                "success": False,
                "error": "RapidAPI key not configured. Set RAPIDAPI_KEY environment variable.",
                "error_type": "configuration_error"
            })
        
        # If no endpoint specified, just return the available endpoints
        if not endpoint_name:
            try:
                endpoints = endpoint_parser.parse_to_dict(python_code)
                return {
                    "success": True,
                    "endpoints": endpoints,
                    "count": len(endpoints),
                    "message": "Code parsed successfully"
                }
            except Exception as e:
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "error": str(e),
                    "error_type": "parsing_error"
                })
        
        # Execute the specific endpoint using RapidAPI OneCompiler
        try:
            # Create a modified version of the code that can execute the endpoint function
            # We need to add the endpoint decorator logic and call the specific function
            
            # First, parse the endpoints to get the function info
            endpoints = endpoint_parser.parse_to_dict(python_code)
            
            # Find the function that matches the endpoint path
            function_name = None
            for ep in endpoints:
                if ep.get('endpoint') == endpoint_name or ep.get('name') == endpoint_name:
                    function_name = ep['name']
                    break
            
            if not function_name:
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "error": f"Endpoint '{endpoint_name}' not found in the code. Available endpoints: {[ep.get('endpoint', ep.get('name')) for ep in endpoints]}",
                    "error_type": "endpoint_not_found"
                })
            
            # Create execution code that includes the endpoint decorator and calls the function
            # Use eval() + type casting approach for better argument handling
            user_args_str = repr(user_args) if user_args is not None else "{}"
            
            # Get function signature for type casting
            import ast
            
            # Parse the function to get its signature and type annotations
            try:
                tree = ast.parse(python_code)
                function_node = None
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef) and node.name == function_name:
                        function_node = node
                        break
                
                type_casting_code = ""
                if function_node and function_node.args.args:
                    type_casting_code = "# Type casting based on function annotations\n"
                    for arg in function_node.args.args:
                        arg_name = arg.arg
                        if arg.annotation:
                            # Extract type annotation
                            if isinstance(arg.annotation, ast.Name):
                                type_name = arg.annotation.id
                                type_casting_code += f"""
    if '{arg_name}' in evaluated_args:
        try:
            evaluated_args['{arg_name}'] = {type_name}(evaluated_args['{arg_name}'])
        except (ValueError, TypeError):
            pass  # Keep original value if casting fails
"""
            except Exception:
                type_casting_code = "# Type casting not available\n"
            
            execution_code = f"""
# Mock Flask objects
class MockRequest:
    def __init__(self, args):
        self.args = args
        self.form = args
    def get_json(self):
        return {user_args_str}

request = MockRequest({user_args_str})

def jsonify(data):
    return data

# Original code (using function annotations)
{python_code}

# Call the specific endpoint function with user arguments using eval()
try:
    # Use eval to properly handle each argument with correct types
    user_args_dict = eval({repr(user_args_str)})
    # Evaluate each argument individually to ensure proper type handling
    evaluated_args = {{}}
    for key, value in user_args_dict.items():
        # Try to evaluate the value directly, preserving its original type
        try:
            # If it's already a proper type, use it directly
            if isinstance(value, (int, float, bool, list, dict)) or value is None:
                evaluated_args[key] = value
            else:
                # For strings, try to evaluate them to get the proper type
                evaluated_args[key] = eval(str(value))
        except:
            # If evaluation fails, use the original value
            evaluated_args[key] = value
    
    {type_casting_code}
    
    result = {function_name}(**evaluated_args)
    print("ENDPOINT_RESULT:", result)
except Exception as e:
    print("ENDPOINT_ERROR:", str(e))
"""
            
            # Execute using RapidAPI OneCompiler
            result = await onecompiler_service.execute_python(execution_code)
            
            # Check for timeout or execution errors first
            if not result.get("success"):
                # Check if it's a timeout error (has stderr with timeout message)
                stderr = result.get("stderr", "")
                if stderr and "Timeout Error" in stderr:
                    return JSONResponse(status_code=500, content={
                        "success": False,
                        "error": stderr,
                        "error_type": "execution_error"
                    })
                # Otherwise return the error
                return JSONResponse(status_code=500, content={
                    "success": False,
                    "error": result.get('error', 'Unknown error'),
                    "error_type": "execution_error"
                })
            
            # Execution was successful
            stdout = result.get("stdout", "")
            
            # Parse the result from stdout
            if "ENDPOINT_RESULT:" in stdout:
                # Extract the result after ENDPOINT_RESULT:
                result_line = [line for line in stdout.split('\n') if 'ENDPOINT_RESULT:' in line]
                if result_line:
                    try:
                        # Try to parse the result as JSON
                        result_str = result_line[0].split('ENDPOINT_RESULT:', 1)[1].strip()
                        # Try JSON parsing first
                        import json
                        endpoint_result = json.loads(result_str)
                    except json.JSONDecodeError:
                        # If not valid JSON, try to parse as Python literal
                        try:
                            import ast
                            endpoint_result = ast.literal_eval(result_str)
                        except (ValueError, SyntaxError):
                            # If all parsing fails, return as string
                            endpoint_result = result_str
                    except Exception as parse_error:
                        # If parsing fails, return the raw string
                        endpoint_result = result_str
                else:
                    endpoint_result = stdout
            elif "ENDPOINT_ERROR:" in stdout:
                # Extract error from stdout
                error_line = [line for line in stdout.split('\n') if 'ENDPOINT_ERROR:' in line]
                if error_line:
                    error_msg = error_line[0].split('ENDPOINT_ERROR:', 1)[1].strip()
                    return JSONResponse(status_code=500, content={
                        "success": False,
                        "error": error_msg,
                        "error_type": "execution_error"
                    })
                else:
                    endpoint_result = stdout
            else:
                # If no specific markers found, return the full stdout
                endpoint_result = stdout
            
            return {
                "success": True,
                "result": endpoint_result,
                "endpoint": endpoint_name,
                "args_used": user_args,
                "execution_method": "rapidapi_onecompiler"
            }
                
        except Exception as e:
            return JSONResponse(status_code=500, content={
                "success": False,
                "error": str(e),
                "error_type": "execution_error"
            })
            
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "error": str(e),
            "error_type": "unexpected_error"
        })

@app.post("/api/validate-python", tags=["Code Execution"])
async def validate_python(request_data: dict):
    """Validate Python code syntax using RapidAPI OneCompiler."""
    try:
        python_code = request_data.get("pythonCode", "")
        
        if not python_code:
            return JSONResponse(status_code=400, content={"error": "No Python code provided"})
        
        # Check if RapidAPI key is configured
        if not rapidapi_key:
            return JSONResponse(status_code=500, content={
                "success": False,
                "error": "RapidAPI key not configured. Set RAPIDAPI_KEY environment variable.",
                "error_type": "configuration_error"
            })
        
        # Use OneCompiler service for syntax validation
        result = await onecompiler_service.validate_python_syntax(python_code)
        
        if result.get("success"):
            return {
                "success": True,
                "message": result.get("message", "Python code is syntactically valid")
            }
        else:
            return JSONResponse(status_code=400, content={
                "success": False,
                "error": result.get("error", "Syntax validation failed"),
                "line": result.get("line"),
                "offset": result.get("offset")
            })
        
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "error": str(e)
        })

@app.post("/api/start-python-server")
async def start_python_server(request_data: dict):
    """Start a Python Flask server as a subprocess."""
    try:
        python_code = request_data.get("pythonCode", "")
        port = request_data.get("port", 5000)
        
        if not python_code:
            return JSONResponse(status_code=400, content={"error": "No Python code provided"})
        
        # Stop any existing server on this port
        if port in active_processes:
            await stop_python_server(port)
        
        # Create a temporary file for the Python code
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(python_code)
            temp_file_path = f.name
        
        try:
            # Start the Python subprocess
            process = subprocess.Popen(
                ["python3", temp_file_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Store process info
            active_processes[port] = {
                "process": process,
                "temp_file": temp_file_path,
                "start_time": asyncio.get_event_loop().time(),
                "code": python_code
            }
            
            # Give the process a moment to start
            await asyncio.sleep(1)
            
            # Check if process is still running
            if process.poll() is None:
                return {
                    "success": True,
                    "port": port,
                    "processId": process.pid,
                    "message": f"Python server started on port {port}"
                }
            else:
                # Process died, get error output
                stdout, stderr = process.communicate()
                error_msg = stderr or stdout or "Process exited unexpectedly"
                return JSONResponse(
                    status_code=500, 
                    content={"error": f"Failed to start Python server: {error_msg}"}
                )
                
        except Exception as e:
            # Clean up temp file on error
            try:
                os.unlink(temp_file_path)
            except:
                pass
            return JSONResponse(status_code=500, content={"error": str(e)})
            
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/stop-python-server")
async def stop_python_server_endpoint(request_data: dict):
    """Stop a Python Flask server subprocess."""
    try:
        port = request_data.get("port")
        if port is None:
            return JSONResponse(status_code=400, content={"error": "No port specified"})
        
        success = await stop_python_server(port)
        if success:
            return {"success": True, "message": f"Server on port {port} stopped"}
        else:
            return JSONResponse(status_code=404, content={"error": f"No server found on port {port}"})
            
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

async def stop_python_server(port):
    """Helper function to stop a Python server process."""
    if port not in active_processes:
        return False
    
    process_info = active_processes[port]
    process = process_info["process"]
    temp_file = process_info["temp_file"]
    
    try:
        # Terminate the process
        if process.poll() is None:  # Process is still running
            process.terminate()
            
            # Wait for graceful termination
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # Force kill if it doesn't terminate gracefully
                process.kill()
                process.wait()
        
        # Clean up temp file
        try:
            os.unlink(temp_file)
        except:
            pass
            
        # Remove from active processes
        del active_processes[port]
        
        return True
        
    except Exception as e:
        print(f"Error stopping server on port {port}: {e}")
        return False

@app.get("/api/list-python-servers")
async def list_python_servers():
    """List all active Python server processes."""
    servers = []
    for port, info in active_processes.items():
        process = info["process"]
        servers.append({
            "port": port,
            "processId": process.pid,
            "status": "running" if process.poll() is None else "stopped",
            "startTime": info["start_time"]
        })
    
    return {"servers": servers}

@app.post("/api/chat", tags=["Chat"])
async def chat_endpoint(request_data: dict):
    """REST API endpoint for non-streaming chat requests."""
    try:
        messages = request_data.get("messages", [])
        model = request_data.get("model", "gpt-4")
        max_tokens = request_data.get("max_tokens", 1000)
        proactive = request_data.get("proactive", False)
        current_code = request_data.get("current_code", "")
        
        # Prepare messages for AI
        if proactive and current_code:
            user_message = messages[-1] if messages else {"role": "user", "content": ""}
            enhanced_message = {
                "role": "user", 
                "content": f"Code:\n{current_code}\n\nMessage:\n{user_message.get('content', '')}"
            }
            messages_to_send = messages[:-1] + [enhanced_message]
        else:
            messages_to_send = messages
        
        # Get response from chat model
        response = await chat_model.stream_response(
            messages=messages_to_send,
            model=model,
            max_tokens=max_tokens,
            on_chunk=None,
            on_complete=None,
            on_error=None,
            current_code=current_code
        )
        
        # For autocomplete strategy, also return the generated code
        generated_code = ""
        if hasattr(chat_model.strategy, 'get_last_generated_code'):
            generated_code = chat_model.strategy.get_last_generated_code()
        
        return {
            "response": response,
            "generated_code": generated_code
        }
        
    except Exception as e:
        return {"error": str(e)}, 500


@app.get("/tasks/{task_name}", tags=["Tasks"])
async def get_task(task_name: str):
    try:
        backend_dir = os.path.dirname(__file__)
        repo_root = os.path.abspath(os.path.join(backend_dir, ".."))
        data_path = os.path.join(repo_root, "data", "dummy_tasks.json")
        if not os.path.exists(data_path):
            return JSONResponse(status_code=404, content={"error": "dummy_tasks.json not found"})

        with open(data_path, "r", encoding="utf-8") as f:
            payload = json.load(f)

        tasks = payload.get("tasks", [])
        task = next((t for t in tasks if t.get("name") == task_name), None)
        if not task:
            return JSONResponse(status_code=404, content={"error": f"Task '{task_name}' not found"})

        # Handle task description - if it's a file path, load the content
        task_description = task.get("description", "")
        if task_description.startswith("data/code_files/"):
            file_path = os.path.join(repo_root, task_description)
            try:
                if os.path.exists(file_path):
                    with open(file_path, "r", encoding="utf-8") as desc_file:
                        task_description = desc_file.read()
                    # Compute base relative path for assets (e.g., images) and convert to data URLs
                    base_rel_dir = os.path.dirname(task.get("description", ""))
                    # base_rel_dir like data/code_files/tictactoe_solution
                    if base_rel_dir:
                        import re
                        import base64
                        
                        # Replace src="..." with data URLs for images
                        def _repl_src(match):
                            url = match.group(1)
                            if url.startswith(('http://','https://','data:','/')):
                                return f'src="{url}"'
                            
                            # Try to load the image and convert to data URL
                            img_path = os.path.join(repo_root, base_rel_dir, url)
                            if os.path.exists(img_path):
                                try:
                                    with open(img_path, 'rb') as img_file:
                                        img_data = img_file.read()
                                        # Determine MIME type from extension
                                        mime_type = 'application/octet-stream'
                                        if url.lower().endswith('.png'):
                                            mime_type = 'image/png'
                                        elif url.lower().endswith(('.jpg', '.jpeg')):
                                            mime_type = 'image/jpeg'
                                        elif url.lower().endswith('.gif'):
                                            mime_type = 'image/gif'
                                        elif url.lower().endswith('.svg'):
                                            mime_type = 'image/svg+xml'
                                        
                                        data_url = f'data:{mime_type};base64,{base64.b64encode(img_data).decode()}'
                                        return f'src="{data_url}"'
                                except Exception as e:
                                    print(f"Error converting image to data URL: {e}")
                            
                            # Fallback to /assets/ URL if conversion fails
                            return f'src="/assets/{base_rel_dir.strip("/")}/{url}"'
                        
                        task_description = re.sub(r'src="([^"]+)"', _repl_src, task_description)
                else:
                    task_description = f"Description file not found: {file_path}"
            except Exception as e:
                task_description = f"Error reading description file: {str(e)}"
        
        # Update the task with the loaded description
        task["description"] = task_description

        # Handle tests - if it's a directory path (or array of paths), load all test files
        tests = task.get("tests", [])
        loaded_tests = []
        
        # Convert single string to array for uniform processing
        test_dirs = []
        if isinstance(tests, str) and tests.startswith("data/test_cases/"):
            test_dirs = [tests]
        elif isinstance(tests, list):
            test_dirs = [t for t in tests if isinstance(t, str) and t.startswith("data/test_cases/")]
        
        # Load tests from all directories
        for test_dir_path in test_dirs:
            test_dir = os.path.join(repo_root, test_dir_path)
            
            # Determine test type prefix from directory name
            test_type_prefix = ""
            if "/backend" in test_dir_path or test_dir_path.endswith("backend"):
                test_type_prefix = "Backend"
            elif "/frontend" in test_dir_path or test_dir_path.endswith("frontend"):
                test_type_prefix = "End-to-End"
            elif "/html" in test_dir_path or test_dir_path.endswith("html"):
                test_type_prefix = "HTML"
            
            try:
                if os.path.exists(test_dir) and os.path.isdir(test_dir):
                    # Load all .json test files in the test directory
                    for filename in sorted(os.listdir(test_dir)):
                        if filename.endswith('.json'):
                            test_file_path = os.path.join(test_dir, filename)
                            with open(test_file_path, 'r', encoding='utf-8') as test_file:
                                test_content = test_file.read()
                                
                            # Load JSON test file with prefix
                            test_cases_from_file = load_json_test_file(test_content, filename, test_type_prefix)
                            loaded_tests.extend(test_cases_from_file)
            except Exception as e:
                print(f"Error loading tests from {test_dir}: {e}")
        
        task["tests"] = loaded_tests

        files = []
        for fdef in task.get("files", []):
            content = fdef.get("content", "")
            
            # Check if content is a file path (starts with data/code_files/)
            if content.startswith("data/code_files/"):
                # Read content from file
                file_path = os.path.join(repo_root, content)
                try:
                    if os.path.exists(file_path):
                        with open(file_path, "r", encoding="utf-8") as content_file:
                            content = content_file.read()
                    else:
                        content = f"// File not found: {file_path}"
                except Exception as e:
                    content = f"// Error reading file: {str(e)}"
            
            files.append({
                "id": fdef.get("name"),
                "name": fdef.get("name"),
                "type": "file",
                "content": content,
                "language": fdef.get("language", "plaintext")
            })

        return {"task": task, "files": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/load-test-cases")
async def load_test_cases(request: dict):
    """
    Load test cases from task data.
    
    The task.tests field should contain an array of:
    - Directory paths (strings) - will load all JSON files from that directory
    - Test objects (dicts) - will be used directly
    
    Request body:
    {
        "task": {
            "tests": [
                "data/test_cases/tictactoe/backend",
                "data/test_cases/tictactoe/frontend",
                ...
            ]
        },
        "public_only": true/false  # Optional: filter for public tests only (default: true)
    }
    
    Returns:
    {
        "testCases": [
            {
                "title": "...",
                "tests": [...]
            }
        ]
    }
    """
    try:
        task = request.get("task", {})
        public_only = request.get("public_only", True)
        
        all_tests = []
        base_path = Path(__file__).parent.parent
        
        # Load tests from task.tests field
        if "tests" in task and isinstance(task["tests"], list):
            for test_entry in task["tests"]:
                # Check if it's a directory path (string)
                if isinstance(test_entry, str):
                    # Convert relative path to absolute
                    test_dir = base_path / test_entry
                    
                    if test_dir.exists() and test_dir.is_dir():
                        # Load all JSON files from this directory
                        for json_file in sorted(test_dir.glob("*.json")):
                            try:
                                with open(json_file, 'r') as f:
                                    tests_from_file = json.load(f)
                                    if isinstance(tests_from_file, list):
                                        all_tests.extend(tests_from_file)
                                    else:
                                        all_tests.append(tests_from_file)
                                print(f"✓ Loaded {len(tests_from_file) if isinstance(tests_from_file, list) else 1} tests from {json_file.name}")
                            except Exception as e:
                                print(f"✗ Error loading test file {json_file}: {e}")
                    else:
                        print(f"⚠ Test directory not found: {test_dir}")
                # If it's a dict, it's an inline test definition
                elif isinstance(test_entry, dict):
                    all_tests.append(test_entry)
        
        # Filter tests by public flag if requested
        if public_only:
            all_tests = [test for test in all_tests if test.get("public", False)]
        
        # Organize test cases by title
        test_cases_by_title = {}
        for test in all_tests:
            title = test.get("title", "Uncategorized")
            if title not in test_cases_by_title:
                test_cases_by_title[title] = []
            test_cases_by_title[title].append(test)
        
        # Convert to array format for frontend
        organized_tests = []
        for title, cases in test_cases_by_title.items():
            organized_tests.append({
                "title": title,
                "tests": cases
            })
        
        print(f"✓ Returning {len(organized_tests)} test groups with {len(all_tests)} total tests")
        return {"testCases": organized_tests}
    except Exception as e:
        print(f"✗ Error in load_test_cases: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/llm-judge")
async def llm_judge(request: dict):
    """
    Use OpenAI's vision API to judge a screenshot against test criteria.
    
    Request body:
    {
        "screenshot": "data:image/png;base64,...",  # Base64 encoded screenshot
        "testCase": {
            "name": "...",
            "description": "..."
        },
        "htmlCode": "..."  # Optional HTML code for context
    }
    
    Returns:
    {
        "judgment": "pass" | "fail",
        "explanation": "..."
    }
    """
    print('hello!')
    try:
        screenshot = request.get("screenshot")
        test_case = request.get("testCase", {})
        html_code = request.get("htmlCode", "")
        
        if not screenshot:
            return JSONResponse(status_code=400, content={"error": "No screenshot provided"})
        
        if not test_case.get("description"):
            return JSONResponse(status_code=400, content={"error": "No test description provided"})
        
        # Get OpenAI API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return JSONResponse(status_code=500, content={
                "error": "OpenAI API key not configured"
            })
        
        # Prepare the prompt for GPT-4 Vision
        prompt = f"""You are a test judge evaluating a web page screenshot against specific criteria.

Test Name: {test_case['name']}
Test Description: {test_case['description']}

Your task:
1. Carefully examine the screenshot of the rendered web page
2. Determine if the page meets the requirement described above
3. Respond with ONLY a JSON object in this exact format:
{{
    "judgment": "pass" or "fail",
    "explanation": "A clear explanation of your decision"
}}

Be strict but fair in your evaluation. If the requirement is met, even if not perfectly, your judgment should be \"pass\". If critical elements are missing or the requirement is clearly not satisfied, your judgment should be \"fail\"."""

        # Call OpenAI Vision API
        client = openai.OpenAI(api_key=api_key)

        for num_attempts in range(5):
            response = client.chat.completions.create(
                model="gpt-4o-2024-08-06",  # Use gpt-4o which supports vision
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": screenshot,
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=500,
            )
            
            # Parse the response
            response_text = response.choices[0].message.content.strip()
            response_text = response_text.replace("`", "").replace("json", "")
            response_text = response_text[response_text.index("{"):response_text.rindex("}")+1]
                
            result = json.loads(response_text)
            print(result)

            if result.get("judgment", "") not in {"pass", "fail"} or result.get("explanation", "") == "":
                continue
        
            return {
                "judgment": result.get("judgment", "fail").lower(),
                "explanation": result.get("explanation", "No explanation provided")   
            }
        
    except Exception as e:
        print(f"Error in LLM judge: {e}")
        return JSONResponse(status_code=500, content={
            "error": f"Failed to judge screenshot: {str(e)}"
        })

# Authentication endpoints
@app.post("/signup", tags=["Authentication"])
async def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    """Create a new user account."""
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(
            or_(User.username == user_data.username, User.email == user_data.email)
        ).first()
        
        if existing_user:
            if existing_user.username == user_data.username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already registered"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
        
        # Hash the password
        hashed_password = get_password_hash(user_data.password)
        
        # Create new user
        db_user = User(
            username=user_data.username,
            email=user_data.email,
            password=hashed_password,
            settings=user_data.settings or {}
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        # Create access token
        access_token = create_access_token(data={"sub": str(db_user.id)})
        
        return {
            "message": "User created successfully",
            "user": {
                "id": db_user.id,
                "username": db_user.username,
                "email": db_user.email,
                "created_at": db_user.created_at
            },
            "access_token": access_token,
            "token_type": "bearer"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating user: {str(e)}"
        )


@app.post("/login", tags=["Authentication"])
async def login(credentials: dict, db: Session = Depends(get_db)):
    """Authenticate user and return access token."""
    try:
        username_or_email = credentials.get("username_or_email")
        password = credentials.get("password")
        
        if not username_or_email or not password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username/email and password are required"
            )
        
        # Find user by username or email
        user = db.query(User).filter(
            or_(User.username == username_or_email, User.email == username_or_email)
        ).first()

        # Provide clearer error messages
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Username or email not found"
            )

        if not verify_password(password, user.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password"
            )
        
        # Create access token
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return {
            "message": "Login successful",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "created_at": user.created_at
            },
            "access_token": access_token,
            "token_type": "bearer"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during login: {str(e)}"
        )


@app.get("/auth/validate", tags=["Authentication"])
async def validate_auth_token(request: Request, db: Session = Depends(get_db)):
    """Validate an authentication token and return the associated user."""
    try:
        auth_header = request.headers.get("Authorization")
        token: Optional[str] = None

        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

        if not token:
            token = request.query_params.get("token")

        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication token"
            )

        payload = verify_token(token)
        if not payload or "sub" not in payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )

        user_id = payload.get("sub")
        try:
            user_id_int = int(user_id)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )

        user = db.query(User).filter(User.id == user_id_int).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        return {
            "valid": True,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "created_at": user.created_at
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error validating token: {str(e)}"
        )


@app.post("/send-password-reset", tags=["Authentication"])
async def send_password_reset(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """Send password reset email to user."""
    try:
        username_or_email = request.username_or_email
        
        # Find user by username or email
        user = db.query(User).filter(
            or_(User.username == username_or_email, User.email == username_or_email)
        ).first()
        
        if not user:
            # Return specific error for better UX
            return JSONResponse(
                status_code=404,
                content={
                    "detail": "No account found with that username or email address"
                }
            )
        
        # Generate reset token
        reset_token = generate_reset_token()
        expires_at = datetime.utcnow() + timedelta(minutes=30)
        
        # Invalidate any existing reset tokens for this user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False
        ).update({"used": True})
        
        # Create new reset token
        reset_token_data = PasswordResetTokenCreate(
            user_id=user.id,
            token=reset_token,
            expires_at=expires_at,
            used=False
        )
        
        reset_token_record = PasswordResetToken(**reset_token_data.dict())
        
        db.add(reset_token_record)
        db.commit()
        
        # Send email
        email_sent = send_password_reset_email(user.email, user.username, reset_token)
        
        if email_sent:
            return {
                "message": "Password reset email sent successfully",
                "user_exists": True
            }
        else:
            return {
                "message": "Password reset email could not be sent, but reset token generated",
                "reset_token": reset_token,  # For development/testing
                "user_exists": True
            }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error sending password reset: {str(e)}"
        )


@app.get("/validate-reset-token", tags=["Authentication"])
async def validate_reset_token(token: str, db: Session = Depends(get_db)):
    """Validate reset token and return username if valid."""
    try:
        # Find valid reset token
        reset_token_record = db.query(PasswordResetToken).filter(
            PasswordResetToken.token == token,
            PasswordResetToken.used == False,
            PasswordResetToken.expires_at > datetime.utcnow()
        ).first()
        
        if not reset_token_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )
        
        # Get user
        user = db.query(User).filter(User.id == reset_token_record.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User not found"
            )
        
        return {
            "valid": True,
            "username": user.username,
            "expires_at": reset_token_record.expires_at.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error validating token: {str(e)}"
        )


@app.post("/reset-password", tags=["Authentication"])
async def reset_password(request: PasswordResetConfirm, db: Session = Depends(get_db)):
    """Reset user password using reset token."""
    try:
        token = request.token
        new_password = request.new_password
        
        # Find valid reset token
        reset_token_record = db.query(PasswordResetToken).filter(
            PasswordResetToken.token == token,
            PasswordResetToken.used == False,
            PasswordResetToken.expires_at > datetime.utcnow()
        ).first()
        
        if not reset_token_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )
        
        # Get user
        user = db.query(User).filter(User.id == reset_token_record.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User not found"
            )
        
        # Hash new password
        hashed_password = get_password_hash(new_password)
        
        # Update user password
        user.password = hashed_password
        user.updated_at = datetime.utcnow()
        
        # Mark token as used
        reset_token_record.used = True
        
        db.commit()
        
        return {
            "message": "Password reset successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error resetting password: {str(e)}"
        )


@app.post("/api/execute-test-cases")
async def execute_test_cases(request: dict):
    """
    Execute a subset of test cases against the backend code.
    
    Request body:
    {
        "testCases": [...],  # Array of test cases to execute
        "backendCode": "...",  # The backend Python code to test
        "port": 5000  # Optional port number
    }
    
    Returns:
    {
        "results": [
            {
                "testName": "...",
                "status": "pass" | "fail" | "error",
                "message": "...",
                "expected": {...},
                "actual": {...}
            }
        ]
    }
    """
    try:
        test_cases = request.get("testCases", [])
        backend_code = request.get("backendCode", "")
        port = request.get("port", 5000)
        
        results = []
        
        # Parse endpoints from backend code
        try:
            endpoints = endpoint_parser.parse_to_dict(backend_code)
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"error": f"Failed to parse backend code: {str(e)}"}
            )
        
        # Execute each test case
        for test in test_cases:
            test_name = test.get("name", "Unknown Test")
            metadata = test.get("metadata", {})
            test_type = metadata.get("type", "endpoint")
            
            # All tests should be endpoint-based now
            if test_type != "endpoint":
                results.append({
                    "testName": test_name,
                    "status": "skip",
                    "message": f"Test type '{test_type}' not supported"
                })
                continue
            
            endpoint_path = metadata.get("endpoint", "")
            test_input = metadata.get("input", {})
            expected = metadata.get("expected")
            
            # Execute the endpoint using OneCompiler (same as /api/execute-endpoint)
            try:
                # Find the function name from parsed endpoints
                endpoint = next((ep for ep in endpoints if ep.get("endpoint") == endpoint_path), None)
                
                if not endpoint:
                    results.append({
                        "testName": test_name,
                        "status": "error",
                        "message": f"Endpoint {endpoint_path} not found in backend code",
                        "expected": expected,
                        "actual": None
                    })
                    continue
                
                function_name = endpoint['name']
                user_args_str = repr(test_input) if test_input is not None else "{}"
                
                # Build execution code (same pattern as /api/execute-endpoint)
                execution_code = f"""
# Backend code
{backend_code}

# Execute the endpoint with parameters
try:
    user_args_dict = {user_args_str}
    result = {function_name}(**user_args_dict)
    print("ENDPOINT_RESULT:", result)
except Exception as e:
    print("ENDPOINT_ERROR:", str(e))
"""
                
                # Execute using OneCompiler
                exec_result = await onecompiler_service.execute_python(execution_code)
                
                if exec_result.get("success"):
                    stdout = exec_result.get("stdout", "")
                    
                    # Parse the result from stdout
                    if "ENDPOINT_RESULT:" in stdout:
                        result_line = [line for line in stdout.split('\n') if 'ENDPOINT_RESULT:' in line]
                        if result_line:
                            try:
                                result_str = result_line[0].split('ENDPOINT_RESULT:', 1)[1].strip()
                                # Try JSON parsing first
                                try:
                                    actual = json.loads(result_str)
                                except json.JSONDecodeError:
                                    # Try Python literal eval
                                    try:
                                        actual = ast.literal_eval(result_str)
                                    except (ValueError, SyntaxError):
                                        actual = result_str
                            except Exception:
                                actual = result_str
                        else:
                            actual = stdout
                    elif "ENDPOINT_ERROR:" in stdout:
                        error_line = [line for line in stdout.split('\n') if 'ENDPOINT_ERROR:' in line]
                        error_msg = error_line[0].split('ENDPOINT_ERROR:', 1)[1].strip() if error_line else "Unknown error"
                        results.append({
                            "testName": test_name,
                            "status": "error",
                            "message": error_msg,
                            "expected": expected,
                            "actual": None
                        })
                        continue
                    else:
                        actual = stdout
                    
                    # Simple equality comparison
                    passed = (actual == expected)
                    
                    if passed:
                        results.append({
                            "testName": test_name,
                            "status": "pass",
                            "message": "Test passed successfully",
                            "expected": expected,
                            "actual": actual
                        })
                    else:
                        results.append({
                            "testName": test_name,
                            "status": "fail",
                            "message": f"Expected {expected} but got {actual}",
                            "expected": expected,
                            "actual": actual
                        })
                else:
                    results.append({
                        "testName": test_name,
                        "status": "error",
                        "message": exec_result.get("error", "Unknown error"),
                        "expected": expected,
                        "actual": None
                    })
                    
            except Exception as e:
                results.append({
                    "testName": test_name,
                    "status": "error",
                    "message": str(e),
                    "expected": expected,
                    "actual": None
                })
        
        return {"results": results}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            # Receive message from frontend
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Extract message content
            messages = message_data.get("messages", [])
            model = message_data.get("model", "gpt-4")
            max_tokens = message_data.get("max_tokens", 1000)
            proactive = message_data.get("proactive", False)
            current_code = message_data.get("current_code", "")
            
            # Prepare messages for AI
            if proactive and current_code:
                # Add code context for proactive responses
                user_message = messages[-1] if messages else {"role": "user", "content": ""}
                enhanced_message = {
                    "role": "user", 
                    "content": f"Code:\n{current_code}\n\nMessage:\n{user_message.get('content', '')}"
                }
                messages_to_send = messages[:-1] + [enhanced_message]
            else:
                messages_to_send = messages
            
            # Stream response back to frontend
            async def on_chunk(chunk: str):
                await websocket.send_text(json.dumps({
                    "type": "chunk",
                    "content": chunk
                }))
            
            async def on_complete(full_response: str):
                # For autocomplete strategy, also send the generated code
                generated_code = ""
                if hasattr(chat_model.strategy, 'get_last_generated_code'):
                    generated_code = chat_model.strategy.get_last_generated_code()
                
                await websocket.send_text(json.dumps({
                    "type": "complete",
                    "content": full_response,
                    "generated_code": generated_code
                }))
            
            # For autocomplete strategy, send generated code immediately when ready
            async def on_code_ready(generated_code: str):
                await websocket.send_text(json.dumps({
                    "type": "code_ready",
                    "generated_code": generated_code
                }))
            
            async def on_error(error: str):
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "content": f"Error: {error}"
                }))
            
            # Stream the response
            await chat_model.stream_response(
                messages=messages_to_send,
                model=model,
                max_tokens=max_tokens,
                on_chunk=on_chunk,
                on_complete=on_complete,
                on_error=on_error,
                on_code_ready=on_code_ready,
                current_code=current_code
            )
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.send_text(json.dumps({
            "type": "error",
            "content": f"Server error: {str(e)}"
        }))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=4828, reload=True)
