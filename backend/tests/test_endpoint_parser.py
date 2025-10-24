"""
Unit tests for the EndpointParser class.
"""

import pytest
from parsers.endpoint_parser import (
    EndpointParser, 
    EndpointParserError, 
    ParameterType,
    ParameterInfo,
    EndpointInfo
)


class TestEndpointParser:
    """Test cases for EndpointParser."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.parser = EndpointParser()
    
    def test_parse_empty_code(self):
        """Test parsing empty or whitespace-only code."""
        assert self.parser.parse("") == []
        assert self.parser.parse("   ") == []
        assert self.parser.parse("\n\t") == []
    
    def test_parse_simple_endpoint(self):
        """Test parsing a simple endpoint function."""
        code = '''
@app.route("/hello")
def hello():
    return "Hello World"
'''
        endpoints = self.parser.parse(code)
        assert len(endpoints) == 0  # No @endpoint decorator
    
    def test_parse_endpoint_decorator(self):
        """Test parsing a function with @endpoint decorator."""
        code = '''
@endpoint("/api/users")
def get_users():
    return {"users": []}
'''
        endpoints = self.parser.parse(code)
        assert len(endpoints) == 1
        
        endpoint = endpoints[0]
        assert endpoint.name == "get_users"
        assert endpoint.endpoint_path == "/api/users"
        assert endpoint.methods == ["GET"]  # Default method
        assert len(endpoint.parameters) == 0
    
    def test_parse_endpoint_with_methods(self):
        """Test parsing endpoint with specific HTTP methods."""
        code = '''
@endpoint("/api/users", methods=["GET", "POST"])
def handle_users():
    return {"message": "OK"}
'''
        endpoints = self.parser.parse(code)
        assert len(endpoints) == 1
        
        endpoint = endpoints[0]
        assert endpoint.methods == ["GET", "POST"]
    
    def test_parse_endpoint_with_parameters(self):
        """Test parsing endpoint with function parameters."""
        code = '''
@endpoint("/api/users/{user_id}")
def get_user(user_id: int, include_posts: bool = False):
    return {"user_id": user_id}
'''
        endpoints = self.parser.parse(code)
        assert len(endpoints) == 1
        
        endpoint = endpoints[0]
        assert len(endpoint.parameters) == 2
        
        # Check first parameter
        param1 = endpoint.parameters[0]
        assert param1.name == "user_id"
        assert param1.type == ParameterType.REGULAR
        assert param1.required is True
        assert param1.default_value is None
        
        # Check second parameter
        param2 = endpoint.parameters[1]
        assert param2.name == "include_posts"
        assert param2.type == ParameterType.DEFAULT
        assert param2.required is False
        assert param2.default_value == "False"
    
    def test_parse_endpoint_with_args_kwargs(self):
        """Test parsing endpoint with *args and **kwargs."""
        code = '''
@endpoint("/api/search")
def search(*args, **kwargs):
    return {"results": []}
'''
        endpoints = self.parser.parse(code)
        assert len(endpoints) == 1
        
        endpoint = endpoints[0]
        assert len(endpoint.parameters) == 2
        
        # Check *args parameter
        args_param = endpoint.parameters[0]
        assert args_param.name == "args"
        assert args_param.type == ParameterType.ARGS
        assert args_param.required is False
        
        # Check **kwargs parameter
        kwargs_param = endpoint.parameters[1]
        assert kwargs_param.name == "kwargs"
        assert kwargs_param.type == ParameterType.KWARGS
        assert kwargs_param.required is False
    
    def test_parse_multiple_endpoints(self):
        """Test parsing multiple endpoint functions."""
        code = '''
@endpoint("/api/users")
def get_users():
    return {"users": []}

@endpoint("/api/users/{id}")
def get_user(id: int):
    return {"user": {"id": id}}

@app.route("/other")  # This should be ignored
def other_function():
    return "ignored"
'''
        endpoints = self.parser.parse(code)
        assert len(endpoints) == 2
        
        # Check first endpoint
        endpoint1 = endpoints[0]
        assert endpoint1.name == "get_users"
        assert endpoint1.endpoint_path == "/api/users"
        
        # Check second endpoint
        endpoint2 = endpoints[1]
        assert endpoint2.name == "get_user"
        assert endpoint2.endpoint_path == "/api/users/{id}"
        assert len(endpoint2.parameters) == 1
        assert endpoint2.parameters[0].name == "id"
    
    def test_parse_complex_default_values(self):
        """Test parsing endpoints with complex default values."""
        code = '''
@endpoint("/api/data")
def get_data(page: int = 1, size: int = 10, filters: dict = None):
    return {"data": []}
'''
        endpoints = self.parser.parse(code)
        assert len(endpoints) == 1
        
        endpoint = endpoints[0]
        assert len(endpoint.parameters) == 3
        
        # Check parameters with default values
        params = {p.name: p for p in endpoint.parameters}
        assert params["page"].default_value == "1"
        assert params["size"].default_value == "10"
        assert params["filters"].default_value == "None"
    
    def test_parse_invalid_syntax(self):
        """Test parsing code with invalid syntax."""
        code = '''
@endpoint("/api/test")
def invalid_function(
    # Missing closing parenthesis
    return "error"
'''
        with pytest.raises(EndpointParserError) as exc_info:
            self.parser.parse(code)
        
        assert "Syntax error" in str(exc_info.value)
    
    def test_parse_to_dict(self):
        """Test the parse_to_dict method."""
        code = '''
@endpoint("/api/test")
def test_function(param: str = "default"):
    return {"result": param}
'''
        result = self.parser.parse_to_dict(code)
        assert isinstance(result, list)
        assert len(result) == 1
        
        endpoint_dict = result[0]
        assert isinstance(endpoint_dict, dict)
        assert endpoint_dict["name"] == "test_function"
        assert endpoint_dict["endpoint"] == "/api/test"
        assert endpoint_dict["methods"] == ["GET"]
        assert len(endpoint_dict["parameters"]) == 1
        
        param_dict = endpoint_dict["parameters"][0]
        assert param_dict["name"] == "param"
        assert param_dict["type"] == "default"
        assert param_dict["required"] is False
        assert param_dict["defaultValue"] == "default"


class TestParameterInfo:
    """Test cases for ParameterInfo dataclass."""
    
    def test_parameter_info_creation(self):
        """Test creating ParameterInfo objects."""
        param = ParameterInfo(
            name="test_param",
            type=ParameterType.DEFAULT,
            required=False,
            default_value="test"
        )
        
        assert param.name == "test_param"
        assert param.type == ParameterType.DEFAULT
        assert param.required is False
        assert param.default_value == "test"
    
    def test_parameter_info_to_dict(self):
        """Test converting ParameterInfo to dictionary."""
        param = ParameterInfo(
            name="test_param",
            type=ParameterType.REGULAR,
            required=True,
            default_value=None
        )
        
        result = param.to_dict()
        expected = {
            "name": "test_param",
            "type": "regular",
            "required": True,
            "defaultValue": None
        }
        
        assert result == expected


class TestEndpointInfo:
    """Test cases for EndpointInfo dataclass."""
    
    def test_endpoint_info_creation(self):
        """Test creating EndpointInfo objects."""
        param = ParameterInfo("test", ParameterType.REGULAR, True)
        endpoint = EndpointInfo(
            name="test_endpoint",
            endpoint_path="/test",
            methods=["GET", "POST"],
            parameters=[param],
            body="def test_endpoint(): pass"
        )
        
        assert endpoint.name == "test_endpoint"
        assert endpoint.endpoint_path == "/test"
        assert endpoint.methods == ["GET", "POST"]
        assert len(endpoint.parameters) == 1
        assert endpoint.body == "def test_endpoint(): pass"
    
    def test_endpoint_info_to_dict(self):
        """Test converting EndpointInfo to dictionary."""
        param = ParameterInfo("test", ParameterType.DEFAULT, False, "default")
        endpoint = EndpointInfo(
            name="test_endpoint",
            endpoint_path="/test",
            methods=["GET"],
            parameters=[param],
            body="def test_endpoint(): pass"
        )
        
        result = endpoint.to_dict()
        expected = {
            "name": "test_endpoint",
            "endpoint": "/test",
            "methods": ["GET"],
            "parameters": [{
                "name": "test",
                "type": "default",
                "required": False,
                "defaultValue": "default"
            }],
            "body": "def test_endpoint(): pass"
        }
        
        assert result == expected


if __name__ == "__main__":
    pytest.main([__file__])
