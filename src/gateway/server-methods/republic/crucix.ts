/**
 * republic.crucix.* — Crucix OSINT Dashboard RPC handlers
 *
 * Manages the Crucix intelligence dashboard (tools/crucix/) as a background
 * service. Crucix pulls from 27 open-source intelligence feeds every 15 min:
 * satellite fire, flight tracking, radiation, conflict, sanctions, maritime,
 * economic indicators, social sentiment, space/satellite tracking.
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  startCrucix,
  stopCrucix,
  getCrucixStatus,
  fetchCrucixData,
  isCrucixInstalled,
} from "../../../republic/world-intel-crucix.js";

export const crucixHandlers: GatewayRequestHandlers = {
  /**
   * Get Crucix status: installed, running, port, last sweep time.
   */
  "republic.crucix.status": async ({ respond }) => {
    const installed = await isCrucixInstalled();
    const status = getCrucixStatus();
    respond(true, { ok: true, ...status, installed }, undefined);
  },

  /**
   * Start the Crucix OSINT dashboard as a background service.
   */
  "republic.crucix.start": async ({ respond }) => {
    const result = await startCrucix();
    respond(result.ok, result, result.ok ? undefined : { code: "CRUCIX_ERROR", message: result.message });
  },

  /**
   * Stop the Crucix OSINT dashboard.
   */
  "republic.crucix.stop": async ({ respond }) => {
    const result = await stopCrucix();
    respond(result.ok, result, result.ok ? undefined : { code: "CRUCIX_ERROR", message: result.message });
  },

  /**
   * Fetch the latest sweep data from Crucix (fires, flights, radiation,
   * conflicts, sanctions, maritime, economic, social, satellites, alerts).
   */
  "republic.crucix.data": async ({ respond }) => {
    const data = await fetchCrucixData();
    respond(true, {
      ok: true,
      data: data ?? {},
      available: data !== null,
      message: data ? "Latest sweep data" : "No data available — Crucix may not be running",
    }, undefined);
  },
};
