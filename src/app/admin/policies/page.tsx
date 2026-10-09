'use client';
import { useEffect, useState } from 'react';
import type { SiteSettings } from '@/lib/settings';
import { AdminShell, api } from '../ui';

type Key = 'privacy' | 'terms' | 'shipping';
const FIELD: Record<Key, 'policyPrivacy' | 'policyTerms' | 'policyShipping'> = { privacy: 'policyPrivacy', terms: 'policyTerms', shipping: 'policyShipping' };
const TITLE: Record<Key, string> = { privacy: 'Privacy Policy', terms: 'Terms and Conditions', shipping: 'Shipping Policy' };

export default function Policies() {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [tpl, setTpl] = useState<Record<Key, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api<{ settings: SiteSettings }>('/api/admin/settings').then((j) => setS(j.settings)).catch((e) => setErr(e.message)); }, []);
  // Refresh the template previews whenever business details or delivery days change.
  useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => { api<Record<Key, string>>('/api/admin/policies', { method: 'POST', json: s }).then(setTpl).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [s]);
  if (!s) return <AdminShell title="Policies & contact">{err ? <p className="err">{err}</p> : <p className="muted">Loading…</p>}</AdminShell>;

  const set = (k: keyof SiteSettings, v: unknown) => { setMsg(''); setS({ ...s, [k]: v } as SiteSettings); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(''); setMsg('');
    try { await api('/api/admin/settings', { method: 'PUT', json: s }); setMsg('Saved. The footer and policies on the store are updated.'); }
    catch (e2) { setErr((e2 as Error).message); }
    setBusy(false);
  }
  const missing = [!s.bizLegalName && 'legal name', !s.bizAddress && 'physical address', !s.bizEmail && 'email'].filter(Boolean);
  const card = { display: 'flex', flexDirection: 'column' as const, gap: 14 };

  return (
    <AdminShell title="Policies & contact">
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }} noValidate>
        <p className="muted" style={{ margin: 0 }}>These power the links in the store footer: Track My Order, Contact Us, Shipping Policy, Terms and Conditions and Privacy Policy. Contact form messages arrive under <a href="/admin/messages">Messages</a>.</p>

        <div className="card" style={card}>
          <b>Business details</b>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>South African law (ECTA section 43) requires online shops to show these. They are filled into your policies and footer automatically.</p>
          {missing.length > 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--berry)', fontWeight: 600 }}>Still needed: {missing.join(', ')}.</p>}
          <div className="row2">
            <div className="f"><label htmlFor="bn">Trading name</label><input id="bn" value={s.bizName} onChange={(e) => set('bizName', e.target.value)} /></div>
            <div className="f"><label htmlFor="bl">Legal name (person or company)</label><input id="bl" placeholder="e.g. Nuvé (Pty) Ltd, or your full name" value={s.bizLegalName} onChange={(e) => set('bizLegalName', e.target.value)} /></div>
            <div className="f"><label htmlFor="br">Company registration number (if registered)</label><input id="br" value={s.bizRegNo} onChange={(e) => set('bizRegNo', e.target.value)} /></div>
            <div className="f"><label htmlFor="bv">VAT number (if VAT registered)</label><input id="bv" value={s.bizVatNo} onChange={(e) => set('bizVatNo', e.target.value)} /></div>
            <div className="f"><label htmlFor="be">Customer service email</label><input id="be" type="email" value={s.bizEmail} onChange={(e) => set('bizEmail', e.target.value)} /></div>
            <div className="f"><label htmlFor="bp">Customer service phone / WhatsApp</label><input id="bp" type="tel" value={s.bizPhone} onChange={(e) => set('bizPhone', e.target.value)} /></div>
          </div>
          <div className="f"><label htmlFor="ba">Physical address (for legal notices)</label><textarea id="ba" rows={2} value={s.bizAddress} onChange={(e) => set('bizAddress', e.target.value)} /></div>
        </div>

        {(['shipping', 'terms', 'privacy'] as Key[]).map((k) => {
          const f = FIELD[k];
          const custom = !!(s[f] || '').trim();
          return (
            <div className="card" style={card} key={k}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <b>{TITLE[k]}</b>
                <a href={`/#${k}`} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: 14 }}>View on store</a>
              </div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name={`m-${k}`} checked={!custom} onChange={() => set(f, '')} style={{ width: 20, height: 20, marginTop: 2 }} />
                <span><b style={{ fontWeight: 600 }}>Use the standard template</b><span className="muted" style={{ display: 'block', fontSize: 13 }}>Written for South African online shops and kept in line with your store: delivery days, 30-day guarantee, EFT window and business details update automatically.</span></span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name={`m-${k}`} checked={custom} onChange={() => set(f, tpl?.[k] || '## ' + TITLE[k] + '\n\nWrite your policy here.')} style={{ width: 20, height: 20, marginTop: 2 }} />
                <span><b style={{ fontWeight: 600 }}>Write my own</b><span className="muted" style={{ display: 'block', fontSize: 13 }}>Starts from the template so you can edit it. It won&apos;t update automatically after that.</span></span>
              </label>
              <textarea
                aria-label={TITLE[k]}
                rows={custom ? 18 : 10}
                readOnly={!custom}
                value={custom ? s[f] : tpl?.[k] || 'Loading…'}
                onChange={(e) => set(f, e.target.value)}
                style={{ fontSize: 14, lineHeight: 1.55, background: custom ? 'var(--white)' : 'var(--blush)', color: custom ? 'var(--ink)' : 'var(--muted)' }}
              />
              {custom && <span className="muted" style={{ fontSize: 13 }}>Start a line with <b>## </b> for a heading and <b>- </b> for a bullet. Leave an empty line between paragraphs.</span>}
            </div>
          );
        })}

        <p className="muted" style={{ margin: 0, fontSize: 13 }}>These templates are a sound starting point but not legal advice. If your business has special circumstances, have them checked by a legal professional.</p>
        {err && <p className="err" role="alert">{err}</p>}
        {msg && <p style={{ color: 'var(--ok)', fontWeight: 700, margin: 0 }}>{msg}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </AdminShell>
  );
}
