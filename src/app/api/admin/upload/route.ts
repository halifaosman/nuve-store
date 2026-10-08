import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};

// Returns a one-time upload link so large files go straight to storage (Vercel caps request bodies at 4.5 MB).
export async function POST(req: NextRequest) {
  const { type, size } = await req.json().catch(() => ({}));
  const ext = EXT[type];
  if (!ext) return NextResponse.json({ error: 'Use JPG, PNG, WebP, GIF or SVG images, or MP4, WebM or MOV videos.' }, { status: 400 });
  if (Number(size) > 50 * 1024 * 1024) return NextResponse.json({ error: 'Files must be under 50 MB.' }, { status: 413 });
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from('media').createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload. Check the "media" storage bucket exists.' }, { status: 500 });
  return NextResponse.json({ path, token: data.token });
}
