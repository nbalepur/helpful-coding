import os
import openai
from typing import List, Dict, Any, Callable, Awaitable
from strategies.base import BaseStrategy

class ChatModel:
    """
    Chat model abstraction that handles AI interactions.
    Provides a simple interface for streaming responses.
    """
    
    def __init__(self, strategy: BaseStrategy = None):
        """
        Initialize the chat model.
        
        Args:
            strategy: The AI strategy to use (defaults to Autocomplete strategy)
        """
        self.strategy = strategy or self._create_default_strategy()
    
    def _create_default_strategy(self) -> BaseStrategy:
        """
        Create the default autocomplete strategy.
        
        Returns:
            Autocomplete strategy instance
        """
        from strategies.autocomplete_strategy import AutocompleteStrategy
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY environment variable is required. "
                "Please create a .env file in the backend directory with: OPENAI_API_KEY=your_key_here"
            )
        return AutocompleteStrategy(api_key)
    
    async def stream_response(
        self,
        messages: List[Dict[str, str]],
        model: str = "gpt-4",
        max_tokens: int = 1000,
        on_chunk: Callable[[str], Awaitable[None]] = None,
        on_complete: Callable[[str], Awaitable[None]] = None,
        on_error: Callable[[str], Awaitable[None]] = None,
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
            **kwargs: Additional model-specific parameters
            
        Returns:
            The complete response text
        """
        return await self.strategy.stream_response(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
            on_chunk=on_chunk,
            on_complete=on_complete,
            on_error=on_error,
            **kwargs
        )
    
    def set_strategy(self, strategy: BaseStrategy):
        """
        Set a new strategy for the chat model.
        
        Args:
            strategy: The new strategy to use
        """
        self.strategy = strategy
    
    def get_available_models(self) -> List[str]:
        """
        Get list of available models for the current strategy.
        
        Returns:
            List of model names
        """
        if hasattr(self.strategy, 'get_available_models'):
            return self.strategy.get_available_models()
        return ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"]  # Default OpenAI models
