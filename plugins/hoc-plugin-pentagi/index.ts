/**
 * PentAGI Red Team Plugin — Entry Point
 *
 * Integrates https://github.com/vxcontrol/pentagi into HoC.
 *
 * PentAGI is an autonomous AI penetration testing system that provides:
 *   - Flows: pentest operations against specified targets
 *   - Multi-agent roles: Researcher, Developer, ExecutorAgent
 *   - 20+ tools: nmap, metasploit, sqlmap, gobuster, ffuf, nikto, and more
 *   - Docker sandbox: all operations isolated from host
 *   - Smart memory: long-term storage of techniques and findings
 *   - Reports: comprehensive vulnerability reports with exploitation guides
 *
 * Integration strategy:
 *   1. PentAGI runs via Docker Compose (port 8081 for API)
 *   2. Gateway RPCs (pentagi.*) proxy to PentAGI's REST+GraphQL API
 *   3. Citizens with "security" or "hacker" specialization can dispatch scans
 *   4. Findings published to the intelligence bus for other systems
 *
 * Setup (one-time):
 *   cd plugins/hoc-plugin-pentagi
 *   git clone https://github.com/vxcontrol/pentagi vendor/pentagi
 *   cd vendor/pentagi && docker compose up -d
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import type { HoCPluginContext } from "../../src/republic/hoc-plugin-types.ts";

const PENTAGI_API = "http://localhost:8081";
const VENDOR_DIR = path.join(import.meta.dirname, "vendor", "pentagi");
const COMPOSE_FILE = path.join(VENDOR_DIR, "docker-compose.yml");

let composeProcess: ChildProcess | null = null;
let _isReady = false;

// ─── API helpers ──────────────────────────────────────────────────────────────

async function pentagiGet(endpoint: string): Promise<unknown> {
  const res = await fetch(`${PENTAGI_API}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) { throw new Error(`PentAGI API ${res.status}: ${endpoint}`); }
  return res.json();
}

async function pentagiPost(endpoint: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${PENTAGI_API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) { throw new Error(`PentAGI API ${res.status}: ${endpoint}`); }
  return res.json();
}

async function waitForApi(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await fetch(`${PENTAGI_API}/api/v1/health`, { signal: AbortSignal.timeout(2_000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  return false;
}

// ─── Plugin Lifecycle ─────────────────────────────────────────────────────────

export async function init(ctx: HoCPluginContext): Promise<void> {
  const log = ctx.logger;

  if (!existsSync(VENDOR_DIR)) {
    log.warn("PentAGI vendor dir not found — running in stub mode. Run: cd plugins/hoc-plugin-pentagi && git clone https://github.com/vxcontrol/pentagi vendor/pentagi");
    _registerStubTools(ctx);
    return;
  }

  if (!existsSync(COMPOSE_FILE)) {
    log.warn("PentAGI docker-compose.yml not found — stub mode");
    _registerStubTools(ctx);
    return;
  }

  // Check if already running
  try {
    await fetch(`${PENTAGI_API}/api/v1/health`, { signal: AbortSignal.timeout(2_000) });
    _isReady = true;
    log.info(`PentAGI already running at ${PENTAGI_API}`);
    _registerLiveTools(ctx);
    return;
  } catch {
    // Not yet up — start it
  }

  // Start via Docker Compose
  try {
    composeProcess = spawn("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"], {
      cwd: VENDOR_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
    composeProcess.stdout?.on("data", (d: Buffer) => log.debug(`[pentagi] ${d.toString().trim()}`));
    composeProcess.stderr?.on("data", (d: Buffer) => log.debug(`[pentagi] ${d.toString().trim()}`));

    await new Promise<void>((resolve, reject) => {
      composeProcess!.on("exit", (code) => {
        if (code === 0) { resolve(); } else { reject(new Error(`docker compose exited with code ${code}`)); }
      });
    });

    _isReady = await waitForApi();
    if (_isReady) {
      log.info(`PentAGI Red Team started at ${PENTAGI_API}`);
      _registerLiveTools(ctx);
      return;
    }
    log.warn("PentAGI API did not become ready in time");
    _registerStubTools(ctx);
  } catch (err) {
    log.error(`Failed to start PentAGI: ${err instanceof Error ? err.message : String(err)}`);
    _registerStubTools(ctx);
  }
}

export async function shutdown(): Promise<void> {
  if (existsSync(COMPOSE_FILE)) {
    try {
      spawn("docker", ["compose", "-f", COMPOSE_FILE, "down"], {
        cwd: VENDOR_DIR,
        stdio: "ignore",
      });
    } catch { /* ignore */ }
  }
  _isReady = false;
}

export async function healthCheck(): Promise<{ healthy: boolean; detail: string }> {
  if (!_isReady) { return { healthy: false, detail: "PentAGI not running (stub mode)" }; }
  try {
    await fetch(`${PENTAGI_API}/api/v1/health`, { signal: AbortSignal.timeout(3_000) });
    return { healthy: true, detail: `PentAGI running on :8081` };
  } catch {
    return { healthy: false, detail: "PentAGI health check failed" };
  }
}

// ─── Tool Registration ────────────────────────────────────────────────────────

function _registerLiveTools(ctx: HoCPluginContext): void {
  ctx.registerTool(
    "pentagi_launch_scan",
    "Launch an autonomous penetration test / security scan against a target. Returns a flow ID to track progress.",
    {
      type: "object",
      properties: {
        target: { type: "string", description: "Target URL, IP, or domain to test" },
        objectives: { type: "string", description: "What to look for (e.g., SQL injection, XSS, open ports)" },
        depth: { type: "string", description: "reconnaissance | standard | deep" },
      },
      required: ["target", "objectives"],
    },
    async (args: Record<string, unknown>) => {
      if (!_isReady) { return { error: "PentAGI not available" }; }
      const flow = await pentagiPost("/api/v1/flows", {
        target: args.target,
        objectives: args.objectives,
        depth: args.depth ?? "standard",
      });
      // Publish to intelligence bus via plugin context
      ctx.emit("pentagi.flow.created", { flow });
      return flow;
    },
  );

  ctx.registerTool(
    "pentagi_scan_status",
    "Check the status and live agent output of a running security scan",
    {
      type: "object",
      properties: {
        flow_id: { type: "string", description: "Flow ID from pentagi_launch_scan" },
      },
      required: ["flow_id"],
    },
    async (args: Record<string, unknown>) => {
      if (!_isReady) { return { error: "PentAGI not available" }; }
      return await pentagiGet(`/api/v1/flows/${args.flow_id as string}`);
    },
  );

  ctx.registerTool(
    "pentagi_get_report",
    "Retrieve the vulnerability report for a completed security scan",
    {
      type: "object",
      properties: {
        flow_id: { type: "string", description: "Flow ID from pentagi_launch_scan" },
      },
      required: ["flow_id"],
    },
    async (args: Record<string, unknown>) => {
      if (!_isReady) { return { error: "PentAGI not available" }; }
      return await pentagiGet(`/api/v1/flows/${args.flow_id as string}/report`);
    },
  );
}

function _registerStubTools(ctx: HoCPluginContext): void {
  for (const name of ["pentagi_launch_scan", "pentagi_scan_status", "pentagi_get_report"]) {
    ctx.registerTool(
      name,
      `${name} (stub — PentAGI vendor repo not cloned)`,
      { type: "object", properties: {}, required: [] },
      async () => ({ error: "PentAGI not available — vendor repo not cloned. See PLUGIN_SETUP.md" }),
    );
  }
}

export function getStatus(): { ready: boolean; api: string; vendorExists: boolean } {
  return { ready: _isReady, api: PENTAGI_API, vendorExists: existsSync(VENDOR_DIR) };
}
