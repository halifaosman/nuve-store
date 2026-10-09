import { NextRequest, NextResponse } from 'next/server';
import { rows } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const show = req.nextUrl.searchParams.get('show') || 'open';
  const where = show === 'done' ? "WHERE status = 'done'" : show === 'all' ? '' : "WHERE status <> 'done'";
  try {
    const list = await rows(`SELECT id, name, email, phone, order_ref, topic, message, status, created_at FROM messages ${where} ORDER BY created_at DESC LIMIT 300`);
    return NextResponse.json({ messages: list });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
}
