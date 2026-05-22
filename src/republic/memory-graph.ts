/**
 * Republic Platform — Memory Knowledge Graph
 *
 * Graph-based persistent memory for citizens. Stores entities,
 * concepts, and events as nodes with weighted edges representing
 * relationships. Enables:
 * - Entity extraction from text (heuristic NER)
 * - Subgraph traversal for context retrieval
 * - Node deduplication / merge
 * - Spreading-activation recall
 *
 * Inspired by: Zep Graphiti, knowledge graphs, spreading activation theory.
 *
 * Storage: in-memory adjacency list (SQLite-ready schema).
 */

import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type MemoryNodeType = "entity" | "concept" | "event" | "location" | "skill";

export interface MemoryNode {
  id: string;
  label: string;
  type: MemoryNodeType;
  citizenId: string;
  /** Optional metadata about the node */
  metadata: Record<string, unknown>;
  /** Importance weight 0–1 */
  importance: number;
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
}

export interface MemoryEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  /** Edge weight / strength 0–1 */
  weight: number;
  citizenId: string;
  createdAt: string;
  /** Decays over time if not reinforced */
  lastReinforcedAt: string;
}

export interface MemorySubgraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

export interface MemoryGraphDiagnostics {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  citizenGraphSizes: Record<string, { nodes: number; edges: number }>;
  avgEdgesPerNode: number;
}

// ─── State ──────────────────────────────────────────────────────

const nodes = new Map<string, MemoryNode>();
const edges = new Map<string, MemoryEdge>();

/** Adjacency list: nodeId → Set of edgeIds */
const adjacency = new Map<string, Set<string>>();

const MAX_NODES = 50_000;
const MAX_EDGES = 200_000;

// ─── Entity Extraction ──────────────────────────────────────────

/**
 * Heuristic named-entity extraction from text.
 * Finds capitalized multi-word sequences, quoted terms,
 * and common patterns (emails, URLs, numbers with units).
 */
export function extractEntities(text: string): string[] {
  const entities = new Set<string>();

  // Capitalized multi-word sequences (e.g., "John Smith", "New York")
  const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = capitalizedPattern.exec(text)) !== null) {
    entities.add(match[1].trim());
  }

  // Single capitalized words (not at sentence start, > 2 chars)
  const singleCapPattern = /(?<=[.!?]\s+\w+\s+|,\s+)([A-Z][a-z]{2,})\b/g;
  while ((match = singleCapPattern.exec(text)) !== null) {
    entities.add(match[1]);
  }

  // Quoted terms
  const quotedPattern = /"([^"]{2,50})"/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    entities.add(match[1]);
  }

  // Technical terms: camelCase or PascalCase
  const camelPattern = /\b([a-z]+[A-Z][a-zA-Z]*)\b/g;
  while ((match = camelPattern.exec(text)) !== null) {
    entities.add(match[1]);
  }

  // Hash tags or @mentions
  const tagPattern = /[#@](\w{2,})/g;
  while ((match = tagPattern.exec(text)) !== null) {
    entities.add(match[1]);
  }

  return [...entities].slice(0, 50); // cap at 50 entities per extraction
}

/**
 * Classify an extracted entity into a node type.
 */
export function classifyEntity(entity: string): MemoryNodeType {
  const lower = entity.toLowerCase();

  // Location indicators
  if (/\b(city|town|country|street|avenue|river|mountain|ocean|sea|lake)\b/i.test(entity)) {
    return "location";
  }

  // Skill indicators
  if (/\b(programming|coding|design|analysis|management|engineering|writing)\b/i.test(lower)) {
    return "skill";
  }

  // Event indicators (past tense or event-like words)
  if (/\b(meeting|conference|event|launch|release|update|incident|migration)\b/i.test(lower)) {
    return "event";
  }

  // Concept indicators (abstract words)
  if (/\b(theory|principle|pattern|algorithm|strategy|framework|methodology)\b/i.test(lower)) {
    return "concept";
  }

  // Default to entity (person, org, thing)
  return "entity";
}

// ─── Node Operations ────────────────────────────────────────────

/**
 * Add a node to the knowledge graph.
 * If a node with the same label + citizenId exists, reinforce it instead.
 */
export function addNode(
  label: string,
  type: MemoryNodeType,
  citizenId: string,
  metadata?: Record<string, unknown>,
  importance?: number,
): MemoryNode {
  // Check for existing node with same label for this citizen
  const existing = findNodeByLabel(citizenId, label);
  if (existing) {
    existing.accessCount++;
    existing.lastAccessedAt = ts();
    existing.importance = Math.min(1, existing.importance + 0.05);
    if (metadata) {
      Object.assign(existing.metadata, metadata);
    }
    return existing;
  }

  const node: MemoryNode = {
    id: `mn-${uid().slice(0, 10)}`,
    label,
    type,
    citizenId,
    metadata: metadata ?? {},
    importance: importance ?? 0.5,
    createdAt: ts(),
    lastAccessedAt: ts(),
    accessCount: 1,
  };

  nodes.set(node.id, node);
  adjacency.set(node.id, new Set());

  // Eviction if over limit
  if (nodes.size > MAX_NODES) {
    evictLeastImportantNodes(Math.floor(MAX_NODES * 0.1));
  }

  return node;
}

/**
 * Find a node by label within a citizen's graph.
 */
export function findNodeByLabel(citizenId: string, label: string): MemoryNode | undefined {
  const lowerLabel = label.toLowerCase();
  for (const node of nodes.values()) {
    if (node.citizenId === citizenId && node.label.toLowerCase() === lowerLabel) {
      return node;
    }
  }
  return undefined;
}

/**
 * Get a node by ID.
 */
export function getNode(nodeId: string): MemoryNode | undefined {
  return nodes.get(nodeId);
}

/**
 * Get all nodes for a citizen.
 */
export function getCitizenNodes(citizenId: string): MemoryNode[] {
  return [...nodes.values()].filter((n) => n.citizenId === citizenId);
}

/**
 * Remove a node and all its edges.
 */
export function removeNode(nodeId: string): boolean {
  const node = nodes.get(nodeId);
  if (!node) {return false;}

  // Remove all connected edges
  const edgeIds = adjacency.get(nodeId);
  if (edgeIds) {
    for (const eid of edgeIds) {
      const edge = edges.get(eid);
      if (edge) {
        // Remove from the other node's adjacency
        const otherId = edge.source === nodeId ? edge.target : edge.source;
        adjacency.get(otherId)?.delete(eid);
        edges.delete(eid);
      }
    }
  }

  adjacency.delete(nodeId);
  nodes.delete(nodeId);
  return true;
}

// ─── Edge Operations ────────────────────────────────────────────

/**
 * Add an edge between two nodes.
 * If edge already exists with same relation, reinforce it.
 */
export function addEdge(
  sourceId: string,
  targetId: string,
  relation: string,
  citizenId: string,
  weight?: number,
): MemoryEdge | null {
  const source = nodes.get(sourceId);
  const target = nodes.get(targetId);
  if (!source || !target) {return null;}

  // Check for existing edge with same relation
  const existing = findEdge(sourceId, targetId, relation);
  if (existing) {
    existing.weight = Math.min(1, existing.weight + 0.1);
    existing.lastReinforcedAt = ts();
    return existing;
  }

  const edge: MemoryEdge = {
    id: `me-${uid().slice(0, 10)}`,
    source: sourceId,
    target: targetId,
    relation,
    weight: weight ?? 0.5,
    citizenId,
    createdAt: ts(),
    lastReinforcedAt: ts(),
  };

  edges.set(edge.id, edge);

  // Update adjacency lists
  if (!adjacency.has(sourceId)) {adjacency.set(sourceId, new Set());}
  if (!adjacency.has(targetId)) {adjacency.set(targetId, new Set());}
  adjacency.get(sourceId)!.add(edge.id);
  adjacency.get(targetId)!.add(edge.id);

  // Eviction if over limit
  if (edges.size > MAX_EDGES) {
    evictWeakestEdges(Math.floor(MAX_EDGES * 0.1));
  }

  return edge;
}

/**
 * Find an edge between two nodes with a specific relation.
 */
export function findEdge(sourceId: string, targetId: string, relation: string): MemoryEdge | undefined {
  const srcEdges = adjacency.get(sourceId);
  if (!srcEdges) {return undefined;}

  for (const eid of srcEdges) {
    const e = edges.get(eid);
    if (e && e.target === targetId && e.relation === relation) {return e;}
    if (e && e.source === targetId && e.relation === relation) {return e;}
  }
  return undefined;
}

/**
 * Get all edges for a node.
 */
export function getNodeEdges(nodeId: string): MemoryEdge[] {
  const edgeIds = adjacency.get(nodeId);
  if (!edgeIds) {return [];}
  return [...edgeIds].map((eid) => edges.get(eid)!).filter(Boolean);
}

// ─── Subgraph Traversal ─────────────────────────────────────────

/**
 * Query a subgraph centered on a node, traversing up to `depth` hops.
 * Returns all reachable nodes and edges within the depth limit.
 */
export function querySubgraph(nodeId: string, depth: number = 2): MemorySubgraph {
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const resultNodes: MemoryNode[] = [];
  const resultEdges: MemoryEdge[] = [];

  const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }];

  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (visitedNodes.has(id)) {continue;}
    visitedNodes.add(id);

    const node = nodes.get(id);
    if (!node) {continue;}

    resultNodes.push(node);

    // Bump access stats
    node.accessCount++;
    node.lastAccessedAt = ts();

    if (d >= depth) {continue;}

    const edgeIds = adjacency.get(id);
    if (!edgeIds) {continue;}

    for (const eid of edgeIds) {
      if (visitedEdges.has(eid)) {continue;}
      visitedEdges.add(eid);

      const edge = edges.get(eid);
      if (!edge) {continue;}
      resultEdges.push(edge);

      const neighborId = edge.source === id ? edge.target : edge.source;
      if (!visitedNodes.has(neighborId)) {
        queue.push({ id: neighborId, d: d + 1 });
      }
    }
  }

  return { nodes: resultNodes, edges: resultEdges };
}

/**
 * Find related nodes using spreading activation.
 * Starts from a seed node and propagates activation along edges,
 * weighted by edge strength. Returns top-K activated nodes.
 */
export function findRelated(nodeId: string, topK: number = 10): MemoryNode[] {
  const activation = new Map<string, number>();
  activation.set(nodeId, 1.0);

  const visited = new Set<string>();
  const queue = [nodeId];
  const DECAY = 0.6;
  const MAX_HOPS = 3;

  let hop = 0;
  while (queue.length > 0 && hop < MAX_HOPS) {
    const nextQueue: string[] = [];
    for (const currentId of queue) {
      if (visited.has(currentId)) {continue;}
      visited.add(currentId);

      const currentActivation = activation.get(currentId) ?? 0;
      const edgeIds = adjacency.get(currentId);
      if (!edgeIds) {continue;}

      for (const eid of edgeIds) {
        const edge = edges.get(eid);
        if (!edge) {continue;}

        const neighborId = edge.source === currentId ? edge.target : edge.source;
        const spread = currentActivation * edge.weight * DECAY;
        const prev = activation.get(neighborId) ?? 0;
        activation.set(neighborId, prev + spread);

        if (!visited.has(neighborId)) {
          nextQueue.push(neighborId);
        }
      }
    }
    queue.length = 0;
    queue.push(...nextQueue);
    hop++;
  }

  // Remove the seed node itself
  activation.delete(nodeId);

  // Sort by activation and return top-K
  return [...activation.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => nodes.get(id)!)
    .filter(Boolean);
}

/**
 * Search nodes by label (fuzzy: case-insensitive substring match).
 */
export function searchNodes(citizenId: string, query: string, topK: number = 10): MemoryNode[] {
  const lower = query.toLowerCase();
  const results: Array<{ node: MemoryNode; score: number }> = [];

  for (const node of nodes.values()) {
    if (node.citizenId !== citizenId) {continue;}
    const labelLower = node.label.toLowerCase();

    let score = 0;
    if (labelLower === lower) {
      score = 1.0;
    } else if (labelLower.includes(lower)) {
      score = 0.7;
    } else if (lower.includes(labelLower)) {
      score = 0.5;
    }

    if (score > 0) {
      // Boost by importance and access count
      score *= 0.7 + 0.3 * node.importance;
      results.push({ node, score });
    }
  }

  return results
    .toSorted((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => r.node);
}

// ─── Node Merge / Deduplication ─────────────────────────────────

/**
 * Merge two nodes: redirect all edges from `removeId` to `keepId`,
 * then delete the removed node.
 */
export function mergeNodes(keepId: string, removeId: string): boolean {
  const keep = nodes.get(keepId);
  const remove = nodes.get(removeId);
  if (!keep || !remove) {return false;}
  if (keep.citizenId !== remove.citizenId) {return false;}

  // Merge metadata
  Object.assign(keep.metadata, remove.metadata);
  keep.importance = Math.max(keep.importance, remove.importance);
  keep.accessCount += remove.accessCount;

  // Redirect edges
  const removeEdgeIds = adjacency.get(removeId);
  if (removeEdgeIds) {
    for (const eid of removeEdgeIds) {
      const edge = edges.get(eid);
      if (!edge) {continue;}

      // Skip self-loops that would result
      const otherId = edge.source === removeId ? edge.target : edge.source;
      if (otherId === keepId) {
        // Remove this edge entirely
        adjacency.get(otherId)?.delete(eid);
        edges.delete(eid);
        continue;
      }

      // Redirect edge
      if (edge.source === removeId) {edge.source = keepId;}
      if (edge.target === removeId) {edge.target = keepId;}

      // Move to keep's adjacency
      adjacency.get(keepId)?.add(eid);
      adjacency.get(otherId)?.add(eid);
    }
  }

  // Remove the old node
  adjacency.delete(removeId);
  nodes.delete(removeId);

  return true;
}

// ─── Graph Building ─────────────────────────────────────────────

/**
 * Build graph nodes and edges from a citizen's memory texts.
 * Extracts entities, classifies them, and creates co-occurrence edges
 * between entities found in the same memory.
 */
export function buildGraphFromMemories(
  citizenId: string,
  memories: Array<{ text: string; importance?: number }>,
): { nodesAdded: number; edgesAdded: number } {
  let nodesAdded = 0;
  let edgesAdded = 0;

  for (const mem of memories) {
    const entityLabels = extractEntities(mem.text);
    const memNodes: MemoryNode[] = [];

    for (const label of entityLabels) {
      const type = classifyEntity(label);
      const node = addNode(label, type, citizenId, undefined, mem.importance);
      if (node.accessCount === 1) {nodesAdded++;} // new node
      memNodes.push(node);
    }

    // Create co-occurrence edges between entities in the same memory
    for (let i = 0; i < memNodes.length; i++) {
      for (let j = i + 1; j < memNodes.length; j++) {
        const edge = addEdge(
          memNodes[i].id,
          memNodes[j].id,
          "co_occurs_with",
          citizenId,
          0.3 + (mem.importance ?? 0.5) * 0.4,
        );
        if (edge && !findEdge(memNodes[j].id, memNodes[i].id, "co_occurs_with")) {
          edgesAdded++;
        }
      }
    }
  }

  return { nodesAdded, edgesAdded };
}

// ─── Edge Decay ─────────────────────────────────────────────────

/**
 * Decay edge weights over time. Edges not reinforced lose strength.
 */
export function decayEdges(halfLifeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const now = Date.now();
  let decayed = 0;
  const toRemove: string[] = [];

  for (const [eid, edge] of edges) {
    const age = now - new Date(edge.lastReinforcedAt).getTime();
    if (age <= 0) {continue;}

    const factor = Math.pow(0.5, age / halfLifeMs);
    edge.weight *= factor;
    edge.lastReinforcedAt = ts(); // reset decay clock

    if (edge.weight < 0.01) {
      toRemove.push(eid);
    } else {
      decayed++;
    }
  }

  // Remove very weak edges
  for (const eid of toRemove) {
    const edge = edges.get(eid);
    if (edge) {
      adjacency.get(edge.source)?.delete(eid);
      adjacency.get(edge.target)?.delete(eid);
      edges.delete(eid);
    }
  }

  return decayed;
}

// ─── Eviction ───────────────────────────────────────────────────

function evictLeastImportantNodes(count: number): void {
  const sorted = [...nodes.values()].toSorted(
    (a, b) => a.importance * a.accessCount - b.importance * b.accessCount,
  );
  for (let i = 0; i < count && i < sorted.length; i++) {
    removeNode(sorted[i].id);
  }
}

function evictWeakestEdges(count: number): void {
  const sorted = [...edges.values()].toSorted((a, b) => a.weight - b.weight);
  for (let i = 0; i < count && i < sorted.length; i++) {
    const edge = sorted[i];
    adjacency.get(edge.source)?.delete(edge.id);
    adjacency.get(edge.target)?.delete(edge.id);
    edges.delete(edge.id);
  }
}

// ─── Tick Integration ───────────────────────────────────────────

export interface MemoryGraphTickResult {
  nodesTotal: number;
  edgesTotal: number;
  edgesDecayed: number;
}

/**
 * Per-tick maintenance: decay edges and evict weak nodes.
 * Runs every N ticks to avoid overhead.
 */
const GRAPH_TICK_INTERVAL = 50;
let graphTickCounter = 0;

export function memoryGraphTick(): MemoryGraphTickResult {
  graphTickCounter++;
  let edgesDecayed = 0;

  if (graphTickCounter % GRAPH_TICK_INTERVAL === 0) {
    edgesDecayed = decayEdges();
  }

  return {
    nodesTotal: nodes.size,
    edgesTotal: edges.size,
    edgesDecayed,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function memoryGraphDiagnostics(): MemoryGraphDiagnostics {
  const nodesByType: Record<string, number> = {};
  const citizenGraphSizes: Record<string, { nodes: number; edges: number }> = {};

  for (const node of nodes.values()) {
    nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
    if (!citizenGraphSizes[node.citizenId]) {
      citizenGraphSizes[node.citizenId] = { nodes: 0, edges: 0 };
    }
    citizenGraphSizes[node.citizenId].nodes++;
  }

  for (const edge of edges.values()) {
    if (!citizenGraphSizes[edge.citizenId]) {
      citizenGraphSizes[edge.citizenId] = { nodes: 0, edges: 0 };
    }
    citizenGraphSizes[edge.citizenId].edges++;
  }

  return {
    totalNodes: nodes.size,
    totalEdges: edges.size,
    nodesByType,
    citizenGraphSizes,
    avgEdgesPerNode: nodes.size > 0 ? edges.size / nodes.size : 0,
  };
}

// ─── State Reset (Testing) ──────────────────────────────────────

export function resetMemoryGraph(): void {
  nodes.clear();
  edges.clear();
  adjacency.clear();
  graphTickCounter = 0;
}
