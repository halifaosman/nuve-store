import { db } from './db';
import { createBobGoOrder, findBobGoOrderId, bobgoConfigured, channelOrderNumber, OrderRow } from './bobgo';
import { getSettings } from './settings';

export const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Waiting for PayFast',
  awaiting_eft: 'Waiting for EFT',
  eft_review: 'Proof of payment uploaded',
  paid: 'Paid',
  sending: 'Sending to Bob Go',
  sent_to_bobgo: 'Sent to Bob Go',
  shipped: 'Shipped',
  delivered: 'Delivered',
  expired: 'Expired',
  cancelled: 'Cancelled',
};
export const PAID_STATUSES = ['paid', 'sending', 'sent_to_bobgo', 'shipped', 'delivered'];

export async function logEvent(orderId: string, kind: string, message: string) {
  await db().from('order_events').insert({ order_id: orderId, kind, message });
}

const nowIso = () => new Date().toISOString();

// Unpaid EFT orders expire at expires_at; abandoned PayFast checkouts expire after 3 hours.
export async function expireStale() {
  const now = nowIso();
  const cutoff = new Date(Date.now() - 3 * 3600e3).toISOString();
  const a = await db().from('orders').update({ status: 'expired', updated_at: now })
    .eq('status', 'awaiting_eft').lt('expires_at', now).is('paid_at', null).select('id');
  const b = await db().from('orders').update({ status: 'expired', updated_at: now })
    .eq('status', 'pending_payment').lt('created_at', cutoff).is('paid_at', null).select('id');
  const rows = [
    ...(a.data || []).map((r) => ({ order_id: r.id, kind: 'expired', message: 'EFT payment window ended without payment' })),
    ...(b.data || []).map((r) => ({ order_id: r.id, kind: 'expired', message: 'PayFast checkout was not completed' })),
  ];
  if (rows.length) await db().from('order_events').insert(rows);
}

export type PaidResult = { ok: boolean; message: string };

/**
 * Marks an order paid exactly once (the update only succeeds while paid_at is empty), then sends it to Bob Go.
 * A payment that arrives on a cancelled order is recorded but the order stays cancelled for the admin to decide.
 */
export async function markPaid(orderId: string, how: string, extra: Record<string, unknown> = {}, opts: { allowCancelled?: boolean } = {}): Promise<PaidResult> {
  let q = db().from('orders').update({ status: 'paid', paid_at: nowIso(), updated_at: nowIso(), ...extra })
    .eq('id', orderId).is('paid_at', null);
  if (!opts.allowCancelled) q = q.neq('status', 'cancelled');
  const { data: changed, error } = await q.select('id');
  if (error) throw new Error(error.message);

  if (!changed?.length) {
    const { data: o } = await db().from('orders').select('status, paid_at').eq('id', orderId).maybeSingle();
    if (!o) return { ok: false, message: 'Order not found' };
    if (o.paid_at) return { ok: true, message: 'Already marked paid' };
    if (o.status === 'cancelled') {
      await db().from('orders').update({ paid_at: nowIso(), updated_at: nowIso(), ...extra }).eq('id', orderId).is('paid_at', null);
      await logEvent(orderId, 'paid_after_cancel', `Payment received after the order was cancelled (${how}). Refund the customer, or press "Restore order" to ship it.`);
      return { ok: true, message: 'Payment recorded on a cancelled order' };
    }
    return { ok: false, message: 'Order could not be marked paid' };
  }
  await logEvent(orderId, 'paid', `Payment confirmed (${how})`);
  return sendToBobGo(orderId);
}

/**
 * Sends a paid order to Bob Go. Claims the order first (status paid -> sending) so two calls can't both send it.
 * A claim older than 2 minutes counts as abandoned (e.g. the function timed out) and may be retried.
 */
export async function sendToBobGo(orderId: string): Promise<PaidResult> {
  if (!bobgoConfigured()) {
    await db().from('orders').update({ bobgo_error: 'Bob Go API key is not set' }).eq('id', orderId).is('bobgo_order_id', null);
    return { ok: false, message: 'Bob Go API key is not set, so the order was not sent.' };
  }
  const stale = new Date(Date.now() - 120e3).toISOString();
  const { data: claimed } = await db().from('orders').update({ status: 'sending', updated_at: nowIso() })
    .eq('id', orderId).is('bobgo_order_id', null).not('paid_at', 'is', null)
    .or(`status.eq.paid,and(status.eq.sending,updated_at.lt.${stale})`)
    .select('*');
  const o = claimed?.[0];
  if (!o) {
    const { data: cur } = await db().from('orders').select('bobgo_order_id, status, paid_at').eq('id', orderId).maybeSingle();
    if (cur?.bobgo_order_id) return { ok: true, message: 'Already in Bob Go' };
    if (!cur?.paid_at) return { ok: false, message: 'Only paid orders go to Bob Go' };
    if (cur.status === 'sending') return { ok: true, message: 'Already being sent to Bob Go' };
    return { ok: false, message: `Order is ${cur.status}, so it was not sent` };
  }

  const done = async (bobId: number, note: string) => {
    await db().from('orders').update({ bobgo_order_id: bobId, bobgo_error: null, status: 'sent_to_bobgo', updated_at: nowIso() }).eq('id', orderId);
    await logEvent(orderId, 'bobgo', note);
    return { ok: true, message: 'Sent to Bob Go' };
  };
  try {
    const s = await getSettings();
    return await done(await createBobGoOrder(o as OrderRow, s), 'Sent to Bob Go');
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    // The order may already exist in Bob Go (e.g. an earlier attempt timed out after Bob Go saved it).
    const existing = await findBobGoOrderId(channelOrderNumber(o.order_number)).catch(() => null);
    if (existing) return done(existing, 'Linked to the order already in Bob Go');
    await db().from('orders').update({ status: 'paid', bobgo_error: msg, updated_at: nowIso() }).eq('id', orderId).eq('status', 'sending');
    await logEvent(orderId, 'bobgo_error', msg);
    return { ok: false, message: msg };
  }
}

// Paid orders that never reached Bob Go (e.g. Bob Go was down). Called by the cron and when the admin opens.
export async function retryBobGo(limit = 5) {
  if (!bobgoConfigured()) return;
  const before = new Date(Date.now() - 120e3).toISOString();
  const { data } = await db().from('orders').select('id').is('bobgo_order_id', null).not('paid_at', 'is', null)
    .in('status', ['paid', 'sending']).lt('updated_at', before).limit(limit);
  for (const r of data || []) await sendToBobGo(r.id);
}
