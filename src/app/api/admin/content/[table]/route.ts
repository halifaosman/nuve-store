import { NextRequest, NextResponse } from 'next/server';
import { db, mediaUrl } from '@/lib/db';
import { CONTENT_TABLES, pickContent as pick } from '@/lib/content';

export const dynamic = 'force-dynamic';
const MEDIA = ['photo', 'avatar', 'video', 'poster', 'image'];

export async function GET(_: NextRequest, { params }: { params: { table: string } }) {
  if (!CONTENT_TABLES[params.table]) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  const { data, error } = await db().from(params.table).select('*').order('sort').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []).map((r: Record<string, unknown>) => {
    const urls: Record<string, string> = {};
    for (const m of MEDIA) if (r[m]) urls[m] = mediaUrl(r[m] as string);
    return { ...r, _urls: urls };
  });
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest, { params }: { params: { table: string } }) {
  const t = CONTENT_TABLES[params.table];
  if (!t) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  const row = pick(params.table, await req.json().catch(() => ({})));
  const missing = t.required.filter((f) => !row[f]);
  if (missing.length) return NextResponse.json({ error: `Fill in: ${missing.join(', ')}` }, { status: 400 });
  if (row.sort === undefined) {
    const { data } = await db().from(params.table).select('sort').order('sort', { ascending: false }).limit(1);
    row.sort = ((data?.[0]?.sort as number) || 0) + 1;
  }
  const { error } = await db().from(params.table).insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
