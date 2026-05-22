/**
 * Gateway Watchdog — Auto-Restart on Native Crash
 *
 * Lightweight parent process that spawns the gateway as a child process
 * and auto-restarts on native crashes (0xC0000409, 0xC0000005, etc.).
 *
 * Native crashes in LM Studio's ucrtbase.dll can corrupt shared Windows
 * sockets, taking down Node.js. JS-level try/catch cannot prevent this.
 * The watchdog is the only way to survive such crashes.
 *
 * Usage:
 *   node dist/infra/gateway-watchdog.js [gateway-entry-args...]
 *
 * Features:
 *   - Exponential backoff: 1s → 2s → 4s → max 30s
 *   - Max 10 restarts per hour (then pauses with alert)
 *   - Clean exit (code 0) exits the watchdog too
 *   - SIGINT/SIGTERM forwarded to child
 *   - Restart counter logged for post-mortem
 */

import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";

// ─── Configuration ──────────────────────────────────────────────

const MAX_RESTARTS_PER_HOUR = 10;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

/** Native crash exit codes that trigger restart */
const NATIVE_CRASH_CODES = new Set([
  -1073740791,  // 0xC0000409 — STATUS_STACK_BUFFER_OVERRUN
  -1073741819,  // 0xC0000005 — STATUS_ACCESS_VIOLATION
  -1073741795,  // 0xC000001D — STATUS_ILLEGAL_INSTRUCTION
  -1073741676,  // 0xC0000094 — STATUS_INTEGER_DIVIDE_BY_ZERO
  -1073741571,  // 0xC00000FD — STATUS_STACK_OVERFLOW
  -1073740940,  // 0xC0000374 — STATUS_HEAP_CORRUPTION
  134,          // SIGABRT (Unix)
  139,          // SIGSEGV (Unix)
]);

// ─── State ──────────────────────────────────────────────────────

let child: ChildProcess | null = null;
let restartCount = 0;
let backoffMs = MIN_BACKOFF_MS;
const restartTimestamps: number[] = [];
let shuttingDown = false;

// ─── Logging ────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [watchdog] ${msg}`);
}

function logError(msg: string): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [watchdog] ❌ ${msg}`);
}

// ─── Child Management ───────────────────────────────────────────

function spawnGateway(): void {
  // Resolve the gateway entry point relative to this file
  const entryPoint = path.resolve(import.meta.dirname, "../index.js");

  log(`Starting gateway (attempt #${restartCount + 1}, PID will follow)...`);

  child = fork(entryPoint, process.argv.slice(2), {
    stdio: "inherit",
    env: {
      ...process.env,
      WATCHDOG_MANAGED: "true",
      WATCHDOG_RESTART_COUNT: String(restartCount),
    },
  });

  log(`Gateway spawned (PID: ${child.pid})`);

  child.on("exit", (code, signal) => {
    child = null;

    if (shuttingDown) {
      log(`Gateway exited during shutdown (code=${code}, signal=${signal})`);
      process.exit(code ?? 0);
      return;
    }

    const exitCode = code ?? -1;
    const isNativeCrash = NATIVE_CRASH_CODES.has(exitCode);
    const isSignalKill = signal === "SIGKILL" || signal === "SIGTERM";

    if (exitCode === 0) {
      log("Gateway exited cleanly (code 0) — watchdog exiting too");
      process.exit(0);
      return;
    }

    if (isSignalKill) {
      log(`Gateway killed by ${signal} — not restarting`);
      process.exit(1);
      return;
    }

    // ── Decide whether to restart ──

    if (isNativeCrash) {
      const hexCode = exitCode < 0
        ? `0x${(exitCode >>> 0).toString(16).toUpperCase()}`
        : String(exitCode);
      logError(
        `Native crash detected! Exit code: ${exitCode} (${hexCode}). ` +
        `Restart #${restartCount + 1}, backoff: ${backoffMs}ms`,
      );
    } else {
      logError(`Gateway exited with code ${exitCode}. Restart #${restartCount + 1}`);
    }

    // Check rate limit
    const now = Date.now();
    restartTimestamps.push(now);

    // Only keep last hour
    const oneHourAgo = now - 3_600_000;
    while (restartTimestamps.length > 0 && restartTimestamps[0] < oneHourAgo) {
      restartTimestamps.shift();
    }

    if (restartTimestamps.length >= MAX_RESTARTS_PER_HOUR) {
      logError(
        `Rate limit reached: ${MAX_RESTARTS_PER_HOUR} restarts in the last hour. ` +
        `Watchdog pausing. Manual restart required.`,
      );
      process.exit(2);
      return;
    }

    // Schedule restart with backoff
    restartCount++;
    log(`Restarting in ${backoffMs}ms...`);
    setTimeout(() => {
      spawnGateway();
    }, backoffMs);

    // Increase backoff
    backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
  });

  child.on("error", (err) => {
    logError(`Failed to spawn gateway: ${err.message}`);
  });
}

// ─── Signal Forwarding ──────────────────────────────────────────

process.on("SIGINT", () => {
  shuttingDown = true;
  log("SIGINT received — forwarding to gateway");
  if (child) { child.kill("SIGINT"); }
  else { process.exit(0); }
});

process.on("SIGTERM", () => {
  shuttingDown = true;
  log("SIGTERM received — forwarding to gateway");
  if (child) { child.kill("SIGTERM"); }
  else { process.exit(0); }
});

// ─── Start ──────────────────────────────────────────────────────

log(`Gateway watchdog starting (max ${MAX_RESTARTS_PER_HOUR} restarts/hour, backoff ${MIN_BACKOFF_MS}-${MAX_BACKOFF_MS}ms)`);
spawnGateway();
