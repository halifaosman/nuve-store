import { NextRequest, NextResponse } from 'next/server';
import { exec } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { status } = await req.json().catch(() => ({}));
  if (!['new', 'read', 'done'].includes(status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
  await exec('UPDATE messages SET status = ? WHERE id = ?', [status, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await exec('DELETE FROM messages WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
