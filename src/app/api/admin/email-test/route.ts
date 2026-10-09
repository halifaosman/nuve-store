import { NextRequest, NextResponse } from 'next/server';
import { rows } from '@/lib/db';
import { emailEnabled, sendTestEmail } from '@/lib/email';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Email status for the admin: recent sends and failures.
export async function GET() {
  const recent = await rows('SELECT ref, kind, to_addr, subject, status, attempts, error, updated_at FROM email_log ORDER BY updated_at DESC LIMIT 30').catch(() => []);
  const s = await getSettings();
  return NextResponse.json({ enabled: emailEnabled(), owner: s.bizEmail || s.popEmail || '', recent });
}

export async function POST(req: NextRequest) {
  if (!emailEnabled()) return NextResponse.json({ error: 'Add the Resend API key above and save first.' }, { status: 400 });
  const { to } = await req.json().catch(() => ({}));
  const addr = String(to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return NextResponse.json({ error: 'Enter the email address to send the test to.' }, { status: 400 });
  const r = await sendTestEmail(addr);
  if (!r.ok) return NextResponse.json({ error: `Resend said: ${r.error}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
