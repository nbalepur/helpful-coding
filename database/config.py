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

# Connection pool configuration
# Supabase has connection limits (typically 60-100 for free tier, 200+ for paid)
# These settings prevent exceeding the connection limit
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "5"))  # Number of connections to keep in pool
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "10"))  # Additional connections beyond pool_size
POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "3600"))  # Recycle connections after 1 hour (in seconds)
POOL_PRE_PING = os.getenv("DB_POOL_PRE_PING", "true").lower() == "true"  # Test connections before using

# Configure engine with SSL for Supabase connections
# Supabase requires SSL and doesn't support GSSAPI
if is_supabase:
    # For psycopg2 (synchronous): add SSL parameters via connect_args
    engine = create_engine(
        DATABASE_URL,
        echo=False,  # Disable SQL query logging
        pool_size=POOL_SIZE,
        max_overflow=MAX_OVERFLOW,
        pool_recycle=POOL_RECYCLE,
        pool_pre_ping=POOL_PRE_PING,
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
    async_engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=False,  # Disable SQL query logging
        pool_size=POOL_SIZE,
        max_overflow=MAX_OVERFLOW,
        pool_recycle=POOL_RECYCLE,
        pool_pre_ping=POOL_PRE_PING,
    )
else:
    # Standard PostgreSQL connection (local or non-SSL)
    # Still use connection pooling, but with slightly higher defaults for local connections
    local_pool_size = int(os.getenv("DB_POOL_SIZE", "10"))
    local_max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "20"))
    engine = create_engine(
        DATABASE_URL,
        echo=False,  # Disable SQL query logging
        pool_size=local_pool_size,
        max_overflow=local_max_overflow,
        pool_recycle=POOL_RECYCLE,
        pool_pre_ping=POOL_PRE_PING,
    )
    async_engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=False,  # Disable SQL query logging
        pool_size=local_pool_size,
        max_overflow=local_max_overflow,
        pool_recycle=POOL_RECYCLE,
        pool_pre_ping=POOL_PRE_PING,
    )

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
