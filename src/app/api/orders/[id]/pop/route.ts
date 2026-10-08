import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { expireStale, logEvent } from '@/lib/orders';

const TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

// Customer uploads proof of payment for a bank-transfer order. Max 4 MB (Vercel's request limit).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const t = req.nextUrl.searchParams.get('t') || '';
  await expireStale();
  const { data: o } = await db().from('orders').select('id, status, access_token, payment_method').eq('id', params.id).maybeSingle();
  if (!o || o.access_token !== t) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (o.payment_method !== 'eft') return NextResponse.json({ error: 'This order was not a bank transfer.' }, { status: 400 });
  if (o.status === 'expired') return NextResponse.json({ error: 'This order expired before proof of payment arrived. If you already paid, reply to your confirmation email or contact us with your order number.' }, { status: 410 });
  if (!['awaiting_eft', 'eft_review'].includes(o.status)) return NextResponse.json({ error: 'This order no longer needs proof of payment.' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Upload a PDF or a photo (JPG, PNG or WebP).' }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'That file is over 4 MB. Take a screenshot or export a smaller PDF.' }, { status: 413 });

  const path = `${o.id}/${Date.now()}.${ext}`;
  const up = await db().storage.from('proofs').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (up.error) return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });

  const { data: changed } = await db().from('orders')
    .update({ status: 'eft_review', pop_path: path, pop_uploaded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', o.id).in('status', ['awaiting_eft', 'eft_review']).select('id');
  if (!changed?.length) return NextResponse.json({ error: 'This order changed while you were uploading. Refresh the page to see its status.' }, { status: 409 });
  await logEvent(o.id, 'pop', 'Customer uploaded proof of payment');
  return NextResponse.json({ ok: true });
}
