#!/bin/bash

# Database creation script
# This script creates all database tables

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

echo -e "${BLUE}🚀 Database Creation Script${NC}"
echo -e "${BLUE}===========================${NC}"

# Check if we're in the right directory
if [ ! -f "$SCRIPT_DIR/../python/create_tables.py" ]; then
    echo -e "${RED}❌ Error: create_tables.py not found in $SCRIPT_DIR/../python/${NC}"
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

# Run the table creation script
echo -e "${YELLOW}🏗️  Creating database tables...${NC}"
cd "$SCRIPT_DIR/../python"
if command -v conda &> /dev/null; then
    conda run -n helpful-coding python create_tables.py
else
    python3 create_tables.py
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database tables created successfully!${NC}"
    echo -e "${GREEN}🎉 You can now use the database in your application.${NC}"
else
    echo -e "${RED}❌ Failed to create database tables.${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  • Run './migrate.sh init' to set up migrations"
echo -e "  • Run './download.sh stats' to check database status"
echo -e "  • Use the database in your application"
