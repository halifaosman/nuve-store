import { NextRequest } from 'next/server';
import { exec, one } from './db';

export const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

/** True if this IP has used up its allowance for the bucket; otherwise records the hit. */
export async function overLimit(bucket: string, ip: string, max: number, minutes: number): Promise<boolean> {
  const r = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM rate_hits WHERE bucket = ? AND ip = ? AND created_at >= UTC_TIMESTAMP(3) - INTERVAL ${Math.round(minutes)} MINUTE`, [bucket, ip]);
  if (Number(r?.n || 0) >= max) return true;
  await exec('INSERT INTO rate_hits (bucket, ip) VALUES (?, ?)', [bucket, ip]);
  if (Math.random() < 0.02) await exec('DELETE FROM rate_hits WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 2 DAY').catch(() => {});
  return false;
}
