/**
 * Paperclip Company OS Plugin — Entry Point
 *
 * Integrates https://github.com/paperclipai/paperclip into HoC.
 *
 * Paperclip is an AI Company OS that provides:
 *   - Companies: top-level business entities
 *   - Org Charts: hierarchical reporting structures
 *   - Tickets: atomic units of work assigned to AI employees
 *   - Heartbeats: scheduled check-ins where agents review goals/tasks
 *   - Cost Control: token budgets per company/agent
 *   - Governance: approval gates for sensitive operations
 *
 * Integration strategy:
 *   1. This plugin manages a Paperclip server process (port 4100)
 *   2. HoC citizens are registered as Paperclip employees via its openclaw-gateway adapter
 *   3. Gateway RPCs (paperclip.*) proxy to Paperclip's JSON-RPC API
 *   4. The intelligence bus bridges citizen cognitive cycles → Paperclip heartbeats
 *
 * Setup (one-time):
 *   cd plugins/hoc-plugin-paperclip
 *   git clone https://github.com/paperclipai/paperclip vendor/paperclip
 *   cd vendor/paperclip && pnpm install && pnpm build
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import type { HoCPluginContext } from "../../src/republic/hoc-plugin-types.ts";

const PAPERCLIP_PORT = 4100;
const VENDOR_DIR = path.join(import.meta.dirname, "vendor", "paperclip");
const PAPERCLIP_SERVER = path.join(VENDOR_DIR, "dist", "server.js");

let serverProcess: ChildProcess | null = null;
let _isReady = false;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function paperclipRpc(method: string, params: unknown = {}): Promise<unknown> {
  const response = await fetch(`http://localhost:${PAPERCLIP_PORT}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Paperclip RPC error: ${response.status}`);
  }
  const json = await response.json() as { result?: unknown; error?: { message: string } };
  if (json.error) {
    throw new Error(`Paperclip RPC: ${json.error.message}`);
  }
  return json.result;
}

async function waitForServer(maxAttempts = 20): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await fetch(`http://localhost:${PAPERCLIP_PORT}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
  return false;
}

// ─── Plugin Lifecycle ─────────────────────────────────────────────────────────

export async function init(ctx: HoCPluginContext): Promise<void> {
  const log = ctx.logger;

  // Check if vendor repo is cloned
  if (!existsSync(VENDOR_DIR)) {
    log.warn("Paperclip vendor dir not found. Plugin running in stub mode. Run: cd plugins/hoc-plugin-paperclip && git clone https://github.com/paperclipai/paperclip vendor/paperclip");
    _registerStubTools(ctx);
    return;
  }

  // Check if built
  if (!existsSync(PAPERCLIP_SERVER)) {
    log.warn("Paperclip not built — running in stub mode. Run: cd vendor/paperclip && pnpm install && pnpm build");
    _registerStubTools(ctx);
    return;
  }

  // Try to start the server
  try {
    serverProcess = spawn("node", [PAPERCLIP_SERVER, "--port", String(PAPERCLIP_PORT)], {
      cwd: VENDOR_DIR,
      env: {
        ...process.env,
        PORT: String(PAPERCLIP_PORT),
        HOC_GATEWAY_URL: "ws://localhost:3000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout?.on("data", (d: Buffer) => log.debug(`[paperclip] ${d.toString().trim()}`));
    serverProcess.stderr?.on("data", (d: Buffer) => log.warn(`[paperclip] ${d.toString().trim()}`));
    serverProcess.on("exit", (code) => {
      log.info(`Paperclip server exited with code ${code}`);
      _isReady = false;
    });

    _isReady = await waitForServer();
    if (_isReady) {
      log.info(`Paperclip Company OS running on port ${PAPERCLIP_PORT}`);
      _registerLiveTools(ctx);

      // Bridge: citizen cognitive cycles → Paperclip heartbeats
      ctx.on("citizen.cognitive_cycle", async (event: unknown) => {
        const { citizenId } = event as { citizenId: string };
        try {
          await paperclipRpc("heartbeat.trigger", { agentId: citizenId });
        } catch {
          // Ignore — heartbeat failures are non-critical
        }
      });
    } else {
      log.warn("Paperclip server did not become ready in time");
      _registerStubTools(ctx);
    }
  } catch (err) {
    log.error(`Failed to start Paperclip server: ${err instanceof Error ? err.message : String(err)}`);
    _registerStubTools(ctx);
  }
}

export async function shutdown(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
    _isReady = false;
  }
}

export async function healthCheck(): Promise<{ healthy: boolean; detail: string }> {
  if (!_isReady) {
    return { healthy: false, detail: "Paperclip not running (stub mode)" };
  }
  try {
    await fetch(`http://localhost:${PAPERCLIP_PORT}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return { healthy: true, detail: `Paperclip running on :${PAPERCLIP_PORT}` };
  } catch {
    return { healthy: false, detail: "Paperclip health check failed" };
  }
}

// ─── Tool Registration ────────────────────────────────────────────────────────

function _registerLiveTools(ctx: HoCPluginContext): void {
  ctx.registerTool(
    "paperclip_create_ticket",
    "Create a work ticket in the Company OS for a specific task or goal",
    {
      type: "object",
      properties: {
        title: { type: "string", description: "Ticket title" },
        description: { type: "string", description: "What needs to be done" },
        assignee_citizen_id: { type: "string", description: "Citizen ID to assign the ticket to" },
        company_id: { type: "string", description: "Company ID " },
        priority: { type: "string", description: "low | medium | high | critical" },
      },
      required: ["title"],
    },
    async (args: Record<string, unknown>) => {
      if (!_isReady) { return { error: "Paperclip not available" }; }
      return await paperclipRpc("tickets.create", args);
    },
  );

  ctx.registerTool(
    "paperclip_list_my_tickets",
    "List all tickets assigned to this citizen in the Company OS",
    {
      type: "object",
      properties: {
        citizen_id: { type: "string", description: "Citizen ID to retrieve tickets for" },
      },
      required: ["citizen_id"],
    },
    async (args: Record<string, unknown>) => {
      if (!_isReady) { return { tickets: [], error: "Paperclip not available" }; }
      return await paperclipRpc("tickets.list", { assigneeId: args.citizen_id });
    },
  );
}

function _registerStubTools(ctx: HoCPluginContext): void {
  ctx.registerTool(
    "paperclip_create_ticket",
    "Create a work ticket in the Company OS (stub mode — not active until vendor repo cloned)",
    { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    async () => ({ error: "Paperclip not available — vendor repo not cloned" }),
  );
}

export function getStatus(): { ready: boolean; port: number; vendorExists: boolean } {
  return {
    ready: _isReady,
    port: PAPERCLIP_PORT,
    vendorExists: existsSync(VENDOR_DIR),
  };
}
