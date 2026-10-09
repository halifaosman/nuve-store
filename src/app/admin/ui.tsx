'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Waiting for PayFast', awaiting_eft: 'Waiting for EFT', eft_review: 'Proof uploaded', paid: 'Paid', sending: 'Sending to Bob Go',
  sent_to_bobgo: 'In Bob Go', shipped: 'Shipped', delivered: 'Delivered', expired: 'Expired', cancelled: 'Cancelled',
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill st-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export const rand = (n: number | string) => 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const when = (d: string) => new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: 'no-store',
  });
  if (res.status === 401) { window.location.href = '/admin/login'; throw new Error('Please log in again.'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'Something went wrong.');
  return j as T;
}

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span style={{ color: 'var(--berry)', fontWeight: 800 }}>Expired</span>;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: m < 5 ? 'var(--berry)' : 'var(--ink)' }}>{m}:{String(s).padStart(2, '0')} left</span>;
}

const NAV = [
  { href: '/admin', label: 'Orders' },
  { href: '/admin/eft', label: 'Pending EFT', badge: 'eft' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/messages', label: 'Messages', badge: 'messages' },
  { href: '/admin/content', label: 'Page content' },
  { href: '/admin/badge', label: 'Badges & payments' },
  { href: '/admin/policies', label: 'Policies & contact' },
  { href: '/admin/settings', label: 'Store settings' },
];

export function AdminShell({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const path = usePathname();
  const [sum, setSum] = useState<{ eft: number; review: number; toShip: number; bobgoErrors: number; messages?: number } | null>(null);
  useEffect(() => {
    const load = () => api<{ eft: number; review: number; toShip: number; bobgoErrors: number; messages?: number }>('/api/admin/summary').then(setSum).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <header style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 20, minHeight: 60, flexWrap: 'wrap' }}>
          <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--sand)', textDecoration: 'none', fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}><img src="/brand/nuve-logo-white.svg" alt="Nuvé" style={{ height: 26, width: 'auto', display: 'block' }} />Admin</Link>
          <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {NAV.map((n) => {
              const on = n.href === '/admin' ? path === '/admin' || path.startsWith('/admin/orders') : path.startsWith(n.href);
              const count = !sum ? 0 : n.badge === 'eft' ? sum.eft + sum.review : n.badge === 'messages' ? sum.messages || 0 : 0;
              return (
                <Link key={n.href} href={n.href} style={{ color: on ? 'var(--ink)' : '#E8DDD6', background: on ? 'var(--paper)' : 'transparent', padding: '8px 12px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {n.label}{count > 0 && <span style={{ background: 'var(--berry)', color: 'var(--white)', borderRadius: 999, fontSize: 11, padding: '1px 7px' }}>{count}</span>}
                </Link>
              );
            })}
          </nav>
          <a href="/" target="_blank" rel="noopener noreferrer" style={{ color: '#E8DDD6', fontSize: 14 }}>View store</a>
          <button className="ghost" style={{ color: 'var(--paper)', borderColor: '#4A3D37' }} onClick={async () => { await fetch('/api/admin/logout', { method: 'POST' }); window.location.href = '/admin/login'; }}>Log out</button>
        </div>
      </header>
      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 20px 80px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 32 }}>{title}</h1>
          {actions}
        </div>
        {sum && sum.bobgoErrors > 0 && (
          <div className="card" style={{ borderColor: 'var(--berry)', background: 'var(--berry-tint)' }}>
            <b>{sum.bobgoErrors} paid order{sum.bobgoErrors === 1 ? '' : 's'} could not be sent to Bob Go.</b> Open the order and press &ldquo;Send to Bob Go&rdquo; to retry.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: 'var(--white)', fontSize: 14 };
export const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--line)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', whiteSpace: 'nowrap' };
export const td: React.CSSProperties = { padding: '12px', borderBottom: '1px solid var(--line)', verticalAlign: 'middle' };
