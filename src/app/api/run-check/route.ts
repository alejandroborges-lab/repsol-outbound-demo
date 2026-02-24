/**
 * GET /api/run-check?id=RUN_ID&session_id=SESSION_ID
 *
 * Diagnostic: shows raw HappyRobot API responses for a run/session.
 * Also shows the full webhook store state with session IDs.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get('id');
  const sessionIdParam = req.nextUrl.searchParams.get('session_id');

  const apiKey = process.env.HAPPYROBOT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const base = 'https://platform.happyrobot.ai/api/v2';
  const baseV1 = 'https://platform.happyrobot.ai/api/v1';
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const results: Record<string, unknown> = {};

  // Show webhook store first (includes session IDs stored from CloudEvents)
  const { getAllRuns } = await import('@/lib/store');
  const storedRuns = getAllRuns();
  results.webhookStore = {
    count: storedRuns.length,
    runs: storedRuns.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      phone: r.phone,
      contactName: r.contactName,
      companyName: r.companyName,
      outcome: r.outcome,
      status: r.status,
      toolsCalled: r.toolsCalled,
    })),
  };

  // Figure out which IDs to probe
  const latestRun = storedRuns[0];
  const probeRunId = runId ?? latestRun?.id;
  const probeSessionId = sessionIdParam ?? latestRun?.sessionId;

  results.probing = { runId: probeRunId, sessionId: probeSessionId };

  const tryUrl = async (url: string) => {
    try {
      const res = await fetch(url, { headers, cache: 'no-store' });
      const body = res.ok ? await res.json() : await res.text();
      return { status: res.status, url, body };
    } catch (e) {
      return { error: String(e), url };
    }
  };

  // Try every plausible endpoint
  if (probeRunId) {
    results.v2_runs_by_id   = await tryUrl(`${base}/runs/${probeRunId}`);
    results.v1_runs_by_id   = await tryUrl(`${baseV1}/runs/${probeRunId}`);
    results.v2_sessions_as_run = await tryUrl(`${base}/sessions/${probeRunId}`);
  }

  if (probeSessionId) {
    results.v2_sessions_by_id = await tryUrl(`${base}/sessions/${probeSessionId}`);
    results.v1_sessions_by_id = await tryUrl(`${baseV1}/sessions/${probeSessionId}`);
  }

  // Also try listing with loose filters
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;
  if (useCaseId) {
    results.v2_listing_p1 = await tryUrl(`${base}/runs/?use_case_id=${useCaseId}&page_size=5`);
    results.v2_listing_no_filter = await tryUrl(`${base}/runs/?page_size=5`);
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
