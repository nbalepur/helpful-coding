/**
 * Cookie utility functions for managing user authentication state
 */

export interface CookieOptions {
  expires?: Date;
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

/**
 * Set a cookie with the given name, value, and options
 */
export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (typeof document === 'undefined') return; // SSR safety

  const {
    expires,
    maxAge,
    path = '/',
    domain,
    secure = true,
    sameSite = 'lax'
  } = options;

  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (expires) {
    cookieString += `; expires=${expires.toUTCString()}`;
  }

  if (maxAge !== undefined) {
    cookieString += `; max-age=${maxAge}`;
  }

  if (path) {
    cookieString += `; path=${path}`;
  }

  if (domain) {
    cookieString += `; domain=${domain}`;
  }

  if (secure) {
    cookieString += `; secure`;
  }

  cookieString += `; samesite=${sameSite}`;

  document.cookie = cookieString;
}

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null; // SSR safety

  const nameEQ = encodeURIComponent(name) + '=';
  const cookies = document.cookie.split(';');

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(nameEQ) === 0) {
      return decodeURIComponent(cookie.substring(nameEQ.length));
    }
  }

  return null;
}

/**
 * Remove a cookie by name
 */
export function removeCookie(name: string, options: Pick<CookieOptions, 'path' | 'domain'> = {}): void {
  const { path = '/', domain } = options;
  
  setCookie(name, '', {
    expires: new Date(0),
    path,
    domain
  });
}

/**
 * Check if a cookie exists
 */
export function hasCookie(name: string): boolean {
  return getCookie(name) !== null;
}

/**
 * User ID specific cookie functions
 */
export const USER_ID_COOKIE = 'user_id';
export const USER_TOKEN_COOKIE = 'auth_token';

/**
 * Set user ID in cookie (expires in 30 days)
 */
export function setUserIdCookie(userId: string): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + 30); // 30 days from now
  
  setCookie(USER_ID_COOKIE, userId, {
    expires,
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    secure: true,
    sameSite: 'lax'
  });
}

/**
 * Get user ID from cookie
 */
export function getUserIdCookie(): string | null {
  return getCookie(USER_ID_COOKIE);
}

/**
 * Set auth token in cookie (expires in 7 days)
 */
export function setAuthTokenCookie(token: string): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7); // 7 days from now
  
  setCookie(USER_TOKEN_COOKIE, token, {
    expires,
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    secure: true,
    sameSite: 'lax'
  });
}

/**
 * Get auth token from cookie
 */
export function getAuthTokenCookie(): string | null {
  return getCookie(USER_TOKEN_COOKIE);
}

/**
 * Clear all authentication cookies
 */
export function clearAuthCookies(): void {
  removeCookie(USER_ID_COOKIE);
  removeCookie(USER_TOKEN_COOKIE);
}

/**
 * Check if user is authenticated (has both user ID and token)
 */
export function isUserAuthenticated(): boolean {
  const userId = getUserIdCookie();
  const token = getAuthTokenCookie();
  return !!(userId && token);
}
