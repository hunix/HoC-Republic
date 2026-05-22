/**
 * Republic Gateway Handlers — Supabase CLI Management
 *
 * RPC handlers that give the Republic full control over the
 * Supabase CLI: start/stop local dev, run migrations, manage
 * Edge Functions, inspect the database, and link projects.
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  dbDiff,
  dbPush,
  dbReset,
  functionsDeploy,
  functionsList,
  functionsServe,
  getDiagnostics,
  getLogs,
  getEnhancedStatus,
  getDockerSupabaseContainers,
  cleanupOrphanContainers,
  getCloudConnectorStatus,
  inspect,
  linkProject,
  migrationsList,
  migrationsRepair,
  startLocal,
  stopLocal,
} from "../../../republic/supabase-manager.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const supabaseHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Status ─────────────────────────────────────────────────────

  "republic.supabase.status": async ({ respond }) => {
    try {
      const enhanced = await getEnhancedStatus();
      // Normalise CLI services to the shape the UI expects
      const services = Object.entries(enhanced.services ?? {}).map(([name, url]) => ({
        name,
        status: "running",
        port: (() => {
          try {
            return new URL(String(url)).port ? Number(new URL(String(url)).port) : undefined;
          } catch {
            return undefined;
          }
        })(),
      }));
      respond(
        true,
        {
          ok: true,
          status: enhanced.running ? "running" : "stopped",
          services,
          apiUrl: enhanced.services?.["API URL"] ?? enhanced.services?.["API"] ?? undefined,
          projectId: enhanced.services?.["Project ID"] ?? undefined,
          cliAvailable: true,
          warning: enhanced.warning,
          mode: enhanced.mode,
          dockerContainers: enhanced.dockerContainers,
          cloudConnected: enhanced.cloudConnected,
        },
        undefined,
      );
    } catch (err) {
      // CLI not installed / not on PATH — return a non-error stopped state so the UI still renders
      respond(
        true,
        { ok: true, status: "stopped", services: [], cliAvailable: false, error: String(err) },
        undefined,
      );
    }
  },

  // ─── Start / Stop ───────────────────────────────────────────────

  "republic.supabase.start": async ({ respond }) => {
    try {
      const result = await startLocal();
      respond(
        true,
        {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok ? undefined : result.stderr || "Failed to start",
        },
        undefined,
      );
    } catch (err) {
      respond(true, { ok: false, stdout: "", stderr: "", error: String(err) }, undefined);
    }
  },

  "republic.supabase.stop": async ({ respond }) => {
    try {
      const result = await stopLocal();
      respond(
        true,
        {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok ? undefined : result.stderr || "Failed to stop",
        },
        undefined,
      );
    } catch (err) {
      respond(true, { ok: false, stdout: "", stderr: "", error: String(err) }, undefined);
    }
  },

  // ─── Database ───────────────────────────────────────────────────

  "republic.supabase.db.push": async ({ respond }) => {
    try {
      const result = await dbPush();
      respond(
        true,
        {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok ? undefined : result.stderr || "Failed",
        },
        undefined,
      );
    } catch (err) {
      respond(true, { ok: false, stdout: "", stderr: "", error: String(err) }, undefined);
    }
  },

  "republic.supabase.db.reset": async ({ respond }) => {
    try {
      const result = await dbReset();
      respond(
        true,
        {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok ? undefined : result.stderr || "Failed",
        },
        undefined,
      );
    } catch (err) {
      respond(true, { ok: false, stdout: "", stderr: "", error: String(err) }, undefined);
    }
  },

  "republic.supabase.db.diff": async ({ params, respond }) => {
    const p = params as { name?: string } | undefined;
    if (!p?.name) {
      respond(true, { ok: false, error: "name required" }, undefined);
      return;
    }
    try {
      const result = await dbDiff(p.name);
      respond(
        true,
        {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok ? undefined : result.stderr || "Failed",
        },
        undefined,
      );
    } catch (err) {
      respond(true, { ok: false, stdout: "", stderr: "", error: String(err) }, undefined);
    }
  },

  // ─── Migrations ─────────────────────────────────────────────────

  "republic.supabase.migrations.list": async ({ respond }) => {
    try {
      const result = await migrationsList();
      respond(true, { ok: result.ok, migrations: result.migrations ?? [] }, undefined);
    } catch {
      respond(true, { ok: false, migrations: [] }, undefined);
    }
  },

  "republic.supabase.migrations.repair": async ({ params, respond }) => {
    const p = params as { version?: string; status?: string } | undefined;
    if (!p?.version || !p?.status) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "version and status required"),
      );
      return;
    }
    if (p.status !== "applied" && p.status !== "reverted") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "status must be 'applied' or 'reverted'"),
      );
      return;
    }
    try {
      const result = await migrationsRepair(p.version, p.status);
      respond(
        result.ok,
        { ok: result.ok, stdout: result.stdout, stderr: result.stderr },
        result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.stderr),
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Edge Functions ─────────────────────────────────────────────

  "republic.supabase.functions.list": async ({ respond }) => {
    try {
      const result = await functionsList();
      respond(true, { ok: result.ok, functions: result.functions ?? [] }, undefined);
    } catch {
      respond(true, { ok: false, functions: [] }, undefined);
    }
  },

  "republic.supabase.functions.deploy": async ({ params, respond }) => {
    const p = params as { name?: string } | undefined;
    try {
      const result = await functionsDeploy(p?.name);
      respond(
        true,
        {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok ? undefined : result.stderr || "Failed",
        },
        undefined,
      );
    } catch (err) {
      respond(true, { ok: false, stdout: "", stderr: "", error: String(err) }, undefined);
    }
  },

  "republic.supabase.functions.serve": async ({ respond }) => {
    try {
      const result = await functionsServe();
      respond(
        result.ok,
        { ok: result.ok, stdout: result.stdout, stderr: result.stderr },
        result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.stderr),
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Inspect ────────────────────────────────────────────────────

  "republic.supabase.inspect": async ({ respond }) => {
    try {
      const result = await inspect();
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(
        true,
        { ok: false, dbSize: "unknown", tables: [], raw: "", error: String(err) },
        undefined,
      );
    }
  },

  // ─── Logs ───────────────────────────────────────────────────────

  "republic.supabase.logs": async ({ params, respond }) => {
    const p = params as { service?: string } | undefined;
    const validServices = ["api", "db", "auth", "storage", "realtime", "edge-runtime"] as const;
    type ServiceName = (typeof validServices)[number];
    const service: ServiceName = validServices.includes(p?.service as ServiceName)
      ? (p!.service as ServiceName)
      : "api";
    try {
      const result = await getLogs(service);
      respond(
        true,
        { ok: result.ok, service, stdout: result.stdout, stderr: result.stderr },
        undefined,
      );
    } catch (err) {
      respond(true, { ok: false, service, stdout: "", stderr: "", error: String(err) }, undefined);
    }
  },

  // ─── Link ───────────────────────────────────────────────────────

  "republic.supabase.link": async ({ params, respond }) => {
    const p = params as { projectRef?: string } | undefined;
    if (!p?.projectRef) {
      respond(true, { ok: false, error: "projectRef required" }, undefined);
      return;
    }
    try {
      const result = await linkProject(p.projectRef);
      respond(
        true,
        {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok ? undefined : result.stderr || "Failed",
        },
        undefined,
      );
    } catch (err) {
      respond(true, { ok: false, stdout: "", stderr: "", error: String(err) }, undefined);
    }
  },

  // ─── Diagnostics ────────────────────────────────────────────────

  "republic.supabase.diagnostics": async ({ respond }) => {
    try {
      const diag = await getDiagnostics();
      respond(true, { ok: true, ...diag }, undefined);
    // eslint-disable-next-line no-unused-vars
    } catch (_err) {
      respond(
        true,
        {
          ok: false,
          cliAvailable: false,
          cliVersion: null,
          projectLinked: false,
          localRunning: false,
          migrationCount: 0,
          functionsCount: 0,
        },
        undefined,
      );
    }
  },

  // ─── Docker Container Discovery ───────────────────────────────

  "republic.supabase.containers": async ({ respond }) => {
    try {
      const containers = await getDockerSupabaseContainers();
      respond(true, { ok: true, containers }, undefined);
    } catch (err) {
      respond(true, { ok: false, containers: [], error: String(err) }, undefined);
    }
  },

  "republic.supabase.cleanup": async ({ respond }) => {
    try {
      const result = await cleanupOrphanContainers();
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(true, { ok: false, removed: [], kept: [], errors: [String(err)] }, undefined);
    }
  },

  // ─── Cloud Connector Status ───────────────────────────────────

  "republic.supabase.cloud-status": async ({ respond }) => {
    try {
      const status = await getCloudConnectorStatus();
      respond(true, { ok: true, ...status }, undefined);
    } catch (err) {
      respond(
        true,
        { ok: false, connected: false, configured: false, error: String(err) },
        undefined,
      );
    }
  },

  // ─── UI Aliases ────────────────────────────────────────────────
  "supabase.status": async (ctx) => {
    if (supabaseHandlers["republic.supabase.status"]) {
      return supabaseHandlers["republic.supabase.status"](ctx);
    }
  },
  "supabase.connect": async (ctx) => {
    const p = ctx.params as { projectRef?: string } | undefined;
    if (!p?.projectRef) {
      if (supabaseHandlers["republic.supabase.cloud-status"]) {
        return supabaseHandlers["republic.supabase.cloud-status"](ctx);
      }
    }
    if (supabaseHandlers["republic.supabase.link"]) {
      return supabaseHandlers["republic.supabase.link"](ctx);
    }
  },
  "supabase.disconnect": async ({ respond }) => {
    respond(true, { ok: true, message: "Disconnected" }, undefined);
  },
  "supabase.test": async (ctx) => {
    if (supabaseHandlers["republic.supabase.diagnostics"]) {
      return supabaseHandlers["republic.supabase.diagnostics"](ctx);
    }
  },
};
