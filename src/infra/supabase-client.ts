/**
 * Supabase Client — Foundation Layer
 *
 * Phase 32A: Singleton Supabase client with dual-mode (cloud + local fallback).
 *
 * When SUPABASE_URL + SUPABASE_ANON_KEY are configured, the client connects
 * to a real Supabase project. Otherwise, it returns `null` and callers fall
 * back to their existing in-memory stores.
 *
 * Architecture:
 *   ┌─────────────┐     ┌─────────────────────┐
 *   │  HoC Module  │──▶  │  getSupabaseClient() │
 *   └─────────────┘     └─────────┬───────────┘
 *                                 │
 *                    ┌────────────┴────────────┐
 *                    │  Supabase configured?    │
 *                    └────┬───────────────┬────┘
 *                    YES  │               │  NO
 *              ┌──────────▼──────┐  ┌─────▼──────┐
 *              │ Cloud Supabase  │  │   null      │
 *              │  (PostgreSQL)   │  │ (fallback)  │
 *              └─────────────────┘  └────────────┘
 */

// ─── Types ──────────────────────────────────────────────────────

/** Supabase configuration sourced from HoC config or env vars. */
export interface SupabaseConfig {
  /** Supabase project URL (e.g. https://xxx.supabase.co) */
  url: string;
  /** Supabase anon/public key */
  anonKey: string;
  /** Supabase service role key (for server-side operations) */
  serviceRoleKey?: string;
}

/**
 * Lightweight Supabase client wrapper.
 *
 * This is a thin abstraction over the Supabase JS client that provides:
 *   - Type-safe table queries via the `from()` builder
 *   - Auth helpers via `auth`
 *   - Realtime subscriptions via `channel()`
 *   - Storage operations via `storage`
 *   - RPC calls via `rpc()`
 *
 * The actual `@supabase/supabase-js` dependency is dynamically imported
 * so that HoC doesn't hard-depend on it unless Supabase is configured.
 */
export interface SupabaseClient {
  /** The underlying @supabase/supabase-js client instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly raw: any;
  /** Project URL */
  readonly url: string;
  /** Whether this client uses the service role key (bypasses RLS) */
  readonly isServiceRole: boolean;

  // ─── Query Builder ──────────────────────────────────────────

  /**
   * Start a query against a table.
   * Returns the Supabase `PostgrestQueryBuilder` for chaining
   * `.select()`, `.insert()`, `.update()`, `.delete()`, `.upsert()`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): unknown;

  /**
   * Call a Postgres function (RPC).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(fn: string, params?: Record<string, unknown>): unknown;

  // ─── Auth ───────────────────────────────────────────────────

  /** Auth helper (signUp, signIn, getSession, etc.) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly auth: any;

  // ─── Realtime ───────────────────────────────────────────────

  /** Create a Realtime channel subscription. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel(name: string, opts?: Record<string, unknown>): unknown;

  /** Remove a Realtime channel. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeChannel(channel: any): Promise<void>;

  // ─── Storage ────────────────────────────────────────────────

  /** Storage bucket operations. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly storage: any;
}

/** Connection status reported by diagnostics. */
export type SupabaseStatus = {
  connected: boolean;
  url: string | null;
  isServiceRole: boolean;
  error: string | null;
  lastCheckedAt: string;
};

// ─── State ──────────────────────────────────────────────────────

let _client: SupabaseClient | null = null;
let _config: SupabaseConfig | null = null;
let _initError: string | null = null;
let _lastCheckedAt: string = "";

// ─── Initialization ─────────────────────────────────────────────

/**
 * Initialize the Supabase client.
 *
 * Call this once during gateway boot with config from the HoC config file
 * or environment variables. If `config` is null/undefined, Supabase is
 * disabled and all callers will use in-memory fallback.
 *
 * @returns true if client was initialized, false if config is missing
 */
export async function initSupabase(config?: SupabaseConfig | null): Promise<boolean> {
  _lastCheckedAt = new Date().toISOString();

  if (!config?.url || !config?.anonKey) {
    _client = null;
    _config = null;
    _initError = null;
    return false;
  }

  _config = config;

  try {
    // Dynamic import so @supabase/supabase-js is only required when configured
    const { createClient } = await import("@supabase/supabase-js");

    const key = config.serviceRoleKey || config.anonKey;
    const isServiceRole = Boolean(config.serviceRoleKey);

    const raw = createClient(config.url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // server-side, no browser storage
      },
      db: {
        schema: "public",
      },
    });

    _client = {
      raw,
      url: config.url,
      isServiceRole,
      from: (table: string) => raw.from(table),
      rpc: (fn: string, params?: Record<string, unknown>) => raw.rpc(fn, params),
      auth: raw.auth,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel: (name: string, opts?: Record<string, unknown>) => raw.channel(name, opts as any),
      removeChannel: async (channel: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await raw.removeChannel(channel as any);
      },
      storage: raw.storage,
    };

    _initError = null;
    return true;
  } catch (err) {
    _initError = err instanceof Error ? err.message : String(err);
    _client = null;
    return false;
  }
}

// ─── Client Access ──────────────────────────────────────────────

/**
 * Get the Supabase client, or `null` if Supabase is not configured.
 *
 * Callers should check for `null` and fall back to in-memory operations.
 *
 * @example
 * ```ts
 * const sb = getSupabaseClient();
 * if (sb) {
 *   const { data } = await sb.from("projects").select("*");
 *   return data ?? [];
 * }
 * // fallback to in-memory
 * return [...projects.values()];
 * ```
 */
export function getSupabaseClient(): SupabaseClient | null {
  return _client;
}

/**
 * Check if Supabase is configured and the client is ready.
 */
export function isSupabaseEnabled(): boolean {
  return _client !== null;
}

/**
 * Get the current Supabase configuration (if set).
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  return _config;
}

// ─── Diagnostics ────────────────────────────────────────────────

/**
 * Get connection diagnostics for the system pulse / health dashboards.
 */
export function getSupabaseStatus(): SupabaseStatus {
  return {
    connected: _client !== null,
    url: _config?.url ?? null,
    isServiceRole: _client?.isServiceRole ?? false,
    error: _initError,
    lastCheckedAt: _lastCheckedAt || new Date().toISOString(),
  };
}

/**
 * Test the connection by performing a lightweight query.
 * Returns true if the connection is healthy.
 */
export async function testSupabaseConnection(): Promise<boolean> {
  _lastCheckedAt = new Date().toISOString();

  if (!_client) {
    return false;
  }

  try {
    // Attempt a lightweight query — just select count from a known table
    // If no tables exist yet, we try a raw RPC or just validate the connection
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = (await _client.rpc("version")) as any;
    if (error) {
      _initError = error.message;
      return false;
    }
    _initError = null;
    return true;
  } catch (err) {
    _initError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

// ─── Shutdown ───────────────────────────────────────────────────

/**
 * Gracefully disconnect the Supabase client.
 * Called during gateway shutdown.
 */
export async function shutdownSupabase(): Promise<void> {
  if (_client?.raw) {
    try {
      // Remove all realtime subscriptions
      await _client.raw.removeAllChannels?.();
    } catch {
      // ignore cleanup errors
    }
  }
  _client = null;
  _initError = null;
}

// ─── Config Resolution ──────────────────────────────────────────

/**
 * Resolve Supabase config from HoC config object or environment variables.
 *
 * Priority:
 *   1. Explicit config object (from gateway.supabase.* keys)
 *   2. Environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
 */
export function resolveSupabaseConfig(
  gatewayConfig?: {
    supabase?: {
      url?: string;
      anonKey?: string;
      serviceRoleKey?: string;
    };
  } | null,
): SupabaseConfig | null {
  // 1. Try explicit config
  const cfgUrl = gatewayConfig?.supabase?.url;
  const cfgAnon = gatewayConfig?.supabase?.anonKey;
  if (cfgUrl && cfgAnon) {
    return {
      url: cfgUrl,
      anonKey: cfgAnon,
      serviceRoleKey: gatewayConfig?.supabase?.serviceRoleKey,
    };
  }

  // 2. Try environment variables
  const envUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envAnon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (envUrl && envAnon) {
    return {
      url: envUrl,
      anonKey: envAnon,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  return null;
}
