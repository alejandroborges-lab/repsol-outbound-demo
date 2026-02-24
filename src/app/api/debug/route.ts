import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = 'https://platform.happyrobot.ai/api/v2';

async function get(url: string, apiKey: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    return { status: null, ok: false, body: String(err) };
  }
}

export async function GET() {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;

  if (!apiKey) return NextResponse.json({ error: '❌ HAPPYROBOT_API_KEY missing' });

  // 1. List all use-cases — this shows the REAL IDs for this API key
  const useCases = await get(`${BASE}/use-cases/`, apiKey);

  // 2. Try runs WITHOUT any use_case_id filter — do ANY runs come back?
  const runsNoFilter = await get(`${BASE}/runs/?page_size=5`, apiKey);

  // 3. Try with the configured use_case_id (for comparison)
  const runsWithFilter = useCaseId
    ? await get(`${BASE}/runs/?use_case_id=${useCaseId}&page_size=5`, apiKey)
    : 'HAPPYROBOT_USE_CASE_ID not set';

  // 4. Try fetching a specific run by ID using the use_case_id as the run ID
  //    (in case use_case_id was accidentally set to a run ID)
  const runById = useCaseId
    ? await get(`${BASE}/runs/${useCaseId}`, apiKey)
    : null;

  return NextResponse.json({
    step1_useCases: useCases,
    step2_runsNoFilter: runsNoFilter,
    step3_runsWithConfiguredUseCaseId: runsWithFilter,
    step4_runByIdUsingUseCaseId: runById,
    hint: 'Check step1_useCases — find the correct id for your Roberto workflow and update HAPPYROBOT_USE_CASE_ID',
  });
}
