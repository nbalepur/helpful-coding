#!/bin/bash

# Database setup script for helpful-coding project
# This script sets up the database with the simplified schema

echo "🗄️  Database Setup Script"
echo "=" * 50

# Check if we're in the right directory
if [ ! -f "alembic.ini" ]; then
    echo "❌ Error: Please run this script from the database directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f "../backend/.env" ]; then
    echo "⚠️  Warning: No .env file found in backend directory"
    echo "Please create backend/.env with your database configuration:"
    echo ""
    echo "DATABASE_URL=postgresql://username:password@localhost:5432/helpful_coding_db"
    echo "DATABASE_HOST=localhost"
    echo "DATABASE_PORT=5432"
    echo "DATABASE_NAME=helpful_coding_db"
    echo "DATABASE_USER=your_username"
    echo "DATABASE_PASSWORD=your_password"
    echo ""
    read -p "Press Enter to continue after creating .env file..."
fi

# Install dependencies
echo "📦 Installing database dependencies..."
pip install -r requirements.txt

# Setup database
echo "🚀 Setting up database..."
python scripts/setup_database.py

# Create initial migration
echo "📝 Creating initial migration..."
alembic revision --autogenerate -m "Initial database schema"

# Apply migrations
echo "🔄 Applying migrations..."
alembic upgrade head

# Seed database
echo "🌱 Seeding database with sample data..."
python scripts/seed_database.py

echo ""
echo "🎉 Database setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Update your backend to use the database models"
echo "2. Test the database connection"
echo "3. Start building your application!"
echo ""
echo "Database URL: Check your .env file for DATABASE_URL"
echo "Sample users created:"
echo "  - admin@helpfulcoding.com (password: password)"
echo "  - student@helpfulcoding.com (password: password)"
