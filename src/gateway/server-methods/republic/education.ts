/**
 * Republic Gateway Handlers — education
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

import type { CurriculumDomain, CurriculumSkill } from "../../../republic/types.js";
import type { GatewayRequestHandlers } from "../types.js";
// Phase 36: Dynamic Compute Scaling
import {
  autoFixIssues,
  clearActivePipelines,
  generateFileContent,
  generateProjectName,
  proposeInnovation,
  runQAValidation,
  seedStarterProjects,
} from "../../../republic/dev-orchestration.js";
// Phase 35: Docker Orchestration Engine
import { getActiveCourses, getCitizenCourses } from "../../../republic/education.js";
import { executeGSD, getActiveSessions, getGSDDiagnostics } from "../../../republic/gsd-pipeline.js";
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
import {
  getAllSemantic,
  getCollectiveMemory,
  getMemory,
  getRecentEpisodic,
  getRelationships,
} from "../../../republic/memory.js";
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import {
  getCitizenSkills,
  getDBDiagnostics,
  listProjects,
  listTasks,
  queryModelPerformance,
} from "../../../republic/republic-db.js";
import { getState } from "../../../republic/state.js";
import { composeTeam } from "../../../republic/team-composer.js";
import { rand, SKILL_TREES, ts, uid } from "../../../republic/utils.js";
import { archiveWorkspace } from "../../../republic/workspace-manager.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const educationHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Education ──────────────────────────────────────────────
  "republic.education.status": ({ respond }) => {
    const s = getState();
    const courses = getActiveCourses();
    const totalGraduations = s.totalGraduations ?? 0;
    // Map backend Course shape to UI Course shape
    const mapped = courses.map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      difficulty: c.difficulty,
      enrolled: c.students.length,
      maxEnrollment: c.capacity,
      teacherId: c.teacherId,
      duration: c.ticksRemaining,
    }));

    // Aggregrate curriculum data
    const curriculum: CurriculumDomain[] = [];
    for (const [domain, skills] of Object.entries(SKILL_TREES)) {
      const curriculumSkills: CurriculumSkill[] = [];
      for (const skill of skills) {
        let count = 0;
        for (const citizen of s.citizens) {
          if (citizen.skills.includes(skill)) {
            count++;
          }
        }
        curriculumSkills.push({ name: skill, citizenCount: count });
      }
      curriculum.push({ domain, skills: curriculumSkills });
    }

    respond(true, { courses: mapped, totalGraduations, curriculum }, undefined);
  },

  "republic.education.curriculum": ({ respond }) => {
    const s = getState();
    const curriculum: CurriculumDomain[] = [];
    for (const [domain, skills] of Object.entries(SKILL_TREES)) {
      const curriculumSkills: CurriculumSkill[] = [];
      for (const skill of skills) {
        let count = 0;
        for (const citizen of s.citizens) {
          if (citizen.skills.includes(skill)) {
            count++;
          }
        }
        curriculumSkills.push({ name: skill, citizenCount: count });
      }
      curriculum.push({ domain, skills: curriculumSkills });
    }
    respond(true, { curriculum }, undefined);
  },

  "republic.education.enroll": ({ params, respond }) => {
    const p = params as { citizenId?: string; courseId?: string } | undefined;
    if (!p?.citizenId || !p?.courseId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and courseId required"));
      return;
    }
    const courses = getActiveCourses();
    const course = courses.find((c) => c.id === p.courseId);
    if (!course) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Course not found"));
      return;
    }
    if (course.students.includes(p.citizenId)) {
      respond(true, { enrolled: true, message: "Already enrolled" }, undefined);
      return;
    }
    if (course.students.length >= course.capacity) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Course is full"));
      return;
    }
    course.students.push(p.citizenId);
    respond(true, { enrolled: true, courseId: course.id }, undefined);
  },

  "republic.education.citizen": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { courses: getCitizenCourses(p.citizenId) }, undefined);
  },

  // ─── Memory ─────────────────────────────────────────────────
  "republic.memory.citizen": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { memory: getMemory(p.citizenId) }, undefined);
  },

  "republic.memory.citizen.episodic": ({ params, respond }) => {
    const p = params as { citizenId?: string; count?: number } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { episodic: getRecentEpisodic(p.citizenId, p.count ?? 20) }, undefined);
  },

  "republic.memory.citizen.semantic": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { semantic: getAllSemantic(p.citizenId) }, undefined);
  },

  "republic.memory.citizen.relationships": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { relationships: getRelationships(p.citizenId) }, undefined);
  },

  "republic.memory.collective": ({ respond }) => {
    respond(true, { collective: getCollectiveMemory() }, undefined);
  },

  // ─── Republic DB ────────────────────────────────────────────
  "republic.db.projects": ({ params, respond }) => {
    const p = params as { status?: string } | undefined;
    respond(true, { projects: listProjects(p?.status) }, undefined);
  },

  "republic.db.tasks": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    respond(true, { tasks: listTasks(p?.projectId) }, undefined);
  },

  "republic.db.decisions": ({ params, respond }) => {
    const p = params as { toolName?: string; modelTier?: string; limit?: number } | undefined;
    respond(
      true,
      {
        performance: queryModelPerformance({
          toolName: p?.toolName,
          modelTier: p?.modelTier,
          limit: p?.limit,
        }),
      },
      undefined,
    );
  },

  "republic.db.skills": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { skills: getCitizenSkills(p.citizenId) }, undefined);
  },

  "republic.db.diagnostics": ({ respond }) => {
    respond(true, getDBDiagnostics(), undefined);
  },

  // ─── Dev Orchestration ──────────────────────────────────────
  "republic.dev.projects": ({ respond }) => {
    const s = getState();
    const projects = s.devProjects.map((p) => {
      // Defensive stack serialization — handles string, object, or null
      let stackLabel = "—";
      if (typeof p.stack === "string") {
        stackLabel = p.stack || "—";
      } else if (p.stack && typeof p.stack === "object") {
        const parts = [
          ...(Array.isArray(p.stack.languages) ? p.stack.languages : []),
          ...(Array.isArray(p.stack.frameworks) ? p.stack.frameworks : []),
          ...(Array.isArray(p.stack.databases) ? p.stack.databases : []),
        ].filter(Boolean);
        stackLabel = parts.length > 0 ? parts.join(", ") : "—";
      }

      // Fix legacy untitled names
      let name = p.name;
      if (!name || name === "untitled" || name === "Untitled") {
        name = generateProjectName(p.ownerName);
        p.name = name; // retroactively fix in state
      }

      // Auto-compose team if empty
      if (!p.team || p.team.length === 0) {
        p.team = composeTeam(s, p.projectType ?? "software", p.stack);
      }

      return {
        id: p.id,
        name,
        description: p.description,
        status: p.status,
        projectType: p.projectType ?? "software",
        phase: p.status,
        stack: stackLabel,
        ownerId: p.ownerId,
        ownerName: p.ownerName,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        filesWritten: p.files.length,
        testsWritten: p.tests?.total ?? 0,
        buildHealth: p.buildHealth,
        codeQuality: p.codeQuality,
        commitCount: p.commitCount,
        linesOfCode: p.linesOfCode,
        teamSize: p.team?.length ?? 0,
      };
    });

    const innovations = s.innovations.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      description: i.description,
      impact: i.impact,
      proposedBy: i.proposedBy,
      implemented: i.implemented,
    }));

    respond(
      true,
      {
        projects,
        innovations,
        totalProjects: projects.length,
        totalInnovations: innovations.length,
      },
      undefined,
    );
  },

  "republic.dev.project.status": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const s = getState();
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }

    // Defensive stack serialization
    let stackStr = "—";
    if (typeof project.stack === "string") {
      stackStr = project.stack || "—";
    } else if (project.stack && typeof project.stack === "object") {
      const parts = [
        ...(Array.isArray(project.stack.languages) ? project.stack.languages : []),
        ...(Array.isArray(project.stack.frameworks) ? project.stack.frameworks : []),
        ...(Array.isArray(project.stack.databases) ? project.stack.databases : []),
      ].filter(Boolean);
      stackStr = parts.length > 0 ? parts.join(", ") : "—";
    }

    // Auto-compose team if empty
    if (!project.team || project.team.length === 0) {
      project.team = composeTeam(s, project.projectType ?? "software", project.stack);
    }

    // Use actual project team members — enriched with live citizen state
    const assignedCitizens = (project.team ?? []).map((tm) => {
      const citizen = s.citizens.find((c) => c.id === tm.citizenId);
      return {
        id: tm.citizenId,
        name: tm.citizenName,
        role: tm.role,
        specialization: tm.specialization,
        activity: citizen?.activity ?? "Working",
        energy: citizen?.energy ?? 50,
      };
    });

    respond(
      true,
      {
        project: {
          id: project.id,
          name: project.name || generateProjectName(project.ownerName),
          description: project.description,
          status: project.status,
          projectType: project.projectType ?? "software",
          phase: project.status,
          stack: stackStr,
          stackDetail: project.stack,
          ownerId: project.ownerId,
          ownerName: project.ownerName,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          filesWritten: project.files.length,
          testsWritten: project.tests?.total ?? 0,
          testsPassed: project.tests?.passed ?? 0,
          testsFailed: project.tests?.failed ?? 0,
          testCoverage: project.tests?.coverage ?? 0,
          buildHealth: project.buildHealth,
          codeQuality: project.codeQuality,
          commitCount: project.commitCount,
          linesOfCode: project.linesOfCode,
          lastDeployedAt: project.lastDeployedAt,
          files: project.files.map((f) => ({
            path: f.path,
            language: f.language,
            linesOfCode: f.linesOfCode,
            lastModified: f.lastModified,
            quality: f.quality,
          })),
          deployments: project.deployments.map((d) => ({
            id: d.id,
            environment: d.environment,
            status: d.status,
            url: d.url,
            deployedAt: d.deployedAt,
            version: d.version,
          })),
          assignedCitizens,
        },
      },
      undefined,
    );
  },

  // ─── Project File Content ─────────────────────────────────────

  /** Get a single file's content from a project */
  "republic.dev.project.file": ({ params, respond }) => {
    const s = getState();
    const p = params as { projectId?: string; filePath?: string } | undefined;
    if (!p?.projectId || !p?.filePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and filePath required"),
      );
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }
    const file = project.files.find((f) => f.path === p.filePath);
    if (!file) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file not found"));
      return;
    }
    respond(
      true,
      {
        path: file.path,
        language: file.language,
        content: file.content ?? `// ${file.path}\n// No content generated\n`,
        linesOfCode: file.linesOfCode,
        quality: file.quality,
      },
      undefined,
    );
  },

  // ─── Project Download & Clear ────────────────────────────────

  /** Download all files for a project as JSON bundle */
  "republic.dev.project.download": ({ params, respond }) => {
    const s = getState();
    const projectId = params.projectId as string;
    const project = s.devProjects.find((p) => p.id === projectId);
    if (!project) {
      respond(false, undefined, { code: "-32001", message: "Project not found" });
      return;
    }

    const files = project.files.map((f) => ({
      path: f.path,
      language: f.language,
      content: f.content ?? `// ${f.path}\n// No content generated\n`,
    }));

    respond(
      true,
      {
        projectName: project.name,
        projectId: project.id,
        files,
        totalFiles: files.length,
        totalLOC: project.linesOfCode,
      },
      undefined,
    );
  },

  /** Clear all dev projects from state — safe cleanup */
  "republic.dev.project.clear": ({ respond }) => {
    const s = getState();
    const count = s.devProjects.length;

    // 1. Unassign citizens from projects
    for (const citizen of s.citizens) {
      const c = citizen as unknown as Record<string, unknown>;
      if (c.currentProjectId) {
        c.currentProjectId = null;
        c.currentTaskId = null;
      }
    }

    // 2. Archive workspace directories (fire-and-forget, non-blocking)
    for (const project of s.devProjects) {
      archiveWorkspace(project.id).catch(() => {
        /* noop — directory may not exist */
      });
    }

    // 3. Clear swarm objectives related to projects
    s.objectives = s.objectives.filter((obj) => !obj.description?.startsWith("Project:"));

    // 4. Clear active pipelines in dev-orchestration
    clearActivePipelines();

    // 5. Clear projects and innovations
    s.devProjects = [];
    s.innovations = [];

    // 6. Immediately seed starter projects so the page isn't blank
    const seeded = seedStarterProjects(s);

    respond(true, { cleared: count, citizensReleased: s.citizens.length, seeded }, undefined);
  },

  /** Manually ideate a new dev project with optional configuration */
  "republic.dev.project.ideate": async ({ params, respond }) => {
    const s = getState();
    if (s.citizens.length === 0) {
      respond(false, undefined, { code: "-32001", message: "No citizens available to assign" });
      return;
    }
    const config = params as
      | {
          projectType?: string;
          category?: string;
          templateId?: string;
          name?: string;
          description?: string;
          technologies?: string[];
          teamSize?: number;
          priority?: string;
          deadline?: string;
          scheduleAt?: string;
          autoAssign?: boolean;
          autoFix?: boolean;
        }
      | undefined;
    const { forceIdeateProject } = await import("../../../republic/dev-orchestration.js");
    const project = forceIdeateProject(s, config ?? undefined);
    if (!project) {
      respond(false, undefined, { code: "-32002", message: "Failed to ideate project" });
      return;
    }
    respond(true, { project }, undefined);
  },

  // ─── DevStudio: File Operations ───────────────────────────────

  /** Write or update a file in a project */
  "republic.dev.project.writeFile": ({ params, respond }) => {
    const s = getState();
    const p = params as
      | { projectId?: string; filePath?: string; content?: string; language?: string }
      | undefined;
    if (!p?.projectId || !p?.filePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and filePath required"),
      );
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }
    const content = p.content ?? "";
    const lines = content.split("\n").length;
    const ext = p.filePath.split(".").pop()?.toLowerCase() ?? "";
    const lang = p.language ?? ext;

    const existing = project.files.find((f) => f.path === p.filePath);
    if (existing) {
      existing.content = content;
      existing.linesOfCode = lines;
      existing.language = lang;
      existing.lastModified = ts();
      existing.quality = Math.min(1, (existing.quality ?? 0.5) + 0.05);
    } else {
      project.files.push({
        path: p.filePath,
        language: lang,
        linesOfCode: lines,
        lastModified: ts(),
        quality: 0.7,
        content,
      });
    }
    project.linesOfCode = project.files.reduce((sum, f) => sum + f.linesOfCode, 0);
    project.updatedAt = ts();

    respond(true, { path: p.filePath, linesOfCode: lines, updated: !!existing }, undefined);
  },

  /** Delete a file from a project */
  "republic.dev.project.deleteFile": ({ params, respond }) => {
    const s = getState();
    const p = params as { projectId?: string; filePath?: string } | undefined;
    if (!p?.projectId || !p?.filePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and filePath required"),
      );
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }
    const idx = project.files.findIndex((f) => f.path === p.filePath);
    if (idx === -1) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file not found"));
      return;
    }
    project.files.splice(idx, 1);
    project.linesOfCode = project.files.reduce((sum, f) => sum + f.linesOfCode, 0);
    project.updatedAt = ts();
    respond(true, { deleted: p.filePath, remainingFiles: project.files.length }, undefined);
  },

  /** Trigger build/QA validation on a project */
  "republic.dev.project.build": ({ params, respond }) => {
    const s = getState();
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }
    // runQAValidation / autoFixIssues imported statically at top of file
    const skillLevel = 0.7;
    const qa = runQAValidation(project, skillLevel);
    if (qa.autoFixable > 0) {
      autoFixIssues(project, qa, skillLevel);
    }
    project.buildHealth = qa.score;
    project.updatedAt = ts();
    respond(
      true,
      {
        passed: qa.passed,
        score: qa.score,
        issues: qa.issues.length,
        autoFixed: qa.autoFixable,
        buildHealth: project.buildHealth,
      },
      undefined,
    );
  },

  /** Start a dev server (simulated) for a project */
  "republic.dev.project.run": ({ params, respond }) => {
    const s = getState();
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }
    // Run QA validation first
    // runQAValidation / autoFixIssues imported statically at top of file
    const skillLevel = 0.7;
    const qa = runQAValidation(project, skillLevel);
    if (qa.autoFixable > 0) {
      autoFixIssues(project, qa, skillLevel);
    }
    project.buildHealth = qa.score;

    // Simulate test run
    const totalTests = project.tests?.total ?? Math.max(5, project.files.length * 2);
    const passRate = Math.min(1, skillLevel + rand(0, 20) / 100);
    const passed = Math.round(totalTests * passRate);
    const failed = totalTests - passed;
    project.tests = {
      total: totalTests,
      passed,
      failed,
      skipped: 0,
      coverage: Math.round(passRate * 85 + rand(0, 15)),
      lastRunAt: ts(),
    };

    // Set project as running
    project.status = "running" as typeof project.status;
    project.updatedAt = ts();

    // Simulated dev server info
    const port = 3000 + rand(0, 999);
    respond(
      true,
      {
        running: true,
        port,
        url: `http://localhost:${port}`,
        buildScore: Math.round(qa.score * 100),
        buildPassed: qa.passed,
        testResults: {
          total: totalTests,
          passed,
          failed,
          coverage: project.tests.coverage,
        },
        startedAt: ts(),
      },
      undefined,
    );
  },

  /** Deploy a project to an environment */
  "republic.dev.project.deploy": ({ params, respond }) => {
    const s = getState();
    const p = params as { projectId?: string; environment?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }
    // Quality gate — already imported: runQAValidation, autoFixIssues
    const skillLevel = 0.7;
    const qa = runQAValidation(project, skillLevel);
    if (qa.autoFixable > 0) {
      autoFixIssues(project, qa, skillLevel);
    }
    project.buildHealth = qa.score;

    if (qa.score < 0.5) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Deploy rejected: build health ${Math.round(qa.score * 100)}% is below the 50% threshold. Run Build first to fix issues.`,
        ),
      );
      return;
    }

    const env = (p.environment ?? "production") as "dev" | "staging" | "production";
    const version = `v${project.commitCount}.${project.deployments.length + 1}.0`;
    const deployId = uid();

    // Generate simulated deployment URL
    const slug = project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/, "");
    const urlMap = {
      dev: `https://${slug}-dev.republic.local`,
      staging: `https://${slug}-staging.republic.local`,
      production: `https://${slug}.republic.app`,
    };

    const deployment = {
      id: deployId,
      environment: env,
      status: "live" as const,
      url: urlMap[env],
      deployedAt: ts(),
      version,
    };

    project.deployments.push(deployment);
    project.lastDeployedAt = deployment.deployedAt;
    project.status = "deployed" as typeof project.status;
    project.updatedAt = ts();

    respond(
      true,
      {
        deployed: true,
        deployment,
        buildScore: Math.round(qa.score * 100),
        totalDeployments: project.deployments.length,
      },
      undefined,
    );
  },

  /** AI-driven development via citizen prompt */
  "republic.dev.project.prompt": async ({ params, respond }) => {
    const s = getState();
    const p = params as { projectId?: string; prompt?: string } | undefined;
    if (!p?.projectId || !p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and prompt required"),
      );
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }
    // generateFileContent and proposeInnovation are already statically imported above
    const ownerCitizen = s.citizens.find((c) => c.id === project.ownerId);

    // Generate an innovation proposal based on the prompt
    const innovation = proposeInnovation(
      project,
      ownerCitizen?.name ?? project.ownerName,
      ownerCitizen?.skills?.length ?? 5,
    );
    innovation.title = p.prompt.slice(0, 100);
    innovation.description = p.prompt;
    s.innovations.push(innovation);

    // Generate new file content based on prompt context
    const newPath = `src/ai-generated/${uid().slice(0, 8)}.ts`;
    const content = generateFileContent(newPath, "typescript", project.name);
    project.files.push({
      path: newPath,
      language: "typescript",
      linesOfCode: content.split("\n").length,
      lastModified: ts(),
      quality: 0.8,
      content,
    });
    project.linesOfCode = project.files.reduce((sum, f) => sum + f.linesOfCode, 0);
    project.commitCount += 1;
    project.updatedAt = ts();

    respond(
      true,
      {
        innovationId: innovation.id,
        generatedFile: newPath,
        linesGenerated: content.split("\n").length,
        prompt: p.prompt,
      },
      undefined,
    );
  },

  /** Get all project files for WebContainer/preview mounting */
  "republic.dev.project.bundle": ({ params, respond }) => {
    const s = getState();
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }
    const files: Record<string, string> = {};
    for (const f of project.files) {
      files[f.path] = f.content ?? `// ${f.path}\n`;
    }
    respond(
      true,
      {
        projectId: project.id,
        projectName: project.name,
        files,
        totalFiles: project.files.length,
        stack: project.stack,
      },
      undefined,
    );
  },

  // ─── GSD Pipeline ─────────────────────────────────────────────

  /** Execute the full GSD pipeline from a single prompt */
  "republic.dev.gsd": ({ params, respond }) => {
    const p = params as { prompt?: string; source?: string } | undefined;
    if (!p?.prompt?.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "prompt required"));
      return;
    }
    // executeGSD is statically imported from gsd-pipeline.js
    const session = executeGSD(p.prompt.trim(), (p.source ?? "webui") as "webui");
    respond(
      true,
      {
        sessionId: session.id,
        status: session.status,
        projectId: session.projectId,
        teamSize: session.teamMembers.length,
        team: session.teamMembers.map((m: Record<string, unknown>) => ({
          name: m.citizenName,
          specialization: m.specialization,
          role: m.role,
          tasksCompleted: m.tasksCompleted,
        })),
        tasks: session.tasks.length,
        filesGenerated: session.totalFilesGenerated,
        peerReviews: session.totalPeerReviews,
        autoFixes: session.totalAutoFixes,
         qualityScore: Math.round(session.qualityGate.overallScore * 100),
        timeline: session.timeline.slice(-20),
      },
      undefined,
    );
  },

  /** List active GSD sessions */
  "republic.dev.gsd.sessions": ({ respond }) => {
    // getActiveSessions and getGSDDiagnostics are statically imported from gsd-pipeline.js
    const sessions = getActiveSessions();
    respond(
      true,
      {
        sessions: sessions.map((s) => ({
          id: s.id,
          prompt: s.prompt.slice(0, 100),
          status: s.status,
          projectId: s.projectId,
          teamSize: s.teamMembers.length,
          qualityScore: Math.round((s.qualityGate.overallScore ?? 0) * 100),
          createdAt: s.createdAt,
          completedAt: s.completedAt,
        })),
        diagnostics: getGSDDiagnostics(),
      },
      undefined,
    );
  },

  /** Detect routes/pages from project files for preview dropdown */
  "republic.dev.project.routes": ({ params, respond }) => {
    const s = getState();
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const project = s.devProjects.find((dp) => dp.id === p.projectId);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "project not found"));
      return;
    }

    // Detect routes from file structure
    const routes: { path: string; label: string; filePath: string }[] = [];
    for (const file of project.files) {
      const fp = file.path.toLowerCase();
      // Next.js / React Router patterns
      if (fp.includes("page.") || fp.includes("index.") || fp.includes("route.")) {
        const segments = file.path.split("/");
        const routePath = "/" + segments.slice(1, -1).join("/");
        const label = segments[segments.length - 2] || "Home";
        routes.push({
          path: routePath === "/" ? "/" : routePath,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          filePath: file.path,
        });
      }
      // Explicit component pages
      if (fp.match(/\/(pages?|views?|screens?)\//)) {
        const name =
          file.path
            .split("/")
            .pop()
            ?.replace(/\.\w+$/, "") ?? "Page";
        routes.push({
          path: `/${name.toLowerCase()}`,
          label: name.charAt(0).toUpperCase() + name.slice(1),
          filePath: file.path,
        });
      }
    }

    // Always include root
    if (!routes.find((r) => r.path === "/")) {
      routes.unshift({ path: "/", label: "Home", filePath: "index.html" });
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = routes.filter((r) => {
      if (seen.has(r.path)) {
        return false;
      }
      seen.add(r.path);
      return true;
    });

    respond(true, { routes: unique, totalRoutes: unique.length }, undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Preview Engine RPCs
  // ═══════════════════════════════════════════════════════════════

  /** Start a preview session using the specified engine */
  "republic.preview.start": async ({ params, respond }) => {
    const p = params as { projectId?: string; engine?: string } | undefined;
    if (!p?.projectId || !p?.engine) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and engine required"),
      );
      return;
    }
    const validEngines = ["esm", "local", "webcontainer"];
    if (!validEngines.includes(p.engine)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `engine must be one of: ${validEngines.join(", ")}`),
      );
      return;
    }
    try {
      const { startPreview } = await import("../../../republic/preview-engine.js");
      const session = await startPreview(p.projectId, p.engine as "esm" | "local" | "webcontainer");
      respond(true, { session }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /** Stop a running preview session */
  "republic.preview.stop": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    void (async () => {
      try {
        const { stopPreview } = await import("../../../republic/preview-engine.js");
        const session = stopPreview(p.sessionId!);
        if (!session) {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
          return;
        }
        respond(true, { session }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    })();
  },

  /** Get status of a specific preview session */
  "republic.preview.status": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    void (async () => {
      try {
        const { getSession } = await import("../../../republic/preview-engine.js");
        const session = getSession(p.sessionId!);
        if (!session) {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
          return;
        }
        respond(true, { session }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    })();
  },

  /** List all preview sessions (optionally filter by projectId) */
  "republic.preview.sessions": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    void (async () => {
      try {
        const { getAllSessions, getProjectSessions } =
          await import("../../../republic/preview-engine.js");
        const sessions = p?.projectId ? getProjectSessions(p.projectId) : getAllSessions();
        respond(true, { sessions, total: sessions.length }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    })();
  },

  /** Get preview engine diagnostics and availability */
  "republic.preview.diagnostics": ({ respond }) => {
    void (async () => {
      try {
        const { getPreviewDiagnostics } = await import("../../../republic/preview-engine.js");
        const diagnostics = await getPreviewDiagnostics();
        respond(true, { diagnostics }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    })();
  },
};
