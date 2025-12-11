#!/bin/bash

# Script to restart the application in production mode
# Usage: ./scripts/restart_prod.sh
#
# This script:
# 1. Stops any running services
# 2. Syncs environment variables from backend/.env to interface/.env.local
# 3. Builds the frontend for production
# 4. Starts the backend in production mode (no reload, no debugging)

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Restarting application in PRODUCTION mode..."
echo ""

# Step 1: Stop existing services
echo "🛑 Step 1: Stopping existing services..."
"$SCRIPT_DIR/stop-all.sh"
sleep 2
echo ""

# Step 2: Sync environment variables
echo "🔄 Step 2: Syncing environment variables..."
cd "$PROJECT_ROOT/interface"
if [ ! -f "../backend/.env" ]; then
    echo "❌ Error: backend/.env not found!"
    echo "Please create backend/.env with your production configuration."
    exit 1
fi

# Run sync-env script
npm run sync-env
if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to sync environment variables"
    exit 1
fi
echo "✅ Environment variables synced to interface/.env.local"
echo ""

# Step 3: Build frontend for production
echo "🏗️  Step 3: Building frontend for production..."
cd "$PROJECT_ROOT/interface"

# Load nvm if it exists (for non-interactive shells)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
elif [ -s "$HOME/.bashrc" ] && grep -q "nvm" "$HOME/.bashrc"; then
    # shellcheck source=/dev/null
    . "$HOME/.bashrc"
elif [ -s "$HOME/.zshrc" ] && grep -q "nvm" "$HOME/.zshrc"; then
    # shellcheck source=/dev/null
    . "$HOME/.zshrc"
fi

# Use Node.js 18 if nvm is available
if command -v nvm &> /dev/null || type nvm &> /dev/null; then
    nvm use 18 2>/dev/null || true
elif [ -f "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh" && nvm use 18 2>/dev/null || true
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📥 Installing frontend dependencies..."
    npm install
fi

# Build for production
echo "🔨 Building Next.js application..."
NODE_ENV=production npm run build

if [ $? -ne 0 ]; then
    echo "❌ Error: Frontend build failed"
    exit 1
fi
echo "✅ Frontend built successfully (output in interface/out/)"
echo ""

# Step 4: Start backend in production mode
echo "🐍 Step 4: Starting backend in production mode..."
cd "$PROJECT_ROOT/backend"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ Error: backend/.env not found!"
    echo "Please create backend/.env with your production configuration."
    exit 1
fi

# Check if conda is installed and activate environment
if command -v conda &> /dev/null; then
    echo "🔧 Activating helpful-coding conda environment..."
    eval "$(conda shell.bash hook)"
    if conda activate helpful-coding; then
        echo "✅ Conda environment activated"
    else
        echo "⚠️  Warning: Failed to activate helpful-coding conda environment."
        echo "Continuing with system Python..."
    fi
else
    echo "ℹ️  Conda not found, using system Python"
fi

# Check if virtual environment exists and activate it
if [ -d "venv" ]; then
    echo "🔧 Activating virtual environment..."
    source venv/bin/activate
    echo "✅ Virtual environment activated"
fi

# Install/update dependencies
echo "📥 Ensuring dependencies are installed..."
pip install -q -r requirements.txt

# Start backend with uvicorn in production mode (no reload, no debug)
echo "🌟 Starting FastAPI server in PRODUCTION mode..."
echo "   Host: 0.0.0.0"
echo "   Port: 4828"
echo "   Mode: Production (no reload, no debugging)"
echo ""

# Run uvicorn directly in production mode
uvicorn main:app \
    --host 0.0.0.0 \
    --port 4828 \
    --workers 1 \
    --no-reload \
    --log-level info

