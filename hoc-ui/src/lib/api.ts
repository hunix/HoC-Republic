/**
 * HoC API Client
 * Connects to the HoC gateway via WebSocket with the full handshake protocol.
 *
 * Gateway WS protocol:
 *   1. Server sends: { type:"event", event:"connect.challenge", payload:{ nonce, ts } }
 *   2. Client sends: { type:"req", method:"connect", id:"...", params:{ client, auth, minProtocol, maxProtocol, role } }
 *   3. Server sends: { type:"res", ... ok:true, payload:{ snapshot, ... } }  → connected
 *   4. All subsequent frames are { type:"req"/"res"/"event" }
 */

// ─── REST ───────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_BASE ?? "";

export async function api<T = unknown>(endpoint: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((opts.headers as Record<string, string>) ?? undefined),
  };

  const res = await fetch(`${BASE}${endpoint}`, { ...opts, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const apiGet = <T>(url: string) => api<T>(url);
export const apiPost = <T>(url: string, body?: unknown) =>
  api<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
export const apiPut = <T>(url: string, body?: unknown) =>
  api<T>(url, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T>(url: string) => api<T>(url, { method: "DELETE" });

// ─── Token helpers ──────────────────────────────────────────────────────────

/** Single canonical storage key for the auth token. */
const TOKEN_KEY = "hoc-token";
/** Legacy keys — removed on next setToken() call to avoid shadowing. */
const LEGACY_TOKEN_KEYS = ["openclaw-token", "gateway-token"];

export function getToken(): string | null {
  // 1. Token injected by gateway into the served HTML: window.__HOC_TOKEN__
  const win = window as unknown as { __HOC_TOKEN__?: string };
  if (win.__HOC_TOKEN__) {
    return win.__HOC_TOKEN__;
  }

  // 2. URL query param (?token=... or ?auth_token=...) — persist and return
  const urlToken =
    new URLSearchParams(window.location.search).get("token") ??
    new URLSearchParams(window.location.search).get("auth_token");
  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken);
    return urlToken;
  }

  // 3. Canonical key
  const canonical = localStorage.getItem(TOKEN_KEY);
  if (canonical) {
    return canonical;
  }

  // 4. Legacy key migration — read once, cleaned up on next setToken()
  for (const k of LEGACY_TOKEN_KEYS) {
    const v = localStorage.getItem(k);
    if (v) {
      return v;
    }
  }

  return null;
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // One-time cleanup: remove legacy keys so they can no longer shadow the canonical one
  for (const k of LEGACY_TOKEN_KEYS) {
    localStorage.removeItem(k);
  }
}

// ─── WebSocket ──────────────────────────────────────────────────────────────

export type WsMessage = {
  type: string;
  [key: string]: unknown;
};

export type WsHandler = (msg: WsMessage) => void;
export type WsStatusHandler = (connected: boolean, snapshot?: Record<string, unknown>) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 3000; // starts at 3 s, doubles up to 60 s
let currentWsUrl: string | undefined;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _handshakeCompleted = false;
const handlers = new Set<WsHandler>();
const statusHandlers = new Set<WsStatusHandler>();
/** Callbacks fired when the socket closes — used by rpc.ts to reject pending calls */
const disconnectCallbacks = new Set<() => void>();

export function onWsDisconnect(cb: () => void): () => void {
  disconnectCallbacks.add(cb);
  return () => disconnectCallbacks.delete(cb);
}

let _seq = 0;
let handshakeId: string | null = null;

function nextId(): string {
  return `ctrl-${++_seq}-${Date.now()}`;
}

function rawSend(msg: WsMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Perform the gateway WS handshake after receiving connect.challenge.
 * Uses webchat-ui client ID which only needs a token — no device crypto signing.
 * Protocol version = 3.
 */
function doHandshake(token: string | null): void {
  const id = nextId();
  handshakeId = id;
  rawSend({
    type: "req",
    method: "connect",
    id,
    params: {
      client: {
        id: "webchat-ui",
        displayName: "HoC Control UI",
        mode: "ui",
        version: "1.0.0",
        platform: "web",
      },
      auth: token ? { token } : {},
      minProtocol: 3,
      maxProtocol: 3,
      role: "operator",
      scopes: ["operator.admin"],
    },
  });
}

export function connectWs(url?: string): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  currentWsUrl = url;
  const wsUrl = url ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    console.error("[HoC] WebSocket error:", e);
    scheduleReconnect();
    return;
  }

  ws.addEventListener("open", () => {
    // Gateway will immediately send connect.challenge — we wait for it.
    // But if the gateway is in local/no-auth mode it may accept without challenge.
  });

  ws.addEventListener("message", (ev) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(ev.data as string) as WsMessage;
    } catch {
      return;
    }

    // Handle connect.challenge — perform handshake
    if (msg.type === "event" && msg.event === "connect.challenge") {
      doHandshake(getToken());
      return;
    }

    // Handle connect response — mark as connected
    if (msg.type === "res" && msg.ok === true && msg.id === handshakeId) {
      handshakeId = null;
      _handshakeCompleted = true;
      const payload = msg.payload as Record<string, unknown> | undefined;
      const snapshot = (payload?.snapshot ?? payload) as Record<string, unknown> | undefined;
      // Notify status handlers
      statusHandlers.forEach((h) => h(true, snapshot));
    }

    // Propagate all messages to registered handlers
    handlers.forEach((h) => h(msg));
  });

  ws.addEventListener("close", () => {
    ws = null;
    _handshakeCompleted = false;
    // Clear heartbeat
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    // Reject all pending RPCs via disconnect callbacks (rpc.ts registers cleanup)
    disconnectCallbacks.forEach((cb) => cb());
    statusHandlers.forEach((h) => h(false));
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    ws?.close();
  });
  // Reset backoff on successful open + start heartbeat keepalive
  ws.addEventListener("open", () => {
    reconnectDelay = 3000;
    // Send a ping every 30s to detect silent disconnects (server or proxy timeout)
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          rawSend({ type: "ping" });
        } catch {
          // Socket write error — will trigger close event
        }
      }
    }, 30_000);
  });
}

function scheduleReconnect(): void {
  if (!reconnectTimer) {
    // Exponential backoff with ±20% jitter, capped at 60 s
    const jitter = 0.8 + Math.random() * 0.4;
    const delay = Math.min(reconnectDelay * jitter, 60000);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWs(currentWsUrl);
    }, delay);
  }
}

export function onWsMessage(handler: WsHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function onWsStatus(handler: WsStatusHandler): () => void {
  statusHandlers.add(handler);
  return () => statusHandlers.delete(handler);
}

export function sendWs(msg: WsMessage): void {
  rawSend(msg);
}

export function disconnectWs(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
}

export function isWsConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN && _handshakeCompleted;
}
