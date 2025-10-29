#!/bin/bash

# Main database management script
# This script provides easy access to all database operations

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🗄️  Database Management System${NC}"
echo -e "${BLUE}============================${NC}"

if [ $# -eq 0 ]; then
    echo -e "${YELLOW}Usage: $0 <command> [options]${NC}"
    echo ""
    echo -e "${BLUE}Available commands:${NC}"
    echo -e "  setup-postgresql         - Set up PostgreSQL database"
    echo -e "  create                   - Create database tables"
    echo -e "  reset                    - Reset database (DESTRUCTIVE!)"
    echo -e "  migrate <cmd> [opts]     - Run migration commands"
    echo -e "  download <cmd> [opts]    - Export/backup data"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo -e "  $0 setup-postgresql"
    echo -e "  $0 create"
    echo -e "  $0 migrate init"
    echo -e "  $0 migrate create 'Add user table'"
    echo -e "  $0 migrate apply"
    echo -e "  $0 download stats"
    echo -e "  $0 download json backup.json"
    echo ""
    echo -e "${YELLOW}For detailed help on each command, run:${NC}"
    echo -e "  $0 <command> --help"
    exit 0
fi

command=$1
shift

case $command in
    "setup-postgresql")
        echo -e "${YELLOW}Setting up PostgreSQL...${NC}"
        "$SCRIPT_DIR/setup_postgresql.sh"
        ;;
    "create")
        echo -e "${YELLOW}Running database creation...${NC}"
        "$SCRIPT_DIR/scripts/create.sh"
        ;;
    "reset")
        echo -e "${YELLOW}Running database reset...${NC}"
        "$SCRIPT_DIR/scripts/reset.sh"
        ;;
    "migrate")
        echo -e "${YELLOW}Running migration command...${NC}"
        "$SCRIPT_DIR/scripts/migrate.sh" "$@"
        ;;
    "download")
        echo -e "${YELLOW}Running download command...${NC}"
        "$SCRIPT_DIR/scripts/download.sh" "$@"
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $command${NC}"
        echo -e "${YELLOW}Run '$0' without arguments to see available commands.${NC}"
        exit 1
        ;;
esac
