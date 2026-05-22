/**
 * Republic Platform — Metacognition Engine
 *
 * Implements SOFAI-LM-inspired metacognitive monitoring for elite citizens.
 *
 * Architecture:
 *   Fast path  → Standard LLM response
 *   Meta pass  → Metacognitive monitor evaluates:
 *                 1. Epistemic marker detection ("I think", "I'm not sure")
 *                 2. Consistency check against citizen's memory graph
 *                 3. Confidence calibration score
 *                 4. If score < ESCALATION_THRESHOLD → escalate to reasoning model
 *                 5. Log metacognitive delta to citizen's long-term memory
 *
 * The 5-step metacognitive prompting process (from 2025 research):
 *   1. Clarify the question/task
 *   2. Provide preliminary interpretation
 *   3. Critically assess that interpretation
 *   4. Finalise decision with chain-of-thought reasoning
 *   5. Evaluate confidence and flag uncertainty
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ts } from "../../republic/utils.js";

const logger = createSubsystemLogger("republic:metacognition");

// ─── Types ─────────────────────────────────────────────────────────

export interface LLMResponseMeta {
  citizenId: string;
  content: string;
  modelUsed: string;
  taskType: string;
  latencyMs: number;
}

export interface MetacognitiveReport {
  citizenId: string;
  confidenceScore: number; // 0–1 (1 = very confident)
  epistemicMarkers: string[]; // detected hedging phrases
  consistencyScore: number; // 0–1 (1 = fully consistent with memories)
  escalationRequired: boolean;
  concerns: string[];
  timestamp: string;
}

// ─── Configuration ─────────────────────────────────────────────────

const ESCALATION_THRESHOLD = 0.4; // Escalate if confidence < this
const MAX_REPORT_LOG_PER_CITIZEN = 20;

// Epistemic uncertainty markers
const UNCERTAINTY_MARKERS = [
  "i think",
  "i believe",
  "i'm not sure",
  "i'm uncertain",
  "possibly",
  "maybe",
  "perhaps",
  "might be",
  "could be",
  "i guess",
  "roughly",
  "approximately",
  "not certain",
  "unclear",
  "i'm unsure",
  "potentially",
  "it seems",
  "it appears",
  "i'm wondering",
];

// High-confidence markers (increase score)
const CONFIDENCE_MARKERS = [
  "definitely",
  "certainly",
  "clearly",
  "obviously",
  "i know",
  "the answer is",
  "without doubt",
  "confirmed",
  "proven",
  "research shows",
  "data indicates",
];

// ─── Epistemic Marker Detection ────────────────────────────────────

function detectEpistemicMarkers(content: string): {
  uncertaintyMarkers: string[];
  confidenceMarkers: string[];
  calibratedScore: number;
} {
  const lower = content.toLowerCase();

  const foundUncertainty = UNCERTAINTY_MARKERS.filter((m) => lower.includes(m));
  const foundConfidence = CONFIDENCE_MARKERS.filter((m) => lower.includes(m));

  // Start at baseline 0.7 confidence, adjust by markers
  let score = 0.7;
  score -= foundUncertainty.length * 0.08;
  score += foundConfidence.length * 0.05;

  // Length-based heuristic: very short responses often lack reasoning depth
  if (content.length < 50) {
    score -= 0.1;
  }
  if (content.length > 500) {
    score += 0.05; // Detailed responses tend to be more reliable
  }

  return {
    uncertaintyMarkers: foundUncertainty,
    confidenceMarkers: foundConfidence,
    calibratedScore: parseFloat(Math.max(0, Math.min(1, score)).toFixed(3)),
  };
}

// ─── Consistency Check ─────────────────────────────────────────────

interface CitizenMemoryRef {
  getRelevantFacts(topic: string): string[];
}

function checkConsistency(
  content: string,
  memoryRef?: CitizenMemoryRef,
  taskType?: string,
): number {
  // Without memory access, return neutral score
  if (!memoryRef || !taskType) {
    return 0.7;
  }

  const facts = memoryRef.getRelevantFacts(taskType);
  if (facts.length === 0) {
    return 0.75; // No facts to contradict — assume consistent
  }

  // Simple keyword matching: check if any known facts are contradicted
  // In production this would use embedding similarity
  const lower = content.toLowerCase();
  let contradictions = 0;

  for (const fact of facts) {
    const factWords = fact.toLowerCase().split(/\s+/);
    // If a fact word appears with "not" before it → potential contradiction
    for (const word of factWords) {
      if (word.length > 4 && lower.includes(`not ${word}`)) {
        contradictions++;
      }
    }
  }

  return parseFloat(Math.max(0, Math.min(1, 0.8 - contradictions * 0.1)).toFixed(3));
}

// ─── Report Store ──────────────────────────────────────────────────

const reportStore = new Map<string, MetacognitiveReport[]>();

function storeReport(report: MetacognitiveReport): void {
  const existing = reportStore.get(report.citizenId) ?? [];
  existing.unshift(report);
  if (existing.length > MAX_REPORT_LOG_PER_CITIZEN) {
    existing.length = MAX_REPORT_LOG_PER_CITIZEN;
  }
  reportStore.set(report.citizenId, existing);
}

// ─── Main Metacognitive Evaluator ──────────────────────────────────

/**
 * Perform a metacognitive pass on an LLM response.
 *
 * Returns a MetacognitiveReport that:
 *  - Flags low-confidence responses for escalation
 *  - Identifies epistemic markers
 *  - Checks consistency with known citizen memories
 */
export function metacognitivePass(
  response: LLMResponseMeta,
  memoryRef?: CitizenMemoryRef,
): MetacognitiveReport {
  const { uncertaintyMarkers, confidenceMarkers, calibratedScore } = detectEpistemicMarkers(
    response.content,
  );

  const consistencyScore = checkConsistency(response.content, memoryRef, response.taskType);
  // Apply calibration adjustment from past task outcomes
  const calAdj = calibrationAdjustments.get(response.citizenId) ?? 0;
  const combinedScore = Math.max(0, Math.min(1, calibratedScore * 0.6 + consistencyScore * 0.4 + calAdj));
  const escalationRequired = combinedScore < ESCALATION_THRESHOLD;

  const concerns: string[] = [];
  if (uncertaintyMarkers.length > 3) {
    concerns.push(`High uncertainty marker count (${uncertaintyMarkers.length})`);
  }
  if (consistencyScore < 0.5) {
    concerns.push("Potential inconsistency with known facts");
  }
  if (response.content.length < 30) {
    concerns.push("Response length too short for confident answer");
  }
  if (escalationRequired) {
    concerns.push("Confidence below escalation threshold — reasoning model recommended");
  }

  const report: MetacognitiveReport = {
    citizenId: response.citizenId,
    confidenceScore: parseFloat(combinedScore.toFixed(3)),
    epistemicMarkers: [...uncertaintyMarkers, ...confidenceMarkers],
    consistencyScore,
    escalationRequired,
    concerns,
    timestamp: ts(),
  };

  storeReport(report);

  if (escalationRequired) {
    logger.debug(
      `Citizen ${response.citizenId}: escalation required (confidence=${combinedScore.toFixed(2)})`,
    );
  }

  return report;
}

// ─── Metacognitive Prompting Template ──────────────────────────────

/**
 * Generates a 5-step metacognitive prompt wrapper for the citizen's LLM call.
 * The citizen's base prompt is wrapped in structured self-reflection steps.
 */
export function buildMetacognitivePrompt(basePrompt: string, taskType: string): string {
  return `
You are performing a metacognitive reasoning process for task type: ${taskType}

Follow these 5 reflection steps:
1. CLARIFY: Restate the core question in your own words  
2. INTERPRET: Provide your preliminary answer or approach  
3. ASSESS: Critically examine your interpretation — what could be wrong?  
4. FINALISE: State your refined answer with chain-of-thought reasoning  
5. CALIBRATE: Rate your confidence (0-10) and flag any remaining uncertainties  

Task:
${basePrompt}

Begin with Step 1:`.trim();
}

// ─── Query API ─────────────────────────────────────────────────────

export function getMetacognitiveHistory(citizenId: string, limit = 10): MetacognitiveReport[] {
  return (reportStore.get(citizenId) ?? []).slice(0, limit);
}

export function getMetacognitiveAggregates(): {
  totalEvaluations: number;
  avgConfidence: number;
  escalationRate: number;
} {
  let total = 0;
  let totalConfidence = 0;
  let escalations = 0;

  for (const reports of reportStore.values()) {
    total += reports.length;
    for (const r of reports) {
      totalConfidence += r.confidenceScore;
      if (r.escalationRequired) {
        escalations++;
      }
    }
  }

  return {
    totalEvaluations: total,
    avgConfidence: total > 0 ? parseFloat((totalConfidence / total).toFixed(3)) : 0,
    escalationRate: total > 0 ? parseFloat((escalations / total).toFixed(3)) : 0,
  };
}

// ─── Escalation Queue (Upgrade D) ──────────────────────────────────

/** Citizen-level confidence adjustments from calibration feedback */
const calibrationAdjustments = new Map<string, number>();

/**
 * Get citizens whose most recent metacognitive report flagged escalation.
 * These citizens should be routed to a stronger reasoning model (tier 3).
 *
 * @param maxAge - Only include reports from the last N seconds (default: 60s)
 * @param limit - Maximum number of citizen IDs to return
 */
export function getEscalationQueue(maxAge = 60, limit = 20): string[] {
  const cutoff = Date.now() - maxAge * 1000;
  const escalated: string[] = [];

  for (const [citizenId, reports] of reportStore) {
    if (escalated.length >= limit) { break; }
    const latest = reports[0]; // reports are stored newest-first
    if (!latest) { continue; }

    const reportTime = new Date(latest.timestamp).getTime();
    if (reportTime >= cutoff && latest.escalationRequired) {
      escalated.push(citizenId);
    }
  }

  return escalated;
}

/**
 * Record calibration feedback: after a task completes, compare the
 * metacognitive prediction with the actual outcome. This adjusts
 * future confidence scoring per citizen.
 *
 * - If escalation was NOT flagged but task FAILED → lower baseline by 0.05
 * - If escalation WAS flagged and task SUCCEEDED → raise threshold conservatively by 0.02
 */
export function recordCalibrationFeedback(
  citizenId: string,
  taskSucceeded: boolean,
): void {
  const reports = reportStore.get(citizenId);
  const latest = reports?.[0];
  if (!latest) { return; }

  const currentAdj = calibrationAdjustments.get(citizenId) ?? 0;

  if (!latest.escalationRequired && !taskSucceeded) {
    // False negative: we were overconfident → lower future confidence
    calibrationAdjustments.set(citizenId, Math.max(-0.3, currentAdj - 0.05));
    logger.debug(`Calibration -0.05 for ${citizenId} (missed escalation)`);
  } else if (latest.escalationRequired && taskSucceeded) {
    // False positive: we were underconfident → raise threshold slightly
    calibrationAdjustments.set(citizenId, Math.min(0.2, currentAdj + 0.02));
    logger.debug(`Calibration +0.02 for ${citizenId} (unnecessary escalation)`);
  }
}

/** Get the cumulative confidence adjustment for a citizen */
export function getCalibrationAdjustment(citizenId: string): number {
  return calibrationAdjustments.get(citizenId) ?? 0;
}
