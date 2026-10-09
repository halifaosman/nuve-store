import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { one } from '@/lib/db';
import OrderApp from './app';
import './app.css';

export const dynamic = 'force-dynamic';

type P = { params: { id: string }; searchParams: { t?: string } };

async function check(id: string, t?: string) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !t) return null;
  const o = await one<{ order_number: number; access_token: string }>('SELECT order_number, access_token FROM orders WHERE id = ?', [id]);
  return o && o.access_token === t ? o : null;
}

export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const o = await check(params.id, searchParams.t);
  if (!o) return { title: 'Order not found | Nuvé', robots: { index: false } };
  return {
    title: `Order NUV${o.order_number} | Nuvé`,
    robots: { index: false, follow: false },
    manifest: `/my/${params.id}/manifest.webmanifest?t=${encodeURIComponent(searchParams.t || '')}`,
    appleWebApp: { capable: true, title: 'Nuvé', statusBarStyle: 'black-translucent' },
    icons: { icon: '/brand/nuve-favicon.svg', apple: '/brand/app-180.png' },
    referrer: 'no-referrer',
  };
}

export const viewport: Viewport = { themeColor: '#1E1714', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function MyOrder({ params, searchParams }: P) {
  if (!(await check(params.id, searchParams.t))) notFound();
  return <OrderApp id={params.id} token={searchParams.t as string} />;
}
