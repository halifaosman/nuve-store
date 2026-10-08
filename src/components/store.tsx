'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bundle } from '@/lib/settings';
import type { Review, Video } from '@/lib/content';
import { Stars, Verified } from './chrome';

const rand = (n: number) => 'R' + n.toLocaleString('en-ZA');
const Chevron = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

export type GalleryImage = { src: string; alt: string; contain?: boolean };

export function Gallery({ images, saveBadge }: { images: GalleryImage[]; saveBadge: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % images.length); }, 4500);
    return () => clearInterval(t);
  }, [paused, images.length]);
  const go = (n: number) => { setPaused(true); setI((n + images.length) % images.length); };
  return (
    <div className="gallery">
      <div className="stage">
        {images.map((g, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={g.src} src={g.src} alt={g.alt} className={(g.contain ? 'contain ' : '') + (k === i ? 'on' : '')} loading={k === 0 ? 'eager' : 'lazy'} />
        ))}
        <button className="arrow" style={{ left: 14 }} aria-label="Previous image" onClick={() => go(i - 1)}><Chevron dir="l" /></button>
        <button className="arrow" style={{ right: 14 }} aria-label="Next image" onClick={() => go(i + 1)}><Chevron dir="r" /></button>
        <div className="count">{i + 1} / {images.length}</div>
        {saveBadge && <div className="save">{saveBadge}</div>}
      </div>
      <div className="thumbs">
        {images.map((g, k) => (
          <button key={g.src} className={k === i ? 'on' : ''} aria-label={`Show image ${k + 1}`} onClick={() => go(k)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.src} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function BuyBox({ bundles }: { bundles: Bundle[] }) {
  const [qty, setQty] = useState(bundles.find((b) => b.tag === 'MOST POPULAR')?.qty ?? bundles[0].qty);
  const sel = bundles.find((b) => b.qty === qty) || bundles[0];
  const save = sel.compare ? Math.round((1 - sel.price / sel.compare) * 100) : 0;
  return (
    <>
      <div className="price">
        <b>{rand(sel.price)}</b>
        {sel.compare > 0 && <s>{rand(sel.compare)}</s>}
        {save > 0 && <span className="pill">SAVE {save}%</span>}
      </div>
      <div className="bundles" role="radiogroup" aria-label="Choose your pack">
        {bundles.map((b) => (
          <button key={b.qty} className={'bundle' + (b.qty === qty ? ' on' : '')} role="radio" aria-checked={b.qty === qty} onClick={() => setQty(b.qty)}>
            <span className="l">
              <span className="dot" />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b>{b.label}</b>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{b.sub}</span>
              </span>
            </span>
            <span className="r">
              {b.tag && <span className="tag">{b.tag}</span>}
              <b>{rand(b.price)}</b>
              {b.compare > 0 && <s style={{ fontSize: 13, color: 'var(--soft)' }}>{rand(b.compare)}</s>}
            </span>
          </button>
        ))}
      </div>
      <a className="btn" href={`/checkout?pack=${sel.qty}`} style={{ width: '100%', minHeight: 62, fontSize: 17 }}>BUY NOW — {rand(sel.price)}</a>
    </>
  );
}

export function ScrollButtons({ target, label }: { target: string; label: string }) {
  const by = (dir: number) => {
    const el = document.getElementById(target);
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <div className="scroll-btns">
      <button aria-label={`Scroll ${label} left`} onClick={() => by(-1)}><Chevron dir="l" /></button>
      <button aria-label={`Scroll ${label} right`} onClick={() => by(1)}><Chevron dir="r" /></button>
    </div>
  );
}

const SPEAK = 'M11 5L6 9H3v6h3l5 4V5zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12';
const MUTE = 'M11 5L6 9H3v6h3l5 4V5zM17 9l5 6M22 9l-5 6';

export function VideoRow({ videos }: { videos: Video[] }) {
  const [unmuted, setUnmuted] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLVideoElement | null>>({});
  const toggle = (id: string) => {
    const next = unmuted === id ? null : id;
    setUnmuted(next);
    Object.entries(refs.current).forEach(([k, v]) => { if (v) v.muted = k !== next; });
    const v = refs.current[id];
    if (v && next === id) { v.currentTime = 0; v.play().catch(() => {}); }
  };
  return (
    <div className="scroller" id="vids">
      {videos.map((v) => (
        <div className="vcard" key={v.id}>
          <div className="vbox">
            <video ref={(el) => { refs.current[v.id] = el; }} src={v.video} poster={v.poster || undefined} muted loop playsInline autoPlay preload="metadata" />
            <button className="snd" aria-label={unmuted === v.id ? 'Mute' : 'Turn sound on'} onClick={() => toggle(v.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={unmuted === v.id ? SPEAK : MUTE} /></svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {v.avatar && <img className="av" src={v.avatar} alt="" />}
          </div>
          <div className="vmeta">
            {v.caption && <b>{v.caption}</b>}
            <a className="btn small" href="/#buy">Shop now</a>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReviewWidget({ reviews }: { reviews: Review[] }) {
  const [filter, setFilter] = useState(0);
  const [shown, setShown] = useState(6);
  const avg = reviews.reduce((s, r) => s + r.stars, 0) / reviews.length;
  const counts = useMemo(() => { const c = [0, 0, 0, 0, 0, 0]; reviews.forEach((r) => c[r.stars]++); return c; }, [reviews]);
  const list = reviews.filter((r) => !filter || r.stars === filter).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <div className="rw-top">
        <div className="avg"><b>{avg.toFixed(1)}</b><Stars n={avg} /><span>Based on {reviews.length} review{reviews.length === 1 ? '' : 's'}</span></div>
        <div className="hist">
          {[5, 4, 3, 2, 1].map((n) => (
            <button key={n} className={filter === n ? 'on' : ''} aria-pressed={filter === n} onClick={() => { setFilter(filter === n ? 0 : n); setShown(6); }}>
              <span>{n} ★</span>
              <span className="bar"><i style={{ width: `${(counts[n] / reviews.length) * 100}%` }} /></span>
              <small>{counts[n]}</small>
            </button>
          ))}
        </div>
      </div>
      {filter > 0 && (
        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          <b>Showing {filter}-star reviews</b>
          <button className="ghost" onClick={() => setFilter(0)}>Show all</button>
        </div>
      )}
      <div className="rlist">
        {list.slice(0, shown).map((r) => (
          <article className="ritem" key={r.id}>
            <div className="hd"><Stars n={r.stars} />{r.verified && <Verified />}</div>
            {r.title && <h4>{r.title}</h4>}
            <p>{r.body}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {r.photo && <img className="ph-img" src={r.photo} alt={`Photo from ${r.name}`} loading="lazy" />}
            <div className="by"><b style={{ color: 'var(--ink)' }}>{r.name}</b><span>{new Date(r.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
          </article>
        ))}
      </div>
      {list.length > shown && <div className="more"><button className="btn" onClick={() => setShown(shown + 6)}>Show more reviews</button></div>}
    </>
  );
}
