import { NextResponse } from 'next/server';
import { fetchCallsFromHappyRobot } from '@/lib/happyrobot';
import { MOCK_CALLS } from '@/lib/mock-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;

  if (!apiKey || !useCaseId) {
    return NextResponse.json({ calls: MOCK_CALLS, source: 'mock' });
  }

  try {
    const calls = await fetchCallsFromHappyRobot();
    return NextResponse.json({ calls, source: 'live' });
  } catch (error) {
    console.error('[HappyRobot] fetch error:', error);
    return NextResponse.json({
      calls: MOCK_CALLS,
      source: 'mock',
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
