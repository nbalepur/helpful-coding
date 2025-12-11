# AI Coding Assistant Backend

A lightweight Python backend using FastAPI and WebSockets for streaming AI responses.

## Features

- **FastAPI**: High-performance async web framework
- **WebSocket Streaming**: Real-time token-by-token AI responses
- **Strategy Pattern**: Easy to swap AI providers (OpenAI, Claude, etc.)
- **CORS Support**: Ready for frontend integration
- **Error Handling**: Robust error handling and logging
- **Python Code Execution**: Execute user Python code via OneCompiler API or local exec()
  - **Production Mode**: Secure remote execution via OneCompiler API (requires RapidAPI key)
  - **Development Mode**: Local execution using Python exec() (unsafe, for development only)

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Create environment file:**
   ```bash
   # Create a .env file in the backend directory
   cp .env.template .env
   # Edit .env and add your OpenAI API key
   ```

   Or create `.env` manually:
   ```bash
   # Create backend/.env file with:
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Optional: RapidAPI key for OneCompiler (production)
   RAPIDAPI_KEY=your_rapidapi_key_here
   
   # Execution mode (True for local dev, False for production)
   USE_LOCAL_EXECUTION=True
   ```

3. **Configure Execution Mode:**
   
   **For Local Development (Default):**
   - Set `USE_LOCAL_EXECUTION=True` in `.env`
   - Uses Python `exec()` to run code locally
   - ⚠️ **WARNING**: This is UNSAFE and should only be used for development
   - No RapidAPI key needed
   
   **For Production:**
   - Set `USE_LOCAL_EXECUTION=False` in `.env`
   - Get a RapidAPI key from [OneCompiler API](https://rapidapi.com/onecompiler/api/onecompiler-apis)
   - Add `RAPIDAPI_KEY=your_key` to `.env`
   - Uses secure remote execution via OneCompiler API

4. **Run the server:**
   ```bash
   python main.py
   ```

   Or with uvicorn directly:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 4828 --reload
   ```

## API Endpoints

### General
- `GET /` - Health check
- `GET /health` - Detailed health status

### Chat
- `WebSocket /ws/chat` - Streaming chat endpoint
- `POST /api/chat` - REST API chat endpoint (non-streaming)

### Python Code Execution
- `POST /api/execute-endpoint` - Execute Python code with @endpoint decorators
- `POST /api/execute-test-cases` - Execute test cases against backend code
- `POST /api/validate-python` - Validate Python code syntax

### Task Management
- `GET /tasks/{task_name}` - Get task data with files and tests
- `POST /api/load-test-cases` - Load test cases from task data

### LLM Judge
- `POST /api/llm-judge` - Use GPT-4 Vision to judge screenshot against test criteria

### Python Server Management (deprecated)
- `POST /api/start-python-server` - Start Python Flask server as subprocess
- `POST /api/stop-python-server` - Stop Python Flask server subprocess
- `GET /api/list-python-servers` - List active Python server processes

## WebSocket Protocol

### Client → Server
```json
{
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "model": "gpt-4",
  "max_tokens": 1000,
  "proactive": false,
  "current_code": ""
}
```

### Server → Client
```json
// Chunk (streaming)
{"type": "chunk", "content": "Hello"}

// Complete
{"type": "complete", "content": "Hello! How can I help you?"}

// Error
{"type": "error", "content": "Error message"}
```

## Architecture

- **`main.py`**: FastAPI app with WebSocket endpoint
- **`models/chat.py`**: Chat model abstraction
- **`strategies/base.py`**: Base strategy interface
- **`strategies/openai_strategy.py`**: OpenAI implementation

## Adding New Strategies

1. Create a new strategy class inheriting from `BaseStrategy`
2. Implement the `stream_response` method
3. Add it to the chat model

Example:
```python
class ClaudeStrategy(BaseStrategy):
    async def stream_response(self, messages, **kwargs):
        # Implement Claude streaming logic
        pass
```
