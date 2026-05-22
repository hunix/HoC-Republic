/**
 * Republic Platform — n8n Workflow Automation Bridge
 *
 * Provides a REST API bridge between the Republic platform and n8n,
 * enabling workflow automation for citizen actions, simulation events,
 * economic triggers, and governance operations.
 *
 * Architecture:
 * - Auto-discovers n8n at localhost:5678 (or N8N_BASE_URL env)
 * - Communicates via n8n REST API v1 (authenticated with API key)
 * - Event forwarding: Republic → n8n via configurable webhooks
 * - Periodic health checks and workflow cache refresh
 * - Graceful degradation when n8n is unavailable
 *
 * Registered on the gateway as `gateway.n8nBridge` so cluster
 * RPC handlers can access it via duck-typing.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";

const log = createSubsystemLogger("republic/n8n-bridge");

// ─── Configuration ──────────────────────────────────────────────

const DEFAULT_BASE_URL = "http://localhost:5678";
const API_PREFIX = "/api/v1";
const HEALTH_CHECK_INTERVAL_MS = 60_000;
const WORKFLOW_CACHE_TTL_MS = 30_000;
const EVENT_RATE_LIMIT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

// ─── Types ──────────────────────────────────────────────────────

/** Status returned to the UI via cluster.status RPC */
export interface N8nBridgeStatus {
  available: boolean;
  url?: string;
  version?: string;
  workflows: N8nWorkflowInfo[];
}

export interface N8nWorkflowInfo {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nodes: number;
}

/** n8n API response for GET /api/v1/workflows */
interface N8nApiWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nodes?: Array<{ type: string; [k: string]: unknown }>;
  [key: string]: unknown;
}

interface N8nApiListResponse {
  data: N8nApiWorkflow[];
  nextCursor?: string;
}

/** Event types the bridge can forward to n8n webhooks */
export type RepublicEventType =
  | "republic.tick"
  | "republic.citizen.born"
  | "republic.citizen.died"
  | "republic.citizen.action"
  | "republic.election"
  | "republic.economy.harvest"
  | "republic.economy.trade"
  | "republic.simulation.mode_change"
  | "republic.project.intake"
  | "republic.objective.complete";

export interface RepublicEvent {
  type: RepublicEventType;
  timestamp: string;
  tick: number;
  payload: Record<string, unknown>;
}

interface WebhookConfig {
  /** n8n webhook URL (e.g. http://localhost:5678/webhook/republic-events) */
  url: string;
  /** Which event types to forward (empty = all) */
  eventTypes: RepublicEventType[];
  /** Custom headers to include */
  headers?: Record<string, string>;
}

// ─── Bridge Class ───────────────────────────────────────────────

export class N8nBridge {
  private baseUrl: string;
  private apiKey: string | null;
  private available = false;
  private version: string | null = null;
  private workflowCache: N8nWorkflowInfo[] = [];
  private lastCacheRefresh = 0;
  private lastHealthCheck = 0;
  private webhooks: WebhookConfig[] = [];
  private eventRateLimits = new Map<string, number>();
  private probeInFlight = false;
  private probeAuthWarned = false;
  private _pendingKeyRetry = false;

  constructor(opts?: {
    baseUrl?: string;
    apiKey?: string | null;
    webhooks?: WebhookConfig[];
  }) {
    this.baseUrl = (opts?.baseUrl ?? process.env.N8N_BASE_URL ?? DEFAULT_BASE_URL)
      .replace(/\/+$/, "");
    this.apiKey = opts?.apiKey ?? process.env.N8N_API_KEY ?? null;
    this.webhooks = opts?.webhooks ?? [];

    // Parse webhook config from environment if not provided
    if (this.webhooks.length === 0 && process.env.N8N_WEBHOOK_URL) {
      this.webhooks.push({
        url: process.env.N8N_WEBHOOK_URL,
        eventTypes: [], // all events
      });
    }

    log.info(`n8n bridge initialized → ${this.baseUrl}`);
  }

  // ─── HTTP Helpers ───────────────────────────────────────────

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: T | null }> {
    const url = `${this.baseUrl}${API_PREFIX}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["X-N8N-API-KEY"] = this.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = response.headers.get("content-type")?.includes("application/json")
        ? ((await response.json()) as T)
        : null;

      return { ok: response.ok, status: response.status, data };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        log.warn(`n8n request timed out: ${method} ${path}`);
      }
      return { ok: false, status: 0, data: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Connection & Health ────────────────────────────────────

  /**
   * Probe n8n for availability and version.
   * Uses GET /api/v1/workflows?limit=1 as a lightweight health check.
   */
  async probe(): Promise<boolean> {
    if (this.probeInFlight) {return this.available;}
    this.probeInFlight = true;

    try {
      const res = await this.request<N8nApiListResponse>("GET", "/workflows?limit=1");

      if (res.ok) {
        if (!this.available) {
          log.info(`n8n connected at ${this.baseUrl}`);
        }
        this.available = true;
        this.lastHealthCheck = Date.now();
        this.probeAuthWarned = false; // reset so we warn again if auth later fails

        // Try to extract version from health endpoint
        if (!this.version) {
          await this.detectVersion();
        }
        return true;
      }

      // 401/403 means n8n is there but API key is wrong/missing.
      // Only warn once to avoid log spam — reset on successful probe.
      if (res.status === 401 || res.status === 403) {
        if (!this.probeAuthWarned) {
          this.probeAuthWarned = true;
          if (this.apiKey && this.apiKey === "hoc-n8n-api-key-auto") {
            log.warn(`n8n API key is still set to the orchestrator default. You MUST generate a real key in n8n at http://localhost:5678 (Settings > n8n API) and add it to .env as HOC_N8N_API_KEY.`);
          } else if (this.apiKey) {
            log.warn(`n8n API authentication failed (status ${res.status}) — your HOC_N8N_API_KEY is invalid. Generate a new one in n8n Settings > n8n API.`);
          } else {
            log.info(`n8n at ${this.baseUrl} requires auth but no HOC_N8N_API_KEY is configured — will retry in 15s. Generate one at http://localhost:5678 (Settings > n8n API)`);
            // Schedule auto-retry: the key may be injected shortly after boot
            if (!this._pendingKeyRetry) {
              this._pendingKeyRetry = true;
              setTimeout(() => {
                this._pendingKeyRetry = false;
                // Re-read key from environment (may have been injected by citizen-n8n)
                const envKey = process.env.N8N_API_KEY ?? null;
                if (envKey && envKey !== this.apiKey) {
                  this.apiKey = envKey;
                  this.probeAuthWarned = false;
                  log.info("n8n bridge: key appeared in environment — re-probing");
                }
                void this.probe();
              }, 15_000);
            }
          }
        }
        this.available = false;
        return false;
      }

      this.available = false;
      return false;
    } catch {
      this.available = false;
      return false;
    } finally {
      this.probeInFlight = false;
    }
  }

  /**
   * Try to detect n8n version via the /healthz or settings endpoint.
   */
  private async detectVersion(): Promise<void> {
    try {
      // n8n has /healthz which sometimes returns version info
      const url = `${this.baseUrl}/healthz`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const text = await res.text();
          try {
            const json = JSON.parse(text) as { status?: string; version?: string };
            if (json.version) {
              this.version = json.version;
              return;
            }
          } catch {
            // /healthz might return plain text like "ok"
          }
        }
      } finally {
        clearTimeout(timeout);
      }

      // Fallback: try settings endpoint
      const settingsRes = await this.request<{ data?: { version?: string } }>(
        "GET",
        "/settings",
      );
      if (settingsRes.ok && settingsRes.data?.data?.version) {
        this.version = settingsRes.data.data.version;
      }
    } catch {
      // Version detection is best-effort
    }
  }

  /**
   * Periodic health check — called from n8nTick.
   */
  async healthCheck(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {return;}
    await this.probe();
  }

  // ─── Workflow CRUD ──────────────────────────────────────────

  /**
   * List all workflows from n8n.
   * Results are cached for WORKFLOW_CACHE_TTL_MS.
   */
  async listWorkflows(forceRefresh = false): Promise<N8nWorkflowInfo[]> {
    const now = Date.now();
    if (!forceRefresh && now - this.lastCacheRefresh < WORKFLOW_CACHE_TTL_MS) {
      return this.workflowCache;
    }

    if (!this.available) {
      await this.probe();
      if (!this.available) {return [];}
    }

    try {
      const allWorkflows: N8nWorkflowInfo[] = [];
      let cursor: string | undefined;
      let pages = 0;
      const maxPages = 10; // Safety limit

      do {
        const path = cursor
          ? `/workflows?limit=100&cursor=${encodeURIComponent(cursor)}`
          : "/workflows?limit=100";

        const res = await this.request<N8nApiListResponse>("GET", path);
        if (!res.ok || !res.data?.data) {break;}

        for (const wf of res.data.data) {
          allWorkflows.push({
            id: String(wf.id),
            name: wf.name,
            active: wf.active,
            createdAt: wf.createdAt,
            updatedAt: wf.updatedAt,
            nodes: wf.nodes?.length ?? 0,
          });
        }

        cursor = res.data.nextCursor;
        pages++;
      } while (cursor && pages < maxPages);

      this.workflowCache = allWorkflows;
      this.lastCacheRefresh = now;
      return allWorkflows;
    } catch (err) {
      log.warn(`Failed to list n8n workflows: ${err instanceof Error ? err.message : String(err)}`);
      return this.workflowCache; // Return stale cache on error
    }
  }

  /**
   * Get a single workflow by ID.
   */
  async getWorkflow(id: string): Promise<N8nWorkflowInfo | null> {
    if (!this.available) {return null;}

    const res = await this.request<N8nApiWorkflow>("GET", `/workflows/${encodeURIComponent(id)}`);
    if (!res.ok || !res.data) {return null;}

    const wf = res.data;
    return {
      id: String(wf.id),
      name: wf.name,
      active: wf.active,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
      nodes: wf.nodes?.length ?? 0,
    };
  }

  // ─── Contract Methods (consumed by cluster RPC handlers) ───

  /**
   * getStatus() — Returns full n8n bridge status.
   * Called by cluster.status RPC handler.
   */
  async getStatus(): Promise<N8nBridgeStatus> {
    if (!this.available) {
      // Try a probe first
      await this.probe();
    }

    if (!this.available) {
      return { available: false, workflows: [] };
    }

    const workflows = await this.listWorkflows();

    return {
      available: true,
      url: this.baseUrl,
      version: this.version ?? undefined,
      workflows,
    };
  }

  /**
   * toggleWorkflow() — Activate or deactivate a workflow.
   * Called by cluster.n8n.workflow.toggle RPC handler.
   *
   * Uses PATCH /api/v1/workflows/{id} with { active: boolean }
   */
  async toggleWorkflow(id: string, active: boolean): Promise<void> {
    if (!this.available) {
      throw new Error("n8n is not available");
    }

    const endpoint = active
      ? `/workflows/${encodeURIComponent(id)}/activate`
      : `/workflows/${encodeURIComponent(id)}/deactivate`;

    const res = await this.request("POST", endpoint);

    if (!res.ok) {
      // Fallback: try PATCH method (some n8n versions)
      const patchRes = await this.request("PATCH", `/workflows/${encodeURIComponent(id)}`, {
        active,
      });
      if (!patchRes.ok) {
        throw new Error(`Failed to ${active ? "activate" : "deactivate"} workflow ${id} (status ${patchRes.status})`);
      }
    }

    // Invalidate cache so next listWorkflows() fetches fresh data
    this.lastCacheRefresh = 0;
    log.info(`Workflow ${id} ${active ? "activated" : "deactivated"}`);
  }

  /**
   * triggerWorkflow() — Execute a workflow.
   * Called by cluster.n8n.workflow.trigger RPC handler.
   *
   * Strategy:
   * 1. Try POST /api/v1/executions (new API) with workflowId as data
   * 2. Fallback: Try webhook trigger if workflow has a webhook node
   */
  async triggerWorkflow(
    id: string,
    payload?: Record<string, unknown>,
  ): Promise<{ executionId?: string }> {
    if (!this.available) {
      throw new Error("n8n is not available");
    }

    // Strategy 1: Direct execution via API
    const res = await this.request<{ data?: { id?: string } }>(
      "POST",
      "/executions",
      {
        workflowId: id,
        ...(payload ? { data: payload } : {}),
      },
    );

    if (res.ok && res.data?.data?.id) {
      log.info(`Triggered workflow ${id}, execution: ${res.data.data.id}`);
      return { executionId: res.data.data.id };
    }

    // Strategy 2: Try the test webhook path
    // n8n test webhooks follow: /webhook-test/<workflow-id>
    try {
      const webhookUrl = `${this.baseUrl}/webhook-test/${encodeURIComponent(id)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const webhookRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload ?? {}),
          signal: controller.signal,
        });
        if (webhookRes.ok) {
          log.info(`Triggered workflow ${id} via test webhook`);
          return { executionId: "webhook-triggered" };
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // Webhook fallback failed — not critical
    }

    // Strategy 3: Try the production webhook path
    try {
      const webhookUrl = `${this.baseUrl}/webhook/${encodeURIComponent(id)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const webhookRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload ?? {}),
          signal: controller.signal,
        });
        if (webhookRes.ok) {
          log.info(`Triggered workflow ${id} via production webhook`);
          return { executionId: "webhook-triggered" };
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // All strategies exhausted
    }

    throw new Error(
      `Failed to trigger workflow ${id}. Ensure the workflow has a webhook trigger node or the n8n API supports direct execution.`,
    );
  }

  // ─── Event Forwarding (Republic → n8n) ─────────────────────

  /**
   * Forward a Republic event to configured n8n webhooks.
   * Rate-limited per event type (max 1 per EVENT_RATE_LIMIT_MS).
   */
  async forwardEvent(event: RepublicEvent): Promise<void> {
    if (this.webhooks.length === 0) {return;}
    if (!this.available) {return;}

    // Rate limiting per event type
    const now = Date.now();
    const lastSent = this.eventRateLimits.get(event.type) ?? 0;
    if (now - lastSent < EVENT_RATE_LIMIT_MS) {return;}
    this.eventRateLimits.set(event.type, now);

    for (const webhook of this.webhooks) {
      // Filter by event type if configured
      if (webhook.eventTypes.length > 0 && !webhook.eventTypes.includes(event.type)) {
        continue;
      }

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Republic-Event": event.type,
          ...webhook.headers,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          await fetch(webhook.url, {
            method: "POST",
            headers,
            body: JSON.stringify(event),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // Event forwarding is fire-and-forget — don't log noise
      }
    }
  }

  // ─── Convenience Event Emitters ─────────────────────────────

  /**
   * Emit a tick summary event to n8n.
   * Called periodically (not every tick — rate-limited).
   */
  emitTickSummary(s: RepublicState): void {
    void this.forwardEvent({
      type: "republic.tick",
      timestamp: new Date().toISOString(),
      tick: s.currentTick,
      payload: {
        population: s.citizens.length,
        avgHappiness: s.citizens.length > 0
          ? Math.round(s.citizens.reduce((sum, c) => sum + c.happiness, 0) / s.citizens.length)
          : 0,
        treasury: ((s as unknown as Record<string, unknown>).treasury as number) ?? 0,
        objectiveCount: s.objectives?.length ?? 0,
      },
    });
  }

  /**
   * Emit a citizen event (birth, death, action).
   */
  emitCitizenEvent(
    type: "republic.citizen.born" | "republic.citizen.died" | "republic.citizen.action",
    tick: number,
    citizenData: Record<string, unknown>,
  ): void {
    void this.forwardEvent({
      type,
      timestamp: new Date().toISOString(),
      tick,
      payload: citizenData,
    });
  }

  /**
   * Emit an election event.
   */
  emitElection(tick: number, results: Record<string, unknown>): void {
    void this.forwardEvent({
      type: "republic.election",
      timestamp: new Date().toISOString(),
      tick,
      payload: results,
    });
  }

  // ─── Accessors ──────────────────────────────────────────────

  get isAvailable(): boolean {
    return this.available;
  }

  get n8nUrl(): string {
    return this.baseUrl;
  }

  get n8nVersion(): string | null {
    return this.version;
  }

  /**
   * Add a webhook endpoint for event forwarding at runtime.
   */
  addWebhook(config: WebhookConfig): void {
    this.webhooks.push(config);
    log.info(`Webhook added: ${config.url} (${config.eventTypes.length || "all"} events)`);
  }

  /**
   * Update the API key and immediately re-probe.
   * Called by citizen-n8n after injecting N8N_API_KEY from Docker preset.
   * Without this, a 401 at boot permanently marks n8n as unavailable
   * even after the key is configured.
   */
  async reconnect(newApiKey?: string): Promise<boolean> {
    if (newApiKey) {
      this.apiKey = newApiKey;
    } else {
      // Re-read from environment — key may have been injected after boot
      this.apiKey = process.env.N8N_API_KEY ?? this.apiKey;
    }
    // Reset auth warning so the next probe produces a useful log
    this.probeAuthWarned = false;
    log.info("n8n bridge: reconnect() called — re-probing with updated key");
    return this.probe();
  }

  // ─── Phase 30: Dashboard Methods ────────────────────────────

  /**
   * Get recent workflow execution history from n8n.
   */
  async getExecutionHistory(opts?: {
    limit?: number;
    status?: "success" | "error" | "waiting";
  }): Promise<Array<{
    id: string;
    workflowId: string;
    status: string;
    startedAt: string;
    stoppedAt: string | null;
    mode: string;
  }>> {
    if (!this.available) {return [];}

    const limit = opts?.limit ?? 20;
    let path = `/executions?limit=${limit}`;
    if (opts?.status) {path += `&status=${opts.status}`;}

    const res = await this.request<{ data: Array<{
      id: string;
      workflowId?: { id?: string };
      status: string;
      startedAt: string;
      stoppedAt: string | null;
      mode: string;
      [k: string]: unknown;
    }> }>("GET", path);

    if (!res.ok || !res.data?.data) {return [];}

    return res.data.data.map((exec) => ({
      id: String(exec.id),
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      workflowId: String((exec.workflowId as any)?.id ?? exec.workflowId ?? ""),
      status: exec.status,
      startedAt: exec.startedAt,
      stoppedAt: exec.stoppedAt,
      mode: exec.mode,
    }));
  }

  /**
   * Get workflow stats: success/failure rates, avg duration.
   */
  async getWorkflowStats(): Promise<{
    totalWorkflows: number;
    activeWorkflows: number;
    recentExecutions: number;
    successRate: number;
  }> {
    const workflows = await this.listWorkflows();
    const executions = await this.getExecutionHistory({ limit: 50 });

    const successes = executions.filter((e) => e.status === "success").length;

    return {
      totalWorkflows: workflows.length,
      activeWorkflows: workflows.filter((w) => w.active).length,
      recentExecutions: executions.length,
      successRate: executions.length > 0
        ? Math.round((successes / executions.length) * 100)
        : 100,
    };
  }

  /**
   * Create a workflow from a template.
   */
  async createWorkflow(opts: {
    name: string;
    nodes?: unknown[];
    connections?: unknown;
    active?: boolean;
  }): Promise<N8nWorkflowInfo | null> {
    if (!this.available) {return null;}

    const res = await this.request<N8nApiWorkflow>("POST", "/workflows", {
      name: opts.name,
      nodes: opts.nodes ?? [],
      connections: opts.connections ?? {},
      active: opts.active ?? false,
    });

    if (!res.ok || !res.data) {return null;}

    this.lastCacheRefresh = 0; // Invalidate cache
    return {
      id: String(res.data.id),
      name: res.data.name,
      active: res.data.active,
      createdAt: res.data.createdAt,
      updatedAt: res.data.updatedAt,
      nodes: res.data.nodes?.length ?? 0,
    };
  }

  /**
   * Delete a workflow by ID.
   */
  async deleteWorkflow(id: string): Promise<boolean> {
    if (!this.available) {return false;}

    const res = await this.request("DELETE", `/workflows/${encodeURIComponent(id)}`);
    if (res.ok) {
      this.lastCacheRefresh = 0; // Invalidate cache
      log.info(`Workflow ${id} deleted`);
    }
    return res.ok;
  }

  /**
   * Get event forwarding stats.
   */
  getEventForwardingStats(): {
    webhookCount: number;
    rateLimitedEvents: number;
    lastEventTimes: Record<string, number>;
  } {
    return {
      webhookCount: this.webhooks.length,
      rateLimitedEvents: this.eventRateLimits.size,
      lastEventTimes: Object.fromEntries(this.eventRateLimits),
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let bridgeInstance: N8nBridge | null = null;

/**
 * Get or create the singleton N8nBridge instance.
 * Optionally pass config on first call.
 */
export function getN8nBridge(opts?: ConstructorParameters<typeof N8nBridge>[0]): N8nBridge {
  if (!bridgeInstance) {
    bridgeInstance = new N8nBridge(opts);
  }
  return bridgeInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetN8nBridge(): void {
  bridgeInstance = null;
}

// ─── Simulation Tick Integration ────────────────────────────────

/** How often to run the n8n tick (every N Republic ticks) */
const N8N_TICK_INTERVAL = 10;

/**
 * n8n simulation tick — called from the Republic simulation loop.
 *
 * Responsibilities:
 * 1. Periodic health check / reconnect
 * 2. Refresh workflow cache
 * 3. Forward Republic state summary to n8n webhooks
 */
export function n8nTick(s: RepublicState): void {
  const bridge = bridgeInstance;
  if (!bridge) {return;}

  // Only run every N8N_TICK_INTERVAL ticks
  if (s.currentTick % N8N_TICK_INTERVAL !== 0) {return;}

  // Fire-and-forget async operations
  void (async () => {
    try {
      // 1. Health check (rate-limited internally)
      await bridge.healthCheck();

      // 2. Refresh workflow cache (rate-limited internally)
      if (bridge.isAvailable) {
        await bridge.listWorkflows();
      }

      // 3. Forward tick summary
      bridge.emitTickSummary(s);
    } catch {
      // n8n tick must never crash the simulation
    }
  })();
}
