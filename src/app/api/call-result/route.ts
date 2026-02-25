/**
 * POST /api/call-result
 *
 * Receives call outcome data from HappyRobot workflow Webhook nodes.
 * Add one Webhook POST node in the workflow after each tool call:
 *
 *   URL: https://repsol-outbound-demo-production.up.railway.app/api/call-result
 *   Body (Builder mode):
 *     phone              → @phone_number
 *     outcome            → "escalated"          (hardcode per branch)
 *     client_price       → @client_price         (only for price_recorded)
 *     negotiation_result → @negotiation_result   (only for price_recorded)
 *     callback_date      → @callback_date        (only for callback)
 *
 * Outcome values accepted:
 *   escalated, price_recorded, qualified, callback,
 *   decision_maker, voicemail, closed
 *
 * Also accepts tool_called instead of outcome:
 *   escalate_to_commercial → escalated
 *   record_price_expectation → price_recorded
 *   record_qualified_lead → qualified
 *   schedule_callback → callback
 *   request_decision_maker_contact → decision_maker
 *   report_voicemail → voicemail
 *   close_polite → closed
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateRecentRunByPhone } from '@/lib/store';
import type { CallOutcome, NegotiationResult } from '@/types';

export const dynamic = 'force-dynamic';

const TOOL_TO_OUTCOME: Record<string, CallOutcome> = {
  escalate_to_commercial:          'escalated',
  record_price_expectation:        'price_recorded',
  record_qualified_lead:           'qualified',
  schedule_callback:               'callback',
  request_decision_maker_contact:  'decision_maker',
  report_voicemail:                'voicemail',
  close_polite:                    'closed',
};

const VALID_OUTCOMES = new Set<CallOutcome>([
  'escalated', 'price_recorded', 'qualified', 'callback',
  'decision_maker', 'voicemail', 'closed',
]);

const PHASE_FOR_OUTCOME: Record<CallOutcome, number> = {
  escalated:       6,
  price_recorded:  5,
  qualified:       4,
  callback:        3,
  decision_maker:  2,
  voicemail:       1,
  closed:          2,
  in_progress:     1,
  unknown:         3,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    console.log('[call-result] received:', JSON.stringify(body));

    // ── Extract phone ──────────────────────────────────────────────────────────
    const phone = (body.phone ?? body.phone_number ?? '') as string;
    if (!phone) {
      return NextResponse.json({ ok: false, error: 'phone required' }, { status: 400 });
    }

    // ── Determine outcome ──────────────────────────────────────────────────────
    let outcome: CallOutcome | undefined;

    // Direct outcome field
    const rawOutcome = body.outcome as string | undefined;
    if (rawOutcome && VALID_OUTCOMES.has(rawOutcome as CallOutcome)) {
      outcome = rawOutcome as CallOutcome;
    }

    // Fallback: map from tool_called
    if (!outcome) {
      const toolCalled = body.tool_called as string | undefined;
      if (toolCalled && TOOL_TO_OUTCOME[toolCalled]) {
        outcome = TOOL_TO_OUTCOME[toolCalled];
      }
    }

    if (!outcome) {
      return NextResponse.json({ ok: false, error: `unknown outcome: ${rawOutcome}` }, { status: 400 });
    }

    // ── Extra fields ───────────────────────────────────────────────────────────
    const clientPrice      = body.client_price      as string | undefined;
    const rawNegResult     = body.negotiation_result as string | undefined;
    const negotiationResult: NegotiationResult | undefined =
      rawNegResult === 'aligned' || rawNegResult === 'negotiable' || rawNegResult === 'out_of_market'
        ? rawNegResult
        : undefined;
    const callbackDate     = body.callback_date     as string | undefined;
    const callbackTime     = body.callback_time     as string | undefined;
    const callbackNotes    = body.callback_notes    as string | undefined;
    const decisionMakerName = body.decision_maker_name as string | undefined;
    const closeReason      = body.close_reason      as string | undefined;

    // ── Update the run ────────────────────────────────────────────────────────
    const updates = {
      outcome,
      status: 'completed' as const,
      phaseReached: PHASE_FOR_OUTCOME[outcome],
      toolsCalled: [Object.keys(TOOL_TO_OUTCOME).find((k) => TOOL_TO_OUTCOME[k] === outcome) ?? outcome],
      ...(clientPrice       !== undefined && { clientPrice }),
      ...(negotiationResult !== undefined && { negotiationResult }),
      ...(callbackDate      !== undefined && { callbackDate }),
      ...(callbackTime      !== undefined && { callbackTime }),
      ...(callbackNotes     !== undefined && { callbackNotes }),
      ...(decisionMakerName !== undefined && { decisionMakerName }),
      ...(closeReason       !== undefined && { closeReason }),
    };

    const matched = updateRecentRunByPhone(phone, updates);
    console.log(`[call-result] phone=${phone} outcome=${outcome} matched=${matched}`);

    return NextResponse.json({
      ok: true,
      matched,
      outcome,
      phone,
      note: matched ? 'run updated' : 'no matching run found (use /api/pre-call first)',
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    console.error('[call-result] error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}
