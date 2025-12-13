# Deployment Workflow

## Current Situation
- ✅ **Solution implemented**: Next.js API proxy for HTTP requests
- ✅ **Auto-detection**: Works automatically in production
- ⚠️ **WebSockets**: Still need configuration (see PRODUCTION_SETUP.md)

## Step-by-Step Workflow

### Step 1: Test Locally First (Development Mode)

The changes should **NOT affect your local development** - it will still use direct connection to `127.0.0.1:4828`.

1. **Start your services locally:**
   ```bash
   ./scripts/start-all.sh
   # OR separately:
   ./scripts/start-backend.sh
   ./scripts/start-frontend.sh
   ```

2. **Verify it still works:**
   - Open http://localhost:4827
   - Test that backend API calls work (they should use `http://127.0.0.1:4828` directly)
   - Check browser console - no errors

3. **Optional: Test proxy mode locally:**
   ```bash
   # In interface directory, set environment variable
   cd interface
   NEXT_PUBLIC_USE_PROXY=true npm run dev
   ```
   - This forces proxy mode even locally
   - Should still work (proxy connects to `127.0.0.1:4828`)

### Step 2: Commit and Push

```bash
# Check what changed
git status

# Review the changes
git diff

# Stage the new files
git add interface/app/api/backend-proxy/
git add interface/app/config/env.ts
git add PRODUCTION_SETUP.md
git add DEPLOYMENT_WORKFLOW.md

# Commit
git commit -m "Add Next.js API proxy for production backend access

- Created /api/backend-proxy route to proxy HTTP requests
- Updated env.ts to auto-detect production and use proxy
- Added PRODUCTION_SETUP.md with all solution options
- HTTP requests now work in production via proxy
- WebSockets still need nginx or exposed port"

# Push to your repository
git push
```

### Step 3: Deploy to Production Server

On your production server (`vibe-code.umiacs.umd.edu`):

1. **SSH into the server:**
   ```bash
   ssh your-user@vibe-code.umiacs.umd.edu
   ```

2. **Pull the latest changes:**
   ```bash
   cd /srv/www/vibejam/helpful-coding
   git pull
   ```

3. **Build the frontend** (if needed, or it will build on start):
   ```bash
   cd /srv/www/vibejam/helpful-coding/interface
   source ~/.nvm/nvm.sh
   nvm use 18
   npm run build
   ```

4. **Restart the frontend** (backend can stay running):
   ```bash
   # Kill existing frontend tmux session
   tmux kill-session -t frontend
   
   # Start frontend in tmux (this runs in production mode, so proxy will auto-activate)
   tmux new-session -d -s frontend 'cd /srv/www/vibejam/helpful-coding/interface && source ~/.nvm/nvm.sh && nvm use 18 && npm run start'
   ```

   **Note:** `npm run start` runs with `NODE_ENV=production`, so the proxy will automatically activate.

5. **Verify it's working:**
   - Open https://vibe-code.umiacs.umd.edu in browser
   - Check browser console (F12) - should see API calls going to `/api/backend-proxy/api/*`
   - Test a feature that uses backend API (e.g., agent chat, code execution)
   - Check backend logs: `tmux attach -t backend` to confirm requests are reaching it

### Step 4: Configure WebSockets (If Needed)

If your app uses WebSockets, you'll need to set up one of these:

**Option A: Set environment variable** (if port 4828 is publicly accessible):
```bash
# On production server, in interface/.env.local or interface/.env
NEXT_PUBLIC_BACKEND_WS_URL=wss://vibe-code.umiacs.umd.edu:4828
```

**Option B: Use nginx reverse proxy** (recommended - see PRODUCTION_SETUP.md):
- Set up nginx to proxy `/backend-ws/` to `127.0.0.1:4828`
- Set `NEXT_PUBLIC_BACKEND_WS_URL=wss://vibe-code.umiacs.umd.edu/backend-ws`

**Option C: Disable WebSockets** (if not critical):
- Your app will fall back to HTTP polling or REST endpoints

## Quick Verification Checklist

After deployment, verify:

- [ ] Frontend loads at https://vibe-code.umiacs.umd.edu
- [ ] Browser console shows no CORS errors
- [ ] API calls work (check Network tab - should see `/api/backend-proxy/api/*`)
- [ ] Backend receives requests (check backend logs)
- [ ] WebSockets work (if applicable)

## Troubleshooting

### HTTP requests fail in production

1. **Check proxy route is accessible:**
   ```bash
   curl https://vibe-code.umiacs.umd.edu/api/backend-proxy/api/health
   ```

2. **Check backend is running:**
   ```bash
   curl http://127.0.0.1:4828/health
   ```

3. **Check environment:**
   - `NODE_ENV` should be `production` when running `npm run build`
   - Backend should be accessible at `127.0.0.1:4828` from the server

### WebSockets don't work

- See PRODUCTION_SETUP.md for WebSocket solutions
- WebSockets cannot go through Next.js API routes
- Need nginx reverse proxy or exposed port

## Summary

✅ **What works automatically:**
- HTTP API requests (GET, POST, PUT, DELETE, etc.)
- Works in production without any additional config

⚠️ **What needs configuration:**
- WebSocket connections (see PRODUCTION_SETUP.md)

✅ **Local development:**
- No changes needed
- Still uses direct connection to `127.0.0.1:4828`

