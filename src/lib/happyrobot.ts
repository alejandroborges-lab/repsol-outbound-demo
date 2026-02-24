import { ParsedCall, CallOutcome, NegotiationResult } from '@/types';

// Docs show the API at root /runs/ (no /api/v2 prefix)
// See: https://platform.happyrobot.ai/runs/ in official docs
const HAPPYROBOT_RUNS = 'https://platform.happyrobot.ai/runs';
const HAPPYROBOT_BASE_V2 = 'https://platform.happyrobot.ai/api/v2'; // kept for fallback
const HAPPYROBOT_BASE_V1 = 'https://platform.happyrobot.ai/api/v1';

function getHeaders() {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.HAPPYROBOT_API_KEY}`,
    'Content-Type': 'application/json',
  };
  // v1 API requires x-organization-id header
  if (process.env.HAPPYROBOT_ORG_ID) {
    headers['x-organization-id'] = process.env.HAPPYROBOT_ORG_ID;
  }
  return headers;
}

interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  response: Record<string, unknown>;
}

// Handles both v1 (events[]) and v2 (sessions[].messages) response formats
function extractToolCalls(run: Record<string, unknown>): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // v2 format: sessions[].messages
  const sessions = run.sessions as Array<Record<string, unknown>> | undefined;
  if (sessions) {
    for (const session of sessions) {
      const messages = (session.messages || session.transcript || []) as Array<Record<string, unknown>>;
      for (const msg of messages) {
        if (msg.type === 'tool_call' || msg.role === 'tool') {
          toolCalls.push({
            name: (msg.tool_name || msg.function || msg.name || 'unknown') as string,
            params: (msg.input_parameters || msg.parameters || msg.arguments || {}) as Record<string, unknown>,
            response: (msg.response || msg.result || {}) as Record<string, unknown>,
          });
        }
      }
    }
  }

  // v1 format: events[]
  const events = run.events as Array<Record<string, unknown>> | undefined;
  if (events) {
    for (const event of events) {
      // AI events (UNIR-style)
      if (event.integration_name === 'AI') {
        const output = event.output as Record<string, unknown> | undefined;
        const resp = output?.response as Record<string, unknown> | undefined;
        if (resp?.tool_name || resp?.function_name) {
          toolCalls.push({
            name: (resp.tool_name || resp.function_name) as string,
            params: (resp.parameters || resp.input_parameters || {}) as Record<string, unknown>,
            response: {},
          });
        }
        if (resp?.function_call) {
          const fc = resp.function_call as Record<string, unknown>;
          toolCalls.push({
            name: (fc.name || 'unknown') as string,
            params: JSON.parse((fc.arguments as string) || '{}'),
            response: {},
          });
        }
      }
      // Direct tool_call events
      if (event.type === 'tool_call') {
        toolCalls.push({
          name: (event.tool_name || event.name || 'unknown') as string,
          params: (event.input_parameters || event.parameters || {}) as Record<string, unknown>,
          response: (event.response || {}) as Record<string, unknown>,
        });
      }
    }
  }

  return toolCalls;
}

function getCallDuration(run: Record<string, unknown>): number | undefined {
  const sessions = run.sessions as Array<Record<string, unknown>> | undefined;
  if (sessions) {
    for (const s of sessions) {
      if (s.duration) return s.duration as number;
      const out = s.output as Record<string, unknown> | undefined;
      if (out?.duration) return out.duration as number;
    }
  }
  const events = run.events as Array<Record<string, unknown>> | undefined;
  if (events) {
    for (const e of events) {
      const out = e.output as Record<string, unknown> | undefined;
      if (e.type === 'session' && out?.duration) return out.duration as number;
    }
  }
  if (run.timestamp && run.completed_at) {
    const start = new Date(run.timestamp as string).getTime();
    const end = new Date(run.completed_at as string).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      return Math.round((end - start) / 1000);
    }
  }
  return undefined;
}

function getPhoneNumber(run: Record<string, unknown>): string {
  const sessions = run.sessions as Array<Record<string, unknown>> | undefined;
  if (sessions) {
    for (const s of sessions) {
      const phones = s.phone_numbers as Record<string, string> | undefined;
      if (phones?.to) return phones.to;
      if (s.to_number) return s.to_number as string;
    }
  }
  const meta = run.metadata as Record<string, unknown> | undefined;
  if (meta?.phone_number) return meta.phone_number as string;
  return '';
}

function getContactInfo(run: Record<string, unknown>): { contactName?: string; companyName?: string } {
  const meta = (run.metadata || run.trigger_data || run.input_data || {}) as Record<string, unknown>;
  return {
    contactName: (meta.contact_name || meta.nombre || meta.name) as string | undefined,
    companyName: (meta.company_name || meta.empresa || meta.company) as string | undefined,
  };
}

function determineOutcome(toolNames: string[]): CallOutcome {
  if (toolNames.includes('escalate_to_commercial')) return 'escalated';
  if (toolNames.includes('record_price_expectation')) return 'price_recorded';
  if (toolNames.includes('record_qualified_lead')) return 'qualified';
  if (toolNames.includes('schedule_callback')) return 'callback';
  if (toolNames.includes('request_decision_maker_contact')) return 'decision_maker';
  if (toolNames.includes('report_voicemail')) return 'voicemail';
  if (toolNames.includes('close_polite')) return 'closed';
  return 'unknown';
}

function inferPhase(toolNames: string[]): number {
  if (toolNames.includes('escalate_to_commercial')) return 5;
  if (toolNames.includes('record_price_expectation')) return 5;
  if (toolNames.includes('record_qualified_lead')) return 4;
  if (toolNames.includes('report_voicemail')) return 0;
  if (toolNames.includes('request_decision_maker_contact')) return 1;
  if (toolNames.includes('schedule_callback')) return 2;
  if (toolNames.includes('close_polite')) return 2;
  return 0;
}

export function parseRun(run: Record<string, unknown>): ParsedCall {
  const toolCalls = extractToolCalls(run);
  const toolNames = toolCalls.map((t) => t.name);
  const status = run.status as string;
  const outcome = status === 'running' ? 'in_progress' : determineOutcome(toolNames);
  const phaseReached = inferPhase(toolNames);

  // Negotiation result
  let negotiationResult: NegotiationResult | undefined;
  const priceCall = toolCalls.find((t) => t.name === 'record_price_expectation');
  if (priceCall) {
    const r = (priceCall.params.negotiation_result || priceCall.response.negotiation_result) as string | undefined;
    if (r === 'aligned' || r === 'negotiable' || r === 'out_of_market') negotiationResult = r;
  }

  // Close reason
  const closeCall = toolCalls.find((t) => t.name === 'close_polite');
  const closeReason = (closeCall?.params.reason || closeCall?.params.message) as string | undefined;

  // Callback info
  const cbCall = toolCalls.find((t) => t.name === 'schedule_callback');
  const callbackDate = cbCall?.params.date as string | undefined;
  const callbackTime = cbCall?.params.time as string | undefined;
  const callbackNotes = cbCall?.params.notes as string | undefined;

  // Decision maker
  const dmCall = toolCalls.find((t) => t.name === 'request_decision_maker_contact');
  const decisionMakerName = dmCall?.params.name as string | undefined;

  // Client price
  const clientPrice = priceCall?.params.client_price as string | undefined;

  const { contactName, companyName } = getContactInfo(run);

  return {
    id: run.id as string,
    phone: getPhoneNumber(run),
    contactName,
    companyName,
    status: status as ParsedCall['status'],
    outcome,
    phaseReached,
    duration: getCallDuration(run),
    timestamp: run.timestamp as string,
    completedAt: run.completed_at as string | undefined,
    toolsCalled: toolNames,
    negotiationResult,
    callbackDate,
    callbackTime,
    callbackNotes,
    decisionMakerName,
    closeReason,
    clientPrice,
  };
}

/**
 * Fetch run details by run_id or session_id.
 * HappyRobot v2 does NOT support GET /runs/{id} (returns 404).
 * Falls back to GET /sessions/{sessionId} which may return conversation data.
 */
export async function fetchRunById(runId: string, sessionId?: string): Promise<ParsedCall | null> {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  if (!apiKey) return null;

  // Try every known URL variant (docs, v1, v2)
  const urlsToTry = [
    // ① Docs URL (no version prefix) — most likely correct
    `${HAPPYROBOT_RUNS}/${runId}`,
    // ② v1 with org_id header (needed per API error message)
    `${HAPPYROBOT_BASE_V1}/runs/${runId}`,
    // ③ Sessions endpoint with session_id
    ...(sessionId ? [
      `${HAPPYROBOT_RUNS}/${sessionId}`,
      `${HAPPYROBOT_BASE_V2}/sessions/${sessionId}`,
      `${HAPPYROBOT_BASE_V1}/sessions/${sessionId}`,
    ] : []),
    // ④ v2 (known 404, kept as last resort)
    `${HAPPYROBOT_BASE_V2}/runs/${runId}`,
  ];

  for (const url of urlsToTry) {
    try {
      console.log(`[HappyRobot] fetchRunById trying → ${url}`);
      const res = await fetch(url, { headers: getHeaders(), cache: 'no-store' });
      console.log(`[HappyRobot] fetchRunById ${url} → status: ${res.status}`);
      if (!res.ok) continue;

      const data = (await res.json()) as Record<string, unknown>;
      console.log('[HappyRobot] fetchRunById response:', JSON.stringify(data, null, 2).slice(0, 3000));

      // Extract run/session from wrapper if needed
      const run = (data.run ?? data.session ?? data.data ?? data) as Record<string, unknown>;
      console.log('[HappyRobot] run keys:', Object.keys(run));
      console.log('[HappyRobot] run.id:', run.id, '| run.status:', run.status);

      const effectiveId = run.id ?? runId;
      const parsed = parseRun({ ...run, id: effectiveId });
      // Preserve sessionId in result
      if (sessionId) parsed.sessionId = sessionId;
      return parsed;
    } catch (e) {
      console.error(`[HappyRobot] fetchRunById error on ${url}:`, e);
    }
  }

  console.warn('[HappyRobot] fetchRunById: all URLs failed for runId:', runId);
  return null;
}

export async function fetchCallsFromHappyRobot(): Promise<ParsedCall[]> {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;

  if (!apiKey || !useCaseId) throw new Error('Missing HappyRobot credentials');

  // Try the docs URL first (no /api/v2 prefix), then v2, then v1
  const candidates = [
    `${HAPPYROBOT_RUNS}/?use_case_id=${useCaseId}&page_size=50&sort=desc`,
    `${HAPPYROBOT_RUNS}/?use_case_id=${useCaseId}&page_size=50`,
    `${HAPPYROBOT_BASE_V2}/runs/?use_case_id=${useCaseId}&page_size=50&sort=desc`,
    `${HAPPYROBOT_BASE_V2}/runs/?use_case_id=${useCaseId}&page_size=50`,
    `${HAPPYROBOT_BASE_V1}/runs/?use_case_id=${useCaseId}&page_size=50&sort=desc`,
  ];

  let runs: Array<Record<string, unknown>> = [];
  let totalPages = 1;

  for (const url of candidates) {
    const res = await fetch(url, { headers: getHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(`HappyRobot API ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as Record<string, unknown>;
    const pagination = data.pagination as Record<string, number> | undefined;
    totalPages = pagination?.totalPages ?? 1;
    const page = (data.data || data.runs || (Array.isArray(data) ? data : [])) as Array<Record<string, unknown>>;

    if (page.length > 0) {
      runs = page;
      break;
    }

    // If page 1 was empty but there are more pages, fetch the LAST page
    if (page.length === 0 && totalPages > 1) {
      const lastUrl = `${url}&page=${totalPages}`;
      const lastRes = await fetch(lastUrl, { headers: getHeaders(), cache: 'no-store' });
      if (lastRes.ok) {
        const lastData = (await lastRes.json()) as Record<string, unknown>;
        const lastPage = (lastData.data || lastData.runs || []) as Array<Record<string, unknown>>;
        if (lastPage.length > 0) { runs = lastPage; break; }
      }
    }
  }

  // If listing already has sessions/events, parse directly (no extra requests needed)
  if (runs.length > 0 && (runs[0].sessions || runs[0].events)) {
    return runs.map(parseRun);
  }

  // Otherwise fetch details for each run to get tool calls (parallel, max 20)
  const targetRuns = runs
    .filter((r) => r.status === 'completed' || r.status === 'running')
    .slice(0, 20);

  const detailed = await Promise.all(
    targetRuns.map(async (run) => {
      try {
        const res = await fetch(`${HAPPYROBOT_RUNS}/${run.id}`, {
          headers: getHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) return run;
        const detail = (await res.json()) as Record<string, unknown>;
        return { ...run, ...detail };
      } catch {
        return run;
      }
    }),
  );

  return detailed.map(parseRun);
}
