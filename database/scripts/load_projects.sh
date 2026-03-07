#!/bin/bash

# Load only projects (tasks) into the database from data/tasks.json.
# Does not reset tables or load JSONL data (code_data, mcqa_data, etc.).
# Same DB as load.sh (uses backend/.env).

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

TUTORIAL=false
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --tutorial)
      TUTORIAL=true
      shift
      ;;
    *)
      echo -e "${YELLOW}Unknown argument:${NC} $1"
      echo -e "${BLUE}Usage:${NC} $0 [--tutorial]"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}📦 Load projects only (tasks → projects table)${NC}"
echo -e "${BLUE}===============================================${NC}"

if [ ! -f "$SCRIPT_DIR/../python/load_dummy_tasks.py" ]; then
  echo -e "${RED}❌ Error: load_dummy_tasks.py not found${NC}"
  exit 1
fi
if ! command -v python3 &> /dev/null; then
  echo -e "${RED}❌ Error: python3 is not installed${NC}"
  exit 1
fi

cd "$PROJECT_ROOT"

if command -v conda &> /dev/null; then
  echo -e "${YELLOW}🔧 Using conda environment 'helpful-coding'...${NC}"
else
  if [ -d "backend/venv" ]; then
    source backend/venv/bin/activate
  elif [ -d "venv" ]; then
    source venv/bin/activate
  fi
fi

# Ensure projects table exists
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

DATA_DIR="data"
[ "$TUTORIAL" = true ] && DATA_DIR="data_tutorial"

echo -e "${YELLOW}📄 Loading projects from $DATA_DIR/tasks.json...${NC}"
cd "$SCRIPT_DIR/../python"
if command -v conda &> /dev/null; then
  conda run -n helpful-coding python load_dummy_tasks.py --data-dir "$DATA_DIR"
else
  python3 load_dummy_tasks.py --data-dir "$DATA_DIR"
fi

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Projects loaded successfully!${NC}"
else
  echo -e "${RED}❌ Failed to load projects.${NC}"
  exit 1
fi
