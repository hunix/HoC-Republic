/**
 * Node UI HTTP Server
 *
 * Standalone HTTP server for the HoC Node Web UI.
 * Runs on port 3001 (configurable) and serves:
 *   - Static frontend assets from node-ui/dist/
 *   - REST API for status, hardware, config, pairing, plugins, LLM, etc.
 *   - SSE endpoint for live log streaming
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { detectNodeCapabilities } from "../cluster/node-capabilities.js";
import { createSubsystemLogger } from "../logging.js";
import { getLlmRuntimeStatus } from "./llm-runtime-status.js";
import { loadNodeConfig, updateNodeConfig, type NodeConfig } from "./node-config-store.js";
import {
  requestPairing,
  acceptPairing,
  getPairingStatus,
  type PairAcceptPayload,
} from "./pairing-protocol.js";

const logger = createSubsystemLogger("node-ui:server");

// ─── MIME Types ──────────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

// ─── Helpers ────────────────────────────────────────────────────

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function resolveStaticRoot(): string {
  // Try multiple locations for the built UI
  const candidates = [
    path.join(process.cwd(), "node-ui", "dist"),
    path.join(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
      "..",
      "..",
      "node-ui",
      "dist",
    ),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return candidates[0]; // fallback
}

// ─── Server Start Time ──────────────────────────────────────────

const startedAt = Date.now();

// ─── API Route Handler ──────────────────────────────────────────

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
): Promise<void> {
  // ── GET /api/status ──
  if (pathname === "/api/status" && method === "GET") {
    const config = loadNodeConfig();
    const uptime = Date.now() - startedAt;
    sendJson(res, 200, {
      nodeId: config.nodeId,
      displayName: config.displayName,
      uptime,
      uptimeHuman: formatUptime(uptime),
      platform: os.platform(),
      hostname: os.hostname(),
      arch: os.arch(),
      gatewayConnected: config.gateway.pairingState === "paired" && config.gateway.token.length > 0,
      gatewayUrl: config.gateway.url,
      pairingState: config.gateway.pairingState,
      version: process.env.npm_package_version ?? "unknown",
    });
    return;
  }

  // ── GET /api/hardware ──
  if (pathname === "/api/hardware" && method === "GET") {
    try {
      const capabilities = await detectNodeCapabilities();
      sendJson(res, 200, capabilities);
    } catch (err) {
      sendError(res, 500, `Hardware detection failed: ${String(err)}`);
    }
    return;
  }

  // ── GET /api/config ──
  if (pathname === "/api/config" && method === "GET") {
    const config = loadNodeConfig();
    // Redact token for security
    const safe = {
      ...config,
      gateway: { ...config.gateway, token: config.gateway.token ? "***" : "" },
    };
    sendJson(res, 200, safe);
    return;
  }

  // ── POST /api/config ──
  if (pathname === "/api/config" && method === "POST") {
    try {
      const body = await readBody(req);
      const patch = JSON.parse(body) as Partial<NodeConfig>;
      // Don't allow overwriting the token via config endpoint
      if (patch.gateway) {
        delete (patch.gateway as Record<string, unknown>).token;
      }
      const updated = updateNodeConfig(patch);
      sendJson(res, 200, {
        ok: true,
        config: {
          ...updated,
          gateway: { ...updated.gateway, token: updated.gateway.token ? "***" : "" },
        },
      });
    } catch (err) {
      sendError(res, 400, `Invalid config: ${String(err)}`);
    }
    return;
  }

  // ── POST /api/pair ──
  if (pathname === "/api/pair" && method === "POST") {
    try {
      const body = await readBody(req);
      const { gatewayUrl } = JSON.parse(body) as { gatewayUrl: string };
      if (!gatewayUrl) {
        sendError(res, 400, "gatewayUrl is required");
        return;
      }
      const result = await requestPairing(gatewayUrl);
      sendJson(res, 200, result);
    } catch (err) {
      sendError(res, 500, `Pairing failed: ${String(err)}`);
    }
    return;
  }

  // ── GET /api/pair/status ──
  if (pathname === "/api/pair/status" && method === "GET") {
    sendJson(res, 200, getPairingStatus());
    return;
  }

  // ── POST /api/pair/accept (callback from gateway) ──
  if (pathname === "/api/pair/accept" && method === "POST") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as PairAcceptPayload;
      const result = acceptPairing(payload);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (err) {
      sendError(res, 400, `Invalid accept payload: ${String(err)}`);
    }
    return;
  }

  // ── GET /api/plugins ──
  if (pathname === "/api/plugins" && method === "GET") {
    // Return enabled plugins and their status
    const config = loadNodeConfig();
    sendJson(res, 200, {
      enabledPlugins: config.enabledPlugins,
      pluginAffinities: config.pluginAffinities,
    });
    return;
  }

  // ── POST /api/plugins/:id/activate ──
  if (pathname.startsWith("/api/plugins/") && pathname.endsWith("/activate") && method === "POST") {
    const pluginId = pathname.split("/")[3];
    const config = loadNodeConfig();
    if (!config.enabledPlugins.includes(pluginId)) {
      config.enabledPlugins.push(pluginId);
      updateNodeConfig({ enabledPlugins: config.enabledPlugins });
    }
    sendJson(res, 200, { ok: true, pluginId, action: "activated" });
    return;
  }

  // ── POST /api/plugins/:id/deactivate ──
  if (
    pathname.startsWith("/api/plugins/") &&
    pathname.endsWith("/deactivate") &&
    method === "POST"
  ) {
    const pluginId = pathname.split("/")[3];
    const config = loadNodeConfig();
    config.enabledPlugins = config.enabledPlugins.filter((id) => id !== pluginId);
    updateNodeConfig({ enabledPlugins: config.enabledPlugins });
    sendJson(res, 200, { ok: true, pluginId, action: "deactivated" });
    return;
  }

  // ── GET /api/llm ──
  if (pathname === "/api/llm" && method === "GET") {
    try {
      const status = await getLlmRuntimeStatus();
      sendJson(res, 200, status);
    } catch (err) {
      sendError(res, 500, `LLM status failed: ${String(err)}`);
    }
    return;
  }

  // ── GET /api/workloads ──
  if (pathname === "/api/workloads" && method === "GET") {
    // Placeholder: return active workers/jobs from the bus if available
    sendJson(res, 200, {
      activeWorkers: [],
      fanOutJobs: [],
      pipelines: [],
      message: "Workload data available when connected to a gateway with active plugins",
    });
    return;
  }

  // ── GET /api/logs (SSE) ──
  if (pathname === "/api/logs" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    // Send initial event
    res.write(
      `data: ${JSON.stringify({ level: "info", message: "Log stream connected", ts: new Date().toISOString() })}\n\n`,
    );
    // Keep alive
    const interval = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: "heartbeat", ts: new Date().toISOString() })}\n\n`);
    }, 15_000);
    req.on("close", () => clearInterval(interval));
    return;
  }

  // ── GET /api/windows ──
  if (pathname === "/api/windows" && method === "GET") {
    const config = loadNodeConfig();
    if (os.platform() !== "win32") {
      sendJson(res, 200, { available: false, reason: "Not a Windows platform" });
      return;
    }
    try {
      const serviceRes = await fetch(`${config.windows.serviceUrl}/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (serviceRes.ok) {
        const data = await serviceRes.json();
        sendJson(res, 200, { available: true, ...data });
      } else {
        sendJson(res, 200, { available: false, reason: "Service not responding" });
      }
    } catch {
      sendJson(res, 200, {
        available: false,
        reason: "Windows companion service not running",
        serviceUrl: config.windows.serviceUrl,
      });
    }
    return;
  }

  // ── 404 ──
  sendError(res, 404, `Unknown API endpoint: ${method} ${pathname}`);
}

// ─── Static File Serving ────────────────────────────────────────

function serveStatic(res: http.ServerResponse, pathname: string, staticRoot: string): void {
  // Normalise path
  let relPath = pathname === "/" ? "/index.html" : pathname;
  relPath = relPath.replace(/\.\./g, ""); // security

  const filePath = path.join(staticRoot, relPath);

  // Security: ensure file is within static root
  if (!filePath.startsWith(staticRoot)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA fallback
  const indexPath = path.join(staticRoot, "index.html");
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  sendError(res, 404, "Not found");
}

// ─── Server Entry ───────────────────────────────────────────────

export function startNodeUiServer(): http.Server {
  const config = loadNodeConfig();
  const port = config.ui.port;
  const bindAddress = config.ui.bindAddress;
  const staticRoot = resolveStaticRoot();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith("/api/")) {
      try {
        await handleApi(req, res, pathname, method);
      } catch (err) {
        logger.error("API error", { pathname, error: String(err) });
        sendError(res, 500, "Internal server error");
      }
      return;
    }

    // Static files
    serveStatic(res, pathname, staticRoot);
  });

  server.listen(port, bindAddress, () => {
    logger.info(`🖥️  HoC Node Web UI running at http://${bindAddress}:${port}`);
    logger.info(`   Open http://localhost:${port} in your browser`);
  });

  return server;
}

// ─── Utility ────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
