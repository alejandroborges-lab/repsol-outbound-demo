import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = 'https://platform.happyrobot.ai/api/v2';

async function fetchJson(url: string, apiKey: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    return { status: null, ok: false, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}

export async function GET() {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;

  const envStatus = {
    HAPPYROBOT_API_KEY: apiKey ? `✅ (${apiKey.slice(0, 10)}...)` : '❌ MISSING',
    HAPPYROBOT_USE_CASE_ID: useCaseId ? `✅ ${useCaseId}` : '❌ MISSING',
  };

  if (!apiKey || !useCaseId) {
    return NextResponse.json({ envStatus, verdict: '❌ Missing credentials' });
  }

  // Test multiple sort + page combinations to find what returns data
  const tests: Record<string, unknown> = {};

  const variants = [
    `${BASE}/runs/?use_case_id=${useCaseId}&page_size=3&page=1`,
    `${BASE}/runs/?use_case_id=${useCaseId}&page_size=3&page=1&sort=desc`,
    `${BASE}/runs/?use_case_id=${useCaseId}&page_size=3&page=1&sort=asc`,
    `${BASE}/runs/?use_case_id=${useCaseId}&page_size=3&page=0`,
    `${BASE}/runs/?use_case_id=${useCaseId}&page_size=3&page=0&sort=desc`,
    `${BASE}/runs/?use_case_id=${useCaseId}&page_size=3&page=9&sort=desc`,
    `${BASE}/runs/?use_case_id=${useCaseId}&page_size=3&page=9&sort=asc`,
    `${BASE}/runs/?use_case_id=${useCaseId}&page_size=50`,
  ];

  for (const url of variants) {
    const key = url.replace(`${BASE}/runs/?use_case_id=${useCaseId}&`, '');
    tests[key] = await fetchJson(url, apiKey);
  }

  // Find which variant has data
  const winner = Object.entries(tests).find(([, v]) => {
    const r = v as { ok: boolean; body: { data?: unknown[] } };
    return r.ok && Array.isArray(r.body?.data) && r.body.data.length > 0;
  });

  // Also fetch detail of first run if we can find one
  let runDetailSample: unknown = null;
  if (winner) {
    const winnerData = (winner[1] as { body: { data: Array<{ id: string }> } }).body.data;
    if (winnerData.length > 0) {
      const runId = winnerData[0].id;
      runDetailSample = await fetchJson(`${BASE}/runs/${runId}`, apiKey);
    }
  }

  return NextResponse.json({
    envStatus,
    verdict: winner
      ? `✅ Data found with params: ${winner[0]}`
      : '⚠️ API connects but data:[] on all variants — check use_case_id matches your workflow',
    variants: tests,
    runDetailSample,
  });
}
