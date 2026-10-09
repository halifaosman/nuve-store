import { NextRequest, NextResponse } from 'next/server';
import { exec, rows, tx } from '@/lib/db';
import { removeFiles } from '@/lib/files';

export const dynamic = 'force-dynamic';

// Deletes orders (and their history and proof-of-payment files).
// Body: one of
//   { ids: string[] }                       chosen orders
//   { emails: string[] }                    chosen customers: all their orders, plus their contact messages
//   { preset: 'dead', olderThanDays? }      expired or cancelled orders that were never paid
//   { preset: 'dead_customers' }            customers who never completed a payment: all their orders and messages
// plus { dryRun: true } to only count, and { confirmPaid: true } to allow deleting orders that were paid.
type Row = { id: string; email: string; status: string; paid_at: string | null; bobgo_order_id: number | null; pop_path: string | null };

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const cols = 'id, email, status, paid_at, bobgo_order_id, pop_path';
  let list: Row[] = [];
  let emails: string[] = [];
  if (Array.isArray(b.ids) && b.ids.length) {
    const ids = b.ids.map(String).filter((v: string) => /^[0-9a-f-]{36}$/.test(v)).slice(0, 1000);
    if (ids.length) list = await rows<Row>(`SELECT ${cols} FROM orders WHERE id IN (?)`, [ids]);
  } else if (Array.isArray(b.emails) && b.emails.length) {
    emails = b.emails.map((v: unknown) => String(v).trim().toLowerCase()).filter(Boolean).slice(0, 1000);
    if (emails.length) list = await rows<Row>(`SELECT ${cols} FROM orders WHERE LOWER(email) IN (?)`, [emails]);
  } else if (b.preset === 'dead') {
    const days = Math.max(0, Math.min(3650, Math.round(Number(b.olderThanDays) || 0)));
    list = await rows<Row>(
      `SELECT ${cols} FROM orders WHERE status IN ('expired','cancelled') AND paid_at IS NULL AND created_at < UTC_TIMESTAMP(3) - INTERVAL ? DAY`, [days]);
  } else if (b.preset === 'dead_customers') {
    const who = await rows<{ e: string }>(
      `SELECT LOWER(email) AS e FROM orders GROUP BY LOWER(email)
        HAVING SUM(paid_at IS NOT NULL) = 0 AND SUM(status IN ('expired','cancelled')) = COUNT(*)`);
    emails = who.map((w) => w.e);
    if (emails.length) list = await rows<Row>(`SELECT ${cols} FROM orders WHERE LOWER(email) IN (?)`, [emails]);
  } else {
    return NextResponse.json({ error: 'Nothing chosen to delete.' }, { status: 400 });
  }

  const paid = list.filter((o) => o.paid_at);
  const inBobGo = list.filter((o) => o.bobgo_order_id);
  const customers = new Set(list.map((o) => o.email.toLowerCase())).size;
  const summary = { orders: list.length, customers, paid: paid.length, inBobGo: inBobGo.length };
  if (b.dryRun) return NextResponse.json({ ...summary, dryRun: true });
  if (!list.length) return NextResponse.json({ ...summary, deleted: 0 });
  if (paid.length && b.confirmPaid !== true) {
    return NextResponse.json({ ...summary, error: `${paid.length} of these orders ${paid.length === 1 ? "was" : "were"} paid. Confirm to delete paid orders too.`, needsPaidConfirm: true }, { status: 409 });
  }

  const ids = list.map((o) => o.id);
  const deleted = await tx(async (c) => {
    await exec('DELETE FROM order_events WHERE order_id IN (?)', [ids], c);
    const n = await exec('DELETE FROM orders WHERE id IN (?)', [ids], c);
    if (emails.length) await exec('DELETE FROM messages WHERE LOWER(email) IN (?)', [emails], c);
    return n;
  });
  await removeFiles('proofs', list.map((o) => o.pop_path).filter((p): p is string => !!p));
  console.warn(`Admin deleted ${deleted} order(s)${emails.length ? ` for ${emails.length} customer(s)` : ''}${paid.length ? `, ${paid.length} paid` : ''}`);
  return NextResponse.json({ ...summary, deleted });
}
