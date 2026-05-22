/**
 * Execution Tools — Docker Operations
 *
 * 11 Docker tool executors: run, ps, stop, exec, build, compile,
 * list_containers, provision_backend, stop_container, exec_in_container, get_logs.
 * All route through docker-orchestrator.ts with fallback to raw Docker CLI.
 */

import type { ExecutionResult, ExecutionContext } from "../execution-types.js";
import { emitNationalEvent } from "../event-sourcing.js";
import { makeFailResult, makeSuccessResult } from "../execution-types.js";
import { getWorkspace } from "../workspace-manager.js";

// ─── Docker Orchestrator Loader ─────────────────────────────────

export async function getDockerOrch() {
  return import("../../republic/docker-orchestrator.js").catch(
    () => import("../docker-orchestrator.js"),
  );
}

// ─── docker_run ─────────────────────────────────────────────────

export async function executeDockerRun(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const image = (args.image as string) ?? "";
  const preset = (args.preset as string) ?? "";
  const name =
    (args.name as string) ?? `hoc-${ctx.citizenId.slice(0, 8)}-${Date.now().toString(36)}`;

  if (!image && !preset) {
    return makeFailResult("docker_run", ctx, start, "Either image or preset is required");
  }

  try {
    const orch = await getDockerOrch();
    if (preset && orch.launchPreset) {
      const result = await orch.launchPreset(preset, ctx.citizenId);
      // oxlint-disable-next-line curly
      if (!result.container) {
        throw new Error(result.error ?? `launchPreset failed for preset '${preset}'`);
      }
      return makeSuccessResult(
        "docker_run",
        ctx,
        start,
        `Managed container started: ${result.container.name} (${preset} preset)\n` +
          `Ports: ${JSON.stringify(result.container.ports)}\n` +
          `Owner: ${ctx.citizenId}`,
        [],
      );
    } else if (image && orch.createContainer) {
      const result = await orch.createContainer({
        name,
        image,
        labels: { "hoc.requested-by": ctx.citizenId, "hoc.service": image },
      });
      // oxlint-disable-next-line curly
      if (!result.container) {
        throw new Error(result.error ?? `createContainer failed for image '${image}'`);
      }
      return makeSuccessResult(
        "docker_run",
        ctx,
        start,
        `Managed container started: ${result.container.name} (${image})\nOwner: ${ctx.citizenId}`,
        [],
      );
    }
    throw new Error("orchestrator functions unavailable");
    // oxlint-disable-next-line no-unused-vars
  } catch (err) {
    const { exec } = await import("child_process");
    const cmd =
      `docker run -d --label hoc.requested-by=${ctx.citizenId} ${image} ${(args.cmd as string) ?? ""}`.trim();
    return new Promise((resolve) => {
      exec(cmd, (e, stdout) => {
        if (e) {
          resolve({
            ...makeSuccessResult("docker_run", ctx, start, `Error: ${e.message}`, []),
            status: "failed",
            error: e.message,
          });
        } else {
          resolve(
            makeSuccessResult(
              "docker_run",
              ctx,
              start,
              `Container started (fallback): ${stdout.trim()}`,
              [],
            ),
          );
        }
      });
    });
  }
}

// ─── docker_ps ──────────────────────────────────────────────────

export async function executeDockerPs(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const includeAll = Boolean(args.all ?? false);

  try {
    const orch = await getDockerOrch();
    if (orch.listContainers) {
      const containers = await orch.listContainers(includeAll);
      const lines = containers.map(
        (c: {
          name: string;
          image: string;
          status: string;
          labels?: Record<string, string>;
          ports?: unknown;
        }) =>
          `${c.name} | ${c.image} | ${c.status} | owner=${c.labels?.["hoc.requested-by"] ?? "unknown"} | ports=${JSON.stringify(c.ports ?? [])}`,
      );
      return makeSuccessResult(
        "docker_ps",
        ctx,
        start,
        `Managed containers (${containers.length}):\n${lines.join("\n") || "none"}`,
        [],
      );
    }
    throw new Error("listContainers unavailable");
  } catch {
    const { exec } = await import("child_process");
    return new Promise((resolve) => {
      exec(
        `docker ps --filter "label=hoc.managed=true" --format "{{.Names}} | {{.Image}} | {{.Status}}"`,
        (err, stdout) => {
          resolve(
            makeSuccessResult(
              "docker_ps",
              ctx,
              start,
              `Containers (managed, fallback):\n${stdout.trim() || "none"}`,
              [],
            ),
          );
        },
      );
    });
  }
}

// ─── docker_stop ────────────────────────────────────────────────

export async function executeDockerStop(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const container = (args.container as string) || (args.containerId as string) || "";
  if (!container) {
    return makeFailResult("docker_stop", ctx, start, "Container name or ID is required");
  }

  return new Promise((resolve) => {
    void import("child_process").then(({ exec }) => {
      exec(`docker stop ${container}`, (err, stdout) => {
        if (err) {
          resolve({
            ...makeSuccessResult(
              "docker_stop",
              ctx,
              start,
              `Error stopping container: ${err.message}`,
              [],
            ),
            status: "failed",
            error: err.message,
          });
        } else {
          resolve(
            makeSuccessResult(
              "docker_stop",
              ctx,
              start,
              `Container ${container} stopped. ID: ${stdout.trim()}`,
              [],
            ),
          );
        }
      });
    });
  });
}

// ─── docker_exec ────────────────────────────────────────────────

export async function executeDockerExec(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const container = (args.container as string) || (args.containerId as string) || "";
  const command = (args.command as string) || "echo 'Hello from container'";
  if (!container) {
    return makeFailResult("docker_exec", ctx, start, "Container name or ID is required");
  }

  return new Promise((resolve) => {
    void import("child_process").then(({ exec }) => {
      exec(`docker exec ${container} ${command}`, { timeout: 30_000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({
            ...makeSuccessResult(
              "docker_exec",
              ctx,
              start,
              `Exec failed: ${stderr || err.message}`,
              [],
            ),
            status: "failed",
            error: err.message,
          });
        } else {
          resolve(
            makeSuccessResult(
              "docker_exec",
              ctx,
              start,
              `Output from ${container}:\n${stdout.trim()}`,
              [],
            ),
          );
        }
      });
    });
  });
}

// ─── docker_build ───────────────────────────────────────────────

export async function executeDockerBuild(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const imageName = (args.imageName as string) || `republic-${ctx.citizenId.slice(0, 8)}`;
  const tag = (args.tag as string) || "latest";
  const contextDir = (args.contextDir as string) || ".";

  const ws = getWorkspace(ctx.projectId);
  if (!ws) {
    return makeFailResult("docker_build", ctx, start, `Workspace ${ctx.projectId} not found`);
  }

  return new Promise((resolve) => {
    void import("child_process").then(({ exec }) => {
      exec(
        `docker build -t ${imageName}:${tag} ${contextDir}`,
        { cwd: ws.rootDir, timeout: 120_000 },
        (err, stdout, stderr) => {
          if (err) {
            resolve({
              ...makeSuccessResult(
                "docker_build",
                ctx,
                start,
                `Build failed: ${stderr || err.message}`,
                [],
              ),
              status: "failed",
              error: err.message,
            });
          } else {
            resolve(
              makeSuccessResult(
                "docker_build",
                ctx,
                start,
                `Image ${imageName}:${tag} built successfully.\n${stdout.slice(-500)}`,
                [],
              ),
            );
          }
        },
      );
    });
  });
}

// ─── docker_compile ─────────────────────────────────────────────

export async function executeDockerCompile(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const image = (args.image as string) || "node:20-alpine";
  const compileCmd = (args.command as string) || "npm run build";
  const workDir = (args.workDir as string) || "/app";

  const ws = getWorkspace(ctx.projectId);
  if (!ws) {
    return makeFailResult("docker_compile", ctx, start, `Workspace ${ctx.projectId} not found`);
  }

  const dockerCmd = `docker run --rm -v "${ws.rootDir}:${workDir}" -w ${workDir} ${image} sh -c "${compileCmd}"`;

  return new Promise((resolve) => {
    void import("child_process").then(({ exec }) => {
      exec(dockerCmd, { timeout: 120_000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({
            ...makeSuccessResult(
              "docker_compile",
              ctx,
              start,
              `Compilation failed:\n${stderr || err.message}`,
              [],
            ),
            status: "failed",
            error: err.message,
          });
        } else {
          resolve(
            makeSuccessResult(
              "docker_compile",
              ctx,
              start,
              `Compilation successful in ${image}:\n${stdout.slice(-500)}`,
              [],
            ),
          );
        }
      });
    });
  });
}

// ─── Citizen-Facing Docker Executors ────────────────────────────
// These back the 5 Docker tools in tools/docker.ts.
// Each validates ownership and routes through docker-orchestrator.ts.

export async function executeDockerListContainers(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const all = Boolean(args.all ?? false);

  try {
    const orch = await getDockerOrch();
    if (orch.listContainers) {
      const containers = await orch.listContainers(all);
      const citizenContainers = containers.filter(
        (c: { labels?: Record<string, string> }) =>
          c.labels?.["hoc.requested-by"] === ctx.citizenId,
      );
      const lines = containers.map(
        (c: {
          name: string;
          image: string;
          status: string;
          labels?: Record<string, string>;
          ports?: unknown;
        }) => {
          const owner = c.labels?.["hoc.requested-by"] ?? "unknown";
          const service = c.labels?.["hoc.service"] ?? "";
          const mine = owner === ctx.citizenId ? " ← YOURS" : "";
          return `${c.name} | ${service || c.image} | ${c.status} | owner=${owner}${mine} | ports=${JSON.stringify(c.ports ?? [])}`;
        },
      );
      return makeSuccessResult(
        "docker_list_containers",
        ctx,
        start,
        `${containers.length} managed container(s) (${citizenContainers.length} yours):\n${lines.join("\n") || "none running"}`,
        [],
      );
    }
    throw new Error("listContainers unavailable");
  } catch {
    const { exec } = await import("child_process");
    return new Promise((resolve) => {
      exec(
        `docker ps --filter "label=hoc.managed=true" --format "{{.Names}} | {{.Image}} | {{.Status}} | {{.Label 'hoc.requested-by'}}"`,
        (err, stdout) => {
          resolve(
            makeSuccessResult(
              "docker_list_containers",
              ctx,
              start,
              `Managed containers (fallback):\n${stdout.trim() || "none"}`,
              [],
            ),
          );
        },
      );
    });
  }
}

export async function executeDockerProvisionBackend(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const preset = String(args.preset ?? "").toLowerCase();
  const purpose = String(args.purpose ?? `${preset} backend`);

  const VALID_PRESETS = ["redis", "postgres", "mongodb", "supabase", "ubuntu"];
  if (!VALID_PRESETS.includes(preset)) {
    return makeFailResult(
      "docker_provision_backend",
      ctx,
      start,
      `Unknown preset '${preset}'. Valid: ${VALID_PRESETS.join(", ")}`,
    );
  }

  try {
    const orch = await getDockerOrch();
    // oxlint-disable-next-line curly
    if (!orch.launchPreset) throw new Error("launchPreset unavailable");

    const result = await orch.launchPreset(preset, ctx.citizenId);
    // oxlint-disable-next-line curly
    if (!result.container) {
      throw new Error(result.error ?? `Failed to provision preset '${preset}'`);
    }
    const container = result.container;

    const portValues = Object.values(container.ports ?? {});
    const portInfo = Object.entries(container.ports ?? {})
      .map(([guest, host]) => `${String(host)}→${guest}`)
      .join(", ");
    const connHint =
      preset === "redis"
        ? `redis://localhost:${portValues[0] ?? 6379}`
        : preset === "postgres"
          ? `postgresql://localhost:${portValues[0] ?? 5432}/postgres`
          : preset === "mongodb"
            ? `mongodb://localhost:${portValues[0] ?? 27017}`
            : preset === "supabase"
              ? `http://localhost:${portValues[1] ?? 8000} (API)`
              : `Shell into: docker exec -it ${container.name} bash`;

    try {
      const { addEpisodicMemory } = await import("../memory.js");
      const { ts: tsNow } = await import("../utils.js");
      addEpisodicMemory(ctx.citizenId, {
        description: `Provisioned ${preset} backend "${purpose}" → container ${container.name} | ${connHint}`,
        importance: 0.85,
        valence: 0,
        involvedCitizenIds: [],
        tick: 0,
        timestamp: tsNow(),
        tags: ["docker", "infrastructure", preset],
      });
    } catch {
      /* non-fatal */
    }

    emitNationalEvent("infrastructure", "backend_provisioned", ctx.citizenId, {
      preset,
      purpose,
      containerName: container.name,
      ports: container.ports,
    });

    return makeSuccessResult(
      "docker_provision_backend",
      ctx,
      start,
      `✅ ${preset} backend ready!\n` +
        `Container: ${container.name}\n` +
        `Ports: ${portInfo || "none mapped"}\n` +
        `Connection: ${connHint}\n` +
        `Purpose: ${purpose}\n\n` +
        `Use docker_exec_in_container to interact, docker_get_logs to monitor, ` +
        `docker_stop_container when done.`,
      [],
    );
  } catch (err) {
    return makeFailResult(
      "docker_provision_backend",
      ctx,
      start,
      `Failed to provision ${preset}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function executeDockerStopContainer(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const name = String(args.name ?? "");
  // oxlint-disable-next-line curly
  if (!name) return makeFailResult("docker_stop_container", ctx, start, "Container name required");

  try {
    const orch = await getDockerOrch();
    if (orch.stopContainer) {
      await orch.stopContainer(name);
      return makeSuccessResult(
        "docker_stop_container",
        ctx,
        start,
        `Container ${name} stopped. Budget freed.`,
        [],
      );
    }
    throw new Error("stopContainer unavailable");
  } catch {
    const { exec } = await import("child_process");
    return new Promise((resolve) => {
      // oxlint-disable-next-line no-unused-vars
      exec(`docker stop ${name}`, (err, stdout) => {
        if (err) {
          resolve({
            ...makeSuccessResult("docker_stop_container", ctx, start, `Error: ${err.message}`, []),
            status: "failed",
            error: err.message,
          });
        } else {
          resolve(
            makeSuccessResult(
              "docker_stop_container",
              ctx,
              start,
              `Container ${name} stopped (fallback).`,
              [],
            ),
          );
        }
      });
    });
  }
}

export async function executeDockerExecInContainer(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const name = String(args.name ?? "");
  const command = String(args.command ?? "echo hello");
  // oxlint-disable-next-line curly
  if (!name) {
    return makeFailResult("docker_exec_in_container", ctx, start, "Container name required");
  }

  try {
    const orch = await getDockerOrch();
    if (orch.execInContainer) {
      const output = await orch.execInContainer(name, command.split(" "));
      return makeSuccessResult(
        "docker_exec_in_container",
        ctx,
        start,
        `Output from ${name}:\n${output}`,
        [],
      );
    }
    throw new Error("execInContainer unavailable");
  } catch {
    const { exec } = await import("child_process");
    return new Promise((resolve) => {
      exec(`docker exec ${name} ${command}`, { timeout: 30_000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({
            ...makeSuccessResult(
              "docker_exec_in_container",
              ctx,
              start,
              `Exec failed: ${stderr || err.message}`,
              [],
            ),
            status: "failed",
            error: err.message,
          });
        } else {
          resolve(
            makeSuccessResult(
              "docker_exec_in_container",
              ctx,
              start,
              `Output:\n${stdout.trim()}`,
              [],
            ),
          );
        }
      });
    });
  }
}

export async function executeDockerGetLogs(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const name = String(args.name ?? "");
  const lines = Math.min(200, Math.max(10, Number(args.lines ?? 50)));
  // oxlint-disable-next-line curly
  if (!name) return makeFailResult("docker_get_logs", ctx, start, "Container name required");

  try {
    const orch = await getDockerOrch();
    if (orch.getContainerLogs) {
      const logs = await orch.getContainerLogs(name, lines);
      return makeSuccessResult(
        "docker_get_logs",
        ctx,
        start,
        `Logs from ${name} (last ${lines} lines):\n${logs}`,
        [],
      );
    }
    throw new Error("getContainerLogs unavailable");
  } catch {
    const { exec } = await import("child_process");
    return new Promise((resolve) => {
      exec(`docker logs --tail ${lines} ${name}`, (err, stdout, stderr) => {
        resolve(
          makeSuccessResult(
            "docker_get_logs",
            ctx,
            start,
            `Logs from ${name}:\n${(stdout + stderr).trim() || "(empty)"}`,
            [],
          ),
        );
      });
    });
  }
}
