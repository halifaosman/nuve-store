import { NextRequest } from 'next/server';
import { filePath } from '@/lib/files';
import { serveFile } from '@/lib/serve-file';

export const dynamic = 'force-dynamic';

// Public images and videos uploaded in the admin. File names are random, so they can be cached for a long time.
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const full = filePath('media', params.path.join('/'));
  if (!full) return new Response('Not found', { status: 404 });
  return serveFile(full, req.headers.get('range'), { 'Cache-Control': 'public, max-age=31536000, immutable' });
}
