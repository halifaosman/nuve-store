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
    </AdminShell>
  );
}
