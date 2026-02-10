/**
 * Environment configuration
 * Centralized access to environment variables.
 * Values come from .env.local (synced from root .env via npm run sync-env).
 */

function normalizeUrl(raw: string | undefined, fallback: string): string {
  const value = (raw || '').trim().replace(/\/$/, '');
  if (!value || value === 'undefined') return fallback;
  try {
    const u = new URL(value);
    // Normalize localhost to 127.0.0.1 for consistency
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\/$/, '');
  }
}

export const ENV = {
  // Backend API URL - from NEXT_PUBLIC_BACKEND_URL in .env.local
  get BACKEND_URL(): string {
    return normalizeUrl(
      process.env.NEXT_PUBLIC_BACKEND_URL,
      'http://127.0.0.1:4828'
    );
  },

  // Frontend URL - from NEXT_PUBLIC_FRONTEND_URL in .env.local
  get FRONTEND_URL(): string {
    return normalizeUrl(
      process.env.NEXT_PUBLIC_FRONTEND_URL,
      'http://127.0.0.1:3000'
    );
  },
  
  // Helper to get the execute endpoint URL
  get EXECUTE_ENDPOINT_URL() {
    return `${this.BACKEND_URL}/api/execute-endpoint`;
  },
  
  // Cookie prefix to namespace app cookies and avoid collisions with user code
  COOKIE_PREFIX: process.env.NEXT_PUBLIC_COOKIE_PREFIX || 'vca_',

  // Contact email (e.g. for study contact) - from FROM_CONTACT_EMAIL in .env, synced as NEXT_PUBLIC_FROM_CONTACT_EMAIL
  get FROM_CONTACT_EMAIL(): string {
    return process.env.NEXT_PUBLIC_FROM_CONTACT_EMAIL || '[add your email here]';
  },

  // Contact name (e.g. project lead) - from FROM_CONTACT_NAME in .env, synced as NEXT_PUBLIC_FROM_CONTACT_NAME
  get FROM_CONTACT_NAME(): string {
    return process.env.NEXT_PUBLIC_FROM_CONTACT_NAME || '[add your name here]';
  },

  // Function tasks: seconds after which Submit is enabled even if not all tests pass
  get GIVE_UP_SECONDS(): number {
    const raw = process.env.NEXT_PUBLIC_GIVE_UP_SECONDS;
    if (raw == null || raw === '') return 600;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 600;
  },
} as const;

