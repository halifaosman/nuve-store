import { one } from './db';

export type Bundle = { qty: number; label: string; sub: string; price: number; compare: number; tag: string };
export type Address = { company: string; street_address: string; local_area: string; city: string; zone: string; code: string };

export type SiteSettings = {
  announcement: string;
  headline: string;
  subhead: string;
  bundles: Bundle[];
  trustCount: string;
  trustTitle: string;
  trustText: string;
  trustAvatars: string[];
  ratingMode: string; // 'auto' (from your reviews) | 'custom' | 'hidden'
  ratingValue: number;
  ratingCount: number;
  ratingNote: string;
  featTitle: string;
  videoHeading: string;
  videoSub: string;
  photoHeading: string;
  stripLabel: string;
  reviewsHeading: string;
  shipping: string;
  // Store operations
  eftMinutes: number;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranchCode: string;
  bankAccountType: string;
  popEmail: string;
  collection: Address;
  unitWeightKg: number;
  unitLengthCm: number;
  unitWidthCm: number;
  unitHeightCm: number;
  fallbackShippingName: string;
  fallbackShippingPrice: number;
  handlingDays: number;
  showTimeline: boolean;
  readyDaysMin: number;
  readyDaysMax: number;
  deliverDaysMin: number;
  deliverDaysMax: number;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  announcement: '30-DAY "PERFECT BUN" GUARANTEE · SHIPS FROM SOUTH AFRICA',
  headline: 'Stop Fighting Your Hair Every Morning',
  subhead:
    'The Nuvé SnapBun is a bendable bun shaper wrapped in soft synthetic fibre. Roll your hair up, snap it shut, and you have a full, salon-sleek bun in about 5 seconds. No bobby pins, no tutorials, no bun that collapses by lunch.',
  bundles: [
    { qty: 1, label: '1 SnapBun', sub: 'Try it out', price: 195, compare: 299, tag: '' },
    { qty: 2, label: '2 SnapBuns', sub: 'One for home, one for your bag', price: 350, compare: 598, tag: 'MOST POPULAR' },
    { qty: 3, label: '3 SnapBuns', sub: 'Share with your sister or daughter', price: 475, compare: 897, tag: 'BEST VALUE' },
  ],
  trustCount: '',
  trustTitle: '',
  trustText: 'who switched to a 5-second bun',
  trustAvatars: [],
  ratingMode: 'auto',
  ratingValue: 0,
  ratingCount: 0,
  ratingNote: '',
  featTitle: 'What customers say',
  videoHeading: "Don't Let Us Tell You",
  videoSub: 'Let our customers show you',
  photoHeading: 'Why Busy Women Are Obsessed',
  stripLabel: 'Real buns, real mornings',
  reviewsHeading: 'Customer Reviews',
  shipping:
    "Orders dispatch in 1–2 business days and arrive in 3–6 business days across South Africa.\n\n30-day guarantee: if you're not happy, contact us and we'll make it right.",
  eftMinutes: 30,
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankBranchCode: '',
  bankAccountType: 'Cheque',
  popEmail: '',
  collection: { company: '', street_address: '', local_area: '', city: '', zone: '', code: '' },
  unitWeightKg: 0.05,
  unitLengthCm: 25,
  unitWidthCm: 6,
  unitHeightCm: 3,
  fallbackShippingName: 'Standard delivery',
  fallbackShippingPrice: 99,
  handlingDays: 1,
  showTimeline: true,
  readyDaysMin: 1,
  readyDaysMax: 2,
  deliverDaysMin: 4,
  deliverDaysMax: 8,
};

export async function getSettings(): Promise<SiteSettings> {
  const data = await one<{ value: Partial<SiteSettings> }>("SELECT value FROM settings WHERE `key` = 'site'");
  const saved = (data?.value || {}) as Partial<SiteSettings>;
  const out: SiteSettings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(saved) as (keyof SiteSettings)[]) {
    const v = saved[k];
    if (v !== '' && v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  out.collection = { ...DEFAULT_SETTINGS.collection, ...(saved.collection || {}) };
  if (!Array.isArray(out.bundles) || !out.bundles.length) out.bundles = DEFAULT_SETTINGS.bundles;
  return out;
}

export function bankReady(s: SiteSettings): boolean {
  return !!(s.bankName && s.bankAccountName && s.bankAccountNumber && s.bankBranchCode);
}
