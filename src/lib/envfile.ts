import { promises as fs } from 'fs';
import path from 'path';

// Editing the server's .env from the admin. Only these keys can be read or changed there; everything else
// (database, internal secrets) stays out of reach so a typo can't take the store or the admin offline.
export type EnvField = { key: string; label: string; secret: boolean; kind: 'text' | 'bool' | 'url' | 'password'; help?: string; group: string };
export const EDITABLE: EnvField[] = [
  { group: 'PayFast', key: 'PAYFAST_SANDBOX', label: 'Test mode (sandbox)', secret: false, kind: 'bool', help: 'On = test payments only. Off = real money.' },
  { group: 'PayFast', key: 'PAYFAST_MERCHANT_ID', label: 'Merchant ID', secret: false, kind: 'text' },
  { group: 'PayFast', key: 'PAYFAST_MERCHANT_KEY', label: 'Merchant key', secret: true, kind: 'text' },
  { group: 'PayFast', key: 'PAYFAST_PASSPHRASE', label: 'Salt passphrase', secret: true, kind: 'text', help: 'Must match PayFast → Settings → Developer settings exactly. Leave empty if none is set there.' },
  { group: 'Bob Go', key: 'BOBGO_SANDBOX', label: 'Test mode (sandbox)', secret: false, kind: 'bool', help: 'On = Bob Go sandbox. Off = real couriers.' },
  { group: 'Bob Go', key: 'BOBGO_API_KEY', label: 'API key', secret: true, kind: 'text' },
  { group: 'Bob Go', key: 'BOBGO_WEBHOOK_SECRET', label: 'Webhook secret', secret: true, kind: 'text' },
  { group: 'Meta (Facebook) tracking', key: 'META_PIXEL_ID', label: 'Pixel ID', secret: false, kind: 'text', help: 'Events Manager → Data sources → your pixel. Numbers only.' },
  { group: 'Meta (Facebook) tracking', key: 'META_CAPI_TOKEN', label: 'Conversions API access token', secret: true, kind: 'text', help: 'Events Manager → your pixel → Settings → Conversions API → Generate access token.' },
  { group: 'Meta (Facebook) tracking', key: 'META_TEST_EVENT_CODE', label: 'Test event code (optional)', secret: false, kind: 'text', help: 'From Events Manager → Test events, e.g. TEST12345. Server events then show up there. Clear it when you are done testing.' },
  { group: 'Facebook Page replies', key: 'META_PAGE_ID', label: 'Page ID', secret: false, kind: 'text', help: 'Numbers only. For your Page it is 61587599011799 (from facebook.com/profile.php?id=…).' },
  { group: 'Facebook Page replies', key: 'META_PAGE_TOKEN', label: 'Page access token', secret: true, kind: 'text', help: 'From your Meta app (system user token or Page token) with pages_read_engagement, pages_read_user_content, pages_manage_engagement and pages_show_list. See Facebook replies in the menu for the steps.' },
  { group: 'Store', key: 'SITE_URL', label: 'Store address', secret: false, kind: 'url', help: 'e.g. https://nuve.co.za (no slash at the end). PayFast and Bob Go send updates here.' },
  { group: 'Store', key: 'ADMIN_PASSWORD', label: 'Admin password', secret: true, kind: 'password', help: 'At least 12 characters. You will need to log in again after changing it.' },
];
const KEYS = new Set(EDITABLE.map((f) => f.key));

export const envPath = () => path.join(process.cwd(), '.env');

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t.replace(/\s+#.*$/, '');
}

export async function readEnvFile(): Promise<{ text: string; values: Record<string, string> }> {
  const text = await fs.readFile(envPath(), 'utf8');
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
    if (m) values[m[1]] = unquote(m[2]);
  }
  return { text, values };
}

/** Problems with a value, or '' if it is fine to write. */
export function checkValue(f: EnvField, v: string): string {
  if (/[\r\n"`$\\]/.test(v)) return `${f.label}: remove quotes, backslashes, $ signs or line breaks.`;
  if (f.kind === 'bool' && !['true', 'false'].includes(v)) return `${f.label}: must be on or off.`;
  if (f.kind === 'url' && !/^https?:\/\/[^\s/]+$/.test(v)) return `${f.label}: use the form https://your-domain.co.za with nothing after the domain.`;
  if (f.kind === 'password' && v.length < 12) return `${f.label}: use at least 12 characters.`;
  if (f.key === 'PAYFAST_MERCHANT_ID' && v && !/^\d{5,12}$/.test(v)) return 'Merchant ID: numbers only, as shown in PayFast.';
  if (f.key === 'META_PIXEL_ID' && v && !/^\d{10,20}$/.test(v)) return 'Pixel ID: numbers only, as shown in Events Manager.';
  if (f.key === 'META_PAGE_ID' && v && !/^\d{5,25}$/.test(v)) return 'Page ID: numbers only.';
  if (f.key === 'META_TEST_EVENT_CODE' && v && !/^[A-Za-z0-9]{3,30}$/.test(v)) return 'Test event code: letters and numbers only, e.g. TEST12345.';
  return '';
}

/** Writes the changed keys into .env, keeping every other line exactly as it was. */
export async function writeEnvValues(changes: Record<string, string>): Promise<void> {
  const { text } = await readEnvFile();
  const lines = text.split(/\r?\n/);
  const done = new Set<string>();
  const fmt = (k: string, v: string) => `${k}="${v}"`;
  const out = lines.map((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (m && KEYS.has(m[1]) && m[1] in changes) { done.add(m[1]); return fmt(m[1], changes[m[1]]); }
    return line;
  });
  while (out.length && out[out.length - 1].trim() === '') out.pop(); // add new keys right after the last line
  for (const [k, v] of Object.entries(changes)) if (!done.has(k) && KEYS.has(k)) out.push(fmt(k, v));
  const file = envPath();
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, out.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  await fs.copyFile(file, `${file}.bak`).catch(() => {}); // previous version, in case a change needs undoing by hand
  await fs.chmod(`${file}.bak`, 0o600).catch(() => {});
  await fs.rename(tmp, file);
}

export const mask = (v: string) => (!v ? '' : v.length <= 4 ? '•'.repeat(v.length) : `${'•'.repeat(6)}${v.slice(-3)} (${v.length} characters)`);
