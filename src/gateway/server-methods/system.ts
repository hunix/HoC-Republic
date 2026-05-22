import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveMainSessionKeyFromConfig } from "../../config/sessions.js";
import { readBuildHash } from "../../infra/control-ui-assets.js";
import { resolveControlUiRepoRoot } from "../../infra/control-ui-assets.js";
import { getLastHeartbeatEvent } from "../../infra/heartbeat-events.js";
import { setHeartbeatsEnabled } from "../../infra/heartbeat-runner.js";
import { enqueueSystemEvent, isSystemEventContextChanged } from "../../infra/system-events.js";
import { listSystemPresence, updateSystemPresence } from "../../infra/system-presence.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { VERSION } from "../../version.js";
import { resourceMonitor } from "../resource-monitor.js";
import { taskPool } from "../task-pool.js";
import { resilience } from "../resilience.js";
import { processExecutor } from "../process-executor.js";
import { gatewayBreaker } from "../fault-isolation.js";
import { getRecentTraces, getCitizenTraces, getCitizenDecisions } from "../../republic/observability.js";

const _gatewayStartedAt = new Date().toISOString();

export const systemHandlers: GatewayRequestHandlers = {
  // ── Version & build info (used by UI for cache-busting) ──────────────────
  "system.version": ({ respond }) => {
    const repoRoot = resolveControlUiRepoRoot(process.argv[1]);
    const buildInfo = repoRoot ? readBuildHash(repoRoot) : null;
    respond(
      true,
      {
        version: VERSION,
        buildHash: buildInfo?.hash ?? null,
        builtAt: buildInfo?.builtAt ?? null,
        gatewayStartedAt: _gatewayStartedAt,
      },
      undefined,
    );
  },

  // ── Live hardware snapshot — uses resource monitor (non-blocking) ─────────
  "system.hardware": async ({ respond }) => {
    try {
      // Start resource monitor if not already running
      resourceMonitor.start();

      const snapshot = resourceMonitor.getSnapshot();
      const cpuCores = os.cpus();
      const firstCpu = cpuCores[0];
      const totalMemBytes = os.totalmem();
      const freeMemBytes = os.freemem();
      const usedMemBytes = totalMemBytes - freeMemBytes;
      const totalGb = +(totalMemBytes / 1024 ** 3).toFixed(1);
      const freeGb = +(freeMemBytes / 1024 ** 3).toFixed(1);
      const usedGb = +(usedMemBytes / 1024 ** 3).toFixed(1);
      const percentUsed = +((usedMemBytes / totalMemBytes) * 100).toFixed(1);

      // Use resource monitor's CPU measurement (non-blocking!) instead of 200ms busy-wait
      const loadPercent = snapshot?.cpu.usagePercent ?? 0;

      // Use PowerShell Get-CimInstance for disks on Windows (wmic is deprecated)
      let drives: { driveLetter: string; totalGb: number; freeGb: number; usedGb: number }[] = [];
      try {
        if (process.platform === "win32") {
          const psCmd = `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select DeviceID,Size,FreeSpace | ConvertTo-Csv -NoTypeInformation`;
          const raw = execSync(
            `powershell -NoProfile -Command "${psCmd}"`,
            { timeout: 5000, encoding: "utf8" },
          );
          const lines = raw.split(/\r?\n/).filter(Boolean);
          // First line is CSV header: "DeviceID","Size","FreeSpace"
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].replace(/"/g, "").split(",");
            const deviceId = (parts[0] ?? "C:").trim();
            const total = Number(parts[1]) / 1024 ** 3;
            const free = Number(parts[2]) / 1024 ** 3;
            if (total > 0) {
              drives.push({
                driveLetter: deviceId,
                totalGb: +total.toFixed(1),
                freeGb: +free.toFixed(1),
                usedGb: +(total - free).toFixed(1),
              });
            }
          }
        }
      } catch {
        // Disk info not available — skip gracefully
      }

      respond(
        true,
        {
          cpu: {
            brand: firstCpu?.model ?? "Unknown CPU",
            cores: cpuCores.length,
            speed: firstCpu ? firstCpu.speed / 1000 : 0,
            loadPercent,
          },
          ram: { totalGb, freeGb, usedGb, percentUsed },
          gpu: snapshot?.gpu ?? [],
          drives,
          platform: os.platform(),
          hostname: os.hostname(),
          uptime: os.uptime(),
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ── Parallel Execution Engine Status ──────────────────────────────────────
  "system.engine.status": ({ respond }) => {
    const pool = taskPool.getMetrics();
    const resources = resourceMonitor.getSnapshot();
    const resilienceMetrics = resilience.getMetrics();
    const processes = processExecutor.getMetrics();
    const breakers = gatewayBreaker.getStatus();

    respond(true, {
      taskPool: pool,
      resources,
      resilience: resilienceMetrics,
      processes,
      circuitBreakers: breakers,
      uptime: process.uptime(),
    }, undefined);
  },

  "system.engine.resources": ({ respond }) => {
    resourceMonitor.start();
    const snapshot = resourceMonitor.getSnapshot();
    respond(true, {
      snapshot,
      canSchedule: {
        cpu: resourceMonitor.canSchedule("cpu"),
        gpu: resourceMonitor.canSchedule("gpu"),
        io: resourceMonitor.canSchedule("io"),
        network: resourceMonitor.canSchedule("network"),
        mixed: resourceMonitor.canSchedule("mixed"),
      },
    }, undefined);
  },

  "system.engine.processes": ({ respond }) => {
    respond(true, { processes: processExecutor.list() }, undefined);
  },

  "system.engine.errors": ({ respond }) => {
    respond(true, {
      patterns: resilience.getErrorPatterns(),
      metrics: resilience.getMetrics(),
      degradedFeatures: resilience.getMetrics().degradedFeatures,
    }, undefined);
  },

  "system.engine.evaluate": ({ params, respond }) => {
    const p = params as { feature?: string; cpuWeight?: number; ramGB?: number; vramGB?: number; priority?: number };
    if (!p?.feature) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "feature name required"));
      return;
    }
    resourceMonitor.start();
    const evaluation = resourceMonitor.evaluateFeature(p.feature, {
      cpuWeight: p.cpuWeight,
      ramGB: p.ramGB,
      vramGB: p.vramGB,
      priority: p.priority,
    });
    respond(true, evaluation, undefined);
  },

  // ── HuggingFace cache model detection ────────────────────────────────────
  "system.hf.models": ({ respond }) => {
    try {
      const hfHome = process.env.HF_HOME ?? path.join(os.homedir(), ".cache", "huggingface");
      const hubDir = path.join(hfHome, "hub");
      let models: string[] = [];
      if (fs.existsSync(hubDir)) {
        models = fs
          .readdirSync(hubDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && d.name.startsWith("models--"))
          .map((d) => d.name.replace(/^models--/, "").replace(/--/g, "/"));
      }
      respond(true, { models, hubDir }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ── Real process list via OS APIs ─────────────────────────────────────────
  "system.processes": ({ respond }) => {
    try {
      let processes: { name: string; cpu: number; ram: string; pid: number }[] = [];
      if (process.platform === "win32") {
          const psCmd = `Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Name,Id,@{N="WS";E={$_.WorkingSet64}},@{N="CPU";E={[math]::Round($_.CPU,1)}} | ConvertTo-Csv -NoTypeInformation`;
          const raw = execSync(
            `powershell -NoProfile -Command "${psCmd}"`,
            { timeout: 5000, encoding: "utf8" },
          );
        const lines = raw.split(/\r?\n/).filter(Boolean);
        // First line is CSV header: "Name","Id","WS","CPU"
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].replace(/"/g, "").split(",");
          const name = (parts[0] ?? "").trim();
          const pid = parseInt(parts[1] ?? "0") || 0;
          const ws = parseInt(parts[2] ?? "0") || 0;
          const cpu = parseFloat(parts[3] ?? "0") || 0;
          if (!name || pid <= 0) { continue; }
          const ramMB = ws / 1024 / 1024;
          const ramStr =
            ramMB >= 1024 ? `${(ramMB / 1024).toFixed(1)}GB` : `${ramMB.toFixed(0)}MB`;
          processes.push({ name, cpu, ram: ramStr, pid });
        }
      }
      respond(true, { processes }, undefined);
    } catch {
      // Fallback: return empty list rather than error
      respond(true, { processes: [] }, undefined);
    }
  },

  "last-heartbeat": ({ respond }) => {
    respond(true, getLastHeartbeatEvent(), undefined);
  },
  "set-heartbeats": ({ params, respond }) => {
    const enabled = params.enabled;
    if (typeof enabled !== "boolean") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid set-heartbeats params: enabled (boolean) required",
        ),
      );
      return;
    }
    setHeartbeatsEnabled(enabled);
    respond(true, { ok: true, enabled }, undefined);
  },
  "system-presence": ({ respond }) => {
    const presence = listSystemPresence();
    respond(true, presence, undefined);
  },
  "system-event": ({ params, respond, context }) => {
    const text = typeof params.text === "string" ? params.text.trim() : "";
    if (!text) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "text required"));
      return;
    }
    const sessionKey = resolveMainSessionKeyFromConfig();
    const deviceId = typeof params.deviceId === "string" ? params.deviceId : undefined;
    const instanceId = typeof params.instanceId === "string" ? params.instanceId : undefined;
    const host = typeof params.host === "string" ? params.host : undefined;
    const ip = typeof params.ip === "string" ? params.ip : undefined;
    const mode = typeof params.mode === "string" ? params.mode : undefined;
    const version = typeof params.version === "string" ? params.version : undefined;
    const platform = typeof params.platform === "string" ? params.platform : undefined;
    const deviceFamily = typeof params.deviceFamily === "string" ? params.deviceFamily : undefined;
    const modelIdentifier =
      typeof params.modelIdentifier === "string" ? params.modelIdentifier : undefined;
    const lastInputSeconds =
      typeof params.lastInputSeconds === "number" && Number.isFinite(params.lastInputSeconds)
        ? params.lastInputSeconds
        : undefined;
    const reason = typeof params.reason === "string" ? params.reason : undefined;
    const roles =
      Array.isArray(params.roles) && params.roles.every((t) => typeof t === "string")
        ? params.roles
        : undefined;
    const scopes =
      Array.isArray(params.scopes) && params.scopes.every((t) => typeof t === "string")
        ? params.scopes
        : undefined;
    const tags =
      Array.isArray(params.tags) && params.tags.every((t) => typeof t === "string")
        ? params.tags
        : undefined;
    const presenceUpdate = updateSystemPresence({
      text,
      deviceId,
      instanceId,
      host,
      ip,
      mode,
      version,
      platform,
      deviceFamily,
      modelIdentifier,
      lastInputSeconds,
      reason,
      roles,
      scopes,
      tags,
    });
    const isNodePresenceLine = text.startsWith("Node:");
    if (isNodePresenceLine) {
      const next = presenceUpdate.next;
      const changed = new Set(presenceUpdate.changedKeys);
      const reasonValue = next.reason ?? reason;
      const normalizedReason = (reasonValue ?? "").toLowerCase();
      const ignoreReason =
        normalizedReason.startsWith("periodic") || normalizedReason === "heartbeat";
      const hostChanged = changed.has("host");
      const ipChanged = changed.has("ip");
      const versionChanged = changed.has("version");
      const modeChanged = changed.has("mode");
      const reasonChanged = changed.has("reason") && !ignoreReason;
      const hasChanges = hostChanged || ipChanged || versionChanged || modeChanged || reasonChanged;
      if (hasChanges) {
        const contextChanged = isSystemEventContextChanged(sessionKey, presenceUpdate.key);
        const parts: string[] = [];
        if (contextChanged || hostChanged || ipChanged) {
          const hostLabel = next.host?.trim() || "Unknown";
          const ipLabel = next.ip?.trim();
          parts.push(`Node: ${hostLabel}${ipLabel ? ` (${ipLabel})` : ""}`);
        }
        if (versionChanged) {
          parts.push(`app ${next.version?.trim() || "unknown"}`);
        }
        if (modeChanged) {
          parts.push(`mode ${next.mode?.trim() || "unknown"}`);
        }
        if (reasonChanged) {
          parts.push(`reason ${reasonValue?.trim() || "event"}`);
        }
        const deltaText = parts.join(" · ");
        if (deltaText) {
          enqueueSystemEvent(deltaText, {
            sessionKey,
            contextKey: presenceUpdate.key,
          });
        }
      }
    } else {
      enqueueSystemEvent(text, { sessionKey });
    }
    const nextPresenceVersion = context.incrementPresenceVersion();
    context.broadcast(
      "presence",
      { presence: listSystemPresence() },
      {
        dropIfSlow: true,
        stateVersion: {
          presence: nextPresenceVersion,
          health: context.getHealthVersion(),
        },
      },
    );
    respond(true, { ok: true }, undefined);
  },

  "system.traces.list": ({ params, respond }) => {
    const p = params as { citizenId?: string; limit?: number };
    const limit = Math.min(Math.max(p?.limit ?? 100, 1), 500);
    const traces = p?.citizenId ? getCitizenTraces(p.citizenId, limit) : getRecentTraces(limit);
    respond(true, { traces }, undefined);
  },

  "system.decisions.list": ({ params, respond }) => {
    const p = params as { citizenId: string; limit?: number };
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const limit = Math.min(Math.max(p?.limit ?? 20, 1), 100);
    const decisions = getCitizenDecisions(p.citizenId, limit);
    respond(true, { decisions }, undefined);
  },
};
