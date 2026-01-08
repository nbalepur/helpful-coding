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

  // Only use secure cookies in production (HTTPS)
  const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';

  const {
    expires,
    maxAge,
    path = '/',
    domain,
    secure = isProduction,
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

  try {
    document.cookie = cookieString;
    
    // Verify cookie was set (Safari compatibility check)
    if (typeof window !== 'undefined' && window.navigator.userAgent.includes('Safari') && !window.navigator.userAgent.includes('Chrome')) {
      // In Safari, verify the cookie was actually set
      const verifyCookie = getCookie(name);
      if (!verifyCookie && value) {
        console.warn(`[Cookies] Safari: Failed to set cookie "${name}". This may be due to Safari's cookie restrictions.`);
        console.warn(`[Cookies] Cookie string was: ${cookieString.substring(0, 100)}...`);
      }
    }
  } catch (error) {
    console.error(`[Cookies] Error setting cookie "${name}":`, error);
  }
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
import { ENV } from '../config/env';

// Namespace cookie names to avoid collisions with user preview code
export const USER_ID_COOKIE = `${ENV.COOKIE_PREFIX}user_id`;
export const USER_TOKEN_COOKIE = `${ENV.COOKIE_PREFIX}auth_token`;

/**
 * Generate a RFC4122 UUID v4 string
 */
export function generateUuidV4(): string {
  // Prefer crypto API when available
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    // @ts-ignore - types may not include randomUUID in some TS versions
    return crypto.randomUUID();
  }
  // Fallback implementation
  const getRandom = () => Math.random() * 0xffffffff | 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = getRandom() & 0xf;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Set user ID in cookie (expires in 30 days)
 */
export function setUserIdCookie(userId: string): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + 30); // 30 days from now
  
  // Safari blocks secure cookies on HTTP (localhost)
  // Only use secure in production (HTTPS)
  const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';
  
  setCookie(USER_ID_COOKIE, userId, {
    expires,
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    secure: isProduction, // Only secure on HTTPS (Safari requirement)
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
  
  // Safari blocks secure cookies on HTTP (localhost)
  // Only use secure in production (HTTPS)
  const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';
  
  setCookie(USER_TOKEN_COOKIE, token, {
    expires,
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    secure: isProduction, // Only secure on HTTPS (Safari requirement)
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
 * Clear all cookies for the current domain
 * This function reads all cookies from document.cookie and removes each one
 */
export function clearAllCookies(): void {
  if (typeof document === 'undefined') return; // SSR safety

  // Get all cookies
  const cookies = document.cookie.split(';');
  
  // Iterate through each cookie and remove it
  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie) {
      // Extract the cookie name (everything before the first '=')
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
      
      // Decode the cookie name in case it was encoded
      const decodedName = decodeURIComponent(name);
      
      // Remove the cookie with path='/'
      // This will work for all cookies in our codebase as they use path='/' by default
      removeCookie(decodedName, { path: '/' });
    }
  }
}

/**
 * Check if user is authenticated (has both user ID and token)
 */
export function isUserAuthenticated(): boolean {
  const userId = getUserIdCookie();
  const token = getAuthTokenCookie();
  return !!(userId && token);
}

/**
 * User preference cookie functions
 */
export const SETTINGS_COOKIE = `${ENV.COOKIE_PREFIX}user_settings`;

export interface UserSettings {
  aiAssistantPlacement: 'side' | 'bottom';
  taskPreviewSwap: boolean; // true = swapped (task on right), false = normal (task on left)
  theme: 'native' | 'light' | 'dark';
  debugConsolePlacement: 'side' | 'bottom';
  leftPaneWidthPercent: number; // Percentage width of left pane (0-100)
  sidebarOpen: boolean; // true = sidebar is open, false = sidebar is closed
}

const DEFAULT_SETTINGS: UserSettings = {
  aiAssistantPlacement: 'side',
  taskPreviewSwap: false,
  theme: 'native',
  debugConsolePlacement: 'bottom',
  leftPaneWidthPercent: 33.33, // Default to 1/3 of container width
  sidebarOpen: false, // Default to closed
};

/**
 * Set user settings in cookie (expires in 365 days)
 */
export function setUserSettingsCookie(settings: UserSettings): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + 365); // 365 days from now
  
  setCookie(SETTINGS_COOKIE, JSON.stringify(settings), {
    expires,
    maxAge: 365 * 24 * 60 * 60, // 365 days in seconds
    sameSite: 'lax'
  });
}

/**
 * Get user settings from cookie, with defaults
 */
export function getUserSettingsCookie(): UserSettings {
  const cookieValue = getCookie(SETTINGS_COOKIE);
  if (!cookieValue) {
    return DEFAULT_SETTINGS;
  }
  
  try {
    const settings = JSON.parse(cookieValue) as Partial<UserSettings>;
    // Merge with defaults to handle missing fields
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
  } catch (error) {
    console.error('Failed to parse user settings cookie:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update a specific setting in the cookie
 */
export function updateUserSetting<K extends keyof UserSettings>(
  key: K,
  value: UserSettings[K]
): void {
  const currentSettings = getUserSettingsCookie();
  const updatedSettings = {
    ...currentSettings,
    [key]: value,
  };
  setUserSettingsCookie(updatedSettings);
}

/**
 * Clear user settings cookie
 */
export function clearUserSettingsCookie(): void {
  removeCookie(SETTINGS_COOKIE);
}

/**
 * Playground completion cookie functions
 */
export const PLAYGROUND_COMPLETED_COOKIE = `${ENV.COOKIE_PREFIX}playground_completed`;

/**
 * Set playground completion cookie (expires in 1 year)
 */
export function setPlaygroundCompletedCookie(): void {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1); // 1 year from now
  
  setCookie(PLAYGROUND_COMPLETED_COOKIE, 'true', {
    expires,
    maxAge: 365 * 24 * 60 * 60, // 1 year in seconds
    sameSite: 'lax'
  });
}

/**
 * Check if playground is completed (cookie exists and is set to 'true')
 */
export function isPlaygroundCompleted(): boolean {
  const cookieValue = getCookie(PLAYGROUND_COMPLETED_COOKIE);
  return cookieValue === 'true';
}
