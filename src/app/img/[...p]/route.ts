import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { env } from '@/lib/env';
import { filePath } from '@/lib/files';
import { WIDTHS } from '@/lib/img';

export const dynamic = 'force-dynamic';

// Resized WebP copies of store photos: /img/<width>/images/hero.jpg or /img/<width>/media/2026-10/abc.jpg
// Made once with sharp, kept in <DATA_DIR>/cache/img, then served from there (and cached by Cloudflare).
// Phones get a ~40-120 KB image instead of the full-size upload.
const OK = /\.(jpe?g|png|webp)$/i;
const SAFE = /^[0-9A-Za-z][0-9A-Za-z/_.-]*$/;
sharp.concurrency(1); // small server: one resize at a time
sharp.cache(false);

async function source(kind: string, rest: string): Promise<{ file: string; immutable: boolean } | null> {
  if (!SAFE.test(rest) || rest.includes('..') || !OK.test(rest)) return null;
  if (kind === 'media') { const f = filePath('media', rest); return f ? { file: f, immutable: true } : null; }
  if (kind === 'images') {
    const root = path.resolve(process.cwd(), 'public', 'images');
    const f = path.resolve(root, rest);
    return f.startsWith(root + path.sep) ? { file: f, immutable: false } : null;
  }
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: { p: string[] } }) {
  const [w, kind, ...restParts] = params.p || [];
  const width = Number(w);
  if (!WIDTHS.includes(width)) return new Response('Not found', { status: 404 });
  const src = await source(kind, restParts.join('/'));
  if (!src) return new Response('Not found', { status: 404 });
  let stat;
  try { stat = await fs.stat(src.file); } catch { return new Response('Not found', { status: 404 }); }
  const key = crypto.createHash('sha1').update(`${src.file}|${stat.mtimeMs}|${stat.size}|${width}|v1`).digest('hex');
  const dir = path.join(env.dataDir(), 'cache', 'img', key.slice(0, 2));
  const out = path.join(dir, `${key}.webp`);
  let buf: Buffer;
  try {
    buf = await fs.readFile(out);
  } catch {
    try {
      buf = await sharp(src.file, { failOn: 'none' }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 74, effort: 4 }).toBuffer();
    } catch {
      // Not an image sharp can read: send the original rather than a broken picture.
      const orig = await fs.readFile(src.file);
      return new Response(new Uint8Array(orig), { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' } });
    }
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${out}.${process.pid}.tmp`;
    await fs.writeFile(tmp, buf).then(() => fs.rename(tmp, out)).catch(() => {});
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(buf.length),
      'Cache-Control': src.immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=604800, stale-while-revalidate=604800',
    },
  });
}
