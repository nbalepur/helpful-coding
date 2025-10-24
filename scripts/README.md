# AI Coding Assistant - Scripts

This directory contains bash scripts to easily start and manage the AI Coding Assistant application.

## Quick Start

### 🚀 Start Everything (Recommended)
```bash
./scripts/start-all.sh
```
This starts both the backend and frontend servers simultaneously.

### 🛠️ Setup (First Time Only)
```bash
./scripts/setup.sh
```
This script will:
- Check system requirements (Python 3.8+, Node.js 18+)
- Set up Python virtual environment for backend
- Install backend dependencies in virtual environment
- Create `.env` file for OpenAI API key
- Install frontend dependencies in `node_modules`

### 🔧 Start Individual Services

**Backend only:**
```bash
./scripts/start-backend.sh
```

**Frontend only:**
```bash
./scripts/start-frontend.sh
```

### 🛑 Stop Services

**Stop everything:**
```bash
./scripts/stop-all.sh
```

### 🔄 Restart Services

**Restart everything (stop + start):**
```bash
./scripts/restart.sh
```

## Prerequisites

### System Requirements
- **Python 3.8+** - For the backend FastAPI server
- **Node.js 18+** - For the frontend Next.js application
- **npm** - Node package manager
- **OpenAI API Key** - For AI functionality

### Installation Links
- [Python](https://www.python.org/downloads/)
- [Node.js](https://nodejs.org/)

## URLs

Once started, the application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health
- **WebSocket**: ws://localhost:8000/ws/chat

## Environment Setup

### Backend (.env file)
The backend requires a `.env` file in the `backend/` directory:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=True
```

### Frontend
The frontend automatically connects to the backend via WebSocket. No additional configuration needed.

## Virtual Environments

### Backend (Python)
- **Virtual Environment**: Automatically created in `backend/venv/`
- **Isolation**: All Python dependencies are installed in the virtual environment
- **Activation**: Scripts automatically activate the virtual environment
- **Manual Activation**: `source backend/venv/bin/activate`

### Frontend (Node.js)
- **Dependencies**: Installed in `interface/node_modules/`
- **Isolation**: Node.js automatically handles dependency isolation
- **No Manual Setup**: Dependencies are managed by npm

## Troubleshooting

### Backend Issues
- **Port 8000 in use**: Change the PORT in `backend/.env`
- **Python virtual environment issues**: Delete `backend/venv/` and run setup again
- **API key errors**: Check your OpenAI API key in `backend/.env`

### Frontend Issues
- **Port 3000 in use**: Next.js will automatically use the next available port
- **Node modules issues**: Delete `interface/node_modules/` and run setup again
- **Connection errors**: Ensure the backend is running on port 8000

### General Issues
- **Permission denied**: Make sure scripts are executable: `chmod +x scripts/*.sh`
- **Script not found**: Run from the project root directory
- **Dependencies missing**: Run `./scripts/setup.sh` first

## Development

### Backend Development
- The backend uses FastAPI with auto-reload enabled
- Changes to Python files will automatically restart the server
- Check logs in the terminal for debugging

### Frontend Development
- The frontend uses Next.js with hot reload
- Changes to React/TypeScript files will automatically refresh the browser
- Check browser console for client-side errors

## Architecture

```
AI Coding Assistant
├── backend/           # FastAPI Python server
│   ├── main.py       # FastAPI app with WebSocket
│   ├── models/       # Chat model abstractions
│   ├── strategies/   # AI provider implementations
│   └── requirements.txt
├── interface/        # Next.js React frontend
│   ├── app/         # Next.js app directory
│   ├── components/  # React components
│   └── package.json
└── scripts/         # Bash startup scripts
    ├── setup.sh     # Initial setup
    ├── start-backend.sh
    ├── start-frontend.sh
    └── start-all.sh
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the individual README files in `backend/` and `interface/`
3. Check the main project README.md
