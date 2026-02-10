#!/bin/bash

# Script to start the backend server
# Usage: ./scripts/start-backend.sh

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Starting AI Coding Assistant Backend..."

# Change to the backend directory
cd "$PROJECT_ROOT/backend"

# Check if conda is installed
if ! command -v conda &> /dev/null; then
    echo "❌ Conda is not installed. Please install conda first."
    exit 1
fi

# Initialize conda and activate helpful-coding conda environment
echo "🔧 Activating helpful-coding conda environment..."
eval "$(conda shell.bash hook)"
if conda activate helpful-coding; then
    echo "✅ Conda environment activated"
else
    echo "❌ Failed to activate helpful-coding conda environment."
    echo "Please make sure the environment exists: conda create -n helpful-coding python=3.11"
    exit 1
fi

# Install/update dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Check if .env file exists at project root, create if not
ROOT_ENV="$PROJECT_ROOT/.env"
if [ ! -f "$ROOT_ENV" ]; then
    echo "🔑 No .env file found at project root. Creating one..."
    echo "Please enter your OpenAI API key:"
    read -r api_key
    if [ -z "$api_key" ]; then
        echo "❌ No API key provided. Exiting."
        exit 1
    fi
    cat > "$ROOT_ENV" << EOF
# OpenAI API Configuration
OPENAI_API_KEY=$api_key

# Server Configuration
HOST=0.0.0.0
PORT=4828
DEBUG=True
EOF
    echo "✅ .env file created!"
fi

# Get backend URL from root .env (port derived from NEXT_PUBLIC_BACKEND_URL or BACKEND_URL)
ENV_FILE="$PROJECT_ROOT/.env"
BACKEND_URL=$(grep -E "^NEXT_PUBLIC_BACKEND_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || grep -E "^BACKEND_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
BACKEND_URL=${BACKEND_URL:-http://localhost:4828}

# Start the server
echo "🌟 Starting FastAPI server on $BACKEND_URL"
echo "🏥 Health check: $BACKEND_URL/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python main.py
