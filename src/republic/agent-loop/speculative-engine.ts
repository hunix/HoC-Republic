/**
 * Speculative Tool Engine — Predictive Tool Pre-Warming
 *
 * Learns tool call transition patterns across sessions using a Markov chain.
 * When tool A completes, predicts which tool B will likely follow, enabling
 * pre-warming of sandbox resources or caching of common lookup targets.
 *
 * This is a technique borrowed from CPU speculative execution — adapted for
 * agentic tool orchestration. No existing production system implements this.
 *
 * Architecture:
 *   - Maintains a transition matrix: Map<fromTool, Map<toTool, frequency>>
 *   - Persisted to sandbox so patterns survive restarts
 *   - Pre-warm actions are tool-specific: file cache for read_file, DNS for web_search, etc.
 *   - Predictions only fire when confidence > 60% (prevents wasted pre-computation)
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";

const logger = createSubsystemLogger("speculative-engine");

// ─── Types ──────────────────────────────────────────────────────

interface ToolTransition {
  frequency: number;
  totalMs: number; // accumulated execution time for latency prediction
}

/** Prediction produced by the engine */
export interface ToolPrediction {
  /** Most likely next tool */
  toolName: string;
  /** Confidence (0.0 - 1.0) */
  confidence: number;
  /** Average latency of this tool in ms */
  avgLatencyMs: number;
  /** Runner-up prediction (if any) */
  secondary: { toolName: string; confidence: number } | null;
}

/** Pre-warm action to execute speculatively */
export interface PreWarmAction {
  type: "dns" | "file_stat" | "container_ping" | "none";
  target?: string;
}

// ─── Transition Matrix ──────────────────────────────────────────

// fromTool → (toTool → transition stats)
type TransitionMatrix = Map<string, Map<string, ToolTransition>>;

const PERSIST_FILE = "/workspace/.agent-tool-patterns.json";
const MIN_CONFIDENCE = 0.6;
const CHAIN_ORDER_LIMIT = 3; // track up to 3-tool chains

// ─── Speculative Engine ─────────────────────────────────────────

export class SpeculativeEngine {
  private matrix: TransitionMatrix = new Map();
  private lastTool: string | null = null;
  private recentChain: string[] = [];
  private predictions: Map<string, ToolPrediction> = new Map();
  private totalTransitions = 0;

  /** Record a tool execution, updating the transition matrix */
  recordToolCall(toolName: string, durationMs: number): void {
    if (this.lastTool) {
      const from = this.lastTool;
      if (!this.matrix.has(from)) {
        this.matrix.set(from, new Map());
      }
      const transitions = this.matrix.get(from)!;
      const existing = transitions.get(toolName) ?? { frequency: 0, totalMs: 0 };
      existing.frequency++;
      existing.totalMs += durationMs;
      transitions.set(toolName, existing);
      this.totalTransitions++;
    }

    // Track chain patterns (2-3 tool sequences)
    this.recentChain.push(toolName);
    if (this.recentChain.length > CHAIN_ORDER_LIMIT) {
      this.recentChain.shift();
    }

    // Record chain-based transition (e.g. "read_file→write_file" → predict "bash")
    if (this.recentChain.length >= 2) {
      const chainKey = this.recentChain.slice(0, -1).join("→");
      if (!this.matrix.has(chainKey)) {
        this.matrix.set(chainKey, new Map());
      }
      const chainTransitions = this.matrix.get(chainKey)!;
      const existing = chainTransitions.get(toolName) ?? { frequency: 0, totalMs: 0 };
      existing.frequency++;
      existing.totalMs += durationMs;
      chainTransitions.set(toolName, existing);
    }

    this.lastTool = toolName;
  }

  /** Predict the most likely next tool call */
  predict(): ToolPrediction | null {
    if (!this.lastTool) {
      return null;
    }

    // Try chain-based prediction first (higher accuracy)
    if (this.recentChain.length >= 2) {
      const chainKey = this.recentChain.join("→");
      const chainPred = this.predictFromKey(chainKey);
      if (chainPred && chainPred.confidence >= MIN_CONFIDENCE) {
        return chainPred;
      }
    }

    // Fall back to single-tool transition
    return this.predictFromKey(this.lastTool);
  }

  private predictFromKey(key: string): ToolPrediction | null {
    const transitions = this.matrix.get(key);
    if (!transitions || transitions.size === 0) {
      return null;
    }

    // Sort by frequency
    const sorted = [...transitions.entries()].toSorted((a, b) => b[1].frequency - a[1].frequency);
    const totalFromThis = sorted.reduce((s, [, v]) => s + v.frequency, 0);

    if (totalFromThis < 2) {
      return null;
    } // Need at least 2 observations

    const [topTool, topStats] = sorted[0];
    const confidence = topStats.frequency / totalFromThis;
    const avgLatencyMs = topStats.totalMs / topStats.frequency;

    const secondary =
      sorted.length > 1
        ? {
            toolName: sorted[1][0],
            confidence: sorted[1][1].frequency / totalFromThis,
          }
        : null;

    return { toolName: topTool, confidence, avgLatencyMs, secondary };
  }

  /** Determine what pre-warm action to take based on prediction */
  getPreWarmAction(prediction: ToolPrediction): PreWarmAction {
    if (prediction.confidence < MIN_CONFIDENCE) {
      return { type: "none" };
    }

    const tool = prediction.toolName;

    // Map tool names to pre-warm actions
    if (tool === "web_search" || tool === "read_url") {
      return { type: "dns", target: "https://www.google.com" };
    }
    if (
      tool === "bash" ||
      tool === "execute_command" ||
      tool === "write_file" ||
      tool === "read_file"
    ) {
      return { type: "container_ping" };
    }
    if (tool === "create_file" || tool === "list_directory") {
      return { type: "file_stat", target: "/workspace" };
    }

    return { type: "none" };
  }

  /** Execute a speculative pre-warm action (fire-and-forget) */
  async executePreWarm(action: PreWarmAction): Promise<void> {
    if (action.type === "none") {
      return;
    }

    try {
      if (action.type === "dns" && action.target) {
        // Pre-warm DNS resolution
        fetch(action.target, { method: "HEAD", signal: AbortSignal.timeout(2000) }).catch(() => {});
      } else if (action.type === "container_ping") {
        // Verify container is still responsive
        const { sandboxExec } = await import("../agent-sandbox.js");
        sandboxExec("true", "/workspace", 2).catch(() => {});
      } else if (action.type === "file_stat" && action.target) {
        const { sandboxExec } = await import("../agent-sandbox.js");
        sandboxExec(`stat ${action.target} 2>/dev/null`, "/workspace", 2).catch(() => {});
      }
    } catch {
      // Pre-warming is best-effort
    }
  }

  /** Serialize the transition matrix for persistence */
  serialize(): string {
    const data: Record<string, Record<string, ToolTransition>> = {};
    for (const [from, transitions] of this.matrix) {
      data[from] = Object.fromEntries(transitions);
    }
    return JSON.stringify({
      version: 1,
      totalTransitions: this.totalTransitions,
      matrix: data,
    });
  }

  /** Load from persisted data */
  static deserialize(json: string): SpeculativeEngine {
    const engine = new SpeculativeEngine();
    try {
      const data = JSON.parse(json);
      if (data.version === 1 && data.matrix) {
        for (const [from, transitions] of Object.entries(data.matrix)) {
          const map = new Map<string, ToolTransition>();
          for (const [to, stats] of Object.entries(transitions as Record<string, ToolTransition>)) {
            map.set(to, stats);
          }
          engine.matrix.set(from, map);
        }
        engine.totalTransitions = data.totalTransitions ?? 0;
      }
    } catch {
      // Start fresh if deserialization fails
    }
    return engine;
  }

  /** Persist to sandbox filesystem */
  async persist(): Promise<void> {
    try {
      const { sandboxWriteFile } = await import("../agent-sandbox.js");
      await sandboxWriteFile(PERSIST_FILE, this.serialize());
    } catch {
      // Non-critical
    }
  }

  /** Load from sandbox filesystem */
  static async load(): Promise<SpeculativeEngine> {
    try {
      const { sandboxExec } = await import("../agent-sandbox.js");
      const result = await sandboxExec(`cat ${PERSIST_FILE}`, "/workspace", 5);
      if (result.exitCode === 0 && result.stdout.trim()) {
        const engine = SpeculativeEngine.deserialize(result.stdout.trim());
        logger.info(`[SpeculativeEngine] Loaded ${engine.totalTransitions} historical transitions`);
        return engine;
      }
    } catch {
      // Start fresh
    }
    return new SpeculativeEngine();
  }

  /** Get a human-readable summary of the top patterns */
  getSummary(topN = 5): string {
    const lines: string[] = [];
    for (const [from, transitions] of this.matrix) {
      if (from.includes("→")) {
        continue;
      } // Skip chain entries for summary
      const sorted = [...transitions.entries()].toSorted((a, b) => b[1].frequency - a[1].frequency);
      const total = sorted.reduce((s, [, v]) => s + v.frequency, 0);
      for (const [to, stats] of sorted.slice(0, 2)) {
        const pct = Math.round((stats.frequency / total) * 100);
        if (pct >= 40) {
          lines.push(
            `  ${from} → ${to} (${pct}%, avg ${Math.round(stats.totalMs / stats.frequency)}ms)`,
          );
        }
      }
    }
    return lines.slice(0, topN).join("\n");
  }
}
