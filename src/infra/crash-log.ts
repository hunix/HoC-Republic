/**
 * Crash Log — Synchronous File-Based Exit Diagnostics
 *
 * Registers handlers for all process exit events and writes them to
 * a persistent log file via appendFileSync (synchronous — survives
 * broken pipes, closed console windows, and redirected stdout).
 *
 * Log location: $TMPDIR/openclaw/openclaw-crash.log
 *
 * To read:
 *   Windows: type $env:TEMP\openclaw\openclaw-crash.log
 *   Linux/macOS: cat /tmp/openclaw/openclaw-crash.log
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(tmpdir(), "openclaw");
const LOG_PATH = join(LOG_DIR, "openclaw-crash.log");

function ensureLogDir(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // Directory already exists or can't be created — both are tolerable
  }
}

function writeLog(entry: string): void {
  try {
    ensureLogDir();
    const ts = new Date().toISOString();
    appendFileSync(LOG_PATH, `[${ts}] ${entry}\n`, { encoding: "utf-8", flag: "a" });
  } catch {
    // appendFileSync failed — truly last-resort, no more options
  }
}

let _installed = false;

/**
 * Install crash-log handlers. Safe to call multiple times — only installs once.
 *
 * Listens for:
 *   - beforeExit   — event loop drained (event-loop drain / silent exit)
 *   - exit         — process is about to exit (any reason)
 *   - uncaughtException — unhandled thrown error
 *   - unhandledRejection — unhandled Promise rejection
 *   - SIGBREAK     — Windows console close button (Ctrl+Break)
 */
export function installCrashLog(): void {
  if (_installed) { return; }
  _installed = true;

  // Mark gateway start so we can detect premature exits
  writeLog(`[startup] Gateway process started pid=${process.pid} node=${process.version}`);

  process.on("beforeExit", (code) => {
    writeLog(`[beforeExit] code=${code} uptime=${Math.round(process.uptime())}s — event-loop drained`);
    // Also write to stdout so dev console shows it
    process.stdout.write(`[drain] beforeExit code=${code} (see ${LOG_PATH})\n`);
  });

  process.on("exit", (code) => {
    writeLog(`[exit] code=${code} uptime=${Math.round(process.uptime())}s`);
    process.stdout.write(`[drain] exit code=${code}\n`);
  });

  process.on("uncaughtException", (err: Error) => {
    const msg = err?.stack ?? err?.message ?? String(err);
    writeLog(`[uncaughtException] ${msg}`);
    process.stderr.write(`[crash] uncaughtException: ${msg}\n`);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error
      ? (reason.stack ?? reason.message)
      : String(reason);
    writeLog(`[unhandledRejection] ${msg}`);
    process.stderr.write(`[crash] unhandledRejection: ${msg}\n`);
  });

  // Windows: fired when user clicks the X on the console window
  process.on("SIGBREAK", () => {
    writeLog(`[SIGBREAK] console window closed`);
  });
}

/** Path to the crash log file (for display in UI/diagnostics) */
export const CRASH_LOG_PATH = LOG_PATH;
