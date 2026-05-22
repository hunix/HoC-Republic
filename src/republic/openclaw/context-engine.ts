/**
 * OpenClaw Context Engine — Adapted for HoC Republic
 *
 * Pluggable context management for agents and citizens:
 *   bootstrap → ingest → assemble → compact
 *
 * The ContextEngine interface defines how an agent's conversational
 * and task context is maintained across interactions. Implementations
 * can range from simple in-memory buffers to RAG-powered systems.
 *
 * Default implementation wraps Republic's cognitive-loop data sources:
 *   - Citizen action history → ingested as context entries
 *   - Cognitive cycle results → assembled into context windows
 *   - Memory consolidation → compaction of stale entries
 *
 * Ported from upstream openclaw/src/context-engine/types.ts
 */

import { uid, ts } from "../utils.js";

// ─── Context Types ───────────────────────────────────────────────

export type ContextRole = "system" | "user" | "assistant" | "tool" | "memory" | "lesson";

export interface ContextEntry {
  id: string;
  role: ContextRole;
  content: string;
  /** Source identifier (e.g., "cognitive-loop", "action-history", "user-input") */
  source: string;
  /** Relevance score (0–1), used during assembly to pick most relevant entries */
  relevance: number;
  /** Token count estimate (4 chars ≈ 1 token) */
  tokenEstimate: number;
  /** Timestamp when entry was ingested */
  ingestedAt: string;
  /** Optional metadata */
  metadata: Record<string, unknown>;
}

export interface ContextWindow {
  entries: ContextEntry[];
  totalTokens: number;
  maxTokens: number;
  truncated: boolean;
}

export interface CompactionResult {
  entriesBefore: number;
  entriesAfter: number;
  tokensFreed: number;
  strategy: string;
}

// ─── Context Engine Interface ────────────────────────────────────

export interface IContextEngine {
  /** Engine identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;

  /**
   * Bootstrap the engine for a session. Called once at start.
   * Loads persistent context from storage (e.g., citizen memories, lessons).
   */
  bootstrap(sessionId: string, opts?: Record<string, unknown>): Promise<void>;

  /**
   * Ingest new context entries. Called on each user/tool interaction.
   */
  ingest(
    entries: Array<{
      role: ContextRole;
      content: string;
      source: string;
      metadata?: Record<string, unknown>;
    }>,
  ): void;

  /**
   * Assemble a context window respecting the token budget.
   * Picks the most relevant entries, trims or summarizes to fit.
   */
  assemble(maxTokens: number): ContextWindow;

  /**
   * Compact stale context to free memory.
   * Removes low-relevance entries, merges duplicates, etc.
   */
  compact(): CompactionResult;

  /**
   * Get raw entries for inspection.
   */
  getEntries(): ContextEntry[];

  /**
   * Get diagnostics.
   */
  getDiagnostics(): {
    sessionId: string;
    entryCount: number;
    totalTokens: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  };

  /**
   * Shutdown and release resources.
   */
  destroy(): void;
}

// ─── Default In-Memory Implementation ────────────────────────────

export class DefaultContextEngine implements IContextEngine {
  readonly id: string;
  readonly name = "default-memory";
  private sessionId = "";
  private entries: ContextEntry[] = [];
  private readonly MAX_ENTRIES = 500;

  constructor(id?: string) {
    this.id = id ?? `ctx-${uid()}`;
  }

  async bootstrap(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    this.entries = [];
  }

  ingest(
    items: Array<{
      role: ContextRole;
      content: string;
      source: string;
      metadata?: Record<string, unknown>;
    }>,
  ): void {
    for (const item of items) {
      const entry: ContextEntry = {
        id: `ce-${uid()}`,
        role: item.role,
        content: item.content,
        source: item.source,
        relevance: 1.0, // Default full relevance, decays over time
        tokenEstimate: Math.ceil(item.content.length / 4),
        ingestedAt: ts(),
        metadata: item.metadata ?? {},
      };
      this.entries.push(entry);
    }

    // Trim if over capacity
    if (this.entries.length > this.MAX_ENTRIES) {
      // Sort by relevance (ascending) and remove lowest
      this.entries.sort((a, b) => a.relevance - b.relevance);
      this.entries = this.entries.slice(this.entries.length - this.MAX_ENTRIES);
    }
  }

  assemble(maxTokens: number): ContextWindow {
    // Sort by relevance descending, then by recency
    const sorted = [...this.entries].toSorted((a, b) => {
      if (Math.abs(b.relevance - a.relevance) > 0.01) {
        return b.relevance - a.relevance;
      }
      return new Date(b.ingestedAt).getTime() - new Date(a.ingestedAt).getTime();
    });

    const selected: ContextEntry[] = [];
    let totalTokens = 0;

    for (const entry of sorted) {
      if (totalTokens + entry.tokenEstimate > maxTokens) {
        break;
      }
      selected.push(entry);
      totalTokens += entry.tokenEstimate;
    }

    return {
      entries: selected,
      totalTokens,
      maxTokens,
      truncated: sorted.length > selected.length,
    };
  }

  compact(): CompactionResult {
    const before = this.entries.length;
    const tokensBefore = this.entries.reduce((sum, e) => sum + e.tokenEstimate, 0);

    // Strategy: decay relevance of old entries, remove very low relevance
    const now = Date.now();
    for (const entry of this.entries) {
      const ageMs = now - new Date(entry.ingestedAt).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      // Decay: lose 10% relevance per hour, minimum 0.1
      entry.relevance = Math.max(0.1, entry.relevance * Math.pow(0.9, ageHours));
    }

    // Remove entries with relevance < 0.15
    this.entries = this.entries.filter((e) => e.relevance >= 0.15);

    // Deduplicate similar content (same source + similar content within 50 chars)
    const seen = new Map<string, ContextEntry>();
    const deduped: ContextEntry[] = [];
    for (const entry of this.entries) {
      const key = `${entry.source}:${entry.content.slice(0, 50)}`;
      const existing = seen.get(key);
      if (existing) {
        // Keep the higher-relevance one
        if (entry.relevance > existing.relevance) {
          seen.set(key, entry);
          deduped[deduped.indexOf(existing)] = entry;
        }
      } else {
        seen.set(key, entry);
        deduped.push(entry);
      }
    }
    this.entries = deduped;

    const tokensAfter = this.entries.reduce((sum, e) => sum + e.tokenEstimate, 0);

    return {
      entriesBefore: before,
      entriesAfter: this.entries.length,
      tokensFreed: tokensBefore - tokensAfter,
      strategy: "decay+dedup",
    };
  }

  getEntries(): ContextEntry[] {
    return [...this.entries];
  }

  getDiagnostics() {
    return {
      sessionId: this.sessionId,
      entryCount: this.entries.length,
      totalTokens: this.entries.reduce((sum, e) => sum + e.tokenEstimate, 0),
      oldestEntry: this.entries.length > 0 ? this.entries[0].ingestedAt : null,
      newestEntry:
        this.entries.length > 0 ? this.entries[this.entries.length - 1].ingestedAt : null,
    };
  }

  destroy(): void {
    this.entries = [];
  }
}
