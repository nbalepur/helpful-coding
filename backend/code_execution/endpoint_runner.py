"""
Shared logic for running Python endpoint code: config check, building execution code, parsing stdout.
"""

import ast
import json
import os
from typing import Any, Dict, Optional, Tuple


def check_execution_config() -> Optional[Dict[str, Any]]:
    """Return an error response dict if execution is misconfigured (no RapidAPI key when not local)."""
    use_local = os.getenv("USE_LOCAL_EXECUTION", "False").lower() == "true"
    if not use_local and not os.getenv("RAPIDAPI_KEY"):
        return {
            "success": False,
            "error": "RapidAPI key not configured. Set RAPIDAPI_KEY environment variable.",
            "error_type": "configuration_error",
        }
    return None


def build_endpoint_execution_code(
    python_code: str,
    function_name: str,
    user_args: Dict[str, Any],
    *,
    mock_request: bool = False,
) -> str:
    """
    Build Python code that runs the given endpoint function with user_args.
    If mock_request is True, inject MockRequest/jsonify and type casting (for single endpoint calls).
    If False, call the function with a plain dict (for test runs).
    """
    user_args_str = repr(user_args) if user_args is not None else "{}"
    type_casting_code = ""
    if mock_request:
        try:
            tree = ast.parse(python_code)
            function_node = None
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and node.name == function_name:
                    function_node = node
                    break
            if function_node and function_node.args.args:
                type_casting_code = "# Type casting\n"
                for arg in function_node.args.args:
                    arg_name = arg.arg
                    if arg.annotation and isinstance(arg.annotation, ast.Name):
                        type_name = arg.annotation.id
                        type_casting_code += f"""
    if '{arg_name}' in evaluated_args:
        try:
            evaluated_args['{arg_name}'] = {type_name}(evaluated_args['{arg_name}'])
        except (ValueError, TypeError):
            pass
"""
        except Exception:
            pass

    if mock_request:
        return f"""
class MockRequest:
    def __init__(self, args):
        self.args = args
        self.form = args
    def get_json(self):
        return {user_args_str}
request = MockRequest({user_args_str})
def jsonify(data):
    return data
{python_code}
try:
    user_args_dict = eval({repr(user_args_str)})
    evaluated_args = {{}}
    for key, value in user_args_dict.items():
        try:
            if isinstance(value, (int, float, bool, list, dict)) or value is None:
                evaluated_args[key] = value
            else:
                evaluated_args[key] = eval(str(value))
        except Exception:
            evaluated_args[key] = value
    {type_casting_code}
    result = {function_name}(**evaluated_args)
    print("ENDPOINT_RESULT:", result)
except Exception as e:
    print("ENDPOINT_ERROR:", str(e))
"""
    else:
        return f"""
{python_code}
try:
    user_args_dict = {user_args_str}
    result = {function_name}(**user_args_dict)
    print("ENDPOINT_RESULT:", result)
except Exception as e:
    print("ENDPOINT_ERROR:", str(e))
"""


def parse_endpoint_stdout(stdout: str) -> Tuple[Optional[Any], Optional[str]]:
    """
    Parse stdout from endpoint execution. Returns (result_value, error_message).
    Exactly one of result_value or error_message is set (the other is None).
    If neither ENDPOINT_RESULT nor ENDPOINT_ERROR is found, result_value is the raw stdout.
    """
    if "ENDPOINT_RESULT:" in stdout:
        result_line = [line for line in stdout.split("\n") if "ENDPOINT_RESULT:" in line]
        if result_line:
            result_str = result_line[0].split("ENDPOINT_RESULT:", 1)[1].strip()
            try:
                return json.loads(result_str), None
            except json.JSONDecodeError:
                try:
                    return ast.literal_eval(result_str), None
                except (ValueError, SyntaxError):
                    return result_str, None
            except Exception:
                return result_str, None
        return stdout, None
    if "ENDPOINT_ERROR:" in stdout:
        error_line = [line for line in stdout.split("\n") if "ENDPOINT_ERROR:" in line]
        if error_line:
            error_msg = error_line[0].split("ENDPOINT_ERROR:", 1)[1].strip()
            return None, error_msg
        return None, stdout
    return stdout, None
