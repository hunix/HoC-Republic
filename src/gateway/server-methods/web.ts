import type { WebLoginParams } from "./rpc-params.js";
import { listChannelPlugins } from "../../channels/plugins/index.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateWebLoginStartParams,
  validateWebLoginWaitParams,
} from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

const WEB_LOGIN_METHODS = new Set(["web.login.start", "web.login.wait"]);

const resolveWebLoginProvider = () =>
  listChannelPlugins().find((plugin) =>
    (plugin.gatewayMethods ?? []).some((method) => WEB_LOGIN_METHODS.has(method)),
  ) ?? null;

const webDescriptors = defineHandlers({
  "web.login.start": {
    scope: "write",
    handler: async ({ params, respond, context }) => {
      if (!validateWebLoginStartParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid web.login.start params: ${formatValidationErrors(validateWebLoginStartParams.errors)}`,
          ),
        );
        return;
      }
      try {
        const p = params as WebLoginParams;
        const accountId = typeof p.accountId === "string" ? p.accountId : undefined;
        const provider = resolveWebLoginProvider();
        if (!provider) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "web login provider is not available"),
          );
          return;
        }
        await context.stopChannel(provider.id, accountId);
        if (!provider.gateway?.loginWithQrStart) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `web login is not supported by provider ${provider.id}`,
            ),
          );
          return;
        }
        const result = await provider.gateway.loginWithQrStart({
          force: Boolean(p.force),
          timeoutMs: typeof p.timeoutMs === "number" ? p.timeoutMs : undefined,
          verbose: Boolean(p.verbose),
          accountId,
        });
        respond(true, result, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
      }
    },
  },

  "web.login.wait": {
    scope: "write",
    handler: async ({ params, respond, context }) => {
      if (!validateWebLoginWaitParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid web.login.wait params: ${formatValidationErrors(validateWebLoginWaitParams.errors)}`,
          ),
        );
        return;
      }
      try {
        const p = params as WebLoginParams;
        const accountId = typeof p.accountId === "string" ? p.accountId : undefined;
        const provider = resolveWebLoginProvider();
        if (!provider) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "web login provider is not available"),
          );
          return;
        }
        if (!provider.gateway?.loginWithQrWait) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `web login is not supported by provider ${provider.id}`,
            ),
          );
          return;
        }
        const result = await provider.gateway.loginWithQrWait({
          timeoutMs: typeof p.timeoutMs === "number" ? p.timeoutMs : undefined,
          accountId,
        });
        if (result.connected) {
          await context.startChannel(provider.id, accountId);
        }
        respond(true, result, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
      }
    },
  },
});

registryRegister(webDescriptors);
export const webHandlers = toHandlerMap(webDescriptors);
