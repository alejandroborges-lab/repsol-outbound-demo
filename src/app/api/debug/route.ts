import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = 'https://platform.happyrobot.ai/api/v2';
const USE_CASE_ID = '019c722e-f93f-747f-9ddd-a385b067886a';
const VERSION_ID  = '019c914d-d69a-7b32-90e9-4d28b5d7e867';

async function get(url: string, apiKey: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    return { status: res.status, ok: res.ok, dataLength: Array.isArray((body as Record<string,unknown>)?.data) ? ((body as Record<string,unknown>).data as unknown[]).length : '?', body };
  } catch (err) {
    return { status: null, ok: false, dataLength: 0, body: String(err) };
  }
}

export async function GET() {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: '❌ HAPPYROBOT_API_KEY missing' });

  const base = `${BASE}/runs/?use_case_id=${USE_CASE_ID}&page_size=5`;

  const tests: Record<string, unknown> = {
    'base (no extras)':            await get(base, apiKey),
    'version_id added':            await get(`${base}&version_id=${VERSION_ID}`, apiKey),
    'status=completed':            await get(`${base}&status=completed`, apiKey),
    'status=running':              await get(`${base}&status=running`, apiKey),
    'status=failed':               await get(`${base}&status=failed`, apiKey),
    'status=canceled':             await get(`${base}&status=canceled`, apiKey),
    'status=scheduled':            await get(`${base}&status=scheduled`, apiKey),
    'version_id+status=completed': await get(`${base}&version_id=${VERSION_ID}&status=completed`, apiKey),
    'version_id+status=running':   await get(`${base}&version_id=${VERSION_ID}&status=running`, apiKey),
  };

  const winner = Object.entries(tests).find(([, v]) => {
    const r = v as { dataLength: number | string };
    return typeof r.dataLength === 'number' && r.dataLength > 0;
  });

  // If winner found, fetch the first run's detail to see its full structure
  let firstRunDetail: unknown = null;
  if (winner) {
    const winnerBody = (winner[1] as { body: { data: Array<{ id: string }> } }).body;
    const firstId = winnerBody?.data?.[0]?.id;
    if (firstId) {
      firstRunDetail = await get(`${BASE}/runs/${firstId}`, apiKey);
    }
  }

  return NextResponse.json({
    verdict: winner ? `✅ FOUND DATA with: "${winner[0]}"` : '❌ data:[] on every variant — may be a HappyRobot API issue with dev-environment workflows',
    tests,
    firstRunDetail,
  });
}
