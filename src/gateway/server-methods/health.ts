import { getStatusSummary } from "../../commands/status.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { HEALTH_REFRESH_INTERVAL_MS } from "../server-constants.js";
import { formatError } from "../server-utils.js";
import { formatForLog } from "../ws-log.js";
import { registryRegister } from "./handler-registry.js";
import { defineHandlers, toHandlerMap } from "./types.js";

const healthDescriptors = defineHandlers({
  health: {
    scope: "read",
    handler: async ({ respond, context, params, client }) => {
      const { getHealthCache, refreshHealthSnapshot, logHealth } = context;
      const wantsProbe = params?.probe === true;
      const now = Date.now();
      const cached = getHealthCache();

      // Node clients (ESP32/M5Stick) only parse a handful of health fields.
      // The full HealthSummary is 285KB — way over the 15KB WS buffer limit.
      const isNode = (client?.connect as { role?: string } | undefined)?.role === "node";

      const slimIfNode = (snap: unknown) => {
        if (!isNode) {
          return snap;
        }
        const h = snap as Record<string, unknown>;
        const cpu = h.cpu as { percent?: number } | undefined;
        const mem = h.memory as { usedMB?: number; totalMB?: number } | undefined;
        const clients = h.clients as { active?: number } | undefined;
        const sessions = h.sessions as { active?: number } | undefined;
        return {
          ts: h.ts,
          version: h.version,
          uptime: h.uptime,
          cpu: { percent: cpu?.percent ?? 0 },
          memory: { usedMB: mem?.usedMB ?? 0, totalMB: mem?.totalMB ?? 0 },
          clients: { active: clients?.active ?? 0 },
          sessions: { active: sessions?.active ?? 0 },
        };
      };

      const injectAgentMode = (snap: unknown) => {
        const obj = snap as Record<string, unknown>;
        return { ...obj, agentMode: process.env.HOC_AGENT_MODE === "1" };
      };

      if (!wantsProbe && cached && now - cached.ts < HEALTH_REFRESH_INTERVAL_MS) {
        respond(true, injectAgentMode(slimIfNode(cached)), undefined, { cached: true });
        void refreshHealthSnapshot({ probe: false }).catch((err) =>
          logHealth.error(`background health refresh failed: ${formatError(err)}`),
        );
        return;
      }
      try {
        const snap = await refreshHealthSnapshot({ probe: wantsProbe });
        respond(true, injectAgentMode(slimIfNode(snap)), undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
      }
    },
  },
  status: {
    scope: "read",
    handler: async ({ respond }) => {
      const status = await getStatusSummary();
      respond(true, status, undefined);
    },
  },
  "health.check": {
    scope: "read",
    handler: async (ctx) => {
      // Just alias to the main health responder
      return healthDescriptors.health.handler(ctx);
    },
  },
  "health.providers": {
    scope: "read",
    handler: async ({ respond }) => {
      const { getCloudProviderStatus } = await import("../../republic/cloud-inference.js");
      const status = getCloudProviderStatus();
      respond(true, status, undefined);
    },
  },
});

registryRegister(healthDescriptors);
export const healthHandlers = toHandlerMap(healthDescriptors);
