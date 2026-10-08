import { NextRequest, NextResponse } from 'next/server';
import { exec, one } from '@/lib/db';
import { makeSession, passwordMatches, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_FAILS = 8;
const WINDOW_MIN = 15;

// Pasted values often pick up a trailing space or line break; ignore those on both sides.
const clean = (v: string | undefined) => (v || '').replace(/^\s+|\s+$/g, '');

export async function POST(req: NextRequest) {
  const expected = clean(process.env.ADMIN_PASSWORD);
  const secret = clean(process.env.SESSION_SECRET);
  const missing = [!expected && 'ADMIN_PASSWORD', !secret && 'SESSION_SECRET'].filter(Boolean);
  if (missing.length) {
    return NextResponse.json({
      error: `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set on this deployment. Add ${missing.length > 1 ? 'them' : 'it'} to the .env file on the server and run deploy/update.sh.`,
    }, { status: 500 });
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  // Lockout is best effort: if the database isn't reachable yet, still let the right password in.
  let database = true;
  try {
    const r = await one<{ n: number }>(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND created_at >= UTC_TIMESTAMP(3) - INTERVAL ${WINDOW_MIN} MINUTE`, [ip]);
    if (Number(r?.n || 0) >= MAX_FAILS) {
      return NextResponse.json({ error: `Too many wrong passwords. Try again in ${WINDOW_MIN} minutes.` }, { status: 429 });
    }
  } catch (e) {
    database = false;
    console.error('login: database check failed', e);
  }

  const body = await req.json().catch(() => ({}));
  const given = clean(String(body?.password ?? ''));
  if (!(await passwordMatches(given, expected, secret))) {
    if (database) await exec('INSERT INTO login_attempts (ip) VALUES (?)', [ip]).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: 'That password is not right. It must match ADMIN_PASSWORD in your .env settings exactly (capital letters count).' }, { status: 401 });
  }

  if (database) await exec('DELETE FROM login_attempts WHERE ip = ?', [ip]).catch(() => {});
  const s = await makeSession(secret);
  const res = NextResponse.json({
    ok: true,
    warning: database ? undefined : 'Logged in, but the database is not connected yet. Check DATABASE_URL in .env and that MySQL is running.',
  });
  res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: s.maxAge });
  return res;
}
