/**
 * POST /api/webhook
 *
 * Receives HappyRobot run notifications in CloudEvents format:
 *   {
 *     "specversion": "1.0",
 *     "type": "session.status_changed",
 *     "data": {
 *       "run_id": "...",
 *       "status": { "current": "completed", ... }
 *     }
 *   }
 *
 * On each event we:
 *   1. Extract run_id from data.run_id
 *   2. Try to fetch full run details from HappyRobot API (phone, tools, etc.)
 *   3. Store in memory → dashboard picks it up on next poll
 *
 * Configure in HappyRobot:
 *   Platform → Outbound Sales Agent → Settings → Webhooks
 *   URL: https://repsol-outbound-demo-production.up.railway.app/api/webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseRun, fetchRunById } from '@/lib/happyrobot';
import { upsertRun, popRecentPendingCall } from '@/lib/store';
import type { ParsedCall } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    // ── Always log the full raw payload ──
    console.log('[webhook] RAW PAYLOAD:', JSON.stringify(body, null, 2).slice(0, 3000));
    console.log('[webhook] top-level keys:', Object.keys(body));

    // ── CloudEvents format (HappyRobot standard) ──
    // body.specversion === "1.0" and body.data contains the run data
    if (body.specversion && body.data) {
      const eventData = body.data as Record<string, unknown>;
      const runId = eventData.run_id as string | undefined;
      const statusObj = eventData.status as {
        previous?: string;
        current?: string;
        updated_at?: string;
      } | undefined;
      const currentStatus = statusObj?.current ?? 'unknown';

      console.log(`[webhook] CloudEvents — type: ${body.type} | run_id: ${runId} | status: ${currentStatus}`);

      // Also grab the session_id — needed for API enrichment (run/{id} is 404, sessions/{id} may work)
      const sessionId = eventData.session_id as string | undefined;
      console.log(`[webhook] session_id: ${sessionId}`);

      if (!runId) {
        console.warn('[webhook] CloudEvents missing run_id, keys in data:', Object.keys(eventData));
        return NextResponse.json({ ok: true, note: 'CloudEvents with no run_id' });
      }

      // Try to enrich with full run details from the API (phone number, tool calls, etc.)
      // Pass sessionId so fetchRunById can try /sessions/{sessionId} as fallback
      let call: ParsedCall | null = await fetchRunById(runId, sessionId);

      if (call) {
        console.log(`[webhook] ✅ API enrichment OK — outcome: ${call.outcome}, phone: ${call.phone}`);
      } else {
        // API unavailable — build a basic ParsedCall from webhook data alone
        console.log('[webhook] API enrichment failed — using CloudEvents data only');
        const mappedStatus: ParsedCall['status'] =
          currentStatus === 'in-progress' ? 'running' :
          currentStatus === 'completed'   ? 'completed' :
          currentStatus === 'failed'      ? 'failed' : 'running';

        call = {
          id: runId,
          phone: '',
          status: mappedStatus,
          outcome: mappedStatus === 'running' ? 'in_progress' : 'unknown',
          phaseReached: mappedStatus === 'running' ? 1 : 3,
          timestamp: (body.time as string) ?? new Date().toISOString(),
          completedAt: currentStatus === 'completed' ? (statusObj?.updated_at ?? undefined) : undefined,
          toolsCalled: [],
          isDemo: false,
          sessionId,
        };
      }

      // Try to enrich with pre-registered contact data (from /api/pre-call)
      // Only pop on first event (in-progress) so we don't lose it on the completed event
      if (currentStatus === 'in-progress' && (!call.phone || !call.contactName)) {
        const pending = popRecentPendingCall(120_000);
        if (pending) {
          console.log(`[webhook] ✅ merged pre-call data: ${pending.phone} / ${pending.contactName}`);
          call = {
            ...call,
            phone: pending.phone || call.phone,
            contactName: pending.contactName || call.contactName,
            companyName: pending.companyName || call.companyName,
          };
        } else {
          console.log('[webhook] no recent pre-call data found (use /api/pre-call before triggering)');
        }
      }

      upsertRun(call);
      console.log(`[webhook] ✅ stored run ${runId} — status: ${currentStatus}, outcome: ${call.outcome}, phone: ${call.phone}`);
      return NextResponse.json({ ok: true, runId, status: currentStatus, outcome: call.outcome, phone: call.phone });
    }

    // ── Legacy / direct run object format (manual tests, etc.) ──
    const run = (body.run ?? body.data ?? body) as Record<string, unknown>;
    console.log('[webhook] legacy format — run keys:', Object.keys(run));
    console.log('[webhook] run.id:', run.id, '| run.status:', run.status);

    if (!run.id) {
      console.warn('[webhook] ⚠️ no run.id found. Keys:', Object.keys(run));
      return NextResponse.json({
        ok: true,
        note: 'no run.id — check Railway logs for full payload',
        keys: Object.keys(run),
      });
    }

    const parsed = parseRun(run);
    upsertRun(parsed);
    console.log(`[webhook] ✅ legacy run ${parsed.id} stored — outcome: ${parsed.outcome}, tools: ${parsed.toolsCalled.join(',')}`);
    return NextResponse.json({ ok: true, runId: parsed.id, outcome: parsed.outcome });

  } catch (err) {
    console.error('[webhook] error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}

// GET — health check
export async function GET() {
  const { getAllRuns } = await import('@/lib/store');
  const runs = getAllRuns();
  return NextResponse.json({
    status: 'webhook endpoint active',
    runsReceived: runs.length,
    latestRun: runs[0] ?? null,
  });
}
