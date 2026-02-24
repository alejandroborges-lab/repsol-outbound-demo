import { ParsedCall, CallOutcome, NegotiationResult } from '@/types';

const HAPPYROBOT_BASE = 'https://platform.happyrobot.ai/api/v2';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.HAPPYROBOT_API_KEY}`,
    'Content-Type': 'application/json',
  };
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

export async function fetchCallsFromHappyRobot(): Promise<ParsedCall[]> {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  const useCaseId = process.env.HAPPYROBOT_USE_CASE_ID;

  if (!apiKey || !useCaseId) throw new Error('Missing HappyRobot credentials');

  // Try multiple sort/page combos — the API sometimes returns data:[] on page=1
  // with the default sort. We try the most likely working variants in order.
  const candidates = [
    `${HAPPYROBOT_BASE}/runs/?use_case_id=${useCaseId}&page_size=50&sort=desc`,
    `${HAPPYROBOT_BASE}/runs/?use_case_id=${useCaseId}&page_size=50&sort=asc`,
    `${HAPPYROBOT_BASE}/runs/?use_case_id=${useCaseId}&page_size=50`,
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
        const res = await fetch(`${HAPPYROBOT_BASE}/runs/${run.id}`, {
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
