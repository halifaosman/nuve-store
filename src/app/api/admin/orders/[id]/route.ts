import { NextRequest, NextResponse } from 'next/server';
import { exec, one, rows, now } from '@/lib/db';
import { logEvent, markPaid, sendToBobGo } from '@/lib/orders';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const order = await one('SELECT * FROM orders WHERE id = ?', [params.id]);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const events = await rows('SELECT kind, message, created_at FROM order_events WHERE order_id = ? ORDER BY created_at DESC, id DESC', [params.id]);
  // Proofs are private files; this admin-only link streams them (see ./proof/route.ts).
  const popUrl = order.pop_path ? `/api/admin/orders/${order.id}/proof` : null;
  const { access_token: _t, ...rest } = order;
  return NextResponse.json({ order: rest, events, popUrl });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { action, note } = await req.json().catch(() => ({}));
  const id = params.id;
  const o = await one<{ status: string; paid_at: string | null; payment_method: string }>('SELECT status, paid_at, payment_method FROM orders WHERE id = ?', [id]);
  if (!o) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  let message = '';
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
        if (!(await exec("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND paid_at IS NULL", [now(), id])))
          return NextResponse.json({ error: 'A payment just came in for this order, so it was not cancelled. Refresh to see it.' }, { status: 409 });
        await logEvent(id, 'cancelled', 'Cancelled by admin');
        break;
      case 'restore': {
        if (o.status !== 'cancelled' && o.status !== 'expired') return NextResponse.json({ error: 'Only cancelled or expired orders can be restored.' }, { status: 400 });
        if (o.paid_at) {
          await exec("UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ? AND status IN ('cancelled','expired')", [now(), id]);
          await logEvent(id, 'restored', 'Restored by admin (already paid)');
          const r = await sendToBobGo(id);
          message = r.ok ? 'Restored and sent to Bob Go.' : `Restored, but: ${r.message}`;
        } else {
          const s = await getSettings();
          const eft = o.payment_method === 'eft';
          if (eft) {
            await exec("UPDATE orders SET status = 'awaiting_eft', updated_at = ?, expires_at = ? WHERE id = ? AND status IN ('cancelled','expired') AND paid_at IS NULL",
              [now(), new Date(Date.now() + s.eftMinutes * 60e3), id]);
          } else {
            await exec("UPDATE orders SET status = 'pending_payment', updated_at = ?, created_at = ?, expires_at = NULL WHERE id = ? AND status IN ('cancelled','expired') AND paid_at IS NULL",
              [now(), now(), id]);
          }
          await logEvent(id, 'restored', eft ? `Restored by admin with a new ${s.eftMinutes}-minute payment window` : 'Restored by admin');
          message = 'Order restored.';
        }
        break;
      }
      case 'mark_shipped':
        if (!(await exec("UPDATE orders SET status = 'shipped', updated_at = ? WHERE id = ? AND paid_at IS NOT NULL", [now(), id])))
          return NextResponse.json({ error: 'Only paid orders can be marked shipped.' }, { status: 400 });
        await logEvent(id, 'shipped', 'Marked shipped by admin');
        break;
      case 'mark_delivered':
        if (!(await exec("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ? AND paid_at IS NOT NULL", [now(), id])))
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
        await exec('UPDATE orders SET notes = ?, updated_at = ? WHERE id = ?', [text || null, now(), id]);
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
