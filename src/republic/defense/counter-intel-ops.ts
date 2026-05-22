/**
 * Counter-Intelligence Operations Engine
 *
 * Proactive detection of threats targeting the Republic:
 *   - Canary data deployment & access monitoring
 *   - Insider threat detection (anomaly flags on citizen actions)
 *   - Deception layer (deliberate misinformation to detect leaks)
 *   - CI operation lifecycle: detect → investigate → neutralize → report
 *
 * Integrated with:
 *   - HPICS insider-threat-matrix-engine
 *   - HPICS social-engineering-detector
 *   - Behavioral baseline engine (anomaly events)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CanaryData {
  id: string;
  type: "document" | "credential" | "endpoint" | "data_fragment";
  description: string;
  payload: string; // The canary content
  deployedTo: string[]; // Citizen IDs or system locations
  accessLog: CanaryAccess[];
  status: "active" | "triggered" | "retired";
  createdAt: number;
}

export interface CanaryAccess {
  accessedBy: string;
  accessedAt: number;
  context: string; // Where/how was it accessed
  suspicious: boolean;
}

export interface CIOperation {
  id: string;
  codename: string;
  type: "insider_threat" | "leak_detection" | "social_engineering" | "probing" | "exfiltration";
  phase: "detection" | "investigation" | "neutralization" | "reporting" | "closed";
  targetCitizenId: string | null;
  evidence: CIEvidence[];
  assignedTo: string; // Agent ID (usually GHOST)
  confidence: number; // 0-1
  priority: "critical" | "high" | "medium" | "low";
  findings: string;
  createdAt: number;
  updatedAt: number;
}

export interface CIEvidence {
  id: string;
  type: "anomaly" | "canary_trigger" | "access_violation" | "behavioral" | "external";
  description: string;
  data: unknown;
  confidence: number;
  timestamp: number;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const canaries = new Map<string, CanaryData>();
const operations = new Map<string, CIOperation>();

// ─── Canary Operations ───────────────────────────────────────────────────────

/**
 * Deploy a canary (honeypot data) to detect unauthorized access.
 */
export function deployCanary(params: {
  type: CanaryData["type"];
  description: string;
  payload: string;
  deployedTo: string[];
}): CanaryData {
  const id = `CAN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const canary: CanaryData = {
    id,
    type: params.type,
    description: params.description,
    payload: params.payload,
    deployedTo: params.deployedTo,
    accessLog: [],
    status: "active",
    createdAt: Date.now(),
  };

  canaries.set(id, canary);
  return canary;
}

/**
 * Record access to a canary.
 */
export function recordCanaryAccess(canaryId: string, params: {
  accessedBy: string;
  context: string;
  suspicious: boolean;
}): boolean {
  const canary = canaries.get(canaryId);
  if (!canary || canary.status !== "active") { return false; }

  canary.accessLog.push({
    accessedBy: params.accessedBy,
    accessedAt: Date.now(),
    context: params.context,
    suspicious: params.suspicious,
  });

  if (params.suspicious) {
    canary.status = "triggered";
    // Auto-create a CI operation
    createOperation({
      type: "leak_detection",
      targetCitizenId: params.accessedBy,
      evidence: [{
        type: "canary_trigger",
        description: `Canary "${canary.description}" triggered by ${params.accessedBy}`,
        data: { canaryId, context: params.context },
        confidence: 0.85,
      }],
      priority: "high",
    });
  }

  return true;
}

/**
 * Retire a canary.
 */
export function retireCanary(canaryId: string): boolean {
  const canary = canaries.get(canaryId);
  if (!canary) { return false; }
  canary.status = "retired";
  return true;
}

export function listCanaries(filter?: { status?: string; limit?: number }): CanaryData[] {
  let list = [...canaries.values()];
  if (filter?.status) { list = list.filter(c => c.status === filter.status); }
  return list.slice(0, filter?.limit ?? 50);
}

// ─── CI Operations ───────────────────────────────────────────────────────────

/**
 * Create a new counter-intelligence operation.
 */
export function createOperation(params: {
  type: CIOperation["type"];
  targetCitizenId?: string | null;
  evidence: Array<{
    type: CIEvidence["type"];
    description: string;
    data: unknown;
    confidence: number;
  }>;
  priority?: CIOperation["priority"];
}): CIOperation {
  const id = `CI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const codename = generateCodename();

  const evidence: CIEvidence[] = params.evidence.map(e => ({
    id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...e,
    timestamp: Date.now(),
  }));

  const avgConfidence = evidence.length > 0
    ? evidence.reduce((a, e) => a + e.confidence, 0) / evidence.length
    : 0;

  const op: CIOperation = {
    id,
    codename,
    type: params.type,
    phase: "detection",
    targetCitizenId: params.targetCitizenId ?? null,
    evidence,
    assignedTo: "HpicsCounterIntel", // GHOST
    confidence: avgConfidence,
    priority: params.priority ?? "medium",
    findings: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  operations.set(id, op);
  return op;
}

/**
 * Advance a CI operation to the next phase.
 */
export function advanceOperation(opId: string, findings?: string): boolean {
  const op = operations.get(opId);
  if (!op) { return false; }

  const phaseOrder: CIOperation["phase"][] = [
    "detection", "investigation", "neutralization", "reporting", "closed",
  ];
  const currentIdx = phaseOrder.indexOf(op.phase);
  if (currentIdx >= phaseOrder.length - 1) { return false; }

  op.phase = phaseOrder[currentIdx + 1]!;
  if (findings) { op.findings += `\n[${op.phase}] ${findings}`; }
  op.updatedAt = Date.now();
  return true;
}

/**
 * Add evidence to an existing operation.
 */
export function addEvidence(opId: string, evidence: {
  type: CIEvidence["type"];
  description: string;
  data: unknown;
  confidence: number;
}): boolean {
  const op = operations.get(opId);
  if (!op) { return false; }

  op.evidence.push({
    id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...evidence,
    timestamp: Date.now(),
  });

  // Recalculate confidence
  op.confidence = op.evidence.reduce((a, e) => a + e.confidence, 0) / op.evidence.length;
  op.updatedAt = Date.now();
  return true;
}

export function getOperation(opId: string): CIOperation | null {
  return operations.get(opId) ?? null;
}

export function listOperations(filter?: {
  phase?: string;
  type?: string;
  priority?: string;
  limit?: number;
}): CIOperation[] {
  let ops = [...operations.values()];
  if (filter?.phase) { ops = ops.filter(o => o.phase === filter.phase); }
  if (filter?.type) { ops = ops.filter(o => o.type === filter.type); }
  if (filter?.priority) { ops = ops.filter(o => o.priority === filter.priority); }
  ops.sort((a, b) => b.updatedAt - a.updatedAt);
  return ops.slice(0, filter?.limit ?? 50);
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export function getCIOverview(): {
  totalCanaries: number;
  activeCanaries: number;
  triggeredCanaries: number;
  totalOperations: number;
  activeOperations: number;
  byPhase: Record<string, number>;
  byType: Record<string, number>;
  avgConfidence: number;
} {
  let activeCanaries = 0, triggered = 0;
  for (const c of canaries.values()) {
    if (c.status === "active") { activeCanaries++; }
    if (c.status === "triggered") { triggered++; }
  }

  const byPhase: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalConf = 0;
  let activeOps = 0;

  for (const o of operations.values()) {
    byPhase[o.phase] = (byPhase[o.phase] ?? 0) + 1;
    byType[o.type] = (byType[o.type] ?? 0) + 1;
    totalConf += o.confidence;
    if (o.phase !== "closed") { activeOps++; }
  }

  return {
    totalCanaries: canaries.size,
    activeCanaries,
    triggeredCanaries: triggered,
    totalOperations: operations.size,
    activeOperations: activeOps,
    byPhase,
    byType,
    avgConfidence: operations.size > 0 ? totalConf / operations.size : 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CODENAMES = [
  "SHADOW_WATCH", "IRON_VEIL", "SILENT_STORM", "DARK_MIRROR",
  "FROST_BITE", "RAZOR_EDGE", "GLASS_HOUSE", "STEEL_NET",
  "BLACK_ICE", "GHOST_WIRE", "NIGHT_OWL", "COLD_TRAIL",
  "BLIND_SPOT", "DEEP_COVER", "SMOKE_SCREEN", "ZERO_DAY",
];

let codenameIdx = 0;
function generateCodename(): string {
  const name = CODENAMES[codenameIdx % CODENAMES.length]!;
  codenameIdx++;
  return `${name}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}
