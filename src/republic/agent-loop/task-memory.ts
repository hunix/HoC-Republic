/**
 * Task Memory — Cross-Session Knowledge Transfer
 *
 * Learns from every agent session to make future sessions faster and smarter.
 * Records four types of knowledge:
 *
 *   1. Tool Chains — common sequential tool patterns ("for file editing, always
 *      read first, then modify, then verify")
 *   2. Strategy Outcomes — which strategy+provider combos work best for what
 *      types of tasks (e.g. "RESEARCH with Gemini averages 6 iterations")
 *   3. Error Patterns — recurring errors and their solutions ("EACCES on /workspace
 *      → use sandbox exec, not direct FS")
 *   4. Task Templates — abstract patterns from successful tasks that can be
 *      applied to similar future tasks
 *
 * All data persisted to sandbox filesystem. At session start, relevant lessons
 * are injected into the system prompt so the LLM starts with accumulated wisdom.
 *
 * This is the "experience" layer. No competing system learns from its own
 * execution history to improve future performance.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";

const logger = createSubsystemLogger("task-memory");

// ─── Types ──────────────────────────────────────────────────────

export interface ToolChain {
  /** Ordered sequence of tools */
  tools: string[];
  /** How many times this chain was observed */
  frequency: number;
  /** Average session success rate when this chain appeared */
  successRate: number;
  /** Context label (e.g. "web research", "file editing") */
  context: string;
}

export interface StrategyRecord {
  strategy: string;
  provider: string;
  modelId: string;
  /** Average iterations to completion */
  avgIterations: number;
  /** Average tokens used */
  avgTokens: number;
  /** Success rate (0.0-1.0) */
  successRate: number;
  /** Number of sessions recorded */
  count: number;
  /** Task type keywords that triggered this strategy */
  taskKeywords: string[];
}

export interface ErrorPattern {
  /** Error message fragment (normalized) */
  pattern: string;
  /** How many times this error was seen */
  frequency: number;
  /** What tool was running when it happened */
  toolName: string;
  /** What the agent did to recover (if it did) */
  resolution: string;
  /** Whether the recovery was successful */
  resolved: boolean;
}

export interface TaskMemoryStore {
  version: number;
  toolChains: ToolChain[];
  strategyRecords: StrategyRecord[];
  errorPatterns: ErrorPattern[];
  lastUpdated: string;
  totalSessions: number;
}

// ─── Defaults ───────────────────────────────────────────────────

const PERSIST_FILE = "/workspace/.agent-memory.json";
const MAX_CHAINS = 30;
const MAX_STRATEGY_RECORDS = 50;
const MAX_ERROR_PATTERNS = 40;

function emptyStore(): TaskMemoryStore {
  return {
    version: 1,
    toolChains: [],
    strategyRecords: [],
    errorPatterns: [],
    lastUpdated: new Date().toISOString(),
    totalSessions: 0,
  };
}

// ─── Task Memory Manager ────────────────────────────────────────

export class TaskMemory {
  private store: TaskMemoryStore;

  constructor(store?: TaskMemoryStore) {
    this.store = store ?? emptyStore();
  }

  // ── Tool Chain Learning ────────────────────────────────────

  /** Record a sequence of tool calls from a completed session */
  recordToolSequence(tools: string[], success: boolean): void {
    if (tools.length < 2) {
      return;
    }

    // Extract all 2-3 length sub-chains
    for (let len = 2; len <= Math.min(3, tools.length); len++) {
      for (let i = 0; i <= tools.length - len; i++) {
        const chain = tools.slice(i, i + len);
        const key = chain.join("→");
        const existing = this.store.toolChains.find((c) => c.tools.join("→") === key);

        if (existing) {
          existing.frequency++;
          // Rolling average of success rate
          existing.successRate =
            (existing.successRate * (existing.frequency - 1) + (success ? 1 : 0)) /
            existing.frequency;
        } else {
          this.store.toolChains.push({
            tools: chain,
            frequency: 1,
            successRate: success ? 1 : 0,
            context: inferContext(chain),
          });
        }
      }
    }

    // Keep only the most frequent chains
    this.store.toolChains.sort((a, b) => b.frequency - a.frequency);
    if (this.store.toolChains.length > MAX_CHAINS) {
      this.store.toolChains = this.store.toolChains.slice(0, MAX_CHAINS);
    }
  }

  // ── Strategy Outcome Recording ─────────────────────────────

  /** Record the outcome of a strategy execution */
  recordStrategyOutcome(
    strategy: string,
    provider: string,
    modelId: string,
    iterations: number,
    tokens: number,
    success: boolean,
    taskKeywords: string[],
  ): void {
    const key = `${strategy}:${provider}:${modelId}`;
    const existing = this.store.strategyRecords.find(
      (r) => `${r.strategy}:${r.provider}:${r.modelId}` === key,
    );

    if (existing) {
      const n = existing.count;
      existing.avgIterations = (existing.avgIterations * n + iterations) / (n + 1);
      existing.avgTokens = (existing.avgTokens * n + tokens) / (n + 1);
      existing.successRate = (existing.successRate * n + (success ? 1 : 0)) / (n + 1);
      existing.count++;
      // Merge keywords
      for (const kw of taskKeywords) {
        if (!existing.taskKeywords.includes(kw)) {
          existing.taskKeywords.push(kw);
        }
      }
      // Cap keywords
      if (existing.taskKeywords.length > 10) {
        existing.taskKeywords = existing.taskKeywords.slice(-10);
      }
    } else {
      this.store.strategyRecords.push({
        strategy,
        provider,
        modelId,
        avgIterations: iterations,
        avgTokens: tokens,
        successRate: success ? 1 : 0,
        count: 1,
        taskKeywords,
      });
    }

    if (this.store.strategyRecords.length > MAX_STRATEGY_RECORDS) {
      this.store.strategyRecords.sort((a, b) => b.count - a.count);
      this.store.strategyRecords = this.store.strategyRecords.slice(0, MAX_STRATEGY_RECORDS);
    }
  }

  // ── Error Pattern Learning ─────────────────────────────────

  /** Record an error pattern and its resolution */
  recordError(errorMessage: string, toolName: string, resolution: string, resolved: boolean): void {
    const pattern = normalizeError(errorMessage);
    const existing = this.store.errorPatterns.find((e) => e.pattern === pattern);

    if (existing) {
      existing.frequency++;
      if (resolved && !existing.resolved) {
        // Update with working resolution
        existing.resolution = resolution;
        existing.resolved = true;
      }
    } else {
      this.store.errorPatterns.push({
        pattern,
        frequency: 1,
        toolName,
        resolution,
        resolved,
      });
    }

    if (this.store.errorPatterns.length > MAX_ERROR_PATTERNS) {
      this.store.errorPatterns.sort((a, b) => b.frequency - a.frequency);
      this.store.errorPatterns = this.store.errorPatterns.slice(0, MAX_ERROR_PATTERNS);
    }
  }

  // ── Knowledge Injection ────────────────────────────────────

  /**
   * Generate a system prompt injection with relevant lessons from past sessions.
   * Called at the start of each new session.
   */
  buildKnowledgeInjection(currentStrategy: string, taskDescription: string): string {
    const lines: string[] = [];
    const _lowerTask = taskDescription.toLowerCase();

    // 1. Relevant strategy outcomes
    const relevantStrategies = this.store.strategyRecords
      .filter((r) => r.strategy === currentStrategy && r.count >= 2)
      .toSorted((a, b) => b.successRate - a.successRate);

    if (relevantStrategies.length > 0) {
      lines.push("## Historical Strategy Performance");
      for (const r of relevantStrategies.slice(0, 3)) {
        lines.push(
          `- ${r.strategy}/${r.provider}: ${Math.round(r.successRate * 100)}% success, ` +
            `avg ${Math.round(r.avgIterations)} iters, ${Math.round(r.avgTokens).toLocaleString()} tokens (${r.count} sessions)`,
        );
      }
      lines.push("");
    }

    // 2. Common tool patterns
    const topChains = this.store.toolChains
      .filter((c) => c.frequency >= 3 && c.successRate > 0.6)
      .slice(0, 5);

    if (topChains.length > 0) {
      lines.push("## Proven Tool Patterns");
      for (const c of topChains) {
        lines.push(
          `- ${c.context}: ${c.tools.join(" → ")} (${c.frequency}x, ${Math.round(c.successRate * 100)}% success)`,
        );
      }
      lines.push("");
    }

    // 3. Error patterns with resolutions
    const relevantErrors = this.store.errorPatterns
      .filter((e) => e.resolved && e.frequency >= 2)
      .slice(0, 5);

    if (relevantErrors.length > 0) {
      lines.push("## Known Error Solutions");
      for (const e of relevantErrors) {
        lines.push(`- "${e.pattern}" in ${e.toolName} → ${e.resolution}`);
      }
      lines.push("");
    }

    if (lines.length === 0) {
      return "";
    }

    return [
      "[TASK MEMORY — Lessons from previous sessions]",
      ...lines,
      `Total sessions analyzed: ${this.store.totalSessions}`,
    ].join("\n");
  }

  // ── Session Bookkeeping ────────────────────────────────────

  recordSessionComplete(): void {
    this.store.totalSessions++;
    this.store.lastUpdated = new Date().toISOString();
  }

  get totalSessions(): number {
    return this.store.totalSessions;
  }

  // ── Persistence ────────────────────────────────────────────

  serialize(): string {
    return JSON.stringify(this.store, null, 2);
  }

  static fromJson(json: string): TaskMemory {
    try {
      const parsed = JSON.parse(json);
      if (parsed.version === 1) {
        return new TaskMemory(parsed);
      }
    } catch {
      // Start fresh
    }
    return new TaskMemory();
  }

  async persist(): Promise<void> {
    try {
      const { sandboxWriteFile } = await import("../agent-sandbox.js");
      await sandboxWriteFile(PERSIST_FILE, this.serialize());
    } catch {
      // Non-critical
    }
  }

  static async load(): Promise<TaskMemory> {
    try {
      const { sandboxExec } = await import("../agent-sandbox.js");
      const result = await sandboxExec(`cat ${PERSIST_FILE}`, "/workspace", 5);
      if (result.exitCode === 0 && result.stdout.trim()) {
        const memory = TaskMemory.fromJson(result.stdout.trim());
        logger.info(`[TaskMemory] Loaded ${memory.totalSessions} sessions of historical knowledge`);
        return memory;
      }
    } catch {
      // Start fresh
    }
    return new TaskMemory();
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/** Normalize an error message to a canonical pattern (strip paths, UIDs, etc.) */
function normalizeError(msg: string): string {
  return msg
    .replace(/\/[^\s]+/g, "<path>") // paths
    .replace(/[0-9a-f]{8,}/gi, "<id>") // hex IDs
    .replace(/\d{4,}/g, "<num>") // large numbers
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/** Infer a context label from a tool chain */
function inferContext(tools: string[]): string {
  const set = new Set(tools);
  if (set.has("web_search") || set.has("read_url")) {
    return "web research";
  }
  if (set.has("read_file") && (set.has("write_file") || set.has("create_file"))) {
    return "file editing";
  }
  if (set.has("bash") || set.has("execute_command")) {
    return "command execution";
  }
  if (set.has("create_file") && tools.length >= 2) {
    return "project setup";
  }
  if (set.has("deploy_and_preview")) {
    return "deployment";
  }
  return "general";
}
