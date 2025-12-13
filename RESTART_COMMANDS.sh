#!/bin/bash
# Quick restart commands for production server

# Make sure you're in the right directory
cd /srv/www/vibejam/helpful-coding

# Pull latest code (if you haven't already)
git pull

# Build frontend (IMPORTANT - new proxy route needs to be built)
cd interface
source ~/.nvm/nvm.sh
nvm use 18
npm run build

# Start backend
cd /srv/www/vibejam/helpful-coding/backend
tmux new-session -d -s backend 'cd /srv/www/vibejam/helpful-coding/backend && source /fs/clip-quiz/nbalepur/anaconda3/etc/profile.d/conda.sh && conda activate helpful-coding && pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 4828 --workers 1 --log-level info'

# Wait a moment for backend to start
sleep 2

# Start frontend
cd /srv/www/vibejam/helpful-coding/interface
tmux new-session -d -s frontend 'cd /srv/www/vibejam/helpful-coding/interface && source ~/.nvm/nvm.sh && nvm use 18 && npm run start'

echo "✅ Both services started!"
echo "Backend: tmux attach -t backend"
echo "Frontend: tmux attach -t frontend"

