/**
 * Republic Platform — Git Operations Engine
 *
 * Phase 19: Programmatic git lifecycle for autonomous code management.
 *
 * Enables the republic to:
 *   - Clone repos (including itself) to any location
 *   - Create branches, commit changes, push remotely
 *   - Fork repos (copy with clean history)
 *   - Diff across branches
 *   - Track all git operations for audit
 *
 * Uses child_process for git commands, wrapped in circuit-breaker protection.
 */

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface CloneOptions {
  branch?: string;
  depth?: number;
  singleBranch?: boolean;
  recursive?: boolean;
  credentials?: { username: string; token: string };
}

export interface CommitOptions {
  authorName?: string;
  authorEmail?: string;
  amend?: boolean;
  allowEmpty?: boolean;
}

export interface PushOptions {
  force?: boolean;
  setUpstream?: boolean;
  tags?: boolean;
}

export interface RepoStatus {
  branch: string;
  clean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  commitHash: string;
  commitMessage: string;
}

export interface DiffResult {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  raw: string;
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "deleted" | "renamed";
}

export interface BranchInfo {
  name: string;
  current: boolean;
  commitHash: string;
  lastCommitMessage: string;
}

export interface GitOperation {
  id: string;
  type: "clone" | "fork" | "branch" | "commit" | "push" | "pull" | "diff" | "status" | "checkout";
  repoDir: string;
  details: string;
  success: boolean;
  durationMs: number;
  error?: string;
  timestamp: string;
}

export interface GitOperationsDiagnostics {
  totalOperations: number;
  successRate: number;
  operationsByType: Record<string, number>;
  recentOperations: GitOperation[];
  avgDurationMs: number;
  managedRepos: number;
}

// ─── State ──────────────────────────────────────────────────────

const operationHistory: GitOperation[] = [];
const MAX_HISTORY = 500;
const managedRepos = new Set<string>();

const GIT_TIMEOUT_MS = 120_000; // 2 minutes for large clones

// ─── Helpers ────────────────────────────────────────────────────

function gitExec(
  args: string[],
  cwd?: string,
  timeoutMs = GIT_TIMEOUT_MS,
): string {
  const opts: ExecFileSyncOptions = {
    encoding: "utf-8" as const,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024, // 10MB
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (cwd) {opts.cwd = cwd;}

  return (execFileSync("git", args, opts) as string).trim();
}

function safeGitExec(
  args: string[],
  cwd?: string,
  timeoutMs = GIT_TIMEOUT_MS,
): string | null {
  try {
    return gitExec(args, cwd, timeoutMs);
  } catch {
    return null;
  }
}

function recordOperation(
  type: GitOperation["type"],
  repoDir: string,
  details: string,
  success: boolean,
  durationMs: number,
  error?: string,
): GitOperation {
  const op: GitOperation = {
    id: `gitop-${uid().slice(0, 10)}`,
    type,
    repoDir,
    details,
    success,
    durationMs,
    error,
    timestamp: ts(),
  };
  operationHistory.push(op);
  if (operationHistory.length > MAX_HISTORY) {
    operationHistory.splice(0, operationHistory.length - MAX_HISTORY);
  }
  return op;
}

function ensureGitAvailable(): { available: boolean; version?: string; error?: string } {
  try {
    const version = gitExec(["--version"], undefined, 5000);
    return { available: true, version };
  } catch {
    return { available: false, error: "Git is not installed or not in PATH" };
  }
}

function injectCredentials(url: string, creds?: CloneOptions["credentials"]): string {
  if (!creds) {return url;}
  // Turn https://github.com/user/repo into https://user:token@github.com/user/repo
  if (url.startsWith("https://")) {
    const withoutProtocol = url.slice("https://".length);
    return `https://${creds.username}:${creds.token}@${withoutProtocol}`;
  }
  return url;
}

// ─── Clone ──────────────────────────────────────────────────────

/**
 * Clone a git repository to a target directory.
 * Supports depth, branch, credentials, and recursive options.
 */
export function cloneRepo(
  url: string,
  targetDir: string,
  opts?: CloneOptions,
): { ok: boolean; dir?: string; error?: string } {
  const start = Date.now();
  try {
    const check = ensureGitAvailable();
    if (!check.available) {
      recordOperation("clone", targetDir, url, false, Date.now() - start, check.error);
      return { ok: false, error: check.error };
    }

    const absTarget = resolve(targetDir);

    // Ensure parent directory exists
    const parentDir = join(absTarget, "..");
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const args = ["clone"];
    const effectiveUrl = injectCredentials(url, opts?.credentials);

    if (opts?.branch) {args.push("-b", opts.branch);}
    if (opts?.depth) {args.push("--depth", String(opts.depth));}
    if (opts?.singleBranch) {args.push("--single-branch");}
    if (opts?.recursive) {args.push("--recurse-submodules");}

    args.push(effectiveUrl, absTarget);

    gitExec(args);
    managedRepos.add(absTarget);

    recordOperation("clone", absTarget, `Cloned ${url}`, true, Date.now() - start);
    return { ok: true, dir: absTarget };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordOperation("clone", targetDir, url, false, Date.now() - start, errMsg);
    return { ok: false, error: errMsg };
  }
}

// ─── Fork ───────────────────────────────────────────────────────

/**
 * Fork a repository: copy files to a new location and reinitialize git.
 * Creates a fresh history starting from the current state.
 */
export function forkRepo(
  sourceDir: string,
  targetDir: string,
  initialMessage = "Initial fork",
): { ok: boolean; dir?: string; error?: string } {
  const start = Date.now();
  try {
    const absSrc = resolve(sourceDir);
    const absTgt = resolve(targetDir);

    if (!existsSync(absSrc)) {
      recordOperation("fork", absTgt, `Source ${absSrc} not found`, false, Date.now() - start);
      return { ok: false, error: `Source directory not found: ${absSrc}` };
    }

    // Copy everything except .git
    mkdirSync(absTgt, { recursive: true });
    const entries = readdirSync(absSrc);
    for (const entry of entries) {
      if (entry === ".git") {continue;}
      const src = join(absSrc, entry);
      const dst = join(absTgt, entry);
      cpSync(src, dst, { recursive: true });
    }

    // Initialize fresh git repo
    gitExec(["init"], absTgt);
    // Set user config so commit works even without global config
    gitExec(["config", "user.name", "HoC Republic"], absTgt);
    gitExec(["config", "user.email", "hoc@republic.local"], absTgt);
    gitExec(["add", "."], absTgt);
    gitExec(
      ["commit", "-m", initialMessage, "--author", "HoC Republic <hoc@republic.local>"],
      absTgt,
    );

    managedRepos.add(absTgt);

    recordOperation("fork", absTgt, `Forked from ${absSrc}`, true, Date.now() - start);
    return { ok: true, dir: absTgt };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordOperation("fork", targetDir, sourceDir, false, Date.now() - start, errMsg);
    return { ok: false, error: errMsg };
  }
}

// ─── Branch ─────────────────────────────────────────────────────

/**
 * Create and optionally checkout a new branch.
 */
export function createBranch(
  repoDir: string,
  branchName: string,
  checkout = true,
): { ok: boolean; error?: string } {
  const start = Date.now();
  try {
    const abs = resolve(repoDir);
    if (checkout) {
      gitExec(["checkout", "-b", branchName], abs);
    } else {
      gitExec(["branch", branchName], abs);
    }

    recordOperation("branch", abs, `Created branch ${branchName}`, true, Date.now() - start);
    return { ok: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordOperation("branch", repoDir, branchName, false, Date.now() - start, errMsg);
    return { ok: false, error: errMsg };
  }
}

/**
 * Checkout an existing branch.
 */
export function checkoutBranch(
  repoDir: string,
  branchName: string,
): { ok: boolean; error?: string } {
  const start = Date.now();
  try {
    const abs = resolve(repoDir);
    gitExec(["checkout", branchName], abs);
    recordOperation("checkout", abs, `Checked out ${branchName}`, true, Date.now() - start);
    return { ok: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordOperation("checkout", repoDir, branchName, false, Date.now() - start, errMsg);
    return { ok: false, error: errMsg };
  }
}

/**
 * List all branches in a repository.
 */
export function listBranches(repoDir: string): BranchInfo[] {
  const abs = resolve(repoDir);
  const raw = safeGitExec(
    ["branch", "--format=%(HEAD)|%(refname:short)|%(objectname:short)|%(subject)"],
    abs,
  );
  if (!raw) {return [];}

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [head, name, hash, ...msgParts] = line.split("|");
      return {
        name: name ?? "",
        current: head === "*",
        commitHash: hash ?? "",
        lastCommitMessage: msgParts.join("|"),
      };
    });
}

// ─── Commit ─────────────────────────────────────────────────────

/**
 * Stage files and create a commit.
 * If no files specified, stages all changes.
 */
export function commitChanges(
  repoDir: string,
  message: string,
  files?: string[],
  opts?: CommitOptions,
): { ok: boolean; commitHash?: string; error?: string } {
  const start = Date.now();
  try {
    const abs = resolve(repoDir);

    // Stage
    if (files && files.length > 0) {
      gitExec(["add", ...files], abs);
    } else {
      gitExec(["add", "-A"], abs);
    }

    // Commit
    const commitArgs = ["commit", "-m", message];
    if (opts?.authorName && opts?.authorEmail) {
      commitArgs.push("--author", `${opts.authorName} <${opts.authorEmail}>`);
    }
    if (opts?.amend) {commitArgs.push("--amend");}
    if (opts?.allowEmpty) {commitArgs.push("--allow-empty");}

    gitExec(commitArgs, abs);

    const hash = safeGitExec(["rev-parse", "HEAD"], abs)?.slice(0, 7) ?? "unknown";

    recordOperation("commit", abs, `${hash}: ${message}`, true, Date.now() - start);
    return { ok: true, commitHash: hash };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordOperation("commit", repoDir, message, false, Date.now() - start, errMsg);
    return { ok: false, error: errMsg };
  }
}

// ─── Push ───────────────────────────────────────────────────────

/**
 * Push a branch to a remote.
 */
export function pushBranch(
  repoDir: string,
  remote = "origin",
  branch?: string,
  opts?: PushOptions,
): { ok: boolean; error?: string } {
  const start = Date.now();
  try {
    const abs = resolve(repoDir);
    const args = ["push"];

    if (opts?.force) {args.push("--force");}
    if (opts?.setUpstream) {args.push("--set-upstream");}
    if (opts?.tags) {args.push("--tags");}

    args.push(remote);
    if (branch) {args.push(branch);}

    gitExec(args, abs);

    const detail = `Pushed ${branch ?? "current"} → ${remote}`;
    recordOperation("push", abs, detail, true, Date.now() - start);
    return { ok: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordOperation("push", repoDir, `${remote}/${branch ?? "HEAD"}`, false, Date.now() - start, errMsg);
    return { ok: false, error: errMsg };
  }
}

/**
 * Pull the latest changes from a remote.
 */
export function pullLatest(
  repoDir: string,
  remote = "origin",
  branch?: string,
): { ok: boolean; error?: string } {
  const start = Date.now();
  try {
    const abs = resolve(repoDir);
    const args = ["pull", remote];
    if (branch) {args.push(branch);}

    gitExec(args, abs);

    recordOperation("pull", abs, `Pulled from ${remote}`, true, Date.now() - start);
    return { ok: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordOperation("pull", repoDir, remote, false, Date.now() - start, errMsg);
    return { ok: false, error: errMsg };
  }
}

// ─── Diff ───────────────────────────────────────────────────────

/**
 * Get a diff between two branches/commits.
 */
export function diffBranches(
  repoDir: string,
  base: string,
  head: string,
): DiffResult {
  const abs = resolve(repoDir);

  // Get stat for counts
  const _stat = safeGitExec(["diff", "--stat", `${base}...${head}`], abs) ?? "";
  // Get raw patch
  const raw = safeGitExec(["diff", `${base}...${head}`], abs) ?? "";
  // Get file-by-file numstat
  const numstat = safeGitExec(["diff", "--numstat", `${base}...${head}`], abs) ?? "";

  const files: DiffFile[] = numstat
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const additions = parseInt(parts[0] ?? "0", 10) || 0;
      const deletions = parseInt(parts[1] ?? "0", 10) || 0;
      const path = parts[2] ?? "";
      let status: DiffFile["status"] = "modified";
      if (additions > 0 && deletions === 0) {status = "added";}
      if (additions === 0 && deletions > 0) {status = "deleted";}
      return { path, additions, deletions, status };
    });

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  recordOperation("diff", abs, `${base}...${head} (${files.length} files)`, true, 0);

  return { files, totalAdditions, totalDeletions, raw };
}

/**
 * Get the diff of uncommitted changes.
 */
export function diffUncommitted(repoDir: string): DiffResult {
  const abs = resolve(repoDir);
  const raw = safeGitExec(["diff", "HEAD"], abs) ?? "";
  const numstat = safeGitExec(["diff", "--numstat", "HEAD"], abs) ?? "";

  const files: DiffFile[] = numstat
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const additions = parseInt(parts[0] ?? "0", 10) || 0;
      const deletions = parseInt(parts[1] ?? "0", 10) || 0;
      const path = parts[2] ?? "";
      let status: DiffFile["status"] = "modified";
      if (additions > 0 && deletions === 0) {status = "added";}
      if (additions === 0 && deletions > 0) {status = "deleted";}
      return { path, additions, deletions, status };
    });

  return {
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
    raw,
  };
}

// ─── Status ─────────────────────────────────────────────────────

/**
 * Get the current status of a repository.
 */
export function repoStatus(repoDir: string): RepoStatus {
  const abs = resolve(repoDir);

  const branch = safeGitExec(["rev-parse", "--abbrev-ref", "HEAD"], abs) ?? "unknown";
  const commitHash = safeGitExec(["rev-parse", "--short", "HEAD"], abs) ?? "unknown";
  const commitMessage = safeGitExec(["log", "-1", "--format=%s"], abs) ?? "";

  // Porcelain status for parsing
  const statusRaw = safeGitExec(["status", "--porcelain"], abs) ?? "";
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  for (const line of statusRaw.split("\n").filter(Boolean)) {
    const idx = line[0] ?? " ";
    const wt = line[1] ?? " ";
    const file = line.slice(3);

    if (idx !== " " && idx !== "?") {staged.push(file);}
    if (wt === "M" || wt === "D") {modified.push(file);}
    if (idx === "?") {untracked.push(file);}
  }

  // Ahead/behind tracking
  let ahead = 0;
  let behind = 0;
  const abRaw = safeGitExec(["rev-list", "--left-right", "--count", `HEAD...@{u}`], abs);
  if (abRaw) {
    const parts = abRaw.split("\t");
    ahead = parseInt(parts[0] ?? "0", 10) || 0;
    behind = parseInt(parts[1] ?? "0", 10) || 0;
  }

  recordOperation("status", abs, branch, true, 0);

  return {
    branch,
    clean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
    staged,
    modified,
    untracked,
    ahead,
    behind,
    commitHash,
    commitMessage,
  };
}

// ─── Clone Self ─────────────────────────────────────────────────

/**
 * Detect the root of the HoC repository and clone it to a target directory.
 * This is the key capability for self-replication.
 */
export function cloneSelf(
  targetDir: string,
  opts?: CloneOptions,
): { ok: boolean; dir?: string; sourceDir?: string; error?: string } {
  // Walk up from __dirname to find the .git root
  let current = resolve(import.meta.dirname ?? process.cwd());
  let hocRoot: string | null = null;

  for (let i = 0; i < 15; i++) {
    if (existsSync(join(current, ".git"))) {
      hocRoot = current;
      break;
    }
    const parent = join(current, "..");
    if (resolve(parent) === resolve(current)) {break;}
    current = parent;
  }

  if (!hocRoot) {
    return { ok: false, error: "Cannot find HoC repo root (.git directory)" };
  }

  // Check if there is an origin remote to clone from
  const remoteUrl = safeGitExec(["remote", "get-url", "origin"], hocRoot);

  if (remoteUrl) {
    // Clone from remote URL (preserves remote tracking)
    const result = cloneRepo(remoteUrl, targetDir, opts);
    return { ...result, sourceDir: hocRoot };
  } else {
    // No remote — fork from local files
    const result = forkRepo(hocRoot, targetDir, "Self-replication: cloned from local");
    return { ...result, sourceDir: hocRoot };
  }
}

// ─── File Operations (for code-intelligence integration) ────────

/**
 * Read a file from a repo (for analysis/patching).
 */
export function readRepoFile(repoDir: string, filePath: string): string | null {
  try {
    const abs = resolve(repoDir, filePath);
    return readFileSync(abs, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write a file in a repo (for applying patches).
 */
export function writeRepoFile(repoDir: string, filePath: string, content: string): boolean {
  try {
    const abs = resolve(repoDir, filePath);
    const dir = join(abs, "..");
    if (!existsSync(dir)) {mkdirSync(dir, { recursive: true });}
    writeFileSync(abs, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a patch/diff to a repo.
 */
export function applyPatch(
  repoDir: string,
  patchContent: string,
): { ok: boolean; error?: string } {
  const abs = resolve(repoDir);
  try {
    // Write patch to temp file
    const patchFile = join(abs, `.tmp-patch-${uid().slice(0, 6)}.patch`);
    writeFileSync(patchFile, patchContent, "utf-8");

    try {
      gitExec(["apply", "--check", patchFile], abs); // dry run
      gitExec(["apply", patchFile], abs); // actual apply
      return { ok: true };
    } finally {
      try { rmSync(patchFile); } catch { /* ignore cleanup failures */ }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: errMsg };
  }
}

// ─── Log ────────────────────────────────────────────────────────

export interface CommitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

/**
 * Get the commit log for a repo.
 */
export function getCommitLog(repoDir: string, count = 20): CommitLogEntry[] {
  const abs = resolve(repoDir);
  const raw = safeGitExec(
    ["log", `-${count}`, "--format=%H|%an|%ai|%s"],
    abs,
  );
  if (!raw) {return [];}

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...msgParts] = line.split("|");
      return {
        hash: (hash ?? "").slice(0, 7),
        author: author ?? "",
        date: date ?? "",
        message: msgParts.join("|"),
      };
    });
}

// ─── Remote Management ──────────────────────────────────────────

/**
 * Add a remote to a repository.
 */
export function addRemote(
  repoDir: string,
  name: string,
  url: string,
): { ok: boolean; error?: string } {
  try {
    gitExec(["remote", "add", name, url], resolve(repoDir));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * List remotes for a repository.
 */
export function listRemotes(repoDir: string): Array<{ name: string; url: string; type: string }> {
  const raw = safeGitExec(["remote", "-v"], resolve(repoDir));
  if (!raw) {return [];}

  const seen = new Map<string, { name: string; url: string; type: string }>();
  for (const line of raw.split("\n").filter(Boolean)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
    if (match) {
      const key = `${match[1]}-${match[3]}`;
      if (!seen.has(key)) {
        seen.set(key, { name: match[1]!, url: match[2]!, type: match[3]! });
      }
    }
  }
  return Array.from(seen.values());
}

// ─── Tags ───────────────────────────────────────────────────────

/**
 * Create a tag in the repository.
 */
export function createTag(
  repoDir: string,
  tagName: string,
  message?: string,
): { ok: boolean; error?: string } {
  try {
    const args = message
      ? ["tag", "-a", tagName, "-m", message]
      : ["tag", tagName];
    gitExec(args, resolve(repoDir));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * List all tags.
 */
export function listTags(repoDir: string): string[] {
  const raw = safeGitExec(["tag", "--list"], resolve(repoDir));
  return raw ? raw.split("\n").filter(Boolean) : [];
}

// ─── Diagnostics ────────────────────────────────────────────────

/**
 * Get comprehensive diagnostics about git operations.
 */
export function gitOperationsDiagnostics(): GitOperationsDiagnostics {
  const total = operationHistory.length;
  const successful = operationHistory.filter((o) => o.success).length;
  const successRate = total > 0 ? successful / total : 1;

  const byType: Record<string, number> = {};
  let totalDuration = 0;
  for (const op of operationHistory) {
    byType[op.type] = (byType[op.type] ?? 0) + 1;
    totalDuration += op.durationMs;
  }

  return {
    totalOperations: total,
    successRate: Math.round(successRate * 1000) / 1000,
    operationsByType: byType,
    recentOperations: operationHistory.slice(-20),
    avgDurationMs: total > 0 ? Math.round(totalDuration / total) : 0,
    managedRepos: managedRepos.size,
  };
}

/**
 * Reset all operation history and managed repos (for testing).
 */
export function resetGitOperations(): void {
  operationHistory.length = 0;
  managedRepos.clear();
}
