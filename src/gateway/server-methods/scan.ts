/**
 * scan.ts — Gateway RPC Handlers for Target Security Audit
 *
 *   scan.run     - Start a new security scan against a URL or IP
 *   scan.status  - Poll scan status (queued/running/done/error)
 *   scan.results - Get full scan results
 *   scan.list    - List recent scans
 *   scan.delete  - Delete a scan record
 */

import { ErrorCodes, errorShape } from "../protocol/index.js";
import {
  deleteScan,
  getScan,
  listScans,
  startScan,
} from "../../republic/target-scanner.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

const scanDescriptors = defineHandlers({
  "scan.run": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { target } = params as { target?: string };
      if (!target?.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target (URL or IP) is required"));
        return;
      }
      try {
        const scan = startScan(target.trim());
        respond(true, { ok: true, id: scan.id, status: scan.status, target: scan.target, host: scan.host }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  "scan.status": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const scan = getScan(id);
      if (!scan) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scan not found"));
        return;
      }
      respond(true, {
        ok: true,
        id: scan.id,
        status: scan.status,
        target: scan.target,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        durationMs: scan.durationMs,
        error: scan.error,
        // Lightweight summary only
        summary: scan.summary,
      }, undefined);
    },
  },

  "scan.results": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const scan = getScan(id);
      if (!scan) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scan not found"));
        return;
      }
      respond(true, { ok: true, scan }, undefined);
    },
  },

  "scan.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { limit = 20 } = params as { limit?: number };
      try {
        const scans = listScans(Math.min(Number(limit), 100));
        respond(true, {
          ok: true,
          scans: scans.map(s => ({
            id: s.id,
            target: s.target,
            host: s.host,
            status: s.status,
            startedAt: s.startedAt,
            completedAt: s.completedAt,
            durationMs: s.durationMs,
            riskLevel: s.summary?.riskLevel,
            riskScore: s.summary?.riskScore,
            openPorts: s.summary?.openPorts,
          })),
        }, undefined);
      } catch {
        respond(true, { ok: true, scans: [] }, undefined);
      }
    },
  },

  "scan.delete": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const deleted = deleteScan(id);
      respond(true, { ok: true, deleted }, undefined);
    },
  },
});

registryRegister(scanDescriptors);
export const scanHandlers = toHandlerMap(scanDescriptors);
