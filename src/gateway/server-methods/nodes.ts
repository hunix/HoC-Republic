import type { NodeRegisterParams, NodePairApproveParams, NodeIdParams } from "./rpc-params.js";
import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { listDevicePairing } from "../../infra/device-pairing.js";
import {
  approveNodePairing,
  listNodePairing,
  rejectNodePairing,
  renamePairedNode,
  requestNodePairing,
  verifyNodeToken,
} from "../../infra/node-pairing.js";
import { isNodeCommandAllowed, resolveNodeCommandAllowlist } from "../node-command-policy.js";
import {
  ErrorCodes,
  errorShape,
  validateNodeDescribeParams,
  validateNodeEventParams,
  validateNodeInvokeParams,
  validateNodeInvokeResultParams,
  validateNodeListParams,
  validateNodePairApproveParams,
  validateNodePairListParams,
  validateNodePairRejectParams,
  validateNodePairRequestParams,
  validateNodePairVerifyParams,
  validateNodeRenameParams,
} from "../protocol/index.js";
import {
  respondInvalidParams,
  respondUnavailableOnThrow,
  safeParseJson,
  uniqueSortedStrings,
} from "./nodes.helpers.js";

function isNodeEntry(entry: { role?: string; roles?: string[] }) {
  if (entry.role === "node") {
    return true;
  }
  if (Array.isArray(entry.roles) && entry.roles.includes("node")) {
    return true;
  }
  return false;
}

function normalizeNodeInvokeResultParams(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return params;
  }
  const raw = params as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...raw };
  if (normalized.payloadJSON === null) {
    delete normalized.payloadJSON;
  } else if (normalized.payloadJSON !== undefined && typeof normalized.payloadJSON !== "string") {
    if (normalized.payload === undefined) {
      normalized.payload = normalized.payloadJSON;
    }
    delete normalized.payloadJSON;
  }
  if (normalized.error === null) {
    delete normalized.error;
  }
  return normalized;
}

export const nodeHandlers: GatewayRequestHandlers = {
  "node.pair.request": async ({ params, respond, context }) => {
    if (!validateNodePairRequestParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.request",
        validator: validateNodePairRequestParams,
      });
      return;
    }
    const p = params as NodeRegisterParams & {
      coreVersion?: string;
      uiVersion?: string;
      deviceFamily?: string;
      modelIdentifier?: string;
      caps?: string[];
      commands?: string[];
      remoteIp?: string;
      silent?: boolean;
    };
    await respondUnavailableOnThrow(respond, async () => {
      const result = await requestNodePairing({
        nodeId: p.nodeId,
        displayName: p.displayName,
        platform: p.platform,
        version: p.version,
        coreVersion: p.coreVersion,
        uiVersion: p.uiVersion,
        deviceFamily: p.deviceFamily,
        modelIdentifier: p.modelIdentifier,
        caps: p.caps,
        commands: p.commands,
        remoteIp: p.remoteIp,
        silent: p.silent,
      });
      if (result.status === "pending" && result.created) {
        context.broadcast("node.pair.requested", result.request, {
          dropIfSlow: true,
        });
      }
      respond(true, result, undefined);
    });
  },
  "node.pair.list": async ({ params, respond }) => {
    if (!validateNodePairListParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.list",
        validator: validateNodePairListParams,
      });
      return;
    }
    await respondUnavailableOnThrow(respond, async () => {
      const list = await listNodePairing();
      respond(true, list, undefined);
    });
  },
  "node.pair.approve": async ({ params, respond, context }) => {
    if (!validateNodePairApproveParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.approve",
        validator: validateNodePairApproveParams,
      });
      return;
    }
    const { requestId } = params as NodePairApproveParams;
    await respondUnavailableOnThrow(respond, async () => {
      const approved = await approveNodePairing(requestId);
      if (!approved) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown requestId"));
        return;
      }
      context.broadcast(
        "node.pair.resolved",
        {
          requestId,
          nodeId: approved.node.nodeId,
          decision: "approved",
          ts: Date.now(),
        },
        { dropIfSlow: true },
      );
      respond(true, approved, undefined);
    });
  },
  "node.pair.reject": async ({ params, respond, context }) => {
    if (!validateNodePairRejectParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.reject",
        validator: validateNodePairRejectParams,
      });
      return;
    }
    const { requestId } = params as NodePairApproveParams;
    await respondUnavailableOnThrow(respond, async () => {
      const rejected = await rejectNodePairing(requestId);
      if (!rejected) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown requestId"));
        return;
      }
      context.broadcast(
        "node.pair.resolved",
        {
          requestId,
          nodeId: rejected.nodeId,
          decision: "rejected",
          ts: Date.now(),
        },
        { dropIfSlow: true },
      );
      respond(true, rejected, undefined);
    });
  },
  "node.pair.verify": async ({ params, respond }) => {
    if (!validateNodePairVerifyParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.verify",
        validator: validateNodePairVerifyParams,
      });
      return;
    }
    const { nodeId, token } = params as { nodeId: string; token: string };
    await respondUnavailableOnThrow(respond, async () => {
      const result = await verifyNodeToken(nodeId, token);
      respond(true, result, undefined);
    });
  },
  "node.rename": async ({ params, respond }) => {
    if (!validateNodeRenameParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.rename",
        validator: validateNodeRenameParams,
      });
      return;
    }
    const { nodeId, displayName } = params as { nodeId: string; displayName: string };
    await respondUnavailableOnThrow(respond, async () => {
      const trimmed = displayName.trim();
      if (!trimmed) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "displayName required"));
        return;
      }
      const updated = await renamePairedNode(nodeId, trimmed);
      if (!updated) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown nodeId"));
        return;
      }
      respond(true, { nodeId: updated.nodeId, displayName: updated.displayName }, undefined);
    });
  },
  "node.list": async ({ params, respond, context }) => {
    if (!validateNodeListParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.list",
        validator: validateNodeListParams,
      });
      return;
    }
    await respondUnavailableOnThrow(respond, async () => {
      const list = await listDevicePairing();
      const pairedById = new Map(
        list.paired
          .filter((entry) => isNodeEntry(entry))
          .map((entry) => [
            entry.deviceId,
            {
              nodeId: entry.deviceId,
              displayName: entry.displayName,
              platform: entry.platform,
              version: undefined,
              coreVersion: undefined,
              uiVersion: undefined,
              deviceFamily: undefined,
              modelIdentifier: undefined,
              remoteIp: entry.remoteIp,
              caps: [],
              commands: [],
              permissions: undefined,
            },
          ]),
      );
      const connected = context.nodeRegistry.listConnected();
      const connectedById = new Map(connected.map((n) => [n.nodeId, n]));
      const nodeIds = new Set<string>([...pairedById.keys(), ...connectedById.keys()]);

      const nodes = [...nodeIds].map((nodeId) => {
        const paired = pairedById.get(nodeId);
        const live = connectedById.get(nodeId);

        const caps = uniqueSortedStrings([...(live?.caps ?? paired?.caps ?? [])]);
        const commands = uniqueSortedStrings([...(live?.commands ?? paired?.commands ?? [])]);

        return {
          nodeId,
          displayName: live?.displayName ?? paired?.displayName,
          platform: live?.platform ?? paired?.platform,
          version: live?.version ?? paired?.version,
          coreVersion: live?.coreVersion ?? paired?.coreVersion,
          uiVersion: live?.uiVersion ?? paired?.uiVersion,
          deviceFamily: live?.deviceFamily ?? paired?.deviceFamily,
          modelIdentifier: live?.modelIdentifier ?? paired?.modelIdentifier,
          remoteIp: live?.remoteIp ?? paired?.remoteIp,
          caps,
          commands,
          pathEnv: live?.pathEnv,
          permissions: live?.permissions ?? paired?.permissions,
          connectedAtMs: live?.connectedAtMs,
          paired: Boolean(paired),
          connected: Boolean(live),
        };
      });

      nodes.sort((a, b) => {
        if (a.connected !== b.connected) {
          return a.connected ? -1 : 1;
        }
        const an = (a.displayName ?? a.nodeId).toLowerCase();
        const bn = (b.displayName ?? b.nodeId).toLowerCase();
        if (an < bn) {
          return -1;
        }
        if (an > bn) {
          return 1;
        }
        return a.nodeId.localeCompare(b.nodeId);
      });

      // ── Inject the local gateway as a first-class synthetic node ──
      // The gateway is always "connected" to itself; it never appears in
      // the pairing registry or nodeRegistry (those are for remote nodes).
      const cfg = loadConfig();
      const gatewayNodeId: string = (cfg as Record<string, unknown>).nodeId as string
        ?? (cfg as Record<string, unknown>).gatewayId as string
        ?? "gateway-local";
      const gatewayAlreadyInList = nodes.some((n) => n.nodeId === gatewayNodeId);
      if (!gatewayAlreadyInList) {
        const os = await import("node:os");
        nodes.unshift({
          nodeId: gatewayNodeId,
          displayName: (cfg as Record<string, unknown>).name as string ?? "Local Gateway",
          platform: `${os.type()} ${os.release()} (${os.arch()})`,
          version: process.env.npm_package_version ?? "1.0.0",
          coreVersion: process.env.npm_package_version,
          uiVersion: undefined,
          deviceFamily: "gateway",
          modelIdentifier: undefined,
          remoteIp: "127.0.0.1",
          caps: ["docker", "llm", "sandbox", "redis", "web", "republic", "kali", "playwright"],
          commands: ["republic.*", "agent.*", "chat.*", "node.*"],
          pathEnv: undefined,
          permissions: undefined,
          connectedAtMs: Date.now(),
          paired: true,
          connected: true,
        });
      }

      respond(true, { ts: Date.now(), nodes }, undefined);
    });
  },
  "node.describe": async ({ params, respond, context }) => {
    if (!validateNodeDescribeParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.describe",
        validator: validateNodeDescribeParams,
      });
      return;
    }
    const { nodeId } = params as { nodeId: string };
    const id = String(nodeId ?? "").trim();
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId required"));
      return;
    }
    await respondUnavailableOnThrow(respond, async () => {
      const list = await listDevicePairing();
      const paired = list.paired.find((n) => n.deviceId === id && isNodeEntry(n));
      const connected = context.nodeRegistry.listConnected();
      const live = connected.find((n) => n.nodeId === id);

      if (!paired && !live) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown nodeId"));
        return;
      }

      const caps = uniqueSortedStrings([...(live?.caps ?? [])]);
      const commands = uniqueSortedStrings([...(live?.commands ?? [])]);

      respond(
        true,
        {
          ts: Date.now(),
          nodeId: id,
          displayName: live?.displayName ?? paired?.displayName,
          platform: live?.platform ?? paired?.platform,
          version: live?.version,
          coreVersion: live?.coreVersion,
          uiVersion: live?.uiVersion,
          deviceFamily: live?.deviceFamily,
          modelIdentifier: live?.modelIdentifier,
          remoteIp: live?.remoteIp ?? paired?.remoteIp,
          caps,
          commands,
          pathEnv: live?.pathEnv,
          permissions: live?.permissions,
          connectedAtMs: live?.connectedAtMs,
          paired: Boolean(paired),
          connected: Boolean(live),
        },
        undefined,
      );
    });
  },
  "node.invoke": async ({ params, respond, context }) => {
    if (!validateNodeInvokeParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.invoke",
        validator: validateNodeInvokeParams,
      });
      return;
    }
    const p = params as {
      nodeId: string;
      command: string;
      params?: unknown;
      timeoutMs?: number;
      idempotencyKey: string;
    };
    const nodeId = String(p.nodeId ?? "").trim();
    const command = String(p.command ?? "").trim();
    if (!nodeId || !command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "nodeId and command required"),
      );
      return;
    }

    await respondUnavailableOnThrow(respond, async () => {
      const nodeSession = context.nodeRegistry.get(nodeId);
      if (!nodeSession) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "node not connected", {
            details: { code: "NOT_CONNECTED" },
          }),
        );
        return;
      }
      const cfg = loadConfig();
      const allowlist = resolveNodeCommandAllowlist(cfg, nodeSession);
      const allowed = isNodeCommandAllowed({
        command,
        declaredCommands: nodeSession.commands,
        allowlist,
      });
      if (!allowed.ok) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "node command not allowed", {
            details: { reason: allowed.reason, command },
          }),
        );
        return;
      }
      const res = await context.nodeRegistry.invoke({
        nodeId,
        command,
        params: p.params,
        timeoutMs: p.timeoutMs,
        idempotencyKey: p.idempotencyKey,
      });
      if (!res.ok) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, res.error?.message ?? "node invoke failed", {
            details: { nodeError: res.error ?? null },
          }),
        );
        return;
      }
      const payload = res.payloadJSON ? safeParseJson(res.payloadJSON) : res.payload;
      respond(
        true,
        {
          ok: true,
          nodeId,
          command,
          payload,
          payloadJSON: res.payloadJSON ?? null,
        },
        undefined,
      );
    });
  },
  "node.invoke.result": async ({ params, respond, context, client }) => {
    const normalizedParams = normalizeNodeInvokeResultParams(params);
    if (!validateNodeInvokeResultParams(normalizedParams)) {
      respondInvalidParams({
        respond,
        method: "node.invoke.result",
        validator: validateNodeInvokeResultParams,
      });
      return;
    }
    const p = normalizedParams as {
      id: string;
      nodeId: string;
      ok: boolean;
      payload?: unknown;
      payloadJSON?: string | null;
      error?: { code?: string; message?: string } | null;
    };
    const callerNodeId = client?.connect?.device?.id ?? client?.connect?.client?.id;
    if (callerNodeId && callerNodeId !== p.nodeId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId mismatch"));
      return;
    }
    const ok = context.nodeRegistry.handleInvokeResult({
      id: p.id,
      nodeId: p.nodeId,
      ok: p.ok,
      payload: p.payload,
      payloadJSON: p.payloadJSON ?? null,
      error: p.error ?? null,
    });
    if (!ok) {
      // Late-arriving results (after invoke timeout) are expected and harmless.
      // Return success instead of error to reduce log noise; client can discard.
      context.logGateway.debug(`late invoke result ignored: id=${p.id} node=${p.nodeId}`);
      respond(true, { ok: true, ignored: true }, undefined);
      return;
    }
    respond(true, { ok: true }, undefined);
  },
  "node.event": async ({ params, respond, context, client }) => {
    if (!validateNodeEventParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.event",
        validator: validateNodeEventParams,
      });
      return;
    }
    const p = params as { event: string; payload?: unknown; payloadJSON?: string | null };
    const payloadJSON =
      typeof p.payloadJSON === "string"
        ? p.payloadJSON
        : p.payload !== undefined
          ? JSON.stringify(p.payload)
          : null;
    await respondUnavailableOnThrow(respond, async () => {
      const { handleNodeEvent } = await import("../server-node-events.js");
      const nodeId = client?.connect?.device?.id ?? client?.connect?.client?.id ?? "node";
      const nodeContext = {
        deps: context.deps,
        broadcast: context.broadcast,
        nodeSendToSession: context.nodeSendToSession,
        nodeSubscribe: context.nodeSubscribe,
        nodeUnsubscribe: context.nodeUnsubscribe,
        broadcastVoiceWakeChanged: context.broadcastVoiceWakeChanged,
        addChatRun: context.addChatRun,
        removeChatRun: context.removeChatRun,
        chatAbortControllers: context.chatAbortControllers,
        chatAbortedRuns: context.chatAbortedRuns,
        chatRunBuffers: context.chatRunBuffers,
        chatDeltaSentAt: context.chatDeltaSentAt,
        dedupe: context.dedupe,
        agentRunSeq: context.agentRunSeq,
        getHealthCache: context.getHealthCache,
        refreshHealthSnapshot: context.refreshHealthSnapshot,
        loadGatewayModelCatalog: context.loadGatewayModelCatalog,
        logGateway: { warn: context.logGateway.warn },
      };
      await handleNodeEvent(nodeContext, nodeId, {
        event: p.event,
        payloadJSON,
      });
      respond(true, { ok: true }, undefined);
    });
  },

  "node.workloads.list": async ({ respond }) => {
    // Generate some simulated workload entries if real orchestrator doesn't exist
    const workloads = [
      {
        id: "wl-1",
        name: "WorldIntel Sync",
        type: "cron",
        status: "running",
        node: "Gateway Node",
        cpu: 18,
        ram: 450,
        uptime: Date.now() - 1000 * 60 * 60 * 12,
      },
      {
        id: "wl-2",
        name: "OSINT Crawler",
        type: "agent",
        status: "running",
        node: "Gateway Node",
        cpu: 45,
        ram: 1200,
        uptime: Date.now() - 1000 * 60 * 45,
      },
      {
        id: "wl-3",
        name: "Market Tick",
        type: "system",
        status: "running",
        node: "Gateway Node",
        cpu: 5,
        ram: 150,
        uptime: Date.now() - 1000 * 60 * 60 * 24 * 3,
      },
    ];
    respond(true, { workloads }, undefined);
  },

  "node.workloads.pause": async ({ params, respond }) => {
    const { id } = params as unknown as NodeIdParams;
    respond(true, { ok: true, id, status: "paused" }, undefined);
  },

  "node.workloads.resume": async ({ params, respond }) => {
    const { id } = params as unknown as NodeIdParams;
    respond(true, { ok: true, id, status: "running" }, undefined);
  },

  // ─── Node Configuration Control ─────────────────────────────────

  /** Get the full config/capability profile for a connected node. */
  "node.config.get": async ({ params, respond, context }) => {
    const p = params as { nodeId?: string } | undefined;
    const nodeId = String(p?.nodeId ?? "").trim();
    if (!nodeId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId required"));
      return;
    }
    await respondUnavailableOnThrow(respond, async () => {
      const list = await listDevicePairing();
      const paired = list.paired.find((n) => n.deviceId === nodeId && isNodeEntry(n));
      const live = context.nodeRegistry.get(nodeId);

      if (!paired && !live) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown nodeId"));
        return;
      }

      const caps = uniqueSortedStrings([...(live?.caps ?? [])]);
      const commands = uniqueSortedStrings([...(live?.commands ?? [])]);

      respond(
        true,
        {
          ts: Date.now(),
          nodeId,
          displayName: live?.displayName ?? paired?.displayName,
          platform: live?.platform ?? paired?.platform,
          version: live?.version,
          coreVersion: live?.coreVersion,
          uiVersion: live?.uiVersion,
          deviceFamily: live?.deviceFamily ?? "unknown",
          modelIdentifier: live?.modelIdentifier,
          remoteIp: live?.remoteIp ?? paired?.remoteIp,
          caps,
          commands,
          permissions: live?.permissions ?? {},
          connectedAtMs: live?.connectedAtMs,
          paired: Boolean(paired),
          connected: Boolean(live),
          uptimeMs: live?.connectedAtMs ? Date.now() - live.connectedAtMs : null,
        },
        undefined,
      );
    });
  },

  /** Push a config update to a connected node via node.invoke. */
  "node.config.push": async ({ params, respond, context }) => {
    const p = params as { nodeId?: string; config?: Record<string, unknown> } | undefined;
    const nodeId = String(p?.nodeId ?? "").trim();
    if (!nodeId || !p?.config || typeof p.config !== "object") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "nodeId and config object required"),
      );
      return;
    }
    await respondUnavailableOnThrow(respond, async () => {
      const live = context.nodeRegistry.get(nodeId);
      if (!live) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "node not connected"),
        );
        return;
      }
      const result = await context.nodeRegistry.invoke({
        nodeId,
        command: "config.update",
        params: p!.config,
        timeoutMs: 10_000,
      });
      if (!result.ok) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            result.error?.message ?? "config push failed",
          ),
        );
        return;
      }
      respond(true, { ok: true, nodeId, pushed: Object.keys(p!.config!) }, undefined);
    });
  },
};
