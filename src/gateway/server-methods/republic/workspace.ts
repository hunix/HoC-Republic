/**
 * Republic Gateway Handlers â€” workspace
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import type { WorkspaceStatus } from "../../../republic/workspace-manager.js";
import type { GatewayRequestHandlers } from "../types.js";
import {
  type AppGenConfig,
  addFeatureToProject,
  generateProjectScaffold,
  getAvailableTemplates,
} from "../../../republic/app-generation-engine.js";
import type { AppTemplate } from "../../../republic/app-generation-rules.js";
import {
  getFreeCallPercentage,
  getProviderStatuses,
  getTierStats,
  registerProvider as registerComputeProvider,
  routeTask as computeRouteTask,
  setProviderAvailability as setComputeProviderAvailability,
} from "../../../republic/compute-router.js";
// Phase 36: Dynamic Compute Scaling
// Phase 35: Docker Orchestration Engine
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
import {
  exportCouncilState,
  getCouncilDiagnostics,
  markProviderUnavailable as markCouncilProviderUnavailable,
  MODEL_CATALOG,
  registerAvailableProvider as registerCouncilProvider,
  selectModel,
} from "../../../republic/model-council.js";
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import {
  generateStatusSummary,
  getProgressEventCount,
  getProgressEvents,
} from "../../../republic/progress-reporter.js";
import {
  assembleProjectTeam as _assembleProjectTeam,
  getProjectTeam,
  onProjectChatMessage,
  startAutonomousBuild,
} from "../../../republic/project-team-orchestrator.js";
import { getState } from "../../../republic/state.js";
import {
  assignCitizens,
  createWorkspace,
  deleteWorkspaceFile,
  execInWorkspace,
  getProjectArtifacts,
  getWorkspace,
  gitCommit,
  listWorkspaceFiles,
  listWorkspaces,
  readWorkspaceFile,
  setPreviewUrl,
  updateWorkspaceStatus,
  writeWorkspaceFile,
} from "../../../republic/workspace-manager.js";
import { getPreviewUrl, getAllPreviews, startPreviewServer } from "../../preview-server-manager.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const workspaceHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Phase 22: Workspace Manager ─────────────────────────────

  "republic.workspace.create": ({ params, respond }) => {
    const p = params as { name?: string; description?: string; initGit?: boolean } | undefined;
    if (!p?.name) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name required"),
      );
      return;
    }
    createWorkspace({ name: p.name, description: p.description ?? p.name, initGit: p.initGit })
      .then((ws) => respond(true, { ok: true, workspace: ws }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.get": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const ws = getWorkspace(p.projectId);
    respond(
      !!ws,
      ws ? { ok: true, workspace: ws } : undefined,
      ws ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Workspace not found"),
    );
  },

  "republic.workspace.list": ({ params, respond }) => {
    const p = params as { status?: string } | undefined;
    respond(true, { ok: true, workspaces: listWorkspaces(p?.status as never) }, undefined);
  },

  // republic.dev.projects — UNIFIED view: state.devProjects + workspace-manager merged
  // state.devProjects = rich in-memory data (team, QA, deployments, files list)
  // workspace-manager = real disk data (actual files, previewUrl, real file count)
  // Result: augment state data with real file+preview info, plus append workspace-only projects
  "republic.dev.projects": ({ respond }) => {
    const s = getState();
    const wsMap = new Map(listWorkspaces().map((w) => [w.id, w]));

    // Stage 1: Map state.devProjects (rich source of truth)
    const stateProjectIds = new Set<string>();
    const projects = s.devProjects.map((p) => {
      stateProjectIds.add(p.id);
      // Augment with workspace-manager data if available
      const ws = wsMap.get(p.id);

      // Determine stack label
      let framework = ws?.framework ?? "";
      if (!framework) {
        if (typeof p.stack === "string") {
          framework = p.stack || "Node.js / TypeScript";
        } else if (p.stack && typeof p.stack === "object") {
          const parts = [
            ...(Array.isArray(p.stack.frameworks) ? p.stack.frameworks : []),
            ...(Array.isArray(p.stack.languages) ? p.stack.languages : []),
          ].filter(Boolean);
          framework = parts.length > 0 ? parts.join(" + ") : "Node.js / TypeScript";
        }
      }

      // Real file count from disk, fall back to state
      const fileCount = ws?.fileCount ?? p.files.length;

      // Real preview URL from deploy_app run, fall back to latest deployment URL
      const latestDeploy = p.deployments?.[p.deployments.length - 1];
      const previewUrl = ws?.previewUrl ?? latestDeploy?.url;

      // Map project status to UI status
      const rawStatus = p.status as string;
      const uiStatus =
        rawStatus === "deployed" || rawStatus === "delivered"
          ? "ready"
          : rawStatus === "building" || rawStatus === "active" || rawStatus === "running"
            ? "building"
            : rawStatus === "error" || rawStatus === "failed"
              ? "error"
              : "idle";

      // Infer type from framework/stack
      const type = /api|fastify|hono|express|node.?server|backend/.test(framework.toLowerCase())
        ? "api"
        : /python|ubuntu|fastapi|flask|jupyter|ml|ai.science/.test(framework.toLowerCase())
          ? "script"
          : /mobile|react.native|expo/.test(framework.toLowerCase())
            ? "app"
            : "webapp";

      return {
        // Core identity
        id: p.id,
        name: p.name || `Project-${p.id.slice(-4)}`,
        description: p.description,
        type,
        status: uiStatus,
        framework,
        lastUpdated: new Date(p.updatedAt).getTime(),
        // Team data — real citizen name/id as creator
        creator: p.ownerName ?? ws?.creatorId ?? p.team?.[0]?.citizenName ?? "Citizen",
        ownerId: p.ownerId,
        assignedCitizens: ws?.assignedCitizens ?? p.team?.map((t) => t.citizenId) ?? [],
        // Preview & files
        previewUrl,
        fileCount,
        totalSizeBytes: ws?.totalSizeBytes,
        rootDir: ws?.rootDir,
        // Quality metrics
        buildHealth: p.buildHealth,
        codeQuality: p.codeQuality,
        linesOfCode: p.linesOfCode,
        commitCount: p.commitCount,
        testsTotal: p.tests?.total,
        testsPassed: p.tests?.passed,
        testCoverage: p.tests?.coverage,
        // Phase tracking
        phase: rawStatus,
        createdAt: p.createdAt,
      };
    });

    // Stage 2: Append workspace-only projects (created by real tool calls, not in state)
    for (const ws of wsMap.values()) {
      if (stateProjectIds.has(ws.id)) {
        continue;
      } // already included above
      const type = /api|fastify|hono|express|node.?server|backend/.test(
        (ws.framework ?? "").toLowerCase(),
      )
        ? "api"
        : /python|ubuntu|fastapi|flask|jupyter|ml/.test((ws.framework ?? "").toLowerCase())
          ? "script"
          : "webapp";
      const uiStatus =
        ws.status === "delivered"
          ? "ready"
          : ws.status === "active"
            ? "building"
            : ws.status === "planning"
              ? "idle"
              : "idle";
      projects.push({
        id: ws.id,
        name: ws.name,
        description: ws.description,
        type,
        status: uiStatus,
        framework: ws.framework ?? "Node.js / TypeScript",
        lastUpdated: new Date(ws.updatedAt).getTime(),
        creator: ws.creatorId ?? ws.assignedCitizens[0] ?? "Citizen",
        ownerId: ws.creatorId ?? ws.assignedCitizens[0] ?? "",
        assignedCitizens: ws.assignedCitizens,
        previewUrl: ws.previewUrl ?? null,
        fileCount: ws.fileCount,
        totalSizeBytes: ws.totalSizeBytes,
        rootDir: ws.rootDir,
        buildHealth: null as unknown as number,
        codeQuality: null as unknown as number,
        linesOfCode: null as unknown as number,
        commitCount: null as unknown as number,
        testsTotal: null as unknown as number,
        testsPassed: null as unknown as number,
        testCoverage: null as unknown as number,
        phase: ws.status,
        createdAt: ws.createdAt,
      });
    }

    // Filter out empty planning stubs (0 files, 0 bytes, idle status)
    // These are created by plan_project/clone_repo tools before any real work happens
    const realProjects = projects.filter(p =>
      (p.fileCount ?? 0) > 0 || (p.totalSizeBytes ?? 0) > 0 || p.status !== "idle"
    );

    // Sort: building → idle → ready, then by lastUpdated desc
    realProjects.sort((a, b) => {
      const order = { building: 0, idle: 1, ready: 2, error: 3 };
      const ao = order[a.status as keyof typeof order] ?? 4;
      const bo = order[b.status as keyof typeof order] ?? 4;
      return ao !== bo ? ao - bo : b.lastUpdated - a.lastUpdated;
    });

    respond(true, { projects: realProjects, totalProjects: realProjects.length }, undefined);
  },

  // Set preview URL manually (UI action)
  "republic.workspace.preview.set": ({ params, respond }) => {
    const p = params as
      | { projectId?: string; previewUrl?: string; previewPort?: number }
      | undefined;
    if (!p?.projectId || !p?.previewUrl) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and previewUrl required"),
      );
      return;
    }
    setPreviewUrl(p.projectId, p.previewUrl, p.previewPort)
      .then(() => respond(true, { ok: true }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.status": ({ params, respond }) => {
    const p = params as { projectId?: string; status?: string } | undefined;
    if (!p?.projectId || !p?.status) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and status required"),
      );
      return;
    }
    updateWorkspaceStatus(p.projectId, p.status as WorkspaceStatus)
      .then(() => respond(true, { ok: true }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.assign": ({ params, respond }) => {
    const p = params as { projectId?: string; citizenIds?: string[] } | undefined;
    if (!p?.projectId || !p?.citizenIds?.length) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and citizenIds required"),
      );
      return;
    }
    assignCitizens(p.projectId, p.citizenIds);
    respond(true, { ok: true }, undefined);
  },

  "republic.workspace.file.write": ({ params, respond }) => {
    const p = params as
      | {
          projectId?: string;
          relativePath?: string;
          content?: string;
          language?: string;
          citizenId?: string;
        }
      | undefined;
    if (!p?.projectId || !p?.relativePath || p?.content === undefined) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId, relativePath, content required"),
      );
      return;
    }
    writeWorkspaceFile({
      projectId: p.projectId,
      relativePath: p.relativePath,
      content: p.content,
      language: p.language ?? "text",
      citizenId: p.citizenId ?? "system",
    })
      .then((f) => respond(true, { ok: true, file: f }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.file.read": ({ params, respond }) => {
    const p = params as { projectId?: string; relativePath?: string } | undefined;
    if (!p?.projectId || !p?.relativePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and relativePath required"),
      );
      return;
    }
    readWorkspaceFile(p.projectId, p.relativePath)
      .then((content) => respond(true, { ok: true, content }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.file.list": ({ params, respond }) => {
    const p = params as { projectId?: string; subdir?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    listWorkspaceFiles(p.projectId, p.subdir)
      .then((files) => respond(true, { ok: true, files }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.file.delete": ({ params, respond }) => {
    const p = params as { projectId?: string; relativePath?: string } | undefined;
    if (!p?.projectId || !p?.relativePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and relativePath required"),
      );
      return;
    }
    deleteWorkspaceFile(p.projectId, p.relativePath)
      .then(() => respond(true, { ok: true }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.exec": ({ params, respond }) => {
    const p = params as
      | { projectId?: string; command?: string; args?: string[]; timeout?: number }
      | undefined;
    if (!p?.projectId || !p?.command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and command required"),
      );
      return;
    }
    execInWorkspace(p.projectId, p.command, p.args ?? [], { timeout: p.timeout })
      .then((r) => respond(true, { ok: true, result: r }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.git.commit": ({ params, respond }) => {
    const p = params as { projectId?: string; message?: string; citizenId?: string } | undefined;
    if (!p?.projectId || !p?.message) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and message required"),
      );
      return;
    }
    gitCommit(p.projectId, p.message, p.citizenId ?? "system")
      .then((r) => respond(true, { ok: true, result: r }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.workspace.artifacts": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    respond(true, { ok: true, artifacts: getProjectArtifacts(p.projectId) }, undefined);
  },

  // ─── Phase 22: Model Council ─────────────────────────────────

  "republic.council.decide": ({ params, respond }) => {
    const p = params as
      | {
          toolName?: string;
          specialization?: string;
          skillLevel?: number;
          taskType?: string;
          complexity?: number;
        }
      | undefined;
    if (!p?.toolName || !p?.specialization) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "toolName and specialization required"),
      );
      return;
    }
    const decision = selectModel({
      toolName: p.toolName,
      task: { type: p.taskType ?? "action", complexity: p.complexity ?? 0.5 } as never,
      specialization: p.specialization as never,
      skillLevel: p.skillLevel ?? 50,
    });
    respond(true, { ok: true, decision }, undefined);
  },

  "republic.council.catalog": ({ respond }) => {
    respond(true, { ok: true, models: MODEL_CATALOG }, undefined);
  },

  "republic.council.state": ({ respond }) => {
    respond(true, { ok: true, state: exportCouncilState() }, undefined);
  },

  "republic.council.provider.register": ({ params, respond }) => {
    const p = params as { provider?: string; models?: string[] } | undefined;
    if (!p?.provider || !p?.models?.length) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "provider and models required"),
      );
      return;
    }
    registerCouncilProvider(p.provider, p.models);
    respond(true, { ok: true }, undefined);
  },

  "republic.council.provider.unavailable": ({ params, respond }) => {
    const p = params as { provider?: string } | undefined;
    if (!p?.provider) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "provider required"));
      return;
    }
    markCouncilProviderUnavailable(p.provider);
    respond(true, { ok: true }, undefined);
  },

  "republic.council.diagnostics": ({ respond }) => {
    respond(true, getCouncilDiagnostics(), undefined);
  },

  // ─── Phase 22: Compute Router ────────────────────────────────

  "republic.compute.route": ({ params, respond }) => {
    const p = params as { type?: string; complexity?: number } | undefined;
    if (!p?.type) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "type required"));
      return;
    }
    const target = computeRouteTask({ type: p.type, complexity: p.complexity ?? 0.5 } as never);
    respond(true, { ok: true, target }, undefined);
  },

  "republic.compute.providers": ({ respond }) => {
    respond(true, { ok: true, providers: getProviderStatuses() }, undefined);
  },

  "republic.compute.provider.register": ({ params, respond }) => {
    const p = params as { name?: string; models?: string[] } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    registerComputeProvider(p.name, { models: p.models ?? [] });
    respond(true, { ok: true }, undefined);
  },

  "republic.compute.provider.availability": ({ params, respond }) => {
    const p = params as { name?: string; available?: boolean } | undefined;
    if (!p?.name || p?.available === undefined) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name and available required"),
      );
      return;
    }
    setComputeProviderAvailability(p.name, p.available);
    respond(true, { ok: true }, undefined);
  },

  "republic.compute.tiers": ({ respond }) => {
    respond(true, { ok: true, tiers: getTierStats() }, undefined);
  },

  "republic.compute.free": ({ respond }) => {
    respond(true, { ok: true, freePercentage: getFreeCallPercentage() }, undefined);
  },

  // ─── Phase 22: Progress Reporter ─────────────────────────────

  "republic.progress.events": ({ params, respond }) => {
    const p = params as { projectId?: string; limit?: number } | undefined;
    respond(true, { ok: true, events: getProgressEvents(p?.projectId, p?.limit) }, undefined);
  },

  "republic.progress.summary": ({ params, respond }) => {
    const p = params as { projectId?: string; tasks?: unknown[] } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const summary = generateStatusSummary(p.projectId, (p.tasks ?? []) as never[]);
    respond(true, { ok: true, summary }, undefined);
  },

  "republic.progress.count": ({ respond }) => {
    respond(true, { ok: true, count: getProgressEventCount() }, undefined);
  },

  // ─── Project Chat & Team Orchestration ───────────────────────

  /**
   * Send a message to a project's citizen team.
   * The orchestrator classifies it and delegates to the right specialist.
   */
  "republic.project.chat.send": ({ params, respond }) => {
    const p = params as
      | { projectId?: string; message?: string; userId?: string; userName?: string }
      | undefined;
    if (!p?.projectId || !p?.message) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and message required"),
      );
      return;
    }
    onProjectChatMessage(p.projectId, p.message, p.userId ?? "user", p.userName ?? "You")
      .then((result) => respond(true, { ok: true, ...result }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  /** Get the full chat history for a project */
  "republic.project.chat.history": ({ params, respond }) => {
    const p = params as { projectId?: string; limit?: number } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const team = getProjectTeam(p.projectId);
    const history = team?.chatHistory ?? [];
    const limit = p.limit ?? 100;
    respond(true, { ok: true, messages: history.slice(-limit), total: history.length }, undefined);
  },

  /** Get the assembled team for a project */
  "republic.project.team.get": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const team = getProjectTeam(p.projectId);
    respond(
      !!team,
      team ? { ok: true, team } : undefined,
      team ? undefined : errorShape(ErrorCodes.NOT_FOUND, "No team assembled for this project"),
    );
  },

  /** Trigger (or re-trigger) the autonomous build pipeline for a project */
  "republic.project.build.start": ({ params, respond }) => {
    const p = params as
      | { projectId?: string; description?: string; framework?: string }
      | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const ws = getWorkspace(p.projectId);
    // Fire-and-forget: respond immediately, pipeline runs in background
    respond(true, { ok: true, status: "build_started", projectId: p.projectId }, undefined);
    // Kick off the full pipeline
    void startAutonomousBuild(
      p.projectId,
      p.description ?? ws?.description ?? "Project",
      p.framework ?? ws?.framework ?? "react",
    );
  },

  /** List all running preview servers */
  "republic.project.preview.list": ({ respond }) => {
    respond(true, { ok: true, previews: getAllPreviews() }, undefined);
  },

  /** Start or restart preview for a specific project */
  "republic.project.preview.start": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const ws = getWorkspace(p.projectId);
    if (!ws?.rootDir) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.NOT_FOUND, "Workspace rootDir not available"),
      );
      return;
    }
    startPreviewServer(p.projectId, ws.rootDir)
      .then((started) => {
        const url = getPreviewUrl(p.projectId!);
        respond(true, { ok: started, previewUrl: url }, undefined);
      })
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  // ─── App Generation Engine ──────────────────────────────────

  /** List available app templates (react-supabase, react-spa, api-service) */
  "republic.workspace.templates": ({ respond }) => {
    respond(true, { ok: true, templates: getAvailableTemplates() }, undefined);
  },

  /** Scaffold a full FSD project into a workspace */
  "republic.workspace.scaffold": ({ params, respond }) => {
    const p = params as
      | {
          projectId?: string;
          template?: string;
          projectName?: string;
          description?: string;
          features?: string[];
          citizenId?: string;
        }
      | undefined;
    if (!p?.projectId || !p?.template) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and template required"),
      );
      return;
    }
    const config: AppGenConfig = {
      template: p.template as AppTemplate,
      projectName: p.projectName ?? p.projectId,
      description: p.description ?? "",
      features: p.features,
    };
    generateProjectScaffold(p.projectId, config, p.citizenId ?? "system")
      .then((result) => respond(true, { ok: true, ...result }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  /** Add a new feature scaffold to an existing project */
  "republic.workspace.feature.add": ({ params, respond }) => {
    const p = params as
      | {
          projectId?: string;
          featureName?: string;
          template?: string;
          citizenId?: string;
        }
      | undefined;
    if (!p?.projectId || !p?.featureName) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and featureName required"),
      );
      return;
    }
    addFeatureToProject(
      p.projectId,
      p.featureName,
      (p.template as AppTemplate) ?? "react-supabase",
      p.citizenId ?? "system",
    )
      .then((result) => respond(true, { ok: true, ...result }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },
};
