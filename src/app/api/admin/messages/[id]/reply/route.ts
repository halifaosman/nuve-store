import { NextRequest, NextResponse } from 'next/server';
import { exec, insert, one } from '@/lib/db';

// Reply shown to the customer in their order app (Help tab). Marks the message done.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { body } = await req.json().catch(() => ({}));
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: 'Keep replies under 4000 characters.' }, { status: 400 });
  const m = await one<{ id: string }>('SELECT id FROM messages WHERE id = ?', [params.id]);
  if (!m) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  await insert('message_replies', { message_id: params.id, body: text });
  await exec("UPDATE messages SET status = 'done' WHERE id = ?", [params.id]);
  return NextResponse.json({ ok: true });
}
