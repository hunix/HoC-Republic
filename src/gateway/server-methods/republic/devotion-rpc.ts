import type { GatewayRequestHandlers } from "../types.js";
import { getDevotionProfile, getSoulSyncDiagnostics } from "../../../republic/citizen-devotion.js";
import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const devotionHandlers: Partial<GatewayRequestHandlers> = {
  "republic.devotion.status": ({ respond }) => {
    const s = getState();
    const diagnostics = getSoulSyncDiagnostics(s);
    respond(true, { diagnostics }, undefined);
  },

  "republic.devotion.invocations": ({ respond }) => {
    const s = getState();
    const diagnostics = getSoulSyncDiagnostics(s);
    respond(true, { invocations: diagnostics.recentInvocations }, undefined);
  },

  "republic.devotion.profile": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId is required"),
      );
      return;
    }
    const profile = getDevotionProfile(p.citizenId);
    if (!profile) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Profile not found for citizen"),
      );
      return;
    }
    respond(true, { profile }, undefined);
  },
};
