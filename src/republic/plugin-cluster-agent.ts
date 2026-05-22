/**
 * Plugin Cluster Agent
 *
 * Runs on every HoC node in the cluster. Listens for remote plugin
 * spawn/call/kill messages on its own Redis channel and delegates
 * to the local plugin bus.
 *
 * Channel pattern:
 *   Subscribes to: "plugin:rpc:{thisNodeId}"
 *   Publishes results to: "plugin:rpc:{sourceNodeId}"
 *
 * This agent bridges the gap between the RemotePluginWorker (on the
 * requesting node) and the actual PluginWorker (on this node).
 */

import type { RedisStateStore } from "../cluster/redis-state-store.js";
import type { HoCPluginManifest } from "./hoc-plugin-types.js";
import type { ClusterPluginMsg } from "./remote-plugin-worker.js";
import { createSubsystemLogger } from "../logging.js";

const logger = createSubsystemLogger("cluster:agent");

// ─── Types ───────────────────────────────────────────────────────

/** Minimal interface for the local plugin bus (avoids circular imports) */
export interface LocalPluginBusAdapter {
  spawnPluginWorker(
    manifest: HoCPluginManifest,
    pluginDir: string,
    dataDir: string,
  ): Promise<{
    ready: boolean;
    error?: string;
    tools: Map<string, { description: string; schema: unknown }>;
    gatewayMethods: Set<string>;
  }>;
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  callGateway(method: string, params: unknown): Promise<unknown>;
  healthCheck(pluginId: string): Promise<{ healthy: boolean; message?: string }>;
  killWorker(pluginId: string): Promise<void>;
  getPluginDir(pluginId: string): string;
  getDataDir(pluginId: string): string;
}

interface AgentOptions {
  nodeId: string;
  stateStore: RedisStateStore;
  busAdapter: LocalPluginBusAdapter;
}

// ─── Cluster Agent ───────────────────────────────────────────────

export class PluginClusterAgent {
  private nodeId: string;
  private stateStore: RedisStateStore;
  private busAdapter: LocalPluginBusAdapter;
  private running = false;

  constructor(opts: AgentOptions) {
    this.nodeId = opts.nodeId;
    this.stateStore = opts.stateStore;
    this.busAdapter = opts.busAdapter;
  }

  /**
   * Start listening for remote plugin requests on this node's channel.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const channel = `plugin:rpc:${this.nodeId}`;
    await this.stateStore.subscribe(channel, (message) => {
      const msg = message as ClusterPluginMsg;
      void this.handleMessage(msg);
    });

    this.running = true;
    logger.info(`Cluster agent started, listening on ${channel}`);
  }

  /**
   * Stop listening.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    const channel = `plugin:rpc:${this.nodeId}`;
    await this.stateStore.unsubscribe(channel);
    this.running = false;

    logger.info("Cluster agent stopped");
  }

  /**
   * Handle an incoming cluster message.
   */
  private async handleMessage(msg: ClusterPluginMsg): Promise<void> {
    try {
      switch (msg.type) {
        case "REMOTE_SPAWN":
          await this.handleRemoteSpawn(msg);
          break;

        case "REMOTE_CALL_TOOL":
          await this.handleRemoteCallTool(msg);
          break;

        case "REMOTE_CALL_GATEWAY":
          await this.handleRemoteCallGateway(msg);
          break;

        case "REMOTE_HEALTH_CHECK":
          await this.handleRemoteHealthCheck(msg);
          break;

        case "REMOTE_KILL":
          await this.handleRemoteKill(msg);
          break;

        default:
          // Ignore messages not meant for us (REMOTE_RESULT, etc.)
          break;
      }
    } catch (err) {
      logger.error(`Error handling cluster message: ${String(err)}`, { type: msg.type });
    }
  }

  /**
   * Spawn a plugin locally on behalf of a remote node.
   */
  private async handleRemoteSpawn(
    msg: Extract<ClusterPluginMsg, { type: "REMOTE_SPAWN" }>,
  ): Promise<void> {
    const { reqId, sourceNodeId, pluginId, manifest } = msg;

    logger.info(`Remote spawn request for ${pluginId} from ${sourceNodeId}`);

    try {
      // Use local plugin directory paths
      const pluginDir = this.busAdapter.getPluginDir(pluginId);
      const dataDir = this.busAdapter.getDataDir(pluginId);

      const worker = await this.busAdapter.spawnPluginWorker(manifest, pluginDir, dataDir);

      // Collect registered tools and gateway methods from the worker
      const tools: Array<{ name: string; description: string; schema: unknown }> = [];
      for (const [name, meta] of worker.tools) {
        tools.push({ name, description: meta.description, schema: meta.schema });
      }

      const gatewayMethods = [...worker.gatewayMethods];

      await this.reply(sourceNodeId, {
        type: "SPAWN_RESULT",
        reqId,
        pluginId,
        success: worker.ready,
        error: worker.error,
        tools,
        gatewayMethods,
      });
    } catch (err) {
      await this.reply(sourceNodeId, {
        type: "SPAWN_RESULT",
        reqId,
        pluginId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Forward a tool call to the local plugin bus.
   */
  private async handleRemoteCallTool(
    msg: Extract<ClusterPluginMsg, { type: "REMOTE_CALL_TOOL" }>,
  ): Promise<void> {
    const { reqId, sourceNodeId, pluginId, toolName, args } = msg;

    try {
      const result = await this.busAdapter.callTool(toolName, args);
      await this.reply(sourceNodeId, {
        type: "REMOTE_RESULT",
        reqId,
        pluginId,
        result,
      });
    } catch (err) {
      await this.reply(sourceNodeId, {
        type: "REMOTE_RESULT",
        reqId,
        pluginId,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Forward a gateway call to the local plugin bus.
   */
  private async handleRemoteCallGateway(
    msg: Extract<ClusterPluginMsg, { type: "REMOTE_CALL_GATEWAY" }>,
  ): Promise<void> {
    const { reqId, sourceNodeId, pluginId, method, params } = msg;

    try {
      const result = await this.busAdapter.callGateway(method, params);
      await this.reply(sourceNodeId, {
        type: "REMOTE_RESULT",
        reqId,
        pluginId,
        result,
      });
    } catch (err) {
      await this.reply(sourceNodeId, {
        type: "REMOTE_RESULT",
        reqId,
        pluginId,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Forward a health check to the local plugin worker.
   */
  private async handleRemoteHealthCheck(
    msg: Extract<ClusterPluginMsg, { type: "REMOTE_HEALTH_CHECK" }>,
  ): Promise<void> {
    const { reqId, sourceNodeId, pluginId } = msg;

    try {
      const result = await this.busAdapter.healthCheck(pluginId);
      await this.reply(sourceNodeId, {
        type: "REMOTE_RESULT",
        reqId,
        pluginId,
        result,
      });
    } catch (err) {
      await this.reply(sourceNodeId, {
        type: "REMOTE_RESULT",
        reqId,
        pluginId,
        result: { healthy: false, message: String(err) },
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Kill a local worker on behalf of a remote node.
   */
  private async handleRemoteKill(
    msg: Extract<ClusterPluginMsg, { type: "REMOTE_KILL" }>,
  ): Promise<void> {
    const { reqId, sourceNodeId, pluginId } = msg;

    try {
      await this.busAdapter.killWorker(pluginId);
      await this.reply(sourceNodeId, {
        type: "REMOTE_RESULT",
        reqId,
        pluginId,
        result: { success: true },
      });
    } catch (err) {
      await this.reply(sourceNodeId, {
        type: "REMOTE_RESULT",
        reqId,
        pluginId,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Send a reply back to the requesting node via Redis pub/sub.
   */
  private async reply(targetNodeId: string, msg: ClusterPluginMsg): Promise<void> {
    const channel = `plugin:rpc:${targetNodeId}`;
    try {
      await this.stateStore.publish(channel, msg);
    } catch (err) {
      logger.error(`Failed to reply to ${targetNodeId}: ${String(err)}`);
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let agent: PluginClusterAgent | null = null;

export function getClusterAgent(opts?: AgentOptions): PluginClusterAgent {
  if (!agent && opts) {
    agent = new PluginClusterAgent(opts);
  }
  if (!agent) {
    throw new Error("Cluster agent not initialized");
  }
  return agent;
}

export function resetClusterAgent(): void {
  agent = null;
}
