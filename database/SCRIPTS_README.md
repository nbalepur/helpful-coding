# Database Management Scripts

This directory contains scripts to manage the database for the Helpful Coding application.

## Quick Start

Use the main database management script for easy access:

```bash
# Create tables
./db.sh create

# Reset database (DESTRUCTIVE!)
./db.sh reset

# Initialize migrations
./db.sh migrate init

# Create a migration
./db.sh migrate create "Add new column"

# Apply migrations
./db.sh migrate apply

# Export data
./db.sh download json backup.json

# Show database stats
./db.sh download stats
```

## Scripts Overview

### 🏗️ `scripts/create.sh` - Create Database Tables
Creates all database tables from scratch.

```bash
./scripts/create.sh
```

### 🔄 `scripts/reset.sh` - Reset Database (DESTRUCTIVE!)
Drops all tables and recreates them. **WARNING: This will delete all data!**

```bash
./scripts/reset.sh
```

### 🔄 `scripts/migrate.sh` - Database Migrations
Manages database schema changes using Alembic.

```bash
# Initialize Alembic
./scripts/migrate.sh init

# Create a new migration
./scripts/migrate.sh create "Add new column to users table"

# Apply all pending migrations
./scripts/migrate.sh apply

# Show migration history
./scripts/migrate.sh history

# Show current database revision
./scripts/migrate.sh current
```

### 📥 `scripts/download.sh` - Export Database Data
Exports database data to JSON or CSV formats for backup or analysis.

```bash
# Export to JSON
./scripts/download.sh json
./scripts/download.sh json my_backup.json

# Export to CSV files
./scripts/download.sh csv
./scripts/download.sh csv backup_data/

# Show database statistics
./scripts/download.sh stats
```

## Python Scripts

The shell scripts use these Python modules in the `python/` directory:

- **`python/create_tables.py`** - Creates database tables
- **`python/reset_tables.py`** - Drops and recreates tables
- **`python/migrate.py`** - Handles Alembic migrations
- **`python/download.py`** - Exports data to various formats

## Prerequisites

1. **Python 3.7+** installed
2. **Conda environment** named `helpful-coding` (recommended)
   - Fallback to virtual environment if conda is not available
3. **Required packages** (installed automatically):
   - `sqlalchemy>=2.0.23`
   - `pydantic>=2.5.0`
   - `alembic>=1.13.1`
   - `psycopg2-binary>=2.9.9` (for PostgreSQL)

## Quick Start (Detailed)

1. **Create tables for the first time:**
   ```bash
   cd database
   ./db.sh create
   # or directly: ./scripts/create.sh
   ```

2. **Set up migrations:**
   ```bash
   ./db.sh migrate init
   # or directly: ./scripts/migrate.sh init
   ```

3. **Check database status:**
   ```bash
   ./db.sh download stats
   # or directly: ./scripts/download.sh stats
   ```

## Database Configuration

The scripts use environment variables for database configuration:

```bash
# For SQLite (default)
export DATABASE_URL="sqlite:///./helpful_coding.db"

# For PostgreSQL
export DATABASE_URL="postgresql://user:password@localhost/helpful_coding"
```

## File Structure

```
database/
├── db.sh                  # Main database management script
├── scripts/               # Shell scripts
│   ├── create.sh          # Create tables script
│   ├── reset.sh           # Reset database script
│   ├── migrate.sh         # Migration management script
│   └── download.sh        # Data export script
├── python/                # Python scripts
│   ├── create_tables.py   # Python table creation
│   ├── reset_tables.py    # Python table reset
│   ├── migrate.py         # Python migration handler
│   └── download.py         # Python data exporter
├── alembic/               # Alembic migration files
│   ├── alembic.ini        # Alembic configuration
│   ├── env.py             # Alembic environment
│   └── script.py.mako     # Alembic template
├── models.py              # Pydantic models
├── sqlalchemy_models.py   # SQLAlchemy models
├── config.py              # Database configuration
├── crud.py                # CRUD operations
├── __init__.py            # Package initialization
├── example.py             # Usage examples
├── README.md              # Main documentation
└── SCRIPTS_README.md      # Scripts documentation
```

## Troubleshooting

### Common Issues

1. **Permission denied:**
   ```bash
   chmod +x *.sh
   ```

2. **Python not found:**
   - Ensure Python 3.7+ is installed
   - Check if virtual environment is activated

3. **Package not found:**
   - Run `pip install -r ../backend/requirements.txt`
   - Ensure virtual environment is activated

4. **Database connection failed:**
   - Check DATABASE_URL environment variable
   - Ensure database server is running (for PostgreSQL)

### Getting Help

- Check the script output for detailed error messages
- Ensure all dependencies are installed
- Verify database configuration
- Check file permissions on scripts

## Examples

### Complete Setup Workflow

```bash
# 1. Create tables
./db.sh create

# 2. Initialize migrations
./db.sh migrate init

# 3. Check status
./db.sh download stats

# 4. Create a migration (if schema changes)
./db.sh migrate create "Add user preferences"

# 5. Apply migration
./db.sh migrate apply

# 6. Export data for backup
./db.sh download json backup_$(date +%Y%m%d).json
```

### Development Workflow

```bash
# Reset database during development
./db.sh reset

# Export data for testing
./db.sh download csv test_data/

# Apply new migrations
./db.sh migrate apply
```

## Security Notes

- **Never run `./db.sh reset` in production!**
- Always backup data before major operations
- Use environment variables for sensitive configuration
- Ensure proper file permissions on scripts
