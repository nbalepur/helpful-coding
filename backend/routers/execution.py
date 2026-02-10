"""
Code execution API: validate Python, run servers, load tests, execute test cases, LLM judge.
"""
import json
import os
from pathlib import Path
from typing import Dict, Any, List

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from code_execution import (
    get_execution_service,
    check_execution_config,
    build_endpoint_execution_code,
    parse_endpoint_stdout,
)

router = APIRouter(prefix="/api", tags=["Code Execution"])

# Module-level state for Python server processes
active_processes: Dict[int, Dict[str, Any]] = {}
execution_service = get_execution_service()


def _repo_root() -> Path:
    """Return repo root (parent of backend)."""
    return Path(__file__).resolve().parent.parent.parent


def load_json_test_file(content: str, filename: str, test_type_prefix: str = "") -> List[Dict[str, Any]]:
    """Load test cases from a JSON file."""
    try:
        test_cases_raw = json.loads(content)
        test_cases = []
        for test in test_cases_raw:
            original_title = test.get("title", "Uncategorized")
            prefixed_title = f"{test_type_prefix}: {original_title}" if test_type_prefix else original_title
            if test.get("type") == "frontend_interactive":
                test_case = {
                    "title": prefixed_title,
                    "name": test.get("name", "Unknown Test"),
                    "description": test.get("description", ""),
                    "public": test.get("public", False),
                    "type": test.get("type"),
                    "setup": test.get("setup"),
                    "steps": test.get("steps"),
                }
            else:
                test_case = {
                    "title": prefixed_title,
                    "name": test.get("name", "Unknown Test"),
                    "description": test.get("description", ""),
                    "public": test.get("public", False),
                    "metadata": {
                        "type": "endpoint",
                        "endpoint": test.get("endpoint", ""),
                        "input": test.get("input", {}),
                        "expected": test.get("expected"),
                    },
                }
            test_cases.append(test_case)
        return test_cases
    except Exception as e:
        print(f"Error loading JSON test file {filename}: {e}")
        return []


@router.post("/validate-python")
async def validate_python(request_data: dict):
    """Validate Python code syntax using RapidAPI OneCompiler."""
    try:
        python_code = request_data.get("pythonCode", "")
        if not python_code:
            return JSONResponse(status_code=400, content={"error": "No Python code provided"})
        config_err = check_execution_config()
        if config_err:
            return JSONResponse(status_code=500, content=config_err)
        result = await execution_service.validate_python_syntax(python_code)
        if result.get("success"):
            return {"success": True, "message": result.get("message", "Python code is syntactically valid")}
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": result.get("error", "Syntax validation failed"),
                "line": result.get("line"),
                "offset": result.get("offset"),
            },
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@router.post("/execute-function")
async def execute_function(request_data: dict):
    """Execute function-task Python code with optional function invocation."""
    try:
        python_code = request_data.get("pythonCode", "")
        stdin_payload = request_data.get("stdin", "")
        function_name = request_data.get("functionName")
        input_data = request_data.get("input")

        if not python_code:
            return JSONResponse(status_code=400, content={"success": False, "error": "No Python code provided"})

        execution_code = python_code

        if function_name:
            # Serialize so the injected code can deserialize to the correct type (list/dict/str/number)
            serialized_input = json.dumps(input_data)
            # Escape for embedding inside a double-quoted Python string
            escaped = serialized_input.replace("\\", "\\\\").replace('"', '\\"')
            safe_function_name = str(function_name).strip()
            execution_code = (
                f"{python_code}\n\n"
                "import json\n"
                f'__INPUT_PAYLOAD = json.loads("{escaped}")\n'
                f"__TARGET_FUNCTION_NAME = {json.dumps(safe_function_name)}\n"
                "def __invoke_target_function():\n"
                "    target = globals().get(__TARGET_FUNCTION_NAME)\n"
                "    if not callable(target):\n"
                "        raise NameError(f\"Function '{__TARGET_FUNCTION_NAME}' was not found\")\n"
                "    payload = __INPUT_PAYLOAD\n"
                "    if isinstance(payload, dict):\n"
                "        return target(**payload)\n"
                "    if isinstance(payload, (list, tuple)):\n"
                "        return target(*payload)\n"
                "    return target(payload)\n"
                "try:\n"
                "    __result = __invoke_target_function()\n"
                "    if __result is not None:\n"
                "        print(__result)\n"
                "except Exception:\n"
                "    raise\n"
            )

        result = await execution_service.execute_python(execution_code, str(stdin_payload or ""))
        if not result.get("success"):
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": result.get("error", "Execution failed"),
                    "stdout": result.get("stdout", ""),
                    "stderr": result.get("stderr", ""),
                    "exit_code": result.get("exit_code", 1),
                },
            )

        return {
            "success": True,
            "stdout": result.get("stdout", ""),
            "stderr": result.get("stderr", ""),
            "exit_code": result.get("exit_code", 0),
            "execution_time": result.get("execution_time"),
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


async def get_task(task_name: str):
    """Load task definition and files from data/tasks.json (used by agent or other callers)."""
    try:
        repo_root = str(_repo_root())
        data_path = os.path.join(repo_root, "data", "tasks.json")
        if not os.path.exists(data_path):
            return JSONResponse(status_code=404, content={"error": "tasks.json not found"})
        with open(data_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        tasks = payload.get("tasks", [])
        task = next((t for t in tasks if t.get("name") == task_name), None)
        if not task:
            return JSONResponse(status_code=404, content={"error": f"Task '{task_name}' not found"})
        task_description = task.get("description", "")
        if task_description.startswith("data/code_files/"):
            file_path = os.path.join(repo_root, task_description)
            try:
                if os.path.exists(file_path):
                    with open(file_path, "r", encoding="utf-8") as desc_file:
                        task_description = desc_file.read()
                    base_rel_dir = os.path.dirname(task.get("description", ""))
                    if base_rel_dir:
                        import re
                        import base64

                        def _repl_src(match):
                            url = match.group(1)
                            if url.startswith(("http://", "https://", "data:", "/")):
                                return f'src="{url}"'
                            img_path = os.path.join(repo_root, base_rel_dir, url)
                            if os.path.exists(img_path):
                                try:
                                    with open(img_path, "rb") as img_file:
                                        img_data = img_file.read()
                                    mime_type = "application/octet-stream"
                                    if url.lower().endswith(".png"):
                                        mime_type = "image/png"
                                    elif url.lower().endswith((".jpg", ".jpeg")):
                                        mime_type = "image/jpeg"
                                    elif url.lower().endswith(".gif"):
                                        mime_type = "image/gif"
                                    elif url.lower().endswith(".svg"):
                                        mime_type = "image/svg+xml"
                                    data_url = f"data:{mime_type};base64,{base64.b64encode(img_data).decode()}"
                                    return f'src="{data_url}"'
                                except Exception as e:
                                    print(f"Error converting image to data URL: {e}")
                            return f'src="/assets/{base_rel_dir.strip("/")}/{url}"'

                        task_description = re.sub(r'src="([^"]+)"', _repl_src, task_description)
                else:
                    task_description = f"Description file not found: {file_path}"
            except Exception as e:
                task_description = f"Error reading description file: {str(e)}"
        task["description"] = task_description
        tests = task.get("tests", [])
        loaded_tests = []
        test_dirs = []
        if isinstance(tests, str) and tests.startswith("data/test_cases/"):
            test_dirs = [tests]
        elif isinstance(tests, list):
            test_dirs = [t for t in tests if isinstance(t, str) and t.startswith("data/test_cases/")]
        for test_dir_path in test_dirs:
            test_dir = os.path.join(repo_root, test_dir_path)
            test_type_prefix = ""
            if "/backend" in test_dir_path or test_dir_path.endswith("backend"):
                test_type_prefix = "Backend"
            elif "/frontend" in test_dir_path or test_dir_path.endswith("frontend"):
                test_type_prefix = "End-to-End"
            elif "/html" in test_dir_path or test_dir_path.endswith("html"):
                test_type_prefix = "HTML"
            try:
                if os.path.exists(test_dir) and os.path.isdir(test_dir):
                    for filename in sorted(os.listdir(test_dir)):
                        if filename.endswith(".json"):
                            test_file_path = os.path.join(test_dir, filename)
                            with open(test_file_path, "r", encoding="utf-8") as test_file:
                                test_content = test_file.read()
                            test_cases_from_file = load_json_test_file(test_content, filename, test_type_prefix)
                            loaded_tests.extend(test_cases_from_file)
            except Exception as e:
                print(f"Error loading tests from {test_dir}: {e}")
        task["tests"] = loaded_tests
        files = []
        for fdef in task.get("files", []):
            content = fdef.get("content", "")
            if content.startswith("data/code_files/"):
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
                "language": fdef.get("language", "plaintext"),
            })
        return {"task": task, "files": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


async def load_test_cases(request: dict):
    """Load test cases from task data (used by agent or other callers)."""
    try:
        task = request.get("task", {})
        public_only = request.get("public_only", True)
        base_path = _repo_root()
        all_tests = []
        if "tests" in task and isinstance(task["tests"], list):
            for test_entry in task["tests"]:
                if isinstance(test_entry, str):
                    test_dir = base_path / test_entry
                    if test_dir.exists() and test_dir.is_dir():
                        for json_file in sorted(test_dir.glob("*.json")):
                            try:
                                with open(json_file, "r") as f:
                                    tests_from_file = json.load(f)
                                    if isinstance(tests_from_file, list):
                                        all_tests.extend(tests_from_file)
                                    else:
                                        all_tests.append(tests_from_file)
                            except Exception as e:
                                print(f"✗ Error loading test file {json_file}: {e}")
                elif isinstance(test_entry, dict):
                    all_tests.append(test_entry)
        if public_only:
            all_tests = [t for t in all_tests if t.get("public", False)]
        test_cases_by_title = {}
        for test in all_tests:
            title = test.get("title", "Uncategorized")
            if title not in test_cases_by_title:
                test_cases_by_title[title] = []
            test_cases_by_title[title].append(test)
        organized_tests = [{"title": title, "tests": cases} for title, cases in test_cases_by_title.items()]
        return {"testCases": organized_tests}
    except Exception as e:
        print(f"✗ Error in load_test_cases: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


async def execute_test_cases(request: dict):
    """Execute test cases against backend code (used by agent or other callers)."""
    try:
        test_cases = request.get("testCases", [])
        backend_code = request.get("backendCode", "")
        results = []
        for test in test_cases:
            test_name = test.get("name", "Unknown Test")
            metadata = test.get("metadata", {})
            test_type = metadata.get("type", "endpoint")
            if test_type != "endpoint":
                results.append({"testName": test_name, "status": "skip", "message": f"Test type '{test_type}' not supported"})
                continue
            # Function name from metadata (endpoint path or function_name); last path segment used as function name.
            endpoint_or_fn = metadata.get("function_name") or metadata.get("endpoint", "")
            function_name = (endpoint_or_fn.strip("/").split("/")[-1]) if endpoint_or_fn else None
            test_input = metadata.get("input", {})
            expected = metadata.get("expected")
            if not function_name:
                results.append({"testName": test_name, "status": "error", "message": "metadata must include 'endpoint' or 'function_name'", "expected": expected, "actual": None})
                continue
            try:
                execution_code = build_endpoint_execution_code(
                    backend_code, function_name, test_input or {}, mock_request=False
                )
                exec_result = await execution_service.execute_python(execution_code)
                if not exec_result.get("success"):
                    results.append({"testName": test_name, "status": "error", "message": exec_result.get("error", "Unknown error"), "expected": expected, "actual": None})
                    continue
                stdout = exec_result.get("stdout", "")
                actual, endpoint_error = parse_endpoint_stdout(stdout)
                if endpoint_error is not None:
                    results.append({"testName": test_name, "status": "error", "message": endpoint_error, "expected": expected, "actual": None})
                    continue
                passed = actual == expected
                if passed:
                    results.append({"testName": test_name, "status": "pass", "message": "Test passed successfully", "expected": expected, "actual": actual})
                else:
                    results.append({"testName": test_name, "status": "fail", "message": f"Expected {expected} but got {actual}", "expected": expected, "actual": actual})
            except Exception as e:
                results.append({"testName": test_name, "status": "error", "message": str(e), "expected": expected, "actual": None})
        return {"results": results}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
