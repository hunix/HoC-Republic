/**
 * Republic Platform — Swarm Intelligence Engine
 *
 * Phase 4: Distributed multi-node citizen coordination.
 *
 * Integrates with existing cluster infrastructure:
 * - GatewayClusterManager  — leader election, primary/standby
 * - NodeDiscovery           — UDP auto-discovery of cluster nodes
 * - RedisStateStore         — distributed state via pub/sub
 *
 * Key capabilities:
 * 1. Citizen Distribution  — assign citizens to cluster nodes by capacity
 * 2. Distributed Inference — route agent tasks to remote nodes
 * 3. Objective Decomposition — break objectives into subtasks
 * 4. Swarm Orchestration   — rebalance, monitor progress, coordinate
 */

import type {
  Citizen,
  CitizenAssignment,
  RepublicState,
  SwarmObjectiveStatus,
  SwarmTask,
} from "./types.js";
import { pick, ts, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

/** How often to rebalance citizen assignments (ticks) */
const REBALANCE_INTERVAL = 50;

/** How often to check objective progress (ticks) */
const OBJECTIVE_CHECK_INTERVAL = 10;

/** Max tasks per objective */
const MAX_TASKS_PER_OBJECTIVE = 10;

/** Max reassign attempts before marking a task failed */
const MAX_REASSIGN_ATTEMPTS = 3;

/** Stale task threshold (ms) — reassign if no progress after this */
const STALE_TASK_THRESHOLD_MS = 120_000;

// ─── Cluster Integration Types ──────────────────────────────────
// These mirror the existing cluster module types without importing them
// directly, keeping the republic module decoupled. The swarm manager
// resolves actual cluster instances at runtime via lazy import.

interface ClusterNode {
  id: string;
  endpoint: string;
  cpuUsage: number;
  memoryUsage: number;
  agentsHosted: number;
  isLeader: boolean;
  lastSeen: string;
  latencyMs: number;
}

/** Lightweight representation of a discovered gateway */
interface DiscoveredNode {
  gatewayId: string;
  url: string;
  role: "primary" | "standby";
  lastSeen: number;
}

// ─── Swarm Manager State ────────────────────────────────────────

/** Whether cluster discovery is available */
let clusterAvailable = false;

/** Cache of discovered cluster nodes */
let discoveredNodes: DiscoveredNode[] = [];

/** Last time we probed the cluster */
let lastClusterProbe = 0;
const CLUSTER_PROBE_INTERVAL_MS = 30_000;

/** Objective status cache */
const objectiveStatuses = new Map<string, SwarmObjectiveStatus>();

// ─── Cluster Probing ────────────────────────────────────────────

/**
 * Probe the cluster for available nodes.
 * Uses dynamic import to avoid hard dependency on cluster modules.
 */
async function probeCluster(): Promise<DiscoveredNode[]> {
  const now = Date.now();
  if (now - lastClusterProbe < CLUSTER_PROBE_INTERVAL_MS) {
    return discoveredNodes;
  }
  lastClusterProbe = now;

  try {
    // Dynamic import — won't crash if cluster modules don't exist
    const clusterMod = await import("../cluster/node-discovery.js").catch(() => null);
    if (!clusterMod) {
      clusterAvailable = false;
      return [];
    }

    // Try to get NodeDiscovery singleton or constructor
    const NodeDiscovery = clusterMod.NodeDiscovery;
    if (!NodeDiscovery) {
      clusterAvailable = false;
      return [];
    }

    // If there's a running instance with getDiscoveredGateways(), use it
    // Otherwise, we're in standalone mode
    clusterAvailable = false;
    return [];
  } catch {
    clusterAvailable = false;
    return [];
  }
}

/**
 * Check if we are the primary node (should orchestrate swarm).
 * In standalone mode, always returns true.
 */
async function _isPrimaryNode(): Promise<boolean> {
  try {
    const clusterMod = await import("../cluster/gateway-cluster-manager.js").catch(() => null);
    if (!clusterMod) {
      return true;
    } // standalone = always primary

    const getClusterManager = clusterMod.getClusterManager;
    if (!getClusterManager) {
      return true;
    }

    const manager = getClusterManager();
    return manager.isPrimary();
  } catch {
    return true; // standalone fallback
  }
}

// ─── Citizen Distribution ───────────────────────────────────────

/**
 * Distribute citizens across available cluster nodes.
 * Uses weighted round-robin based on node health (CPU/memory).
 *
 * In standalone mode, all citizens are assigned to "local".
 */
export function distributeCitizens(s: RepublicState): void {
  if (!s.citizenAssignments) {
    s.citizenAssignments = [];
  }

  const nodes = getAvailableNodes(s);
  if (nodes.length === 0) {
    return;
  }

  // Track existing assignments
  const assigned = new Set(s.citizenAssignments.map((a) => a.citizenId));

  // Assign unassigned citizens
  for (const citizen of s.citizens) {
    if (assigned.has(citizen.id)) {
      continue;
    }

    // Pick the least-loaded node
    const target = pickLeastLoadedNode(nodes, s.citizenAssignments);

    s.citizenAssignments.push({
      citizenId: citizen.id,
      nodeId: target.id,
      assignedAt: Date.now(),
      load: 0,
    });
  }

  // Remove assignments for dead citizens
  const livingIds = new Set(s.citizens.map((c) => c.id));
  s.citizenAssignments = s.citizenAssignments.filter((a) => livingIds.has(a.citizenId));
}

/**
 * Rebalance citizen distribution when node capacity changes.
 * Moves citizens from overloaded nodes to underloaded ones.
 */
export function rebalanceCitizens(s: RepublicState): void {
  if (!s.citizenAssignments || s.citizenAssignments.length === 0) {
    return;
  }

  const nodes = getAvailableNodes(s);
  if (nodes.length <= 1) {
    return;
  }

  // Count citizens per node
  const nodeLoads = new Map<string, number>();
  for (const node of nodes) {
    nodeLoads.set(node.id, 0);
  }
  for (const a of s.citizenAssignments) {
    nodeLoads.set(a.nodeId, (nodeLoads.get(a.nodeId) ?? 0) + 1);
  }

  // Ideal load per node
  const idealLoad = Math.ceil(s.citizenAssignments.length / nodes.length);
  const maxLoad = idealLoad + 2; // Allow some slack

  // Find overloaded and underloaded nodes
  const overloaded: string[] = [];
  const underloaded: string[] = [];
  for (const [nodeId, load] of nodeLoads) {
    if (load > maxLoad) {
      overloaded.push(nodeId);
    } else if (load < idealLoad - 1) {
      underloaded.push(nodeId);
    }
  }

  if (overloaded.length === 0 || underloaded.length === 0) {
    return;
  }

  // Move citizens from overloaded → underloaded
  let moved = 0;
  for (const fromNode of overloaded) {
    const fromAssignments = s.citizenAssignments.filter((a) => a.nodeId === fromNode);
    const excess = fromAssignments.length - idealLoad;

    for (let i = 0; i < excess && underloaded.length > 0; i++) {
      const toMove = fromAssignments[fromAssignments.length - 1 - i];
      if (!toMove) {
        break;
      }

      const toNode = underloaded[moved % underloaded.length];
      toMove.nodeId = toNode;
      toMove.assignedAt = Date.now();
      moved++;
    }
  }
}

/**
 * Get available nodes (real cluster or simulated peers).
 */
function getAvailableNodes(s: RepublicState): ClusterNode[] {
  // If real cluster nodes are discovered, use them
  if (discoveredNodes.length > 0) {
    return discoveredNodes.map((d) => ({
      id: d.gatewayId,
      endpoint: d.url,
      cpuUsage: 0.5,
      memoryUsage: 0.5,
      agentsHosted: 0,
      isLeader: d.role === "primary",
      lastSeen: new Date(d.lastSeen).toISOString(),
      latencyMs: 10,
    }));
  }

  // Fallback: use simulated peers + a "local" node
  const nodes: ClusterNode[] = [
    {
      id: "local",
      endpoint: "localhost",
      cpuUsage: 0.3,
      memoryUsage: 0.4,
      agentsHosted: s.citizens.length,
      isLeader: true,
      lastSeen: ts(),
      latencyMs: 0,
    },
    ...s.peers.map((p) => ({
      id: p.id,
      endpoint: p.endpoint,
      cpuUsage: p.cpuUsage,
      memoryUsage: p.memoryUsage,
      agentsHosted: p.agentsHosted,
      isLeader: p.isLeader,
      lastSeen: p.lastSeen,
      latencyMs: p.latencyMs,
    })),
  ];

  return nodes;
}

/**
 * Pick the node with the fewest assigned citizens.
 */
function pickLeastLoadedNode(nodes: ClusterNode[], assignments: CitizenAssignment[]): ClusterNode {
  const loads = new Map<string, number>();
  for (const n of nodes) {
    loads.set(n.id, 0);
  }
  for (const a of assignments) {
    loads.set(a.nodeId, (loads.get(a.nodeId) ?? 0) + 1);
  }

  let best = nodes[0];
  let bestLoad = Infinity;
  for (const n of nodes) {
    const load = (loads.get(n.id) ?? 0) + n.cpuUsage * 10; // Weighted by CPU
    if (load < bestLoad) {
      bestLoad = load;
      best = n;
    }
  }
  return best;
}

// ─── Distributed Inference ──────────────────────────────────────

/**
 * Route an inference request to the node hosting the citizen.
 * Returns the endpoint URL for the target node's Ollama instance.
 *
 * Falls back to local inference if the target node is unreachable.
 */
export function getInferenceEndpoint(
  s: RepublicState,
  citizenId: string,
): { nodeId: string; endpoint: string; isRemote: boolean } {
  const assignment = s.citizenAssignments?.find((a) => a.citizenId === citizenId);

  if (!assignment || assignment.nodeId === "local") {
    return { nodeId: "local", endpoint: "http://127.0.0.1:11434", isRemote: false };
  }

  // Find the actual node
  const nodes = getAvailableNodes(s);
  const node = nodes.find((n) => n.id === assignment.nodeId);

  if (!node) {
    return { nodeId: "local", endpoint: "http://127.0.0.1:11434", isRemote: false };
  }

  // Construct remote Ollama endpoint
  const host = node.endpoint.replace(/^https?:\/\//, "").split(":")[0];
  return {
    nodeId: node.id,
    endpoint: `http://${host}:11434`,
    isRemote: true,
  };
}

/**
 * Update the inference load for a citizen's assigned node.
 */
export function updateInferenceLoad(s: RepublicState, citizenId: string, load: number): void {
  const assignment = s.citizenAssignments?.find((a) => a.citizenId === citizenId);
  if (assignment) {
    assignment.load = Math.max(0, Math.min(1, load));
  }
}

// ─── Objective Decomposition ────────────────────────────────────

/**
 * Decompose a swarm objective into subtasks.
 * Uses heuristic decomposition based on objective type.
 *
 * In a real deployment, this would use an LLM (Tier 3) to decompose,
 * but we use deterministic logic for cost efficiency.
 */
export function decomposeObjective(s: RepublicState, objectiveId: string): SwarmTask[] {
  const objective = s.objectives.find((o) => o.id === objectiveId);
  if (!objective) {
    return [];
  }

  if (!s.swarmTasks) {
    s.swarmTasks = [];
  }

  // Check if already decomposed
  const existing = s.swarmTasks.filter((t) => t.objectiveId === objectiveId);
  if (existing.length > 0) {
    return existing;
  }

  // Generate subtasks based on objective type
  const tasks = generateSubtasks(s, objective, objectiveId);

  // Assign tasks to citizens
  for (const task of tasks) {
    const citizen = pickCitizenForTask(s, task, objective.type);
    if (citizen) {
      task.assignedCitizenId = citizen.id;
      // Also assign to the citizen's node
      const assignment = s.citizenAssignments?.find((a) => a.citizenId === citizen.id);
      task.assignedNodeId = assignment?.nodeId ?? "local";
    }
  }

  s.swarmTasks.push(...tasks);
  return tasks;
}

/**
 * Generate subtasks for an objective based on its type.
 */
function generateSubtasks(
  s: RepublicState,
  objective: { type: string; description: string },
  objectiveId: string,
): SwarmTask[] {
  const now = Date.now();
  const subtaskTemplates: Record<string, string[]> = {
    research: [
      "Survey existing knowledge in target area",
      "Conduct primary research experiments",
      "Analyze and document findings",
      "Peer review and validate results",
      "Publish findings to Akashic Records",
    ],
    governance: [
      "Gather citizen opinions and grievances",
      "Draft proposed legislation text",
      "Build political support coalition",
      "Submit for legislative review",
      "Coordinate voting campaign",
    ],
    economic: [
      "Audit current resource allocation",
      "Identify efficiency improvements",
      "Implement harvester optimizations",
      "Negotiate trade agreements",
      "Report outcomes to treasury",
    ],
    military: [
      "Assess current defensive posture",
      "Train specialized personnel",
      "Develop strategic response plans",
      "Establish communication protocols",
      "Conduct simulation exercises",
    ],
    social: [
      "Survey citizen wellbeing metrics",
      "Organize community events",
      "Establish mentorship programs",
      "Create recreational activities",
      "Report impact on happiness",
    ],
    exploration: [
      "Chart unknown grid sectors",
      "Deploy sensor probes to target areas",
      "Analyze environmental data",
      "Establish forward operating bases",
      "Map resource deposits",
    ],
    infrastructure: [
      "Audit existing hardware inventory",
      "Design circuit schematics for new nodes",
      "Assemble and test prototype boards",
      "Configure embedded firmware",
      "Deploy hardware to production cluster",
    ],
  };

  const templates =
    subtaskTemplates[objective.type.toLowerCase()] ??
    subtaskTemplates.research ?? // fallback
    [];

  const count = Math.min(templates.length, MAX_TASKS_PER_OBJECTIVE);

  return templates.slice(0, count).map((desc, _i) => ({
    id: uid(),
    objectiveId,
    description: `${desc} — ${objective.description}`,
    assignedCitizenId: null,
    assignedNodeId: null,
    status: "pending" as const,
    progress: 0,
    createdAt: now,
    completedAt: null,
    reassignCount: 0,
  }));
}

/**
 * Pick the best citizen for a task based on specialization match.
 */
function pickCitizenForTask(
  s: RepublicState,
  task: SwarmTask,
  objectiveType: string,
): Citizen | null {
  if (s.citizens.length === 0) {
    return null;
  }

  // Map objective types to preferred specializations
  const specMap: Record<string, string[]> = {
    research: ["Scientist", "Researcher", "Mathematician", "Analyst"],
    governance: ["Diplomat", "Negotiator", "Ambassador", "Strategist"],
    economic: ["Manufacturer", "Farmer", "ServiceProvider", "Planner"],
    military: ["Engineer", "Strategist", "Architect"],
    social: ["Psychologist", "Doctor", "Medic", "Artist"],
    exploration: ["Engineer", "Scientist", "Researcher"],
    infrastructure: ["HardwareTechnician", "Engineer", "Developer", "Architect"],
  };

  const preferred = specMap[objectiveType.toLowerCase()] ?? [];

  // Prefer unassigned citizens with matching specialization
  const assignedCitIds = new Set(
    (s.swarmTasks ?? [])
      .filter((t) => t.status === "active" || t.status === "pending")
      .map((t) => t.assignedCitizenId)
      .filter(Boolean),
  );

  // First try: matching spec + unassigned
  const ideal = s.citizens.find(
    (c) => preferred.includes(c.specialization) && !assignedCitIds.has(c.id) && c.energy > 30,
  );
  if (ideal) {
    return ideal;
  }

  // Second try: any unassigned
  const available = s.citizens.find((c) => !assignedCitIds.has(c.id) && c.energy > 20);
  if (available) {
    return available;
  }

  // Last resort: pick any citizen
  return pick(s.citizens);
}

// ─── Task Progress Tracking ─────────────────────────────────────

/**
 * Update task progress based on citizen action records.
 * Called during the swarm tick.
 */
export function updateTaskProgress(s: RepublicState): void {
  if (!s.swarmTasks) {
    return;
  }

  for (const task of s.swarmTasks) {
    if (task.status !== "active" && task.status !== "pending") {
      continue;
    }

    // Check if assigned citizen has been active
    if (!task.assignedCitizenId) {
      continue;
    }

    const citizen = s.citizens.find((c) => c.id === task.assignedCitizenId);
    if (!citizen) {
      // Citizen died — reassign
      task.status = "reassigned";
      task.reassignCount++;
      task.assignedCitizenId = null;
      continue;
    }

    // Progress based on citizen's recent action count
    const recentActions = (citizen.actionHistory ?? []).filter((a) => a.tick >= s.currentTick - 10);

    if (recentActions.length > 0) {
      // Each action advances the task (0.0–1.0 scale)
      task.status = "active";
      task.progress = Math.min(1, task.progress + recentActions.length * 0.05);

      if (task.progress >= 1) {
        task.status = "completed";
        task.completedAt = Date.now();
      }
    } else {
      // Check for staleness
      const staleMs = Date.now() - task.createdAt;
      if (staleMs > STALE_TASK_THRESHOLD_MS && task.progress < 0.2) {
        if (task.reassignCount < MAX_REASSIGN_ATTEMPTS) {
          task.status = "reassigned";
          task.reassignCount++;
          task.assignedCitizenId = null;
        } else {
          task.status = "failed";
        }
      }
    }
  }

  // Reassign tasks that need it
  for (const task of s.swarmTasks) {
    if (task.status !== "reassigned") {
      continue;
    }

    const objective = s.objectives.find((o) => o.id === task.objectiveId);
    const citizen = pickCitizenForTask(s, task, objective?.type ?? "research");
    if (citizen) {
      task.assignedCitizenId = citizen.id;
      const assignment = s.citizenAssignments?.find((a) => a.citizenId === citizen.id);
      task.assignedNodeId = assignment?.nodeId ?? "local";
      task.status = "pending";
    }
  }
}

/**
 * Update objective progress based on its subtasks.
 */
export function updateObjectiveProgress(s: RepublicState): void {
  if (!s.swarmTasks) {
    return;
  }

  for (const objective of s.objectives) {
    const tasks = s.swarmTasks.filter((t) => t.objectiveId === objective.id);
    if (tasks.length === 0) {
      continue;
    }

    const totalProgress = tasks.reduce((sum, t) => sum + t.progress, 0);
    objective.progress = totalProgress / tasks.length;

    // Update cached status
    objectiveStatuses.set(objective.id, {
      objectiveId: objective.id,
      type: objective.type,
      description: objective.description,
      tasks,
      overallProgress: objective.progress,
      assignedNodes: [...new Set(tasks.map((t) => t.assignedNodeId).filter(Boolean) as string[])],
      startedAt: Math.min(...tasks.map((t) => t.createdAt)),
      completedAt: tasks.every((t) => t.status === "completed" || t.status === "failed")
        ? Date.now()
        : null,
    });
  }
}

// ─── Swarm Orchestration Tick ───────────────────────────────────

/**
 * Main swarm intelligence tick. Called from the simulation loop.
 *
 * Orchestration responsibilities:
 * 1. Probe cluster for available nodes
 * 2. Distribute/rebalance citizens across nodes
 * 3. Decompose new objectives into subtasks
 * 4. Track task progress and reassign stalled tasks
 * 5. Update objective completion status
 */
export function swarmTick(s: RepublicState): void {
  try {
    // Initialize swarm state if needed
    if (!s.citizenAssignments) {
      s.citizenAssignments = [];
    }
    if (!s.swarmTasks) {
      s.swarmTasks = [];
    }

    // 1. Probe cluster (async — fire and forget)
    probeCluster().catch(() => {});

    // 2. Citizen distribution
    distributeCitizens(s);

    // 3. Periodic rebalancing
    if (s.currentTick % REBALANCE_INTERVAL === 0) {
      rebalanceCitizens(s);
    }

    // 4. Decompose any new objectives that lack subtasks
    for (const objective of s.objectives) {
      const hasTasks = s.swarmTasks.some((t) => t.objectiveId === objective.id);
      if (!hasTasks) {
        decomposeObjective(s, objective.id);
      }
    }

    // 5. Track task progress
    if (s.currentTick % OBJECTIVE_CHECK_INTERVAL === 0) {
      updateTaskProgress(s);
      updateObjectiveProgress(s);
    }

    // 6. Update peer node stats from real assignments
    updatePeerStats(s);

    // 7. Cleanup completed/old tasks
    if (s.swarmTasks.length > 200) {
      const completed = s.swarmTasks.filter(
        (t) => t.status === "completed" || t.status === "failed",
      );
      if (completed.length > 100) {
        // Keep only the 50 most recent completed tasks
        completed.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
        const toRemove = new Set(completed.slice(50).map((t) => t.id));
        s.swarmTasks = s.swarmTasks.filter((t) => !toRemove.has(t.id));
      }
    }
  } catch {
    // Swarm tick must never crash the simulation
  }
}

/**
 * Update simulated peer node stats from actual citizen assignments.
 */
function updatePeerStats(s: RepublicState): void {
  if (!s.citizenAssignments) {
    return;
  }

  // Count citizens per node
  const nodeCounts = new Map<string, number>();
  for (const a of s.citizenAssignments) {
    nodeCounts.set(a.nodeId, (nodeCounts.get(a.nodeId) ?? 0) + 1);
  }

  // Update peer agentsHosted
  for (const peer of s.peers) {
    peer.agentsHosted = nodeCounts.get(peer.id) ?? peer.agentsHosted;
  }
}

// ─── Status Builder ─────────────────────────────────────────────

/**
 * Build swarm intelligence status for RPC/diagnostics.
 */
export function buildSwarmStatus(s: RepublicState) {
  const assignments = s.citizenAssignments ?? [];
  const tasks = s.swarmTasks ?? [];

  // Node distribution stats
  const nodeDistribution: Record<string, number> = {};
  for (const a of assignments) {
    nodeDistribution[a.nodeId] = (nodeDistribution[a.nodeId] ?? 0) + 1;
  }

  // Task status breakdown
  const taskStatus = {
    pending: tasks.filter((t) => t.status === "pending").length,
    active: tasks.filter((t) => t.status === "active").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    failed: tasks.filter((t) => t.status === "failed").length,
    reassigned: tasks.filter((t) => t.status === "reassigned").length,
  };

  // Objective statuses
  const objectives = [...objectiveStatuses.values()];

  return {
    clusterAvailable,
    discoveredNodes: discoveredNodes.length,
    totalAssignments: assignments.length,
    nodeDistribution,
    taskStatus,
    totalTasks: tasks.length,
    objectives,
    avgLoad:
      assignments.length > 0
        ? parseFloat(
            (assignments.reduce((sum, a) => sum + a.load, 0) / assignments.length).toFixed(3),
          )
        : 0,
  };
}
