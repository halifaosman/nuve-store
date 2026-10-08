import { NextRequest, NextResponse } from 'next/server';
import { exec, one, now as nowDate } from '@/lib/db';
import { orderNumberFromChannel, webhookSignatureValid } from '@/lib/bobgo';
import { logEvent } from '@/lib/orders';

type Json = Record<string, unknown>;

async function seen(key: string): Promise<boolean> {
  return !!(await one('SELECT `key` FROM processed_webhooks WHERE `key` = ?', [key]));
}
// Recorded only after the update succeeded, so a failed attempt is retried by Bob Go.
async function remember(key: string) {
  await exec('INSERT IGNORE INTO processed_webhooks (`key`) VALUES (?)', [key]);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!webhookSignatureValid(raw, req.headers.get('bobgo-webhook-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const topic = req.headers.get('x-bobgroup-topic') || '';
  let body: Json;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const now = nowDate();

  try {
    if (topic === 'fulfillment/created') {
      const key = `ful:${body.id}`;
      if (await seen(key)) return NextResponse.json({ ok: true });
      const num = orderNumberFromChannel(body.channel_order_number);
      if (num) {
        const o = await one<{ id: string; status: string }>('SELECT id, status FROM orders WHERE order_number = ? AND bobgo_order_id IS NOT NULL', [num]);
        if (o) {
          await exec('UPDATE orders SET tracking_reference = ?, tracking_status = ?, status = ?, updated_at = ? WHERE id = ?', [
            String(body.method_reference || '') || null,
            String(body.method_status || '') || null,
            o.status === 'delivered' ? o.status : 'shipped', now, o.id]);
          await logEvent(o.id, 'shipped', `Fulfilled in Bob Go, tracking ${body.method_reference || 'pending'}`);
        }
      }
      await remember(key);
    } else if (topic === 'tracking/updated') {
      const ref = String(body.shipment_tracking_reference || '');
      const status = String(body.status || '');
      const last = Array.isArray(body.checkpoints) ? (body.checkpoints as Json[]).slice(-1)[0] : null;
      const key = `trk:${ref}:${status}:${last?.time || ''}`;
      if (!ref || (await seen(key))) return NextResponse.json({ ok: true });
      const shipment = (body.shipment || {}) as Json;
      const o = await one<{ id: string; status: string }>('SELECT id, status FROM orders WHERE tracking_reference = ? LIMIT 1', [ref]);
      if (o) {
        await exec('UPDATE orders SET tracking_status = ?, tracking_url = ?, status = ?, updated_at = ? WHERE id = ?', [
          status, (shipment.tracking_url as string) || null,
          status === 'delivered' ? 'delivered' : ['sent_to_bobgo', 'paid'].includes(o.status) ? 'shipped' : o.status,
          now, o.id]);
        await logEvent(o.id, 'tracking', `Courier update: ${body.status_friendly || status}`);
      }
      await remember(key);
    } else if (topic === 'order/updated') {
      if (body.status === 'cancelled') {
        const key = `ord:${body.id}:cancelled`;
        if (!(await seen(key))) {
          const o = await one<{ id: string }>('SELECT id FROM orders WHERE bobgo_order_id = ?', [Number(body.id)]);
          if (o) await logEvent(o.id, 'bobgo', 'Order was cancelled in Bob Go');
          await remember(key);
        }
      }
    }
  } catch (e) {
    console.error('Bob Go webhook failed', topic, e);
    return NextResponse.json({ error: 'Temporary problem, please retry' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
