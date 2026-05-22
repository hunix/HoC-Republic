/**
 * Paperclip Company OS — Gateway RPC Handlers
 *
 * Proxies requests to the Paperclip server running on :4100.
 * When Paperclip is not running (vendor repo not cloned), all handlers
 * return graceful stub responses rather than erroring.
 */

import { ErrorCodes, errorShape } from "../protocol/index.js";
import { registryRegister } from "./handler-registry.js";
import { defineHandlers, toHandlerMap } from "./types.js";

const PAPERCLIP_API = "http://localhost:4100";

async function paperclipRpc(method: string, params: unknown = {}): Promise<unknown> {
  const res = await fetch(`${PAPERCLIP_API}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) { throw new Error(`Paperclip HTTP ${res.status}`); }
  const json = await res.json() as { result?: unknown; error?: { message: string } };
  if (json.error) { throw new Error(json.error.message); }
  return json.result;
}

async function safeRpc(method: string, params: unknown = {}) {
  try {
    return await paperclipRpc(method, params);
  } catch {
    return null; // Paperclip not running — stub response
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

const paperclipDescriptors = defineHandlers({
  // ── Companies ───────────────────────────────────────────────────────────────

  "paperclip.companies.list": {
    scope: "read",
    handler: async ({ respond }) => {
      const result = await safeRpc("companies.list");
      respond(true, { ok: true, companies: result ?? [], stub: result === null }, undefined);
    },
  },

  "paperclip.companies.create": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { name?: string; description?: string; maxTokenBudget?: number } | undefined;
      const name = String(p?.name ?? "").trim();
      if (!name) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
        return;
      }
      const result = await safeRpc("companies.create", { name, description: p?.description, maxTokenBudget: p?.maxTokenBudget });
      respond(true, { ok: true, company: result, stub: result === null }, undefined);
    },
  },

  "paperclip.companies.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { companyId?: string } | undefined;
      const companyId = String(p?.companyId ?? "").trim();
      if (!companyId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "companyId required"));
        return;
      }
      const result = await safeRpc("companies.get", { companyId });
      respond(true, { ok: true, company: result ?? null, stub: result === null }, undefined);
    },
  },

  // ── Org Chart ────────────────────────────────────────────────────────────────

  "paperclip.orgchart.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { companyId?: string } | undefined;
      const companyId = String(p?.companyId ?? "").trim();
      const result = await safeRpc("orgchart.get", { companyId: companyId || undefined });
      respond(true, { ok: true, nodes: (result as { nodes?: unknown[] } | null)?.nodes ?? [], edges: (result as { edges?: unknown[] } | null)?.edges ?? [], stub: result === null }, undefined);
    },
  },

  "paperclip.orgchart.add_employee": {
    scope: "admin",
    handler: async ({ params, respond }) => {
      const p = params as { companyId?: string; citizenId?: string; role?: string; reportsTo?: string } | undefined;
      if (!p?.companyId || !p?.citizenId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "companyId and citizenId required"));
        return;
      }
      const result = await safeRpc("orgchart.add_employee", p);
      respond(true, { ok: true, employee: result, stub: result === null }, undefined);
    },
  },

  // ── Tickets ──────────────────────────────────────────────────────────────────

  "paperclip.tickets.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { companyId?: string; assigneeId?: string; status?: string; limit?: number } | undefined;
      const result = await safeRpc("tickets.list", {
        companyId: p?.companyId,
        assigneeId: p?.assigneeId,
        status: p?.status,
        limit: Math.min(100, Math.max(1, Number(p?.limit) || 50)),
      });
      respond(true, { ok: true, tickets: (result as { tickets?: unknown[] } | null)?.tickets ?? result ?? [], stub: result === null }, undefined);
    },
  },

  "paperclip.tickets.create": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as {
        title?: string; description?: string; companyId?: string;
        assigneeId?: string; priority?: string; dueDate?: string;
      } | undefined;
      const title = String(p?.title ?? "").trim();
      if (!title) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title required"));
        return;
      }
      const result = await safeRpc("tickets.create", p);
      respond(true, { ok: true, ticket: result, stub: result === null }, undefined);
    },
  },

  "paperclip.tickets.update": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { ticketId?: string; status?: string; progress?: number; notes?: string } | undefined;
      if (!p?.ticketId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "ticketId required"));
        return;
      }
      const result = await safeRpc("tickets.update", p);
      respond(true, { ok: true, ticket: result, stub: result === null }, undefined);
    },
  },

  "paperclip.tickets.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { ticketId?: string } | undefined;
      if (!p?.ticketId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "ticketId required"));
        return;
      }
      const result = await safeRpc("tickets.get", { ticketId: p.ticketId });
      respond(true, { ok: true, ticket: result, stub: result === null }, undefined);
    },
  },

  // ── Heartbeat ────────────────────────────────────────────────────────────────

  "paperclip.heartbeat.trigger": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { agentId?: string } | undefined;
      if (!p?.agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId required"));
        return;
      }
      const result = await safeRpc("heartbeat.trigger", { agentId: p.agentId });
      respond(true, { ok: true, heartbeat: result, stub: result === null }, undefined);
    },
  },

  // ── Budget ───────────────────────────────────────────────────────────────────

  "paperclip.budget.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { companyId?: string } | undefined;
      const result = await safeRpc("budget.get", { companyId: p?.companyId });
      respond(true, { ok: true, budget: result ?? { tokens: 0, used: 0, remaining: 0, stub: true }, stub: result === null }, undefined);
    },
  },

  // ── Status ───────────────────────────────────────────────────────────────────

  "paperclip.status": {
    scope: "read",
    handler: async ({ respond }) => {
      let online = false;
      try {
        const res = await fetch(`${PAPERCLIP_API}/health`, { signal: AbortSignal.timeout(2_000) });
        online = res.ok;
      } catch { /* offline */ }
      respond(true, {
        ok: true,
        online,
        port: 4100,
        setupRequired: !online,
        setupHint: online ? null : "git clone https://github.com/paperclipai/paperclip plugins/hoc-plugin-paperclip/vendor/paperclip",
      }, undefined);
    },
  },
});

registryRegister(paperclipDescriptors);
export const paperclipHandlers = toHandlerMap(paperclipDescriptors);
