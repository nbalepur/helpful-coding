# Authentication API

This backend API provides user authentication endpoints for signup and login functionality.

## Endpoints

### POST /signup

Creates a new user account.

**Request Body:**
```json
{
  "username": "string (3-50 characters)",
  "email": "string (valid email)",
  "password": "string (minimum 8 characters)",
  "settings": "object (optional)"
}
```

**Response (200):**
```json
{
  "message": "User created successfully",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "access_token": "jwt_token_here",
  "token_type": "bearer"
}
```

**Error Responses:**
- `400`: Username or email already exists
- `500`: Server error

### POST /login

Authenticates a user and returns an access token.

**Request Body:**
```json
{
  "username_or_email": "string (username or email)",
  "password": "string"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "access_token": "jwt_token_here",
  "token_type": "bearer"
}
```

**Error Responses:**
- `400`: Missing username/email or password
- `401`: Invalid credentials
- `500`: Server error

## Features

- **Password Hashing**: Uses bcrypt for secure password storage
- **JWT Tokens**: Returns JWT access tokens for authenticated sessions
- **Flexible Login**: Users can login with either username or email
- **Duplicate Prevention**: Prevents duplicate usernames and emails
- **Input Validation**: Validates email format and password strength

## Security

- Passwords are hashed using bcrypt before storage
- JWT tokens expire after 30 minutes by default
- Email addresses are validated for proper format
- Usernames and emails must be unique

## Testing

Run the test script to verify the endpoints:

```bash
python test_auth.py
```

Make sure the backend server is running on `localhost:4828` before running tests.
