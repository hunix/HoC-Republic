import type {
  ConfigUpdateBaseHashParams,
  ConfigSetEnvParams,
  ConfigRestartParams,
} from "./rpc-params.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { listChannelPlugins } from "../../channels/plugins/index.js";
import {
  CONFIG_PATH,
  loadConfig,
  parseConfigJson5,
  readConfigFileSnapshot,
  resolveConfigSnapshotHash,
  validateConfigObjectWithPlugins,
  writeConfigFile,
} from "../../config/config.js";
import { applyLegacyMigrations } from "../../config/legacy.js";
import { applyMergePatch } from "../../config/merge-patch.js";
import {
  redactConfigObject,
  redactConfigSnapshot,
  restoreRedactedValues,
} from "../../config/redact-snapshot.js";
import { buildConfigSchema } from "../../config/schema.js";
import {
  formatDoctorNonInteractiveHint,
  writeRestartSentinel,
  type RestartSentinelPayload,
} from "../../infra/restart-sentinel.js";
import { scheduleGatewaySigusr1Restart } from "../../infra/restart.js";
import { loadOpenClawPlugins } from "../../plugins/loader.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateConfigApplyParams,
  validateConfigEnvGetParams,
  validateConfigEnvSetParams,
  validateConfigGetParams,
  validateConfigPatchParams,
  validateConfigSchemaParams,
  validateConfigSetParams,
} from "../protocol/index.js";

function resolveBaseHash(params: ConfigUpdateBaseHashParams): string | null {
  const raw = params?.baseHash;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function requireConfigBaseHash(
  params: unknown,
  snapshot: Awaited<ReturnType<typeof readConfigFileSnapshot>>,
  respond: RespondFn,
): boolean {
  if (!snapshot.exists) {
    return true;
  }
  const snapshotHash = resolveConfigSnapshotHash(snapshot);
  if (!snapshotHash) {
    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        "config base hash unavailable; re-run config.get and retry",
      ),
    );
    return false;
  }
  const baseHash = resolveBaseHash(params as ConfigUpdateBaseHashParams);
  if (!baseHash) {
    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        "config base hash required; re-run config.get and retry",
      ),
    );
    return false;
  }
  if (baseHash !== snapshotHash) {
    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        "config changed since last load; re-run config.get and retry",
      ),
    );
    return false;
  }
  return true;
}

// Cache for config.env.get — avoids redundant .env reads when multiple
// pages call config.env.get simultaneously. Invalidated after 5s.
let _envCache: Record<string, string> | null = null;
let _envCacheTime = 0;

export const configHandlers: GatewayRequestHandlers = {
  "config.get": async ({ params, respond }) => {
    if (!validateConfigGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid config.get params: ${formatValidationErrors(validateConfigGetParams.errors)}`,
        ),
      );
      return;
    }
    const snapshot = await readConfigFileSnapshot();
    respond(true, redactConfigSnapshot(snapshot), undefined);
  },
  "config.schema": ({ params, respond }) => {
    if (!validateConfigSchemaParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid config.schema params: ${formatValidationErrors(validateConfigSchemaParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
    const pluginRegistry = loadOpenClawPlugins({
      config: cfg,
      workspaceDir,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    const schema = buildConfigSchema({
      plugins: pluginRegistry.plugins.map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        configUiHints: plugin.configUiHints,
        configSchema: plugin.configJsonSchema,
      })),
      channels: listChannelPlugins().map((entry) => ({
        id: entry.id,
        label: entry.meta.label,
        description: entry.meta.blurb,
        configSchema: entry.configSchema?.schema,
        configUiHints: entry.configSchema?.uiHints,
      })),
    });
    respond(true, schema, undefined);
  },
  "config.env.get": async ({ params, respond }) => {
    if (!validateConfigEnvGetParams(params)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `invalid params`));
      return;
    }
    try {
      // Use cached result if fresh (within 5s) — prevents redundant reads
      // when multiple pages call config.env.get simultaneously
      const now = Date.now();
      if (_envCache && now - _envCacheTime < 5_000) {
        respond(true, { env: _envCache }, undefined);
        return;
      }
      const fsp = await import("node:fs/promises");
      const pathMod = await import("node:path");
      const { resolveConfigDir } = await import("../../utils.js");
      const globalEnvPath = pathMod.join(resolveConfigDir(process.env), ".env");
      let content = "";
      try {
        content = await fsp.readFile(globalEnvPath, "utf-8");
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err.code !== "ENOENT") {throw err;}
      }
      const env: Record<string, string> = {};
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {continue;}
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          // Remove simple outer quotes
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          env[key] = val;
        }
      }
      _envCache = env;
      _envCacheTime = now;
      respond(true, { env }, undefined);
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err.message));
    }
  },
  "config.env.set": async ({ params, respond }) => {
    if (!validateConfigEnvSetParams(params)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `invalid params`));
      return;
    }
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const { resolveConfigDir } = await import("../../utils.js");
      const configDir = resolveConfigDir(process.env);
      const globalEnvPath = path.join(configDir, ".env");

      // Ensure directory exists before writing
      await fs.mkdir(configDir, { recursive: true });

      let content = "";
      try {
        content = await fs.readFile(globalEnvPath, "utf-8");
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err.code !== "ENOENT") {throw err;}
      }

      const newEnv = (params as ConfigSetEnvParams).env;
      // Capture all entries BEFORE the loop mutates newEnv via delete
      const allEntries = Object.entries(newEnv);
      let lines = content.split("\n");

      // Update existing keys
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith("#")) {continue;}
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          if (key in newEnv) {
            let val = newEnv[key];
            if (val.includes(" ") || val.includes('"') || val.includes("'")) {
              val = `"${val.replace(/"/g, '\\"')}"`;
            }
            lines[i] = `${key}=${val}`;
            delete newEnv[key];
          }
        }
      }

      // Append new keys
      for (const [key, rawVal] of Object.entries(newEnv)) {
        let val = rawVal;
        if (val.includes(" ") || val.includes('"') || val.includes("'")) {
          val = `"${val.replace(/"/g, '\\"')}"`;
        }
        lines.push(`${key}=${val}`);
      }

      const finalContent =
        lines.join("\n").replace(/\n{3,}/g, "\n\n") +
        (lines.length > 0 && lines[lines.length - 1] !== "" ? "\n" : "");
      await fs.writeFile(globalEnvPath, finalContent, "utf-8");

      // Invalidate env cache so the next config.env.get reads fresh data
      _envCache = null;
      _envCacheTime = 0;

      // Update live process.env with ALL saved entries (not the mutated newEnv)
      for (const [key, val] of allEntries) {
        process.env[key] = val;
      }

      respond(true, { ok: true }, undefined);
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err.message));
    }
  },
  "config.set": async ({ params, respond }) => {
    if (!validateConfigSetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid config.set params: ${formatValidationErrors(validateConfigSetParams.errors)}`,
        ),
      );
      return;
    }
    const snapshot = await readConfigFileSnapshot();
    if (!requireConfigBaseHash(params, snapshot, respond)) {
      return;
    }
    const rawValue = (params as { raw?: unknown }).raw;
    if (typeof rawValue !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid config.set params: raw (string) required"),
      );
      return;
    }
    const parsedRes = parseConfigJson5(rawValue);
    if (!parsedRes.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, parsedRes.error));
      return;
    }
    const validated = validateConfigObjectWithPlugins(parsedRes.parsed);
    if (!validated.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid config", {
          details: { issues: validated.issues },
        }),
      );
      return;
    }
    let restored: typeof validated.config;
    try {
      restored = restoreRedactedValues(
        validated.config,
        snapshot.config,
      ) as typeof validated.config;
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, String(err instanceof Error ? err.message : err)),
      );
      return;
    }
    await writeConfigFile(restored);
    respond(
      true,
      {
        ok: true,
        path: CONFIG_PATH,
        config: redactConfigObject(restored),
      },
      undefined,
    );
  },
  "config.patch": async ({ params, respond }) => {
    if (!validateConfigPatchParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid config.patch params: ${formatValidationErrors(validateConfigPatchParams.errors)}`,
        ),
      );
      return;
    }
    const snapshot = await readConfigFileSnapshot();
    if (!requireConfigBaseHash(params, snapshot, respond)) {
      return;
    }
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid config; fix before patching"),
      );
      return;
    }
    const rawValue = (params as { raw?: unknown }).raw;
    if (typeof rawValue !== "string") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid config.patch params: raw (string) required",
        ),
      );
      return;
    }
    const parsedRes = parseConfigJson5(rawValue);
    if (!parsedRes.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, parsedRes.error));
      return;
    }
    if (
      !parsedRes.parsed ||
      typeof parsedRes.parsed !== "object" ||
      Array.isArray(parsedRes.parsed)
    ) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "config.patch raw must be an object"),
      );
      return;
    }
    const merged = applyMergePatch(snapshot.config, parsedRes.parsed);
    let restoredMerge: unknown;
    try {
      restoredMerge = restoreRedactedValues(merged, snapshot.config);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, String(err instanceof Error ? err.message : err)),
      );
      return;
    }
    const migrated = applyLegacyMigrations(restoredMerge);
    const resolved = migrated.next ?? restoredMerge;
    const validated = validateConfigObjectWithPlugins(resolved);
    if (!validated.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid config", {
          details: { issues: validated.issues },
        }),
      );
      return;
    }
    await writeConfigFile(validated.config);

    const sessionKey =
      typeof (params as { sessionKey?: unknown }).sessionKey === "string"
        ? (params as { sessionKey?: string }).sessionKey?.trim() || undefined
        : undefined;
    const note =
      typeof (params as { note?: unknown }).note === "string"
        ? (params as { note?: string }).note?.trim() || undefined
        : undefined;
    const restartDelayMsRaw = (params as { restartDelayMs?: unknown }).restartDelayMs;
    const restartDelayMs =
      typeof restartDelayMsRaw === "number" && Number.isFinite(restartDelayMsRaw)
        ? Math.max(0, Math.floor(restartDelayMsRaw))
        : undefined;

    const payload: RestartSentinelPayload = {
      kind: "config-apply",
      status: "ok",
      ts: Date.now(),
      sessionKey,
      message: note ?? null,
      doctorHint: formatDoctorNonInteractiveHint(),
      stats: {
        mode: "config.patch",
        root: CONFIG_PATH,
      },
    };
    let sentinelPath: string | null = null;
    try {
      sentinelPath = await writeRestartSentinel(payload);
    } catch {
      sentinelPath = null;
    }
    const restart = scheduleGatewaySigusr1Restart({
      delayMs: restartDelayMs,
      reason: "config.patch",
    });
    respond(
      true,
      {
        ok: true,
        path: CONFIG_PATH,
        config: redactConfigObject(validated.config),
        restart,
        sentinel: {
          path: sentinelPath,
          payload,
        },
      },
      undefined,
    );
  },
  "config.apply": async ({ params, respond }) => {
    if (!validateConfigApplyParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid config.apply params: ${formatValidationErrors(validateConfigApplyParams.errors)}`,
        ),
      );
      return;
    }
    const snapshot = await readConfigFileSnapshot();
    if (!requireConfigBaseHash(params, snapshot, respond)) {
      return;
    }
    const rawValue = (params as { raw?: unknown }).raw;
    if (typeof rawValue !== "string") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid config.apply params: raw (string) required",
        ),
      );
      return;
    }
    const parsedRes = parseConfigJson5(rawValue);
    if (!parsedRes.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, parsedRes.error));
      return;
    }
    const validated = validateConfigObjectWithPlugins(parsedRes.parsed);
    if (!validated.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid config", {
          details: { issues: validated.issues },
        }),
      );
      return;
    }
    let restoredApply: typeof validated.config;
    try {
      restoredApply = restoreRedactedValues(
        validated.config,
        snapshot.config,
      ) as typeof validated.config;
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, String(err instanceof Error ? err.message : err)),
      );
      return;
    }
    await writeConfigFile(restoredApply);

    const restartParams = params as ConfigRestartParams;
    const sessionKey =
      typeof restartParams.sessionKey === "string"
        ? restartParams.sessionKey.trim() || undefined
        : undefined;
    const note =
      typeof restartParams.note === "string" ? restartParams.note.trim() || undefined : undefined;
    const restartDelayMsRaw = restartParams.restartDelayMs;
    const restartDelayMs =
      typeof restartDelayMsRaw === "number" && Number.isFinite(restartDelayMsRaw)
        ? Math.max(0, Math.floor(restartDelayMsRaw))
        : undefined;

    const payload: RestartSentinelPayload = {
      kind: "config-apply",
      status: "ok",
      ts: Date.now(),
      sessionKey,
      message: note ?? null,
      doctorHint: formatDoctorNonInteractiveHint(),
      stats: {
        mode: "config.apply",
        root: CONFIG_PATH,
      },
    };
    let sentinelPath: string | null = null;
    try {
      sentinelPath = await writeRestartSentinel(payload);
    } catch {
      sentinelPath = null;
    }
    const restart = scheduleGatewaySigusr1Restart({
      delayMs: restartDelayMs,
      reason: "config.apply",
    });
    respond(
      true,
      {
        ok: true,
        path: CONFIG_PATH,
        config: redactConfigObject(restoredApply),
        restart,
        sentinel: {
          path: sentinelPath,
          payload,
        },
      },
      undefined,
    );
  },
};
