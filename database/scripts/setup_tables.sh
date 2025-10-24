#!/bin/bash

# Setup database tables script
echo "🚀 Setting up database tables..."

# Function to check if we're in a virtual environment
check_virtual_env() {
    if [[ -z "$VIRTUAL_ENV" && -z "$CONDA_DEFAULT_ENV" ]]; then
        echo "⚠️  No virtual environment detected!"
        echo ""
        echo "Please activate a virtual environment first:"
        echo ""
        echo "Option 1 - Conda:"
        echo "  conda activate helpful-coding"
        echo ""
        echo "Option 2 - Python venv:"
        echo "  source venv/bin/activate  # On Linux/macOS"
        echo ""
        echo "Then run this script again."
        exit 1
    else
        if [[ -n "$CONDA_DEFAULT_ENV" ]]; then
            echo "✅ Conda environment detected: $CONDA_DEFAULT_ENV"
        elif [[ -n "$VIRTUAL_ENV" ]]; then
            echo "✅ Virtual environment detected: $VIRTUAL_ENV"
        fi
    fi
}

# Check virtual environment
check_virtual_env

# Check if we're in the right directory
if [ ! -f "alembic.ini" ]; then
    echo "❌ Error: Please run this script from the database directory"
    exit 1
fi

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Check if .env file exists
if [ ! -f "../backend/.env" ]; then
    echo "❌ No .env file found in backend directory"
    echo "   Please create backend/.env with your database configuration"
    exit 1
fi

echo "✅ .env file found"

# Create tables
echo "📊 Creating database tables..."
python -c "
import sys
sys.path.append('.')
from config import init_db

init_db()
print('✅ Tables created successfully!')
"

# Create initial migration
echo "📝 Creating initial migration..."
alembic revision --autogenerate -m "Initial database schema"

# Apply migrations
echo "🔄 Applying migrations..."
alembic upgrade head

echo ""
echo "🎉 Database tables setup complete!"
echo ""
echo "Next steps:"
echo "1. Run: ./scripts/seed_db.sh (optional - adds sample data)"
