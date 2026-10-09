'use client';
import { useEffect, useState } from 'react';
import type { SiteSettings, Bundle } from '@/lib/settings';
import { AdminShell, api } from '../ui';

type Status = { siteUrl: string; payfastSandbox: boolean; payfast?: { merchantId: string; keyHint: string; passphraseLength: number; hadSpaces: string[]; publicSandbox: boolean }; bobgoSandbox: boolean; bobgoKey: boolean; bobgoWebhookSecret: boolean };
const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

const TEXT: [keyof SiteSettings, string, boolean?][] = [
  ['announcement', 'Top banner'], ['headline', 'Main headline'], ['subhead', 'Product description', true],
  ['featTitle', 'Featured reviews heading'], ['videoHeading', 'Video section heading'], ['videoSub', 'Video section line'],
  ['photoHeading', 'Photo review cards heading'], ['stripLabel', 'Photo strip badge'], ['reviewsHeading', 'Review list heading'], ['shipping', 'Shipping & returns text', true],
];

function PayfastTest() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ mode: string; merchantId: string; tries: { label: string; ok: boolean; detail: string }[]; verdict: string } | null>(null);
  const [err, setErr] = useState('');
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" className="ghost" style={{ alignSelf: 'flex-start', color: 'var(--ink)' }} disabled={busy}
        onClick={async () => { setBusy(true); setErr(''); setRes(null); try { setRes(await api('/api/admin/payfast-test', { method: 'POST' })); } catch (e) { setErr((e as Error).message); } setBusy(false); }}>
        {busy ? 'Testing with PayFast…' : 'Test PayFast connection'}
      </button>
      {err && <span className="err">{err}</span>}
      {res && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--white)', color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="muted" style={{ fontSize: 13 }}>PayFast {res.mode} · merchant {res.merchantId} · no money moves in this test</span>
          {res.tries.map((t) => <div key={t.label}><Dot ok={t.ok} /><b>{t.label}:</b> {t.detail}</div>)}
          <div style={{ fontWeight: 700, marginTop: 4 }}>{res.verdict}</div>
        </div>
      )}
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 99, background: ok ? 'var(--ok)' : 'var(--berry)', marginRight: 8 }} />;
}

export default function Settings() {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [saved, setSaved] = useState<SiteSettings | null>(null); // what the store is using right now
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api<{ settings: SiteSettings; status: Status }>('/api/admin/settings').then((j) => { setS(j.settings); setSaved(j.settings); setSt(j.status); }).catch((e) => setErr(e.message)); }, []);
  if (!s) return <AdminShell title="Store settings">{err ? <p className="err">{err}</p> : <p className="muted">Loading…</p>}</AdminShell>;

  const set = (k: keyof SiteSettings, v: unknown) => setS({ ...s, [k]: v } as SiteSettings);
  const setB = (i: number, k: keyof Bundle, v: string) => { const b = s.bundles.map((x, j) => (j === i ? { ...x, [k]: ['qty', 'price', 'compare'].includes(k) ? Number(v) : v } : x)); set('bundles', b); };
  const setC = (k: keyof SiteSettings['collection'], v: string) => set('collection', { ...s.collection, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(''); setMsg('');
    try { await api('/api/admin/settings', { method: 'PUT', json: s }); setSaved(s); setMsg('Saved. The store shows the changes straight away.'); }
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
          {st.payfast && (
            <div className="muted" style={{ fontSize: 14, paddingLeft: 18 }}>
              Merchant ID <b>{st.payfast.merchantId || 'missing'}</b> · merchant key {st.payfast.keyHint} · passphrase {st.payfast.passphraseLength ? <b>set ({st.payfast.passphraseLength} characters)</b> : <b>not set</b>}
              {st.payfast.publicSandbox && st.payfast.passphraseLength !== 12 && <div style={{ color: 'var(--berry)' }}>PayFast&apos;s shared test account (10000100) uses the passphrase jt7NOE43FZPn (12 characters).</div>}
              {!st.payfast.publicSandbox && <div>The passphrase must match the one under <b>Settings → Developer settings</b> in this PayFast account exactly, or be empty if none is set there.</div>}
              <PayfastTest />
              {st.payfast.hadSpaces.length > 0 && <div>Extra spaces were found around {st.payfast.hadSpaces.join(', ')} in .env. They are now ignored, but it is worth tidying them.</div>}
            </div>
          )}
          <div><Dot ok={st.bobgoKey} />Bob Go API key {st.bobgoKey ? `connected (${st.bobgoSandbox ? 'sandbox' : 'live'})` : 'not set: orders will not reach Bob Go'}</div>
          {(() => {
            const b = saved || s;
            const missing = [['bank', b.bankName], ['account name', b.bankAccountName], ['account number', b.bankAccountNumber], ['branch code', b.bankBranchCode]]
              .filter(([, v]) => !String(v || '').trim()).map(([l]) => l);
            return <div><Dot ok={!missing.length} />Bank transfer (manual EFT) {missing.length ? <>is <b>off at checkout</b>: fill in {missing.join(', ')} below, then Save settings</> : <>is <b>on</b> at checkout</>}</div>;
          })()}
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

        <div className="card" style={{ ...card, gap: 6 }}>
          <b>Trust badge and delivery timeline</b>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>These now live on their own page: <a href="/admin/badge">Badges &amp; payments</a> in the menu above (also payment logos and the star rating).</p>
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
