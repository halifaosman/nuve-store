// Delivery timeline dates, counted in business days (Mon–Fri) from today in South Africa.
// Public holidays aren't skipped, so keep the day ranges a little generous.

type Ymd = { y: number; m: number; d: number };

/** Today's date in Johannesburg, whatever the server's own timezone is. */
export function saToday(now = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

const toDate = ({ y, m, d }: Ymd) => new Date(Date.UTC(y, m - 1, d));

export function addBusinessDays(start: Ymd, days: number): Date {
  const dt = toDate(start);
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    const wd = dt.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return dt;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

/** "9 Oct", or "9 – 10 Oct", or "30 Oct – 3 Nov". */
export function range(a: Date, b: Date): string {
  if (+a === +b) return fmt(a);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${fmt(b)}`;
  return `${fmt(a)} – ${fmt(b)}`;
}

export function timeline(readyMin: number, readyMax: number, deliverMin: number, deliverMax: number, now = new Date()) {
  const today = saToday(now);
  const lo = (n: number) => Math.max(0, n);
  return {
    ordered: fmt(toDate(today)),
    ready: range(addBusinessDays(today, lo(readyMin)), addBusinessDays(today, Math.max(lo(readyMin), readyMax))),
    delivered: range(addBusinessDays(today, lo(deliverMin)), addBusinessDays(today, Math.max(lo(deliverMin), deliverMax))),
  };
}
