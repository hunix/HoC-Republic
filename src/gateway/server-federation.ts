/**
 * Gateway Federation HTTP Endpoints
 *
 * Handles HTTP requests for cross-gateway peer discovery and federation sync.
 *
 * Routes:
 *   GET  /cluster/announce          — Returns this gateway's announcement for peer discovery
 *   GET  /cluster/federation/sync   — Returns this gateway's federation sync payload
 *   POST /cluster/federation/actions — Receives a cross-gateway action request
 *   GET  /cluster/federation/status — Returns federation diagnostics
 */

import nodeCrypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadClusterConfig } from "../cluster/cluster-config.js";
import type { GatewayAnnouncement } from "../cluster/node-discovery.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
    buildLocalSyncPayload, getClusterStats, getFederatedCitizens, getFederatedGateways, getFederatedMarketplace, getFederationDiagnostics, getFederationEvents, handleIncomingAction, type CrossGatewayAction
} from "../republic/republic-federation.js";

const log = createSubsystemLogger("federation:http");

let cachedGatewayId: string = "";
let cachedGatewayPort: number = 18789;
let cachedRole: "primary" | "standby" = "primary";

/**
 * Set the gateway identity for the announcement endpoint.
 * Called once at startup by the server initialization.
 */
export function setFederationGatewayIdentity(opts: {
  gatewayId: string;
  port: number;
  role: "primary" | "standby";
}): void {
  cachedGatewayId = opts.gatewayId;
  cachedGatewayPort = opts.port;
  cachedRole = opts.role;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 1024 * 1024; // 1MB max

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

/**
 * Handle federation HTTP requests.
 * Returns true if this handler consumed the request, false to pass through.
 */
export async function handleFederationHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  // Only handle /cluster/* routes
  if (!pathname.startsWith("/cluster/")) {
    return false;
  }

  // ── GET /cluster/announce ──
  if (pathname === "/cluster/announce" && req.method === "GET") {
    return handleAnnounce(res);
  }

  // ── GET /cluster/federation/sync ──
  if (pathname === "/cluster/federation/sync" && req.method === "GET") {
    return handleFederationSync(res);
  }

  // ── POST /cluster/federation/actions ──
  if (pathname === "/cluster/federation/actions" && req.method === "POST") {
    return handleFederationAction(req, res);
  }

  // ── GET /cluster/federation/status ──
  if (pathname === "/cluster/federation/status" && req.method === "GET") {
    return handleFederationStatus(res);
  }

  return false;
}

/**
 * GET /cluster/announce
 * Returns the gateway's announcement for peer discovery (used by Tailscale HTTP probing).
 */
function handleAnnounce(res: ServerResponse): boolean {
  const config = loadClusterConfig();

  const announcement: GatewayAnnouncement = {
    gatewayId: cachedGatewayId || config.nodeId,
    host: process.env.OPENCLAW_HOST ?? "0.0.0.0",
    port: cachedGatewayPort,
    role: cachedRole,
    timestamp: Date.now(),
    signature: "", // Signature is computed by the verifier; the raw endpoint returns unsigned
  };

  // Sign the announcement if a cluster secret is configured
  if (config.encryption.clusterSecret) {
    const payload = `${announcement.gatewayId}:${announcement.role}`;
    announcement.signature = nodeCrypto
      .createHmac("sha256", config.encryption.clusterSecret)
      .update(payload)
      .digest("hex");
  }

  sendJson(res, 200, announcement);
  log.debug("Served announcement", { gatewayId: announcement.gatewayId });
  return true;
}

/**
 * GET /cluster/federation/sync
 * Returns the local federation sync payload (citizen roster, events, marketplace).
 */
function handleFederationSync(res: ServerResponse): boolean {
  try {
    // Import state lazily to avoid circular dependencies
    const getState = (globalThis as Record<string, unknown>).__republic_getState as
      | (() => {
          citizens: Array<{
            id: string;
            name: string;
            specialization: string;
            skills?: string[];
            level?: number;
            credits: number;
          }>;
          currentTick: number;
        })
      | undefined;

    if (!getState) {
      sendJson(res, 503, { error: "Republic state not initialized" });
      return true;
    }

    const state = getState();

    const payload = buildLocalSyncPayload(
      state.citizens.map((c) => ({
        id: c.id,
        name: c.name,
        specialization: c.specialization,
        skillCount: c.skills?.length ?? 0,
        level: c.level,
        credits: c.credits,
      })),
      "local", // GPU summary
      0, // VRAM (will be enriched later)
      0, // RAM (will be enriched later)
      state.currentTick,
    );

    sendJson(res, 200, payload);
    log.debug("Served federation sync", { citizenCount: payload.citizenCount });
    return true;
  } catch (err) {
    log.warn("Federation sync handler failed", { error: String(err) });
    sendJson(res, 500, { error: "Federation sync failed" });
    return true;
  }
}

/**
 * POST /cluster/federation/actions
 * Receives a cross-gateway action and processes it.
 */
async function handleFederationAction(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    const body = (await readBody(req)) as CrossGatewayAction;

    if (!body.type || !body.initiatorCitizenId || !body.targetCitizenId) {
      sendJson(res, 400, { error: "Invalid action payload" });
      return true;
    }

    const status = handleIncomingAction(body);
    sendJson(res, 200, { status });
    log.info("Processed federation action", { type: body.type, status });
    return true;
  } catch (err) {
    log.warn("Federation action handler failed", { error: String(err) });
    sendJson(res, 500, { error: "Action processing failed" });
    return true;
  }
}

/**
 * GET /cluster/federation/status
 * Returns federation diagnostics and cluster stats.
 */
function handleFederationStatus(res: ServerResponse): boolean {
  const diagnostics = getFederationDiagnostics();
  const stats = getClusterStats();
  const peers = getFederatedGateways();
  const remoteCitizens = getFederatedCitizens();
  const recentEvents = getFederationEvents(20);
  const marketplace = getFederatedMarketplace();

  sendJson(res, 200, {
    diagnostics,
    stats,
    peers,
    remoteCitizenCount: remoteCitizens.length,
    recentEvents,
    marketplaceListings: marketplace.length,
  });

  return true;
}
