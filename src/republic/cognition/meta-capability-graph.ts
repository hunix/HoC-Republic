/**
 * Republic Platform — Meta-Capability Graph
 *
 * Invention #5: A living graph mapping citizens → capabilities,
 * enabling emergent division of labor, gap detection, and delegation.
 *
 * Performance fix (2026-03): O(1) lookup indexes for all hot paths.
 *   Before: ensureCapabilityNode = O(nodes), edges.find = O(edges)
 *   After:  O(1) via Map indexes — eliminates 1200ms+ tick overrun
 */

import type { Citizen } from "../types.js";
import { getEnabledTools } from "../tool-executor.js";
import { uid } from "../utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type NodeType = "citizen" | "capability" | "task";

export interface CapabilityNode {
  id: string;
  type: NodeType;
  label: string;
  category: string;
  metadata: Record<string, unknown>;
}

export interface CapabilityEdge {
  from: string;
  to: string;
  weight: number;
  edgeType: "proficient" | "requires" | "synergy";
}

export interface CapabilityGap {
  capability: string;
  category: string;
  demandCount: number;
  supplyCount: number;
  severity: number;
}

export interface DelegationRecommendation {
  taskDescription: string;
  recommendedCitizens: Array<{
    citizenId: string;
    citizenName: string;
    overallScore: number;
    matchingCapabilities: string[];
  }>;
}

export interface SynergyPair {
  citizenA: string;
  citizenB: string;
  combinedCapabilities: string[];
  synergyScore: number;
}

// ─── State ──────────────────────────────────────────────────────

const nodes = new Map<string, CapabilityNode>();

/** O(1) lookup: "label|category" → CapabilityNode */
const capabilityByLabelCat = new Map<string, CapabilityNode>();

/** O(1) lookup: "fromId|toId" → CapabilityEdge */
const edgeIndex = new Map<string, CapabilityEdge>();

/** All edges — kept for bulk ops only; capped to prevent unbounded growth */
const edges: CapabilityEdge[] = [];
const MAX_EDGES = 50_000;

/** citizenId → Set<capabilityId> */
const citizenCapabilities = new Map<string, Set<string>>();

/** capabilityId → Set<citizenId> */
const capabilityCitizens = new Map<string, Set<string>>();

/** capabilityId → count of "requires" edges pointing to it (O(1) lookup for detectGaps) */
const requiresEdgeCount = new Map<string, number>();

// ─── Helpers ───────────────────────────────────────────────────

function edgeKey(from: string, to: string): string {
  return `${from}|${to}`;
}

// ─── Graph Construction ─────────────────────────────────────────

/** Register a capability node — O(1) via label+category index */
function ensureCapabilityNode(
  label: string,
  category: string,
  metadata: Record<string, unknown> = {},
): CapabilityNode {
  const key = `${label}|${category}`;
  const existing = capabilityByLabelCat.get(key);
  if (existing) {
    return existing;
  }

  const node: CapabilityNode = {
    id: `cap-${uid().slice(0, 8)}`,
    type: "capability",
    label,
    category,
    metadata,
  };
  nodes.set(node.id, node);
  capabilityByLabelCat.set(key, node);
  return node;
}

/** Register a citizen in the graph and link their capabilities */
export function registerCitizen(citizen: Citizen): void {
  const citizenNode: CapabilityNode = {
    id: citizen.id,
    type: "citizen",
    label: citizen.name,
    category: citizen.specialization,
    metadata: { energy: citizen.energy, level: citizen.level ?? 0 },
  };
  nodes.set(citizenNode.id, citizenNode);

  const caps = new Set<string>();

  const specCap = ensureCapabilityNode(citizen.specialization, "specialization");
  addEdge(citizen.id, specCap.id, 0.8, "proficient");
  caps.add(specCap.id);

  for (const skill of citizen.skills) {
    const skillCap = ensureCapabilityNode(skill, "skill");
    addEdge(citizen.id, skillCap.id, 0.6, "proficient");
    caps.add(skillCap.id);
  }

  citizenCapabilities.set(citizen.id, caps);

  for (const capId of caps) {
    let citizenSet = capabilityCitizens.get(capId);
    if (!citizenSet) {
      citizenSet = new Set();
      capabilityCitizens.set(capId, citizenSet);
    }
    citizenSet.add(citizen.id);
  }
}

/** Add or update an edge — O(1) via edgeIndex */
function addEdge(
  from: string,
  to: string,
  weight: number,
  edgeType: CapabilityEdge["edgeType"],
): void {
  const key = edgeKey(from, to);
  const existing = edgeIndex.get(key);
  if (existing) {
    existing.weight = weight;
    existing.edgeType = edgeType;
  } else {
    const edge: CapabilityEdge = { from, to, weight, edgeType };
    edges.push(edge);
    edgeIndex.set(key, edge);
    // Maintain requires-edge count for O(1) detectGaps
    if (edgeType === "requires") {
      requiresEdgeCount.set(to, (requiresEdgeCount.get(to) ?? 0) + 1);
    }
    // Cap edges array — prune oldest third when limit hit
    if (edges.length > MAX_EDGES) {
      const pruneCount = Math.floor(MAX_EDGES / 3);
      const pruned = edges.splice(0, pruneCount);
      for (const p of pruned) {
        edgeIndex.delete(edgeKey(p.from, p.to));
        if (p.edgeType === "requires") {
          const c = requiresEdgeCount.get(p.to);
          if (c !== undefined && c > 1) { requiresEdgeCount.set(p.to, c - 1); }
          else { requiresEdgeCount.delete(p.to); }
        }
      }
    }
  }
}

/** Update a citizen's capability proficiency — O(1) */
export function updateProficiency(
  citizenId: string,
  capabilityLabel: string,
  category: string,
  delta: number,
): void {
  const cap = ensureCapabilityNode(capabilityLabel, category);
  const existing = edgeIndex.get(edgeKey(citizenId, cap.id));

  if (existing) {
    existing.weight = Math.max(0, Math.min(1, existing.weight + delta));
  } else {
    addEdge(citizenId, cap.id, Math.max(0, Math.min(1, 0.3 + delta)), "proficient");
    let caps = citizenCapabilities.get(citizenId);
    if (!caps) {
      caps = new Set();
      citizenCapabilities.set(citizenId, caps);
    }
    caps.add(cap.id);

    let citizenSet = capabilityCitizens.get(cap.id);
    if (!citizenSet) {
      citizenSet = new Set();
      capabilityCitizens.set(cap.id, citizenSet);
    }
    citizenSet.add(citizenId);
  }
}

// ─── Gap Detection ──────────────────────────────────────────────

/** Detect capabilities that are underserved — O(capabilities) */
export function detectGaps(): CapabilityGap[] {
  const gaps: CapabilityGap[] = [];

  for (const [capId, node] of nodes) {
    if (node.type !== "capability") {
      continue;
    }

    const citizens = capabilityCitizens.get(capId);
    const supplyCount = citizens?.size ?? 0;

    // O(1) demand lookup via requiresEdgeCount index
    const demandCount = Math.max(1, requiresEdgeCount.get(capId) ?? 0);

    const severity = supplyCount === 0 ? 1.0 : Math.max(0, 1 - supplyCount / demandCount);

    if (severity > 0.3) {
      gaps.push({
        capability: node.label,
        category: node.category,
        demandCount,
        supplyCount,
        severity,
      });
    }
  }

  return gaps.toSorted((a, b) => b.severity - a.severity);
}

// ─── Delegation Routing ─────────────────────────────────────────

/** Find capable citizens for a task — O(capabilities × citizens per capability) */
export function findBestCitizens(
  requiredCapabilities: string[],
  limit = 3,
): DelegationRecommendation {
  const citizenScores = new Map<string, { score: number; matching: string[]; name: string }>();

  for (const capLabel of requiredCapabilities) {
    // O(1) cap lookup — no node scan
    const capNode =
      capabilityByLabelCat.get(`${capLabel}|skill`) ??
      capabilityByLabelCat.get(`${capLabel}|specialization`) ??
      capabilityByLabelCat.get(`${capLabel}|tool`);
    if (!capNode) {
      continue;
    }

    const citizenIds = capabilityCitizens.get(capNode.id);
    if (!citizenIds) {
      continue;
    }

    for (const citizenId of citizenIds) {
      // O(1) edge lookup
      const edge = edgeIndex.get(edgeKey(citizenId, capNode.id));
      const proficiency = edge?.weight ?? 0;

      const existing = citizenScores.get(citizenId) ?? {
        score: 0,
        matching: [],
        name: nodes.get(citizenId)?.label ?? citizenId,
      };
      existing.score += proficiency;
      existing.matching.push(capLabel);
      citizenScores.set(citizenId, existing);
    }
  }

  const ranked = [...citizenScores.entries()]
    .map(([citizenId, data]) => ({
      citizenId,
      citizenName: data.name,
      overallScore: data.score / Math.max(1, requiredCapabilities.length),
      matchingCapabilities: data.matching,
    }))
    .toSorted((a, b) => b.overallScore - a.overallScore)
    .slice(0, limit);

  return {
    taskDescription: `Task requiring: ${requiredCapabilities.join(", ")}`,
    recommendedCitizens: ranked,
  };
}

// ─── Synergy Detection ──────────────────────────────────────────

/** Find citizen pairs with powerful synergies — bounded to first 100 citizens */
export function detectSynergies(limit = 10): SynergyPair[] {
  const citizenIds = [...citizenCapabilities.keys()];
  const pairs: SynergyPair[] = [];

  for (let i = 0; i < citizenIds.length && i < 100; i++) {
    for (let j = i + 1; j < citizenIds.length && j < 100; j++) {
      const capsA = citizenCapabilities.get(citizenIds[i]) ?? new Set();
      const capsB = citizenCapabilities.get(citizenIds[j]) ?? new Set();

      const union = new Set([...capsA, ...capsB]);
      const intersection = new Set([...capsA].filter((c) => capsB.has(c)));

      const uniqueCount = union.size - intersection.size;
      const overlapBonus = intersection.size * 0.1;
      const synergyScore = uniqueCount / Math.max(1, union.size) + overlapBonus;

      if (synergyScore > 0.4) {
        const combinedLabels = [...union].map((id) => nodes.get(id)?.label ?? id);
        pairs.push({
          citizenA: citizenIds[i],
          citizenB: citizenIds[j],
          combinedCapabilities: combinedLabels,
          synergyScore: Math.min(1, synergyScore),
        });
      }
    }
  }

  return pairs.toSorted((a, b) => b.synergyScore - a.synergyScore).slice(0, limit);
}

// ─── Tick Integration ───────────────────────────────────────────

/** Per-tick maintenance: refresh citizen capabilities — now O(citizens × skills) via indexes */
export function capabilityGraphTick(citizens: Citizen[], budgetMs = 30): number {
  const start = performance.now();

  // Register new tools as capability nodes (O(tools) with O(1) lookup per tool)
  const tools = getEnabledTools();
  for (const tool of tools) {
    ensureCapabilityNode(tool.id, "tool", {
      description: tool.description,
      tier: tool.tier,
      type: "auto-injected",
    });
  }

  let processed = 0;
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    if (!nodes.has(citizen.id)) {
      registerCitizen(citizen);
    } else {
      // Update metadata — O(1)
      const node = nodes.get(citizen.id);
      if (node) {
        node.metadata.energy = citizen.energy;
        node.metadata.level = citizen.level ?? 0;
      }

      // Check for new skills — O(skills) with O(1) cap lookup (was O(nodes) via linear scan)
      const caps = citizenCapabilities.get(citizen.id) ?? new Set();
      for (const skill of citizen.skills) {
        const capNode = capabilityByLabelCat.get(`${skill}|skill`);
        if (capNode && !caps.has(capNode.id)) {
          addEdge(citizen.id, capNode.id, 0.5, "proficient");
          caps.add(capNode.id);

          let citizenSet = capabilityCitizens.get(capNode.id);
          if (!citizenSet) {
            citizenSet = new Set();
            capabilityCitizens.set(capNode.id, citizenSet);
          }
          citizenSet.add(citizen.id);
          citizenCapabilities.set(citizen.id, caps);
        }
      }
    }
    processed++;

    // Budget gate: check every 50 citizens
    if (processed % 50 === 0 && performance.now() - start > budgetMs) {
      break;
    }
  }
  return processed;
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getCapabilityGraphDiagnostics(): {
  totalNodes: number;
  citizenNodes: number;
  capabilityNodes: number;
  totalEdges: number;
  topGaps: CapabilityGap[];
  topSynergies: Array<{ citizenA: string; citizenB: string; score: number }>;
} {
  let citizenCount = 0;
  let capCount = 0;
  for (const node of nodes.values()) {
    if (node.type === "citizen") {
      citizenCount++;
    }
    if (node.type === "capability") {
      capCount++;
    }
  }

  const gaps = detectGaps().slice(0, 5);
  const synergies = detectSynergies(5).map((s) => ({
    citizenA: s.citizenA,
    citizenB: s.citizenB,
    score: s.synergyScore,
  }));

  return {
    totalNodes: nodes.size,
    citizenNodes: citizenCount,
    capabilityNodes: capCount,
    totalEdges: edges.length,
    topGaps: gaps,
    topSynergies: synergies,
  };
}
