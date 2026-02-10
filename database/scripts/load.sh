#!/bin/bash

# Load tasks into the database
# Optionally drop/recreate tables before loading

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

RESET=false
TASKS_PATH=""

usage() {
  echo -e "${BLUE}Usage:${NC} $0 --tasks-path <path> [--reset]"
  echo -e "${BLUE}Options:${NC}"
  echo -e "  --tasks-path <path>     Path to tasks JSON (e.g. ../data/web_tasks.json or ../data/function_tasks.json)"
  echo -e "  --reset                 Drop and recreate tables first"
  echo -e "  -h, --help              Show this help message"
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --reset)
      RESET=true
      shift
      ;;
    --tasks-path)
      if [ -z "$2" ]; then
        echo -e "${YELLOW}Missing value for --tasks-path${NC}"
        usage
        exit 1
      fi
      TASKS_PATH="$2"
      shift 2
      ;;
    --tasks-path=*)
      TASKS_PATH="${1#*=}"
      shift
      ;;
    *)
      echo -e "${YELLOW}Unknown argument:${NC} $1"
      usage
      exit 1
      ;;
  esac
done

if [ -z "$TASKS_PATH" ]; then
  echo -e "${RED}❌ Error: --tasks-path is required${NC}"
  usage
  exit 1
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

if [ "$IS_PRODUCTION" = true ]; then
  ENV_LABEL="prod"
else
  ENV_LABEL="local"
fi
# END OPTIONAL PRODUCTION GUARD

echo -e "${BLUE}📦 Load Tasks Script (${ENV_LABEL})${NC}"
echo -e "${BLUE}===============================${NC}"

# Check required files
if [ ! -f "$PROJECT_ROOT/load_tasks.py" ]; then
  echo -e "${RED}❌ Error: load_tasks.py not found in $PROJECT_ROOT/${NC}"
  exit 1
fi

# Check Python
if ! command -v python3 &> /dev/null; then
  echo -e "${RED}❌ Error: python3 is not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}📦 Checking dependencies...${NC}"
cd "$PROJECT_ROOT"

# Try to activate conda environment
if command -v conda &> /dev/null; then
  echo -e "${YELLOW}🔧 Using conda environment 'helpful-coding' for commands...${NC}"
else
  echo -e "${YELLOW}⚠️  Conda not found, trying virtual environment...${NC}"
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
  if command -v conda &> /dev/null; then
    conda run -n helpful-coding pip install -r backend/requirements.txt
  else
    pip install -r backend/requirements.txt
  fi
fi

# Optional destructive reset
if [ "$RESET" = true ]; then
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

    echo -e "${RED}To proceed, you must confirm THREE times in a row:${NC}"
    echo ""

    read -p "Type 'RESET PRODUCTION DATABASE' to confirm (1/3): " confirm1
    if [ "$confirm1" != "RESET PRODUCTION DATABASE" ]; then
      echo -e "${GREEN}✅ Operation cancelled. Production database is safe.${NC}"
      exit 0
    fi

    read -p "Type 'I UNDERSTAND THIS WILL DELETE ALL DATA' to confirm (2/3): " confirm2
    if [ "$confirm2" != "I UNDERSTAND THIS WILL DELETE ALL DATA" ]; then
      echo -e "${GREEN}✅ Operation cancelled. Production database is safe.${NC}"
      exit 0
    fi

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
    echo -e "${RED}⚠️  RESET MODE: This will DROP ALL TABLES before loading tasks!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
      echo -e "${BLUE}Operation cancelled.${NC}"
      exit 0
    fi
  fi
  echo -e "${YELLOW}🗑️  Dropping and recreating tables...${NC}"
fi

# Load tasks
echo -e "${YELLOW}📄 Loading tasks into database...${NC}"
RESET_ARG=""
if [ "$RESET" = true ]; then
  RESET_ARG="--reset"
fi

if command -v conda &> /dev/null; then
  conda run -n helpful-coding python "$PROJECT_ROOT/load_tasks.py" --tasks-path "$TASKS_PATH" $RESET_ARG
else
  python3 "$PROJECT_ROOT/load_tasks.py" --tasks-path "$TASKS_PATH" $RESET_ARG
fi

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Tasks loaded successfully!${NC}"
else
  echo -e "${RED}❌ Failed to load tasks.${NC}"
  exit 1
fi

echo -e "${BLUE}📋 Tips:${NC}"
echo -e "  • Run './download.sh stats' to view database stats"
echo -e "  • Re-run with '--reset' to drop and reload"
echo -e "  • Load another file: pass a different path with --tasks-path"


