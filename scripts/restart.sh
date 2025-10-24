#!/bin/bash

# Script to restart all services (stop everything, then start all)
# Usage: ./scripts/restart.sh

set -e  # Exit on any error

echo "🔄 Restarting AI Coding Assistant"
echo "=================================="

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "1️⃣  Stopping all services..."
"$SCRIPT_DIR/stop-all.sh"

echo ""
echo "2️⃣  Waiting for services to fully stop..."
sleep 3

echo ""
echo "3️⃣  Starting all services..."
"$SCRIPT_DIR/start-all.sh"
