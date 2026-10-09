import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { browserFrom, metaEnabled, sendEvents, userData } from '@/lib/meta';

export const dynamic = 'force-dynamic';

// Sends one test PageView to Meta from the server, to check the Pixel ID and access token work.
export async function POST(req: NextRequest) {
  if (!metaEnabled()) return NextResponse.json({ ok: false, result: 'Add the Pixel ID and Conversions API access token under Server settings first.' });
  const result = await sendEvents([{
    event_name: 'PageView',
    event_id: `admin-test-${Date.now()}`,
    event_source_url: env.siteUrl() + '/',
    user_data: userData({}, browserFrom(req)),
  }]);
  return NextResponse.json({
    ok: result.startsWith('ok'),
    result,
    hint: env.metaTestCode() ? 'Look for it in Events Manager → Test events.' : 'Without a test event code it counts as a real PageView. Add one under Server settings to see it in Events Manager → Test events.',
  });
}
