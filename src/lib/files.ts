import { promises as fs } from 'fs';
import path from 'path';
import { env } from './env';

// Uploaded files live on the server's disk, outside the code folder:
//   <DATA_DIR>/media   images and videos shown on the store (public, served at /media/...)
//   <DATA_DIR>/proofs  proof-of-payment uploads (admin only)
export type Bucket = 'media' | 'proofs';

const SAFE = /^[0-9A-Za-z][0-9A-Za-z/_.-]*$/;

/** Absolute path of a stored file, or null if the name could escape its folder. */
export function filePath(bucket: Bucket, name: string): string | null {
  if (!SAFE.test(name) || name.includes('..')) return null;
  const root = path.resolve(env.dataDir(), bucket);
  const full = path.resolve(root, name);
  return full.startsWith(root + path.sep) ? full : null;
}

export async function saveFile(bucket: Bucket, name: string, data: Buffer): Promise<void> {
  const full = filePath(bucket, name);
  if (!full) throw new Error('Bad file name');
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data, { flag: 'wx' });
}

export async function removeFiles(bucket: Bucket, names: string[]): Promise<void> {
  for (const n of names) {
    const full = filePath(bucket, n);
    if (!full) continue;
    await fs.unlink(full).catch(() => {});
    if (n.includes('/')) await fs.rmdir(path.dirname(full)).catch(() => {}); // only succeeds if the folder is now empty
  }
}

export const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', heic: 'image/heic',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf',
};
