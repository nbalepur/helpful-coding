/**
 * Environment configuration
 * Centralized access to environment variables
 */

export const ENV = {
  // Backend API URL
  // Use relative URL when NEXT_PUBLIC_USE_PROXY is set (defaults to true if not set)
  // This makes requests go through Next.js rewrites to the backend
  BACKEND_URL: ((): string => {
    // Default to using proxy (relative URLs) unless explicitly disabled
    const useProxy = process.env.NEXT_PUBLIC_USE_PROXY !== 'false';
    if (useProxy) {
      return ''; // Relative URL - requests will go through Next.js proxy/rewrites
    }
    const raw = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:4828';
    try {
      const u = new URL(raw);
      if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
      return u.toString().replace(/\/$/, '');
    } catch {
      return raw.replace('localhost', '127.0.0.1').replace(/\/$/, '');
    }
  })(),
  
  // Backend WebSocket URL
  // WebSockets can't go through Next.js rewrites, so we need direct access
  // If only port 4827 is public, WebSockets won't work unless backend is also accessible
  BACKEND_WS_URL: ((): string => {
    const raw = process.env.NEXT_PUBLIC_BACKEND_WS_URL || 'ws://127.0.0.1:4828';
    try {
      const u = new URL(raw);
      if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
      return u.toString().replace(/\/$/, '');
    } catch {
      return raw.replace('localhost', '127.0.0.1').replace(/\/$/, '');
    }
  })(),
  
  // Frontend URL
  FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://127.0.0.1:4827',
  
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

  // Cookie prefix to namespace app cookies and avoid collisions with user code
  COOKIE_PREFIX: process.env.NEXT_PUBLIC_COOKIE_PREFIX || 'vca_',
} as const;

