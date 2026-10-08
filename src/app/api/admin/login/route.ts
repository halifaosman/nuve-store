import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { makeSession, passwordMatches, SESSION_COOKIE } from '@/lib/auth';

const MAX_FAILS = 8;
const WINDOW_MIN = 15;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const since = new Date(Date.now() - WINDOW_MIN * 60e3).toISOString();
  const { count } = await db().from('login_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
  if ((count || 0) >= MAX_FAILS) {
    return NextResponse.json({ error: `Too many wrong passwords. Try again in ${WINDOW_MIN} minutes.` }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!(await passwordMatches(String(password || ''), env.adminPassword(), env.sessionSecret()))) {
    await db().from('login_attempts').insert({ ip });
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: 'That password is not right.' }, { status: 401 });
  }
  await db().from('login_attempts').delete().eq('ip', ip);
  const s = await makeSession(env.sessionSecret());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: s.maxAge });
  return res;
}
