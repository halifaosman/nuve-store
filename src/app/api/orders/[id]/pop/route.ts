import { NextRequest, NextResponse } from 'next/server';
import { exec, one, now } from '@/lib/db';
import { saveFile } from '@/lib/files';
import { expireStale, logEvent } from '@/lib/orders';

const TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

// Customer uploads proof of payment for a bank-transfer order. Max 4 MB. Saved privately on the server's disk.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const t = req.nextUrl.searchParams.get('t') || '';
  await expireStale();
  const o = await one<{ id: string; status: string; access_token: string; payment_method: string }>('SELECT id, status, access_token, payment_method FROM orders WHERE id = ?', [params.id]);
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
  try {
    await saveFile('proofs', path, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error('proof upload failed', e);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  const changed = await exec(
    "UPDATE orders SET status = 'eft_review', pop_path = ?, pop_uploaded_at = ?, updated_at = ? WHERE id = ? AND status IN ('awaiting_eft','eft_review')",
    [path, now(), now(), o.id]);
  if (!changed) return NextResponse.json({ error: 'This order changed while you were uploading. Refresh the page to see its status.' }, { status: 409 });
  await logEvent(o.id, 'pop', 'Customer uploaded proof of payment');
  return NextResponse.json({ ok: true });
}
