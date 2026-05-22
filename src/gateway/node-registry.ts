import { randomUUID } from "node:crypto";
import type { GatewayWsClient } from "./server/ws-types.js";

export type NodeSession = {
  nodeId: string;
  connId: string;
  client: GatewayWsClient;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  remoteIp?: string;
  caps: string[];
  commands: string[];
  permissions?: Record<string, boolean>;
  pathEnv?: string;
  connectedAtMs: number;
};

type PendingInvoke = {
  nodeId: string;
  command: string;
  resolve: (value: NodeInvokeResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type NodeInvokeResult = {
  ok: boolean;
  payload?: unknown;
  payloadJSON?: string | null;
  error?: { code?: string; message?: string } | null;
};

export class NodeRegistry {
  private nodesById = new Map<string, NodeSession>();
  private nodesByConn = new Map<string, string>();
  private pendingInvokes = new Map<string, PendingInvoke>();

  register(client: GatewayWsClient, opts: { remoteIp?: string | undefined }) {
    const connect = client.connect;
    const nodeId = connect.device?.id ?? connect.client.id;
    const caps = Array.isArray(connect.caps) ? connect.caps : [];
    const commands = Array.isArray((connect as { commands?: string[] }).commands)
      ? ((connect as { commands?: string[] }).commands ?? [])
      : [];
    const permissions =
      typeof (connect as { permissions?: Record<string, boolean> }).permissions === "object"
        ? ((connect as { permissions?: Record<string, boolean> }).permissions ?? undefined)
        : undefined;
    const pathEnv =
      typeof (connect as { pathEnv?: string }).pathEnv === "string"
        ? (connect as { pathEnv?: string }).pathEnv
        : undefined;
    const session: NodeSession = {
      nodeId,
      connId: client.connId,
      client,
      displayName: connect.client.displayName,
      platform: connect.client.platform,
      version: connect.client.version,
      coreVersion: (connect as { coreVersion?: string }).coreVersion,
      uiVersion: (connect as { uiVersion?: string }).uiVersion,
      deviceFamily: connect.client.deviceFamily,
      modelIdentifier: connect.client.modelIdentifier,
      remoteIp: opts.remoteIp,
      caps,
      commands,
      permissions,
      pathEnv,
      connectedAtMs: Date.now(),
    };
    // If this nodeId was already registered with a different connId, clean up
    // the stale connId entry to prevent orphaned entries in nodesByConn
    const existingSession = this.nodesById.get(nodeId);
    if (existingSession && existingSession.connId !== client.connId) {
      this.nodesByConn.delete(existingSession.connId);
    }

    this.nodesById.set(nodeId, session);
    this.nodesByConn.set(client.connId, nodeId);
    return session;
  }

  unregister(connId: string): string | null {
    const nodeId = this.nodesByConn.get(connId);
    if (!nodeId) {
      return null;
    }
    this.nodesByConn.delete(connId);
    this.nodesById.delete(nodeId);
    for (const [id, pending] of this.pendingInvokes.entries()) {
      if (pending.nodeId !== nodeId) {
        continue;
      }
      clearTimeout(pending.timer);
      pending.reject(new Error(`node disconnected (${pending.command})`));
      this.pendingInvokes.delete(id);
    }
    return nodeId;
  }

  listConnected(): NodeSession[] {
    return [...this.nodesById.values()];
  }

  get(nodeId: string): NodeSession | undefined {
    return this.nodesById.get(nodeId);
  }

  async invoke(params: {
    nodeId: string;
    command: string;
    params?: unknown;
    timeoutMs?: number;
    idempotencyKey?: string;
  }): Promise<NodeInvokeResult> {
    const node = this.nodesById.get(params.nodeId);
    if (!node) {
      return {
        ok: false,
        error: { code: "NOT_CONNECTED", message: "node not connected" },
      };
    }
    const requestId = randomUUID();
    const payload = {
      id: requestId,
      nodeId: params.nodeId,
      command: params.command,
      paramsJSON:
        "params" in params && params.params !== undefined ? JSON.stringify(params.params) : null,
      timeoutMs: params.timeoutMs,
      idempotencyKey: params.idempotencyKey,
    };
    const ok = this.sendEventToSession(node, "node.invoke.request", payload);
    if (!ok) {
      return {
        ok: false,
        error: { code: "UNAVAILABLE", message: "failed to send invoke to node" },
      };
    }
    const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 30_000;
    return await new Promise<NodeInvokeResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingInvokes.delete(requestId);
        resolve({
          ok: false,
          error: { code: "TIMEOUT", message: "node invoke timed out" },
        });
      }, timeoutMs);
      this.pendingInvokes.set(requestId, {
        nodeId: params.nodeId,
        command: params.command,
        resolve,
        reject,
        timer,
      });
    });
  }

  handleInvokeResult(params: {
    id: string;
    nodeId: string;
    ok: boolean;
    payload?: unknown;
    payloadJSON?: string | null;
    error?: { code?: string; message?: string } | null;
  }): boolean {
    const pending = this.pendingInvokes.get(params.id);
    if (!pending) {
      return false;
    }
    if (pending.nodeId !== params.nodeId) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pendingInvokes.delete(params.id);
    pending.resolve({
      ok: params.ok,
      payload: params.payload,
      payloadJSON: params.payloadJSON ?? null,
      error: params.error ?? null,
    });
    return true;
  }

  sendEvent(nodeId: string, event: string, payload?: unknown): boolean {
    const node = this.nodesById.get(nodeId);
    if (!node) {
      return false;
    }
    return this.sendEventToSession(node, event, payload);
  }

  /** Max frame size for node events (safe margin below ESP32's 15KB buffer). */
  private static MAX_NODE_EVENT_BYTES = 12_000;

  /**
   * Events silently dropped for node clients.
   * health = 283KB+ snapshot (nodes get health via RPC instead)
   * agent  = 50-80 streaming events per chat response (overwhelms ESP32)
   * presence/heartbeat/tick = high-frequency broadcast noise
   */
  private static NODE_EVENT_BLOCKLIST = new Set([
    "health",
    "agent",
    "agent.thinking",
    "agent.action",
    "presence",
    "heartbeat",
    "tick",
  ]);

  private sendEventInternal(node: NodeSession, event: string, payload: unknown): boolean {
    // ── Drop events the ESP32 doesn't need ──
    if (NodeRegistry.NODE_EVENT_BLOCKLIST.has(event)) {
      return true; // silently swallow — not an error
    }

    try {
      let frame = JSON.stringify({ type: "event", event, payload });
      const frameBytes = Buffer.byteLength(frame, "utf-8");

      // ── Truncate oversized chat events ──
      if (frameBytes > NodeRegistry.MAX_NODE_EVENT_BYTES && event === "chat") {
        const p = payload as {
          state?: string;
          message?: { content?: Array<{ text?: string; type?: string }> };
          errorMessage?: string;
        };
        if (p?.message?.content?.[0]?.text) {
          const overhead = frameBytes - Buffer.byteLength(p.message.content[0].text, "utf-8");
          const maxTextBytes = NodeRegistry.MAX_NODE_EVENT_BYTES - overhead - 40;
          if (maxTextBytes > 100) {
            const text = p.message.content[0].text;
            let cut = Math.min(text.length, maxTextBytes);
            while (Buffer.byteLength(text.slice(0, cut), "utf-8") > maxTextBytes && cut > 100) {
              cut -= 50;
            }
            p.message.content[0].text = text.slice(0, cut) + "… [truncated]";
            frame = JSON.stringify({ type: "event", event, payload: p });
          }
        } else if (p?.errorMessage) {
          p.errorMessage = p.errorMessage.slice(0, 200) + "…";
          frame = JSON.stringify({ type: "event", event, payload: p });
        }
        console.log(
          `[ws:node-event] ⚠️ chat truncated ${frameBytes}B → ${Buffer.byteLength(frame)}B → node ${node.nodeId}`,
        );
      }

      // ── Universal size guard — drop anything still over limit ──
      const finalSize = Buffer.byteLength(frame, "utf-8");
      if (finalSize > NodeRegistry.MAX_NODE_EVENT_BYTES) {
        console.log(
          `[ws:node-event] ⛔ dropped ${event} ${finalSize}B (> ${NodeRegistry.MAX_NODE_EVENT_BYTES}B limit) → node ${node.nodeId}`,
        );
        return true; // dropped, not an error
      }

      console.log(`[ws:node-event] ${event} ${finalSize}B → node ${node.nodeId}`);
      node.client.socket.send(frame);
      return true;
    } catch {
      return false;
    }
  }

  private sendEventToSession(node: NodeSession, event: string, payload: unknown): boolean {
    return this.sendEventInternal(node, event, payload);
  }
}
