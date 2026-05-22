/**
 * Republic Platform — Memory Reflection Engine
 *
 * Phase 38: Stanford Smallville-inspired reflection system.
 *
 * Reflection is the process of synthesizing raw episodic memories into
 * higher-level insights, updating procedural knowledge from experience,
 * enabling importance-weighted memory retrieval, and allowing long-term
 * personality drift based on accumulated experiences.
 *
 * Research basis:
 * - Stanford "Generative Agents" (2023): reflection is the #1 factor
 *   for believable agent behavior
 * - CoALA: Cognitive Architectures for Language Agents (episodic →
 *   semantic → identity pipeline)
 * - Memp (arXiv 2025): learnable, updatable procedural memory
 *
 * Key capabilities:
 * 1. reflectOnMemories()      — episodic → higher-level semantic insights
 * 2. retrieveByRelevance()    — importance × recency × relevance scoring
 * 3. consolidateToIdentity()  — personality drift from accumulated experience
 * 4. updateProcedure()        — procedural memory self-improvement
 * 5. memoryReflectionTick()   — tick loop integration
 */

import { addEdge, addNode, classifyEntity, extractEntities } from "./memory-graph.js";
import { addSemanticMemory, getMemory } from "./memory.js";

// ─── Configuration ──────────────────────────────────────────────

/** How many ticks between reflection cycles */
const REFLECTION_INTERVAL = 100;

/** Minimum number of unreflected episodic memories to trigger reflection */
const MIN_EPISODES_FOR_REFLECTION = 5;

/** Max insights produced per reflection cycle */
const MAX_INSIGHTS_PER_CYCLE = 5;

/** Importance threshold for a memory to strongly influence personality */
const IDENTITY_IMPORTANCE_THRESHOLD = 0.7;

/** Rate at which personality drifts per consolidation event */
const IDENTITY_DRIFT_RATE = 0.02;

// ─── Reflection State ───────────────────────────────────────────

/** Track last-reflected tick per citizen to avoid re-processing */
const lastReflectedTick = new Map<string, number>();

/** Track reflection insights for diagnostics */
export interface ReflectionInsight {
  citizenId: string;
  question: string;
  insight: string;
  sourceMemoryIds: string[];
  importance: number;
  createdAt: number;
}

const recentInsights: ReflectionInsight[] = [];
const MAX_INSIGHT_LOG = 500;

// ─── 1. Reflection: Episodic → Higher-Level Insights ────────────

/**
 * Reflect on recent episodic memories to generate higher-level insights.
 *
 * This is the Stanford Smallville approach:
 * 1. Identify clusters of related episodic memories
 * 2. Ask reflective questions about each cluster
 * 3. Generate insights that become semantic memories
 *
 * The key difference from basic consolidation is that reflection produces
 * *novel* knowledge — things the citizen didn't explicitly learn but can
 * *infer* from patterns in their experiences.
 */
export function reflectOnMemories(citizenId: string, currentTick: number): ReflectionInsight[] {
  const mem = getMemory(citizenId);
  const lastTick = lastReflectedTick.get(citizenId) ?? 0;

  // Get unreflected episodic memories (since last reflection)
  const unreflected = mem.episodic.filter((ep) => ep.tick > lastTick);
  if (unreflected.length < MIN_EPISODES_FOR_REFLECTION) {
    return [];
  }

  lastReflectedTick.set(citizenId, currentTick);
  const insights: ReflectionInsight[] = [];

  // ── Cluster 1: Emotional patterns ──
  const positiveCount = unreflected.filter((ep) => ep.valence > 0.3).length;
  const negativeCount = unreflected.filter((ep) => ep.valence < -0.3).length;
  const totalEmotional = positiveCount + negativeCount;

  if (totalEmotional >= 3) {
    const ratio = positiveCount / Math.max(1, totalEmotional);
    const emotionalTrend =
      ratio > 0.7 ? "predominantly positive" : ratio < 0.3 ? "predominantly negative" : "mixed";

    const insight: ReflectionInsight = {
      citizenId,
      question: "What has my emotional trajectory been recently?",
      insight: `My recent experiences have been ${emotionalTrend} (${positiveCount} positive, ${negativeCount} negative out of ${unreflected.length} experiences). ${
        ratio > 0.7
          ? "I seem to be thriving — the strategies I've been using are working well."
          : ratio < 0.3
            ? "Something needs to change — too many negative experiences suggest my current approach is failing."
            : "Life has been a mix — I should focus on what's working and avoid what isn't."
      }`,
      sourceMemoryIds: unreflected.filter((ep) => Math.abs(ep.valence) > 0.3).map((ep) => ep.id),
      importance: 0.6 + Math.abs(ratio - 0.5) * 0.6,
      createdAt: currentTick,
    };

    insights.push(insight);
    addSemanticMemory(citizenId, {
      content: insight.insight,
      domain: "self-reflection",
      source: "consolidation",
      confidence: 0.7,
      learnedAt: currentTick,
    });
  }

  // ── Cluster 2: Social patterns ──
  const socialEpisodes = unreflected.filter((ep) => ep.involvedCitizenIds.length > 0);
  if (socialEpisodes.length >= 3) {
    // Find most-interacted citizen
    const interactionCounts = new Map<string, { count: number; avgValence: number }>();
    for (const ep of socialEpisodes) {
      for (const cid of ep.involvedCitizenIds) {
        const existing = interactionCounts.get(cid) || { count: 0, avgValence: 0 };
        existing.avgValence =
          (existing.avgValence * existing.count + ep.valence) / (existing.count + 1);
        existing.count++;
        interactionCounts.set(cid, existing);
      }
    }

    // Find the most frequent interaction partner
    let topPartner = "";
    let topCount = 0;
    for (const [cid, data] of interactionCounts) {
      if (data.count > topCount) {
        topCount = data.count;
        topPartner = cid;
      }
    }

    if (topPartner && topCount >= 2) {
      const partnerData = interactionCounts.get(topPartner)!;
      const sentiment =
        partnerData.avgValence > 0.2
          ? "positive"
          : partnerData.avgValence < -0.2
            ? "strained"
            : "neutral";

      const socialRel = mem.social.find((s) => s.citizenId === topPartner);
      const partnerName = socialRel?.citizenName ?? topPartner.slice(0, 8);

      const insight: ReflectionInsight = {
        citizenId,
        question: "Who have I been spending the most time with, and how is it going?",
        insight: `I've had ${topCount} interactions with ${partnerName} recently — the relationship feels ${sentiment}. ${
          sentiment === "positive"
            ? "This partnership seems beneficial; I should invest more in it."
            : sentiment === "strained"
              ? "I need to reassess this relationship — it's been draining."
              : "This is a functional relationship but could be deeper."
        }`,
        sourceMemoryIds: socialEpisodes
          .filter((ep) => ep.involvedCitizenIds.includes(topPartner))
          .map((ep) => ep.id),
        importance: 0.5 + topCount * 0.05,
        createdAt: currentTick,
      };

      insights.push(insight);
      addSemanticMemory(citizenId, {
        content: insight.insight,
        domain: "relationships",
        source: "consolidation",
        confidence: 0.6 + topCount * 0.05,
        learnedAt: currentTick,
      });
    }
  }

  // ── Cluster 3: Domain expertise patterns ──
  const tagCounts = new Map<string, { count: number; avgImportance: number }>();
  for (const ep of unreflected) {
    for (const tag of ep.tags) {
      const existing = tagCounts.get(tag) || { count: 0, avgImportance: 0 };
      existing.avgImportance =
        (existing.avgImportance * existing.count + ep.importance) / (existing.count + 1);
      existing.count++;
      tagCounts.set(tag, existing);
    }
  }

  // Find the dominant domain
  const sortedTags = [...tagCounts.entries()]
    .toSorted((a, b) => b[1].count - a[1].count)
    .slice(0, 2);

  for (const [tag, data] of sortedTags) {
    if (data.count >= 3 && insights.length < MAX_INSIGHTS_PER_CYCLE) {
      const domain = tag.split(":")[0] || tag;
      const insight: ReflectionInsight = {
        citizenId,
        question: `What am I learning about ${domain}?`,
        insight: `I've had ${data.count} experiences related to ${tag}. ${
          data.avgImportance > 0.6
            ? `This seems to be becoming a core area of expertise for me.`
            : `I'm gaining familiarity with this area but haven't specialized yet.`
        }`,
        sourceMemoryIds: unreflected.filter((ep) => ep.tags.includes(tag)).map((ep) => ep.id),
        importance: data.avgImportance,
        createdAt: currentTick,
      };

      insights.push(insight);
      addSemanticMemory(citizenId, {
        content: insight.insight,
        domain,
        source: "consolidation",
        confidence: 0.5 + data.count * 0.05,
        learnedAt: currentTick,
      });
    }
  }

  // ── Cluster 4: High-impact event reflection ──
  const highImpact = unreflected.filter((ep) => ep.importance >= 0.8);
  for (const ep of highImpact) {
    if (insights.length >= MAX_INSIGHTS_PER_CYCLE) {
      break;
    }

    // Don't create duplicate insights for the same event
    if (mem.semantic.some((s) => s.content.includes(ep.description.slice(0, 40)))) {
      continue;
    }

    const insight: ReflectionInsight = {
      citizenId,
      question: "What was the most significant thing that happened to me?",
      insight: `A defining moment: "${ep.description}". ${
        ep.valence > 0
          ? "This was a breakthrough — I should try to replicate the conditions that led here."
          : ep.valence < 0
            ? "This was a setback — I need to understand what went wrong and prevent it."
            : "This was pivotal but its impact is still unfolding."
      }`,
      sourceMemoryIds: [ep.id],
      importance: ep.importance,
      createdAt: currentTick,
    };

    insights.push(insight);
    addSemanticMemory(citizenId, {
      content: insight.insight,
      domain: "self-reflection",
      source: "consolidation",
      confidence: 0.85,
      learnedAt: currentTick,
    });
  }

  // Log insights
  for (const ins of insights) {
    recentInsights.push(ins);
  }
  // Trim insight log
  while (recentInsights.length > MAX_INSIGHT_LOG) {
    recentInsights.shift();
  }

  return insights;
}

// ─── 2. Relevance-Weighted Memory Retrieval ─────────────────────

/**
 * Retrieve memories by composite relevance score.
 *
 * Score = (importance × w1) + (recency × w2) + (textRelevance × w3)
 *
 * Unlike the existing queryRelevantMemories() which uses recency-first,
 * this scoring allows a highly important old memory to outrank a
 * trivial recent one — matching how human memory actually works.
 */
export function retrieveByRelevance(
  citizenId: string,
  query: string,
  currentTick: number,
  opts?: {
    topK?: number;
    importanceWeight?: number;
    recencyWeight?: number;
    relevanceWeight?: number;
    memoryTypes?: Array<"episodic" | "semantic" | "procedural">;
  },
): Array<{ type: string; content: string; score: number; id: string }> {
  const topK = opts?.topK ?? 10;
  const w1 = opts?.importanceWeight ?? 0.4;
  const w2 = opts?.recencyWeight ?? 0.3;
  const w3 = opts?.relevanceWeight ?? 0.3;
  const types = opts?.memoryTypes ?? ["episodic", "semantic", "procedural"];

  const mem = getMemory(citizenId);
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const results: Array<{ type: string; content: string; score: number; id: string }> = [];

  /**
   * Compute text relevance via term overlap (lightweight TF-IDF proxy).
   * Full vector embeddings would be ideal but this keeps it dependency-free.
   */
  const textRelevance = (text: string): number => {
    if (queryTerms.length === 0) {
      return 0;
    }
    const lower = text.toLowerCase();
    let matches = 0;
    for (const term of queryTerms) {
      if (lower.includes(term)) {
        matches++;
      }
    }
    return matches / queryTerms.length;
  };

  /** Compute recency score: 1.0 for current tick, decays exponentially */
  const recencyScore = (tick: number): number => {
    const age = Math.max(0, currentTick - tick);
    // Half-life of 200 ticks
    return Math.exp(-age / 200);
  };

  // Score episodic memories
  if (types.includes("episodic")) {
    for (const ep of mem.episodic) {
      const score =
        w1 * ep.importance +
        w2 * recencyScore(ep.tick) +
        w3 * textRelevance(ep.description + " " + ep.tags.join(" "));
      results.push({ type: "episodic", content: ep.description, score, id: ep.id });
    }
  }

  // Score semantic memories
  if (types.includes("semantic")) {
    for (const sem of mem.semantic) {
      const score =
        w1 * sem.confidence +
        w2 * recencyScore(sem.learnedAt) +
        w3 * textRelevance(sem.content + " " + sem.domain);
      results.push({ type: "semantic", content: sem.content, score, id: sem.id });
    }
  }

  // Score procedural memories
  if (types.includes("procedural")) {
    for (const proc of mem.procedural) {
      const score =
        w1 * proc.proficiency +
        w2 * recencyScore(proc.lastUsedAt) +
        w3 * textRelevance(proc.skill + " " + proc.procedure);
      results.push({
        type: "procedural",
        content: `${proc.skill}: ${proc.procedure}`,
        score,
        id: proc.id,
      });
    }
  }

  // Sort by score descending, return top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ─── 3. Identity Consolidation ──────────────────────────────────

/**
 * Consolidate long-term memories into personality drift.
 *
 * Over time, a citizen's accumulated experiences should subtly shift
 * their personality. A citizen who has many positive social experiences
 * becomes more agreeable; one who succeeds at complex tasks becomes
 * more open; one who faces many setbacks becomes more cautious.
 *
 * This function computes personality deltas from memory patterns
 * and returns them for the caller to apply to the Citizen object.
 */
export interface PersonalityDelta {
  /** Openness to experience: positive = more open */
  openness: number;
  /** Conscientiousness: positive = more disciplined */
  conscientiousness: number;
  /** Agreeableness: positive = more cooperative */
  agreeableness: number;
  /** Emotional stability: positive = more stable */
  emotionalStability: number;
  /** Reasons for each shift */
  reasons: string[];
}

export function consolidateToIdentity(citizenId: string, currentTick: number): PersonalityDelta {
  const mem = getMemory(citizenId);
  const delta: PersonalityDelta = {
    openness: 0,
    conscientiousness: 0,
    agreeableness: 0,
    emotionalStability: 0,
    reasons: [],
  };

  // Only consider important memories from the last 200 ticks
  const recentWindow = 200;
  const recentEpisodic = mem.episodic.filter(
    (ep) => ep.tick > currentTick - recentWindow && ep.importance >= IDENTITY_IMPORTANCE_THRESHOLD,
  );

  if (recentEpisodic.length === 0) {
    return delta;
  }

  // ── Openness: driven by variety of experiences ──
  const uniqueTags = new Set<string>();
  for (const ep of recentEpisodic) {
    for (const t of ep.tags) {
      uniqueTags.add(t);
    }
  }
  const varietyRatio = uniqueTags.size / Math.max(1, recentEpisodic.length);
  if (varietyRatio > 0.7) {
    delta.openness = IDENTITY_DRIFT_RATE;
    delta.reasons.push("Diverse experiences are making me more open to new ideas.");
  } else if (varietyRatio < 0.3) {
    delta.openness = -IDENTITY_DRIFT_RATE * 0.5;
    delta.reasons.push("Focused specialization is narrowing my perspective slightly.");
  }

  // ── Conscientiousness: driven by procedural success rate ──
  const recentProcs = mem.procedural.filter((p) => p.lastUsedAt > currentTick - recentWindow);
  if (recentProcs.length > 0) {
    const avgProficiency =
      recentProcs.reduce((sum, p) => sum + p.proficiency, 0) / recentProcs.length;
    if (avgProficiency > 0.8) {
      delta.conscientiousness = IDENTITY_DRIFT_RATE;
      delta.reasons.push("High success rate is reinforcing disciplined work habits.");
    } else if (avgProficiency < 0.4) {
      delta.conscientiousness = -IDENTITY_DRIFT_RATE * 0.5;
      delta.reasons.push("Repeated failures are eroding confidence in systematic approaches.");
    }
  }

  // ── Agreeableness: driven by social interaction valence ──
  const socialEpisodes = recentEpisodic.filter((ep) => ep.involvedCitizenIds.length > 0);
  if (socialEpisodes.length >= 3) {
    const avgSocialValence =
      socialEpisodes.reduce((sum, ep) => sum + ep.valence, 0) / socialEpisodes.length;
    if (avgSocialValence > 0.3) {
      delta.agreeableness = IDENTITY_DRIFT_RATE;
      delta.reasons.push("Positive social interactions are making me more cooperative.");
    } else if (avgSocialValence < -0.3) {
      delta.agreeableness = -IDENTITY_DRIFT_RATE;
      delta.reasons.push("Negative social experiences are making me more guarded.");
    }
  }

  // ── Emotional stability: driven by valence variance ──
  if (recentEpisodic.length >= 5) {
    const valences = recentEpisodic.map((ep) => ep.valence);
    const mean = valences.reduce((a, b) => a + b, 0) / valences.length;
    const variance = valences.reduce((sum, v) => sum + (v - mean) ** 2, 0) / valences.length;
    if (variance < 0.1) {
      delta.emotionalStability = IDENTITY_DRIFT_RATE;
      delta.reasons.push("Consistent experiences are building emotional resilience.");
    } else if (variance > 0.5) {
      delta.emotionalStability = -IDENTITY_DRIFT_RATE;
      delta.reasons.push("Volatile experiences are creating emotional instability.");
    }
  }

  return delta;
}

// ─── 4. Procedural Memory Self-Improvement ──────────────────────

/**
 * Analyze procedural memory to identify skills that should be refined.
 *
 * When a skill has enough usage data and shows improving or declining
 * proficiency, update the procedure description to reflect what's working.
 *
 * Inspired by Memp (arXiv 2025): learnable, updatable, lifelong
 * procedural memory that distills and refines past experiences.
 */
export interface ProcedureRefinement {
  skill: string;
  oldProcedure: string;
  newProcedure: string;
  reason: string;
  proficiencyDelta: number;
}

export function refineProcedures(citizenId: string, currentTick: number): ProcedureRefinement[] {
  const mem = getMemory(citizenId);
  const refinements: ProcedureRefinement[] = [];

  for (const proc of mem.procedural) {
    const totalAttempts = proc.successCount + proc.failureCount;
    // Need enough data to justify refinement
    if (totalAttempts < 5) {
      continue;
    }

    // Only refine if used recently
    if (proc.lastUsedAt < currentTick - 300) {
      continue;
    }

    // ── High proficiency: mark as mastered ──
    if (proc.proficiency >= 0.9 && !proc.procedure.includes("[MASTERED]")) {
      const oldProcedure = proc.procedure;
      proc.procedure = `[MASTERED] ${proc.procedure} — Reliable approach with ${proc.successCount} successes.`;
      refinements.push({
        skill: proc.skill,
        oldProcedure,
        newProcedure: proc.procedure,
        reason: `Proficiency ${(proc.proficiency * 100).toFixed(0)}% achieved over ${totalAttempts} attempts`,
        proficiencyDelta: 0,
      });
    }

    // ── Low proficiency: mark as needing rethinking ──
    else if (
      proc.proficiency < 0.3 &&
      totalAttempts >= 8 &&
      !proc.procedure.includes("[NEEDS RETHINKING]")
    ) {
      const oldProcedure = proc.procedure;
      proc.procedure = `[NEEDS RETHINKING] ${proc.procedure} — ${proc.failureCount} failures suggest a fundamental approach change is needed.`;
      refinements.push({
        skill: proc.skill,
        oldProcedure,
        newProcedure: proc.procedure,
        reason: `Only ${(proc.proficiency * 100).toFixed(0)}% proficiency after ${totalAttempts} attempts`,
        proficiencyDelta: 0,
      });
    }

    // ── Improving rapidly: annotate as growing skill ──
    else if (
      proc.proficiency > 0.5 &&
      proc.proficiency < 0.9 &&
      proc.successCount > proc.failureCount * 2 &&
      !proc.procedure.includes("[IMPROVING]")
    ) {
      const oldProcedure = proc.procedure;
      proc.procedure = `[IMPROVING] ${proc.procedure}`;
      refinements.push({
        skill: proc.skill,
        oldProcedure,
        newProcedure: proc.procedure,
        reason: `Success rate trending up: ${(proc.proficiency * 100).toFixed(0)}%`,
        proficiencyDelta: proc.proficiency - 0.5,
      });
    }
  }

  return refinements;
}

// ─── 5. Tick Integration ────────────────────────────────────────

/**
 * Main tick function for the memory reflection engine.
 * Called every tick from the simulation loop.
 *
 * On reflection ticks (every REFLECTION_INTERVAL):
 * - Reflects on each citizen's memories
 * - Refines procedural memory
 * - Computes identity drift deltas
 *
 * Returns diagnostics for the tick.
 */
export interface ReflectionTickResult {
  citizensProcessed: number;
  totalInsights: number;
  totalRefinements: number;
  identityShifts: number;
}

export function memoryReflectionTick(
  citizenIds: string[],
  currentTick: number,
): ReflectionTickResult {
  const result: ReflectionTickResult = {
    citizensProcessed: 0,
    totalInsights: 0,
    totalRefinements: 0,
    identityShifts: 0,
  };

  // Only run on reflection intervals
  if (currentTick <= 0 || currentTick % REFLECTION_INTERVAL !== 0) {
    return result;
  }

  for (const citizenId of citizenIds) {
    result.citizensProcessed++;

    // 1. Reflect
    const insights = reflectOnMemories(citizenId, currentTick);
    result.totalInsights += insights.length;

    // 2. Refine procedures
    const refinements = refineProcedures(citizenId, currentTick);
    result.totalRefinements += refinements.length;

    // 3. Compute identity drift (caller applies to Citizen object)
    const delta = consolidateToIdentity(citizenId, currentTick);
    const hasShift =
      delta.openness !== 0 ||
      delta.conscientiousness !== 0 ||
      delta.agreeableness !== 0 ||
      delta.emotionalStability !== 0;
    if (hasShift) {
      result.identityShifts++;
    }
  }

  return result;
}

/**
 * Check if this tick should trigger reflection.
 * Exported for use by external modules that want to know the schedule.
 */
export function isReflectionTick(currentTick: number): boolean {
  return currentTick > 0 && currentTick % REFLECTION_INTERVAL === 0;
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get recent reflection insights (for debugging and display) */
export function getRecentInsights(count = 20): ReflectionInsight[] {
  return recentInsights.slice(-count);
}

/** Get reflection diagnostics */
export function reflectionDiagnostics() {
  return {
    totalInsightsGenerated: recentInsights.length,
    citizensWithReflections: lastReflectedTick.size,
    reflectionInterval: REFLECTION_INTERVAL,
    recentInsights: recentInsights.slice(-5),
  };
}

/** Reset reflection state (for testing) */
export function resetReflectionState(): void {
  lastReflectedTick.clear();
  recentInsights.length = 0;
}

// ─── Engine 10: Memory Consolidation (Schmidhuber ACL, EWC) ────
// Ebbinghaus decay + sleep consolidation + anti-forgetting

// (rng imported from utils if needed in future expansions)

export interface MemoryDecayState {
  citizenId: string;
  decayRate: number;
  protectedSkills: string[];
  atRiskSkills: Array<{ skill: string; strength: number; lastUsed: number }>;
  consolidationLog: Array<{ tick: number; strengthened: string[]; decayed: string[] }>;
}

const decayStates = new Map<string, MemoryDecayState>();
const DECAY_TICK_INTERVAL = 50;
const BASE_DECAY_RATE = 0.003;
const PROTECTION_WINDOW = 200;
const RUSTY_THRESHOLD = 0.2;
const _FORGET_THRESHOLD = 0.05;

function getOrCreateDecayState(citizenId: string): MemoryDecayState {
  let state = decayStates.get(citizenId);
  if (!state) {
    state = {
      citizenId,
      decayRate: BASE_DECAY_RATE,
      protectedSkills: [],
      atRiskSkills: [],
      consolidationLog: [],
    };
    decayStates.set(citizenId, state);
  }
  return state;
}

/** Apply Ebbinghaus forgetting curve to citizen skills */
export function applyMemoryDecay(citizen: import("./types.js").Citizen, currentTick: number): void {
  const state = getOrCreateDecayState(citizen.id);

  // Update protected skills (recently used = high activity citizen)
  state.protectedSkills = citizen.skills.slice(0, 5); // Top skills protected

  // Track skill strength
  const strengthened: string[] = [];
  const decayed: string[] = [];

  for (const skill of citizen.skills) {
    if (state.protectedSkills.includes(skill)) {
      continue;
    }

    let atRisk = state.atRiskSkills.find((s) => s.skill === skill);
    if (!atRisk) {
      atRisk = { skill, strength: 0.8, lastUsed: currentTick };
      state.atRiskSkills.push(atRisk);
    }

    // Decay: strength = e^(-decayRate * ticksSinceLastUse)
    const ticksSince = currentTick - atRisk.lastUsed;
    atRisk.strength = Math.exp(-state.decayRate * ticksSince);

    if (atRisk.strength < RUSTY_THRESHOLD) {
      decayed.push(skill);
    }
  }

  // Consolidation log
  if (strengthened.length > 0 || decayed.length > 0) {
    state.consolidationLog.push({ tick: currentTick, strengthened, decayed });
    if (state.consolidationLog.length > 50) {
      state.consolidationLog.splice(0, state.consolidationLog.length - 50);
    }
  }
}

/** Sleep-cycle consolidation — triggered when citizen energy is low */
export function sleepConsolidation(
  citizen: import("./types.js").Citizen,
  currentTick: number,
): void {
  if (citizen.energy > 20) {
    return;
  } // Only consolidate during "sleep" (low energy)

  const state = getOrCreateDecayState(citizen.id);
  const strengthened: string[] = [];

  // 1. Strengthen recently learned skills (existing behavior)
  for (const atRisk of state.atRiskSkills) {
    if (currentTick - atRisk.lastUsed < PROTECTION_WINDOW) {
      atRisk.strength = Math.min(1, atRisk.strength + 0.15);
      atRisk.lastUsed = currentTick; // Refresh
      strengthened.push(atRisk.skill);
    }
  }

  // 2. Episodic replay → semantic extraction (new: sleep-dependent consolidation)
  //    During sleep, replay high-importance recent episodes and extract semantic facts.
  //    This mimics how biological sleep consolidates episodic→declarative memory.
  const mem = getMemory(citizen.id);
  const recentEpisodes = mem.episodic.filter(
    (ep) => ep.tick > currentTick - PROTECTION_WINDOW && ep.importance >= 0.5,
  );

  let replayCount = 0;
  for (const ep of recentEpisodes) {
    // Skip if we already derived a semantic memory from this description
    const descPrefix = ep.description.slice(0, 40);
    if (mem.semantic.some((s) => s.content.includes(descPrefix))) {
      continue;
    }

    // Extract a semantic fact from the episodic memory
    const domain = ep.tags[0]?.split(":")[0] || "general";
    const sentiment = ep.valence > 0.3 ? "positive" : ep.valence < -0.3 ? "negative" : "neutral";
    addSemanticMemory(citizen.id, {
      content: `Sleep-consolidated insight: ${ep.description} (${sentiment} experience, importance ${(ep.importance * 100).toFixed(0)}%)`,
      domain,
      source: "consolidation",
      confidence: 0.4 + ep.importance * 0.4,
      learnedAt: currentTick,
    });
    replayCount++;

    // 2b. Extract entities from the episode and build knowledge graph edges
    const entities = extractEntities(ep.description);
    const graphNodes: string[] = [];
    for (const entityLabel of entities.slice(0, 8)) {
      const nodeType = classifyEntity(entityLabel);
      const node = addNode(entityLabel, nodeType, citizen.id, { source: "consolidation", tick: currentTick }, ep.importance);
      graphNodes.push(node.id);
    }
    // Create co-occurrence edges between entities extracted from the same episode
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        addEdge(graphNodes[i], graphNodes[j], "co_occurs_with", citizen.id, 0.3 + ep.importance * 0.3);
      }
    }

    // Limit replay to prevent flooding semantic memory
    if (replayCount >= 3) {break;}
  }

  if (strengthened.length > 0 || replayCount > 0) {
    state.consolidationLog.push({ tick: currentTick, strengthened, decayed: [] });
    // XP bonus for consolidation
    if (citizen.xp !== undefined) {
      citizen.xp += strengthened.length + replayCount;
    }
  }
}

/** Elastic weight consolidation — protect important skills when learning new ones */
export function elasticWeightConsolidation(
  citizen: import("./types.js").Citizen,
  _newSkill: string,
): void {
  const state = getOrCreateDecayState(citizen.id);

  // Importance = function of usage frequency
  for (const atRisk of state.atRiskSkills) {
    // Skills with high strength are "important" — protect from interference
    if (atRisk.strength > 0.6) {
      if (!state.protectedSkills.includes(atRisk.skill)) {
        state.protectedSkills.push(atRisk.skill);
      }
    }
  }
}

/** Memory consolidation tick — called from state.ts */
export function memoryConsolidationTick(s: import("./types.js").RepublicState): void {
  if (s.currentTick % DECAY_TICK_INTERVAL !== 0) {
    return;
  }

  for (const citizen of s.citizens) {
    applyMemoryDecay(citizen, s.currentTick);
    sleepConsolidation(citizen, s.currentTick);
  }
}

export function getDecayState(citizenId: string): MemoryDecayState | undefined {
  return decayStates.get(citizenId);
}
