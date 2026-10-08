import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionValid } from './lib/auth';

function publicOrigin(req: NextRequest): string {
  const site = (process.env.SITE_URL || '').trim().replace(/\/$/, '');
  if (/^https?:\/\/[^/]+$/.test(site)) return site;
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim();
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/admin/login' || pathname === '/api/admin/login') return NextResponse.next();
  const ok = await sessionValid(req.cookies.get(SESSION_COOKIE)?.value, (process.env.SESSION_SECRET || '').trim());
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  // Behind Caddy, Next only knows its internal address (127.0.0.1 -> "localhost"), so req.nextUrl would
  // send the browser to localhost. Use the public address instead: SITE_URL, else the domain the visitor used.
  return NextResponse.redirect(new URL('/admin/login', publicOrigin(req)));
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
