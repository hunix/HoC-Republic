/**
 * Republic Platform — Neuro-Symbolic Reasoning Engine
 *
 * Phase AGI-2: Knowledge Graph Reasoning + Logical Inference.
 *
 * Inspired by:
 *   - GNN-RAG (arXiv 2024) — Graph Neural Retrieval for LLM reasoning
 *   - LogiCity (NeurIPS 2024) — neuro-symbolic urban simulations
 *   - SciAgents — multi-agent graph reasoning for discovery
 *
 * Capabilities:
 *   1. Knowledge graph construction from articles, experiences, and skills
 *   2. Deductive inference (syllogistic: A→B, B→C ∴ A→C)
 *   3. Inductive inference (pattern generalization)
 *   4. Abductive inference (best explanation)
 *   5. Analogy detection across domains
 */

import type { Citizen, RepublicState } from "./types.js";
import { rng, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

const REASONING_TICK_INTERVAL = 15;
const MAX_KNOWLEDGE_NODES = 500;
const MAX_KNOWLEDGE_EDGES = 2000;
const MAX_STORED_INFERENCES = 200;
const MAX_INFERENCES_PER_SESSION = 5;
const MIN_INFERENCE_CONFIDENCE = 0.3;
const MAX_CHAIN_DEPTH = 5;

// ─── Types ──────────────────────────────────────────────────────

export interface KnowledgeNode {
  id: string;
  concept: string;
  domain: string;
  properties: Record<string, string | number | boolean>;
  sourceId: string;
  referenceCount: number;
  createdAt: number;
}

export type ReasoningRelation =
  | "causes"
  | "prevents"
  | "requires"
  | "enables"
  | "is_a"
  | "part_of"
  | "analogous_to"
  | "contradicts"
  | "implies"
  | "correlates_with"
  | "precedes"
  | "follows";

export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  relation: ReasoningRelation;
  strength: number;
  evidence: number;
  citizenId: string;
}

export interface Inference {
  id: string;
  type: "deduction" | "induction" | "abduction" | "analogy";
  premises: string[];
  conclusion: string;
  confidence: number;
  derivationChain: string[];
  novelty: number;
  citizenId: string;
  createdAt: number;
  validated: boolean;
}

export interface ReasoningDiagnostics {
  totalNodes: number;
  totalEdges: number;
  totalInferences: number;
  novelInferences: number;
  avgConfidence: number;
  topCitizens: Array<{ id: string; name: string; inferences: number }>;
  lastTick: number;
}

// ─── Graph Store ────────────────────────────────────────────────

const knowledgeNodes: KnowledgeNode[] = [];
const knowledgeEdges: KnowledgeEdge[] = [];
const allInferences: Inference[] = [];
const citizenInferenceCounts = new Map<string, number>();

// ─── Knowledge Graph Construction ───────────────────────────────

/** Extract knowledge nodes from citizen skills and profile */
export function extractNodesFromCitizen(citizen: Citizen): KnowledgeNode[] {
  const nodes: KnowledgeNode[] = [];
  for (const skill of citizen.skills) {
    const existing = knowledgeNodes.find((n) => n.concept === skill && n.domain === "skill");
    if (existing) {
      existing.referenceCount++;
      continue;
    }
    nodes.push({
      id: uid(),
      concept: skill,
      domain: "skill",
      properties: { citizenId: citizen.id },
      sourceId: citizen.id,
      referenceCount: 1,
      createdAt: Date.now(),
    });
  }
  if (citizen.professionalProfile) {
    for (const cert of citizen.professionalProfile.certifications) {
      const existing = knowledgeNodes.find(
        (n) => n.concept === cert.domainPath && n.domain === "certification",
      );
      if (existing) {
        existing.referenceCount++;
        continue;
      }
      nodes.push({
        id: uid(),
        concept: cert.domainPath,
        domain: "certification",
        properties: { level: cert.level },
        sourceId: citizen.id,
        referenceCount: 1,
        createdAt: Date.now(),
      });
    }
  }
  return nodes;
}

function inferRelation(a: KnowledgeNode, b: KnowledgeNode): ReasoningRelation {
  if (a.domain === b.domain) {
    return "correlates_with";
  }
  if (a.domain === "skill" && b.domain === "certification") {
    return "enables";
  }
  if (b.domain === "skill" && a.domain === "certification") {
    return "requires";
  }
  if (a.domain === "research" && b.domain === "skill") {
    return "implies";
  }
  return "correlates_with";
}

/** Build edges from co-occurring knowledge nodes */
export function buildEdgesFromCooccurrence(citizenId: string, nodeIds: string[]): KnowledgeEdge[] {
  const edges: KnowledgeEdge[] = [];
  if (nodeIds.length < 2) {
    return edges;
  }
  for (let i = 0; i < Math.min(nodeIds.length - 1, 10); i++) {
    for (let j = i + 1; j < Math.min(nodeIds.length, 10); j++) {
      const a = knowledgeNodes.find((n) => n.id === nodeIds[i]);
      const b = knowledgeNodes.find((n) => n.id === nodeIds[j]);
      if (!a || !b) {
        continue;
      }
      const existing = knowledgeEdges.find(
        (e) => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id),
      );
      if (existing) {
        existing.evidence++;
        existing.strength = Math.min(1, existing.strength + 0.05);
        continue;
      }
      edges.push({
        id: uid(),
        from: a.id,
        to: b.id,
        relation: inferRelation(a, b),
        strength: 0.3 + rng() * 0.2,
        evidence: 1,
        citizenId,
      });
    }
  }
  return edges;
}

// ─── Deductive Inference: A→B, B→C ∴ A→C ───────────────────────

export function deductiveInference(startNodeId: string, citizenId: string): Inference[] {
  const results: Inference[] = [];
  const visited = new Set<string>();
  const transitive: Array<{ relation: ReasoningRelation }> = [
    { relation: "implies" },
    { relation: "causes" },
    { relation: "enables" },
  ];

  function traverse(currentId: string, chain: string[], edgeChain: string[], depth: number): void {
    if (depth >= MAX_CHAIN_DEPTH || visited.has(currentId)) {
      return;
    }
    visited.add(currentId);
    const outEdges = knowledgeEdges.filter(
      (e) => e.from === currentId && transitive.some((t) => t.relation === e.relation),
    );
    for (const edge of outEdges) {
      const newChain = [...chain, edge.to];
      const newEdgeChain = [...edgeChain, edge.id];
      if (newChain.length >= 2) {
        const startNode = knowledgeNodes.find((n) => n.id === startNodeId);
        const endNode = knowledgeNodes.find((n) => n.id === newChain[newChain.length - 1]);
        if (startNode && endNode) {
          const confidence = newEdgeChain.reduce((c, eId) => {
            const e = knowledgeEdges.find((x) => x.id === eId);
            return c * (e?.strength ?? 0.5);
          }, 1.0);
          if (confidence >= MIN_INFERENCE_CONFIDENCE) {
            const alreadyKnown = knowledgeEdges.some(
              (e) => e.from === startNodeId && e.to === endNode.id,
            );
            results.push({
              id: uid(),
              type: "deduction",
              premises: [startNodeId, ...newChain],
              conclusion: `${startNode.concept} → ${endNode.concept} (${newChain.length}-step)`,
              confidence,
              derivationChain: newEdgeChain,
              novelty: alreadyKnown ? 0.1 : 0.8,
              citizenId,
              createdAt: Date.now(),
              validated: false,
            });
          }
        }
      }
      traverse(edge.to, newChain, newEdgeChain, depth + 1);
    }
  }
  traverse(startNodeId, [], [], 0);
  return results;
}

// ─── Inductive Inference ────────────────────────────────────────

export function inductiveInference(domain: string, citizenId: string): Inference[] {
  const domainNodes = knowledgeNodes.filter((n) => n.domain === domain);
  if (domainNodes.length < 3) {
    return [];
  }
  const propSets = domainNodes.map((n) => Object.keys(n.properties));
  const commonProps = propSets.reduce((common, props) => common.filter((p) => props.includes(p)));
  if (commonProps.length === 0) {
    return [];
  }
  return [
    {
      id: uid(),
      type: "induction",
      premises: domainNodes.slice(0, 5).map((n) => n.id),
      conclusion: `All ${domain} concepts share: ${commonProps.join(", ")}`,
      confidence: Math.min(0.9, domainNodes.length / Math.max(1, knowledgeNodes.length) + 0.2),
      derivationChain: [],
      novelty: 0.5,
      citizenId,
      createdAt: Date.now(),
      validated: false,
    },
  ];
}

// ─── Abductive Inference ────────────────────────────────────────

export function abductiveInference(nodeId: string, citizenId: string): Inference[] {
  const incoming = knowledgeEdges.filter(
    (e) => e.to === nodeId && ["causes", "enables", "implies"].includes(e.relation),
  );
  if (incoming.length === 0) {
    return [];
  }
  const best = incoming.reduce((a, b) => (a.strength > b.strength ? a : b));
  const causeNode = knowledgeNodes.find((n) => n.id === best.from);
  const effectNode = knowledgeNodes.find((n) => n.id === nodeId);
  if (!causeNode || !effectNode) {
    return [];
  }
  return [
    {
      id: uid(),
      type: "abduction",
      premises: [nodeId],
      conclusion: `Best explanation for ${effectNode.concept}: ${causeNode.concept}`,
      confidence: best.strength,
      derivationChain: [best.id],
      novelty: 0.4,
      citizenId,
      createdAt: Date.now(),
      validated: false,
    },
  ];
}

// ─── Analogy Detection ──────────────────────────────────────────

export function detectAnalogies(domain1: string, domain2: string, citizenId: string): Inference[] {
  const results: Inference[] = [];
  const n1 = knowledgeNodes.filter((n) => n.domain === domain1);
  const n2 = knowledgeNodes.filter((n) => n.domain === domain2);
  if (n1.length < 2 || n2.length < 2) {
    return results;
  }
  const e1 = knowledgeEdges.filter(
    (e) => n1.some((n) => n.id === e.from) && n1.some((n) => n.id === e.to),
  );
  const e2 = knowledgeEdges.filter(
    (e) => n2.some((n) => n.id === e.from) && n2.some((n) => n.id === e.to),
  );
  for (const ea of e1.slice(0, 5)) {
    for (const eb of e2.slice(0, 5)) {
      if (ea.relation === eb.relation) {
        const fA = knowledgeNodes.find((n) => n.id === ea.from);
        const tA = knowledgeNodes.find((n) => n.id === ea.to);
        const fB = knowledgeNodes.find((n) => n.id === eb.from);
        const tB = knowledgeNodes.find((n) => n.id === eb.to);
        if (fA && tA && fB && tB) {
          results.push({
            id: uid(),
            type: "analogy",
            premises: [ea.from, ea.to, eb.from, eb.to],
            conclusion: `${fA.concept}→${tA.concept} ≈ ${fB.concept}→${tB.concept}`,
            confidence: Math.min(ea.strength, eb.strength) * 0.8,
            derivationChain: [ea.id, eb.id],
            novelty: 0.9,
            citizenId,
            createdAt: Date.now(),
            validated: false,
          });
          if (results.length >= 2) {
            return results;
          }
        }
      }
    }
  }
  return results;
}

// ─── Validate ───────────────────────────────────────────────────

export function validateInference(inference: Inference): boolean {
  for (const pid of inference.premises) {
    const contradictions = knowledgeEdges.filter(
      (e) => (e.from === pid || e.to === pid) && e.relation === "contradicts",
    );
    if (contradictions.length > 0) {
      inference.confidence *= 0.5;
    }
  }
  inference.validated = inference.confidence >= MIN_INFERENCE_CONFIDENCE;
  return inference.validated;
}

// ─── Reasoning Session ──────────────────────────────────────────

function runReasoningSession(citizen: Citizen, _s: RepublicState): void {
  const newNodes = extractNodesFromCitizen(citizen);
  for (const node of newNodes) {
    if (knowledgeNodes.length >= MAX_KNOWLEDGE_NODES) {
      knowledgeNodes.shift();
    }
    knowledgeNodes.push(node);
  }
  const cids = knowledgeNodes.filter((n) => n.sourceId === citizen.id).map((n) => n.id);
  const newEdges = buildEdgesFromCooccurrence(citizen.id, cids);
  for (const edge of newEdges) {
    if (knowledgeEdges.length >= MAX_KNOWLEDGE_EDGES) {
      knowledgeEdges.shift();
    }
    knowledgeEdges.push(edge);
  }

  const sessionInferences: Inference[] = [];
  if (cids.length > 0) {
    sessionInferences.push(
      ...deductiveInference(cids[Math.floor(rng() * cids.length)], citizen.id).slice(0, 2),
    );
  }
  const domains = [
    ...new Set(knowledgeNodes.filter((n) => n.sourceId === citizen.id).map((n) => n.domain)),
  ];
  if (domains.length > 0) {
    sessionInferences.push(
      ...inductiveInference(domains[Math.floor(rng() * domains.length)], citizen.id).slice(0, 1),
    );
  }
  if (cids.length > 0) {
    sessionInferences.push(
      ...abductiveInference(cids[Math.floor(rng() * cids.length)], citizen.id).slice(0, 1),
    );
  }
  if (domains.length >= 2) {
    sessionInferences.push(...detectAnalogies(domains[0], domains[1], citizen.id).slice(0, 1));
  }

  const valid = sessionInferences
    .filter((i) => validateInference(i))
    .slice(0, MAX_INFERENCES_PER_SESSION);
  for (const inf of valid) {
    if (allInferences.length >= MAX_STORED_INFERENCES) {
      allInferences.shift();
    }
    allInferences.push(inf);
  }
  citizenInferenceCounts.set(
    citizen.id,
    (citizenInferenceCounts.get(citizen.id) ?? 0) + valid.length,
  );
  const novelCount = valid.filter((i) => i.novelty > 0.5).length;
  if (novelCount > 0 && citizen.xp !== undefined) {
    citizen.xp += novelCount * 5;
  }

  // Upgrade G: validate unconfirmed inferences against recent action outcomes
  // Match inferred concept labels to tool names in actionHistory.
  // Success match → confidence +0.1 + validated; failure match → confidence -0.2 (may prune).
  const recentActions = citizen.actionHistory?.slice(-10) ?? [];
  for (const inference of allInferences.filter((i) => !i.validated && i.citizenId === citizen.id)) {
    const conclusionLower = inference.conclusion.toLowerCase();
    for (const action of recentActions) {
      if (!action.tool) { continue; }
      const toolLower = action.tool.toLowerCase();
      if (conclusionLower.includes(toolLower)) {
        if (action.success) {
          inference.confidence = Math.min(1, inference.confidence + 0.1);
          inference.validated = inference.confidence >= MIN_INFERENCE_CONFIDENCE;
        } else {
          inference.confidence = Math.max(0, inference.confidence - 0.2);
        }
      }
    }
  }
  // Prune inferences that fell below the minimum confidence threshold
  const cutoff = allInferences.findIndex((i) => i.citizenId === citizen.id && i.confidence < MIN_INFERENCE_CONFIDENCE);
  if (cutoff >= 0) {
    allInferences.splice(cutoff, 1);
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

export function reasoningTick(s: RepublicState): void {
  if (s.currentTick % REASONING_TICK_INTERVAL !== 0) {
    return;
  }
  const eligible = s.citizens.filter(
    (c) => c.skills.length >= 3 || (c.professionalProfile?.certifications.length ?? 0) > 0,
  );
  // Dynamic batch: scales with population so large simulations get proportionally more reasoning
  const batch = Math.min(10, Math.max(1, Math.ceil(eligible.length / 100)));
  const shuffled = [...eligible].toSorted(() => rng() - 0.5);
  for (let i = 0; i < batch; i++) {
    runReasoningSession(shuffled[i], s);
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function reasoningDiagnostics(): ReasoningDiagnostics {
  return {
    totalNodes: knowledgeNodes.length,
    totalEdges: knowledgeEdges.length,
    totalInferences: allInferences.length,
    novelInferences: allInferences.filter((i) => i.novelty > 0.5).length,
    avgConfidence:
      allInferences.length > 0
        ? allInferences.reduce((s, i) => s + i.confidence, 0) / allInferences.length
        : 0,
    topCitizens: Array.from(citizenInferenceCounts.entries())
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, c]) => ({ id, name: id, inferences: c })),
    lastTick: Date.now(),
  };
}

export function getKnowledgeGraph(): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
  return { nodes: [...knowledgeNodes], edges: [...knowledgeEdges] };
}

export function getInferences(): Inference[] {
  return [...allInferences];
}
