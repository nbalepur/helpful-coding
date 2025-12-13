# Quick Deploy Instructions

## What Changed
- Added Next.js API proxy route (`/api/backend-proxy/*`) that forwards requests to backend on `127.0.0.1:4828`
- Frontend will automatically use the proxy when running in production mode (`npm run start`)
- **Port 4827 stays public** - no changes needed there
- **Port 4828 stays internal** - frontend accesses it via proxy

## Deploy Steps

### 1. Commit and Push (from your local machine)

```bash
git commit -m "Add Next.js API proxy for production backend access"
git push
```

### 2. On Production Server

```bash
# SSH to server
ssh your-user@vibe-code.umiacs.umd.edu

# Pull latest code
cd /srv/www/vibejam/helpful-coding
git pull

# Build frontend (if needed - only required if you haven't built yet)
cd interface
source ~/.nvm/nvm.sh
nvm use 18
npm install  # Only if new dependencies were added
npm run build

# Restart frontend (backend can keep running)
tmux kill-session -t frontend
tmux new-session -d -s frontend 'cd /srv/www/vibejam/helpful-coding/interface && source ~/.nvm/nvm.sh && nvm use 18 && npm run start'

# That's it! The proxy will automatically activate because npm run start uses production mode
```

### 3. Verify It Works

1. Open https://vibe-code.umiacs.umd.edu
2. Open browser console (F12)
3. Look for API calls - they should go to `/api/backend-proxy/api/*`
4. Test a feature (e.g., agent chat)
5. Check backend logs: `tmux attach -t backend` - you should see requests coming in

## What Happens

**Before:**
- Browser tries: `http://127.0.0.1:4828/api/...` ❌ (fails - can't access server's localhost)

**After:**
- Browser requests: `/api/backend-proxy/api/...` ✅
- Next.js server receives it (port 4827)
- Next.js forwards to: `http://127.0.0.1:4828/api/...` ✅ (works - server-to-server)
- Response goes back to browser ✅

## Notes

- **No changes to backend** - keep it running on port 4828 as before
- **No nginx changes needed** - everything goes through port 4827
- **WebSockets**: If you use WebSockets, you'll still need to handle them separately (see PRODUCTION_SETUP.md)
- **Local dev**: Still works normally - connects directly to `127.0.0.1:4828`

