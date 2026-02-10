"""
Backend entry point.

Structure:
- agent/             – Agent logic (AI chat, code editing via Aider)
- code_execution/  – Code execution (OneCompiler, local runner, endpoint runner)
- database/          – Database logic (at repo root: config, models, crud, sqlalchemy_models)
- utils/             – Helpers (task/project resolution, auth tokens, password hashing)
- routers/           – HTTP route handlers (tasks, submissions, submission_questions, code, execution, auth, users)
"""
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Ensure repo root and backend are on path (database at repo root; code_execution in backend)
_backend_dir = Path(__file__).resolve().parent
_repo_root = _backend_dir.parent
sys.path.insert(0, str(_repo_root))
sys.path.insert(0, str(_backend_dir))
load_dotenv(_repo_root / ".env")


def _backend_port() -> int:
    """Parse port from BACKEND_URL or NEXT_PUBLIC_BACKEND_URL in .env."""
    url = os.getenv("BACKEND_URL") or os.getenv("NEXT_PUBLIC_BACKEND_URL")
    if url and url.strip() and url.strip() != "undefined":
        try:
            parsed = urlparse(url.strip())
            if parsed.port is not None:
                return parsed.port
            return 443 if parsed.scheme == "https" else 80
        except Exception:
            pass
    return 4828


def _cors_origins() -> list[str]:
    """Allowed CORS origins from CORS_ORIGINS (.env), or defaults for local + production."""
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return []


app = FastAPI(
    title="VibeJam Backend",
    description="Backend API for VibeJam with authentication and code execution capabilities",
    version="1.0.0",
    tags_metadata=[
        {"name": "Authentication", "description": "User authentication endpoints for signup and login"},
        {"name": "Code Execution", "description": "Endpoints for executing and validating Python code"},
        {"name": "Tasks", "description": "Endpoints for managing coding tasks and test cases"},
        {"name": "Code", "description": "Endpoints for logging and managing user code snapshots"},
        {"name": "Chat", "description": "AI chat endpoints for code assistance"},
        {"name": "Submissions", "description": "Endpoints for logging project submissions"},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

from agent import router as agent_router
from agent.code_preferences import router as code_preferences_router
from agent.instances import router as agent_instances_router
from routers import (
    tasks_router,
    submissions_router,
    submission_questions_router,
    code_router,
    execution_router,
    auth_router,
    users_router,
)

app.include_router(agent_router)
app.include_router(code_preferences_router)
app.include_router(agent_instances_router)
app.include_router(tasks_router)
app.include_router(submissions_router)
app.include_router(submission_questions_router)
app.include_router(code_router)
app.include_router(execution_router)
app.include_router(auth_router)
app.include_router(users_router)


@app.get("/")
async def root():
    return {"message": "AI Coding Assistant Backend is running!"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Backend is operational"}


if __name__ == "__main__":
    import uvicorn
    port = _backend_port()
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
