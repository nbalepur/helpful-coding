"""OneCompiler API service for remote execution of Python and JavaScript."""

import os
from typing import Dict, Any

import httpx

from code_execution.base import BaseExecutionService
from code_execution.code_helpers import inject_endpoint_decorator, validate_python_syntax as _validate_syntax


class OneCompilerService(BaseExecutionService):
    """Execute Python and JavaScript code via OneCompiler's RapidAPI."""

    def __init__(self, rapidapi_key: str = None, timeout: int = 60):
        self.base_url = "https://onecompiler-apis.p.rapidapi.com/api/v1"
        self.timeout = timeout
        self.rapidapi_key = rapidapi_key
        print("✅ Using OneCompiler API for secure remote execution")

    async def execute_python(self, code: str, stdin: str = "") -> Dict[str, Any]:
        code = inject_endpoint_decorator(code)
        return await self._run("python", "index.py", code, stdin)

    async def execute_javascript(self, code: str, stdin: str = "") -> Dict[str, Any]:
        return await self._run("javascript", "index.js", code, stdin)

    async def validate_python_syntax(self, code: str) -> Dict[str, Any]:
        code = inject_endpoint_decorator(code)
        return _validate_syntax(code)

    async def _run(
        self, language: str, filename: str, code: str, stdin: str
    ) -> Dict[str, Any]:
        if not self.rapidapi_key:
            return {
                "success": False,
                "error": "RapidAPI key is required. Set RAPIDAPI_KEY environment variable.",
            }
        payload = {
            "language": language,
            "stdin": stdin,
            "files": [{"name": filename, "content": code}],
        }
        headers = {
            "Content-Type": "application/json",
            "x-rapidapi-host": "onecompiler-apis.p.rapidapi.com",
            "x-rapidapi-key": self.rapidapi_key,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/run",
                    json=payload,
                    headers=headers,
                )
            if os.getenv("DEBUG", "False").lower() == "true":
                print(f"OneCompiler API Response Status: {response.status_code}")
                print(f"OneCompiler API Response: {response.text[:500]}...")
            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"OneCompiler API error: {response.status_code}",
                    "details": response.text,
                }
            result = response.json()
            if isinstance(result, dict) and "data" in result and isinstance(result["data"], dict):
                result = result["data"]
            stdout = result.get("stdout", result.get("output", ""))
            stderr = result.get("stderr", result.get("error", ""))
            exception = result.get("exception", "")
            exit_code = result.get("exitCode", result.get("exit_code", 0))
            execution_time = result.get("executionTime", result.get("execution_time", 0))
            if exception:
                combined_stderr = f"{stderr}\n{exception}".strip() if stderr else exception
                return {
                    "success": False,
                    "stdout": stdout or "",
                    "stderr": combined_stderr,
                    "exit_code": 1,
                    "execution_time": int(execution_time) if execution_time else 0,
                    "error": exception,
                    "raw_response": result,
                }
            return {
                "success": True,
                "stdout": stdout or "",
                "stderr": stderr or "",
                "exit_code": int(exit_code) if exit_code else 0,
                "execution_time": int(execution_time) if execution_time else 0,
                "raw_response": result,
            }
        except httpx.TimeoutException:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Timeout Error: Code did not execute after {self.timeout} seconds",
                "exit_code": 1,
                "execution_time": self.timeout * 1000,
                "error": f"Timeout Error: Code did not execute after {self.timeout} seconds",
            }
        except httpx.RequestError as e:
            return {"success": False, "error": f"OneCompiler API request failed: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"Unexpected error calling OneCompiler API: {str(e)}"}
