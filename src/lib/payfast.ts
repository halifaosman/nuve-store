import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { env } from './env';

// PHP urlencode(): spaces become '+', everything except A-Z a-z 0-9 - _ . is %XX with uppercase hex.
export function pfEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}

export function md5(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex');
}

// Field order PayFast documents for the payment form (the signature must follow this order).
const FORM_ORDER = [
  'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
  'name_first', 'name_last', 'email_address', 'cell_number',
  'm_payment_id', 'amount', 'item_name', 'item_description',
  'custom_int1', 'custom_int2', 'custom_int3', 'custom_int4', 'custom_int5',
  'custom_str1', 'custom_str2', 'custom_str3', 'custom_str4', 'custom_str5',
  'email_confirmation', 'confirmation_address', 'payment_method',
];

export function formSignature(fields: Record<string, string>, passphrase: string): string {
  const parts: string[] = [];
  for (const key of FORM_ORDER) {
    const v = fields[key];
    if (v !== undefined && String(v).trim() !== '') parts.push(`${key}=${pfEncode(String(v).trim())}`);
  }
  let s = parts.join('&');
  if (passphrase) s += `&passphrase=${pfEncode(passphrase.trim())}`;
  return md5(s);
}

export function processUrl(): string {
  return env.payfastSandbox() ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process';
}

export function buildPaymentForm(o: {
  orderId: string; orderNumber: number; amount: number; first: string; last: string; email: string; phone: string; itemName: string; token: string;
}): { action: string; fields: Record<string, string> } {
  const site = env.siteUrl();
  const fields: Record<string, string> = {
    merchant_id: env.payfastMerchantId(),
    merchant_key: env.payfastMerchantKey(),
    return_url: `${site}/order/${o.orderId}?t=${o.token}&from=payfast`,
    cancel_url: `${site}/checkout?cancelled=${o.orderNumber}`,
    notify_url: `${site}/api/payfast/notify`,
    name_first: o.first.slice(0, 100),
    name_last: o.last.slice(0, 100),
    email_address: o.email.slice(0, 100),
    m_payment_id: o.orderId,
    amount: o.amount.toFixed(2),
    item_name: o.itemName.slice(0, 100),
    custom_str1: String(o.orderNumber),
  };
  const phone = o.phone.replace(/\D/g, '');
  if (/^0\d{9}$/.test(phone)) fields.cell_number = phone;
  // Post exactly the values that were signed: trimmed, and empty ones left out (PayFast skips blanks too).
  const ordered: Record<string, string> = {};
  for (const k of FORM_ORDER) {
    const v = fields[k] === undefined ? '' : String(fields[k]).trim();
    if (v !== '') ordered[k] = v;
  }
  ordered.signature = formSignature(ordered, env.payfastPassphrase());
  return { action: processUrl(), fields: ordered };
}

// ---------- ITN (payment notification) checks ----------

// Rebuild the parameter string from the raw POST body, in the order received, up to (not including) signature.
export function itnParamString(rawBody: string): { paramString: string; signature: string; data: Record<string, string> } {
  const params = new URLSearchParams(rawBody);
  const parts: string[] = [];
  const data: Record<string, string> = {};
  let signature = '';
  for (const [k, v] of params) {
    if (k === 'signature') { signature = v; break; }
    data[k] = v;
    parts.push(`${k}=${pfEncode(v)}`);
  }
  for (const [k, v] of params) if (!(k in data) && k !== 'signature') data[k] = v;
  return { paramString: parts.join('&'), signature, data };
}

export function itnSignatureValid(paramString: string, signature: string, passphrase: string): boolean {
  const s = passphrase ? `${paramString}&passphrase=${pfEncode(passphrase.trim())}` : paramString;
  const a = Buffer.from(md5(s)), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PF_HOSTS = ['www.payfast.co.za', 'w1w.payfast.co.za', 'w2w.payfast.co.za', 'sandbox.payfast.co.za'];
const PF_CIDRS = ['197.97.145.144/28', '41.74.179.192/27', '102.216.36.0/28', '102.216.36.128/28', '144.126.193.139/32'];

function ipToInt(ip: string): number | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return ((+m[1] << 24) >>> 0) + (+m[2] << 16) + (+m[3] << 8) + +m[4];
}
function inCidr(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  const a = ipToInt(ip), b = ipToInt(base);
  if (a === null || b === null) return false;
  const mask = bits === '32' ? 0xffffffff : (~((1 << (32 - +bits)) - 1)) >>> 0;
  return (a & mask) === (b & mask);
}

export async function fromPayfast(ip: string): Promise<boolean> {
  const clean = ip.replace(/^::ffff:/, '').trim();
  if (PF_CIDRS.some((c) => inCidr(clean, c))) return true;
  for (const host of PF_HOSTS) {
    try {
      const ips = await dns.resolve4(host);
      if (ips.includes(clean)) return true;
    } catch { /* host may not resolve; try the next */ }
  }
  return false;
}

// VALID / INVALID come from PayFast; ERROR means we couldn't reach them (PayFast should retry later).
export async function confirmWithPayfast(paramString: string): Promise<'VALID' | 'INVALID' | 'ERROR'> {
  const host = env.payfastSandbox() ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
  try {
    const res = await fetch(`https://${host}/eng/query/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: paramString,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 500) return 'ERROR';
    const text = (await res.text()).trim();
    return text === 'VALID' ? 'VALID' : text === 'INVALID' ? 'INVALID' : 'ERROR';
  } catch {
    return 'ERROR';
  }
}
