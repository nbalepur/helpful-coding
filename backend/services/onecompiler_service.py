import httpx
import json
import os
from typing import Dict, Any, Optional
import asyncio
import sys
import io
import time

class OneCompilerService:
    """Service for executing Python code using OneCompiler's API via RapidAPI or local exec()."""
    
    def __init__(self, rapidapi_key: str = None, use_local: bool = None):
        self.base_url = "https://onecompiler-apis.p.rapidapi.com/api/v1"
        self.timeout = 30  # 30 seconds timeout
        self.rapidapi_key = rapidapi_key
        
        # Allow override via parameter, otherwise check environment variable
        if use_local is None:
            self.use_local = os.getenv("USE_LOCAL_EXECUTION", "False").lower() == "true"
        else:
            self.use_local = use_local
        
        if self.use_local:
            print("⚠️  Using LOCAL execution mode (Python exec()). For production, set USE_LOCAL_EXECUTION=False")
        else:
            print("✅ Using OneCompiler API for secure remote execution")
    
    def _inject_endpoint_decorator(self, code: str) -> str:
        """Inject the endpoint decorator function if not present."""
        decorator_code = '''
# Define the endpoint decorator function
def endpoint(path):
    """Decorator to mark functions as API endpoints"""
    def decorator(func):
        func._endpoint_path = path
        func._endpoint_methods = ["GET"]
        return func
    return decorator

'''
        
        # Check if decorator is already defined in the code
        if 'def endpoint(' not in code:
            # Find the first @endpoint decorator and inject decorator before it
            lines = code.split('\n')
            insert_index = 0
            for i, line in enumerate(lines):
                if line.strip().startswith('@endpoint'):
                    insert_index = i
                    break
            
            # Insert decorator before the first @endpoint decorator
            lines.insert(insert_index, decorator_code.strip())
            code = '\n'.join(lines)
        
        return code
    
    async def _execute_local(self, code: str, stdin: str = "") -> Dict[str, Any]:
        """
        Execute Python code locally using exec().
        WARNING: This is unsafe and should only be used for development.
        
        Args:
            code: Python code to execute
            stdin: Standard input for the code (not used in local execution)
            
        Returns:
            Dictionary containing execution results
        """
        # Capture stdout and stderr
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()
        
        start_time = time.time()
        exit_code = 0
        
        try:
            sys.stdout = stdout_buffer
            sys.stderr = stderr_buffer
            
            # Create a clean execution environment
            exec_globals = {
                '__builtins__': __builtins__,
                '__name__': '__main__',
            }
            
            # Execute the code
            exec(code, exec_globals)
            
            execution_time = time.time() - start_time
            
            return {
                "success": True,
                "stdout": stdout_buffer.getvalue(),
                "stderr": stderr_buffer.getvalue(),
                "exit_code": 0,
                "execution_time": int(execution_time * 1000),  # Convert to ms
            }
            
        except Exception as e:
            execution_time = time.time() - start_time
            error_msg = f"{type(e).__name__}: {str(e)}"
            
            return {
                "success": False,
                "stdout": stdout_buffer.getvalue(),
                "stderr": stderr_buffer.getvalue() + "\n" + error_msg,
                "exit_code": 1,
                "execution_time": int(execution_time * 1000),
                "error": error_msg
            }
            
        finally:
            # Restore stdout and stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr
    
    async def execute_python(self, code: str, stdin: str = "") -> Dict[str, Any]:
        """
        Execute Python code using OneCompiler's API or local exec().
        
        Args:
            code: Python code to execute
            stdin: Standard input for the code
            
        Returns:
            Dictionary containing execution results
        """
        # Inject the endpoint decorator function if not present
        code = self._inject_endpoint_decorator(code)
        
        # Use local execution if configured
        if self.use_local:
            print("Executing locally!!")
            return await self._execute_local(code, stdin)
        
        # RapidAPI OneCompiler format
        payload = {
            "language": "python",
            "stdin": stdin,
            "files": [
                {
                    "name": "index.py",
                    "content": code
                }
            ]
        }
        
        try:
            headers = {
                "Content-Type": "application/json",
                "x-rapidapi-host": "onecompiler-apis.p.rapidapi.com"
            }
            
            # Add RapidAPI key if available
            if self.rapidapi_key:
                headers["x-rapidapi-key"] = self.rapidapi_key
            else:
                return {
                    "success": False,
                    "error": "RapidAPI key is required. Set RAPIDAPI_KEY environment variable."
                }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Use RapidAPI OneCompiler endpoint
                response = await client.post(
                    "https://onecompiler-apis.p.rapidapi.com/api/v1/run",
                    json=payload,
                    headers=headers
                )
                
                # Debug logging (remove in production)
                if os.getenv("DEBUG", "False").lower() == "true":
                    print(f"OneCompiler API Response Status: {response.status_code}")
                    print(f"OneCompiler API Response: {response.text[:500]}...")
                
                if response.status_code == 200:
                    result = response.json()
                    return {
                        "success": True,
                        "stdout": result.get("stdout", ""),
                        "stderr": result.get("stderr", ""),
                        "exit_code": result.get("exitCode", 0),
                        "execution_time": result.get("executionTime", 0),
                        "raw_response": result  # Include raw response for debugging
                    }
                else:
                    return {
                        "success": False,
                        "error": f"OneCompiler API error: {response.status_code}",
                        "details": response.text
                    }
                    
        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "OneCompiler API timeout - code execution took too long"
            }
        except httpx.RequestError as e:
            return {
                "success": False,
                "error": f"OneCompiler API request failed: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error calling OneCompiler API: {str(e)}"
            }
    
    async def validate_python_syntax(self, code: str) -> Dict[str, Any]:
        """
        Validate Python syntax locally.
        This is a lightweight check that doesn't execute the code.
        """
        # Inject the endpoint decorator function if not present
        code = self._inject_endpoint_decorator(code)
        
        # Validate syntax by compiling the code
        try:
            compile(code, '<string>', 'exec')
            return {
                "success": True,
                "message": "Python syntax is valid"
            }
        except SyntaxError as e:
            return {
                "success": False,
                "error": f"Syntax error at line {e.lineno}: {e.msg}",
                "line": e.lineno,
                "offset": e.offset
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Compilation error: {str(e)}"
            }
    
    async def execute_with_inputs(self, code: str, test_cases: list) -> Dict[str, Any]:
        """
        Execute Python code with multiple test cases.
        
        Args:
            code: Python code to execute
            test_cases: List of input/output test cases
            
        Returns:
            Dictionary containing results for all test cases
        """
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
                "passed": False
            }
            
            if result.get("success"):
                # Check if output matches expected
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
            "passed_tests": sum(1 for r in results if r.get("passed", False))
        }
