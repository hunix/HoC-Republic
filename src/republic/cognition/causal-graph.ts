/**
 * Republic Platform — Causal Graph Engine
 *
 * Lightweight in-process causal graph (TypeScript-native, no PyWhy dependency).
 * Inspired by PyWhy causal AI patterns and 2025 causal inference research.
 *
 * Citizens build personal causal graphs from accumulated experience.
 * This enables sophisticated "why did X fail?" root-cause analysis
 * via directed graph traversal.
 *
 * Features:
 *   - Directed Acyclic Graph (DAG) of cause → effect relationships
 *   - Each edge carries a weight (strength) and confidence (0–1)
 *   - Root cause analysis: BFS from a symptom node back to root causes
 *   - Path explanation: generate human-readable causal chains
 *   - Confounder detection: nodes with multiple incoming edges
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ts } from "../../republic/utils.js";

const logger = createSubsystemLogger("republic:causal-graph");

// ─── Types ─────────────────────────────────────────────────────────

export type CausalNodeType = "cause" | "effect" | "confounder" | "mediator";

export interface CausalNode {
  id: string;
  label: string;
  type: CausalNodeType;
  domain: string; // "finance", "education", "social", "technical", etc.
  observedCount: number; // how many times this node was observed
  lastObservedAt: string;
}

export interface CausalEdge {
  from: string; // CausalNode.id
  to: string; // CausalNode.id
  weight: number; // 0–1 (strength of causal relationship)
  confidence: number; // 0–1 (how sure we are about this edge)
  observedCount: number; // times this relationship was observed
  lastObservedAt: string;
}

export interface CausalGraph {
  citizenId: string;
  nodes: Map<string, CausalNode>;
  edges: Map<string, CausalEdge>; // key = `${from}->${to}`
  createdAt: string;
  updatedAt: string;
}

export interface CausalChain {
  path: string[]; // sequence of node IDs from root cause to effect
  labels: string[]; // human-readable labels for each node
  totalWeight: number; // product of edge weights along path
  explanation: string; // generated natural language explanation
}

// ─── Graph Store ────────────────────────────────────────────────────

const graphStore = new Map<string, CausalGraph>();

function getOrCreateGraph(citizenId: string): CausalGraph {
  if (!graphStore.has(citizenId)) {
    graphStore.set(citizenId, {
      citizenId,
      nodes: new Map(),
      edges: new Map(),
      createdAt: ts(),
      updatedAt: ts(),
    });
  }
  return graphStore.get(citizenId)!;
}

// ─── Graph Mutations ────────────────────────────────────────────────

/**
 * Add or strengthen a causal observation: "X causes Y".
 * Repeated observations increase edge weight and confidence.
 */
export function observeCausalRelation(
  citizenId: string,
  causeLabel: string,
  effectLabel: string,
  opts: {
    domain?: string;
    strength?: number;
    confidence?: number;
  } = {},
): void {
  const graph = getOrCreateGraph(citizenId);
  const now = ts();

  // Ensure source node exists
  const causeKey = causeLabel.toLowerCase().replace(/\s+/g, "_");
  if (!graph.nodes.has(causeKey)) {
    graph.nodes.set(causeKey, {
      id: causeKey,
      label: causeLabel,
      type: "cause",
      domain: opts.domain ?? "general",
      observedCount: 0,
      lastObservedAt: now,
    });
  }
  const causeNode = graph.nodes.get(causeKey)!;
  causeNode.observedCount++;
  causeNode.lastObservedAt = now;

  // Ensure target node exists
  const effectKey = effectLabel.toLowerCase().replace(/\s+/g, "_");
  if (!graph.nodes.has(effectKey)) {
    graph.nodes.set(effectKey, {
      id: effectKey,
      label: effectLabel,
      type: "effect",
      domain: opts.domain ?? "general",
      observedCount: 0,
      lastObservedAt: now,
    });
  }
  const effectNode = graph.nodes.get(effectKey)!;
  effectNode.observedCount++;
  effectNode.lastObservedAt = now;

  // Update or create edge
  const edgeKey = `${causeKey}->${effectKey}`;
  const existing = graph.edges.get(edgeKey);

  if (existing) {
    // Strengthen existing edge via exponential moving average
    const alpha = 0.2;
    existing.weight = alpha * (opts.strength ?? 0.5) + (1 - alpha) * existing.weight;
    existing.confidence = Math.min(1, existing.confidence + 0.05);
    existing.observedCount++;
    existing.lastObservedAt = now;
  } else {
    graph.edges.set(edgeKey, {
      from: causeKey,
      to: effectKey,
      weight: opts.strength ?? 0.5,
      confidence: opts.confidence ?? 0.5,
      observedCount: 1,
      lastObservedAt: now,
    });
  }

  // Detect confounders: nodes with multiple incoming edges
  const incomingEdges = [...graph.edges.values()].filter((e) => e.to === effectKey);
  if (incomingEdges.length > 2) {
    effectNode.type = "confounder";
  }

  graph.updatedAt = now;

  // Cap graph size to prevent unbounded growth
  if (graph.nodes.size > 200) {
    // Evict least-observed nodes
    const sorted = [...graph.nodes.values()].toSorted((a, b) => a.observedCount - b.observedCount);
    for (const node of sorted.slice(0, 20)) {
      graph.nodes.delete(node.id);
      for (const [k, e] of graph.edges) {
        if (e.from === node.id || e.to === node.id) {
          graph.edges.delete(k);
        }
      }
    }
  }
}

// ─── Root Cause Analysis ────────────────────────────────────────────

/**
 * Find the root causes of a given symptom/effect via BFS traversal
 * backwards through the causal graph.
 *
 * @param citizenId  The citizen whose graph to search
 * @param symptomLabel  The observable symptom (effect node label)
 * @param maxDepth  Maximum causal depth to trace (default 4)
 */
export function findRootCauses(
  citizenId: string,
  symptomLabel: string,
  maxDepth = 4,
): CausalChain[] {
  const graph = graphStore.get(citizenId);
  if (!graph) {
    return [];
  }

  const symptomKey = symptomLabel.toLowerCase().replace(/\s+/g, "_");
  if (!graph.nodes.has(symptomKey)) {
    logger.debug(`Root cause: no node for "${symptomLabel}" in citizen ${citizenId} graph`);
    return [];
  }

  // Build reverse adjacency: effectId → [causeIds]
  const reverseAdj = new Map<string, string[]>();
  for (const edge of graph.edges.values()) {
    const list = reverseAdj.get(edge.to) ?? [];
    list.push(edge.from);
    reverseAdj.set(edge.to, list);
  }

  // BFS backwards from symptom to find all root cause paths
  const chains: CausalChain[] = [];
  const queue: Array<{ nodeId: string; path: string[]; weight: number; depth: number }> = [
    { nodeId: symptomKey, path: [symptomKey], weight: 1.0, depth: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { nodeId, path, weight, depth } = queue.shift()!;

    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);

    const causes = reverseAdj.get(nodeId) ?? [];

    if (causes.length === 0 || depth >= maxDepth) {
      // This is a root cause (no predecessors) or max depth reached
      if (path.length > 1) {
        const labels = path.map((id) => graph.nodes.get(id)?.label ?? id).toReversed();
        const pathReversed = [...path].toReversed();
        chains.push({
          path: pathReversed,
          labels,
          totalWeight: parseFloat(weight.toFixed(3)),
          explanation: `Root cause "${labels[0]}" leads to "${labels.at(-1)}" via: ${labels.join(" → ")}`,
        });
      }
      continue;
    }

    for (const causeId of causes) {
      if (!path.includes(causeId)) {
        const edge = graph.edges.get(`${causeId}->${nodeId}`);
        const edgeWeight = edge ? edge.weight * edge.confidence : 0.3;
        queue.push({
          nodeId: causeId,
          path: [...path, causeId],
          weight: weight * edgeWeight,
          depth: depth + 1,
        });
      }
    }
  }

  return chains.toSorted((a, b) => b.totalWeight - a.totalWeight).slice(0, 5);
}

// ─── Analogical Transfer ────────────────────────────────────────────

/**
 * Find analogous causal patterns across different domains.
 * Returns nodes whose causal structure matches the query pattern.
 */
export function findAnalogousCauses(
  citizenId: string,
  queryDomain: string,
  targetDomain: string,
): Array<{ sourceCause: string; analogousCause: string; similarity: number }> {
  const graph = graphStore.get(citizenId);
  if (!graph) {
    return [];
  }

  const sourceNodes = [...graph.nodes.values()].filter((n) => n.domain === queryDomain);
  const targetNodes = [...graph.nodes.values()].filter((n) => n.domain === targetDomain);

  const analogies: Array<{ sourceCause: string; analogousCause: string; similarity: number }> = [];

  for (const src of sourceNodes) {
    // Count outgoing edges from src
    const srcOutCount = [...graph.edges.values()].filter((e) => e.from === src.id).length;

    for (const tgt of targetNodes) {
      const tgtOutCount = [...graph.edges.values()].filter((e) => e.from === tgt.id).length;
      // Structural similarity: both nodes have similar connectivity patterns
      const similarity =
        1 - Math.abs(srcOutCount - tgtOutCount) / (Math.max(srcOutCount, tgtOutCount, 1) + 1);

      if (similarity > 0.6) {
        analogies.push({
          sourceCause: src.label,
          analogousCause: tgt.label,
          similarity: parseFloat(similarity.toFixed(3)),
        });
      }
    }
  }

  return analogies.toSorted((a, b) => b.similarity - a.similarity).slice(0, 10);
}

// ─── Query API ─────────────────────────────────────────────────────

export function getCausalGraphSummary(citizenId: string): {
  nodeCount: number;
  edgeCount: number;
  topCauses: string[];
  confounders: string[];
  domains: string[];
} {
  const graph = graphStore.get(citizenId);
  if (!graph) {
    return { nodeCount: 0, edgeCount: 0, topCauses: [], confounders: [], domains: [] };
  }

  const sortedByObs = [...graph.nodes.values()].toSorted(
    (a, b) => b.observedCount - a.observedCount,
  );

  return {
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.size,
    topCauses: sortedByObs
      .filter((n) => n.type === "cause")
      .slice(0, 5)
      .map((n) => n.label),
    confounders: [...graph.nodes.values()]
      .filter((n) => n.type === "confounder")
      .map((n) => n.label),
    domains: [...new Set([...graph.nodes.values()].map((n) => n.domain))],
  };
}

export function clearCausalGraph(citizenId: string): void {
  graphStore.delete(citizenId);
}

// ─── Edge Pruning ───────────────────────────────────────────────────

/**
 * Prune stale, low-confidence edges from a citizen's causal graph.
 *
 * An edge is pruned when:
 *  - It has not been observed in the last `ttlTicks` ticks (approximated as seconds)
 *  - AND its confidence is below 0.4 (not yet well-established)
 *
 * This prevents the graph from accumulating irrelevant historical noise.
 */
export function pruneStaleEdges(citizenId: string, currentTick: number, ttlTicks = 2000): void {
  const graph = graphStore.get(citizenId);
  if (!graph) { return; }

  const now = Date.now();
  const ttlMs = ttlTicks * 1000; // treat 1 tick ≈ 1 second

  for (const [key, edge] of graph.edges) {
    const lastObservedMs = new Date(edge.lastObservedAt).getTime();
    const ageMs = now - lastObservedMs;
    if (ageMs > ttlMs && edge.confidence < 0.4) {
      graph.edges.delete(key);
    }
  }
  void currentTick; // reserved for future tick-indexed pruning
}

// ─── Auto-Population from Action History ────────────────────────────

/**
 * Automatically populate a citizen's causal graph from their actionHistory.
 *
 * For each action:
 *  - Success: records "tool → task_success" with strength 0.7
 *  - Failure: records "tool → task_failure" with strength 0.6
 *
 * This is the primary driver for filling causal graphs with real behavioral data.
 * Safe to call idempotently — repeated observations strengthen existing edges via EMA.
 */
export function updateCausalGraphFromActions(
  citizenId: string,
  actionHistory: Array<{ tool?: string; success: boolean }>,
  domain = "general",
): void {
  for (const action of actionHistory) {
    if (!action.tool) { continue; }
    const outcome = action.success ? "task_success" : "task_failure";
    observeCausalRelation(citizenId, action.tool, outcome, {
      domain,
      strength: action.success ? 0.7 : 0.6,
      confidence: 0.4,
    });
  }
}

