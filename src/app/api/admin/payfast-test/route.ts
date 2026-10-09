import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { formSignature, processUrl } from '@/lib/payfast';

export const dynamic = 'force-dynamic';

type Try = { label: string; ok: boolean; detail: string };

// Sends PayFast a few sample payment forms from this server and reports which ones PayFast accepts.
// No money moves: we only read PayFast's first response, we never complete a payment.
async function attempt(fields: Record<string, string>, passphrase: string): Promise<{ ok: boolean; detail: string }> {
  const body = new URLSearchParams({ ...fields, signature: formSignature(fields, passphrase) });
  try {
    const r = await fetch(processUrl(), {
      method: 'POST', body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (Nuve store PayFast check)' },
    });
    const html = r.status >= 300 && r.status < 400 ? '' : await r.text();
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (r.status >= 300 && r.status < 400) return { ok: true, detail: 'Accepted (PayFast redirected to its payment page)' };
    const sig = /[^.]{0,40}signature[^.]{0,80}(not match|invalid|mismatch)[^.]*\.?/i.exec(text);
    const merchant = /[^.]{0,40}merchant[^.]{0,60}(invalid|not found|does not exist|incorrect)[^.]*\.?/i.exec(text);
    if (sig || merchant) return { ok: false, detail: (sig || merchant)![0].trim().slice(0, 180) };
    if (r.status >= 400) {
      const msg = /[^.]{0,60}(error|invalid|missing|required)[^.]{0,100}/i.exec(text);
      return { ok: false, detail: msg ? msg[0].trim().slice(0, 180) : `PayFast answered HTTP ${r.status}` };
    }
    return { ok: true, detail: 'Accepted (PayFast showed its payment page)' };
  } catch (e) {
    return { ok: false, detail: `Could not reach PayFast: ${e instanceof Error ? e.message : e}` };
  }
}

export async function POST() {
  let id = '', key = '';
  try { id = env.payfastMerchantId(); key = env.payfastMerchantKey(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'PayFast settings missing' }, { status: 400 });
  }
  const site = env.siteUrl();
  const pass = env.payfastPassphrase();
  const base = (item: string): Record<string, string> => ({
    merchant_id: id, merchant_key: key,
    return_url: `${site}/?payfast-test=return`, cancel_url: `${site}/?payfast-test=cancel`, notify_url: `${site}/api/payfast/notify`,
    name_first: 'Test', name_last: 'Customer', email_address: 'test@example.com',
    m_payment_id: `test-${Date.now()}`, amount: '5.00', item_name: item,
  });
  const tries: Try[] = [];
  tries.push({ label: `Your settings${pass ? ` (with your ${pass.length}-character passphrase)` : ' (no passphrase)'}`, ...(await attempt(base('Nuvé order #TEST'), pass)) });
  if (pass) tries.push({ label: 'Same, but with NO passphrase', ...(await attempt(base('Nuvé order #TEST'), '')) });
  else tries.push({ label: 'Same, but with the shared sandbox passphrase', ...(await attempt(base('Nuvé order #TEST'), 'jt7NOE43FZPn')) });
  tries.push({ label: 'Your settings, plain item name (no é or #)', ...(await attempt(base('Nuve order TEST'), pass)) });

  const [mine, other, plain] = tries;
  let verdict = '';
  if (mine.ok) verdict = 'PayFast accepts your settings. If a real checkout still fails, run this again after updating, and send a screenshot.';
  else if (other.ok && pass) verdict = 'PayFast accepts the form WITHOUT a passphrase. Your PayFast account has no passphrase set: either empty PAYFAST_PASSPHRASE in .env, or set the same passphrase in PayFast under Settings → Developer settings.';
  else if (other.ok && !pass) verdict = 'PayFast accepts the shared sandbox passphrase. Set PAYFAST_PASSPHRASE=jt7NOE43FZPn in .env.';
  else if (plain.ok) verdict = 'PayFast only rejects special characters in the item name. This needs a code fix; send this result to Claude.';
  else if (/reach PayFast/.test(mine.detail)) verdict = 'The server could not reach PayFast. Check the server has internet access.';
  else verdict = 'PayFast rejected every version. The passphrase in .env does not match your PayFast account, or the merchant ID / key belong to a different account or mode (sandbox vs live). Copy them again from PayFast (Settings → Developer settings) into .env.';
  return NextResponse.json({ mode: env.payfastSandbox() ? 'sandbox' : 'live', merchantId: id, tries, verdict });
}
