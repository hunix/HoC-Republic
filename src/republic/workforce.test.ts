/**
 * Republic Autonomous Workforce — Integration Tests
 *
 * Tests for Phases 2-5: Workspace Manager, Real Execution Bridge,
 * Project Intake, Delegation, Progress Reporter, Republic DB.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  classifyIntent,
  decomposeProject,
} from "./project-intake.js";
import {
  formTeam,
  delegateTasks,
  submitForReview,
  getDelegationDiagnostics,
} from "./delegation.js";
import {
  reportProjectStarted,
  reportTasksCreated,
  reportProjectDelivered,
  getProgressEvents,
  generateStatusSummary,
  onProgress,
} from "./progress-reporter.js";
import {
  insertProject,
  getProject,
  updateProject,
  listProjects,
  recordModelDecision,
  queryModelPerformance,
  addCitizenSkill,
  getCitizenSkills,
  decaySkills,
  recordEducation,
  getCitizenEducation,
  exportDB,
  importDB,
  clearDB,
  getDBDiagnostics,
} from "./republic-db.js";
import {
  exportWorkspaceState,
  importWorkspaceState,
} from "./workspace-manager.js";
import {
  executeToolAction,
  getExecutionDiagnostics,
} from "./real-execution.js";
import type { Citizen } from "./types.js";

// ─── Test Helpers ───────────────────────────────────────────────

function makeCitizen(overrides: Partial<Citizen> = {}): Citizen {
  return {
    id: "c1",
    name: "Luna Starweaver",
    generation: 1,
    specialization: "Developer",
    activity: "Working",
    energy: 80,
    happiness: 75,
    health: 90,
    credits: 5000,
    age: 25,
    skillCount: 3,
    skills: ["algorithms", "debugging", "code review"],
    familySize: 0,
    ...overrides,
  };
}

function makeTeamPool(): Citizen[] {
  return [
    makeCitizen({ id: "pm1", name: "Sage Planner", specialization: "Planner", skillCount: 5 }),
    makeCitizen({ id: "arch1", name: "Atlas Architect", specialization: "Architect", skillCount: 4 }),
    makeCitizen({ id: "dev1", name: "Luna Developer", specialization: "Developer", skillCount: 3 }),
    makeCitizen({ id: "dev2", name: "Nova Coder", specialization: "Engineer", skillCount: 3 }),
    makeCitizen({ id: "artist1", name: "Iris Designer", specialization: "Artist", skillCount: 2 }),
    makeCitizen({ id: "qa1", name: "Raven Analyst", specialization: "Analyst", skillCount: 4 }),
    makeCitizen({ id: "writer1", name: "Echo Writer", specialization: "Writer", skillCount: 2 }),
  ];
}

// ─── Phase 3: Project Intake ────────────────────────────────────

describe("Project Intake Gateway", () => {
  describe("classifyIntent", () => {
    it("detects website requests", () => {
      const result = classifyIntent("Build me a landing page for my bakery");
      expect(result.isProject).toBe(true);
      expect(result.projectType).toBe("website");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("detects web app requests", () => {
      const result = classifyIntent("I need a dashboard for monitoring sales data");
      expect(result.isProject).toBe(true);
      expect(result.projectType).toBe("web_app");
    });

    it("detects API requests", () => {
      const result = classifyIntent("Create a REST API for managing inventory");
      expect(result.isProject).toBe(true);
      expect(result.projectType).toBe("api");
    });

    it("detects design requests", () => {
      const result = classifyIntent("Design a logo for my company");
      expect(result.isProject).toBe(true);
      expect(result.projectType).toBe("design");
    });

    it("rejects short messages", () => {
      const result = classifyIntent("hi");
      expect(result.isProject).toBe(false);
      expect(result.reason).toContain("too short");
    });

    it("rejects greetings", () => {
      const result = classifyIntent("Hello there, how are you?");
      expect(result.isProject).toBe(false);
    });

    it("rejects status inquiries", () => {
      const result = classifyIntent("What's the status on the project?");
      expect(result.isProject).toBe(false);
    });
  });

  describe("decomposeProject", () => {
    it("generates website tasks", () => {
      const breakdown = decomposeProject({
        projectType: "website",
        description: "Landing page for bakery",
        projectId: "test-project",
      });
      expect(breakdown.tasks.length).toBeGreaterThan(5);
      expect(breakdown.totalEstimatedHours).toBeGreaterThan(0);
      expect(breakdown.specialistsNeeded.length).toBeGreaterThan(2);
    });

    it("generates web app tasks", () => {
      const breakdown = decomposeProject({
        projectType: "web_app",
        description: "SaaS dashboard",
        projectId: "test-project",
      });
      expect(breakdown.tasks.length).toBeGreaterThan(7);
      expect(breakdown.specialistsNeeded).toContain("Developer");
    });

    it("generates API tasks", () => {
      const breakdown = decomposeProject({
        projectType: "api",
        description: "REST API",
        projectId: "test-project",
      });
      expect(breakdown.tasks.length).toBeGreaterThanOrEqual(4);
    });

    it("sets correct task priorities", () => {
      const breakdown = decomposeProject({
        projectType: "website",
        description: "Test",
        projectId: "test-project",
      });
      const criticalTasks = breakdown.tasks.filter((t) => t.priority === "critical");
      expect(criticalTasks.length).toBeGreaterThan(0);
    });
  });
});

// ─── Phase 4: Delegation ───────────────────────────────────────

describe("Hierarchical Delegation", () => {
  it("forms a team with PM and Tech Lead", () => {
    const pool = makeTeamPool();
    const team = formTeam({
      projectId: "delegation-test",
      availableCitizens: pool,
      requiredSpecializations: ["Developer", "Artist", "Writer"],
    });

    expect(team.pm).not.toBeNull();
    expect(team.techLead).not.toBeNull();
    expect(team.members.length).toBeGreaterThanOrEqual(4);
  });

  it("assigns PM role to Planner-specialized citizen", () => {
    const pool = makeTeamPool();
    const team = formTeam({
      projectId: "pm-test",
      availableCitizens: pool,
      requiredSpecializations: ["Developer"],
    });

    expect(team.pm?.specialization).toBe("Planner");
  });

  it("delegates tasks to matching specialists", () => {
    const pool = makeTeamPool();
    const _team = formTeam({
      projectId: "task-delegation-test",
      availableCitizens: pool,
      requiredSpecializations: ["Developer", "Artist"],
    });

    const tasks = decomposeProject({
      projectType: "website",
      description: "Test",
      projectId: "task-delegation-test",
    }).tasks;

    const decisions = delegateTasks("task-delegation-test", tasks);
    expect(decisions.length).toBeGreaterThan(0);
  });

  it("submits tasks for review", () => {
    const pool = makeTeamPool();
    formTeam({
      projectId: "review-test",
      availableCitizens: pool,
      requiredSpecializations: ["Developer"],
    });

    const result = submitForReview({
      projectId: "review-test",
      taskId: "test-task-1",
      output: "x".repeat(500), // Moderate size output
    });

    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThan(0);
  });

  it("tracks delegation diagnostics", () => {
    const diag = getDelegationDiagnostics();
    expect(diag.totalTeams).toBeGreaterThan(0);
    expect(diag.totalMembers).toBeGreaterThan(0);
  });
});

// ─── Phase 4: Progress Reporter ────────────────────────────────

describe("Progress Reporter", () => {
  it("emits project started event", () => {
    const event = reportProjectStarted({
      id: "intake-test",
      source: "webui",
      userId: "user1",
      message: "Build me a todo app",
      timestamp: new Date().toISOString(),
      status: "assigned",
      projectType: "web_app",
      confidence: 0.85,
      projectId: "prj-test",
      pmCitizenId: "pm1",
    });

    expect(event.type).toBe("project_started");
    expect(event.message).toContain("Project started");
  });

  it("emits tasks created event", () => {
    const breakdown = decomposeProject({
      projectType: "website",
      description: "Test",
      projectId: "progress-test",
    });

    const event = reportTasksCreated("progress-test", breakdown);
    expect(event.message).toContain("Tasks created");
    expect(event.details.taskCount).toBeGreaterThan(0);
  });

  it("emits project delivered event", () => {
    const event = reportProjectDelivered("prj-test", "Todo App");
    expect(event.type).toBe("project_delivered");
    expect(event.message).toContain("Project delivered");
  });

  it("supports event subscription", () => {
    const events: string[] = [];
    const unsub = onProgress((e) => { events.push(e.type); });

    reportProjectDelivered("sub-test", "Test Project");
    expect(events).toContain("project_delivered");

    unsub();
    reportProjectDelivered("sub-test-2", "Second Test");
    expect(events.length).toBe(1); // No new events after unsubscribe
  });

  it("generates status summary", () => {
    const tasks = decomposeProject({
      projectType: "website",
      description: "Test",
      projectId: "summary-test",
    }).tasks;

    const summary = generateStatusSummary("summary-test", tasks);
    expect(summary).toContain("Project Status");
    expect(summary).toContain("Progress:");
  });

  it("tracks event history", () => {
    const events = getProgressEvents(undefined, 5);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ─── Phase 5: Republic DB ──────────────────────────────────────

describe("Republic DB Persistence", () => {
  beforeEach(() => {
    clearDB();
  });

  describe("Projects", () => {
    it("inserts and retrieves projects", () => {
      const project = insertProject({
        name: "Test Project",
        status: "planning",
        objective: "Build a todo app",
        projectType: "web_app",
        source: "webui",
        userId: "user1",
        pmCitizenId: "pm1",
        fileCount: 0,
        totalSizeBytes: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deliveredAt: null,
      });

      expect(project.id).toBeTruthy();
      expect(getProject(project.id)?.name).toBe("Test Project");
    });

    it("updates project status", () => {
      const project = insertProject({
        name: "Update Test",
        status: "planning",
        objective: "Test",
        projectType: "general",
        source: "api",
        userId: "u1",
        pmCitizenId: null,
        fileCount: 0,
        totalSizeBytes: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deliveredAt: null,
      });

      updateProject(project.id, { status: "active" });
      expect(getProject(project.id)?.status).toBe("active");
    });

    it("lists projects by status", () => {
      insertProject({
        name: "Active 1", status: "active", objective: "T", projectType: "general",
        source: "api", userId: "u1", pmCitizenId: null, fileCount: 0,
        totalSizeBytes: 0, createdAt: "", updatedAt: "", deliveredAt: null,
      });
      insertProject({
        name: "Planning 1", status: "planning", objective: "T", projectType: "general",
        source: "api", userId: "u2", pmCitizenId: null, fileCount: 0,
        totalSizeBytes: 0, createdAt: "", updatedAt: "", deliveredAt: null,
      });

      expect(listProjects("active").length).toBe(1);
      expect(listProjects().length).toBe(2);
    });
  });

  describe("Model Decision Tracking", () => {
    it("records and queries model performance", () => {
      recordModelDecision({
        taskType: "code",
        toolName: "write_code",
        modelId: "gpt-5",
        modelTier: "standard",
        qualityScore: 0.85,
        latencyMs: 1200,
        estimatedCost: 0.003,
        citizenSpecialization: "Developer",
        citizenSkillLevel: 60,
        wasCouncilVote: false,
        timestamp: new Date().toISOString(),
      });

      recordModelDecision({
        taskType: "code",
        toolName: "write_code",
        modelId: "claude-sonnet",
        modelTier: "standard",
        qualityScore: 0.9,
        latencyMs: 1500,
        estimatedCost: 0.004,
        citizenSpecialization: "Developer",
        citizenSkillLevel: 60,
        wasCouncilVote: false,
        timestamp: new Date().toISOString(),
      });

      const perf = queryModelPerformance({ toolName: "write_code" });
      expect(perf.count).toBe(2);
      expect(perf.averageQuality).toBeGreaterThan(0.8);
      expect(perf.bestModel).toBe("claude-sonnet");
    });
  });

  describe("Citizen Skills", () => {
    it("adds and retrieves skills", () => {
      addCitizenSkill({
        citizenId: "c1",
        skill: "React",
        proficiency: 0.6,
        source: "project",
        learnedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        useCount: 1,
      });

      const skills = getCitizenSkills("c1");
      expect(skills.length).toBe(1);
      expect(skills[0].skill).toBe("React");
    });

    it("increments proficiency for existing skills", () => {
      addCitizenSkill({
        citizenId: "c1",
        skill: "TypeScript",
        proficiency: 0.5,
        source: "project",
        learnedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        useCount: 1,
      });

      // Adding same skill again should increase proficiency
      addCitizenSkill({
        citizenId: "c1",
        skill: "TypeScript",
        proficiency: 0.3,
        source: "project",
        learnedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        useCount: 1,
      });

      const skills = getCitizenSkills("c1");
      expect(skills.length).toBe(1); // Still one skill
      expect(skills[0].proficiency).toBeGreaterThan(0.5); // Increased
    });

    it("decays skills", () => {
      addCitizenSkill({
        citizenId: "c1",
        skill: "Vue.js",
        proficiency: 0.8,
        source: "education",
        learnedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        useCount: 1,
      });

      const decayed = decaySkills(0.1);
      expect(decayed).toBeGreaterThan(0);
      expect(getCitizenSkills("c1")[0].proficiency).toBeLessThan(0.8);
    });
  });

  describe("Education", () => {
    it("records education history", () => {
      recordEducation({
        citizenId: "c1",
        courseId: "course-1",
        courseName: "Advanced TypeScript",
        graduated: true,
        knowledgeGain: 15,
        enrolledAt: new Date().toISOString(),
        graduatedAt: new Date().toISOString(),
      });

      const education = getCitizenEducation("c1");
      expect(education.length).toBe(1);
      expect(education[0].courseName).toBe("Advanced TypeScript");
    });
  });

  describe("Export/Import", () => {
    it("exports and imports full database", () => {
      insertProject({
        name: "Export Test", status: "active", objective: "T", projectType: "web_app",
        source: "api", userId: "u1", pmCitizenId: "pm1", fileCount: 5,
        totalSizeBytes: 1024, createdAt: "", updatedAt: "", deliveredAt: null,
      });

      addCitizenSkill({
        citizenId: "c1", skill: "React", proficiency: 0.7, source: "project",
        learnedAt: "", lastUsedAt: "", useCount: 3,
      });

      const snapshot = exportDB();
      expect(snapshot.version).toBe(1);
      expect(snapshot.projects.length).toBe(1);

      clearDB();
      expect(listProjects().length).toBe(0);

      importDB(snapshot);
      expect(listProjects().length).toBe(1);
      expect(getCitizenSkills("c1").length).toBe(1);
    });
  });

  describe("Diagnostics", () => {
    it("reports database stats", () => {
      insertProject({
        name: "Diag Test", status: "active", objective: "T", projectType: "general",
        source: "api", userId: "u1", pmCitizenId: null, fileCount: 0,
        totalSizeBytes: 0, createdAt: "", updatedAt: "", deliveredAt: null,
      });

      const diag = getDBDiagnostics();
      expect(diag.projectCount).toBe(1);
    });
  });
});

// ─── Phase 2: Execution Bridge (simulated mode) ────────────────

describe("Real Execution Bridge", () => {
  it("gates financial operations in simulated mode", async () => {
    const result = await executeToolAction("forex_place_trade", {}, {
      citizenId: "c1",
      citizenName: "Luna",
      specialization: "Developer",
      skillLevel: 50,
      projectId: "test-project",
      mode: "simulated",
    });

    expect(result.status).toBe("skipped");
    expect(result.output).toContain("gated");
  });

  it("skips unknown tools gracefully", async () => {
    const result = await executeToolAction("unknown_tool", {}, {
      citizenId: "c1",
      citizenName: "Luna",
      specialization: "Developer",
      skillLevel: 50,
      projectId: "test-project",
      mode: "real",
    });

    expect(result.status).toBe("skipped");
    expect(result.output).toContain("No real executor");
  });

  it("tracks execution diagnostics", () => {
    const diag = getExecutionDiagnostics();
    expect(diag.totalExecutions).toBeGreaterThanOrEqual(0);
    expect(diag.successRate).toBeGreaterThanOrEqual(0);
    expect(diag.avgDuration).toBeGreaterThanOrEqual(0);
    expect(diag.activeProviders).toBeDefined();
  });
});

// ─── Workspace Manager State ────────────────────────────────────

describe("Workspace Manager", () => {
  it("exports and imports state", () => {
    const state = exportWorkspaceState();
    expect(state.workspaces).toBeDefined();
    expect(state.artifacts).toBeDefined();

    // Should not throw on import
    importWorkspaceState(state);
  });
});
