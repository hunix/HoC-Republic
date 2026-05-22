/**
 * Republic DevStudio — Real Deployment Engine
 *
 * Wraps Vercel, Railway, Netlify, Fly.io, GitHub Pages CLIs
 * via child_process.spawn with live output streaming.
 *
 * Citizens invoke these to deploy their projects to production platforms.
 * Gracefully skips platforms whose CLIs are not installed.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { checkRuntime } from "./devstudio-runtime.js";

const log = createSubsystemLogger("devstudio-deploy");

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeployPlatform = "vercel" | "railway" | "netlify" | "fly" | "cloudflare" | "github-pages";
export type DeployStatus = "queued" | "building" | "deploying" | "live" | "failed" | "skipped";

export interface DeploymentRecord {
  id: string;
  platform: DeployPlatform;
  projectName: string;
  projectDir: string;
  status: DeployStatus;
  url: string | null;
  error: string | null;
  logs: string[];
  startedAt: string;
  completedAt: string | null;
  environment: "preview" | "production";
}

export interface DeployOptions {
  environment?: "preview" | "production";
  token?: string;          // override default CLI auth
  envVars?: Record<string, string>;
  buildCommand?: string;
  outputDir?: string;      // e.g. "dist", "build", ".next"
  onLog?: (line: string) => void;
}

// ─── State ────────────────────────────────────────────────────────────────────

const deployments: Map<string, DeploymentRecord> = new Map();
let counter = 0;

function makeId(): string {
  return `deploy-${Date.now()}-${++counter}`;
}

function ts(): string {
  return new Date().toISOString();
}

// ─── CLI Invoker ──────────────────────────────────────────────────────────────

/**
 * Spawns a CLI command and collects output.
 * Returns { success, output, error }.
 */
async function runCli(
  cmd: string,
  args: string[],
  cwd: string,
  onLog?: (line: string) => void,
): Promise<{ success: boolean; output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      env: { ...process.env },
    });

    const lines: string[] = [];

    const handleData = (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split("\n")) {
        if (line.trim()) {
          lines.push(line);
          onLog?.(line);
        }
      }
    };

    proc.stdout.on("data", handleData);
    proc.stderr.on("data", handleData);

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        output: lines.join("\n"),
        exitCode: code ?? -1,
      });
    });

    proc.on("error", (err) => {
      resolve({ success: false, output: err.message, exitCode: -1 });
    });
  });
}

/** Extract deployed URL from CLI output */
function extractUrl(output: string, platform: DeployPlatform): string | null {
  const patterns: Record<DeployPlatform, RegExp> = {
    vercel: /(?:https?:\/\/\S+\.vercel\.app)/,
    railway: /(?:https?:\/\/\S+\.railway\.app)/,
    netlify: /(?:https?:\/\/\S+\.netlify\.app)/,
    fly: /(?:https?:\/\/\S+\.fly\.dev)/,
    cloudflare: /(?:https?:\/\/\S+\.(?:pages|workers)\.dev)/,
    "github-pages": /(?:https?:\/\/\S+\.github\.io\/\S*)/,
  };
  return output.match(patterns[platform])?.[0] ?? null;
}

// ─── Platform Deployers ───────────────────────────────────────────────────────

export async function deployToVercel(
  projectDir: string,
  projectName: string,
  opts: DeployOptions = {},
): Promise<DeploymentRecord> {
  const id = makeId();
  const rec: DeploymentRecord = {
    id, platform: "vercel", projectName, projectDir,
    status: "queued", url: null, error: null, logs: [],
    startedAt: ts(), completedAt: null,
    environment: opts.environment ?? "production",
  };
  deployments.set(id, rec);

  const runtime = checkRuntime();
  const vercelTool = runtime.tools.find((t) => t.name === "vercel");
  if (vercelTool?.status !== "present") {
    rec.status = "skipped";
    rec.error = "Vercel CLI not installed. Run: npm install -g vercel";
    rec.completedAt = ts();
    deployments.set(id, rec);
    log.info(`Deploy skipped (Vercel CLI missing) for ${projectName}`);
    return rec;
  }

  rec.status = "building";
  const args = ["--yes"];
  if (opts.environment !== "preview") { args.push("--prod"); }
  if (opts.token) { args.push("--token", opts.token); }
  if (projectName) { args.push("--name", projectName); }

  const logAppend = (line: string) => { rec.logs.push(line); opts.onLog?.(line); };
  log.info(`Deploying ${projectName} to Vercel...`);
  rec.status = "deploying";

  const result = await runCli("vercel", args, projectDir, logAppend);
  rec.status = result.success ? "live" : "failed";
  rec.url = result.success ? extractUrl(result.output, "vercel") : null;
  rec.error = result.success ? null : result.output.slice(-500);
  rec.completedAt = ts();
  deployments.set(id, rec);
  log.info(`Vercel deploy ${rec.status}: ${rec.url ?? "no URL"}`);
  return rec;
}

export async function deployToRailway(
  projectDir: string,
  projectName: string,
  opts: DeployOptions = {},
): Promise<DeploymentRecord> {
  const id = makeId();
  const rec: DeploymentRecord = {
    id, platform: "railway", projectName, projectDir,
    status: "queued", url: null, error: null, logs: [],
    startedAt: ts(), completedAt: null,
    environment: opts.environment ?? "production",
  };
  deployments.set(id, rec);

  const runtime = checkRuntime();
  if (runtime.tools.find((t) => t.name === "railway")?.status !== "present") {
    rec.status = "skipped";
    rec.error = "Railway CLI not installed. Run: npm install -g @railway/cli";
    rec.completedAt = ts();
    deployments.set(id, rec);
    return rec;
  }

  const logAppend = (line: string) => { rec.logs.push(line); opts.onLog?.(line); };
  rec.status = "deploying";
  const result = await runCli("railway", ["up", "--detach"], projectDir, logAppend);
  rec.status = result.success ? "live" : "failed";
  rec.url = result.success ? extractUrl(result.output, "railway") : null;
  rec.error = result.success ? null : result.output.slice(-500);
  rec.completedAt = ts();
  deployments.set(id, rec);
  return rec;
}

export async function deployToNetlify(
  projectDir: string,
  projectName: string,
  opts: DeployOptions = {},
): Promise<DeploymentRecord> {
  const id = makeId();
  const rec: DeploymentRecord = {
    id, platform: "netlify", projectName, projectDir,
    status: "queued", url: null, error: null, logs: [],
    startedAt: ts(), completedAt: null,
    environment: opts.environment ?? "production",
  };
  deployments.set(id, rec);

  const runtime = checkRuntime();
  if (runtime.tools.find((t) => t.name === "netlify")?.status !== "present") {
    rec.status = "skipped";
    rec.error = "Netlify CLI not installed. Run: npm install -g netlify-cli";
    rec.completedAt = ts();
    deployments.set(id, rec);
    return rec;
  }

  // Detect output dir
  const outputDir = opts.outputDir ??
    (existsSync(join(projectDir, "dist")) ? "dist" :
    existsSync(join(projectDir, "build")) ? "build" :
    existsSync(join(projectDir, ".next")) ? ".next" : "dist");

  const logAppend = (line: string) => { rec.logs.push(line); opts.onLog?.(line); };
  rec.status = "deploying";
  const args = ["deploy", "--dir", outputDir, "--message", `Deploy ${projectName}`];
  if (opts.environment === "production") { args.push("--prod"); }
  if (opts.token) { process.env["NETLIFY_AUTH_TOKEN"] = opts.token; }

  const result = await runCli("netlify", args, projectDir, logAppend);
  rec.status = result.success ? "live" : "failed";
  rec.url = result.success ? extractUrl(result.output, "netlify") : null;
  rec.error = result.success ? null : result.output.slice(-500);
  rec.completedAt = ts();
  deployments.set(id, rec);
  return rec;
}

export async function deployToFly(
  projectDir: string,
  projectName: string,
  opts: DeployOptions = {},
): Promise<DeploymentRecord> {
  const id = makeId();
  const rec: DeploymentRecord = {
    id, platform: "fly", projectName, projectDir,
    status: "queued", url: null, error: null, logs: [],
    startedAt: ts(), completedAt: null,
    environment: opts.environment ?? "production",
  };
  deployments.set(id, rec);

  const runtime = checkRuntime();
  if (runtime.tools.find((t) => t.name === "fly")?.status !== "present") {
    rec.status = "skipped";
    rec.error = "Fly.io CLI (flyctl) not installed. Run: iwr https://fly.io/install.ps1 -useb | iex";
    rec.completedAt = ts();
    deployments.set(id, rec);
    return rec;
  }

  const logAppend = (line: string) => { rec.logs.push(line); opts.onLog?.(line); };
  rec.status = "deploying";
  const result = await runCli("fly", ["deploy", "--remote-only", "--app", projectName.toLowerCase().replace(/\s+/g, "-")], projectDir, logAppend);
  rec.status = result.success ? "live" : "failed";
  rec.url = result.success ? extractUrl(result.output, "fly") ?? `https://${projectName.toLowerCase().replace(/\s+/g, "-")}.fly.dev` : null;
  rec.error = result.success ? null : result.output.slice(-500);
  rec.completedAt = ts();
  deployments.set(id, rec);
  return rec;
}

export async function deployToCloudflare(
  projectDir: string,
  projectName: string,
  opts: DeployOptions = {},
): Promise<DeploymentRecord> {
  const id = makeId();
  const rec: DeploymentRecord = {
    id, platform: "cloudflare", projectName, projectDir,
    status: "queued", url: null, error: null, logs: [],
    startedAt: ts(), completedAt: null,
    environment: opts.environment ?? "production",
  };
  deployments.set(id, rec);

  const runtime = checkRuntime();
  if (runtime.tools.find((t) => t.name === "wrangler")?.status !== "present") {
    rec.status = "skipped";
    rec.error = "Wrangler CLI not installed. Run: npm install -g wrangler";
    rec.completedAt = ts();
    deployments.set(id, rec);
    return rec;
  }

  const outputDir = opts.outputDir ?? "dist";
  const logAppend = (line: string) => { rec.logs.push(line); opts.onLog?.(line); };
  rec.status = "deploying";
  const result = await runCli(
    "wrangler",
    ["pages", "deploy", outputDir, "--project-name", projectName.toLowerCase().replace(/\s+/g, "-")],
    projectDir, logAppend
  );
  rec.status = result.success ? "live" : "failed";
  rec.url = result.success ? extractUrl(result.output, "cloudflare") : null;
  rec.error = result.success ? null : result.output.slice(-500);
  rec.completedAt = ts();
  deployments.set(id, rec);
  return rec;
}

// ─── Smart Auto-Deploy ────────────────────────────────────────────────────────

/**
 * Try platforms in order, use first available CLI.
 * Order: Vercel → Netlify → Cloudflare → Railway → Fly.io
 */
export async function deployAuto(
  projectDir: string,
  projectName: string,
  opts: DeployOptions = {},
): Promise<DeploymentRecord> {
  const runtime = checkRuntime();
  const available = new Set(
    runtime.tools.filter((t) => t.category === "deployment" && t.status === "present").map((t) => t.name)
  );

  if (available.has("vercel")) { return deployToVercel(projectDir, projectName, opts); }
  if (available.has("netlify")) { return deployToNetlify(projectDir, projectName, opts); }
  if (available.has("wrangler")) { return deployToCloudflare(projectDir, projectName, opts); }
  if (available.has("railway")) { return deployToRailway(projectDir, projectName, opts); }
  if (available.has("fly")) { return deployToFly(projectDir, projectName, opts); }

  // None available — return informational record
  const id = makeId();
  const rec: DeploymentRecord = {
    id, platform: "vercel", projectName, projectDir,
    status: "skipped", url: null,
    error: "No deployment CLIs found. Install one: npm install -g vercel (or netlify-cli, @railway/cli, wrangler)",
    logs: [], startedAt: ts(), completedAt: ts(),
    environment: opts.environment ?? "production",
  };
  deployments.set(id, rec);
  return rec;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function getDeploymentStatus(id: string): DeploymentRecord | undefined {
  return deployments.get(id);
}

export function listDeployments(projectName?: string): DeploymentRecord[] {
  const all = [...deployments.values()].toSorted((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return projectName ? all.filter((d) => d.projectName === projectName) : all;
}

export function getDeploymentStats() {
  const all = [...deployments.values()];
  return {
    total: all.length,
    live: all.filter((d) => d.status === "live").length,
    failed: all.filter((d) => d.status === "failed").length,
    inProgress: all.filter((d) => ["queued","building","deploying"].includes(d.status)).length,
    skipped: all.filter((d) => d.status === "skipped").length,
  };
}
