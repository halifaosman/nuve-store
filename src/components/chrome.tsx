import Link from 'next/link';

export function Header({ announcement }: { announcement: string }) {
  return (
    <>
      <div className="ann">{announcement}</div>
      <header className="top">
        <div className="wrap">
          <Link className="logo" href="/">Nuvé</Link>
          <nav className="nav">
            <a href="/#how">How it works</a>
            <a href="/#reviews">Reviews</a>
            <a href="/#faq">FAQ</a>
          </nav>
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
          <div className="logo" style={{ color: 'var(--white)' }}>Nuvé</div>
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
