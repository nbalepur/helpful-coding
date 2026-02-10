"""Shared helpers for code execution (endpoint decorator injection, syntax validation)."""

from typing import Dict, Any


def inject_endpoint_decorator(code: str) -> str:
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
    if "def endpoint(" not in code:
        lines = code.split("\n")
        insert_index = 0
        for i, line in enumerate(lines):
            if line.strip().startswith("@endpoint"):
                insert_index = i
                break
        lines.insert(insert_index, decorator_code.strip())
        code = "\n".join(lines)
    return code


def validate_python_syntax(code: str) -> Dict[str, Any]:
    """
    Validate Python syntax by compiling the code (no execution).
    """
    try:
        compile(code, "<string>", "exec")
        return {"success": True, "message": "Python syntax is valid"}
    except SyntaxError as e:
        return {
            "success": False,
            "error": f"Syntax error at line {e.lineno}: {e.msg}",
            "line": e.lineno,
            "offset": e.offset,
        }
    except Exception as e:
        return {"success": False, "error": f"Compilation error: {str(e)}"}
