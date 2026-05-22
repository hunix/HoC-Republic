import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../../config/config.js";

const THREAD_SUFFIX_REGEX = /^(.*)(?::(?:thread|topic):\d+)$/i;

function stripThreadSuffix(value: string): string {
  const match = value.match(THREAD_SUFFIX_REGEX);
  return match?.[1] ?? value;
}

/**
 * Limits conversation history to the last N user turns (and their associated
 * assistant responses). This reduces token usage for long-running DM sessions.
 */
export function limitHistoryTurns(
  messages: AgentMessage[],
  limit: number | undefined,
): AgentMessage[] {
  if (!limit || limit <= 0 || messages.length === 0) {
    return messages;
  }

  let userCount = 0;
  let lastUserIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userCount++;
      if (userCount > limit) {
        return messages.slice(lastUserIndex);
      }
      lastUserIndex = i;
    }
  }
  return messages;
}

/**
 * Extract provider + user ID from a session key and look up dmHistoryLimit.
 * Supports per-DM overrides and provider defaults.
 */
export function getDmHistoryLimitFromSessionKey(
  sessionKey: string | undefined,
  config: OpenClawConfig | undefined,
): number | undefined {
  if (!sessionKey || !config) {
    return undefined;
  }

  const parts = sessionKey.split(":").filter(Boolean);
  const providerParts = parts.length >= 3 && parts[0] === "agent" ? parts.slice(2) : parts;

  const provider = providerParts[0]?.toLowerCase();
  if (!provider) {
    return undefined;
  }

  const kind = providerParts[1]?.toLowerCase();
  const userIdRaw = providerParts.slice(2).join(":");
  const userId = stripThreadSuffix(userIdRaw);
  if (kind !== "dm") {
    return undefined;
  }

  const getLimit = (
    providerConfig:
      | {
          dmHistoryLimit?: number;
          dms?: Record<string, { historyLimit?: number }>;
        }
      | undefined,
  ): number | undefined => {
    if (!providerConfig) {
      return undefined;
    }
    if (userId && providerConfig.dms?.[userId]?.historyLimit !== undefined) {
      return providerConfig.dms[userId].historyLimit;
    }
    return providerConfig.dmHistoryLimit;
  };

  const resolveProviderConfig = (
    cfg: OpenClawConfig | undefined,
    providerId: string,
  ): { dmHistoryLimit?: number; dms?: Record<string, { historyLimit?: number }> } | undefined => {
    const channels = cfg?.channels;
    if (!channels || typeof channels !== "object") {
      return undefined;
    }
    const entry = (channels as Record<string, unknown>)[providerId];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return undefined;
    }
    return entry as { dmHistoryLimit?: number; dms?: Record<string, { historyLimit?: number }> };
  };

  return getLimit(resolveProviderConfig(config, provider));
}

/**
 * 2026 upgrade: Approximate token count for a list of messages.
 * Uses 4 chars ≈ 1 token heuristic — fast enough for per-run checks.
 * Safe union narrowing since AgentMessage includes BashExecutionMessage (no .content).
 */
export function approximateHistoryTokens(messages: AgentMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    // Safe union narrowing — not all AgentMessage subtypes have .content
    const raw = msg as { content?: unknown };
    if (typeof raw.content === "string") {
      chars += raw.content.length;
    } else if (Array.isArray(raw.content)) {
      for (const c of raw.content) {
        const text = (c as { text?: unknown }).text;
        if (typeof text === "string") {
          chars += text.length;
        }
      }
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * 2026 upgrade: Proactive compaction check (60% threshold).
 *
 * Returns true when conversation history is ≥ 60% of the context window.
 * Fires BEFORE overflow to prevent "lost in the middle" degradation.
 *
 * Older context degrades model quality even before hitting the hard limit —
 * this ensures early rolling summarization keeps the most important turns
 * at the edges of the context window.
 */
export function shouldProactivelyCompact(
  historyMessages: AgentMessage[],
  contextWindowTokens: number,
  systemPromptChars: number = 0,
  thresholdFraction: number = 0.6,
): boolean {
  if (contextWindowTokens <= 0) {
    return false;
  }
  const historyTokens = approximateHistoryTokens(historyMessages);
  const systemPromptTokens = Math.ceil(systemPromptChars / 4);
  const totalUsed = historyTokens + systemPromptTokens;
  return totalUsed / contextWindowTokens >= thresholdFraction;
}
