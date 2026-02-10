"""Abstract base class for Python/JavaScript execution services."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseExecutionService(ABC):
    """Interface for executing Python and JavaScript code (local or remote)."""

    @abstractmethod
    async def execute_python(self, code: str, stdin: str = "") -> Dict[str, Any]:
        """Execute Python code. Returns dict with success, stdout, stderr, exit_code, execution_time, error."""
        ...

    @abstractmethod
    async def execute_javascript(self, code: str, stdin: str = "") -> Dict[str, Any]:
        """Execute JavaScript code. Returns dict with success, stdout, stderr, exit_code, execution_time, error."""
        ...

    @abstractmethod
    async def validate_python_syntax(self, code: str) -> Dict[str, Any]:
        """Validate Python syntax without executing. Returns dict with success, message/error, optional line/offset."""
        ...

    async def execute_with_inputs(self, code: str, test_cases: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Run code against multiple test cases (input + expected_output). Shared implementation."""
        results = []
        for i, test_case in enumerate(test_cases):
            stdin = test_case.get("input", "")
            expected_output = test_case.get("expected_output", "")
            result = await self.execute_python(code, stdin)
            test_result = {
                "test_case": i + 1,
                "input": stdin,
                "expected_output": expected_output,
                "actual_output": result.get("stdout", "").strip(),
                "success": result.get("success", False),
                "passed": False,
            }
            if result.get("success"):
                actual = test_result["actual_output"]
                expected = expected_output.strip()
                test_result["passed"] = actual == expected
                test_result["execution_time"] = result.get("execution_time", 0)
            else:
                test_result["error"] = result.get("error", "Unknown error")
            results.append(test_result)
        return {
            "success": True,
            "results": results,
            "total_tests": len(test_cases),
            "passed_tests": sum(1 for r in results if r.get("passed", False)),
        }
