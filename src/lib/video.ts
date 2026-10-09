import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { exec, one } from './db';
import { filePath, removeFiles } from './files';

// Store videos are shrunk on the server so they load fast on phones:
// 720 px wide, H.264 with no sound (they always play muted), "faststart" so playback can begin
// before the whole file has arrived, plus a cover image taken from the first second.
// The cron (every minute) compresses one video at a time in the background, then removes the original
// (the nightly backup keeps a copy for 14 days).
// Needs ffmpeg on the server (deploy/setup.sh installs it; or: sudo apt-get install -y ffmpeg).

const WEB = /-web\.mp4$/;
let busy = false;

function run(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-600); });
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg exited ${code}`)); });
  });
}

/** Compresses one stored video. Returns the new video and cover image paths (relative to media/). */
export async function compressVideo(src: string): Promise<{ video: string; poster: string }> {
  const base = src.replace(/\.[a-z0-9]+$/i, '');
  const video = `${base}-web.mp4`, poster = `${base}-poster.jpg`;
  const inFile = filePath('media', src), outFile = filePath('media', video), posterFile = filePath('media', poster);
  if (!inFile || !outFile || !posterFile) throw new Error('Bad file name');
  const tmp = `${outFile}.part.mp4`;
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', inFile, '-map', '0:v:0', '-an', '-sn', '-dn',
    '-vf', "scale='min(720,iw)':-2:flags=lanczos,fps='min(30,source_fps)',format=yuv420p",
    '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1800k', '-bufsize', '3600k',
    '-movflags', '+faststart', '-threads', '2', tmp], 10 * 60_000);
  await fs.rename(tmp, outFile);
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-ss', '0.5', '-i', outFile, '-frames:v', '1', '-vf', "scale='min(540,iw)':-2", '-q:v', '4', posterFile], 60_000)
    .catch(() => run(['-y', '-hide_banner', '-loglevel', 'error', '-i', outFile, '-frames:v', '1', '-q:v', '4', posterFile], 60_000));
  return { video, poster };
}

/** Called from the cron: compresses the next store video that hasn't been done yet. Never throws. */
export async function compressNextVideo(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    // Release jobs left "working" by a restart.
    await exec("DELETE FROM video_jobs WHERE status = 'working' AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 20 MINUTE");
    const next = await one<{ video: string }>(
      `SELECT v.video FROM videos v LEFT JOIN video_jobs j ON j.src = v.video
        WHERE v.video IS NOT NULL AND v.video NOT LIKE '%-web.mp4' AND j.src IS NULL ORDER BY v.created_at LIMIT 1`);
    if (!next || WEB.test(next.video)) return;
    const claimed = await exec("INSERT IGNORE INTO video_jobs (src, status) VALUES (?, 'working')", [next.video]);
    if (!claimed) return;
    try {
      const before = (await fs.stat(filePath('media', next.video) || '')).size;
      const out = await compressVideo(next.video);
      const after = (await fs.stat(filePath('media', out.video) || '')).size;
      if (after >= before) {
        // Already small: keep the original file, but still use the new cover image.
        await removeFiles('media', [out.video]);
        await exec("UPDATE videos SET poster = COALESCE(poster, ?) WHERE video = ?", [out.poster, next.video]);
        await exec("UPDATE video_jobs SET status = 'done', result = ? WHERE src = ?", [`kept original (${mb(before)})`, next.video]);
        return;
      }
      await exec('UPDATE videos SET video = ?, poster = COALESCE(poster, ?) WHERE video = ?', [out.video, out.poster, next.video]);
      await exec("UPDATE video_jobs SET status = 'done', result = ? WHERE src = ?", [`${mb(before)} -> ${mb(after)}`, next.video]);
      await removeFiles('media', [next.video]); // the nightly backup still has the original
      console.log(`video compressed ${next.video}: ${mb(before)} -> ${mb(after)}`);
    } catch (e) {
      const noFfmpeg = (e as NodeJS.ErrnoException)?.syscall === 'spawn ffmpeg';
      const msg = noFfmpeg ? 'ffmpeg is not installed on the server' : e instanceof Error ? e.message : 'failed';
      console.warn('video compress failed', next.video, msg);
      // Missing ffmpeg: forget the job so it runs once ffmpeg is installed.
      if (noFfmpeg) await exec('DELETE FROM video_jobs WHERE src = ?', [next.video]);
      else await exec("UPDATE video_jobs SET status = 'failed', result = ? WHERE src = ?", [msg.slice(0, 250), next.video]);
    }
  } catch (e) {
    console.warn('video compress skipped', e instanceof Error ? e.message : e);
  } finally {
    busy = false;
  }
}

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
