/**
 * Cluster RPC Handlers
 *
 * Backend handlers for cluster-level infrastructure management:
 * gateway cluster status, Docker containers, runtimes, and n8n workflows.
 */

import type {
  ClusterDockerContainerParams,
  ClusterDockerDeployParams,
  ClusterN8nWorkflowParams,
  ClusterFederationPeersParams,
  ClusterFederationRemovePeerParams,
} from "./rpc-params.js";
import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/schema/error-codes.js";
import { resilienceEngine } from "../../cluster/resilience-engine.js";

export const clusterHandlers: GatewayRequestHandlers = {
  /**
   * cluster.status — Returns full cluster overview including:
   * peers, role, nodes, docker containers, runtimes, and n8n status.
   */
  "cluster.status": async ({ respond, context }) => {
    try {
      const gateway = context.gateway;

      // Gateway cluster peers
      let peers: unknown[] = [];
      let role = "standalone";
      const clusterManager = (gateway as Record<string, unknown>).clusterManager as
        | { getPeers?: () => unknown[]; getRole?: () => string }
        | undefined;
      if (clusterManager) {
        peers = clusterManager.getPeers?.() ?? [];
        role = clusterManager.getRole?.() ?? "standalone";
      }

      // Connected nodes — map NodeSession → ClusterNode shape expected by UI
      let nodes: unknown[] = [];
      if (context.nodeRegistry) {
        const raw = context.nodeRegistry.listConnected?.() ?? [];
        nodes = raw.map((n: Record<string, unknown>) => ({
          id: n.nodeId ?? n.connId ?? "unknown",
          name: n.displayName ?? n.nodeId ?? "Unnamed Node",
          host: n.remoteIp ?? "127.0.0.1",
          capabilities: Array.isArray(n.caps) ? n.caps : [],
          status: "online" as const,
          lastSeen: typeof n.connectedAtMs === "number" ? n.connectedAtMs : Date.now(),
          cpuUsage: undefined,
          memoryUsageMB: undefined,
          gpuAvailable: Array.isArray(n.caps) && n.caps.includes("gpu"),
        }));
      }

      // Docker status — use the docker-orchestrator module directly
      let docker = { available: false, containers: [] as unknown[] };
      try {
        const dockerOrch = await import("../../republic/docker-orchestrator.js");
        const check = dockerOrch.ensureDocker();
        if (check.available) {
          docker = {
            available: true,
            containers: dockerOrch.listContainers(false),
          };
        }
      } catch {
        // Docker may be uninstalled or daemon down
      }

      // Runtimes
      let runtimes: unknown[] = [];
      const controlPlane = (gateway as Record<string, unknown>).infraControlPlane as
        | { getRuntimes?: () => unknown[] }
        | undefined;
      if (controlPlane) {
        runtimes = controlPlane.getRuntimes?.() ?? [];
      }

      // n8n status
      let n8n: unknown = null;
      const n8nBridge = (gateway as Record<string, unknown>).n8nBridge as
        | { getStatus?: () => Promise<unknown> }
        | undefined;
      if (n8nBridge) {
        try {
          n8n = (await n8nBridge.getStatus?.()) ?? null;
        } catch {
          // n8n connection failed
        }
      }

      // When no live infrastructure is detected, provide meaningful defaults
      // so the cluster page shows useful info about the local environment
      if (peers.length === 0 && nodes.length === 0) {
        const os = await import("node:os");
        nodes = [
          {
            id: "local-primary",
            name: os.hostname(),
            host: "127.0.0.1",
            capabilities: ["compute", "storage", "gateway"],
            status: "online",
            lastSeen: Date.now(),
            cpuUsage: Math.round(os.loadavg()[0] * 10),
            memoryUsageMB: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
            gpuAvailable:
              !!process.env.CUDA_VISIBLE_DEVICES || !!process.env.NVIDIA_VISIBLE_DEVICES,
          },
        ];
        peers = [
          {
            id: "self",
            host: "127.0.0.1",
            port: 4200,
            role: "leader",
            healthy: true,
            lastHeartbeat: Date.now(),
            uptime: Math.round(os.uptime()),
          },
        ];
        role = "leader";
      }

      // Auto-detect common local runtimes when none are reported
      if (runtimes.length === 0) {
        const defaultRuntimes = [
          {
            name: "Ollama",
            type: "ollama",
            endpoint: "http://localhost:11434",
            status: "unavailable",
          },
          {
            name: "LM Studio",
            type: "lmstudio",
            endpoint: "http://localhost:1234",
            status: "unavailable",
          },
        ];
        // Quick availability check for common runtimes
        for (const rt of defaultRuntimes) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 500);
            const resp = await fetch(rt.endpoint, { signal: controller.signal, method: "GET" });
            clearTimeout(timeout);
            if (resp.ok || resp.status < 500) {
              rt.status = "available";
            }
          } catch {
            // Keep as unavailable
          }
        }
        runtimes = defaultRuntimes;
      }

      respond(true, { peers, role, nodes, docker, runtimes, n8n });
    } catch (err) {
      respond(true, {
        peers: [],
        role: "standalone",
        nodes: [],
        docker: { available: false, containers: [] },
        runtimes: [],
        n8n: null,
        error: String(err),
      });
    }
  },

  "cluster.resilience.status": async ({ respond }) => {
    try {
      respond(true, resilienceEngine.getDiagnostics());
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "cluster.docker.start": async ({ params, respond }) => {
    try {
      const dockerOrch = await import("../../republic/docker-orchestrator.js");
      const containerId = (params as unknown as ClusterDockerContainerParams).containerId;
      const ok = await dockerOrch.startContainer(containerId);
      if (!ok) {
        respond(false, undefined, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: `Failed to start container ${containerId}`,
        });
        return;
      }
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, { code: "-32001", message: String(err) });
    }
  },

  "cluster.docker.stop": async ({ params, respond }) => {
    try {
      const dockerOrch = await import("../../republic/docker-orchestrator.js");
      const containerId = (params as unknown as ClusterDockerContainerParams).containerId;
      const ok = await dockerOrch.stopContainer(containerId);
      if (!ok) {
        respond(false, undefined, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: `Failed to stop container ${containerId}`,
        });
        return;
      }
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, { code: "-32001", message: String(err) });
    }
  },

  "cluster.docker.remove": async ({ params, respond }) => {
    try {
      const dockerOrch = await import("../../republic/docker-orchestrator.js");
      const containerId = (params as unknown as ClusterDockerContainerParams).containerId;
      const ok = await dockerOrch.removeContainer(containerId, true);
      if (!ok) {
        respond(false, undefined, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: `Failed to remove container ${containerId}`,
        });
        return;
      }
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, { code: "-32001", message: String(err) });
    }
  },

  "cluster.docker.deploy": async ({ params, respond }) => {
    try {
      const dockerOrch = await import("../../republic/docker-orchestrator.js");
      const preset = (params as unknown as ClusterDockerDeployParams).preset;

      // Check Docker is available
      const check = dockerOrch.ensureDocker();
      if (!check.available) {
        respond(false, undefined, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: `Docker not available: ${check.error ?? "unknown"}`,
        });
        return;
      }

      // Initialize resource budget if not already done
      await dockerOrch.initResourceBudget();

      // Launch the preset
      const container = await dockerOrch.launchPreset(preset, "control-ui");
      if (!container) {
        respond(false, undefined, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: `Failed to launch preset "${preset}" — check Docker logs`,
        });
        return;
      }
      respond(true, { ok: true, container });
    } catch (err) {
      respond(false, undefined, { code: "-32001", message: String(err) });
    }
  },

  "cluster.n8n.workflow.toggle": async ({ params, respond, context }) => {
    try {
      const gateway = context.gateway;
      const bridge = (gateway as Record<string, unknown>).n8nBridge as
        | { toggleWorkflow?: (id: string, active: boolean) => Promise<void> }
        | undefined;
      if (!bridge?.toggleWorkflow) {
        respond(false, undefined, { code: "-32001", message: "n8n bridge not available" });
        return;
      }
      const { workflowId, active } = params as unknown as ClusterN8nWorkflowParams;
      await bridge.toggleWorkflow(workflowId, Boolean(active));
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, { code: "-32001", message: String(err) });
    }
  },

  "cluster.n8n.workflow.trigger": async ({ params, respond, context }) => {
    try {
      const gateway = context.gateway;
      const bridge = (gateway as Record<string, unknown>).n8nBridge as
        | { triggerWorkflow?: (id: string, payload?: unknown) => Promise<unknown> }
        | undefined;
      if (!bridge?.triggerWorkflow) {
        respond(false, undefined, { code: "-32001", message: "n8n bridge not available" });
        return;
      }
      const { workflowId, payload } = params as unknown as ClusterN8nWorkflowParams;
      const result = await bridge.triggerWorkflow(
        workflowId,
        payload,
      );
      respond(true, { ok: true, result });
    } catch (err) {
      respond(false, undefined, { code: "-32001", message: String(err) });
    }
  },

  // ── Federation Methods ─────────────────────────────────────────

  /**
   * cluster.federation.status — Returns live federation data:
   * federated peers, remote citizens, recent events, marketplace, cluster stats.
   */
  "cluster.federation.status": async ({ respond }) => {
    try {
      const fed = await import("../../republic/republic-federation.js");
      const peers = fed.getFederatedGateways();
      const remoteCitizens = fed.getFederatedCitizens();
      const events = fed.getFederationEvents(20);
      const marketplace = fed.getFederatedMarketplace();
      const stats = fed.getClusterStats();
      const diagnostics = fed.getFederationDiagnostics();

      // Get current config
      const { loadClusterConfig } = await import("../../cluster/cluster-config.js");
      const config = loadClusterConfig();

      respond(true, {
        enabled: Boolean(diagnostics.localGatewayId),
        tailscalePeers: config.discovery.tailscalePeers,
        clusterMode: config.clusterMode,
        discoveryMode: config.discovery.mode,
        peers,
        remoteCitizenCount: remoteCitizens.length,
        remoteCitizens: remoteCitizens.slice(0, 50), // Cap for UI
        events,
        marketplaceListings: marketplace.length,
        stats,
        diagnostics,
      });
    } catch (err) {
      respond(true, {
        enabled: false,
        tailscalePeers: [],
        clusterMode: "auto",
        discoveryMode: "multicast",
        peers: [],
        remoteCitizenCount: 0,
        remoteCitizens: [],
        events: [],
        marketplaceListings: 0,
        stats: null,
        diagnostics: null,
        error: String(err),
      });
    }
  },

  /**
   * cluster.federation.setPeers — Set Tailscale peer IPs and reinitialize federation.
   * Accepts { peers: string[] } where each string is a Tailscale/LAN IP.
   */
  "cluster.federation.setPeers": async ({ params, respond }) => {
    const p = params as unknown as ClusterFederationPeersParams | undefined;
    if (!p?.peers || !Array.isArray(p.peers)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "peers[] required"));
      return;
    }

    const ips = p.peers.map((ip: string) => ip.trim()).filter(Boolean);

    try {
      // Update the environment variable so config picks it up
      process.env.OPENCLAW_TAILSCALE_PEERS = ips.join(",");
      if (ips.length > 0) {
        process.env.OPENCLAW_CLUSTER_ENABLED = "true";
      }

      // Reinitialize federation
      const fed = await import("../../republic/republic-federation.js");
      fed.stopFederationSync();

      if (ips.length > 0) {
        const nodeId =
          process.env.OPENCLAW_CLUSTER_NODE_ID ??
          `${process.platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        fed.initFederation({
          gatewayId: nodeId,
          host: process.env.OPENCLAW_HOST ?? "0.0.0.0",
          port: parseInt(process.env.OPENCLAW_PORT ?? "18789", 10),
          peers: ips,
        });
        fed.startFederationSync();
      }

      respond(true, { ok: true, peers: ips, federationEnabled: ips.length > 0 });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * cluster.federation.removePeer — Remove a specific peer IP.
   */
  "cluster.federation.removePeer": async ({ params, respond }) => {
    const p = params as unknown as ClusterFederationRemovePeerParams | undefined;
    if (!p?.ip) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "ip required"));
      return;
    }

    try {
      const current = (process.env.OPENCLAW_TAILSCALE_PEERS ?? "")
        .split(",")
        .map((ip: string) => ip.trim())
        .filter(Boolean)
        .filter((ip: string) => ip !== p.ip);

      process.env.OPENCLAW_TAILSCALE_PEERS = current.join(",");

      // Reinitialize federation with remaining peers
      const fed = await import("../../republic/republic-federation.js");
      fed.stopFederationSync();

      if (current.length > 0) {
        const nodeId =
          process.env.OPENCLAW_CLUSTER_NODE_ID ??
          `${process.platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        fed.initFederation({
          gatewayId: nodeId,
          host: process.env.OPENCLAW_HOST ?? "0.0.0.0",
          port: parseInt(process.env.OPENCLAW_PORT ?? "18789", 10),
          peers: current,
        });
        fed.startFederationSync();
      }

      respond(true, { ok: true, remainingPeers: current });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
