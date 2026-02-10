"""
Deprecated: use agent.api for routes and agent.helpers for implementation.

This module re-exports the router from api so existing imports still work.
"""
from agent.api import router

__all__ = ["router"]
