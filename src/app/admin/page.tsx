'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from './ui';
import { OrdersTable, useOrders } from './orders-table';

const GROUPS = [
  ['', 'All'], ['open', 'To fulfil'], ['eft', 'Pending EFT'], ['unpaid', 'Unpaid'], ['shipped', 'Shipped'], ['closed', 'Expired & cancelled'],
];

export default function Orders() {
  const [group, setGroup] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  // Opening /admin?q=NUV1001 (e.g. from a message) searches straight away.
  useEffect(() => { const v = new URLSearchParams(location.search).get('q'); if (v) { setQ(v); setSearch(v); } }, []);
  const { orders, err } = useOrders(group, search);
  return (
    <AdminShell title="Orders">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {GROUPS.map(([k, l]) => (
          <button key={k} className="ghost" onClick={() => setGroup(k)} style={group === k ? { background: 'var(--ink)', color: 'var(--white)', borderColor: 'var(--ink)' } : undefined}>{l}</button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); setSearch(q); }} style={{ marginLeft: 'auto', display: 'flex', gap: 8 }} className="f">
          <input aria-label="Search orders" placeholder="Order #, name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
          <button className="btn small" type="submit">Search</button>
        </form>
      </div>
      {err && <p className="err">{err}</p>}
      {orders ? <OrdersTable orders={orders} /> : <p className="muted">Loading orders…</p>}
    </AdminShell>
  );
}
