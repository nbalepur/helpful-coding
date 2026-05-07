/**
 * Environment configuration
 * Centralized access to environment variables
 */

const parsePositiveIntOrDefault = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const ENV = {


  // Backend API URL
  // In production, use relative URL to proxy through Next.js API routes
  // In development, use direct connection to backend
  get BACKEND_URL(): string {
    // Check if we're in browser and not on localhost (runtime check)
    // This takes precedence over build-time env vars for production hosts
    const isProductionHost = typeof window !== 'undefined' && 
                             window.location.hostname !== 'localhost' && 
                             window.location.hostname !== '127.0.0.1';
    
    // Check if we should use proxy mode
    const useProxy = process.env.NEXT_PUBLIC_USE_PROXY === 'true' || 
                     process.env.NODE_ENV === 'production';
    
    // Use proxy if explicitly enabled, or in production build, or on production host
    if (useProxy || isProductionHost) {
      // Use relative URL to proxy through Next.js
      // Code uses ${BACKEND_URL}/login or ${BACKEND_URL}/api/...
      // So: /api/backend-proxy + /login = /api/backend-proxy/login (proxy forwards to /login)
      // And: /api/backend-proxy + /api/execute-endpoint = /api/backend-proxy/api/execute-endpoint (proxy forwards to /api/execute-endpoint)
      return '/api/backend-proxy';
    }
    
    // If NEXT_PUBLIC_BACKEND_URL is explicitly set, use it (for development/localhost)
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
    
    // In development, use direct connection
    const raw = 'http://127.0.0.1:4828';
    try {
      const u = new URL(raw);
      if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
      return u.toString().replace(/\/$/, '');
    } catch {
      return raw.replace('localhost', '127.0.0.1').replace(/\/$/, '');
    }
  },
  
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

  /**
   * When true, every user is treated as past the website-requirements phase (Zic-Zac-Zoe, etc.):
   * study UX uses open-ended game development mode only; phase 1 tutorial popup is not shown.
   * Must use NEXT_PUBLIC_OPEN_ENDED_GAME_STUDY_ONLY — unprefixed vars are not available in client bundles.
   */
  OPEN_ENDED_GAME_STUDY_ONLY:
    process.env.NEXT_PUBLIC_OPEN_ENDED_GAME_STUDY_ONLY === 'true' ||
    process.env.OPEN_ENDED_GAME_STUDY_ONLY === 'true',

  // Number of submitted game tasks required before prompting post-test
  NUM_TASKS_REQUIRED_UNTIL_POSTTEST: parsePositiveIntOrDefault(
    process.env.NEXT_PUBLIC_NUM_TASKS_REQUIRED_UNTIL_POSTTEST,
    10
  ),

  /** First N study-wide submissions (by time) eligible for Stage 3 per-task pay. */
  STAGE3_MAX_SUBMISSIONS_FOR_COMPENSATION: parsePositiveIntOrDefault(
    process.env.NEXT_PUBLIC_STAGE3_MAX_SUBMISSIONS_FOR_COMPENSATION,
    500
  ),

  /** First N users (by time they meet post-test task reqs) who may take the post-test. */
  POST_TEST_PARTICIPANT_CAP: parsePositiveIntOrDefault(
    process.env.NEXT_PUBLIC_POST_TEST_PARTICIPANT_CAP,
    50
  ),

  /** Top-10 voting bonuses apply only when study-wide submissions count is *greater than* this. */
  TOP10_BONUS_MIN_SUBMISSIONS_EXCLUSIVE: parsePositiveIntOrDefault(
    process.env.NEXT_PUBLIC_TOP10_BONUS_MIN_SUBMISSIONS_EXCLUSIVE,
    7
  ),

  // Timed task durations (in minutes)
  RECREATION_TASK_ONE_MINUTES: parsePositiveIntOrDefault(
    process.env.NEXT_PUBLIC_RECREATION_TASK_ONE_MINUTES,
    40
  ),
  RECREATION_TASK_TWO_MINUTES: parsePositiveIntOrDefault(
    process.env.NEXT_PUBLIC_RECREATION_TASK_TWO_MINUTES,
    20
  ),
  GAME_TASK_ONE_MINUTES: parsePositiveIntOrDefault(
    process.env.NEXT_PUBLIC_GAME_TASK_ONE_MINUTES,
    75
  ),
  
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

