/**
 * Republic Platform — Experience Replay & Episodic Memory
 *
 * Implements 3-tier memory architecture for all citizens:
 *   Tier 1 — Flashbulb  : vivid high-salience events (permanent)
 *   Tier 2 — Working    : recent 200 experiences (rolling window)
 *   Tier 3 — Semantic   : distilled long-term facts (from consolidation)
 *
 * Inspired by:
 *   - DQN Prioritized Experience Replay (PER, Schaul et al. 2016)
 *   - Mem0/Zep episodic memory for AI agents (2025)
 *   - Dreamer world-model based replay (Hafner et al. 2023)
 *   - Selective/sparse experience replay (AAAI 2024)
 *   - Biological sleep-based memory consolidation
 *
 * Key innovations:
 *   - Priority = |TD-error| analog: high-surprise or high-reward stays longer
 *   - Memory consolidation ("sleep") converts episodic → semantic summaries
 *   - Cross-citizen experience sharing: top performers share anonymized traces
 *   - Anti-forgetting: tracks skill decay and replays to reinforce
 */
// oxlint-disable eslint(curly)
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";
// oxlint-disable-next-line no-unused-vars
import { uid, ts } from "./utils.js";

const logger = createSubsystemLogger("republic:experience-replay");

// ─── Constants ──────────────────────────────────────────────────

const MAX_WORKING_MEMORY = 200;     // per citizen ring buffer
const MAX_FLASHBULB = 30;           // permanent vivid memories
const MAX_SEMANTIC = 100;           // distilled long-term facts per citizen
const SALIENCE_THRESHOLD = 0.8;     // above this → flashbulb
const CONSOLIDATION_INTERVAL = 100; // ticks between sleep/consolidation passes
const SHARE_TOP_N = 5;              // top citizens to share traces from

// ─── Types ──────────────────────────────────────────────────────

export type ExperienceOutcome = "success" | "failure" | "partial" | "neutral";

export interface Experience {
  id: string;
  citizenId: string;
  action: string;
  domain: string;
  context: string;
  outcome: ExperienceOutcome;
  reward: number;        // -1 to +1
  salience: number;      // computed priority score
  tick: number;
  timestamp: number;
  /** TD-error analog: how surprising was this outcome? */
  surprise: number;
}

export interface EpisodicEntry {
  id: string;
  citizenId: string;
  type: "flashbulb" | "working";
  experience: Experience;
  replayCount: number;
  lastReplayedTick: number;
}

export interface SemanticFact {
  id: string;
  citizenId: string;
  domain: string;
  fact: string;           // distilled lesson
  confidence: number;     // 0-1
  sourceCount: number;    // how many experiences distilled into this
  createdAt: number;
  reinforcedAt: number;
  decayRate: number;      // how fast confidence fades without reinforcement
}

export interface ReplayBatch {
  citizenId: string;
  experiences: Experience[];
  semanticHints: string[];  // relevant semantic facts for context
}

interface CitizenMemory {
  flashbulb: EpisodicEntry[];
  working: EpisodicEntry[];
  semantic: SemanticFact[];
  lastConsolidationTick: number;
  totalExperiencesAdded: number;
}

// ─── State ──────────────────────────────────────────────────────

const memories = new Map<string, CitizenMemory>();
let globalTick = 0;

// ─── Memory Init ────────────────────────────────────────────────

function ensureMemory(citizenId: string): CitizenMemory {
  if (memories.has(citizenId)) return memories.get(citizenId)!;
  const mem: CitizenMemory = {
    flashbulb: [],
    working: [],
    semantic: [],
    lastConsolidationTick: 0,
    totalExperiencesAdded: 0,
  };
  memories.set(citizenId, mem);
  return mem;
}

// ─── Priority Computation ────────────────────────────────────────

/**
 * Prioritized Experience Replay score.
 * High surprise + high abs(reward) = high priority for replay.
 * Inspired by PER (Schaul 2016) with α = 0.6.
 */
function computeSalience(reward: number, surprise: number, outcome: ExperienceOutcome): number {
  const rewardWeight = Math.abs(reward);
  const outcomeBonus = outcome === "failure" ? 0.3 : outcome === "success" ? 0.2 : 0;
  return Math.min(1, (rewardWeight * 0.5 + surprise * 0.3 + outcomeBonus) * 1.2);
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Add a new experience to a citizen's replay buffer.
 * High-salience experiences may become flashbulbs (permanent).
 */
export function addExperience(
  citizenId: string,
  action: string,
  domain: string,
  context: string,
  outcome: ExperienceOutcome,
  reward: number,
  surprise = 0.5,
  tick = globalTick,
): Experience {
  const mem = ensureMemory(citizenId);
  const salience = computeSalience(reward, surprise, outcome);

  const exp: Experience = {
    id: uid(),
    citizenId,
    action,
    domain,
    context,
    outcome,
    reward: Math.max(-1, Math.min(1, reward)),
    salience,
    tick,
    timestamp: Date.now(),
    surprise: Math.max(0, Math.min(1, surprise)),
  };

  // Flashbulb for very salient events
  if (salience >= SALIENCE_THRESHOLD) {
    const entry: EpisodicEntry = {
      id: uid(),
      citizenId,
      type: "flashbulb",
      experience: exp,
      replayCount: 0,
      lastReplayedTick: tick,
    };
    mem.flashbulb.push(entry);
    if (mem.flashbulb.length > MAX_FLASHBULB) {
      // Keep the most salient flashbulbs
      mem.flashbulb = mem.flashbulb
        .toSorted((a, b) => b.experience.salience - a.experience.salience)
        .slice(0, MAX_FLASHBULB);
    }
  }

  // Always go into working memory
  const entry: EpisodicEntry = {
    id: uid(),
    citizenId,
    type: "working",
    experience: exp,
    replayCount: 0,
    lastReplayedTick: tick,
  };
  mem.working.push(entry);

  // Ring buffer: keep most recently salient
  if (mem.working.length > MAX_WORKING_MEMORY) {
    mem.working = mem.working
      .toSorted((a, b) => b.experience.salience - a.experience.salience)
      .slice(0, MAX_WORKING_MEMORY);
  }

  mem.totalExperiencesAdded++;
  return exp;
}

/**
 * Sample a replay batch from a citizen's memory.
 * Uses prioritized sampling: higher salience → higher probability.
 * Also includes relevant semantic facts as context.
 */
export function sampleReplay(citizenId: string, n = 10, domain?: string): ReplayBatch {
  const mem = ensureMemory(citizenId);
  const candidates = [
    ...mem.flashbulb.map(e => e.experience),
    ...mem.working.map(e => e.experience),
  ];

  const filtered = domain
    ? candidates.filter(e => e.domain === domain)
    : candidates;

  if (filtered.length === 0) return { citizenId, experiences: [], semanticHints: [] };

  // Weighted sampling by salience (PER)
  const totalWeight = filtered.reduce((s, e) => s + e.salience, 0) || 1;
  const sampled: Experience[] = [];
  const seen = new Set<string>();

  for (let attempts = 0; attempts < n * 3 && sampled.length < n; attempts++) {
    let r = Math.random() * totalWeight;
    for (const exp of filtered) {
      r -= exp.salience;
      if (r <= 0 && !seen.has(exp.id)) {
        sampled.push(exp);
        seen.add(exp.id);
        break;
      }
    }
  }

  // Retrieve relevant semantic facts
  const semanticHints = mem.semantic
    .filter(f => !domain || f.domain === domain)
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map(f => f.fact);

  // Mark as replayed
  for (const e of sampled) {
    const entry = mem.working.find(w => w.experience.id === e.id) ??
                  mem.flashbulb.find(f => f.experience.id === e.id);
    if (entry) {
      entry.replayCount++;
      entry.lastReplayedTick = globalTick;
    }
  }

  return { citizenId, experiences: sampled, semanticHints };
}

/**
 * Consolidate episodic memory → semantic facts ("sleep" pass).
 * Groups recent working memories by domain and extracts lessons.
 * Old working memories with low salience are pruned after consolidation.
 */
export function consolidateMemory(citizenId: string): SemanticFact[] {
  const mem = ensureMemory(citizenId);
  const newFacts: SemanticFact[] = [];

  // Group working memories by domain
  const byDomain = new Map<string, Experience[]>();
  for (const entry of mem.working) {
    const exp = entry.experience;
    const list = byDomain.get(exp.domain) ?? [];
    list.push(exp);
    byDomain.set(exp.domain, list);
  }

  for (const [domain, exps] of byDomain) {
    if (exps.length < 3) continue; // need enough signal to distill

    const successes = exps.filter(e => e.outcome === "success");
    const failures = exps.filter(e => e.outcome === "failure");
    const avgReward = exps.reduce((s, e) => s + e.reward, 0) / exps.length;

    // Construct a semantic lesson
    let factText = "";
    if (successes.length > failures.length) {
      const topAction = successes.toSorted((a, b) => b.reward - a.reward)[0]?.action ?? "unknown";
      factText = `In ${domain}, action "${topAction}" tends to succeed (${successes.length}/${exps.length} positive outcomes, avg reward ${avgReward.toFixed(2)})`;
    } else if (failures.length > 0) {
      const badAction = failures.toSorted((a, b) => a.reward - b.reward)[0]?.action ?? "unknown";
      factText = `In ${domain}, action "${badAction}" tends to fail — avoid or adapt it`;
    }

    if (!factText) continue;

    // Check if fact already exists — reinforce it
    const existing = mem.semantic.find(f => f.domain === domain && f.fact.includes(domain));
    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.reinforcedAt = Date.now();
      existing.sourceCount += exps.length;
    } else {
      const fact: SemanticFact = {
        id: uid(),
        citizenId,
        domain,
        fact: factText,
        confidence: Math.min(1, 0.4 + exps.length * 0.05),
        sourceCount: exps.length,
        createdAt: Date.now(),
        reinforcedAt: Date.now(),
        decayRate: 0.005,
      };
      mem.semantic.push(fact);
      newFacts.push(fact);
    }
  }

  // Prune low-salience working memories post-consolidation
  mem.working = mem.working.filter(e => e.experience.salience > 0.3 || e.replayCount < 2);

  // Cap semantic facts
  if (mem.semantic.length > MAX_SEMANTIC) {
    mem.semantic = mem.semantic
      .toSorted((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_SEMANTIC);
  }

  mem.lastConsolidationTick = globalTick;
  return newFacts;
}

/**
 * Get episodic memory entries for a citizen.
 */
export function getEpisodicMemory(
  citizenId: string,
  opts: { type?: "flashbulb" | "working"; domain?: string; limit?: number } = {},
): EpisodicEntry[] {
  const mem = memories.get(citizenId);
  if (!mem) return [];

  let entries = opts.type === "flashbulb" ? mem.flashbulb
    : opts.type === "working" ? mem.working
    : [...mem.flashbulb, ...mem.working];

  if (opts.domain) entries = entries.filter(e => e.experience.domain === opts.domain);
  return entries
    .toSorted((a, b) => b.experience.salience - a.experience.salience)
    .slice(0, opts.limit ?? 50);
}

/**
 * Get distilled semantic facts for a citizen.
 */
export function getSemanticFacts(citizenId: string, domain?: string): SemanticFact[] {
  const mem = memories.get(citizenId);
  if (!mem) return [];
  const facts = domain ? mem.semantic.filter(f => f.domain === domain) : mem.semantic;
  return facts.toSorted((a, b) => b.confidence - a.confidence);
}

/**
 * Share high-confidence semantic facts from top citizens to the population.
 * Enhanced with specialization-aware sharing:
 * - Same specialization → 85% fidelity (domain experts share deep knowledge)
 * - Cross specialization → 60% fidelity (general wisdom is less transferable)
 * Returns a summary of what was shared.
 */
export function shareExperiencesTopDown(s: RepublicState): { shared: number; bySpec: number } {
  if (s.citizens.length === 0) return { shared: 0, bySpec: 0 };

  // Phase 1: Global top-down sharing (existing behavior, refined fidelity)
  const ranked = s.citizens
    .map(c => ({ c, score: (memories.get(c.id)?.totalExperiencesAdded ?? 0) + (memories.get(c.id)?.semantic.length ?? 0) * 5 }))
    .toSorted((a, b) => b.score - a.score);

  const topCitizens = ranked.slice(0, SHARE_TOP_N).map(r => r.c);
  const bottomCitizens = ranked.slice(-SHARE_TOP_N * 3).map(r => r.c);

  let shared = 0;
  for (const top of topCitizens) {
    const topMem = memories.get(top.id);
    if (!topMem) continue;

    const topFacts = topMem.semantic
      .filter(f => f.confidence > 0.6)
      .slice(0, 3);

    for (const bottom of bottomCitizens) {
      const bottomMem = ensureMemory(bottom.id);
      for (const fact of topFacts) {
        const alreadyHas = bottomMem.semantic.some(f => f.domain === fact.domain && f.confidence > 0.4);
        if (!alreadyHas) {
          // Cross-specialization → 60% fidelity; same-spec → 85%
          const fidelity = top.specialization === bottom.specialization ? 0.85 : 0.60;
          bottomMem.semantic.push({
            ...fact,
            id: uid(),
            citizenId: bottom.id,
            confidence: fact.confidence * fidelity,
            sourceCount: 1,
            createdAt: Date.now(),
            reinforcedAt: Date.now(),
          });
          shared++;
        }
      }
    }
  }

  // Phase 2: Within-specialization peer sharing
  const bySpec = shareWithinSpecialization(s);

  return { shared, bySpec };
}

/**
 * Specialization-aware peer sharing.
 * Groups citizens by specialization and distributes top-performer
 * domain facts to weaker peers within the same field.
 *
 * This is more targeted than top-down sharing: an expert Engineer's
 * lessons are most valuable to other Engineers.
 */
function shareWithinSpecialization(s: RepublicState): number {
  // Group citizens by specialization
  const groups = new Map<string, typeof s.citizens>();
  for (const c of s.citizens) {
    const group = groups.get(c.specialization) ?? [];
    group.push(c);
    groups.set(c.specialization, group);
  }

  let totalShared = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // Find the top performer in this specialization
    const scored = group
      .map(c => ({ c, score: memories.get(c.id)?.totalExperiencesAdded ?? 0 }))
      .toSorted((a, b) => b.score - a.score);

    const mentor = scored[0];
    const mentorMem = memories.get(mentor.c.id);
    if (!mentorMem) continue;

    // Get mentor's best domain-specific facts
    const mentorFacts = mentorMem.semantic
      .filter(f => f.confidence > 0.5)
      .toSorted((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    if (mentorFacts.length === 0) continue;

    // Share with all peers in the same specialization
    for (const student of scored.slice(1)) {
      const studentMem = ensureMemory(student.c.id);

      for (const fact of mentorFacts) {
        // Skip if student already knows this
        const alreadyKnows = studentMem.semantic.some(
          f => f.domain === fact.domain && f.fact === fact.fact,
        );
        if (alreadyKnows) continue;

        // Peer transfer at 85% fidelity (same domain experts)
        studentMem.semantic.push({
          ...fact,
          id: uid(),
          citizenId: student.c.id,
          confidence: fact.confidence * 0.85,
          sourceCount: 1,
          createdAt: Date.now(),
          reinforcedAt: Date.now(),
        });
        totalShared++;

        // Cap semantic memory
        if (studentMem.semantic.length > MAX_SEMANTIC) {
          studentMem.semantic = studentMem.semantic
            .toSorted((a, b) => b.confidence - a.confidence)
            .slice(0, MAX_SEMANTIC);
        }
      }
    }
  }

  return totalShared;
}

/**
 * Decay semantic facts over time (anti-stale-knowledge).
 * Facts that haven't been reinforced lose confidence.
 */
function decaySemanticFacts(): void {
  for (const mem of memories.values()) {
    for (const fact of mem.semantic) {
      const ageInTicks = globalTick - fact.reinforcedAt / 1000; // rough tick approximation
      if (ageInTicks > 200) {
        fact.confidence = Math.max(0.1, fact.confidence - fact.decayRate);
      }
    }
    // Remove very low-confidence facts
    mem.semantic = mem.semantic.filter(f => f.confidence > 0.05);
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

/**
 * Experience replay tick.
 * - Triggers memory consolidation for citizens that need a "sleep" pass
 * - Decays old semantic facts
 * - Shares top-citizen experiences with bottom citizens periodically
 */
export function experienceReplayTick(s: RepublicState): void {
  globalTick = s.currentTick;

  // Periodic semantic fact decay
  if (s.currentTick % 50 === 0) decaySemanticFacts();

  // Consolidation pass for citizens that haven't consolidated recently
  const citizensNeedingConsolidation = s.citizens.filter(c => {
    const mem = memories.get(c.id);
    return mem && (globalTick - mem.lastConsolidationTick >= CONSOLIDATION_INTERVAL);
  });

  // Process up to 5 consolidations per tick (spread work across ticks)
  for (const citizen of citizensNeedingConsolidation.slice(0, 5)) {
    const newFacts = consolidateMemory(citizen.id);
    if (newFacts.length > 0) {
      logger.debug(`Memory consolidated for ${citizen.name}: +${newFacts.length} semantic facts`);
    }
  }

  // Share experiences from top to bottom periodically
  if (s.currentTick % 200 === 0) {
    const result = shareExperiencesTopDown(s);
    if (result.shared > 0) {
      logger.info(`Cross-citizen experience sharing: ${result.shared} facts distributed`);
    }
  }

  // Memory compression for long-running agents (every 500 ticks)
  if (s.currentTick % 500 === 0) {
    const compressed = compressSemanticMemory();
    if (compressed > 0) {
      logger.info(`Memory compression: ${compressed} duplicate facts merged`);
    }
  }
}

/**
 * Memory Compression (G3 Fix)
 *
 * Merges overlapping semantic facts within the same domain for each
 * citizen. Two facts are considered overlapping if they share the
 * same domain AND have >50% word overlap.
 *
 * This prevents unbounded semantic fact growth for long-running agents.
 */
function compressSemanticMemory(): number {
  let totalMerged = 0;

  for (const mem of memories.values()) {
    if (mem.semantic.length < 10) continue; // only compress if crowded

    // Group facts by domain
    const byDomain = new Map<string, SemanticFact[]>();
    for (const fact of mem.semantic) {
      const list = byDomain.get(fact.domain) ?? [];
      list.push(fact);
      byDomain.set(fact.domain, list);
    }

    const keepers: SemanticFact[] = [];

    for (const [, domainFacts] of byDomain) {
      if (domainFacts.length <= 2) {
        keepers.push(...domainFacts);
        continue;
      }

      // Sort by confidence descending — high-confidence facts are kept as anchors
      const sorted = domainFacts.toSorted((a, b) => b.confidence - a.confidence);
      const merged = new Set<string>();

      for (let i = 0; i < sorted.length; i++) {
        if (merged.has(sorted[i].id)) continue;

        const anchor = sorted[i];
        const anchorWords = new Set(anchor.fact.toLowerCase().split(/\s+/).filter(w => w.length > 3));

        // Check if any lower-confidence facts overlap with this anchor
        for (let j = i + 1; j < sorted.length; j++) {
          if (merged.has(sorted[j].id)) continue;

          const candidate = sorted[j];
          const candidateWords = candidate.fact.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const overlapCount = candidateWords.filter(w => anchorWords.has(w)).length;
          const overlapRatio = candidateWords.length > 0 ? overlapCount / candidateWords.length : 0;

          if (overlapRatio > 0.5) {
            // Merge: keep the anchor, absorb the candidate's source count + bump confidence
            anchor.confidence = Math.min(1, (anchor.confidence + candidate.confidence) / 2 + 0.05);
            anchor.sourceCount += candidate.sourceCount;
            anchor.reinforcedAt = Math.max(anchor.reinforcedAt, candidate.reinforcedAt);
            merged.add(candidate.id);
            totalMerged++;
          }
        }

        keepers.push(anchor);
      }
    }

    mem.semantic = keepers;
  }

  return totalMerged;
}

/**
 * Get replay buffer diagnostics.
 */
export function getReplayDiagnostics() {
  let totalFlashbulb = 0, totalWorking = 0, totalSemantic = 0, totalExperiences = 0;
  for (const mem of memories.values()) {
    totalFlashbulb += mem.flashbulb.length;
    totalWorking += mem.working.length;
    totalSemantic += mem.semantic.length;
    totalExperiences += mem.totalExperiencesAdded;
  }
  return {
    citizensTracked: memories.size,
    totalFlashbulbMemories: totalFlashbulb,
    totalWorkingMemories: totalWorking,
    totalSemanticFacts: totalSemantic,
    totalExperiencesEverAdded: totalExperiences,
    avgWorkingPerCitizen: memories.size > 0 ? parseFloat((totalWorking / memories.size).toFixed(1)) : 0,
    avgSemanticPerCitizen: memories.size > 0 ? parseFloat((totalSemantic / memories.size).toFixed(1)) : 0,
  };
}
