import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ActionEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  type: "tool_call" | "tool_result" | "llm_response" | "user_message" | "error" | "system";
  toolName?: string;
  toolInput?: Record<string, unknown>;
  content: string;
  durationMs?: number;
  tokenUsage?: { input: number; output: number };
  iteration?: number;
}

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  userMessage: string;
  totalActions: number;
  totalTokens: number;
  totalIterations: number;
  toolsUsed: string[];
  success: boolean;
}

// ─── Storage ────────────────────────────────────────────────────

const REPLAY_DIR = join(homedir(), ".openclaw", "agent-replays");

function ensureReplayDir(): void {
  if (!existsSync(REPLAY_DIR)) {
    mkdirSync(REPLAY_DIR, { recursive: true });
  }
}

function sessionLogPath(sessionId: string): string {
  return join(REPLAY_DIR, `${sessionId}.jsonl`);
}

// ─── Buffered Async Writer ──────────────────────────────────────

/** Pending writes per session, flushed on a 500ms debounce timer */
const writeBuffers = new Map<string, string[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleFlush(sessionId: string): void {
  const existing = flushTimers.get(sessionId);
  if (existing) {
    return;
  } // already scheduled
  const timer = setTimeout(() => {
    flushTimers.delete(sessionId);
    void flushReplayBuffer(sessionId);
  }, 500);
  if (timer.unref) {
    timer.unref();
  } // don't keep the process alive
  flushTimers.set(sessionId, timer);
}

/** Flush buffered entries to disk asynchronously */
async function flushReplayBuffer(sessionId: string): Promise<void> {
  const buf = writeBuffers.get(sessionId);
  if (!buf || buf.length === 0) {
    return;
  }
  const data = buf.join("");
  buf.length = 0; // clear without reallocating
  try {
    await appendFile(sessionLogPath(sessionId), data);
  } catch {
    // Silently fail — don't break the agent loop
  }
}

// ─── Logger ─────────────────────────────────────────────────────

/** Active session tracker */
const activeSessions = new Map<
  string,
  {
    startedAt: string;
    userMessage: string;
    actions: number;
    tokens: number;
    iterations: number;
    toolsUsed: Set<string>;
  }
>();

/** Start a new replay session */
export function startReplaySession(userMessage: string): string {
  ensureReplayDir();
  const sessionId = `session-${Date.now()}-${uid()}`;

  activeSessions.set(sessionId, {
    startedAt: new Date().toISOString(),
    userMessage,
    actions: 0,
    tokens: 0,
    iterations: 0,
    toolsUsed: new Set(),
  });

  logAction(sessionId, {
    type: "user_message",
    content: userMessage,
  });

  return sessionId;
}

/** Log an action to the session (buffered, non-blocking) */
export function logAction(
  sessionId: string,
  action: Omit<ActionEntry, "id" | "sessionId" | "timestamp">,
): void {
  const entry: ActionEntry = {
    id: `act-${uid()}`,
    sessionId,
    timestamp: new Date().toISOString(),
    ...action,
  };

  const session = activeSessions.get(sessionId);
  if (session) {
    session.actions++;
    if (action.toolName) {
      session.toolsUsed.add(action.toolName);
    }
    if (action.tokenUsage) {
      session.tokens += action.tokenUsage.input + action.tokenUsage.output;
    }
    if (action.iteration) {
      session.iterations = Math.max(session.iterations, action.iteration);
    }
  }

  // Buffer the write instead of blocking with appendFileSync
  let buf = writeBuffers.get(sessionId);
  if (!buf) {
    buf = [];
    writeBuffers.set(sessionId, buf);
  }
  buf.push(JSON.stringify(entry) + "\n");
  scheduleFlush(sessionId);
}

/** End a replay session — flushes all pending writes */
export function endReplaySession(sessionId: string, success: boolean): void {
  logAction(sessionId, {
    type: "system",
    content: `Session ${success ? "completed" : "failed"}`,
  });

  // Force immediate flush of remaining buffer
  const timer = flushTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(sessionId);
  }
  void flushReplayBuffer(sessionId).then(() => {
    writeBuffers.delete(sessionId);
  });

  activeSessions.delete(sessionId);
}

// ─── Retrieval ──────────────────────────────────────────────────

/** List all replay sessions */
export function listReplaySessions(limit = 50): SessionSummary[] {
  ensureReplayDir();
  try {
    const files = readdirSync(REPLAY_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .toSorted((a, b) => b.localeCompare(a))
      .slice(0, limit);

    return files
      .map((f) => {
        const sessionId = f.replace(".jsonl", "");
        return getSessionSummary(sessionId);
      })
      .filter((s): s is SessionSummary => s !== null);
  } catch {
    return [];
  }
}

/** Get a session summary */
export function getSessionSummary(sessionId: string): SessionSummary | null {
  const logPath = sessionLogPath(sessionId);
  if (!existsSync(logPath)) {
    return null;
  }

  try {
    const lines = readFileSync(logPath, "utf-8")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      return null;
    }

    const entries = lines.map((l) => JSON.parse(l) as ActionEntry);
    const userMsg = entries.find((e) => e.type === "user_message");
    const toolCalls = entries.filter((e) => e.type === "tool_call");
    const toolNames = [...new Set(toolCalls.map((e) => e.toolName).filter(Boolean))] as string[];
    const maxIteration = Math.max(0, ...entries.map((e) => e.iteration ?? 0));
    const totalTokens = entries.reduce(
      (sum, e) => sum + (e.tokenUsage ? e.tokenUsage.input + e.tokenUsage.output : 0),
      0,
    );
    const lastEntry = entries[entries.length - 1];
    const success = lastEntry?.content?.includes("completed") ?? false;

    return {
      sessionId,
      startedAt: entries[0]?.timestamp ?? "",
      endedAt: lastEntry?.timestamp,
      userMessage: userMsg?.content ?? "",
      totalActions: entries.length,
      totalTokens,
      totalIterations: maxIteration,
      toolsUsed: toolNames,
      success,
    };
  } catch {
    return null;
  }
}

/** Get all actions for a session */
export function getSessionActions(sessionId: string): ActionEntry[] {
  const logPath = sessionLogPath(sessionId);
  if (!existsSync(logPath)) {
    return [];
  }

  try {
    return readFileSync(logPath, "utf-8")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as ActionEntry);
  } catch {
    return [];
  }
}
