#!/bin/bash

# Script to stop all running services (frontend and backend)
# Usage: ./scripts/stop-all.sh

echo "🛑 Stopping AI Coding Assistant services..."

# Function to kill processes by port
kill_by_port() {
    local port=$1
    local service_name=$2
    
    # Find PIDs using the port
    local pids=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pids" ]; then
        echo "🔴 Stopping $service_name (port $port)..."
        echo "$pids" | xargs kill -TERM 2>/dev/null || true
        
        # Wait a moment for graceful shutdown
        sleep 2
        
        # Force kill if still running
        local remaining_pids=$(lsof -ti:$port 2>/dev/null)
        if [ -n "$remaining_pids" ]; then
            echo "⚡ Force stopping $service_name..."
            echo "$remaining_pids" | xargs kill -KILL 2>/dev/null || true
        fi
        
        echo "✅ $service_name stopped"
    else
        echo "ℹ️  $service_name not running on port $port"
    fi
}

# Function to kill processes by name pattern
kill_by_pattern() {
    local pattern=$1
    local service_name=$2
    
    # Find PIDs by process name pattern
    local pids=$(pgrep -f "$pattern" 2>/dev/null)
    
    if [ -n "$pids" ]; then
        echo "🔴 Stopping $service_name..."
        echo "$pids" | xargs kill -TERM 2>/dev/null || true
        
        # Wait a moment for graceful shutdown
        sleep 2
        
        # Force kill if still running
        local remaining_pids=$(pgrep -f "$pattern" 2>/dev/null)
        if [ -n "$remaining_pids" ]; then
            echo "⚡ Force stopping $service_name..."
            echo "$remaining_pids" | xargs kill -KILL 2>/dev/null || true
        fi
        
        echo "✅ $service_name stopped"
    else
        echo "ℹ️  $service_name not running"
    fi
}

# Stop services by port (more reliable)
echo "🔍 Checking for running services..."

# Stop backend (FastAPI/Uvicorn on port 4828)
kill_by_port 4828 "Backend server"

# Stop frontend (Next.js on port 4827)
kill_by_port 4827 "Frontend server"

# Also check for any remaining Python/Node processes related to our project
echo ""
echo "🔍 Checking for any remaining project processes..."

# Kill any remaining uvicorn processes
kill_by_pattern "uvicorn.*main:app" "Uvicorn processes"

# Kill any remaining next dev processes
kill_by_pattern "next.*dev" "Next.js dev processes"

# Kill any Python processes running our main.py (including virtual env)
kill_by_pattern "python.*main.py" "Python main.py processes"
kill_by_pattern ".*venv.*python.*main.py" "Virtual env Python processes"

# Kill any Node.js processes running our project
kill_by_pattern "node.*next.*dev" "Next.js dev processes"
kill_by_pattern "npm.*run.*dev" "npm dev processes"

echo ""
echo "🎉 All services stopped!"
echo ""
echo "💡 To start services again, run:"
echo "   ./scripts/start-all.sh"
echo ""
