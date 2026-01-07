// Pre-computed SHA-256 hash (hex)
export const PASSWORD_HASH = 'ffc481e115c10ea82e4e9ff6d2155001902261fc3ed38fd1d12e46acff0562ba';

/**
 * Hash a string using SHA-256
 */
export async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

