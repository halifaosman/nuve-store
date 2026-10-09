import { NextRequest, NextResponse } from 'next/server';
import { exec, rows } from '@/lib/db';
import { env } from '@/lib/env';
import { cleanConfig, decide, fillers, flaggedWhere, getFbConfig, getFbStatus, runFbAuto, saveFbConfig, testFbConnection, FbConfig } from '@/lib/fbauto';

export const dynamic = 'force-dynamic';

const LOG = 'SELECT comment_id, post_id, from_name, message, commented_at, rule_key, action, reply, note, done, created_at FROM fb_comments';

export async function GET() {
  const config = await getFbConfig();
  const [status, log, needs, counts] = await Promise.all([
    getFbStatus(),
    rows(`${LOG} WHERE action <> 'working' ORDER BY created_at DESC LIMIT 150`),
    rows(`${LOG} WHERE ${flaggedWhere} ORDER BY created_at DESC LIMIT 100`),
    rows<{ action: string; n: number }>("SELECT action, COUNT(*) AS n FROM fb_comments WHERE created_at > UTC_TIMESTAMP(3) - INTERVAL 7 DAY GROUP BY action"),
  ]);
  return NextResponse.json({
    config, status, log, needs,
    week: Object.fromEntries(counts.map((c) => [c.action, Number(c.n)])),
    tokenSet: !!env.fbPageToken(), pageId: env.fbPageId(), placeholders: await fillers(),
  });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<FbConfig>;
  const c = cleanConfig(body, await getFbConfig());
  await saveFbConfig(c);
  return NextResponse.json({ ok: true, config: c });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b.action === 'connect') {
    try { return NextResponse.json(await testFbConnection()); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  }
  if (b.action === 'check') {
    const c = await getFbConfig();
    if (!c.enabled) return NextResponse.json({ error: 'Switch auto-replies on first.' }, { status: 400 });
    return NextResponse.json(await runFbAuto());
  }
  if (b.action === 'preview') {
    const c = b.config ? cleanConfig(b.config, await getFbConfig()) : await getFbConfig();
    const d = decide(c, String(b.text || '').slice(0, 2000), false, await fillers(), String(b.name || 'Thandi'));
    return NextResponse.json({ action: d.action, rule: d.rule?.label || null, reply: d.reply, note: d.note, flag: !!d.flag });
  }
  if (b.action === 'done' && typeof b.id === 'string') {
    await exec('UPDATE fb_comments SET done = ? WHERE comment_id = ?', [b.done === false ? 0 : 1, b.id]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
