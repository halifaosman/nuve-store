import { db, mediaUrl } from './db';

export type Review = { id: string; name: string; stars: number; title: string | null; body: string; photo: string; avatar: string; verified: boolean; featured: boolean; created_at: string };
export type Video = { id: string; video: string; caption: string | null; avatar: string; poster: string };
export type Photo = { id: string; image: string; caption: string | null };
export type Logo = { id: string; image: string; name: string };
export type Section = { id: string; eyebrow: string | null; heading: string; body: string | null; image: string; side: string; cta: string | null };

async function list<T>(table: string, media: string[]): Promise<T[]> {
  const { data } = await db().from(table).select('*').order('sort').order('created_at');
  return (data || []).map((r: Record<string, unknown>) => {
    const out = { ...r };
    for (const m of media) out[m] = mediaUrl(r[m] as string);
    return out as T;
  });
}

export async function getContent() {
  const [reviews, videos, photos, logos, sections] = await Promise.all([
    list<Review>('reviews', ['photo', 'avatar']),
    list<Video>('videos', ['video', 'avatar', 'poster']),
    list<Photo>('photos', ['image']),
    list<Logo>('logos', ['image']),
    list<Section>('sections', ['image']),
  ]);
  return { reviews, videos, photos, logos, sections };
}

// Admin content tables and the fields an admin may write. Anything else in a request is ignored.
export const CONTENT_TABLES: Record<string, { fields: string[]; required: string[] }> = {
  reviews: { fields: ['name', 'stars', 'title', 'body', 'photo', 'avatar', 'verified', 'featured', 'sort'], required: ['name', 'body'] },
  videos: { fields: ['video', 'caption', 'avatar', 'poster', 'sort'], required: ['video'] },
  photos: { fields: ['image', 'caption', 'sort'], required: ['image'] },
  logos: { fields: ['image', 'name', 'sort'], required: ['image', 'name'] },
  sections: { fields: ['eyebrow', 'heading', 'body', 'image', 'side', 'cta', 'sort'], required: ['heading'] },
};

export function pickContent(table: string, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of CONTENT_TABLES[table].fields) {
    if (!(f in body)) continue;
    let v = body[f];
    if (typeof v === 'string') v = v.trim().slice(0, f === 'body' ? 4000 : 300);
    if (v === '') v = null;
    if (f === 'stars') v = Math.min(5, Math.max(1, Math.round(Number(v) || 5)));
    if (f === 'sort') v = Math.round(Number(v) || 0);
    if (f === 'verified' || f === 'featured') v = !!v;
    out[f] = v;
  }
  return out;
}

