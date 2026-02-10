"""
API routers for the Helpful Coding backend.
"""

from .tasks import router as tasks_router
from .submissions import router as submissions_router
from .submission_questions import router as submission_questions_router
from .code import router as code_router
from .execution import router as execution_router
from .auth import router as auth_router
from .users import router as users_router

__all__ = [
    "tasks_router",
    "submissions_router",
    "submission_questions_router",
    "code_router",
    "execution_router",
    "auth_router",
    "users_router",
]
