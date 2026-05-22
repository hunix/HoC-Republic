#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { applyCliProfileEnv, parseCliProfileArgs } from "./cli/profile.js";
import { installCrashLog } from "./infra/crash-log.js";
import { isTruthyEnvValue, normalizeEnv } from "./infra/env.js";
import "./infra/gaxios-fetch-compat.js"; // Node.js 25 compat — prevents gaxios node-fetch crash
import { installProcessWarningFilter } from "./infra/warnings.js";
import { attachChildProcessBridge } from "./process/child-process-bridge.js";

process.title = "hoc";
installProcessWarningFilter();
installCrashLog(); // install before any async work so handlers are always registered
normalizeEnv();

if (process.argv.includes("--no-color")) {
  process.env.NO_COLOR = "1";
  process.env.FORCE_COLOR = "0";
}

const EXPERIMENTAL_WARNING_FLAG = "--disable-warning=ExperimentalWarning";

function hasExperimentalWarningSuppressed(): boolean {
  const nodeOptions = process.env.NODE_OPTIONS ?? "";
  if (nodeOptions.includes(EXPERIMENTAL_WARNING_FLAG) || nodeOptions.includes("--no-warnings")) {
    return true;
  }
  for (const arg of process.execArgv) {
    if (arg === EXPERIMENTAL_WARNING_FLAG || arg === "--no-warnings") {
      return true;
    }
  }
  return false;
}

function ensureExperimentalWarningSuppressed(): boolean {
  if (isTruthyEnvValue(process.env.OPENCLAW_NO_RESPAWN)) {
    return false;
  }
  if (isTruthyEnvValue(process.env.OPENCLAW_NODE_OPTIONS_READY)) {
    return false;
  }
  if (hasExperimentalWarningSuppressed()) {
    return false;
  }

  // Respawn guard (and keep recursion bounded if something goes wrong).
  process.env.OPENCLAW_NODE_OPTIONS_READY = "1";
  // Pass flag as a Node CLI option, not via NODE_OPTIONS (--disable-warning is disallowed in NODE_OPTIONS).
  // --max-old-space-size: caps heap at 2GB so Node.js OOM throws a catchable JS exception
  // (without this, Windows kills the process silently with no crash-log entry).
  const heapFlag = "--max-old-space-size=2048";
  const existingExecArgv = process.execArgv.filter((a) => !a.startsWith("--max-old-space-size"));
  const child = spawn(
    process.execPath,
    [EXPERIMENTAL_WARNING_FLAG, heapFlag, ...existingExecArgv, ...process.argv.slice(1)],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  attachChildProcessBridge(child);

  child.once("exit", (code, signal) => {
    if (signal) {
      process.stderr.write(`[hoc] child exited on signal ${signal}\n`);
      process.exitCode = 1;
      return;
    }
    if (code === 0) {
      // A clean exit from the child is suspicious — the gateway should run forever.
      // This is most likely an event-loop drain (silent exit). Log it prominently.
      process.stderr.write(
        `[hoc] child exited with code 0 (unexpected clean exit — likely event-loop drain)\n`,
      );
    }
    process.exit(code ?? 1);
  });

  child.once("error", (error) => {
    console.error(
      "[hoc] Failed to respawn CLI:",
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exit(1);
  });

  // Parent must not continue running the CLI.
  return true;
}

function normalizeWindowsArgv(argv: string[]): string[] {
  if (process.platform !== "win32") {
    return argv;
  }
  if (argv.length < 2) {
    return argv;
  }
  const stripControlChars = (value: string): string => {
    let out = "";
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code >= 32 && code !== 127) {
        out += value[i];
      }
    }
    return out;
  };
  const normalizeArg = (value: string): string =>
    stripControlChars(value)
      .replace(/^['"]+|['"]+$/g, "")
      .trim();
  const normalizeCandidate = (value: string): string =>
    normalizeArg(value).replace(/^\\\\\\?\\/, "");
  const execPath = normalizeCandidate(process.execPath);
  const execPathLower = execPath.toLowerCase();
  const execBase = path.basename(execPath).toLowerCase();
  const isExecPath = (value: string | undefined): boolean => {
    if (!value) {
      return false;
    }
    const lower = normalizeCandidate(value).toLowerCase();
    return (
      lower === execPathLower ||
      path.basename(lower) === execBase ||
      lower.endsWith("\\node.exe") ||
      lower.endsWith("/node.exe") ||
      lower.includes("node.exe")
    );
  };
  const next = [...argv];
  for (let i = 1; i <= 3 && i < next.length; ) {
    if (isExecPath(next[i])) {
      next.splice(i, 1);
      continue;
    }
    i += 1;
  }
  const filtered = next.filter((arg, index) => index === 0 || !isExecPath(arg));
  if (filtered.length < 3) {
    return filtered;
  }
  const cleaned = [...filtered];
  for (let i = 2; i < cleaned.length; ) {
    const arg = cleaned[i];
    if (!arg || arg.startsWith("-")) {
      i += 1;
      continue;
    }
    if (isExecPath(arg)) {
      cleaned.splice(i, 1);
      continue;
    }
    break;
  }
  return cleaned;
}

process.argv = normalizeWindowsArgv(process.argv);

if (!ensureExperimentalWarningSuppressed()) {
  const parsed = parseCliProfileArgs(process.argv);
  if (!parsed.ok) {
    // Keep it simple; Commander will handle rich help/errors after we strip flags.
    console.error(`[hoc] ${parsed.error}`);
    process.exit(2);
  }

  if (parsed.profile) {
    applyCliProfileEnv({ profile: parsed.profile });
    // Keep Commander and ad-hoc argv checks consistent.
    process.argv = parsed.argv;
  }

  import("./cli/run-main.js")
    .then(({ runCli }) => runCli(process.argv))
    .then(() => {
      // runCli should NEVER resolve for the gateway — it blocks on runGatewayLoop forever.
      // If we get here, it means runGatewayLoop exited unexpectedly (likely event-loop drain).
      process.stderr.write(
        `[hoc] runCli() resolved — gateway loop exited prematurely (event-loop drain?)\n`,
      );
    })
    .catch((error) => {
      console.error(
        "[hoc] Failed to start CLI:",
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      process.exitCode = 1;
    });
}
