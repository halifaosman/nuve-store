import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { EDITABLE, checkValue, mask, readEnvFile, writeEnvValues } from '@/lib/envfile';
import { passwordMatches } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { values } = await readEnvFile();
    return NextResponse.json({
      fields: EDITABLE.map((f) => ({ ...f, value: f.secret ? '' : values[f.key] ?? '', hint: f.secret ? mask(values[f.key] || '') : '', isSet: !!values[f.key] })),
    });
  } catch {
    return NextResponse.json({ error: 'The .env file could not be read on this server.' }, { status: 500 });
  }
}

// Body: { password, values: { KEY: value } }. Secret fields left empty are kept as they are.
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const expected = (process.env.ADMIN_PASSWORD || '').trim();
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (!expected || !secret || !(await passwordMatches(String(body.password || '').trim(), expected, secret))) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: 'Your admin password is not right, so nothing was changed.' }, { status: 401 });
  }
  const incoming = (body.values || {}) as Record<string, unknown>;
  const { values: current } = await readEnvFile().catch(() => ({ values: {} as Record<string, string> }));
  const changes: Record<string, string> = {};
  const errors: string[] = [];
  for (const f of EDITABLE) {
    if (!(f.key in incoming)) continue;
    const v = String(incoming[f.key] ?? '').trim();
    if (f.secret && v === '' && f.key !== 'PAYFAST_PASSPHRASE') continue; // empty = keep
    if (f.key === 'PAYFAST_PASSPHRASE' && v === '' && incoming.PAYFAST_PASSPHRASE_CLEAR !== true) continue;
    if ((current[f.key] ?? '') === v) continue;
    const problem = checkValue(f, v);
    if (problem) errors.push(problem); else changes[f.key] = v;
  }
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
  if (!Object.keys(changes).length) return NextResponse.json({ ok: true, changed: [], restarting: false });
  try {
    await writeEnvValues(changes);
  } catch (e) {
    console.error('env write failed', e);
    return NextResponse.json({ error: 'The .env file could not be saved on this server.' }, { status: 500 });
  }
  // Restart shortly after replying, so the new settings load. (Only works on the server, where the store runs as a service.)
  let restarting = false;
  if (process.env.NODE_ENV === 'production') {
    restarting = true;
    setTimeout(() => {
      const p = spawn('sudo', ['-n', '/usr/bin/systemctl', 'restart', 'nuve-store'], { detached: true, stdio: 'ignore' });
      p.on('error', (e) => console.error('restart failed', e));
      p.unref();
    }, 800);
  }
  console.warn('Admin changed server settings:', Object.keys(changes).join(', '));
  return NextResponse.json({ ok: true, changed: Object.keys(changes), restarting });
}
