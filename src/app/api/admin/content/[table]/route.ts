import { NextRequest, NextResponse } from 'next/server';
import { rows, one, insert, mediaUrl } from '@/lib/db';
import { CONTENT_TABLES, pickContent as pick } from '@/lib/content';

export const dynamic = 'force-dynamic';
const MEDIA = ['photo', 'avatar', 'video', 'poster', 'image'];

export async function GET(_: NextRequest, { params }: { params: { table: string } }) {
  if (!CONTENT_TABLES[params.table]) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  try {
    const data = await rows(`SELECT * FROM \`${params.table}\` ORDER BY sort, created_at`);
    const out = data.map((r) => {
      const urls: Record<string, string> = {};
      for (const m of MEDIA) if (r[m]) urls[m] = mediaUrl(r[m] as string);
      return { ...r, _urls: urls };
    });
    return NextResponse.json({ rows: out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { table: string } }) {
  const t = CONTENT_TABLES[params.table];
  if (!t) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  const row = pick(params.table, await req.json().catch(() => ({})));
  const missing = t.required.filter((f) => !row[f]);
  if (missing.length) return NextResponse.json({ error: `Fill in: ${missing.join(', ')}` }, { status: 400 });
  try {
    if (row.sort === undefined) {
      const top = await one<{ m: number | null }>(`SELECT MAX(sort) AS m FROM \`${params.table}\``);
      row.sort = (top?.m || 0) + 1;
    }
    await insert(params.table, { id: crypto.randomUUID(), ...row });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
}
