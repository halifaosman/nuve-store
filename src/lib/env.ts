// Reads server configuration. Missing values fail loudly with a message that says what to set.
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing setting ${name}. Add it in Vercel -> Project -> Settings -> Environment Variables.`);
  return v;
}

const production = () => process.env.VERCEL_ENV === 'production';

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
    if (!v && production()) throw new Error('Missing setting SITE_URL. Add your live address in Vercel -> Settings -> Environment Variables.');
    return (v || 'http://localhost:3000').replace(/\/$/, '');
  },
  adminPassword: () => need('ADMIN_PASSWORD'),
  sessionSecret: () => need('SESSION_SECRET'),
  cronSecret: () => need('CRON_SECRET'),
  supabaseUrl: () => need('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseServiceKey: () => need('SUPABASE_SERVICE_ROLE_KEY'),
  payfastSandbox: () => sandboxFlag('PAYFAST_SANDBOX'),
  payfastMerchantId: () => need('PAYFAST_MERCHANT_ID'),
  payfastMerchantKey: () => need('PAYFAST_MERCHANT_KEY'),
  payfastPassphrase: () => process.env.PAYFAST_PASSPHRASE || '',
  bobgoSandbox: () => sandboxFlag('BOBGO_SANDBOX'),
  bobgoKey: () => process.env.BOBGO_API_KEY || '',
  bobgoWebhookSecret: () => process.env.BOBGO_WEBHOOK_SECRET || '',
};
