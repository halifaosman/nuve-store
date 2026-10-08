import { NextRequest } from 'next/server';
import { one } from '@/lib/db';
import { filePath } from '@/lib/files';
import { serveFile } from '@/lib/serve-file';

export const dynamic = 'force-dynamic';

// Proof of payment for an order. Admin only (the middleware checks the login cookie for /api/admin/*).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const o = await one<{ pop_path: string | null }>('SELECT pop_path FROM orders WHERE id = ?', [params.id]);
  const full = o?.pop_path ? filePath('proofs', o.pop_path) : null;
  if (!full) return new Response('Not found', { status: 404 });
  return serveFile(full, req.headers.get('range'), { 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'Content-Security-Policy': 'sandbox' });
}
