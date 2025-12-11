#!/bin/bash

# Script to start the frontend development server
# Usage: ./scripts/start-frontend.sh

set -e  # Exit on any error

echo "🚀 Starting AI Coding Assistant Frontend..."

# Change to the interface directory
cd "$(dirname "$0")/../interface"

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
    # Try to use nvm directly
    source "$NVM_DIR/nvm.sh" && nvm use 18 2>/dev/null || true
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. This doesn't appear to be a Node.js project directory."
    exit 1
fi

# Check Node.js version
node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

npm install

# Start the development server
echo "🌟 Starting Next.js development server on http://localhost:4827"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
