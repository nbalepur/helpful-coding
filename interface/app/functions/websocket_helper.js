/**
 * WebSocket helper for connecting to Python backend
 */
import { ENV } from '../config/env';

export class WebSocketChatClient {
  constructor(url = null) {
    // Use centralized environment configuration
    this.url = url || ENV.WS_CHAT_URL;
    this.ws = null;
    this.isConnected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          this.isConnected = true;
          resolve();
        };

        this.ws.onclose = () => {
          this.isConnected = false;
        };

        this.ws.onerror = (error) => {
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  async sendMessage(data) {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const messageId = Date.now().toString();
      
      // Set up message handlers
      const handleMessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          
          switch (response.type) {
            case 'chunk':
              // Handle streaming chunk
              if (this.onChunk) {
                this.onChunk(response.content);
              }
              break;
              
            case 'code_ready':
              // Handle generated code ready for application
              if (this.onCodeReady) {
                this.onCodeReady(response.generated_code);
              }
              break;
              
            case 'complete':
              // Handle completion
              if (this.onComplete) {
                this.onComplete(response.content, response.generated_code);
              }
              this.ws.removeEventListener('message', handleMessage);
              resolve({
                content: response.content,
                generated_code: response.generated_code || ''
              });
              break;
              
            case 'error':
              // Handle error
              if (this.onError) {
                this.onError(response.content);
              }
              this.ws.removeEventListener('message', handleMessage);
              reject(new Error(response.content));
              break;
          }
        } catch (error) {
          reject(error);
        }
      };

      this.ws.addEventListener('message', handleMessage);
      
      // Send the message
      this.ws.send(JSON.stringify(data));
    });
  }

  setCallbacks(onChunk, onComplete, onError, onCodeReady) {
    this.onChunk = onChunk;
    this.onComplete = onComplete;
    this.onError = onError;
    this.onCodeReady = onCodeReady;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}

// Singleton instance
let wsClient = null;

export function getWebSocketClient() {
  if (!wsClient) {
    wsClient = new WebSocketChatClient();
  }
  return wsClient;
}

export async function streamChatResponse(
  messages,
  model = 'gpt-4',
  max_tokens = 1000,
  proactive = false,
  current_code = '',
  onChunk,
  onComplete,
  onError,
  onCodeReady
) {
  const client = getWebSocketClient();
  
  // Connect if not already connected
  if (!client.isConnected) {
    await client.connect();
  }

  // Set up callbacks
  client.setCallbacks(onChunk, onComplete, onError, onCodeReady);

  // Prepare message data
  const messageData = {
    messages,
    model,
    max_tokens,
    proactive,
    current_code
  };

  try {
    const response = await client.sendMessage(messageData);
    return response.content;
  } catch (error) {
    throw error;
  }
}
