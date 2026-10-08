'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, Countdown, rand, StatusPill, table, td, th, when } from './ui';

export type OrderLite = {
  id: string; order_number: number; status: string; payment_method: string; customer_first: string; customer_last: string;
  email: string; phone: string; total: number; created_at: string; expires_at: string | null; pop_path: string | null;
  bobgo_order_id: number | null; bobgo_error: string | null; tracking_reference: string | null;
};

export function useOrders(group: string, q: string) {
  const [orders, setOrders] = useState<OrderLite[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (group) p.set('group', group);
    if (q) p.set('q', q);
    api<{ orders: OrderLite[] }>(`/api/admin/orders?${p}`).then((j) => { setOrders(j.orders); setErr(''); }).catch((e) => setErr(e.message));
  }, [group, q]);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  return { orders, err, reload: load };
}

export function OrdersTable({ orders, showTimer }: { orders: OrderLite[]; showTimer?: boolean }) {
  if (!orders.length) return <div className="card muted">No orders here yet.</div>;
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 14 }}>
      <table style={table}>
        <thead><tr>
          <th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Status</th><th style={th}>Payment</th>
          {showTimer && <th style={th}>Time left</th>}<th style={th}>Total</th><th style={th}>Placed</th><th style={th}>Bob Go</th>
        </tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td style={td}><Link href={`/admin/orders/${o.id}`} style={{ fontWeight: 800 }}>#{o.order_number}</Link></td>
              <td style={td}><div style={{ fontWeight: 700 }}>{o.customer_first} {o.customer_last}</div><div className="muted" style={{ fontSize: 13 }}>{o.email}</div></td>
              <td style={td}><StatusPill status={o.status} />{o.pop_path && o.status === 'eft_review' && <div style={{ fontSize: 12, marginTop: 4 }}>Proof attached</div>}</td>
              <td style={td}>{o.payment_method === 'eft' ? 'Bank transfer' : 'PayFast'}</td>
              {showTimer && <td style={td}>{o.status === 'awaiting_eft' && o.expires_at ? <Countdown to={o.expires_at} /> : '—'}</td>}
              <td style={{ ...td, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{rand(o.total)}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(o.created_at)}</td>
              <td style={td}>{o.bobgo_order_id ? (o.tracking_reference || 'Sent') : o.bobgo_error ? <span style={{ color: 'var(--berry)', fontWeight: 700 }}>Failed</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
