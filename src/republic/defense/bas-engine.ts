/**
 * Breach & Attack Simulation (BAS) Engine
 *
 * Automated red team exercise management:
 *   1. Takes attack scenarios from HPICS red-team-executor
 *   2. Simulates kill-chain execution in sandboxed republic context
 *   3. Tracks attack phases: reconnaissance → weaponization → delivery →
 *      exploitation → installation → C2 → actions-on-objectives
 *   4. Validates patch effectiveness via re-scan
 *   5. Feeds results into purple team loop for defense improvement
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AttackScenario {
  id: string;
  cveId: string;
  targetPlatform: string;
  attackScenario: {
    entryVector: string;
    mitreSteps: string[];
    persistence: string;
    exfiltration: string;
    indicators: string[];
  };
  defensePlan: {
    patches: string[];
    configChanges: string[];
    monitoringRules: string[];
  };
  exploitChain: Array<{
    phase: string;
    technique: string;
    detectability: "low" | "medium" | "high";
  }>;
  patchChecklist: string[];
  priority: "critical" | "high" | "medium" | "low";
  status: "pending" | "simulating" | "completed" | "patched" | "validated";
  createdAt: number;
}

export interface SimulationResult {
  scenarioId: string;
  phases: Array<{
    phase: string;
    technique: string;
    simulated: boolean;
    detected: boolean;
    blocked: boolean;
    evasionSuccessful: boolean;
  }>;
  overallResult: "attack_succeeded" | "attack_detected" | "attack_blocked";
  detectionRate: number; // 0-1
  blockRate: number; // 0-1
  recommendations: string[];
  simulatedAt: number;
}

export interface ExerciseRecord {
  id: string;
  name: string;
  scenarios: string[];
  results: SimulationResult[];
  redTeamUnit: string[];
  startedAt: number;
  completedAt: number | null;
  overallScore: number; // 0-100 defense effectiveness
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const scenarioStore = new Map<string, AttackScenario>();
const simulationResults = new Map<string, SimulationResult>();
const exerciseHistory: ExerciseRecord[] = [];

// ─── Scenario Management ────────────────────────────────────────────────────

/**
 * Register an attack scenario from HPICS red-team-executor output.
 */
export function registerScenario(data: {
  cveId: string;
  targetPlatform: string;
  attackScenario?: unknown;
  defensePlan?: unknown;
  exploitChain?: unknown;
  patchChecklist?: unknown;
  priority?: string;
}): AttackScenario {
  const id = `BAS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const scenario: AttackScenario = {
    id,
    cveId: data.cveId,
    targetPlatform: data.targetPlatform,
    attackScenario: (data.attackScenario as AttackScenario["attackScenario"]) ?? {
      entryVector: "unknown",
      mitreSteps: [],
      persistence: "unknown",
      exfiltration: "unknown",
      indicators: [],
    },
    defensePlan: (data.defensePlan as AttackScenario["defensePlan"]) ?? {
      patches: [],
      configChanges: [],
      monitoringRules: [],
    },
    exploitChain: (data.exploitChain as AttackScenario["exploitChain"]) ?? [],
    patchChecklist: (data.patchChecklist as string[]) ?? [],
    priority: (data.priority ?? "medium") as AttackScenario["priority"],
    status: "pending",
    createdAt: Date.now(),
  };

  scenarioStore.set(id, scenario);
  return scenario;
}

/**
 * Simulate a scenario's kill chain against republic defenses.
 * Each phase is checked: detected? blocked? evaded?
 */
export function simulateScenario(scenarioId: string): SimulationResult | null {
  const scenario = scenarioStore.get(scenarioId);
  if (!scenario) { return null; }

  scenario.status = "simulating";

  const phases: SimulationResult["phases"] = scenario.exploitChain.map(step => {
    // Defense effectiveness is based on detectability and whether monitoring rules exist
    const hasMonitoring = scenario.defensePlan.monitoringRules.length > 0;
    const detectionChance =
      step.detectability === "high" ? 0.90 :
      step.detectability === "medium" ? 0.60 : 0.30;

    // Deterministic detection based on monitoring rules and detectability
    const detected = hasMonitoring && detectionChance > 0.5;
    const blocked = detected && scenario.defensePlan.patches.length > 0;

    return {
      phase: step.phase,
      technique: step.technique,
      simulated: true,
      detected,
      blocked,
      evasionSuccessful: !detected,
    };
  });

  const totalPhases = Math.max(phases.length, 1);
  const detected = phases.filter(p => p.detected).length;
  const blocked = phases.filter(p => p.blocked).length;

  const result: SimulationResult = {
    scenarioId,
    phases,
    overallResult:
      blocked === totalPhases ? "attack_blocked" :
      detected > totalPhases / 2 ? "attack_detected" :
      "attack_succeeded",
    detectionRate: detected / totalPhases,
    blockRate: blocked / totalPhases,
    recommendations: generateRecommendations(scenario, phases),
    simulatedAt: Date.now(),
  };

  simulationResults.set(scenarioId, result);
  scenario.status = "completed";

  return result;
}

function generateRecommendations(
  scenario: AttackScenario,
  phases: SimulationResult["phases"],
): string[] {
  const recs: string[] = [];

  const undetected = phases.filter(p => !p.detected);
  if (undetected.length > 0) {
    recs.push(`Add monitoring rules for ${undetected.length} undetected phases: ${undetected.map(p => p.technique).join(", ")}`);
  }

  if (scenario.defensePlan.patches.length === 0) {
    recs.push(`Apply patches for ${scenario.cveId}: no patches currently deployed`);
  }

  if (scenario.defensePlan.configChanges.length > 0) {
    recs.push(`Apply ${scenario.defensePlan.configChanges.length} configuration hardening changes`);
  }

  const lowDetect = phases.filter(p => !p.detected);
  if (lowDetect.length > phases.length / 2) {
    recs.push(`CRITICAL: Detection coverage below 50% — high risk of undetected compromise`);
  }

  return recs;
}

/**
 * Mark a scenario as patched.
 */
export function markPatched(scenarioId: string): boolean {
  const scenario = scenarioStore.get(scenarioId);
  if (!scenario) { return false; }
  scenario.status = "patched";
  return true;
}

/**
 * Validate that a patch is effective by re-simulating.
 */
export function validatePatch(scenarioId: string): SimulationResult | null {
  const scenario = scenarioStore.get(scenarioId);
  if (!scenario || scenario.status !== "patched") { return null; }

  // With patches applied, detection and blocking should improve
  const result = simulateScenario(scenarioId);
  if (result && result.blockRate > 0.8) {
    scenario.status = "validated";
  }
  return result;
}

// ─── Exercise Management ─────────────────────────────────────────────────────

/**
 * Run a red team exercise with multiple scenarios.
 */
export function runExercise(params: {
  name: string;
  scenarioIds: string[];
  redTeamUnit: string[];
}): ExerciseRecord {
  const results: SimulationResult[] = [];

  for (const id of params.scenarioIds) {
    const result = simulateScenario(id);
    if (result) { results.push(result); }
  }

  const avgDetection = results.length > 0
    ? results.reduce((a, r) => a + r.detectionRate, 0) / results.length
    : 0;

  const exercise: ExerciseRecord = {
    id: `EX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: params.name,
    scenarios: params.scenarioIds,
    results,
    redTeamUnit: params.redTeamUnit,
    startedAt: Date.now(),
    completedAt: Date.now(),
    overallScore: Math.round(avgDetection * 100),
  };

  exerciseHistory.push(exercise);
  if (exerciseHistory.length > 100) {
    exerciseHistory.splice(0, exerciseHistory.length - 100);
  }

  return exercise;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export function getBASOverview(): {
  totalScenarios: number;
  pending: number;
  completed: number;
  patched: number;
  validated: number;
  avgDetectionRate: number;
  avgBlockRate: number;
  exercisesRun: number;
  lastExerciseScore: number | null;
} {
  let pending = 0, completed = 0, patched = 0, validated = 0;
  for (const s of scenarioStore.values()) {
    if (s.status === "pending") { pending++; }
    else if (s.status === "completed") { completed++; }
    else if (s.status === "patched") { patched++; }
    else if (s.status === "validated") { validated++; }
  }

  const results = [...simulationResults.values()];
  const avgDetection = results.length > 0
    ? results.reduce((a, r) => a + r.detectionRate, 0) / results.length
    : 0;
  const avgBlock = results.length > 0
    ? results.reduce((a, r) => a + r.blockRate, 0) / results.length
    : 0;

  const lastExercise = exerciseHistory.length > 0
    ? exerciseHistory[exerciseHistory.length - 1]!
    : null;

  return {
    totalScenarios: scenarioStore.size,
    pending,
    completed,
    patched,
    validated,
    avgDetectionRate: avgDetection,
    avgBlockRate: avgBlock,
    exercisesRun: exerciseHistory.length,
    lastExerciseScore: lastExercise?.overallScore ?? null,
  };
}

export function getScenarios(filter?: {
  status?: string;
  priority?: string;
  limit?: number;
}): AttackScenario[] {
  let scenarios = [...scenarioStore.values()];
  if (filter?.status) { scenarios = scenarios.filter(s => s.status === filter.status); }
  if (filter?.priority) { scenarios = scenarios.filter(s => s.priority === filter.priority); }
  scenarios.sort((a, b) => b.createdAt - a.createdAt);
  return scenarios.slice(0, filter?.limit ?? 50);
}

export function getExerciseHistory(limit = 20): ExerciseRecord[] {
  return exerciseHistory.slice(-limit);
}
