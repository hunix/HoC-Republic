import { loadVoiceWakeConfig, setVoiceWakeTriggers } from "../../infra/voicewake.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { normalizeVoiceWakeTriggers } from "../server-utils.js";
import { formatForLog } from "../ws-log.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

const voicewakeDescriptors = defineHandlers({
  "voicewake.get": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const cfg = await loadVoiceWakeConfig();
        respond(true, { triggers: cfg.triggers });
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
      }
    },
  },
  "voicewake.set": {
    scope: "write",
    handler: async ({ params, respond, context }) => {
      if (!Array.isArray(params.triggers)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "voicewake.set requires triggers: string[]"),
        );
        return;
      }
      try {
        const triggers = normalizeVoiceWakeTriggers(params.triggers as string[]);
        const cfg = await setVoiceWakeTriggers(triggers);
        context.broadcastVoiceWakeChanged(cfg.triggers);
        respond(true, { triggers: cfg.triggers });
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
      }
    },
  },
});

registryRegister(voicewakeDescriptors);
export const voicewakeHandlers = toHandlerMap(voicewakeDescriptors);
