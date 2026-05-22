/**
 * Republic Platform — Project Team Orchestrator
 *
 * Manages the full autonomous project delivery lifecycle:
 * 1. Team Formation  — score citizens by specialization, assign roles
 * 2. Research Phase  — Lead Architect researches tech/design ideas
 * 3. Planning Phase  — ProjectPlan written to workspace
 * 4. Build Phase     — triggers CI/CD loop (→ project-ci-loop.ts)
 * 5. Change Requests — re-triggers fix loop from project chat messages
 * 6. Delivery        — transitions workspace to "delivered", sets preview URL
 *
 * Architecture: Manager/Supervisor + Loop pattern
 */

import type { Citizen, Specialization } from "./types.js";
import { emitNationalEvent } from "./event-sourcing.js";
import { getState } from "./state.js";
import { ts, uid } from "./utils.js";
import {
  getWorkspace,
  updateWorkspaceStatus,
  writeWorkspaceFile,
  readWorkspaceFile,
} from "./workspace-manager.js";

// Lazy import to avoid circular dependency
async function getCILoop() {
  return import("./project-ci-loop.js");
}

// ─── Team Role Types ─────────────────────────────────────────────

export type ProjectRole =
  | "lead_architect"
  | "frontend_dev"
  | "backend_dev"
  | "qa_engineer"
  | "ux_designer"
  | "devops"
  | "researcher"
  | "fullstack_dev";

export interface ProjectTeamMember {
  citizenId: string;
  citizenName: string;
  role: ProjectRole;
  specialization: Specialization;
  skillLevel: number; // 0-1
  intelligence: number; // 0-200
  currentTask: string | null;
  completedTasks: string[];
  joinedAt: string;
}

export interface ProjectTeam {
  projectId: string;
  projectName: string;
  members: ProjectTeamMember[];
  leadArchitectId: string;
  researchNotes: string[];
  projectPlan: string | null;
  chatHistory: ProjectChatMessage[];
  buildAttempts: number;
  lastBuildStatus: "pending" | "building" | "passed" | "failed";
  qaScore: number; // 0-1
  createdAt: string;
  updatedAt: string;
}

export interface ProjectChatMessage {
  id: string;
  sender: "user" | "citizen";
  senderId: string;
  senderName: string;
  content: string;
  role?: ProjectRole;
  timestamp: string;
  isChangeRequest?: boolean;
}

// ─── In-memory team registry ──────────────────────────────────────

const activeTeams = new Map<string, ProjectTeam>();

export function getProjectTeam(projectId: string): ProjectTeam | undefined {
  return activeTeams.get(projectId);
}

export function getAllActiveTeams(): ProjectTeam[] {
  return Array.from(activeTeams.values());
}

// ─── Role-to-Specialization matching ─────────────────────────────

const ROLE_SPECIALIZATIONS: Record<ProjectRole, string[]> = {
  lead_architect: ["Software Architecture", "Full-Stack Development", "Engineering"],
  frontend_dev: ["Frontend Development", "UI/UX Design", "React Development", "Web Development"],
  backend_dev: ["Backend Development", "API Development", "Database Engineering", "DevOps"],
  qa_engineer: ["Quality Assurance", "Testing", "Software Testing", "QA Engineering"],
  ux_designer: ["UI/UX Design", "Product Design", "Graphic Design"],
  devops: ["DevOps", "System Administration", "Cloud Engineering", "Infrastructure"],
  researcher: ["Research", "Data Science", "AI Research"],
  fullstack_dev: ["Full-Stack Development", "Software Engineering"],
};

function scoreForRole(citizen: Citizen, role: ProjectRole): number {
  const specs = ROLE_SPECIALIZATIONS[role];
  const spec = citizen.specialization ?? "";
  const specializationMatch = specs.some(
    (s) =>
      spec.toLowerCase().includes(s.toLowerCase().split(" ")[0] ?? "") ||
      s.toLowerCase().includes(spec.toLowerCase().split(" ")[0] ?? ""),
  )
    ? 0.6
    : 0;

  const iq = ((citizen.intelligence ?? 100) / 200) * 0.25;
  const skill = (Math.min(citizen.skills?.length ?? 0, 20) / 20) * 0.15;
  return specializationMatch + iq + skill;
}

// ─── Team Formation ───────────────────────────────────────────────

export function assembleProjectTeam(
  projectId: string,
  projectName: string,
  _projectDescription: string,
): ProjectTeam {
  const state = getState();
  const availableCitizens = state.citizens.filter(
    (c) => (c.energy ?? 50) > 20 && (c.health ?? 50) > 10,
  );

  const assigned = new Set<string>();
  const members: ProjectTeamMember[] = [];

  const REQUIRED_ROLES: ProjectRole[] = [
    "lead_architect",
    "frontend_dev",
    "backend_dev",
    "qa_engineer",
    "ux_designer",
  ];

  for (const role of REQUIRED_ROLES) {
    const candidates = availableCitizens
      .filter((c) => !assigned.has(c.id))
      .map((c) => ({ citizen: c, score: scoreForRole(c, role) }))
      .toSorted((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best) {
      continue;
    }

    assigned.add(best.citizen.id);
    members.push({
      citizenId: best.citizen.id,
      citizenName: best.citizen.name,
      role,
      specialization: best.citizen.specialization,
      skillLevel: Math.min(1, (best.citizen.skills?.length ?? 0) / 20),
      intelligence: best.citizen.intelligence ?? 100,
      currentTask: null,
      completedTasks: [],
      joinedAt: ts(),
    });
  }

  if (members.length === 0) {
    // Fallback: create a virtual team member if no citizens available
    members.push({
      citizenId: "system-architect",
      citizenName: "System Architect",
      role: "lead_architect",
      specialization: "Software Architecture" as Specialization,
      skillLevel: 1,
      intelligence: 150,
      currentTask: null,
      completedTasks: [],
      joinedAt: ts(),
    });
  }

  // Highest IQ member becomes lead
  const lead = members.reduce(
    (best, m) => (m.intelligence > best.intelligence ? m : best),
    members[0],
  );
  lead.role = "lead_architect";

  const team: ProjectTeam = {
    projectId,
    projectName,
    members,
    leadArchitectId: lead.citizenId,
    researchNotes: [],
    projectPlan: null,
    chatHistory: [],
    buildAttempts: 0,
    lastBuildStatus: "pending",
    qaScore: 0,
    createdAt: ts(),
    updatedAt: ts(),
  };

  activeTeams.set(projectId, team);
  void _persistTeamToWorkspace(projectId, team);

  emitNationalEvent("technology", "dev.team.assembled", "project-team-orchestrator", {
    projectId,
    teamSize: members.length,
    projectName,
  });

  return team;
}

// ─── Research Phase ───────────────────────────────────────────────

export async function runResearchPhase(
  projectId: string,
  projectDescription: string,
): Promise<string[]> {
  const team = activeTeams.get(projectId);
  if (!team) {
    return [];
  }

  const lead = team.members.find((m) => m.role === "lead_architect");
  if (!lead) {
    return [];
  }

  lead.currentTask = "Researching technologies and design inspiration";

  const notes: string[] = [
    `[Tech Stack Research]\nFor "${projectDescription.slice(0, 80)}":\nRecommended: React 19 + Vite 6 + TypeScript 5 + Tailwind CSS v4 + Supabase. For 3D: @react-three/fiber + @react-three/rapier + @react-three/postprocessing + gsap. Backend: Fastify 5 + Drizzle ORM + Zod.`,
    `[Design Inspiration]\nModern trends 2025: glassmorphism, gradient mesh backgrounds, animated micro-interactions, dark mode first, Inter/Outfit typography, 60fps micro-animations. Key: visual hierarchy, generous whitespace, smooth transitions.`,
    `[Architecture Patterns]\nFeature-based folder structure. Zustand for UI state. React Query for server state. Custom hooks for all data fetching. Error boundaries on async components. Path aliases in tsconfig. Barrel exports per feature folder.`,
  ];

  team.researchNotes = notes;
  team.updatedAt = ts();

  await writeWorkspaceFile({
    projectId,
    relativePath: "RESEARCH.md",
    content: `# Research Notes\n\n*Lead: ${lead.citizenName}*\n\n${notes.join("\n\n---\n\n")}`,
    language: "markdown",
    citizenId: lead.citizenId,
  });

  lead.currentTask = null;
  lead.completedTasks.push("Research phase");

  emitNationalEvent("technology", "dev.research.complete", "project-team-orchestrator", {
    projectId,
    noteCount: notes.length,
  });

  return notes;
}

// ─── Planning Phase ───────────────────────────────────────────────

export async function runPlanningPhase(
  projectId: string,
  projectDescription: string,
  _framework: string,
): Promise<string> {
  const team = activeTeams.get(projectId);
  if (!team) {
    return "";
  }

  const lead = team.members.find((m) => m.role === "lead_architect");
  if (!lead) {
    return "";
  }

  lead.currentTask = "Writing project plan and assigning tasks";

  const memberLines = team.members
    .map(
      (m) =>
        `### ${m.citizenName} — ${m.role.replace(/_/g, " ").toUpperCase()}\n` +
        `- Specialization: ${m.specialization}`,
    )
    .join("\n\n");

  const taskAssignments = team.members
    .map((m) => {
      const tasks = getTasksForRole(m.role, projectDescription);
      return `**${m.citizenName}** (${m.role.replace(/_/g, " ")}):\n${tasks.map((t) => `- [ ] ${t}`).join("\n")}`;
    })
    .join("\n\n");

  const plan = [
    `# Project Plan: ${team.projectName}`,
    `**Lead:** ${lead.citizenName} | **Date:** ${ts()}`,
    `**Description:** ${projectDescription}`,
    ``,
    `## Team`,
    memberLines,
    ``,
    `## Tasks`,
    taskAssignments,
    ``,
    `## Stack`,
    `React 19 + Vite + TypeScript + Tailwind v4 | Zustand + React Query | Fastify + Drizzle + Supabase`,
  ].join("\n");

  team.projectPlan = plan;
  team.updatedAt = ts();

  await writeWorkspaceFile({
    projectId,
    relativePath: "PROJECT_PLAN.md",
    content: plan,
    language: "markdown",
    citizenId: lead.citizenId,
  });

  for (const m of team.members) {
    const tasks = getTasksForRole(m.role, projectDescription);
    m.currentTask = tasks[0] ?? null;
  }

  lead.currentTask = null;
  lead.completedTasks.push("Planning phase");

  emitNationalEvent("technology", "dev.planning.complete", "project-team-orchestrator", {
    projectId,
  });

  return plan;
}

function getTasksForRole(role: ProjectRole, description: string): string[] {
  const is3D = /3d|game|three|canvas|webgl/i.test(description);

  const taskMap: Record<ProjectRole, string[]> = {
    lead_architect: [
      "Design architecture and file structure",
      "Review all code before final build",
      "Ensure code quality",
    ],
    frontend_dev: is3D
      ? [
          "Implement R3F Canvas with renderer config",
          "Build 3D scene (environment, lighting, postprocessing)",
          "Implement player controls with useFrame",
          "Create HUD overlay components",
        ]
      : [
          "Implement all page components with real data",
          "Build reusable UI component library",
          "Add Framer Motion animations",
        ],
    backend_dev: [
      "Implement API endpoints with validation",
      "Set up DB schema and migrations",
      "Write Dockerfile",
    ],
    qa_engineer: [
      "Write tests and verify build",
      "Test user flows and edge cases",
      "Report quality metrics",
    ],
    ux_designer: [
      "Design color system and typography",
      "Create CSS animations",
      "Ensure dark mode",
    ],
    devops: ["Configure build pipeline", "Set up Docker Compose", "Configure env vars"],
    researcher: ["Research best practices", "Evaluate npm packages"],
    fullstack_dev: ["Connect frontend to backend", "Write API client code", "Ensure type safety"],
  };

  return taskMap[role] ?? ["Contribute to project"];
}

// ─── Full Autonomous Build ────────────────────────────────────────

export async function startAutonomousBuild(
  projectId: string,
  projectDescription: string,
  framework: string,
): Promise<void> {
  let team = activeTeams.get(projectId);
  const ws = getWorkspace(projectId);

  if (!ws) {
    console.warn(`[Orchestrator] No workspace for project ${projectId}`);
    return;
  }

  if (!team) {
    team = assembleProjectTeam(projectId, ws.name, projectDescription);
  }

  try {
    await updateWorkspaceStatus(projectId, "planning");
    await runResearchPhase(projectId, projectDescription);
    await runPlanningPhase(projectId, projectDescription, framework);

    // Phase 2.5: Scaffold — generate FSD project structure if workspace is empty
    if ((ws.fileCount ?? 0) === 0) {
      try {
        const { generateProjectScaffold } = await import("./app-generation-engine.js");
        const template = /api|backend|server|fastify/.test(framework.toLowerCase())
          ? "api-service"
          : /supabase|fullstack|full.?stack/.test(framework.toLowerCase())
            ? "react-supabase"
            : "react-spa";
        await generateProjectScaffold(
          projectId,
          {
            template: template as "react-supabase" | "react-spa" | "api-service",
            projectName: ws.name,
            description: projectDescription,
          },
          team.leadArchitectId,
        );
        emitNationalEvent("technology", "dev.scaffold.complete", "project-team-orchestrator", {
          projectId,
          template,
        });
      } catch (scaffoldErr) {
        console.warn(`[Orchestrator] Scaffold failed for ${projectId}, continuing:`, scaffoldErr);
      }
    }

    await updateWorkspaceStatus(projectId, "active");

    team.lastBuildStatus = "building";
    team.buildAttempts += 1;
    team.updatedAt = ts();

    const { runBuildLoop, runQAPass, publishToProductions } = await getCILoop();
    const buildResult = await runBuildLoop(projectId, team);

    if (buildResult.success) {
      team.lastBuildStatus = "passed";
      const qaScore = await runQAPass(projectId, team);
      team.qaScore = qaScore;
      await publishToProductions(projectId, team);

      emitNationalEvent("technology", "dev.delivery.complete", "project-team-orchestrator", {
        projectId,
        qaScore,
        projectName: ws.name,
      });
    } else {
      team.lastBuildStatus = "failed";
      emitNationalEvent("technology", "dev.build.failed", "project-team-orchestrator", {
        projectId,
        attempts: team.buildAttempts,
      });
    }
  } catch (err) {
    console.error(`[Orchestrator] Error in build for ${projectId}:`, err);
  }

  team.updatedAt = ts();
  void _persistTeamToWorkspace(projectId, team);
}

// ─── Project Chat / Change Requests ──────────────────────────────

export async function onProjectChatMessage(
  projectId: string,
  message: string,
  userId: string,
  userName: string,
): Promise<{ reply: string; assignedTo: string | null }> {
  let team = activeTeams.get(projectId);
  const ws = getWorkspace(projectId);

  if (!ws) {
    return { reply: "Project not found.", assignedTo: null };
  }

  if (!team) {
    team = assembleProjectTeam(projectId, ws.name, ws.description ?? "");
  }

  const userMsg: ProjectChatMessage = {
    id: uid(),
    sender: "user",
    senderId: userId,
    senderName: userName,
    content: message,
    timestamp: ts(),
    isChangeRequest: false,
  };
  team.chatHistory.push(userMsg);

  const isChangeRequest = /add|change|fix|update|remove|implement|create|build|make|improve/i.test(
    message,
  );
  const isQuestion = /\?|what|how|why|explain|tell me|describe/i.test(message);

  let reply: string;
  let assignedTo: string | null = null;

  if (isQuestion) {
    const lead = team.members.find((m) => m.role === "lead_architect");
    assignedTo = lead?.citizenId ?? null;
    reply = lead
      ? `${lead.citizenName} here! "${ws.name}" has ${ws.fileCount} files. ${generateAnswer(message, ws.name)}`
      : `The team is reviewing your question.`;
  } else if (isChangeRequest) {
    const assignee = routeChangeRequest(message, team);
    assignedTo = assignee?.citizenId ?? null;
    reply = assignee
      ? `Got it! ${assignee.citizenName} (${assignee.role.replace(/_/g, " ")}) is on it: "${message.slice(0, 80)}...". Rebuild will auto-trigger.`
      : `Request noted! The team will handle it shortly.`;

    if (assignee) {
      assignee.currentTask = message;
      void triggerIncrementalChange(projectId, message, assignee, team);
    }
  } else {
    const lead = team.members.find((m) => m.role === "lead_architect") ?? team.members[0];
    assignedTo = lead?.citizenId ?? null;
    reply = lead
      ? `${lead.citizenName} here. Noted! What would you like us to change or build?`
      : "Message received! Let us know if you'd like any changes.";
  }

  const citizen = team.members.find((m) => m.citizenId === assignedTo) ?? team.members[0];
  team.chatHistory.push({
    id: uid(),
    sender: "citizen",
    senderId: citizen?.citizenId ?? "system",
    senderName: citizen?.citizenName ?? "Team",
    content: reply,
    role: citizen?.role,
    timestamp: ts(),
    isChangeRequest,
  });

  team.updatedAt = ts();
  void _persistChatToWorkspace(projectId, team);

  return { reply, assignedTo };
}

function routeChangeRequest(message: string, team: ProjectTeam): ProjectTeamMember | null {
  if (/3d|scene|mesh|physics|particle|shader|canvas/i.test(message)) {
    return team.members.find((m) => m.role === "frontend_dev") ?? team.members[0] ?? null;
  }
  if (/api|database|endpoint|auth|backend|server|route/i.test(message)) {
    return team.members.find((m) => m.role === "backend_dev") ?? team.members[0] ?? null;
  }
  if (/design|color|animation|css|style|font|layout|ui|ux/i.test(message)) {
    return (
      team.members.find((m) => m.role === "ux_designer") ??
      team.members.find((m) => m.role === "frontend_dev") ??
      null
    );
  }
  if (/test|bug|fix|error|crash|qa/i.test(message)) {
    return team.members.find((m) => m.role === "qa_engineer") ?? null;
  }
  return (
    team.members.find((m) => m.role === "lead_architect") ??
    team.members.find((m) => m.role === "frontend_dev") ??
    null
  );
}

function generateAnswer(message: string, projectName: string): string {
  if (/run|start|launch/i.test(message)) {
    return `To run: \`npm install && npm run dev\`. Check the Live Preview tab!`;
  }
  if (/stack|technology|framework/i.test(message)) {
    return `"${projectName}" uses React 19 + Vite 6 + TypeScript 5 + Tailwind CSS v4.`;
  }
  return `Happy to help! What would you like to know or change?`;
}

async function triggerIncrementalChange(
  projectId: string,
  changeRequest: string,
  assignee: ProjectTeamMember,
  team: ProjectTeam,
): Promise<void> {
  try {
    await updateWorkspaceStatus(projectId, "active");
    team.lastBuildStatus = "building";
    team.buildAttempts += 1;

    const { runBuildLoop, publishToProductions } = await getCILoop();
    const result = await runBuildLoop(projectId, team, 3);

    if (result.success) {
      team.lastBuildStatus = "passed";
      await publishToProductions(projectId, team);
      team.chatHistory.push({
        id: uid(),
        sender: "citizen",
        senderId: assignee.citizenId,
        senderName: assignee.citizenName,
        content: `✅ Done! "${changeRequest.slice(0, 80)}" implemented. Preview refreshed!`,
        role: assignee.role,
        timestamp: ts(),
      });
      assignee.currentTask = null;
      assignee.completedTasks.push(changeRequest.slice(0, 60));
    } else {
      team.chatHistory.push({
        id: uid(),
        sender: "citizen",
        senderId: assignee.citizenId,
        senderName: assignee.citizenName,
        content: `⚠️ Hit some build errors. QA engineer is reviewing — will be fixed shortly.`,
        role: assignee.role,
        timestamp: ts(),
      });
    }

    team.updatedAt = ts();
    void _persistChatToWorkspace(projectId, team);
  } catch (err) {
    console.error(`[Orchestrator] Error in incremental change for ${projectId}:`, err);
  }
}

// ─── Persistence ──────────────────────────────────────────────────

async function _persistTeamToWorkspace(projectId: string, team: ProjectTeam): Promise<void> {
  try {
    await writeWorkspaceFile({
      projectId,
      relativePath: ".hoc/team.json",
      content: JSON.stringify({ ...team, chatHistory: undefined }),
      language: "json",
      citizenId: team.leadArchitectId,
    });
  } catch {
    /* non-critical */
  }
}

async function _persistChatToWorkspace(projectId: string, team: ProjectTeam): Promise<void> {
  try {
    await writeWorkspaceFile({
      projectId,
      relativePath: ".hoc/chat-history.json",
      content: JSON.stringify(team.chatHistory.slice(-200)),
      language: "json",
      citizenId: team.leadArchitectId,
    });
  } catch {
    /* non-critical */
  }
}

export async function loadTeamFromWorkspace(projectId: string): Promise<void> {
  try {
    const raw = await readWorkspaceFile(projectId, ".hoc/team.json");
    if (raw) {
      const team = JSON.parse(raw) as ProjectTeam;
      // Re-load chat history separately
      try {
        const chatRaw = await readWorkspaceFile(projectId, ".hoc/chat-history.json");
        if (chatRaw) {
          team.chatHistory = JSON.parse(chatRaw) as ProjectChatMessage[];
        }
      } catch {
        team.chatHistory = [];
      }
      activeTeams.set(projectId, team);
    }
  } catch {
    /* workspace may not have team data yet */
  }
}
