# Database Package

This package provides a complete database solution for the Helpful Coding application using Pydantic for data validation and SQLAlchemy for database operations.

## Features

- **Pydantic Models**: Type-safe data validation and serialization
- **SQLAlchemy Models**: Database table definitions with relationships
- **CRUD Operations**: Complete Create, Read, Update, Delete operations
- **Async Support**: Both synchronous and asynchronous database operations
- **PostgreSQL Ready**: Optimized for PostgreSQL with SQLite fallback support

## Database Schema

### Tables

1. **Users** - User authentication and settings
   - `id` (Primary Key)
   - `username` (Unique)
   - `email` (Unique)
   - `password` (Hashed)
   - `settings` (JSON)
   - `created_at`, `updated_at`

2. **Projects** - Project templates and configurations
   - `id` (Primary Key)
   - `name`
   - `description`
   - `frontend_starter_file`
   - `html_starter_file`
   - `css_starter_file`
   - `created_at`, `updated_at`

3. **Code** - User code files
   - `id` (Primary Key)
   - `user_id` (Foreign Key to Users)
   - `project_id` (Foreign Key to Projects)
   - `code` (JSON content keyed by language)
   - `mode` (String: `regular` or `diff`)
   - `metadata` (JSON metadata for the code entry)
   - `created_at`, `updated_at`

4. **Submissions** - User project submissions
   - `id` (Primary Key)
   - `user_id` (Foreign Key to Users)
   - `project_id` (Foreign Key to Projects)
   - `code` (JSON body of submitted files)
   - `title`
   - `description`
   - `scores` (JSON evaluation metrics)
   - `image` (Preview image stored as URL or encoded data)
   - `created_at`, `updated_at`

## Quick Start

### 1. Set Up PostgreSQL

First, install and set up PostgreSQL:

```bash
# Install PostgreSQL (macOS)
brew install postgresql
brew services start postgresql

# Install PostgreSQL (Ubuntu)
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Install PostgreSQL (CentOS)
sudo yum install postgresql-server postgresql-contrib
sudo systemctl start postgresql
```

### 2. Configure Database

Run the PostgreSQL setup script:

```bash
cd database
./db.sh setup-postgresql
```

This will:
- Create the PostgreSQL database
- Set up the database user
- Create a `.env` file with connection details
- Test the database connection

### 3. Create Tables

```bash
./db.sh create
```

### 4. Use in Your Application

```python
from database import create_tables, get_db, UserCreate, UserCRUD

# Create tables
create_tables()

# Get database session
db = next(get_db())

# Create a user
user = UserCRUD.create(db, UserCreate(
    username="john_doe",
    email="john@example.com", 
    password="secure_password123",
    settings={"theme": "dark"}
))
```

### Using Database Scripts

The database package includes convenient scripts for common operations:

```bash
# Create tables
./db.sh create

# Reset database (DESTRUCTIVE!)
./db.sh reset

# Initialize migrations
./db.sh migrate init

# Export data
./db.sh download json backup.json
```

See `SCRIPTS_README.md` for detailed script documentation.

### CRUD Operations

Each entity has a corresponding CRUD class with methods for:

- `create()` - Create new records
- `get_by_id()` - Get record by ID
- `get_all()` - Get all records with pagination
- `update()` - Update existing records
- `delete()` - Delete records

### Pydantic Models

The package provides comprehensive Pydantic models:

- **Base Models**: Common fields for each entity
- **Create Models**: For creating new records
- **Update Models**: For updating existing records
- **Response Models**: For API responses
- **Relationship Models**: Models with related data

### Configuration

The application is configured to use PostgreSQL by default. Environment variables are automatically set up by the setup script:

```bash
# PostgreSQL Configuration (default)
DATABASE_URL=postgresql://postgres:password@localhost:5432/helpful_coding
ASYNC_DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/helpful_coding

# Database Connection Details
DB_HOST=localhost
DB_PORT=5432
DB_NAME=helpful_coding
DB_USER=postgres
DB_PASSWORD=password
```

To use SQLite instead (not recommended for production), update your `.env` file:

```bash
# SQLite Configuration (fallback)
DATABASE_URL=sqlite:///./helpful_coding.db
ASYNC_DATABASE_URL=sqlite+aiosqlite:///./helpful_coding.db
```

## Dependencies

The following packages are required:

- `sqlalchemy>=2.0.23`
- `pydantic>=2.5.0`
- `psycopg2-binary>=2.9.9` (for PostgreSQL)
- `asyncpg>=0.29.0` (for async PostgreSQL)
- `python-dotenv>=1.0.0`

All dependencies are included in `backend/requirements.txt` and will be installed automatically.

## Example

See `example.py` for a complete example of using the database package.

## Security Notes

- Passwords should be hashed before storing in the database
- Use environment variables for sensitive configuration
- Implement proper authentication and authorization in your application layer
