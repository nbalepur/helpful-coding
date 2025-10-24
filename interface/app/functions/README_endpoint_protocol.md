# @endpoint Decorator Protocol

This document describes the new `@endpoint` decorator protocol for the user study system, which allows users to define backend API functions in a simple, intuitive way.

## Overview

The `@endpoint` protocol allows users to define backend functions using a simple decorator syntax, which is automatically converted to a full Flask application. This makes it easy for users to focus on the business logic rather than Flask boilerplate.

## Syntax

### Basic Endpoint
```python
@endpoint('/path')
def function_name():
    return {"message": "Hello World"}
```

### Endpoint with HTTP Methods
```python
@endpoint('/api/data', methods=['POST'])
def create_data():
    data = request.get_json()
    return {"success": True, "data": data}
```

### Helper Functions
Functions without the `@endpoint` decorator are treated as helper functions and can be called by endpoint functions:

```python
def get_user_info():
    return {"name": "John", "age": 30}

@endpoint('/user')
def get_user():
    user = get_user_info()
    return user
```

## Complete Example

```python
# Personal Website Backend using @endpoint protocol

def get_website_features():
    """Helper function to get website features"""
    return ["Dynamic content", "Contact form", "API endpoints"]

def get_user_info():
    """Helper function to get user information"""
    return {
        "name": "Alex Developer",
        "bio": "Software developer passionate about creating amazing experiences",
        "skills": ["Python", "JavaScript", "React", "Node.js", "Flask"]
    }

@endpoint('/')
def home():
    """Home page endpoint - returns welcome message and features"""
    features = get_website_features()
    return {
        "message": "Welcome to my personal website!",
        "status": "Server is running",
        "features": features,
        "timestamp": "2024-01-01T12:00:00Z"
    }

@endpoint('/about')
def about():
    """About page endpoint - returns user information"""
    user_info = get_user_info()
    return {
        "name": user_info["name"],
        "bio": user_info["bio"],
        "skills": user_info["skills"],
        "experience_years": 5
    }

@endpoint('/contact', methods=['POST'])
def contact():
    """Contact form endpoint - processes contact form submissions"""
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['name', 'email', 'message']
    for field in required_fields:
        if not data.get(field):
            return {
                "error": f"Missing required field: {field}",
                "success": False
            }, 400
    
    return {
        "message": "Thank you for reaching out!",
        "received": data,
        "success": True,
        "timestamp": "2024-01-01T12:00:00Z"
    }

@endpoint('/api/status')
def api_status():
    """API status endpoint - returns server health information"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "uptime": "00:05:30",
        "endpoints": ["/", "/about", "/contact", "/api/status"]
    }
```

## How It Works

1. **Parsing**: The endpoint parser scans the Python code for `@endpoint` decorators and extracts:
   - Endpoint paths
   - HTTP methods
   - Function names
   - Function bodies

2. **Code Generation**: The parser generates a complete Flask application that includes:
   - Flask imports and CORS setup
   - All helper functions
   - All endpoint routes with proper decorators
   - Flask app initialization and run code

3. **Execution**: The generated Flask code is executed either:
   - As a real Python subprocess (preferred)
   - As a mock server (fallback)

## Three-File Structure

The user study system expects three main files:

1. **HTML File** (`index.html`): The main webpage structure
2. **JavaScript File** (`frontend.js`): Frontend logic and API calls
3. **Python File** (`backend.py`): Backend API using `@endpoint` decorators

### HTML File
```html
<!DOCTYPE html>
<html>
<head>
    <title>My App</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="app">Loading...</div>
    <script src="frontend.js"></script>
</body>
</html>
```

### JavaScript File
```javascript
class MyApp {
    constructor() {
        this.apiBaseUrl = window.API_BASE_URL || 'http://localhost:5000';
        this.init();
    }
    
    async fetchData() {
        const response = await fetch(`${this.apiBaseUrl}/api/data`);
        return await response.json();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new MyApp();
});
```

### Python File
```python
@endpoint('/api/data')
def get_data():
    return {"message": "Hello from backend!"}
```

## Benefits

1. **Simplicity**: Users don't need to know Flask syntax
2. **Focus**: Users can focus on business logic, not boilerplate
3. **Consistency**: Standardized way to define API endpoints
4. **Automatic**: Full Flask app generation and execution
5. **Testing**: Easy to test individual functions and endpoints

## Validation

The system validates:
- Endpoint paths start with `/`
- No duplicate function names
- Proper decorator syntax
- Helper functions are properly defined

## Error Handling

- Invalid syntax shows warnings but still attempts to process
- Missing endpoints fall back to mock responses
- Backend failures fall back to mock server
- Frontend gracefully handles backend unavailability

## Integration with Preview System

The preview system automatically:
1. Detects `@endpoint` decorators in Python files
2. Processes the code into a Flask application
3. Starts a backend server (real or mock)
4. Injects the JavaScript into the HTML
5. Sets up proper API URLs for frontend-backend communication
6. Provides real-time preview of the complete application
