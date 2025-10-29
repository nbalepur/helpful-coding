m fine with #!/bin/bash

# PostgreSQL Setup Script for Helpful Coding
# This script helps set up PostgreSQL for the application

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐘 PostgreSQL Setup Script${NC}"
echo -e "${BLUE}==========================${NC}"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed. Please install PostgreSQL first.${NC}"
    echo -e "${YELLOW}Installation instructions:${NC}"
    echo -e "  macOS: brew install postgresql"
    echo -e "  Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    echo -e "  CentOS: sudo yum install postgresql-server postgresql-contrib"
    exit 1
fi

# Check if PostgreSQL service is running
if ! pg_isready -q; then
    echo -e "${YELLOW}⚠️  PostgreSQL service is not running. Starting it...${NC}"
    if command -v brew &> /dev/null; then
        brew services start postgresql
    elif command -v systemctl &> /dev/null; then
        sudo systemctl start postgresql
    else
        echo -e "${RED}❌ Please start PostgreSQL service manually${NC}"
        exit 1
    fi
fi

# Database configuration
DB_NAME="helpful_coding"
DB_USER="postgres"
DB_PASSWORD="password"

echo -e "${YELLOW}📋 Database Configuration:${NC}"
echo -e "  Database Name: ${DB_NAME}"
echo -e "  Database User: ${DB_USER}"
echo -e "  Database Password: ${DB_PASSWORD}"
echo -e "  Host: localhost"
echo -e "  Port: 5432"

# Create database if it doesn't exist
echo -e "${YELLOW}🏗️  Creating database...${NC}"
if psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${GREEN}✅ Database '${DB_NAME}' already exists${NC}"
else
    createdb $DB_NAME
    echo -e "${GREEN}✅ Database '${DB_NAME}' created successfully${NC}"
fi

# Create environment file in backend directory
echo -e "${YELLOW}📝 Creating environment configuration...${NC}"
cat > ../backend/.env << EOF
# Database Configuration
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
ASYNC_DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}

# Database Connection Details
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

# Application Configuration
OPENAI_API_KEY=your_openai_api_key_here
EOF

echo -e "${GREEN}✅ Environment file created: ../backend/.env${NC}"

# Test database connection
echo -e "${YELLOW}🔍 Testing database connection...${NC}"
if psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection successful!${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    echo -e "${YELLOW}Please check your PostgreSQL configuration and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 PostgreSQL setup completed successfully!${NC}"
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  1. Update your backend/.env file with the correct database credentials"
echo -e "  2. Run './db.sh create' to create database tables"
echo -e "  3. Run './db.sh migrate init' to set up migrations"
echo -e "  4. Start your application"
