import { env } from './env';
import { exec, one, rows } from './db';
import { getSettings } from './settings';

// Facebook Page comment auto-replies.
// Every minute the cron asks Facebook for new comments on the Page's recent posts and ads, then for each one:
//   1. spam / competitor words  -> hide the comment (only the writer and their friends still see it)
//   2. the first matching topic -> reply under the comment with one of that topic's replies (picked at random,
//      so the Page doesn't post the exact same text over and over)
//   3. topics marked "flag"     -> also listed under "Needs you" in the admin
// Test mode logs what it would do without touching Facebook. Settings live in the settings table (key 'fbauto').
// Docs: https://developers.facebook.com/docs/graph-api/reference/page/feed , /comment

const GRAPH = process.env.META_GRAPH_BASE || 'https://graph.facebook.com/v25.0'; // override only for local testing

export type Rule = { key: string; label: string; on: boolean; action: 'reply' | 'hide' | 'flag'; flag: boolean; keywords: string; replies: string };
export type FbConfig = {
  enabled: boolean;
  testMode: boolean;
  since: string;           // only comments written after this moment are handled (set when switched on)
  hourlyLimit: number;     // most public replies per hour
  maxAgeHours: number;     // ignore comments older than this
  skipTags: boolean;       // ignore comments that only tag friends
  fallbackOn: boolean;     // reply to comments that match no topic
  fallback: string;
  rules: Rule[];
};
export type FbStatus = { lastRun?: string; lastOk?: string; error?: string; page?: { id: string; name: string }; checked?: number };

const SPAM = 'bella bunz, bellabunz, bella buns, bellabuns, bella bun, bellabun, bella-bunz, bellabunzsa, bellabunzhairbunmaker, bella clipz, bellaclipz, bunz, 0614749487, 061 474 9487, 27614749487, glory glam, gloryglam, hawwwy, aliexpress, ali express, alixpress, alibaba, 1688, temu, temu.com, takealot, take a lot, takealot.com, shein, wish.com, dhgate, banggood, bob shop, bobshop, gumtree, cheaper on, cheaper at, same thing on, same one on, found it on, get it on temu, order from temu, http, https, www, .co.za, .com, wa.me, bit.ly, linktr.ee, tinyurl, dm me, inbox me, whatsapp me, check my page, check my profile, visit my page, follow my page, click the link, link in bio, earn money, make money, work from home, forex, crypto, bitcoin, investment, giveaway winner, you won, claim your prize, loan';

export const DEFAULT_RULES: Rule[] = [
  { key: 'spam', label: 'Spam and competitors', on: true, action: 'hide', flag: false, keywords: SPAM, replies: '' },
  { key: 'complaint', label: 'Complaints and problems', on: true, action: 'reply', flag: true,
    keywords: 'scam, fake, fraud, never received, never got, didnt receive, didn’t receive, did not receive, not received, still waiting, where is my order, refund, money back, broken, broke, doesnt work, doesn’t work, does not work, didnt work, didn’t work, waste of money, waste, rubbish, terrible, worst, disappointed, complaint, useless',
    replies: 'Hi {name}, we’re sorry to hear that. Please send us a message with your order number (it starts with NUV) and we’ll sort it out for you.\nHi {name}, we’d like to help with this. Message us your order number (NUV…) and we’ll look into it straight away.' },
  { key: 'outside', label: 'Outside South Africa', on: true, action: 'reply', flag: false,
    keywords: 'namibia, botswana, lesotho, eswatini, swaziland, zimbabwe, zambia, mozambique, malawi, kenya, nigeria, uk, usa, australia, deliver to other countries, international',
    replies: 'Hi {name}, at the moment we only deliver within South Africa. We hope to change that soon!\nSorry {name}, we only ship within South Africa for now.' },
  { key: 'price', label: 'Price', on: true, action: 'reply', flag: false,
    keywords: 'price, prices, how much, hoeveel, cost, costs, prys, pricing, rand, expensive, cheap',
    replies: 'Hi {name}! One SnapBun is R{price1}, or get 2 for R{price2} and 3 for R{price3}. Order here: {link}\nHi {name}, it’s R{price1} for one, R{price2} for two and R{price3} for three. You can order on our website: {link}\nHey {name}! R{price1} each, or save with 2 for R{price2} / 3 for R{price3}. Everything is here: {link}' },
  { key: 'payment', label: 'Payment', on: true, action: 'reply', flag: false,
    keywords: 'cash on delivery, cod, eft, pay, payment, card, snapscan, instant eft, bank transfer',
    replies: 'Hi {name}, you can pay by card, Instant EFT or SnapScan (through PayFast), or by bank transfer. We don’t offer cash on delivery. Order here: {link}\nHi {name}! Card, Instant EFT, SnapScan and bank transfer all work at checkout: {link}' },
  { key: 'delivery', label: 'Delivery', on: true, action: 'reply', flag: false,
    keywords: 'deliver, delivery, deliveries, shipping, ship, courier, how long, when will, arrive, cape town, durban, joburg, jhb, johannesburg, pretoria, pta, gqeberha, port elizabeth, bloemfontein, east london, polokwane, nelspruit, mbombela, kimberley, rustenburg, george, pietermaritzburg',
    replies: 'Hi {name}! We deliver anywhere in South Africa with a tracked courier. Orders are sent within {ready} business days and most arrive within {deliver} business days. {link}\nHi {name}, yes, we deliver countrywide. It usually takes {deliver} business days, and you get a tracking number. {link}' },
  { key: 'hair', label: 'Hair type and fit', on: true, action: 'reply', flag: false,
    keywords: 'thick hair, thick, curly, coily, afro, natural hair, 4c, kinky, thin hair, fine hair, thin, short hair, long hair, braids, relaxed, damage, pull, edges, my hair, work on',
    replies: 'Hi {name}! It works on thick, curly and fine hair. Thick hair makes the fullest buns, and for very coily hair stretch or blow-dry first. The core adds body, so fine hair looks fuller. You just need enough length for a ponytail. {link}\nHi {name}, great question! As long as your hair goes into a ponytail it works. No pins or tight elastics, so it’s gentle on your edges too. {link}' },
  { key: 'how', label: 'How it works', on: true, action: 'reply', flag: false,
    keywords: 'how does it work, how do you use, how to use, how do i use, tutorial, how does this work, explain',
    replies: 'Hi {name}! Make a ponytail, slide your hair through the SnapBun, roll it up and snap the ends together. That’s it, about 5 seconds. See it in action: {link}' },
  { key: 'colours', label: 'Colours and stock (you answer)', on: true, action: 'flag', flag: true,
    keywords: 'colour, colours, color, colors, blonde, blond, brown, black, grey, gray, red, auburn, shade, shades, in stock, out of stock, sold out, available',
    replies: '' },
  { key: 'order', label: 'Want one / where to buy', on: true, action: 'reply', flag: false,
    keywords: 'where can i buy, where to buy, how do i order, how to order, how can i get, how do i get, link, website, order, buy, want one, i want, i need, need one, interested, info, details, sell, selling, shop',
    replies: 'Hi {name}! You can order here: {link} We deliver anywhere in South Africa.\nHi {name}, here’s the link to order: {link}\nHey {name}! Grab yours here: {link} (2 for R{price2} is the most popular).' },
  { key: 'praise', label: 'Compliments', on: true, action: 'reply', flag: false,
    keywords: 'love, beautiful, amazing, gorgeous, nice, wow, stunning, pretty, need this, want this, obsessed',
    replies: 'Thank you {name}! 💕\nThanks so much {name}! 🥰\nAww thank you {name}! 💕 {link}' },
];

export const DEFAULT_CONFIG: FbConfig = {
  enabled: false, testMode: true, since: '', hourlyLimit: 40, maxAgeHours: 48, skipTags: true, fallbackOn: false,
  fallback: 'Hi {name}, thanks for your comment! Everything about the SnapBun is here: {link}',
  rules: DEFAULT_RULES,
};

// ---------- settings ----------

async function readKey<T>(key: string): Promise<T | null> {
  const r = await one<{ value: T }>('SELECT value FROM settings WHERE `key` = ?', [key]);
  return r ? r.value : null;
}
async function writeKey(key: string, value: unknown) {
  await exec('INSERT INTO settings (`key`, value, updated_at) VALUES (?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)', [key, JSON.stringify(value)]);
}

export async function getFbConfig(): Promise<FbConfig> {
  const saved = (await readKey<Partial<FbConfig>>('fbauto')) || {};
  const c: FbConfig = { ...DEFAULT_CONFIG, ...saved };
  // Keep saved rules, and add any new built-in topics that came with an update.
  const rules = Array.isArray(saved.rules) && saved.rules.length ? saved.rules : DEFAULT_RULES;
  c.rules = [...rules, ...DEFAULT_RULES.filter((d) => !rules.some((r) => r.key === d.key) && !(saved as { removed?: string[] }).removed?.includes(d.key))];
  return c;
}

export function cleanConfig(input: Partial<FbConfig>, prev: FbConfig): FbConfig {
  const s = (v: unknown, max: number) => String(v ?? '').slice(0, max);
  const rules: Rule[] = (Array.isArray(input.rules) ? input.rules : prev.rules).slice(0, 30).map((r, i) => ({
    key: s(r.key, 40).replace(/[^a-z0-9_-]/gi, '') || `topic${i}`,
    label: s(r.label, 80) || 'Topic',
    on: !!r.on,
    action: (['reply', 'hide', 'flag'] as const).includes(r.action) ? r.action : 'reply',
    flag: !!r.flag,
    keywords: s(r.keywords, 4000),
    replies: s(r.replies, 4000),
  }));
  const enabled = input.enabled === undefined ? prev.enabled : !!input.enabled;
  return {
    enabled,
    testMode: input.testMode === undefined ? prev.testMode : !!input.testMode,
    // Switching on starts from "now", so old comments are never answered in a burst.
    since: enabled && !prev.enabled ? new Date().toISOString() : enabled ? prev.since || new Date().toISOString() : prev.since,
    hourlyLimit: Math.min(200, Math.max(1, Math.round(Number(input.hourlyLimit ?? prev.hourlyLimit) || 40))),
    maxAgeHours: Math.min(168, Math.max(1, Math.round(Number(input.maxAgeHours ?? prev.maxAgeHours) || 48))),
    skipTags: input.skipTags === undefined ? prev.skipTags : !!input.skipTags,
    fallbackOn: input.fallbackOn === undefined ? prev.fallbackOn : !!input.fallbackOn,
    fallback: s(input.fallback ?? prev.fallback, 1000),
    rules,
  };
}

export async function saveFbConfig(c: FbConfig) {
  await writeKey('fbauto', { ...c, removed: DEFAULT_RULES.filter((d) => !c.rules.some((r) => r.key === d.key)).map((d) => d.key) });
}
export const getFbStatus = async () => (await readKey<FbStatus>('fbauto_status')) || {};
const setStatus = async (patch: FbStatus) => writeKey('fbauto_status', { ...(await getFbStatus()), ...patch });

// ---------- matching ----------

const norm = (t: string) => ` ${t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘`]/g, "'").toLowerCase().replace(/\s+/g, ' ')} `;
const words = (list: string) => list.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean);

export function hasKeyword(text: string, list: string): string | null {
  const t = norm(text);
  for (const raw of words(list)) {
    const k = norm(raw).trim();
    if (!k) continue;
    if (/[^a-z0-9' ]/.test(k)) { if (t.includes(k)) return raw; continue; } // domains, numbers with dots etc.
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "'?");
    if (new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(t)) return raw;
  }
  return null;
}

// Topics that are too general to combine with another answer.
const GENERAL = ['order', 'praise', 'spam', 'complaint', 'outside'];
const withoutLink = (t: string) => (/\{link\}/.test(t) ? t.replace(/\s*(?:[^.!?]*?:\s*)?\{link\}[^.!?]*[.!?]?\s*$/, '').trim() || t : t);
const withoutGreeting = (t: string) => t.replace(/^(hi|hey|hello|sorry)\s*\{name\}\s*[,!.]?\s*(great question!\s*)?/i, '');
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export type Decision = { rule: Rule | null; action: 'reply' | 'hide' | 'flag' | 'skip'; reply: string; note: string; flag?: boolean };

export async function fillers() {
  const s = await getSettings();
  const price = (q: number) => String(s.bundles.find((b) => b.qty === q)?.price ?? '');
  const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
  return {
    link: (process.env.SITE_URL || '').trim().replace(/\/$/, '') || 'our website',
    price1: price(1), price2: price(2), price3: price(3),
    ready: range(s.readyDaysMin, s.readyDaysMax), deliver: range(s.deliverDaysMin, s.deliverDaysMax),
  };
}

export function fill(tpl: string, name: string, f: Record<string, string>) {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  return tpl
    .replace(/\{name\}/g, first)
    .replace(/\{(\w+)\}/g, (m, k) => (k in f ? f[k] : m))
    .replace(/\s+([,!.?])/g, '$1') // "Hi !" when the name is unknown -> "Hi!"
    .replace(/\s{2,}/g, ' ').trim();
}

const pick = (lines: string[], avoid?: string) => {
  const opts = lines.length > 1 && avoid ? lines.filter((l) => l !== avoid) : lines;
  return (opts.length ? opts : lines)[Math.floor(Math.random() * (opts.length || lines.length))];
};

function decideInner(c: FbConfig, text: string, onlyTags: boolean, f: Record<string, string>, name: string, lastReply?: string): Decision {
  const msg = (text || '').trim();
  if (!msg) return { rule: null, action: 'skip', reply: '', note: 'No text (photo or sticker)' };
  const hits: { r: Rule; hit: string }[] = [];
  for (const r of c.rules) {
    if (!r.on) continue;
    const hit = hasKeyword(msg, r.keywords);
    if (hit) hits.push({ r, hit });
  }
  if (hits.length) {
    const { r, hit } = hits[0];
    if (r.action === 'hide') return { rule: r, action: 'hide', reply: '', note: `Matched “${hit}”` };
    if (r.action === 'flag') return { rule: r, action: 'flag', reply: '', note: `Matched “${hit}”` };
    const lines = r.replies.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return { rule: r, action: r.flag ? 'flag' : 'skip', reply: '', note: `Matched “${hit}” but the topic has no replies` };
    // Two questions in one comment ("How much, and do you deliver to Durban?"): answer both.
    const second = !r.flag && !GENERAL.includes(r.key) ? hits.slice(1).find((h) => h.r.action === 'reply' && !h.r.flag && !GENERAL.includes(h.r.key) && h.r.replies.trim()) : undefined;
    if (second) {
      const lines2 = second.r.replies.split('\n').map((l) => l.trim()).filter(Boolean);
      const firsts = lines.map((l) => fill(withoutLink(l), name, f));
      const reply = `${pick(firsts, lastReply)} ${capital(fill(withoutGreeting(lines2[Math.floor(Math.random() * lines2.length)]), name, f))}`;
      return { rule: r, action: 'reply', reply, note: `Matched “${hit}” and “${second.hit}”` };
    }
    return { rule: r, action: 'reply', reply: pick(lines.map((l) => fill(l, name, f)), lastReply), note: `Matched “${hit}”` };
  }
  if (onlyTags && c.skipTags) return { rule: null, action: 'skip', reply: '', note: 'Only tags friends' };
  if (c.fallbackOn && c.fallback.trim()) return { rule: null, action: 'reply', reply: fill(c.fallback, name, f), note: 'No topic matched (general reply)' };
  return { rule: null, action: 'skip', reply: '', note: 'No topic matched' };
}

/** What the bot would do with a comment. Flags it for the owner when any "flag" topic matches, even if another topic answered. */
export function decide(c: FbConfig, text: string, onlyTags: boolean, f: Record<string, string>, name: string, lastReply?: string): Decision {
  const d = decideInner(c, text, onlyTags, f, name, lastReply);
  const flagRule = c.rules.find((r) => r.on && r.flag && hasKeyword(text || '', r.keywords));
  const flag = d.action === 'flag' || !!d.rule?.flag || !!flagRule;
  return { ...d, flag, note: flagRule && flagRule !== d.rule ? `${d.note}; flagged: ${flagRule.label}` : d.note };
}

// ---------- Facebook ----------

type GraphErr = { error?: { message?: string; code?: number } };
class FbError extends Error { constructor(msg: string, public code?: number) { super(msg); } }

async function graph<T>(path: string, token: string, method: 'GET' | 'POST' = 'GET', params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, '')}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  if (method === 'GET') body.forEach((v, k) => url.searchParams.set(k, v));
  const r = await fetch(url, { method, body: method === 'POST' ? body : undefined, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const j = (await r.json().catch(() => ({}))) as T & GraphErr;
  if (!r.ok || j.error) throw new FbError(j.error?.message || `Facebook error ${r.status}`, j.error?.code);
  return j;
}

let pageCache: { from: string; id: string; name: string; token: string } | null = null;

/** Works with a Page token, or a user / system-user token that manages the Page. */
async function page(): Promise<{ id: string; name: string; token: string }> {
  const given = env.fbPageToken();
  if (!given) throw new FbError('Add the Page access token under Server settings.');
  if (pageCache && pageCache.from === given) return pageCache;
  const want = env.fbPageId();
  try {
    const acc = await graph<{ data: { id: string; name: string; access_token: string }[] }>('me/accounts', given, 'GET', { fields: 'id,name,access_token', limit: '100' });
    const p = acc.data.find((x) => !want || x.id === want) || (acc.data.length === 1 ? acc.data[0] : null);
    if (p) { pageCache = { from: given, id: p.id, name: p.name, token: p.access_token }; return pageCache; }
  } catch { /* not a user token: try it as a Page token */ }
  const me = await graph<{ id: string; name: string }>('me', given, 'GET', { fields: 'id,name' });
  if (want && me.id !== want) throw new FbError(`This token is for “${me.name}” (${me.id}), not Page ${want}.`);
  pageCache = { from: given, id: me.id, name: me.name, token: given };
  return pageCache;
}

type FbComment = { id: string; message?: string; created_time: string; from?: { id: string; name: string }; parent?: { id: string }; message_tags?: { offset: number; length: number }[]; is_hidden?: boolean };
type FbPost = { id: string; comments?: { data: FbComment[] } };
const COMMENT_FIELDS = 'comments.filter(stream).order(reverse_chronological).limit(50){id,message,created_time,from,parent{id},message_tags,is_hidden}';

async function recentComments(p: { id: string; token: string }) {
  const out: { post: string; c: FbComment }[] = [];
  const errors: string[] = [];
  for (const [edge, extra] of [['feed', { limit: '10' }], ['ads_posts', { limit: '25', include_inline_create: 'true' }]] as const) {
    try {
      const j = await graph<{ data: FbPost[] }>(`${p.id}/${edge}`, p.token, 'GET', { fields: `id,${COMMENT_FIELDS}`, ...extra });
      for (const post of j.data || []) for (const c of post.comments?.data || []) out.push({ post: post.id, c });
    } catch (e) {
      if (e instanceof FbError && e.code === 190) throw e; // bad token: stop
      errors.push(`${edge === 'feed' ? 'Posts' : 'Ads'}: ${(e as Error).message}`);
    }
  }
  const seen = new Set<string>();
  return { comments: out.filter(({ c }) => !seen.has(c.id) && seen.add(c.id)), errors };
}

const fbTime = (t: string) => Date.parse(t.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')); // 2026-10-09T19:52:00+0000

const onlyTags = (c: FbComment) => {
  const m = (c.message || '').trim();
  if (!c.message_tags?.length || !m) return false;
  let rest = c.message || '';
  for (const t of [...c.message_tags].sort((a, b) => b.offset - a.offset)) rest = rest.slice(0, t.offset) + rest.slice(t.offset + t.length);
  return !/[\p{L}\p{N}]/u.test(rest);
};

/** "Test connection" in the admin: finds the Page and counts recent comments without acting on any. */
export async function testFbConnection() {
  pageCache = null;
  const p = await page();
  const { comments, errors } = await recentComments(p);
  return { page: { id: p.id, name: p.name }, comments: comments.length, errors };
}

let busy = false;

/** Called by the cron every minute (and by "Check now" in the admin). Never throws. */
export async function runFbAuto(force = false): Promise<{ checked: number; acted: number; error?: string }> {
  if (busy) return { checked: 0, acted: 0, error: 'Already running' };
  busy = true;
  const now = new Date().toISOString();
  try {
    const c = await getFbConfig();
    if (!c.enabled && !force) return { checked: 0, acted: 0 };
    if (!env.fbPageToken()) { await setStatus({ lastRun: now, error: 'Add the Page access token under Server settings.' }); return { checked: 0, acted: 0, error: 'No token' }; }
    const p = await page();
    const { comments, errors } = await recentComments(p);
    const since = Date.parse(c.since || now);
    const oldest = Date.now() - c.maxAgeHours * 3600_000;
    const fresh = comments.filter(({ c: x }) => x.from?.id !== p.id && !x.is_hidden && fbTime(x.created_time) > Math.max(since, oldest));
    const known = fresh.length
      ? new Set((await rows<{ comment_id: string }>('SELECT comment_id FROM fb_comments WHERE comment_id IN (?)', [fresh.map((x) => x.c.id)])).map((r) => r.comment_id))
      : new Set<string>();
    const todo = fresh.filter((x) => !known.has(x.c.id)).sort((a, b) => a.c.created_time.localeCompare(b.c.created_time)).slice(0, 15);
    const f = await fillers();
    let acted = 0;
    for (const { post, c: x } of todo) {
      // Claim it first, so two runs never answer the same comment.
      const claimed = await exec('INSERT IGNORE INTO fb_comments (comment_id, post_id, parent_id, from_id, from_name, message, commented_at, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [x.id, post, x.parent?.id || null, x.from?.id || null, (x.from?.name || '').slice(0, 120) || null, (x.message || '').slice(0, 5000), new Date(fbTime(x.created_time)), 'working']);
      if (!claimed) continue;
      const last = await one<{ reply: string }>("SELECT reply FROM fb_comments WHERE post_id = ? AND action IN ('replied','would_reply') ORDER BY created_at DESC LIMIT 1", [post]);
      const d = decide(c, x.message || '', onlyTags(x), f, x.from?.name || '', last?.reply);
      let action: string = d.action === 'skip' ? 'skipped' : d.action === 'flag' ? 'flagged' : d.action;
      let note = d.note;
      try {
        if (d.action === 'reply') {
          const repliedHour = await one<{ n: number }>("SELECT COUNT(*) AS n FROM fb_comments WHERE action = 'replied' AND created_at > UTC_TIMESTAMP(3) - INTERVAL 1 HOUR");
          const samePerson = x.from?.id
            ? Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM fb_comments WHERE from_id = ? AND post_id = ? AND action IN ('replied','would_reply') AND comment_id <> ?", [x.from.id, post, x.id]))?.n || 0)
            : 0;
          if (samePerson > 0) { action = d.rule?.flag ? 'flagged' : 'skipped'; note = 'Already replied to this person on this post'; }
          else if (!c.testMode && Number(repliedHour?.n || 0) >= c.hourlyLimit) { action = 'skipped'; note = `Hourly limit of ${c.hourlyLimit} replies reached`; }
          else if (c.testMode) action = 'would_reply';
          else { await graph(`${x.parent?.id || x.id}/comments`, p.token, 'POST', { message: d.reply }); action = 'replied'; acted++; }
        } else if (d.action === 'hide') {
          if (c.testMode) action = 'would_hide';
          else { await graph(x.id, p.token, 'POST', { is_hidden: 'true' }); action = 'hidden'; acted++; }
        }
      } catch (e) {
        action = 'error'; note = (e as Error).message.slice(0, 250);
        if (e instanceof FbError && [4, 17, 32, 613, 80001].includes(e.code || 0)) { await finish(x.id, d, action, note); break; } // Facebook says slow down
      }
      await finish(x.id, d, action, note);
    }
    await setStatus({ lastRun: now, lastOk: now, error: errors.join(' · ') || '', page: { id: p.id, name: p.name }, checked: comments.length });
    return { checked: comments.length, acted };
  } catch (e) {
    const msg = e instanceof FbError && e.code === 190 ? `Facebook rejected the token: ${e.message}` : (e as Error).message;
    pageCache = null;
    await setStatus({ lastRun: now, error: msg.slice(0, 300) }).catch(() => {});
    return { checked: 0, acted: 0, error: msg };
  } finally {
    busy = false;
  }
}

async function finish(id: string, d: Decision, action: string, note: string) {
  const reply = ['replied', 'would_reply'].includes(action) || (action === 'flagged' && d.reply) || action === 'error' ? d.reply || null : null;
  await exec('UPDATE fb_comments SET rule_key = ?, action = ?, reply = ?, note = ?, flag = ? WHERE comment_id = ?', [d.rule?.key || null, action, reply, note.slice(0, 255), d.flag || action === 'error' ? 1 : 0, id]);
}

/** Flagged complaints: replied or not, they also show under "Needs you" until ticked off. */
export const flaggedWhere = 'flag = 1 AND done = 0';
