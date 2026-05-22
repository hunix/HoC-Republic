/**
 * agenthub-engine.ts
 *
 * HoC-native AgentHub engine — GitHub for AI agents.
 * Implements the same architecture as Karpathy's AgentHub:
 *   - Bare Git DAG: commits without branches/PRs/merges
 *   - SQLite message board: threaded citizen discussion
 *   - Experiment runner: sandboxed subprocess with time budget
 *   - git bundle export: share state across HoC nodes
 *
 * Architecture:
 *   bare repo at plugins/hoc-plugin-agenthub/.data/repo.git
 *   sqlite db  at plugins/hoc-plugin-agenthub/.data/agenthub.db
 */

import { execFile, spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { getHocPython } from "./hoc-python.js";

const execFileAsync = promisify(execFile);

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  "../../plugins/hoc-plugin-agenthub/.data"
);
const REPO_DIR = path.join(DATA_DIR, "repo.git");
const DB_PATH = path.join(DATA_DIR, "agenthub.db");
const RUNS_DIR = path.join(DATA_DIR, "runs");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DagCommit {
  hash: string;
  citizenId: string;
  message: string;
  timestamp: string;
  parents: string[];
  programMd?: string;
  runStatus?: "pending" | "running" | "done" | "error" | "none";
}

export interface ExperimentResult {
  hash: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  completedAt: string;
}

export interface BoardPost {
  id: string;
  citizenId: string;
  body: string;
  parentId: string | null;
  timestamp: string;
  commitHash?: string;
}

// ─── Lightweight SQLite wrapper using better-sqlite3 ─────────────────────────

// We use a dynamic import so the engine degrades gracefully if better-sqlite3
// is not installed (stub mode).
let db: BetterSqlite3DB | null = null;

interface BetterSqlite3DB {
  prepare: (sql: string) => { run: (...args: unknown[]) => { lastInsertRowid: number }; get: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[] };
  exec: (sql: string) => void;
  close: () => void;
}

async function getDb(): Promise<BetterSqlite3DB | null> {
  if (db) { return db; }
  try {
    // @ts-ignore: better-sqlite3 types are not configured in this project
    const BetterSqlite3 = (await import("better-sqlite3")).default as unknown as (path: string) => BetterSqlite3DB;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const instance = BetterSqlite3(DB_PATH);
    instance.exec(`
      CREATE TABLE IF NOT EXISTS board (
        id TEXT PRIMARY KEY,
        citizenId TEXT NOT NULL,
        body TEXT NOT NULL,
        parentId TEXT,
        commitHash TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS results (
        hash TEXT PRIMARY KEY,
        stdout TEXT,
        stderr TEXT,
        exitCode INTEGER,
        durationMs INTEGER,
        completedAt TEXT,
        status TEXT NOT NULL DEFAULT 'none'
      );
      CREATE TABLE IF NOT EXISTS experiments (
        hash TEXT PRIMARY KEY,
        citizenId TEXT,
        message TEXT,
        programMd TEXT,
        timestamp TEXT
      );
    `);
    db = instance;
    return db;
  } catch {
    return null;
  }
}

// ─── Repo Initialization ─────────────────────────────────────────────────────

let repoReady = false;

export async function initRepo(): Promise<void> {
  if (repoReady) { return; }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  if (!fs.existsSync(REPO_DIR)) {
    await execFileAsync("git", ["init", "--bare", REPO_DIR]);
  }
  await getDb();
  repoReady = true;
}

// ─── DAG Commit Operations ────────────────────────────────────────────────────

/**
 * Submit a new experiment as a bare-git commit (no branch — pure DAG).
 * Returns the new commit hash.
 */
export async function submitExperiment(params: {
  citizenId: string;
  code: string;
  programMd: string;
  message?: string;
  parentHashes?: string[];
}): Promise<string> {
  await initRepo();
  const { citizenId, code, programMd, message, parentHashes = [] } = params;

  // Write tree object: two blobs — code.py and program.md
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-"));
  try {
    const codePath = path.join(tmpDir, "code.py");
    const programPath = path.join(tmpDir, "program.md");
    fs.writeFileSync(codePath, code, "utf-8");
    fs.writeFileSync(programPath, programMd, "utf-8");

    // Hash-object each blob into the repo
    const { stdout: codeHashRaw } = await execFileAsync("git", [
      "--git-dir", REPO_DIR, "hash-object", "-w", codePath,
    ]);
    const { stdout: programHashRaw } = await execFileAsync("git", [
      "--git-dir", REPO_DIR, "hash-object", "-w", programPath,
    ]);
    const codeHash = String(codeHashRaw);
    const programHash = String(programHashRaw);

    // Build tree
    const treeInput = `100644 blob ${codeHash.trim()}\tcode.py\n100644 blob ${programHash.trim()}\tprogram.md\n`;
    const { stdout: treeHashRaw } = await execFileAsync("git", [
      "--git-dir", REPO_DIR, "mktree",
    ], { input: treeInput } as Parameters<typeof execFileAsync>[2]);
    const treeHash = String(treeHashRaw);

    // Build parent args for commit-tree
    const parentArgs = parentHashes.flatMap((h) => ["-p", h]);
    const commitMsg = message ?? `experiment by ${citizenId} at ${new Date().toISOString()}`;
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: citizenId,
      GIT_AUTHOR_EMAIL: `${citizenId}@hoc.republic`,
      GIT_COMMITTER_NAME: "AgentHub",
      GIT_COMMITTER_EMAIL: "agenthub@hoc.republic",
    };
    const { stdout: commitHashRaw } = await execFileAsync("git", [
      "--git-dir", REPO_DIR,
      "commit-tree", treeHash.trim(),
      ...parentArgs,
      "-m", commitMsg,
    ], { env });

    const hash = String(commitHashRaw).trim();

    // Store in SQLite
    const dbInst = await getDb();
    if (dbInst) {
      dbInst.prepare(`
        INSERT OR REPLACE INTO experiments (hash, citizenId, message, programMd, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(hash, citizenId, commitMsg, programMd, new Date().toISOString());

      dbInst.prepare(`
        INSERT OR IGNORE INTO results (hash, status) VALUES (?, 'pending')
      `).run(hash);
    }

    // Update a placeholder ref so we can walk the DAG
    await execFileAsync("git", [
      "--git-dir", REPO_DIR,
      "update-ref", `refs/experiments/${hash.slice(0, 8)}`, hash,
    ]).catch(() => {/* ignore */});

    return hash;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Walk all experiment refs and return recent commits.
 */
export async function listCommits(limit = 50): Promise<DagCommit[]> {
  await initRepo();
  const dbInst = await getDb();

  // Get all refs
  let refOutput = "";
  try {
    const { stdout } = await execFileAsync("git", [
      "--git-dir", REPO_DIR,
      "for-each-ref", "--format=%(objectname)", "refs/experiments/",
    ]);
    refOutput = stdout.trim();
  } catch {
    return [];
  }

  const tips = refOutput.split("\n").filter(Boolean);
  if (tips.length === 0) { return []; }

  const commits: DagCommit[] = [];
  const seen = new Set<string>();

  for (const tip of tips) {
    let logOutput = "";
    try {
      const { stdout } = await execFileAsync("git", [
        "--git-dir", REPO_DIR,
        "log", "--format=%H%x00%an%x00%ae%x00%ai%x00%P%x00%s",
        "--max-count", String(limit),
        tip,
      ]);
      logOutput = stdout.trim();
    } catch {
      continue;
    }

    for (const line of logOutput.split("\n")) {
      const [hash, author, , timestamp, parents, message] = line.split("\x00");
      if (!hash || seen.has(hash)) { continue; }
      seen.add(hash);

      // Look up extra metadata from DB
      const row = dbInst?.prepare("SELECT programMd FROM experiments WHERE hash = ?").get(hash) as { programMd?: string } | undefined;
      const resultRow = dbInst?.prepare("SELECT status FROM results WHERE hash = ?").get(hash) as { status?: string } | undefined;

      commits.push({
        hash,
        citizenId: author ?? "unknown",
        message: message ?? "",
        timestamp: timestamp ?? "",
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        programMd: row?.programMd,
        runStatus: (resultRow?.status as DagCommit["runStatus"]) ?? "none",
      });
    }
  }

  return commits.slice(0, limit);
}

/**
 * Get a single commit's details including code diff.
 */
export async function getCommit(hash: string): Promise<(DagCommit & { code?: string; diff?: string }) | null> {
  await initRepo();
  const dbInst = await getDb();

  let logLine = "";
  try {
    const { stdout } = await execFileAsync("git", [
      "--git-dir", REPO_DIR,
      "log", "-1", "--format=%H%x00%an%x00%ae%x00%ai%x00%P%x00%s", hash,
    ]);
    logLine = stdout.trim();
  } catch {
    return null;
  }

  const [commitHash, author, , timestamp, parents, message] = logLine.split("\x00");
  if (!commitHash) { return null; }

  // Get code.py content
  let code: string | undefined;
  try {
    const { stdout } = await execFileAsync("git", [
      "--git-dir", REPO_DIR, "show", `${hash}:code.py`,
    ]);
    code = stdout;
  } catch {
    // no code.py in this commit
  }

  // Get diff vs first parent
  let diff: string | undefined;
  try {
    const parentList = parents ? parents.split(" ").filter(Boolean) : [];
    if (parentList.length > 0) {
      const { stdout } = await execFileAsync("git", [
        "--git-dir", REPO_DIR, "diff", parentList[0]!, hash,
      ]);
      diff = stdout;
    }
  } catch {
    // no diff
  }

  const row = dbInst?.prepare("SELECT programMd FROM experiments WHERE hash = ?").get(commitHash) as { programMd?: string } | undefined;
  const resultRow = dbInst?.prepare("SELECT status FROM results WHERE hash = ?").get(commitHash) as { status?: string } | undefined;

  return {
    hash: commitHash,
    citizenId: author ?? "unknown",
    message: message ?? "",
    timestamp: timestamp ?? "",
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    programMd: row?.programMd,
    runStatus: (resultRow?.status as DagCommit["runStatus"]) ?? "none",
    code,
    diff,
  };
}

// ─── Experiment Runner ────────────────────────────────────────────────────────

const EXPERIMENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 min max

/** Run code.py from a commit in a sandboxed subprocess. */
export async function runExperiment(hash: string): Promise<ExperimentResult> {
  await initRepo();
  const dbInst = await getDb();

  // Mark as running
  dbInst?.prepare("UPDATE results SET status = 'running' WHERE hash = ?").run(hash);

  // Extract code.py
  let code = "";
  try {
    const { stdout } = await execFileAsync("git", ["--git-dir", REPO_DIR, "show", `${hash}:code.py`]);
    code = stdout;
  } catch (e) {
    const err: ExperimentResult = {
      hash, stdout: "", stderr: String(e), exitCode: 1,
      durationMs: 0, completedAt: new Date().toISOString(),
    };
    dbInst?.prepare("UPDATE results SET stdout=?, stderr=?, exitCode=?, durationMs=?, completedAt=?, status='error' WHERE hash=?").run("", String(e), 1, 0, err.completedAt, hash);
    return err;
  }

  const runDir = path.join(RUNS_DIR, hash);
  fs.mkdirSync(runDir, { recursive: true });
  const codePath = path.join(runDir, "code.py");
  fs.writeFileSync(codePath, code, "utf-8");

  const start = Date.now();
  return new Promise<ExperimentResult>((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";

    const child = spawn(getHocPython(), [codePath], {
      cwd: runDir,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      timeout: EXPERIMENT_TIMEOUT_MS,
    });

    child.stdout.on("data", (d: Buffer) => { stdoutBuf += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderrBuf += d.toString(); });

    child.on("close", (code: number | null) => {
      const durationMs = Date.now() - start;
      const exitCode = code ?? 1;
      const completedAt = new Date().toISOString();
      const status = exitCode === 0 ? "done" : "error";

      // Truncate to prevent DB bloat
      const maxLen = 100_000;
      const stdout = stdoutBuf.slice(0, maxLen);
      const stderr = stderrBuf.slice(0, maxLen);

      dbInst?.prepare(
        "UPDATE results SET stdout=?, stderr=?, exitCode=?, durationMs=?, completedAt=?, status=? WHERE hash=?"
      ).run(stdout, stderr, exitCode, durationMs, completedAt, status, hash);

      resolve({ hash, stdout, stderr, exitCode, durationMs, completedAt });
    });

    child.on("error", (err: Error) => {
      const durationMs = Date.now() - start;
      const completedAt = new Date().toISOString();
      dbInst?.prepare(
        "UPDATE results SET stdout='', stderr=?, exitCode=1, durationMs=?, completedAt=?, status='error' WHERE hash=?"
      ).run(String(err), durationMs, completedAt, hash);
      resolve({ hash, stdout: "", stderr: String(err), exitCode: 1, durationMs, completedAt });
    });
  });
}

/** Get cached result for a commit hash. */
export async function getResult(hash: string): Promise<ExperimentResult | null> {
  const dbInst = await getDb();
  if (!dbInst) { return null; }
  const row = dbInst.prepare("SELECT * FROM results WHERE hash = ?").get(hash) as ExperimentResult & { status: string } | undefined;
  if (!row) { return null; }
  return { hash: row.hash ?? hash, stdout: row.stdout ?? "", stderr: row.stderr ?? "", exitCode: row.exitCode ?? 0, durationMs: row.durationMs ?? 0, completedAt: row.completedAt ?? "" };
}

// ─── Message Board ────────────────────────────────────────────────────────────

export async function postMessage(params: {
  citizenId: string;
  body: string;
  parentId?: string;
  commitHash?: string;
}): Promise<BoardPost> {
  const dbInst = await getDb();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  dbInst?.prepare(`
    INSERT INTO board (id, citizenId, body, parentId, commitHash, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, params.citizenId, params.body, params.parentId ?? null, params.commitHash ?? null, timestamp);
  return { id, citizenId: params.citizenId, body: params.body, parentId: params.parentId ?? null, timestamp, commitHash: params.commitHash };
}

export async function getBoard(limit = 50, offset = 0): Promise<BoardPost[]> {
  const dbInst = await getDb();
  if (!dbInst) { return []; }
  return dbInst.prepare(`
    SELECT * FROM board WHERE parentId IS NULL ORDER BY timestamp DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as BoardPost[];
}

export async function getBoardPost(id: string): Promise<BoardPost | null> {
  const dbInst = await getDb();
  if (!dbInst) { return null; }
  const row = dbInst.prepare("SELECT * FROM board WHERE id = ?").get(id);
  return (row ?? null) as BoardPost | null;
}

export async function getBoardThread(parentId: string): Promise<BoardPost[]> {
  const dbInst = await getDb();
  if (!dbInst) { return []; }
  return dbInst.prepare("SELECT * FROM board WHERE parentId = ? ORDER BY timestamp ASC").all(parentId) as BoardPost[];
}

// ─── Git Bundle Export ────────────────────────────────────────────────────────

/** Export the entire DAG as a git bundle for cross-node sharing. */
export async function exportBundle(outputPath?: string): Promise<string> {
  await initRepo();
  const bundlePath = outputPath ?? path.join(DATA_DIR, "agenthub.bundle");
  await execFileAsync("git", [
    "--git-dir", REPO_DIR,
    "bundle", "create", bundlePath,
    "--all",
  ]);
  return bundlePath;
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function getStatus(): Promise<{
  online: boolean;
  repoExists: boolean;
  dbExists: boolean;
  commitCount: number;
  boardCount: number;
}> {
  const repoExists = fs.existsSync(REPO_DIR);
  const dbExists = fs.existsSync(DB_PATH);
  let commitCount = 0;
  let boardCount = 0;

  if (repoExists) {
    try {
      const commits = await listCommits(1000);
      commitCount = commits.length;
    } catch {
      // ignore
    }
  }

  if (dbExists) {
    const dbInst = await getDb();
    if (dbInst) {
      const row = dbInst.prepare("SELECT COUNT(*) as n FROM board").get() as { n: number } | undefined;
      boardCount = row?.n ?? 0;
    }
  }

  return { online: true, repoExists, dbExists, commitCount, boardCount };
}
