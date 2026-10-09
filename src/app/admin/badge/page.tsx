'use client';
import { useEffect, useState } from 'react';
import type { SiteSettings } from '@/lib/settings';
import { AdminShell, api } from '../ui';

async function uploadPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Use a JPG, PNG or WebP photo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Photos must be under 10 MB.');
  const fd = new FormData();
  fd.append('file', file);
  return (await api<{ path: string }>('/api/admin/upload', { method: 'POST', body: fd })).path;
}
const media = (p: string) => (/^https?:|^\//.test(p) ? p : `/media/${p}`);

export default function TrustBadge() {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [reviews, setReviews] = useState<{ n: number; avg: number } | null>(null);
  useEffect(() => { api<{ settings: SiteSettings }>('/api/admin/settings').then((j) => setS(j.settings)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    api<{ rows: { stars: number }[] }>('/api/admin/content/reviews')
      .then((j) => setReviews({ n: j.rows.length, avg: j.rows.length ? j.rows.reduce((t, r) => t + Number(r.stars), 0) / j.rows.length : 0 }))
      .catch(() => setReviews({ n: 0, avg: 0 }));
  }, []);
  if (!s) return <AdminShell title="Trust badge">{err ? <p className="err">{err}</p> : <p className="muted">Loading…</p>}</AdminShell>;

  const reviewSummary = reviews ? (reviews.n ? `${reviews.avg.toFixed(1)} / 5 from ${reviews.n} review${reviews.n === 1 ? '' : 's'}` : 'no reviews yet') : '…';
  const prevAvg = s.ratingMode === 'custom' ? s.ratingValue || 0 : reviews?.avg || 0;
  const prevCount = s.ratingMode === 'custom' ? s.ratingCount || 0 : reviews?.n || 0;
  const set = (k: keyof SiteSettings, v: unknown) => { setMsg(''); setS({ ...s, [k]: v } as SiteSettings); };

  // Sends the whole settings object back, so nothing else in Store settings is lost.
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(''); setMsg('');
    try { await api('/api/admin/settings', { method: 'PUT', json: s }); setMsg('Posted. It is live on the store now.'); }
    catch (e2) { setErr((e2 as Error).message); }
    setBusy(false);
  }

  const card = { display: 'flex', flexDirection: 'column' as const, gap: 14 };
  return (
    <AdminShell title="Trust badge, rating & payments">
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }} noValidate>
        <p className="muted" style={{ margin: 0 }}>Edit the star rating at the top of the product and the badges just under the <b>Buy now</b> button.</p>
        <div className="card" style={card}>
          <b>Star rating (above the headline)</b>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>The &ldquo;★★★★★ 4.8 / 5 (13 reviews)&rdquo; line at the top of the product. Also used for &ldquo;Rated 4.8 / 5&rdquo; in What customers say.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['auto', 'Work it out from my reviews', `Currently ${reviewSummary}`],
              ['custom', 'Use my own numbers', 'For reviews you have collected elsewhere, e.g. Takealot, Google or Instagram'],
              ['hidden', 'Hide the star rating', ''],
            ].map(([v, l, h]) => (
              <label key={v} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name="rm" checked={(s.ratingMode || 'auto') === v} onChange={() => set('ratingMode', v)} style={{ width: 20, height: 20, marginTop: 2 }} />
                <span><b style={{ fontWeight: 600 }}>{l}</b>{h && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{h}</span>}</span>
              </label>
            ))}
          </div>
          {s.ratingMode === 'custom' && (
            <>
              <div className="row3">
                <div className="f"><label htmlFor="rv">Rating (out of 5)</label><input id="rv" type="number" step="0.1" min={1} max={5} value={s.ratingValue || ''} onChange={(e) => set('ratingValue', Number(e.target.value))} /></div>
                <div className="f"><label htmlFor="rc">Number of reviews</label><input id="rc" type="number" min={1} value={s.ratingCount || ''} onChange={(e) => set('ratingCount', Number(e.target.value))} /></div>
                <div className="f"><label htmlFor="rn">Where from (optional)</label><input id="rn" placeholder="e.g. on Takealot" value={s.ratingNote} onChange={(e) => set('ratingNote', e.target.value)} /></div>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Only use real numbers you can back up. A rating that doesn&apos;t match real reviews breaks advertising rules (Meta, Google) and the Consumer Protection Act.</p>
            </>
          )}
          {s.ratingMode !== 'hidden' && (
            <div>
              <span className="muted" style={{ fontSize: 13 }}>Preview</span>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                <span style={{ color: 'var(--gold)', letterSpacing: 2 }}>★★★★★</span>
                <span>{prevAvg.toFixed(1)} / 5</span>
                <span style={{ color: "var(--muted)", fontWeight: 600 }}>({prevCount} review{prevCount === 1 ? '' : 's'}{s.ratingMode === 'custom' && s.ratingNote ? ` ${s.ratingNote}` : ''})</span>
              </div>
            </div>
          )}
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
        </div>

        <div className="card" style={card}>
          <b>Payment logos (under Add to cart)</b>
          <div className="f">
            <label htmlFor="pl">Payment names as small text tags (comma separated)</label>
            <input id="pl" value={s.payLabels} onChange={(e) => set('payLabels', e.target.value)} placeholder="VISA, MASTERCARD, INSTANT EFT" />
            <span className="muted" style={{ fontSize: 13 }}>Type a single <b>-</b> to hide the text tags, e.g. once you have uploaded logos instead.</span>
          </div>
          <div className="f">
            <label>Logo images (PNG, JPG or WebP, up to 12)</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
              {(s.payLogos || []).map((p, i, all) => (
                <div key={p + i} style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--white)', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 120 }}>
                  <div style={{ height: 40, display: 'flex', alignItems: 'center' }}><img src={media(p)} alt="" style={{ maxHeight: 32, maxWidth: 100, objectFit: 'contain' }} /></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="ghost" aria-label="Move left" disabled={i === 0} onClick={() => { const l = [...all]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; set('payLogos', l); }} style={{ minHeight: 32, padding: '0 10px' }}>←</button>
                    <button type="button" className="ghost" aria-label="Move right" disabled={i === all.length - 1} onClick={() => { const l = [...all]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; set('payLogos', l); }} style={{ minHeight: 32, padding: '0 10px' }}>→</button>
                    <button type="button" className="ghost" aria-label="Remove" onClick={() => set('payLogos', all.filter((_, j) => j !== i))} style={{ minHeight: 32, padding: '0 10px', color: 'var(--berry)' }}>✕</button>
                  </div>
                </div>
              ))}
              {(s.payLogos || []).length < 12 && (
                <label className="ghost" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 120, minHeight: 84, borderStyle: 'dashed', borderRadius: 10, color: 'var(--ink)', cursor: 'pointer' }}>
                  {logoBusy ? 'Uploading…' : '+ Add logos'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={async (e) => {
                    const files = Array.from(e.target.files || []); e.target.value = '';
                    if (!files.length) return;
                    setErr(''); setLogoBusy(true);
                    try {
                      const added: string[] = [];
                      for (const f of files.slice(0, 12 - (s.payLogos || []).length)) added.push(await uploadPhoto(f));
                      set('payLogos', [...(s.payLogos || []), ...added]);
                    } catch (e2) { setErr((e2 as Error).message); }
                    setLogoBusy(false);
                  }} />
                </label>
              )}
            </div>
            <span className="muted" style={{ fontSize: 13 }}>Use the official logos from each provider&apos;s merchant or brand page (PayFast, Ozow, Visa and Mastercard all offer them), and only show methods your checkout actually accepts. Transparent PNGs look best.</span>
          </div>
          <div className="f">
            <label htmlFor="pls">Logo size: {s.payLogoSize || 40}px tall</label>
            <input id="pls" type="range" min={20} max={80} step={2} value={s.payLogoSize || 40} onChange={(e) => set('payLogoSize', Number(e.target.value))} style={{ maxWidth: 360, accentColor: 'var(--berry)' }} />
          </div>
          <div>
            <span className="muted" style={{ fontSize: 13 }}>Preview (same width as the store)</span>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 540, padding: 14, background: 'var(--paper)', borderRadius: 12 }}>
              {s.payLabels.trim() !== '-' && s.payLabels.trim() && <div className="pays">{s.payLabels.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t}>{t}</span>)}</div>}
              {(s.payLogos || []).length > 0 && <div className="paylogos" style={{ '--plh': `${s.payLogoSize || 40}px` } as React.CSSProperties}>{s.payLogos.map((p, i) => <img key={i} src={media(p)} alt="" />)}</div>}
            </div>
          </div>
        </div>

        <div className="card" style={card}>
          <b>Delivery timeline (under Add to cart)</b>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}>
            <input type="checkbox" checked={s.showTimeline} onChange={(e) => set('showTimeline', e.target.checked)} style={{ width: 20, height: 20 }} />
            Show the Ordered → Order ready → Delivered dates
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Counted in business days from the day the customer visits (weekends skipped, public holidays not). Keep the ranges honest, as customers will hold you to them.</p>
          <div className="row2">
            <div className="f"><label>Order ready: business days after ordering</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input aria-label="Order ready from" type="number" min={0} value={s.readyDaysMin} onChange={(e) => set('readyDaysMin', Number(e.target.value))} /> to
                <input aria-label="Order ready to" type="number" min={0} value={s.readyDaysMax} onChange={(e) => set('readyDaysMax', Number(e.target.value))} />
              </div></div>
            <div className="f"><label>Delivered: business days after ordering</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input aria-label="Delivered from" type="number" min={0} value={s.deliverDaysMin} onChange={(e) => set('deliverDaysMin', Number(e.target.value))} /> to
                <input aria-label="Delivered to" type="number" min={0} value={s.deliverDaysMax} onChange={(e) => set('deliverDaysMax', Number(e.target.value))} />
              </div></div>
          </div>
        </div>

        {err && <p className="err" role="alert">{err}</p>}
        {msg && <p style={{ color: 'var(--ok)', fontWeight: 700, margin: 0 }}>{msg}</p>}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post to store'}</button>
          <a href="/" target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: 14 }}>View store</a>
        </div>
      </form>
    </AdminShell>
  );
}
