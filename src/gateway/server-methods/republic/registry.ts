/**
 * Dynamic Registry Gateway RPC Handlers
 *
 * Exposes the Dynamic Registry system to the UI via the gateway.
 * All operations are CRUD on registry entries + search/stats.
 *
 * Methods:
 *   republic.registry.list         — List entries with filtering
 *   republic.registry.get          — Get single entry by (id, domain)
 *   republic.registry.upsert       — Create or update an entry
 *   republic.registry.remove       — Delete an entry
 *   republic.registry.search       — Full-text search
 *   republic.registry.history      — Get version history
 *   republic.registry.stats        — Aggregate statistics
 *   republic.registry.enable       — Enable/disable an entry
 *   republic.registry.export       — Export a domain as JSON
 *   republic.registry.import       — Import entries from JSON
 *   republic.registry.domains      — List all domain constants
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  registryGet,
  registryList,
  registryUpsert,
  registryRemove,
  registrySetEnabled,
  registrySearch,
  registryGetHistory,
  registryExport,
  registryImport,
  registryGetStats,
  REGISTRY_DOMAINS,
} from "../../../republic/dynamic-registry.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// Flatten metadata timestamps to top-level for the UI
function toUiEntry(e: Awaited<ReturnType<typeof registryList>>[number]) {
  return {
    id: e.id,
    domain: e.domain,
    category: e.category,
    version: e.version,
    enabled: e.enabled,
    priority: e.priority,
    data: e.data,
    metadata: e.metadata
      ? {
          tags: e.metadata.tags,
          description: e.metadata.description,
          createdBy: e.metadata.createdBy,
          source: e.metadata.source,
        }
      : undefined,
    createdAt: e.metadata?.createdAt ?? "",
    updatedAt: e.metadata?.updatedAt ?? "",
  };
}

export const registryHandlers: Partial<GatewayRequestHandlers> = {
  // ─── List entries with filtering ─────────────────────────────
  "republic.registry.list": async ({ params, respond }) => {
    const p = params as {
      domain?: string;
      category?: string;
      enabled?: boolean;
      source?: string;
      tags?: string[];
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDir?: string;
    };
    try {
      const entries = await registryList({
        domain: p.domain,
        category: p.category,
        enabled: p.enabled,
        source: p.source as "builtin" | "user" | "plugin" | "citizen" | undefined,
        tags: p.tags,
        limit: p.limit,
        offset: p.offset,
        orderBy: p.orderBy as "priority" | "updatedAt" | "id" | undefined,
        orderDir: p.orderDir as "asc" | "desc" | undefined,
      });
      const uiEntries = entries.map(toUiEntry);
      respond(true, { ok: true, entries: uiEntries, count: uiEntries.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry list failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Get single entry ────────────────────────────────────────
  "republic.registry.get": async ({ params, respond }) => {
    const p = params as { id?: string; domain?: string };
    if (!p.id || !p.domain) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id and domain required"));
      return;
    }
    try {
      const entry = await registryGet(p.id, p.domain);
      if (!entry) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Entry not found"));
        return;
      }
      respond(true, { ok: true, entry: toUiEntry(entry) }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry get failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Create or Update entry ──────────────────────────────────
  "republic.registry.upsert": async ({ params, respond }) => {
    const p = params as {
      id?: string;
      domain?: string;
      data?: unknown;
      category?: string;
      enabled?: boolean;
      priority?: number;
      metadata?: {
        tags?: string[];
        description?: string;
        createdBy?: string;
        source?: string;
      };
    };
    if (!p.id || !p.domain || p.data === undefined) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "id, domain, and data required"),
      );
      return;
    }
    try {
      const entry = await registryUpsert({
        id: p.id,
        domain: p.domain,
        data: p.data,
        category: p.category,
        enabled: p.enabled,
        priority: p.priority,
        metadata: p.metadata
          ? {
              tags: p.metadata.tags,
              description: p.metadata.description,
              createdBy: p.metadata.createdBy ?? "ui",
              source: (p.metadata.source ?? "user") as "builtin" | "user" | "plugin" | "citizen",
            }
          : { createdBy: "ui", source: "user" as const },
      });
      respond(true, { ok: true, entry: toUiEntry(entry) }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry upsert failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Remove entry ────────────────────────────────────────────
  "republic.registry.remove": async ({ params, respond }) => {
    const p = params as { id?: string; domain?: string };
    if (!p.id || !p.domain) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id and domain required"));
      return;
    }
    try {
      const removed = await registryRemove(p.id, p.domain);
      respond(true, { ok: removed }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry remove failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Enable / Disable entry ──────────────────────────────────
  "republic.registry.enable": async ({ params, respond }) => {
    const p = params as { id?: string; domain?: string; enabled?: boolean };
    if (!p.id || !p.domain || p.enabled === undefined) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "id, domain, and enabled required"),
      );
      return;
    }
    try {
      const ok = await registrySetEnabled(p.id, p.domain, p.enabled);
      respond(true, { ok }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry enable failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Full-text search ────────────────────────────────────────
  "republic.registry.search": async ({ params, respond }) => {
    const p = params as { query?: string; domain?: string; limit?: number };
    if (!p.query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    try {
      const entries = await registrySearch(p.query, {
        domain: p.domain,
        limit: p.limit,
      });
      const uiEntries = entries.map(toUiEntry);
      respond(true, { ok: true, entries: uiEntries, count: uiEntries.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry search failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Version history ─────────────────────────────────────────
  "republic.registry.history": async ({ params, respond }) => {
    const p = params as { id?: string; domain?: string; limit?: number };
    if (!p.id || !p.domain) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id and domain required"));
      return;
    }
    try {
      const history = await registryGetHistory(p.id, p.domain, p.limit);
      respond(true, { ok: true, history }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry history failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Aggregate statistics ────────────────────────────────────
  "republic.registry.stats": async ({ respond }) => {
    try {
      const stats = await registryGetStats();
      const domainBreakdown = Object.entries(stats.domains).map(([domain, count]) => ({
        domain,
        count,
      }));
      const sourceBreakdown = Object.entries(stats.sources).map(([source, count]) => ({
        source,
        count,
      }));
      respond(
        true,
        {
          ok: true,
          totalEntries: stats.totalEntries,
          totalDomains: Object.keys(stats.domains).length,
          enabledCount: stats.enabledEntries,
          disabledCount: stats.totalEntries - stats.enabledEntries,
          domainBreakdown,
          sourceBreakdown,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry stats failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Export domain ───────────────────────────────────────────
  "republic.registry.export": async ({ params, respond }) => {
    const p = params as { domain?: string };
    try {
      const entries = await registryExport(p.domain);
      const uiEntries = entries.map(toUiEntry);
      respond(true, { ok: true, entries: uiEntries, count: uiEntries.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry export failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Import entries ──────────────────────────────────────────
  "republic.registry.import": async ({ params, respond }) => {
    const p = params as { entries?: unknown[] };
    if (!p.entries || !Array.isArray(p.entries)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "entries array required"));
      return;
    }
    try {
      const result = await registryImport(p.entries as Parameters<typeof registryImport>[0]);
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Registry import failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── List domain constants ───────────────────────────────────
  "republic.registry.domains": ({ respond }) => {
    respond(true, { ok: true, domains: REGISTRY_DOMAINS }, undefined);
  },
};
