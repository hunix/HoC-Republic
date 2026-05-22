/**
 * Cognee ECL Bridge — Extract, Cognify, Load Pipeline
 *
 * Activates HoC's dormant knowledge graph (memory-graph.ts) and
 * Mem0 fact memory (mem0-memory.ts) by wiring them into the citizen
 * agent lifecycle. Implements:
 *
 *   1. Auto-Capture: After each citizen action, extracts entities into
 *      the knowledge graph and distills facts into Mem0.
 *   2. Auto-Recall: Before prompt construction, retrieves relevant
 *      graph context + Mem0 facts for injection.
 *   3. Multi-Scope: company-wide (collective), per-citizen, agent-level
 *   4. Tick Maintenance: periodic graph decay, stats refresh
 *
 * Inspired by: topoteretes/cognee-integrations (ECL), mem0ai/mem0 (auto-capture)
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  addNode,
  addEdge,
  buildGraphFromMemories,
  extractEntities,
  classifyEntity,
  findRelated,
  memoryGraphDiagnostics,
  memoryGraphTick,
  querySubgraph,
  searchNodes,
  decayEdges,
  type MemoryNode,
  type MemorySubgraph,
} from "./memory-graph.js";
import {
  mem0Add,
  mem0BuildContext,
  mem0Stats,
  type Mem0Message,
} from "./mem0-memory.js";
import { ts } from "./utils.js";

const logger = createSubsystemLogger("republic:cognee-bridge");

// ─── Configuration ────────────────────────────────────────────────────────────

interface CogneeBridgeConfig {
  /** Enable auto-capture after each citizen action */
  autoCapture: boolean;
  /** Enable auto-recall before prompt construction */
  autoRecall: boolean;
  /** Max facts to inject per recall */
  recallTopK: number;
  /** Max graph nodes to traverse per recall */
  graphDepth: number;
  /** Max related nodes from spreading activation */
  relatedTopK: number;
}

const config: CogneeBridgeConfig = {
  autoCapture: true,
  autoRecall: true,
  recallTopK: 8,
  graphDepth: 2,
  relatedTopK: 5,
};

// ─── Statistics ───────────────────────────────────────────────────────────────

const stats = {
  capturesPerformed: 0,
  recallsPerformed: 0,
  entitiesExtracted: 0,
  factsDistilled: 0,
  graphQueriesServed: 0,
  lastCaptureAt: "",
  lastRecallAt: "",
};

// ─── Auto-Capture: After Agent Action ─────────────────────────────────────────

/**
 * Auto-capture hook — called after each citizen action.
 * Runs the full ECL pipeline:
 *   Extract: entities from action description
 *   Cognify: build/reinforce knowledge graph + distill Mem0 facts
 *   Load:    data persisted in both engines for future recall
 *
 * Fire-and-forget safe — never throws, never blocks the tick.
 */
export async function autoCaptureInteraction(
  citizenId: string,
  citizenName: string,
  actionType: string,
  actionDescription: string,
  specialization: string,
): Promise<void> {
  if (!config.autoCapture) { return; }

  try {
    // ── Phase 1: EXTRACT — entities from the action ──
    const text = `${citizenName} performed ${actionType}: ${actionDescription}`;
    const entityLabels = extractEntities(text);

    if (entityLabels.length > 0) {
      // ── Phase 2: COGNIFY — build knowledge graph ──
      const graphResult = buildGraphFromMemories(citizenId, [
        { text, importance: actionType === "research" || actionType === "learn" ? 0.7 : 0.4 },
      ]);

      // Add specialization as a linked skill node
      const specNode = addNode(specialization, "skill", citizenId, { source: "specialization" }, 0.8);
      for (const label of entityLabels.slice(0, 5)) {
        const entityNode = addNode(label, classifyEntity(label), citizenId);
        addEdge(specNode.id, entityNode.id, "domain_knowledge", citizenId, 0.4);
      }

      stats.entitiesExtracted += entityLabels.length;

      if (graphResult.nodesAdded > 0 || graphResult.edgesAdded > 0) {
        logger.debug("cognee: graph updated", {
          citizenId,
          nodesAdded: graphResult.nodesAdded,
          edgesAdded: graphResult.edgesAdded,
        });
      }
    }

    // ── Phase 3: LOAD — distill facts into Mem0 ──
    const messages: Mem0Message[] = [
      { role: "user", content: `${citizenName}'s current task: ${actionType}` },
      { role: "assistant", content: actionDescription },
    ];

    const mem0Result = await mem0Add(
      citizenId,
      citizenName,
      messages,
      `${citizenName} is a ${specialization} citizen in the Republic.`,
    );

    stats.factsDistilled += mem0Result.added;
    stats.capturesPerformed++;
    stats.lastCaptureAt = ts();
  } catch (err) {
    // Never crash the tick — fire-and-forget
    logger.warn("cognee: auto-capture failed", {
      citizenId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Auto-Recall: Before Prompt Construction ──────────────────────────────────

/**
 * Auto-recall hook — call before building the citizen's LLM prompt.
 * Retrieves relevant context from both the knowledge graph and Mem0 fact store.
 *
 * Returns a formatted context block ready for prompt injection.
 */
export async function autoRecallContext(
  citizenId: string,
  prompt: string,
): Promise<string> {
  if (!config.autoRecall || prompt.length < 10) { return ""; }

  const parts: string[] = [];

  try {
    // ── Mem0 Facts: semantic recall ──
    const factContext = await mem0BuildContext(citizenId, prompt, config.recallTopK);
    if (factContext) {
      parts.push(factContext);
    }

    // ── Knowledge Graph: find related entities ──
    const graphNodes = searchNodes(citizenId, prompt, 3);
    if (graphNodes.length > 0) {
      const relatedEntities: MemoryNode[] = [];
      for (const node of graphNodes.slice(0, 2)) {
        const related = findRelated(node.id, config.relatedTopK);
        relatedEntities.push(...related);
      }

      if (relatedEntities.length > 0) {
        const unique = [...new Map(relatedEntities.map(n => [n.id, n])).values()];
        const lines = unique.slice(0, 8).map(n =>
          `  • ${n.label} (${n.type}, importance: ${(n.importance * 100).toFixed(0)}%)`,
        );
        parts.push(`KNOWLEDGE GRAPH CONTEXT (${unique.length} related entities):\n${lines.join("\n")}`);
      }

      stats.graphQueriesServed++;
    }

    stats.recallsPerformed++;
    stats.lastRecallAt = ts();
  } catch (err) {
    logger.warn("cognee: auto-recall failed", {
      citizenId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return parts.join("\n\n");
}

// ─── Graph Query API ──────────────────────────────────────────────────────────

/**
 * Query the knowledge graph for a citizen — used by RPC handlers.
 */
export function queryKnowledgeGraph(
  citizenId: string,
  query: string,
  depth: number = 2,
): { subgraph: MemorySubgraph | null; searchResults: MemoryNode[] } {
  const searchResult = searchNodes(citizenId, query, 10);
  let subgraph: MemorySubgraph | null = null;

  if (searchResult.length > 0) {
    subgraph = querySubgraph(searchResult[0].id, depth);
  }

  stats.graphQueriesServed++;
  return { subgraph, searchResults: searchResult };
}

// ─── Tick Handler ─────────────────────────────────────────────────────────────

/**
 * Cognee memory tick — periodic maintenance.
 * Runs graph decay and logs diagnostics.
 */
export function cogneeMemoryTick(): {
  graphNodes: number;
  graphEdges: number;
  edgesDecayed: number;
  mem0TotalFacts: number;
} {
  const graphResult = memoryGraphTick();
  const mem0 = mem0Stats();

  return {
    graphNodes: graphResult.nodesTotal,
    graphEdges: graphResult.edgesTotal,
    edgesDecayed: graphResult.edgesDecayed,
    mem0TotalFacts: mem0.totalFacts,
  };
}

// ─── Status / Diagnostics ─────────────────────────────────────────────────────

export interface CogneeStatus {
  enabled: boolean;
  config: CogneeBridgeConfig;
  stats: typeof stats;
  graph: ReturnType<typeof memoryGraphDiagnostics>;
  mem0: ReturnType<typeof mem0Stats>;
}

export function getCogneeStatus(): CogneeStatus {
  return {
    enabled: true,
    config: { ...config },
    stats: { ...stats },
    graph: memoryGraphDiagnostics(),
    mem0: mem0Stats(),
  };
}

// ─── Config Mutators ──────────────────────────────────────────────────────────

export function setCogneeAutoCapture(enabled: boolean): void {
  config.autoCapture = enabled;
  logger.info(`cognee: auto-capture ${enabled ? "enabled" : "disabled"}`);
}

export function setCogneeAutoRecall(enabled: boolean): void {
  config.autoRecall = enabled;
  logger.info(`cognee: auto-recall ${enabled ? "enabled" : "disabled"}`);
}

// ─── Manual Operations ───────────────────────────────────────────────────────

/**
 * Manually trigger entity extraction for a citizen from their memories.
 * Used by the RPC handler for on-demand graph building.
 */
export function manualExtract(
  citizenId: string,
  texts: string[],
): { nodesAdded: number; edgesAdded: number; entitiesFound: number } {
  const memories = texts.map(t => ({ text: t, importance: 0.6 }));
  const result = buildGraphFromMemories(citizenId, memories);

  let totalEntities = 0;
  for (const t of texts) {
    totalEntities += extractEntities(t).length;
  }

  stats.entitiesExtracted += totalEntities;
  return { ...result, entitiesFound: totalEntities };
}

/**
 * Prune decayed graph edges — admin operation.
 */
export function pruneGraph(): { edgesDecayed: number } {
  const edgesDecayed = decayEdges();
  return { edgesDecayed };
}
