import { NextResponse } from 'next/server';
import { fetchCallsFromHappyRobot } from '@/lib/happyrobot';
import { MOCK_CALLS, MOCK_CALLS_WITH_LIVE } from '@/lib/mock-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;

  // No API key → pure demo mode (with fake running call for visual effect)
  if (!apiKey || !useCaseId) {
    return NextResponse.json({ calls: MOCK_CALLS_WITH_LIVE, source: 'mock' });
  }

  try {
    const realCalls = await fetchCallsFromHappyRobot();

    // Merge: real calls first (newest on top) + demo backdrop for historical context.
    // Demo backdrop excludes running calls — real API provides those.
    const merged = [...realCalls, ...MOCK_CALLS];

    return NextResponse.json({ calls: merged, source: 'live+demo' });
  } catch (error) {
    console.error('[HappyRobot] fetch error:', error);
    // On error fall back to pure demo so the dashboard never appears broken
    return NextResponse.json({
      calls: MOCK_CALLS_WITH_LIVE,
      source: 'mock',
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
