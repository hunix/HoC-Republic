/**
 * Memory Gateway RPC Handlers
 *
 * Exposes the Sovereign Memory Engine to all connected clients via JSON-RPC:
 *   memory.store      — persist a memory item
 *   memory.search     — semantic BM25 search
 *   memory.recall     — retrieve formatted context for prompt injection
 *   memory.list       — paginated listing of memories
 *   memory.forget     — delete a specific memory
 *   memory.stats      — per-scope statistics
 *   memory.sessions   — cross-channel sessions by scope
 *   memory.graph      — knowledge graph nodes/edges for a scope
 */

import type {
  MemoryStoreParams,
  MemorySearchParams,
  MemoryRecallParams,
  MemoryListParams,
} from "./rpc-params.js";
import {
  forgetMemory,
  getAllSessions,
  getGraphEdges,
  getGraphNodes,
  getMemoryStats,
  getSessionsByScope,
  listMemories,
  recallContext,
  registerChannelSession,
  searchMemory,
  storeMemory,
} from "../../intelligence/sovereign-memory.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { registryRegister } from "./handler-registry.js";
import { defineHandlers, toHandlerMap } from "./types.js";

const memoryDescriptors = defineHandlers({
  "memory.store": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as MemoryStoreParams | undefined;

      const scope = String(p?.scope ?? "").trim();
      const content = String(p?.content ?? "").trim();

      if (!scope || !content) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "scope and content required"),
        );
        return;
      }
      if (content.length > 8000) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "content too long (max 8000 chars)"),
        );
        return;
      }

      const id = await storeMemory({
        scope,
        content,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        memoryType: (p?.memoryType as any) ?? "fact",
        sessionKey: typeof p?.sessionKey === "string" ? p.sessionKey : undefined,
        channel: typeof p?.channel === "string" ? p.channel : undefined,
        importance: typeof p?.importance === "number" ? p.importance : 0.5,
      });

      respond(true, { ok: true, id }, undefined);
    },
  },

  "memory.search": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as MemorySearchParams | undefined;

      const query = String(p?.query ?? "").trim();
      if (!query) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
        return;
      }

      const results = await searchMemory({
        query,
        scope: typeof p?.scope === "string" ? p.scope : undefined,
        limit: typeof p?.limit === "number" ? Math.min(50, Math.max(1, p.limit)) : 10,
        minImportance: typeof p?.minImportance === "number" ? p.minImportance : undefined,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        memoryType: (p?.memoryType as any) ?? undefined,
      });

      respond(true, { results, total: results.length }, undefined);
    },
  },

  "memory.recall": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as MemoryRecallParams | undefined;

      const scope = String(p?.scope ?? "").trim();
      const query = String(p?.query ?? "").trim();

      if (!scope || !query) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "scope and query required"),
        );
        return;
      }

      const result = await recallContext({
        scope,
        query,
        maxTokens: typeof p?.maxTokens === "number" ? p.maxTokens : 1500,
        limit: typeof p?.limit === "number" ? p.limit : 8,
      });

      respond(true, result, undefined);
    },
  },

  "memory.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as MemoryListParams | undefined;

      const result = await listMemories({
        scope: typeof p?.scope === "string" ? p.scope : undefined,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        memoryType: (p?.memoryType as any) ?? undefined,
        limit: typeof p?.limit === "number" ? p.limit : 20,
        offset: typeof p?.offset === "number" ? p.offset : 0,
      });

      respond(true, result, undefined);
    },
  },

  "memory.forget": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { id?: string } | undefined;
      const id = String(p?.id ?? "").trim();
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const deleted = await forgetMemory(id);
      respond(true, { ok: true, deleted }, undefined);
    },
  },

  "memory.stats": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { scope?: string } | undefined;
      const stats = await getMemoryStats(typeof p?.scope === "string" ? p.scope : undefined);
      respond(true, { stats }, undefined);
    },
  },

  "memory.sessions": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { scope?: string } | undefined;
      const scope = typeof p?.scope === "string" ? p.scope.trim() : undefined;
      const sessions = scope ? await getSessionsByScope(scope) : await getAllSessions();
      respond(true, { sessions }, undefined);
    },
  },

  "memory.sessions.register": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as
        | {
            scope?: string;
            sessionKey?: string;
            channel?: string;
            displayName?: string;
          }
        | undefined;

      const scope = String(p?.scope ?? "").trim();
      const sessionKey = String(p?.sessionKey ?? "").trim();
      const channel = String(p?.channel ?? "webchat").trim();

      if (!scope || !sessionKey) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "scope and sessionKey required"),
        );
        return;
      }

      const session = await registerChannelSession({
        scope,
        sessionKey,
        channel: channel,
        displayName: typeof p?.displayName === "string" ? p.displayName : undefined,
      });

      respond(true, { ok: true, session }, undefined);
    },
  },

  "memory.graph": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { scope?: string } | undefined;
      const scope = String(p?.scope ?? "").trim();
      if (!scope) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scope required"));
        return;
      }
      const [nodes, edges] = await Promise.all([getGraphNodes(scope), getGraphEdges(scope)]);
      respond(true, { nodes, edges, nodeCount: nodes.length, edgeCount: edges.length }, undefined);
    },
  },
});

registryRegister(memoryDescriptors);
export const memoryHandlers = toHandlerMap(memoryDescriptors);

// ── mem0 Citizen Long-Term Memory Handlers ────────────────────────────────────
import {
  mem0GetAll,
  mem0Search,
  mem0Inject,
  mem0Delete,
  mem0Stats,
  type Mem0Category,
} from "../../republic/mem0-memory.js";

const mem0Descriptors = defineHandlers({
  /** List all long-term facts for a citizen (paginated) */
  "memory.facts.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { citizenId?: string; limit?: number; offset?: number } | undefined;
      const citizenId = String(p?.citizenId ?? "").trim();
      if (!citizenId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
        return;
      }
      const limit = Math.min(200, Math.max(1, Number(p?.limit) || 50));
      const offset = Math.max(0, Number(p?.offset) || 0);
      const all = mem0GetAll(citizenId);
      const page = all.slice(offset, offset + limit);
      respond(
        true,
        {
          ok: true,
          facts: page.map((f) => ({ ...f, embedding: undefined })), // strip embedding from wire
          total: all.length,
          offset,
          limit,
        },
        undefined,
      );
    },
  },

  /** Semantic search over a citizen's long-term facts */
  "memory.facts.search": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { citizenId?: string; query?: string; topK?: number } | undefined;
      const citizenId = String(p?.citizenId ?? "").trim();
      const query = String(p?.query ?? "").trim();
      if (!citizenId || !query) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and query required"),
        );
        return;
      }
      const topK = Math.min(50, Math.max(1, Number(p?.topK) || 10));
      const results = await mem0Search(citizenId, query, topK, 0.0);
      respond(
        true,
        {
          ok: true,
          results: results.map((r) => ({
            ...r.fact,
            embedding: undefined,
            score: r.score,
          })),
          total: results.length,
        },
        undefined,
      );
    },
  },

  /** Manually inject a fact into a citizen's long-term memory (admin) */
  "memory.facts.add": {
    scope: "admin",
    handler: async ({ params, respond }) => {
      const p = params as {
        citizenId?: string;
        memory?: string;
        categories?: string[];
        importance?: number;
      } | undefined;
      const citizenId = String(p?.citizenId ?? "").trim();
      const memory = String(p?.memory ?? "").trim();
      if (!citizenId || !memory) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and memory required"),
        );
        return;
      }
      const categories = (Array.isArray(p?.categories) ? p.categories : ["general"]) as Mem0Category[];
      const importance = Math.max(0, Math.min(1, Number(p?.importance) || 0.7));
      const fact = await mem0Inject(citizenId, memory, categories, importance, "manual");
      respond(true, { ok: true, fact: { ...fact, embedding: undefined } }, undefined);
    },
  },

  /** Delete a specific long-term memory fact */
  "memory.facts.delete": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; factId?: string } | undefined;
      const citizenId = String(p?.citizenId ?? "").trim();
      const factId = String(p?.factId ?? "").trim();
      if (!citizenId || !factId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and factId required"),
        );
        return;
      }
      const deleted = mem0Delete(citizenId, factId);
      respond(true, { ok: true, deleted }, undefined);
    },
  },

  /** Global mem0 system statistics */
  "memory.facts.stats": {
    scope: "read",
    handler: ({ params: _params, respond }) => {
      const stats = mem0Stats();
      respond(true, { ok: true, ...stats }, undefined);
    },
  },
});

registryRegister(mem0Descriptors);
export const mem0MemoryHandlers = toHandlerMap(mem0Descriptors);

