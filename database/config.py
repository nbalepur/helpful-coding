import os
from pathlib import Path
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from dotenv import load_dotenv

# Load environment variables from backend directory
backend_env_path = Path(__file__).parent.parent / "backend" / ".env"
if backend_env_path.exists():
    load_dotenv(backend_env_path)
else:
    # Fallback to current directory if backend .env doesn't exist
    load_dotenv()

# Database configuration
# Default to PostgreSQL, fallback to SQLite if not configured
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/helpful_coding")
ASYNC_DATABASE_URL = os.getenv("ASYNC_DATABASE_URL", "postgresql+asyncpg://postgres:password@localhost:5432/helpful_coding")

# For SQLite (uncomment if you want to use SQLite instead)
# DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./helpful_coding.db")
# ASYNC_DATABASE_URL = os.getenv("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///./helpful_coding.db")

# Check if this is a Supabase connection (requires SSL)
is_supabase = "supabase" in DATABASE_URL.lower() or "supabase" in ASYNC_DATABASE_URL.lower()

# Configure engine with SSL for Supabase connections
# Supabase requires SSL and doesn't support GSSAPI
if is_supabase:
    # For psycopg2 (synchronous): add SSL parameters via connect_args
    engine = create_engine(
        DATABASE_URL,
        echo=True,
        connect_args={
            "sslmode": "require",
            "gssencmode": "disable",  # Disable GSSAPI encryption
        }
    )
    # For asyncpg (asynchronous): SSL is handled via the connection string
    # Add ?sslmode=require if not already present
    if "?sslmode=" not in ASYNC_DATABASE_URL and "?ssl=" not in ASYNC_DATABASE_URL:
        separator = "&" if "?" in ASYNC_DATABASE_URL else "?"
        ASYNC_DATABASE_URL = f"{ASYNC_DATABASE_URL}{separator}sslmode=require"
    async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=True)
else:
    # Standard PostgreSQL connection (local or non-SSL)
    engine = create_engine(DATABASE_URL, echo=True)
    async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=True)

# Create session makers
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
AsyncSessionLocal = sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)

# Create base class for models
Base = declarative_base()

# Metadata for migrations
metadata = MetaData()


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_async_db():
    """Dependency to get async database session"""
    async with AsyncSessionLocal() as session:
        yield session


def create_tables():
    """Create all tables"""
    Base.metadata.create_all(bind=engine)


async def create_tables_async():
    """Create all tables asynchronously"""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
