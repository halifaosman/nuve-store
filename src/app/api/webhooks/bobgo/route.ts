import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orderNumberFromChannel, webhookSignatureValid } from '@/lib/bobgo';
import { logEvent } from '@/lib/orders';

type Json = Record<string, unknown>;

async function seen(key: string): Promise<boolean> {
  const { data } = await db().from('processed_webhooks').select('key').eq('key', key).maybeSingle();
  return !!data;
}
// Recorded only after the update succeeded, so a failed attempt is retried by Bob Go.
async function remember(key: string) {
  await db().from('processed_webhooks').upsert({ key });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!webhookSignatureValid(raw, req.headers.get('bobgo-webhook-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const topic = req.headers.get('x-bobgroup-topic') || '';
  let body: Json;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const now = new Date().toISOString();

  try {
    if (topic === 'fulfillment/created') {
      const key = `ful:${body.id}`;
      if (await seen(key)) return NextResponse.json({ ok: true });
      const num = orderNumberFromChannel(body.channel_order_number);
      if (num) {
        const { data: o } = await db().from('orders').select('id, status').eq('order_number', num).not('bobgo_order_id', 'is', null).maybeSingle();
        if (o) {
          const { error } = await db().from('orders').update({
            tracking_reference: String(body.method_reference || '') || null,
            tracking_status: String(body.method_status || '') || null,
            status: o.status === 'delivered' ? o.status : 'shipped', updated_at: now,
          }).eq('id', o.id);
          if (error) throw new Error(error.message);
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
      const { data: o } = await db().from('orders').select('id, status').eq('tracking_reference', ref).maybeSingle();
      if (o) {
        const { error } = await db().from('orders').update({
          tracking_status: status, tracking_url: (shipment.tracking_url as string) || null,
          status: status === 'delivered' ? 'delivered' : ['sent_to_bobgo', 'paid'].includes(o.status) ? 'shipped' : o.status,
          updated_at: now,
        }).eq('id', o.id);
        if (error) throw new Error(error.message);
        await logEvent(o.id, 'tracking', `Courier update: ${body.status_friendly || status}`);
      }
      await remember(key);
    } else if (topic === 'order/updated') {
      if (body.status === 'cancelled') {
        const key = `ord:${body.id}:cancelled`;
        if (!(await seen(key))) {
          const { data: o } = await db().from('orders').select('id').eq('bobgo_order_id', Number(body.id)).maybeSingle();
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
