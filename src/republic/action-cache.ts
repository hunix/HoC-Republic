/**
 * Republic Platform — Action Cache
 *
 * Caches deterministic tool results to avoid redundant LLM calls
 * and API requests for identical or near-identical state+tool combos.
 *
 * Cache key: hash of (citizenState essentials + toolName + params)
 * TTL: Configurable per tool (default 10 ticks)
 *
 * Only caches read-only tools (market_price, check_balance, etc.)
 * Mutable tools always execute fresh.
 */

// ─── Types ──────────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  result: { tool: string; params: Record<string, unknown> };
  createdAt: number;   // tick
  expiresAt: number;   // tick
  hitCount: number;
}

// ─── Configuration ──────────────────────────────────────────────

/** Default TTL in ticks */
const DEFAULT_TTL_TICKS = 10;

/** Max cache entries */
const MAX_CACHE_SIZE = 500;

/** Tools that are safe to cache (read-only, deterministic) */
const CACHEABLE_TOOLS = new Set([
  "check_balance",
  "view_listings",
  "inspect_infrastructure",
  "view_schedule",
  "check_health",
  "view_inventory",
  "query_knowledge",
  "list_projects",
]);

/** Per-tool TTL overrides (ticks) */
const TOOL_TTL: Record<string, number> = {
  check_balance: 5,        // balance changes frequently
  view_listings: 15,       // listings are more stable
  inspect_infrastructure: 20,
  view_schedule: 8,
  query_knowledge: 30,     // knowledge is very stable
};

// ─── State ──────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();
let totalHits = 0;
let totalMisses = 0;

// ─── Public API ─────────────────────────────────────────────────

/**
 * Check if a tool call result is cached.
 * Returns the cached result if found and not expired.
 */
export function getCachedAction(
  citizenId: string,
  toolName: string,
  params: Record<string, unknown>,
  currentTick: number,
): { tool: string; params: Record<string, unknown> } | null {
  if (!CACHEABLE_TOOLS.has(toolName)) {
    return null;
  }

  const key = computeKey(citizenId, toolName, params);
  const entry = cache.get(key);

  if (!entry || currentTick > entry.expiresAt) {
    // Expired or not found
    if (entry) {
      cache.delete(key);
    }
    totalMisses++;
    return null;
  }

  entry.hitCount++;
  totalHits++;
  return entry.result;
}

/**
 * Store a tool call result in cache.
 * Only stores if the tool is in the cacheable set.
 */
export function cacheAction(
  citizenId: string,
  toolName: string,
  params: Record<string, unknown>,
  result: { tool: string; params: Record<string, unknown> },
  currentTick: number,
): boolean {
  if (!CACHEABLE_TOOLS.has(toolName)) {
    return false;
  }

  const key = computeKey(citizenId, toolName, params);
  const ttl = TOOL_TTL[toolName] ?? DEFAULT_TTL_TICKS;

  cache.set(key, {
    key,
    result,
    createdAt: currentTick,
    expiresAt: currentTick + ttl,
    hitCount: 0,
  });

  // Evict if cache is too large (LRU-style: remove oldest)
  if (cache.size > MAX_CACHE_SIZE) {
    const oldest = [...cache.entries()]
      .toSorted((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) {
      cache.delete(oldest[0]);
    }
  }

  return true;
}

/**
 * Evict all expired entries. Called periodically.
 */
export function evictExpired(currentTick: number): number {
  let evicted = 0;
  for (const [key, entry] of cache) {
    if (currentTick > entry.expiresAt) {
      cache.delete(key);
      evicted++;
    }
  }
  return evicted;
}

/**
 * Cache diagnostics.
 */
export function actionCacheDiagnostics() {
  const total = totalHits + totalMisses;
  return {
    entries: cache.size,
    maxSize: MAX_CACHE_SIZE,
    totalHits,
    totalMisses,
    hitRate: total > 0 ? Math.round((totalHits / total) * 100) / 100 : 0,
    cacheableTools: CACHEABLE_TOOLS.size,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Compute a deterministic cache key.
 * Uses a simple string hash for speed.
 */
function computeKey(citizenId: string, toolName: string, params: Record<string, unknown>): string {
  // Only include citizenId + toolName + sorted params keys/values
  const paramStr = Object.entries(params)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join("&");

  return `${citizenId}|${toolName}|${paramStr}`;
}
