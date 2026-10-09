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
    else if (typeof def === 'string') out[k] = String(v ?? '').slice(0, k.startsWith('policy') ? 40000 : 2000);
    else if (typeof def === 'boolean') out[k] = !!v;
    else out[k] = v;
  }
  if (Array.isArray(out.bundles)) {
    out.bundles = (out.bundles as Record<string, unknown>[]).slice(0, 5).map((b) => ({
      qty: Math.max(1, Math.round(Number(b.qty) || 1)), label: String(b.label || '').slice(0, 60), sub: String(b.sub || '').slice(0, 120),
      price: Math.max(5, Number(b.price) || 0), compare: Math.max(0, Number(b.compare) || 0), tag: String(b.tag || '').slice(0, 30),
    }));
  }
  if (out.payLogoSize !== undefined) out.payLogoSize = Math.min(90, Math.max(16, Math.round(Number(out.payLogoSize) || 40)));
  if (out.payLogos !== undefined) {
    out.payLogos = (Array.isArray(out.payLogos) ? out.payLogos : [])
      .map((v) => String(v || '').trim())
      .filter((v) => /^[0-9A-Za-z][0-9A-Za-z/_.-]*$/.test(v) && !v.includes('..'))
      .slice(0, 12);
  }
  if (out.trustAvatars !== undefined) {
    out.trustAvatars = (Array.isArray(out.trustAvatars) ? out.trustAvatars : [])
      .map((v) => String(v || '').trim())
      .filter((v) => /^[0-9A-Za-z][0-9A-Za-z/_.-]*$/.test(v) && !v.includes('..'))
      .slice(0, 3);
  }
  for (const k of ['readyDaysMin', 'readyDaysMax', 'deliverDaysMin', 'deliverDaysMax'] as const) {
    if (out[k] !== undefined) out[k] = Math.min(60, Math.max(0, Math.round(Number(out[k]) || 0)));
  }
  if (out.ratingMode !== undefined && !['auto', 'custom', 'hidden'].includes(String(out.ratingMode))) out.ratingMode = 'auto';
  if (out.ratingValue !== undefined) out.ratingValue = Math.min(5, Math.max(0, Math.round(Number(out.ratingValue) * 10) / 10));
  if (out.ratingCount !== undefined) out.ratingCount = Math.max(0, Math.round(Number(out.ratingCount) || 0));
  if (out.eftMinutes !== undefined) out.eftMinutes = Math.min(1440, Math.max(5, Number(out.eftMinutes)));
  try {
    await exec("INSERT INTO settings (`key`, value, updated_at) VALUES ('site', ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)", [JSON.stringify(out), now()]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
