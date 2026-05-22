/**
 * OpenClaw Memory Dreaming — Adapted for HoC Republic
 *
 * Three-phase memory consolidation integrated into tick-orchestrator:
 *
 * Phase 1: LIGHT DREAMING (every 50 ticks)
 *   - Deduplicates recent citizen memories
 *   - Scores importance based on action outcomes
 *   - Prunes low-value transient memories
 *
 * Phase 2: DEEP DREAMING (every 200 ticks)
 *   - Promotes high-scoring memories to permanent storage
 *   - Builds cross-memory associations (pattern linking)
 *   - Distills lessons from repeated failure/success patterns
 *
 * Phase 3: REM DREAMING (every 500 ticks)
 *   - Cross-citizen pattern synthesis (collective intelligence)
 *   - Generates novel hypotheses from combined memories
 *   - Publishes insights to intelligence-bus
 *
 * This enhances the existing cognitive-loop by adding structured memory
 * consolidation that operates at a deeper level than per-tick reflection.
 *
 * Ported from upstream openclaw/src/memory-host-sdk/dreaming.ts
 */

import type { Citizen, RepublicState } from "../types.js";
import { intelligenceBus } from "../intelligence-bus.js";
import { uid, ts } from "../utils.js";

/** Seeded-compatible RNG (wraps Math.random for now) */
const rng = () => Math.random();

// ─── Memory Types ────────────────────────────────────────────────

export interface DreamMemory {
  id: string;
  citizenId: string;
  content: string;
  source: "action" | "cognitive" | "social" | "lesson" | "dream";
  /** Importance score: 0–1 */
  importance: number;
  /** Emotional valence: -1 (negative) to 1 (positive) */
  valence: number;
  /** Number of times this memory was reinforced */
  reinforcements: number;
  /** Associated memory IDs (cross-links) */
  associations: string[];
  /** Whether this has been promoted to long-term storage */
  promoted: boolean;
  createdAt: string;
  lastAccessedAt: string;
}

export interface DreamingResult {
  phase: "light" | "deep" | "rem";
  citizenId: string;
  memoriesProcessed: number;
  memoriesCreated: number;
  memoriesPruned: number;
  memoriesPromoted: number;
  associationsFormed: number;
  insightsGenerated: number;
  durationMs: number;
}

export interface DreamingConfig {
  lightDreamingInterval: number; // ticks
  deepDreamingInterval: number; // ticks
  remDreamingInterval: number; // ticks
  maxMemoriesPerCitizen: number;
  minImportanceForPromotion: number;
  pruneThreshold: number;
}

const DEFAULT_CONFIG: DreamingConfig = {
  lightDreamingInterval: 50,
  deepDreamingInterval: 200,
  remDreamingInterval: 500,
  maxMemoriesPerCitizen: 200,
  minImportanceForPromotion: 0.7,
  pruneThreshold: 0.15,
};

// ─── Memory Store ────────────────────────────────────────────────

class DreamMemoryStore {
  /** citizenId → memories */
  private readonly store = new Map<string, DreamMemory[]>();
  /** Global promoted memories (shared insights) */
  private readonly promotedMemories: DreamMemory[] = [];
  private readonly MAX_PROMOTED = 500;
  private config: DreamingConfig;

  constructor(config?: Partial<DreamingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Ingest raw memories from a citizen's action history.
   */
  ingestFromActions(citizen: Citizen): number {
    const actions = citizen.actionHistory ?? [];
    if (actions.length === 0) {
      return 0;
    }

    const memories = this.getOrCreate(citizen.id);
    const recent = actions.slice(-20); // Last 20 actions
    let ingested = 0;

    for (const action of recent) {
      // Check if we already have a memory for this action
      const toolName = action.tool ?? "unknown";
      const exists = memories.some(
        (m) =>
          m.content.includes(toolName) &&
          m.content.includes(action.success ? "succeeded" : "failed"),
      );
      if (exists) {
        continue;
      }

      const memory: DreamMemory = {
        id: `mem-${uid()}`,
        citizenId: citizen.id,
        content:
          `${toolName}: ${action.success ? "succeeded" : "failed"} (tick ${action.tick}, credit Δ${action.creditDelta})`.slice(
            0,
            200,
          ),
        source: "action",
        importance: action.success ? 0.3 + rng() * 0.3 : 0.5 + rng() * 0.3, // Failures are more important
        valence: action.success ? 0.3 + rng() * 0.4 : -0.3 - rng() * 0.4,
        reinforcements: 0,
        associations: [],
        promoted: false,
        createdAt: ts(),
        lastAccessedAt: ts(),
      };

      memories.push(memory);
      ingested++;
    }

    // Trim to max
    if (memories.length > this.config.maxMemoriesPerCitizen) {
      memories.sort((a, b) => a.importance - b.importance);
      memories.splice(0, memories.length - this.config.maxMemoriesPerCitizen);
    }

    return ingested;
  }

  /**
   * Phase 1: Light Dreaming
   * Deduplicates, scores, and prunes transient memories.
   */
  lightDream(citizenId: string): DreamingResult {
    const start = Date.now();
    const memories = this.getOrCreate(citizenId);
    const before = memories.length;
    let pruned = 0;

    // 1. Deduplicate — merge memories with similar content
    const contentMap = new Map<string, DreamMemory>();
    const deduped: DreamMemory[] = [];

    for (const mem of memories) {
      const key = mem.content.slice(0, 60).toLowerCase();
      const existing = contentMap.get(key);
      if (existing) {
        // Merge: keep higher importance, increment reinforcements
        existing.importance = Math.min(1, Math.max(existing.importance, mem.importance) + 0.05);
        existing.reinforcements++;
        existing.lastAccessedAt = ts();
        pruned++;
      } else {
        contentMap.set(key, mem);
        deduped.push(mem);
      }
    }

    // 2. Decay old memories
    const now = Date.now();
    for (const mem of deduped) {
      const ageHours = (now - new Date(mem.createdAt).getTime()) / (1000 * 60 * 60);
      const decayFactor = Math.pow(0.95, ageHours); // 5% decay per hour
      mem.importance *= decayFactor;
      // Reinforced memories resist decay
      mem.importance += mem.reinforcements * 0.02;
      mem.importance = Math.min(1, mem.importance);
    }

    // 3. Prune below threshold
    const afterPrune = deduped.filter((m) => m.importance >= this.config.pruneThreshold);
    const additionalPruned = deduped.length - afterPrune.length;
    pruned += additionalPruned;

    this.store.set(citizenId, afterPrune);

    return {
      phase: "light",
      citizenId,
      memoriesProcessed: before,
      memoriesCreated: 0,
      memoriesPruned: pruned,
      memoriesPromoted: 0,
      associationsFormed: 0,
      insightsGenerated: 0,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Phase 2: Deep Dreaming
   * Promotes high-value memories, builds associations.
   */
  deepDream(citizenId: string): DreamingResult {
    const start = Date.now();
    const memories = this.getOrCreate(citizenId);
    let promoted = 0;
    let associations = 0;

    // 1. Promote high-importance memories
    for (const mem of memories) {
      if (!mem.promoted && mem.importance >= this.config.minImportanceForPromotion) {
        mem.promoted = true;
        this.promotedMemories.push(mem);
        promoted++;
      }
    }
    // Cap promoted memories to prevent unbounded growth
    if (this.promotedMemories.length > this.MAX_PROMOTED) {
      this.promotedMemories.splice(0, this.promotedMemories.length - this.MAX_PROMOTED);
    }

    // 2. Build associations between related memories
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const a = memories[i];
        const b = memories[j];

        // Associate if from same source or similar valence
        if (a.source === b.source || Math.abs(a.valence - b.valence) < 0.2) {
          if (!a.associations.includes(b.id)) {
            a.associations.push(b.id);
            b.associations.push(a.id);
            associations++;
          }
        }

        // Limit associations per memory
        if (a.associations.length > 10) {
          a.associations = a.associations.slice(-10);
        }
        if (b.associations.length > 10) {
          b.associations = b.associations.slice(-10);
        }
      }
    }

    // 3. Distill lessons from failure patterns
    const failures = memories.filter((m) => m.valence < -0.2 && m.source === "action");
    let insightsGenerated = 0;
    if (failures.length >= 3) {
      // Create a synthesized lesson memory
      const lesson: DreamMemory = {
        id: `mem-${uid()}`,
        citizenId,
        content: `Lesson: ${failures.length} failures detected in similar tasks. Adaptations needed.`,
        source: "lesson",
        importance: 0.8,
        valence: 0.1, // Lessons are slightly positive (growth)
        reinforcements: failures.length,
        associations: failures.map((f) => f.id).slice(0, 5),
        promoted: false,
        createdAt: ts(),
        lastAccessedAt: ts(),
      };
      memories.push(lesson);
      insightsGenerated = 1;
    }

    return {
      phase: "deep",
      citizenId,
      memoriesProcessed: memories.length,
      memoriesCreated: insightsGenerated,
      memoriesPruned: 0,
      memoriesPromoted: promoted,
      associationsFormed: associations,
      insightsGenerated,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Phase 3: REM Dreaming
   * Cross-citizen pattern synthesis — collective intelligence.
   */
  // oxlint-disable-next-line no-unused-vars
  remDream(state: RepublicState): DreamingResult[] {
    const results: DreamingResult[] = [];

    // Only process citizens with enough promoted memories
    const citizensWithMemories = [...this.store.entries()]
      .filter(([_, memories]) => memories.some((m) => m.promoted))
      .slice(0, 10); // Process max 10 citizens per REM cycle

    for (const [citizenId, memories] of citizensWithMemories) {
      const start = Date.now();
      const promoted = memories.filter((m) => m.promoted);
      let insightsGenerated = 0;

      // Cross-reference with other citizens' promoted memories
      for (const otherPromoted of this.promotedMemories) {
        if (otherPromoted.citizenId === citizenId) {
          continue;
        }

        // Find content overlap — very simple substring check
        const overlap = promoted.some(
          (p) => p.source === otherPromoted.source && p.valence * otherPromoted.valence > 0,
        );

        if (overlap && rng() > 0.7) {
          // Synthesize a cross-citizen insight
          const insight: DreamMemory = {
            id: `mem-${uid()}`,
            citizenId,
            content: `Cross-citizen insight: Pattern from ${otherPromoted.citizenId} reinforces local experience.`,
            source: "dream",
            importance: 0.85,
            valence: 0.5,
            reinforcements: 0,
            associations: [otherPromoted.id],
            promoted: false,
            createdAt: ts(),
            lastAccessedAt: ts(),
          };
          memories.push(insight);
          insightsGenerated++;
        }

        // Limit cross-insights per REM cycle
        if (insightsGenerated >= 3) {
          break;
        }
      }

      results.push({
        phase: "rem",
        citizenId,
        memoriesProcessed: promoted.length,
        memoriesCreated: insightsGenerated,
        memoriesPruned: 0,
        memoriesPromoted: 0,
        associationsFormed: 0,
        insightsGenerated,
        durationMs: Date.now() - start,
      });
    }

    // Publish collective insight to intelligence bus
    if (results.some((r) => r.insightsGenerated > 0)) {
      intelligenceBus.publish("citizen.cognitive_cycle", {
        citizenId: "system",
        citizenName: "Dream Engine",
        curiosityScore: 1.0,
        reflectionSummary: `REM dreaming cycle: ${results.reduce((s, r) => s + r.insightsGenerated, 0)} cross-citizen insights synthesized`,
        newMemories: results.reduce((s, r) => s + r.memoriesCreated, 0),
        timestamp: Date.now(),
      });
    }

    return results;
  }

  // ─── Tick Integration ──────────────────────────────────────────

  /**
   * Called from tick-orchestrator. Determines which dreaming phase(s) to run.
   */
  onTick(tick: number, state: RepublicState): DreamingResult[] {
    const results: DreamingResult[] = [];

    // Ingest new memories from active citizens
    if (tick % 10 === 0) {
      for (const citizen of state.citizens) {
        if ((citizen.energy ?? 50) > 20 && citizen.actionHistory?.length) {
          this.ingestFromActions(citizen);
        }
      }
    }

    // Phase 1: Light dreaming
    if (tick % this.config.lightDreamingInterval === 0) {
      for (const citizenId of this.store.keys()) {
        results.push(this.lightDream(citizenId));
      }
    }

    // Phase 2: Deep dreaming
    if (tick % this.config.deepDreamingInterval === 0) {
      for (const citizenId of this.store.keys()) {
        results.push(this.deepDream(citizenId));
      }
    }

    // Phase 3: REM dreaming
    if (tick % this.config.remDreamingInterval === 0) {
      results.push(...this.remDream(state));
    }

    return results;
  }

  // ─── Queries ─────────────────────────────────────────────────────

  getMemories(citizenId: string): DreamMemory[] {
    return this.store.get(citizenId) ?? [];
  }

  getPromotedMemories(limit = 50): DreamMemory[] {
    return this.promotedMemories.slice(0, limit);
  }

  getStats(): {
    totalMemories: number;
    citizensWithMemories: number;
    promotedMemories: number;
    avgMemoriesPerCitizen: number;
  } {
    let total = 0;
    for (const memories of this.store.values()) {
      total += memories.length;
    }
    const citizenCount = this.store.size;
    return {
      totalMemories: total,
      citizensWithMemories: citizenCount,
      promotedMemories: this.promotedMemories.length,
      avgMemoriesPerCitizen: citizenCount > 0 ? Math.round(total / citizenCount) : 0,
    };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private getOrCreate(citizenId: string): DreamMemory[] {
    let memories = this.store.get(citizenId);
    if (!memories) {
      memories = [];
      this.store.set(citizenId, memories);
    }
    return memories;
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const dreamMemoryStore = new DreamMemoryStore();
