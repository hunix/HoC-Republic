/**
 * OpenClaw — Tool Loop Detection for Republic Agents
 *
 * Adapted from upstream OpenClaw `agents/tool-loop-detection.ts`.
 *
 * Detects when a citizen or agent gets stuck in repetitive tool call loops:
 *  - Generic repeat: same tool+params called N times
 *  - No-progress polling: poll tool returns identical results repeatedly
 *  - Ping-pong: alternating between two tool calls with no progress
 *  - Global circuit breaker: hard cap on any single tool+params combo
 *
 * Usage:
 *   const session = createToolLoopSession();
 *   recordToolCall(session, "browse_web", { url: "..." });
 *   const result = detectToolCallLoop(session, "browse_web", { url: "..." });
 *   if (result.stuck) { ... }
 */

import { createHash } from "node:crypto";

// ─── Types ──────────────────────────────────────────────────────

export type LoopDetectorKind =
  | "generic_repeat"
  | "known_poll_no_progress"
  | "global_circuit_breaker"
  | "ping_pong";

export type LoopDetectionResult =
  | { stuck: false }
  | {
      stuck: true;
      level: "warning" | "critical";
      detector: LoopDetectorKind;
      count: number;
      message: string;
      pairedToolName?: string;
      warningKey?: string;
    };

export interface ToolLoopDetectionConfig {
  enabled?: boolean;
  historySize?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  globalCircuitBreakerThreshold?: number;
  detectors?: {
    genericRepeat?: boolean;
    knownPollNoProgress?: boolean;
    pingPong?: boolean;
  };
}

interface ToolCallRecord {
  toolName: string;
  argsHash: string;
  toolCallId?: string;
  resultHash?: string;
  timestamp: number;
}

export interface ToolLoopSession {
  toolCallHistory: ToolCallRecord[];
}

// ─── Config ─────────────────────────────────────────────────────

export const TOOL_CALL_HISTORY_SIZE = 30;
export const WARNING_THRESHOLD = 10;
export const CRITICAL_THRESHOLD = 20;
export const GLOBAL_CIRCUIT_BREAKER_THRESHOLD = 30;

const DEFAULT_CONFIG: Required<ToolLoopDetectionConfig> & {
  detectors: Required<NonNullable<ToolLoopDetectionConfig["detectors"]>>;
} = {
  enabled: true,
  historySize: TOOL_CALL_HISTORY_SIZE,
  warningThreshold: WARNING_THRESHOLD,
  criticalThreshold: CRITICAL_THRESHOLD,
  globalCircuitBreakerThreshold: GLOBAL_CIRCUIT_BREAKER_THRESHOLD,
  detectors: {
    genericRepeat: true,
    knownPollNoProgress: true,
    pingPong: true,
  },
};

interface ResolvedConfig {
  enabled: boolean;
  historySize: number;
  warningThreshold: number;
  criticalThreshold: number;
  globalCircuitBreakerThreshold: number;
  detectors: {
    genericRepeat: boolean;
    knownPollNoProgress: boolean;
    pingPong: boolean;
  };
}

function asPositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function resolveConfig(config?: ToolLoopDetectionConfig): ResolvedConfig {
  let warningThreshold = asPositiveInt(config?.warningThreshold, DEFAULT_CONFIG.warningThreshold);
  let criticalThreshold = asPositiveInt(
    config?.criticalThreshold,
    DEFAULT_CONFIG.criticalThreshold,
  );
  let globalCircuitBreakerThreshold = asPositiveInt(
    config?.globalCircuitBreakerThreshold,
    DEFAULT_CONFIG.globalCircuitBreakerThreshold,
  );
  if (criticalThreshold <= warningThreshold) {
    criticalThreshold = warningThreshold + 1;
  }
  if (globalCircuitBreakerThreshold <= criticalThreshold) {
    globalCircuitBreakerThreshold = criticalThreshold + 1;
  }

  return {
    enabled: config?.enabled ?? DEFAULT_CONFIG.enabled,
    historySize: asPositiveInt(config?.historySize, DEFAULT_CONFIG.historySize),
    warningThreshold,
    criticalThreshold,
    globalCircuitBreakerThreshold,
    detectors: {
      genericRepeat: config?.detectors?.genericRepeat ?? DEFAULT_CONFIG.detectors.genericRepeat,
      knownPollNoProgress:
        config?.detectors?.knownPollNoProgress ?? DEFAULT_CONFIG.detectors.knownPollNoProgress,
      pingPong: config?.detectors?.pingPong ?? DEFAULT_CONFIG.detectors.pingPong,
    },
  };
}

// ─── Hashing ────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).toSorted();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function digestStable(value: unknown): string {
  let serialized: string;
  try {
    serialized = stableStringify(value);
  } catch {
    serialized = String(value);
  }
  return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

/** Hash a tool call for pattern matching (tool name + deterministic param digest). */
export function hashToolCall(toolName: string, params: unknown): string {
  return `${toolName}:${digestStable(params)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashToolOutcome(
  toolName: string,
  params: unknown,
  result: unknown,
  error: unknown,
): string | undefined {
  if (error !== undefined) {
    const msg = error instanceof Error ? error.message : String(error);
    return `error:${digestStable(msg)}`;
  }
  if (!isPlainObject(result)) {
    return result === undefined ? undefined : digestStable(result);
  }
  // Extract text content for comparison
  const output = typeof result["output"] === "string" ? result["output"] : "";
  const status = typeof result["status"] === "string" ? result["status"] : "";
  return digestStable({ status, output: output.slice(0, 500), toolName });
}

// ─── Known Poll Tools ───────────────────────────────────────────

const KNOWN_POLL_TOOLS = new Set([
  "command_status",
  "docker_ps",
  "docker_get_logs",
  "comfyui_status",
  "sandbox_exec",
]);

function isKnownPollToolCall(toolName: string): boolean {
  return KNOWN_POLL_TOOLS.has(toolName);
}

// ─── Streak Detection ───────────────────────────────────────────

function getNoProgressStreak(
  history: ToolCallRecord[],
  toolName: string,
  argsHash: string,
): { count: number; latestResultHash?: string } {
  let streak = 0;
  let latestResultHash: string | undefined;

  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];
    if (!record || record.toolName !== toolName || record.argsHash !== argsHash) {
      continue;
    }
    if (typeof record.resultHash !== "string" || !record.resultHash) {
      continue;
    }
    if (!latestResultHash) {
      latestResultHash = record.resultHash;
      streak = 1;
      continue;
    }
    if (record.resultHash !== latestResultHash) {
      break;
    }
    streak++;
  }

  return { count: streak, latestResultHash };
}

function getPingPongStreak(
  history: ToolCallRecord[],
  currentSignature: string,
): { count: number; pairedToolName?: string; noProgressEvidence: boolean } {
  const last = history.at(-1);
  if (!last) {
    return { count: 0, noProgressEvidence: false };
  }

  // Find the "other" signature
  let otherSignature: string | undefined;
  let otherToolName: string | undefined;
  for (let i = history.length - 2; i >= 0; i--) {
    const call = history[i];
    if (!call) {
      continue;
    }
    if (call.argsHash !== last.argsHash) {
      otherSignature = call.argsHash;
      otherToolName = call.toolName;
      break;
    }
  }
  if (!otherSignature || !otherToolName) {
    return { count: 0, noProgressEvidence: false };
  }

  // Count alternating tail
  let alternatingTailCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const call = history[i];
    if (!call) {
      continue;
    }
    const expected = alternatingTailCount % 2 === 0 ? last.argsHash : otherSignature;
    if (call.argsHash !== expected) {
      break;
    }
    alternatingTailCount++;
  }

  if (alternatingTailCount < 2 || currentSignature !== otherSignature) {
    return { count: 0, noProgressEvidence: false };
  }

  // Check if outcomes are identical (no progress)
  const tailStart = Math.max(0, history.length - alternatingTailCount);
  let firstHashA: string | undefined;
  let firstHashB: string | undefined;
  let noProgressEvidence = true;
  for (let i = tailStart; i < history.length; i++) {
    const call = history[i];
    if (!call || !call.resultHash) {
      noProgressEvidence = false;
      break;
    }
    if (call.argsHash === last.argsHash) {
      if (!firstHashA) {
        firstHashA = call.resultHash;
      } else if (firstHashA !== call.resultHash) {
        noProgressEvidence = false;
        break;
      }
    } else if (call.argsHash === otherSignature) {
      if (!firstHashB) {
        firstHashB = call.resultHash;
      } else if (firstHashB !== call.resultHash) {
        noProgressEvidence = false;
        break;
      }
    } else {
      noProgressEvidence = false;
      break;
    }
  }
  if (!firstHashA || !firstHashB) {
    noProgressEvidence = false;
  }

  return {
    count: alternatingTailCount + 1,
    pairedToolName: last.toolName,
    noProgressEvidence,
  };
}

// ─── Public API ─────────────────────────────────────────────────

/** Create a new session state for tool loop tracking. */
export function createToolLoopSession(): ToolLoopSession {
  return { toolCallHistory: [] };
}

/**
 * Detect if an agent/citizen is stuck in a repetitive tool call loop.
 * Checks multiple detectors in priority order:
 *  1. Global circuit breaker (hard limit)
 *  2. Known poll no-progress (command_status, docker_ps, etc.)
 *  3. Ping-pong (alternating two tools with no progress)
 *  4. Generic repeat (same tool+params called many times)
 */
export function detectToolCallLoop(
  session: ToolLoopSession,
  toolName: string,
  params: unknown,
  config?: ToolLoopDetectionConfig,
): LoopDetectionResult {
  const cfg = resolveConfig(config);
  if (!cfg.enabled) {
    return { stuck: false };
  }

  const history = session.toolCallHistory;
  const currentHash = hashToolCall(toolName, params);
  const noProgress = getNoProgressStreak(history, toolName, currentHash);
  const noProgressStreak = noProgress.count;
  const knownPoll = isKnownPollToolCall(toolName);
  const pingPong = getPingPongStreak(history, currentHash);

  // 1. Global circuit breaker
  if (noProgressStreak >= cfg.globalCircuitBreakerThreshold) {
    return {
      stuck: true,
      level: "critical",
      detector: "global_circuit_breaker",
      count: noProgressStreak,
      message: `CRITICAL: ${toolName} repeated ${noProgressStreak} identical no-progress outcomes. Execution blocked by global circuit breaker.`,
      warningKey: `global:${toolName}:${currentHash}`,
    };
  }

  // 2. Known poll no-progress (critical)
  if (knownPoll && cfg.detectors.knownPollNoProgress && noProgressStreak >= cfg.criticalThreshold) {
    return {
      stuck: true,
      level: "critical",
      detector: "known_poll_no_progress",
      count: noProgressStreak,
      message: `CRITICAL: ${toolName} polled ${noProgressStreak} times with identical results. Stuck polling loop blocked.`,
      warningKey: `poll:${toolName}:${currentHash}`,
    };
  }

  // 2b. Known poll no-progress (warning)
  if (knownPoll && cfg.detectors.knownPollNoProgress && noProgressStreak >= cfg.warningThreshold) {
    return {
      stuck: true,
      level: "warning",
      detector: "known_poll_no_progress",
      count: noProgressStreak,
      message: `WARNING: ${toolName} polled ${noProgressStreak} times with identical results. Consider increasing wait time or reporting task as failed.`,
      warningKey: `poll:${toolName}:${currentHash}`,
    };
  }

  // 3. Ping-pong (critical)
  if (
    cfg.detectors.pingPong &&
    pingPong.count >= cfg.criticalThreshold &&
    pingPong.noProgressEvidence
  ) {
    return {
      stuck: true,
      level: "critical",
      detector: "ping_pong",
      count: pingPong.count,
      message: `CRITICAL: Alternating tool-call pattern detected (${pingPong.count} calls) with no progress. Ping-pong loop blocked.`,
      pairedToolName: pingPong.pairedToolName,
      warningKey: `pingpong:${toolName}:${currentHash}`,
    };
  }

  // 3b. Ping-pong (warning)
  if (cfg.detectors.pingPong && pingPong.count >= cfg.warningThreshold) {
    return {
      stuck: true,
      level: "warning",
      detector: "ping_pong",
      count: pingPong.count,
      message: `WARNING: Alternating tool-call pattern detected (${pingPong.count} calls). Possible ping-pong loop.`,
      pairedToolName: pingPong.pairedToolName,
      warningKey: `pingpong:${toolName}:${currentHash}`,
    };
  }

  // 4. Generic repeat
  const recentCount = history.filter(
    (h) => h.toolName === toolName && h.argsHash === currentHash,
  ).length;
  if (!knownPoll && cfg.detectors.genericRepeat && recentCount >= cfg.warningThreshold) {
    return {
      stuck: true,
      level: "warning",
      detector: "generic_repeat",
      count: recentCount,
      message: `WARNING: ${toolName} called ${recentCount} times with identical arguments. If not making progress, stop retrying.`,
      warningKey: `generic:${toolName}:${currentHash}`,
    };
  }

  return { stuck: false };
}

/**
 * Record a tool call into the session's sliding-window history.
 */
export function recordToolCall(
  session: ToolLoopSession,
  toolName: string,
  params: unknown,
  toolCallId?: string,
  config?: ToolLoopDetectionConfig,
): void {
  const cfg = resolveConfig(config);
  session.toolCallHistory.push({
    toolName,
    argsHash: hashToolCall(toolName, params),
    toolCallId,
    timestamp: Date.now(),
  });
  if (session.toolCallHistory.length > cfg.historySize) {
    session.toolCallHistory.shift();
  }
}

/**
 * Record the outcome of a completed tool call for no-progress detection.
 */
export function recordToolCallOutcome(
  session: ToolLoopSession,
  params: {
    toolName: string;
    toolParams: unknown;
    toolCallId?: string;
    result?: unknown;
    error?: unknown;
    config?: ToolLoopDetectionConfig;
  },
): void {
  const cfg = resolveConfig(params.config);
  const resultHash = hashToolOutcome(
    params.toolName,
    params.toolParams,
    params.result,
    params.error,
  );
  if (!resultHash) {
    return;
  }

  const argsHash = hashToolCall(params.toolName, params.toolParams);

  // Find the matching pending record and attach the result hash
  let matched = false;
  for (let i = session.toolCallHistory.length - 1; i >= 0; i--) {
    const call = session.toolCallHistory[i];
    if (!call) {
      continue;
    }
    if (params.toolCallId && call.toolCallId !== params.toolCallId) {
      continue;
    }
    if (call.toolName !== params.toolName || call.argsHash !== argsHash) {
      continue;
    }
    if (call.resultHash !== undefined) {
      continue;
    }
    call.resultHash = resultHash;
    matched = true;
    break;
  }

  if (!matched) {
    session.toolCallHistory.push({
      toolName: params.toolName,
      argsHash,
      toolCallId: params.toolCallId,
      resultHash,
      timestamp: Date.now(),
    });
  }

  if (session.toolCallHistory.length > cfg.historySize) {
    session.toolCallHistory.splice(0, session.toolCallHistory.length - cfg.historySize);
  }
}

/**
 * Get tool call statistics for diagnostics/monitoring.
 */
export function getToolCallStats(session: ToolLoopSession): {
  totalCalls: number;
  uniquePatterns: number;
  mostFrequent: { toolName: string; count: number } | null;
} {
  const history = session.toolCallHistory;
  const patterns = new Map<string, { toolName: string; count: number }>();

  for (const call of history) {
    const existing = patterns.get(call.argsHash);
    if (existing) {
      existing.count++;
    } else {
      patterns.set(call.argsHash, { toolName: call.toolName, count: 1 });
    }
  }

  let mostFrequent: { toolName: string; count: number } | null = null;
  for (const pattern of patterns.values()) {
    if (!mostFrequent || pattern.count > mostFrequent.count) {
      mostFrequent = pattern;
    }
  }

  return {
    totalCalls: history.length,
    uniquePatterns: patterns.size,
    mostFrequent,
  };
}
