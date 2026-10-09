import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SETTINGS, SiteSettings } from '@/lib/settings';
import { privacyTemplate, shippingTemplate, termsTemplate } from '@/lib/policies';

export const dynamic = 'force-dynamic';

// Fills the built-in templates with the (possibly unsaved) settings sent from the admin page.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<SiteSettings>;
  const s = { ...DEFAULT_SETTINGS, ...body } as SiteSettings;
  return NextResponse.json({ privacy: privacyTemplate(s), terms: termsTemplate(s), shipping: shippingTemplate(s) });
}
