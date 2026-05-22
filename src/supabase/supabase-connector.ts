/**
 * Supabase Command Center — Main Connector
 *
 * Connects outbound to Supabase Realtime + Postgres Changes.
 * No inbound ports. Heartbeat every 30s. Self-registers on startup.
 *
 * Lifecycle:
 *   1. Self-register via Edge Function → obtain INSTANCE_ID
 *   2. Subscribe Realtime Broadcast: hoc:{INSTANCE_ID}  (event: "command")
 *   3. Subscribe Postgres Changes: hoc_commands (INSERT, status=pending)
 *   4. On command: claim → route → write result → broadcast result
 *   5. Heartbeat loop every 30s
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import { routeCommand, listSupportedMethods } from "./method-router.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SupabaseConnectorOptions {
  supabaseUrl: string;
  supabaseKey: string;
  instanceId?: string; // pre-configured; auto-obtained via registration otherwise
  registerSecret?: string; // HOC_REGISTER_SECRET
  instanceName?: string; // display name for this gateway node
  log?: (level: "info" | "warn" | "error", msg: string) => void;
}

export interface ConnectorStatus {
  connected: boolean;
  instanceId: string | null;
  lastHeartbeat: number | null;
  commandsProcessed: number;
  connectedAt: number | null;
  error: string | null;
}

interface CommandRow {
  id: string;
  instance_id: string;
  method: string;
  params: Record<string, unknown>;
  status: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null;
let _channel: RealtimeChannel | null = null;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _instanceId: string | null = null;
let _status: ConnectorStatus = {
  connected: false,
  instanceId: null,
  lastHeartbeat: null,
  commandsProcessed: 0,
  connectedAt: null,
  error: null,
};

// Recent activity log (in-process, last 50 entries)
const _activityLog: Array<{
  ts: number;
  commandId: string;
  method: string;
  status: "ok" | "error";
  duration_ms: number;
}> = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", msg: string, opts?: SupabaseConnectorOptions) {
  const fn = opts?.log ?? ((l, m) => console[l === "info" ? "log" : l](`[supabase] ${m}`));
  fn(level, msg);
}

async function selfRegister(opts: SupabaseConnectorOptions): Promise<string | null> {
  if (opts.instanceId) {
    log("info", `Using pre-configured instance ID: ${opts.instanceId}`, opts);
    return opts.instanceId;
  }
  if (!opts.registerSecret) {
    log("warn", "No HOC_REGISTER_SECRET — skipping self-registration, using generated ID", opts);
    return null;
  }
  try {
    const edgeFnUrl = `${opts.supabaseUrl}/functions/v1/hoc-register`;
    const res = await fetch(edgeFnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: opts.instanceName ?? `hoc-gateway-${process.env.COMPUTERNAME ?? "node"}`,
        secret: opts.registerSecret,
        metadata: {
          version: process.env.npm_package_version ?? "unknown",
          os: process.platform,
          node: process.version,
          methods: listSupportedMethods(),
        },
      }),
    });
    if (!res.ok) {
      log("warn", `Registration failed (${res.status}): ${await res.text()}`, opts);
      return null;
    }
    const data = (await res.json()) as { id?: string };
    if (typeof data.id === "string") {
      log("info", `Registered as instance ${data.id}`, opts);
      return data.id;
    }
    log("warn", `Registration returned no id: ${JSON.stringify(data)}`, opts);
    return null;
  } catch (err) {
    log("warn", `Registration error: ${String(err)}`, opts);
    return null;
  }
}

async function processCommand(
  commandId: string,
  method: string,
  params: Record<string, unknown>,
  client: SupabaseClient,
  channel: RealtimeChannel,
  opts: SupabaseConnectorOptions,
) {
  // 1. Claim the command
  const { error: claimErr } = await client
    .from("hoc_commands")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", commandId)
    .eq("status", "pending");

  if (claimErr) {
    log("warn", `Failed to claim command ${commandId}: ${claimErr.message}`, opts);
    return;
  }

  // 2. Route to handler
  const cmdResult = await routeCommand(method, params);

  // 3. Write result to hoc_command_results
  await client.from("hoc_command_results").insert({
    command_id: commandId,
    payload: cmdResult.payload,
    error: cmdResult.error,
    duration_ms: cmdResult.duration_ms,
  });

  // 4. Update command status
  await client
    .from("hoc_commands")
    .update({ status: cmdResult.error ? "error" : "done" })
    .eq("id", commandId);

  // 5. Broadcast result instantly via Realtime
  await channel.send({
    type: "broadcast",
    event: "result",
    payload: {
      command_id: commandId,
      method,
      payload: cmdResult.payload,
      error: cmdResult.error,
      duration_ms: cmdResult.duration_ms,
    },
  });

  // 6. Update in-process status
  _status.commandsProcessed++;
  _activityLog.push({
    ts: Date.now(),
    commandId,
    method,
    status: cmdResult.error ? "error" : "ok",
    duration_ms: cmdResult.duration_ms,
  });
  if (_activityLog.length > 50) {
    _activityLog.shift();
  }

  log(
    cmdResult.error ? "warn" : "info",
    `[${method}] ${commandId}: ${cmdResult.error ?? "ok"} (${cmdResult.duration_ms}ms)`,
    opts,
  );
}

async function sendHeartbeat(
  client: SupabaseClient,
  instanceId: string,
  opts: SupabaseConnectorOptions,
) {
  try {
    await client.from("hoc_instances").upsert(
      {
        id: instanceId,
        status: "online",
        last_heartbeat: new Date().toISOString(),
        name: opts.instanceName ?? "hoc-gateway",
        metadata: {
          pid: process.pid,
          node: process.version,
          platform: process.platform,
          commands_processed: _status.commandsProcessed,
        },
      },
      { onConflict: "id" },
    );
    _status.lastHeartbeat = Date.now();
  } catch (err) {
    log("warn", `Heartbeat failed: ${String(err)}`, opts);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startSupabaseConnector(opts: SupabaseConnectorOptions): Promise<void> {
  if (_client) {
    log("warn", "Connector already running — call stopSupabaseConnector() first", opts);
    return;
  }

  // 1. Self-register / resolve instance ID
  const instanceId = (await selfRegister(opts)) ?? `hoc-${Date.now()}`;
  _instanceId = instanceId;

  // 2. Create client
  _client = createClient(opts.supabaseUrl, opts.supabaseKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });

  // 3. Subscribe to Realtime Broadcast for instant command delivery
  const channelName = `hoc:${instanceId}`;
  _channel = _client
    .channel(channelName, {
      config: { broadcast: { self: false }, presence: { key: instanceId } },
    })
    .on("broadcast", { event: "command" }, async ({ payload }) => {
      const { id, method, params } = payload as {
        id: string;
        method: string;
        params?: Record<string, unknown>;
      };
      if (!id || !method) {
        return;
      }
      await processCommand(id, method, params ?? {}, _client!, _channel!, opts);
    })
    .on("presence", { event: "sync" }, () => {
      // Presence state available via _channel.presenceState()
    })
    .subscribe((status) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      if (status === "SUBSCRIBED") {
        log("info", `✅ Realtime subscribed: channel ${channelName}`, opts);
        _status.connected = true;
        _status.connectedAt = Date.now();
        _status.error = null;
        // Track own presence
        void _channel!.track({ instanceId, connectedAt: new Date().toISOString() });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
        _status.connected = false;
        _status.error = `Channel ${status}`;
        log("warn", `Realtime channel ${status}`, opts);
      }
    });

  // 4. Subscribe to Postgres Changes on hoc_commands as reliable fallback
  _client
    .channel("hoc-pg-commands")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "hoc_commands",
        filter: `instance_id=eq.${instanceId}`,
      },
      async (payload) => {
        const row = payload.new as CommandRow;
        if (!row || row.status !== "pending") {
          return;
        }
        // Avoid double-processing if already handled via Broadcast
        await processCommand(row.id, row.method, row.params ?? {}, _client!, _channel!, opts);
      },
    )
    .subscribe();

  // 5. Drain any pending commands from before we started
  setTimeout(async () => {
    try {
      const { data: pending } = await _client!
        .from("hoc_commands")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(20);

      if (pending && pending.length > 0) {
        log("info", `Draining ${pending.length} pending commands`, opts);
        for (const row of pending as CommandRow[]) {
          await processCommand(row.id, row.method, row.params ?? {}, _client!, _channel!, opts);
        }
      }
    } catch (err) {
      log("warn", `Drain error: ${String(err)}`, opts);
    }
  }, 2000);

  // 6. Initial heartbeat + interval
  await sendHeartbeat(_client, instanceId, opts);
  _heartbeatTimer = setInterval(() => {
    void sendHeartbeat(_client!, instanceId, opts);
  }, 30_000);

  _status.instanceId = instanceId;
  log("info", `✅ Supabase connector started (instance: ${instanceId})`, opts);
}

export async function stopSupabaseConnector(): Promise<void> {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  if (_channel) {
    await _channel.unsubscribe();
    _channel = null;
  }
  if (_client && _instanceId) {
    // Mark instance as offline
    try {
      await _client.from("hoc_instances").update({ status: "offline" }).eq("id", _instanceId);
    } catch {
      /* best-effort */
    }
    await _client.removeAllChannels();
  }
  _client = null;
  _instanceId = null;
  _status = {
    connected: false,
    instanceId: null,
    lastHeartbeat: null,
    commandsProcessed: 0,
    connectedAt: null,
    error: null,
  };
  console.log("[supabase] Connector stopped");
}

export function getConnectorStatus(): ConnectorStatus {
  return { ..._status };
}

export function getActivityLog() {
  return [..._activityLog];
}
