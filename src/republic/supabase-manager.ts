/**
 * Supabase Manager — CLI Integration Layer
 *
 * Wraps the Supabase CLI in managed TypeScript functions so the
 * Republic gateway can start/stop local dev, run migrations,
 * manage Edge Functions, and inspect the database — all from
 * RPC handlers.
 *
 * Prerequisites:
 *   - `supabase` CLI installed and on PATH
 *   - Docker running (for `supabase start`)
 *   - Project initialized (`supabase/config.toml` exists)
 */

import { exec, spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("supabase-manager");

// ─── Types ──────────────────────────────────────────────────────

export interface SupabaseServiceStatus {
  /** Whether `supabase status` returned a running stack */
  running: boolean;
  /** Parsed service table (key → URL/port) */
  services: Record<string, string>;
  /** Full stdout for debugging */
  raw: string;
}

export interface SupabaseMigrationEntry {
  version: string;
  name: string;
  status: "applied" | "pending" | "not applied";
}

export interface SupabaseInspectResult {
  dbSize: string;
  tables: Array<{ name: string; size: string; rows: string }>;
  raw: string;
}

export interface SupabaseDiagnostics {
  cliAvailable: boolean;
  cliVersion: string | null;
  projectLinked: boolean;
  localRunning: boolean;
  migrationCount: number;
  functionsCount: number;
}

export interface CliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Resolve the HoC project root (where supabase/ lives). */
function projectRoot(): string {
  // Use the CWD of the gateway process — should be the HoC project root
  return process.cwd();
}

/** Run a CLI command and return structured result. */
function runCli(command: string, timeoutMs = 120_000): Promise<CliResult> {
  return new Promise((resolve) => {
    exec(command, { cwd: projectRoot(), timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
        code: err?.code ? Number(err.code) : (err ? 1 : 0),
      });
    });
  });
}

/** Run a long-running CLI command (start/stop) with extended timeout. */
function runCliLong(command: string, timeoutMs = 300_000): Promise<CliResult> {
  return runCli(command, timeoutMs);
}

/** Check if a command exists on PATH. */
async function commandExists(cmd: string): Promise<boolean> {
  const check = process.platform === "win32"
    ? `where ${cmd} 2>nul`
    : `which ${cmd} 2>/dev/null`;
  const result = await runCli(check, 5000);
  return result.ok && result.stdout.trim().length > 0;
}

// ─── CLI Version ────────────────────────────────────────────────

/** Get the Supabase CLI version string, or null if not installed. */
export async function getCliVersion(): Promise<string | null> {
  const result = await runCli("supabase --version", 10_000);
  if (!result.ok) {return null;}
  // Output is like "1.145.4" or "Supabase CLI 1.145.4"
  const match = result.stdout.trim().match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : result.stdout.trim();
}

// ─── Status ─────────────────────────────────────────────────────

/** Check if the local Supabase dev stack is running. */
export async function getStatus(): Promise<SupabaseServiceStatus & { warning?: string }> {
  const result = await runCli("supabase status", 15_000);

  if (!result.ok) {
    const combined = result.stderr + "\n" + result.stdout;
    // "not running" is an expected state, not an error
    const isNotRunning = combined.includes("not running") ||
                         combined.includes("is not running") ||
                         combined.includes("Stopped services");
    if (isNotRunning) {
      return { running: false, services: {}, raw: combined };
    }
    // CLI error — may include "Cannot find project ref" etc.
    const warning = combined.trim();
    logger.warn(`supabase status failed: ${warning}`);
    return { running: false, services: {}, raw: combined, warning };
  }

  // Parse the key-value table from `supabase status`
  const services: Record<string, string> = {};
  const lines = result.stdout.split("\n");
  let warning: string | undefined;
  for (const line of lines) {
    // Lines look like:  "         API URL: http://127.0.0.1:54321"
    const match = line.match(/^\s*(.+?):\s+(.+)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      if (key && val) {services[key] = val;}
    }
    // Capture warnings like "Cannot find project ref" from stdout
    if (line.includes("Cannot find") || line.includes("Try rerunning")) {
      warning = (warning ? warning + " " : "") + line.trim();
    }
  }

  // If CLI succeeded but has stopped services mentioned, mark as partially running
  const stderrHasStopped = result.stderr.includes("Stopped services");
  const hasServices = Object.keys(services).length > 0;

  return {
    running: hasServices && !stderrHasStopped,
    services,
    raw: result.stdout,
    warning: warning || (stderrHasStopped ? result.stderr.trim() : undefined),
  };
}

// ─── Start / Stop ───────────────────────────────────────────────

/** Start the local Supabase dev stack (Docker containers). */
export async function startLocal(): Promise<CliResult> {
  logger.info("Starting local Supabase dev stack...");
  const result = await runCliLong("supabase start");
  if (result.ok) {
    logger.info("Local Supabase started successfully");
  } else {
    logger.error(`Failed to start Supabase: ${result.stderr}`);
  }
  return result;
}

/** Stop the local Supabase dev stack. */
export async function stopLocal(): Promise<CliResult> {
  logger.info("Stopping local Supabase dev stack...");
  const result = await runCliLong("supabase stop");
  if (result.ok) {
    logger.info("Local Supabase stopped");
  } else {
    logger.error(`Failed to stop Supabase: ${result.stderr}`);
  }
  return result;
}

// ─── Database ───────────────────────────────────────────────────

/** Push local migrations to the linked remote project. */
export async function dbPush(): Promise<CliResult> {
  logger.info("Pushing migrations to remote...");
  return runCliLong("supabase db push");
}

/** Reset the local database and replay all migrations. */
export async function dbReset(): Promise<CliResult> {
  logger.info("Resetting local database...");
  return runCliLong("supabase db reset");
}

/** Generate a new migration file from schema diff. */
export async function dbDiff(name: string): Promise<CliResult> {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  logger.info(`Generating migration diff: ${safeName}`);
  return runCli(`supabase db diff -f ${safeName}`);
}

// ─── Migrations ─────────────────────────────────────────────────

/** List all migrations and their status. */
export async function migrationsList(): Promise<{
  ok: boolean;
  migrations: SupabaseMigrationEntry[];
  raw: string;
}> {
  const result = await runCli("supabase migration list");

  if (!result.ok) {
    return { ok: false, migrations: [], raw: result.stderr || result.stdout };
  }

  // Parse the migration table output
  const migrations: SupabaseMigrationEntry[] = [];
  const lines = result.stdout.split("\n");
  for (const line of lines) {
    // Look for lines with timestamps like: "20240101000000 │ republic_tables │ applied"
    // or similar table output
    const match = line.match(/(\d{14,})\s*[│|]\s*(.+?)\s*[│|]\s*(.+)/);
    if (match) {
      migrations.push({
        version: match[1].trim(),
        name: match[2].trim(),
        status: match[3].trim().toLowerCase().includes("applied") ? "applied" : "not applied",
      });
    }
  }

  // Fallback: if no table format, scan the migration directory
  if (migrations.length === 0) {
    try {
      const migDir = path.join(projectRoot(), "supabase", "migrations");
      const files = await readdir(migDir);
      for (const f of files.filter(f => f.endsWith(".sql"))) {
        const match = f.match(/^(\d+)_(.+)\.sql$/);
        if (match) {
          migrations.push({
            version: match[1],
            name: match[2],
            status: "pending", // Can't determine status without DB connection
          });
        }
      }
    } catch {
      // migration dir doesn't exist
    }
  }

  return { ok: true, migrations, raw: result.stdout };
}

/** Repair a migration's status in the remote history. */
export async function migrationsRepair(
  version: string,
  status: "applied" | "reverted",
): Promise<CliResult> {
  logger.info(`Repairing migration ${version} → ${status}`);
  return runCli(`supabase migration repair --status ${status} --version ${version}`);
}

// ─── Edge Functions ─────────────────────────────────────────────

/** List available Edge Functions (from supabase/functions/ directory). */
export async function functionsList(): Promise<{
  ok: boolean;
  functions: Array<{ name: string; entryPoint: string }>;
}> {
  try {
    const functionsDir = path.join(projectRoot(), "supabase", "functions");
    const entries = await readdir(functionsDir, { withFileTypes: true });
    const functions = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        entryPoint: `supabase/functions/${e.name}/index.ts`,
      }));
    return { ok: true, functions };
  } catch {
    return { ok: true, functions: [] };
  }
}

/** Deploy one or all Edge Functions to the linked project. */
export async function functionsDeploy(name?: string): Promise<CliResult> {
  const cmd = name
    ? `supabase functions deploy ${name}`
    : "supabase functions deploy";
  logger.info(`Deploying functions${name ? `: ${name}` : " (all)"}...`);
  return runCliLong(cmd);
}

/** Start local Edge Functions dev server. Returns immediately; server runs in background. */
export async function functionsServe(): Promise<CliResult> {
  logger.info("Starting Edge Functions dev server...");
  return new Promise((resolve) => {
    const child = spawn("supabase", ["functions", "serve"], {
      cwd: projectRoot(),
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Give it a moment to either fail or start
    setTimeout(() => {
      resolve({
        ok: true,
        stdout: `Edge Functions dev server started (PID ${child.pid})`,
        stderr: "",
        code: null,
      });
    }, 2000);

    child.on("error", (err) => {
      resolve({
        ok: false,
        stdout: "",
        stderr: String(err),
        code: 1,
      });
    });
  });
}

// ─── Inspect ────────────────────────────────────────────────────

/** Inspect the local/remote database for size and table stats. */
export async function inspect(): Promise<SupabaseInspectResult> {
  // Try `supabase inspect db table-sizes`
  const sizeResult = await runCli("supabase inspect db table-sizes", 15_000);

  const tables: Array<{ name: string; size: string; rows: string }> = [];

  if (sizeResult.ok) {
    const lines = sizeResult.stdout.split("\n");
    for (const line of lines) {
      // Parse table output rows
      const match = line.match(/^\s*(.+?)\s*[│|]\s*(.+?)\s*[│|]?\s*(.*)$/);
      if (match && !match[1].includes("schema") && !match[1].includes("─")) {
        tables.push({
          name: match[1].trim(),
          size: match[2].trim(),
          rows: match[3]?.trim() || "—",
        });
      }
    }
  }

  // Get overall DB size
  const dbSizeResult = await runCli("supabase inspect db database-size", 15_000);
  const dbSize = dbSizeResult.ok ? dbSizeResult.stdout.trim() : "unknown";

  return {
    dbSize,
    tables,
    raw: sizeResult.stdout + "\n" + dbSizeResult.stdout,
  };
}

// ─── Logs ───────────────────────────────────────────────────────

/** Get recent logs from a Supabase service. */
export async function getLogs(
  service: "api" | "db" | "auth" | "storage" | "realtime" | "edge-runtime" = "api",
): Promise<CliResult> {
  // `supabase logs` may not exist in all CLI versions; try Docker logs fallback
  const result = await runCli(`supabase logs --service ${service} 2>&1`, 15_000);
  if (result.ok) {return result;}

  // Fallback: try reading docker container logs
  const containerName = `supabase_${service.replace("-", "_")}_hoc`;
  return runCli(`docker logs --tail 100 ${containerName} 2>&1`, 15_000);
}

// ─── Link ───────────────────────────────────────────────────────

/** Link the local project to a remote Supabase project. */
export async function linkProject(projectRef: string): Promise<CliResult> {
  logger.info(`Linking to remote project: ${projectRef}`);
  return runCli(`supabase link --project-ref ${projectRef}`);
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get a combined diagnostics snapshot for dashboards. */
export async function getDiagnostics(): Promise<SupabaseDiagnostics> {
  const [cliAvailable, cliVersion, status, migrations, functions] = await Promise.all([
    commandExists("supabase"),
    getCliVersion(),
    getStatus(),
    migrationsList(),
    functionsList(),
  ]);

  // Check if project is linked by looking for .supabase directory
  let projectLinked = false;
  try {
    await stat(path.join(projectRoot(), ".supabase"));
    projectLinked = true;
  } catch {
    projectLinked = false;
  }

  return {
    cliAvailable,
    cliVersion,
    projectLinked,
    localRunning: status.running,
    migrationCount: migrations.migrations.length,
    functionsCount: functions.functions.length,
  };
}

// ─── Docker-Aware Supabase Container Discovery ─────────────────

export interface SupabaseDockerContainer {
  id: string;
  name: string;
  image: string;
  status: "running" | "exited" | "dead" | "paused" | "created" | "unknown";
  ports: string;
  createdAt: string;
  uptime: string;
  isOrphan: boolean;
  labels: Record<string, string>;
}

/** Patterns that identify a Docker container as Supabase-related */
const SUPABASE_IMAGE_PATTERNS = [
  "supabase/",
  "kong:",          // Supabase API gateway
  "postgrest/",     // Supabase REST
  "gotrue",         // Supabase Auth
  "realtime",       // Supabase Realtime
  "storage-api",    // Supabase Storage
  "inbucket",       // Supabase local email
  "supabase_",      // Supabase compose-generated names
];

/**
 * Scan Docker for ALL Supabase-related containers (regardless of how they were started).
 * Matches containers by image name patterns typical of a Supabase stack.
 */
export async function getDockerSupabaseContainers(): Promise<SupabaseDockerContainer[]> {
  // docker ps -a with detailed format
  const result = await runCli(
    'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}"',
    15_000,
  );
  if (!result.ok || !result.stdout.trim()) {
    return [];
  }

  const containers: SupabaseDockerContainer[] = [];
  const now = Date.now();

  for (const line of result.stdout.split("\n").filter((l) => l.trim())) {
    const parts = line.split("|");
    const id = parts[0]?.trim() ?? "";
    const name = parts[1]?.trim() ?? "";
    const image = parts[2]?.trim() ?? "";
    const statusStr = parts[3]?.trim() ?? "";
    const ports = parts[4]?.trim() ?? "";
    const createdAt = parts[5]?.trim() ?? "";

    // Check if this container is Supabase-related by image OR name
    const isSupabase =
      SUPABASE_IMAGE_PATTERNS.some((p) => image.includes(p)) ||
      name.toLowerCase().includes("supabase");

    if (!isSupabase) {
      continue;
    }

    // Determine status
    const sl = statusStr.toLowerCase();
    let status: SupabaseDockerContainer["status"] = "unknown";
    if (sl.includes("up")) {
      status = "running";
    } else if (sl.includes("exited")) {
      status = "exited";
    } else if (sl.includes("dead")) {
      status = "dead";
    } else if (sl.includes("created")) {
      status = "created";
    } else if (sl.includes("paused")) {
      status = "paused";
    }

    // Detect orphans: exited/dead containers or containers created >24h ago that aren't running
    let isOrphan = false;
    if (status === "exited" || status === "dead") {
      isOrphan = true;
    } else if (status === "created") {
      // Created but never started, older than 1 hour → orphan
      try {
        const createdTime = new Date(createdAt).getTime();
        if (now - createdTime > 3600_000) {
          isOrphan = true;
        }
      } catch {
        /* can't parse date */
      }
    }

    // Read labels
    const labels: Record<string, string> = {};
    const labelsOut = await runCli(
      `docker inspect --format "{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}\\n{{end}}" ${id}`,
      5_000,
    );
    if (labelsOut.ok && labelsOut.stdout) {
      for (const lline of labelsOut.stdout.split("\n").filter(Boolean)) {
        const eq = lline.indexOf("=");
        if (eq > 0) {
          labels[lline.slice(0, eq).trim()] = lline.slice(eq + 1).trim();
        }
      }
    }

    containers.push({
      id,
      name,
      image,
      status,
      ports,
      createdAt,
      uptime: statusStr,
      isOrphan,
      labels,
    });
  }

  return containers;
}

/**
 * Enhanced status — merges CLI status with Docker container discovery.
 * If CLI says "stopped" but Docker has running Supabase containers,
 * reports "docker-only" mode with the container list.
 */
export async function getEnhancedStatus(): Promise<
  SupabaseServiceStatus & {
    warning?: string;
    dockerContainers: SupabaseDockerContainer[];
    mode: "cli" | "docker-only" | "both" | "none";
    cloudConnected: boolean;
  }
> {
  const [cliStatus, dockerContainers, cloudStatus] = await Promise.all([
    getStatus().catch(() => ({ running: false, services: {}, raw: "", warning: "CLI unavailable" })),
    getDockerSupabaseContainers().catch(() => []),
    getCloudConnectorStatus().catch(() => ({ connected: false })),
  ]);

  const hasRunningDocker = dockerContainers.some((c) => c.status === "running");
  const { running: cliRunning } = cliStatus;

  let mode: "cli" | "docker-only" | "both" | "none";
  if (cliRunning && hasRunningDocker) {
    mode = "both";
  } else if (cliRunning) {
    mode = "cli";
  } else if (hasRunningDocker) {
    mode = "docker-only";
  } else {
    mode = "none";
  }

  return {
    ...cliStatus,
    running: cliRunning || hasRunningDocker,
    dockerContainers,
    mode,
    cloudConnected: cloudStatus.connected,
  };
}

/**
 * Remove orphaned/stale Supabase containers.
 * - Exited or dead containers are removed
 * - Running containers with healthy services are kept
 * Returns summary of what was removed and kept.
 */
export async function cleanupOrphanContainers(): Promise<{
  removed: string[];
  kept: string[];
  errors: string[];
}> {
  const containers = await getDockerSupabaseContainers();
  const removed: string[] = [];
  const kept: string[] = [];
  const errors: string[] = [];

  for (const c of containers) {
    if (c.isOrphan) {
      logger.info(`Removing orphaned Supabase container: ${c.name} (${c.id}) — status: ${c.status}`);
      const result = await runCli(`docker rm -f ${c.id}`, 15_000);
      if (result.ok) {
        removed.push(`${c.name} (${c.image})`);
      } else {
        errors.push(`Failed to remove ${c.name}: ${result.stderr.slice(0, 100)}`);
      }
    } else {
      kept.push(`${c.name} (${c.image}) — ${c.status}`);
    }
  }

  if (removed.length > 0) {
    logger.info(`Supabase cleanup: removed ${removed.length}, kept ${kept.length}`);
  }

  return { removed, kept, errors };
}

// ─── Cloud Connector Status ─────────────────────────────────────

/**
 * Get the cloud Supabase connector status (whether SUPABASE_URL/KEY are set
 * and the connector is connected).
 */
export async function getCloudConnectorStatus(): Promise<{
  connected: boolean;
  url?: string;
  configured: boolean;
  instanceId?: string;
  error?: string;
}> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const configured = !!(url && key);

  if (!configured) {
    return {
      connected: false,
      configured: false,
      error: "SUPABASE_URL and SUPABASE_SERVICE_KEY not set in .env",
    };
  }

  try {
    const { getConnectorStatus } = await import("../supabase/index.js");
    const status = getConnectorStatus();
    return {
      connected: status.connected,
      url,
      configured: true,
      instanceId: status.instanceId ?? undefined,
    };
  } catch {
    return {
      connected: false,
      url,
      configured: true,
      error: "Cloud connector module not loaded",
    };
  }
}

