'use client';
import { useEffect, useState } from 'react';
import { AdminShell, confirmAndDelete } from './ui';
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
  const { orders, err, reload } = useOrders(group, search);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const select = (ids: string[], on: boolean) => setSel((s) => { const n = new Set(s); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; });
  const run = async (body: Record<string, unknown>, what: string) => {
    setNote('');
    try {
      const n = await confirmAndDelete(body, what);
      if (n !== null) { setNote(`Deleted ${n} order${n === 1 ? '' : 's'}.`); setSel(new Set()); reload(); }
    } catch (e) { setNote((e as Error).message); }
  };
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {sel.size > 0 && <>
          <b>{sel.size} selected</b>
          <button className="ghost" style={{ color: 'var(--berry)', borderColor: 'var(--berry)' }} onClick={() => run({ ids: Array.from(sel) }, 'selected orders')}>Delete selected</button>
          <button className="ghost" onClick={() => setSel(new Set())}>Clear selection</button>
        </>}
        <button className="ghost" style={{ marginLeft: 'auto' }} onClick={() => run({ preset: 'dead' }, 'dead orders')} title="Expired or cancelled orders that were never paid">Clean up dead orders</button>
      </div>
      {note && <p style={{ margin: 0, fontWeight: 700 }}>{note}</p>}
      {err && <p className="err">{err}</p>}
      {orders ? <OrdersTable orders={orders} selected={sel} onSelect={select} /> : <p className="muted">Loading orders…</p>}
    </AdminShell>
  );
}
