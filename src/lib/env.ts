import path from 'path';

// Reads server configuration. Missing values fail loudly with a message that says what to set.
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing setting ${name}. Add it to the .env file on the server.`);
  return v;
}

// `next start` on the server is the live store; `next dev` on a laptop is not.
const production = () => process.env.NODE_ENV === 'production';

// On the live site, test mode must be switched on or off on purpose, never by a missing setting.
function sandboxFlag(name: string): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (production()) throw new Error(`Set ${name} to "false" for live payments and deliveries (or "true" to keep testing).`);
    return true;
  }
  return v !== 'false';
}

export const env = {
  siteUrl: () => {
    const v = process.env.SITE_URL;
    if (!v && production()) throw new Error('Missing setting SITE_URL. Add your live address to the .env file on the server.');
    return (v || 'http://localhost:3000').replace(/\/$/, '');
  },
  adminPassword: () => need('ADMIN_PASSWORD'),
  sessionSecret: () => need('SESSION_SECRET'),
  cronSecret: () => need('CRON_SECRET'),
  databaseUrl: () => need('DATABASE_URL'),
  // Where uploaded images, videos and proofs of payment are kept (outside the code folder on the server).
  dataDir: () => process.env.DATA_DIR || path.resolve(process.cwd(), '.data'),
  payfastSandbox: () => sandboxFlag('PAYFAST_SANDBOX'),
  // Trimmed: a space or line break pasted after a key or passphrase breaks the PayFast signature.
  payfastMerchantId: () => need('PAYFAST_MERCHANT_ID').trim(),
  payfastMerchantKey: () => need('PAYFAST_MERCHANT_KEY').trim(),
  payfastPassphrase: () => (process.env.PAYFAST_PASSPHRASE || '').trim().replace(/^["']|["']$/g, ''),
  bobgoSandbox: () => sandboxFlag('BOBGO_SANDBOX'),
  // Meta (Facebook) Pixel + Conversions API
  metaPixelId: () => (process.env.META_PIXEL_ID || '').trim(),
  metaToken: () => (process.env.META_CAPI_TOKEN || '').trim(),
  metaTestCode: () => (process.env.META_TEST_EVENT_CODE || '').trim(),
  bobgoKey: () => process.env.BOBGO_API_KEY || '',
  bobgoWebhookSecret: () => process.env.BOBGO_WEBHOOK_SECRET || '',
};
