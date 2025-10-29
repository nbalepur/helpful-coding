#!/bin/bash

# Script to start the backend server
# Usage: ./scripts/start-backend.sh

set -e  # Exit on any error

echo "🚀 Starting AI Coding Assistant Backend..."

# Change to the backend directory
cd "$(dirname "$0")/../backend"

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

# Check if .env file exists, create if not
if [ ! -f ".env" ]; then
    echo "🔑 No .env file found. Creating one..."
    echo "Please enter your OpenAI API key:"
    read -r api_key
    if [ -z "$api_key" ]; then
        echo "❌ No API key provided. Exiting."
        exit 1
    fi
    cat > .env << EOF
# OpenAI API Configuration
OPENAI_API_KEY=$api_key

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=True
EOF
    echo "✅ .env file created!"
fi

# Start the server
echo "🌟 Starting FastAPI server on http://localhost:8000"
echo "📡 WebSocket endpoint: ws://localhost:8000/ws/chat"
echo "🏥 Health check: http://localhost:8000/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python main.py
