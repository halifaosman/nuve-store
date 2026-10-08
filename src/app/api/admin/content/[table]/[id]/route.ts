import { NextRequest, NextResponse } from 'next/server';
import { exec, one, setClause } from '@/lib/db';
import { CONTENT_TABLES, pickContent as pick } from '@/lib/content';
import { removeFiles } from '@/lib/files';

const MEDIA = ['photo', 'avatar', 'video', 'poster', 'image'];

export async function PATCH(req: NextRequest, { params }: { params: { table: string; id: string } }) {
  const t = CONTENT_TABLES[params.table];
  if (!t) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  const row = pick(params.table, await req.json().catch(() => ({})));
  const missing = t.required.filter((f) => f in row && !row[f]);
  if (missing.length) return NextResponse.json({ error: `Fill in: ${missing.join(', ')}` }, { status: 400 });
  if (!Object.keys(row).length) return NextResponse.json({ ok: true });
  try {
    const before = await one(`SELECT * FROM \`${params.table}\` WHERE id = ?`, [params.id]);
    if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const set = setClause(row);
    await exec(`UPDATE \`${params.table}\` SET ${set.sql} WHERE id = ?`, [...set.params, params.id]);
    // Delete files that were replaced by a new upload.
    const replaced = MEDIA.filter((m) => m in row && before[m] && before[m] !== row[m]).map((m) => before[m] as string);
    await removeFiles('media', replaced.filter((v) => !v.startsWith('/') && !v.startsWith('http')));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { table: string; id: string } }) {
  if (!CONTENT_TABLES[params.table]) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  try {
    const row = await one(`SELECT * FROM \`${params.table}\` WHERE id = ?`, [params.id]);
    await exec(`DELETE FROM \`${params.table}\` WHERE id = ?`, [params.id]);
    const files = row ? MEDIA.map((m) => row[m]).filter((v): v is string => typeof v === 'string' && !v.startsWith('/') && !v.startsWith('http')) : [];
    await removeFiles('media', files);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
}
