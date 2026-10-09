import { NextRequest, NextResponse } from 'next/server';
import { rows } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const show = req.nextUrl.searchParams.get('show') || 'open';
  const where = show === 'done' ? "WHERE m.status = 'done'" : show === 'all' ? '' : "WHERE m.status <> 'done'";
  try {
    // in_app: the message is linked to a real order with the same email, so the customer sees replies in their order app.
    const list = await rows<{ id: string; in_app: number | boolean }>(
      `SELECT m.id, m.name, m.email, m.phone, m.order_ref, m.topic, m.message, m.status, m.created_at, (o.id IS NOT NULL) AS in_app
         FROM messages m
         LEFT JOIN orders o ON m.order_ref REGEXP '^NUV[0-9]+$' AND o.order_number = CAST(SUBSTRING(m.order_ref, 4) AS UNSIGNED) AND LOWER(o.email) = LOWER(m.email)
         ${where} ORDER BY m.created_at DESC LIMIT 300`);
    const replies = list.length
      ? await rows<{ message_id: string; body: string; created_at: string }>('SELECT message_id, body, created_at FROM message_replies WHERE message_id IN (?) ORDER BY created_at', [list.map((m) => m.id)])
      : [];
    return NextResponse.json({
      messages: list.map((m) => ({ ...m, in_app: !!Number(m.in_app), replies: replies.filter((r) => r.message_id === m.id).map((r) => ({ body: r.body, at: r.created_at })) })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
}
