/**
 * POST /api/pre-call
 *
 * Register contact data BEFORE triggering a HappyRobot call.
 * When the CloudEvents webhook fires seconds later, this data
 * is automatically merged into the run.
 *
 * Usage — call this FIRST, then trigger HappyRobot:
 *
 *   curl -X POST https://repsol-outbound-demo-production.up.railway.app/api/pre-call \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "phone": "+34669895417",
 *       "contactName": "Antonio Martínez",
 *       "companyName": "Pinturas Levante SL",
 *       "referencePrice": 1050,
 *       "priceMin": 980,
 *       "priceMax": 1050
 *     }'
 *
 *   curl -X POST https://workflows.platform.happyrobot.ai/hooks/wekjrxe7853q \
 *     -H "Content-Type: application/json" \
 *     -d '{"phone_number":"+34669895417","contact_name":"Antonio Martínez",...}'
 *
 * Also accepts camelCase or snake_case:
 *   phone / phone_number
 *   contactName / contact_name
 *   companyName / company_name
 */

import { NextRequest, NextResponse } from 'next/server';
import { storePendingCall, pendingCallStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    const phone = (body.phone ?? body.phone_number ?? '') as string;
    const contactName = (body.contactName ?? body.contact_name) as string | undefined;
    const companyName = (body.companyName ?? body.company_name) as string | undefined;
    const referencePrice = (body.referencePrice ?? body.reference_price_eur_tm_ddp) as number | undefined;
    const priceMin = (body.priceMin ?? body.price_range_min) as number | undefined;
    const priceMax = (body.priceMax ?? body.price_range_max) as number | undefined;

    storePendingCall({ phone, contactName, companyName, referencePrice, priceMin, priceMax });

    console.log(`[pre-call] stored: ${phone} / ${contactName} / ${companyName}`);
    return NextResponse.json({
      ok: true,
      stored: { phone, contactName, companyName },
      pendingCount: pendingCallStore.length,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    pendingCount: pendingCallStore.length,
    pending: pendingCallStore,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
