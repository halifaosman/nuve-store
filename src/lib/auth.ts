// Admin session: a signed cookie "<expiry>.<hmac>". Uses Web Crypto so it works in middleware too.
export const SESSION_COOKIE = 'nuve_admin';
const DAYS = 7;

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function makeSession(secret: string): Promise<{ value: string; maxAge: number }> {
  const exp = Date.now() + DAYS * 864e5;
  return { value: `${exp}.${await hmac(secret, String(exp))}`, maxAge: DAYS * 86400 };
}

export async function sessionValid(value: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!value || !secret) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

// Compares fixed-length HMACs so the check takes the same time whatever the password length.
export async function passwordMatches(given: string, expected: string, secret: string): Promise<boolean> {
  return safeEqual(await hmac(secret, given), await hmac(secret, expected));
}
