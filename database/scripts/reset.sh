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

echo -e "${RED}⚠️  DATABASE RESET SCRIPT ⚠️${NC}"
echo -e "${RED}===========================${NC}"
echo -e "${YELLOW}This will DROP ALL TABLES and recreate them!${NC}"
echo -e "${YELLOW}ALL DATA WILL BE LOST!${NC}"
echo ""

# Confirmation prompt
read -p "Are you sure you want to continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${BLUE}Operation cancelled.${NC}"
    exit 0
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

# Run the reset script
echo -e "${YELLOW}🗑️  Resetting database (dropping all tables)...${NC}"
cd "$SCRIPT_DIR/../python"
python3 reset_tables.py

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
