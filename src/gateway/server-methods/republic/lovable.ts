/**
 * Open Lovable — Gateway RPC Handlers
 *
 * Provides queue status, website cloning, job listing, and job cancellation
 * endpoints for the Open Lovable UI.
 *
 * These handlers return clean empty/initial state when the plugin is not
 * active, and delegate to the plugin's registered gateway methods when it is.
 */

import type { RespondFn } from "../types.js";
import { getPluginGatewayMethod } from "../../../republic/hoc-plugin-manager.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

/** Resolve a plugin handler, call it, and respond with the result. */
function callPluginHandler(
  method: string,
  params: unknown,
  respond: RespondFn,
  fallback: () => void,
): void {
  const handler = getPluginGatewayMethod(method) as ((params: unknown) => unknown) | undefined;
  if (typeof handler === "function") {
    try {
      const result = handler(params);
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
    return;
  }
  fallback();
}

const lovableDescriptors = defineHandlers({
  "lovable.queue-status": {
    scope: "read",
    handler: ({ respond }) => {
      callPluginHandler("lovable.queue-status", undefined, respond, () => {
        respond(true, { total: 0, queued: 0, running: 0, completed: 0, failed: 0 }, undefined);
      });
    },
  },

  "lovable.generate": {
    scope: "write",
    handler: ({ params, respond }) => {
      callPluginHandler("lovable.generate", params, respond, () => {
        respond(
          true,
          {
            id: `lovable-gen-${Date.now()}`,
            citizenId: "system",
            citizenName: "System",
            mode: "generate",
            prompt: (params as { prompt?: string })?.prompt ?? "",
            status: "queued",
            progress: 0,
            createdAt: Date.now(),
          },
          undefined,
        );
      });
    },
  },

  "lovable.clone": {
    scope: "write",
    handler: ({ params, respond }) => {
      callPluginHandler("lovable.clone", params, respond, () => {
        respond(
          true,
          {
            id: `lovable-clone-${Date.now()}`,
            citizenId: "system",
            citizenName: "System",
            mode: "clone",
            sourceUrl: (params as { url?: string })?.url ?? "",
            status: "queued",
            progress: 0,
            createdAt: Date.now(),
          },
          undefined,
        );
      });
    },
  },

  "lovable.cancel": {
    scope: "write",
    handler: ({ params, respond }) => {
      callPluginHandler("lovable.cancel", params, respond, () => {
        respond(true, { ok: true, jobId: (params as { jobId?: string })?.jobId }, undefined);
      });
    },
  },

  "lovable.list-jobs": {
    scope: "read",
    handler: ({ respond }) => {
      callPluginHandler("lovable.list-jobs", undefined, respond, () => {
        respond(true, { jobs: [] }, undefined);
      });
    },
  },
});

registryRegister(lovableDescriptors);
export const lovableHandlers = toHandlerMap(lovableDescriptors);
