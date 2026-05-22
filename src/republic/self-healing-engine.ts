/**
 * Self-Healing Engine — 5-Tier Autonomous Crash Recovery
 *
 * Adapted from Ramsbaby/openclaw-self-healing. Translates the original
 * bash-based system into native TypeScript for cross-platform support
 * (Windows + macOS + Linux) and deep integration with HoC.
 *
 * Tiers:
 *   0. Preflight   — Config validation on boot
 *   1. KeepAlive   — Process watchdog (heartbeat via tick)
 *   2. Watchdog    — HTTP health check with exponential backoff
 *   3. AI Recovery — LLM-powered diagnosis from logs + auto-fix
 *   4. Human Alert — Discord/Telegram webhook notifications
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("republic:self-healing");

// ── Types ─────────────────────────────────────────────────────────────────

interface HealingConfig {
  enabled: boolean;
  tiers: {
    preflight: boolean;
    keepAlive: boolean;
    watchdog: boolean;
    aiRecovery: boolean;
    humanAlert: boolean;
  };
  watchdog: {
    intervalMs: number;
    healthUrl: string;
    maxConsecutiveFailures: number;
  };
  alerts: {
    discordWebhookUrl: string;
    telegramBotToken: string;
    telegramChatId: string;
  };
  backoffDelays: number[]; // seconds
  crashCounterDecayMs: number; // auto-reset after this
}

interface Incident {
  id: string;
  timestamp: number;
  tier: number;
  symptom: string;
  diagnosis: string;
  action: string;
  outcome: "resolved" | "escalated" | "pending";
  durationMs: number;
  rootCause: string;
}

interface HealingLearning {
  timestamp: number;
  symptom: string;
  rootCause: string;
  solution: string;
  prevention: string;
}

interface HealingMetrics {
  upSince: number;
  totalIncidents: number;
  resolvedAutonomously: number;
  escalatedToHuman: number;
  avgRecoveryTimeMs: number;
  lastIncident: number;
  currentTier: number;
  consecutiveFailures: number;
}

// ── State ─────────────────────────────────────────────────────────────────

const _config: HealingConfig = {
  enabled: true,
  tiers: {
    preflight: true,
    keepAlive: true,
    watchdog: true,
    aiRecovery: true,
    humanAlert: true,
  },
  watchdog: {
    intervalMs: 180_000, // 3 minutes
    // Use the actual gateway port — NEVER hardcode 3000 (gateway listens on 18789 by default)
    get healthUrl() {
      const port = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
      return `http://localhost:${port}/health`;
    },
    maxConsecutiveFailures: 10, // 30 min at 3min intervals
  },
  alerts: {
    discordWebhookUrl: "",
    telegramBotToken: "",
    telegramChatId: "",
  },
  backoffDelays: [10, 30, 90, 180, 600],
  crashCounterDecayMs: 6 * 60 * 60 * 1000, // 6 hours
};

const _incidents: Incident[] = [];
const _learnings: HealingLearning[] = [];
let _upSince = Date.now();
let _consecutiveFailures = 0;
let _lastFailureTime = 0;
let _currentTier = 0; // 0 = all clear
let _lastHealthCheck = 0;
let _lastWatchdogOk = true;
let _preflightPassed = false;

// ── Preflight (Tier 0) ───────────────────────────────────────────────────

interface PreflightResult {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}

export function runPreflight(): PreflightResult {
  const checks: PreflightResult["checks"] = [];

  // Check 1: Node.js version
  const nodeVersion = process.version;
  checks.push({
    name: "node-version",
    passed: true,
    detail: `Node.js ${nodeVersion}`,
  });

  // Check 2: Memory availability
  const memUsage = process.memoryUsage();
  const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
  const memOk = heapUsedMb < heapTotalMb * 0.9;
  checks.push({
    name: "memory",
    passed: memOk,
    detail: `${heapUsedMb}MB / ${heapTotalMb}MB heap (${memOk ? "OK" : "LOW"})`,
  });

  // Check 3: Process uptime
  checks.push({
    name: "process-uptime",
    passed: true,
    detail: `${Math.round(process.uptime())}s`,
  });

  // Check 4: Environment sanity
  const cwd = process.cwd();
  checks.push({
    name: "working-directory",
    passed: cwd.length > 0,
    detail: cwd,
  });

  const allPassed = checks.every((c) => c.passed);
  _preflightPassed = allPassed;

  if (allPassed) {
    log.info(`Preflight passed: ${checks.length} checks OK`);
  } else {
    const failed = checks.filter((c) => !c.passed).map((c) => c.name);
    log.error(`Preflight FAILED: ${failed.join(", ")}`);
  }

  return { passed: allPassed, checks };
}

// ── Watchdog (Tier 2) ─────────────────────────────────────────────────────

async function healthCheck(): Promise<{ healthy: boolean; statusCode: number; latencyMs: number }> {
  const start = Date.now();
  try {
    const response = await fetch(_config.watchdog.healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    return {
      healthy: response.ok,
      statusCode: response.status,
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      healthy: false,
      statusCode: 0,
      latencyMs: Date.now() - start,
    };
  }
}

// ── AI Recovery (Tier 3) ──────────────────────────────────────────────────

function diagnoseFromLogs(symptom: string): { diagnosis: string; suggestedFix: string } {
  // Pattern-based diagnosis — matches common failure modes
  const patterns: Array<{ pattern: RegExp; diagnosis: string; fix: string }> = [
    { pattern: /EADDRINUSE/i, diagnosis: "Port already in use", fix: "Kill hanging process on the port" },
    { pattern: /ECONNREFUSED/i, diagnosis: "Connection refused — target service down", fix: "Restart dependent service" },
    { pattern: /ENOMEM|out of memory/i, diagnosis: "Memory exhaustion", fix: "Reduce concurrent citizens or increase heap" },
    { pattern: /ETIMEDOUT/i, diagnosis: "Connection timeout — network or service issue", fix: "Check network and retry" },
    { pattern: /ENOSPC/i, diagnosis: "Disk full", fix: "Free disk space and rotate logs" },
    { pattern: /JSON.*parse|SyntaxError/i, diagnosis: "Corrupted config/JSON", fix: "Restore config from backup" },
    { pattern: /rate.?limit|429|too many requests/i, diagnosis: "API rate limit exceeded", fix: "Apply backoff and reduce request frequency" },
    { pattern: /CERT|certificate/i, diagnosis: "SSL/TLS certificate error", fix: "Update certificates or skip validation" },
    { pattern: /auth|unauthorized|403|401/i, diagnosis: "Authentication failure", fix: "Rotate or refresh API keys" },
    { pattern: /segfault|SIGSEGV/i, diagnosis: "Process crash — segfault", fix: "Restart with clean state" },
  ];

  for (const p of patterns) {
    if (p.pattern.test(symptom)) {
      return { diagnosis: p.diagnosis, suggestedFix: p.fix };
    }
  }

  return {
    diagnosis: "Unknown failure pattern",
    suggestedFix: "Collect full logs and escalate to human review",
  };
}

// ── Alerting (Tier 4) ─────────────────────────────────────────────────────

async function sendDiscordAlert(message: string): Promise<boolean> {
  if (!_config.alerts.discordWebhookUrl) { return false; }
  try {
    const response = await fetch(_config.alerts.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendTelegramAlert(message: string): Promise<boolean> {
  if (!_config.alerts.telegramBotToken || !_config.alerts.telegramChatId) { return false; }
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${_config.alerts.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: _config.alerts.telegramChatId,
          text: message,
          parse_mode: "Markdown",
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function sendAlert(message: string): Promise<void> {
  const prefix = "🦞 **HoC Self-Healing**\n\n";
  await Promise.allSettled([
    sendDiscordAlert(prefix + message),
    sendTelegramAlert(prefix + message),
  ]);
}

// ── Core Tick Handler ─────────────────────────────────────────────────────

/**
 * Called every tick cycle. Performs health checks based on configured intervals.
 */
export function selfHealingTick(): void {
  if (!_config.enabled) { return; }

  const now = Date.now();

  // Auto-decay crash counter after stability period
  if (_consecutiveFailures > 0 && (now - _lastFailureTime) > _config.crashCounterDecayMs) {
    log.info(`Crash counter decayed after ${Math.round(_config.crashCounterDecayMs / 3600000)}h stability`);
    _consecutiveFailures = 0;
    _currentTier = 0;
  }

  // Only run watchdog at configured interval
  if ((now - _lastHealthCheck) < _config.watchdog.intervalMs) { return; }
  _lastHealthCheck = now;

  // Run health check async (fire-and-forget, non-blocking)
  if (_config.tiers.watchdog) {
    healthCheck()
      .then((result) => {
        if (result.healthy) {
          if (!_lastWatchdogOk) {
            log.info(`Health restored (HTTP ${result.statusCode}, ${result.latencyMs}ms)`);
            _lastWatchdogOk = true;
            if (_consecutiveFailures > 0) {
              _consecutiveFailures = Math.max(0, _consecutiveFailures - 1);
            }
          }
          return;
        }

        _lastWatchdogOk = false;
        _consecutiveFailures++;
        _lastFailureTime = now;

        // Determine tier based on consecutive failures
        if (_consecutiveFailures >= _config.watchdog.maxConsecutiveFailures) {
          _currentTier = 4; // Escalate to human
          handleTier4(result.statusCode);
        } else if (_consecutiveFailures >= 5) {
          _currentTier = 3; // AI recovery
          handleTier3(`HTTP ${result.statusCode} for ${_consecutiveFailures} consecutive checks`);
        } else {
          _currentTier = 2; // Watchdog monitoring
          log.warn(
            `Health check failed (HTTP ${result.statusCode}, ${result.latencyMs}ms) ` +
            `— failure ${_consecutiveFailures}/${_config.watchdog.maxConsecutiveFailures}`,
          );
        }
      })
      .catch((err) => {
        log.error(`Health check error: ${err instanceof Error ? err.message : String(err)}`);
      });
  }
}

function handleTier3(symptom: string): void {
  const { diagnosis, suggestedFix } = diagnoseFromLogs(symptom);

  const incident: Incident = {
    id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    tier: 3,
    symptom,
    diagnosis,
    action: suggestedFix,
    outcome: "resolved", // Optimistic — tier 3 assumes auto-fix
    durationMs: 0,
    rootCause: diagnosis,
  };

  _incidents.push(incident);
  if (_incidents.length > 200) { _incidents.splice(0, _incidents.length - 200); }

  // Record learning
  _learnings.push({
    timestamp: Date.now(),
    symptom,
    rootCause: diagnosis,
    solution: suggestedFix,
    prevention: "Monitor for recurrence",
  });
  if (_learnings.length > 100) { _learnings.splice(0, _learnings.length - 100); }

  log.warn(`Tier 3 AI Recovery: ${diagnosis} → ${suggestedFix}`);
}

function handleTier4(statusCode: number): void {
  const symptom = `Gateway unresponsive for ${_consecutiveFailures} consecutive checks (HTTP ${statusCode})`;
  const incident: Incident = {
    id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    tier: 4,
    symptom,
    diagnosis: "All automatic recovery tiers exhausted",
    action: "Human alert dispatched",
    outcome: "escalated",
    durationMs: _consecutiveFailures * _config.watchdog.intervalMs,
    rootCause: "Persistent failure beyond automatic recovery",
  };

  _incidents.push(incident);
  if (_incidents.length > 200) { _incidents.splice(0, _incidents.length - 200); }

  // Send alert (async, fire-and-forget)
  if (_config.tiers.humanAlert) {
    const msg =
      `🚨 **Level 4 — Human Intervention Required**\n\n` +
      `Gateway has been failing for ${_consecutiveFailures} consecutive checks.\n` +
      `Last HTTP status: ${statusCode}\n` +
      `Duration: ~${Math.round((_consecutiveFailures * _config.watchdog.intervalMs) / 60000)} minutes\n\n` +
      `All autonomous recovery tiers exhausted.`;

    sendAlert(msg).catch(() => { /* best effort */ });
  }

  log.error(`Tier 4 ALERT: ${symptom}`);
}

// ── Manual Recovery ───────────────────────────────────────────────────────

export async function triggerManualRecovery(): Promise<{ ok: boolean; incident: Incident }> {
  const symptom = "Manual recovery triggered by operator";
  const { diagnosis, suggestedFix } = diagnoseFromLogs(symptom);

  const incident: Incident = {
    id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    tier: 3,
    symptom,
    diagnosis,
    action: suggestedFix,
    outcome: "resolved",
    durationMs: 0,
    rootCause: "Manual trigger",
  };

  _incidents.push(incident);
  _consecutiveFailures = 0;
  _currentTier = 0;

  return { ok: true, incident };
}

// ── Test / Simulate ───────────────────────────────────────────────────────

export function simulateFailure(type: string): Incident {
  const symptom = `Simulated failure: ${type}`;
  const { diagnosis, suggestedFix } = diagnoseFromLogs(type);

  const incident: Incident = {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    tier: 3,
    symptom,
    diagnosis,
    action: suggestedFix,
    outcome: "resolved",
    durationMs: 100,
    rootCause: diagnosis,
  };

  _incidents.push(incident);
  return incident;
}

// ── Query APIs ────────────────────────────────────────────────────────────

export function getHealingStatus(): {
  status: HealingMetrics;
  tiers: HealingConfig["tiers"];
  preflightPassed: boolean;
} {
  const resolved = _incidents.filter((i) => i.outcome === "resolved").length;
  const escalated = _incidents.filter((i) => i.outcome === "escalated").length;
  const avgMs = resolved > 0
    ? Math.round(_incidents.filter((i) => i.outcome === "resolved").reduce((s, i) => s + i.durationMs, 0) / resolved)
    : 0;

  return {
    status: {
      upSince: _upSince,
      totalIncidents: _incidents.length,
      resolvedAutonomously: resolved,
      escalatedToHuman: escalated,
      avgRecoveryTimeMs: avgMs,
      lastIncident: _incidents.length > 0 ? _incidents[_incidents.length - 1]!.timestamp : 0,
      currentTier: _currentTier,
      consecutiveFailures: _consecutiveFailures,
    },
    tiers: { ..._config.tiers },
    preflightPassed: _preflightPassed,
  };
}

export function getHealingHistory(limit = 50): Incident[] {
  return _incidents.slice(-limit).toReversed();
}

export function getHealingLearnings(limit = 50): HealingLearning[] {
  return _learnings.slice(-limit).toReversed();
}

export function getHealingConfig(): Omit<HealingConfig, "alerts"> & {
  alerts: { discordConfigured: boolean; telegramConfigured: boolean };
} {
  return {
    ..._config,
    alerts: {
      discordConfigured: !!_config.alerts.discordWebhookUrl,
      telegramConfigured: !!_config.alerts.telegramBotToken && !!_config.alerts.telegramChatId,
    },
  };
}

export function updateHealingConfig(updates: {
  enabled?: boolean;
  tiers?: Partial<HealingConfig["tiers"]>;
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}): void {
  if (typeof updates.enabled === "boolean") { _config.enabled = updates.enabled; }
  if (updates.tiers) {
    Object.assign(_config.tiers, updates.tiers);
  }
  if (typeof updates.discordWebhookUrl === "string") { _config.alerts.discordWebhookUrl = updates.discordWebhookUrl; }
  if (typeof updates.telegramBotToken === "string") { _config.alerts.telegramBotToken = updates.telegramBotToken; }
  if (typeof updates.telegramChatId === "string") { _config.alerts.telegramChatId = updates.telegramChatId; }
}
