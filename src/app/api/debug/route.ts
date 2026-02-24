import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function tryUrl(url: string, apiKey: string, orgId?: string) {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (orgId) headers['X-Organization-Id'] = orgId;

    const res = await fetch(url, { headers, cache: 'no-store' });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }

    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    return { status: null, ok: false, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}

export async function GET() {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;
  const orgId = process.env.HAPPYROBOT_ORG_ID;

  const envStatus = {
    HAPPYROBOT_API_KEY: apiKey ? `✅ set (${apiKey.slice(0, 10)}...)` : '❌ MISSING — get from HappyRobot Settings > API Keys',
    HAPPYROBOT_USE_CASE_ID: useCaseId ? `✅ ${useCaseId}` : '❌ MISSING — add: 019c722e-f93f-747f-9ddd-a385b067886a',
    HAPPYROBOT_ORG_ID: orgId ? `✅ ${orgId}` : '⚠️ not set (optional)',
  };

  if (!apiKey || !useCaseId) {
    return NextResponse.json({ envStatus, verdict: '❌ Cannot connect — missing env vars above' });
  }

  // Try all possible URL formats to find which one works
  const urlsToTry = [
    `https://platform.happyrobot.ai/api/v2/runs/?use_case_id=${useCaseId}&page_size=3`,
    `https://platform.happyrobot.ai/api/v1/runs/?use_case_id=${useCaseId}&page_size=3`,
    `https://platform.happyrobot.ai/runs/?use_case_id=${useCaseId}&page_size=3`,
  ];

  const results: Record<string, unknown> = {};
  for (const url of urlsToTry) {
    results[url] = await tryUrl(url, apiKey, orgId);
  }

  const workingUrl = urlsToTry.find((u) => (results[u] as { ok: boolean }).ok);

  return NextResponse.json({
    envStatus,
    verdict: workingUrl
      ? `✅ Working URL: ${workingUrl}`
      : '❌ None of the URLs returned 200 — check API key and use_case_id',
    urlTests: results,
  });
}
