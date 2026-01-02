tmux kill-session -t helpful-coding-frontend
tmux kill-session -t helpful-coding-backend
tmux new-session -d -s helpful-coding-frontend 'cd /srv/www/vibejam/helpful-coding/interface && source ~/.nvm/nvm.sh && nvm use 18 && npm install && npm run build && npm run start'
tmux new-session -d -s helpful-coding-backend 'cd /srv/www/vibejam/helpful-coding/backend && source /fs/clip-quiz/nbalepur/anaconda3/etc/profile.d/conda.sh && conda activate helpful-coding && pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 4828 --workers 4 --log-level info'