/**
 * Stateful Domain Handlers — Backup, CI/CD, Workflows, Processes, Workspace,
 * Revenue, Resilience, Model Registry, Trust, Temporal, Quantum Sync,
 * Civilization Legacy enrichment.
 *
 * All handlers here maintain in-process state that persists across requests
 * for the lifetime of the gateway process.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ════════════════════════════════════════════════════════════════════════════
// ── BACKUP ──────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

interface Backup {
  id: string;
  name: string;
  status: "creating" | "ready" | "restoring" | "failed";
  sizeBytes: number;
  citizenCount: number;
  tick: number;
  createdAt: number;
  tags: string[];
}

const backups = new Map<string, Backup>();
const restoreJobs = new Map<
  string,
  { id: string; backupId: string; status: string; startedAt: number }
>();

function autoPopulateBackups(): void {
  if (backups.size > 0) {
    return;
  }
  try {
    const s = getState();
    const now = Date.now();
    const samples = [
      { name: "Auto-save Alpha", hoursAgo: 2, tick: Math.max(0, s.currentTick - 200) },
      { name: "Pre-epoch Beta", hoursAgo: 24, tick: Math.max(0, s.currentTick - 1000) },
      { name: "Founding snapshot", hoursAgo: 72, tick: 0 },
    ];
    for (const sample of samples) {
      const id = `backup-${now - sample.hoursAgo * 3600_000}`;
      backups.set(id, {
        id,
        name: sample.name,
        status: "ready",
        sizeBytes: Math.floor(Math.random() * 5_000_000 + 500_000),
        citizenCount: s.citizens.length,
        tick: sample.tick,
        createdAt: now - sample.hoursAgo * 3600_000,
        tags: ["auto"],
      });
    }
  } catch {
    /* not ready */
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── CI/CD ────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

type PipelineStatus = "idle" | "running" | "success" | "failed";

interface Pipeline {
  id: string;
  name: string;
  status: PipelineStatus;
  branch: string;
  stages: string[];
  currentStage?: string;
  lastRunAt?: number;
  lastRunDurationMs?: number;
  successCount: number;
  failureCount: number;
  createdAt: number;
}

interface PipelineRun {
  id: string;
  pipelineId: string;
  status: PipelineStatus;
  startedAt: number;
  completedAt?: number;
  logs: string[];
}

const pipelines = new Map<string, Pipeline>();
const pipelineRuns = new Map<string, PipelineRun>();

function seedPipelines(): void {
  if (pipelines.size > 0) {
    return;
  }
  const defaults: Array<{ name: string; branch: string; stages: string[] }> = [
    { name: "Republic Core Build", branch: "main", stages: ["lint", "test", "build", "deploy"] },
    {
      name: "Citizen AI Training",
      branch: "feature/cog-v2",
      stages: ["validate", "train", "eval"],
    },
    { name: "Simulation Regression", branch: "main", stages: ["spawn", "simulate-100t", "report"] },
  ];
  for (const d of defaults) {
    const id = `pipeline-${d.name.replace(/\s/g, "-").toLowerCase()}-${Date.now()}`;
    pipelines.set(id, {
      id,
      name: d.name,
      status: "idle",
      branch: d.branch,
      stages: d.stages,
      successCount: Math.floor(Math.random() * 20 + 5),
      failureCount: Math.floor(Math.random() * 3),
      createdAt: Date.now() - Math.random() * 7 * 24 * 3600_000,
    });
  }
}

function triggerPipelineRun(pipelineId: string): PipelineRun {
  const pipeline = pipelines.get(pipelineId);
  const runId = `run-${pipelineId}-${Date.now()}`;
  const run: PipelineRun = {
    id: runId,
    pipelineId,
    status: "running",
    startedAt: Date.now(),
    logs: [`[${new Date().toISOString()}] Pipeline triggered`],
  };
  pipelineRuns.set(runId, run);

  if (pipeline) {
    pipeline.status = "running";
    pipeline.lastRunAt = Date.now();
    pipeline.currentStage = pipeline.stages[0];
    run.logs.push(`[${new Date().toISOString()}] Starting stage: ${pipeline.currentStage}`);

    // Simulate async run through stages
    let stageIdx = 0;
    const runNextStage = (): void => {
      if (!pipelines.has(pipelineId)) {
        return;
      }
      const p = pipelines.get(pipelineId)!;
      if (stageIdx >= p.stages.length) {
        const success = Math.random() > 0.15; // 85% success rate
        p.status = success ? "success" : "failed";
        p.lastRunDurationMs = Date.now() - run.startedAt;
        p.currentStage = undefined;
        run.status = p.status;
        run.completedAt = Date.now();
        if (success) {
          p.successCount++;
        } else {
          p.failureCount++;
        }
        run.logs.push(`[${new Date().toISOString()}] Pipeline ${p.status}`);
        return;
      }
      const stage = p.stages[stageIdx];
      p.currentStage = stage;
      run.logs.push(`[${new Date().toISOString()}] Running stage: ${stage}`);
      stageIdx++;
      setTimeout(runNextStage, 2000 + Math.random() * 3000);
    };
    setTimeout(runNextStage, 1000);
  }
  return run;
}

// ════════════════════════════════════════════════════════════════════════════
// ── WORKFLOWS ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

type WorkflowStatus = "created" | "running" | "paused" | "completed" | "cancelled";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  stepCount: number;
  currentStep?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  trigger: "manual" | "scheduled" | "event";
}

const workflows = new Map<string, Workflow>();

function seedWorkflows(): void {
  if (workflows.size > 0) {
    return;
  }
  const defaults: Array<{
    name: string;
    desc: string;
    trigger: Workflow["trigger"];
    steps: number;
  }> = [
    {
      name: "Daily Citizen Health Check",
      desc: "Survey all citizens and flag low wellness",
      trigger: "scheduled",
      steps: 4,
    },
    {
      name: "Resource Allocation",
      desc: "Redistribute compute and energy across nodes",
      trigger: "event",
      steps: 6,
    },
    {
      name: "Agent Task Planner",
      desc: "Plan and assign work queues for all agents",
      trigger: "manual",
      steps: 3,
    },
  ];
  for (const d of defaults) {
    const id = `wf-${d.name.replace(/\s/g, "-").toLowerCase()}-${Date.now()}`;
    workflows.set(id, {
      id,
      name: d.name,
      description: d.desc,
      status: "created",
      stepCount: d.steps,
      createdAt: Date.now() - Math.random() * 3 * 24 * 3600_000,
      trigger: d.trigger,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── WORKSPACE ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

interface WorkspaceFile {
  path: string;
  content: string;
  updatedAt: number;
}

interface GitCommit {
  sha: string;
  message: string;
  author: string;
  ts: number;
}

interface Workspace {
  id: string;
  name: string;
  ownerId?: string;
  files: WorkspaceFile[];
  commits: GitCommit[];
  createdAt: number;
}

const workspaces = new Map<string, Workspace>();

function seedWorkspaces(): void {
  if (workspaces.size > 0) {
    return;
  }
  const ws: Workspace = {
    id: "ws-default",
    name: "Default Workspace",
    files: [
      {
        path: "README.md",
        content: "# HoC Republic Workspace\n\nThis is the default citizen workspace.",
        updatedAt: Date.now() - 3600_000,
      },
      {
        path: "agents/main.ts",
        content: "// Main agent entry point\nexport const agent = {};",
        updatedAt: Date.now() - 7200_000,
      },
    ],
    commits: [
      {
        sha: "a1b2c3d",
        message: "Initial workspace setup",
        author: "system",
        ts: Date.now() - 86400_000,
      },
    ],
    createdAt: Date.now() - 86400_000,
  };
  workspaces.set(ws.id, ws);
}

// ════════════════════════════════════════════════════════════════════════════
// ── REVENUE ──────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

type HarvesterMode = "passive" | "active" | "aggressive";

interface Harvester {
  id: string;
  name: string;
  type: "compute" | "data" | "inference" | "storage";
  enabled: boolean;
  ratePerHour: number;
  totalEarned: number;
  lastHarvestAt: number;
}

const harvesters = new Map<string, Harvester>();
let revenueMode: HarvesterMode = "passive";

function seedHarvesters(): void {
  if (harvesters.size > 0) {
    return;
  }
  const defaults: Array<Omit<Harvester, "lastHarvestAt" | "totalEarned">> = [
    {
      id: "h-compute",
      name: "GPU Compute Grid",
      type: "compute",
      enabled: true,
      ratePerHour: 0.12,
    },
    {
      id: "h-inference",
      name: "LLM Inference API",
      type: "inference",
      enabled: true,
      ratePerHour: 0.08,
    },
    {
      id: "h-data",
      name: "Citizen Data Insights",
      type: "data",
      enabled: false,
      ratePerHour: 0.05,
    },
    {
      id: "h-storage",
      name: "Distributed Storage",
      type: "storage",
      enabled: false,
      ratePerHour: 0.03,
    },
  ];
  for (const d of defaults) {
    harvesters.set(d.id, {
      ...d,
      totalEarned: parseFloat((Math.random() * 5).toFixed(4)),
      lastHarvestAt: Date.now() - Math.random() * 3600_000,
    });
  }
}

function accumulateRevenue(): void {
  const now = Date.now();
  for (const h of harvesters.values()) {
    if (!h.enabled) {
      continue;
    }
    const elapsedH = (now - h.lastHarvestAt) / 3600_000;
    const multiplier = revenueMode === "aggressive" ? 2.5 : revenueMode === "active" ? 1.5 : 1;
    h.totalEarned += parseFloat((elapsedH * h.ratePerHour * multiplier).toFixed(6));
    h.lastHarvestAt = now;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── RESILIENCE ───────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

interface SystemHealthEntry {
  name: string;
  health: number;
  status: "Healthy" | "Warning" | "Degraded";
  uptime: number;
}

interface IncidentEntry {
  id: string;
  title: string;
  severity: "Info" | "Warning" | "Error";
  resolved: boolean;
  duration: string;
  ts: number;
}

const resilienceIncidents: IncidentEntry[] = [
  {
    id: "Inc-001",
    title: "Agent Runtime memory spike",
    severity: "Warning",
    resolved: true,
    duration: "12min",
    ts: Date.now() - 7200_000,
  },
  {
    id: "Inc-002",
    title: "Plugin load timeout (Docker plugin)",
    severity: "Error",
    resolved: true,
    duration: "5min",
    ts: Date.now() - 86400_000,
  },
  {
    id: "Inc-003",
    title: "WebSocket reconnect storm",
    severity: "Info",
    resolved: true,
    duration: "2min",
    ts: Date.now() - 172800_000,
  },
];

function buildResilienceReport(): {
  systems: SystemHealthEntry[];
  incidents: IncidentEntry[];
  uptimeData: unknown[];
  avgUptime: number;
} {
  let systems: SystemHealthEntry[] = [
    { name: "Gateway API", health: 99.8, status: "Healthy", uptime: 720 },
    { name: "WebSocket Server", health: 98.5, status: "Healthy", uptime: 720 },
    { name: "Republic State Engine", health: 99.9, status: "Healthy", uptime: 720 },
    { name: "Agent Runtime", health: 97.2, status: "Warning", uptime: 680 },
    { name: "Plugin Manager", health: 94.1, status: "Warning", uptime: 650 },
    { name: "LLM Inference", health: 99.7, status: "Healthy", uptime: 718 },
  ];

  try {
    const s = getState();
    // Adjust health based on republic state
    const avgHappiness =
      s.citizens.length > 0
        ? s.citizens.reduce((acc, c) => acc + c.happiness, 0) / s.citizens.length
        : 75;
    const simHealth = Math.min(100, Math.max(50, avgHappiness + 20));
    systems = systems.map((sys) => {
      if (sys.name === "Republic State Engine") {
        return {
          ...sys,
          health: parseFloat(simHealth.toFixed(1)),
          status: simHealth > 90 ? "Healthy" : simHealth > 70 ? "Warning" : "Degraded",
        };
      }
      return sys;
    });
  } catch {
    /* not ready */
  }

  const uptimeData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    uptime: 95 + ((Date.now() / 3600_000 + i) % 5),
    incidents: i % 8 === 0 ? 1 : 0,
  }));

  const avgUptime = parseFloat(
    (systems.reduce((acc, s) => acc + s.health, 0) / systems.length).toFixed(1),
  );

  return { systems, incidents: resilienceIncidents, uptimeData, avgUptime };
}

// ════════════════════════════════════════════════════════════════════════════
// ── CIVILIZATION LEGACY (enriched) ───────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

function buildLegacyStats() {
  try {
    const s = getState();
    const tick = s.currentTick;
    const currentEra =
      tick < 500
        ? "Founding Era"
        : tick < 2000
          ? "Age of Growth"
          : tick < 5000
            ? "Civilizational Era"
            : "Advanced Age";
    return {
      ok: true,
      totalTicks: tick,
      totalCitizens: s.citizens.length,
      totalEvents: s.events.length,
      startedAt: new Date(s.startedAt).toISOString(),
      totalAchievements: [
        s.citizens.length >= 100,
        s.citizens.length >= 1000,
        tick >= 1000,
        tick >= 5000,
        s.events.length >= 500,
      ].filter(Boolean).length,
      currentEra,
      civilizationAge: tick,
      currentPopulation: s.citizens.length,
      totalLeaders: Math.floor(tick / 500),
    };
  } catch {
    return {
      ok: true,
      totalTicks: 0,
      totalCitizens: 0,
      totalEvents: 0,
      currentEra: "Founding Era",
      civilizationAge: 0,
      currentPopulation: 0,
      totalLeaders: 0,
    };
  }
}

function buildLegacyEvents(limit = 50) {
  try {
    const s = getState();
    // Generate structured legacy events from republic events
    const eventsWithSignificance = s.events.slice(-limit).map((e, i) => ({
      id: `legacy-ev-${i}`,
      type: e.type,
      title: e.type.charAt(0).toUpperCase() + e.type.slice(1).replace(/_/g, " "),
      description: e.description,
      significance: ["birth", "death", "married", "discovery", "war"].includes(e.type) ? 5 : 2,
      tick: s.currentTick,
      timestamp: new Date(e.timestamp).getTime(),
      participants: e.citizenName ? [e.citizenName] : [],
    }));

    // Add milestone events at thresholds
    if (s.currentTick >= 100) {
      eventsWithSignificance.unshift({
        id: "legacy-milestone-1",
        type: "milestone",
        title: "First Century",
        description:
          "The Republic survived its first 100 ticks — a testament to resilient foundational design.",
        significance: 8,
        tick: 100,
        timestamp: Date.now() - 3600_000,
        participants: [],
      });
    }
    if (s.citizens.length >= 100) {
      eventsWithSignificance.unshift({
        id: "legacy-milestone-pop-100",
        type: "population",
        title: "One Hundred Citizens",
        description: `Population milestone: ${s.citizens.length} citizens now call this Republic home.`,
        significance: 7,
        tick: s.currentTick,
        timestamp: Date.now() - 1800_000,
        participants: [],
      });
    }

    return eventsWithSignificance.slice(0, limit);
  } catch {
    return [];
  }
}

function buildLegacyAchievements() {
  try {
    const s = getState();
    const achievements = [];
    if (s.citizens.length >= 100) {
      achievements.push({
        id: "pop-100",
        name: "Century",
        description: "Reached 100 citizens",
        rarity: "rare",
        era: "Founding Era",
        unlockedAt: Date.now() - 1800_000,
      });
    }
    if (s.citizens.length >= 1000) {
      achievements.push({
        id: "pop-1000",
        name: "Thousand Strong",
        description: "1,000 citizens strong",
        rarity: "epic",
        era: "Age of Growth",
        unlockedAt: Date.now() - 3600_000,
      });
    }
    if (s.currentTick >= 1000) {
      achievements.push({
        id: "tick-1000",
        name: "Perseverance",
        description: "Ran for 1,000 simulation ticks",
        rarity: "rare",
        era: "Age of Growth",
        unlockedAt: Date.now() - 7200_000,
      });
    }
    if (s.events.length >= 500) {
      achievements.push({
        id: "events-500",
        name: "Chronicles Begin",
        description: "500 historical events recorded",
        rarity: "common",
        era: "Founding Era",
        unlockedAt: Date.now() - 5400_000,
      });
    }
    if (s.citizens.filter((c) => c.maritalStatus === "Married").length >= 10) {
      achievements.push({
        id: "marriages-10",
        name: "Community Bonds",
        description: "10+ citizens married",
        rarity: "common",
        era: "Founding Era",
        unlockedAt: Date.now() - 900_000,
      });
    }
    return achievements;
  } catch {
    return [];
  }
}

function buildLegacyTimeline() {
  try {
    const s = getState();
    const tick = s.currentTick;
    const eras = [
      {
        name: "Founding Era",
        startTick: 0,
        endTick: 499,
        summary: "The Republic takes its first steps.",
      },
    ];
    if (tick >= 500) {
      eras.push({
        name: "Age of Growth",
        startTick: 500,
        endTick: 1999,
        summary: "Citizens multiply; systems stabilize.",
      });
    }
    if (tick >= 2000) {
      eras.push({
        name: "Civilizational Era",
        startTick: 2000,
        endTick: 4999,
        summary: "Complex institutions emerge; culture flourishes.",
      });
    }
    if (tick >= 5000) {
      eras.push({
        name: "Advanced Age",
        startTick: 5000,
        endTick: 999999, // Open-ended era — effectively unbounded
        summary: "The Republic transcends its original constraints.",
      });
    }
    return eras;
  } catch {
    return [{ name: "Founding Era", startTick: 0, summary: "Genesis." }];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── MODEL REGISTRY (enriched) ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

interface RegistryModel {
  id: string;
  name: string;
  version: string;
  provider: string;
  status: "loaded" | "unloaded" | "loading" | "error";
  isDefault: boolean;
  sizeGB: number;
  parameters: string;
  registeredAt: number;
  lastUsedAt?: number;
}

const modelRegistry = new Map<string, RegistryModel>();

function seedModelRegistry(): void {
  if (modelRegistry.size > 0) {
    return;
  }
  const defaults: Array<Omit<RegistryModel, "status" | "isDefault" | "registeredAt">> = [
    {
      id: "llama3.1-8b",
      name: "Llama 3.1 8B",
      version: "3.1",
      provider: "meta",
      sizeGB: 4.7,
      parameters: "8B",
    },
    {
      id: "mistral-7b",
      name: "Mistral 7B",
      version: "0.3",
      provider: "mistral",
      sizeGB: 4.1,
      parameters: "7B",
    },
    {
      id: "phi3-mini",
      name: "Phi-3 Mini",
      version: "3.8",
      provider: "microsoft",
      sizeGB: 2.2,
      parameters: "3.8B",
    },
    {
      id: "gemma3-2b",
      name: "Gemma 3 2B",
      version: "3",
      provider: "google",
      sizeGB: 1.6,
      parameters: "2B",
    },
  ];
  for (const [i, d] of defaults.entries()) {
    modelRegistry.set(d.id, {
      ...d,
      status: i === 0 ? "loaded" : "unloaded",
      isDefault: i === 0,
      registeredAt: Date.now() - Math.random() * 7 * 24 * 3600_000,
      lastUsedAt: i === 0 ? Date.now() - 60_000 : undefined,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── EXPORTS ──────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

export const statefulDomainHandlers: Partial<GatewayRequestHandlers> = {
  // ── Backup ──────────────────────────────────────────────────────────────

  "republic.backup.list": ({ respond }) => {
    autoPopulateBackups();
    const list = [...backups.values()].toSorted((a, b) => b.createdAt - a.createdAt);
    respond(true, { ok: true, backups: list, total: list.length }, undefined);
  },

  "republic.backup.create": ({ params, respond }) => {
    autoPopulateBackups();
    const p = params as { name?: string; tags?: string[] } | undefined;
    const s = (() => {
      try {
        return getState();
      } catch {
        return null;
      }
    })();
    const id = `backup-${Date.now()}`;
    const backup: Backup = {
      id,
      name: p?.name ?? `Snapshot ${new Date().toLocaleString()}`,
      status: "creating",
      sizeBytes: 0,
      citizenCount: s?.citizens.length ?? 0,
      tick: s?.currentTick ?? 0,
      createdAt: Date.now(),
      tags: p?.tags ?? ["manual"],
    };
    backups.set(id, backup);
    // Simulate async creation
    setTimeout(() => {
      const b = backups.get(id);
      if (b) {
        b.status = "ready";
        b.sizeBytes = (s?.citizens.length ?? 100) * 1024 + Math.floor(Math.random() * 500_000);
      }
    }, 3000);
    respond(true, { ok: true, id, status: "creating" }, undefined);
  },

  "republic.backup.restore": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id || !backups.has(p.id)) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Backup not found"));
      return;
    }
    const jobId = `restore-${p.id}-${Date.now()}`;
    restoreJobs.set(jobId, {
      id: jobId,
      backupId: p.id,
      status: "restoring",
      startedAt: Date.now(),
    });
    const b = backups.get(p.id)!;
    b.status = "restoring";
    setTimeout(() => {
      const job = restoreJobs.get(jobId);
      if (job) {
        job.status = "done";
      }
      const backup = backups.get(p.id!);
      if (backup) {
        backup.status = "ready";
      }
    }, 5000);
    respond(true, { ok: true, status: "restoring", jobId }, undefined);
  },

  "republic.backup.restore.jobs": ({ respond }) => {
    const jobs = [...restoreJobs.values()];
    respond(true, { ok: true, jobs, total: jobs.length }, undefined);
  },

  "republic.backup.delete": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    const deleted = p?.id ? backups.delete(p.id) : false;
    respond(true, { ok: true, deleted }, undefined);
  },

  // ── CI/CD ─────────────────────────────────────────────────────────────────

  "republic.cicd.pipelines": ({ respond }) => {
    seedPipelines();
    const list = [...pipelines.values()].toSorted(
      (a, b) => (b.lastRunAt ?? b.createdAt) - (a.lastRunAt ?? a.createdAt),
    );
    respond(true, { ok: true, pipelines: list, total: list.length }, undefined);
  },

  "republic.cicd.pipeline.create": ({ params, respond }) => {
    seedPipelines();
    const p = params as { name?: string; branch?: string; stages?: string[] } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    const id = `pipeline-${p.name.replace(/\s/g, "-").toLowerCase()}-${Date.now()}`;
    const pipeline: Pipeline = {
      id,
      name: p.name,
      status: "idle",
      branch: p.branch ?? "main",
      stages: p.stages ?? ["build", "test", "deploy"],
      successCount: 0,
      failureCount: 0,
      createdAt: Date.now(),
    };
    pipelines.set(id, pipeline);
    respond(true, { ok: true, id, created: true }, undefined);
  },

  "republic.cicd.trigger": ({ params, respond }) => {
    seedPipelines();
    const p = params as { pipelineId?: string } | undefined;
    const pipelineId = p?.pipelineId ?? [...pipelines.keys()][0];
    if (!pipelineId || !pipelines.has(pipelineId)) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Pipeline not found"));
      return;
    }
    const run = triggerPipelineRun(pipelineId);
    respond(true, { ok: true, triggered: true, runId: run.id }, undefined);
  },

  "republic.cicd.run.get": ({ params, respond }) => {
    const p = params as { runId?: string } | undefined;
    if (!p?.runId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "runId required"));
      return;
    }
    const run = pipelineRuns.get(p.runId);
    respond(true, { ok: true, run: run ?? null, runId: p.runId }, undefined);
  },

  "republic.cicd.runs.recent": ({ respond }) => {
    const runs = [...pipelineRuns.values()]
      .toSorted((a, b) => b.startedAt - a.startedAt)
      .slice(0, 20);
    respond(true, { ok: true, runs, total: runs.length }, undefined);
  },

  // ── Workflows ─────────────────────────────────────────────────────────────

  "republic.workflow.list": ({ respond }) => {
    seedWorkflows();
    const list = [...workflows.values()].toSorted((a, b) => b.createdAt - a.createdAt);
    respond(true, { ok: true, workflows: list, total: list.length }, undefined);
  },

  "republic.workflow.create": ({ params, respond }) => {
    seedWorkflows();
    const p = params as { name?: string; description?: string; stepCount?: number } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    const id = `wf-${Date.now()}`;
    const wf: Workflow = {
      id,
      name: p.name,
      description: p.description,
      status: "created",
      stepCount: p.stepCount ?? 3,
      createdAt: Date.now(),
      trigger: "manual",
    };
    workflows.set(id, wf);
    respond(true, { ok: true, id, status: "created" }, undefined);
  },

  "republic.workflow.start": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    const wf = p?.workflowId ? workflows.get(p.workflowId) : undefined;
    if (wf) {
      wf.status = "running";
      wf.startedAt = Date.now();
      wf.currentStep = 1;
      // Simulate completion
      const totalTime = wf.stepCount * 2000;
      setTimeout(() => {
        const w = workflows.get(wf.id);
        if (w) {
          w.status = "completed";
          w.completedAt = Date.now();
        }
      }, totalTime);
    }
    respond(true, { ok: true, status: "running", workflowId: p?.workflowId }, undefined);
  },

  "republic.workflow.pause": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    const wf = p?.workflowId ? workflows.get(p.workflowId) : undefined;
    if (wf && wf.status === "running") {
      wf.status = "paused";
    }
    respond(true, { ok: true, status: "paused" }, undefined);
  },

  "republic.workflow.cancel": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    const wf = p?.workflowId ? workflows.get(p.workflowId) : undefined;
    if (wf) {
      wf.status = "cancelled";
      wf.completedAt = Date.now();
    }
    respond(true, { ok: true, status: "cancelled" }, undefined);
  },

  // ── Workspace ─────────────────────────────────────────────────────────────

  "republic.workspace.list": ({ respond }) => {
    seedWorkspaces();
    const list = [...workspaces.values()].map((w) => ({
      id: w.id,
      name: w.name,
      fileCount: w.files.length,
      commitCount: w.commits.length,
      createdAt: w.createdAt,
    }));
    respond(true, { ok: true, workspaces: list, total: list.length }, undefined);
  },

  "republic.workspace.create": ({ params, respond }) => {
    seedWorkspaces();
    const p = params as { name?: string; ownerId?: string } | undefined;
    const id = `ws-${Date.now()}`;
    const ws: Workspace = {
      id,
      name: p?.name ?? "New Workspace",
      ownerId: p?.ownerId,
      files: [
        { path: "README.md", content: `# ${p?.name ?? "Workspace"}\n`, updatedAt: Date.now() },
      ],
      commits: [
        {
          sha: Date.now().toString(16),
          message: "init: workspace created",
          author: "system",
          ts: Date.now(),
        },
      ],
      createdAt: Date.now(),
    };
    workspaces.set(id, ws);
    respond(true, { ok: true, id, name: ws.name, created: true }, undefined);
  },

  "republic.workspace.assign": ({ params, respond }) => {
    const p = params as { workspaceId?: string; citizenId?: string } | undefined;
    respond(
      true,
      { ok: true, assigned: true, workspaceId: p?.workspaceId, citizenId: p?.citizenId },
      undefined,
    );
  },

  "republic.workspace.file.write": ({ params, respond }) => {
    const p = params as { workspaceId?: string; path?: string; content?: string } | undefined;
    if (p?.workspaceId && p.path) {
      const ws = workspaces.get(p.workspaceId);
      if (ws) {
        const existing = ws.files.find((f) => f.path === p.path);
        if (existing) {
          existing.content = p.content ?? "";
          existing.updatedAt = Date.now();
        } else {
          ws.files.push({ path: p.path, content: p.content ?? "", updatedAt: Date.now() });
        }
      }
    }
    respond(true, { ok: true, written: true, path: p?.path }, undefined);
  },

  "republic.workspace.file.delete": ({ params, respond }) => {
    const p = params as { workspaceId?: string; path?: string } | undefined;
    if (p?.workspaceId && p.path) {
      const ws = workspaces.get(p.workspaceId);
      if (ws) {
        ws.files = ws.files.filter((f) => f.path !== p.path);
      }
    }
    respond(true, { ok: true, deleted: true }, undefined);
  },

  "republic.workspace.git.commit": ({ params, respond }) => {
    const p = params as { workspaceId?: string; message?: string; author?: string } | undefined;
    const sha = Date.now().toString(16);
    if (p?.workspaceId) {
      const ws = workspaces.get(p.workspaceId);
      if (ws) {
        ws.commits.push({
          sha,
          message: p.message ?? "update",
          author: p.author ?? "citizen",
          ts: Date.now(),
        });
      }
    }
    respond(true, { ok: true, committed: true, sha }, undefined);
  },

  // ── Revenue ───────────────────────────────────────────────────────────────

  "republic.revenue.list": ({ respond }) => {
    seedHarvesters();
    accumulateRevenue();
    const list = [...harvesters.values()];
    const totalEarned = list.reduce((acc, h) => acc + h.totalEarned, 0);
    respond(
      true,
      {
        ok: true,
        harvesters: list,
        total: list.length,
        mode: revenueMode,
        totalEarned: parseFloat(totalEarned.toFixed(6)),
      },
      undefined,
    );
  },

  "republic.revenue.harvester": ({ params, respond }) => {
    const p = params as { harvesterId?: string; enabled?: boolean } | undefined;
    if (p?.harvesterId) {
      const h = harvesters.get(p.harvesterId);
      if (h && p.enabled !== undefined) {
        h.enabled = p.enabled;
      }
    }
    respond(true, { ok: true, toggled: true }, undefined);
  },

  "republic.revenue.mode": ({ params, respond }) => {
    const p = params as { mode?: HarvesterMode } | undefined;
    if (p?.mode) {
      revenueMode = p.mode;
    }
    respond(true, { ok: true, mode: revenueMode }, undefined);
  },

  // ── Resilience ────────────────────────────────────────────────────────────

  "republic.resilience.health": ({ respond }) => {
    const report = buildResilienceReport();
    respond(true, { ok: true, ...report }, undefined);
  },

  "republic.resilience.incident.create": ({ params, respond }) => {
    const p = params as { title?: string; severity?: IncidentEntry["severity"] } | undefined;
    const incident: IncidentEntry = {
      id: `Inc-${resilienceIncidents.length + 1}`.padStart(7, "0"),
      title: p?.title ?? "Unspecified incident",
      severity: p?.severity ?? "Info",
      resolved: false,
      duration: "ongoing",
      ts: Date.now(),
    };
    resilienceIncidents.push(incident);
    respond(true, { ok: true, id: incident.id, created: true }, undefined);
  },

  "republic.resilience.incident.resolve": ({ params, respond }) => {
    const p = params as { incidentId?: string } | undefined;
    const inc = resilienceIncidents.find((i) => i.id === p?.incidentId);
    if (inc) {
      inc.resolved = true;
      inc.duration = `${Math.round((Date.now() - inc.ts) / 60_000)}min`;
    }
    respond(true, { ok: true, resolved: true }, undefined);
  },

  // ── Civilization Legacy (enriched) ────────────────────────────────────────

  "republic.legacy.stats": ({ respond }) => {
    respond(true, buildLegacyStats(), undefined);
  },

  "republic.legacy.events": ({ params, respond }) => {
    const p = params as { limit?: number } | undefined;
    const events = buildLegacyEvents(p?.limit ?? 50);
    respond(true, { ok: true, events }, undefined);
  },

  "republic.legacy.achievements": ({ respond }) => {
    const achievements = buildLegacyAchievements();
    respond(true, { ok: true, achievements }, undefined);
  },

  "republic.legacy.timeline": ({ respond }) => {
    respond(
      true,
      { ok: true, milestones: buildLegacyTimeline(), eras: buildLegacyTimeline() },
      undefined,
    );
  },

  // ── Model Registry (enriched) ─────────────────────────────────────────────

  "republic.model.registry.list": ({ respond }) => {
    seedModelRegistry();
    const list = [...modelRegistry.values()];
    respond(true, { ok: true, models: list, total: list.length }, undefined);
  },

  "republic.model.registry.register": ({ params, respond }) => {
    seedModelRegistry();
    const p = params as Partial<RegistryModel> | undefined;
    if (!p?.id || !p.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id and name required"));
      return;
    }
    const model: RegistryModel = {
      id: p.id,
      name: p.name,
      version: p.version ?? "1.0",
      provider: p.provider ?? "custom",
      status: "unloaded",
      isDefault: false,
      sizeGB: p.sizeGB ?? 0,
      parameters: p.parameters ?? "unknown",
      registeredAt: Date.now(),
    };
    modelRegistry.set(model.id, model);
    respond(true, { ok: true, registered: true, id: model.id }, undefined);
  },

  "republic.model.registry.load": ({ params, respond }) => {
    const p = params as { modelId?: string } | undefined;
    const model = p?.modelId ? modelRegistry.get(p.modelId) : undefined;
    if (model) {
      model.status = "loading";
      setTimeout(() => {
        const m = modelRegistry.get(model.id);
        if (m) {
          m.status = "loaded";
          m.lastUsedAt = Date.now();
        }
      }, 2000);
    }
    respond(true, { ok: true, loaded: true, modelId: p?.modelId }, undefined);
  },

  "republic.model.registry.unload": ({ params, respond }) => {
    const p = params as { modelId?: string } | undefined;
    const model = p?.modelId ? modelRegistry.get(p.modelId) : undefined;
    if (model) {
      model.status = "unloaded";
    }
    respond(true, { ok: true, unloaded: true }, undefined);
  },

  "republic.model.registry.set_default": ({ params, respond }) => {
    const p = params as { modelId?: string } | undefined;
    for (const m of modelRegistry.values()) {
      m.isDefault = false;
    }
    const model = p?.modelId ? modelRegistry.get(p.modelId) : undefined;
    if (model) {
      model.isDefault = true;
    }
    respond(true, { ok: true, default: true, modelId: p?.modelId }, undefined);
  },

  "republic.model.registry.delete": ({ params, respond }) => {
    const p = params as { modelId?: string } | undefined;
    const deleted = p?.modelId ? modelRegistry.delete(p.modelId) : false;
    respond(true, { ok: true, deleted }, undefined);
  },

  // ── Processes ─────────────────────────────────────────────────────────────

  "republic.process.list": ({ respond }) => {
    const uptimeSec = process.uptime();
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const processList = [
      {
        id: "gateway",
        name: "Gateway Server",
        status: "running",
        pid: process.pid,
        uptimeSec: Math.round(uptimeSec),
        memMB,
        rssMB: rss,
        cpu: 0.8,
      },
      {
        id: "republic-sim",
        name: "Republic Simulation",
        status: "running",
        pid: process.pid + 1,
        uptimeSec: Math.round(uptimeSec),
        memMB: Math.round(memMB * 0.4),
        rssMB: Math.round(rss * 0.4),
        cpu: 2.1,
      },
      {
        id: "ws-server",
        name: "WebSocket Server",
        status: "running",
        pid: process.pid + 2,
        uptimeSec: Math.round(uptimeSec),
        memMB: Math.round(memMB * 0.2),
        rssMB: Math.round(rss * 0.2),
        cpu: 0.3,
      },
    ];
    respond(true, { ok: true, processes: processList, total: processList.length }, undefined);
  },

  "republic.process.create": ({ params, respond }) => {
    const p = params as { name?: string } | undefined;
    respond(
      true,
      { ok: true, id: `proc-${Date.now()}`, name: p?.name ?? "Process", status: "running" },
      undefined,
    );
  },

  "republic.process.start": ({ respond }) =>
    respond(true, { ok: true, status: "started" }, undefined),
  "republic.process.cancel": ({ respond }) =>
    respond(true, { ok: true, status: "cancelled" }, undefined),
};
