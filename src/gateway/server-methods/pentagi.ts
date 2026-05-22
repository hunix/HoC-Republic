/**
 * PentAGI Red Team — Gateway RPC Handlers
 *
 * Proxies requests to the PentAGI REST+GraphQL API running on :8081 (via Docker Compose).
 * When PentAGI is not running, all handlers return graceful stub responses.
 *
 * PentAGI multi-agent roles:
 *   - Researcher: gathers OSINT, CVEs, and target data
 *   - Developer: writes exploit code and scripts
 *   - Executor: runs tools in the Docker sandbox
 *
 * Tools available: nmap, metasploit, sqlmap, gobuster, ffuf, nikto,
 *                  hydra, john, hashcat, burpsuite, wfuzz, and more
 */

import { ErrorCodes, errorShape } from "../protocol/index.js";
import { registryRegister } from "./handler-registry.js";
import { defineHandlers, toHandlerMap } from "./types.js";

const PENTAGI_API = "http://localhost:8081";

async function pentagiGet(endpoint: string): Promise<unknown> {
  const res = await fetch(`${PENTAGI_API}${endpoint}`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) { throw new Error(`PentAGI ${res.status}: ${endpoint}`); }
  return res.json();
}

async function pentagiPost(endpoint: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${PENTAGI_API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) { throw new Error(`PentAGI ${res.status}: ${endpoint}`); }
  return res.json();
}

async function pentagiDelete(endpoint: string): Promise<unknown> {
  const res = await fetch(`${PENTAGI_API}${endpoint}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) { throw new Error(`PentAGI ${res.status}: ${endpoint}`); }
  return { ok: true };
}

async function safeGet(endpoint: string) {
  try { return await pentagiGet(endpoint); } catch { return null; }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

const pentagiDescriptors = defineHandlers({
  // ── Flows ────────────────────────────────────────────────────────────────────

  "pentagi.flows.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { status?: string; limit?: number } | undefined;
      const result = await safeGet("/api/v1/flows");
      const flows = (result as unknown[] | null) ?? [];
      const filtered = p?.status ? flows.filter((f) => (f as Record<string, unknown>).status === p.status) : flows;
      respond(true, { ok: true, flows: filtered.slice(0, Math.min(100, Number(p?.limit) || 50)), total: filtered.length, stub: result === null }, undefined);
    },
  },

  "pentagi.flows.create": {
    scope: "admin",
    handler: async ({ params, respond }) => {
      const p = params as {
        target?: string;
        objectives?: string;
        depth?: string;
        model?: string;
      } | undefined;
      const target = String(p?.target ?? "").trim();
      const objectives = String(p?.objectives ?? "").trim();
      if (!target || !objectives) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target and objectives are required"));
        return;
      }
      try {
        const result = await pentagiPost("/api/v1/flows", {
          target,
          objectives,
          depth: p?.depth ?? "standard",
          model: p?.model ?? "gpt-4o",
        });
        respond(true, { ok: true, flow: result }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : "PentAGI not available"));
      }
    },
  },

  "pentagi.flows.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { flowId?: string } | undefined;
      const flowId = String(p?.flowId ?? "").trim();
      if (!flowId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "flowId required"));
        return;
      }
      const result = await safeGet(`/api/v1/flows/${flowId}`);
      respond(true, { ok: true, flow: result, stub: result === null }, undefined);
    },
  },

  "pentagi.flows.stop": {
    scope: "admin",
    handler: async ({ params, respond }) => {
      const p = params as { flowId?: string } | undefined;
      const flowId = String(p?.flowId ?? "").trim();
      if (!flowId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "flowId required"));
        return;
      }
      try {
        await pentagiDelete(`/api/v1/flows/${flowId}`);
        respond(true, { ok: true, stopped: true }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : "Failed to stop flow"));
      }
    },
  },

  "pentagi.flows.logs": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { flowId?: string; limit?: number } | undefined;
      const flowId = String(p?.flowId ?? "").trim();
      if (!flowId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "flowId required"));
        return;
      }
      const result = await safeGet(`/api/v1/flows/${flowId}/logs`);
      const logs = (result as unknown[] | null) ?? [];
      respond(true, { ok: true, logs: logs.slice(0, Math.min(500, Number(p?.limit) || 100)), stub: result === null }, undefined);
    },
  },

  // ── Reports ──────────────────────────────────────────────────────────────────

  "pentagi.reports.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { flowId?: string } | undefined;
      const flowId = String(p?.flowId ?? "").trim();
      if (!flowId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "flowId required"));
        return;
      }
      const result = await safeGet(`/api/v1/flows/${flowId}/report`);
      respond(true, { ok: true, report: result, stub: result === null }, undefined);
    },
  },

  "pentagi.reports.list": {
    scope: "read",
    handler: async ({ respond }) => {
      const result = await safeGet("/api/v1/reports");
      respond(true, { ok: true, reports: (result as unknown[] | null) ?? [], stub: result === null }, undefined);
    },
  },

  // ── Assistants ───────────────────────────────────────────────────────────────

  "pentagi.assistants.list": {
    scope: "read",
    handler: async ({ respond }) => {
      const result = await safeGet("/api/v1/assistants");
      respond(true, { ok: true, assistants: (result as unknown[] | null) ?? [], stub: result === null }, undefined);
    },
  },

  // ── Tools ────────────────────────────────────────────────────────────────────

  "pentagi.tools.list": {
    scope: "read",
    handler: async ({ respond }) => {
      // PentAGI doesn't have a dynamic tool list endpoint — return known tools
      const tools = [
        { name: "nmap", category: "recon", description: "Network port scanner" },
        { name: "metasploit", category: "exploit", description: "Exploitation framework" },
        { name: "sqlmap", category: "injection", description: "SQL injection detector" },
        { name: "gobuster", category: "fuzzing", description: "Directory/DNS brute-forcing" },
        { name: "ffuf", category: "fuzzing", description: "Fast web fuzzer" },
        { name: "nikto", category: "web", description: "Web server scanner" },
        { name: "hydra", category: "bruteforce", description: "Login brute-force" },
        { name: "john", category: "crypto", description: "Password cracker (John the Ripper)" },
        { name: "hashcat", category: "crypto", description: "GPU hash cracker" },
        { name: "wfuzz", category: "fuzzing", description: "Web fuzzer" },
        { name: "sublist3r", category: "recon", description: "Subdomain enumerator" },
        { name: "amass", category: "recon", description: "OSINT network mapper" },
        { name: "theHarvester", category: "osint", description: "Email/host gathering" },
        { name: "masscan", category: "recon", description: "High-speed port scanner" },
        { name: "nuclei", category: "vuln", description: "Template-based vulnerability scanner" },
        { name: "wapiti", category: "web", description: "Web application auditor" },
        { name: "davtest", category: "web", description: "WebDAV scanner" },
        { name: "sslscan", category: "crypto", description: "SSL/TLS configuration tester" },
        { name: "enum4linux", category: "recon", description: "Windows/Samba enumerator" },
        { name: "burpsuite", category: "web", description: "Web proxy and scanner" },
        { name: "aircrack-ng", category: "wireless", description: "WiFi security auditing" },
        { name: "tcpdump", category: "network", description: "Packet capture" },
      ];
      respond(true, { ok: true, tools, total: tools.length }, undefined);
    },
  },

  // ── Status ───────────────────────────────────────────────────────────────────

  "pentagi.status": {
    scope: "read",
    handler: async ({ respond }) => {
      let online = false;
      try {
        const res = await fetch(`${PENTAGI_API}/api/v1/health`, { signal: AbortSignal.timeout(2_000) });
        online = res.ok;
      } catch { /* offline */ }
      respond(true, {
        ok: true,
        online,
        api: PENTAGI_API,
        setupRequired: !online,
        setupHint: online ? null : "cd plugins/hoc-plugin-pentagi/vendor/pentagi && docker compose up -d",
      }, undefined);
    },
  },
});

registryRegister(pentagiDescriptors);
export const pentagiHandlers = toHandlerMap(pentagiDescriptors);
