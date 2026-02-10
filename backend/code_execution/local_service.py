"""
Local code execution service (Python subprocess/exec, Node.js for JavaScript).
WARNING: For development only. Use OneCompiler or another sandbox in production.
"""

import io
import os
import subprocess
import sys
import tempfile
import time
from typing import Dict, Any

from code_execution.base import BaseExecutionService
from code_execution.code_helpers import inject_endpoint_decorator, validate_python_syntax as _validate_syntax


class LocalExecutionService(BaseExecutionService):
    """Execute Python and JavaScript code locally via subprocess (or exec fallback for Python)."""

    def __init__(self, timeout: int = 60):
        self.timeout = timeout
        print("⚠️  Using LOCAL execution mode (Python subprocess / Node.js). For production, use OneCompiler.")

    async def execute_python(self, code: str, stdin: str = "") -> Dict[str, Any]:
        code = inject_endpoint_decorator(code)
        return await self._execute_local(code, stdin, "python")

    async def execute_javascript(self, code: str, stdin: str = "") -> Dict[str, Any]:
        return await self._execute_javascript_local(code)

    async def validate_python_syntax(self, code: str) -> Dict[str, Any]:
        code = inject_endpoint_decorator(code)
        return _validate_syntax(code)

    async def _execute_local(self, code: str, stdin: str = "", language: str = "python") -> Dict[str, Any]:
        if language == "javascript":
            return await self._execute_javascript_local(code)

        start_time = time.time()
        try:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
                f.write(code)
                temp_file = f.name
            try:
                result = subprocess.run(
                    [sys.executable, temp_file],
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                )
                execution_time = time.time() - start_time
                return {
                    "success": result.returncode == 0,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "exit_code": result.returncode,
                    "execution_time": int(execution_time * 1000),
                }
            finally:
                try:
                    os.unlink(temp_file)
                except Exception:
                    pass
        except subprocess.TimeoutExpired:
            execution_time = time.time() - start_time
            try:
                if "temp_file" in locals():
                    os.unlink(temp_file)
            except Exception:
                pass
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Timeout Error: Code did not execute after {self.timeout} seconds",
                "exit_code": 1,
                "execution_time": int(execution_time * 1000),
                "error": f"Timeout Error: Code did not execute after {self.timeout} seconds",
            }
        except FileNotFoundError:
            execution_time = time.time() - start_time
            stdout_buffer = io.StringIO()
            stderr_buffer = io.StringIO()
            old_stdout, old_stderr = sys.stdout, sys.stderr
            try:
                sys.stdout, sys.stderr = stdout_buffer, stderr_buffer
                exec_globals = {"__builtins__": __builtins__, "__name__": "__main__"}
                exec(code, exec_globals)
                return {
                    "success": True,
                    "stdout": stdout_buffer.getvalue(),
                    "stderr": stderr_buffer.getvalue(),
                    "exit_code": 0,
                    "execution_time": int(execution_time * 1000),
                }
            except Exception as e:
                error_msg = f"{type(e).__name__}: {str(e)}"
                captured_stderr = stderr_buffer.getvalue()
                full_stderr = (captured_stderr + error_msg) if captured_stderr else error_msg
                return {
                    "success": False,
                    "stdout": stdout_buffer.getvalue(),
                    "stderr": full_stderr,
                    "exit_code": 1,
                    "execution_time": int(execution_time * 1000),
                    "error": error_msg,
                }
            finally:
                sys.stdout, sys.stderr = old_stdout, old_stderr
        except Exception as e:
            execution_time = time.time() - start_time
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "exit_code": 1,
                "execution_time": int(execution_time * 1000),
                "error": str(e),
            }

    async def _execute_javascript_local(self, code: str) -> Dict[str, Any]:
        start_time = time.time()
        try:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
                f.write(code)
                temp_file = f.name
            try:
                result = subprocess.run(
                    ["node", temp_file],
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                )
                execution_time = time.time() - start_time
                return {
                    "success": result.returncode == 0,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "exit_code": result.returncode,
                    "execution_time": int(execution_time * 1000),
                }
            finally:
                try:
                    os.unlink(temp_file)
                except Exception:
                    pass
        except subprocess.TimeoutExpired:
            execution_time = time.time() - start_time
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Timeout Error: Code did not execute after {self.timeout} seconds",
                "exit_code": 1,
                "execution_time": int(execution_time * 1000),
                "error": f"Timeout Error: Code did not execute after {self.timeout} seconds",
            }
        except FileNotFoundError:
            execution_time = time.time() - start_time
            return {
                "success": False,
                "stdout": "",
                "stderr": "Node.js is not installed. Please install Node.js to run JavaScript code locally.",
                "exit_code": 1,
                "execution_time": int(execution_time * 1000),
                "error": "Node.js not found",
            }
        except Exception as e:
            execution_time = time.time() - start_time
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "exit_code": 1,
                "execution_time": int(execution_time * 1000),
                "error": str(e),
            }
