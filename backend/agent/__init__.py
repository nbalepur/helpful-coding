"""
Agent logic: AI chat and code-editing endpoints (Aider-based).

API surface: agent.api (router + documented endpoints).
Helpers: agent.helpers, agent.generation, agent.instances, agent.code_preferences.
"""
from .api import router

__all__ = ["router"]
