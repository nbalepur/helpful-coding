#!/bin/bash

# Load dummy tasks into the database
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
AUTO_YES=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --reset)
      RESET=true
      shift
      ;;
    -y|--yes)
      AUTO_YES=true
      shift
      ;;
    *)
      echo -e "${YELLOW}Unknown argument:${NC} $1"
      echo -e "${BLUE}Usage:${NC} $0 [--reset] [-y|--yes]"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}📦 Load Dummy Tasks Script${NC}"
echo -e "${BLUE}==========================${NC}"

# Check required files
if [ ! -f "$SCRIPT_DIR/../python/load_dummy_tasks.py" ]; then
  echo -e "${RED}❌ Error: load_dummy_tasks.py not found in $SCRIPT_DIR/../python/${NC}"
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
  echo -e "${RED}⚠️  RESET MODE: This will DROP ALL TABLES before loading tasks!${NC}"
  if [ "$AUTO_YES" = false ]; then
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
      echo -e "${BLUE}Operation cancelled.${NC}"
      exit 0
    fi
  fi
  if [ ! -f "$SCRIPT_DIR/../python/reset_tables.py" ]; then
    echo -e "${RED}❌ Error: reset_tables.py not found in $SCRIPT_DIR/../python/${NC}"
    exit 1
  fi
  echo -e "${YELLOW}🗑️  Dropping and recreating tables...${NC}"
  cd "$SCRIPT_DIR/../python"
  if command -v conda &> /dev/null; then
    conda run -n helpful-coding python reset_tables.py
  else
    python3 reset_tables.py
  fi
  cd - >/dev/null
fi

# Ensure tables exist if not resetting
if [ "$RESET" = false ]; then
  if [ -f "$SCRIPT_DIR/../python/create_tables.py" ]; then
    echo -e "${YELLOW}🏗️  Ensuring tables exist...${NC}"
    cd "$SCRIPT_DIR/../python"
    if command -v conda &> /dev/null; then
      conda run -n helpful-coding python create_tables.py || true
    else
      python3 create_tables.py || true
    fi
    cd - >/dev/null
  fi
fi

# Load dummy tasks
echo -e "${YELLOW}📄 Loading dummy tasks into database...${NC}"
cd "$SCRIPT_DIR/../python"
if command -v conda &> /dev/null; then
  conda run -n helpful-coding python load_dummy_tasks.py
else
  python3 load_dummy_tasks.py
fi

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Dummy tasks loaded successfully!${NC}"
else
  echo -e "${RED}❌ Failed to load dummy tasks.${NC}"
  exit 1
fi

# Load JSONL data files
if [ -f "$SCRIPT_DIR/../python/load_jsonl_data.py" ]; then
  echo -e "${YELLOW}📄 Loading JSONL data files into database...${NC}"
  cd "$SCRIPT_DIR/../python"
  if command -v conda &> /dev/null; then
    conda run -n helpful-coding python load_jsonl_data.py
  else
    python3 load_jsonl_data.py
  fi

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ JSONL data loaded successfully!${NC}"
  else
    echo -e "${RED}❌ Failed to load JSONL data.${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}⚠️  load_jsonl_data.py not found, skipping JSONL data loading${NC}"
fi

echo -e "${BLUE}📋 Tips:${NC}"
echo -e "  • Run './download.sh stats' to view database stats"
echo -e "  • Re-run with '--reset -y' to drop and reload quickly"


