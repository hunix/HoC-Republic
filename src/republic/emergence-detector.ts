/**
 * Republic Platform — Emergent Behavior Evaluation Framework
 *
 * Phase 38: MAEBE + AgentSociety-inspired emergence detection.
 *
 * Detects, classifies, and measures emergent social phenomena:
 * coalition formation, information cascades, norm emergence,
 * cooperation/defection dynamics, and social influence networks.
 *
 * Research basis:
 * - MAEBE (arXiv 2025): Multi-agent emergent behavior evaluation
 * - AgentSociety (arXiv 2024): Large-scale social interaction simulation
 * - NeurIPS 2024 "Cooperate or Collapse": LLM agent cooperation dynamics
 *
 * Key capabilities:
 * 1. Coalition detection (clusters of aligned citizens)
 * 2. Information cascade tracking
 * 3. Norm emergence detection (unwritten social rules)
 * 4. Cooperation/defection ratio tracking
 * 5. Social network influence graph
 * 6. emergenceTick() — tick loop integration
 */

import { nationalEventBus } from "./event-sourcing.js";
import { ts, uid } from "./utils.js";

// ─── Coalition Detection ────────────────────────────────────────

export interface Coalition {
  id: string;
  /** Member citizen IDs */
  members: string[];
  /** What binds them (shared behavior pattern) */
  bindingPattern: string;
  /** Strength of coalition (0.0–1.0) */
  cohesion: number;
  /** When detected */
  detectedAtTick: number;
  /** Whether still active */
  active: boolean;
  /** Duration in ticks */
  durationTicks: number;
  /** Timestamp */
  timestamp: string;
}

// ─── Information Cascade ────────────────────────────────────────

export interface InformationCascade {
  id: string;
  /** The idea/opinion spreading */
  content: string;
  /** Category */
  category: "opinion" | "knowledge" | "behavior" | "trend";
  /** Origin citizen */
  originCitizenId: string;
  /** Citizens who adopted so far, in order */
  adoptionChain: Array<{ citizenId: string; tick: number }>;
  /** Speed: adoptions per tick */
  velocity: number;
  /** Whether still spreading */
  active: boolean;
  /** Tick when started */
  startTick: number;
  /** Timestamp */
  timestamp: string;
}

// ─── Norm Emergence ─────────────────────────────────────────────

export interface EmergentNorm {
  id: string;
  /** Description of the norm */
  description: string;
  /** How many citizens follow it */
  adherents: number;
  /** Total citizens observed */
  totalObserved: number;
  /** Compliance rate (adherents / totalObserved) */
  complianceRate: number;
  /** Whether this is a positive or negative norm */
  polarity: "positive" | "negative" | "neutral";
  /** First observed tick */
  firstObservedTick: number;
  /** Stability: how long it's been consistent */
  stabilityTicks: number;
  /** Timestamp */
  timestamp: string;
}

// ─── Cooperation Dynamics ───────────────────────────────────────

export interface CooperationMetrics {
  /** Total cooperative actions observed */
  cooperativeActions: number;
  /** Total defection actions observed */
  defectionActions: number;
  /** Cooperation ratio (0.0–1.0) */
  cooperationRatio: number;
  /** Trending direction */
  trend: "increasing" | "decreasing" | "stable";
  /** Per-tick cooperation history */
  history: Array<{ tick: number; ratio: number }>;
}

// ─── Social Influence Graph ─────────────────────────────────────

export interface InfluenceNode {
  citizenId: string;
  /** Influence score (eigenvector-centrality-inspired) */
  influenceScore: number;
  /** Citizens influenced by this one */
  influencedCitizens: string[];
  /** Citizens who influence this one */
  influencedBy: string[];
  /** Number of cascades originated */
  cascadesOriginated: number;
}

// ─── State ──────────────────────────────────────────────────────

const coalitions: Coalition[] = [];
const cascades: InformationCascade[] = [];
const norms: EmergentNorm[] = [];
const influenceGraph = new Map<string, InfluenceNode>();

const cooperationState: CooperationMetrics = {
  cooperativeActions: 0,
  defectionActions: 0,
  cooperationRatio: 0.5,
  trend: "stable",
  history: [],
};

/** Raw behavior observations for pattern detection */
const behaviorLog: Array<{
  citizenId: string;
  behavior: string;
  tick: number;
}> = [];

const MAX_COALITIONS = 100;
const MAX_CASCADES = 200;
const MAX_NORMS = 50;
const MAX_BEHAVIOR_LOG = 5000;
const COALITION_DETECTION_INTERVAL = 50;
const CASCADE_CHECK_INTERVAL = 10;
const NORM_DETECTION_INTERVAL = 100;

// ─── Behavior Logging ───────────────────────────────────────────

/** Log a citizen behavior for pattern detection */
export function logBehavior(citizenId: string, behavior: string, tick: number): void {
  behaviorLog.push({ citizenId, behavior, tick });
  while (behaviorLog.length > MAX_BEHAVIOR_LOG) {
    behaviorLog.shift();
  }
}

/** Log a cooperative action */
export function logCooperation(citizenId: string, partnerId: string, tick: number): void {
  cooperationState.cooperativeActions++;
  logBehavior(citizenId, `cooperate:${partnerId}`, tick);
  updateInfluenceEdge(citizenId, partnerId);
}

/** Log a defection (selfish action) */
export function logDefection(citizenId: string, tick: number): void {
  cooperationState.defectionActions++;
  logBehavior(citizenId, "defect", tick);
}

// ─── Coalition Detection ────────────────────────────────────────

/**
 * Detect coalitions from recent behavior patterns.
 *
 * Citizens who exhibit similar behaviors within a time window
 * are grouped into potential coalitions.
 */
function detectCoalitions(currentTick: number): void {
  const window = 50;
  const recentBehaviors = behaviorLog.filter((b) => b.tick > currentTick - window);

  if (recentBehaviors.length < 5) {
    return;
  }

  // Group citizens by behavior pattern
  const behaviorGroups = new Map<string, Set<string>>();
  for (const entry of recentBehaviors) {
    // Extract base behavior (e.g., "cooperate" from "cooperate:citizen-123")
    const baseBehavior = entry.behavior.split(":")[0];
    const group = behaviorGroups.get(baseBehavior) ?? new Set();
    group.add(entry.citizenId);
    behaviorGroups.set(baseBehavior, group);
  }

  // Coalitions = groups of 3+ citizens with shared behavior
  for (const [behavior, members] of behaviorGroups) {
    if (members.size < 3) {
      continue;
    }

    const memberArray = [...members];

    // Check if this coalition already exists
    const existing = coalitions.find(
      (c) =>
        c.active &&
        c.bindingPattern === behavior &&
        memberArray.length >= c.members.length * 0.7 &&
        memberArray.filter((m) => c.members.includes(m)).length >= c.members.length * 0.5,
    );

    if (existing) {
      existing.members = memberArray;
      existing.durationTicks = currentTick - existing.detectedAtTick;
      existing.cohesion = Math.min(1, members.size / 10);
    } else {
      coalitions.push({
        id: `coal-${uid().slice(0, 8)}`,
        members: memberArray,
        bindingPattern: behavior,
        cohesion: Math.min(1, members.size / 10),
        detectedAtTick: currentTick,
        active: true,
        durationTicks: 0,
        timestamp: ts(),
      });

      while (coalitions.length > MAX_COALITIONS) {
        coalitions.shift();
      }
    }
  }

  // Deactivate stale coalitions
  for (const coalition of coalitions) {
    if (
      coalition.active &&
      currentTick - coalition.detectedAtTick - coalition.durationTicks > window
    ) {
      coalition.active = false;
    }
  }
}

// ─── Information Cascade Tracking ───────────────────────────────

/**
 * Record a new idea/behavior spreading from one citizen to another.
 */
export function recordCascadeAdoption(
  content: string,
  category: InformationCascade["category"],
  adopterId: string,
  sourceCitizenId: string,
  tick: number,
): void {
  // Find existing cascade for this content
  let cascade = cascades.find((c) => c.content === content && c.active);

  if (!cascade) {
    cascade = {
      id: `casc-${uid().slice(0, 8)}`,
      content,
      category,
      originCitizenId: sourceCitizenId,
      adoptionChain: [{ citizenId: sourceCitizenId, tick }],
      velocity: 0,
      active: true,
      startTick: tick,
      timestamp: ts(),
    };
    cascades.push(cascade);
    while (cascades.length > MAX_CASCADES) {
      cascades.shift();
    }

    // Update influence score for originator
    updateInfluenceOrigination(sourceCitizenId);
  }

  // Add adopter if not already in chain
  if (!cascade.adoptionChain.some((a) => a.citizenId === adopterId)) {
    cascade.adoptionChain.push({ citizenId: adopterId, tick });
    updateInfluenceEdge(sourceCitizenId, adopterId);
  }

  // Recalculate velocity
  const elapsed = tick - cascade.startTick;
  cascade.velocity = elapsed > 0 ? cascade.adoptionChain.length / elapsed : 0;
}

/** Deactivate stale cascades */
function pruneInactiveCascades(currentTick: number): void {
  for (const cascade of cascades) {
    if (!cascade.active) {
      continue;
    }
    const lastAdoption = cascade.adoptionChain.at(-1);
    if (lastAdoption && currentTick - lastAdoption.tick > 100) {
      cascade.active = false;
    }
  }
}

// ─── Norm Emergence Detection ───────────────────────────────────

/**
 * Detect norms from repeated behavior patterns across citizens.
 *
 * A norm is detected when >50% of observed citizens exhibit
 * the same behavior pattern consistently over time.
 */
function detectNorms(currentTick: number): void {
  const window = 200;
  const recentBehaviors = behaviorLog.filter((b) => b.tick > currentTick - window);

  if (recentBehaviors.length < 20) {
    return;
  }

  // Count behavior frequency per citizen
  const citizenBehaviors = new Map<string, Map<string, number>>();
  for (const entry of recentBehaviors) {
    const baseBehavior = entry.behavior.split(":")[0];
    const citizen = citizenBehaviors.get(entry.citizenId) ?? new Map();
    citizen.set(baseBehavior, (citizen.get(baseBehavior) ?? 0) + 1);
    citizenBehaviors.set(entry.citizenId, citizen);
  }

  // Find behaviors that are common across many citizens
  const behaviorAdherents = new Map<string, Set<string>>();
  for (const [citizenId, behaviors] of citizenBehaviors) {
    for (const [behavior, count] of behaviors) {
      if (count >= 3) {
        // Citizen must have done it at least 3 times
        const adherents = behaviorAdherents.get(behavior) ?? new Set();
        adherents.add(citizenId);
        behaviorAdherents.set(behavior, adherents);
      }
    }
  }

  const totalObserved = citizenBehaviors.size;

  for (const [behavior, adherents] of behaviorAdherents) {
    const complianceRate = adherents.size / totalObserved;

    if (complianceRate < 0.3) {
      continue; // Not widespread enough
    }

    // Check if norm already detected
    const existing = norms.find((n) => n.description === behavior);
    if (existing) {
      existing.adherents = adherents.size;
      existing.totalObserved = totalObserved;
      existing.complianceRate = complianceRate;
      existing.stabilityTicks = currentTick - existing.firstObservedTick;
    } else {
      const polarity =
        behavior.startsWith("cooperate") || behavior.startsWith("help")
          ? ("positive" as const)
          : behavior.startsWith("defect") || behavior.startsWith("cheat")
            ? ("negative" as const)
            : ("neutral" as const);

      norms.push({
        id: `norm-${uid().slice(0, 8)}`,
        description: behavior,
        adherents: adherents.size,
        totalObserved,
        complianceRate,
        polarity,
        firstObservedTick: currentTick,
        stabilityTicks: 0,
        timestamp: ts(),
      });

      while (norms.length > MAX_NORMS) {
        norms.shift();
      }
    }
  }
}

// ─── Social Influence Graph ─────────────────────────────────────

function getOrCreateInfluenceNode(citizenId: string): InfluenceNode {
  let node = influenceGraph.get(citizenId);
  if (!node) {
    node = {
      citizenId,
      influenceScore: 0,
      influencedCitizens: [],
      influencedBy: [],
      cascadesOriginated: 0,
    };
    influenceGraph.set(citizenId, node);
  }
  return node;
}

function updateInfluenceEdge(influencerId: string, influenceeId: string): void {
  if (influencerId === influenceeId) {
    return;
  }
  const influencer = getOrCreateInfluenceNode(influencerId);
  const influencee = getOrCreateInfluenceNode(influenceeId);

  if (!influencer.influencedCitizens.includes(influenceeId)) {
    influencer.influencedCitizens.push(influenceeId);
  }
  if (!influencee.influencedBy.includes(influencerId)) {
    influencee.influencedBy.push(influencerId);
  }

  // Recalculate influence score (simplified PageRank-like)
  influencer.influenceScore = Math.min(1, influencer.influencedCitizens.length * 0.1);
}

function updateInfluenceOrigination(citizenId: string): void {
  const node = getOrCreateInfluenceNode(citizenId);
  node.cascadesOriginated++;
  node.influenceScore = Math.min(1, node.influenceScore + 0.05);
}

/** Get top influencers */
export function getTopInfluencers(limit = 10): InfluenceNode[] {
  return [...influenceGraph.values()]
    .toSorted((a, b) => b.influenceScore - a.influenceScore)
    .slice(0, limit);
}

/** Get influence node for a citizen */
export function getInfluenceNode(citizenId: string): InfluenceNode | undefined {
  return influenceGraph.get(citizenId);
}

// ─── Cooperation Tracking ───────────────────────────────────────

function updateCooperationMetrics(currentTick: number): void {
  const total = cooperationState.cooperativeActions + cooperationState.defectionActions;
  cooperationState.cooperationRatio = total > 0 ? cooperationState.cooperativeActions / total : 0.5;

  // Track history
  cooperationState.history.push({ tick: currentTick, ratio: cooperationState.cooperationRatio });
  while (cooperationState.history.length > 200) {
    cooperationState.history.shift();
  }

  // Determine trend
  if (cooperationState.history.length >= 10) {
    const recent = cooperationState.history.slice(-10);
    const older = cooperationState.history.slice(-20, -10);
    if (older.length > 0) {
      const recentAvg = recent.reduce((sum, h) => sum + h.ratio, 0) / recent.length;
      const olderAvg = older.reduce((sum, h) => sum + h.ratio, 0) / older.length;
      const diff = recentAvg - olderAvg;
      cooperationState.trend = diff > 0.05 ? "increasing" : diff < -0.05 ? "decreasing" : "stable";
    }
  }
}

/** Get current cooperation metrics */
export function getCooperationMetrics(): CooperationMetrics {
  return { ...cooperationState };
}

// ─── Getters ────────────────────────────────────────────────────

/** Get active coalitions */
export function getActiveCoalitions(): Coalition[] {
  return coalitions.filter((c) => c.active);
}

/** Get all coalitions (including inactive) */
export function getAllCoalitions(): Coalition[] {
  return [...coalitions];
}

/** Get active cascades */
export function getActiveCascades(): InformationCascade[] {
  return cascades.filter((c) => c.active);
}

/** Get detected norms */
export function getEmergentNorms(): EmergentNorm[] {
  return [...norms];
}

// ─── Tick Integration ───────────────────────────────────────────

export interface EmergenceTickResult {
  activeCoalitions: number;
  activeCascades: number;
  detectedNorms: number;
  cooperationRatio: number;
}

/**
 * Per-tick maintenance for emergence detection.
 *
 * - Detect coalitions periodically
 * - Prune inactive cascades
 * - Detect norms periodically
 * - Update cooperation metrics
 */
export function emergenceTick(currentTick: number): EmergenceTickResult {
  // Coalition detection
  if (currentTick > 0 && currentTick % COALITION_DETECTION_INTERVAL === 0) {
    detectCoalitions(currentTick);
  }

  // Cascade pruning
  if (currentTick > 0 && currentTick % CASCADE_CHECK_INTERVAL === 0) {
    pruneInactiveCascades(currentTick);
  }

  // Norm detection
  if (currentTick > 0 && currentTick % NORM_DETECTION_INTERVAL === 0) {
    detectNorms(currentTick);
  }

  // Cooperation metrics
  updateCooperationMetrics(currentTick);

  return {
    activeCoalitions: coalitions.filter((c) => c.active).length,
    activeCascades: cascades.filter((c) => c.active).length,
    detectedNorms: norms.length,
    cooperationRatio: cooperationState.cooperationRatio,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function emergenceDiagnostics() {
  return {
    totalCoalitions: coalitions.length,
    activeCoalitions: coalitions.filter((c) => c.active).length,
    totalCascades: cascades.length,
    activeCascades: cascades.filter((c) => c.active).length,
    detectedNorms: norms.length,
    cooperationRatio: cooperationState.cooperationRatio,
    cooperationTrend: cooperationState.trend,
    influenceGraphSize: influenceGraph.size,
    topInfluencers: getTopInfluencers(3).map((n) => ({
      citizen: n.citizenId,
      score: n.influenceScore.toFixed(3),
    })),
    behaviorLogSize: behaviorLog.length,
  };
}

/** Reset emergence state (for testing) */
export function resetEmergenceState(): void {
  coalitions.length = 0;
  cascades.length = 0;
  norms.length = 0;
  influenceGraph.clear();
  cooperationState.cooperativeActions = 0;
  cooperationState.defectionActions = 0;
  cooperationState.cooperationRatio = 0.5;
  cooperationState.trend = "stable";
  cooperationState.history.length = 0;
  behaviorLog.length = 0;
}

// ─── Event Bus Integration ──────────────────────────────────────

let _subscribed = false;

/**
 * Wire the national event bus into the emergence detector.
 *
 * This subscribes to relevant event categories and automatically
 * feeds citizen actions into the emergence behavior log, enabling
 * coalition detection, norm emergence, and cooperation tracking
 * to work from real republic events rather than only explicit calls.
 */
export function initEmergenceSubscriptions(): void {
  if (_subscribed) {return;}
  _subscribed = true;

  // Population events → behavior logging
  nationalEventBus.subscribe(
    (event) => {
      const tick = event.tick ?? 0;
      const citizenId = event.citizenId ?? (event.payload.citizenId as string) ?? "unknown";
      logBehavior(citizenId, event.type, tick);
    },
    { category: "population" },
  );

  // Economic events → cooperation/defection tracking
  nationalEventBus.subscribe(
    (event) => {
      const tick = event.tick ?? 0;
      const citizenId = event.citizenId ?? "unknown";
      if (event.type === "trade" || event.type === "service_provided") {
        const partnerId = (event.payload.partnerId ?? event.payload.targetId ?? "") as string;
        if (partnerId) {
          logCooperation(citizenId, partnerId, tick);
        }
      } else {
        logBehavior(citizenId, `economy:${event.type}`, tick);
      }
    },
    { category: "economy" },
  );

  // Governance events → behavior logging
  nationalEventBus.subscribe(
    (event) => {
      const tick = event.tick ?? 0;
      const citizenId = event.citizenId ?? "unknown";
      logBehavior(citizenId, `governance:${event.type}`, tick);
    },
    { category: "governance" },
  );
}
