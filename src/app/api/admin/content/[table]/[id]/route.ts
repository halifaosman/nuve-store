import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { CONTENT_TABLES, pickContent as pick } from '@/lib/content';

const MEDIA = ['photo', 'avatar', 'video', 'poster', 'image'];

export async function PATCH(req: NextRequest, { params }: { params: { table: string; id: string } }) {
  const t = CONTENT_TABLES[params.table];
  if (!t) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  const row = pick(params.table, await req.json().catch(() => ({})));
  const missing = t.required.filter((f) => f in row && !row[f]);
  if (missing.length) return NextResponse.json({ error: `Fill in: ${missing.join(', ')}` }, { status: 400 });
  const { error } = await db().from(params.table).update(row).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { table: string; id: string } }) {
  if (!CONTENT_TABLES[params.table]) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  const { data: row } = await db().from(params.table).select('*').eq('id', params.id).maybeSingle();
  const { error } = await db().from(params.table).delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const files = row ? MEDIA.map((m) => row[m]).filter((v): v is string => typeof v === 'string' && !v.startsWith('/') && !v.startsWith('http')) : [];
  if (files.length) await db().storage.from('media').remove(files);
  return NextResponse.json({ ok: true });
}
