/**
 * Sandbox Intake — Manus-Style Direct Command Execution from Chat
 *
 * Classifies incoming chat messages as sandbox execution requests.
 * When a user types "run ls -la", "execute this Python script", etc.,
 * this module detects it and routes it to the sandbox container instead
 * of the LLM agent pipeline.
 *
 * Pipeline: User Message → classifySandboxIntent() → sandboxExec() → chat.inject (result)
 */

export type SandboxLanguage = "shell" | "python" | "node" | "unknown";

export interface SandboxIntentResult {
  isSandboxTask: boolean;
  /** The command to run in the container. Empty string if not a sandbox task. */
  command: string;
  /** The programming language / shell type */
  language: SandboxLanguage;
  /** Working directory hint */
  cwd: string;
  /** Estimated timeout in seconds */
  timeout: number;
  /** Why it was/wasn't classified as a sandbox task */
  reason: string;
}

// ─── Patterns that indicate direct execution intent ───────────────

/** Strong indicators — highly confident sandbox intent */
const EXEC_PATTERNS: RegExp[] = [
  /^(?:run|execute|exec)\s+(.+)/i,
  /^(?:bash|sh|shell)\s*(?:command|cmd|script)?\s*[-:]?\s*(.+)/i,
  /^(?:python|python3|py)\s+(.+)/i,
  /^(?:node|nodejs|tsx|ts-node)\s+(.+)/i,
  /^(?:\$|#|%)\s+(.+)/, // Shell prompt prefix: $ ls -la
  /^```(?:bash|sh|shell|python|py|node|js)\n([\s\S]+)```/i, // Fenced code block
];

/** Verb+command patterns: "run ls -la in the container" */
const VERB_COMMAND_PATTERNS: RegExp[] = [
  /\b(?:run|execute|exec(?:ute)?)\s+(?:the\s+command\s+)?["`](.+?)["`]/i,
  /\b(?:run|execute)\s+`(.+?)`/i,
  /\bshell\s+out\s+to\s+(.+)/i,
  /\bcheck\s+(?:the\s+)?(?:files?|disk|memory|cpu|processes?|services?)\b/i,
  /\blist\s+(?:the\s+)?(?:files?|dirs?|directories|processes?)\b/i,
  /\binstall\s+(?:the\s+package|package|module|dependency|dependencies)\b/i,
  /\bwrite\s+(?:and\s+)?(?:run|execute)\s+(?:a\s+)?(.+?)(?:\s+script|program|file)\b/i,
];

/** Commands that should NEVER be treated as sandbox tasks (system commands) */
const SANDBOX_BLOCKLIST: RegExp[] = [
  /\brm\s+-rf\s+\/\b/i, // rm -rf /
  /\brm\s+-rf\s+\.\/?/i, // rm -rf ./ (current directory wipe)
  /\bformat\b/i,
  /\bdd\s+if=/i, // dd if=... disk overwrite
  /\bshutdown\b|\breboot\b|\bpoweroff\b/i,
  /\bkill\s+-9\s+1\b/i, // kill PID 1
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, // fork bomb :(){ :|:& };:
  /\bchmod\s+-R\s+777\s+\//i, // chmod -R 777 / (world-writable root)
  /\b(?:wget|curl)\b.*\|\s*(?:ba)?sh\b/i, // pipe-to-shell: wget/curl | sh/bash
  /\bmkfs\b/i, // filesystem format
];

/** Common one-liner shell commands the user might type directly */
const SHELL_ONELINERS: RegExp[] = [
  /^ls(?:\s|$)/,
  /^pwd(?:\s|$)/,
  /^cat\s+.+/,
  /^echo\s+.+/,
  /^mkdir\s+.+/,
  /^touch\s+.+/,
  /^cp\s+.+/,
  /^mv\s+.+/,
  /^grep\s+.+/,
  /^find\s+.+/,
  /^ps\s+.*/,
  /^top(?:\s|$)/,
  /^df(?:\s|$)/,
  /^du\s+.+/,
  /^curl\s+.+/,
  /^wget\s+.+/,
  /^pip\s+(?:install|list|show)\s+.+/,
  /^npm\s+(?:install|run|list|start|build)\b.*/,
  /^git\s+(?:status|log|diff|clone|pull|push|add|commit)\b.*/,
  /^docker\s+(?:ps|images|logs|exec|inspect|run|stop)\b.*/,
  /^python3?\s+-c\s+.+/,
  /^node\s+-e\s+.+/,
];

// ─── Main classifier ──────────────────────────────────────────────

/**
 * Classify whether a chat message is a direct sandbox execution request.
 * Returns a SandboxIntentResult with the command and metadata if it is.
 */
export function classifySandboxIntent(message: string): SandboxIntentResult {
  const trimmed = message.trim();
  const notSandbox: SandboxIntentResult = {
    isSandboxTask: false,
    command: "",
    language: "unknown",
    cwd: "/workspace",
    timeout: 60,
    reason: "Not a sandbox command",
  };

  // Must be non-empty and not blank
  if (!trimmed || trimmed.length < 2) {
    return notSandbox;
  }

  // Security blocklist — never execute these
  for (const r of SANDBOX_BLOCKLIST) {
    if (r.test(trimmed)) {
      return { ...notSandbox, reason: "Blocked: dangerous command pattern" };
    }
  }

  // Check strong execution patterns first
  for (const r of EXEC_PATTERNS) {
    const m = r.exec(trimmed);
    if (m) {
      const command = (m[1] ?? trimmed).trim();
      return {
        isSandboxTask: true,
        command,
        language: detectLanguage(command),
        cwd: "/workspace",
        timeout: estimateTimeout(command),
        reason: `Matched exec pattern: ${r.source.slice(0, 40)}`,
      };
    }
  }

  // Check verb+command patterns
  for (const r of VERB_COMMAND_PATTERNS) {
    const m = r.exec(trimmed);
    if (m) {
      // For verb patterns that don't capture a specific command, synthesize it
      const command = m[1] ? m[1].trim() : synthesizeCommand(trimmed);
      if (command) {
        return {
          isSandboxTask: true,
          command,
          language: detectLanguage(command),
          cwd: "/workspace",
          timeout: estimateTimeout(command),
          reason: `Matched verb pattern: ${r.source.slice(0, 40)}`,
        };
      }
    }
  }

  // Check shell one-liners — user typed a raw command
  for (const r of SHELL_ONELINERS) {
    if (r.test(trimmed)) {
      return {
        isSandboxTask: true,
        command: trimmed,
        language: "shell",
        cwd: "/workspace",
        timeout: estimateTimeout(trimmed),
        reason: "Matched shell one-liner pattern",
      };
    }
  }

  return notSandbox;
}

// ─── Helpers ──────────────────────────────────────────────────────

function detectLanguage(command: string): SandboxLanguage {
  const lower = command.toLowerCase();
  if (/^python3?\b/.test(lower) || lower.endsWith(".py")) {
    return "python";
  }
  if (/^(?:node|tsx|ts-node)\b/.test(lower) || lower.endsWith(".js") || lower.endsWith(".ts")) {
    return "node";
  }
  return "shell";
}

function estimateTimeout(command: string): number {
  const lower = command.toLowerCase();
  // Long-running operations
  if (/\b(?:install|npm\s+install|pip\s+install|apt-get|brew\s+install)\b/.test(lower)) {
    return 180;
  }
  if (/\b(?:build|compile|make|cargo\s+build)\b/.test(lower)) {
    return 120;
  }
  if (/\b(?:clone|pull|fetch|download|wget|curl)\b/.test(lower)) {
    return 60;
  }
  return 30;
}

/** For patterns like "list the files" → "ls -la" */
function synthesizeCommand(message: string): string {
  const lower = message.toLowerCase();
  if (/list\s+(?:the\s+)?files?/.test(lower)) {
    return "ls -la /workspace";
  }
  if (/list\s+(?:the\s+)?processes?/.test(lower)) {
    return "ps aux";
  }
  if (/check\s+(?:the\s+)?memory/.test(lower)) {
    return "free -h";
  }
  if (/check\s+(?:the\s+)?(?:disk|storage)/.test(lower)) {
    return "df -h";
  }
  if (/check\s+(?:the\s+)?cpu/.test(lower)) {
    return "top -bn1 | head -20";
  }
  if (/check\s+(?:the\s+)?services?/.test(lower)) {
    return "ps aux | head -30";
  }
  return "";
}
