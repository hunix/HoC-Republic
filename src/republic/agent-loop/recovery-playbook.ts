/**
 * Failure Recovery Playbooks — Automated Error Recovery Strategies
 *
 * When a tool fails, instead of relying on the LLM to figure out recovery,
 * this module provides pre-built, deterministic recovery strategies based
 * on error signatures. The LLM gets both the error AND a recommended fix.
 *
 * Playbooks are structured as:
 *   pattern → diagnosis → automated recovery steps → fallback guidance
 *
 * Examples:
 *   - "EACCES" → permission error → "Run: chmod +x <file>"
 *   - "ENOENT" → file not found → check spelling, list parent dir
 *   - "npm ERR!" → package install failed → clear cache, reinstall
 *   - "SyntaxError" → code bug → show surrounding context
 *
 * This removes a full LLM round-trip for well-known error types.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";

const logger = createSubsystemLogger("recovery-playbook");

// ─── Types ──────────────────────────────────────────────────────

export interface RecoveryPlaybook {
  /** Name for logging */
  name: string;
  /** Regex pattern matching error strings */
  pattern: RegExp;
  /** Short diagnosis for the LLM */
  diagnosis: string;
  /** Commands to try automatically before the LLM sees the error */
  autoFixCommands?: string[];
  /** Guidance injected into the LLM's error context */
  guidance: string;
  /** Whether to retry the original tool after auto-fix */
  retryOriginal: boolean;
  /** Severity: info=expected, warn=recoverable, critical=may block task */
  severity: "info" | "warn" | "critical";
}

export interface RecoveryResult {
  matched: boolean;
  playbook?: RecoveryPlaybook;
  autoFixOutput?: string;
  enrichedError: string;
}

// ─── Playbook Registry ──────────────────────────────────────────

const PLAYBOOKS: RecoveryPlaybook[] = [
  // ── File System ────────────────────────────────────────────
  {
    name: "permission-denied",
    pattern: /EACCES|permission denied|access denied/i,
    diagnosis: "File permission error — the target file or directory is not writable.",
    autoFixCommands: ["chmod -R u+rw /workspace"],
    guidance:
      "Try `chmod` on the specific file, or write to a different location within /workspace. " +
      "If this is outside /workspace, you cannot write there — adjust your path.",
    retryOriginal: true,
    severity: "warn",
  },
  {
    name: "file-not-found",
    pattern: /ENOENT|no such file|not found|cannot find/i,
    diagnosis: "The target file or directory does not exist.",
    guidance:
      "Check the path for typos. Use `ls` to verify the parent directory exists. " +
      "If creating a new file, ensure the parent directory is created first with `mkdir -p`.",
    retryOriginal: false,
    severity: "warn",
  },
  {
    name: "disk-full",
    pattern: /ENOSPC|no space left|disk full/i,
    diagnosis: "Disk space exhausted in the sandbox container.",
    autoFixCommands: ["rm -rf /tmp/* /workspace/.cache 2>/dev/null; df -h /workspace | tail -1"],
    guidance:
      "Remove temporary files and caches. Consider cleaning node_modules or build artifacts. " +
      "Check available space with `df -h`.",
    retryOriginal: true,
    severity: "critical",
  },
  {
    name: "file-busy",
    pattern: /EBUSY|resource busy|text file busy/i,
    diagnosis: "A file or resource is locked by another process.",
    autoFixCommands: ["fuser -k /workspace/* 2>/dev/null || true"],
    guidance:
      "Wait a moment and retry. If a process is holding the file, kill it with `fuser -k <path>`. " +
      "Or write to a temporary file and move it.",
    retryOriginal: true,
    severity: "warn",
  },

  // ── Network ────────────────────────────────────────────────
  {
    name: "connection-refused",
    pattern: /ECONNREFUSED|connection refused/i,
    diagnosis: "Network connection refused — the target service is not running or not accessible.",
    guidance:
      "Check if the service is running: `curl -s http://localhost:PORT/health`. " +
      "If it's a local service, ensure it was started. If external, check the URL.",
    retryOriginal: false,
    severity: "warn",
  },
  {
    name: "timeout",
    pattern: /ETIMEDOUT|timed out|timeout|deadline exceeded/i,
    diagnosis: "Operation timed out — the service or command took too long.",
    guidance:
      "For web requests: the remote server may be slow or down. Try again or use a different URL. " +
      "For commands: the operation may be too heavy. Try breaking it into smaller steps.",
    retryOriginal: false,
    severity: "warn",
  },
  {
    name: "dns-failure",
    pattern: /ENOTFOUND|DNS|getaddrinfo|name resolution/i,
    diagnosis: "DNS resolution failed — the hostname could not be resolved.",
    guidance:
      "Check the URL for typos. The domain may not exist or DNS may be temporarily unavailable. " +
      "Try using an IP address directly or a different URL.",
    retryOriginal: false,
    severity: "warn",
  },
  {
    name: "rate-limited",
    pattern: /429|rate.?limit|too many requests|quota exceeded/i,
    diagnosis: "Rate limited by the remote API.",
    guidance:
      "Wait 10-30 seconds before retrying. Consider caching results or batching requests. " +
      "If this is a search API, try a more specific query to reduce calls.",
    retryOriginal: false,
    severity: "info",
  },
  {
    name: "server-error",
    pattern: /50[0-9]|internal server error|bad gateway|service unavailable/i,
    diagnosis: "Remote server error — the service is experiencing issues.",
    guidance:
      "This is a server-side problem, not your fault. Try again in a moment. " +
      "If persistent, use an alternative service or skip this step.",
    retryOriginal: false,
    severity: "info",
  },

  // ── NPM / Node.js ─────────────────────────────────────────
  {
    name: "npm-install-failed",
    pattern: /npm ERR|ERESOLVE|peer dep|could not resolve/i,
    diagnosis: "NPM package installation failed — likely a dependency conflict.",
    autoFixCommands: [
      "cd /workspace && rm -rf node_modules package-lock.json && npm install --legacy-peer-deps 2>&1 | tail -5",
    ],
    guidance:
      "Try `npm install --legacy-peer-deps` or `npm install --force`. " +
      "If specific packages conflict, install them one at a time.",
    retryOriginal: true,
    severity: "warn",
  },
  {
    name: "module-not-found",
    pattern: /MODULE_NOT_FOUND|Cannot find module|cannot resolve/i,
    diagnosis: "A required Node.js module is missing.",
    guidance:
      "Run `npm install` to install dependencies. If a specific package is missing, " +
      "install it with `npm install <package-name>`. Check import paths for typos.",
    retryOriginal: false,
    severity: "warn",
  },

  // ── Python ─────────────────────────────────────────────────
  {
    name: "python-import-error",
    pattern: /ModuleNotFoundError|No module named|ImportError/i,
    diagnosis: "A required Python package is not installed.",
    autoFixCommands: ["pip install --quiet"],
    guidance:
      "Install the missing package with `pip install <package-name>`. " +
      "If multiple packages are needed, create a requirements.txt and run `pip install -r requirements.txt`.",
    retryOriginal: true,
    severity: "warn",
  },

  // ── Syntax / Code ──────────────────────────────────────────
  {
    name: "syntax-error",
    pattern: /SyntaxError|Unexpected token|parsing error|unterminated/i,
    diagnosis: "Code syntax error — there's a bug in the generated code.",
    guidance:
      "Read the file around the error line. Common causes: missing closing bracket, " +
      "incorrect indentation, or mismatched quotes. Fix the specific line mentioned in the error.",
    retryOriginal: false,
    severity: "warn",
  },
  {
    name: "type-error",
    pattern: /TypeError.*is not a function|is not defined|Cannot read propert/i,
    diagnosis: "JavaScript TypeError — a variable is undefined or used incorrectly.",
    guidance:
      "Check that the variable/function exists and is spelled correctly. " +
      "Verify import statements. Add null checks where reading properties of potentially undefined values.",
    retryOriginal: false,
    severity: "warn",
  },

  // ── Container / Docker ─────────────────────────────────────
  {
    name: "container-not-running",
    pattern: /container.*not running|Container.*is not running|docker.*not found/i,
    diagnosis: "The sandbox container is not running or Docker is unavailable.",
    guidance:
      "The sandbox container may have stopped. This is an infrastructure issue — " +
      "report it and try simpler approaches that don't require the container.",
    retryOriginal: false,
    severity: "critical",
  },

  // ── Git ────────────────────────────────────────────────────
  {
    name: "git-conflict",
    pattern: /CONFLICT|merge conflict|failed to merge/i,
    diagnosis: "Git merge conflict detected.",
    guidance:
      "Resolve conflicts by editing the conflicting files (remove conflict markers). " +
      "Then `git add <files>` and `git commit`. Use `git diff` to see what conflicts remain.",
    retryOriginal: false,
    severity: "warn",
  },
];

// ─── Recovery Engine ────────────────────────────────────────────

/**
 * Match an error against known playbooks and produce recovery guidance.
 */
export function matchPlaybook(toolName: string, errorMessage: string): RecoveryResult {
  for (const playbook of PLAYBOOKS) {
    if (playbook.pattern.test(errorMessage)) {
      const enrichedError = [
        `Error: ${errorMessage.slice(0, 500)}`,
        ``,
        `[RECOVERY GUIDANCE — ${playbook.name}]`,
        `Diagnosis: ${playbook.diagnosis}`,
        `Suggested fix: ${playbook.guidance}`,
        playbook.retryOriginal
          ? `The original operation may succeed if you apply the fix first.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      logger.info(
        `[RecoveryPlaybook] Matched "${playbook.name}" for ${toolName}: ${playbook.diagnosis}`,
      );

      return {
        matched: true,
        playbook,
        enrichedError,
      };
    }
  }

  return {
    matched: false,
    enrichedError: `Error: ${errorMessage}`,
  };
}

/**
 * Execute auto-fix commands from a matched playbook (best-effort).
 * Returns the combined output from all fix commands.
 */
export async function executeAutoFix(playbook: RecoveryPlaybook): Promise<string> {
  if (!playbook.autoFixCommands || playbook.autoFixCommands.length === 0) {
    return "";
  }

  try {
    const { sandboxExec } = await import("../agent-sandbox.js");
    const outputs: string[] = [];
    for (const cmd of playbook.autoFixCommands) {
      try {
        const result = await sandboxExec(cmd, "/workspace", 15);
        if (result.stdout) {
          outputs.push(result.stdout.trim());
        }
        if (result.stderr) {
          outputs.push(result.stderr.trim());
        }
      } catch {
        // Individual fix command failed — continue with others
      }
    }
    const output = outputs.filter(Boolean).join("\n").slice(0, 500);
    if (output) {
      logger.info(`[RecoveryPlaybook] Auto-fix output: ${output.slice(0, 200)}`);
    }
    return output;
  } catch {
    return "";
  }
}

/**
 * Get a summary of all available playbooks (for diagnostics/debugging).
 */
export function getPlaybookSummary(): string {
  return PLAYBOOKS.map((p) => `  ${p.name} (${p.severity}): ${p.diagnosis.slice(0, 60)}`).join(
    "\n",
  );
}
