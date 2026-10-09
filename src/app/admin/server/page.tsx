'use client';
import { useEffect, useState } from 'react';
import { AdminShell, api } from '../ui';

type Field = { key: string; label: string; secret: boolean; kind: 'text' | 'bool' | 'url' | 'password'; help?: string; group: string; value: string; hint: string; isSet: boolean };

export default function ServerSettings() {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [clearPass, setClearPass] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api<{ fields: Field[] }>('/api/admin/env').then((j) => {
    setFields(j.fields);
    setVals(Object.fromEntries(j.fields.map((f) => [f.key, f.secret ? '' : f.value])));
    setClearPass(false);
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (!fields) return <AdminShell title="Server settings">{err ? <p className="err">{err}</p> : <p className="muted">Loading…</p>}</AdminShell>;

  const set = (k: string, v: string) => { setMsg(''); setVals({ ...vals, [k]: v }); };
  const goingLive = fields.filter((f) => f.kind === 'bool' && f.value === 'true' && vals[f.key] === 'false').map((f) => f.group);

  async function waitForRestart() {
    setMsg('Saved. Restarting the store so the new settings load…');
    await new Promise((r) => setTimeout(r, 3000));
    for (let i = 0; i < 20; i++) {
      try { const r = await fetch('/api/admin/env', { cache: 'no-store' }); if (r.ok || r.status === 401) break; } catch { /* still restarting */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setMsg('Saved and the store has restarted with the new settings.');
    await load();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (goingLive.length && !confirm(`You are switching ${goingLive.join(' and ')} to LIVE. Real money and real deliveries will be used from now on. Continue?`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const values: Record<string, unknown> = { ...vals };
      if (clearPass) { values.PAYFAST_PASSPHRASE = ''; values.PAYFAST_PASSPHRASE_CLEAR = true; }
      const r = await api<{ changed: string[]; restarting: boolean }>('/api/admin/env', { method: 'PUT', json: { password: pw, values } });
      setPw('');
      if (!r.changed.length) setMsg('Nothing changed.');
      else if (r.changed.includes('ADMIN_PASSWORD')) { setMsg('Saved. The admin password changed, so please log in again.'); setTimeout(() => { window.location.href = '/admin/login'; }, 4000); }
      else if (r.restarting) await waitForRestart();
      else { setMsg(`Saved: ${r.changed.join(', ')}. Restart the store for it to take effect.`); load(); }
    } catch (e2) { setErr((e2 as Error).message); }
    setBusy(false);
  }

  const groups = Array.from(new Set(fields.map((f) => f.group)));
  const card = { display: 'flex', flexDirection: 'column' as const, gap: 14 };
  return (
    <AdminShell title="Server settings">
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }} noValidate autoComplete="off">
        <p className="muted" style={{ margin: 0 }}>Keys and switches from the server&apos;s <code>.env</code> file. Secret values are hidden: type a new one to replace it, or leave the box empty to keep the current one. The database and internal security keys can only be changed on the server itself.</p>
        {groups.map((g) => (
          <div className="card" style={card} key={g}>
            <b>{g}</b>
            {fields.filter((f) => f.group === g).map((f) => (
              <div className="f" key={f.key}>
                {f.kind === 'bool' ? (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}>
                    <input type="checkbox" checked={vals[f.key] !== 'false'} onChange={(e) => set(f.key, e.target.checked ? 'true' : 'false')} style={{ width: 20, height: 20 }} />
                    {f.label}: <span style={{ color: vals[f.key] === 'false' ? 'var(--berry)' : 'var(--ok)' }}>{vals[f.key] === 'false' ? 'LIVE' : 'test mode'}</span>
                  </label>
                ) : (
                  <>
                    <label htmlFor={f.key}>{f.label} <span className="muted" style={{ fontWeight: 400 }}>({f.key})</span></label>
                    <input
                      id={f.key}
                      type={f.secret ? 'password' : 'text'}
                      autoComplete="new-password"
                      spellCheck={false}
                      placeholder={f.secret ? (f.isSet ? `Current: ${f.hint}. Leave empty to keep.` : 'Not set') : ''}
                      value={vals[f.key] ?? ''}
                      disabled={f.key === 'PAYFAST_PASSPHRASE' && clearPass}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                    {f.key === 'PAYFAST_PASSPHRASE' && f.isSet && (
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                        <input type="checkbox" checked={clearPass} onChange={(e) => { setClearPass(e.target.checked); setMsg(''); }} /> No passphrase (clear it)
                      </label>
                    )}
                  </>
                )}
                {f.help && <span className="muted" style={{ fontSize: 13 }}>{f.help}</span>}
              </div>
            ))}
          </div>
        ))}
        <div className="card" style={{ ...card, borderColor: 'var(--berry)' }}>
          <div className="f">
            <label htmlFor="confirm-pw">Your current admin password (to confirm)</label>
            <input id="confirm-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
          {msg && <p style={{ color: 'var(--ok)', fontWeight: 700, margin: 0 }}>{msg}</p>}
          <button className="btn" type="submit" disabled={busy || !pw} style={{ alignSelf: 'flex-start' }}>{busy ? 'Saving…' : 'Save and restart store'}</button>
          <span className="muted" style={{ fontSize: 13 }}>The store is offline for a few seconds while it restarts. The previous file is kept as <code>.env.bak</code> on the server.</span>
        </div>
      </form>
      <EmailTest />
    </AdminShell>
  );
}

type EmailRow = { ref: string; kind: string; to_addr: string | null; subject: string | null; status: string; attempts: number; error: string | null; updated_at: string };
const KIND: Record<string, string> = { eft: 'Bank details', confirmed: 'Order confirmed', shipped: 'Shipped', delivered: 'Delivered', admin_new: 'New-order alert', admin_proof: 'Proof alert', contact: 'Message copy', reply: 'Reply to customer' };

/** Send a test email, and see what the store has emailed recently. */
function EmailTest() {
  const [d, setD] = useState<{ enabled: boolean; owner: string; recent: EmailRow[] } | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api<{ enabled: boolean; owner: string; recent: EmailRow[] }>('/api/admin/email-test').then((j) => { setD(j); setTo((t) => t || j.owner); }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d) return null;
  async function send() {
    setBusy(true); setNote(null);
    try { await api('/api/admin/email-test', { method: 'POST', json: { to } }); setNote({ ok: true, text: `Sent. Check ${to} (and the spam folder the first time).` }); }
    catch (e) { setNote({ ok: false, text: (e as Error).message }); }
    setBusy(false); load();
  }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 860, marginTop: 18 }}>
      <b>Email</b>
      {!d.enabled ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>Emails are off until you add a Resend API key under <b>Email (Resend)</b> above.</p> : (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Customers get emails for bank transfer details, order confirmation, shipping and delivery. New orders, proofs of payment and messages are sent to {d.owner ? <b>{d.owner}</b> : 'the customer service email in Policies & contact (not set yet)'}.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" aria-label="Send test to" style={{ flex: 1, minWidth: 220 }} />
            <button className="btn small" type="button" onClick={send} disabled={busy || !to}>{busy ? 'Sending…' : 'Send a test email'}</button>
          </div>
          {note && <p style={{ margin: 0, fontWeight: 600, color: note.ok ? 'var(--ok)' : 'var(--berry)' }}>{note.text}</p>}
        </>
      )}
      {d.recent.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Recent emails ({d.recent.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {d.recent.map((r) => (
              <div key={r.ref + r.kind} style={{ fontSize: 13, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                <b style={{ color: r.status === 'sent' ? 'var(--ok)' : r.status === 'failed' ? 'var(--berry)' : 'var(--muted)' }}>{r.status === 'sent' ? 'Sent' : r.status === 'failed' ? `Failed (try ${r.attempts})` : r.status}</b>
                {' · '}{KIND[r.kind] || r.kind}{r.to_addr ? ` to ${r.to_addr}` : ''}{' · '}<span className="muted">{new Date(r.updated_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}</span>
                {r.error && <div className="muted">{r.error}</div>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
