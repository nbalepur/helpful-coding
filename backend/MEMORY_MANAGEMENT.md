# Memory Management for Aider Instances

## Overview

The backend stores Aider Coder instances in memory to maintain conversation history. This document describes the memory management strategies implemented to prevent unbounded memory growth.

## Implemented Strategies

### 1. **One Instance Per User** ✅
- **What**: Ensures each user only has one active Aider instance at a time
- **How**: Automatically cleans up any duplicate instances when a user creates/uses a new one
- **Impact**: Prevents memory bloat from users having multiple concurrent sessions

### 2. **Message History Limiting** ✅
- **What**: Limits the `CapturingIO.messages` list to prevent unbounded growth
- **How**: Automatically truncates to keep only the most recent messages
- **Config**: `AIDER_MAX_IO_MESSAGES` (default: 1000 messages)
- **Impact**: Prevents each instance from accumulating unlimited message history

### 3. **Time-Based Eviction** ✅
- **What**: Automatically removes instances that haven't been used recently
- **How**: Tracks `last_used` timestamp and evicts instances after idle timeout
- **Config**: `AIDER_IDLE_TIMEOUT` (default: 1800 seconds = 30 minutes)
- **Impact**: Frees memory from inactive user sessions

### 4. **LRU Eviction** ✅
- **What**: Removes least recently used instances when hitting max limit
- **How**: When creating a new instance and at max capacity, evicts the oldest
- **Config**: `AIDER_MAX_INSTANCES` (default: 100 instances)
- **Impact**: Prevents memory from growing beyond a hard limit

### 5. **Monitoring Endpoints** ✅
- **What**: API endpoints to monitor and manually trigger cleanup
- **Endpoints**:
  - `GET /api/agent-instances/stats` - View instance statistics
  - `POST /api/agent-instances/cleanup` - Manually trigger cleanup

## Configuration

Set these environment variables in your `.env` file:

```bash
# Maximum number of Coder instances to keep in memory
AIDER_MAX_INSTANCES=100

# Idle timeout in seconds (instances unused for this long are evicted)
AIDER_IDLE_TIMEOUT=1800  # 30 minutes

# Maximum IO messages to keep per instance
AIDER_MAX_IO_MESSAGES=1000
```

## How It Works

1. **On Instance Creation/Reuse**:
   - Updates `last_used` timestamp
   - Checks if at max capacity → evicts LRU if needed
   - Periodically evicts inactive instances

2. **On Message Recording**:
   - `CapturingIO` automatically limits message list size
   - Keeps only most recent messages

3. **Manual Cleanup**:
   - Call `POST /api/agent-instances/cleanup` to force cleanup
   - Useful for monitoring or scheduled tasks

## Monitoring

### Check Instance Statistics

```bash
curl http://localhost:4828/api/agent-instances/stats
```

Response:
```json
{
  "total_instances": 45,
  "max_instances": 100,
  "idle_timeout_seconds": 1800,
  "total_io_messages": 1234,
  "unique_users": 45,
  "users_with_multiple_instances": {},
  "instances": [
    {
      "temp_dir": "/path/to/tmp/1/aider_abc123",
      "user_id": 1,
      "last_used_seconds_ago": 3600,
      "io_message_count": 50
    },
    ...
  ]
}
```

Note: `users_with_multiple_instances` should be empty `{}` if the one-instance-per-user enforcement is working correctly. If you see entries here, it indicates a bug.

### Manual Cleanup

```bash
curl -X POST http://localhost:4828/api/agent-instances/cleanup
```

## Expected Memory Usage

With default settings:
- **100 active users** = **100 instances** (one per user) × ~5-10MB each = **500MB - 1GB**
- Each user gets exactly one instance (duplicates are automatically cleaned up)
- Each instance maintains conversation history (limited to 1000 messages)
- Idle instances are automatically cleaned up after 30 minutes

## Periodic Cleanup (Optional)

For production, you can set up a cron job or scheduled task to periodically call the cleanup endpoint:

```bash
# Add to crontab (runs every 15 minutes)
*/15 * * * * curl -X POST http://localhost:4828/api/agent-instances/cleanup > /dev/null 2>&1
```

Or use a Python script with `schedule` library:

```python
import schedule
import time
import requests

def cleanup_instances():
    try:
        response = requests.post("http://localhost:4828/api/agent-instances/cleanup")
        print(f"Cleanup: {response.json()}")
    except Exception as e:
        print(f"Cleanup failed: {e}")

schedule.every(15).minutes.do(cleanup_instances)

while True:
    schedule.run_pending()
    time.sleep(60)
```

## Tuning Recommendations

### For Low Memory Servers (< 2GB RAM)
```bash
AIDER_MAX_INSTANCES=50
AIDER_IDLE_TIMEOUT=900  # 15 minutes
AIDER_MAX_IO_MESSAGES=500
```

### For High Traffic Servers
```bash
AIDER_MAX_INSTANCES=200
AIDER_IDLE_TIMEOUT=3600  # 1 hour
AIDER_MAX_IO_MESSAGES=2000
```

### For Development
```bash
AIDER_MAX_INSTANCES=10
AIDER_IDLE_TIMEOUT=300  # 5 minutes
AIDER_MAX_IO_MESSAGES=500
```

## Future Improvements

Potential additional strategies:
1. **Stateless Design**: Don't keep instances in memory, reload from disk when needed (slower but more scalable)
2. **Memory-Based Eviction**: Use actual memory usage instead of instance count
3. **User-Based Limits**: Different limits per user tier
4. **Compression**: Compress conversation history for older messages

