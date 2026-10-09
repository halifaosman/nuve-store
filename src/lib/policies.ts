import type { SiteSettings } from './settings';

// Built-in policy templates for a South African online shop (POPIA, the Consumer Protection Act and
// the Electronic Communications and Transactions Act). They are filled in from Store settings so they
// match what the store page promises: delivery times, the 30-day guarantee, payment methods and the
// EFT payment window. The shop can replace any of them with its own text in the admin.
//
// Format: "## " starts a heading, "- " starts a bullet, a blank line starts a new paragraph.

export type PolicyKey = 'privacy' | 'terms' | 'shipping';
export const POLICY_TITLES: Record<PolicyKey, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms and Conditions',
  shipping: 'Shipping Policy',
};

function biz(s: SiteSettings) {
  const name = s.bizName || 'Nuvé';
  const legal = s.bizLegalName || name;
  const contact = [
    s.bizEmail && `email ${s.bizEmail}`,
    s.bizPhone && `call or WhatsApp ${s.bizPhone}`,
    'use the Contact Us form at the bottom of our website',
  ].filter(Boolean).join(', or ');
  const details = [
    `- Trading name: ${name}`,
    s.bizLegalName && s.bizLegalName !== name && `- Legal name: ${s.bizLegalName}`,
    s.bizRegNo && `- Registration number: ${s.bizRegNo}`,
    s.bizVatNo && `- VAT number: ${s.bizVatNo}`,
    s.bizAddress && `- Physical address (also our address for legal notices): ${s.bizAddress.replace(/\s*\n\s*/g, ', ')}`,
    s.bizEmail && `- Email: ${s.bizEmail}`,
    s.bizPhone && `- Phone: ${s.bizPhone}`,
  ].filter(Boolean).join('\n');
  return { name, legal, contact, details };
}

function days(s: SiteSettings) {
  const r = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
  const dispatch = r(s.readyDaysMin, s.readyDaysMax);
  const transit = r(Math.max(1, s.deliverDaysMin - s.readyDaysMin), Math.max(1, s.deliverDaysMax - s.readyDaysMax));
  const total = r(s.deliverDaysMin, s.deliverDaysMax);
  return { dispatch, transit, total };
}

const today = () => new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });

export function privacyTemplate(s: SiteSettings): string {
  const b = biz(s);
  return `Last updated: ${today()}

${b.legal} ("${b.name}", "we", "us") respects your privacy. This policy explains what personal information we collect when you visit our website or buy from us, why we collect it, and your rights under the Protection of Personal Information Act, 2013 (POPIA).

## Who we are
${b.details}

The owner of ${b.name} is our Information Officer under POPIA. To reach them, ${b.contact}.

## What we collect
- Order details: your name, email address, phone number, delivery address, the products you buy and how much you paid.
- Payment information: card and Instant EFT payments are processed by PayFast on their secure pages. We never see or store your card details. For bank transfers, we keep the proof of payment you upload.
- Messages: anything you send us through the contact form, email or phone.
- Technical information: your IP address and basic browser information, which our server records to keep the website secure and working.

## Why we use it
- To process, deliver and support your order, including sending your details to our courier so they can deliver it.
- To confirm your payment and prevent fraud.
- To reply to your questions and handle returns or complaints.
- To keep the records that tax and consumer law require.

We only send you marketing messages if you have agreed to receive them, and every marketing message lets you unsubscribe.

## Who we share it with
We share only what each party needs to do its job:
- PayFast, to process card and Instant EFT payments.
- Bob Go and the courier companies it works with, to deliver your order and send you tracking updates.
- Meta (Facebook and Instagram), to measure and improve our adverts. We share which pages you visit and what you buy on our website, together with your email address, phone number and name in scrambled (hashed) form, so Meta can match them to its own records. Meta acts as an independent controller under its own privacy policy. You can say no to this (see Cookies below).
- Our hosting provider, which stores our website and database. Our servers may be located outside South Africa. Where that is the case, we only use providers bound by data protection laws or agreements that give your information a similar level of protection to POPIA.
- Authorities, where the law requires it.

We never sell your personal information.

## How long we keep it
We keep order and payment records for 5 years, as South African tax law requires. We keep contact messages for as long as we need them to help you, and no longer than 2 years unless they relate to an order.

## How we protect it
Our website uses encryption (HTTPS). Access to customer information is limited to the people who need it to run the store, and proofs of payment can only be viewed by our team.

## Cookies and ad measurement
We use cookies that the website needs to work, and the Meta Pixel and Meta Conversions API to see which of our adverts lead to visits and sales. These set cookies called _fbp and _fbc and send Meta details of the pages you view, items you choose and purchases you make, plus your contact details in scrambled (hashed) form.

When you first visit, a notice lets you say no. If you do, we stop sending this information to Meta from your browser and from our server. You can change your mind by clearing your cookies for our website. You can also control the adverts you see in your Facebook and Instagram ad settings.

## Your rights
Under POPIA you may:
- Ask what personal information we hold about you, and get a copy of it.
- Ask us to correct or delete it.
- Object to us using it for marketing or other purposes.
- Complain to the Information Regulator (South Africa) at www.inforegulator.org.za.

To use any of these rights, ${b.contact}. We will respond within a reasonable time.

## Changes to this policy
We may update this policy from time to time. The date at the top shows when it last changed.`;
}

export function termsTemplate(s: SiteSettings): string {
  const b = biz(s);
  const d = days(s);
  return `Last updated: ${today()}

These terms apply to every purchase from the ${b.name} website. By placing an order you agree to them. Nothing in these terms limits your rights under the Consumer Protection Act, 2008 (CPA) or the Electronic Communications and Transactions Act, 2002 (ECTA).

## About us
${b.details}

## Products and prices
- All prices are in South African Rand (ZAR)${s.bizVatNo ? ' and include VAT' : ''}.
- Delivery fees are calculated at checkout from your delivery address and shown before you pay.
- We take care to show products and prices accurately. If we make an obvious pricing error, we will contact you before sending your order and you may cancel it for a full refund.
- Product photos are for illustration. Shades may look slightly different on different screens.

## Placing an order
- Your order is confirmed once we receive full payment.
- Card, Instant EFT and other PayFast payments are confirmed automatically.
- If you choose bank transfer (manual EFT), you must pay and upload your proof of payment within ${s.eftMinutes} minutes, otherwise the order expires automatically. We confirm the order once the money reflects in our account. Please use your order number as the payment reference.
- We may decline or cancel an order, for example if the product is out of stock or we suspect fraud. If you have already paid, we refund you in full.

## Delivery
We deliver within South Africa only. Orders are usually dispatched within ${d.dispatch} business days of payment confirmation and delivered within a further ${d.transit} business days. Full details are in our Shipping Policy. Ownership and risk pass to you when the parcel is delivered.

## Our 30-day "Perfect Bun" guarantee
If you are not happy with your SnapBun, contact us within 30 days of delivery and we will make it right, with a replacement or a refund of the product price. We may ask you to send the product back first.

## Cancelling within 7 days (cooling-off)
Under section 44 of ECTA, you may cancel your order without giving a reason within 7 days of receiving it. Return the product in its original condition. We will refund what you paid within 30 days of receiving your cancellation; the only cost to you is the cost of returning the product.

## Faulty products
Under the CPA, if a product is faulty or does not match its description, you may return it within 6 months of delivery and choose whether we repair it, replace it or refund you. We cover the cost of returning a faulty product. This does not cover damage caused by misuse or normal wear and tear.

## How to return a product
${b.contact[0].toUpperCase() + b.contact.slice(1)}, and include your order number. We will send you return instructions. Please do not send products back without contacting us first, so we can match the return to your order.

## Refunds
Refunds are paid to the original payment method, or to your bank account for bank transfer orders, within 10 business days of approval.

## Liability
We are responsible for the products we sell as set out in these terms and in the CPA. To the extent the law allows, we are not liable for indirect losses, or for delays caused by events outside our reasonable control, such as courier disruptions, strikes, extreme weather or load shedding.

## Privacy
We handle your personal information as described in our Privacy Policy.

## Complaints
${b.contact[0].toUpperCase() + b.contact.slice(1)}. We aim to resolve every complaint quickly. If we cannot resolve it, you may contact the National Consumer Commission or the Consumer Goods and Services Ombud.

## General
These terms are governed by the laws of South Africa. We may update them from time to time; the version on our website when you place your order applies to that order.`;
}

export function shippingTemplate(s: SiteSettings): string {
  const b = biz(s);
  const d = days(s);
  return `Last updated: ${today()}

## Where we deliver
We deliver to addresses across South Africa. We do not ship outside South Africa at the moment.

## Delivery fees
Delivery is calculated at checkout from your address, using our courier partners through Bob Go. You will see the exact delivery fee, and choose the delivery option, before you pay.

## Delivery times
- Dispatch: orders are packed and handed to the courier within ${d.dispatch} business days of payment confirmation.
- Delivery: the courier usually delivers within a further ${d.transit} business days, so most orders arrive within ${d.total} business days of ordering.
- Bank transfer (manual EFT) orders are dispatched once the payment reflects in our account.
- Business days are Monday to Friday, excluding South African public holidays.
- Outlying and rural areas, peak seasons and public holidays can add a few days.

## Tracking your order
When your order is handed to the courier, you will receive a tracking number by email and SMS from our courier partner. You can also check your order any time with "Track My Order" at the bottom of our website, using your order number and the email address or phone number you ordered with.

## Delivery address and failed deliveries
- Please check your delivery address and phone number carefully at checkout. The courier will contact you on that number.
- If your details are wrong, contact us as soon as possible. We can change them until the order has been dispatched.
- If the courier cannot deliver after their delivery attempts and the parcel is returned to us, we will contact you to arrange redelivery. Redelivery may carry an extra delivery fee.

## Damaged or missing parcels
If your parcel arrives damaged or something is missing, ${b.contact} within 48 hours of delivery, with photos of the parcel and product, and we will make it right.

## Returns
Returns are covered by our 30-day "Perfect Bun" guarantee and our Terms and Conditions.`;
}

export function policyText(key: PolicyKey, s: SiteSettings): string {
  const custom = key === 'privacy' ? s.policyPrivacy : key === 'terms' ? s.policyTerms : s.policyShipping;
  if (custom && custom.trim()) return custom;
  return key === 'privacy' ? privacyTemplate(s) : key === 'terms' ? termsTemplate(s) : shippingTemplate(s);
}
