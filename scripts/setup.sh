#!/bin/bash

# Setup script for AI Coding Assistant
# Usage: ./scripts/setup.sh

set -e  # Exit on any error

echo "🛠️  AI Coding Assistant Setup"
echo "=============================="

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "📁 Project root: $PROJECT_ROOT"

# Check system requirements
echo ""
echo "🔍 Checking system requirements..."

# Check Python
if command -v python3 &> /dev/null; then
    python_version=$(python3 --version | cut -d' ' -f2)
    echo "✅ Python 3: $python_version"
else
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    echo "   Visit: https://www.python.org/downloads/"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    node_version=$(node --version)
    echo "✅ Node.js: $node_version"
    
    # Check if version is 18+
    major_version=$(echo "$node_version" | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$major_version" -lt 18 ]; then
        echo "⚠️  Warning: Node.js 18+ is recommended. Current version: $node_version"
    fi
else
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    npm_version=$(npm --version)
    echo "✅ npm: $npm_version"
else
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo ""
echo "🔧 Setting up backend..."

# Setup backend
cd "$PROJECT_ROOT/backend"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
fi

# Activate virtual environment and install dependencies
echo "🔧 Activating virtual environment and installing dependencies..."
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    echo "✅ Virtual environment activated"
    
    # Upgrade pip and install dependencies
    echo "📥 Upgrading pip and installing dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
    echo "✅ Backend dependencies installed"
else
    echo "❌ Failed to activate virtual environment. Please check the setup."
    exit 1
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo ""
    echo "🔑 Backend environment setup required:"
    echo "   Please create a .env file in the backend directory with your OpenAI API key"
    echo "   Example:"
    echo "   OPENAI_API_KEY=your_api_key_here"
    echo "   HOST=0.0.0.0"
    echo "   PORT=8000"
    echo "   DEBUG=True"
    echo ""
    read -p "Do you want to create the .env file now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Enter your OpenAI API key:"
        read -r api_key
        if [ -z "$api_key" ]; then
            echo "❌ No API key provided. You can create the .env file manually later."
        else
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
    fi
else
    echo "✅ Backend .env file already exists"
fi

echo ""
echo "🎨 Setting up frontend..."

# Setup frontend
cd "$PROJECT_ROOT/interface"

# Install npm dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
else
    echo "✅ Frontend dependencies already installed"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "🚀 Quick Start Commands:"
echo "   Start backend only:  ./scripts/start-backend.sh"
echo "   Start frontend only: ./scripts/start-frontend.sh"
echo "   Start both:          ./scripts/start-all.sh"
echo ""
echo "🌐 URLs:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   Health:   http://localhost:8000/health"
echo ""
