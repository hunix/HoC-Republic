/**
 * Crucix World Intel Bridge
 *
 * Bridges the Crucix OSINT dashboard (tools/crucix/) into HoC's
 * existing World Intelligence system. Crucix pulls from 27 open-source
 * intelligence feeds (satellite fire, flight tracking, radiation,
 * conflict data, sanctions, maritime, economic indicators, social
 * sentiment) every 15 minutes.
 *
 * This module:
 * 1. Spawns Crucix as a background process
 * 2. Reads its API output
 * 3. Publishes to the Intelligence Bus
 * 4. Exposes data via existing republic.worldintel.* RPCs
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

/* ── Constants ─────────────────────────────────────────────────────────── */

const CRUCIX_ROOT = path.resolve(process.cwd(), "tools", "crucix");
const CRUCIX_PORT = 3117;
const CRUCIX_API = `http://localhost:${CRUCIX_PORT}`;

/* ── State ─────────────────────────────────────────────────────────────── */

let crucixProcess: ChildProcess | null = null;
let lastSweepData: CrucixSweepData | null = null;
let lastFetchTime = 0;

interface CrucixSweepData {
  fires?: Array<{ lat: number; lon: number; confidence: number; source: string }>;
  flights?: Array<{ callsign: string; lat: number; lon: number; altitude: number }>;
  radiation?: Array<{ location: string; value: number; unit: string }>;
  conflicts?: Array<{ country: string; event: string; fatalities: number; date: string }>;
  sanctions?: Array<{ entity: string; type: string; source: string }>;
  maritime?: Array<{ name: string; lat: number; lon: number; type: string }>;
  economic?: Array<{ indicator: string; value: number; change: number }>;
  social?: Array<{ source: string; message: string; sentiment: number }>;
  satellites?: Array<{ name: string; type: string; count: number }>;
  alerts?: Array<{ tier: "FLASH" | "PRIORITY" | "ROUTINE"; message: string; source: string }>;
  sweepTime?: string;
  sourceCount?: number;
}

/* ── Lifecycle ─────────────────────────────────────────────────────────── */

export async function isCrucixInstalled(): Promise<boolean> {
  try {
    await fs.access(path.join(CRUCIX_ROOT, "server.mjs"));
    return true;
  } catch {
    return false;
  }
}

export async function startCrucix(): Promise<{ ok: boolean; message: string }> {
  if (crucixProcess) {
    return { ok: true, message: "Crucix already running" };
  }

  const installed = await isCrucixInstalled();
  if (!installed) {
    return { ok: false, message: "Crucix not installed at tools/crucix/" };
  }

  try {
    crucixProcess = spawn("node", ["server.mjs"], {
      cwd: CRUCIX_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(CRUCIX_PORT) },
    });

    crucixProcess.on("close", () => {
      crucixProcess = null;
    });

    crucixProcess.on("error", (err) => {
      console.error(`[crucix] Process error: ${err.message}`);
      crucixProcess = null;
    });

    return { ok: true, message: `Crucix started on port ${CRUCIX_PORT}` };
  } catch (err) {
    return { ok: false, message: `Failed to start Crucix: ${String(err)}` };
  }
}

export async function stopCrucix(): Promise<{ ok: boolean; message: string }> {
  if (!crucixProcess) {
    return { ok: true, message: "Crucix not running" };
  }
  crucixProcess.kill("SIGTERM");
  crucixProcess = null;
  return { ok: true, message: "Crucix stopped" };
}

/* ── Data Fetching ─────────────────────────────────────────────────────── */

export async function fetchCrucixData(): Promise<CrucixSweepData | null> {
  const now = Date.now();
  // Cache for 60 seconds
  if (lastSweepData && now - lastFetchTime < 60_000) {
    return lastSweepData;
  }

  try {
    const res = await fetch(`${CRUCIX_API}/api/status`);
    if (!res.ok) {
      return lastSweepData;
    }
    const data = (await res.json()) as CrucixSweepData;
    lastSweepData = data;
    lastFetchTime = now;
    return data;
  } catch {
    // Crucix not available — return cached data
    return lastSweepData;
  }
}

/* ── Intelligence Bus Integration ──────────────────────────────────────── */

export function crucixToIntelEvents(data: CrucixSweepData): Array<{
  type: string;
  payload: Record<string, unknown>;
  source: string;
}> {
  const events: Array<{ type: string; payload: Record<string, unknown>; source: string }> = [];

  // Convert FLASH/PRIORITY alerts to anomaly.detected events
  if (data.alerts) {
    for (const alert of data.alerts) {
      if (alert.tier === "FLASH" || alert.tier === "PRIORITY") {
        events.push({
          type: "anomaly.detected",
          payload: {
            tier: alert.tier,
            message: alert.message,
            source: alert.source,
            timestamp: data.sweepTime ?? new Date().toISOString(),
          },
          source: "crucix",
        });
      }
    }
  }

  // Convert conflict events
  if (data.conflicts) {
    for (const conflict of data.conflicts) {
      if (conflict.fatalities > 0) {
        events.push({
          type: "world.conflict",
          payload: {
            country: conflict.country,
            event: conflict.event,
            fatalities: conflict.fatalities,
            date: conflict.date,
          },
          source: "crucix",
        });
      }
    }
  }

  // Convert economic changes
  if (data.economic) {
    for (const indicator of data.economic) {
      if (Math.abs(indicator.change) > 2) {
        events.push({
          type: "economy.crisis",
          payload: {
            indicator: indicator.indicator,
            value: indicator.value,
            change: indicator.change,
          },
          source: "crucix",
        });
      }
    }
  }

  return events;
}

/* ── Status ─────────────────────────────────────────────────────────────── */

export function getCrucixStatus(): {
  installed: boolean;
  running: boolean;
  port: number;
  lastSweep: string | null;
  sourceCount: number;
} {
  return {
    installed: true, // Will be checked async
    running: crucixProcess !== null,
    port: CRUCIX_PORT,
    lastSweep: lastSweepData?.sweepTime ?? null,
    sourceCount: lastSweepData?.sourceCount ?? 0,
  };
}
