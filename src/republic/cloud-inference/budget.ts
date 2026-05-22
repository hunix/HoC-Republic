/**
 * Cloud Inference — Citizen Budget Governor
 *
 * Sliding-window rate limiter that caps paid cloud API calls per hour
 * for autonomous citizen decisions. O(1) epoch-bucket counter.
 *
 * Env:
 *   CITIZEN_CLOUD_INFERENCE=true  → enable cloud for citizens
 *   CITIZEN_CLOUD_MAX_HOURLY=100  → max paid calls/hour (default 100)
 */

import { key } from "./providers.js";

// ─── Epoch-Bucket Counter ───────────────────────────────────────

const SLOTS = 60; // 1 bucket per minute → 60 minutes = 1 hour
const SLOT_MS = 60_000;
const buckets = new Int32Array(SLOTS);
let lastSlot = -1;

function currentSlot(): number {
  return Math.floor(Date.now() / SLOT_MS);
}

/** Zero out any stale buckets between lastSlot and now */
function advance(): void {
  const now = currentSlot();
  if (lastSlot < 0) {
    lastSlot = now;
    return;
  }
  const gap = now - lastSlot;
  if (gap <= 0) {
    return;
  }
  const toClear = Math.min(gap, SLOTS);
  for (let i = 1; i <= toClear; i++) {
    buckets[(lastSlot + i) % SLOTS] = 0;
  }
  lastSlot = now;
}

/** Sum all 60 buckets → total calls in the last hour */
function total(): number {
  let sum = 0;
  for (let i = 0; i < SLOTS; i++) {
    sum += buckets[i];
  }
  return sum;
}

// ─── Public API ─────────────────────────────────────────────────

export function canCall(): boolean {
  const max = parseInt(key("CITIZEN_CLOUD_MAX_HOURLY") ?? "100", 10);
  advance();
  return total() < max;
}

export function recordCall(): void {
  advance();
  buckets[currentSlot() % SLOTS]++;
}

export function getBudgetStatus(): { callsThisHour: number; maxPerHour: number } {
  const max = parseInt(key("CITIZEN_CLOUD_MAX_HOURLY") ?? "100", 10);
  advance();
  return { callsThisHour: total(), maxPerHour: max };
}

/** Check if citizen cloud inference is enabled */
export function isCloudEnabledForCitizens(): boolean {
  return key("CITIZEN_CLOUD_INFERENCE") === "true";
}
