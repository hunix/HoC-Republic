/**
 * Republic Platform — Cognee + Mem0 RPC Handlers
 *
 * Gateway API for the unified memory subsystem:
 *   - Knowledge graph queries (Cognee-style ECL)
 *   - Mem0 fact management
 *   - Auto-recall/auto-capture controls
 *   - Combined diagnostics
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getCogneeStatus,
  autoRecallContext,
  queryKnowledgeGraph,
  manualExtract,
  pruneGraph,
  setCogneeAutoCapture,
  setCogneeAutoRecall,
} from "../../../republic/cognee-bridge.js";
import {
  findRelated,
  memoryGraphDiagnostics,
  searchNodes,
} from "../../../republic/memory-graph.js";
import {
  mem0Stats,
  mem0Search,
  mem0GetAll,
} from "../../../republic/mem0-memory.js";

export const cogneeHandlers: Partial<GatewayRequestHandlers> = {
  // ── Status ────────────────────────────────────────────────────

  "republic.cognee.status": ({ respond }) => {
    const status = getCogneeStatus();
    respond(true, { ok: true, ...status }, undefined);
  },

  // ── Knowledge Graph Query ─────────────────────────────────────

  "republic.cognee.query": ({ params, respond }) => {
    const { citizenId, query, depth = 2 } = params as {
      citizenId?: string;
      query?: string;
      depth?: number;
    };
    if (!citizenId || !query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and query required"));
      return;
    }
    const result = queryKnowledgeGraph(citizenId, query, Math.min(depth, 5));
    respond(true, {
      ok: true,
      searchResults: result.searchResults.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        importance: n.importance,
        accessCount: n.accessCount,
      })),
      subgraph: result.subgraph
        ? {
            nodeCount: result.subgraph.nodes.length,
            edgeCount: result.subgraph.edges.length,
            nodes: result.subgraph.nodes.slice(0, 50).map(n => ({
              id: n.id,
              label: n.label,
              type: n.type,
              importance: n.importance,
            })),
            edges: result.subgraph.edges.slice(0, 100).map(e => ({
              id: e.id,
              source: e.source,
              target: e.target,
              relation: e.relation,
              weight: e.weight,
            })),
          }
        : null,
    }, undefined);
  },

  // ── Auto-Recall Context ───────────────────────────────────────

  "republic.cognee.recall": async ({ params, respond }) => {
    const { citizenId, prompt } = params as { citizenId?: string; prompt?: string };
    if (!citizenId || !prompt) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and prompt required"));
      return;
    }
    const context = await autoRecallContext(citizenId, prompt);
    respond(true, { ok: true, context, length: context.length }, undefined);
  },

  // ── Manual Entity Extraction ──────────────────────────────────

  "republic.cognee.extract": ({ params, respond }) => {
    const { citizenId, texts } = params as { citizenId?: string; texts?: string[] };
    if (!citizenId || !texts || !Array.isArray(texts) || texts.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and texts[] required"));
      return;
    }
    const result = manualExtract(citizenId, texts.slice(0, 20));
    respond(true, { ok: true, ...result }, undefined);
  },

  // ── Spreading Activation: Find Related ────────────────────────

  "republic.cognee.related": ({ params, respond }) => {
    const { citizenId, query, topK = 10 } = params as {
      citizenId?: string;
      query?: string;
      topK?: number;
    };
    if (!citizenId || !query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and query required"));
      return;
    }

    const searchResult = searchNodes(citizenId, query, 1);
    if (searchResult.length === 0) {
      respond(true, { ok: true, related: [], seed: null }, undefined);
      return;
    }

    const seed = searchResult[0];
    const related = findRelated(seed.id, Math.min(topK, 30));
    respond(true, {
      ok: true,
      seed: { id: seed.id, label: seed.label, type: seed.type },
      related: related.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        importance: n.importance,
        accessCount: n.accessCount,
      })),
    }, undefined);
  },

  // ── Memory Scopes ─────────────────────────────────────────────

  "republic.cognee.scopes": ({ respond }) => {
    const graph = memoryGraphDiagnostics();
    const mem0 = mem0Stats();
    respond(true, {
      ok: true,
      scopes: {
        graph: {
          totalNodes: graph.totalNodes,
          totalEdges: graph.totalEdges,
          nodesByType: graph.nodesByType,
          citizenGraphs: Object.entries(graph.citizenGraphSizes).length,
          avgEdgesPerNode: graph.avgEdgesPerNode,
        },
        mem0: {
          totalFacts: mem0.totalFacts,
          totalCitizens: mem0.totalCitizens,
          avgFactsPerCitizen: mem0.avgFactsPerCitizen,
        },
      },
    }, undefined);
  },

  // ── Diagnostics ───────────────────────────────────────────────

  "republic.cognee.diagnostics": ({ respond }) => {
    const status = getCogneeStatus();
    const graph = memoryGraphDiagnostics();
    const mem0 = mem0Stats();
    respond(true, {
      ok: true,
      health: "operational",
      autoCapture: status.config.autoCapture,
      autoRecall: status.config.autoRecall,
      graph: {
        totalNodes: graph.totalNodes,
        totalEdges: graph.totalEdges,
        nodesByType: graph.nodesByType,
      },
      mem0: {
        totalFacts: mem0.totalFacts,
        totalCitizens: mem0.totalCitizens,
        deduplicationsPerformed: mem0.deduplicationsPerformed,
        llmExtractions: mem0.llmExtractions,
        offlineExtractions: mem0.offlineExtractions,
      },
      pipeline: status.stats,
    }, undefined);
  },

  // ── Prune Decayed Edges ───────────────────────────────────────

  "republic.cognee.prune": ({ respond }) => {
    const result = pruneGraph();
    respond(true, { ok: true, edgesDecayed: result.edgesDecayed }, undefined);
  },

  // ── Configure Auto-Capture / Auto-Recall ──────────────────────

  "republic.cognee.config": ({ params, respond }) => {
    const { autoCapture, autoRecall } = params as {
      autoCapture?: boolean;
      autoRecall?: boolean;
    };
    if (typeof autoCapture === "boolean") { setCogneeAutoCapture(autoCapture); }
    if (typeof autoRecall === "boolean") { setCogneeAutoRecall(autoRecall); }
    const status = getCogneeStatus();
    respond(true, { ok: true, config: status.config }, undefined);
  },

  // ── Mem0 Citizen Facts (convenience: proxy to memory.facts.*) ─

  "republic.cognee.citizen.facts": async ({ params, respond }) => {
    const { citizenId, query, limit = 20 } = params as {
      citizenId?: string;
      query?: string;
      limit?: number;
    };
    if (!citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }

    if (query) {
      const results = await mem0Search(citizenId, query, Math.min(limit, 50));
      respond(true, {
        ok: true,
        facts: results.map(r => ({
          ...r.fact,
          embedding: undefined,
          score: r.score,
        })),
        total: results.length,
      }, undefined);
    } else {
      const all = mem0GetAll(citizenId);
      const page = all.slice(0, Math.min(limit, 200));
      respond(true, {
        ok: true,
        facts: page.map(f => ({ ...f, embedding: undefined })),
        total: all.length,
      }, undefined);
    }
  },
};
