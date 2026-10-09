import { env } from './env';
import { exec, one, rows } from './db';
import { getSettings, SiteSettings } from './settings';
import { layout, Brand, Block } from './email-templates';
import { rand } from './money';

// Order and support emails, sent through Resend's HTTPS API (DigitalOcean blocks normal SMTP ports).
// Each email is recorded in email_log under (ref, kind) before it is sent, so it can never go out twice.
// Failed sends are retried by the cron (up to 5 tries). Nothing here ever throws into checkout or payments.
// Docs: https://resend.com/docs/api-reference/emails/send-email

const API = process.env.RESEND_API_BASE || 'https://api.resend.com'; // override only for local testing
const MAX_TRIES = 5;

export const emailEnabled = () => !!env.resendKey();
const site = () => (process.env.SITE_URL || '').trim().replace(/\/$/, '');
const tz = { timeZone: 'Africa/Johannesburg' } as const;
const when = (v: string | Date) => new Date(v).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...tz });

type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string };

export async function sendMail(m: Mail, idempotencyKey?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!emailEnabled()) return { ok: false, error: 'Email is not set up (no Resend API key)' };
  try {
    const r = await fetch(`${API}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendKey()}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 256) } : {}) },
      body: JSON.stringify({ from: env.emailFrom(), to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!r.ok) return { ok: false, error: `${j.message || j.name || `HTTP ${r.status}`}`.slice(0, 480) };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : 'network error').slice(0, 480) };
  }
}

/** Sends one email at most once per (ref, kind). `build` returns null when there is nothing to send. */
async function once(ref: string, kind: string, build: () => Promise<Mail | null>, orderId?: string): Promise<void> {
  if (!emailEnabled()) return;
  const fresh = await exec("INSERT IGNORE INTO email_log (ref, kind, status, attempts) VALUES (?, ?, 'sending', 0)", [ref, kind]);
  if (!fresh) {
    // Retry a failed one, at most every 2 minutes, claiming it so two runs can't both send.
    const retried = await exec(
      "UPDATE email_log SET status = 'sending', updated_at = UTC_TIMESTAMP(3) WHERE ref = ? AND kind = ? AND status = 'failed' AND attempts < ? AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE",
      [ref, kind, MAX_TRIES]);
    if (!retried) return;
  }
  let mail: Mail | null = null;
  try { mail = await build(); } catch (e) { console.warn('email build failed', kind, ref, e); }
  if (!mail || !mail.to) {
    await exec("UPDATE email_log SET status = 'skipped', error = ?, updated_at = UTC_TIMESTAMP(3) WHERE ref = ? AND kind = ?", [mail ? 'No address to send to' : 'Nothing to send', ref, kind]);
    return;
  }
  const r = await sendMail(mail, `${kind}:${ref}`);
  await exec('UPDATE email_log SET status = ?, attempts = attempts + 1, error = ?, provider_id = ?, to_addr = ?, subject = ?, updated_at = UTC_TIMESTAMP(3) WHERE ref = ? AND kind = ?',
    [r.ok ? 'sent' : 'failed', r.error || null, r.id || null, mail.to.slice(0, 255), mail.subject.slice(0, 255), ref, kind]);
  if (orderId) {
    const what = LABEL[kind] || kind;
    await exec('INSERT INTO order_events (order_id, kind, message) VALUES (?, ?, ?)',
      [orderId, 'email', r.ok ? `Emailed ${what} to ${mail.to}` : `Could not email ${what} to ${mail.to}: ${r.error} (will retry)`]).catch(() => {});
  }
}

const LABEL: Record<string, string> = {
  eft: 'bank transfer details', confirmed: 'order confirmation', shipped: 'shipping update', delivered: 'delivery email',
  admin_new: 'new-order alert', admin_proof: 'proof-of-payment alert',
};

/** Emails only go out for things that happen after email was first switched on (no surprise backlog). */
async function since(): Promise<number> {
  const r = await one<{ value: string }>("SELECT value FROM settings WHERE `key` = 'email_since'");
  if (r?.value) return Date.parse(String(r.value));
  // Start 15 minutes back, so the order that triggered the very first email is included.
  const start = new Date(Date.now() - 15 * 60_000).toISOString();
  await exec("INSERT IGNORE INTO settings (`key`, value, updated_at) VALUES ('email_since', ?, UTC_TIMESTAMP(3))", [JSON.stringify(start)]);
  const saved = await one<{ value: string }>("SELECT value FROM settings WHERE `key` = 'email_since'");
  return Date.parse(String(saved?.value || start));
}

function brandOf(s: SiteSettings): Brand {
  return { site: site(), name: s.bizName || 'Nuvé', supportEmail: s.bizEmail, supportPhone: s.bizPhone, address: (s.bizAddress || '').replace(/\s*\n\s*/g, ', ') };
}
const ownerEmail = (s: SiteSettings) => (s.bizEmail || s.popEmail || '').trim();

type Order = {
  id: string; access_token: string; order_number: number; status: string; payment_method: string; customer_first: string; customer_last: string;
  email: string; phone: string; address_street: string; address_suburb: string; address_city: string; address_province: string; address_postal: string;
  items: { description: string; qty: number; pack_price?: number; unit_price: number }[]; shipping_cost: number; shipping_method: string | null; total: number;
  expires_at: string | null; paid_at: string | null; pop_uploaded_at: string | null; tracking_reference: string | null; tracking_url: string | null;
  created_at: string; updated_at: string;
};

const address = (o: Order) => [o.address_street, o.address_suburb, o.address_city, o.address_province, o.address_postal].filter(Boolean).join(', ');
const lines = (o: Order): Block => ({
  lines: [...o.items.map((i) => [i.description, rand(i.pack_price ?? i.unit_price * i.qty)] as [string, string]), [`Delivery${o.shipping_method ? ` (${o.shipping_method})` : ''}`, rand(o.shipping_cost)]],
  total: ['Total', rand(o.total)],
});
const links = (o: Order) => ({
  app: `${site()}/my/${o.id}?t=${encodeURIComponent(o.access_token)}`,
  page: `${site()}/order/${o.id}?t=${encodeURIComponent(o.access_token)}`,
  admin: `${site()}/admin/orders/${o.id}`,
});
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

function customerMail(kind: string, o: Order, s: SiteSettings): Mail | null {
  const b = brandOf(s), ref = `NUV${o.order_number}`, L = links(o), first = o.customer_first || 'there';
  const base = { to: o.email, replyTo: s.bizEmail || undefined };
  if (kind === 'eft') {
    const deadline = o.expires_at ? when(o.expires_at) : '';
    const m = layout(b, {
      preheader: `Pay ${rand(o.total)} by EFT${deadline ? ` before ${deadline}` : ''} to confirm your order.`,
      title: `Your order ${ref} is reserved`,
      blocks: [
        { p: `Hi ${first}, thanks for your order! To confirm it, pay ${rand(o.total)} into our account below${deadline ? ` before ${deadline}` : ` within ${s.eftMinutes} minutes`}, then upload your proof of payment.` },
        { rows: [['Bank', s.bankName], ['Account name', s.bankAccountName], ['Account number', s.bankAccountNumber], ['Branch code', s.bankBranchCode], ['Account type', s.bankAccountType], ['Amount', rand(o.total)], ['Payment reference', ref]], title: 'Bank details' },
        { button: 'Upload proof of payment', href: L.page },
        { note: `Please use ${ref} as your payment reference. If payment doesn't arrive in time, the order is cancelled automatically and you can place a new one.` },
        lines(o),
      ],
    });
    return { ...base, subject: `Pay by EFT to confirm order ${ref}`, ...m };
  }
  if (kind === 'confirmed') {
    const m = layout(b, {
      preheader: `We've received your payment. Here's what happens next.`,
      title: `Thank you, ${first}! Your order is confirmed`,
      blocks: [
        { p: `We've received your payment for order ${ref}. We're packing your SnapBun now and will send it within ${range(s.readyDaysMin, s.readyDaysMax)} business days. Most orders arrive within ${range(s.deliverDaysMin, s.deliverDaysMax)} business days.` },
        { button: 'Track your order', href: L.app },
        { note: 'Tip: open that link on your phone and add it to your home screen. You can follow your parcel to your door and message us from there.' },
        lines(o),
        { rows: [['Delivering to', `${o.customer_first} ${o.customer_last}\n${address(o)}`], ['Phone', o.phone]] },
      ],
    });
    return { ...base, subject: `Order ${ref} confirmed. Thank you!`, ...m };
  }
  if (kind === 'shipped') {
    const m = layout(b, {
      preheader: `Your SnapBun has left us and is on its way.`,
      title: 'Your SnapBun is on its way',
      blocks: [
        { p: `Hi ${first}, good news: order ${ref} is with the courier.` },
        ...(o.tracking_reference ? [{ rows: [['Tracking number', o.tracking_reference]] as [string, string][] }] : []),
        { button: 'Follow your delivery', href: L.app },
        ...(o.tracking_url ? [{ note: `You can also track it on the courier's site: ${o.tracking_url}` }] : []),
        { note: 'The courier may phone you on the day of delivery, so keep your phone close.' },
      ],
    });
    return { ...base, subject: `Order ${ref} is on its way`, ...m };
  }
  if (kind === 'delivered') {
    const m = layout(b, {
      preheader: 'Your bun in 5 seconds: a quick how-to inside.',
      title: `Delivered! Enjoy your SnapBun, ${first}`,
      blocks: [
        { p: 'Your order has been delivered. Here\'s the quick way to your first bun:' },
        { steps: ['Brush your hair into a ponytail at the height you want your bun.', 'Thread your hair through the slit and slide the SnapBun to the ends.', 'Roll it up toward your head, tucking in loose ends.', 'Bend the ends down, snap them together and fan your hair out to cover it.'] },
        { p: `Not quite right? You're covered by our 30-day "Perfect Bun" guarantee. Just reply to this email.` },
        { quote: 'Love your bun? Reply with a photo or a few honest words. With your permission, we may share it so other women can see real results.' },
        { button: 'Open your order', href: L.app },
      ],
    });
    return { ...base, subject: 'Delivered! Your first 5-second bun', ...m };
  }
  return null;
}

function ownerMail(kind: string, o: Order, s: SiteSettings): Mail | null {
  const to = ownerEmail(s);
  if (!to) return null;
  const b = brandOf(s), ref = `NUV${o.order_number}`, L = links(o);
  if (kind === 'admin_new') {
    const m = layout(b, {
      admin: true, preheader: `${rand(o.total)} from ${o.customer_first} ${o.customer_last}`,
      title: `New order ${ref}: ${rand(o.total)}`,
      blocks: [
        lines(o),
        { rows: [['Customer', `${o.customer_first} ${o.customer_last}`], ['Email', o.email], ['Phone', o.phone], ['Deliver to', address(o)], ['Paid by', o.payment_method === 'eft' ? 'Bank transfer (EFT)' : 'PayFast']] },
        { button: 'Open the order', href: L.admin },
      ],
    });
    return { to, replyTo: o.email, subject: `New order ${ref}: ${rand(o.total)}`, ...m };
  }
  if (kind === 'admin_proof') {
    const m = layout(b, {
      admin: true, preheader: `Check your bank for ${rand(o.total)} with reference ${ref}.`,
      title: `Proof of payment for ${ref}`,
      blocks: [
        { p: `${o.customer_first} ${o.customer_last} uploaded proof of payment for ${rand(o.total)}. Check that it has reflected in your bank account (reference ${ref}), then mark the order paid.` },
        { button: 'Review in Pending EFT', href: `${site()}/admin/eft` },
      ],
    });
    return { to, replyTo: o.email, subject: `Check EFT: ${ref} uploaded proof (${rand(o.total)})`, ...m };
  }
  return null;
}

/** Works out which emails an order is due and sends any not sent yet. Safe to call any time, any number of times. */
export async function orderEmails(orderId: string): Promise<void> {
  if (!emailEnabled()) return;
  try {
    const from = await since();
    const o = await one<Order>(`SELECT id, access_token, order_number, status, payment_method, customer_first, customer_last, email, phone, address_street, address_suburb,
      address_city, address_province, address_postal, items, shipping_cost, shipping_method, total, expires_at, paid_at, pop_uploaded_at, tracking_reference, tracking_url,
      created_at, updated_at FROM orders WHERE id = ?`, [orderId]);
    if (!o) return;
    const s = await getSettings();
    const after = (v: string | null) => !!v && Date.parse(v) >= from;
    const due: string[] = [];
    if (o.payment_method === 'eft' && o.status === 'awaiting_eft' && after(o.created_at)) due.push('eft');
    if (o.status === 'eft_review' && after(o.pop_uploaded_at)) due.push('admin_proof');
    if (o.paid_at && o.status !== 'cancelled' && after(o.paid_at)) due.push('confirmed', 'admin_new');
    if (o.status === 'shipped' && after(o.updated_at)) due.push('shipped');
    if (o.status === 'delivered' && after(o.updated_at)) due.push('delivered');
    for (const kind of due) {
      await once(o.id, kind, async () => (kind.startsWith('admin_') ? ownerMail(kind, o, s) : customerMail(kind, o, s)), o.id);
    }
  } catch (e) {
    console.warn('order emails failed', orderId, e instanceof Error ? e.message : e);
  }
}

/** Contact form and order-app messages: a copy to the shop owner, with Reply going straight to the customer. */
export async function messageEmail(messageId: string): Promise<void> {
  if (!emailEnabled()) return;
  await once(messageId, 'contact', async () => {
    const m = await one<{ name: string; email: string; phone: string | null; order_ref: string | null; topic: string | null; message: string }>(
      'SELECT name, email, phone, order_ref, topic, message FROM messages WHERE id = ?', [messageId]);
    const s = await getSettings();
    if (!m || !ownerEmail(s)) return null;
    const html = layout(brandOf(s), {
      admin: true, preheader: m.message.slice(0, 90), title: `Message from ${m.name}`,
      blocks: [
        { quote: m.message, by: [m.topic, m.order_ref].filter(Boolean).join(' · ') },
        { rows: [['Email', m.email], ...(m.phone ? [['Phone', m.phone] as [string, string]] : [])] },
        { p: m.topic === 'Order app' ? 'They wrote in their order app. Reply in the admin so it shows up there, or just reply to this email.' : 'Reply to this email to answer them directly.' },
        { button: 'Open Messages', href: `${site()}/admin/messages` },
      ],
    });
    return { to: ownerEmail(s), replyTo: m.email, subject: `Message from ${m.name}${m.order_ref ? ` (${m.order_ref})` : ''}: ${(m.topic || 'Contact form')}`, ...html };
  }).catch((e) => console.warn('message email failed', e));
}

/** Admin reply to a customer message: emailed to the customer too (they may not open the order app). */
export async function replyEmail(replyId: number): Promise<void> {
  if (!emailEnabled()) return;
  await once(`reply:${replyId}`, 'reply', async () => {
    const r = await one<{ body: string; name: string; email: string; message: string; order_ref: string | null }>(
      'SELECT r.body, m.name, m.email, m.message, m.order_ref FROM message_replies r JOIN messages m ON m.id = r.message_id WHERE r.id = ?', [replyId]);
    if (!r) return null;
    const s = await getSettings();
    let app = '';
    const num = /^NUV(\d+)$/.exec(r.order_ref || '')?.[1];
    if (num) {
      const o = await one<{ id: string; access_token: string; email: string }>('SELECT id, access_token, email FROM orders WHERE order_number = ?', [Number(num)]);
      if (o && o.email.toLowerCase() === r.email.toLowerCase()) app = `${site()}/my/${o.id}?t=${encodeURIComponent(o.access_token)}`;
    }
    const first = r.name.split(' ')[0] || 'there';
    const html = layout(brandOf(s), {
      preheader: r.body.slice(0, 90), title: `Hi ${first}, we've replied`,
      blocks: [
        { quote: r.body, by: s.bizName || 'Nuvé' },
        { note: `You wrote: “${r.message.length > 300 ? r.message.slice(0, 300) + '…' : r.message}”` },
        ...(app ? [{ button: 'Open your order', href: app } as Block] : []),
      ],
    });
    return { to: r.email, replyTo: s.bizEmail || undefined, subject: `Re: your message${r.order_ref ? ` about ${r.order_ref}` : ''}`, ...html };
  }).catch((e) => console.warn('reply email failed', e));
}

/** Cron: catch anything a hook missed (e.g. the server restarted mid-send) and retry failures. */
export async function runEmailOutbox(): Promise<void> {
  if (!emailEnabled()) return;
  try {
    const from = new Date(await since());
    const recent = await rows<{ id: string }>(
      `SELECT id FROM orders WHERE updated_at >= ? AND updated_at > UTC_TIMESTAMP(3) - INTERVAL 3 DAY ORDER BY updated_at DESC LIMIT 40`, [from]);
    for (const r of recent) await orderEmails(r.id);
    const failed = await rows<{ ref: string; kind: string }>(
      `SELECT ref, kind FROM email_log WHERE status = 'failed' AND attempts < ? AND kind IN ('contact','reply') AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE LIMIT 10`, [MAX_TRIES]);
    for (const f of failed) {
      if (f.kind === 'contact') await messageEmail(f.ref);
      else await replyEmail(Number(f.ref.replace('reply:', '')));
    }
    // Free a claim left behind by a restart in the middle of sending.
    await exec("UPDATE email_log SET status = 'failed', error = 'Interrupted, will retry' WHERE status = 'sending' AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 10 MINUTE");
  } catch (e) {
    console.warn('email outbox failed', e instanceof Error ? e.message : e);
  }
}

/** "Send a test email" in the admin. */
export async function sendTestEmail(to: string) {
  const s = await getSettings();
  const m = layout(brandOf(s), {
    preheader: 'Your store can send emails.', title: 'Email is working',
    blocks: [{ p: `This test came from your Nuvé store, sent from ${env.emailFrom()}. Order confirmations, shipping updates and new-order alerts will look like this.` }, { button: 'Visit the store', href: site() || 'https://example.com' }],
  });
  return sendMail({ to, subject: 'Test email from your Nuvé store', replyTo: s.bizEmail || undefined, ...m });
}
