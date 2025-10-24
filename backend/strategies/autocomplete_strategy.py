import openai
from typing import List, Dict, Any, Callable, Awaitable
from .base import BaseStrategy
from pydantic import BaseModel

class AutocompleteStrategy(BaseStrategy):
    """
    Autocomplete strategy implementation.
    Uses a single system prompt approach with structured response format.
    Generates both code and explanation, then streams the explanation.
    """
    
    SYSTEM_PROMPT = """You are a helpful programming assistant that generates Python code completions and explanations.

You will receive a conversation history and should respond with a structured JSON format containing both code and explanation.

RESPONSE FORMAT:
You must respond with a JSON object containing exactly these two keys:
{
  "code": "the complete Python code here",
  "explanation": "extra response related to the code"
}

CRITICAL REQUIREMENTS FOR CODE:
- Generate complete, working Python code (functions, classes, variables, etc.)
- If the user wants to modify existing code, provide the complete updated code
- If the user wants to add to existing code, provide the complete code with additions
- If the user wants new code, provide the new code
- Focus on vanilla Python and numpy (no external packages)
- Make code that is actually useful and solves real problems
- The code should be ready to use without modification
- If code is already present, modify as little as possible. Only modify the parts necessary to address the user's request
- NO markdown formatting in the code field (no ```python or ```)
- NO explanatory text in the code field

CRITICAL REQUIREMENTS FOR EXPLANATION:
- Add a friendly explanation to directly address the user. It should be concise and explain what you did.

IMPORTANT:
- If you cannot fulfill the request, respond with: set "code" to empty string and "explanation" to a message acknowledging the request, but end it with a statement indicating that you are meant to help the user code.
- Always provide both code and explanation fields, even if the code is empty
- The JSON must be valid and parseable

Only respond with JSON, do not add anything else.
"""
    
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
        model: str = "gpt-4o",
        max_tokens: int = 1000,
        on_chunk: Callable[[str], Awaitable[None]] = None,
        on_complete: Callable[[str], Awaitable[None]] = None,
        on_error: Callable[[str], Awaitable[None]] = None,
        on_code_ready: Callable[[str], Awaitable[None]] = None,
        response_format: Dict[str, Any] = None,
        current_code: str = "",
        **kwargs
    ) -> str:
        """
        Single-step autocomplete process: generate both code and explanation in structured format.
        Shows "AI thinking..." until both are ready, then streams explanation.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: Model name to use
            max_tokens: Maximum tokens to generate
            on_chunk: Callback for each chunk of response
            on_complete: Callback when streaming is complete
            on_error: Callback for errors
            on_code_ready: Callback when code is ready
            response_format: Structured output format
            current_code: Current code in the editor for context
            **kwargs: Additional model-specific parameters
            
        Returns:
            The complete explanation text
        """
        if not self.validate_messages(messages):
            error_msg = "Invalid message format"
            await self.safe_callback(on_error, error_msg)
            raise ValueError(error_msg)
        
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                # Don't send any text initially - let frontend show thinking indicator
                
                # Prepare messages with system prompt and current code context
                system_message = {"role": "system", "content": self.SYSTEM_PROMPT}
                
                # Add current code context to the last user message if available
                enhanced_messages = messages.copy()
                if current_code and enhanced_messages:
                    last_message = enhanced_messages[-1]
                    if last_message.get("role") == "user":
                        # Add current code context to the user's message
                        enhanced_messages[-1] = {
                            "role": "user",
                            "content": f"Current code:\n```python\n{current_code}\n```\n\nUser request: {last_message.get('content', '')}"
                        }
                
                full_messages = [system_message] + enhanced_messages
                
                # Prepare request parameters
                request_params = {
                    "model": model,
                    "messages": full_messages,
                    "max_tokens": max_tokens,
                    "stream": False,
                    **kwargs
                }

                class AutocompleteResponse(BaseModel):
                    code: str
                    explanation: str
                
                # Use provided response_format or default structured output
                request_params["response_format"] = response_format
                
                # Generate structured response
                response = await self.client.chat.completions.create(**request_params)
                
                import json
                response_content = response.choices[0].message.content.strip()
                parsed_data = json.loads(response_content)
                
                # Validate with Pydantic model
                validated_response = AutocompleteResponse(**parsed_data)
                generated_code = validated_response.code.strip()
                explanation = validated_response.explanation.strip()
                
                # Store the generated code
                self._last_generated_code = generated_code
                
                # Only send the generated code if it's not empty
                if generated_code.strip():
                    await self.safe_callback(on_code_ready, generated_code)

                print(generated_code)
                
                # Now stream the explanation (fake streaming by chunking it)
                await self._fake_stream_explanation(explanation, on_chunk, on_complete)
                
                return explanation
                
            except Exception as e:
                retry_count += 1
                error_msg = str(e)
                print(f"Attempt {retry_count} failed: {error_msg}")

                print(response)
                
                if retry_count >= max_retries:
                    # Final attempt failed, send error
                    await self.safe_callback(on_error, f"Failed after {max_retries} attempts: {error_msg}")
                    raise e
                else:
                    pass

    
    async def _fake_stream_explanation(self, explanation: str, on_chunk: Callable[[str], Awaitable[None]], on_complete: Callable[[str], Awaitable[None]]):
        """
        Fake stream the explanation by chunking it into smaller pieces.
        
        Args:
            explanation: The complete explanation text
            on_chunk: Callback for each chunk
            on_complete: Callback when complete
        """
        import asyncio
        
        # Clear the thinking text and start streaming the explanation
        await self.safe_callback(on_chunk, "")  # Clear the thinking text
        
        # Split explanation into words for more natural streaming
        words = explanation.split()
        chunk_size = 1  # Stream 1 word at a time
        
        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i + chunk_size]
            chunk_text = " ".join(chunk_words)
            
            if i + chunk_size < len(words):
                chunk_text += " "
            
            await self.safe_callback(on_chunk, chunk_text)
            await asyncio.sleep(0.05)  # Small delay to simulate streaming
        
        # Call completion callback
        await self.safe_callback(on_complete, explanation)
    
    def _clean_generated_code(self, code: str) -> str:
        """
        Clean up generated code to ensure it contains only pure function code.
        
        Args:
            code: Raw generated code that may contain unwanted text
            
        Returns:
            Clean function code without explanatory text or markdown
        """
        if not code:
            return ""
            
        # Remove markdown code blocks
        if '```' in code:
            lines = code.split('\n')
            cleaned_lines = []
            in_code_block = False
            
            for line in lines:
                if line.strip().startswith('```'):
                    in_code_block = not in_code_block
                    continue
                if in_code_block:
                    cleaned_lines.append(line)
            
            code = '\n'.join(cleaned_lines)

        return code.strip()
    
    def get_last_generated_code(self) -> str:
        """
        Get the code that was generated in the last autocomplete request.
        
        Returns:
            The generated function code
        """
        return getattr(self, '_last_generated_code', '')
    
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
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k"
        ]
