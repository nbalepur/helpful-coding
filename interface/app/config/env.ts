/**
 * Environment configuration
 * Centralized access to environment variables
 */

export const ENV = {
  // Backend API URL
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000',
  
  // Backend WebSocket URL
  BACKEND_WS_URL: process.env.NEXT_PUBLIC_BACKEND_WS_URL || 'ws://localhost:8000',
  
  // Frontend URL
  FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000',
  
  // Default backend port for user code execution
  DEFAULT_BACKEND_PORT: parseInt(process.env.NEXT_PUBLIC_DEFAULT_BACKEND_PORT || '5000', 10),
  
  // Test cases configuration - whether to show only public tests (default: true)
  SHOW_PUBLIC_TESTS_ONLY: process.env.NEXT_PUBLIC_SHOW_PUBLIC_TESTS_ONLY !== 'false',
  
  // Helper to get the execute endpoint URL
  get EXECUTE_ENDPOINT_URL() {
    return `${this.BACKEND_URL}/api/execute-endpoint`;
  },
  
  // Helper to get the test cases endpoint URL
  get TEST_CASES_ENDPOINT_URL() {
    return `${this.BACKEND_URL}/api/execute-test-cases`;
  },
  
  // Helper to get the WebSocket URL
  get WS_CHAT_URL() {
    return `${this.BACKEND_WS_URL}/ws/chat`;
  },
} as const;

