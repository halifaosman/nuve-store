import { NextRequest, NextResponse } from 'next/server';
import { exec, now } from '@/lib/db';
import { DEFAULT_SETTINGS, getSettings, SiteSettings } from '@/lib/settings';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    settings: await getSettings(),
    defaults: DEFAULT_SETTINGS,
    status: {
      siteUrl: env.siteUrl(),
      payfastSandbox: env.payfastSandbox(),
      bobgoSandbox: env.bobgoSandbox(),
      bobgoKey: !!env.bobgoKey(),
      bobgoWebhookSecret: !!env.bobgoWebhookSecret(),
    },
  });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<SiteSettings>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof SiteSettings)[]) {
    if (!(k in body)) continue;
    const def = DEFAULT_SETTINGS[k];
    const v = body[k];
    if (typeof def === 'number') out[k] = Number(v) || 0;
    else if (typeof def === 'string') out[k] = String(v ?? '').slice(0, 2000);
    else out[k] = v;
  }
  if (Array.isArray(out.bundles)) {
    out.bundles = (out.bundles as Record<string, unknown>[]).slice(0, 5).map((b) => ({
      qty: Math.max(1, Math.round(Number(b.qty) || 1)), label: String(b.label || '').slice(0, 60), sub: String(b.sub || '').slice(0, 120),
      price: Math.max(5, Number(b.price) || 0), compare: Math.max(0, Number(b.compare) || 0), tag: String(b.tag || '').slice(0, 30),
    }));
  }
  if (out.eftMinutes !== undefined) out.eftMinutes = Math.min(1440, Math.max(5, Number(out.eftMinutes)));
  try {
    await exec("INSERT INTO settings (`key`, value, updated_at) VALUES ('site', ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)", [JSON.stringify(out), now()]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
