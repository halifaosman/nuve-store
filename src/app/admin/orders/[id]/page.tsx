'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell, api, confirmAndDelete, Countdown, rand, StatusPill, when } from '../../ui';

type Order = Record<string, unknown> & {
  id: string; order_number: number; status: string; payment_method: string; total: number; subtotal: number; shipping_cost: number; shipping_method: string;
  customer_first: string; customer_last: string; email: string; phone: string; address_company: string | null; address_street: string; address_suburb: string;
  address_city: string; address_province: string; address_postal: string; items: { description: string; qty: number; pack_price?: number; unit_price: number }[];
  expires_at: string | null; paid_at: string | null; pf_payment_id: string | null; pop_path: string | null; bobgo_order_id: number | null; bobgo_error: string | null;
  tracking_reference: string | null; tracking_status: string | null; tracking_url: string | null; notes: string | null; created_at: string;
};
type Ev = { kind: string; message: string; created_at: string };

export default function OrderDetail({ params }: { params: { id: string } }) {
  const [o, setO] = useState<Order | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [popUrl, setPopUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(() => {
    api<{ order: Order; events: Ev[]; popUrl: string | null }>(`/api/admin/orders/${params.id}`)
      .then((j) => { setO(j.order); setEvents(j.events); setPopUrl(j.popUrl); setNote((j.order.notes as string) || ''); })
      .catch((e) => setErr(e.message));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  async function act(action: string, done: string) {
    setBusy(action); setErr(''); setMsg('');
    try { const r = await api<{ message?: string }>(`/api/admin/orders/${params.id}`, { method: 'POST', json: { action, note } }); setMsg(r.message || done); load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(''); setConfirmCancel(false);
  }

  if (!o) return <AdminShell title="Order">{err ? <p className="err">{err}</p> : <p className="muted">Loading…</p>}</AdminShell>;
  const unpaid = !o.paid_at && !['cancelled'].includes(o.status);

  return (
    <AdminShell title={`Order #${o.order_number}`} actions={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <StatusPill status={o.status} />
      <button className="ghost" style={{ color: 'var(--berry)', borderColor: 'var(--berry)' }} onClick={async () => {
        try { const n = await confirmAndDelete({ ids: [o.id] }, 'order'); if (n) window.location.href = '/admin'; } catch (e) { setErr((e as Error).message); }
      }}>Delete order</button>
    </div>}>
      {msg && <div className="card" style={{ borderColor: 'var(--ok)' }}>{msg}</div>}
      {err && <div className="card" style={{ borderColor: 'var(--berry)' }}><p className="err">{err}</p></div>}
      {['cancelled', 'expired'].includes(o.status) && (
        <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{o.paid_at ? 'A payment came in for this order after it closed. Refund the customer, or restore it to ship it.' : `This order is ${o.status}.`}</span>
          <button className="ghost" disabled={!!busy} onClick={() => act('restore', 'Order restored.')}>{busy === 'restore' ? 'Restoring…' : 'Restore order'}</button>
        </div>
      )}
      <div className="co">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {o.payment_method === 'eft' && unpaid && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderColor: 'var(--berry)' }}>
              <b>Bank transfer: reference NUV{o.order_number}, amount {rand(o.total)}</b>
              {o.status === 'awaiting_eft' && o.expires_at && <div>Expires in <Countdown to={o.expires_at} /></div>}
              {o.status === 'expired' && <div className="muted">This order expired. If the money did arrive, you can still mark it paid.</div>}
              {popUrl ? (
                <div><a href={popUrl} target="_blank" rel="noopener noreferrer" className="btn small">Open proof of payment</a></div>
              ) : <div className="muted">No proof of payment uploaded yet.</div>}
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>Only mark it paid once you see the money in your bank account. A screenshot alone can be faked.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn small" disabled={!!busy} onClick={() => act('mark_paid', 'Marked paid.')}>{busy === 'mark_paid' ? 'Saving…' : 'Mark as paid'}</button>
                {!confirmCancel
                  ? <button className="ghost" disabled={!!busy} onClick={() => setConfirmCancel(true)}>Cancel order</button>
                  : <button className="ghost" style={{ borderColor: 'var(--berry)', color: 'var(--berry)' }} onClick={() => act('cancel', 'Order cancelled.')}>Confirm cancel</button>}
              </div>
            </div>
          )}

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <b>Items</b>
            {o.items.map((i, k) => <div key={k} className="sumline"><span>{i.description}</span><span>{rand(i.pack_price ?? i.unit_price * i.qty)}</span></div>)}
            <div className="sumline"><span>Delivery: {o.shipping_method}</span><span>{rand(o.shipping_cost)}</span></div>
            <div className="sumline total"><span>Total</span><span>{rand(o.total)}</span></div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <b>Fulfilment (Bob Go)</b>
            {o.bobgo_order_id ? <div>In Bob Go as order <b>{o.bobgo_order_id}</b>. Fulfil it from your Bob Go dashboard.</div> : <div className="muted">Not sent to Bob Go yet.</div>}
            {o.bobgo_error && !o.bobgo_order_id && <p className="err">Last attempt failed: {o.bobgo_error}</p>}
            {o.tracking_reference && <div>Tracking: <b>{o.tracking_reference}</b> {o.tracking_status && `(${o.tracking_status})`} {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noopener noreferrer">Open tracking</a>}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {o.paid_at && !o.bobgo_order_id && !['cancelled'].includes(o.status) && <button className="btn small" disabled={!!busy} onClick={() => act('send_bobgo', 'Sent to Bob Go.')}>{busy === 'send_bobgo' ? 'Sending…' : 'Send to Bob Go'}</button>}
              {o.paid_at && !['shipped', 'delivered'].includes(o.status) && <button className="ghost" disabled={!!busy} onClick={() => act('mark_shipped', 'Marked shipped.')}>Mark shipped</button>}
              {o.paid_at && o.status !== 'delivered' && <button className="ghost" disabled={!!busy} onClick={() => act('mark_delivered', 'Marked delivered.')}>Mark delivered</button>}
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <b>History</b>
            {events.map((e, k) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10, fontSize: 14 }}>
                <span className="muted">{when(e.created_at)}</span><span>{e.message}</span>
              </div>
            ))}
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowWrap: 'anywhere' }}>
            <b>Customer</b>
            <div>{o.customer_first} {o.customer_last}</div>
            <div><a href={`mailto:${o.email}`}>{o.email}</a></div>
            <div>{o.phone}</div>
            <b style={{ marginTop: 10 }}>Delivery address</b>
            {o.address_company && <div>{o.address_company}</div>}
            <div>{o.address_street}</div>
            <div>{o.address_suburb}, {o.address_city}</div>
            <div>{o.address_province}, {o.address_postal}</div>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b>Payment</b>
            <div>{o.payment_method === 'eft' ? 'Bank transfer' : 'PayFast'}</div>
            <div className="muted" style={{ fontSize: 14 }}>Placed {when(o.created_at)}</div>
            {o.paid_at && <div className="muted" style={{ fontSize: 14 }}>Paid {when(o.paid_at)}</div>}
            {o.pf_payment_id && <div className="muted" style={{ fontSize: 14 }}>PayFast ID {o.pf_payment_id}</div>}
          </div>
          <div className="card f" style={{ gap: 8 }}>
            <label htmlFor="note">Private notes</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="ghost" style={{ alignSelf: 'flex-start' }} disabled={!!busy} onClick={() => act('note', 'Notes saved.')}>Save notes</button>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
