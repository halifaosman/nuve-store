import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { itnParamString, itnSignatureValid, fromPayfast, confirmWithPayfast } from '@/lib/payfast';
import { logEvent, markPaid } from '@/lib/orders';

export const maxDuration = 60;

// PayFast Instant Transaction Notification. Every check must pass before an order is marked paid.
// 200 = handled (or rejected for good). 500 = something temporary went wrong, so PayFast retries later.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const { paramString, signature, data } = itnParamString(raw);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
  const orderId = /^[0-9a-f-]{36}$/.test(data.m_payment_id || '') ? data.m_payment_id : '';

  const reject = async (why: string) => {
    console.warn('PayFast ITN rejected:', why, orderId);
    if (orderId) await logEvent(orderId, 'payfast_rejected', `PayFast notification rejected: ${why}`).catch(() => {});
    return new NextResponse('OK', { status: 200 });
  };
  const retryLater = (why: string) => {
    console.error('PayFast ITN deferred:', why, orderId);
    return new NextResponse('Try again', { status: 500 });
  };

  try {
    if (!itnSignatureValid(paramString, signature, env.payfastPassphrase())) return reject('signature mismatch');
    if (!(await fromPayfast(ip))) return reject(`sender ${ip || 'unknown'} is not PayFast`);
    if (data.merchant_id !== env.payfastMerchantId()) return reject('merchant id mismatch');
    if (!orderId) return reject('missing order id');

    const { data: o, error } = await db().from('orders').select('id, total').eq('id', orderId).maybeSingle();
    if (error) return retryLater(`database: ${error.message}`);
    if (!o) return reject('unknown order');
    if (Math.abs(Number(o.total) - Number(data.amount_gross)) > 0.01) return reject(`amount ${data.amount_gross} does not match order total ${o.total}`);

    const check = await confirmWithPayfast(paramString);
    if (check === 'ERROR') return retryLater('could not reach PayFast to confirm');
    if (check === 'INVALID') return reject('PayFast says this notification is not valid');

    if (data.payment_status === 'COMPLETE') {
      await markPaid(o.id, `PayFast ${data.pf_payment_id}`, { pf_payment_id: data.pf_payment_id });
    } else {
      await logEvent(o.id, 'payfast', `PayFast status: ${data.payment_status}`);
    }
    return new NextResponse('OK', { status: 200 });
  } catch (e) {
    return retryLater(e instanceof Error ? e.message : String(e));
  }
}
