import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;
  const orgId = process.env.HAPPYROBOT_ORG_ID;

  const envStatus = {
    HAPPYROBOT_API_KEY: apiKey ? `✅ set (${apiKey.slice(0, 8)}...)` : '❌ MISSING',
    HAPPYROBOT_USE_CASE_ID: useCaseId ? `✅ ${useCaseId}` : '❌ MISSING',
    HAPPYROBOT_ORG_ID: orgId ? `✅ ${orgId}` : '⚠️ not set (optional)',
  };

  if (!apiKey || !useCaseId) {
    return NextResponse.json({ envStatus, result: 'missing_credentials' });
  }

  // Try the actual API call and return raw result
  const url = `https://platform.happyrobot.ai/api/v1/runs/?use_case_id=${useCaseId}&page_size=5&sort=desc`;
  let apiResult: unknown;
  let httpStatus: number | null = null;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Organization-Id': orgId || '',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    httpStatus = res.status;
    const text = await res.text();

    try {
      apiResult = JSON.parse(text);
    } catch {
      apiResult = text.slice(0, 500); // raw text if not JSON
    }
  } catch (err) {
    apiResult = { fetchError: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({ envStatus, url, httpStatus, apiResult });
}
