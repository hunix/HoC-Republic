import type { Transform } from "node:stream";
import type { TlsOptions } from "node:tls";
import type { WebSocketServer } from "ws";
import * as fs from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import * as nodePath from "node:path";
import { createGzip, createBrotliCompress, constants as zlibConstants } from "node:zlib";
import type { CanvasHostHandler } from "../canvas-host/server.js";
import type { createSubsystemLogger } from "../logging/subsystem.js";
import type { GatewayWsClient } from "./server/ws-types.js";
import { resolveAgentAvatar } from "../agents/identity-avatar.js";
import {
  A2UI_PATH,
  CANVAS_HOST_PATH,
  CANVAS_WS_PATH,
  handleA2uiHttpRequest,
} from "../canvas-host/a2ui.js";
import { loadConfig } from "../config/config.js";
import { handleSlackHttpRequest } from "../slack/http/index.js";
import { authorizeGatewayConnect, isLocalDirectRequest, type ResolvedGatewayAuth } from "./auth.js";
import {
  handleControlUiAvatarRequest,
  handleControlUiHttpRequest,
  type ControlUiRootState,
} from "./control-ui.js";
import { applyHookMappings } from "./hooks-mapping.js";
import {
  extractHookToken,
  getHookChannelError,
  normalizeAgentPayload,
  normalizeHookHeaders,
  normalizeWakePayload,
  readJsonBody,
  resolveHookChannel,
  resolveHookDeliver,
  type HookMessageChannel,
  type HooksConfigResolved,
} from "./hooks.js";
import { sendUnauthorized } from "./http-common.js";
import { getBearerToken, getHeader } from "./http-utils.js";
import { resolveGatewayClientIp } from "./net.js";
import { handleOpenAiHttpRequest } from "./openai-http.js";
import { handleOpenResponsesHttpRequest } from "./openresponses-http.js";
import {
  addPairRequest,
  listPairRequests,
  approvePairRequest,
  rejectPairRequest,
  // oxlint-disable-next-line no-unused-vars
  type PairRequestEntry,
} from "./pair-request-store.js";
import { getPreviewUrl } from "./preview-server-manager.js";
import { handlePublicApiRequest } from "./public-api-handler.js";
import { handleFederationHttpRequest } from "./server-federation.js";
import { handleToolsInvokeHttpRequest } from "./tools-invoke-http.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

type HookDispatchers = {
  dispatchWakeHook: (value: { text: string; mode: "now" | "next-heartbeat" }) => void;
  dispatchAgentHook: (value: {
    message: string;
    name: string;
    wakeMode: "now" | "next-heartbeat";
    sessionKey: string;
    deliver: boolean;
    channel: HookMessageChannel;
    to?: string;
    model?: string;
    thinking?: string;
    timeoutSeconds?: number;
    allowUnsafeExternalContent?: boolean;
  }) => string;
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

// ─── Shared MIME Map ────────────────────────────────────────────────
// Single source of truth — replaces 3 duplicated maps.
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".7z": "application/x-7z-compressed",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "text/xml; charset=utf-8",
  ".yaml": "text/plain; charset=utf-8",
  ".yml": "text/plain; charset=utf-8",
  ".py": "text/plain; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".obj": "text/plain; charset=utf-8",
  ".stl": "application/octet-stream",
  ".wasm": "application/wasm",
  ".gguf": "application/octet-stream",
  ".onnx": "application/octet-stream",
  ".safetensors": "application/octet-stream",
};

// ─── Compression & Caching Helpers ──────────────────────────────────

const COMPRESSIBLE_EXTS = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".md",
  ".csv",
  ".xml",
  ".yaml",
  ".yml",
  ".py",
  ".ts",
]);

const INLINE_EXTS = new Set([
  ".pdf",
  ".html",
  ".htm",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".bmp",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
  ".ogg",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".css",
  ".js",
]);

function negotiateCompression(req: IncomingMessage, res: ServerResponse): Transform | null {
  const accept = req.headers["accept-encoding"] ?? "";
  if (typeof accept === "string" && accept.includes("br")) {
    res.setHeader("Content-Encoding", "br");
    return createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } });
  }
  if (typeof accept === "string" && accept.includes("gzip")) {
    res.setHeader("Content-Encoding", "gzip");
    return createGzip({ level: 6 });
  }
  return null;
}

/** Serve a static file with compression, ETag, and proper caching. */
function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  absPath: string,
  opts?: { disposition?: "inline" | "attachment"; cors?: boolean },
): void {
  const ext = nodePath.extname(absPath).toLowerCase();
  const basename = nodePath.basename(absPath);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const stat = fs.statSync(absPath);

  res.setHeader("Content-Type", contentType);
  if (opts?.cors) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  // Cache: immutable for hashed assets, 1h for public static, no-cache for dynamic
  res.setHeader("Cache-Control", "public, max-age=3600");

  // ETag for conditional requests
  const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.statusCode = 304;
    res.end();
    return;
  }

  // Disposition
  if (opts?.disposition) {
    res.setHeader("Content-Disposition", `${opts.disposition}; filename="${basename}"`);
  }

  res.statusCode = 200;

  // Compress text-based formats
  if (COMPRESSIBLE_EXTS.has(ext)) {
    const compress = negotiateCompression(req, res);
    if (compress) {
      fs.createReadStream(absPath).pipe(compress).pipe(res);
      return;
    }
  }

  // Uncompressed: set Content-Length and stream
  res.setHeader("Content-Length", stat.size);
  fs.createReadStream(absPath).pipe(res);
}

function isCanvasPath(pathname: string): boolean {
  return (
    pathname === A2UI_PATH ||
    pathname.startsWith(`${A2UI_PATH}/`) ||
    pathname === CANVAS_HOST_PATH ||
    pathname.startsWith(`${CANVAS_HOST_PATH}/`) ||
    pathname === CANVAS_WS_PATH
  );
}

function hasAuthorizedWsClientForIp(clients: Set<GatewayWsClient>, clientIp: string): boolean {
  for (const client of clients) {
    if (client.clientIp && client.clientIp === clientIp) {
      return true;
    }
  }
  return false;
}

async function authorizeCanvasRequest(params: {
  req: IncomingMessage;
  auth: ResolvedGatewayAuth;
  trustedProxies: string[];
  clients: Set<GatewayWsClient>;
}): Promise<boolean> {
  const { req, auth, trustedProxies, clients } = params;
  if (isLocalDirectRequest(req, trustedProxies)) {
    return true;
  }

  const token = getBearerToken(req);
  if (token) {
    const authResult = await authorizeGatewayConnect({
      auth: { ...auth, allowTailscale: false },
      connectAuth: { token, password: token },
      req,
      trustedProxies,
    });
    if (authResult.ok) {
      return true;
    }
  }

  const clientIp = resolveGatewayClientIp({
    remoteAddr: req.socket?.remoteAddress ?? "",
    forwardedFor: getHeader(req, "x-forwarded-for"),
    realIp: getHeader(req, "x-real-ip"),
    trustedProxies,
  });
  if (!clientIp) {
    return false;
  }
  return hasAuthorizedWsClientForIp(clients, clientIp);
}

export type HooksRequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

export function createHooksRequestHandler(
  opts: {
    getHooksConfig: () => HooksConfigResolved | null;
    bindHost: string;
    port: number;
    logHooks: SubsystemLogger;
  } & HookDispatchers,
): HooksRequestHandler {
  const { getHooksConfig, bindHost, port, logHooks, dispatchAgentHook, dispatchWakeHook } = opts;
  return async (req, res) => {
    const hooksConfig = getHooksConfig();
    if (!hooksConfig) {
      return false;
    }
    const url = new URL(req.url ?? "/", `http://${bindHost}:${port}`);
    const basePath = hooksConfig.basePath;
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
      return false;
    }

    if (url.searchParams.has("token")) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(
        "Hook token must be provided via Authorization: Bearer <token> or X-OpenClaw-Token header (query parameters are not allowed).",
      );
      return true;
    }

    const token = extractHookToken(req);
    if (!token || token !== hooksConfig.token) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Unauthorized");
      return true;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method Not Allowed");
      return true;
    }

    const subPath = url.pathname.slice(basePath.length).replace(/^\/+/, "");
    if (!subPath) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not Found");
      return true;
    }

    const body = await readJsonBody(req, hooksConfig.maxBodyBytes);
    if (!body.ok) {
      const status = body.error === "payload too large" ? 413 : 400;
      sendJson(res, status, { ok: false, error: body.error });
      return true;
    }

    const payload = typeof body.value === "object" && body.value !== null ? body.value : {};
    const headers = normalizeHookHeaders(req);

    if (subPath === "wake") {
      const normalized = normalizeWakePayload(payload as Record<string, unknown>);
      if (!normalized.ok) {
        sendJson(res, 400, { ok: false, error: normalized.error });
        return true;
      }
      dispatchWakeHook(normalized.value);
      sendJson(res, 200, { ok: true, mode: normalized.value.mode });
      return true;
    }

    if (subPath === "agent") {
      const normalized = normalizeAgentPayload(payload as Record<string, unknown>);
      if (!normalized.ok) {
        sendJson(res, 400, { ok: false, error: normalized.error });
        return true;
      }
      const runId = dispatchAgentHook(normalized.value);
      sendJson(res, 202, { ok: true, runId });
      return true;
    }

    if (hooksConfig.mappings.length > 0) {
      try {
        const mapped = await applyHookMappings(hooksConfig.mappings, {
          payload: payload as Record<string, unknown>,
          headers,
          url,
          path: subPath,
        });
        if (mapped) {
          if (!mapped.ok) {
            sendJson(res, 400, { ok: false, error: mapped.error });
            return true;
          }
          if (mapped.action === null) {
            res.statusCode = 204;
            res.end();
            return true;
          }
          if (mapped.action.kind === "wake") {
            dispatchWakeHook({
              text: mapped.action.text,
              mode: mapped.action.mode,
            });
            sendJson(res, 200, { ok: true, mode: mapped.action.mode });
            return true;
          }
          const channel = resolveHookChannel(mapped.action.channel);
          if (!channel) {
            sendJson(res, 400, { ok: false, error: getHookChannelError() });
            return true;
          }
          const runId = dispatchAgentHook({
            message: mapped.action.message,
            name: mapped.action.name ?? "Hook",
            wakeMode: mapped.action.wakeMode,
            sessionKey: mapped.action.sessionKey ?? "",
            deliver: resolveHookDeliver(mapped.action.deliver),
            channel,
            to: mapped.action.to,
            model: mapped.action.model,
            thinking: mapped.action.thinking,
            timeoutSeconds: mapped.action.timeoutSeconds,
            allowUnsafeExternalContent: mapped.action.allowUnsafeExternalContent,
          });
          sendJson(res, 202, { ok: true, runId });
          return true;
        }
      } catch (err) {
        logHooks.warn(`hook mapping failed: ${String(err)}`);
        sendJson(res, 500, { ok: false, error: "hook mapping failed" });
        return true;
      }
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return true;
  };
}

export function createGatewayHttpServer(opts: {
  canvasHost: CanvasHostHandler | null;
  clients: Set<GatewayWsClient>;
  controlUiEnabled: boolean;
  controlUiBasePath: string;
  controlUiRoot?: ControlUiRootState;
  openAiChatCompletionsEnabled: boolean;
  openResponsesEnabled: boolean;
  openResponsesConfig?: import("../config/types.gateway.js").GatewayHttpResponsesConfig;
  handleHooksRequest: HooksRequestHandler;
  handlePluginRequest?: HooksRequestHandler;
  resolvedAuth: ResolvedGatewayAuth;
  tlsOptions?: TlsOptions;
}): HttpServer {
  const {
    canvasHost,
    clients,
    controlUiEnabled,
    controlUiBasePath,
    controlUiRoot,
    openAiChatCompletionsEnabled,
    openResponsesEnabled,
    openResponsesConfig,
    handleHooksRequest,
    handlePluginRequest,
    resolvedAuth,
  } = opts;
  const httpServer: HttpServer = opts.tlsOptions
    ? createHttpsServer(opts.tlsOptions, (req, res) => {
        void handleRequest(req, res);
      })
    : createHttpServer((req, res) => {
        void handleRequest(req, res);
      });

  async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    // Don't interfere with WebSocket upgrades; ws handles the 'upgrade' event.
    if (String(req.headers.upgrade ?? "").toLowerCase() === "websocket") {
      return;
    }

    // ── CORS for cross-origin callers (Mission Control, external UIs) ──
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-OpenClaw-Token",
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Max-Age", "86400");
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
    }

    try {
      const configSnapshot = loadConfig();
      const trustedProxies = configSnapshot.gateway?.trustedProxies ?? [];
      if (await handleHooksRequest(req, res)) {
        return;
      }
      // Federation endpoints — no auth needed (peer gateways use cluster secret)
      if (await handleFederationHttpRequest(req, res)) {
        return;
      }
      // Public Revenue API — /api/v1/* (auth via X-HoC-API-Key header, not gateway session)
      if (await handlePublicApiRequest(req, res)) {
        return;
      }
      if (
        await handleToolsInvokeHttpRequest(req, res, {
          auth: resolvedAuth,
          trustedProxies,
        })
      ) {
        return;
      }
      if (await handleSlackHttpRequest(req, res)) {
        return;
      }
      if (handlePluginRequest && (await handlePluginRequest(req, res))) {
        return;
      }
      if (openResponsesEnabled) {
        if (
          await handleOpenResponsesHttpRequest(req, res, {
            auth: resolvedAuth,
            config: openResponsesConfig,
            trustedProxies,
          })
        ) {
          return;
        }
      }
      if (openAiChatCompletionsEnabled) {
        if (
          await handleOpenAiHttpRequest(req, res, {
            auth: resolvedAuth,
            trustedProxies,
          })
        ) {
          return;
        }
      }
      if (canvasHost) {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (isCanvasPath(url.pathname)) {
          const ok = await authorizeCanvasRequest({
            req,
            auth: resolvedAuth,
            trustedProxies,
            clients,
          });
          if (!ok) {
            sendUnauthorized(res);
            return;
          }
        }
        if (await handleA2uiHttpRequest(req, res)) {
          return;
        }
        if (await canvasHost.handleHttpRequest(req, res)) {
          return;
        }
      }

      // ── Cluster Node Pairing Endpoints ──────────────────────────────
      const reqUrl2 = new URL(req.url ?? "/", "http://localhost");
      if (reqUrl2.pathname.startsWith("/api/cluster/")) {
        const pairPath = reqUrl2.pathname.slice("/api/cluster/".length);

        // POST /api/cluster/pair-request — receive pairing request from a node
        if (pairPath === "pair-request" && req.method === "POST") {
          const body = await readJsonBody(req, 1024 * 64);
          if (!body.ok) {
            sendJson(res, 400, { ok: false, error: body.error ?? "Invalid body" });
            return;
          }
          const payload = body.value as Record<string, unknown>;
          const remoteIp = resolveGatewayClientIp({
            remoteAddr: req.socket?.remoteAddress ?? "",
            forwardedFor: getHeader(req, "x-forwarded-for"),
            realIp: getHeader(req, "x-real-ip"),
            trustedProxies,
          });
          const entry = addPairRequest({
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            nodeId: String(payload.nodeId ?? ""),
            displayName: String(payload.displayName ?? "Unknown Node"),
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            capabilities: (payload.capabilities as any) ?? {},
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            callbackUrl: String(payload.callbackUrl ?? ""),
            challenge: typeof payload.challenge === "string" ? payload.challenge : undefined,
            requestedAt: String(payload.requestedAt ?? new Date().toISOString()),
            remoteIp: remoteIp ?? undefined,
          });
          sendJson(res, 200, { status: entry.status === "approved" ? "approved" : "pending" });
          return;
        }

        // GET /api/cluster/pair-requests — list pending requests (for gateway UI)
        if (pairPath === "pair-requests" && req.method === "GET") {
          const statusFilter = reqUrl2.searchParams.get("status") as
            | "pending"
            | "approved"
            | "rejected"
            | null;
          const requests = listPairRequests(statusFilter ?? undefined);
          sendJson(res, 200, { requests });
          return;
        }

        // POST /api/cluster/pair-approve/:nodeId
        if (pairPath.startsWith("pair-approve/") && req.method === "POST") {
          const nodeId = decodeURIComponent(pairPath.slice("pair-approve/".length));
          const gatewayUrl = `${String(req.headers["x-forwarded-proto"] ?? "http")}://${req.headers.host ?? "localhost"}`;
          const result = await approvePairRequest(nodeId, gatewayUrl);
          sendJson(res, result.ok ? 200 : 400, result);
          return;
        }

        // POST /api/cluster/pair-reject/:nodeId
        if (pairPath.startsWith("pair-reject/") && req.method === "POST") {
          const nodeId = decodeURIComponent(pairPath.slice("pair-reject/".length));
          const ok = rejectPairRequest(nodeId);
          sendJson(res, ok ? 200 : 404, { ok });
          return;
        }
      }

      // ── Agent Sandbox File Downloads (/sandbox-files/*) ───────────────
      // Direct file retrieval from the sandbox container via `docker cp`,
      // bypassing whatever web server (or none) is running on port 8080.
      // This is the reliable download path for agent-generated artifacts.
      const reqUrlSandboxFiles = new URL(req.url ?? "/", "http://localhost");
      if (reqUrlSandboxFiles.pathname.startsWith("/sandbox-files/")) {
        const fileName = decodeURIComponent(
          reqUrlSandboxFiles.pathname.slice("/sandbox-files/".length),
        );
        // Path traversal protection
        if (!fileName || fileName.includes("..") || fileName.startsWith("/")) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Bad Request");
          return;
        }
        // Try /workspace/<fileName> inside the running sandbox container
        const containerPath = `/workspace/${fileName}`;
        try {
          const { execFileSync } = await import("node:child_process");
          // Find the running sandbox container
          const containerName =
            execFileSync(
              "docker",
              [
                "ps",
                "--filter",
                "name=hoc-agent-sandbox",
                "--filter",
                "status=running",
                "--format",
                "{{.Names}}",
              ],
              { timeout: 3000, encoding: "utf-8" },
            )
              .trim()
              .split("\n")[0] ?? "";
          if (!containerName) {
            res.statusCode = 503;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Sandbox container is not running");
            return;
          }
          // Use docker exec cat to stream the file
          const { execFile } = await import("node:child_process");
          const child = execFile(
            "docker",
            ["exec", containerName, "cat", containerPath],
            {
              maxBuffer: 200 * 1024 * 1024, // 200MB
              encoding: "buffer",
            },
            (err, stdout) => {
              if (err) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end(`File not found in sandbox: ${containerPath}`);
                return;
              }
              const ext = nodePath.extname(fileName).toLowerCase();
              const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
              const baseName = nodePath.basename(fileName);
              const disposition = INLINE_EXTS.has(ext) ? "inline" : "attachment";
              res.statusCode = 200;
              res.setHeader("Content-Type", contentType);
              res.setHeader("Content-Length", stdout.length);
              res.setHeader("Content-Disposition", `${disposition}; filename="${baseName}"`);
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(stdout);
            },
          );
          // Prevent unhandled error
          child.on("error", () => {
            if (!res.writableEnded) {
              res.statusCode = 500;
              res.end("Failed to read file from sandbox");
            }
          });
          return;
        } catch {
          res.statusCode = 503;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Sandbox container is not accessible");
          return;
        }
      }

      // ── Agent Sandbox Proxy (/sandbox/*) ────────────────────────────
      // Reverse-proxy to the Docker sandbox container (noVNC / file server
      // on 127.0.0.1:8080). Strips X-Frame-Options so the UI can embed it
      // in an iframe, and sets permissive CORS for file downloads.
      const reqUrlSandbox = new URL(req.url ?? "/", "http://localhost");
      if (reqUrlSandbox.pathname.startsWith("/sandbox/") || reqUrlSandbox.pathname === "/sandbox") {
        const subPath =
          reqUrlSandbox.pathname === "/sandbox"
            ? "/"
            : reqUrlSandbox.pathname.slice("/sandbox/".length);
        const proxyTarget = `http://127.0.0.1:8080/${subPath}${reqUrlSandbox.search}`;
        try {
          const proxyResp = await fetch(proxyTarget, {
            method: req.method ?? "GET",
            headers: { host: "127.0.0.1:8080" },
            signal: AbortSignal.timeout(15_000),
          });
          res.statusCode = proxyResp.status;
          // Copy content-type, strip frame-blocking headers, allow embedding
          const ct = proxyResp.headers.get("content-type");
          if (ct) {
            res.setHeader("Content-Type", ct);
          }
          // Content-Disposition for file downloads
          const cd = proxyResp.headers.get("content-disposition");
          if (cd) {
            res.setHeader("Content-Disposition", cd);
          }
          res.setHeader("Access-Control-Allow-Origin", "*");
          // Explicitly do NOT set X-Frame-Options or frame-ancestors
          const body = await proxyResp.arrayBuffer();
          res.end(Buffer.from(body));
          return;
        } catch {
          // If the web server is down and the request looks like a file download,
          // try the direct docker exec fallback
          if (subPath && subPath !== "/" && nodePath.extname(subPath)) {
            // Redirect to /sandbox-files/ which uses docker exec directly
            res.statusCode = 302;
            res.setHeader("Location", `/sandbox-files/${subPath}`);
            res.end();
            return;
          }
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Sandbox container is not responding (127.0.0.1:8080)");
          return;
        }
      }

      // ── Agent Sandbox noVNC Proxy (/sandbox-novnc/*) ────────────────
      // Reverse-proxy to the noVNC web server inside the Docker sandbox
      // container on 127.0.0.1:6081. This allows the AgentDesktop iframe
      // to embed the desktop view through the gateway (same-origin).
      if (
        reqUrlSandbox.pathname.startsWith("/sandbox-novnc/") ||
        reqUrlSandbox.pathname === "/sandbox-novnc"
      ) {
        const subPath =
          reqUrlSandbox.pathname === "/sandbox-novnc"
            ? "/"
            : reqUrlSandbox.pathname.slice("/sandbox-novnc/".length);
        const proxyTarget = `http://127.0.0.1:6081/${subPath}${reqUrlSandbox.search}`;
        try {
          const proxyResp = await fetch(proxyTarget, {
            method: req.method ?? "GET",
            headers: { host: "127.0.0.1:6081" },
            signal: AbortSignal.timeout(15_000),
          });
          res.statusCode = proxyResp.status;
          const ct = proxyResp.headers.get("content-type");
          if (ct) {
            res.setHeader("Content-Type", ct);
          }
          res.setHeader("Access-Control-Allow-Origin", "*");
          const body = await proxyResp.arrayBuffer();
          res.end(Buffer.from(body));
          return;
        } catch {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Sandbox noVNC is not responding (127.0.0.1:6081)");
          return;
        }
      }

      // ── Project Preview Proxy (/preview/:projectId/*) ──────────────
      // Reverse-proxy from the gateway port to each project's `vite preview`
      // server running on 127.0.0.1:<port>. This lets the browser iframe the
      // preview through the gateway (same-origin) instead of directly hitting
      // a random localhost port (which gets CORS / connection-refused errors).
      const reqUrlRo = new URL(req.url ?? "/", "http://localhost");
      if (reqUrlRo.pathname.startsWith("/preview/")) {
        const parts = reqUrlRo.pathname.slice("/preview/".length).split("/");
        const projectId = parts[0];
        if (projectId) {
          const targetUrl = getPreviewUrl(projectId);
          if (targetUrl) {
            // Forward the request to vite preview
            const subPath = parts.slice(1).join("/");
            const proxyTarget = `${targetUrl}/${subPath}${reqUrlRo.search}`;
            try {
              const proxyResp = await fetch(proxyTarget, {
                method: req.method ?? "GET",
                headers: { host: new URL(targetUrl).host },
                signal: AbortSignal.timeout(10_000),
              });
              res.statusCode = proxyResp.status;
              // Copy content-type and allow iframe embedding
              const ct = proxyResp.headers.get("content-type");
              if (ct) {
                res.setHeader("Content-Type", ct);
              }
              res.setHeader("Access-Control-Allow-Origin", "*");
              // Pipe the body
              const body = await proxyResp.arrayBuffer();
              res.end(Buffer.from(body));
              return;
            } catch {
              res.statusCode = 502;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.end(`Preview server for project ${projectId} is not responding`);
              return;
            }
          }
          // No preview running — 404
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(`No preview server running for project ${projectId}`);
          return;
        }
      }

      // ── Republic Output Files (productions/lovable/media previews) ──
      // IMPORTANT: this MUST be before the control-UI SPA handler, which acts as
      // a catch-all and would otherwise intercept /republic-output/* requests,
      // serve index.html with X-Frame-Options:DENY, and block preview iframes.
      if (reqUrlRo.pathname.startsWith("/republic-output/")) {
        const relPath = decodeURIComponent(reqUrlRo.pathname.slice("/republic-output/".length));
        // Path traversal protection
        if (relPath.includes("..") || relPath.includes("\\") || relPath.startsWith("/")) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Bad Request");
          return;
        }
        const absPath = nodePath.join(process.cwd(), "republic-output", relPath);
        if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
          return;
        }
        serveStaticFile(req, res, absPath, { cors: true });
        return;
      }

      // ── Games Static Files (/games/*) ──────────────────────────────
      // Serves HTML games from republic-output/games/ — these are loaded
      // in iframes (PoolGame page, Lovable page). Must be handled BEFORE
      // the control-ui SPA catch-all which would serve index.html instead.
      if (reqUrlRo.pathname.startsWith("/games/")) {
        const relGamePath = decodeURIComponent(reqUrlRo.pathname.slice("/games/".length));
        // Path traversal protection
        if (
          relGamePath.includes("..") ||
          relGamePath.includes("\\") ||
          relGamePath.startsWith("/")
        ) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Bad Request");
          return;
        }
        const absGamePath = nodePath.join(process.cwd(), "republic-output", "games", relGamePath);
        if (!fs.existsSync(absGamePath) || !fs.statSync(absGamePath).isFile()) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
          return;
        }
        serveStaticFile(req, res, absGamePath, { cors: true });
        return;
      }

      // ── Research Output Files (/research/{jobId}/{filename}) ─────────
      if (reqUrlRo.pathname.startsWith("/research/")) {
        const relPath = decodeURIComponent(reqUrlRo.pathname.slice("/research/".length));
        // Path traversal protection
        if (relPath.includes("..") || relPath.includes("\\") || relPath.startsWith("/")) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Bad Request");
          return;
        }
        const absResPath = nodePath.join(process.cwd(), "republic-output", "research", relPath);
        if (!fs.existsSync(absResPath) || !fs.statSync(absResPath).isFile()) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
          return;
        }
        serveStaticFile(req, res, absResPath, { disposition: "attachment", cors: true });
        return;
      }

      if (controlUiEnabled) {
        if (
          handleControlUiAvatarRequest(req, res, {
            basePath: controlUiBasePath,
            resolveAvatar: (agentId) => resolveAgentAvatar(configSnapshot, agentId),
          })
        ) {
          return;
        }
        if (
          handleControlUiHttpRequest(req, res, {
            basePath: controlUiBasePath,
            config: configSnapshot,
            root: controlUiRoot,
          })
        ) {
          return;
        }
      }

      // ── Health probe (for self-healing watchdog + external load balancers) ──
      // Must come LAST so specific routes (canvas, preview, etc.) take priority.
      // Returns 200 whenever the gateway process is alive and serving requests.
      if (reqUrlRo.pathname === "/health" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          uptime: Math.round(process.uptime()),
          ts: Date.now(),
        });
        return;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not Found");
    } catch {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Internal Server Error");
    }
  }

  return httpServer;
}

export function attachGatewayUpgradeHandler(opts: {
  httpServer: HttpServer;
  wss: WebSocketServer;
  canvasHost: CanvasHostHandler | null;
  clients: Set<GatewayWsClient>;
  resolvedAuth: ResolvedGatewayAuth;
}) {
  const { httpServer, wss, canvasHost, clients, resolvedAuth } = opts;
  httpServer.on("upgrade", (req, socket, head) => {
    // ── Agent Sandbox WebSocket Proxy (noVNC) ────────────────
    const urlObj = new URL(req.url ?? "/", "http://localhost");
    if (urlObj.pathname === "/sandbox-novnc/websockify") {
      import("node:net")
        .then((net) => {
          // Proxy to the noVNC websockify server inside sandbox at 6081
          const proxySocket = net.connect(6081, "127.0.0.1", () => {
            const reqLine = `${req.method} /websockify${urlObj.search} HTTP/${req.httpVersion}\r\n`;
            let headers = "";
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
              headers += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
            }
            proxySocket.write(reqLine + headers + "\r\n");
            proxySocket.write(head);
            socket.pipe(proxySocket);
            proxySocket.pipe(socket);
          });
          proxySocket.on("error", () => socket.destroy());
          socket.on("error", () => proxySocket.destroy());
        })
        .catch(() => socket.destroy());
      return;
    }

    void (async () => {
      if (canvasHost) {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === CANVAS_WS_PATH) {
          const configSnapshot = loadConfig();
          const trustedProxies = configSnapshot.gateway?.trustedProxies ?? [];
          const ok = await authorizeCanvasRequest({
            req,
            auth: resolvedAuth,
            trustedProxies,
            clients,
          });
          if (!ok) {
            socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
            socket.destroy();
            return;
          }
        }
        if (canvasHost.handleUpgrade(req, socket, head)) {
          return;
        }
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    })().catch(() => {
      socket.destroy();
    });
  });
}
