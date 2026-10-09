'use client';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { AdminShell, api, confirmAndDelete, rand, StatusPill, table, td, th, when } from '../ui';

type C = { email: string; name: string; phone: string; city: string; orders: number; paidOrders: number; spent: number; last: string; orderList: { id: string; number: number; status: string; total: number; date: string }[] };

export default function Customers() {
  const [list, setList] = useState<C[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const load = () => api<{ customers: C[] }>('/api/admin/customers').then((j) => setList(j.customers)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async (body: Record<string, unknown>, what: string) => {
    setNote('');
    try { const n = await confirmAndDelete(body, what); if (n !== null) { setNote(`Deleted ${n} order${n === 1 ? '' : 's'}.`); setOpen(null); load(); } }
    catch (e) { setNote((e as Error).message); }
  };
  const neverPaid = (list || []).filter((c) => c.paidOrders === 0 && c.orderList.every((o) => ['expired', 'cancelled'].includes(o.status))).length;
  const s = q.toLowerCase();
  const shown = (list || []).filter((c) => !s || c.email.includes(s) || c.name.toLowerCase().includes(s) || c.phone.includes(s));
  const repeat = (list || []).filter((c) => c.paidOrders > 1).length;
  return (
    <AdminShell title="Customers">
      {list && <p className="muted" style={{ margin: 0 }}>{list.length} customers · {repeat} repeat buyers · {rand(list.reduce((t, c) => t + c.spent, 0))} paid in total</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="f" style={{ maxWidth: 360, flex: 1 }}><input aria-label="Search customers" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="ghost" style={{ marginLeft: 'auto' }} disabled={!neverPaid} onClick={() => run({ preset: 'dead_customers' }, 'customers who never paid')} title="Customers whose orders all expired or were cancelled without payment">
          Delete customers who never paid{neverPaid ? ` (${neverPaid})` : ''}
        </button>
      </div>
      {note && <p style={{ margin: 0, fontWeight: 700 }}>{note}</p>}
      {err && <p className="err">{err}</p>}
      {!list ? <p className="muted">Loading…</p> : !shown.length ? <div className="card muted">No customers yet.</div> : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 14 }}>
          <table style={table}>
            <thead><tr><th style={th}>Customer</th><th style={th}>Phone</th><th style={th}>Area</th><th style={th}>Paid orders</th><th style={th}>Spent</th><th style={th}>Last order</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <Fragment key={c.email}>
                  <tr onClick={() => setOpen(open === c.email ? null : c.email)} style={{ cursor: 'pointer' }}>
                    <td style={td}><div style={{ fontWeight: 700 }}>{c.name}</div><div className="muted" style={{ fontSize: 13 }}>{c.email}</div></td>
                    <td style={td}>{c.phone}</td><td style={td}>{c.city}</td>
                    <td style={td}>{c.paidOrders}{c.orders > c.paidOrders && <span className="muted"> (+{c.orders - c.paidOrders} unpaid)</span>}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{rand(c.spent)}</td><td style={td}>{when(c.last)}</td>
                  </tr>
                  {open === c.email && (
                    <tr><td style={{ ...td, background: 'var(--paper)' }} colSpan={6}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button className="ghost" style={{ color: 'var(--berry)', borderColor: 'var(--berry)' }} onClick={(e) => { e.stopPropagation(); run({ emails: [c.email] }, 'orders for this customer'); }}>
                            Delete customer and all their orders
                          </button>
                        </div>
                        {c.orderList.map((o) => (
                          <div key={o.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Link href={`/admin/orders/${o.id}`} style={{ fontWeight: 800 }}>#{o.number}</Link><StatusPill status={o.status} /><span>{rand(o.total)}</span><span className="muted">{when(o.date)}</span>
                          </div>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
