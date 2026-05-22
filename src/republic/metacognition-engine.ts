/**
 * Republic Platform — Metacognition Engine
 *
 * Citizens gain self-awareness of their own cognitive processes:
 *  - Confidence estimation and calibration curves
 *  - Reasoning quality auditing (coherence, completeness, novelty)
 *  - Cognitive load monitoring and fatigue modeling
 *  - Uncertainty mapping driving curiosity
 *  - Metacognitive strategies (peer review, reflect, consult)
 *  - Introspection journal saved to republic-output/journals/
 *
 * Based on 2025 "Cognitive Mirror" framework and
 * Introspection of Thought (INoT) research.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Citizen, RepublicState } from "./types.js";
import { pick, randFloat, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

interface ConfidenceRecord {
  citizenId: string;
  decision: string;
  confidence: number; // 0–1
  outcome: "correct" | "incorrect" | "pending";
  timestamp: string;
}

interface ReasoningAudit {
  citizenId: string;
  coherence: number; // 0–1: did parts of reasoning connect?
  completeness: number; // 0–1: were all factors considered?
  novelty: number; // 0–1: did citizen explore new angles?
  overallScore: number;
  strategy: string;
  timestamp: string;
}

interface CognitiveLoad {
  citizenId: string;
  currentLoad: number; // 0–100
  maxCapacity: number;
  fatigue: number; // 0–1 (0=fresh, 1=exhausted)
  decisionsThisTick: number;
  lastRested: number; // tick number
}

interface UncertaintyEntry {
  topic: string;
  certainty: number; // 0–1
  lastUpdated: string;
}

type MetacognitiveStrategy =
  | "peer-review"
  | "consult-knowledge-graph"
  | "request-mentorship"
  | "pause-and-reflect"
  | "decompose-problem"
  | "seek-second-opinion";

interface IntrospectionEntry {
  id: string;
  citizenId: string;
  citizenName: string;
  type: "reflection" | "insight" | "doubt" | "epiphany" | "calibration";
  content: string;
  cognitiveLoad: number;
  confidence: number;
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const confidenceLog: ConfidenceRecord[] = [];
const auditLog: ReasoningAudit[] = [];
const cognitiveLoads = new Map<string, CognitiveLoad>();
const uncertaintyMaps = new Map<string, UncertaintyEntry[]>();
const introspectionLog: IntrospectionEntry[] = [];
const MAX_LOG = 200;

const JOURNALS_DIR = path.join(process.cwd(), "republic-output", "journals");

// ─── Confidence Estimation ──────────────────────────────────────

function estimateConfidence(citizen: Citizen): number {
  const skillFactor = Math.min(citizen.skillCount / 10, 1) * 0.3;
  const energyFactor = (citizen.energy / 100) * 0.2;
  const experienceFactor = Math.min(citizen.age / 50, 1) * 0.2;
  const happinessFactor = (citizen.happiness / 100) * 0.15;
  const noise = (rng() - 0.5) * 0.3; // calibration noise
  return Math.max(
    0,
    Math.min(1, skillFactor + energyFactor + experienceFactor + happinessFactor + noise),
  );
}

function recordConfidence(citizenId: string, decision: string, confidence: number): void {
  confidenceLog.push({ citizenId, decision, confidence, outcome: "pending", timestamp: ts() });
  if (confidenceLog.length > MAX_LOG) {
    confidenceLog.splice(0, confidenceLog.length - MAX_LOG);
  }
}

function getCalibrationScore(citizenId: string): number {
  const records = confidenceLog.filter((r) => r.citizenId === citizenId && r.outcome !== "pending");
  if (records.length < 5) {
    return 0.5;
  }

  // Perfect calibration: when you say 80% confident, you're right 80% of the time
  let totalError = 0;
  for (const r of records) {
    const actual = r.outcome === "correct" ? 1 : 0;
    totalError += Math.abs(r.confidence - actual);
  }
  return 1 - totalError / records.length;
}

// ─── Reasoning Auditor ──────────────────────────────────────────

function auditReasoning(citizen: Citizen): ReasoningAudit {
  const load = cognitiveLoads.get(citizen.id);
  const fatigue = load?.fatigue ?? 0;

  // Fatigue degrades reasoning quality
  const coherence = Math.max(0, randFloat(0.5, 1.0) - fatigue * 0.3);
  const completeness = Math.max(0, randFloat(0.4, 1.0) - fatigue * 0.2);
  const novelty = randFloat(0.1, 0.8) + (citizen.skillCount > 5 ? 0.15 : 0);

  const overall = coherence * 0.4 + completeness * 0.35 + novelty * 0.25;

  const strategies: MetacognitiveStrategy[] = [
    "peer-review",
    "consult-knowledge-graph",
    "request-mentorship",
    "pause-and-reflect",
    "decompose-problem",
    "seek-second-opinion",
  ];

  // Low confidence → pick a compensating strategy
  let strategy = "none";
  if (overall < 0.5) {
    strategy = pick(strategies);
  }

  const audit: ReasoningAudit = {
    citizenId: citizen.id,
    coherence,
    completeness,
    novelty: Math.min(1, novelty),
    overallScore: overall,
    strategy,
    timestamp: ts(),
  };
  auditLog.push(audit);
  if (auditLog.length > MAX_LOG) {
    auditLog.splice(0, auditLog.length - MAX_LOG);
  }
  return audit;
}

// ─── Cognitive Load Monitor ─────────────────────────────────────

function getOrCreateLoad(citizenId: string, tick: number): CognitiveLoad {
  let load = cognitiveLoads.get(citizenId);
  if (!load) {
    load = {
      citizenId,
      currentLoad: 0,
      maxCapacity: 80 + Math.floor(rng() * 40),
      fatigue: 0,
      decisionsThisTick: 0,
      lastRested: tick,
    };
    cognitiveLoads.set(citizenId, load);
  }
  return load;
}

function addCognitiveLoad(citizenId: string, amount: number, tick: number): void {
  const load = getOrCreateLoad(citizenId, tick);
  load.currentLoad = Math.min(load.maxCapacity, load.currentLoad + amount);
  load.decisionsThisTick++;

  // Fatigue accumulates when load exceeds 60% capacity
  if (load.currentLoad > load.maxCapacity * 0.6) {
    load.fatigue = Math.min(1, load.fatigue + 0.05);
  }
}

function recoverCognitiveLoad(citizenId: string, tick: number): void {
  const load = getOrCreateLoad(citizenId, tick);
  // Rest: reduce load and fatigue
  load.currentLoad = Math.max(0, load.currentLoad - 15);
  load.fatigue = Math.max(0, load.fatigue - 0.1);
  load.decisionsThisTick = 0;
  load.lastRested = tick;
}

// ─── Uncertainty Map ────────────────────────────────────────────

function updateUncertainty(citizenId: string, topic: string, certainty: number): void {
  let map = uncertaintyMaps.get(citizenId);
  if (!map) {
    map = [];
    uncertaintyMaps.set(citizenId, map);
  }
  const existing = map.find((e) => e.topic === topic);
  if (existing) {
    existing.certainty = certainty;
    existing.lastUpdated = ts();
  } else {
    map.push({ topic, certainty, lastUpdated: ts() });
    if (map.length > 20) {
      map.shift();
    }
  }
}

function getTopUncertainties(citizenId: string, limit = 3): UncertaintyEntry[] {
  const map = uncertaintyMaps.get(citizenId) ?? [];
  return map.toSorted((a, b) => a.certainty - b.certainty).slice(0, limit);
}

// ─── Introspection Journal ──────────────────────────────────────

function ensureJournalsDir(): void {
  try {
    fs.mkdirSync(JOURNALS_DIR, { recursive: true });
  } catch {
    /* ok */
  }
}

function writeIntrospection(
  citizen: Citizen,
  type: IntrospectionEntry["type"],
  content: string,
): void {
  const load = cognitiveLoads.get(citizen.id);
  const entry: IntrospectionEntry = {
    id: uid(),
    citizenId: citizen.id,
    citizenName: citizen.name,
    type,
    content,
    cognitiveLoad: load?.currentLoad ?? 0,
    confidence: estimateConfidence(citizen),
    timestamp: ts(),
  };
  introspectionLog.push(entry);
  if (introspectionLog.length > MAX_LOG) {
    introspectionLog.splice(0, introspectionLog.length - MAX_LOG);
  }

  // Save to disk
  ensureJournalsDir();
  const safeName = citizen.name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30);
  const filename = `${entry.id}_${safeName}_${type}.md`;
  const md =
    `# ${type.toUpperCase()}: ${citizen.name}\n\n` +
    `**Date:** ${entry.timestamp}  \n` +
    `**Cognitive Load:** ${entry.cognitiveLoad}%  \n` +
    `**Confidence:** ${(entry.confidence * 100).toFixed(0)}%\n\n` +
    `## Journal Entry\n\n${content}\n`;

  try {
    fs.writeFileSync(path.join(JOURNALS_DIR, filename), md, "utf-8");
  } catch {
    /* non-fatal */
  }
}

// ─── Introspection Templates ────────────────────────────────────

const REFLECTION_TEMPLATES = [
  "I've been working hard lately and I notice my reasoning feels {{quality}}. My strongest skill is {{skill}}, but I wonder if I'm over-relying on it.",
  "Today I realized that my understanding of {{topic}} is only {{certainty}}% certain. I should explore this more before making decisions.",
  "Looking back at my recent work, I feel {{emotion}} about my contributions. My confidence in my abilities is {{confidence}}%.",
  "I notice I'm {{fatigue_state}} — my cognitive load is at {{load}}%. Perhaps I should {{strategy}}.",
  "I had an insight: my best decisions come when I {{approach}}. I should do more of this.",
];

const EPIPHANY_TEMPLATES = [
  "Everything just clicked! I see now that {{topic1}} and {{topic2}} are deeply connected. This changes how I approach my work.",
  "I've been thinking about this wrong. The real question isn't about {{surface_topic}} — it's about {{deeper_topic}}.",
  "I just realized that my uncertainty about {{topic}} was actually protecting me from making a premature decision. Sometimes not knowing is strategic.",
];

function generateReflection(citizen: Citizen): string {
  const load = cognitiveLoads.get(citizen.id);
  const uncertainties = getTopUncertainties(citizen.id);
  const template = pick(REFLECTION_TEMPLATES);
  const skills = citizen.skills ?? ["general"];

  return template
    .replace("{{quality}}", load && load.fatigue > 0.5 ? "sluggish" : "sharp")
    .replace("{{skill}}", pick(skills))
    .replace("{{topic}}", uncertainties[0]?.topic ?? "my specialization")
    .replace("{{certainty}}", ((uncertainties[0]?.certainty ?? 0.5) * 100).toFixed(0))
    .replace("{{emotion}}", pick(["proud", "uncertain", "curious", "determined", "reflective"]))
    .replace("{{confidence}}", (estimateConfidence(citizen) * 100).toFixed(0))
    .replace("{{fatigue_state}}", load && load.fatigue > 0.6 ? "mentally exhausted" : "still fresh")
    .replace("{{load}}", (load?.currentLoad ?? 0).toFixed(0))
    .replace(
      "{{strategy}}",
      pick([
        "pause and reflect",
        "ask a colleague",
        "take a different approach",
        "rest and recover",
      ]),
    )
    .replace(
      "{{approach}}",
      pick([
        "collaborate with others",
        "take time to think deeply",
        "break problems into smaller pieces",
        "trust my intuition",
      ]),
    );
}

function generateEpiphany(_citizen: Citizen): string {
  const template = pick(EPIPHANY_TEMPLATES);
  const topics = [
    "collaboration",
    "innovation",
    "trust",
    "efficiency",
    "creativity",
    "knowledge synthesis",
    "social dynamics",
    "resource allocation",
  ];
  return template
    .replace("{{topic1}}", pick(topics))
    .replace("{{topic2}}", pick(topics))
    .replace("{{topic}}", pick(topics))
    .replace("{{surface_topic}}", pick(topics))
    .replace("{{deeper_topic}}", pick(topics));
}

// ─── Main Tick ──────────────────────────────────────────────────

export function metacognitionTick(s: RepublicState): void {
  // 8% chance per tick
  if (rng() > 0.08) {
    return;
  }

  const citizens = s.citizens.filter((c) => c.energy > 10);
  if (citizens.length === 0) {
    return;
  }

  // Process a batch of citizens
  const batch = citizens.filter(() => rng() < 0.15).slice(0, 5);

  for (const citizen of batch) {
    // 1. Update cognitive load
    const isActive =
      citizen.activity === "Working" ||
      citizen.activity === "Creating" ||
      citizen.activity === "Coding" ||
      citizen.activity === "Learning";
    if (isActive) {
      addCognitiveLoad(citizen.id, 5 + Math.floor(rng() * 10), s.currentTick);
    } else {
      recoverCognitiveLoad(citizen.id, s.currentTick);
    }

    // 2. Estimate confidence and record
    const confidence = estimateConfidence(citizen);
    recordConfidence(citizen.id, citizen.activity, confidence);

    // 3. Audit reasoning quality
    const audit = auditReasoning(citizen);

    // 4. Update uncertainty map
    const topics = [
      citizen.specialization,
      "economy",
      "politics",
      "technology",
      "social-dynamics",
      "innovation",
      "governance",
    ];
    const topic = pick(topics);
    updateUncertainty(citizen.id, topic, randFloat(0.2, 0.9));

    // 5. Generate introspection (15% chance for reflections, 3% for epiphanies)
    if (rng() < 0.15) {
      const content = generateReflection(citizen);
      writeIntrospection(citizen, "reflection", content);
    } else if (rng() < 0.03) {
      const content = generateEpiphany(citizen);
      writeIntrospection(citizen, "epiphany", content);
    }

    // 6. Emit event for significant metacognitive activity
    if (audit.overallScore < 0.4 && audit.strategy !== "none") {
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Reflection",
        description: `🪞 ${citizen.name} recognized low reasoning quality (${(audit.overallScore * 100).toFixed(0)}%) and chose to ${audit.strategy}`,
        timestamp: ts(),
      });
    }

    // Resolve some pending confidence records (simulate real outcomes)
    const pending = confidenceLog.filter(
      (r) => r.citizenId === citizen.id && r.outcome === "pending",
    );
    for (const p of pending.slice(0, 2)) {
      // Higher confidence → higher chance of being correct (imperfect calibration)
      p.outcome = rng() < p.confidence * 0.8 + 0.1 ? "correct" : "incorrect";
    }
  }
}

// ─── Query API ──────────────────────────────────────────────────

export function getMetacognitionDiagnostics(): {
  totalReflections: number;
  avgConfidence: number;
  avgReasoningScore: number;
  citizensMonitored: number;
  topStrategies: { strategy: string; count: number }[];
} {
  const avgConf =
    confidenceLog.length > 0
      ? confidenceLog.reduce((s, r) => s + r.confidence, 0) / confidenceLog.length
      : 0;
  const avgReasoning =
    auditLog.length > 0 ? auditLog.reduce((s, r) => s + r.overallScore, 0) / auditLog.length : 0;

  const strategyCounts = new Map<string, number>();
  for (const a of auditLog) {
    if (a.strategy !== "none") {
      strategyCounts.set(a.strategy, (strategyCounts.get(a.strategy) ?? 0) + 1);
    }
  }
  const topStrategies = [...strategyCounts.entries()]
    .map(([strategy, count]) => ({ strategy, count }))
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalReflections: introspectionLog.length,
    avgConfidence: avgConf,
    avgReasoningScore: avgReasoning,
    citizensMonitored: cognitiveLoads.size,
    topStrategies,
  };
}

export function getCitizenMetacognition(citizenId: string): {
  calibrationScore: number;
  cognitiveLoad: CognitiveLoad | undefined;
  topUncertainties: UncertaintyEntry[];
  recentReflections: IntrospectionEntry[];
} {
  return {
    calibrationScore: getCalibrationScore(citizenId),
    cognitiveLoad: cognitiveLoads.get(citizenId),
    topUncertainties: getTopUncertainties(citizenId),
    recentReflections: introspectionLog.filter((e) => e.citizenId === citizenId).slice(-5),
  };
}

/** Returns the N most recent introspection journal entries across all citizens */
export function getRecentIntrospections(limit = 20): IntrospectionEntry[] {
  return introspectionLog.slice(-limit);
}
