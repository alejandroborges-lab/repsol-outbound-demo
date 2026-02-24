/**
 * In-memory store for runs received via HappyRobot webhook.
 * Lives for the lifetime of the Node.js process — perfect for a demo.
 * Stored on the global object so it survives Next.js hot-reloads in dev.
 */

import { ParsedCall } from '@/types';

// ── Pending call store ────────────────────────────────────────────────────────
// Stores contact data pre-registered before triggering HappyRobot.
// Used to enrich CloudEvents runs that have no phone/contact info.

export interface PendingCall {
  phone: string;
  contactName?: string;
  companyName?: string;
  referencePrice?: number;
  priceMin?: number;
  priceMax?: number;
  storedAt: number; // Date.now()
}

declare global {
  // eslint-disable-next-line no-var
  var __webhookRuns: Map<string, ParsedCall> | undefined;
  // eslint-disable-next-line no-var
  var __pendingCalls: PendingCall[] | undefined;
}

if (!global.__webhookRuns) global.__webhookRuns = new Map<string, ParsedCall>();
if (!global.__pendingCalls) global.__pendingCalls = [];

export const webhookStore = global.__webhookRuns;
export const pendingCallStore = global.__pendingCalls;

// ── Run store ─────────────────────────────────────────────────────────────────

export function upsertRun(call: ParsedCall) {
  // Preserve existing contact info if new version has none
  const existing = webhookStore.get(call.id);
  if (existing) {
    call = {
      ...existing,
      ...call,
      // Keep contact info from previous version if current has none
      phone: call.phone || existing.phone,
      contactName: call.contactName || existing.contactName,
      companyName: call.companyName || existing.companyName,
    };
  }
  webhookStore.set(call.id, call);
}

export function getAllRuns(): ParsedCall[] {
  return Array.from(webhookStore.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ── Pending call store ────────────────────────────────────────────────────────

/** Register contact data before triggering a HappyRobot call */
export function storePendingCall(data: Omit<PendingCall, 'storedAt'>) {
  pendingCallStore.push({ ...data, storedAt: Date.now() });
  // Keep only last 20 entries
  if (pendingCallStore.length > 20) pendingCallStore.splice(0, pendingCallStore.length - 20);
}

/**
 * Pop the most recently stored pending call within the given TTL window (default 120s).
 * Used to enrich a run that just started via CloudEvents.
 */
export function popRecentPendingCall(ttlMs = 120_000): PendingCall | null {
  const now = Date.now();
  // Find most recent pending call within TTL
  const idx = pendingCallStore.reduce((best, call, i) => {
    if (now - call.storedAt > ttlMs) return best;
    if (best === -1) return i;
    return call.storedAt > pendingCallStore[best].storedAt ? i : best;
  }, -1);

  if (idx === -1) return null;
  // Remove and return it
  const [call] = pendingCallStore.splice(idx, 1);
  return call;
}
