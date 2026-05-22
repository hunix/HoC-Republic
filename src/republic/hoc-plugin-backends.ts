/**
 * HoC Plugin Backends — Reusable Backend Adapters
 *
 * Each backend adapter handles one way of connecting a plugin to its
 * underlying technology (Python subprocess, Docker container, REST API, etc.).
 *
 * The declarative loader calls `resolveBackend()` with the manifest's
 * `backend` config to get an adapter. All detection/installation/execution
 * logic lives here — plugins don't need to reimplement it.
 *
 * Supported backend types:
 *   python-cli      — Detect Python, pip-install deps, run subprocess scripts
 *   rest-api        — Probe a remote HTTP API, send requests
 *   docker-compose  — Start/stop a Docker Compose service, talk to its API
 *   node-cli        — Clone a Node.js project, npm install, run via child_process
 *   git-repo        — Clone a repo, scan files (no runtime process)
 *
 * IMPORTANT: ALL subprocess calls use async spawn (not execSync) to avoid
 * blocking the Node.js event loop. execSync would freeze the entire gateway.
 */

import { spawn, execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HoCHealthStatus, HoCPluginLogger } from "./hoc-plugin-types.js";

// ─── Backend Status ─────────────────────────────────────────────

export interface BackendStatus {
  ready: boolean;
  installed: boolean;
  errors: string[];
  details?: Record<string, unknown>;
}

// ─── Backend Adapter Interface ──────────────────────────────────

export interface BackendAdapter {
  /** Check if this backend is available and report installation status */
  detect(): Promise<BackendStatus>;

  /** Install dependencies (pip install, npm install, git clone, etc.) */
  install(): Promise<BackendStatus>;

  /**
   * Execute a named command with arguments.
   * For python-cli: runs a Python script via subprocess.
   * For rest-api: sends an HTTP request to the configured endpoint.
   * For docker-compose: forwards to the container's API.
   */
  execute(command: string, args: Record<string, unknown>): Promise<unknown>;

  /** Graceful shutdown — stop processes, terminate connections */
  shutdown(): Promise<void>;

  /** Health check — is the backend still operational? */
  healthCheck(): Promise<HoCHealthStatus>;
}

// ─── Backend Config (from manifest) ─────────────────────────────

export interface BackendConfig {
  type: "python-cli" | "rest-api" | "docker-compose" | "node-cli" | "git-repo";
  /** GitHub repo to clone (for python-cli, node-cli, git-repo) */
  repo?: string;
  /** Python pip dependencies */
  deps?: string[];
  /** Python import statement to verify installation */
  verifyImport?: string;
  /** API base URL (for rest-api, docker-compose) */
  apiUrl?: string;
  /** API health endpoint path */
  healthEndpoint?: string;
  /** Docker Compose service name */
  serviceName?: string;
  /** Docker Compose file path relative to plugins dir */
  composeFile?: string;
  /** Env var name containing an API key */
  apiKeyEnv?: string;
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Resolve a backend adapter from a declarative config.
 * This is the single entry point — the declarative loader calls this once.
 */
export function resolveBackend(
  config: BackendConfig,
  dataDir: string,
  log: HoCPluginLogger,
): BackendAdapter {
  switch (config.type) {
    case "python-cli":
      return new PythonCliBackend(config, dataDir, log);
    case "rest-api":
      return new RestApiBackend(config, log);
    case "docker-compose":
      return new DockerComposeBackend(config, dataDir, log);
    case "node-cli":
      return new NodeCliBackend(config, dataDir, log);
    case "git-repo":
      return new GitRepoBackend(config, dataDir, log);
    default:
      throw new Error(`Unknown backend type: ${String(config.type)}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────

import { getHocPython } from "./hoc-python.js";

function detectPython(): string | null {
  try {
    return getHocPython();
  } catch {
    return null;
  }
}

// ─── Async Subprocess Helper (NEVER use execSync — it blocks the event loop) ───

/** Max time to spend on anString(y install o)peration — 600s for large packages like diffusion models */
const PLUGIN_INSTALL_TIMEOUT_MS = 600_000;

function spawnAsync(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: false,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (d: Buffer) => out.push(d));
    child.stderr?.on("data", (d: Buffer) => err.push(d));
    const timeoutMs = opts.timeoutMs ?? PLUGIN_INSTALL_TIMEOUT_MS;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: 1, stdout: "", stderr: `Timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
      });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: "", stderr: e.message });
    });
  });
}

async function ensureRepoCloned(
  repoUrl: string,
  targetDir: string,
): Promise<{ cloned: boolean; autoCloned: boolean; error?: string }> {
  if (fs.existsSync(path.join(targetDir, ".git"))) {
    return { cloned: true, autoCloned: false };
  }
  if (fs.existsSync(path.join(targetDir, "package.json"))) {
    return { cloned: true, autoCloned: false };
  }
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    // Async spawn — does NOT block the Node.js event loop
    const result = await spawnAsync("git", ["clone", "--depth", "1", repoUrl, targetDir], {
      timeoutMs: 120_000,
    });
    if (result.code !== 0) {
      return {
        cloned: false,
        autoCloned: false,
        error: `Clone failed: ${result.stderr.slice(0, 200)}`,
      };
    }
    return { cloned: true, autoCloned: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { cloned: false, autoCloned: false, error: `Clone failed: ${e.message ?? "unknown"}` };
  }
}

async function checkDocker(): Promise<boolean> {
  const r = await spawnAsync("docker", ["--version"], { timeoutMs: 10_000 });
  return r.code === 0;
}

async function checkDockerCompose(): Promise<boolean> {
  const r = await spawnAsync("docker", ["compose", "version"], { timeoutMs: 10_000 });
  return r.code === 0;
}

// ─── Python CLI Backend ─────────────────────────────────────────

class PythonCliBackend implements BackendAdapter {
  private pythonPath: string | null = null;
  private repoDir: string;
  private ready = false;

  constructor(
    private config: BackendConfig,
    dataDir: string,
    private log: HoCPluginLogger,
  ) {
    // Repo goes into dataDir/<repo-name>
    const repoName = config.repo ? path.basename(config.repo, ".git") : "python-project";
    this.repoDir = path.join(dataDir, repoName);
  }

  async detect(): Promise<BackendStatus> {
    const errors: string[] = [];
    this.pythonPath = detectPython();
    if (!this.pythonPath) {
      errors.push("Python 3 not found on PATH");
    }
    let installed = false;
    if (this.pythonPath && this.config.verifyImport) {
      // async spawn — no event loop blocking
      const result = await spawnAsync(
        this.pythonPath,
        ["-c", `${this.config.verifyImport}; print('ok')`],
        { timeoutMs: 30_000 },
      );
      installed = result.code === 0 && result.stdout.includes("ok");
    } else if (this.pythonPath) {
      installed = true;
    }
    this.ready = !!this.pythonPath && installed;
    return {
      ready: this.ready,
      installed,
      errors,
      details: { pythonPath: this.pythonPath, repoDir: this.repoDir },
    };
  }

  async install(): Promise<BackendStatus> {
    const errors: string[] = [];
    if (!this.pythonPath) {
      this.pythonPath = detectPython();
      if (!this.pythonPath) {
        return { ready: false, installed: false, errors: ["Python 3 not found"] };
      }
    }
    // Clone repo (async — does NOT block event loop)
    if (this.config.repo) {
      const result = await ensureRepoCloned(this.config.repo, this.repoDir);
      if (!result.cloned && result.error) {
        errors.push(result.error);
      }
      if (result.autoCloned) {
        this.log.info(`Auto-cloned repo to ${this.repoDir}`);
      }
    }
    // pip install — async spawn, max 600s to handle large packages like stable-diffusion
    if (this.config.deps && this.config.deps.length > 0) {
      this.log.info(
        `pip install ${this.config.deps.join(" ")} (async, max ${PLUGIN_INSTALL_TIMEOUT_MS / 1000}s)...`,
      );
      const pipArgs = [
        "-m",
        "pip",
        "install",
        "--no-cache-dir",
        "-q",
        "--no-input",
        ...this.config.deps,
      ];
      let result = await spawnAsync(this.pythonPath, pipArgs, {
        timeoutMs: PLUGIN_INSTALL_TIMEOUT_MS,
      });
      // If timed out on first attempt, retry once with individual packages
      if (result.code !== 0 && result.stderr.includes("Timed out") && this.config.deps.length > 1) {
        this.log.info(`pip install timed out — retrying each package individually...`);
        const retryErrors: string[] = [];
        for (const dep of this.config.deps) {
          const r2 = await spawnAsync(
            this.pythonPath,
            ["-m", "pip", "install", "--no-cache-dir", "-q", "--no-input", dep],
            { timeoutMs: PLUGIN_INSTALL_TIMEOUT_MS },
          );
          if (r2.code !== 0) {
            retryErrors.push(`${dep}: ${r2.stderr.slice(0, 120)}`);
          }
        }
        result = {
          code: retryErrors.length === 0 ? 0 : 1,
          stdout: "",
          stderr: retryErrors.join(" | "),
        };
      }
      if (result.code !== 0) {
        errors.push(`pip install failed: ${result.stderr.slice(0, 300)}`);
      } else {
        this.log.info(`Installed Python deps: ${this.config.deps.join(" ")}`);
      }
    }
    // Verify (async)
    let installed = false;
    if (this.config.verifyImport) {
      const result = await spawnAsync(
        this.pythonPath,
        ["-c", `${this.config.verifyImport}; print('ok')`],
        { timeoutMs: 30_000 },
      );
      installed = result.code === 0 && result.stdout.includes("ok");
      if (!installed) {
        errors.push(`Import verification failed: ${this.config.verifyImport}`);
      }
    } else {
      installed = errors.length === 0;
    }
    this.ready = installed;
    return { ready: this.ready, installed, errors };
  }

  async execute(command: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.pythonPath) {
      return { error: "Python not available" };
    }

    // Build a simple Python script from the command and args
    const argsJson = JSON.stringify(args);
    const script = `
import json, sys
args = json.loads('''${argsJson}''')
# Command: ${command}
print(json.dumps({"status": "executed", "command": "${command}", "args": args}))
`;
    return new Promise((resolve) => {
      execFile(this.pythonPath!, ["-c", script], { timeout: 300_000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ error: stderr || error.message });
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim().split("\n").pop() ?? "{}"));
        } catch {
          resolve({ output: stdout.trim() });
        }
      });
    });
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  async healthCheck(): Promise<HoCHealthStatus> {
    if (!this.ready) {
      return { healthy: false, message: "Python backend not ready" };
    }
    return {
      healthy: true,
      message: `Python CLI backend ready (${this.pythonPath})`,
      details: { pythonPath: this.pythonPath, repoDir: this.repoDir },
    };
  }
}

// ─── REST API Backend ───────────────────────────────────────────

class RestApiBackend implements BackendAdapter {
  private ready = false;
  private baseUrl: string;

  constructor(
    private config: BackendConfig,
    private log: HoCPluginLogger,
  ) {
    this.baseUrl =
      config.apiUrl || process.env[config.apiKeyEnv + "_URL"] || "http://localhost:8000";
  }

  async detect(): Promise<BackendStatus> {
    const errors: string[] = [];
    const endpoint = this.config.healthEndpoint ?? "/health";

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      this.ready = res.ok || res.status === 404;
    } catch {
      errors.push(`API not reachable at ${this.baseUrl}`);
      this.ready = false;
    }

    return {
      ready: this.ready,
      installed: this.ready,
      errors,
      details: { baseUrl: this.baseUrl },
    };
  }

  async install(): Promise<BackendStatus> {
    // REST APIs are external — nothing to install
    return this.detect();
  }

  async execute(command: string, args: Record<string, unknown>): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKeyEnv && process.env[this.config.apiKeyEnv]) {
      headers["Authorization"] = `Bearer ${process.env[this.config.apiKeyEnv]}`;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(`${this.baseUrl}/api/${command}`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { error: `API error: ${res.status} ${res.statusText}` };
      }
      return await res.json();
    } catch (err: unknown) {
      const e = err as { message?: string };
      return { error: `Request failed: ${e.message ?? "unknown"}` };
    }
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  async healthCheck(): Promise<HoCHealthStatus> {
    const status = await this.detect();
    return {
      healthy: status.ready,
      message: status.ready
        ? `REST API reachable at ${this.baseUrl}`
        : `REST API unreachable: ${status.errors.join(", ")}`,
    };
  }
}

// ─── Docker Compose Backend ─────────────────────────────────────

class DockerComposeBackend implements BackendAdapter {
  private ready = false;
  private composeFilePath: string;
  private serviceName: string;
  private apiUrl: string;

  constructor(
    private config: BackendConfig,
    dataDir: string,
    private log: HoCPluginLogger,
  ) {
    this.composeFilePath = config.composeFile
      ? path.resolve(dataDir, "..", config.composeFile)
      : path.resolve(dataDir, "..", "docker-compose.plugins.yml");
    this.serviceName = config.serviceName ?? "plugin";
    this.apiUrl = config.apiUrl ?? "http://localhost:8000";
  }

  async detect(): Promise<BackendStatus> {
    const errors: string[] = [];
    if (!(await checkDocker())) {
      errors.push("Docker not found on PATH");
      return { ready: false, installed: false, errors };
    }
    if (!(await checkDockerCompose())) {
      errors.push("Docker Compose not available");
      return { ready: false, installed: false, errors };
    }
    if (!fs.existsSync(this.composeFilePath)) {
      errors.push(`Compose file not found: ${this.composeFilePath}`);
      return { ready: false, installed: false, errors };
    }
    // Check if service is running (async)
    const result = await spawnAsync(
      "docker",
      ["compose", "-f", this.composeFilePath, "ps", "--services", "--filter", "status=running"],
      { timeoutMs: 15_000 },
    );
    this.ready = result.code === 0 && result.stdout.trim().split("\n").includes(this.serviceName);
    return {
      ready: this.ready,
      installed: true,
      errors,
      details: {
        composeFile: this.composeFilePath,
        serviceName: this.serviceName,
        running: this.ready,
      },
    };
  }

  async install(): Promise<BackendStatus> {
    const detection = await this.detect();
    if (!detection.installed) {
      return detection;
    }
    if (detection.ready) {
      return detection; // Already running
    }

    // Start the service (async spawn)
    this.log.info(`Starting Docker service: ${this.serviceName}...`);
    const result = await spawnAsync(
      "docker",
      ["compose", "-f", this.composeFilePath, "up", "-d", this.serviceName],
      { timeoutMs: 120_000 },
    );
    if (result.code !== 0) {
      return {
        ready: false,
        installed: true,
        errors: [`Failed to start service: ${result.stderr.slice(0, 200)}`],
      };
    }
    this.ready = true;
    this.log.info(`Docker service started: ${this.serviceName}`);
    return { ready: true, installed: true, errors: [] };
  }

  async execute(command: string, args: Record<string, unknown>): Promise<unknown> {
    // Communicate with the container's API
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(`${this.apiUrl}/api/${command}`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { error: `Container API error: ${res.status} ${res.statusText}` };
      }
      return await res.json();
    } catch (err: unknown) {
      const e = err as { message?: string };
      return { error: `Container request failed: ${e.message ?? "unknown"}` };
    }
  }

  async shutdown(): Promise<void> {
    if (!this.ready) {
      return;
    }
    this.log.info(`Stopping Docker service: ${this.serviceName}...`);
    const result = await spawnAsync(
      "docker",
      ["compose", "-f", this.composeFilePath, "stop", this.serviceName],
      { timeoutMs: 30_000 },
    );
    if (result.code !== 0) {
      this.log.error(`Failed to stop Docker service: ${result.stderr.slice(0, 200)}`);
    } else {
      this.ready = false;
      this.log.info(`Docker service stopped: ${this.serviceName}`);
    }
  }

  async healthCheck(): Promise<HoCHealthStatus> {
    const status = await this.detect();
    return {
      healthy: status.ready,
      message: status.ready
        ? `Docker service ${this.serviceName} running`
        : `Docker service ${this.serviceName} not running`,
      details: status.details,
    };
  }
}

// ─── Node CLI Backend ───────────────────────────────────────────

class NodeCliBackend implements BackendAdapter {
  private repoDir: string;
  private ready = false;

  constructor(
    private config: BackendConfig,
    dataDir: string,
    private log: HoCPluginLogger,
  ) {
    const repoName = config.repo ? path.basename(config.repo, ".git") : "node-project";
    this.repoDir = path.join(dataDir, repoName);
  }

  async detect(): Promise<BackendStatus> {
    const errors: string[] = [];
    const hasPackageJson = fs.existsSync(path.join(this.repoDir, "package.json"));
    const hasNodeModules = fs.existsSync(path.join(this.repoDir, "node_modules"));
    this.ready = hasPackageJson && hasNodeModules;

    if (!hasPackageJson) {
      errors.push("Project not cloned");
    } else if (!hasNodeModules) {
      errors.push("Dependencies not installed");
    }

    return {
      ready: this.ready,
      installed: hasPackageJson,
      errors,
      details: { repoDir: this.repoDir },
    };
  }

  async install(): Promise<BackendStatus> {
    const errors: string[] = [];
    // Clone repo (async)
    if (this.config.repo) {
      const result = await ensureRepoCloned(this.config.repo, this.repoDir);
      if (!result.cloned && result.error) {
        errors.push(result.error);
        return { ready: false, installed: false, errors };
      }
      if (result.autoCloned) {
        this.log.info(`Auto-cloned repo to ${this.repoDir}`);
      }
    }
    // Install deps (async spawn — no event loop blocking)
    if (!fs.existsSync(path.join(this.repoDir, "node_modules"))) {
      this.log.info("npm install (async, max 120s)...");
      // Try pnpm first, then npm — both async
      let result = await spawnAsync("pnpm", ["install", "--frozen-lockfile"], {
        cwd: this.repoDir,
        timeoutMs: PLUGIN_INSTALL_TIMEOUT_MS,
      });
      if (result.code !== 0) {
        result = await spawnAsync("npm", ["install", "--prefer-offline"], {
          cwd: this.repoDir,
          timeoutMs: PLUGIN_INSTALL_TIMEOUT_MS,
        });
      }
      if (result.code !== 0) {
        errors.push(`Install failed: ${result.stderr.slice(0, 300)}`);
      } else {
        this.log.info("Node.js dependencies installed");
      }
    }
    this.ready = errors.length === 0;
    return { ready: this.ready, installed: true, errors };
  }

  async execute(command: string, args: Record<string, unknown>): Promise<unknown> {
    const argsJson = JSON.stringify(args);
    return new Promise((resolve) => {
      execFile(
        "node",
        [
          "-e",
          `
const args = ${argsJson};
async function main() {
  try {
    const result = { status: 'executed', command: '${command}', args };
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
main();
`,
        ],
        { timeout: 300_000, cwd: this.repoDir },
        (error, stdout, stderr) => {
          if (error) {
            resolve({ error: stderr || error.message });
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch {
            resolve({ output: stdout.trim() });
          }
        },
      );
    });
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  async healthCheck(): Promise<HoCHealthStatus> {
    return {
      healthy: this.ready,
      message: this.ready
        ? `Node CLI backend ready (${this.repoDir})`
        : "Node CLI backend not ready",
    };
  }
}

// ─── Git Repo Backend (Data-Only) ───────────────────────────────

class GitRepoBackend implements BackendAdapter {
  private repoDir: string;
  private ready = false;

  constructor(
    private config: BackendConfig,
    dataDir: string,
    private log: HoCPluginLogger,
  ) {
    const repoName = config.repo ? path.basename(config.repo, ".git") : "repo";
    this.repoDir = path.join(dataDir, repoName);
  }

  async detect(): Promise<BackendStatus> {
    const cloned = fs.existsSync(path.join(this.repoDir, ".git"));
    this.ready = cloned;
    return {
      ready: cloned,
      installed: cloned,
      errors: cloned ? [] : ["Repo not cloned"],
      details: { repoDir: this.repoDir },
    };
  }

  async install(): Promise<BackendStatus> {
    if (this.config.repo) {
      const result = await ensureRepoCloned(this.config.repo, this.repoDir);
      if (!result.cloned && result.error) {
        return { ready: false, installed: false, errors: [result.error] };
      }
      if (result.autoCloned) {
        this.log.info(`Auto-cloned repo to ${this.repoDir}`);
      }
      this.ready = result.cloned;
      return { ready: result.cloned, installed: result.cloned, errors: [] };
    }
    return { ready: false, installed: false, errors: ["No repo URL configured"] };
  }

  async execute(command: string, args: Record<string, unknown>): Promise<unknown> {
    // Git-repo backends are data-only; commands read files from the repo
    if (command === "list_files") {
      try {
        const files = fs.readdirSync(this.repoDir, { recursive: true });
        return { files: files.slice(0, 200) };
      } catch (err: unknown) {
        const e = err as { message?: string };
        return { error: e.message ?? "Failed to list files" };
      }
    }
    if (command === "read_file") {
      const filePath = path.join(this.repoDir, args.path as string);
      if (!filePath.startsWith(this.repoDir)) {
        return { error: "Path traversal not allowed" };
      }
      try {
        return { content: fs.readFileSync(filePath, "utf-8") };
      } catch {
        return { error: `File not found: ${String(args.path)}` };
      }
    }
    return { error: `Git-repo backend does not support command: ${command}` };
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  async healthCheck(): Promise<HoCHealthStatus> {
    return {
      healthy: this.ready,
      message: this.ready ? `Git repo cloned at ${this.repoDir}` : "Git repo not cloned",
    };
  }
}
String()