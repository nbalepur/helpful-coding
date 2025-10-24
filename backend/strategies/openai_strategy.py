import openai
from typing import List, Dict, Any, Callable, Awaitable
from .base import BaseStrategy

class AutocompleteStrategy(BaseStrategy):
    """
    Autocomplete strategy implementation.
    Generates structured JSON responses with function code and explanations.
    """
    
    SYSTEM_PROMPT = """You are a helpful programming assistant that generates code completions and explanations.

You must respond with valid JSON in the following format:
{
  "function": "the complete function code here",
  "explanation": "clear explanation of what this function does and why it's useful"
}

Guidelines:
- Generate complete, working Python functions
- Focus on vanilla Python and numpy (no external packages)
- Make functions that are actually useful and solve real problems
- Provide clear, concise explanations
- Ensure the JSON is valid and properly formatted
- The function should be ready to use without modification"""
    
    def __init__(self, api_key: str):
        """
        Initialize OpenAI strategy.
        
        Args:
            api_key: OpenAI API key
        """
        super().__init__(api_key)
        self.client = openai.AsyncOpenAI(api_key=api_key)
    
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
        Stream a response from OpenAI's chat completion API.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: Model name to use
            max_tokens: Maximum tokens to generate
            on_chunk: Callback for each chunk of response
            on_complete: Callback when streaming is complete
            on_error: Callback for errors
            response_format: OpenAI structured output format (e.g., {"type": "json_object"})
            current_code: Current code in the editor for context
            **kwargs: Additional model-specific parameters
            
        Returns:
            The complete response text
        """
        if not self.validate_messages(messages):
            error_msg = "Invalid message format"
            await self.safe_callback(on_error, error_msg)
            raise ValueError(error_msg)
        
        # Add system prompt to messages
        messages_with_system = [{"role": "system", "content": self.SYSTEM_PROMPT}] + messages
        
        try:
            # Prepare request parameters
            request_params = {
                "model": model,
                "messages": messages_with_system,
                "max_tokens": max_tokens,
                "stream": True,
                **kwargs
            }
            
            # Add response_format if provided
            if response_format:
                request_params["response_format"] = response_format
            
            # Create streaming request
            stream = await self.client.chat.completions.create(**request_params)
            
            full_response = ""
            
            # Process streaming chunks
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    await self.safe_callback(on_chunk, content)
            
            # Call completion callback
            await self.safe_callback(on_complete, full_response)
            
            return full_response
            
        except Exception as e:
            error_msg = str(e)
            await self.safe_callback(on_error, error_msg)
            raise e
    
    def get_available_models(self) -> List[str]:
        """
        Get list of available OpenAI models.
        
        Returns:
            List of OpenAI model names
        """
        return [
            "gpt-4",
            "gpt-4-turbo",
            "gpt-4-turbo-preview",
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k"
        ]
    
    @staticmethod
    def create_json_response_format() -> Dict[str, Any]:
        """
        Create a response format for JSON structured output.
        
        Returns:
            Dictionary with response_format for JSON output
        """
        return {"type": "json_object"}
    
    @staticmethod
    def create_json_schema_response_format(schema: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a response format for JSON schema structured output.
        
        Args:
            schema: JSON schema defining the expected output structure
            
        Returns:
            Dictionary with response_format for JSON schema output
        """
        return {
            "type": "json_schema",
            "json_schema": {
                "name": "response_schema",
                "schema": schema,
                "strict": True
            }
        }
