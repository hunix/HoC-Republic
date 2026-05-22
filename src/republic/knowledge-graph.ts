/**
 * Republic Platform — Knowledge Graph
 *
 * Interconnected knowledge network that links concepts, skills, citizens,
 * innovations, and discoveries into a traversable graph structure.
 *
 * Enables:
 *  - Knowledge discovery through graph traversal
 *  - Expertise mapping across specializations
 *  - Cross-domain connection identification
 *  - Collective intelligence amplification
 *  - Learning path optimization
 */

import type { RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type NodeType =
  | "concept"
  | "skill"
  | "citizen"
  | "innovation"
  | "project"
  | "domain"
  | "tool"
  | "question";

interface KnowledgeNode {
  id: string;
  type: NodeType;
  label: string;
  domain: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  strength: number; // 0.0-1.0, usage frequency
}

type EdgeType =
  | "knows"
  | "created"
  | "uses"
  | "teaches"
  | "requires"
  | "enables"
  | "inspired_by"
  | "related_to"
  | "depends_on"
  | "extends"
  | "contradicts"
  | "validates";

interface KnowledgeEdge {
  id: string;
  from: string; // node ID
  to: string; // node ID
  type: EdgeType;
  weight: number; // 0.0-1.0
  createdAt: string;
}

export interface KnowledgeInsight {
  type: "gap" | "connection" | "cluster" | "bridge" | "trend";
  description: string;
  involvedNodes: string[];
  score: number;
  discoveredAt: string;
}

// ─── State ──────────────────────────────────────────────────────

const nodes = new Map<string, KnowledgeNode>();
const edges: KnowledgeEdge[] = [];
const insights: KnowledgeInsight[] = [];
const MAX_NODES = 2000;
const MAX_EDGES = 5000;
const MAX_INSIGHTS = 200;

// ─── Node Operations ────────────────────────────────────────────

export function addNode(
  type: NodeType,
  label: string,
  domain: string,
  metadata: Record<string, unknown> = {},
): KnowledgeNode {
  // Check for existing node with same label + type
  for (const [, node] of nodes) {
    if (node.label === label && node.type === type) {
      node.strength = Math.min(1, node.strength + 0.1);
      return node;
    }
  }

  const node: KnowledgeNode = {
    id: uid(),
    type,
    label,
    domain,
    metadata,
    createdAt: ts(),
    strength: 0.5,
  };

  nodes.set(node.id, node);

  // Evict oldest weak nodes if over limit
  if (nodes.size > MAX_NODES) {
    const sorted = [...nodes.values()].toSorted((a, b) => a.strength - b.strength);
    const toRemove = sorted.slice(0, nodes.size - MAX_NODES);
    for (const n of toRemove) {
      nodes.delete(n.id);
    }
  }

  return node;
}

export function getNode(id: string): KnowledgeNode | undefined {
  return nodes.get(id);
}

export function findNodes(opts: {
  type?: NodeType;
  domain?: string;
  label?: string;
  minStrength?: number;
}): KnowledgeNode[] {
  let result = [...nodes.values()];
  if (opts.type) {
    result = result.filter((n) => n.type === opts.type);
  }
  if (opts.domain) {
    result = result.filter((n) => n.domain === opts.domain);
  }
  if (opts.label) {
    result = result.filter((n) => n.label.toLowerCase().includes(opts.label!.toLowerCase()));
  }
  if (opts.minStrength) {
    result = result.filter((n) => n.strength >= opts.minStrength!);
  }
  return result;
}

// ─── Edge Operations ────────────────────────────────────────────

export function addEdge(from: string, to: string, type: EdgeType, weight = 0.5): KnowledgeEdge {
  // Deduplicate
  const existing = edges.find((e) => e.from === from && e.to === to && e.type === type);
  if (existing) {
    existing.weight = Math.min(1, existing.weight + 0.1);
    return existing;
  }

  const edge: KnowledgeEdge = {
    id: uid(),
    from,
    to,
    type,
    weight,
    createdAt: ts(),
  };

  edges.push(edge);

  if (edges.length > MAX_EDGES) {
    edges.sort((a, b) => a.weight - b.weight);
    edges.splice(0, edges.length - MAX_EDGES);
  }

  return edge;
}

export function getEdgesFrom(nodeId: string): KnowledgeEdge[] {
  return edges.filter((e) => e.from === nodeId);
}

export function getEdgesTo(nodeId: string): KnowledgeEdge[] {
  return edges.filter((e) => e.to === nodeId);
}

export function getNeighbors(nodeId: string): KnowledgeNode[] {
  const neighborIds = new Set<string>();
  for (const e of edges) {
    if (e.from === nodeId) {
      neighborIds.add(e.to);
    }
    if (e.to === nodeId) {
      neighborIds.add(e.from);
    }
  }
  return [...neighborIds]
    .map((id) => nodes.get(id))
    .filter((n): n is KnowledgeNode => n !== undefined);
}

// ─── Graph Analysis ─────────────────────────────────────────────

/**
 * Find shortest path between two nodes (BFS).
 */
export function findPath(fromId: string, toId: string): KnowledgeNode[] | null {
  if (fromId === toId) {
    return [nodes.get(fromId)!].filter(Boolean);
  }

  const visited = new Set<string>();
  const queue: { nodeId: string; path: string[] }[] = [{ nodeId: fromId, path: [fromId] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.nodeId)) {
      continue;
    }
    visited.add(current.nodeId);

    const neighbors = getNeighbors(current.nodeId);
    for (const neighbor of neighbors) {
      if (neighbor.id === toId) {
        const path = [...current.path, neighbor.id];
        return path.map((id) => nodes.get(id)).filter((n): n is KnowledgeNode => n !== undefined);
      }
      if (!visited.has(neighbor.id)) {
        queue.push({ nodeId: neighbor.id, path: [...current.path, neighbor.id] });
      }
    }
  }

  return null;
}

/**
 * Find knowledge clusters — groups of densely connected nodes.
 */
export function findClusters(): Map<string, KnowledgeNode[]> {
  const clusters = new Map<string, KnowledgeNode[]>();
  const visited = new Set<string>();

  for (const [nodeId] of nodes) {
    if (visited.has(nodeId)) {
      continue;
    }

    const cluster: KnowledgeNode[] = [];
    const stack = [nodeId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const node = nodes.get(current);
      if (node) {
        cluster.push(node);
      }

      for (const neighbor of getNeighbors(current)) {
        if (!visited.has(neighbor.id)) {
          stack.push(neighbor.id);
        }
      }
    }

    if (cluster.length >= 2) {
      clusters.set(cluster[0].domain || "general", cluster);
    }
  }

  return clusters;
}

/**
 * Find "bridge" nodes that connect otherwise disconnected clusters.
 */
export function findBridgeNodes(): KnowledgeNode[] {
  const bridges: KnowledgeNode[] = [];

  for (const [, node] of nodes) {
    const neighbors = getNeighbors(node.id);
    const domains = new Set(neighbors.map((n) => n.domain));

    // If a node connects 3+ different domains, it's a bridge
    if (domains.size >= 3) {
      bridges.push(node);
    }
  }

  return bridges.toSorted((a, b) => b.strength - a.strength);
}

/**
 * Identify knowledge gaps — domains with few nodes or weak connections.
 */
export function findKnowledgeGaps(s: RepublicState): KnowledgeInsight[] {
  const domainCounts = new Map<string, number>();

  for (const [, node] of nodes) {
    domainCounts.set(node.domain, (domainCounts.get(node.domain) ?? 0) + 1);
  }

  // Find specializations with very few knowledge nodes
  const specSet = new Set(s.citizens.map((c) => c.specialization.toLowerCase()));
  const gaps: KnowledgeInsight[] = [];

  for (const spec of specSet) {
    const count = domainCounts.get(spec) ?? 0;
    if (count < 3) {
      gaps.push({
        type: "gap",
        description: `Knowledge gap in ${spec}: only ${count} nodes. Citizens working in this area need more documented knowledge.`,
        involvedNodes: [],
        score: 1 - count / 10,
        discoveredAt: ts(),
      });
    }
  }

  return gaps;
}

// ─── Auto-Population ────────────────────────────────────────────

/**
 * Populate the knowledge graph from republic state.
 * Called periodically to keep the graph current.
 */
export function populateFromState(s: RepublicState): void {
  // Add citizen nodes
  for (const citizen of s.citizens) {
    const citizenNode = addNode("citizen", citizen.name, citizen.specialization.toLowerCase(), {
      specialization: citizen.specialization,
      generation: citizen.generation,
      skillCount: citizen.skillCount,
    });

    // Add skill nodes and edges
    for (const skill of citizen.skills ?? []) {
      const skillNode = addNode("skill", skill, citizen.specialization.toLowerCase());
      addEdge(citizenNode.id, skillNode.id, "knows", 0.7);
    }

    // Add specialization domain node
    const domainNode = addNode(
      "domain",
      citizen.specialization,
      citizen.specialization.toLowerCase(),
    );
    addEdge(citizenNode.id, domainNode.id, "related_to", 0.8);
  }
}

// ─── Knowledge Graph Tick ───────────────────────────────────────

/**
 * Analyze the knowledge graph and generate insights.
 * Called periodically (every ~50 ticks).
 */
export function knowledgeGraphTick(s: RepublicState): KnowledgeInsight[] {
  // Only run occasionally
  if (s.currentTick % 50 !== 0) {
    return [];
  }

  const newInsights: KnowledgeInsight[] = [];

  // Populate/refresh from state
  if (s.currentTick % 100 === 0) {
    populateFromState(s);
  }

  // Find knowledge gaps
  const gaps = findKnowledgeGaps(s);
  for (const gap of gaps.slice(0, 3)) {
    insights.push(gap);
    newInsights.push(gap);
  }

  // Find bridge connections
  const bridges = findBridgeNodes();
  for (const bridge of bridges.slice(0, 2)) {
    const neighbors = getNeighbors(bridge.id);
    const domains = [...new Set(neighbors.map((n) => n.domain))];
    const insight: KnowledgeInsight = {
      type: "bridge",
      description: `"${bridge.label}" is a knowledge bridge connecting ${domains.join(", ")}. This cross-domain expertise enables unique innovations.`,
      involvedNodes: [bridge.id],
      score: bridge.strength,
      discoveredAt: ts(),
    };
    insights.push(insight);
    newInsights.push(insight);
  }

  // Find emerging trends (nodes added recently with high strength)
  const recentStrong = [...nodes.values()].filter((n) => n.strength > 0.7).slice(0, 3);

  for (const node of recentStrong) {
    if (rng() < 0.3) {
      const insight: KnowledgeInsight = {
        type: "trend",
        description: `"${node.label}" in ${node.domain} is gaining momentum (strength: ${(node.strength * 100).toFixed(0)}%).`,
        involvedNodes: [node.id],
        score: node.strength,
        discoveredAt: ts(),
      };
      insights.push(insight);
      newInsights.push(insight);
    }
  }

  // Trim insights
  if (insights.length > MAX_INSIGHTS) {
    insights.splice(0, insights.length - MAX_INSIGHTS);
  }

  return newInsights;
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getKnowledgeGraphDiagnostics(): {
  nodeCount: number;
  edgeCount: number;
  insightCount: number;
  domainBreakdown: Record<string, number>;
  typeBreakdown: Record<string, number>;
  avgStrength: number;
  recentInsights: KnowledgeInsight[];
} {
  const domainBreakdown: Record<string, number> = {};
  const typeBreakdown: Record<string, number> = {};
  let totalStrength = 0;

  for (const [, node] of nodes) {
    domainBreakdown[node.domain] = (domainBreakdown[node.domain] ?? 0) + 1;
    typeBreakdown[node.type] = (typeBreakdown[node.type] ?? 0) + 1;
    totalStrength += node.strength;
  }

  return {
    nodeCount: nodes.size,
    edgeCount: edges.length,
    insightCount: insights.length,
    domainBreakdown,
    typeBreakdown,
    avgStrength: nodes.size > 0 ? totalStrength / nodes.size : 0,
    recentInsights: insights.slice(-10),
  };
}
