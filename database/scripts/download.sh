#!/bin/bash

# Database download/export script
# This script exports database data to JSON or CSV formats

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

echo -e "${BLUE}📥 Database Download Script${NC}"
echo -e "${BLUE}===========================${NC}"

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo -e "${BLUE}Usage: $0 <command> [options]${NC}"
    echo -e "${BLUE}Commands:${NC}"
    echo -e "  json [file]             - Export to JSON file (default: data_export.json)"
    echo -e "  csv [dir]               - Export to CSV files (default: data_export/)"
    echo -e "  stats                   - Show database statistics"
    exit 0
fi

# Check if we're in the right directory
if [ ! -f "$SCRIPT_DIR/../python/download.py" ]; then
    echo -e "${RED}❌ Error: download.py not found in $SCRIPT_DIR/../python/${NC}"
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

# Run the download script with arguments
echo -e "${YELLOW}📊 Running download command...${NC}"
cd "$SCRIPT_DIR/../python"

if [ $# -eq 0 ]; then
    echo -e "${BLUE}Usage: $0 <command> [options]${NC}"
    echo -e "${BLUE}Commands:${NC}"
    echo -e "  json [file]             - Export to JSON file (default: data_export.json)"
    echo -e "  csv [dir]               - Export to CSV files (default: data_export/)"
    echo -e "  stats                   - Show database statistics"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  $0 json"
    echo -e "  $0 json my_backup.json"
    echo -e "  $0 csv"
    echo -e "  $0 csv backup_data/"
    echo -e "  $0 stats"
    exit 0
fi

if command -v conda &> /dev/null; then
    conda run -n helpful-coding python download.py "$@"
else
    python3 download.py "$@"
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Download operation completed successfully!${NC}"
else
    echo -e "${RED}❌ Download operation failed!${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  • Check the exported files"
echo -e "  • Use the data for backup or analysis"
echo -e "  • Run './create.sh' to recreate tables if needed"
