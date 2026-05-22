import type { TalkModeParams } from "./rpc-params.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateTalkModeParams,
} from "../protocol/index.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

const talkDescriptors = defineHandlers({
  "talk.mode": {
    scope: "write",
    handler: ({ params, respond, context, client, isWebchatConnect }) => {
      if (client && isWebchatConnect(client.connect) && !context.hasConnectedMobileNode()) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "talk disabled: no connected iOS/Android nodes"),
        );
        return;
      }
      if (!validateTalkModeParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid talk.mode params: ${formatValidationErrors(validateTalkModeParams.errors)}`,
          ),
        );
        return;
      }
      const p = params as TalkModeParams;
      const payload = {
        enabled: p.enabled,
        phase: p.phase ?? null,
        ts: Date.now(),
      };
      context.broadcast("talk.mode", payload, { dropIfSlow: true });
      respond(true, payload, undefined);
    },
  },
});

registryRegister(talkDescriptors);
export const talkHandlers = toHandlerMap(talkDescriptors);
