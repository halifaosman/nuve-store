'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell, api } from '../ui';

type Field = { k: string; l: string; t: 'text' | 'textarea' | 'stars' | 'image' | 'video' | 'check' | 'select'; req?: boolean; opts?: string[]; def?: unknown };
type Schema = { label: string; noun: string; hint: string; title: (r: Row) => string; sub: (r: Row) => string; thumb: string[]; fields: Field[] };
type Row = Record<string, unknown> & { id: string; _urls?: Record<string, string> };

const SCHEMAS: Record<string, Schema> = {
  reviews: {
    label: 'Reviews', noun: 'review', hint: 'Every review feeds the star rating and the review list. Reviews with a customer photo also appear as photo cards; tick "Feature" on up to 3 to show them near the top. Only post real customer reviews.',
    title: (r) => String(r.title || r.body || ''), sub: (r) => `${r.name} · ${r.stars}★${r.featured ? ' · Featured' : ''}`, thumb: ['photo', 'avatar'],
    fields: [
      { k: 'name', l: 'Customer name or handle', t: 'text', req: true }, { k: 'stars', l: 'Star rating', t: 'stars', def: 5 },
      { k: 'title', l: 'Headline', t: 'text' }, { k: 'body', l: 'Review text', t: 'textarea', req: true },
      { k: 'photo', l: 'Customer photo (optional)', t: 'image' }, { k: 'avatar', l: 'Profile picture (optional)', t: 'image' },
      { k: 'verified', l: 'Show "Verified buyer" (only if they bought from you)', t: 'check' }, { k: 'featured', l: 'Feature near the top of the page', t: 'check' },
    ],
  },
  videos: {
    label: 'Videos', noun: 'video', hint: 'Vertical (9:16) MP4 or WebM videos, up to 50 MB. They play muted in a swipeable row until a visitor taps the speaker. Label AI-made demos honestly in the caption.',
    title: (r) => String(r.caption || 'Video'), sub: () => '', thumb: ['poster', 'avatar'],
    fields: [{ k: 'video', l: 'Video file', t: 'video', req: true }, { k: 'caption', l: 'Caption under the video', t: 'text' }, { k: 'avatar', l: 'Profile picture (optional)', t: 'image' }, { k: 'poster', l: 'Cover image (optional)', t: 'image' }],
  },
  photos: {
    label: 'Photo strip', noun: 'photo', hint: 'Photos scroll across the dark "Clever Design" band. Until you add some, your product photos show there.',
    title: (r) => String(r.caption || 'Photo'), sub: () => '', thumb: ['image'],
    fields: [{ k: 'image', l: 'Photo', t: 'image', req: true }, { k: 'caption', l: 'Description (for screen readers)', t: 'text' }],
  },
  logos: {
    label: 'Logos', noun: 'logo', hint: 'Press or partner logos for the "As seen on" strip. Only add outlets that have actually featured you.',
    title: (r) => String(r.name || 'Logo'), sub: () => '', thumb: ['image'],
    fields: [{ k: 'image', l: 'Logo (PNG or SVG)', t: 'image', req: true }, { k: 'name', l: 'Name', t: 'text', req: true }],
  },
  sections: {
    label: 'Extra sections', noun: 'section', hint: 'Image-and-text sections, shown after "Every Part of Your Day".',
    title: (r) => String(r.heading || ''), sub: (r) => String(r.eyebrow || ''), thumb: ['image'],
    fields: [
      { k: 'eyebrow', l: 'Small label above the heading', t: 'text' }, { k: 'heading', l: 'Heading', t: 'text', req: true }, { k: 'body', l: 'Text', t: 'textarea' },
      { k: 'image', l: 'Image (optional)', t: 'image' }, { k: 'side', l: 'Image position', t: 'select', opts: ['Image left', 'Image right'], def: 'Image left' },
      { k: 'cta', l: 'Button text (optional, links to checkout)', t: 'text' },
    ],
  },
};

// Sends the file to our own server, which saves it under media/ and returns its address.
async function uploadFile(file: File): Promise<{ path: string; url: string }> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Files must be under 50 MB.');
  const fd = new FormData();
  fd.append('file', file);
  return api<{ path: string; url: string }>('/api/admin/upload', { method: 'POST', body: fd });
}

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

export default function Content() {
  const [tab, setTab] = useState('reviews');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [edit, setEdit] = useState<string | null>(null); // row id, 'new' or null
  const [vals, setVals] = useState<Record<string, unknown>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [del, setDel] = useState<string | null>(null);
  const sc = SCHEMAS[tab];

  const load = useCallback(() => { setRows(null); api<{ rows: Row[] }>(`/api/admin/content/${tab}`).then((j) => setRows(j.rows)).catch((e) => setErr(e.message)); }, [tab]);
  useEffect(() => { load(); setEdit(null); setErr(''); }, [load]);

  function start(r: Row | null) {
    const v: Record<string, unknown> = {};
    sc.fields.forEach((f) => { v[f.k] = r ? r[f.k] ?? '' : f.def ?? (f.t === 'check' ? false : ''); });
    setVals(v); setPreviews(r?._urls || {}); setEdit(r ? r.id : 'new'); setErr('');
  }

  async function pickFile(f: Field, file: File | undefined) {
    if (!file) return;
    setBusy('upload'); setErr('');
    try { const { path, url } = await uploadFile(file); setVals((v) => ({ ...v, [f.k]: path })); setPreviews((p) => ({ ...p, [f.k]: url })); }
    catch (e) { setErr((e as Error).message); }
    setBusy('');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const missing = sc.fields.filter((f) => f.req && !vals[f.k]).map((f) => f.l.toLowerCase());
    if (missing.length) { setErr(`Add ${missing.join(' and ')} before saving.`); return; }
    setBusy('save'); setErr('');
    try {
      if (edit === 'new') await api(`/api/admin/content/${tab}`, { method: 'POST', json: vals });
      else await api(`/api/admin/content/${tab}/${edit}`, { method: 'PATCH', json: vals });
      setEdit(null); load();
    } catch (e2) { setErr((e2 as Error).message); }
    setBusy('');
  }

  async function move(i: number, dir: number) {
    if (!rows) return;
    const a = rows[i], b = rows[i + dir];
    if (!a || !b) return;
    const sa = Number(a.sort) || i, sb = Number(b.sort) || i + dir;
    await Promise.all([
      api(`/api/admin/content/${tab}/${a.id}`, { method: 'PATCH', json: { sort: sb === sa ? sa + dir : sb } }),
      api(`/api/admin/content/${tab}/${b.id}`, { method: 'PATCH', json: { sort: sa } }),
    ]).catch((e) => setErr(e.message));
    load();
  }

  async function remove(id: string) {
    setDel(null);
    await api(`/api/admin/content/${tab}/${id}`, { method: 'DELETE' }).catch((e) => setErr(e.message));
    load();
  }

  return (
    <AdminShell title="Page content">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(SCHEMAS).map(([k, s]) => (
          <button key={k} className="ghost" onClick={() => setTab(k)} style={tab === k ? { background: 'var(--ink)', color: 'var(--white)', borderColor: 'var(--ink)' } : undefined}>{s.label}</button>
        ))}
      </div>
      <p className="muted" style={{ margin: 0 }}>{sc.hint}</p>
      {err && <p className="err" role="alert">{err}</p>}

      {edit ? (
        <form className="card" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }} noValidate>
          <b>{edit === 'new' ? `Add ${sc.noun}` : `Edit ${sc.noun}`}</b>
          {sc.fields.map((f) => {
            const id = `f-${f.k}`;
            if (f.t === 'check') return (
              <label key={f.k} htmlFor={id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}>
                <input id={id} type="checkbox" checked={!!vals[f.k]} onChange={(e) => setVals({ ...vals, [f.k]: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--berry)' }} />{f.l}
              </label>
            );
            return (
              <div className="f" key={f.k}>
                <label htmlFor={id}>{f.l}{f.req ? ' *' : ''}</label>
                {f.t === 'text' && <input id={id} value={String(vals[f.k] ?? '')} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} />}
                {f.t === 'textarea' && <textarea id={id} value={String(vals[f.k] ?? '')} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} />}
                {f.t === 'select' && <select id={id} value={String(vals[f.k] || f.opts![0])} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })}>{f.opts!.map((o) => <option key={o}>{o}</option>)}</select>}
                {f.t === 'stars' && (
                  <div style={{ display: 'flex', gap: 4 }} role="radiogroup" aria-label={f.l}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={vals[f.k] === n} aria-label={`${n} stars`} onClick={() => setVals({ ...vals, [f.k]: n })}
                        style={{ width: 40, height: 40, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--white)', cursor: 'pointer', color: n <= Number(vals[f.k] || 0) ? 'var(--gold)' : 'var(--sand)' }}>
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={STAR} fill="currentColor" /></svg>
                      </button>
                    ))}
                  </div>
                )}
                {(f.t === 'image' || f.t === 'video') && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: 72, height: 72, borderRadius: 10, background: 'var(--sand)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--muted)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {previews[f.k] && vals[f.k] ? (f.t === 'video' ? <video src={previews[f.k]} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={previews[f.k]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : 'None'}
                    </div>
                    <input id={id} type="file" accept={f.t === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif'} onChange={(e) => pickFile(f, e.target.files?.[0])} />
                    {!!vals[f.k] && <button type="button" className="ghost" onClick={() => setVals({ ...vals, [f.k]: '' })}>Remove</button>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn small" type="submit" disabled={!!busy}>{busy === 'upload' ? 'Uploading…' : busy === 'save' ? 'Saving…' : edit === 'new' ? 'Add to page' : 'Save changes'}</button>
            <button className="ghost" type="button" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => start(null)}>+ Add {sc.noun}</button>
      )}

      {!rows ? <p className="muted">Loading…</p> : !rows.length ? <div className="card muted">No {sc.noun}s yet. This section stays hidden on the store until you add one.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 820 }}>
          {rows.map((r, i) => {
            const t = sc.thumb.map((k) => r._urls?.[k]).find(Boolean);
            return (
              <div key={r.id} className="card" style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: 10 }}>
                <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--sand)', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t ? <img src={t} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : r._urls?.video ? <video src={r._urls.video} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.title(r)}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{sc.sub(r)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="ghost" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="ghost" onClick={() => start(r)}>Edit</button>
                  {del === r.id
                    ? <button className="ghost" style={{ background: 'var(--berry)', color: 'var(--white)', borderColor: 'var(--berry)' }} onClick={() => remove(r.id)}>Confirm delete</button>
                    : <button className="ghost" style={{ color: 'var(--berry)' }} onClick={() => setDel(r.id)}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
