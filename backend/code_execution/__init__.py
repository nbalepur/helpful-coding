# Code execution package: OneCompiler, local runner, and shared endpoint logic.
import os

from code_execution.base import BaseExecutionService
from code_execution.local_service import LocalExecutionService
from code_execution.onecompiler_service import OneCompilerService
from code_execution.endpoint_runner import (
    check_execution_config,
    build_endpoint_execution_code,
    parse_endpoint_stdout,
)


def get_execution_service() -> BaseExecutionService:
    """Return the configured execution service (local or OneCompiler) based on env."""
    if os.getenv("USE_LOCAL_EXECUTION", "False").lower() == "true":
        return LocalExecutionService()
    return OneCompilerService(rapidapi_key=os.getenv("RAPIDAPI_KEY"))


__all__ = [
    "BaseExecutionService",
    "get_execution_service",
    "check_execution_config",
    "build_endpoint_execution_code",
    "parse_endpoint_stdout",
]
