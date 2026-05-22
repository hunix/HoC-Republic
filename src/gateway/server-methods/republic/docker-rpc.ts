/**
 * Republic Gateway Handlers — Docker
 *
 * Wires all `republic.docker.*` RPC methods to the Docker Orchestration Engine
 * (docker-orchestrator.ts). The UI calls these endpoints to inspect and manage
 * local Docker infrastructure.
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  ensureDocker,
  initResourceBudget,
  listContainersAsync,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerLogs,
  listImages,
  pullImage,
  removeImage,
  listNetworks,
  CONTAINER_PRESETS,
  launchPreset,
  reconcileManagedContainers,
  scheduleDockerReaper,
  inspectContainerFullAsync,
  getContainerStatsAsync,
  updateContainerResources,
  pullImageStreaming,
  getPullProgress,
  getActivePulls,
  createContainer,
} from "../../../republic/docker-orchestrator.js";
import {
  openDockerTerminal,
  openPullTerminal,
  openLogsTerminal,
  openShellTerminal,
} from "../../../republic/docker-terminal.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─── Lazy Boot Init ────────────────────────────────────────────
//
// The first time any republic.docker.* RPC is dispatched, we:
//   1. Initialise the resource budget from system resources.
//   2. Reconcile managedContainers from Docker labels (fixes post-restart drift).
//   3. Schedule the hourly TTL reaper.
//
// This fires lazily from the module so we don't block gateway startup, but it
// fires early enough that the first containers.list response is accurate.

let _booted = false;

async function lazyDockerBoot() {
  if (_booted) {
    return;
  }
  _booted = true;
  const docker = ensureDocker();
  if (!docker.available) {
    return;
  }
  try {
    await initResourceBudget();
    await reconcileManagedContainers();
    scheduleDockerReaper(); // unref'd timer — won't block exit
  } catch {
    // Non-fatal — Docker may be transiently unavailable
    _booted = false; // Allow retry on next request
  }
}

export const dockerRpcHandlers: Partial<GatewayRequestHandlers> = {
  // ── Availability ────────────────────────────────────────────────

  "republic.docker.available": ({ respond }) => {
    const result = ensureDocker();
    respond(true, { ok: true, available: result.available, error: result.error }, undefined);
  },

  "republic.docker.status": ({ respond }) => {
    const result = ensureDocker();
    respond(true, { ok: true, available: result.available, error: result.error }, undefined);
  },

  // ── Containers ──────────────────────────────────────────────────

  "republic.docker.containers.list": async ({ params, respond }) => {
    await lazyDockerBoot();
    const p = params as { all?: boolean; onlyManaged?: boolean } | undefined;
    const onlyManaged = p?.onlyManaged ?? false;
    const containers = await listContainersAsync(onlyManaged);
    // Normalise to the shape Docker.tsx expects
    const mapped = containers.map((c) => ({
      id: c.id,
      name: c.name,
      image: c.image,
      status: (c.status === "created" ? "stopped" : c.status) as
        | "running"
        | "stopped"
        | "exited"
        | "creating"
        | "paused",
      state: c.status,
      ports: c.ports.join(", "),
      uptime: c.startedAt ? `since ${new Date(c.startedAt).toLocaleTimeString()}` : undefined,
      created: c.createdAt ? Math.floor(new Date(c.createdAt).getTime() / 1000) : undefined,
      labels: c.labels,
    }));
    respond(true, { ok: true, containers: mapped }, undefined);
  },

  "republic.docker.containers.start": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const ok = await startContainer(p.id);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to start container"),
    );
  },

  "republic.docker.containers.stop": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const ok = await stopContainer(p.id);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to stop container"),
    );
  },

  "republic.docker.containers.restart": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const ok = await restartContainer(p.id);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to restart container"),
    );
  },

  "republic.docker.containers.remove": async ({ params, respond }) => {
    const p = params as { id?: string; force?: boolean } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const ok = await removeContainer(p.id, p.force ?? false);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to remove container"),
    );
  },

  "republic.docker.containers.logs": ({ params, respond }) => {
    const p = params as { id?: string; lines?: number } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const logs = getContainerLogs(p.id, p.lines ?? 200);
    respond(true, { ok: true, logs }, undefined);
  },

  // ── Images ──────────────────────────────────────────────────────

  "republic.docker.images.list": ({ respond }) => {
    const images = listImages();
    const mapped = images.map((img) => ({
      id: img.id,
      tags: [`${img.repository}:${img.tag}`.replace(":<none>", "").replace("<none>:", "")].filter(
        (t) => t && t !== ":" && !t.includes("<none>"),
      ),
      size: Math.round(img.sizeGB * 1024 * 1024 * 1024), // bytes
      created: img.createdAt
        ? Math.floor(new Date(img.createdAt.split(" ")[0] ?? "").getTime() / 1000)
        : undefined,
    }));
    respond(true, { ok: true, images: mapped }, undefined);
  },

  "republic.docker.images.pull": async ({ params, respond }) => {
    const p = params as { image?: string } | undefined;
    if (!p?.image) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "image required"));
      return;
    }
    const ok = await pullImage(p.image);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, `Failed to pull ${p.image}`),
    );
  },

  "republic.docker.images.remove": async ({ params, respond }) => {
    const p = params as { image?: string; force?: boolean } | undefined;
    if (!p?.image) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "image required"));
      return;
    }
    const ok = await removeImage(p.image, p.force ?? false);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to remove image"),
    );
  },

  // ── Networks ────────────────────────────────────────────────────

  "republic.docker.networks.list": ({ respond }) => {
    const networks = listNetworks();
    respond(true, { ok: true, networks }, undefined);
  },

  // ── Presets ─────────────────────────────────────────────────────

  "republic.docker.presets.list": ({ respond }) => {
    const presets = Object.entries(CONTAINER_PRESETS).map(([name, cfg]) => ({
      name,
      image: cfg.image,
      description: `${cfg.memoryLimit ?? "?"} RAM, ${cfg.cpuLimit ?? "?"} CPU${cfg.gpus ? " · GPU" : ""}`,
    }));
    respond(true, { ok: true, presets }, undefined);
  },

  "republic.docker.presets.launch": async ({ params, respond }) => {
    const p = params as { name?: string; requestedBy?: string } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    if (!(p.name in CONTAINER_PRESETS)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Unknown preset: ${p.name}`),
      );
      return;
    }
    const result = await launchPreset(p.name, p.requestedBy);
    respond(
      !!result.container,
      result.container ? { ok: true, container: result.container } : undefined,
      result.container
        ? undefined
        : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Preset launch failed"),
    );
  },
  // ── Reconcile — force-resync from Docker labels ───────────────────────

  "republic.docker.reconcile": async ({ respond }) => {
    const docker = ensureDocker();
    if (!docker.available) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Docker not available"));
      return;
    }
    const result = await reconcileManagedContainers();
    respond(true, { ok: true, ...result }, undefined);
  },

  // ── Budget — current resource allocation state ──────────────────────

  "republic.docker.budget": async ({ respond }) => {
    // getDockerDiagnostics() refreshes activeContainers from live Docker state
    const orch = await import("../../../republic/docker-orchestrator.js");
    const diagnostics = orch.getDockerDiagnostics();
    respond(true, { ok: true, budget: diagnostics.budget }, undefined);
  },

  // ── Container Inspect (full details) ──────────────────────────────

  "republic.docker.containers.inspect": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const data = await inspectContainerFullAsync(p.id);
    if (!data) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "Container not found or inspect failed"),
      );
      return;
    }

    // Extract useful config from the raw inspect JSON
    const config = data.Config as Record<string, unknown> | undefined;
    const hostConfig = data.HostConfig as Record<string, unknown> | undefined;
    const networkSettings = data.NetworkSettings as Record<string, unknown> | undefined;
    const state = data.State as Record<string, unknown> | undefined;

    respond(
      true,
      {
        ok: true,
        container: {
          id: data.Id,
          name: (data.Name as string)?.replace(/^\//, ""),
          image: config?.Image,
          created: data.Created,
          state: {
            status: state?.Status,
            running: state?.Running,
            startedAt: state?.StartedAt,
            finishedAt: state?.FinishedAt,
            exitCode: state?.ExitCode,
            error: state?.Error,
          },
          config: {
            env: config?.Env,
            cmd: config?.Cmd,
            entrypoint: config?.Entrypoint,
            workingDir: config?.WorkingDir,
            labels: config?.Labels,
            exposedPorts: config?.ExposedPorts,
          },
          hostConfig: {
            cpuLimit: hostConfig?.NanoCpus ? String(Number(hostConfig.NanoCpus) / 1e9) : undefined,
            memoryLimit: hostConfig?.Memory ? formatBytes(Number(hostConfig.Memory)) : undefined,
            memoryRaw: hostConfig?.Memory,
            restartPolicy: hostConfig?.RestartPolicy,
            binds: hostConfig?.Binds,
            portBindings: hostConfig?.PortBindings,
            networkMode: hostConfig?.NetworkMode,
            devices: hostConfig?.Devices,
            runtime: hostConfig?.Runtime,
          },
          networkSettings: {
            networks: networkSettings?.Networks,
            ports: networkSettings?.Ports,
            ipAddress: networkSettings?.IPAddress,
            gateway: networkSettings?.Gateway,
          },
          mounts: data.Mounts,
        },
      },
      undefined,
    );
  },

  // ── Container Stats (live CPU/memory snapshot) ──────────────────

  "republic.docker.containers.stats": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const stats = await getContainerStatsAsync(p.id);
    if (!stats) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "Cannot get stats — container may not be running"),
      );
      return;
    }
    respond(true, { ok: true, stats }, undefined);
  },

  // ── Container Resource Update ──────────────────────────────────

  "republic.docker.containers.update": async ({ params, respond }) => {
    const p = params as { id?: string; cpuLimit?: string; memoryLimit?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    if (!p.cpuLimit && !p.memoryLimit) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "cpuLimit or memoryLimit required"),
      );
      return;
    }
    const result = await updateContainerResources(p.id, {
      cpuLimit: p.cpuLimit,
      memoryLimit: p.memoryLimit,
    });
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Update failed"),
    );
  },

  // ── Custom Container Create ────────────────────────────────────

  "republic.docker.containers.create": async ({ params, respond }) => {
    const p = params as
      | {
          name?: string;
          image?: string;
          ports?: string[];
          volumes?: string[];
          env?: Record<string, string>;
          cpuLimit?: string;
          memoryLimit?: string;
          restartPolicy?: string;
          gpus?: string;
          command?: string[];
          network?: string;
        }
      | undefined;

    if (!p?.name || !p?.image) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name and image required"));
      return;
    }

    const result = await createContainer({
      name: p.name,
      image: p.image,
      ports: p.ports,
      volumes: p.volumes,
      env: p.env,
      cpuLimit: p.cpuLimit ?? "1.0",
      memoryLimit: p.memoryLimit ?? "1g",
      restartPolicy: p.restartPolicy ?? "unless-stopped",
      gpus: p.gpus,
      command: p.command,
      network: p.network,
      requestedBy: "gateway-ui",
    });

    respond(
      !!result.container,
      result.container ? { ok: true, container: result.container } : undefined,
      result.container
        ? undefined
        : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Create failed"),
    );
  },

  // ── Streaming Pull ─────────────────────────────────────────────

  "republic.docker.pull.stream": async ({ params, respond }) => {
    const p = params as { image?: string } | undefined;
    if (!p?.image) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "image required"));
      return;
    }
    // Start the pull — returns immediately with a pullId
    const { pullId } = pullImageStreaming(p.image);
    // Don't await the promise — let it run in background
    respond(true, { ok: true, pullId, image: p.image }, undefined);
  },

  "republic.docker.pull.progress": ({ params, respond }) => {
    const p = params as { pullId?: string } | undefined;
    if (!p?.pullId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pullId required"));
      return;
    }
    const progress = getPullProgress(p.pullId);
    respond(true, { ok: true, progress }, undefined);
  },

  "republic.docker.pull.active": ({ respond }) => {
    const pulls = getActivePulls();
    respond(true, { ok: true, pulls }, undefined);
  },

  // ── Terminal (PowerShell window) ────────────────────────────────

  "republic.docker.terminal": ({ params, respond }) => {
    const p = params as
      | {
          action?: "pull" | "logs" | "shell" | "custom";
          image?: string;
          container?: string;
          command?: string[];
          shell?: string;
        }
      | undefined;

    if (!p?.action) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "action required (pull|logs|shell|custom)"),
      );
      return;
    }

    let result;
    switch (p.action) {
      case "pull":
        if (!p.image) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "image required for pull"),
          );
          return;
        }
        result = openPullTerminal(p.image);
        break;
      case "logs":
        if (!p.container) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "container required for logs"),
          );
          return;
        }
        result = openLogsTerminal(p.container);
        break;
      case "shell":
        if (!p.container) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "container required for shell"),
          );
          return;
        }
        result = openShellTerminal(p.container, p.shell ?? "bash");
        break;
      case "custom":
        if (!p.command?.length) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "command required for custom"),
          );
          return;
        }
        result = openDockerTerminal(p.command);
        break;
      default:
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Unknown action: ${p.action}`),
        );
        return;
    }

    respond(
      result.ok,
      result.ok ? { ok: true, pid: result.pid } : undefined,
      result.ok
        ? undefined
        : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed to open terminal"),
    );
  },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}g`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)}m`;
  }
  return `${(bytes / 1024).toFixed(0)}k`;
}
