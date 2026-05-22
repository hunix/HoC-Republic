/**
 * Boot Status RPC — exposes boot orchestrator state to UI.
 *
 * Methods:
 *   republic.boot.status   → full boot status + all items
 *   republic.boot.timeline → items sorted by start time (for timeline viz)
 */

import type { GatewayRequestHandlers } from "../types.js";
import { getBootOrchestrator } from "../../boot-orchestrator.js";

export const bootStatusHandlers: GatewayRequestHandlers = {
  "republic.boot.status": ({ respond }) => {
    const orc = getBootOrchestrator();
    respond(true, { ok: true, ...orc.getStatus() }, undefined);
  },

  "republic.boot.timeline": ({ respond }) => {
    const orc = getBootOrchestrator();
    const status = orc.getStatus();

    // Sort items by start time (nulls last), then by level
    const timeline = [...status.items].toSorted((a, b) => {
      if (a.startedAt === null && b.startedAt === null) {
        return a.level - b.level;
      }
      if (a.startedAt === null) {
        return 1;
      }
      if (b.startedAt === null) {
        return -1;
      }
      return a.startedAt - b.startedAt;
    });

    respond(
      true,
      {
        ok: true,
        phase: status.phase,
        totalDurationMs: status.totalDurationMs,
        items: timeline,
      },
      undefined,
    );
  },
};
