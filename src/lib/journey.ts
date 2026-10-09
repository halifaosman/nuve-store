// Turns an order's status plus Bob Go's courier tracking into the stages the customer sees in their order app.

export const STAGES = [
  { key: 'placed', label: 'Order placed', short: 'Placed' },
  { key: 'paid', label: 'Payment confirmed', short: 'Paid' },
  { key: 'packing', label: 'Packed for the courier', short: 'Packed' },
  { key: 'collected', label: 'Collected by the courier', short: 'Collected' },
  { key: 'transit', label: 'On the road', short: 'In transit' },
  { key: 'out', label: 'Out for delivery', short: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered', short: 'Delivered' },
] as const;
// Where the van sits on the road (0 = our store, 1 = your door) at each stage.
export const POSITION = [0, 0.1, 0.22, 0.38, 0.6, 0.86, 1];

export type Journey = {
  stage: number;            // index into STAGES, -1 when the order is closed
  closed: '' | 'expired' | 'cancelled';
  problem: string;          // e.g. a failed delivery attempt
  headline: string;
  sub: string;
};

/** Bob Go/courier status text → stage. Courier wording varies, so this matches on keywords. */
function courierStage(status: string): { stage: number; problem: string } {
  const s = status.toLowerCase().replace(/[_-]+/g, ' ');
  if (!s) return { stage: -1, problem: '' };
  if (/delivered|completed/.test(s) && !/not delivered|undelivered/.test(s)) return { stage: 6, problem: '' };
  if (/fail|unsuccessful|exception|undeliver|not delivered|returned|return to/.test(s)) return { stage: 5, problem: 'The courier could not deliver. They will try again, or contact you.' };
  if (/out for delivery|with driver|on route|en route to recipient/.test(s)) return { stage: 5, problem: '' };
  if (/transit|hub|branch|depot|sorting|line ?haul|arrived|departed/.test(s)) return { stage: 4, problem: '' };
  if (/collected|picked up|received by courier/.test(s)) return { stage: 3, problem: '' };
  return { stage: -1, problem: '' };
}

export function journey(o: { status: string; tracking_status?: string | null; tracking_reference?: string | null }, liveStatus = ''): Journey {
  if (o.status === 'expired' || o.status === 'cancelled') {
    return { stage: -1, closed: o.status, problem: '', headline: o.status === 'expired' ? 'This order expired' : 'This order was cancelled', sub: 'Payment was not received in time, or the order was cancelled.' };
  }
  let stage = 0;
  if (['paid', 'sending'].includes(o.status)) stage = 1;
  if (o.status === 'sent_to_bobgo') stage = 2;
  if (o.status === 'shipped') stage = 3;
  if (o.status === 'delivered') stage = 6;
  const c = courierStage(liveStatus || o.tracking_status || '');
  let problem = '';
  if (c.stage > stage) stage = c.stage;
  if (c.problem && stage < 6) problem = c.problem;
  const text: Record<number, [string, string]> = {
    0: ['We’ve got your order', o.status === 'awaiting_eft' ? 'Waiting for your bank transfer.' : o.status === 'eft_review' ? 'We’re checking your payment.' : 'Waiting for your payment to come through.'],
    1: ['Payment received', 'We’re getting your SnapBun ready.'],
    2: ['Packed and waiting for the courier', 'The courier collects it soon.'],
    3: ['Collected by the courier', 'Your parcel is on its way into the courier network.'],
    4: ['On the road to you', 'Your parcel is travelling through the courier network.'],
    5: ['Out for delivery', 'The driver is bringing it to your door today.'],
    6: ['Delivered!', 'Enjoy your SnapBun. Five-second buns from here on.'],
  };
  return { stage, closed: '', problem, headline: text[stage][0], sub: problem || text[stage][1] };
}
