import { NextRequest, NextResponse } from 'next/server';
import { saveFile } from '@/lib/files';
import { mediaUrl } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};
const MAX = 50 * 1024 * 1024;

// Admin uploads an image or video for the store page. Saved on the server's disk under media/.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: 'Use JPG, PNG, WebP or GIF images, or MP4, WebM or MOV videos.' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'Files must be under 50 MB.' }, { status: 413 });
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  try {
    await saveFile('media', path, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error('upload failed', e);
    return NextResponse.json({ error: 'Could not save the file on the server.' }, { status: 500 });
  }
  return NextResponse.json({ path, url: mediaUrl(path) });
}
