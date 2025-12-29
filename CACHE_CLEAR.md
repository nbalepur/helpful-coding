# How to Clear Cache

This document explains how to clear various caches in the application.

## Types of Cache

1. **Backend Python LRU Cache** - Caches `tasks.json` metadata
2. **Browser Cache** - Caches assets, API responses, and static files
3. **Next.js Cache** - Caches API routes and static files

## Clearing Backend Python LRU Cache

The backend uses `@lru_cache` to cache task metadata. To clear it:

### Option 1: Restart the Backend Server
Simply restart the backend server to clear the Python LRU cache:
```bash
# Stop the backend (Ctrl+C) and restart it
python backend/main.py
# or
./scripts/restart.sh
```

### Option 2: Add a Cache Clear Endpoint (Development Only)
You can add this endpoint to clear the cache programmatically:

```python
@app.post("/api/clear-cache")
async def clear_cache():
    _load_dummy_task_metadata.cache_clear()
    return {"message": "Cache cleared"}
```

## Clearing Browser Cache

### Chrome/Edge:
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"
4. Or use: `Ctrl+Shift+Delete` → Clear browsing data → Cached images and files

### Firefox:
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"
4. Or use: `Ctrl+Shift+Delete` → Clear browsing data → Cache

### Safari:
1. Open DevTools (Cmd+Option+I)
2. Right-click the refresh button
3. Select "Empty Caches"
4. Or use: `Cmd+Option+E` to empty caches

### Hard Refresh (All Browsers):
- **Windows/Linux**: `Ctrl+Shift+R` or `Ctrl+F5`
- **Mac**: `Cmd+Shift+R`

## Clearing Next.js Cache

Next.js caches API routes and static files. To clear:

1. **Delete `.next` folder**:
   ```bash
   rm -rf interface/.next
   ```

2. **Restart the Next.js dev server**:
   ```bash
   cd interface
   npm run dev
   ```

## Clearing All Caches at Once

For a complete cache clear:

```bash
# 1. Stop all servers
./scripts/stop-all.sh

# 2. Clear Next.js cache
rm -rf interface/.next

# 3. Clear browser cache (use browser settings)

# 4. Restart servers
./scripts/start-all.sh
```

## Development Tips

- Use **Incognito/Private mode** to test without cache
- Use **Network tab** in DevTools to verify cache headers
- Check that responses have `Cache-Control: no-cache, no-store, must-revalidate` headers

## Verifying Cache Headers

Check that API responses include these headers:
- `Cache-Control: no-cache, no-store, must-revalidate`
- `Pragma: no-cache`
- `Expires: 0`

You can verify in:
- Browser DevTools → Network tab → Headers
- Or use `curl -I http://localhost:4828/api/tasks-db`

