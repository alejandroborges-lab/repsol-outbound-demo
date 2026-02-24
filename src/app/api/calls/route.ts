import { NextResponse } from 'next/server';
import { fetchCallsFromHappyRobot } from '@/lib/happyrobot';
import { MOCK_CALLS, MOCK_CALLS_WITH_LIVE } from '@/lib/mock-data';
import { getAllRuns } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;

  // Runs received via webhook (works in both dev and prod, in real-time)
  const webhookRuns = getAllRuns();

  // If we have webhook data, always use it merged with demo backdrop
  if (webhookRuns.length > 0) {
    const merged = [...webhookRuns, ...MOCK_CALLS];
    return NextResponse.json({ calls: merged, source: 'live+demo' });
  }

  // No API key → pure demo mode
  if (!apiKey || !useCaseId) {
    return NextResponse.json({ calls: MOCK_CALLS_WITH_LIVE, source: 'mock' });
  }

  // Try the polling API (works for production workflows)
  try {
    const realCalls = await fetchCallsFromHappyRobot();
    if (realCalls.length > 0) {
      const merged = [...realCalls, ...MOCK_CALLS];
      return NextResponse.json({ calls: merged, source: 'live+demo' });
    }
  } catch (error) {
    console.error('[HappyRobot] polling error:', error);
  }

  // Fallback: demo mode (API connected but no runs found yet)
  return NextResponse.json({ calls: MOCK_CALLS_WITH_LIVE, source: 'mock' });
}
