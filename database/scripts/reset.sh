#!/bin/bash

# Database reset script
# This script drops all tables and recreates them (DESTRUCTIVE!)

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

usage() {
  echo -e "${BLUE}Usage:${NC} $0"
  echo -e "${BLUE}Options:${NC}"
  echo -e "  -h, --help              Show this help message"
}

if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo -e "${YELLOW}Unknown argument:${NC} $1"
      usage
      exit 1
      ;;
  esac
fi

# BEGIN OPTIONAL PRODUCTION GUARD (easy to remove)
DEFAULT_DB_URL="postgresql://postgres:password@localhost:5432/helpful_coding"
DEFAULT_ASYNC_DB_URL="postgresql+asyncpg://postgres:password@localhost:5432/helpful_coding"

ROOT_ENV_FILE="$(dirname "$PROJECT_ROOT")/.env"
if [ -f "$ROOT_ENV_FILE" ]; then
  DB_URL=$(grep "^DATABASE_URL=" "$ROOT_ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
  ASYNC_DB_URL=$(grep "^ASYNC_DATABASE_URL=" "$ROOT_ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
else
  DB_URL="${DATABASE_URL:-}"
  ASYNC_DB_URL="${ASYNC_DATABASE_URL:-}"
fi

is_production_db() {
  local url="$1"
  if [ -z "$url" ]; then
    return 1
  fi
  if [[ "$url" == *"supabase"* ]]; then
    return 0
  fi
  if [[ "$url" == *"localhost"* ]] || [[ "$url" == *"127.0.0.1"* ]] || [[ "$url" == "$DEFAULT_DB_URL" ]] || [[ "$url" == "$DEFAULT_ASYNC_DB_URL" ]]; then
    return 1
  fi
  return 0
}

IS_PRODUCTION=false
if is_production_db "$DB_URL" || is_production_db "$ASYNC_DB_URL"; then
  IS_PRODUCTION=true
fi
# END OPTIONAL PRODUCTION GUARD

if [ "$IS_PRODUCTION" = true ]; then
  ENV_LABEL="prod"
else
  ENV_LABEL="local"
fi

echo -e "${RED}⚠️  DATABASE RESET SCRIPT (${ENV_LABEL}) ⚠️${NC}"
echo -e "${RED}===========================================${NC}"
echo -e "${YELLOW}This will DROP ALL TABLES and recreate them!${NC}"
echo -e "${YELLOW}ALL DATA WILL BE LOST!${NC}"
echo ""

if [ "$IS_PRODUCTION" = true ]; then
  echo ""
  echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║                    ⚠️  PRODUCTION DATABASE ⚠️                ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${RED}🚨 WARNING: You are about to RESET a PRODUCTION database!${NC}"
  echo ""
  echo -e "${YELLOW}Current DATABASE_URL:${NC}"
  echo -e "  ${YELLOW}$DB_URL${NC}"
  if [ -n "$ASYNC_DB_URL" ]; then
    echo -e "${YELLOW}Current ASYNC_DATABASE_URL:${NC}"
    echo -e "  ${YELLOW}$ASYNC_DB_URL${NC}"
  fi
  echo ""
  echo -e "${RED}This will DROP ALL TABLES and DELETE ALL DATA!${NC}"
  echo -e "${RED}This action CANNOT be undone!${NC}"
  echo ""
  
  # Require three confirmations in a row
  echo -e "${RED}To proceed, you must confirm THREE times in a row:${NC}"
  echo ""
  
  # First confirmation
  read -p "Type 'RESET PRODUCTION DATABASE' to confirm (1/3): " confirm1
  if [ "$confirm1" != "RESET PRODUCTION DATABASE" ]; then
    echo -e "${GREEN}✅ Operation cancelled. Production database is safe.${NC}"
    exit 0
  fi
  
  # Second confirmation
  read -p "Type 'I UNDERSTAND THIS WILL DELETE ALL DATA' to confirm (2/3): " confirm2
  if [ "$confirm2" != "I UNDERSTAND THIS WILL DELETE ALL DATA" ]; then
    echo -e "${GREEN}✅ Operation cancelled. Production database is safe.${NC}"
    exit 0
  fi
  
  # Third confirmation
  read -p "Type 'YES DELETE EVERYTHING' to confirm (3/3): " confirm3
  if [ "$confirm3" != "YES DELETE EVERYTHING" ]; then
    echo -e "${GREEN}✅ Operation cancelled. Production database is safe.${NC}"
    exit 0
  fi
  
  echo ""
  echo -e "${RED}⚠️  All three confirmations received. Proceeding with production database reset...${NC}"
  echo ""
  sleep 2
else
  # Default database - normal confirmation
  read -p "Are you sure you want to continue? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo -e "${BLUE}Operation cancelled.${NC}"
    exit 0
  fi
fi

# Check if we're in the right directory
if [ ! -f "$SCRIPT_DIR/../python/reset_tables.py" ]; then
    echo -e "${RED}❌ Error: reset_tables.py not found in $SCRIPT_DIR/../python/${NC}"
    exit 1
fi

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Error: python3 is not installed${NC}"
    exit 1
fi

# Check if we're in a conda environment or have the required packages
echo -e "${YELLOW}📦 Checking dependencies...${NC}"
cd "$PROJECT_ROOT"

# Try to activate conda environment
CONDA_AVAILABLE=false
if command -v conda &> /dev/null; then
    CONDA_AVAILABLE=true
    echo -e "${YELLOW}🔧 Using conda environment 'helpful-coding'...${NC}"
else
    echo -e "${YELLOW}⚠️  Conda not found, trying virtual environment...${NC}"
    # Fallback to virtual environment if conda is not available
    if [ -d "backend/venv" ]; then
        echo -e "${YELLOW}🔧 Activating virtual environment...${NC}"
        source backend/venv/bin/activate
    elif [ -d "venv" ]; then
        echo -e "${YELLOW}🔧 Activating virtual environment...${NC}"
        source venv/bin/activate
    fi
fi

# Install requirements if needed
if [ -f "backend/requirements.txt" ]; then
    echo -e "${YELLOW}📥 Installing requirements...${NC}"
    if [ "$CONDA_AVAILABLE" = true ]; then
        conda run -n helpful-coding pip install -r backend/requirements.txt
    else
        pip install -r backend/requirements.txt
    fi
fi

# Run the reset script
echo -e "${YELLOW}🗑️  Resetting database (dropping all tables)...${NC}"
cd "$SCRIPT_DIR/../python"
if [ "$CONDA_AVAILABLE" = true ]; then
    conda run -n helpful-coding python reset_tables.py
else
    python3 reset_tables.py
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database reset successfully!${NC}"
    echo -e "${GREEN}🎉 All tables have been dropped and recreated.${NC}"
else
    echo -e "${RED}❌ Failed to reset database.${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  • Run './create.sh' to create tables without dropping"
echo -e "  • Run './download.sh stats' to check database status"
echo -e "  • Use the database in your application"
