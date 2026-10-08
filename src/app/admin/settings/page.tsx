'use client';
import { useEffect, useState } from 'react';
import type { SiteSettings, Bundle } from '@/lib/settings';
import { AdminShell, api } from '../ui';

type Status = { siteUrl: string; payfastSandbox: boolean; bobgoSandbox: boolean; bobgoKey: boolean; bobgoWebhookSecret: boolean };
const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

const TEXT: [keyof SiteSettings, string, boolean?][] = [
  ['announcement', 'Top banner'], ['headline', 'Main headline'], ['subhead', 'Product description', true],
  ['featTitle', 'Featured reviews heading'], ['videoHeading', 'Video section heading'], ['videoSub', 'Video section line'],
  ['photoHeading', 'Photo review cards heading'], ['stripLabel', 'Photo strip badge'], ['reviewsHeading', 'Review list heading'], ['shipping', 'Shipping & returns text', true],
];

async function uploadPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Use a JPG, PNG or WebP photo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Photos must be under 10 MB.');
  const fd = new FormData();
  fd.append('file', file);
  return (await api<{ path: string }>('/api/admin/upload', { method: 'POST', body: fd })).path;
}
const media = (p: string) => (/^https?:|^\//.test(p) ? p : `/media/${p}`);

function Dot({ ok }: { ok: boolean }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 99, background: ok ? 'var(--ok)' : 'var(--berry)', marginRight: 8 }} />;
}

export default function Settings() {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api<{ settings: SiteSettings; status: Status }>('/api/admin/settings').then((j) => { setS(j.settings); setSt(j.status); }).catch((e) => setErr(e.message)); }, []);
  if (!s) return <AdminShell title="Store settings">{err ? <p className="err">{err}</p> : <p className="muted">Loading…</p>}</AdminShell>;

  const set = (k: keyof SiteSettings, v: unknown) => setS({ ...s, [k]: v } as SiteSettings);
  const setB = (i: number, k: keyof Bundle, v: string) => { const b = s.bundles.map((x, j) => (j === i ? { ...x, [k]: ['qty', 'price', 'compare'].includes(k) ? Number(v) : v } : x)); set('bundles', b); };
  const setC = (k: keyof SiteSettings['collection'], v: string) => set('collection', { ...s.collection, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(''); setMsg('');
    try { await api('/api/admin/settings', { method: 'PUT', json: s }); setMsg('Saved. The store shows the changes straight away.'); }
    catch (e2) { setErr((e2 as Error).message); }
    setBusy(false);
  }

  const card = { display: 'flex', flexDirection: 'column' as const, gap: 14 };
  return (
    <AdminShell title="Store settings">
      {st && (
        <div className="card" style={{ ...card, gap: 8 }}>
          <b>Connections</b>
          <div><Dot ok={!st.payfastSandbox} />PayFast is in <b>{st.payfastSandbox ? 'test (sandbox)' : 'live'}</b> mode</div>
          <div><Dot ok={st.bobgoKey} />Bob Go API key {st.bobgoKey ? `connected (${st.bobgoSandbox ? 'sandbox' : 'live'})` : 'not set: orders will not reach Bob Go'}</div>
          <div><Dot ok={st.bobgoWebhookSecret} />Bob Go tracking updates {st.bobgoWebhookSecret ? 'verified with your webhook secret' : 'not set up yet'}</div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>In Bob Go, add a webhook for the topics <b>fulfillment/created</b>, <b>tracking/updated</b> and <b>order/updated</b> with the address <code>{st.siteUrl}/api/webhooks/bobgo</code>. Keys and secrets live in the .env file on the server, not here.</p>
        </div>
      )}
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }} noValidate>
        <div className="card" style={card}>
          <b>Packs and prices (Rand)</b>
          {s.bundles.map((b, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1.2fr 1.6fr 90px 90px 1fr', gap: 8, alignItems: 'end' }} className="f">
              <div className="f"><label htmlFor={`bq${i}`}>Qty</label><input id={`bq${i}`} type="number" min={1} value={b.qty} onChange={(e) => setB(i, 'qty', e.target.value)} /></div>
              <div className="f"><label htmlFor={`bl${i}`}>Name</label><input id={`bl${i}`} value={b.label} onChange={(e) => setB(i, 'label', e.target.value)} /></div>
              <div className="f"><label htmlFor={`bs${i}`}>Line under it</label><input id={`bs${i}`} value={b.sub} onChange={(e) => setB(i, 'sub', e.target.value)} /></div>
              <div className="f"><label htmlFor={`bp${i}`}>Price</label><input id={`bp${i}`} type="number" min={5} value={b.price} onChange={(e) => setB(i, 'price', e.target.value)} /></div>
              <div className="f"><label htmlFor={`bc${i}`}>Was</label><input id={`bc${i}`} type="number" min={0} value={b.compare} onChange={(e) => setB(i, 'compare', e.target.value)} /></div>
              <div className="f"><label htmlFor={`bt${i}`}>Badge</label><input id={`bt${i}`} value={b.tag} onChange={(e) => setB(i, 'tag', e.target.value)} /></div>
            </div>
          ))}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Only show a &ldquo;Was&rdquo; price you have genuinely charged. Leave it 0 to hide it.</p>
        </div>

        <div className="card" style={card}>
          <b>Bank transfer (EFT)</b>
          <div className="row2">
            <div className="f"><label htmlFor="bn">Bank</label><input id="bn" value={s.bankName} onChange={(e) => set('bankName', e.target.value)} /></div>
            <div className="f"><label htmlFor="ba">Account name</label><input id="ba" value={s.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} /></div>
            <div className="f"><label htmlFor="bnum">Account number</label><input id="bnum" value={s.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} /></div>
            <div className="f"><label htmlFor="bb">Branch code</label><input id="bb" value={s.bankBranchCode} onChange={(e) => set('bankBranchCode', e.target.value)} /></div>
            <div className="f"><label htmlFor="bt">Account type</label><input id="bt" value={s.bankAccountType} onChange={(e) => set('bankAccountType', e.target.value)} /></div>
            <div className="f"><label htmlFor="em">Minutes before an unpaid EFT order expires</label><input id="em" type="number" min={5} value={s.eftMinutes} onChange={(e) => set('eftMinutes', Number(e.target.value))} /></div>
          </div>
          <div className="f"><label htmlFor="pe">Email for proof of payment if upload fails (optional)</label><input id="pe" type="email" value={s.popEmail} onChange={(e) => set('popEmail', e.target.value)} /></div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>The EFT option only appears at checkout once bank, account name, number and branch code are filled in.</p>
        </div>

        <div className="card" style={card}>
          <b>Shipping (Bob Go)</b>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Your collection address is where the courier picks up. Bob Go uses it with the customer&apos;s address to price delivery.</p>
          <div className="row2">
            <div className="f"><label htmlFor="cc">Business name</label><input id="cc" value={s.collection.company} onChange={(e) => setC('company', e.target.value)} /></div>
            <div className="f"><label htmlFor="cs">Street address</label><input id="cs" value={s.collection.street_address} onChange={(e) => setC('street_address', e.target.value)} /></div>
            <div className="f"><label htmlFor="cl">Suburb</label><input id="cl" value={s.collection.local_area} onChange={(e) => setC('local_area', e.target.value)} /></div>
            <div className="f"><label htmlFor="ci">City</label><input id="ci" value={s.collection.city} onChange={(e) => setC('city', e.target.value)} /></div>
            <div className="f"><label htmlFor="cz">Province</label><select id="cz" value={s.collection.zone} onChange={(e) => setC('zone', e.target.value)}><option value="">Choose…</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="f"><label htmlFor="cp">Postal code</label><input id="cp" value={s.collection.code} onChange={(e) => setC('code', e.target.value)} /></div>
          </div>
          <div className="row3">
            <div className="f"><label htmlFor="w">Weight per SnapBun (kg)</label><input id="w" type="number" step="0.01" value={s.unitWeightKg} onChange={(e) => set('unitWeightKg', Number(e.target.value))} /></div>
            <div className="f"><label htmlFor="hd">Handling time (business days)</label><input id="hd" type="number" min={0} value={s.handlingDays} onChange={(e) => set('handlingDays', Number(e.target.value))} /></div>
            <div className="f"><label htmlFor="dl">Size per unit L × W × H (cm)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input aria-label="Length" type="number" value={s.unitLengthCm} onChange={(e) => set('unitLengthCm', Number(e.target.value))} />
                <input aria-label="Width" type="number" value={s.unitWidthCm} onChange={(e) => set('unitWidthCm', Number(e.target.value))} />
                <input aria-label="Height" type="number" value={s.unitHeightCm} onChange={(e) => set('unitHeightCm', Number(e.target.value))} />
              </div></div>
          </div>
          <div className="row2">
            <div className="f"><label htmlFor="fn">Fallback delivery name</label><input id="fn" value={s.fallbackShippingName} onChange={(e) => set('fallbackShippingName', e.target.value)} /></div>
            <div className="f"><label htmlFor="fp">Fallback delivery price (R)</label><input id="fp" type="number" value={s.fallbackShippingPrice} onChange={(e) => set('fallbackShippingPrice', Number(e.target.value))} /></div>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>The fallback price is charged if Bob Go can&apos;t return rates (e.g. before your key and address are set).</p>
        </div>

        <div className="card" style={card}>
          <b>Trust badge (under Add to cart)</b>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Leave the headline empty to hide the badge. Only claim numbers that are true.</p>
          <div className="f"><label htmlFor="tt">Headline</label><input id="tt" placeholder="Trusted by 1,200+ customers" value={s.trustTitle} onChange={(e) => set('trustTitle', e.target.value)} /></div>
          <div className="f"><label htmlFor="tx">Line under it</label><input id="tx" placeholder="who switched to a 5-second bun" value={s.trustText} onChange={(e) => set('trustText', e.target.value)} /></div>
          <div className="f">
            <label>Customer photos (up to 3, square works best)</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[0, 1, 2].map((i) => {
                const p = (s.trustAvatars || [])[i];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'var(--blush)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: 'var(--soft)', fontSize: 12 }}>
                      {p ? <img src={media(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : `Photo ${i + 1}`}
                    </div>
                    <label className="ghost" style={{ display: "inline-flex", alignItems: "center", color: "var(--ink)" }}>
                      {p ? 'Replace' : 'Upload'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
                        const f = e.target.files?.[0]; e.target.value = '';
                        if (!f) return;
                        setErr('');
                        try {
                          const path = await uploadPhoto(f);
                          const list = [...(s.trustAvatars || [])];
                          if (i < list.length) list[i] = path; else list.push(path);
                          set('trustAvatars', list.slice(0, 3));
                        } catch (e2) { setErr((e2 as Error).message); }
                      }} />
                    </label>
                    {p && <button type="button" className="ghost" style={{ color: "var(--muted)" }} onClick={() => set('trustAvatars', (s.trustAvatars || []).filter((_, j) => j !== i))}>Remove</button>}
                  </div>
                );
              })}
            </div>
            <span className="muted" style={{ fontSize: 13 }}>No photos? It uses photos from your reviews instead. Use real customers&apos; photos, with their permission.</span>
          </div>
          {(s.trustTitle || s.trustCount) && (
            <div>
              <span className="muted" style={{ fontSize: 13 }}>Preview</span>
              <div className="trust" style={{ marginTop: 6, maxWidth: 520 }}>
                {(s.trustAvatars || []).length > 0 && (
                  <div className="avs">
                    {s.trustAvatars.map((p, i) => <img key={i} src={media(p)} alt="" />)}
                    <span className="avs-tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  </div>
                )}
                <div><b>{s.trustTitle || `Trusted by ${s.trustCount} customers`}</b><span>{s.trustText}</span></div>
              </div>
            </div>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Press <b>Save settings</b> at the bottom to put it on the store.</p>
        </div>

        <div className="card" style={card}>
          <b>Page text</b>
          {TEXT.map(([k, l, long]) => (
            <div className="f" key={k}>
              <label htmlFor={`t-${k}`}>{l}</label>
              {long ? <textarea id={`t-${k}`} value={String(s[k] ?? '')} onChange={(e) => set(k, e.target.value)} /> : <input id={`t-${k}`} value={String(s[k] ?? '')} onChange={(e) => set(k, e.target.value)} />}
            </div>
          ))}
        </div>

        {err && <p className="err" role="alert">{err}</p>}
        {msg && <p style={{ color: 'var(--ok)', fontWeight: 700, margin: 0 }}>{msg}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Saving…' : 'Save settings'}</button>
      </form>
    </AdminShell>
  );
}
