"""
Endpoint parser for extracting API endpoint information from Python code.

This module provides functionality to parse Python code and extract information
about functions decorated with @endpoint, including their parameters, HTTP methods,
and endpoint paths.
"""

import ast
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum

# Set up logging
logger = logging.getLogger(__name__)


class ParameterType(Enum):
    """Types of function parameters."""
    REGULAR = "regular"
    DEFAULT = "default"
    ARGS = "args"
    KWARGS = "kwargs"


@dataclass
class ParameterInfo:
    """Information about a function parameter."""
    name: str
    type: ParameterType
    required: bool
    default_value: Optional[str] = None
    annotation: Optional[str] = None
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "type": self.type.value,
            "required": self.required,
            "defaultValue": self.default_value,
            "annotation": self.annotation
        }


@dataclass
class EndpointInfo:
    """Information about an API endpoint."""
    name: str
    endpoint_path: str
    methods: List[str] = field(default_factory=lambda: ["GET"])
    parameters: List[ParameterInfo] = field(default_factory=list)
    body: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "endpoint": self.endpoint_path,
            "methods": self.methods,
            "parameters": [param.to_dict() for param in self.parameters],
            "body": self.body
        }


class EndpointParserError(Exception):
    """Custom exception for endpoint parsing errors."""
    pass


class EndpointParser:
    """
    Parser for extracting endpoint information from Python code.
    
    This class uses Python's AST module to parse code and extract information
    about functions decorated with @endpoint.
    """
    
    def __init__(self):
        """Initialize the endpoint parser."""
        self.logger = logging.getLogger(__name__)
    
    def parse(self, python_code: str) -> List[EndpointInfo]:
        """
        Parse Python code to extract endpoint information.
        
        Args:
            python_code: The Python code to parse
            
        Returns:
            List of EndpointInfo objects containing parsed endpoint data
            
        Raises:
            EndpointParserError: If there's an error parsing the code
        """
        if not python_code or not python_code.strip():
            self.logger.warning("Empty or whitespace-only code provided")
            return []
        
        # First, try to compile the code to catch syntax errors
        try:
            compile(python_code, '<string>', 'exec')
        except SyntaxError as e:
            error_msg = f"Syntax error in Python code at line {e.lineno}: {e.msg}"
            self.logger.error(error_msg)
            raise EndpointParserError(error_msg) from e
        except Exception as e:
            error_msg = f"Compilation error in Python code: {e}"
            self.logger.error(error_msg)
            raise EndpointParserError(error_msg) from e
        
        try:
            # Parse the Python code into an AST
            tree = ast.parse(python_code)
            endpoints = []
            
            # Walk through the AST to find functions with @endpoint decorators
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    try:
                        endpoint_info = self._extract_endpoint_info(node)
                        if endpoint_info:
                            endpoints.append(endpoint_info)
                    except Exception as e:
                        # Log the error but continue parsing other functions
                        self.logger.warning(f"Error parsing function {node.name}: {e}")
                        continue
            
            self.logger.info(f"Successfully parsed {len(endpoints)} endpoints")
            return endpoints
            
        except SyntaxError as e:
            error_msg = f"Syntax error in Python code at line {e.lineno}: {e.msg}"
            self.logger.error(error_msg)
            raise EndpointParserError(error_msg) from e
        except Exception as e:
            error_msg = f"Error parsing Python code: {e}"
            self.logger.error(error_msg)
            raise EndpointParserError(error_msg) from e
    
    def _extract_endpoint_info(self, node: ast.FunctionDef) -> Optional[EndpointInfo]:
        """
        Extract endpoint information from a function definition node.
        
        Args:
            node: The AST function definition node
            
        Returns:
            EndpointInfo if the function has @endpoint decorator, None otherwise
        """
        endpoint_path, methods = self._extract_decorator_info(node)
        
        if endpoint_path is None:
            return None
        
        # Parse function parameters
        parameters = self._extract_parameters(node)
        
        # Extract function body
        body = ast.unparse(node) if hasattr(ast, 'unparse') else ""
        
        return EndpointInfo(
            name=node.name,
            endpoint_path=endpoint_path,
            methods=methods,
            parameters=parameters,
            body=body
        )
    
    def _extract_decorator_info(self, node: ast.FunctionDef) -> tuple[Optional[str], List[str]]:
        """
        Extract endpoint path and methods from @endpoint decorator.
        
        Args:
            node: The AST function definition node
            
        Returns:
            Tuple of (endpoint_path, methods) or (None, []) if no endpoint decorator
        """
        # Check for @endpoint decorators
        for decorator in node.decorator_list:
            if self._is_endpoint_decorator(decorator):
                endpoint_path = self._extract_endpoint_path(decorator)
                methods = self._extract_methods(decorator)
                
                # If no path specified, use function name as path
                if endpoint_path is None:
                    endpoint_path = f"/{node.name}"
                
                return endpoint_path, methods
        
        return None, []
    
    def _get_annotation_string(self, annotation: ast.expr) -> Optional[str]:
        """Extract string representation of an annotation."""
        if hasattr(ast, 'unparse'):
            return ast.unparse(annotation)
        else:
            # Fallback for older Python versions
            if isinstance(annotation, ast.Constant):
                return str(annotation.value)
            elif isinstance(annotation, ast.Str):  # For Python < 3.8 compatibility
                return annotation.s
            else:
                return None
    
    def _is_endpoint_decorator(self, decorator: ast.expr) -> bool:
        """Check if a decorator is the @endpoint decorator."""
        if isinstance(decorator, ast.Call):
            # Handle @endpoint('/path') case
            if isinstance(decorator.func, ast.Name) and decorator.func.id == "endpoint":
                return True
        elif isinstance(decorator, ast.Name):
            # Handle @endpoint case (without parentheses)
            if decorator.id == "endpoint":
                return True
        return False
    
    def _extract_endpoint_path(self, decorator: ast.expr) -> Optional[str]:
        """Extract the endpoint path from the decorator."""
        if isinstance(decorator, ast.Call):
            # Handle @endpoint('/path') case
            if decorator.args and len(decorator.args) > 0:
                first_arg = decorator.args[0]
                if isinstance(first_arg, ast.Constant):
                    return first_arg.value
                elif isinstance(first_arg, ast.Str):  # For Python < 3.8 compatibility
                    return first_arg.s
        elif isinstance(decorator, ast.Name):
            # Handle @endpoint case (without parentheses) - default to function name
            return None  # Will be handled by the calling function
        return None
    
    def _extract_methods(self, decorator: ast.expr) -> List[str]:
        """Extract HTTP methods from the decorator."""
        # All endpoints default to GET method
        return ["GET"]
    
    def _extract_parameters(self, node: ast.FunctionDef) -> List[ParameterInfo]:
        """
        Extract parameter information from a function definition.
        
        Args:
            node: The AST function definition node
            
        Returns:
            List of ParameterInfo objects
        """
        parameters = []
        
        # Extract regular parameters
        for i, arg in enumerate(node.args.args):
            param_info = self._create_parameter_info(arg, node.args, i)
            parameters.append(param_info)
        
        # Handle *args
        if node.args.vararg:
            parameters.append(ParameterInfo(
                name=node.args.vararg.arg,
                type=ParameterType.ARGS,
                required=False
            ))
        
        # Handle **kwargs
        if node.args.kwarg:
            parameters.append(ParameterInfo(
                name=node.args.kwarg.arg,
                type=ParameterType.KWARGS,
                required=False
            ))
        
        return parameters
    
    def _create_parameter_info(self, arg: ast.arg, args: ast.arguments, index: int) -> ParameterInfo:
        """Create ParameterInfo for a regular function argument."""
        param_type = ParameterType.REGULAR
        required = True
        default_value = None
        annotation = None
        
        # Extract type annotation
        if arg.annotation:
            if hasattr(ast, 'unparse'):
                annotation = ast.unparse(arg.annotation)
            else:
                # Fallback for older Python versions
                if isinstance(arg.annotation, ast.Name):
                    annotation = arg.annotation.id
                elif isinstance(arg.annotation, ast.Constant):
                    annotation = str(arg.annotation.value)
                else:
                    annotation = "<complex annotation>"
        
        # Check if parameter has a default value
        # Defaults are stored in args.defaults, and the last N defaults correspond to the last N arguments
        num_defaults = len(args.defaults)
        num_args = len(args.args)
        
        # Calculate if this argument has a default value
        if index >= num_args - num_defaults:
            param_type = ParameterType.DEFAULT
            required = False
            
            # Get the corresponding default value
            default_index = index - (num_args - num_defaults)
            if default_index < len(args.defaults):
                default_ast = args.defaults[default_index]
                
                if isinstance(default_ast, ast.Constant):
                    default_value = str(default_ast.value)
                elif hasattr(ast, 'unparse'):
                    default_value = ast.unparse(default_ast)
                else:
                    # Fallback for older Python versions
                    default_value = "<complex expression>"
        
        return ParameterInfo(
            name=arg.arg,
            type=param_type,
            required=required,
            default_value=default_value,
            annotation=annotation
        )
    
    def parse_to_dict(self, python_code: str) -> List[Dict[str, Any]]:
        """
        Parse Python code and return results as dictionaries.
        
        Args:
            python_code: The Python code to parse
            
        Returns:
            List of dictionaries containing endpoint information
        """
        endpoints = self.parse(python_code)
        return [endpoint.to_dict() for endpoint in endpoints]
    
    def execute_endpoint(self, backend_code: str, endpoint_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a specific endpoint function from the backend code.
        
        Args:
            backend_code: The Python backend code containing the endpoint functions
            endpoint_name: The name or path of the endpoint to execute
            params: Dictionary of parameters to pass to the endpoint function
            
        Returns:
            Dictionary with 'success' and either 'result' or 'error'
        """
        try:
            print(backend_code)
            # Parse the endpoints to find the function
            endpoints = self.parse_to_dict(backend_code)

            # Find the endpoint that matches
            function_name = None
            for ep in endpoints:
                if ep.get('endpoint') == endpoint_name or ep.get('name') == endpoint_name:
                    function_name = ep['name']
                    break

            
            
            if not function_name:
                return {
                    "success": False,
                    "error": f"Endpoint '{endpoint_name}' not found"
                }
            
            # Create a namespace and execute the backend code
            namespace = {}
            exec(backend_code, namespace)

            print('yo')
            
            # Get the function from the namespace
            if function_name not in namespace:
                return {
                    "success": False,
                    "error": f"Function '{function_name}' not found in executed code"
                }
            
            func = namespace[function_name]
            
            # Call the function with the parameters
            result = func(**params)
            
            return {
                "success": True,
                "result": result
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }