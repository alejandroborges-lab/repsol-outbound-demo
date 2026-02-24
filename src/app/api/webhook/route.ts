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

    // ALWAYS log the full raw payload — critical for debugging HappyRobot format
    console.log('[webhook] RAW PAYLOAD RECEIVED:', JSON.stringify(body, null, 2).slice(0, 2000));
    console.log('[webhook] top-level keys:', Object.keys(body));

    // HappyRobot may send a run object directly, or wrap it under .run / .data
    const run = (body.run ?? body.data ?? body) as Record<string, unknown>;

    console.log('[webhook] resolved run keys:', Object.keys(run));
    console.log('[webhook] run.id:', run.id, '| run.status:', run.status);

    if (!run.id) {
      // No run.id — store the raw payload anyway so we can inspect it via GET /api/webhook
      console.warn('[webhook] ⚠️ no run.id found — raw payload logged above. Keys available:', Object.keys(run));
      return NextResponse.json({
        ok: true,
        note: 'no run.id — check Railway logs for full payload',
        keys: Object.keys(run),
      });
    }

    const parsed = parseRun(run);
    upsertRun(parsed);

    console.log(`[webhook] ✅ run ${parsed.id} upserted — outcome: ${parsed.outcome}, tools: ${parsed.toolsCalled.join(',')}`);
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
