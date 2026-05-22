import { ErrorCodes, errorShape } from "../protocol/index.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

const connectDescriptors = defineHandlers({
  connect: {
    scope: "public",
    handler: ({ respond }) => {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "connect is only valid as the first request"),
      );
    },
  },
});

registryRegister(connectDescriptors);
export const connectHandlers = toHandlerMap(connectDescriptors);
