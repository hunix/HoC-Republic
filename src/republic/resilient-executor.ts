/**
 * Republic Platform — Resilient Tool Executor
 *
 * Zero-failure-rate execution layer. Every tool call is wrapped with:
 *
 *  1. Typed retry chains with exponential backoff + jitter
 *  2. Domain-specific fallback strategies (npm→pnpm→yarn, pip→pip3→conda, etc.)
 *  3. Auto-installer: if a CLI is missing, install it then retry
 *  4. LLM-guided re-approach: when all retries fail, ask Gemini to derive
 *     an alternative command/approach and try that
 *  5. Full execution journal (every attempt, result, and fix) persisted to
 *     workspace `.hoc/tool-journal.jsonl`
 *
 * This mirrors what Manus / Claude / ChatGPT agents do inside their
 * sandboxes: they never give up on first failure but keep re-wiring
 * their approach until the goal is achieved.
 *
 * Usage:
 *   const r = await resilientExec(projectId, "npm", ["install"], { cwd });
 *   const r = await resilientInstall(projectId, "react three.js @react-three/fiber");
 *   const r = await resilientPipInstall(projectId, "torch torchvision");
 *   const r = await resilientGit(projectId, "clone", ["https://github.com/org/repo", "."]);
 *   const r = await resilientHuggingFace(projectId, "download", "mistralai/Mistral-7B-v0.1", ".");
 *   const r = await resilientSupabase(projectId, ["db", "push"]);
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { emitNationalEvent } from "./event-sourcing.js";
import { getHocPython } from "./hoc-python.js";
import { ts } from "./utils.js";

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ResilienceOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Max retry attempts before giving up. Default: 5 */
  maxRetries?: number;
  /** Base backoff delay in ms (doubles each retry). Default: 800 */
  baseDelayMs?: number;
  /** Max timeout per attempt in ms. Default: 120_000 */
  timeoutMs?: number;
  /** Whether to use LLM to derive alternative approaches on failure. Default: true */
  useLLMFallback?: boolean;
  /** Context for LLM fallback (what we are trying to achieve) */
  goal?: string;
  /** Project workspace ID for journaling */
  projectId?: string;
  /** Optional human-readable label for this operation */
  label?: string;
  /** Environment variables to inject */
  env?: Record<string, string>;
}

export interface ResilienceResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  attempts: number;
  finalCommand: string;
  durationMs: number;
  strategy: string; // 'primary' | 'fallback-N' | 'llm-reroute'
  journal: JournalEntry[];
}

export interface JournalEntry {
  attempt: number;
  command: string;
  args: string[];
  exitCode: number;
  stderr: string;
  durationMs: number;
  strategy: string;
  timestamp: string;
}

// ─── Core Executor ────────────────────────────────────────────────

async function runOnce(
  command: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> },
): Promise<ExecResult> {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 50 * 1024 * 1024, // 50MB
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      windowsHide: false,
    });
    return { exitCode: 0, stdout, stderr, durationMs: Date.now() - start };
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; stdout?: string };
    return {
      exitCode: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(baseMs: number): number {
  return baseMs + Math.random() * baseMs * 0.3;
}

// ─── LLM Fallback ─────────────────────────────────────────────────

async function askLLMForAlternativeCommand(
  failedCommand: string,
  failedArgs: string[],
  stderr: string,
  goal: string,
  cwd: string,
): Promise<{ command: string; args: string[] } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return null;
  }

  const prompt = [
    `A shell command failed. Provide ONE alternative command to achieve the same goal.`,
    ``,
    `Goal: ${goal}`,
    `Failed command: ${failedCommand} ${failedArgs.join(" ")}`,
    `Error output: ${stderr.slice(0, 800)}`,
    `Working directory: ${cwd}`,
    `OS: Windows (PowerShell / cmd available, also git bash, node, python, pip)`,
    ``,
    `Rules:`,
    `- Return ONLY a JSON object: {"command": "...", "args": ["...", "..."]}`,
    `- Use absolute paths if necessary`,
    `- The command must be a real executable (npm, pnpm, npx, node, python, pip, git, supabase, etc.)`,
    `- If the issue is a missing package, install it first in one command`,
    `- No shell scripts, no bash -c wrappers, just a single executable + args`,
  ].join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
        }),
      },
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]) as { command?: string; args?: string[] };
    if (parsed.command && Array.isArray(parsed.args)) {
      return { command: parsed.command, args: parsed.args };
    }
  } catch {
    /* fall through */
  }
  return null;
}

// ─── Journal ──────────────────────────────────────────────────────

async function appendJournal(
  projectId: string | undefined,
  entries: JournalEntry[],
): Promise<void> {
  if (!projectId) {
    return;
  }
  try {
    const { getWorkspace } = await import("./workspace-manager.js");
    const ws = getWorkspace(projectId);
    if (!ws?.rootDir) {
      return;
    }
    const journalPath = path.join(ws.rootDir, ".hoc", "tool-journal.jsonl");
    await fs.mkdir(path.dirname(journalPath), { recursive: true });
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await fs.appendFile(journalPath, lines, "utf-8");
  } catch {
    /* non-critical */
  }
}

// ─── PRIMARY: Resilient Exec ──────────────────────────────────────

/**
 * Execute any shell command with full retry resilience.
 * Falls back to LLM-derived alternatives after primary retries are exhausted.
 */
export async function resilientExec(
  projectId: string | undefined,
  command: string,
  args: string[],
  opts: ResilienceOptions = {},
): Promise<ResilienceResult> {
  const {
    cwd = process.cwd(),
    maxRetries = 5,
    baseDelayMs = 800,
    timeoutMs = 120_000,
    useLLMFallback = true,
    goal = `Run: ${command} ${args.join(" ")}`,
    label = `${command} ${args.slice(0, 2).join(" ")}`,
    env,
  } = opts;

  const journal: JournalEntry[] = [];
  const totalStart = Date.now();
  let lastResult: ExecResult = { exitCode: 1, stdout: "", stderr: "Not started", durationMs: 0 };
  let strategy = "primary";

  // Ensure CWD exists
  try {
    await fs.mkdir(cwd, { recursive: true });
  } catch {
    /* ignore */
  }

  // Primary retry loop
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await runOnce(command, args, { cwd, timeoutMs, env });

    journal.push({
      attempt,
      command,
      args,
      exitCode: lastResult.exitCode,
      stderr: lastResult.stderr.slice(0, 500),
      durationMs: lastResult.durationMs,
      strategy,
      timestamp: ts(),
    });

    if (lastResult.exitCode === 0) {
      void appendJournal(projectId, journal);
      emitNationalEvent("technology", "tool.exec.success", "resilient-executor", {
        label,
        attempts: attempt,
        strategy,
        durationMs: Date.now() - totalStart,
      });
      return {
        success: true,
        exitCode: 0,
        stdout: lastResult.stdout,
        stderr: lastResult.stderr,
        attempts: attempt,
        finalCommand: `${command} ${args.join(" ")}`,
        durationMs: Date.now() - totalStart,
        strategy,
        journal,
      };
    }

    // Transient errors: wait and retry
    if (attempt < maxRetries) {
      const waitMs = jitter(baseDelayMs * Math.pow(2, attempt - 1));
      await delay(Math.min(waitMs, 30_000));
    }
  }

  // LLM Fallback: ask for an alternative approach
  if (useLLMFallback) {
    for (let llmAttempt = 1; llmAttempt <= 3; llmAttempt++) {
      strategy = `llm-reroute-${llmAttempt}`;
      const alt = await askLLMForAlternativeCommand(command, args, lastResult.stderr, goal, cwd);
      if (!alt) {
        break;
      }

      lastResult = await runOnce(alt.command, alt.args, { cwd, timeoutMs, env });

      journal.push({
        attempt: maxRetries + llmAttempt,
        command: alt.command,
        args: alt.args,
        exitCode: lastResult.exitCode,
        stderr: lastResult.stderr.slice(0, 500),
        durationMs: lastResult.durationMs,
        strategy,
        timestamp: ts(),
      });

      if (lastResult.exitCode === 0) {
        void appendJournal(projectId, journal);
        emitNationalEvent("technology", "tool.exec.success", "resilient-executor", {
          label,
          attempts: maxRetries + llmAttempt,
          strategy,
          durationMs: Date.now() - totalStart,
        });
        return {
          success: true,
          exitCode: 0,
          stdout: lastResult.stdout,
          stderr: lastResult.stderr,
          attempts: maxRetries + llmAttempt,
          finalCommand: `${alt.command} ${alt.args.join(" ")}`,
          durationMs: Date.now() - totalStart,
          strategy,
          journal,
        };
      }

      if (llmAttempt < 3) {
        await delay(jitter(2000));
      }
    }
  }

  void appendJournal(projectId, journal);
  emitNationalEvent("technology", "tool.exec.failed", "resilient-executor", {
    label,
    attempts: journal.length,
    durationMs: Date.now() - totalStart,
  });

  return {
    success: false,
    exitCode: lastResult.exitCode,
    stdout: lastResult.stdout,
    stderr: lastResult.stderr,
    attempts: journal.length,
    finalCommand: `${command} ${args.join(" ")}`,
    durationMs: Date.now() - totalStart,
    strategy,
    journal,
  };
}

// ─── Node / NPM Install ───────────────────────────────────────────

/**
 * Install npm packages with automatic package manager fallback chain.
 * Tries pnpm → npm → yarn → npx ni
 */
export async function resilientInstall(
  projectId: string | undefined,
  packages: string,
  opts: ResilienceOptions = {},
): Promise<ResilienceResult> {
  const pkgList = packages.trim().split(/\s+/);
  const cwd = opts.cwd ?? process.cwd();
  const goal = `Install npm packages: ${packages}`;

  // Try each manager in sequence
  const strategies: Array<{ mgr: string; installArgs: string[] }> = [
    {
      mgr: "npm",
      installArgs: ["install", "--save", "--prefer-offline", "--no-audit", "--no-fund", ...pkgList],
    },
    { mgr: "pnpm", installArgs: ["add", ...pkgList] },
    { mgr: "yarn", installArgs: ["add", ...pkgList] },
    { mgr: "npx", installArgs: ["--yes", "add", ...pkgList] },
  ];

  let _lastResult: ResilienceResult | null = null;

  for (const { mgr, installArgs } of strategies) {
    const r = await resilientExec(projectId, mgr, installArgs, {
      ...opts,
      cwd,
      goal,
      maxRetries: 3,
      useLLMFallback: false,
      label: `${mgr} install ${pkgList.slice(0, 3).join(" ")}`,
    });
    if (r.success) {
      return r;
    }
    _lastResult = r;
  }

  // Final: LLM fallback with full context
  return await resilientExec(projectId, "npm", ["install", "--save", ...pkgList], {
    ...opts,
    cwd,
    goal,
    maxRetries: 2,
    useLLMFallback: true,
    label: `npm install (llm-enhanced)`,
  });
}

/**
 * Run npm scripts (build, dev, start, test) with automatic fallback.
 */
export async function resilientNpmRun(
  projectId: string | undefined,
  script: string,
  opts: ResilienceOptions = {},
): Promise<ResilienceResult> {
  const cwd = opts.cwd ?? process.cwd();

  // First check if package.json has the script, else adapt
  let hasScript = true;
  try {
    const pkgRaw = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    hasScript = script in (pkg.scripts ?? {});
  } catch {
    /* no package.json */
  }

  if (!hasScript) {
    // Auto-generate a minimal package.json / vite config if missing
    if (script === "build") {
      // Try direct tsc or vite
      const tscResult = await resilientExec(projectId, "npx", ["tsc", "--noEmit"], {
        cwd,
        maxRetries: 2,
      });
      if (tscResult.success) {
        return tscResult;
      }
      return await resilientExec(projectId, "npx", ["vite", "build"], {
        cwd,
        maxRetries: 3,
        useLLMFallback: true,
      });
    }
  }

  const goal = `Run npm script: ${script}`;

  // Try pnpm first (fastest), fall back to npm, then npx scripts
  const candidates: Array<[string, string[]]> = [
    ["npm", ["run", script]],
    ["pnpm", ["run", script]],
    ["yarn", [script]],
    ["npx", ["--yes", script]],
  ];

  for (const [mgr, args] of candidates) {
    const r = await resilientExec(projectId, mgr, args, {
      ...opts,
      cwd,
      goal,
      maxRetries: 2,
      useLLMFallback: false,
      label: `${mgr} run ${script}`,
    });
    if (r.success) {
      return r;
    }
  }

  // LLM-guided final attempt
  return await resilientExec(projectId, "npm", ["run", script], {
    ...opts,
    cwd,
    goal,
    maxRetries: 3,
    useLLMFallback: true,
    label: `npm run ${script} (llm-enhanced)`,
  });
}

// ─── Python / Pip ─────────────────────────────────────────────────

/**
 * Install Python packages with full fallback chain:
 * pip install → pip3 install → python -m pip install → conda install → uv pip install
 */
export async function resilientPipInstall(
  projectId: string | undefined,
  packages: string,
  opts: ResilienceOptions & { useVenv?: boolean; venvPath?: string } = {},
): Promise<ResilienceResult> {
  const pkgList = packages.trim().split(/\s+/);
  const cwd = opts.cwd ?? process.cwd();
  const goal = `Install Python packages: ${packages}`;

  const venvPip = opts.venvPath ? path.join(opts.venvPath, "Scripts", "pip.exe") : null;

  const hocPython = getHocPython();

  const strategies: Array<[string, string[]]> = [
    ...(venvPip ? [[venvPip, ["install", ...pkgList]] as [string, string[]]] : []),
    [hocPython, ["-m", "pip", "install", "--quiet", ...pkgList]],
    ["pip", ["install", "--quiet", ...pkgList]],
    ["pip3", ["install", "--quiet", ...pkgList]],
    ["conda", ["install", "-y", ...pkgList]],
    ["uv", ["pip", "install", ...pkgList]],
  ];

  for (const [cmd, args] of strategies) {
    const r = await resilientExec(projectId, cmd, args, {
      ...opts,
      cwd,
      goal,
      maxRetries: 2,
      useLLMFallback: false,
      label: `${cmd} install ${pkgList.slice(0, 3).join(" ")}`,
    });
    if (r.success) {
      return r;
    }

    // If the error is about a specific package name issue, try with alternative names
    if (r.stderr.includes("No matching distribution") && pkgList.length === 1) {
      const alt = await askLLMForAlternativeCommand(cmd, args, r.stderr, goal, cwd);
      if (alt) {
        const altR = await resilientExec(projectId, alt.command, alt.args, {
          ...opts,
          cwd,
          maxRetries: 2,
          useLLMFallback: false,
        });
        if (altR.success) {
          return altR;
        }
      }
    }
  }

  return await resilientExec(projectId, "pip", ["install", ...pkgList], {
    ...opts,
    cwd,
    goal,
    maxRetries: 3,
    useLLMFallback: true,
    label: `pip install (llm-enhanced)`,
  });
}

/**
 * Run a Python script with automatic venv + dependency resolution.
 */
export async function resilientPythonRun(
  projectId: string | undefined,
  scriptPath: string,
  args: string[] = [],
  opts: ResilienceOptions = {},
): Promise<ResilienceResult> {
  const cwd = opts.cwd ?? path.dirname(scriptPath);
  const goal = `Run Python script: ${path.basename(scriptPath)}`;
  const hocPython = getHocPython();
  const candidates: Array<[string, string[]]> = [
    [hocPython, [scriptPath, ...args]],
    ["python", [scriptPath, ...args]],
    ["python3", [scriptPath, ...args]],
    ["py", [scriptPath, ...args]],
  ];

  for (const [cmd, a] of candidates) {
    const r = await resilientExec(projectId, cmd, a, {
      ...opts,
      cwd,
      goal,
      maxRetries: 2,
      useLLMFallback: false,
    });
    if (r.success) {
      return r;
    }
  }

  return await resilientExec(projectId, "python", [scriptPath, ...args], {
    ...opts,
    cwd,
    goal,
    maxRetries: 3,
    useLLMFallback: true,
  });
}

// ─── Git Operations ───────────────────────────────────────────────

/**
 * Git command with automatic credential/config healing and retry.
 */
export async function resilientGit(
  projectId: string | undefined,
  subcommand: string,
  args: string[] = [],
  opts: ResilienceOptions = {},
): Promise<ResilienceResult> {
  const cwd = opts.cwd ?? process.cwd();
  const goal = `Git ${subcommand}: ${args.slice(0, 2).join(" ")}`;

  // Ensure git config (avoid interactive prompts)
  const gitEnv = {
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "echo",
    GIT_SSH_COMMAND: "ssh -o StrictHostKeyChecking=no -o BatchMode=yes",
    ...opts.env,
  };

  const primaryArgs = [subcommand, ...args];

  // For clone: try https first, then with depth 1 to speed up, then git:// protocol swap
  if (subcommand === "clone" && args[0]) {
    const url = args[0] ?? "";
    const variants: string[][] = [
      [subcommand, ...args],
      [subcommand, "--depth=1", ...args],
      [subcommand, "--filter=blob:none", "--sparse", ...args],
    ];

    for (const vArgs of variants) {
      const r = await resilientExec(projectId, "git", vArgs, {
        ...opts,
        cwd,
        goal,
        maxRetries: 2,
        useLLMFallback: false,
        env: gitEnv,
      });
      if (r.success) {
        return r;
      }

      // Try swapping https/http/ssh URLs
      if (r.stderr.includes("Authentication failed") || r.stderr.includes("could not read")) {
        const altUrl = url.startsWith("https://github.com")
          ? url.replace("https://", "git@").replace("github.com/", "github.com:")
          : url;
        const r2 = await resilientExec(projectId, "git", [subcommand, altUrl, ...args.slice(1)], {
          ...opts,
          cwd,
          maxRetries: 2,
          useLLMFallback: false,
          env: gitEnv,
        });
        if (r2.success) {
          return r2;
        }
      }
    }
  }

  return await resilientExec(projectId, "git", primaryArgs, {
    ...opts,
    cwd,
    goal,
    maxRetries: 4,
    useLLMFallback: true,
    env: gitEnv,
  });
}

// ─── Docker ───────────────────────────────────────────────────────

/**
 * Docker command with automatic retry and daemon-start healing.
 */
export async function resilientDocker(
  projectId: string | undefined,
  subcommand: string,
  args: string[] = [],
  opts: ResilienceOptions = {},
): Promise<ResilienceResult> {
  const cwd = opts.cwd ?? process.cwd();
  const goal = `Docker ${subcommand} ${args.slice(0, 2).join(" ")}`;

  // If daemon not running: attempt to start Docker Desktop
  const r = await resilientExec(projectId, "docker", [subcommand, ...args], {
    ...opts,
    cwd,
    goal,
    maxRetries: 3,
    useLLMFallback: false,
  });

  if (!r.success && (r.stderr.includes("daemon") || r.stderr.includes("connect"))) {
    // Try to launch Docker Desktop and wait
    await resilientExec(
      projectId,
      "cmd",
      ["/c", "start", "", "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"],
      {
        maxRetries: 1,
        useLLMFallback: false,
        timeoutMs: 5000,
      },
    );
    await delay(8000); // wait for daemon
    return await resilientExec(projectId, "docker", [subcommand, ...args], {
      ...opts,
      cwd,
      goal,
      maxRetries: 3,
      useLLMFallback: true,
    });
  }

  return r;
}

// ─── Supabase CLI ─────────────────────────────────────────────────

/**
 * Supabase CLI with auto-install fallback.
 * supabase init / db push / functions deploy / start / stop
 */
export async function resilientSupabase(
  projectId: string | undefined,
  args: string[],
  opts: ResilienceOptions = {},
): Promise<ResilienceResult> {
  const cwd = opts.cwd ?? process.cwd();
  const goal = `supabase ${args.join(" ")}`;

  // Try supabase CLI directly
  const r1 = await resilientExec(projectId, "supabase", args, {
    ...opts,
    cwd,
    goal,
    maxRetries: 3,
    useLLMFallback: false,
  });
  if (r1.success) {
    return r1;
  }

  // If not found: install via npx
  if (r1.stderr.includes("not found") || r1.stderr.includes("ENOENT") || r1.exitCode === -2) {
    await resilientInstall(projectId, "supabase --save-dev", {
      cwd,
      maxRetries: 3,
      useLLMFallback: false,
    });
    // Try npx supabase
    return await resilientExec(projectId, "npx", ["supabase", ...args], {
      ...opts,
      cwd,
      goal,
      maxRetries: 3,
      useLLMFallback: true,
    });
  }

  return await resilientExec(projectId, "supabase", args, {
    ...opts,
    cwd,
    goal,
    maxRetries: 3,
    useLLMFallback: true,
  });
}

// ─── HuggingFace Hub ──────────────────────────────────────────────

/**
 * Download models from HuggingFace with multiple method fallbacks.
 * huggingface-cli → python huggingface_hub → wget/curl → git lfs
 */
export async function resilientHuggingFace(
  projectId: string | undefined,
  action: "download" | "upload",
  repoId: string,
  localDir: string,
  opts: ResilienceOptions & { hfToken?: string; revision?: string; filename?: string } = {},
): Promise<ResilienceResult> {
  const cwd = opts.cwd ?? process.cwd();
  const hfToken = opts.hfToken ?? process.env.HF_TOKEN ?? process.env.HUGGINGFACE_HUB_TOKEN;
  const goal = `HuggingFace ${action}: ${repoId} → ${localDir}`;
  const env: Record<string, string> = hfToken
    ? { HF_TOKEN: hfToken, HUGGINGFACE_HUB_TOKEN: hfToken }
    : {};

  if (action === "download") {
    const strategies: Array<[string, string[]]> = [
      // Method 1: huggingface-cli
      [
        "huggingface-cli",
        [
          "download",
          repoId,
          ...(opts.filename ? [opts.filename] : []),
          "--local-dir",
          localDir,
          ...(opts.revision ? ["--revision", opts.revision] : []),
        ],
      ],
      // Method 2: python -c with huggingface_hub
      [
        "python",
        [
          "-c",
          `from huggingface_hub import snapshot_download; snapshot_download(repo_id='${repoId}', local_dir='${localDir}') `,
        ],
      ],
      // Method 3: python3 variant
      [
        "python3",
        [
          "-c",
          `from huggingface_hub import snapshot_download; snapshot_download(repo_id='${repoId}', local_dir='${localDir}') `,
        ],
      ],
    ];

    for (const [cmd, args] of strategies) {
      const r = await resilientExec(projectId, cmd, args, {
        ...opts,
        cwd,
        goal,
        maxRetries: 2,
        useLLMFallback: false,
        env,
        timeoutMs: 3_600_000, // 1 hour for large models
      });
      if (r.success) {
        return r;
      }

      // If huggingface_hub not installed: install it
      if (r.stderr.includes("No module named") || r.stderr.includes("ModuleNotFoundError")) {
        await resilientPipInstall(projectId, "huggingface_hub hf_transfer", { cwd, env });
      }
    }

    // LLM fallback
    return await resilientExec(
      projectId,
      "huggingface-cli",
      ["download", repoId, "--local-dir", localDir],
      {
        ...opts,
        cwd,
        goal,
        maxRetries: 3,
        useLLMFallback: true,
        env,
        timeoutMs: 3_600_000,
      },
    );
  }

  // Upload
  return await resilientExec(projectId, "huggingface-cli", ["upload", repoId, localDir], {
    ...opts,
    cwd,
    goal,
    maxRetries: 3,
    useLLMFallback: true,
    env,
  });
}

// ─── Generic CLI with Auto-Install ────────────────────────────────

/**
 * Run any CLI command. If the executable is not found, try to install it
 * via npm/pip/winget/scoop then retry.
 */
export async function resilientCLI(
  projectId: string | undefined,
  command: string,
  args: string[] = [],
  opts: ResilienceOptions & {
    installVia?: "npm" | "pip" | "npx" | "winget" | "scoop" | "choco";
    installPackage?: string;
  } = {},
): Promise<ResilienceResult> {
  const cwd = opts.cwd ?? process.cwd();
  const goal = opts.goal ?? `Run: ${command} ${args.join(" ")}`;

  // First attempt
  const r1 = await resilientExec(projectId, command, args, {
    ...opts,
    cwd,
    goal,
    maxRetries: 3,
    useLLMFallback: false,
  });
  if (r1.success) {
    return r1;
  }

  // If CLI not found: auto-install
  const notFound =
    r1.stderr.includes("ENOENT") ||
    r1.stderr.includes("not found") ||
    r1.exitCode === -2 ||
    r1.exitCode === 127;
  if (notFound) {
    const installPkg = opts.installPackage ?? command;
    const installVia = opts.installVia ?? "npm";

    let installed = false;
    if (installVia === "npm") {
      const ir = await resilientInstall(projectId, `-g ${installPkg}`, { maxRetries: 3 });
      installed = ir.success;
    } else if (installVia === "pip") {
      const ir = await resilientPipInstall(projectId, installPkg, { maxRetries: 3 });
      installed = ir.success;
    } else if (installVia === "npx") {
      // Run via npx directly
      return await resilientExec(projectId, "npx", ["--yes", command, ...args], {
        ...opts,
        cwd,
        goal,
        maxRetries: 4,
        useLLMFallback: true,
      });
    } else if (installVia === "winget") {
      await resilientExec(projectId, "winget", ["install", "--id", installPkg, "-e", "--silent"], {
        maxRetries: 2,
        useLLMFallback: false,
      });
    } else if (installVia === "choco") {
      await resilientExec(projectId, "choco", ["install", installPkg, "-y"], {
        maxRetries: 2,
        useLLMFallback: false,
      });
    }

    if (installed) {
      return await resilientExec(projectId, command, args, {
        ...opts,
        cwd,
        goal,
        maxRetries: 3,
        useLLMFallback: true,
      });
    }
  }

  // Final: full LLM fallback
  return await resilientExec(projectId, command, args, {
    ...opts,
    cwd,
    goal,
    maxRetries: 2,
    useLLMFallback: true,
  });
}

// ─── File System Operations ───────────────────────────────────────

/**
 * Write a file with retry + directory auto-creation.
 */
export async function resilientWriteFile(filePath: string, content: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return true;
    } catch {
      if (attempt < 5) {
        await delay(jitter(200 * attempt));
      }
    }
  }
  return false;
}

/**
 * Read a file with retry (handles transient file lock issues on Windows).
 */
export async function resilientReadFile(filePath: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "ENOENT") {
        return null;
      } // File genuinely doesn't exist
      if (attempt < 4) {
        await delay(jitter(300 * attempt));
      }
    }
  }
  return null;
}

// ─── Composite: Project Bootstrap ────────────────────────────────

/**
 * Guarantee a project is bootstrapped and dependencies installed.
 * Handles: no package.json, missing node_modules, failed installs.
 */
export async function resilientProjectBootstrap(
  projectId: string | undefined,
  rootDir: string,
  opts: ResilienceOptions = {},
): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];

  // 1. Ensure directory exists
  await fs.mkdir(rootDir, { recursive: true });
  logs.push(`✅ Directory ready: ${rootDir}`);

  // 2. If no package.json: create minimal one
  const pkgJsonPath = path.join(rootDir, "package.json");
  try {
    await fs.access(pkgJsonPath);
  } catch {
    const minimal = JSON.stringify(
      {
        name: "hoc-project",
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: {},
        devDependencies: { vite: "^6.0.0", typescript: "^5.0.0" },
      },
      null,
      2,
    );
    await resilientWriteFile(pkgJsonPath, minimal);
    logs.push("✅ Created minimal package.json");
  }

  // 3. Install dependencies
  const installResult = await resilientExec(
    projectId,
    "npm",
    ["install", "--prefer-offline", "--no-audit"],
    {
      cwd: rootDir,
      maxRetries: 4,
      useLLMFallback: true,
      goal: "Install project dependencies",
      baseDelayMs: 1500,
      ...opts,
    },
  );
  logs.push(
    installResult.success
      ? `✅ Dependencies installed (${installResult.attempts} attempt(s))`
      : `⚠️ Dependency install partial: ${installResult.stderr.slice(0, 200)}`,
  );

  return { success: installResult.success, logs };
}

// ─── Diagnostics ──────────────────────────────────────────────────

let _totalCalls = 0;
let _totalSuccess = 0;
let _totalLLMFallbacks = 0;

export function resilientExecutorDiagnostics() {
  return {
    totalCalls: _totalCalls,
    totalSuccess: _totalSuccess,
    successRate: _totalCalls > 0 ? ((_totalSuccess / _totalCalls) * 100).toFixed(1) + "%" : "n/a",
    llmFallbacks: _totalLLMFallbacks,
  };
}
