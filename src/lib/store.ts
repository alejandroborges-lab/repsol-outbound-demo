/**
 * In-memory store for runs received via HappyRobot webhook.
 * Lives for the lifetime of the Node.js process — perfect for a demo.
 * Stored on the global object so it survives Next.js hot-reloads in dev.
 */

import { ParsedCall } from '@/types';

declare global {
  // eslint-disable-next-line no-var
  var __webhookRuns: Map<string, ParsedCall> | undefined;
}

if (!global.__webhookRuns) {
  global.__webhookRuns = new Map<string, ParsedCall>();
}

export const webhookStore = global.__webhookRuns;

export function upsertRun(call: ParsedCall) {
  webhookStore.set(call.id, call);
}

export function getAllRuns(): ParsedCall[] {
  return Array.from(webhookStore.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
