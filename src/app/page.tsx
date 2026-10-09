/* eslint-disable @next/next/no-img-element */
import { Header, Stars, Verified, DeliveryTimeline } from '@/components/chrome';
import { Footer } from '@/components/footer';
import { timeline } from '@/lib/delivery';
import { Gallery, BuyBox, ScrollButtons, VideoRow, ReviewWidget, TrackViewContent } from '@/components/store';
import { DEFAULT_SETTINGS, getSettings, SiteSettings } from '@/lib/settings';
import { getContent } from '@/lib/content';
import { mediaUrl } from '@/lib/db';
import Protect from '@/components/protect';

export const dynamic = 'force-dynamic';

const IMG = (n: string) => `/images/${n}.jpg`;
const GALLERY = [
  { src: IMG('hero'), alt: 'Before and after the SnapBun, with the bun maker below' },
  { src: IMG('backbun'), alt: 'Sleek high bun made with the SnapBun' },
  { src: IMG('step4'), alt: 'Finished SnapBun bun from behind' },
  { src: IMG('product'), alt: 'Nuvé SnapBun bun maker in black', contain: true },
  { src: IMG('infographic'), alt: 'SnapBun parts: snap core, fibre wrap, end caps' },
  { src: IMG('beforeafter'), alt: 'Before and after: messy bun vs SnapBun bun' },
];
const STEPS = [
  ['step1', 'Ponytail', 'Brush your hair back into a ponytail at the height you want your bun.'],
  ['step2', 'Slide', 'Thread your hair through the slit in the middle and slide the SnapBun to the ends.'],
  ['step3', 'Roll', 'Roll it up toward your head, tucking in loose ends as you go.'],
  ['step4', 'Snap', 'Bend the ends down and snap them together. Fan your hair out to cover it.'],
];
const COMPARE: [string, boolean, boolean][] = [
  ['Done in 5 seconds', false, false], ['No pins, clips or elastics', false, false], ['Holds all day without slipping', false, true],
  ['Adds volume to fine hair', false, true], ['Blends in, invisible in the bun', true, false], ['Fits flat in your handbag', true, false],
];

const Tick = ({ ok }: { ok: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-label={ok ? 'Yes' : 'No'} role="img">
    <path d={ok ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7L7 17'} />
  </svg>
);

async function load() {
  try {
    const [s, c] = await Promise.all([getSettings(), getContent()]);
    return { s, c };
  } catch (e) {
    console.error('Store data unavailable, showing defaults', e);
    return { s: DEFAULT_SETTINGS as SiteSettings, c: { reviews: [], videos: [], photos: [], logos: [], sections: [] } };
  }
}

export default async function Home() {
  const { s, c } = await load();
  const R = c.reviews;
  const reviewAvg = R.length ? R.reduce((t, r) => t + r.stars, 0) / R.length : 0;
  // Star rating line: from your reviews, your own numbers (Trust badge page), or hidden.
  const custom = s.ratingMode === 'custom' && s.ratingValue > 0 && s.ratingCount > 0;
  const avg = custom ? s.ratingValue : reviewAvg;
  const ratingCount = custom ? s.ratingCount : R.length;
  const showRating = s.ratingMode !== 'hidden' && ratingCount > 0;
  const maxSave = Math.max(...s.bundles.map((b) => (b.compare ? Math.round((1 - b.price / b.compare) * 100) : 0)));
  // Up to 3 cards: reviews ticked "Featured" first, then the best-rated of the rest.
  const featured = [
    ...R.filter((r) => r.featured),
    ...R.filter((r) => !r.featured).sort((a, b) => b.stars - a.stars || Number(!!b.title) - Number(!!a.title)),
  ].slice(0, 3);
  const photoReviews = R.filter((r) => r.photo);
  const faces = R.filter((r) => r.avatar || r.photo).slice(0, 3);
  // Payment tags under Add to cart. Typing "-" in the admin hides them.
  const payTags = s.payLabels.trim() === '-' ? [] : s.payLabels.split(',').map((t) => t.trim()).filter(Boolean);
  // Trust badge under Add to cart: its own photos from Store settings, else review photos.
  const trustTitle = s.trustTitle || (s.trustCount ? `Trusted by ${s.trustCount} customers` : '');
  const trustFaces = (s.trustAvatars || []).length ? s.trustAvatars.map((p) => mediaUrl(p)) : faces.map((r) => r.avatar || r.photo);
  let strip = c.photos.length ? c.photos.map((p) => ({ src: p.image, alt: p.caption || '' })) : ['backbun', 'gym', 'step4', 'office', 'beforeafter', 'wedding', 'portrait'].map((n) => ({ src: IMG(n), alt: '' }));
  while (strip.length < 7) strip = strip.concat(strip);
  let logos = c.logos.slice();
  while (logos.length && logos.length < 6) logos = logos.concat(c.logos);

  return (
    <>
      <Header announcement={s.announcement} />
      <Protect />
      <main>
        <div className="wrap" id="buy">
          <div className="hero">
            <Gallery images={GALLERY} saveBadge={maxSave > 0 ? `SAVE UP TO ${maxSave}%` : ''} />
            <div className="buy">
              {showRating && (
                <div className="rating-line"><Stars n={avg} /><span>{avg.toFixed(1)} / 5</span><span className="rating-count">({ratingCount.toLocaleString('en-ZA')} review{ratingCount === 1 ? '' : 's'}{custom && s.ratingNote ? ` ${s.ratingNote}` : ''})</span></div>
              )}
              <h1 className="h1">{s.headline}</h1>
              <p className="lede">{s.subhead}</p>
              <ul className="bullets">
                {['Perfect bun in 5 seconds, no pins', 'Holds all day, even at the gym', 'Makes fine hair look fuller', 'Gentle, no tight elastics on your edges', 'Reusable and fits in any handbag'].map((b) => (
                  <li key={b}><span className="tick">✓</span>{b}</li>
                ))}
              </ul>
              <BuyBox bundles={s.bundles} />
              <TrackViewContent value={(s.bundles.find((b) => b.tag === 'MOST POPULAR') || s.bundles[0]).price} />
              {trustTitle && (
                <div className="trust">
                  {trustFaces.length > 0 && (
                    <div className="avs">
                      {trustFaces.map((src, i) => <img key={i} src={src} alt="" />)}
                      <span className="avs-tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                    </div>
                  )}
                  <div><b>{trustTitle}</b><span>{s.trustText}</span></div>
                </div>
              )}
              {s.showTimeline && (() => {
                const t = timeline(s.readyDaysMin, s.readyDaysMax, s.deliverDaysMin, s.deliverDaysMax);
                return <DeliveryTimeline steps={[
                  { icon: 'cart', date: t.ordered, label: 'Ordered' },
                  { icon: 'truck', date: t.ready, label: 'Order ready' },
                  { icon: 'gift', date: t.delivered, label: 'Delivered' },
                ]} />;
              })()}
              {payTags.length > 0 && <div className="pays">{payTags.map((p) => <span key={p}>{p}</span>)}</div>}
              {(s.payLogos || []).length > 0 && (
                <div className="paylogos" style={{ '--plh': `${s.payLogoSize || 40}px` } as React.CSSProperties}>{s.payLogos.map((p, i) => <img key={i} src={mediaUrl(p)} alt="" loading="lazy" />)}</div>
              )}
              <div>
                <details open><summary>What are the benefits?</summary><p>{'A full, sleek bun in about 5 seconds, with no pins, clips or elastics.\n• Holds through work, school runs and workouts\n• Adds volume so fine hair looks thicker\n• No tight elastics tugging at your edges\n• The fibre wrap blends into dark hair, so the tool stays hidden\n• Folds flat into any handbag or gym bag'}</p></details>
                <details><summary>How do I use it?</summary><p>{'1. Brush your hair into a ponytail.\n2. Thread your hair through the slit in the middle and slide the SnapBun to the ends.\n3. Roll it up to the base of your ponytail.\n4. Bend the ends down and snap them together. Spread your hair to cover it.'}</p></details>
                <details><summary>Shipping &amp; returns</summary><p>{s.shipping}</p></details>
              </div>
            </div>
          </div>
        </div>

        {featured.length > 0 && (
          <section className="feat"><div className="wrap">
            <div className="center"><span className="eyebrow">{featured.every((r) => r.verified) ? 'Verified reviews' : 'Customer reviews'}</span><h2 className="h2">{s.featTitle}</h2>
              {showRating && <div className="big-rating"><span>Rated</span><b>{avg.toFixed(1)}</b><span>/ 5</span><Stars n={avg} /></div>}</div>
            <div className="cards3">
              {featured.map((r) => (
                <div className="rcard" key={r.id}>
                  <Stars n={r.stars} />
                  {r.title && <h3>&ldquo;{r.title}&rdquo;</h3>}
                  <p>{r.body}</p>
                  <div className="who">{(r.avatar || r.photo) && <img src={r.avatar || r.photo} alt="" />}<b>{r.name}</b>{r.verified && <Verified />}</div>
                </div>
              ))}
            </div>
          </div></section>
        )}

        {c.videos.length > 0 && (
          <section className="vsec"><div className="vwrap">
            <div className="vsec-head"><h2>{s.videoHeading}</h2>{s.videoSub && <p>{s.videoSub}</p>}</div>
            <VideoRow videos={c.videos} />
          </div></section>
        )}

        <section className="tint"><div className="wrap split">
          <div className="media"><img src={IMG('backbun')} alt="Sleek high bun made with the SnapBun" /></div>
          <div className="txt">
            <span className="eyebrow">The 5-second morning</span>
            <h2 className="h2">Sleek Bun. Zero Pins. Done Before Your Coffee Is.</h2>
            <p>You know the routine: brush, twist, wrap, pin, re-pin, give up, throw it in a scrunchie. The SnapBun replaces all of that with one motion. Slide it to the end of your ponytail, roll up, snap the ends together, and your hair fans out into a full, smooth bun.</p>
            <p>Because the fibre wrap blends into dark hair, nobody sees the tool. They just see a polished bun that holds through the school run, a full shift and the gym.</p>
            <a className="btn" href="#buy" style={{ alignSelf: 'flex-start' }}>GET MY SNAPBUN</a>
          </div>
        </div></section>

        {photoReviews.length > 0 && (
          <section><div className="wrap">
            <div className="scroller-head"><h2 className="h2">{s.photoHeading}</h2><ScrollButtons target="pcards" label="reviews" /></div>
            <div className="scroller" id="pcards">
              {photoReviews.map((r) => (
                <div className="pcard" key={r.id}>
                  <img src={r.photo} alt={`Photo from ${r.name}`} loading="lazy" />
                  <div className="in"><Stars n={r.stars} />{r.title && <h3>&ldquo;{r.title}&rdquo;</h3>}<p>{r.body}</p><div className="h">@{r.name}{r.verified && <div><Verified /></div>}</div></div>
                </div>
              ))}
            </div>
          </div></section>
        )}

        <section className="dark" id="how" style={{ paddingBottom: 110 }}>
          <div className="wrap">
            <div className="center"><h2 className="h2">The <em>Clever Design</em> Behind It</h2><p className="lede" style={{ color: '#D9CCC4' }}>Why it holds all day when foam donuts and pins slip.</p></div>
            <div className="grid4">
              <div className="tech"><b>Bendable snap core</b><p>A flexible core rolls with your hair, then snaps into a ring that locks the bun in place.</p></div>
              <div className="tech"><b>Hair-like fibre wrap</b><p>Soft synthetic fibre grips your strands and blends into dark hair so the tool disappears.</p></div>
              <div className="tech"><b>Soft fabric end caps</b><p>Covered ends snap together without snagging, pulling or poking your scalp.</p></div>
              <div className="tech"><b>Light and portable</b><p>You won&apos;t feel it in your hair, and it folds flat for your bag, desk drawer or locker.</p></div>
            </div>
          </div>
          <div className="strip">
            <div className="marq"><div className="marq-track">{strip.concat(strip).map((p, i) => <img key={i} src={p.src} alt={i < strip.length ? p.alt : ''} loading="lazy" />)}</div></div>
            <div className="strip-badge">{s.stripLabel}</div>
          </div>
        </section>

        {logos.length > 0 && (
          <section className="logos" style={{ paddingBlock: 44 }}>
            <div className="wrap center"><span className="eyebrow" style={{ color: 'var(--soft)' }}>As seen on</span></div>
            <div className="marq" style={{ marginTop: 22 }}><div className="marq-track">{logos.concat(logos).map((l, i) => <img key={i} src={l.image} alt={l.name} />)}</div></div>
          </section>
        )}

        <section><div className="wrap">
          <div className="center"><span className="eyebrow">Your 5-second transformation</span><h2 className="h2">Messy to Model-Sleek in 4 Moves</h2></div>
          <div className="grid4">
            {STEPS.map(([img, t, d], i) => (
              <div className="step" key={t}>
                <img src={IMG(img)} alt={`Step ${i + 1}: ${t}`} loading="lazy" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="n">{i + 1}</span><b style={{ fontSize: 18 }}>{t}</b></div>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div></section>

        <section className="tint"><div className="wrap">
          <div className="center"><h2 className="h2">One Bun. Every Part of Your Day.</h2></div>
          <div className="grid3">
            {[['gym', 'Gym & sport', 'Locked in through squats, sprints and spin class. No mid-set re-tie.'], ['office', 'Work & school run', 'Polished from the 7am drop-off to the 5pm meeting.'], ['wedding', 'Weddings & nights out', 'A sleek, elegant updo without the salon bill.']].map(([img, t, d]) => (
              <div className="occ" key={t}><img src={IMG(img)} alt={t} loading="lazy" /><b>{t}</b><p>{d}</p></div>
            ))}
          </div>
        </div></section>

        {c.sections.map((sec, i) => (
          <section key={sec.id} className={i % 2 ? 'tint' : ''}>
            <div className={'wrap split' + (sec.side === 'Image right' ? ' flip' : '')}>
              {sec.image && <div className="media"><img src={sec.image} alt={sec.heading} /></div>}
              <div className="txt" style={sec.image ? undefined : { gridColumn: '1 / -1', maxWidth: 760, margin: '0 auto', textAlign: 'center', alignItems: 'center' }}>
                {sec.eyebrow && <span className="eyebrow">{sec.eyebrow}</span>}
                <h2 className="h2">{sec.heading}</h2>
                {sec.body && <p>{sec.body}</p>}
                {sec.cta && <a className="btn" href="#buy" style={{ alignSelf: sec.image ? 'flex-start' : 'center' }}>{sec.cta}</a>}
              </div>
            </div>
          </section>
        ))}

        <section><div className="wrap" style={{ maxWidth: 920 }}>
          <div className="center"><h2 className="h2">Why We&apos;re <em>Better</em></h2></div>
          <div className="cmp"><table>
            <thead><tr><th scope="col">Feature</th><th scope="col" className="us">Nuvé SnapBun</th><th scope="col">Pins &amp; elastics</th><th scope="col">Foam donut</th></tr></thead>
            <tbody>{COMPARE.map(([f, a, b]) => (
              <tr key={f}><td>{f}</td><td className="us y"><Tick ok /></td><td className={a ? 'y' : 'x'}><Tick ok={a} /></td><td className={b ? 'y' : 'x'}><Tick ok={b} /></td></tr>
            ))}</tbody>
          </table></div>
        </div></section>

        {R.length > 0 && (
          <section id="reviews" style={{ background: 'var(--white)', borderTop: '1px solid var(--line)' }}><div className="wrap">
            <div className="center"><h2 className="h2">{s.reviewsHeading}</h2></div>
            <ReviewWidget reviews={R} />
          </div></section>
        )}

        <section className="tint" id="faq"><div className="wrap" style={{ maxWidth: 860 }}>
          <div className="center" style={{ marginBottom: 28 }}><span className="eyebrow" style={{ color: 'var(--muted)' }}>Fit, results &amp; guarantee</span><h2 className="h2">Let&apos;s Talk Hair &amp; <em>Confidence</em></h2></div>
          <details><summary>Will it work on thick or curly hair?</summary><p>Yes. Thick hair makes the fullest buns. For very thick or coily hair, stretch or blow-dry first so it rolls smoothly, and roll slowly so every strand is caught.</p></details>
          <details><summary>Will it work on thin or fine hair?</summary><p>The fibre-wrapped core sits inside the bun and adds body, so fine hair looks noticeably fuller.</p></details>
          <details><summary>Does it pull or damage my hair?</summary><p>There are no metal clasps touching your hair and no tight elastic. The ends are covered in soft fabric, so it&apos;s gentler than pins and hair ties.</p></details>
          <details><summary>Can I pay by EFT?</summary><p>Yes. Choose &ldquo;Bank transfer (EFT)&rdquo; at checkout. Your order is held for {s.eftMinutes} minutes while you make the payment and upload your proof of payment.</p></details>
          <details><summary>What if it doesn&apos;t work for me?</summary><p>You&apos;re covered by our 30-day &ldquo;Perfect Bun&rdquo; guarantee. Contact us and we&apos;ll refund you.</p></details>
        </div></section>

        <section className="final"><div className="wrap center" style={{ gap: 18 }}>
          <h2 className="h2">Your Last Bad Bun Day Starts Now</h2>
          <p>Try the SnapBun for 30 days. If it doesn&apos;t give you a better bun than you&apos;ve ever done by hand, we&apos;ll refund you.</p>
          <a className="btn light" href="#buy">CLAIM YOUR SNAPBUN</a>
        </div></section>
      </main>
      <Footer />
    </>
  );
}
