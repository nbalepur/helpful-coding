from abc import ABC, abstractmethod
from typing import List, Dict, Any, Callable, Awaitable
import asyncio

class BaseStrategy(ABC):
    """
    Base class for all AI strategy implementations.
    Provides a common interface for streaming AI responses.
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key
    
    
    @abstractmethod
    async def stream_response(
        self,
        messages: List[Dict[str, str]],
        model: str = "gpt-4",
        max_tokens: int = 1000,
        on_chunk: Callable[[str], Awaitable[None]] = None,
        on_complete: Callable[[str], Awaitable[None]] = None,
        on_error: Callable[[str], Awaitable[None]] = None,
        response_format: Dict[str, Any] = None,
        current_code: str = "",
        **kwargs
    ) -> str:
        """
        Stream a response from the AI model.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: Model name to use
            max_tokens: Maximum tokens to generate
            on_chunk: Callback for each chunk of response
            on_complete: Callback when streaming is complete
            on_error: Callback for errors
            response_format: Structured output format (implementation-specific)
            current_code: Current code in the editor for context
            **kwargs: Additional model-specific parameters
            
        Returns:
            The complete response text
        """
        pass
    
    def validate_messages(self, messages: List[Dict[str, str]]) -> bool:
        """
        Validate that messages have the correct format.
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            True if valid, False otherwise
        """
        if not isinstance(messages, list):
            return False
        
        for message in messages:
            if not isinstance(message, dict):
                return False
            if "role" not in message or "content" not in message:
                return False
            if message["role"] not in ["system", "user", "assistant"]:
                return False
        
        return True
    
    async def is_code_related_request(self, user_query: str, chat_history: List[Dict[str, str]] = None) -> bool:
        """
        Use LLM to check if the user request is code-related and specific enough.
        
        Args:
            user_query: The user's request text (deprecated - will extract from chat_history)
            chat_history: Previous chat messages for context
            
        Returns:
            True if the request is code-related and specific, False otherwise
        """
        # Extract the last user query from chat history
        last_user_query = ""
        if chat_history:
            for message in reversed(chat_history):
                if message.get("role") == "user":
                    content = message.get("content", "")
                    # Check if this is a proactive message with code context
                    if "Code:\n" in content and "Message:\n" in content:
                        parts = content.split("Message:\n")
                        if len(parts) == 2:
                            last_user_query = parts[1].strip()
                    else:
                        last_user_query = content
                    break
        
        # Fallback to the passed user_query if no chat history
        if not last_user_query:
            last_user_query = user_query
        
        if not last_user_query or not last_user_query.strip():
            return False
        
        # Simple validation prompt for the LLM
        validation_prompt = f"""You are a helpful assistant that determines if a user request is related to programming/coding tasks.

User request: "{last_user_query}"

Determine if this request is:
1. Clearly code/programming related (functions, debugging, algorithms, etc.). This includes ambiguous requests that could be code-related given context or requests that could be a follow-up from a previous code-related request
3. Clearly NOT code-related (greetings, general questions, non-programming tasks)

Respond with ONLY one word:
- "YES" if the request is code-related or could reasonably be interpreted as such
- "NO" if the request is clearly not code-related

Examples:
- "create a function to sort a list" → YES
- "help me debug this error" → YES  
- "hello" → NO
- "what's the weather" → NO
- "add more details" -> YES (follow-up from a previous code-related request)
- "help me" → NO (too ambiguous without context)
- "help me with this function" → YES (has code context)"""

        try:
            return True
            
        except Exception as e:
            print(f"Error in code validation: {e}")
            # Fallback: if LLM fails, assume it's code-related to avoid blocking legitimate requests
            return True
    
    def _format_chat_history(self, chat_history: List[Dict[str, str]]) -> str:
        """Format chat history for the validation prompt."""
        if not chat_history:
            return "No previous context"
        
        formatted = []
        for msg in chat_history[-3:]:  # Only use last 3 messages for context
            role = msg.get("role", "unknown")
            content = msg.get("content", "")[:200]  # Limit content length
            formatted.append(f"{role}: {content}")
        
        return "\n".join(formatted)
    
    async def safe_callback(self, callback: Callable, *args, **kwargs):
        """
        Safely execute a callback, catching and logging any errors.
        
        Args:
            callback: The callback function to execute
            *args: Arguments to pass to callback
            **kwargs: Keyword arguments to pass to callback
        """
        if callback:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(*args, **kwargs)
                else:
                    callback(*args, **kwargs)
            except Exception as e:
                print(f"Callback error: {e}")
