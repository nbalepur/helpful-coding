#!/bin/bash

# Database migration script
# This script handles database migrations using Alembic

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

echo -e "${BLUE}🔄 Database Migration Script${NC}"
echo -e "${BLUE}============================${NC}"

# Check if we're in the right directory
if [ ! -f "$SCRIPT_DIR/../python/migrate.py" ]; then
    echo -e "${RED}❌ Error: migrate.py not found in $SCRIPT_DIR/../python/${NC}"
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
if command -v conda &> /dev/null; then
    echo -e "${YELLOW}🔧 Activating conda environment 'helpful-coding'...${NC}"
    eval "$(conda shell.bash hook)"
    conda activate helpful-coding
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
    pip install -r backend/requirements.txt
fi

# Check if alembic is installed
if ! command -v alembic &> /dev/null; then
    echo -e "${RED}❌ Error: alembic is not installed${NC}"
    echo -e "${YELLOW}Installing alembic...${NC}"
    pip install alembic
fi

# Run the migration script with arguments
echo -e "${YELLOW}🔄 Running migration command...${NC}"
cd "$SCRIPT_DIR/../python"

if [ $# -eq 0 ]; then
    echo -e "${BLUE}Usage: $0 <command> [options]${NC}"
    echo -e "${BLUE}Commands:${NC}"
    echo -e "  init                    - Initialize alembic"
    echo -e "  create [message]        - Create new migration"
    echo -e "  apply                   - Apply all migrations"
    echo -e "  history                 - Show migration history"
    echo -e "  current                 - Show current revision"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  $0 init"
    echo -e "  $0 create 'Add user table'"
    echo -e "  $0 apply"
    echo -e "  $0 history"
    exit 0
fi

python3 migrate.py "$@"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migration operation completed successfully!${NC}"
else
    echo -e "${RED}❌ Migration operation failed!${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  • Run './download.sh stats' to check database status"
echo -e "  • Use the database in your application"
