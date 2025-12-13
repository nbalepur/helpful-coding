# Production Setup Guide

## Problem
In production, port 4827 routes to the public URL (`vibe-code.umiacs.umd.edu`), but the backend on port 4828 is not publicly accessible. The frontend (running in the browser) cannot directly connect to `127.0.0.1:4828` on the server.

## Solutions

### Solution 1: Next.js API Proxy (Recommended for HTTP requests)

This solution uses Next.js API routes to proxy HTTP requests from the browser to the backend server. This is already implemented and will work automatically in production.

**How it works:**
- Frontend requests go to `/api/backend-proxy/api/*`
- Next.js server (which can access `127.0.0.1:4828`) proxies them to the backend
- Responses are forwarded back to the browser

**Setup:**
1. No additional setup needed - it works automatically when `NODE_ENV=production`
2. Or set `NEXT_PUBLIC_USE_PROXY=true` to force proxy mode
3. Set `BACKEND_INTERNAL_URL=http://127.0.0.1:4828` (optional, defaults to this)

**Limitations:**
- ✅ Works for all HTTP requests (GET, POST, PUT, DELETE, etc.)
- ❌ Does NOT work for WebSockets (see Solution 2 for WebSockets)

---

### Solution 2: Nginx Reverse Proxy (Recommended for WebSockets)

For WebSocket support, you'll need a reverse proxy (nginx or Apache) to route requests from the public domain to the backend.

#### Nginx Configuration

Add this to your nginx configuration (usually `/etc/nginx/sites-available/vibe-code`):

```nginx
server {
    listen 4827;
    server_name vibe-code.umiacs.umd.edu;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:4827;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API proxy
    location /backend-api/ {
        rewrite ^/backend-api/(.*) /api/$1 break;
        proxy_pass http://127.0.0.1:4828;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket proxy (for backend WebSocket connections)
    location /backend-ws/ {
        rewrite ^/backend-ws/(.*) /ws/$1 break;
        proxy_pass http://127.0.0.1:4828;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

Then update your environment variables:

```bash
# For HTTP requests, use the nginx proxy path
NEXT_PUBLIC_BACKEND_URL=https://vibe-code.umiacs.umd.edu/backend-api

# For WebSocket requests, use the nginx WebSocket proxy path
NEXT_PUBLIC_BACKEND_WS_URL=wss://vibe-code.umiacs.umd.edu/backend-ws
```

---

### Solution 3: Expose Backend Port Publicly (Not Recommended)

If your infrastructure allows, you can expose port 4828 publicly. However, this requires:
1. Firewall configuration to allow port 4828
2. Domain routing to map a subdomain or path to port 4828
3. Proper security (HTTPS, authentication, rate limiting, etc.)

**Setup:**
1. Configure your router/firewall to forward port 4828
2. Update DNS to point `api.vibe-code.umiacs.umd.edu` to your server
3. Set environment variables:
   ```bash
   NEXT_PUBLIC_BACKEND_URL=https://api.vibe-code.umiacs.umd.edu
   NEXT_PUBLIC_BACKEND_WS_URL=wss://api.vibe-code.umiacs.umd.edu
   ```

⚠️ **Security Warning**: Exposing the backend directly requires proper security measures (HTTPS, authentication, CORS, rate limiting, etc.)

---

### Solution 4: Hybrid Approach (Recommended)

Use Solution 1 (Next.js proxy) for HTTP requests and Solution 2 (nginx) for WebSockets:

**Setup:**
1. Keep the Next.js proxy for HTTP requests (automatic)
2. Set up nginx to proxy only WebSocket connections:
   ```nginx
   location /backend-ws/ {
       rewrite ^/backend-ws/(.*) /ws/$1 break;
       proxy_pass http://127.0.0.1:4828;
       # ... (same config as Solution 2)
   }
   ```
3. Set environment variable for WebSockets only:
   ```bash
   NEXT_PUBLIC_BACKEND_WS_URL=wss://vibe-code.umiacs.umd.edu/backend-ws
   ```

This gives you:
- ✅ HTTP requests proxied through Next.js (simpler, no nginx config needed)
- ✅ WebSocket connections proxied through nginx (required for WebSocket support)

---

## Testing

1. **Test HTTP proxy:**
   ```bash
   curl https://vibe-code.umiacs.umd.edu/api/backend-proxy/api/health
   ```

2. **Test WebSocket (if using nginx):**
   ```bash
   wscat -c wss://vibe-code.umiacs.umd.edu/backend-ws/chat
   ```

3. **Check backend logs** to verify requests are reaching it

---

## Environment Variables Summary

| Variable | Description | Default | Example (Production) |
|----------|-------------|---------|---------------------|
| `NEXT_PUBLIC_BACKEND_URL` | Backend HTTP URL | `http://127.0.0.1:4828` | `/api/backend-proxy/api` (proxy) or `https://vibe-code.umiacs.umd.edu/backend-api` (nginx) |
| `NEXT_PUBLIC_BACKEND_WS_URL` | Backend WebSocket URL | `ws://127.0.0.1:4828` | `wss://vibe-code.umiacs.umd.edu/backend-ws` |
| `BACKEND_INTERNAL_URL` | Internal backend URL (server-side only) | `http://127.0.0.1:4828` | `http://127.0.0.1:4828` |
| `NEXT_PUBLIC_USE_PROXY` | Force proxy mode | `false` | `true` |

---

## Quick Start (Recommended Setup)

1. **For HTTP requests**: The Next.js proxy works automatically. No setup needed.

2. **For WebSockets**: Set up nginx (Solution 2) or use environment variable:
   ```bash
   NEXT_PUBLIC_BACKEND_WS_URL=wss://vibe-code.umiacs.umd.edu:4828
   ```
   (This requires port 4828 to be publicly accessible with SSL)

3. **Restart your services** after configuration changes.

