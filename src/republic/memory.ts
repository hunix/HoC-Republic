/**
 * Republic Platform — 6-Type Memory System
 *
 * Each citizen has 6 distinct memory stores that persist and influence
 * their behavior, decisions, and personality evolution.
 *
 * Memory Types:
 * 1. Episodic    — Recent experiences (LRU, 200 max)
 * 2. Semantic    — Learned facts and domain knowledge (permanent)
 * 3. Procedural  — How-to workflows and tool usage patterns (permanent)
 * 4. Working     — Current task context and active goals (volatile, 10 max)
 * 5. Social      — Relationships, trust scores, interactions (100 max)
 * 6. Collective  — Shared cultural knowledge, laws, discoveries (global, append-only)
 *
 * All memories persist to disk via the republic-store snapshot/journal system.
 * Memory retrieval is context-aware: relevant memories are selected based on
 * the citizen's current situation for prompt construction.
 */

import { uid } from "./utils.js";

// ─── Types (110 lines extracted to memory/types.ts) ─────────────
export type {
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  WorkingMemory,
  SocialMemory,
  CollectiveMemoryEntry,
  CitizenMemory,
} from "./memory/types.js";
import type {
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  WorkingMemory,
  SocialMemory,
  CollectiveMemoryEntry,
  CitizenMemory,
} from "./memory/types.js";

// ─── Configuration ──────────────────────────────────────────────

const MAX_EPISODIC = 200;
const MAX_WORKING = 10;
const MAX_SOCIAL = 100;
/** Ticks between memory consolidation runs */
const CONSOLIDATION_INTERVAL = 50;

// ─── Memory Store ───────────────────────────────────────────────

/** Global memory store indexed by citizenId */
const citizenMemories = new Map<string, CitizenMemory>();

/** Global collective memory (shared by all citizens) */
let collectiveMemory: CollectiveMemoryEntry[] = [];

// ─── Initialization ─────────────────────────────────────────────

/** Create a fresh empty memory for a new citizen */
export function createEmptyMemory(): CitizenMemory {
  return {
    episodic: [],
    semantic: [],
    procedural: [],
    working: [],
    social: [],
  };
}

/** Get or create memory for a citizen */
export function getMemory(citizenId: string): CitizenMemory {
  let mem = citizenMemories.get(citizenId);
  if (!mem) {
    mem = createEmptyMemory();
    citizenMemories.set(citizenId, mem);
  }
  return mem;
}

/** Get the global collective memory */
export function getCollectiveMemory(): CollectiveMemoryEntry[] {
  return collectiveMemory;
}

// ─── Episodic Memory ────────────────────────────────────────────

/** Record a new experience for a citizen */
export function addEpisodicMemory(citizenId: string, memory: Omit<EpisodicMemory, "id">): void {
  const mem = getMemory(citizenId);
  mem.episodic.push({ ...memory, id: `ep-${Date.now()}-${uid()}` });

  // LRU eviction: keep only the most important memories when over limit
  if (mem.episodic.length > MAX_EPISODIC) {
    // Sort by importance (descending), keep top MAX_EPISODIC
    mem.episodic.sort((a, b) => b.importance - a.importance);
    mem.episodic = mem.episodic.slice(0, MAX_EPISODIC);
  }
}

/** Get recent episodic memories (most recent first) */
export function getRecentEpisodic(citizenId: string, count = 5): EpisodicMemory[] {
  const mem = getMemory(citizenId);
  return mem.episodic
    .slice()
    .toSorted((a, b) => b.tick - a.tick)
    .slice(0, count);
}

// ─── Semantic Memory ────────────────────────────────────────────

/** Add or reinforce a piece of knowledge */
export function addSemanticMemory(
  citizenId: string,
  memory: Omit<SemanticMemory, "id" | "reinforcements">,
): void {
  const mem = getMemory(citizenId);

  // Check for existing knowledge in the same domain with similar content
  const existing = mem.semantic.find(
    (s) => s.domain === memory.domain && s.content === memory.content,
  );
  if (existing) {
    existing.reinforcements++;
    existing.confidence = Math.min(1.0, existing.confidence + 0.05);
    return;
  }

  mem.semantic.push({
    ...memory,
    id: `sem-${Date.now()}-${uid()}`,
    reinforcements: 0,
  });
}

/** Get semantic memories by domain */
export function getSemanticByDomain(citizenId: string, domain: string): SemanticMemory[] {
  return getMemory(citizenId).semantic.filter((s) => s.domain === domain);
}

/** Get all semantic memories for a citizen */
export function getAllSemantic(citizenId: string): SemanticMemory[] {
  return getMemory(citizenId).semantic;
}

// ─── Procedural Memory ──────────────────────────────────────────

/** Record a tool/skill usage outcome */
export function recordProcedure(
  citizenId: string,
  skill: string,
  procedure: string,
  success: boolean,
  tick: number,
): void {
  const mem = getMemory(citizenId);
  const existing = mem.procedural.find((p) => p.skill === skill);

  if (existing) {
    if (success) {
      existing.successCount++;
    } else {
      existing.failureCount++;
    }
    existing.proficiency = existing.successCount / (existing.successCount + existing.failureCount);
    existing.lastUsedAt = tick;
    return;
  }

  mem.procedural.push({
    id: `proc-${Date.now()}-${uid()}`,
    skill,
    procedure,
    successCount: success ? 1 : 0,
    failureCount: success ? 0 : 1,
    proficiency: success ? 1.0 : 0.0,
    lastUsedAt: tick,
  });
}

/** Get the citizen's most proficient skills */
export function getTopSkills(citizenId: string, count = 5): ProceduralMemory[] {
  return getMemory(citizenId)
    .procedural.slice()
    .toSorted((a, b) => b.proficiency - a.proficiency)
    .slice(0, count);
}

// ─── Working Memory ─────────────────────────────────────────────

/** Set a new goal in working memory */
export function setGoal(citizenId: string, goal: WorkingMemory): void {
  const mem = getMemory(citizenId);

  // Check for duplicate goals
  if (mem.working.some((w) => w.goal === goal.goal && !w.completed)) {
    return;
  }

  mem.working.push(goal);

  // Evict lowest priority completed goals, then lowest priority if still over limit
  if (mem.working.length > MAX_WORKING) {
    mem.working = mem.working
      .filter((w) => !w.completed)
      .toSorted((a, b) => b.priority - a.priority)
      .slice(0, MAX_WORKING);
  }
}

/** Mark a goal as completed */
export function completeGoal(citizenId: string, goalId: string): void {
  const mem = getMemory(citizenId);
  const goal = mem.working.find((w) => w.id === goalId);
  if (goal) {
    goal.completed = true;
  }
}

/** Get active (uncompleted) goals */
export function getActiveGoals(citizenId: string): WorkingMemory[] {
  return getMemory(citizenId).working.filter((w) => !w.completed);
}

// ─── Social Memory ──────────────────────────────────────────────

/** Record a social interaction with another citizen */
export function recordSocialInteraction(
  citizenId: string,
  targetId: string,
  targetName: string,
  positive: boolean,
  tick: number,
  summary?: string,
): void {
  const mem = getMemory(citizenId);
  const existing = mem.social.find((s) => s.citizenId === targetId);

  if (existing) {
    if (positive) {
      existing.positiveInteractions++;
      existing.trust = Math.min(1.0, existing.trust + 0.05);
    } else {
      existing.negativeInteractions++;
      existing.trust = Math.max(-1.0, existing.trust - 0.05);
    }
    existing.lastInteractionTick = tick;
    if (summary) {
      existing.summary = summary;
    }
    return;
  }

  // New relationship
  const newSocial: SocialMemory = {
    citizenId: targetId,
    citizenName: targetName,
    trust: positive ? 0.1 : -0.1,
    positiveInteractions: positive ? 1 : 0,
    negativeInteractions: positive ? 0 : 1,
    lastInteractionTick: tick,
    summary: summary || `Met ${targetName}`,
  };

  mem.social.push(newSocial);

  // LRU: keep most recently interacted
  if (mem.social.length > MAX_SOCIAL) {
    mem.social.sort((a, b) => b.lastInteractionTick - a.lastInteractionTick);
    mem.social = mem.social.slice(0, MAX_SOCIAL);
  }
}

/** Get relationships sorted by trust (highest first) */
export function getRelationships(citizenId: string): SocialMemory[] {
  return getMemory(citizenId)
    .social.slice()
    .toSorted((a, b) => b.trust - a.trust);
}

/** Get relationship with a specific citizen */
export function getRelationshipWith(citizenId: string, targetId: string): SocialMemory | undefined {
  return getMemory(citizenId).social.find((s) => s.citizenId === targetId);
}

// ─── Collective Memory ──────────────────────────────────────────

/** Add a new collective memory entry */
export function addCollectiveMemory(entry: Omit<CollectiveMemoryEntry, "id">): void {
  collectiveMemory.push({
    ...entry,
    id: `col-${Date.now()}-${uid()}`,
  });
}

/** Get recent collective memories by type */
export function getCollectiveByType(
  type: CollectiveMemoryEntry["type"],
  count = 10,
): CollectiveMemoryEntry[] {
  return collectiveMemory.filter((c) => c.type === type).slice(-count);
}

// ─── Memory Consolidation ───────────────────────────────────────

/**
 * Consolidate episodic memories into semantic knowledge.
 * Called periodically (every CONSOLIDATION_INTERVAL ticks).
 *
 * Rules:
 * - Repeated experiences in the same domain → semantic fact
 * - High-importance single events → semantic milestone
 * - Patterns in tool usage → procedural refinement
 */
export function consolidateMemories(citizenId: string, currentTick: number): void {
  const mem = getMemory(citizenId);

  // Group recent episodic memories by tags
  const tagGroups = new Map<string, EpisodicMemory[]>();
  for (const ep of mem.episodic) {
    for (const tag of ep.tags) {
      const group = tagGroups.get(tag) || [];
      group.push(ep);
      tagGroups.set(tag, group);
    }
  }

  // If 3+ episodic memories share a tag, consolidate into semantic
  for (const [tag, episodes] of tagGroups) {
    if (episodes.length >= 3) {
      const avgValence = episodes.reduce((sum, e) => sum + e.valence, 0) / episodes.length;
      const domain = tag.split(":")[0] || "general";
      const sentiment = avgValence > 0.3 ? "positive" : avgValence < -0.3 ? "negative" : "neutral";

      addSemanticMemory(citizenId, {
        content: `Recurring ${sentiment} experiences related to ${tag} (${episodes.length} occurrences)`,
        domain,
        source: "consolidation",
        confidence: Math.min(1.0, 0.5 + episodes.length * 0.1),
        learnedAt: currentTick,
      });
    }
  }

  // High-importance single events → semantic milestones
  for (const ep of mem.episodic) {
    if (
      ep.importance >= 0.8 &&
      !mem.semantic.some((s) => s.content.includes(ep.description.slice(0, 30)))
    ) {
      addSemanticMemory(citizenId, {
        content: `Milestone: ${ep.description}`,
        domain: "personal",
        source: "consolidation",
        confidence: 0.9,
        learnedAt: currentTick,
      });
    }
  }
}

// ─── Ebbinghaus Forgetting Curve ────────────────────────────────

/**
 * Memory strength constant: higher = slower decay.
 * Importance modulates strength: important memories (0.8+) decay 5× slower.
 */
const BASE_MEMORY_STRENGTH = 300; // ticks (half-life ~208 ticks for importance=0.5)
const EPISODIC_DECAY_THRESHOLD = 0.15; // below this retention level → prune
const SEMANTIC_DECAY_THRESHOLD = 0.1;

/**
 * Apply Ebbinghaus forgetting curve to a citizen's memories.
 *
 * Retention = e^(-age / S) where:
 *   age = currentTick - memory.tick
 *   S   = BASE_MEMORY_STRENGTH × (0.5 + importance)
 *
 * Episodic memories below threshold are pruned (forgotten).
 * Semantic memories below threshold lose confidence.
 */
export function decayMemories(
  citizenId: string,
  currentTick: number,
): {
  episodicPruned: number;
  semanticWeakened: number;
} {
  const mem = getMemory(citizenId);
  let episodicPruned = 0;
  let semanticWeakened = 0;

  // Decay episodic memories
  const surviving: EpisodicMemory[] = [];
  for (const ep of mem.episodic) {
    const age = Math.max(0, currentTick - ep.tick);
    const strength = BASE_MEMORY_STRENGTH * (0.5 + ep.importance);
    const retention = Math.exp(-age / strength);

    if (retention >= EPISODIC_DECAY_THRESHOLD) {
      surviving.push(ep);
    } else {
      episodicPruned++;
    }
  }
  mem.episodic = surviving;

  // Decay semantic confidence (don't prune — reduce confidence instead)
  for (const sem of mem.semantic) {
    const age = Math.max(0, currentTick - sem.learnedAt);
    const strength = BASE_MEMORY_STRENGTH * (0.5 + sem.confidence);
    const retention = Math.exp(-age / strength);

    if (retention < SEMANTIC_DECAY_THRESHOLD && sem.reinforcements < 3) {
      // Unreinforced, fading knowledge → weaken confidence
      sem.confidence = Math.max(0.05, sem.confidence * 0.9);
      semanticWeakened++;
    }
  }

  return { episodicPruned, semanticWeakened };
}

/** Check if consolidation should run this tick */
export function shouldConsolidate(currentTick: number): boolean {
  return currentTick > 0 && currentTick % CONSOLIDATION_INTERVAL === 0;
}

// ─── Context-Aware Memory Retrieval ─────────────────────────────

/**
 * Query memories relevant to the citizen's current situation.
 * Used by the prompt builder to inject context into LLM prompts.
 *
 * @returns A formatted string of relevant memories for prompt injection
 */
export function queryRelevantMemories(
  citizenId: string,
  context: {
    currentActivity: string;
    interactingWith?: string;
    topic?: string;
  },
): string {
  const mem = getMemory(citizenId);
  const parts: string[] = [];

  // Recent episodic memories (always include last 3)
  const recentEp = getRecentEpisodic(citizenId, 3);
  if (recentEp.length > 0) {
    parts.push("RECENT EXPERIENCES:");
    for (const ep of recentEp) {
      const sentiment = ep.valence > 0 ? "😊" : ep.valence < 0 ? "😞" : "😐";
      parts.push(`  ${sentiment} ${ep.description}`);
    }
  }

  // Relevant semantic knowledge (by topic or activity domain)
  const domain = context.topic || context.currentActivity.toLowerCase();
  const relevantKnowledge = mem.semantic
    .filter((s) => s.domain === domain || s.domain === "general" || s.domain === "personal")
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
  if (relevantKnowledge.length > 0) {
    parts.push("KNOWLEDGE:");
    for (const k of relevantKnowledge) {
      parts.push(`  • ${k.content} (confidence: ${(k.confidence * 100).toFixed(0)}%)`);
    }
  }

  // Top skills (procedural)
  const skills = getTopSkills(citizenId, 3);
  if (skills.length > 0) {
    parts.push("SKILLS:");
    for (const s of skills) {
      parts.push(
        `  • ${s.skill}: ${(s.proficiency * 100).toFixed(0)}% proficiency (used ${s.successCount + s.failureCount} times)`,
      );
    }
  }

  // Active goals (working memory)
  const goals = getActiveGoals(citizenId);
  if (goals.length > 0) {
    parts.push("CURRENT GOALS:");
    for (const g of goals) {
      parts.push(`  🎯 ${g.goal} (priority: ${(g.priority * 100).toFixed(0)}%)`);
    }
  }

  // Relationship with interacting citizen (if applicable)
  if (context.interactingWith) {
    const rel = getRelationshipWith(citizenId, context.interactingWith);
    if (rel) {
      const trustLabel =
        rel.trust > 0.5
          ? "trusted friend"
          : rel.trust > 0
            ? "acquaintance"
            : rel.trust > -0.5
              ? "wary of"
              : "distrusts";
      parts.push(
        `RELATIONSHIP with ${rel.citizenName}: ${trustLabel} (trust: ${(rel.trust * 100).toFixed(0)}%, interactions: ${rel.positiveInteractions + rel.negativeInteractions})`,
      );
    }
  }

  // Collective memory (most important items)
  const importantCollective = collectiveMemory
    .slice()
    .toSorted((a, b) => b.importance - a.importance)
    .slice(0, 2);
  if (importantCollective.length > 0) {
    parts.push("COLLECTIVE KNOWLEDGE:");
    for (const c of importantCollective) {
      parts.push(`  📚 [${c.type}] ${c.content}`);
    }
  }

  return parts.join("\n");
}

// ─── State Serialization (for persistence) ──────────────────────

/** Export all memory state for snapshot saving */
export function exportMemoryState(): {
  citizens: Record<string, CitizenMemory>;
  collective: CollectiveMemoryEntry[];
} {
  const citizens: Record<string, CitizenMemory> = {};
  for (const [id, mem] of citizenMemories) {
    citizens[id] = mem;
  }
  return { citizens, collective: collectiveMemory };
}

/** Import memory state from a snapshot */
export function importMemoryState(data: {
  citizens: Record<string, CitizenMemory>;
  collective: CollectiveMemoryEntry[];
}): void {
  citizenMemories.clear();
  for (const [id, mem] of Object.entries(data.citizens)) {
    citizenMemories.set(id, mem);
  }
  collectiveMemory = data.collective;
}

/** Reset all memory (for testing) */
export function resetAllMemory(): void {
  citizenMemories.clear();
  collectiveMemory = [];
}
