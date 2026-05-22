/**
 * Republic Gateway Handlers — diagnostics
 *
 * Exposes the simulation diagnostics via RPC for the Web UI.
 */

import { getDiagnostics } from "../../../republic/sim-diagnostics.js";
import { getState } from "../../../republic/state.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const diagnosticsDescriptors = defineHandlers({
  /**
   * republic.diagnostics
   *
   * Returns a comprehensive diagnostics snapshot of the simulation:
   * tick health, population metrics, agent pipeline stats, learning
   * metrics, provider statuses, tier distribution, recent errors,
   * and simulation state flags.
   */
  "republic.diagnostics": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const diag = getDiagnostics(s);
      respond(true, diag, undefined);
    },
  },
});

registryRegister(diagnosticsDescriptors);
export const diagnosticsHandlers = toHandlerMap(diagnosticsDescriptors);
