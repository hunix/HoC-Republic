import type { ModelSwitchParams, ModelActiveParams } from "./rpc-params.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

/**
 * Per-session active model overrides.
 * Key: sessionKey, Value: { provider, modelId }
 */
const sessionModelOverrides = new Map<string, { provider: string; modelId: string }>();

/** Expose for other handlers (e.g. chat.send) to read overrides */
export function getSessionModelOverride(
  sessionKey: string,
): { provider: string; modelId: string } | undefined {
  return sessionModelOverrides.get(sessionKey);
}

const modelsDescriptors = defineHandlers({
  "models.list": {
    scope: "read",
    handler: async ({ params, respond, context }) => {
      if (!validateModelsListParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
          ),
        );
        return;
      }
      try {
        const models = await context.loadGatewayModelCatalog();
        respond(true, { models }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      }
    },
  },

  "models.switch": {
    scope: "write",
    handler: async ({ params, respond, context }) => {
      const p = params as ModelSwitchParams | undefined;
      if (!p?.provider || !p?.modelId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "provider and modelId are required"),
        );
        return;
      }
      const sessionKey = p.sessionKey ?? "default";

      try {
        const catalog = await context.loadGatewayModelCatalog();
        const found = catalog.some((m) => m.provider === p.provider && m.id === p.modelId);
        if (!found) {
          context.logGateway.info?.(
            `models.switch: model ${p.provider}/${p.modelId} not in catalog, allowing override`,
          );
        }
      } catch {
        // Catalog unavailable — allow switch anyway
      }

      sessionModelOverrides.set(sessionKey, { provider: p.provider, modelId: p.modelId });

      // Persist to session store so the reply pipeline picks it up
      try {
        const { loadSessionEntry } = await import("../session-utils.js");
        const { updateSessionStore } = await import("../../config/sessions.js");
        const { storePath, canonicalKey } = loadSessionEntry(sessionKey);
        if (storePath) {
          await updateSessionStore(storePath, (store) => {
            const existing = store[canonicalKey] ?? store[sessionKey];
            const key = existing ? (store[canonicalKey] ? canonicalKey : sessionKey) : canonicalKey;
            const entry = existing ?? ({} as Record<string, unknown>);
            (entry as Record<string, unknown>).modelOverride = p.modelId;
            (entry as Record<string, unknown>).providerOverride = p.provider;
            store[key] = entry as import("../../config/sessions.js").SessionEntry;
          });
        }
      } catch {
        // Best-effort — in-memory override still works
      }

      respond(
        true,
        {
          ok: true,
          sessionKey,
          activeModel: { provider: p.provider, modelId: p.modelId },
        },
        undefined,
      );
    },
  },

  "models.active": {
    scope: "read",
    handler: async ({ params, respond, context }) => {
      const p = params as ModelActiveParams | undefined;
      const sessionKey = p?.sessionKey ?? "default";
      const override = sessionModelOverrides.get(sessionKey);

      try {
        const catalog = await context.loadGatewayModelCatalog();
        respond(
          true,
          {
            sessionKey,
            activeModel: override ?? null,
            isOverride: !!override,
            catalog,
          },
          undefined,
        );
      } catch {
        respond(
          true,
          {
            sessionKey,
            activeModel: override ?? null,
            isOverride: !!override,
            catalog: [],
          },
          undefined,
        );
      }
    },
  },
});

registryRegister(modelsDescriptors);
export const modelsHandlers = toHandlerMap(modelsDescriptors);
