import { notFound } from 'next/navigation';
import { Header, Footer } from '@/components/chrome';
import { one } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { expireStale } from '@/lib/orders';
import { rand } from '@/lib/money';
import OrderLive from './live';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your order | Nuvé', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: { id: string }; searchParams: { t?: string; from?: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  await expireStale();
  const o = await one('SELECT * FROM orders WHERE id = ?', [params.id]);
  if (!o || o.access_token !== searchParams.t) notFound();
  const s = await getSettings();
  const items = o.items as { description: string; qty: number; pack_price?: number; unit_price: number }[];

  return (
    <>
      <Header announcement={s.announcement} />
      <main className="page" style={{ maxWidth: 760 }}>
        <p className="eyebrow" style={{ margin: 0 }}>Order #{o.order_number}</p>
        <OrderLive
          id={o.id}
          token={o.access_token}
          method={o.payment_method}
          initialStatus={o.status}
          expiresAt={o.expires_at}
          reference={`NUV${o.order_number}`}
          total={Number(o.total)}
          fromPayfast={searchParams.from === 'payfast'}
          bank={{ name: s.bankName, holder: s.bankAccountName, number: s.bankAccountNumber, branch: s.bankBranchCode, type: s.bankAccountType }}
          popEmail={s.popEmail}
          trackingUrl={o.tracking_url}
          trackingRef={o.tracking_reference}
          serverNow={Date.now()}
        />
        <div className="card" style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b>Order summary</b>
          {items.map((i, k) => <div key={k} className="sumline"><span>{i.description}</span><span>{rand(i.pack_price ?? i.unit_price * i.qty)}</span></div>)}
          <div className="sumline"><span>Delivery ({o.shipping_method})</span><span>{rand(o.shipping_cost)}</span></div>
          <div className="sumline total"><span>Total</span><span>{rand(o.total)}</span></div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            Delivering to {o.customer_first} {o.customer_last}, {o.address_street}, {o.address_suburb}, {o.address_city}, {o.address_postal}
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
