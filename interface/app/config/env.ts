/**
 * Environment configuration
 * Centralized access to environment variables
 */

export const ENV = {
  // Backend API URL
  // In production, use relative URL to proxy through Next.js API routes
  // In development, use direct connection to backend
  BACKEND_URL: ((): string => {
    // If NEXT_PUBLIC_BACKEND_URL is explicitly set, use it (highest priority)
    if (process.env.NEXT_PUBLIC_BACKEND_URL) {
      const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
      try {
        const u = new URL(raw);
        if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
        return u.toString().replace(/\/$/, '');
      } catch {
        // If it's not a full URL, assume it's a relative path or proxy route
        return raw.replace(/\/$/, '');
      }
    }
    
    // Check if we should use proxy mode
    const useProxy = process.env.NEXT_PUBLIC_USE_PROXY === 'true' || 
                     process.env.NODE_ENV === 'production';
    
    // Check if we're in browser and not on localhost (runtime check)
    const isProductionHost = typeof window !== 'undefined' && 
                             window.location.hostname !== 'localhost' && 
                             window.location.hostname !== '127.0.0.1';
    
    // Use proxy if explicitly enabled, or in production build, or on production host
    if (useProxy || isProductionHost) {
      // Use relative URL to proxy through Next.js
      // Note: Code uses ${BACKEND_URL}/api/..., so we need /api/backend-proxy/api
      // This way: /api/backend-proxy/api + /execute-endpoint = /api/backend-proxy/api/execute-endpoint
      return '/api/backend-proxy/api';
    }
    
    // In development, use direct connection
    const raw = 'http://127.0.0.1:4828';
    try {
      const u = new URL(raw);
      if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
      return u.toString().replace(/\/$/, '');
    } catch {
      return raw.replace('localhost', '127.0.0.1').replace(/\/$/, '');
    }
  })(),
  
  // Backend WebSocket URL
  // Note: WebSockets cannot be proxied through Next.js API routes
  // Use nginx reverse proxy or expose port 4828 publicly - see PRODUCTION_SETUP.md
  BACKEND_WS_URL: ((): string => {
    // If NEXT_PUBLIC_BACKEND_WS_URL is explicitly set, use it (highest priority)
    if (process.env.NEXT_PUBLIC_BACKEND_WS_URL) {
      const raw = process.env.NEXT_PUBLIC_BACKEND_WS_URL;
      try {
        const u = new URL(raw);
        if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
        return u.toString().replace(/\/$/, '');
      } catch {
        return raw.replace('localhost', '127.0.0.1').replace(/\/$/, '');
      }
    }
    
    // Check if we're in browser and not on localhost (runtime check)
    const isProductionHost = typeof window !== 'undefined' && 
                             window.location.hostname !== 'localhost' && 
                             window.location.hostname !== '127.0.0.1';
    
    // In production, use wss:// with the same hostname (requires reverse proxy or exposed port)
    if ((process.env.NODE_ENV === 'production' || isProductionHost) && typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const hostname = window.location.hostname;
      // Use port 4828 or configured port (requires public routing or reverse proxy)
      const port = process.env.NEXT_PUBLIC_BACKEND_WS_PORT || '4828';
      return `${protocol}//${hostname}:${port}`;
    }
    
    // In development, use direct connection
    const raw = 'ws://127.0.0.1:4828';
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

