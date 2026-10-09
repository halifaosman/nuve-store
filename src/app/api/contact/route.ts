import { NextRequest, NextResponse } from 'next/server';
import { insert } from '@/lib/db';
import { clientIp, overLimit } from '@/lib/ratelimit';
import { messageEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
const TOPICS = ['My order', 'Delivery', 'Returns and refunds', 'Product question', 'Something else'];
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

// Contact Us form. Messages appear in the admin under Messages.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (str(b.website, 100)) return NextResponse.json({ ok: true }); // hidden field: only bots fill it in
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const phone = str(b.phone, 30);
  const orderRef = str(b.order, 30);
  const topic = TOPICS.includes(String(b.topic)) ? String(b.topic) : 'Something else';
  const message = str(b.message, 4000);
  const errors: string[] = [];
  if (name.length < 2) errors.push('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('Please enter a valid email address.');
  if (message.length < 5) errors.push('Please write a short message.');
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
  try {
    if (await overLimit('contact', clientIp(req), 5, 60)) {
      return NextResponse.json({ error: 'You have sent a few messages already. Please try again a bit later.' }, { status: 429 });
    }
    const id = crypto.randomUUID();
    await insert('messages', { id, name, email, phone: phone || null, order_ref: orderRef || null, topic, message, ip: clientIp(req) });
    void messageEmail(id); // copy to the shop's inbox
  } catch (e) {
    console.error('contact form failed', e);
    return NextResponse.json({ error: 'Your message could not be sent. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
