import type { IncomingMessage, ServerResponse } from "node:http";
import type { Transform } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { createGzip, createBrotliCompress, constants as zlibConstants } from "node:zlib";
import type { OpenClawConfig } from "../config/config.js";
import {
  readBuildHash,
  resolveControlUiRepoRoot,
  resolveControlUiRootSync,
} from "../infra/control-ui-assets.js";
import { DEFAULT_ASSISTANT_IDENTITY, resolveAssistantIdentity } from "./assistant-identity.js";
import {
  buildControlUiAvatarUrl,
  CONTROL_UI_AVATAR_PREFIX,
  normalizeControlUiBasePath,
  resolveAssistantAvatarUrl,
} from "./control-ui-shared.js";

const ROOT_PREFIX = "/";

export type ControlUiRequestOptions = {
  basePath?: string;
  config?: OpenClawConfig;
  agentId?: string;
  root?: ControlUiRootState;
};

export type ControlUiRootState =
  | { kind: "resolved"; path: string }
  | { kind: "invalid"; path: string }
  | { kind: "missing" };

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

// ─── Compression ─────────────────────────────────────────────────

/** Negotiate content encoding and return a compression transform, or null. */
function negotiateCompression(req: IncomingMessage, res: ServerResponse): Transform | null {
  const accept = req.headers["accept-encoding"] ?? "";
  if (typeof accept === "string" && accept.includes("br")) {
    res.setHeader("Content-Encoding", "br");
    return createBrotliCompress({
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 }, // fast mode
    });
  }
  if (typeof accept === "string" && accept.includes("gzip")) {
    res.setHeader("Content-Encoding", "gzip");
    return createGzip({ level: 6 });
  }
  return null;
}

/** Extensions worth compressing (text-based formats). */
const COMPRESSIBLE_EXTS = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".xml",
  ".ico",
]);

/** Detect Vite-produced hashed assets: `name-Ab3cD4eF.ext` */
const HASHED_ASSET_RE = /[-.]([a-f0-9]{8,})\.(js|css|woff2?|png|jpg|jpeg|gif|webp|svg|avif)$/i;

export type ControlUiAvatarResolution =
  | { kind: "none"; reason: string }
  | { kind: "local"; filePath: string }
  | { kind: "remote"; url: string }
  | { kind: "data"; url: string };

type ControlUiAvatarMeta = {
  avatarUrl: string | null;
};

function applyControlUiSecurityHeaders(res: ServerResponse) {
  // SAMEORIGIN allows the gateway's own pages to embed content in iframes
  // (previews, games, worlds, sandbox desktop). Third-party framing is still blocked.
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Enable cross-origin isolation for WebContainer (SharedArrayBuffer) support.
  // Safe: the control UI has no external CDN resources that would be blocked by COEP.
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(body));
}

function isValidAgentId(agentId: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(agentId);
}

export function handleControlUiAvatarRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { basePath?: string; resolveAvatar: (agentId: string) => ControlUiAvatarResolution },
): boolean {
  const urlRaw = req.url;
  if (!urlRaw) {
    return false;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return false;
  }

  const url = new URL(urlRaw, "http://localhost");
  const basePath = normalizeControlUiBasePath(opts.basePath);
  const pathname = url.pathname;
  const pathWithBase = basePath
    ? `${basePath}${CONTROL_UI_AVATAR_PREFIX}/`
    : `${CONTROL_UI_AVATAR_PREFIX}/`;
  if (!pathname.startsWith(pathWithBase)) {
    return false;
  }

  applyControlUiSecurityHeaders(res);

  const agentIdParts = pathname.slice(pathWithBase.length).split("/").filter(Boolean);
  const agentId = agentIdParts[0] ?? "";
  if (agentIdParts.length !== 1 || !agentId || !isValidAgentId(agentId)) {
    respondNotFound(res);
    return true;
  }

  if (url.searchParams.get("meta") === "1") {
    const resolved = opts.resolveAvatar(agentId);
    const avatarUrl =
      resolved.kind === "local"
        ? buildControlUiAvatarUrl(basePath, agentId)
        : resolved.kind === "remote" || resolved.kind === "data"
          ? resolved.url
          : null;
    sendJson(res, 200, { avatarUrl } satisfies ControlUiAvatarMeta);
    return true;
  }

  const resolved = opts.resolveAvatar(agentId);
  if (resolved.kind !== "local") {
    respondNotFound(res);
    return true;
  }

  if (req.method === "HEAD") {
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypeForExt(path.extname(resolved.filePath).toLowerCase()));
    res.setHeader("Cache-Control", "no-cache");
    res.end();
    return true;
  }

  serveFile(res, resolved.filePath, req);
  return true;
}

function respondNotFound(res: ServerResponse) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not Found");
}

function serveFile(res: ServerResponse, filePath: string, req?: IncomingMessage) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  res.setHeader("Content-Type", contentTypeForExt(ext));

  // Immutable caching for Vite hashed assets (e.g. index-Ab3cD4eF.js)
  if (HASHED_ASSET_RE.test(basename)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-cache");
  }

  // ETag based on mtime + size — enables 304 Not Modified
  try {
    const stat = fs.statSync(filePath);
    const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
    res.setHeader("ETag", etag);
    if (req && req.headers["if-none-match"] === etag) {
      res.statusCode = 304;
      res.end();
      return;
    }
  } catch {
    /* stat may fail — fall through to serve */
  }

  // Stream with compression for compressible text-based formats
  if (req && COMPRESSIBLE_EXTS.has(ext)) {
    const compress = negotiateCompression(req, res);
    if (compress) {
      // Compressed responses must not have Content-Length (chunked encoding)
      res.removeHeader("Content-Length");
      fs.createReadStream(filePath).pipe(compress).pipe(res);
      return;
    }
  }

  // Non-compressed: stream the file (avoids readFileSync memory allocation)
  fs.createReadStream(filePath).pipe(res);
}

interface ControlUiInjectionOpts {
  basePath: string;
  assistantName?: string;
  assistantAvatar?: string;
  token?: string;
  buildVersion?: string;
}

function injectControlUiConfig(html: string, opts: ControlUiInjectionOpts): string {
  const { basePath, assistantName, assistantAvatar, token, buildVersion } = opts;
  const script =
    `<script>` +
    `window.__OPENCLAW_CONTROL_UI_BASE_PATH__=${JSON.stringify(basePath)};` +
    `window.__OPENCLAW_ASSISTANT_NAME__=${JSON.stringify(
      assistantName ?? DEFAULT_ASSISTANT_IDENTITY.name,
    )};` +
    `window.__OPENCLAW_ASSISTANT_AVATAR__=${JSON.stringify(
      assistantAvatar ?? DEFAULT_ASSISTANT_IDENTITY.avatar,
    )};` +
    (token ? `window.__HOC_TOKEN__=${JSON.stringify(token)};` : "") +
    (buildVersion ? `window.__HOC_BUILD_VERSION__=${JSON.stringify(buildVersion)};` : "") +
    `</script>`;
  // Check if already injected
  if (html.includes("__OPENCLAW_ASSISTANT_NAME__")) {
    return html;
  }
  const headClose = html.indexOf("</head>");
  if (headClose !== -1) {
    return `${html.slice(0, headClose)}${script}${html.slice(headClose)}`;
  }
  return `${script}${html}`;
}

interface ServeIndexHtmlOpts {
  basePath: string;
  config?: OpenClawConfig;
  agentId?: string;
}

function serveIndexHtml(res: ServerResponse, indexPath: string, opts: ServeIndexHtmlOpts) {
  const { basePath, config, agentId } = opts;
  const identity = config
    ? resolveAssistantIdentity({ cfg: config, agentId })
    : DEFAULT_ASSISTANT_IDENTITY;
  const resolvedAgentId =
    typeof (identity as { agentId?: string }).agentId === "string"
      ? (identity as { agentId?: string }).agentId
      : agentId;
  const avatarValue =
    resolveAssistantAvatarUrl({
      avatar: identity.avatar,
      agentId: resolvedAgentId,
      basePath,
    }) ?? identity.avatar;
  // Resolve gateway auth token from config so the Control UI can auto-connect
  const gatewayToken: string | undefined =
    config?.gateway?.auth?.token ??
    process.env.OPENCLAW_GATEWAY_TOKEN ??
    process.env.CLAWDBOT_GATEWAY_TOKEN ??
    undefined;
  // Resolve UI build hash for cache-busting
  const repoRoot = resolveControlUiRepoRoot(process.argv[1]);
  const buildVersion = repoRoot ? readBuildHash(repoRoot)?.hash : undefined;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const raw = fs.readFileSync(indexPath, "utf8");
  res.end(
    injectControlUiConfig(raw, {
      basePath,
      assistantName: identity.name,
      assistantAvatar: avatarValue,
      token: gatewayToken,
      buildVersion,
    }),
  );
}

function isSafeRelativePath(relPath: string) {
  if (!relPath) {
    return false;
  }
  const normalized = path.posix.normalize(relPath);
  if (normalized.startsWith("../") || normalized === "..") {
    return false;
  }
  if (normalized.includes("\0")) {
    return false;
  }
  return true;
}

export function handleControlUiHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: ControlUiRequestOptions,
): boolean {
  const urlRaw = req.url;
  if (!urlRaw) {
    return false;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  const url = new URL(urlRaw, "http://localhost");
  const basePath = normalizeControlUiBasePath(opts?.basePath);
  const pathname = url.pathname;

  if (!basePath) {
    if (pathname === "/ui" || pathname.startsWith("/ui/")) {
      applyControlUiSecurityHeaders(res);
      respondNotFound(res);
      return true;
    }
  }

  if (basePath) {
    if (pathname === basePath) {
      applyControlUiSecurityHeaders(res);
      res.statusCode = 302;
      res.setHeader("Location", `${basePath}/${url.search}`);
      res.end();
      return true;
    }
    if (!pathname.startsWith(`${basePath}/`)) {
      return false;
    }
  }

  applyControlUiSecurityHeaders(res);

  const rootState = opts?.root;
  if (rootState?.kind === "invalid") {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      `Control UI assets not found at ${rootState.path}. Build them with \`pnpm ui:build\` (auto-installs UI deps), or update gateway.controlUi.root.`,
    );
    return true;
  }
  if (rootState?.kind === "missing") {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      "Control UI assets not found. Build them with `pnpm ui:build` (auto-installs UI deps), or run `pnpm ui:dev` during development.",
    );
    return true;
  }

  const root =
    rootState?.kind === "resolved"
      ? rootState.path
      : resolveControlUiRootSync({
          moduleUrl: import.meta.url,
          argv1: process.argv[1],
          cwd: process.cwd(),
        });
  if (!root) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      "Control UI assets not found. Build them with `pnpm ui:build` (auto-installs UI deps), or run `pnpm ui:dev` during development.",
    );
    return true;
  }

  const uiPath =
    basePath && pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;

  const rel = (() => {
    if (uiPath === ROOT_PREFIX || uiPath === "") {
      return "index.html";
    }
    const assetsIndex = uiPath.indexOf("/assets/");
    if (assetsIndex >= 0) {
      return uiPath.slice(assetsIndex + 1);
    }
    return uiPath.slice(1);
  })();

  const isFileLike = path.extname(rel) !== "";
  const fileRel = isFileLike ? rel : "index.html";

  if (!isSafeRelativePath(fileRel)) {
    respondNotFound(res);
    return true;
  }

  const filePath = path.join(root, fileRel);
  if (!filePath.startsWith(root)) {
    respondNotFound(res);
    return true;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    if (path.basename(filePath) === "index.html") {
      serveIndexHtml(res, filePath, {
        basePath,
        config: opts?.config,
        agentId: opts?.agentId,
      });
      return true;
    }
    serveFile(res, filePath, req);
    return true;
  }

  // SPA fallback (client-side router): serve index.html for unknown paths.
  const indexPath = path.join(root, "index.html");
  if (fs.existsSync(indexPath)) {
    serveIndexHtml(res, indexPath, {
      basePath,
      config: opts?.config,
      agentId: opts?.agentId,
    });
    return true;
  }

  respondNotFound(res);
  return true;
}
