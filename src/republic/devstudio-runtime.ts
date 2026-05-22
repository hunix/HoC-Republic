/**
 * Republic DevStudio — Runtime Environment Checker
 *
 * Detects all compilers, CLIs, and runtimes available on the host.
 * Citizens use this to know what tools they can invoke when building
 * full-stack systems (compilers, deployment CLIs, package managers, etc.).
 */

import { execSync } from "node:child_process";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("devstudio-runtime");

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolStatus = "present" | "missing" | "outdated";

export interface ToolInfo {
  name: string;
  displayName: string;
  category: "runtime" | "package-manager" | "vcs" | "deployment" | "compiler" | "database" | "container";
  status: ToolStatus;
  version: string | null;
  minVersion?: string;
  installCommand: string;
  docs: string;
  description: string;
}

export interface RuntimeReport {
  checkedAt: string;
  tools: ToolInfo[];
  ready: boolean;          // true if all critical tools present
  missing: string[];       // names of missing tools
  warnings: string[];
  nodeVersion: string | null;
  pnpmVersion: string | null;
  gitVersion: string | null;
}

// ─── Tool Registry ────────────────────────────────────────────────────────────

const TOOL_CHECKS: Array<{
  name: string;
  displayName: string;
  category: ToolInfo["category"];
  cmd: string;
  parseVersion: (output: string) => string;
  minVersion?: string;
  critical?: boolean;
  installCommand: string;
  docs: string;
  description: string;
}> = [
  {
    name: "node",
    displayName: "Node.js",
    category: "runtime",
    cmd: "node --version",
    parseVersion: (o) => o.trim().replace(/^v/, ""),
    minVersion: "18.0.0",
    critical: true,
    installCommand: "winget install OpenJS.NodeJS.LTS",
    docs: "https://nodejs.org",
    description: "JavaScript/TypeScript runtime — required for all Node.js full-stack projects",
  },
  {
    name: "pnpm",
    displayName: "pnpm",
    category: "package-manager",
    cmd: "pnpm --version",
    parseVersion: (o) => o.trim(),
    critical: true,
    installCommand: "npm install -g pnpm",
    docs: "https://pnpm.io",
    description: "Fast, disk-efficient package manager used by HoC",
  },
  {
    name: "npm",
    displayName: "npm",
    category: "package-manager",
    cmd: "npm --version",
    parseVersion: (o) => o.trim(),
    installCommand: "Included with Node.js",
    docs: "https://npmjs.com",
    description: "Default Node.js package manager — available when pnpm is not",
  },
  {
    name: "git",
    displayName: "Git",
    category: "vcs",
    cmd: "git --version",
    parseVersion: (o) => o.trim().replace("git version ", ""),
    critical: true,
    installCommand: "winget install Git.Git",
    docs: "https://git-scm.com",
    description: "Version control — required for project scaffolding, CI/CD, and GitHub publishing",
  },
  {
    name: "python",
    displayName: "Python 3",
    category: "runtime",
    cmd: "python --version",
    parseVersion: (o) => o.trim().replace("Python ", ""),
    installCommand: "winget install Python.Python.3",
    docs: "https://python.org",
    description: "Required for AI/ML projects, FastAPI backends, data science",
  },
  {
    name: "go",
    displayName: "Go",
    category: "compiler",
    cmd: "go version",
    parseVersion: (o) => o.match(/go(\d+\.\d+[.\d]*)/)?.[1] ?? o.trim(),
    installCommand: "winget install GoLang.Go",
    docs: "https://go.dev",
    description: "High-performance backend services, microservices (Gin, Echo, Fiber)",
  },
  {
    name: "cargo",
    displayName: "Rust (cargo)",
    category: "compiler",
    cmd: "cargo --version",
    parseVersion: (o) => o.trim().replace("cargo ", "").split(" ")[0] ?? o.trim(),
    installCommand: "winget install Rustlang.Rustup",
    docs: "https://rust-lang.org",
    description: "Systems programming — WebAssembly, game engines, CLI tools (Actix, Tauri)",
  },
  {
    name: "dotnet",
    displayName: ".NET SDK",
    category: "runtime",
    cmd: "dotnet --version",
    parseVersion: (o) => o.trim(),
    installCommand: "winget install Microsoft.DotNet.SDK.8",
    docs: "https://dotnet.microsoft.com",
    description: "C#/F# runtime — ASP.NET Core, Blazor, MAUI apps",
  },
  {
    name: "java",
    displayName: "Java (JDK)",
    category: "compiler",
    cmd: "java -version 2>&1",
    parseVersion: (o) => o.match(/version "([^"]+)"/)?.[1] ?? o.split("\n")[0] ?? "",
    installCommand: "winget install Microsoft.OpenJDK.21",
    docs: "https://openjdk.org",
    description: "Java/Kotlin/Scala runtime — Spring Boot, Android, enterprise apps",
  },
  {
    name: "docker",
    displayName: "Docker",
    category: "container",
    cmd: "docker --version",
    parseVersion: (o) => o.trim().replace("Docker version ", "").split(",")[0] ?? o.trim(),
    installCommand: "winget install Docker.DockerDesktop",
    docs: "https://docker.com",
    description: "Container runtime — required for Supabase local, production deployments",
  },
  {
    name: "supabase",
    displayName: "Supabase CLI",
    category: "database",
    cmd: "supabase --version",
    parseVersion: (o) => o.trim(),
    installCommand: "npm install -g supabase",
    docs: "https://supabase.com/docs/guides/cli",
    description: "Local Supabase dev, migrations, edge functions, storage management",
  },
  {
    name: "vercel",
    displayName: "Vercel CLI",
    category: "deployment",
    cmd: "vercel --version",
    parseVersion: (o) => o.trim(),
    installCommand: "npm install -g vercel",
    docs: "https://vercel.com/docs/cli",
    description: "Deploy Next.js, Vite, and static apps to Vercel (edge network)",
  },
  {
    name: "railway",
    displayName: "Railway CLI",
    category: "deployment",
    cmd: "railway --version",
    parseVersion: (o) => o.trim(),
    installCommand: "npm install -g @railway/cli",
    docs: "https://docs.railway.app/develop/cli",
    description: "Full-stack deployment with managed PostgreSQL, Redis, containers",
  },
  {
    name: "netlify",
    displayName: "Netlify CLI",
    category: "deployment",
    cmd: "netlify --version",
    parseVersion: (o) => o.trim(),
    installCommand: "npm install -g netlify-cli",
    docs: "https://docs.netlify.com/cli/get-started",
    description: "Deploy static sites and serverless functions to Netlify edge network",
  },
  {
    name: "fly",
    displayName: "Fly.io CLI",
    category: "deployment",
    cmd: "fly version",
    parseVersion: (o) => o.split(" ")[1] ?? o.trim(),
    installCommand: "iwr https://fly.io/install.ps1 -useb | iex",
    docs: "https://fly.io/docs/hands-on",
    description: "Global Docker-based deployment — supports any language/framework",
  },
  {
    name: "gh",
    displayName: "GitHub CLI",
    category: "vcs",
    cmd: "gh --version",
    parseVersion: (o) => o.split("\n")[0]?.replace("gh version ", "").split(" ")[0] ?? o.trim(),
    installCommand: "winget install GitHub.cli",
    docs: "https://cli.github.com",
    description: "Create repos, PRs, releases, and GitHub Actions from the command line",
  },
  {
    name: "wrangler",
    displayName: "Cloudflare Wrangler",
    category: "deployment",
    cmd: "wrangler --version",
    parseVersion: (o) => o.trim(),
    installCommand: "npm install -g wrangler",
    docs: "https://developers.cloudflare.com/workers/wrangler",
    description: "Deploy to Cloudflare Workers, Pages, D1 SQLite, R2 storage",
  },
];

// ─── Runtime State ────────────────────────────────────────────────────────────

let cachedReport: RuntimeReport | null = null;
let lastCheckedAt = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

// ─── Core Functions ───────────────────────────────────────────────────────────

function runCommand(cmd: string): string | null {
  try {
    return execSync(cmd, { timeout: 5000, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

function checkTool(spec: typeof TOOL_CHECKS[0]): ToolInfo {
  const output = runCommand(spec.cmd);
  const version = output ? spec.parseVersion(output) : null;

  let status: ToolStatus = output ? "present" : "missing";
  if (output && spec.minVersion && version) {
    const [maj, min] = version.split(".").map(Number);
    const [minMaj, minMin] = spec.minVersion.split(".").map(Number);
    if ((maj ?? 0) < (minMaj ?? 0) || ((maj ?? 0) === (minMaj ?? 0) && (min ?? 0) < (minMin ?? 0))) {
      status = "outdated";
    }
  }

  return {
    name: spec.name,
    displayName: spec.displayName,
    category: spec.category,
    status,
    version,
    minVersion: spec.minVersion,
    installCommand: spec.installCommand,
    docs: spec.docs,
    description: spec.description,
  };
}

export function checkRuntime(force = false): RuntimeReport {
  const now = Date.now();
  if (!force && cachedReport && now - lastCheckedAt < CACHE_TTL_MS) {
    return cachedReport;
  }

  log.info("Checking runtime environment...");
  const tools = TOOL_CHECKS.map(checkTool);
  const critical = TOOL_CHECKS.filter((t) => t.critical).map((t) => t.name);
  const missing = tools.filter((t) => t.status === "missing").map((t) => t.name);
  const warnings = tools.filter((t) => t.status === "outdated").map(
    (t) => `${t.displayName} ${t.version ?? "?"} is below minimum ${t.minVersion ?? "?"}`
  );

  const ready = critical.every((name) => tools.find((t) => t.name === name)?.status === "present");
  const nodeInfo = tools.find((t) => t.name === "node");
  const pnpmInfo = tools.find((t) => t.name === "pnpm");
  const gitInfo = tools.find((t) => t.name === "git");

  cachedReport = {
    checkedAt: new Date().toISOString(),
    tools,
    ready,
    missing,
    warnings,
    nodeVersion: nodeInfo?.version ?? null,
    pnpmVersion: pnpmInfo?.version ?? null,
    gitVersion: gitInfo?.version ?? null,
  };
  lastCheckedAt = now;
  log.info(`Runtime check complete: ${tools.filter(t => t.status === "present").length}/${tools.length} tools present`);
  return cachedReport;
}

export function getToolStatus(name: string): ToolInfo | undefined {
  const report = checkRuntime();
  return report.tools.find((t) => t.name === name);
}

export function getMissingTools(): ToolInfo[] {
  return checkRuntime().tools.filter((t) => t.status !== "present");
}

export function getMissingDeploymentTools(): ToolInfo[] {
  return checkRuntime().tools.filter((t) => t.category === "deployment" && t.status !== "present");
}

export function getRuntimeSummary(): string {
  const r = checkRuntime();
  const present = r.tools.filter((t) => t.status === "present").map((t) => `${t.displayName} ${t.version ?? ""}`);
  const missing = r.tools.filter((t) => t.status !== "present").map((t) => t.displayName);
  return [
    `Runtime: Node ${r.nodeVersion ?? "—"} | pnpm ${r.pnpmVersion ?? "—"} | git ${r.gitVersion ?? "—"}`,
    `Available (${present.length}): ${present.join(", ")}`,
    missing.length > 0 ? `Missing (${missing.length}): ${missing.join(", ")}` : "All tools present ✓",
  ].join("\n");
}
