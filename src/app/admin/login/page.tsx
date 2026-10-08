'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        window.location.href = '/admin';
        return;
      }
      setErr(j.error || `Could not log in (server error ${r.status}). Check Vercel → Deployments → Logs.`);
    } catch {
      setErr('Could not reach the server. Check your connection.');
    }
    setBusy(false);
  }
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--blush)' }}>
      <form onSubmit={submit} className="card" style={{ width: 'min(380px, 100%)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 30 }}>Nuvé admin</div>
        <div className="f"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn" type="submit" disabled={busy || !pw}>{busy ? 'Checking…' : 'Log in'}</button>
      </form>
    </main>
  );
}
