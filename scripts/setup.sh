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

# Check if conda is installed
if ! command -v conda &> /dev/null; then
    echo "❌ Conda is not installed. Please install conda first."
    echo "   Visit: https://docs.conda.io/en/latest/miniconda.html"
    exit 1
fi

# Initialize conda
eval "$(conda shell.bash hook)"

# Create conda environment if it doesn't exist
# Check if environment exists (more robust check)
if conda env list | grep -qE "helpful-coding\s"; then
    echo "✅ Conda environment 'helpful-coding' already exists"
    echo "🔍 Checking Python version in conda environment..."
    # Activate to check version
    eval "$(conda shell.bash hook)"
    conda activate helpful-coding
    conda_python_version=$(python --version 2>&1 | cut -d' ' -f2)
    echo "   Python version in conda env: $conda_python_version"
    conda deactivate
else
    echo "📦 Creating conda environment 'helpful-coding' with Python 3.11..."
    conda create -n helpful-coding python=3.11 -y
    echo "✅ Conda environment created"
fi

# Activate conda environment and install dependencies
echo "🔧 Activating conda environment and installing dependencies..."
eval "$(conda shell.bash hook)"
if conda activate helpful-coding; then
    echo "✅ Conda environment activated"
    
    # Verify Python version
    python_version=$(python --version 2>&1 | cut -d' ' -f2)
    echo "   Using Python: $python_version"
    
    # Check if Python version is 3.8+
    major_version=$(echo "$python_version" | cut -d'.' -f1)
    minor_version=$(echo "$python_version" | cut -d'.' -f2)
    if [ "$major_version" -lt 3 ] || ([ "$major_version" -eq 3 ] && [ "$minor_version" -lt 8 ]); then
        echo "❌ Error: Python 3.8+ is required, but conda environment has Python $python_version"
        echo "   Please recreate the environment: conda remove -n helpful-coding --all -y && conda create -n helpful-coding python=3.11 -y"
        exit 1
    fi
    
    # Upgrade pip and install dependencies
    echo "📥 Upgrading pip and installing dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
    echo "✅ Backend dependencies installed"
else
    echo "❌ Failed to activate conda environment. Please check the setup."
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
    echo "   PORT=4828"
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
PORT=4828
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
echo "   Frontend: http://localhost:4827"
echo "   Backend:  http://localhost:4828"
echo "   Health:   http://localhost:4828/health"
echo ""
