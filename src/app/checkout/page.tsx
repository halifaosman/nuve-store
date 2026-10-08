import { Header, Footer } from '@/components/chrome';
import CheckoutForm from './form';
import { DEFAULT_SETTINGS, getSettings, bankReady } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Checkout | Nuvé' };

export default async function Checkout({ searchParams }: { searchParams: { pack?: string; cancelled?: string } }) {
  const s = await getSettings().catch(() => DEFAULT_SETTINGS);
  const pack = Number(searchParams.pack) || (s.bundles.find((b) => b.tag === 'MOST POPULAR')?.qty ?? s.bundles[0].qty);
  return (
    <>
      <Header announcement={s.announcement} />
      <main className="page">
        <h1 className="h2" style={{ marginBottom: 6 }}>Checkout</h1>
        {searchParams.cancelled && <p className="err" style={{ marginBottom: 12 }}>Your card payment was cancelled. Your details are below if you&apos;d like to try again.</p>}
        <CheckoutForm bundles={s.bundles} initialPack={pack} eftAvailable={bankReady(s)} eftMinutes={s.eftMinutes} />
      </main>
      <Footer />
    </>
  );
}
