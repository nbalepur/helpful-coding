// Pre-computed SHA-256 hash (hex)
export const PASSWORD_HASH = '0a4346f806b28b3ce94905c3ac56fcd5ee2337d8613161696aba52eb0c3551cc';


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

