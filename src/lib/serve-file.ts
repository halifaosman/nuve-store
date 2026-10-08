import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { CONTENT_TYPES } from './files';

/** Streams a file from disk, with Range support so videos can be scrubbed and play on iPhones. */
export async function serveFile(full: string, rangeHeader: string | null, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const stat = await fs.stat(full).catch(() => null);
  if (!stat?.isFile()) return new Response('Not found', { status: 404 });
  const type = CONTENT_TYPES[path.extname(full).slice(1).toLowerCase()] || 'application/octet-stream';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', ...extraHeaders };

  const m = rangeHeader && /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : stat.size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${stat.size}` } });
    const body = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${stat.size}` } });
  }
  const body = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new Response(body, { status: 200, headers: { ...base, 'Content-Length': String(stat.size) } });
}
