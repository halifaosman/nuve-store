import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logEvent, markPaid, sendToBobGo } from '@/lib/orders';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data: order } = await db().from('orders').select('*').eq('id', params.id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const { data: events } = await db().from('order_events').select('kind, message, created_at').eq('order_id', params.id).order('created_at', { ascending: false });
  let popUrl: string | null = null;
  if (order.pop_path) {
    const s = await db().storage.from('proofs').createSignedUrl(order.pop_path, 600);
    popUrl = s.data?.signedUrl || null;
  }
  const { access_token: _t, ...rest } = order;
  return NextResponse.json({ order: rest, events: events || [], popUrl });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { action, note } = await req.json().catch(() => ({}));
  const id = params.id;
  const { data: o } = await db().from('orders').select('status, paid_at, payment_method').eq('id', id).maybeSingle();
  if (!o) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const now = new Date().toISOString();
  let message = '';
  const changed = async (q: PromiseLike<{ data: unknown[] | null }>) => !!((await q).data?.length);
  try {
    switch (action) {
      case 'mark_paid': {
        const r = await markPaid(id, 'marked paid by admin after checking the bank account');
        if (!r.ok) return NextResponse.json({ error: `Marked paid, but: ${r.message}` }, { status: 502 });
        message = r.message === 'Sent to Bob Go' ? 'Marked paid and sent to Bob Go.' : `Marked paid. ${r.message}.`;
        break;
      }
      case 'cancel':
        if (o.paid_at) return NextResponse.json({ error: 'This order is paid. Refund the customer first, then cancel it in Bob Go too.' }, { status: 400 });
        if (!(await changed(db().from('orders').update({ status: 'cancelled', updated_at: now }).eq('id', id).is('paid_at', null).select('id'))))
          return NextResponse.json({ error: 'A payment just came in for this order, so it was not cancelled. Refresh to see it.' }, { status: 409 });
        await logEvent(id, 'cancelled', 'Cancelled by admin');
        break;
      case 'restore': {
        if (o.status !== 'cancelled' && o.status !== 'expired') return NextResponse.json({ error: 'Only cancelled or expired orders can be restored.' }, { status: 400 });
        if (o.paid_at) {
          await db().from('orders').update({ status: 'paid', updated_at: now }).eq('id', id).in('status', ['cancelled', 'expired']);
          await logEvent(id, 'restored', 'Restored by admin (already paid)');
          const r = await sendToBobGo(id);
          message = r.ok ? 'Restored and sent to Bob Go.' : `Restored, but: ${r.message}`;
        } else {
          const s = await getSettings();
          const eft = o.payment_method === 'eft';
          await db().from('orders').update({
            status: eft ? 'awaiting_eft' : 'pending_payment', updated_at: now, created_at: eft ? undefined : now,
            expires_at: eft ? new Date(Date.now() + s.eftMinutes * 60e3).toISOString() : null,
          }).eq('id', id).in('status', ['cancelled', 'expired']);
          await logEvent(id, 'restored', eft ? `Restored by admin with a new ${s.eftMinutes}-minute payment window` : 'Restored by admin');
          message = 'Order restored.';
        }
        break;
      }
      case 'mark_shipped':
        if (!(await changed(db().from('orders').update({ status: 'shipped', updated_at: now }).eq('id', id).not('paid_at', 'is', null).select('id'))))
          return NextResponse.json({ error: 'Only paid orders can be marked shipped.' }, { status: 400 });
        await logEvent(id, 'shipped', 'Marked shipped by admin');
        break;
      case 'mark_delivered':
        if (!(await changed(db().from('orders').update({ status: 'delivered', updated_at: now }).eq('id', id).not('paid_at', 'is', null).select('id'))))
          return NextResponse.json({ error: 'Only paid orders can be marked delivered.' }, { status: 400 });
        await logEvent(id, 'delivered', 'Marked delivered by admin');
        break;
      case 'send_bobgo': {
        const r = await sendToBobGo(id);
        if (!r.ok) return NextResponse.json({ error: r.message }, { status: 502 });
        message = r.message + '.';
        break;
      }
      case 'note': {
        const text = String(note || '').trim().slice(0, 2000);
        await db().from('orders').update({ notes: text || null, updated_at: now }).eq('id', id);
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That did not work' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message });
}
