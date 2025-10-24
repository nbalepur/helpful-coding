from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import os
import subprocess
import tempfile
import signal
import psutil
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv
import openai
from strategies.base import BaseStrategy
from models.chat import ChatModel
from parsers.endpoint_parser import EndpointParser
from services.onecompiler_service import OneCompilerService

# Load environment variables from .env file
load_dotenv()

# No rate limiting needed - OneCompiler handles execution security

def setup_environment():
    """Set up environment variables if .env file doesn't exist."""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    
    if not os.path.exists(env_path):
        print("🔧 No .env file found. Let's create one!")
        print("Please enter your OpenAI API key:")
        
        api_key = input("OPENAI_API_KEY: ").strip()
        
        if not api_key:
            print("❌ No API key provided. Exiting.")
            exit(1)
        
        # Create .env file
        env_content = f"""# OpenAI API Configuration
OPENAI_API_KEY={api_key}

# RapidAPI Configuration (optional)
# Get your API key from: https://rapidapi.com/onecompiler/api/onecompiler-apis
RAPIDAPI_KEY=

# Execution Mode (optional)
# Set to True for local development (uses Python exec() - UNSAFE, only for development)
# Set to False for production (uses OneCompiler API - secure remote execution)
USE_LOCAL_EXECUTION=True

# Server Configuration (optional)
HOST=0.0.0.0
PORT=8000
DEBUG=True
"""
        
        try:
            with open(env_path, 'w') as f:
                f.write(env_content)
            print("✅ .env file created successfully!")
            # Reload environment variables
            load_dotenv()
        except Exception as e:
            print(f"❌ Error creating .env file: {e}")
            exit(1)

# Set up environment if needed
setup_environment()

app = FastAPI(title="AI Coding Assistant Backend")
# Serve repository assets (e.g., images) with a stable URL: /assets/{path}
@app.get("/assets/{file_path:path}")
async def serve_asset(file_path: str):
    try:
        backend_dir = os.path.dirname(__file__)
        repo_root = os.path.abspath(os.path.join(backend_dir, ".."))
        abs_path = os.path.join(repo_root, file_path)
        if not os.path.exists(abs_path):
            return JSONResponse(status_code=404, content={"error": "Asset not found"})
        # Basic safe-guard to prevent directory traversal outside repo
        if not os.path.abspath(abs_path).startswith(repo_root):
            return JSONResponse(status_code=403, content={"error": "Forbidden"})
        
        # Determine content type based on file extension
        content_type = "application/octet-stream"
        if file_path.lower().endswith('.png'):
            content_type = "image/png"
        elif file_path.lower().endswith('.jpg') or file_path.lower().endswith('.jpeg'):
            content_type = "image/jpeg"
        elif file_path.lower().endswith('.gif'):
            content_type = "image/gif"
        elif file_path.lower().endswith('.svg'):
            content_type = "image/svg+xml"
        
        return FileResponse(abs_path, media_type=content_type)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "http://localhost:*",  # Allow localhost with any port for iframes
        "http://127.0.0.1:*"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize chat model
try:
    chat_model = ChatModel()
    print("✅ Backend initialized successfully with Autocomplete strategy")
except ValueError as e:
    print(f"❌ Error: {e}")
    print("Please create a .env file in the backend directory with your OpenAI API key")
    exit(1)

# Store active Python processes
active_processes = {}

# Initialize endpoint parser
endpoint_parser = EndpointParser()

# Initialize OneCompiler service
rapidapi_key = os.getenv("RAPIDAPI_KEY")
onecompiler_service = OneCompilerService(rapidapi_key=rapidapi_key)

# Python test file parser and executor
import re
import ast

def load_json_test_file(content: str, filename: str, test_type_prefix: str = "") -> List[Dict[str, Any]]:
    """Load test cases from a JSON file"""
    try:
        test_cases_raw = json.loads(content)
        
        # Convert to the expected format
        test_cases = []
        for test in test_cases_raw:
            # Add prefix to title based on test type
            original_title = test.get("title", "Uncategorized")
            prefixed_title = f"{test_type_prefix}: {original_title}" if test_type_prefix else original_title
            
            # Check if this is a frontend_interactive test
            if test.get("type") == "frontend_interactive":
                # Preserve the original structure for frontend interactive tests
                test_case = {
                    "title": prefixed_title,
                    "name": test.get("name", "Unknown Test"),
                    "description": test.get("description", ""),
                    "public": test.get("public", False),
                    "type": test.get("type"),  # Preserve type
                    "setup": test.get("setup"),  # Preserve setup
                    "steps": test.get("steps")  # Preserve steps
                }
            else:
                # Legacy format for backend tests
                test_case = {
                    "title": prefixed_title,
                    "name": test.get("name", "Unknown Test"),
                    "description": test.get("description", ""),
                    "public": test.get("public", False),
                    "metadata": {
                        "type": "endpoint",
                        "endpoint": test.get("endpoint", ""),
                        "input": test.get("input", {}),
                        "expected": test.get("expected")
                    }
                }
            test_cases.append(test_case)
        
        return test_cases
        
    except Exception as e:
        print(f"Error loading JSON test file {filename}: {e}")
        return []

@app.get("/")
async def root():
    return {"message": "AI Coding Assistant Backend is running!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Backend is operational"}

@app.post("/api/execute-endpoint")
async def execute_endpoint(request_data: dict):
    """Execute Python code and optionally call a specific endpoint function using RapidAPI OneCompiler."""
    try:
        python_code = request_data.get("pythonCode", "")
        endpoint_name = request_data.get("endpoint", "")
        user_args = request_data.get("args", {})

        if not python_code:
            return JSONResponse(status_code=400, content={"error": "No Python code provided"})
        
        # Check if RapidAPI key is configured
        if not rapidapi_key:
            return JSONResponse(status_code=500, content={
                "success": False,
                "error": "RapidAPI key not configured. Set RAPIDAPI_KEY environment variable.",
                "error_type": "configuration_error"
            })
        
        # If no endpoint specified, just return the available endpoints
        if not endpoint_name:
            try:
                endpoints = endpoint_parser.parse_to_dict(python_code)
                return {
                    "success": True,
                    "endpoints": endpoints,
                    "count": len(endpoints),
                    "message": "Code parsed successfully"
                }
            except Exception as e:
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "error": str(e),
                    "error_type": "parsing_error"
                })
        
        # Execute the specific endpoint using RapidAPI OneCompiler
        try:
            # Create a modified version of the code that can execute the endpoint function
            # We need to add the endpoint decorator logic and call the specific function
            
            # First, parse the endpoints to get the function info
            endpoints = endpoint_parser.parse_to_dict(python_code)
            
            # Find the function that matches the endpoint path
            function_name = None
            for ep in endpoints:
                if ep.get('endpoint') == endpoint_name or ep.get('name') == endpoint_name:
                    function_name = ep['name']
                    break
            
            if not function_name:
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "error": f"Endpoint '{endpoint_name}' not found in the code. Available endpoints: {[ep.get('endpoint', ep.get('name')) for ep in endpoints]}",
                    "error_type": "endpoint_not_found"
                })
            
            # Create execution code that includes the endpoint decorator and calls the function
            # Use eval() + type casting approach for better argument handling
            user_args_str = repr(user_args) if user_args is not None else "{}"
            
            # Get function signature for type casting
            import ast
            
            # Parse the function to get its signature and type annotations
            try:
                tree = ast.parse(python_code)
                function_node = None
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef) and node.name == function_name:
                        function_node = node
                        break
                
                type_casting_code = ""
                if function_node and function_node.args.args:
                    type_casting_code = "# Type casting based on function annotations\n"
                    for arg in function_node.args.args:
                        arg_name = arg.arg
                        if arg.annotation:
                            # Extract type annotation
                            if isinstance(arg.annotation, ast.Name):
                                type_name = arg.annotation.id
                                type_casting_code += f"""
    if '{arg_name}' in evaluated_args:
        try:
            evaluated_args['{arg_name}'] = {type_name}(evaluated_args['{arg_name}'])
        except (ValueError, TypeError):
            pass  # Keep original value if casting fails
"""
            except Exception:
                type_casting_code = "# Type casting not available\n"
            
            execution_code = f"""
# Mock Flask objects
class MockRequest:
    def __init__(self, args):
        self.args = args
        self.form = args
    def get_json(self):
        return {user_args_str}

request = MockRequest({user_args_str})

def jsonify(data):
    return data

# Original code (using function annotations)
{python_code}

# Call the specific endpoint function with user arguments using eval()
try:
    # Use eval to properly handle each argument with correct types
    user_args_dict = eval({repr(user_args_str)})
    # Evaluate each argument individually to ensure proper type handling
    evaluated_args = {{}}
    for key, value in user_args_dict.items():
        # Try to evaluate the value directly, preserving its original type
        try:
            # If it's already a proper type, use it directly
            if isinstance(value, (int, float, bool, list, dict)) or value is None:
                evaluated_args[key] = value
            else:
                # For strings, try to evaluate them to get the proper type
                evaluated_args[key] = eval(str(value))
        except:
            # If evaluation fails, use the original value
            evaluated_args[key] = value
    
    {type_casting_code}
    
    result = {function_name}(**evaluated_args)
    print("ENDPOINT_RESULT:", result)
except Exception as e:
    print("ENDPOINT_ERROR:", str(e))
"""
            
            # Execute using RapidAPI OneCompiler
            result = await onecompiler_service.execute_python(execution_code)

            print(result)
            
            if result.get("success"):
                stdout = result.get("stdout", "")
                
                # Parse the result from stdout
                if "ENDPOINT_RESULT:" in stdout:
                    # Extract the result after ENDPOINT_RESULT:
                    result_line = [line for line in stdout.split('\n') if 'ENDPOINT_RESULT:' in line]
                    if result_line:
                        try:
                            # Try to parse the result as JSON
                            result_str = result_line[0].split('ENDPOINT_RESULT:', 1)[1].strip()
                            # Try JSON parsing first
                            import json
                            endpoint_result = json.loads(result_str)
                        except json.JSONDecodeError:
                            # If not valid JSON, try to parse as Python literal
                            try:
                                import ast
                                endpoint_result = ast.literal_eval(result_str)
                            except (ValueError, SyntaxError):
                                # If all parsing fails, return as string
                                endpoint_result = result_str
                        except Exception as parse_error:
                            # If parsing fails, return the raw string
                            endpoint_result = result_str
                    else:
                        endpoint_result = stdout
                elif "ENDPOINT_ERROR:" in stdout:
                    # Extract error from stdout
                    error_line = [line for line in stdout.split('\n') if 'ENDPOINT_ERROR:' in line]
                    if error_line:
                        error_msg = error_line[0].split('ENDPOINT_ERROR:', 1)[1].strip()
                        return JSONResponse(status_code=500, content={
                            "success": False,
                            "error": error_msg,
                            "error_type": "execution_error"
                        })
                    else:
                        endpoint_result = stdout
                else:
                    # If no specific markers found, return the full stdout
                    endpoint_result = stdout
                
                return {
                    "success": True,
                    "result": endpoint_result,
                    "endpoint": endpoint_name,
                    "args_used": user_args,
                    "execution_method": "rapidapi_onecompiler"
                }
            else:
                return JSONResponse(status_code=500, content={
                    "success": False,
                    "error": result.get('error', 'Unknown error'),
                    "error_type": "execution_error"
                })
                
        except Exception as e:
            return JSONResponse(status_code=500, content={
                "success": False,
                "error": str(e),
                "error_type": "execution_error"
            })
            
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "error": str(e),
            "error_type": "unexpected_error"
        })

@app.post("/api/validate-python")
async def validate_python(request_data: dict):
    """Validate Python code syntax using RapidAPI OneCompiler."""
    try:
        python_code = request_data.get("pythonCode", "")
        
        if not python_code:
            return JSONResponse(status_code=400, content={"error": "No Python code provided"})
        
        # Check if RapidAPI key is configured
        if not rapidapi_key:
            return JSONResponse(status_code=500, content={
                "success": False,
                "error": "RapidAPI key not configured. Set RAPIDAPI_KEY environment variable.",
                "error_type": "configuration_error"
            })
        
        # Use OneCompiler service for syntax validation
        result = await onecompiler_service.validate_python_syntax(python_code)
        
        if result.get("success"):
            return {
                "success": True,
                "message": result.get("message", "Python code is syntactically valid")
            }
        else:
            return JSONResponse(status_code=400, content={
                "success": False,
                "error": result.get("error", "Syntax validation failed"),
                "line": result.get("line"),
                "offset": result.get("offset")
            })
        
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "error": str(e)
        })

@app.post("/api/start-python-server")
async def start_python_server(request_data: dict):
    """Start a Python Flask server as a subprocess."""
    try:
        python_code = request_data.get("pythonCode", "")
        port = request_data.get("port", 5000)
        
        if not python_code:
            return JSONResponse(status_code=400, content={"error": "No Python code provided"})
        
        # Stop any existing server on this port
        if port in active_processes:
            await stop_python_server(port)
        
        # Create a temporary file for the Python code
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(python_code)
            temp_file_path = f.name
        
        try:
            # Start the Python subprocess
            process = subprocess.Popen(
                ["python3", temp_file_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Store process info
            active_processes[port] = {
                "process": process,
                "temp_file": temp_file_path,
                "start_time": asyncio.get_event_loop().time(),
                "code": python_code
            }
            
            # Give the process a moment to start
            await asyncio.sleep(1)
            
            # Check if process is still running
            if process.poll() is None:
                return {
                    "success": True,
                    "port": port,
                    "processId": process.pid,
                    "message": f"Python server started on port {port}"
                }
            else:
                # Process died, get error output
                stdout, stderr = process.communicate()
                error_msg = stderr or stdout or "Process exited unexpectedly"
                return JSONResponse(
                    status_code=500, 
                    content={"error": f"Failed to start Python server: {error_msg}"}
                )
                
        except Exception as e:
            # Clean up temp file on error
            try:
                os.unlink(temp_file_path)
            except:
                pass
            return JSONResponse(status_code=500, content={"error": str(e)})
            
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/stop-python-server")
async def stop_python_server_endpoint(request_data: dict):
    """Stop a Python Flask server subprocess."""
    try:
        port = request_data.get("port")
        if port is None:
            return JSONResponse(status_code=400, content={"error": "No port specified"})
        
        success = await stop_python_server(port)
        if success:
            return {"success": True, "message": f"Server on port {port} stopped"}
        else:
            return JSONResponse(status_code=404, content={"error": f"No server found on port {port}"})
            
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

async def stop_python_server(port):
    """Helper function to stop a Python server process."""
    if port not in active_processes:
        return False
    
    process_info = active_processes[port]
    process = process_info["process"]
    temp_file = process_info["temp_file"]
    
    try:
        # Terminate the process
        if process.poll() is None:  # Process is still running
            process.terminate()
            
            # Wait for graceful termination
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # Force kill if it doesn't terminate gracefully
                process.kill()
                process.wait()
        
        # Clean up temp file
        try:
            os.unlink(temp_file)
        except:
            pass
            
        # Remove from active processes
        del active_processes[port]
        
        return True
        
    except Exception as e:
        print(f"Error stopping server on port {port}: {e}")
        return False

@app.get("/api/list-python-servers")
async def list_python_servers():
    """List all active Python server processes."""
    servers = []
    for port, info in active_processes.items():
        process = info["process"]
        servers.append({
            "port": port,
            "processId": process.pid,
            "status": "running" if process.poll() is None else "stopped",
            "startTime": info["start_time"]
        })
    
    return {"servers": servers}

@app.post("/api/chat")
async def chat_endpoint(request_data: dict):
    """REST API endpoint for non-streaming chat requests."""
    try:
        messages = request_data.get("messages", [])
        model = request_data.get("model", "gpt-4")
        max_tokens = request_data.get("max_tokens", 1000)
        proactive = request_data.get("proactive", False)
        current_code = request_data.get("current_code", "")
        
        # Prepare messages for AI
        if proactive and current_code:
            user_message = messages[-1] if messages else {"role": "user", "content": ""}
            enhanced_message = {
                "role": "user", 
                "content": f"Code:\n{current_code}\n\nMessage:\n{user_message.get('content', '')}"
            }
            messages_to_send = messages[:-1] + [enhanced_message]
        else:
            messages_to_send = messages
        
        # Get response from chat model
        response = await chat_model.stream_response(
            messages=messages_to_send,
            model=model,
            max_tokens=max_tokens,
            on_chunk=None,
            on_complete=None,
            on_error=None,
            current_code=current_code
        )
        
        # For autocomplete strategy, also return the generated code
        generated_code = ""
        if hasattr(chat_model.strategy, 'get_last_generated_code'):
            generated_code = chat_model.strategy.get_last_generated_code()
        
        return {
            "response": response,
            "generated_code": generated_code
        }
        
    except Exception as e:
        return {"error": str(e)}, 500

@app.get("/tasks/{task_name}")
async def get_task(task_name: str):
    try:
        backend_dir = os.path.dirname(__file__)
        repo_root = os.path.abspath(os.path.join(backend_dir, ".."))
        data_path = os.path.join(repo_root, "data", "dummy_tasks.json")
        if not os.path.exists(data_path):
            return JSONResponse(status_code=404, content={"error": "dummy_tasks.json not found"})

        with open(data_path, "r", encoding="utf-8") as f:
            payload = json.load(f)

        tasks = payload.get("tasks", [])
        task = next((t for t in tasks if t.get("name") == task_name), None)
        if not task:
            return JSONResponse(status_code=404, content={"error": f"Task '{task_name}' not found"})

        # Handle task description - if it's a file path, load the content
        task_description = task.get("description", "")
        if task_description.startswith("data/code_files/"):
            file_path = os.path.join(repo_root, task_description)
            try:
                if os.path.exists(file_path):
                    with open(file_path, "r", encoding="utf-8") as desc_file:
                        task_description = desc_file.read()
                    # Compute base relative path for assets (e.g., images) and convert to data URLs
                    base_rel_dir = os.path.dirname(task.get("description", ""))
                    # base_rel_dir like data/code_files/tictactoe_solution
                    if base_rel_dir:
                        import re
                        import base64
                        
                        # Replace src="..." with data URLs for images
                        def _repl_src(match):
                            url = match.group(1)
                            if url.startswith(('http://','https://','data:','/')):
                                return f'src="{url}"'
                            
                            # Try to load the image and convert to data URL
                            img_path = os.path.join(repo_root, base_rel_dir, url)
                            if os.path.exists(img_path):
                                try:
                                    with open(img_path, 'rb') as img_file:
                                        img_data = img_file.read()
                                        # Determine MIME type from extension
                                        mime_type = 'application/octet-stream'
                                        if url.lower().endswith('.png'):
                                            mime_type = 'image/png'
                                        elif url.lower().endswith(('.jpg', '.jpeg')):
                                            mime_type = 'image/jpeg'
                                        elif url.lower().endswith('.gif'):
                                            mime_type = 'image/gif'
                                        elif url.lower().endswith('.svg'):
                                            mime_type = 'image/svg+xml'
                                        
                                        data_url = f'data:{mime_type};base64,{base64.b64encode(img_data).decode()}'
                                        return f'src="{data_url}"'
                                except Exception as e:
                                    print(f"Error converting image to data URL: {e}")
                            
                            # Fallback to /assets/ URL if conversion fails
                            return f'src="/assets/{base_rel_dir.strip("/")}/{url}"'
                        
                        task_description = re.sub(r'src="([^"]+)"', _repl_src, task_description)
                else:
                    task_description = f"Description file not found: {file_path}"
            except Exception as e:
                task_description = f"Error reading description file: {str(e)}"
        
        # Update the task with the loaded description
        task["description"] = task_description

        # Handle tests - if it's a directory path (or array of paths), load all test files
        tests = task.get("tests", [])
        loaded_tests = []
        
        # Convert single string to array for uniform processing
        test_dirs = []
        if isinstance(tests, str) and tests.startswith("data/test_cases/"):
            test_dirs = [tests]
        elif isinstance(tests, list):
            test_dirs = [t for t in tests if isinstance(t, str) and t.startswith("data/test_cases/")]
        
        # Load tests from all directories
        for test_dir_path in test_dirs:
            test_dir = os.path.join(repo_root, test_dir_path)
            
            # Determine test type prefix from directory name
            test_type_prefix = ""
            if "/backend" in test_dir_path or test_dir_path.endswith("backend"):
                test_type_prefix = "Backend"
            elif "/frontend" in test_dir_path or test_dir_path.endswith("frontend"):
                test_type_prefix = "End-to-End"
            elif "/html" in test_dir_path or test_dir_path.endswith("html"):
                test_type_prefix = "HTML"
            
            try:
                if os.path.exists(test_dir) and os.path.isdir(test_dir):
                    # Load all .json test files in the test directory
                    for filename in sorted(os.listdir(test_dir)):
                        if filename.endswith('.json'):
                            test_file_path = os.path.join(test_dir, filename)
                            with open(test_file_path, 'r', encoding='utf-8') as test_file:
                                test_content = test_file.read()
                                
                            # Load JSON test file with prefix
                            test_cases_from_file = load_json_test_file(test_content, filename, test_type_prefix)
                            loaded_tests.extend(test_cases_from_file)
            except Exception as e:
                print(f"Error loading tests from {test_dir}: {e}")
        
        task["tests"] = loaded_tests

        files = []
        for fdef in task.get("files", []):
            content = fdef.get("content", "")
            
            # Check if content is a file path (starts with data/code_files/)
            if content.startswith("data/code_files/"):
                # Read content from file
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
                "language": fdef.get("language", "plaintext")
            })

        return {"task": task, "files": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/load-test-cases")
async def load_test_cases(request: dict):
    """
    Load test cases from task data.
    
    The task.tests field should contain an array of:
    - Directory paths (strings) - will load all JSON files from that directory
    - Test objects (dicts) - will be used directly
    
    Request body:
    {
        "task": {
            "tests": [
                "data/test_cases/tictactoe/backend",
                "data/test_cases/tictactoe/frontend",
                ...
            ]
        },
        "public_only": true/false  # Optional: filter for public tests only (default: true)
    }
    
    Returns:
    {
        "testCases": [
            {
                "title": "...",
                "tests": [...]
            }
        ]
    }
    """
    try:
        task = request.get("task", {})
        public_only = request.get("public_only", True)
        
        all_tests = []
        base_path = Path(__file__).parent.parent
        
        # Load tests from task.tests field
        if "tests" in task and isinstance(task["tests"], list):
            for test_entry in task["tests"]:
                # Check if it's a directory path (string)
                if isinstance(test_entry, str):
                    # Convert relative path to absolute
                    test_dir = base_path / test_entry
                    
                    if test_dir.exists() and test_dir.is_dir():
                        # Load all JSON files from this directory
                        for json_file in sorted(test_dir.glob("*.json")):
                            try:
                                with open(json_file, 'r') as f:
                                    tests_from_file = json.load(f)
                                    if isinstance(tests_from_file, list):
                                        all_tests.extend(tests_from_file)
                                    else:
                                        all_tests.append(tests_from_file)
                                print(f"✓ Loaded {len(tests_from_file) if isinstance(tests_from_file, list) else 1} tests from {json_file.name}")
                            except Exception as e:
                                print(f"✗ Error loading test file {json_file}: {e}")
                    else:
                        print(f"⚠ Test directory not found: {test_dir}")
                # If it's a dict, it's an inline test definition
                elif isinstance(test_entry, dict):
                    all_tests.append(test_entry)
        
        # Filter tests by public flag if requested
        if public_only:
            all_tests = [test for test in all_tests if test.get("public", False)]
        
        # Organize test cases by title
        test_cases_by_title = {}
        for test in all_tests:
            title = test.get("title", "Uncategorized")
            if title not in test_cases_by_title:
                test_cases_by_title[title] = []
            test_cases_by_title[title].append(test)
        
        # Convert to array format for frontend
        organized_tests = []
        for title, cases in test_cases_by_title.items():
            organized_tests.append({
                "title": title,
                "tests": cases
            })
        
        print(f"✓ Returning {len(organized_tests)} test groups with {len(all_tests)} total tests")
        return {"testCases": organized_tests}
    except Exception as e:
        print(f"✗ Error in load_test_cases: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/llm-judge")
async def llm_judge(request: dict):
    """
    Use OpenAI's vision API to judge a screenshot against test criteria.
    
    Request body:
    {
        "screenshot": "data:image/png;base64,...",  # Base64 encoded screenshot
        "testCase": {
            "name": "...",
            "description": "..."
        },
        "htmlCode": "..."  # Optional HTML code for context
    }
    
    Returns:
    {
        "judgment": "pass" | "fail",
        "explanation": "..."
    }
    """
    print('hello!')
    try:
        screenshot = request.get("screenshot")
        test_case = request.get("testCase", {})
        html_code = request.get("htmlCode", "")
        
        if not screenshot:
            return JSONResponse(status_code=400, content={"error": "No screenshot provided"})
        
        if not test_case.get("description"):
            return JSONResponse(status_code=400, content={"error": "No test description provided"})
        
        # Get OpenAI API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return JSONResponse(status_code=500, content={
                "error": "OpenAI API key not configured"
            })
        
        # Prepare the prompt for GPT-4 Vision
        prompt = f"""You are a test judge evaluating a web page screenshot against specific criteria.

Test Name: {test_case['name']}
Test Description: {test_case['description']}

Your task:
1. Carefully examine the screenshot of the rendered web page
2. Determine if the page meets the requirement described above
3. Respond with ONLY a JSON object in this exact format:
{{
    "judgment": "pass" or "fail",
    "explanation": "A clear explanation of your decision"
}}

Be strict but fair in your evaluation. If the requirement is met, even if not perfectly, your judgment should be \"pass\". If critical elements are missing or the requirement is clearly not satisfied, your judgment should be \"fail\"."""

        # Call OpenAI Vision API
        client = openai.OpenAI(api_key=api_key)

        for num_attempts in range(5):
            response = client.chat.completions.create(
                model="gpt-4o-2024-08-06",  # Use gpt-4o which supports vision
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": screenshot,
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=500,
            )
            
            # Parse the response
            response_text = response.choices[0].message.content.strip()
            response_text = response_text.replace("`", "").replace("json", "")
            response_text = response_text[response_text.index("{"):response_text.rindex("}")+1]
                
            result = json.loads(response_text)
            print(result)

            if result.get("judgment", "") not in {"pass", "fail"} or result.get("explanation", "") == "":
                continue
        
            return {
                "judgment": result.get("judgment", "fail").lower(),
                "explanation": result.get("explanation", "No explanation provided")   
            }
        
    except Exception as e:
        print(f"Error in LLM judge: {e}")
        return JSONResponse(status_code=500, content={
            "error": f"Failed to judge screenshot: {str(e)}"
        })

@app.post("/api/execute-test-cases")
async def execute_test_cases(request: dict):
    """
    Execute a subset of test cases against the backend code.
    
    Request body:
    {
        "testCases": [...],  # Array of test cases to execute
        "backendCode": "...",  # The backend Python code to test
        "port": 5000  # Optional port number
    }
    
    Returns:
    {
        "results": [
            {
                "testName": "...",
                "status": "pass" | "fail" | "error",
                "message": "...",
                "expected": {...},
                "actual": {...}
            }
        ]
    }
    """
    try:
        test_cases = request.get("testCases", [])
        backend_code = request.get("backendCode", "")
        port = request.get("port", 5000)
        
        results = []
        
        # Parse endpoints from backend code
        try:
            endpoints = endpoint_parser.parse_to_dict(backend_code)
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"error": f"Failed to parse backend code: {str(e)}"}
            )
        
        # Execute each test case
        for test in test_cases:
            test_name = test.get("name", "Unknown Test")
            metadata = test.get("metadata", {})
            test_type = metadata.get("type", "endpoint")
            
            # All tests should be endpoint-based now
            if test_type != "endpoint":
                results.append({
                    "testName": test_name,
                    "status": "skip",
                    "message": f"Test type '{test_type}' not supported"
                })
                continue
            
            endpoint_path = metadata.get("endpoint", "")
            test_input = metadata.get("input", {})
            expected = metadata.get("expected")
            
            # Execute the endpoint using OneCompiler (same as /api/execute-endpoint)
            try:
                # Find the function name from parsed endpoints
                endpoint = next((ep for ep in endpoints if ep.get("endpoint") == endpoint_path), None)
                
                if not endpoint:
                    results.append({
                        "testName": test_name,
                        "status": "error",
                        "message": f"Endpoint {endpoint_path} not found in backend code",
                        "expected": expected,
                        "actual": None
                    })
                    continue
                
                function_name = endpoint['name']
                user_args_str = repr(test_input) if test_input is not None else "{}"
                
                # Build execution code (same pattern as /api/execute-endpoint)
                execution_code = f"""
# Backend code
{backend_code}

# Execute the endpoint with parameters
try:
    user_args_dict = {user_args_str}
    result = {function_name}(**user_args_dict)
    print("ENDPOINT_RESULT:", result)
except Exception as e:
    print("ENDPOINT_ERROR:", str(e))
"""
                
                # Execute using OneCompiler
                exec_result = await onecompiler_service.execute_python(execution_code)
                
                if exec_result.get("success"):
                    stdout = exec_result.get("stdout", "")
                    
                    # Parse the result from stdout
                    if "ENDPOINT_RESULT:" in stdout:
                        result_line = [line for line in stdout.split('\n') if 'ENDPOINT_RESULT:' in line]
                        if result_line:
                            try:
                                result_str = result_line[0].split('ENDPOINT_RESULT:', 1)[1].strip()
                                # Try JSON parsing first
                                try:
                                    actual = json.loads(result_str)
                                except json.JSONDecodeError:
                                    # Try Python literal eval
                                    try:
                                        actual = ast.literal_eval(result_str)
                                    except (ValueError, SyntaxError):
                                        actual = result_str
                            except Exception:
                                actual = result_str
                        else:
                            actual = stdout
                    elif "ENDPOINT_ERROR:" in stdout:
                        error_line = [line for line in stdout.split('\n') if 'ENDPOINT_ERROR:' in line]
                        error_msg = error_line[0].split('ENDPOINT_ERROR:', 1)[1].strip() if error_line else "Unknown error"
                        results.append({
                            "testName": test_name,
                            "status": "error",
                            "message": error_msg,
                            "expected": expected,
                            "actual": None
                        })
                        continue
                    else:
                        actual = stdout
                    
                    # Simple equality comparison
                    passed = (actual == expected)
                    
                    if passed:
                        results.append({
                            "testName": test_name,
                            "status": "pass",
                            "message": "Test passed successfully",
                            "expected": expected,
                            "actual": actual
                        })
                    else:
                        results.append({
                            "testName": test_name,
                            "status": "fail",
                            "message": f"Expected {expected} but got {actual}",
                            "expected": expected,
                            "actual": actual
                        })
                else:
                    results.append({
                        "testName": test_name,
                        "status": "error",
                        "message": exec_result.get("error", "Unknown error"),
                        "expected": expected,
                        "actual": None
                    })
                    
            except Exception as e:
                results.append({
                    "testName": test_name,
                    "status": "error",
                    "message": str(e),
                    "expected": expected,
                    "actual": None
                })
        
        return {"results": results}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            # Receive message from frontend
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Extract message content
            messages = message_data.get("messages", [])
            model = message_data.get("model", "gpt-4")
            max_tokens = message_data.get("max_tokens", 1000)
            proactive = message_data.get("proactive", False)
            current_code = message_data.get("current_code", "")
            
            # Prepare messages for AI
            if proactive and current_code:
                # Add code context for proactive responses
                user_message = messages[-1] if messages else {"role": "user", "content": ""}
                enhanced_message = {
                    "role": "user", 
                    "content": f"Code:\n{current_code}\n\nMessage:\n{user_message.get('content', '')}"
                }
                messages_to_send = messages[:-1] + [enhanced_message]
            else:
                messages_to_send = messages
            
            # Stream response back to frontend
            async def on_chunk(chunk: str):
                await websocket.send_text(json.dumps({
                    "type": "chunk",
                    "content": chunk
                }))
            
            async def on_complete(full_response: str):
                # For autocomplete strategy, also send the generated code
                generated_code = ""
                if hasattr(chat_model.strategy, 'get_last_generated_code'):
                    generated_code = chat_model.strategy.get_last_generated_code()
                
                await websocket.send_text(json.dumps({
                    "type": "complete",
                    "content": full_response,
                    "generated_code": generated_code
                }))
            
            # For autocomplete strategy, send generated code immediately when ready
            async def on_code_ready(generated_code: str):
                await websocket.send_text(json.dumps({
                    "type": "code_ready",
                    "generated_code": generated_code
                }))
            
            async def on_error(error: str):
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "content": f"Error: {error}"
                }))
            
            # Stream the response
            await chat_model.stream_response(
                messages=messages_to_send,
                model=model,
                max_tokens=max_tokens,
                on_chunk=on_chunk,
                on_complete=on_complete,
                on_error=on_error,
                on_code_ready=on_code_ready,
                current_code=current_code
            )
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.send_text(json.dumps({
            "type": "error",
            "content": f"Server error: {str(e)}"
        }))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
