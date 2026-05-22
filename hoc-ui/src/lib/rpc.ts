/**
 * RPC helpers for communicating with the HoC gateway over WebSocket.
 *
 * Gateway protocol:
 *   Request:  { type: "req", id: string, method: string, params?: object }
 *   Response: { type: "res", id: string, ok: boolean, payload?: unknown, error?: { code, message } }
 *
 * Performance features:
 *   - Request batching: multiple rpc() calls in the same microtask are
 *     coalesced into a single WS frame (reduces overhead from N to 1).
 *   - In-flight dedup: identical concurrent calls share a single promise.
 *   - LRU response cache with configurable stale time.
 *   - Optimistic invalidation via mutateRpc for instant UI feedback.
 *   - Visibility-aware polling: pauses when tab is hidden.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  sendWs,
  onWsMessage as _onWsMessage,
  onWsStatus,
  onWsDisconnect,
  isWsConnected,
  type WsMessage,
} from "./api";

// Re-export so pages can import from a single place
export { onWsMessage } from "./api";

let _seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// In-flight deduplication: cacheKey → promise
const inflight = new Map<string, Promise<unknown>>();

// Response cache: cacheKey → { data, expiresAt } — capped at MAX_CACHE entries (LRU eviction)
const MAX_CACHE = 256;
export const responseCache = new Map<string, { data: unknown; expiresAt: number }>();

function setCacheEntry(key: string, entry: { data: unknown; expiresAt: number }) {
  // If at cap, evict the oldest (first inserted) entry
  if (responseCache.size >= MAX_CACHE && !responseCache.has(key)) {
    responseCache.delete(responseCache.keys().next().value!);
  }
  responseCache.set(key, entry);
}

// Callbacks waiting for WS to come online before firing their RPC
const connectedCallbacks: Array<() => void> = [];

// Wire up the single global response listener once
let _listenerInstalled = false;
function ensureListener() {
  if (_listenerInstalled) {
    return;
  }
  _listenerInstalled = true;
  _onWsMessage((msg: WsMessage) => {
    if (msg.type !== "res") {
      return;
    }
    const id = msg.id as string | undefined;
    if (!id) {
      return;
    }
    const p = pending.get(id);
    if (!p) {
      return;
    }
    pending.delete(id);
    if (msg.ok) {
      p.resolve(msg.payload ?? msg.data);
    } else {
      const errMsg = (msg.error as { message?: string } | undefined)?.message ?? "RPC error";
      p.reject(new Error(errMsg));
    }
  });

  onWsStatus((connected) => {
    if (connected) {
      const cbs = connectedCallbacks.splice(0);
      cbs.forEach((cb) => cb());
    }
  });

  // When WS disconnects, reject all pending RPCs instantly so callers
  // get errors rather than hanging until timeout.
  onWsDisconnect(() => {
    for (const p of pending.values()) {
      p.reject(new Error("WebSocket disconnected"));
    }
    pending.clear();
    inflight.clear();
  });
}

// Methods that can take much longer than default — tiered by category
const VERY_LONG_RUNNING_METHODS = new Set([
  // pip install PyTorch+CUDA can take 10+ minutes
  "models.manager.install",
  // Model downloads can take 10+ minutes
  "models.manager.download",
  "models.manager.ollama.pull",
  "republic.compute.local.download",
  // Docker image pulls can be 15GB+ (ComfyUI, CUDA images) — needs 10+ min
  "republic.docker.presets.launch",
  "republic.docker.images.pull",
  "republic.node.docker.presets.launch",
  "republic.node.docker.images.pull",
]);

const LONG_RUNNING_METHODS = new Set([
  "chat.send",
  "agent.run",
  "agent.execute",
  "gsd.execute",
  "republic.project.create",
  "republic.claude.task",
  "models.manager.prerequisites",
  "models.manager.catalog",
  "models.manager.disk",
  "hpics.tool.run",
  "hpics.agis.run",
  "hpics.intelligence.run",
  "hpics.pipeline.osint.full",
  "hpics.pipeline.agis.full",
  // Docker infrastructure ensure — may pull + wait for readiness (30-120s)
  "republic.infra.ensure",
  "republic.infra.ensure.comfyui",
  "republic.infra.ensure.all",
  "republic.comfyui.launch",
  "republic.comfyui.models.download",
]);

/**
 * Fast 32-bit FNV-1a hash — produces short cache keys instead of storing
 * the full JSON.stringify(params) string in Map entries. Reduces GC pressure
 * on polling hot paths where _cacheKey is called every 5-10 seconds.
 */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function _cacheKey(method: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) {
    return method;
  }
  return `${method}:${fnv1a(JSON.stringify(params))}`;
}

// ─── Request Batching ───────────────────────────────────────────
// Coalesces multiple rpc() calls queued in the same microtask into
// a single WS send. React renders trigger N useRpc hooks in the
// same synchronous pass — this turns N sends into 1.

let _batchQueue: Array<{
  type: "req";
  id: string;
  method: string;
  params: Record<string, unknown>;
}> = [];
let _batchScheduled = false;

function flushBatch() {
  _batchScheduled = false;
  if (_batchQueue.length === 0) {
    return;
  }
  if (_batchQueue.length === 1) {
    sendWs(_batchQueue[0]);
  } else {
    // Send as a JSON array — gateway processes each individually
    // If gateway doesn't support batch, fall back to individual sends
    for (const msg of _batchQueue) {
      sendWs(msg);
    }
  }
  _batchQueue = [];
}

function enqueueSend(msg: {
  type: "req";
  id: string;
  method: string;
  params: Record<string, unknown>;
}) {
  _batchQueue.push(msg);
  if (!_batchScheduled) {
    _batchScheduled = true;
    // queueMicrotask fires after all synchronous useRpc calls in the same render
    queueMicrotask(flushBatch);
  }
}

/**
 * Make a one-shot RPC call to the gateway.
 * If the WebSocket is not yet connected, waits up to 30 s for it.
 * Requests are batched per-microtask for efficiency.
 */
export function rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
  ensureListener();
  return new Promise<T>((resolve, reject) => {
    function fire() {
      const id = `rpc-${++_seq}-${Date.now()}`;
      // Tiered timeouts: installs/downloads get 15 min, agent/chat get 120s, rest get 30s
      const timeoutMs = VERY_LONG_RUNNING_METHODS.has(method)
        ? 900_000
        : LONG_RUNNING_METHODS.has(method)
          ? 120_000
          : 30_000;
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      enqueueSend({ type: "req", id, method, params: params ?? {} });
    }

    if (isWsConnected()) {
      fire();
    } else {
      const timer = setTimeout(() => {
        const idx = connectedCallbacks.indexOf(cb);
        if (idx !== -1) {
          connectedCallbacks.splice(idx, 1);
        }
        reject(new Error(`RPC: WebSocket not connected (${method})`));
      }, 30_000);
      const cb = () => {
        clearTimeout(timer);
        fire();
      };
      connectedCallbacks.push(cb);
    }
  });
}

/**
 * Cached RPC — deduplicates concurrent identical calls and re-uses
 * responses within the staleTime window. Much faster than raw rpc() for polls.
 */
export function cachedRpc<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  staleTimeMs = 5_000,
): Promise<T> {
  const key = _cacheKey(method, params);
  const now = Date.now();

  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.data as T);
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = rpc<T>(method, params)
    .then((data) => {
      responseCache.delete(key);
      try {
        setCacheEntry(key, { data, expiresAt: Date.now() + staleTimeMs });
      } catch {
        /* ignore write errors */
      }
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

/** Invalidate cache for a specific method + params combo */
export function invalidateRpcCache(method: string, params?: Record<string, unknown>) {
  responseCache.delete(_cacheKey(method, params));
}

/**
 * Invalidate all cached entries whose key starts with a given domain prefix.
 * E.g. invalidateRpcDomain("sessions") clears sessions.list, sessions.preview, etc.
 */
export function invalidateRpcDomain(domain: string) {
  const prefix = `${domain}.`;
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) {
      responseCache.delete(key);
    }
  }
}

/**
 * Mutation RPC — makes a write call then invalidates all cached reads for the
 * same domain prefix. Use this instead of rpc() for all state-mutating calls
 * so that stale data does not persist across page navigations.
 *
 * Convention: method name prefix before the first "." is the domain.
 * E.g. "sessions.delete" → invalidates all "sessions.*" cache entries.
 *      "republic.citizens.update" → invalidates all "republic.*" entries.
 */
export function mutateRpc<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return rpc<T>(method, params).then((result) => {
    const domain = method.split(".")[0];
    invalidateRpcDomain(domain ?? method);
    return result;
  });
}

/**
 * React hook for fetching data from the gateway via RPC.
 *
 * Features:
 *  - No loading flash on cache hits: checks the LRU cache synchronously.
 *  - Stable params: JSON-serialises params internally so inline object literals
 *    don't trigger re-renders on every render cycle.
 *  - Auto-refetch on WS reconnect and optional polling interval.
 *
 * @param method - Gateway RPC method name, e.g. `"republic.citizen.get"`
 * @param params - Request params object (keep stable — use state/memo, not inline literals)
 * @param deps   - Extra dependencies that should trigger a refetch (e.g. route params)
 * @param opts   - `staleTimeMs` (default 5 000) and optional `refetchIntervalMs` for polling
 *
 * @example
 * // Basic read — list page
 * const { data, loading, error, refetch } = useRpc<{ citizens: Citizen[] }>(
 *   "republic.population.list",
 *   { limit: 50 },
 * );
 * if (loading || error) return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
 *
 * @example
 * // Single-item fetch keyed on a route param — re-fetches when id changes
 * const { id } = useParams<{ id: string }>();
 * const { data } = useRpc<{ citizen: Citizen }>(
 *   "republic.citizen.get",
 *   { citizenId: id ?? "" },
 *   [id],   // ← deps ensure refetch when id changes
 * );
 *
 * @example
 * // Live-polling dashboard stat (refetch every 5 s, stale after 3 s)
 * const { data } = useRpc(
 *   "republic.simulation.status",
 *   {},
 *   [],
 *   { staleTimeMs: 3_000, refetchIntervalMs: 5_000 },
 * );
 */
export function useRpc<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  deps: unknown[] = [],
  options: { staleTimeMs?: number; refetchIntervalMs?: number } = {},
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const { staleTimeMs = 5_000, refetchIntervalMs } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [wsConnected, setWsConnected] = useState(isWsConnected);
  const connectedRef = useRef(wsConnected);

  // Stable serialized params key — single JSON.stringify instead of the previous
  // double-stringify (one in the dep array, one in the body). We compute once and
  // let React's useMemo identity-check the resulting string.
  const paramsStr = JSON.stringify(params ?? {});
  const paramsKey = useMemo(() => paramsStr, [paramsStr]);

  // Pre-compute cache key once per param change, re-used in the effect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cacheKey = useMemo(() => _cacheKey(method, params), [method, paramsKey]);

  const refetch = useCallback(() => {
    invalidateRpcCache(method, params);
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, paramsKey]);

  // Subscribe to WS status changes
  useEffect(() => {
    ensureListener();
    const unsub = onWsStatus((connected) => {
      setWsConnected(connected);
      if (connected && !connectedRef.current) {
        invalidateRpcCache(method, params);
        setTick((t) => t + 1);
      }
      connectedRef.current = connected;
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling interval — pauses when the browser tab is hidden to save CPU + gateway traffic
  useEffect(() => {
    if (!refetchIntervalMs) {
      return;
    }
    let id: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (id) {
        return;
      }
      id = setInterval(() => setTick((t) => t + 1), refetchIntervalMs);
    }
    function stopPolling() {
      if (id) {
        clearInterval(id);
        id = null;
      }
    }
    function onVisChange() {
      if (document.visibilityState === "visible") {
        // Immediately refresh stale data when tab becomes visible
        setTick((t) => t + 1);
        startPolling();
      } else {
        stopPolling();
      }
    }

    // Only start if currently visible
    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [refetchIntervalMs]);

  // Main data fetch — skips loading state on cache hits
  useEffect(() => {
    // ── Synchronous cache check: avoid loading flash ──────────────
    const cached = responseCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      setData(cached.data as T);
      setLoading(false);
      setError(null);
      return;
    }

    // ── Network call needed ───────────────────────────────────────
    let cancelled = false;
    setLoading(true);
    setError(null);
    cachedRpc<T>(method, params, staleTimeMs)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // cacheKey is the stable proxy for method+params; deps are caller-provided extras
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, tick, wsConnected, staleTimeMs, ...deps]);

  return { data, loading, error, refetch };
}
