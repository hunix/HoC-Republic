import type { ModelCatalogEntry } from "../../agents/model-catalog.js";
import type { createDefaultDeps } from "../../cli/deps.js";
import type { HealthSummary } from "../../commands/health.js";
import type { CronService } from "../../cron/service.js";
import type { createSubsystemLogger } from "../../logging/subsystem.js";
import type { WizardSession } from "../../wizard/session.js";
import type { ChatAbortControllerEntry } from "../chat-abort.js";
import type { NodeRegistry } from "../node-registry.js";
import type { ConnectParams, ErrorShape, RequestFrame } from "../protocol/index.js";
import type { ChannelRuntimeSnapshot } from "../server-channels.js";
import type { DedupeEntry } from "../server-shared.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

// Import (type-only to avoid cycles if possible, but class is fine here)
import type { QuantumGatewayBridge } from "../../intelligence/quantum-gateway-bridge.js";

export type GatewayClient = {
  connect: ConnectParams;
  connId?: string;
};

export type RespondFn = (
  ok: boolean,
  payload?: unknown,
  error?: ErrorShape,
  meta?: Record<string, unknown>,
) => void;

export type GatewayRequestContext = {
  deps: ReturnType<typeof createDefaultDeps>;
  cron: CronService;
  cronStorePath: string;
  loadGatewayModelCatalog: () => Promise<ModelCatalogEntry[]>;
  getHealthCache: () => HealthSummary | null;
  refreshHealthSnapshot: (opts?: { probe?: boolean }) => Promise<HealthSummary>;
  logHealth: { error: (message: string) => void };
  logGateway: SubsystemLogger;
  incrementPresenceVersion: () => number;
  getHealthVersion: () => number;
  broadcast: (
    event: string,
    payload: unknown,
    opts?: {
      dropIfSlow?: boolean;
      stateVersion?: { presence?: number; health?: number };
    },
  ) => void;
  broadcastToConnIds: (
    event: string,
    payload: unknown,
    connIds: ReadonlySet<string>,
    opts?: {
      dropIfSlow?: boolean;
      stateVersion?: { presence?: number; health?: number };
    },
  ) => void;
  nodeSendToSession: (sessionKey: string, event: string, payload: unknown) => void;
  nodeSendToAllSubscribed: (event: string, payload: unknown) => void;
  nodeSubscribe: (nodeId: string, sessionKey: string) => void;
  nodeUnsubscribe: (nodeId: string, sessionKey: string) => void;
  nodeUnsubscribeAll: (nodeId: string) => void;
  hasConnectedMobileNode: () => boolean;
  nodeRegistry: NodeRegistry;
  agentRunSeq: Map<string, number>;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  chatAbortedRuns: Map<string, number>;
  chatRunBuffers: Map<string, string>;
  chatDeltaSentAt: Map<string, number>;
  addChatRun: (sessionId: string, entry: { sessionKey: string; clientRunId: string }) => void;
  removeChatRun: (
    sessionId: string,
    clientRunId: string,
    sessionKey?: string,
  ) => { sessionKey: string; clientRunId: string } | undefined;
  registerToolEventRecipient: (runId: string, connId: string) => void;
  dedupe: Map<string, DedupeEntry>;
  wizardSessions: Map<string, WizardSession>;
  findRunningWizard: () => string | null;
  purgeWizardSession: (id: string) => void;
  getRuntimeSnapshot: () => ChannelRuntimeSnapshot;
  startChannel: (
    channel: import("../../channels/plugins/types.js").ChannelId,
    accountId?: string,
  ) => Promise<void>;
  stopChannel: (
    channel: import("../../channels/plugins/types.js").ChannelId,
    accountId?: string,
  ) => Promise<void>;
  markChannelLoggedOut: (
    channelId: import("../../channels/plugins/types.js").ChannelId,
    cleared: boolean,
    accountId?: string,
  ) => void;
  wizardRunner: (
    opts: import("../../commands/onboard-types.js").OnboardOptions,
    runtime: import("../../runtime.js").RuntimeEnv,
    prompter: import("../../wizard/prompts.js").WizardPrompter,
  ) => Promise<void>;
  broadcastVoiceWakeChanged: (triggers: string[]) => void;
  /** Infrastructure subsystems — populated at runtime by sidecar setup */
  gateway?: {
    n8nBridge?: unknown;
    dockerOrchestrator?: unknown;
    clusterManager?: unknown;
    nodeRegistry?: unknown;
    infraControlPlane?: unknown;
    [key: string]: unknown;
  };
  quantumBridge?: QuantumGatewayBridge;
};

export type GatewayRequestOptions = {
  req: RequestFrame;
  client: GatewayClient | null;
  isWebchatConnect: (params: ConnectParams | null | undefined) => boolean;
  respond: RespondFn;
  context: GatewayRequestContext;
};

export type GatewayRequestHandlerOptions = {
  req: RequestFrame;
  params: Record<string, unknown>;
  client: GatewayClient | null;
  isWebchatConnect: (params: ConnectParams | null | undefined) => boolean;
  respond: RespondFn;
  context: GatewayRequestContext;
};

export type GatewayRequestHandler = (opts: GatewayRequestHandlerOptions) => Promise<void> | void;

export type GatewayRequestHandlers = Record<string, GatewayRequestHandler>;

// ─── Typed Handler Descriptors (Phase 2) ───────────────────────────────────
//
// HandlerDescriptor co-locates each RPC handler with its authorization scope.
// This replaces the flat READ_METHODS / WRITE_METHODS sets in server-methods.ts
// which had no compile-time link to the handler definitions and drifted silently.
//
// Usage in a handler barrel:
//   export const fooDesc = defineHandlers({
//     "foo.list":   { scope: "read",  handler: async (...) => { ... } },
//     "foo.create": { scope: "write", handler: async (...) => { ... } },
//     "foo.admin":  { scope: "admin", handler: async (...) => { ... } },
//   });
//
// Then in server-methods.ts:
//   import { fooDesc } from "./server-methods/foo.js";
//   const allHandlers = mergeDescriptors(fooDesc, barDesc, ...);
//   // authorizeGatewayMethod reads allHandlers[method].scope

/**
 * The authorization scope for a gateway RPC method.
 *
 * - `public`  — No token required (login, onboard, pairing, health pings).
 * - `read`    — Valid token required; does not mutate persistent state.
 * - `write`   — Valid token required; mutates state (creates, updates, deletes).
 * - `admin`   — Valid token required + extra gate (admin-level operations).
 */
export type HandlerScope = "public" | "read" | "write" | "admin";

export type HandlerDescriptor = {
  scope: HandlerScope;
  handler: GatewayRequestHandler;
};

export type HandlerDescriptorMap = Record<string, HandlerDescriptor>;

/**
 * Type-safe helper to define a map of typed handler descriptors.
 * Provides IDE autocomplete and enforces `scope` on every entry.
 *
 * @example
 * export const sessionHandlers = defineHandlers({
 *   "sessions.list":   { scope: "read",  handler: async (...) => { ... } },
 *   "sessions.delete": { scope: "write", handler: async (...) => { ... } },
 * });
 */
export function defineHandlers(map: HandlerDescriptorMap): HandlerDescriptorMap {
  return map;
}

/**
 * Extract only the handler functions from a descriptor map, for use in the
 * existing `GatewayRequestHandlers` pattern while the migration is in progress.
 */
export function toHandlerMap(descriptors: HandlerDescriptorMap): GatewayRequestHandlers {
  const out: GatewayRequestHandlers = {};
  for (const [method, desc] of Object.entries(descriptors)) {
    out[method] = desc.handler;
  }
  return out;
}

/**
 * Merge multiple descriptor maps into one, for use in server-methods.ts.
 * Duplicate method names produce a runtime error during startup.
 */
export function mergeDescriptors(...maps: HandlerDescriptorMap[]): HandlerDescriptorMap {
  const out: HandlerDescriptorMap = {};
  for (const map of maps) {
    for (const [method, desc] of Object.entries(map)) {
      if (out[method]) {
        throw new Error(`[gateway] Duplicate handler descriptor: "${method}"`);
      }
      out[method] = desc;
    }
  }
  return out;
}
