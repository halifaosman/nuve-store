import FooterLinks from './footer-links';
import MetaPixel from './meta-pixel';
import { env } from '@/lib/env';
import { DEFAULT_SETTINGS, getSettings } from '@/lib/settings';
import { POLICY_TITLES, policyText } from '@/lib/policies';

export async function Footer() {
  // Policies are filled in from Store settings; if the database is unavailable, the templates still render.
  let s = DEFAULT_SETTINGS;
  try { s = await getSettings(); } catch { /* use defaults */ }
  const policies = {
    privacy: { title: POLICY_TITLES.privacy, text: policyText('privacy', s) },
    terms: { title: POLICY_TITLES.terms, text: policyText('terms', s) },
    shipping: { title: POLICY_TITLES.shipping, text: policyText('shipping', s) },
  };
  return (
    <>
    <MetaPixel pixelId={env.metaPixelId()} mode={s.trackingConsent === 'optin' ? 'optin' : 'notice'} sandbox={(() => { try { return env.payfastSandbox(); } catch { return true; } })()} />
    <footer>
      <div className="wrap foot">
        <div className="foot-brand">
          <div className="logo"><img src="/brand/nuve-logo-white.svg" alt="Nuvé" width={139} height={36} /></div>
          <div style={{ marginTop: 8 }}>Effortless hair tools for women with no time to waste.</div>
          {(s.bizEmail || s.bizPhone) && (
            <div className="foot-contact">
              {s.bizEmail && <a href={`mailto:${s.bizEmail}`}>{s.bizEmail}</a>}
              {s.bizPhone && <a href={`tel:${s.bizPhone.replace(/\D/g, '').replace(/^0/, '+27')}`}>{s.bizPhone}</a>}
            </div>
          )}
        </div>
        <FooterLinks policies={policies} email={s.bizEmail} phone={s.bizPhone} />
      </div>
      <div className="wrap foot-legal">
        <span>© {new Date().getFullYear()} {s.bizLegalName || s.bizName || 'Nuvé'}{s.bizRegNo ? ` · Reg. ${s.bizRegNo}` : ''}</span>
      </div>
    </footer>
    </>
  );
}
