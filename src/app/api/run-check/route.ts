/**
 * GET /api/run-check?id=RUN_ID
 *
 * Diagnostic endpoint — shows the raw HappyRobot API response for a specific run.
 * Helps debug why fetchRunById might not be extracting phone/contact info.
 *
 * Usage:
 *   /api/run-check?id=a953a665-fd1c-4676-a1b8-37a6b7e9c6d2
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get('id');
  const sessionId = req.nextUrl.searchParams.get('session_id');

  const apiKey = process.env.HAPPYROBOT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const base = 'https://platform.happyrobot.ai/api/v2';
  const results: Record<string, unknown> = {};

  // Try run by ID
  if (runId) {
    try {
      const url = `${base}/runs/${runId}`;
      const res = await fetch(url, { headers, cache: 'no-store' });
      const body = res.ok ? await res.json() : await res.text();
      results.runById = { status: res.status, url, body };
    } catch (e) {
      results.runById = { error: String(e) };
    }

    // Also try with trailing slash
    try {
      const url = `${base}/runs/${runId}/`;
      const res = await fetch(url, { headers, cache: 'no-store' });
      const body = res.ok ? await res.json() : await res.text();
      results.runByIdSlash = { status: res.status, url, body };
    } catch (e) {
      results.runByIdSlash = { error: String(e) };
    }
  }

  // Try session by ID
  if (sessionId) {
    try {
      const url = `${base}/sessions/${sessionId}`;
      const res = await fetch(url, { headers, cache: 'no-store' });
      const body = res.ok ? await res.json() : await res.text();
      results.sessionById = { status: res.status, url, body };
    } catch (e) {
      results.sessionById = { error: String(e) };
    }
  }

  // Show current webhook store state
  const { getAllRuns } = await import('@/lib/store');
  const storedRuns = getAllRuns();
  results.webhookStore = {
    count: storedRuns.length,
    runs: storedRuns.map((r) => ({
      id: r.id,
      phone: r.phone,
      contactName: r.contactName,
      companyName: r.companyName,
      outcome: r.outcome,
      status: r.status,
      toolsCalled: r.toolsCalled,
    })),
  };

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
