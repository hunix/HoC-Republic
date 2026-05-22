/**
 * Republic Platform — Workspace Manager
 *
 * Manages real project directories and artifact storage for
 * the autonomous workforce. Each project gets an isolated workspace
 * with its own directory structure, git repository, and artifact store.
 *
 * Projects are stored at: ~/.openclaw/republic-projects/<project-id>/
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ts, uid } from "./utils.js";

const execFileAsync = promisify(execFile);

// ─── Constants ──────────────────────────────────────────────────

const PROJECTS_DIR = path.join(os.homedir(), ".openclaw", "republic-projects");

// ─── Types ──────────────────────────────────────────────────────

export type WorkspaceStatus = "planning" | "active" | "review" | "delivered" | "archived";

export interface ProjectWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: WorkspaceStatus;
  rootDir: string;
  srcDir: string;
  outputDir: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  /** Citizen IDs assigned to this project */
  assignedCitizens: string[];
  /** Total files created */
  fileCount: number;
  /** Size of all artifacts in bytes */
  totalSizeBytes: number;
  /** Live preview URL (set after deploy_app starts a dev server) */
  previewUrl?: string;
  /** Port the preview server is running on */
  previewPort?: number;
  /** Framework used (vite-react, three.js, fastapi, etc.) */
  framework?: string;
  /** Creator citizen ID */
  creatorId?: string;
}

export interface WorkspaceFile {
  /** Relative path within the project src directory */
  relativePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** File content (text-based only) */
  content: string;
  /** Language/format */
  language: string;
  /** Which citizen created/last modified this file */
  authorCitizenId: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactEntry {
  id: string;
  projectId: string;
  type: "code" | "image" | "document" | "config" | "test" | "build" | "other";
  relativePath: string;
  description: string;
  citizenId: string;
  createdAt: string;
}

// ─── In-Memory Registry ─────────────────────────────────────────

const workspaces = new Map<string, ProjectWorkspace>();
const artifacts = new Map<string, ArtifactEntry[]>();

// ─── Workspace Lifecycle ────────────────────────────────────────

/**
 * Create a new project workspace with an isolated directory structure.
 */
export async function createWorkspace(params: {
  name: string;
  description: string;
  initGit?: boolean;
}): Promise<ProjectWorkspace> {
  const id = `prj-${uid()}`;
  const slug = params.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  const rootDir = path.join(PROJECTS_DIR, `${slug}-${id}`);
  const srcDir = path.join(rootDir, "src");
  const outputDir = path.join(rootDir, "output");

  // Create directory structure
  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(rootDir, "docs"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "tests"), { recursive: true });

  // Write project manifest
  const workspace: ProjectWorkspace = {
    id,
    name: params.name,
    slug,
    description: params.description,
    status: "planning",
    rootDir,
    srcDir,
    outputDir,
    createdAt: ts(),
    updatedAt: ts(),
    deliveredAt: null,
    assignedCitizens: [],
    fileCount: 0,
    totalSizeBytes: 0,
  };

  await fs.writeFile(
    path.join(rootDir, "project.json"),
    JSON.stringify(workspace, null, 2),
    "utf-8",
  );

  // Initialize git repo if requested
  if (params.initGit !== false) {
    try {
      await execFileAsync("git", ["init"], { cwd: rootDir });
      await fs.writeFile(
        path.join(rootDir, ".gitignore"),
        "node_modules/\ndist/\n.env\n*.log\n",
        "utf-8",
      );
    } catch {
      // Git init is non-critical — silently continue
    }
  }

  workspaces.set(id, workspace);
  artifacts.set(id, []);

  return workspace;
}

/**
 * Get a workspace by its project ID.
 */
export function getWorkspace(projectId: string): ProjectWorkspace | undefined {
  return workspaces.get(projectId);
}

/**
 * List all active workspaces.
 */
export function listWorkspaces(status?: WorkspaceStatus): ProjectWorkspace[] {
  const all = [...workspaces.values()];
  if (status) {
    return all.filter((w) => w.status === status);
  }
  return all;
}

/**
 * Update workspace status.
 */
export async function updateWorkspaceStatus(
  projectId: string,
  status: WorkspaceStatus,
): Promise<void> {
  const ws = workspaces.get(projectId);
  if (!ws) {
    return;
  }

  ws.status = status;
  ws.updatedAt = ts();
  if (status === "delivered") {
    ws.deliveredAt = ts();
  }

  // Persist to disk
  await fs.writeFile(path.join(ws.rootDir, "project.json"), JSON.stringify(ws, null, 2), "utf-8");
}

/**
 * Set the preview URL for a project (called after deploy starts a dev server).
 */
export async function setPreviewUrl(
  projectId: string,
  previewUrl: string,
  previewPort?: number,
): Promise<void> {
  const ws = workspaces.get(projectId);
  if (!ws) {
    return;
  }

  ws.previewUrl = previewUrl;
  if (previewPort !== undefined) {
    ws.previewPort = previewPort;
  }
  ws.updatedAt = ts();
  ws.status = "delivered";
  ws.deliveredAt = ts();

  await fs.writeFile(path.join(ws.rootDir, "project.json"), JSON.stringify(ws, null, 2), "utf-8");
}

/**
 * Assign citizens to a project workspace.
 */
export function assignCitizens(projectId: string, citizenIds: string[]): void {
  const ws = workspaces.get(projectId);
  if (!ws) {
    return;
  }
  for (const cid of citizenIds) {
    if (!ws.assignedCitizens.includes(cid)) {
      ws.assignedCitizens.push(cid);
    }
  }
}

// ─── File Operations ────────────────────────────────────────────

/**
 * Write a file to the project workspace.
 * Automatically creates intermediate directories.
 */
export async function writeWorkspaceFile(params: {
  projectId: string;
  relativePath: string;
  content: string;
  language: string;
  citizenId: string;
}): Promise<WorkspaceFile> {
  let ws = workspaces.get(params.projectId);
  if (!ws) {
    // Auto-create a workspace for tools that produce output without an explicit project
    ws = await createWorkspace({
      name: params.projectId,
      description: `Auto-created workspace for project "${params.projectId}"`,
      initGit: false,
    });
    // Re-register under the original projectId so future lookups succeed
    workspaces.set(params.projectId, ws);
  }

  const absolutePath = path.join(ws.srcDir, params.relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, params.content, "utf-8");

  const stats = await fs.stat(absolutePath);
  ws.fileCount++;
  ws.totalSizeBytes += stats.size;
  ws.updatedAt = ts();

  // Track as artifact
  const artList = artifacts.get(params.projectId) ?? [];
  artList.push({
    id: uid(),
    projectId: params.projectId,
    type: detectArtifactType(params.relativePath),
    relativePath: params.relativePath,
    description: `File created by citizen ${params.citizenId}`,
    citizenId: params.citizenId,
    createdAt: ts(),
  });
  artifacts.set(params.projectId, artList);

  return {
    relativePath: params.relativePath,
    absolutePath,
    content: params.content,
    language: params.language,
    authorCitizenId: params.citizenId,
    sizeBytes: stats.size,
    createdAt: ts(),
    updatedAt: ts(),
  };
}

/**
 * Read a file from the project workspace.
 */
export async function readWorkspaceFile(projectId: string, relativePath: string): Promise<string> {
  const ws = workspaces.get(projectId);
  if (!ws) {
    throw new Error(`Workspace not found: ${projectId}`);
  }

  const absolutePath = path.join(ws.srcDir, relativePath);
  return fs.readFile(absolutePath, "utf-8");
}

/**
 * List all files in a project workspace.
 */
export async function listWorkspaceFiles(projectId: string, subdir = ""): Promise<string[]> {
  const ws = workspaces.get(projectId);
  if (!ws) {
    return [];
  }

  const targetDir = path.join(ws.srcDir, subdir);
  try {
    const result: string[] = [];
    await walkDir(targetDir, ws.srcDir, result);
    return result;
  } catch {
    return [];
  }
}

async function walkDir(dir: string, baseDir: string, result: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      await walkDir(fullPath, baseDir, result);
    } else {
      result.push(path.relative(baseDir, fullPath));
    }
  }
}

/**
 * Delete a file from the project workspace.
 */
export async function deleteWorkspaceFile(projectId: string, relativePath: string): Promise<void> {
  const ws = workspaces.get(projectId);
  if (!ws) {
    return;
  }

  const absolutePath = path.join(ws.srcDir, relativePath);
  try {
    const stats = await fs.stat(absolutePath);
    await fs.unlink(absolutePath);
    ws.fileCount = Math.max(0, ws.fileCount - 1);
    ws.totalSizeBytes = Math.max(0, ws.totalSizeBytes - stats.size);
  } catch {
    // File may already be deleted
  }
}

// ─── Shell Execution ────────────────────────────────────────────

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Execute a shell command in the project workspace directory.
 * Used for running tests, build scripts, git operations, etc.
 */
export async function execInWorkspace(
  projectId: string,
  command: string,
  args: string[],
  opts?: { timeout?: number; cwd?: string },
): Promise<ShellResult> {
  const ws = workspaces.get(projectId);
  if (!ws) {
    throw new Error(`Workspace not found: ${projectId}`);
  }

  const cwd = opts?.cwd ? path.join(ws.rootDir, opts.cwd) : ws.rootDir;
  const timeout = opts?.timeout ?? 60_000;
  const start = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout,
      maxBuffer: 5 * 1024 * 1024, // 5MB
      env: { ...process.env, CI: "true" },
    });
    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: 0,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
      exitCode: e.code ?? 1,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Git Operations ─────────────────────────────────────────────

/**
 * Commit all changes in the project workspace.
 */
export async function gitCommit(
  projectId: string,
  message: string,
  citizenId: string,
): Promise<ShellResult> {
  const ws = workspaces.get(projectId);
  if (!ws) {
    throw new Error(`Workspace not found: ${projectId}`);
  }

  // Stage all changes
  await execInWorkspace(projectId, "git", ["add", "-A"]);

  // Commit with citizen attribution
  return execInWorkspace(projectId, "git", [
    "commit",
    "-m",
    message,
    "--author",
    `Citizen ${citizenId} <${citizenId}@republic.local>`,
    "--allow-empty",
  ]);
}

// ─── Artifact Helpers ───────────────────────────────────────────

function detectArtifactType(filePath: string): ArtifactEntry["type"] {
  const ext = path.extname(filePath).toLowerCase();
  if (
    [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".py",
      ".go",
      ".rs",
      ".java",
      ".cs",
      ".cpp",
      ".c",
      ".rb",
      ".php",
    ].includes(ext)
  ) {
    return "code";
  }
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"].includes(ext)) {
    return "image";
  }
  if ([".md", ".txt", ".doc", ".pdf", ".html"].includes(ext)) {
    return "document";
  }
  if ([".json", ".yaml", ".yml", ".toml", ".env", ".ini", ".xml"].includes(ext)) {
    return "config";
  }
  if (filePath.includes("test") || filePath.includes("spec")) {
    return "test";
  }
  return "other";
}

/**
 * Get artifacts for a project.
 */
export function getProjectArtifacts(projectId: string): ArtifactEntry[] {
  return artifacts.get(projectId) ?? [];
}

// ─── Cleanup ────────────────────────────────────────────────────

/**
 * Archive a completed project (compress + remove working files).
 */
export async function archiveWorkspace(projectId: string): Promise<void> {
  const ws = workspaces.get(projectId);
  if (!ws) {
    return;
  }

  ws.status = "archived";
  ws.updatedAt = ts();

  // Write final manifest
  await fs.writeFile(path.join(ws.rootDir, "project.json"), JSON.stringify(ws, null, 2), "utf-8");
}

// ─── State Export/Import ────────────────────────────────────────

export interface WorkspaceManagerState {
  workspaces: ProjectWorkspace[];
  artifacts: Record<string, ArtifactEntry[]>;
}

export function exportWorkspaceState(): WorkspaceManagerState {
  return {
    workspaces: [...workspaces.values()],
    artifacts: Object.fromEntries(artifacts.entries()),
  };
}

export function importWorkspaceState(state: WorkspaceManagerState): void {
  workspaces.clear();
  artifacts.clear();
  for (const ws of state.workspaces) {
    workspaces.set(ws.id, ws);
  }
  for (const [key, value] of Object.entries(state.artifacts)) {
    artifacts.set(key, value);
  }
}

/**
 * Load workspaces from disk by scanning the projects directory.
 */
export async function loadWorkspacesFromDisk(): Promise<number> {
  try {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    let loaded = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = path.join(PROJECTS_DIR, entry.name, "project.json");
      try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        const ws = JSON.parse(raw) as ProjectWorkspace;
        workspaces.set(ws.id, ws);
        loaded++;
      } catch {
        // Skip invalid project dirs
      }
    }
    return loaded;
  } catch {
    return 0;
  }
}
