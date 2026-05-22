#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getReplyFromConfig } from "./auto-reply/reply.js";
import { applyTemplate } from "./auto-reply/templating.js";
import { monitorWebChannel } from "./channel-web.js";
import { createDefaultDeps } from "./cli/deps.js";
import { promptYesNo } from "./cli/prompt.js";
import { waitForever } from "./cli/wait.js";
import { loadConfig } from "./config/config.js";
import {
    deriveSessionKey,
    loadSessionStore,
    resolveSessionKey,
    resolveStorePath,
    saveSessionStore
} from "./config/sessions.js";
import { ensureBinary } from "./infra/binaries.js";
import { loadDotEnv } from "./infra/dotenv.js";
import { normalizeEnv } from "./infra/env.js";
import { ErrorCategory, ErrorSeverity, handleError } from "./infra/error-handler.js";
import { formatUncaughtError } from "./infra/errors.js";
import { isMainModule } from "./infra/is-main.js";
import { ensureOpenClawCliOnPath } from "./infra/path-env.js";
import {
    describePortOwner,
    ensurePortAvailable,
    handlePortError,
    PortInUseError
} from "./infra/ports.js";
import { assertSupportedRuntime } from "./infra/runtime-guard.js";
import { installUnhandledRejectionHandler } from "./infra/unhandled-rejections.js";
import { enableConsoleCapture } from "./logging.js";
import { runCommandWithTimeout, runExec } from "./process/exec.js";
import { assertWebChannel, normalizeE164, toWhatsappJid } from "./utils.js";

loadDotEnv({ quiet: true });
normalizeEnv();
ensureOpenClawCliOnPath();

// Capture all console output into structured logs while keeping stdout/stderr behavior.
enableConsoleCapture();

// Enforce the minimum supported runtime before doing any work.
assertSupportedRuntime();

import { buildProgram } from "./cli/program.js";

const program = buildProgram();

// Export error handling utilities
export { ErrorCategory, ErrorSeverity } from "./infra/error-handler.js";
export {
    assertWebChannel,
    applyTemplate,
    createDefaultDeps,
    deriveSessionKey,
    describePortOwner,
    ensureBinary,
    ensurePortAvailable,
    getReplyFromConfig,
    handleError,
    handlePortError,
    loadConfig,
    loadSessionStore,
    monitorWebChannel,
    normalizeE164,
    PortInUseError,
    promptYesNo,
    resolveSessionKey,
    resolveStorePath,
    runCommandWithTimeout,
    runExec,
    saveSessionStore,
    toWhatsappJid,
    waitForever,
};


const isMain = isMainModule({
  currentFile: fileURLToPath(import.meta.url),
});

if (isMain) {
  // Global error handlers to prevent silent crashes from unhandled rejections/exceptions.
  // These log the error and exit gracefully instead of crashing without trace.
  installUnhandledRejectionHandler();

  // ── Heap Monitor — memory pressure detection & proactive defense ──
  const { startHeapMonitor, getLatestSnapshot } = await import("./infra/heap-monitor.js");
  startHeapMonitor({
    maxHeapMB: 4096,
    onPressureChange: (level, snap) => {
      if (level === "critical") {
        console.warn(`[hoc] ⚠️ Memory CRITICAL: ${snap.heapUsedMB}/${4096} MB (${snap.heapPct}%)`);
      }
    },
    onEmergency: (snap) => {
      console.error(`[hoc] 🚨 EMERGENCY: Heap at ${snap.heapPct}% — initiating graceful shutdown`);
      process.exit(99); // Special code for memory emergency
    },
    onShedLoad: (shedding) => {
      console.log(`[hoc] Load shedding: ${shedding ? "ACTIVE — reducing non-essential work" : "deactivated"}`);
    },
  });

  // Log exit codes with memory diagnostics for post-mortem
  process.on("exit", (code) => {
    const snap = getLatestSnapshot();
    const memInfo = snap
      ? ` | heap=${snap.heapUsedMB}MB/${4096}MB (${snap.heapPct}%) rss=${snap.rssMB}MB`
      : "";
    const restartInfo = process.env.WATCHDOG_RESTART_COUNT
      ? ` | restart #${process.env.WATCHDOG_RESTART_COUNT}`
      : "";

    if (code === 0 || code === null) {
      console.error(`[hoc] Process exiting with code 0 (clean exit)${memInfo}${restartInfo}`);
    } else {
      const hex = code > 0 ? `0x${code.toString(16).toUpperCase()}` : String(code);
      const isNativeCrash = [-1073740791, -1073741819, -1073741571, -1073740940].includes(code);
      const crashLabel = isNativeCrash ? " ⚠️ NATIVE CRASH" : "";
      console.error(
        `[hoc] Process exiting with code ${code} (${hex})${crashLabel}${memInfo}${restartInfo}`,
      );
    }
  });

  process.on("uncaughtException", (error) => {
    handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.FATAL,
      operation: "process_uncaught_exception",
      silent: true,
    });
    console.error("[hoc] Uncaught exception (recovered):", formatUncaughtError(error));
    // Provide a stack trace if possible
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    // Intentionally omitting process.exit(1) to make the gateway immortal
  });

  void program.parseAsync(process.argv).catch((err) => {
    console.error("[hoc] CLI failed:", formatUncaughtError(err));
    process.exit(1);
  });
}
