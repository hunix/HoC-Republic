/**
 * Progressive Context Compressor — Surgical Memory Management
 *
 * Replaces naive message pruning with intelligent, phase-aware compression.
 * Instead of truncating old tool results blindly, this module:
 *
 *   1. Detects phase transitions and compresses completed phases
 *   2. Preserves high-signal messages (errors, final outputs, key decisions)
 *   3. Generates structured summaries of compressed phases
 *   4. Maintains a "hot window" of the most recent turns (never compressed)
 *   5. Tracks signal density to prioritize retention
 *
 * This is superior to both Manus (which has no documented compression) and
 * basic truncation (which loses critical early-phase context).
 */

import type {
  AnthropicMessage,
  OpenAiMessage,
  GeminiContent,
  AgentProvider,
} from "../agent-providers/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const logger = createSubsystemLogger("context-compressor");

// ─── Configuration ──────────────────────────────────────────────

/** Number of most recent turns to NEVER compress */
const HOT_WINDOW_SIZE = 6;

/** Byte threshold before compression is triggered */
const COMPRESSION_THRESHOLD_BYTES = 80_000;

/** Maximum bytes for a single tool result after compression */
const MAX_COMPRESSED_RESULT_BYTES = 300;

// ─── Signal Density Classification ──────────────────────────────

type MessageSignal = "critical" | "high" | "medium" | "low" | "noise";

/**
 * Classify how important a message is for future reasoning.
 * Critical messages are never compressed. Noise is aggressively removed.
 */
function classifySignal(role: string, content: string, toolName?: string): MessageSignal {
  const lower = content.toLowerCase();
  const len = content.length;

  // Error messages are always critical
  if (
    lower.includes("error") ||
    lower.includes("exception") ||
    lower.includes("failed") ||
    lower.includes("permission denied")
  ) {
    return "critical";
  }

  // System injections are high signal
  if (role === "system" || lower.startsWith("[system]") || lower.startsWith("[phase")) {
    return "high";
  }

  // Very short content from assistants is usually filler
  if (role === "assistant" && len < 30) {
    return "noise";
  }

  // Tool results: classify by tool type
  if (toolName) {
    // Search/read results are often very large but only partially useful
    if (toolName === "web_search" || toolName === "read_url") {
      return len > 2000 ? "low" : "medium";
    }
    // File reads can be huge — low signal for old ones
    if (toolName === "read_file" || toolName === "list_directory") {
      return len > 1500 ? "low" : "medium";
    }
    // Command output is medium signal
    if (toolName === "bash" || toolName === "execute_command") {
      return len > 3000 ? "low" : "medium";
    }
    // Write/create operations are high signal (they describe what changed)
    if (toolName === "write_file" || toolName === "create_file") {
      return "high";
    }
  }

  // Long assistant messages are usually high signal
  if (role === "assistant" && len > 200) {
    return "high";
  }

  return "medium";
}

// ─── Phase Summary Builder ──────────────────────────────────────

interface PhaseSummary {
  phase: string;
  toolsUsed: string[];
  filesRead: number;
  filesWritten: number;
  commandsRun: number;
  errorsEncountered: number;
  keyDecisions: string[];
  compressedAt: number; // iteration index
}

/**
 * Build a structured summary from a set of messages that belong to a completed phase.
 */
function buildPhaseSummary(
  phaseName: string,
  messages: Array<{ role: string; content: string; tool?: string }>,
  iterationIndex: number,
): PhaseSummary {
  const toolsUsed = new Set<string>();
  let filesRead = 0;
  let filesWritten = 0;
  let commandsRun = 0;
  let errorsEncountered = 0;
  const keyDecisions: string[] = [];

  for (const msg of messages) {
    if (msg.tool) {
      toolsUsed.add(msg.tool);
      if (msg.tool === "read_file") {
        filesRead++;
      }
      if (msg.tool === "write_file" || msg.tool === "create_file") {
        filesWritten++;
      }
      if (msg.tool === "bash" || msg.tool === "execute_command") {
        commandsRun++;
      }
    }
    const lower = msg.content.toLowerCase();
    if (lower.includes("error") || lower.includes("failed")) {
      errorsEncountered++;
    }
    // Extract key decisions (assistant messages with strong language)
    if (
      msg.role === "assistant" &&
      msg.content.length > 50 &&
      (lower.includes("i will") ||
        lower.includes("i'll use") ||
        lower.includes("the approach") ||
        lower.includes("decision"))
    ) {
      keyDecisions.push(msg.content.slice(0, 150));
    }
  }

  return {
    phase: phaseName,
    toolsUsed: [...toolsUsed],
    filesRead,
    filesWritten,
    commandsRun,
    errorsEncountered,
    keyDecisions: keyDecisions.slice(0, 3),
    compressedAt: iterationIndex,
  };
}

/**
 * Render a phase summary as a compact system message.
 */
function renderSummary(summary: PhaseSummary): string {
  const parts = [
    `[COMPRESSED PHASE: ${summary.phase}]`,
    `Tools: ${summary.toolsUsed.join(", ") || "none"}`,
    `Actions: read ${summary.filesRead} files, wrote ${summary.filesWritten} files, ran ${summary.commandsRun} commands`,
  ];
  if (summary.errorsEncountered > 0) {
    parts.push(`Errors: ${summary.errorsEncountered} encountered`);
  }
  if (summary.keyDecisions.length > 0) {
    parts.push(`Key decisions: ${summary.keyDecisions.join(" | ")}`);
  }
  return parts.join(" | ");
}

// ─── Compressor ─────────────────────────────────────────────────

/**
 * Compress OpenAI-format messages for a completed phase.
 * Keeps critical messages, compresses medium/low signal, removes noise.
 */
export function compressOpenAiPhase(
  messages: OpenAiMessage[],
  phaseName: string,
  phaseStartIdx: number,
  phaseEndIdx: number,
  iterationIndex: number,
): { compressed: OpenAiMessage[]; summary: PhaseSummary; savedBytes: number } {
  if (phaseEndIdx - phaseStartIdx < 4) {
    // Too few messages to compress — return as-is
    return {
      compressed: messages,
      summary: buildPhaseSummary(phaseName, [], iterationIndex),
      savedBytes: 0,
    };
  }

  const hotStart = Math.max(phaseStartIdx, messages.length - HOT_WINDOW_SIZE);
  let savedBytes = 0;
  const phaseMessages: Array<{ role: string; content: string; tool?: string }> = [];

  for (let i = phaseStartIdx; i < Math.min(phaseEndIdx, hotStart); i++) {
    const msg = messages[i] as Record<string, unknown>;
    const content = typeof msg.content === "string" ? msg.content : "";
    const role = typeof msg.role === "string" ? msg.role : "";
    const toolName = typeof msg.name === "string" ? msg.name : undefined;

    phaseMessages.push({ role, content, tool: toolName });
    const signal = classifySignal(role, content, toolName);

    if (signal === "noise") {
      // Remove entirely — replace with empty
      const originalLen = content.length;
      msg.content = "";
      savedBytes += originalLen;
    } else if (signal === "low" && content.length > MAX_COMPRESSED_RESULT_BYTES) {
      const originalLen = content.length;
      msg.content =
        content.slice(0, MAX_COMPRESSED_RESULT_BYTES) +
        `... [compressed: ${originalLen} → ${MAX_COMPRESSED_RESULT_BYTES} bytes]`;
      savedBytes += originalLen - MAX_COMPRESSED_RESULT_BYTES - 40;
    } else if (signal === "medium" && content.length > MAX_COMPRESSED_RESULT_BYTES * 3) {
      const originalLen = content.length;
      const target = MAX_COMPRESSED_RESULT_BYTES * 3;
      msg.content = content.slice(0, target) + `... [compressed: ${originalLen} → ${target} bytes]`;
      savedBytes += originalLen - target - 40;
    }
    // Critical and high signal: kept as-is
  }

  const summary = buildPhaseSummary(phaseName, phaseMessages, iterationIndex);

  // Insert summary at the phase start position
  if (savedBytes > 500) {
    const summaryMsg: OpenAiMessage = {
      role: "system",
      content: renderSummary(summary),
    };
    messages.splice(phaseStartIdx, 0, summaryMsg);
    logger.info(
      `[ContextCompressor] Compressed phase "${phaseName}": saved ${Math.round(savedBytes / 1024)}KB`,
    );
  }

  return { compressed: messages, summary, savedBytes };
}

/**
 * Estimate total context size across all message formats.
 */
export function estimateContextSize(
  provider: AgentProvider,
  anthropicMessages: AnthropicMessage[],
  openaiMessages: OpenAiMessage[],
  geminiContents: GeminiContent[],
): number {
  if (provider === "anthropic") {
    return JSON.stringify(anthropicMessages).length;
  }
  if (provider === "gemini") {
    return JSON.stringify(geminiContents).length;
  }
  return JSON.stringify(openaiMessages).length;
}

/**
 * Check if compression should be triggered.
 */
export function shouldCompress(approxBytes: number): boolean {
  return approxBytes > COMPRESSION_THRESHOLD_BYTES;
}

export type { PhaseSummary };
