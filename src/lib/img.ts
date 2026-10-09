// Responsive image helpers (safe to use in server and client components).
// Photos under /images/ and /media/ are served resized as WebP by /img/<width>/... (src/app/img/[...p]/route.ts).
// SVGs, GIFs and outside links are left as they are.

export const WIDTHS = [96, 160, 320, 480, 640, 720, 828, 1080, 1440];
const RESIZABLE = /^\/(images|media)\/[^?#]+\.(jpe?g|png|webp)$/i;

export const canResize = (src?: string | null) => !!src && RESIZABLE.test(src);

/** One resized copy, e.g. resized('/media/x.jpg', 640) -> '/img/640/media/x.jpg'. */
export function resized(src: string, width: number): string {
  if (!canResize(src)) return src;
  const w = WIDTHS.find((x) => x >= width) || WIDTHS[WIDTHS.length - 1];
  return `/img/${w}${src}`;
}

/** srcset for the widths that make sense up to `max` pixels. */
export function srcSet(src: string, max = 1440, min = 160): string | undefined {
  if (!canResize(src)) return undefined;
  return WIDTHS.filter((w) => w >= min && w <= max).map((w) => `/img/${w}${src} ${w}w`).join(', ');
}

/** Props for a plain <img>: a sensible default src plus srcset/sizes so phones download small files. */
export function imgProps(src: string, sizes: string, opts: { max?: number; min?: number; fallback?: number } = {}) {
  if (!canResize(src)) return { src };
  return { src: resized(src, opts.fallback ?? 640), srcSet: srcSet(src, opts.max ?? 1440, opts.min ?? 160), sizes };
}
