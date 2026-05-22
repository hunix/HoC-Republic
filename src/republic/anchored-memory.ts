/**
 * Republic Platform — Anchored Memory Store
 *
 * Self-Evolving Citizen Architecture, Module 4:
 * MemGPT-Inspired Tiered Memory with Self-Managed Context Window
 *
 * Layers on TOP of the existing 6-type memory system (memory.ts),
 * adding:
 *   1. Tiered memory management (working → core → archival)
 *   2. Self-managed context window — citizens decide what to page in/out
 *   3. Memory anchors — pinned memories that survive all eviction
 *   4. Attention scoring — memories ranked by relevance to current context
 *   5. Memory synthesis — compress old memories into summaries
 *
 * Inspired by:
 *   - MemGPT/Letta (tiered memory, self-managed context)
 *   - Reflexion (episodic memory + verbal self-critique)
 *   - VOYAGER (skill library ↔ procedural memory bridge)
 *
 * This module does NOT replace memory.ts — it wraps it with a context
 * window manager that decides what the citizen "has in mind" at any tick.
 */

import {
    addSemanticMemory, getAllSemantic, getMemory,
    getRecentEpisodic, getRelationships, getTopSkills, type EpisodicMemory
} from "./memory.js";
import type { Citizen, RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

/** Memory tier in the MemGPT hierarchy */
export type MemoryTier = "working" | "core" | "archival";

/** Memory priority for context window allocation */
export type MemoryPriority = "critical" | "high" | "medium" | "low" | "background";

/** A single item in the citizen's context window */
export interface ContextItem {
  id: string;
  /** What tier this item lives in */
  tier: MemoryTier;
  /** Priority for retention in the context window */
  priority: MemoryPriority;
  /** The actual content (rendered as text for prompt injection) */
  content: string;
  /** Source: which memory type this came from */
  source: "episodic" | "semantic" | "procedural" | "working" | "social" | "collective" | "synthesized" | "anchor";
  /** Reference to the original memory ID */
  sourceId: string;
  /** Attention score: 0–1, higher = more relevant now */
  attention: number;
  /** Whether this item is anchored (pinned — cannot be evicted) */
  anchored: boolean;
  /** Token count estimate (1 token ≈ 4 chars) */
  tokenEstimate: number;
  /** When this item was paged into the context window */
  pagedInAt: string;
  /** How many ticks this item has been in the window */
  ticksInWindow: number;
}

/** Memory anchor — a pinned memory that cannot be evicted */
export interface MemoryAnchor {
  id: string;
  /** What this anchor preserves */
  description: string;
  /** The content that must stay in context */
  content: string;
  /** Why this was anchored */
  reason: string;
  /** Who created this anchor */
  createdBy: string;
  createdAt: string;
}

/** Memory synthesis — compressed summary of older memories */
export interface MemorySynthesis {
  id: string;
  /** Summary covering multiple memories */
  summary: string;
  /** IDs of the source memories that were compressed */
  sourceMemoryIds: string[];
  /** Domain tag */
  domain: string;
  /** Confidence in the synthesis */
  confidence: number;
  /** When synthesized */
  synthesizedAt: string;
  /** How many memories were compressed */
  compressionCount: number;
}

/** The complete anchored memory state for a citizen */
export interface AnchoredMemoryState {
  /** Items currently in the context window */
  contextWindow: ContextItem[];
  /** Maximum tokens allowed in the context window */
  maxContextTokens: number;
  /** Current token usage */
  currentTokens: number;
  /** Anchored memories (always in context) */
  anchors: MemoryAnchor[];
  /** Synthesized memory summaries (archival tier) */
  syntheses: MemorySynthesis[];
  /** Attention history (which items were attended to recently) */
  attentionHistory: Array<{ itemId: string; tick: number; score: number }>;
  /** Last synthesis tick */
  lastSynthesisTick: number;
}

// ─── Configuration ──────────────────────────────────────────────

/** Default max tokens for the context window */
const DEFAULT_MAX_CONTEXT_TOKENS = 4000;

/** Fraction of window reserved for anchors */
const ANCHOR_RESERVE_FRACTION = 0.2;

/** Ticks between memory synthesis runs */
const SYNTHESIS_INTERVAL = 100;

/** Max syntheses per citizen */
const MAX_SYNTHESES = 50;

/** Max attention history entries */
const MAX_ATTENTION_HISTORY = 200;

/** Priority → numeric score for sorting */
const PRIORITY_SCORES: Record<MemoryPriority, number> = {
  critical: 1.0,
  high: 0.8,
  medium: 0.5,
  low: 0.3,
  background: 0.1,
};

// ─── State ──────────────────────────────────────────────────────

const anchoredStates = new Map<string, AnchoredMemoryState>();

// ─── State Sync ─────────────────────────────────────────────────

/** Serialize for persistence */
export function serializeAnchoredMemoryState(): Record<string, AnchoredMemoryState> {
  const out: Record<string, AnchoredMemoryState> = {};
  for (const [cid, state] of anchoredStates) {
    out[cid] = state;
  }
  return out;
}

/** Restore from persistence */
export function restoreAnchoredMemoryState(
  data: Record<string, AnchoredMemoryState>,
): void {
  anchoredStates.clear();
  for (const [cid, state] of Object.entries(data)) {
    anchoredStates.set(cid, state);
  }
}

// ─── Initialization ─────────────────────────────────────────────

/** Get or create the anchored memory state for a citizen */
export function getAnchoredState(citizenId: string): AnchoredMemoryState {
  let state = anchoredStates.get(citizenId);
  if (!state) {
    state = {
      contextWindow: [],
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
      currentTokens: 0,
      anchors: [],
      syntheses: [],
      attentionHistory: [],
      lastSynthesisTick: 0,
    };
    anchoredStates.set(citizenId, state);
  }
  return state;
}

// ─── Context Window Management (MemGPT Core) ───────────────────

/**
 * Rebuild the context window for a citizen based on their current state.
 *
 * This is the MemGPT "self-managed context" pattern:
 * 1. Start with anchored memories (always present)
 * 2. Page in working memory (current goals)
 * 3. Rank remaining memories by attention score
 * 4. Fill the rest of the window with highest-attention items
 * 5. Evict items that exceed the token budget
 *
 * @returns The rebuilt context window as items
 */
export function rebuildContextWindow(
  citizen: Citizen,
  state: RepublicState,
): ContextItem[] {
  const anchoredState = getAnchoredState(citizen.id);
  const mem = getMemory(citizen.id);
  const candidates: ContextItem[] = [];

  // — Step 1: Anchors (always included, critical priority)
  for (const anchor of anchoredState.anchors) {
    candidates.push({
      id: anchor.id,
      tier: "working",
      priority: "critical",
      content: anchor.content,
      source: "anchor",
      sourceId: anchor.id,
      attention: 1.0,
      anchored: true,
      tokenEstimate: estimateTokens(anchor.content),
      pagedInAt: ts(),
      ticksInWindow: 0,
    });
  }

  // — Step 2: Working memory (current goals — always high priority)
  for (const goal of mem.working.filter((w) => !w.completed)) {
    candidates.push({
      id: `wm-${goal.id}`,
      tier: "working",
      priority: "high",
      content: `Goal: ${goal.goal} (priority: ${(goal.priority * 100).toFixed(0)}%) — ${goal.context}`,
      source: "working",
      sourceId: goal.id,
      attention: goal.priority,
      anchored: false,
      tokenEstimate: estimateTokens(goal.goal + goal.context),
      pagedInAt: ts(),
      ticksInWindow: 0,
    });
  }

  // — Step 3: Recent episodic memories (core tier)
  const recentEps = getRecentEpisodic(citizen.id, 10);
  for (const ep of recentEps) {
    const recency = 1 - Math.min(1, (state.currentTick - ep.tick) / 200);
    candidates.push({
      id: `ep-${ep.id}`,
      tier: "core",
      priority: ep.importance > 0.7 ? "high" : "medium",
      content: ep.description,
      source: "episodic",
      sourceId: ep.id,
      attention: (ep.importance + recency) / 2,
      anchored: false,
      tokenEstimate: estimateTokens(ep.description),
      pagedInAt: ts(),
      ticksInWindow: 0,
    });
  }

  // — Step 4: Relevant semantic knowledge (core/archival)
  const _activity = citizen.activity?.toLowerCase() ?? "";
  const relevantSemantic = getAllSemantic(citizen.id)
    .filter((s) => s.confidence > 0.3)
    .toSorted((a, b) => b.confidence * b.reinforcements - a.confidence * a.reinforcements)
    .slice(0, 10);

  for (const sem of relevantSemantic) {
    candidates.push({
      id: `sem-${sem.id}`,
      tier: sem.confidence > 0.7 ? "core" : "archival",
      priority: sem.confidence > 0.8 ? "medium" : "low",
      content: `[${sem.domain}] ${sem.content}`,
      source: "semantic",
      sourceId: sem.id,
      attention: sem.confidence * (1 + sem.reinforcements * 0.1),
      anchored: false,
      tokenEstimate: estimateTokens(sem.content),
      pagedInAt: ts(),
      ticksInWindow: 0,
    });
  }

  // — Step 5: Top procedural memories (skills)
  const skills = getTopSkills(citizen.id, 5);
  for (const skill of skills) {
    candidates.push({
      id: `proc-${skill.id}`,
      tier: "core",
      priority: skill.proficiency > 0.7 ? "medium" : "low",
      content: `Skill: ${skill.skill} (${(skill.proficiency * 100).toFixed(0)}% proficiency)`,
      source: "procedural",
      sourceId: skill.id,
      attention: skill.proficiency,
      anchored: false,
      tokenEstimate: estimateTokens(skill.skill),
      pagedInAt: ts(),
      ticksInWindow: 0,
    });
  }

  // — Step 6: Social context (if interacting)
  const relationships = getRelationships(citizen.id).slice(0, 5);
  for (const rel of relationships) {
    candidates.push({
      id: `soc-${rel.citizenId}`,
      tier: "core",
      priority: Math.abs(rel.trust) > 0.5 ? "medium" : "low",
      content: `Relationship with ${rel.citizenName}: trust ${(rel.trust * 100).toFixed(0)}%, ${rel.summary}`,
      source: "social",
      sourceId: rel.citizenId,
      attention: Math.abs(rel.trust) * 0.7,
      anchored: false,
      tokenEstimate: estimateTokens(rel.summary),
      pagedInAt: ts(),
      ticksInWindow: 0,
    });
  }

  // — Step 7: Synthesized memories (archival — paged in if relevant)
  for (const syn of anchoredState.syntheses) {
    candidates.push({
      id: `syn-${syn.id}`,
      tier: "archival",
      priority: "background",
      content: `[Summary] ${syn.summary}`,
      source: "synthesized",
      sourceId: syn.id,
      attention: syn.confidence * 0.5,
      anchored: false,
      tokenEstimate: estimateTokens(syn.summary),
      pagedInAt: ts(),
      ticksInWindow: 0,
    });
  }

  // — Step 8: Sort by composite score (anchored first, then by attention × priority score)
  candidates.sort((a, b) => {
    if (a.anchored && !b.anchored) {return -1;}
    if (!a.anchored && b.anchored) {return 1;}
    const aScore = a.attention * PRIORITY_SCORES[a.priority];
    const bScore = b.attention * PRIORITY_SCORES[b.priority];
    return bScore - aScore;
  });

  // — Step 9: Fill the window within token budget
  const maxTokens = anchoredState.maxContextTokens;
  const window: ContextItem[] = [];
  let usedTokens = 0;

  for (const item of candidates) {
    if (usedTokens + item.tokenEstimate <= maxTokens) {
      window.push(item);
      usedTokens += item.tokenEstimate;
    } else if (item.anchored) {
      // Anchored items always go in, even if they push over budget
      window.push(item);
      usedTokens += item.tokenEstimate;
    }
  }

  // Update state
  anchoredState.contextWindow = window;
  anchoredState.currentTokens = usedTokens;

  return window;
}

/**
 * Render the context window as a formatted string for prompt injection.
 *
 * This replaces the basic `queryRelevantMemories()` from memory.ts
 * with a richer, attention-scored context.
 */
export function renderContextWindow(citizenId: string): string {
  const state = getAnchoredState(citizenId);
  if (state.contextWindow.length === 0) {return "";}

  const sections: Record<string, string[]> = {
    anchors: [],
    goals: [],
    experiences: [],
    knowledge: [],
    skills: [],
    relationships: [],
    summaries: [],
  };

  for (const item of state.contextWindow) {
    switch (item.source) {
      case "anchor":
        sections.anchors.push(`  📌 ${item.content}`);
        break;
      case "working":
        sections.goals.push(`  🎯 ${item.content}`);
        break;
      case "episodic":
        const emoji = item.attention > 0.6 ? "⭐" : "💭";
        sections.experiences.push(`  ${emoji} ${item.content}`);
        break;
      case "semantic":
        sections.knowledge.push(`  📚 ${item.content}`);
        break;
      case "procedural":
        sections.skills.push(`  🔧 ${item.content}`);
        break;
      case "social":
        sections.relationships.push(`  🤝 ${item.content}`);
        break;
      case "synthesized":
        sections.summaries.push(`  📋 ${item.content}`);
        break;
    }
  }

  const parts: string[] = [];
  if (sections.anchors.length) {parts.push("ANCHORED MEMORIES:\n" + sections.anchors.join("\n"));}
  if (sections.goals.length) {parts.push("CURRENT GOALS:\n" + sections.goals.join("\n"));}
  if (sections.experiences.length) {parts.push("RECENT EXPERIENCES:\n" + sections.experiences.join("\n"));}
  if (sections.knowledge.length) {parts.push("KNOWLEDGE:\n" + sections.knowledge.join("\n"));}
  if (sections.skills.length) {parts.push("SKILLS:\n" + sections.skills.join("\n"));}
  if (sections.relationships.length) {parts.push("RELATIONSHIPS:\n" + sections.relationships.join("\n"));}
  if (sections.summaries.length) {parts.push("SYNTHESIZED MEMORIES:\n" + sections.summaries.join("\n"));}

  return parts.join("\n\n");
}

// ─── Memory Anchoring ───────────────────────────────────────────

/** Pin a memory as an anchor (will never be evicted from context) */
export function anchorMemory(
  citizenId: string,
  description: string,
  content: string,
  reason: string,
): MemoryAnchor | null {
  const state = getAnchoredState(citizenId);

  // Limit anchors to prevent bloating
  const anchorTokens = state.anchors.reduce((s, a) => s + estimateTokens(a.content), 0);
  const maxAnchorTokens = state.maxContextTokens * ANCHOR_RESERVE_FRACTION;
  if (anchorTokens + estimateTokens(content) > maxAnchorTokens) {return null;}

  const anchor: MemoryAnchor = {
    id: uid(),
    description,
    content,
    reason,
    createdBy: citizenId,
    createdAt: ts(),
  };

  state.anchors.push(anchor);
  return anchor;
}

/** Remove an anchor */
export function removeAnchor(citizenId: string, anchorId: string): boolean {
  const state = getAnchoredState(citizenId);
  const idx = state.anchors.findIndex((a) => a.id === anchorId);
  if (idx === -1) {return false;}
  state.anchors.splice(idx, 1);
  return true;
}

/** Get all anchors for a citizen */
export function getAnchors(citizenId: string): MemoryAnchor[] {
  return getAnchoredState(citizenId).anchors;
}

// ─── Memory Synthesis ───────────────────────────────────────────

/**
 * Synthesize older episodic memories into compressed summaries.
 *
 * MemGPT's key insight: instead of losing old memories, compress them
 * into summaries that live in archival tier and can be paged back in.
 *
 * Groups memories by tags/domain, creates a synthesis per group.
 */
export function synthesizeMemories(
  citizenId: string,
  currentTick: number,
): MemorySynthesis[] {
  const anchoredState = getAnchoredState(citizenId);
  const mem = getMemory(citizenId);

  // Only synthesize if enough time has passed
  if (currentTick - anchoredState.lastSynthesisTick < SYNTHESIS_INTERVAL) {return [];}

  const newSyntheses: MemorySynthesis[] = [];

  // Group older episodic memories by tags (excluding recent ones)
  const olderEps = mem.episodic.filter(
    (ep) => currentTick - ep.tick > 50,
  );

  const tagGroups = new Map<string, EpisodicMemory[]>();
  for (const ep of olderEps) {
    const tag = ep.tags[0] || "general";
    const group = tagGroups.get(tag) || [];
    group.push(ep);
    tagGroups.set(tag, group);
  }

  // Synthesize groups with 5+ memories
  for (const [tag, episodes] of tagGroups) {
    if (episodes.length < 5) {continue;}

    // Check if we already have a synthesis for this domain
    const existingSyn = anchoredState.syntheses.find(
      (s) => s.domain === tag && s.sourceMemoryIds.some((id) => episodes.some((e) => e.id === id)),
    );
    if (existingSyn) {continue;}

    const avgValence = episodes.reduce((sum, e) => sum + e.valence, 0) / episodes.length;
    const avgImportance = episodes.reduce((sum, e) => sum + e.importance, 0) / episodes.length;
    const sentiment = avgValence > 0.2 ? "positive" : avgValence < -0.2 ? "negative" : "mixed";

    // Create a compressed summary
    const significant = episodes
      .toSorted((a, b) => b.importance - a.importance)
      .slice(0, 3);
    const highlights = significant.map((e) => e.description).join("; ");

    const synthesis: MemorySynthesis = {
      id: uid(),
      summary: `${episodes.length} ${sentiment} experiences related to "${tag}": ${highlights}`,
      sourceMemoryIds: episodes.map((e) => e.id),
      domain: tag,
      confidence: Math.min(1.0, 0.5 + avgImportance),
      synthesizedAt: ts(),
      compressionCount: episodes.length,
    };

    newSyntheses.push(synthesis);
    anchoredState.syntheses.push(synthesis);

    // Also store as semantic memory for cross-module access
    addSemanticMemory(citizenId, {
      content: synthesis.summary,
      domain: tag,
      source: "consolidation",
      confidence: synthesis.confidence,
      learnedAt: currentTick,
    });
  }

  // Cap total syntheses
  if (anchoredState.syntheses.length > MAX_SYNTHESES) {
    anchoredState.syntheses = anchoredState.syntheses.slice(-MAX_SYNTHESES);
  }

  anchoredState.lastSynthesisTick = currentTick;
  return newSyntheses;
}

// ─── Attention System ───────────────────────────────────────────

/**
 * Record that a citizen "attended to" a context item.
 *
 * Attention data is used to improve future context window building:
 * items that are frequently attended to get higher attention scores.
 */
export function recordAttention(
  citizenId: string,
  itemId: string,
  tick: number,
  score: number,
): void {
  const state = getAnchoredState(citizenId);
  state.attentionHistory.push({ itemId, tick, score });
  if (state.attentionHistory.length > MAX_ATTENTION_HISTORY) {
    state.attentionHistory = state.attentionHistory.slice(-MAX_ATTENTION_HISTORY);
  }
}

/**
 * Get the average attention score for a source memory ID.
 * Used to adjust future paging decisions.
 */
export function getAttentionScore(citizenId: string, sourceId: string): number {
  const state = getAnchoredState(citizenId);
  const relevant = state.attentionHistory.filter((h) => h.itemId === sourceId);
  if (relevant.length === 0) {return 0.5;} // Neutral default
  return relevant.reduce((sum, h) => sum + h.score, 0) / relevant.length;
}

// ─── Query API ──────────────────────────────────────────────────

/** Get context window stats */
export function getContextWindowStats(citizenId: string): {
  itemCount: number;
  tokenUsage: number;
  maxTokens: number;
  utilizationPct: number;
  anchoredCount: number;
  tierBreakdown: Record<MemoryTier, number>;
  sourceBreakdown: Record<string, number>;
} {
  const state = getAnchoredState(citizenId);
  const tierBreakdown: Record<MemoryTier, number> = { working: 0, core: 0, archival: 0 };
  const sourceBreakdown: Record<string, number> = {};

  for (const item of state.contextWindow) {
    tierBreakdown[item.tier]++;
    sourceBreakdown[item.source] = (sourceBreakdown[item.source] || 0) + 1;
  }

  return {
    itemCount: state.contextWindow.length,
    tokenUsage: state.currentTokens,
    maxTokens: state.maxContextTokens,
    utilizationPct: parseFloat(((state.currentTokens / state.maxContextTokens) * 100).toFixed(1)),
    anchoredCount: state.anchors.length,
    tierBreakdown,
    sourceBreakdown,
  };
}

/** Get all syntheses for a citizen */
export function getSyntheses(citizenId: string): MemorySynthesis[] {
  return getAnchoredState(citizenId).syntheses;
}

/** Adjust the context window size for a citizen */
export function setMaxContextTokens(citizenId: string, maxTokens: number): void {
  getAnchoredState(citizenId).maxContextTokens = Math.max(500, Math.min(16000, maxTokens));
}

// ─── Tick Integration ───────────────────────────────────────────

/**
 * Per-tick processing for the anchored memory store.
 *
 * 1. Rebuild context window with fresh attention scores
 * 2. Run memory synthesis if due
 * 3. Increment tick counters on window items
 */
export function anchoredMemoryTick(
  citizen: Citizen,
  state: RepublicState,
): void {
  const anchoredState = getAnchoredState(citizen.id);

  // Increment tick counters on existing window items
  for (const item of anchoredState.contextWindow) {
    item.ticksInWindow++;
  }

  // Rebuild context window every 5 ticks (not every tick — performance)
  if (state.currentTick % 5 === 0) {
    rebuildContextWindow(citizen, state);
  }

  // Synthesize older memories periodically
  synthesizeMemories(citizen.id, state.currentTick);
}

// ─── Helpers ────────────────────────────────────────────────────

/** Estimate token count from text (rough: 1 token ≈ 4 characters) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
