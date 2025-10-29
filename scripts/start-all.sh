#!/bin/bash

# Script to start both frontend and backend servers
# Usage: ./scripts/start-all.sh

set -e  # Exit on any error

echo "🚀 Starting AI Coding Assistant - Full Stack"
echo "=============================================="

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Use Node.js 18+ via nvm for environment sync
if command -v nvm &> /dev/null; then
    echo "🔄 Switching to Node.js 18 for environment sync..."
    nvm use 18
fi

# Sync environment variables from backend to frontend
echo "🔄 Syncing environment variables..."
if [ -f "$PROJECT_ROOT/backend/.env" ]; then
    node "$SCRIPT_DIR/sync-env.js"
else
    echo "⚠️  Warning: backend/.env not found, using default environment"
fi
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    # Kill all background jobs
    jobs -p | xargs -r kill
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start backend in background
echo "🔧 Starting backend server (in conda environment)..."
cd "$PROJECT_ROOT"
"$SCRIPT_DIR/start-backend.sh" &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend in background
echo "🎨 Starting frontend server..."
cd "$PROJECT_ROOT"
"$SCRIPT_DIR/start-frontend.sh" &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers are starting up!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend: http://localhost:8000"
echo "📡 WebSocket: ws://localhost:8000/ws/chat"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
