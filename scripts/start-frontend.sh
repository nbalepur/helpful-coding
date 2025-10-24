#!/bin/bash

# Script to start the frontend development server
# Usage: ./scripts/start-frontend.sh

set -e  # Exit on any error

echo "🚀 Starting AI Coding Assistant Frontend..."

# Change to the interface directory
cd "$(dirname "$0")/../interface"

# Use Node.js 18+ via nvm
if command -v nvm &> /dev/null; then
    echo "🔄 Switching to Node.js 18..."
    nvm use 18
else
    echo "⚠️  nvm not found, using system Node.js"
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

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "📦 Dependencies already installed"
fi

# Start the development server
echo "🌟 Starting Next.js development server on http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
