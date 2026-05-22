/**
 * Republic Platform — Knowledge Distillation Engine
 *
 * Implements collective knowledge propagation across the entire citizen population.
 * Expert citizens automatically publish distillation packets; high-consensus facts
 * become "Republic Truths" seeded into everyone's knowledge base.
 *
 * Inspired by:
 *   - Knowledge Distillation (Hinton et al. 2015)
 *   - CTDE: Centralized Training, Decentralized Execution (IJCAI 2024)
 *   - MKT-MARL: Multi-task Knowledge Transfer in MARL (IEEE 2024)
 *   - Multi-Teacher KD with RL optimization (arXiv 2025)
 *   - Social learning / observational skill transfer (MLR Press 2024)
 *   - Bloom's Taxonomy (educational psychology) for knowledge depth classification
 *
 * Knowledge depth levels (Bloom's Taxonomy):
 *   1. Remember   — can recall facts
 *   2. Understand — can explain concepts
 *   3. Apply      — can use knowledge in problems
 *   4. Analyze    — can break down complex systems
 *   5. Evaluate   — can judge quality and make decisions
 *   6. Create     — can synthesize novel solutions
 */
// oxlint-disable eslint(curly)
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";
import { uid, ts } from "./utils.js";
import { getSemanticFacts } from "./experience-replay.js";

const logger = createSubsystemLogger("republic:knowledge-distillation");

// ─── Constants ──────────────────────────────────────────────────

const _MIN_EXPERT_FITNESS = 60;          // min fitness score to be an expert — reserved
const EXPERT_SKILL_THRESHOLD = 5;       // min unique skills to be considered expert
const CONSENSUS_THRESHOLD = 3;          // min experts agreeing → Republic Truth
const TRUTH_CONFIDENCE_THRESHOLD = 0.7; // min confidence to become a Republic Truth
const MAX_REPUBLIC_TRUTHS = 200;
const MAX_KNOWLEDGE_PACKETS = 500;
const DISTILLATION_INTERVAL = 100;      // ticks between distillation runs
const DEPRECIATION_INTERVAL = 300;      // ticks between fact depreciation
const MAX_PACKET_AGE_MS = 7 * 24 * 3600 * 1000; // 7 days

// ─── Bloom's Taxonomy ────────────────────────────────────────────

export type BloomsLevel = 1 | 2 | 3 | 4 | 5 | 6;

const BLOOMS_LABELS: Record<BloomsLevel, string> = {
  1: "Remember",
  2: "Understand",
  3: "Apply",
  4: "Analyze",
  5: "Evaluate",
  6: "Create",
};

function estimateBloomsLevel(skillCount: number, xp: number): BloomsLevel {
  const score = skillCount * 3 + Math.floor(xp / 100);
  if (score < 5) return 1;
  if (score < 12) return 2;
  if (score < 20) return 3;
  if (score < 30) return 4;
  if (score < 45) return 5;
  return 6;
}

// ─── Types ──────────────────────────────────────────────────────

export interface KnowledgePacket {
  id: string;
  authorId: string;
  authorName: string;
  domain: string;
  insights: string[];           // distilled insights from author's semantic memory
  bloomsLevel: BloomsLevel;
  bloomsLabel: string;
  confidence: number;           // 0-1
  transferFidelity: number;     // 0-1: at what % fidelity it transfers to recipients
  createdAt: number;            // Unix ms timestamp
  recipientCount: number;       // how many citizens have received this
}

export interface RepublicTruth {
  id: string;
  domain: string;
  truth: string;                // the distilled fact
  confidence: number;
  supportingExperts: string[];  // citizenIds of confirming experts
  bloomsLevel: BloomsLevel;
  bloomsLabel: string;
  createdAt: string;
  reinforcedAt: string;
  reinforcementCount: number;
}

export interface DistributionReport {
  packetsPublished: number;
  truthsCreated: number;
  truthsReinforced: number;
  citizensReceivingPackets: number;
  deprecatedFacts: number;
}

// ─── State ──────────────────────────────────────────────────────

const packets = new Map<string, KnowledgePacket>();
const republicTruths = new Map<string, RepublicTruth>();  // domain::truth → RepublicTruth
const citizenKnowledgeMap = new Map<string, Set<string>>(); // citizenId → packet IDs received
let lastDistillationTick = 0;
let lastDepreciationTick = 0;
let totalDistributions = 0;

// ─── Helper: find experts ────────────────────────────────────────

function isExpert(citizen: { skills: string[]; xp?: number }): boolean {
  return citizen.skills.length >= EXPERT_SKILL_THRESHOLD;
}

// ─── Core Distillation ──────────────────────────────────────────

/**
 * Publish a knowledge distillation packet from an expert citizen.
 * Extracts semantic facts from their experience-replay memory and wraps
 * them into a transferable packet.
 */
export function publishDistillationPacket(
  citizenId: string,
  citizenName: string,
  skills: string[],
  xp: number,
  domain: string,
): KnowledgePacket | null {
  const semanticFacts = getSemanticFacts(citizenId, domain);
  if (semanticFacts.length === 0) return null;

  const insights = semanticFacts
    .filter(f => f.confidence > 0.5)
    .slice(0, 5)
    .map(f => f.fact);

  if (insights.length === 0) return null;

  const skillCount = skills.length;
  const bloomsLevel = estimateBloomsLevel(skillCount, xp);
  const avgConfidence = semanticFacts.reduce((s, f) => s + f.confidence, 0) / semanticFacts.length;

  const packet: KnowledgePacket = {
    id: uid(),
    authorId: citizenId,
    authorName: citizenName,
    domain,
    insights,
    bloomsLevel,
    bloomsLabel: BLOOMS_LABELS[bloomsLevel],
    confidence: parseFloat(avgConfidence.toFixed(3)),
    transferFidelity: Math.min(0.95, 0.5 + bloomsLevel * 0.07),
    createdAt: Date.now(),
    recipientCount: 0,
  };

  packets.set(packet.id, packet);

  if (packets.size > MAX_KNOWLEDGE_PACKETS) {
    // Remove oldest packets
    const oldestId = Array.from(packets.keys())[0];
    if (oldestId) packets.delete(oldestId);
  }

  return packet;
}

/**
 * Check if a fact should become a Republic Truth (consensus mechanism).
 * If ≥ CONSENSUS_THRESHOLD experts share similar knowledge in the same domain,
 * it becomes canonical.
 */
function checkForRepublicTruth(domain: string, insight: string, authorId: string, confidence: number): void {
  const key = `${domain}::${insight.slice(0, 60)}`;
  const existing = republicTruths.get(key);

  if (existing) {
    if (!existing.supportingExperts.includes(authorId)) {
      existing.supportingExperts.push(authorId);
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.reinforcedAt = ts();
      existing.reinforcementCount++;
    }
    return;
  }

  if (confidence < TRUTH_CONFIDENCE_THRESHOLD) return;

  const truth: RepublicTruth = {
    id: uid(),
    domain,
    truth: insight,
    confidence,
    supportingExperts: [authorId],
    bloomsLevel: 3,
    bloomsLabel: BLOOMS_LABELS[3],
    createdAt: ts(),
    reinforcedAt: ts(),
    reinforcementCount: 1,
  };

  republicTruths.set(key, truth);

  if (republicTruths.size > MAX_REPUBLIC_TRUTHS) {
    // Remove least-supported truths
    const sorted = Array.from(republicTruths.entries())
      .toSorted(([, a], [, b]) => a.confidence - b.confidence);
    const toRemove = sorted.slice(0, sorted.length - MAX_REPUBLIC_TRUTHS);
    for (const [k] of toRemove) republicTruths.delete(k);
  }
}

/**
 * Distribute knowledge packets to citizens who haven't received them yet.
 * Lower-Blooms-level citizens receive distilled packets from higher-level experts.
 */
export function distributeKnowledge(s: RepublicState): DistributionReport {
  let packetsPublished = 0;
  let _truthsCreated = 0;
  let truthsReinforced = 0;
  let citizensReceiving = 0;

  const experts = s.citizens.filter(c => isExpert(c));
  const truePre = republicTruths.size;

  // 1. Publish packets from experts
  for (const expert of experts.slice(0, 20)) {
    const expertSkills = expert.skills;
    for (const skill of expertSkills.slice(0, 3)) {
      const domain = skill.toLowerCase().replace(/\s+/g, "_");
      const packet = publishDistillationPacket(
        expert.id, expert.name, expertSkills, expert.xp ?? 0, domain,
      );
      if (!packet) continue;
      packetsPublished++;

      // Check if any insight should become a Republic Truth
      for (const insight of packet.insights) {
        const prev = republicTruths.size;
        checkForRepublicTruth(domain, insight, expert.id, packet.confidence);
        if (republicTruths.size > prev) _truthsCreated++;
        else truthsReinforced++;
      }
    }
  }

  // 2. Distribute packets to non-experts
  const nonExperts = s.citizens.filter(c => !isExpert(c));
  const recentPackets = Array.from(packets.values())
    .filter(p => Date.now() - p.createdAt < MAX_PACKET_AGE_MS)
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, 20);

  for (const citizen of nonExperts.slice(0, 30)) {
    const received = citizenKnowledgeMap.get(citizen.id) ?? new Set();
    let gained = false;

    for (const packet of recentPackets) {
      if (received.has(packet.id)) continue;
      if (Math.random() > packet.transferFidelity) continue; // transfer not always successful

      // Transfer: give the citizen skills from the packet's domain
      const domainSkill = packet.domain.replace(/_/g, " ");
      if (!citizen.skills.includes(domainSkill) && citizen.skills.length < 30) {
        citizen.skills.push(domainSkill);
        citizen.xp = (citizen.xp ?? 0) + Math.round(packet.confidence * 10);
      }

      received.add(packet.id);
      packet.recipientCount++;
      gained = true;
      break; // one packet per citizen per distillation run
    }

    citizenKnowledgeMap.set(citizen.id, received);
    if (gained) citizensReceiving++;
  }

  totalDistributions++;
  const truePost = republicTruths.size;
  return {
    packetsPublished,
    truthsCreated: Math.max(0, truePost - truePre),
    truthsReinforced,
    citizensReceivingPackets: citizensReceiving,
    deprecatedFacts: 0,
  };
}

/**
 * Get all Republic Truths, optionally filtered by domain.
 */
export function getRepublicTruths(domain?: string, limit = 50): RepublicTruth[] {
  const all = Array.from(republicTruths.values());
  const filtered = domain ? all.filter(t => t.domain === domain) : all;
  return filtered
    .filter(t => t.supportingExperts.length >= CONSENSUS_THRESHOLD)
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

/**
 * Get knowledge packets authored by a specific citizen.
 */
export function getCitizenPackets(citizenId: string): KnowledgePacket[] {
  return Array.from(packets.values()).filter(p => p.authorId === citizenId);
}

/**
 * Deprecate low-confidence facts across the system.
 */
function deprecateFacts(): number {
  let removed = 0;
  for (const [key, truth] of republicTruths) {
    // Decay confidence for old truths not reinforced recently
    if (ts() > truth.reinforcedAt) {
      truth.confidence = Math.max(0.1, truth.confidence - 0.05);
    }
    if (truth.confidence < 0.2 && truth.supportingExperts.length < CONSENSUS_THRESHOLD) {
      republicTruths.delete(key);
      removed++;
    }
  }
  return removed;
}

/**
 * Get distillation diagnostics.
 */
export function getDistillationDiagnostics() {
  const truthsWithConsensus = getRepublicTruths(undefined, 1000).length;
  const domainCoverage = new Set(Array.from(republicTruths.values()).map(t => t.domain)).size;
  const topDomains = Array.from(republicTruths.values())
    .reduce((acc, t) => { acc[t.domain] = (acc[t.domain] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const sortedDomains = Object.entries(topDomains).toSorted(([, a], [, b]) => b - a).slice(0, 5);

  return {
    totalPackets: packets.size,
    totalRepublicTruths: republicTruths.size,
    truthsWithConsensus,
    domainCoverage,
    topDomains: sortedDomains,
    totalDistributions,
    citizenKnowledgeMaps: citizenKnowledgeMap.size,
  };
}

// ─── Main Tick ──────────────────────────────────────────────────

/**
 * Knowledge distillation tick.
 */
export function knowledgeDistillationTick(s: RepublicState): void {
  if (s.citizens.length === 0) return;

  if (s.currentTick - lastDistillationTick >= DISTILLATION_INTERVAL) {
    lastDistillationTick = s.currentTick;
    const report = distributeKnowledge(s);
    if (report.packetsPublished > 0 || report.truthsCreated > 0) {
      logger.info(`Distillation: ${report.packetsPublished} packets, ${report.truthsCreated} new truths, ` +
        `${report.citizensReceivingPackets} citizens enriched`);
    }
  }

  if (s.currentTick - lastDepreciationTick >= DEPRECIATION_INTERVAL) {
    lastDepreciationTick = s.currentTick;
    const removed = deprecateFacts();
    if (removed > 0) logger.debug(`Deprecated ${removed} stale Republic Truths`);
  }
}

