/**
 * Public URL Deployment — Cloudflare Tunnel Integration
 *
 * Enables agents to deploy sandbox projects to public URLs using
 * Cloudflare's `cloudflared` quick tunnel (no account needed).
 *
 * Architecture:
 *   Sandbox port 8080 ──> cloudflared tunnel ──> https://xxx.trycloudflare.com
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("deploy-tunnel");

// ─── State ──────────────────────────────────────────────────────

interface ActiveTunnel {
  process: ChildProcess;
  publicUrl: string;
  port: number;
  startedAt: number;
}

const activeTunnels = new Map<string, ActiveTunnel>();

// ─── Cloudflared CLI Detection ──────────────────────────────────

function findCloudflared(): string | null {
  const candidates = ["cloudflared", "cloudflared.exe"];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ["--version"], { timeout: 5000, stdio: "pipe" });
      return cmd;
    } catch {
      // not found
    }
  }
  return null;
}

/** Install cloudflared if not present */
export async function ensureCloudflared(): Promise<boolean> {
  if (findCloudflared()) { return true; }

  logger.info("Installing cloudflared...");
  try {
    // Try installing via npm (works cross-platform)
    execFileSync("npm", ["install", "-g", "cloudflared"], {
      timeout: 120_000,
      stdio: "pipe",
    });
    return !!findCloudflared();
  } catch {
    logger.warn("Failed to install cloudflared. Install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
    return false;
  }
}

// ─── Tunnel Management ──────────────────────────────────────────

/**
 * Start a Cloudflare quick tunnel for a local port.
 * Returns the public URL (e.g., https://xxx.trycloudflare.com).
 */
export async function startTunnel(name: string, port: number): Promise<string | null> {
  // Don't duplicate
  const existing = activeTunnels.get(name);
  if (existing) {
    return existing.publicUrl;
  }

  const cmd = findCloudflared();
  if (!cmd) {
    const installed = await ensureCloudflared();
    if (!installed) { return null; }
  }

  const cloudflared = findCloudflared();
  if (!cloudflared) { return null; }

  return new Promise((resolve) => {
    logger.info(`Starting tunnel '${name}' for port ${port}...`);

    const proc = spawn(cloudflared, ["tunnel", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let publicUrl = "";
    let resolved = false;

    const onData = (data: Buffer) => {
      const output = data.toString();
      // Cloudflared prints the URL to stderr
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        publicUrl = match[0];
        resolved = true;
        activeTunnels.set(name, {
          process: proc,
          publicUrl,
          port,
          startedAt: Date.now(),
        });
        logger.info(`Tunnel '${name}' live at ${publicUrl}`);
        resolve(publicUrl);
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("error", (err) => {
      logger.error(`Tunnel '${name}' error: ${err.message}`);
      if (!resolved) { resolve(null); }
    });

    proc.on("exit", (code) => {
      logger.info(`Tunnel '${name}' exited with code ${code}`);
      activeTunnels.delete(name);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!resolved) {
        logger.warn(`Tunnel '${name}' timed out`);
        proc.kill();
        resolve(null);
      }
    }, 30_000);
  });
}

/** Stop a running tunnel */
export function stopTunnel(name: string): boolean {
  const tunnel = activeTunnels.get(name);
  if (!tunnel) { return false; }
  tunnel.process.kill();
  activeTunnels.delete(name);
  logger.info(`Tunnel '${name}' stopped`);
  return true;
}

/** List all active tunnels */
export function listTunnels(): Array<{
  name: string;
  publicUrl: string;
  port: number;
  uptimeMs: number;
}> {
  return Array.from(activeTunnels.entries()).map(([name, tunnel]) => ({
    name,
    publicUrl: tunnel.publicUrl,
    port: tunnel.port,
    uptimeMs: Date.now() - tunnel.startedAt,
  }));
}

/** Stop all tunnels */
export function stopAllTunnels(): void {
  for (const [name, tunnel] of activeTunnels) {
    tunnel.process.kill();
    logger.info(`Tunnel '${name}' stopped`);
  }
  activeTunnels.clear();
}

/** Check if cloudflared is available */
export function isCloudflaredAvailable(): boolean {
  return !!findCloudflared();
}
