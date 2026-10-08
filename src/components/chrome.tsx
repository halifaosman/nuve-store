import Link from 'next/link';

export function Header({ announcement }: { announcement: string }) {
  return (
    <>
      <div className="ann">{announcement}</div>
      <header className="top">
        <div className="wrap">
          <span aria-hidden="true" />
          <Link className="logo" href="/" aria-label="Nuvé home"><img src="/brand/nuve-logo.svg" alt="Nuvé" width={139} height={36} /></Link>
          <Link href="/checkout" aria-label="Checkout" style={{ color: 'var(--ink)', display: 'flex', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
          </Link>
        </div>
      </header>
    </>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div>
          <div className="logo"><img src="/brand/nuve-logo-white.svg" alt="Nuvé" width={139} height={36} /></div>
          <div style={{ marginTop: 8 }}>Effortless hair tools for women with no time to waste.</div>
        </div>
        <div>© {new Date().getFullYear()} Nuvé</div>
      </div>
    </footer>
  );
}

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
export function Stars({ n }: { n: number }) {
  return (
    <span className="stars" role="img" aria-label={`${n.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true" style={i > Math.round(n) ? { color: 'var(--sand)' } : undefined}><path d={STAR} fill="currentColor" /></svg>
      ))}
    </span>
  );
}

export function Verified() {
  return (
    <span className="ver">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      Verified buyer
    </span>
  );
}

const TL_ICONS = {
  cart: <><path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19.5 8H6.2" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /><path d="M12.5 3.5v5M10 6h5" /></>,
  truck: <><path d="M2.5 6.5h11v9h-11z" /><path d="M13.5 9.5h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.7" /><circle cx="17" cy="17.5" r="1.7" /></>,
  gift: <><rect x="3.5" y="8.5" width="17" height="11" rx="1.5" /><path d="M3.5 12.5h17M12 8.5v11" /><path d="M12 8.5c-1.5-3.5-5-3.5-5-1.2 0 1.2 1.8 1.2 5 1.2zM12 8.5c1.5-3.5 5-3.5 5-1.2 0 1.2-1.8 1.2-5 1.2z" /></>,
};

/** Ordered → Order ready → Delivered, with estimated dates. */
export function DeliveryTimeline({ steps }: { steps: { icon: keyof typeof TL_ICONS; date: string; label: string }[] }) {
  return (
    <ol className="tl" aria-label="Estimated delivery">
      {steps.map((s) => (
        <li key={s.label}>
          <span className="tl-dot"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TL_ICONS[s.icon]}</svg></span>
          <b>{s.date}</b>
          <span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
