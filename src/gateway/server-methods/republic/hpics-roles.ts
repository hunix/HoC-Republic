/**
 * Gateway Handler — republic.hpics.roles.*
 *
 * Exposes the 16 HPICS-specialized intelligence agent roles to the UI.
 *
 * Methods:
 *   republic.hpics.roles.list   — All 16 roles (with optional discipline filter)
 *   republic.hpics.roles.get    — Single role by ID
 *   republic.hpics.roles.stats  — Summary statistics
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getHpicsRoles,
  getHpicsRole,
  getHpicsRolesByDiscipline,
  getHpicsRoleStats,
} from "../../../republic/hpics-roles.js";
import type { HpicsDiscipline } from "../../../republic/hpics-roles.js";

export const hpicsRoleHandlers: Partial<GatewayRequestHandlers> = {
  /** republic.hpics.roles.list — List all HPICS specialist roles */
  "republic.hpics.roles.list": async ({ params, respond }) => {
    const p = params as { discipline?: string };
    const roles = p.discipline
      ? getHpicsRolesByDiscipline(p.discipline as HpicsDiscipline)
      : getHpicsRoles();
    respond(true, { ok: true, roles, total: roles.length }, undefined);
  },

  /** republic.hpics.roles.get — Get a single HPICS role by ID */
  "republic.hpics.roles.get": async ({ params, respond }) => {
    const p = params as { id?: string };
    if (!p.id || typeof p.id !== "string") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id (string) is required"));
      return;
    }
    const role = getHpicsRole(p.id);
    if (!role) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown HPICS role: ${p.id}`));
      return;
    }
    respond(true, { ok: true, role }, undefined);
  },

  /** republic.hpics.roles.stats — HPICS role statistics */
  "republic.hpics.roles.stats": async ({ respond }) => {
    const stats = getHpicsRoleStats();
    respond(true, { ok: true, ...stats }, undefined);
  },
};
