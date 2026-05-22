/**
 * Mission Control lifecycle manager.
 *
 * Automates Docker Compose up/down, health polling, and first-run provisioning
 * of an organization + gateway entry so Mission Control is fully ready on boot.
 *
 * Auth is seamless: the gateway's own auth token is shared with MC as its
 * LOCAL_AUTH_TOKEN.  No separate token configuration is needed.
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { OpenClawConfig } from "../config/types.js";
import type { MissionControlConfig } from "../config/types.mission-control.js";

const execFileAsync = promisify(execFile);

// ── Defaults ────────────────────────────────────────────────────────

const MC_API_PORT_DEFAULT = 8000;
const MC_FRONTEND_PORT_DEFAULT = 3000;
const MC_HEALTH_TIMEOUT_MS = 120_000;
const MC_HEALTH_POLL_MS = 2_000;
const MC_COMPOSE_SEARCH_PATHS = [
  // Sibling clone next to HoC
  resolve(process.cwd(), "..", "openclaw-mission-control"),
  // Common dev locations
  resolve(
    process.env.USERPROFILE ?? process.env.HOME ?? "",
    "source",
    "repos",
    "openclaw-mission-control",
  ),
];

// ── Public API ──────────────────────────────────────────────────────

export interface MissionControlHandle {
  stop: () => Promise<void>;
  apiUrl: string;
  frontendUrl: string;
}

export interface MissionControlStartParams {
  cfg: OpenClawConfig;
  mcConfig: MissionControlConfig;
  gatewayPort: number;
  defaultWorkspaceDir: string;
  /** Called to persist a newly-generated auth token back to openclaw.json. */
  persistAuthToken: (token: string) => Promise<void>;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

/**
 * Start Mission Control via Docker Compose, wait for health, and provision
 * the org + gateway entry.  Returns a handle with a `stop()` method for
 * graceful teardown.
 *
 * Auth is fully automatic:
 * 1. If the gateway already has `gateway.auth.token`, it's reused as MC's
 *    LOCAL_AUTH_TOKEN — single source of truth.
 * 2. If no token exists, one is auto-generated and persisted to openclaw.json
 *    via the `persistAuthToken` callback, then used for both systems.
 */
export async function startMissionControl(
  params: MissionControlStartParams,
): Promise<MissionControlHandle | null> {
  const { cfg, mcConfig, log } = params;

  if (!mcConfig.enabled) {
    return null;
  }

  // ── Locate compose file ───────────────────────────────────────────
  const composeDir = resolveComposeDir(mcConfig.composePath);
  if (!composeDir) {
    log.error(
      "mission-control: could not locate compose.yml — tried: " +
        MC_COMPOSE_SEARCH_PATHS.join(", "),
    );
    return null;
  }

  const apiPort = mcConfig.apiPort ?? MC_API_PORT_DEFAULT;
  const frontendPort = mcConfig.frontendPort ?? MC_FRONTEND_PORT_DEFAULT;
  const apiUrl = `http://localhost:${apiPort}`;
  const frontendUrl = `http://localhost:${frontendPort}`;

  // ── Resolve auth token (single source of truth) ───────────────────
  // Use the HoC gateway's own auth token.  If none is configured, generate
  // a strong random one and persist it back to openclaw.json so both systems
  // share the same credential with zero manual setup.
  let authToken = cfg.gateway?.auth?.token?.trim() || "";
  if (!authToken || authToken.length < 50) {
    authToken = randomBytes(48).toString("base64url");
    log.info("mission-control: generated shared auth token (persisting to openclaw.json)");
    try {
      await params.persistAuthToken(authToken);
    } catch (err) {
      log.error(`mission-control: failed to persist auth token: ${String(err)}`);
      return null;
    }
  }

  // ── Write compose-root .env ───────────────────────────────────────
  // Docker Compose reads .env from the project root.  This single file
  // configures the backend, frontend, and webhook-worker services.
  const envPath = join(composeDir, ".env");
  const envContent = buildEnvFile({
    authToken,
    apiPort,
    frontendPort,
    gatewayPort: params.gatewayPort,
  });
  try {
    writeFileSync(envPath, envContent, "utf-8");
    log.info(`mission-control: wrote .env → ${envPath}`);
  } catch (err) {
    log.error(`mission-control: failed to write .env: ${String(err)}`);
    return null;
  }

  // ── Docker Compose up ─────────────────────────────────────────────
  try {
    log.info(`mission-control: starting Docker Compose in ${composeDir}`);
    await dockerCompose(composeDir, ["up", "-d", "--build"]);
    log.info("mission-control: Docker Compose started");
  } catch (err) {
    log.error(`mission-control: docker compose up failed: ${String(err)}`);
    return null;
  }

  // ── Health poll ───────────────────────────────────────────────────
  const healthy = await waitForHealth(apiUrl, MC_HEALTH_TIMEOUT_MS, log);
  if (!healthy) {
    log.error(`mission-control: health check timed out after ${MC_HEALTH_TIMEOUT_MS / 1000}s`);
    return null;
  }
  log.info(`mission-control: backend healthy at ${apiUrl}`);

  // ── Auto-provision org + gateway ──────────────────────────────────
  try {
    await autoProvision({
      apiUrl,
      authToken,
      gatewayPort: params.gatewayPort,
      defaultWorkspaceDir: params.defaultWorkspaceDir,
      log,
    });
  } catch (err) {
    log.warn(`mission-control: auto-provision failed (non-fatal): ${String(err)}`);
  }

  log.info(`mission-control: ready — UI at ${frontendUrl}`);

  // ── Return handle ─────────────────────────────────────────────────
  return {
    apiUrl,
    frontendUrl,
    stop: async () => {
      try {
        log.info("mission-control: stopping Docker Compose");
        await dockerCompose(composeDir, ["down"]);
        log.info("mission-control: Docker Compose stopped");
      } catch (err) {
        log.error(`mission-control: docker compose down failed: ${String(err)}`);
      }
    },
  };
}

// ── Internals ───────────────────────────────────────────────────────

function resolveComposeDir(configPath?: string): string | null {
  if (configPath) {
    const p = resolve(configPath);
    if (
      p.endsWith("compose.yml") ||
      p.endsWith("compose.yaml") ||
      p.endsWith("docker-compose.yml")
    ) {
      return existsSync(p) ? dirname(p) : null;
    }
    const composeFile = join(p, "compose.yml");
    return existsSync(composeFile) ? p : null;
  }

  for (const candidate of MC_COMPOSE_SEARCH_PATHS) {
    const composeFile = join(candidate, "compose.yml");
    if (existsSync(composeFile)) {
      return candidate;
    }
  }
  return null;
}

function buildEnvFile(opts: {
  authToken: string;
  apiPort: number;
  frontendPort: number;
  gatewayPort: number;
}): string {
  // Single .env at compose root — configures ALL services:
  //   backend (AUTH_MODE, LOCAL_AUTH_TOKEN, DATABASE_URL, etc.)
  //   frontend (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_AUTH_MODE via AUTH_MODE)
  //   webhook-worker (AUTH_MODE, LOCAL_AUTH_TOKEN)
  return [
    "# ─── Auto-generated by HoC Gateway — DO NOT EDIT ───",
    "# Shared auth token (same as gateway.auth.token in openclaw.json)",
    `AUTH_MODE=local`,
    `LOCAL_AUTH_TOKEN=${opts.authToken}`,
    "",
    "# Ports",
    `BACKEND_PORT=${opts.apiPort}`,
    `FRONTEND_PORT=${opts.frontendPort}`,
    "",
    "# Frontend build args",
    `NEXT_PUBLIC_API_URL=http://localhost:${opts.apiPort}`,
    "",
    "# Database & Redis (container networking, no changes needed)",
    `DB_AUTO_MIGRATE=true`,
    "",
    "# CORS — allow frontend + gateway origins",
    `CORS_ORIGINS=http://localhost:${opts.frontendPort},http://localhost:${opts.gatewayPort}`,
    "",
    "# HoC Gateway WebSocket URL (for MC backend → gateway connection)",
    `GATEWAY_WS_URL=ws://host.docker.internal:${opts.gatewayPort}`,
    `GATEWAY_AUTH_TOKEN=${opts.authToken}`,
    "",
  ].join("\n");
}

async function dockerCompose(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("docker", ["compose", ...args], {
    cwd,
    timeout: 300_000, // 5 minutes
  });
  if (stderr && stderr.trim()) {
    const trimmed = stderr.trim();
    if (trimmed.toLowerCase().includes("error")) {
      throw new Error(trimmed);
    }
  }
  return stdout;
}

async function waitForHealth(
  apiUrl: string,
  timeoutMs: number,
  log: { info: (msg: string) => void },
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${apiUrl}/health`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        return true;
      }
    } catch {
      // expected while containers are starting
    }
    log.info("mission-control: waiting for backend health...");
    await sleep(MC_HEALTH_POLL_MS);
  }
  return false;
}

async function autoProvision(opts: {
  apiUrl: string;
  authToken: string;
  gatewayPort: number;
  defaultWorkspaceDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
}): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.authToken}`,
  };

  // 1. Create organization (409 = already exists → idempotent)
  const orgRes = await fetch(`${opts.apiUrl}/organizations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "HoC" }),
    signal: AbortSignal.timeout(10_000),
  });

  if (orgRes.ok) {
    opts.log.info("mission-control: created organization 'HoC'");
  } else if (orgRes.status === 409) {
    opts.log.info("mission-control: organization 'HoC' already exists");
  } else {
    const body = await orgRes.text().catch(() => "");
    opts.log.warn(`mission-control: POST /organizations → ${orgRes.status}: ${body}`);
  }

  // 2. Check if gateway already registered
  const gwListRes = await fetch(`${opts.apiUrl}/gateways?limit=100`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (gwListRes.ok) {
    const gwList = (await gwListRes.json()) as { items?: Array<{ name?: string }> };
    const existing = gwList.items?.find((gw) => gw.name === "HoC Gateway");
    if (existing) {
      opts.log.info("mission-control: gateway 'HoC Gateway' already registered");
      return;
    }
  }

  // 3. Create gateway — uses the SAME auth token for both MC login and
  //    gateway WebSocket auth (true single-token integration).
  const gatewayUrl = `ws://host.docker.internal:${opts.gatewayPort}`;
  const gwRes = await fetch(`${opts.apiUrl}/gateways`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "HoC Gateway",
      url: gatewayUrl,
      workspace_root: opts.defaultWorkspaceDir,
      token: opts.authToken,
      allow_insecure_tls: false,
      disable_device_pairing: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (gwRes.ok) {
    opts.log.info(`mission-control: registered gateway → ${gatewayUrl}`);
  } else {
    const body = await gwRes.text().catch(() => "");
    opts.log.warn(`mission-control: POST /gateways → ${gwRes.status}: ${body}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
