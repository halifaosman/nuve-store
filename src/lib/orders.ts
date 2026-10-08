import { exec, insert, one, rows, tx, now } from './db';
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
  await insert('order_events', { order_id: orderId, kind, message });
}

const UNPAID_PAYFAST_HOURS = 3;

// Unpaid EFT orders expire at expires_at; abandoned PayFast checkouts expire after 3 hours.
export async function expireStale() {
  await tx(async (c) => {
    const due = await rows<{ id: string; status: string }>(
      `SELECT id, status FROM orders
        WHERE paid_at IS NULL
          AND ((status = 'awaiting_eft' AND expires_at < UTC_TIMESTAMP(3))
            OR (status = 'pending_payment' AND created_at < UTC_TIMESTAMP(3) - INTERVAL ${UNPAID_PAYFAST_HOURS} HOUR))
        FOR UPDATE SKIP LOCKED`, [], c);
    if (!due.length) return;
    await exec(`UPDATE orders SET status = 'expired', updated_at = ? WHERE id IN (?) AND paid_at IS NULL`, [now(), due.map((d) => d.id)], c);
    await exec('INSERT INTO order_events (order_id, kind, message) VALUES ?', [due.map((d) => [
      d.id, 'expired', d.status === 'awaiting_eft' ? 'EFT payment window ended without payment' : 'PayFast checkout was not completed',
    ])], c);
  });
}

export type PaidResult = { ok: boolean; message: string };

/**
 * Marks an order paid exactly once (the update only succeeds while paid_at is empty), then sends it to Bob Go.
 * A payment that arrives on a cancelled order is recorded but the order stays cancelled for the admin to decide.
 */
export async function markPaid(orderId: string, how: string, extra: { pf_payment_id?: string } = {}, opts: { allowCancelled?: boolean } = {}): Promise<PaidResult> {
  const pf = extra.pf_payment_id ?? null;
  const changed = await exec(
    `UPDATE orders SET status = 'paid', paid_at = ?, updated_at = ?, pf_payment_id = COALESCE(?, pf_payment_id)
      WHERE id = ? AND paid_at IS NULL${opts.allowCancelled ? '' : " AND status <> 'cancelled'"}`,
    [now(), now(), pf, orderId]);

  if (!changed) {
    const o = await one<{ status: string; paid_at: string | null }>('SELECT status, paid_at FROM orders WHERE id = ?', [orderId]);
    if (!o) return { ok: false, message: 'Order not found' };
    if (o.paid_at) return { ok: true, message: 'Already marked paid' };
    if (o.status === 'cancelled') {
      await exec('UPDATE orders SET paid_at = ?, updated_at = ?, pf_payment_id = COALESCE(?, pf_payment_id) WHERE id = ? AND paid_at IS NULL', [now(), now(), pf, orderId]);
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
 * A claim older than 2 minutes counts as abandoned (e.g. the server restarted mid-send) and may be retried.
 */
export async function sendToBobGo(orderId: string): Promise<PaidResult> {
  if (!bobgoConfigured()) {
    await exec("UPDATE orders SET bobgo_error = 'Bob Go API key is not set' WHERE id = ? AND bobgo_order_id IS NULL", [orderId]);
    return { ok: false, message: 'Bob Go API key is not set, so the order was not sent.' };
  }
  const claimed = await exec(
    `UPDATE orders SET status = 'sending', updated_at = ?
      WHERE id = ? AND bobgo_order_id IS NULL AND paid_at IS NOT NULL
        AND (status = 'paid' OR (status = 'sending' AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE))`,
    [now(), orderId]);
  if (!claimed) {
    const cur = await one<{ bobgo_order_id: number | null; status: string; paid_at: string | null }>(
      'SELECT bobgo_order_id, status, paid_at FROM orders WHERE id = ?', [orderId]);
    if (cur?.bobgo_order_id) return { ok: true, message: 'Already in Bob Go' };
    if (!cur?.paid_at) return { ok: false, message: 'Only paid orders go to Bob Go' };
    if (cur.status === 'sending') return { ok: true, message: 'Already being sent to Bob Go' };
    return { ok: false, message: `Order is ${cur.status}, so it was not sent` };
  }
  const o = (await one<OrderRow>('SELECT * FROM orders WHERE id = ?', [orderId]))!;

  const done = async (bobId: number, note: string) => {
    await exec("UPDATE orders SET bobgo_order_id = ?, bobgo_error = NULL, status = 'sent_to_bobgo', updated_at = ? WHERE id = ?", [bobId, now(), orderId]);
    await logEvent(orderId, 'bobgo', note);
    return { ok: true, message: 'Sent to Bob Go' };
  };
  try {
    const s = await getSettings();
    return await done(await createBobGoOrder(o, s), 'Sent to Bob Go');
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    // The order may already exist in Bob Go (e.g. an earlier attempt timed out after Bob Go saved it).
    const existing = await findBobGoOrderId(channelOrderNumber(o.order_number)).catch(() => null);
    if (existing) return done(existing, 'Linked to the order already in Bob Go');
    await exec("UPDATE orders SET status = 'paid', bobgo_error = ?, updated_at = ? WHERE id = ? AND status = 'sending'", [msg, now(), orderId]);
    await logEvent(orderId, 'bobgo_error', msg);
    return { ok: false, message: msg };
  }
}

// Paid orders that never reached Bob Go (e.g. Bob Go was down). Called by the cron and when the admin opens.
export async function retryBobGo(limit = 5) {
  if (!bobgoConfigured()) return;
  const due = await rows<{ id: string }>(
    `SELECT id FROM orders WHERE bobgo_order_id IS NULL AND paid_at IS NOT NULL AND status IN ('paid','sending')
      AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE ORDER BY updated_at LIMIT ?`, [limit]);
  for (const r of due) await sendToBobGo(r.id);
}
