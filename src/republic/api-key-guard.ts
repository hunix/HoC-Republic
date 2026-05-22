/**
 * API Key Guard — Centralized Key Access Policy
 *
 * Controls which API keys are available to different callers:
 *   - "user"    → YOUR chat/orchestration — full access to all keys
 *   - "citizen" → Autonomous republic citizens — restricted to free/cheap providers
 *   - "agent"   → Agent sandbox loop — defaults to user-level (triggered by your chat)
 *
 * Blocked keys for citizens (unless explicitly opted in via env):
 *   - ANTHROPIC_API_KEY  (expensive, your personal key)
 *   - OPENAI_API_KEY     (expensive, your personal key)
 *   - GEMINI_API_KEY     (your personal key)
 *
 * Allowed keys for citizens:
 *   - GROQ_API_KEY       (free tier)
 *   - DEEPSEEK_API_KEY   (ultra cheap)
 *   - NVIDIA_API_KEY     (free NIM tier)
 *   - OPENROUTER_API_KEY (pay-per-use, cheap models)
 *   - All local (Ollama, LM Studio)
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("api-key-guard");

// ─── Types ──────────────────────────────────────────────────────

export type CallerType = "user" | "citizen" | "agent";

interface KeyAccessAttempt {
  keyName: string;
  callerType: CallerType;
  allowed: boolean;
  timestamp: number;
}

// ─── Configuration ──────────────────────────────────────────────

/**
 * Keys that are BLOCKED for citizens by default.
 * Can be overridden per-key with env vars:
 *   CITIZEN_ANTHROPIC_ENABLED=true
 *   CITIZEN_OPENAI_ENABLED=true
 */
const CITIZEN_BLOCKED_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
]);

/**
 * Check if a specific blocked key has been explicitly enabled for citizens.
 * e.g. ANTHROPIC_API_KEY → checks CITIZEN_ANTHROPIC_ENABLED env
 */
function isCitizenKeyOptedIn(keyName: string): boolean {
  const prefix = keyName
    .replace(/_API_KEY$/, "")
    .replace(/_/g, "_");
  const envVar = `CITIZEN_${prefix}_ENABLED`;
  return process.env[envVar] === "true";
}

// ─── Access Log ─────────────────────────────────────────────────

const accessLog: KeyAccessAttempt[] = [];
const MAX_LOG = 500;
let blockedCount = 0;

function logAccess(keyName: string, callerType: CallerType, allowed: boolean): void {
  accessLog.push({ keyName, callerType, allowed, timestamp: Date.now() });
  if (accessLog.length > MAX_LOG) { accessLog.splice(0, accessLog.length - MAX_LOG); }
  if (!allowed) {
    blockedCount++;
    logger.warn(`BLOCKED: ${callerType} attempted to access ${keyName}`);
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get an API key with access control.
 * Returns the key value for allowed access, or "" for blocked access.
 */
export function getKeyForCaller(keyName: string, callerType: CallerType): string {
  const rawValue = process.env[keyName] || "";

  // User and agent (triggered by user chat) get full access
  if (callerType === "user" || callerType === "agent") {
    return rawValue;
  }

  // Citizens: check if key is blocked
  if (callerType === "citizen" && CITIZEN_BLOCKED_KEYS.has(keyName)) {
    if (isCitizenKeyOptedIn(keyName)) {
      logAccess(keyName, callerType, true);
      return rawValue;
    }
    logAccess(keyName, callerType, false);
    return "";
  }

  // All other keys: allow
  return rawValue;
}

/**
 * Build a filtered env vars object for container injection.
 * Strips blocked keys based on caller type.
 */
export function getSafeEnvForCaller(
  callerType: CallerType,
  baseEnv: Record<string, string>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (callerType === "citizen" && CITIZEN_BLOCKED_KEYS.has(k) && !isCitizenKeyOptedIn(k)) {
      logAccess(k, callerType, false);
      safe[k] = ""; // Strip the value but keep the key present (empty)
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

/**
 * Check if a caller type has access to a specific key.
 * Does not log or consume the key.
 */
export function canCallerAccessKey(keyName: string, callerType: CallerType): boolean {
  if (callerType === "user" || callerType === "agent") { return true; }
  if (CITIZEN_BLOCKED_KEYS.has(keyName)) {
    return isCitizenKeyOptedIn(keyName);
  }
  return true;
}

/**
 * Get access statistics for diagnostics.
 */
export function getKeyGuardStatus(): {
  blockedKeys: string[];
  blockedCount: number;
  recentAttempts: KeyAccessAttempt[];
  citizenOverrides: Record<string, boolean>;
} {
  const citizenOverrides: Record<string, boolean> = {};
  for (const k of CITIZEN_BLOCKED_KEYS) {
    citizenOverrides[k] = isCitizenKeyOptedIn(k);
  }
  return {
    blockedKeys: [...CITIZEN_BLOCKED_KEYS],
    blockedCount,
    recentAttempts: accessLog.slice(-20),
    citizenOverrides,
  };
}
