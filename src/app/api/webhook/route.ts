/**
 * POST /api/webhook
 *
 * Configure this URL in HappyRobot:
 *   Platform → your workflow → Settings → Webhooks → Add Webhook
 *   URL: https://YOUR-DOMAIN.railway.app/api/webhook
 *
 * HappyRobot will POST the full run payload here every time a call
 * starts or completes — no polling needed, works in development mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseRun } from '@/lib/happyrobot';
import { upsertRun } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    // HappyRobot may send a run object directly, or wrap it
    const run = (body.run ?? body.data ?? body) as Record<string, unknown>;

    if (!run.id) {
      // Log the payload so we can inspect it in Railway logs
      console.log('[webhook] received payload without run.id:', JSON.stringify(body).slice(0, 500));
      return NextResponse.json({ ok: true, note: 'no run.id — logged for inspection' });
    }

    const parsed = parseRun(run);
    upsertRun(parsed);

    console.log(`[webhook] run ${parsed.id} upserted — outcome: ${parsed.outcome}`);
    return NextResponse.json({ ok: true, runId: parsed.id, outcome: parsed.outcome });

  } catch (err) {
    console.error('[webhook] error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}

// GET — for easy verification that the endpoint is alive
export async function GET() {
  const { getAllRuns } = await import('@/lib/store');
  const runs = getAllRuns();
  return NextResponse.json({
    status: 'webhook endpoint active',
    runsReceived: runs.length,
    latestRun: runs[0] ?? null,
  });
}
