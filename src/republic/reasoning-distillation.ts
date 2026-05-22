/**
 * Republic Platform — Reasoning Distillation & Synthetic Data
 *
 * Phase 18: Teacher→student knowledge distillation pipeline and
 * synthetic training data generation for fine-tuning smaller models.
 *
 * Research basis:
 * - DeepSeek R1 CoT distillation
 * - Unsloth: efficient fine-tuning
 * - Synthetic Data by NVIDIA/Google
 * - Knowledge distillation (Hinton et al.)
 *
 * Key capabilities:
 * 1. distillReasoning() — extract CoT traces from teacher and compress for student
 * 2. generateSyntheticData() — create training samples from republic knowledge
 * 3. evaluateDistillation() — compare teacher vs student outputs
 * 4. exportTrainingSet() — export data in fine-tuning format
 */

import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ChainOfThought {
  id: string;
  query: string;
  steps: ReasoningStep[];
  finalAnswer: string;
  totalTokens: number;
  model: string;
  citizenId?: string;
  createdAt: string;
}

export interface ReasoningStep {
  index: number;
  thought: string;
  action?: string;
  observation?: string;
  confidence: number;
}

export interface DistilledTrace {
  id: string;
  sourceId: string;
  query: string;
  compressedReasoning: string;
  answer: string;
  compressionRatio: number;
  qualityScore: number;
  createdAt: string;
}

export interface SyntheticSample {
  id: string;
  instruction: string;
  input: string;
  output: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  source: string;
  metadata: Record<string, unknown>;
}

export interface TrainingSet {
  id: string;
  name: string;
  samples: SyntheticSample[];
  format: "alpaca" | "sharegpt" | "openai" | "custom";
  createdAt: string;
  exportedAt?: string;
}

export interface DistillationMetrics {
  totalTraces: number;
  totalDistilled: number;
  avgCompressionRatio: number;
  avgQualityScore: number;
  totalSyntheticSamples: number;
  totalTrainingSets: number;
}

// ─── State ──────────────────────────────────────────────────────

const cotTraces = new Map<string, ChainOfThought>();
const distilledTraces = new Map<string, DistilledTrace>();
const syntheticSamples: SyntheticSample[] = [];
const trainingSets = new Map<string, TrainingSet>();
const MAX_TRACES = 2000;
const MAX_SAMPLES = 10000;

// ─── Chain of Thought Capture ───────────────────────────────────

/**
 * Capture a chain of thought trace from a teacher model's reasoning.
 */
export function captureCoT(
  query: string,
  steps: ReasoningStep[],
  finalAnswer: string,
  model: string,
  citizenId?: string,
): ChainOfThought {
  const totalTokens = steps.reduce(
    (sum, s) => sum + (s.thought.length + (s.action?.length ?? 0) + (s.observation?.length ?? 0)) / 4,
    0
  );

  const cot: ChainOfThought = {
    id: `cot-${uid().slice(0, 8)}`,
    query,
    steps,
    finalAnswer,
    totalTokens: Math.ceil(totalTokens),
    model,
    citizenId,
    createdAt: ts(),
  };

  cotTraces.set(cot.id, cot);

  // Evict oldest
  if (cotTraces.size > MAX_TRACES) {
    const oldestKey = cotTraces.keys().next().value;
    if (oldestKey) {cotTraces.delete(oldestKey);}
  }

  return cot;
}

/**
 * Get a CoT trace by ID.
 */
export function getCoT(cotId: string): ChainOfThought | undefined {
  return cotTraces.get(cotId);
}

// ─── Reasoning Distillation ─────────────────────────────────────

/**
 * Distill a chain of thought trace.
 * Compresses verbose teacher reasoning into concise student-friendly format.
 *
 * Compression strategies:
 * 1. Remove redundant steps
 * 2. Merge sequential thoughts
 * 3. Extract key reasoning patterns
 * 4. Preserve critical decision points
 */
export function distillReasoning(cotId: string): DistilledTrace | null {
  const cot = cotTraces.get(cotId);
  if (!cot) {return null;}

  // Filter out low-confidence steps
  const significantSteps = cot.steps.filter(s => s.confidence > 0.3);

  // Compress: keep first, key decision, and last steps
  const compressed: string[] = [];
  if (significantSteps.length > 0) {
    // Always include first step
    compressed.push(`Step 1: ${significantSteps[0].thought}`);

    // Include high-confidence intermediate steps
    for (let i = 1; i < significantSteps.length - 1; i++) {
      if (significantSteps[i].confidence > 0.7) {
        compressed.push(`Key insight: ${significantSteps[i].thought}`);
      }
    }

    // Always include last step
    if (significantSteps.length > 1) {
      compressed.push(`Conclusion: ${significantSteps[significantSteps.length - 1].thought}`);
    }
  }

  const compressedText = compressed.join("\n");
  const originalLength = cot.steps.map(s => s.thought).join(" ").length;
  const compressionRatio = originalLength > 0 ? compressedText.length / originalLength : 1;

  // Quality: ratio of preserved high-confidence steps
  const highConfidence = cot.steps.filter(s => s.confidence > 0.7).length;
  const compressedHighConf = compressed.filter(c => c.includes("Key insight") || c.includes("Conclusion")).length;
  const qualityScore = highConfidence > 0
    ? Math.min(1, (compressedHighConf + 1) / highConfidence)
    : 0.5;

  const distilled: DistilledTrace = {
    id: `dist-${uid().slice(0, 8)}`,
    sourceId: cotId,
    query: cot.query,
    compressedReasoning: compressedText,
    answer: cot.finalAnswer,
    compressionRatio,
    qualityScore,
    createdAt: ts(),
  };

  distilledTraces.set(distilled.id, distilled);
  return distilled;
}

/**
 * Get distilled trace by ID.
 */
export function getDistilled(distId: string): DistilledTrace | undefined {
  return distilledTraces.get(distId);
}

// ─── Synthetic Data Generation ──────────────────────────────────

/**
 * Generate synthetic training samples from republic knowledge.
 * Uses templates and domain knowledge to create instruction-tuning data.
 */
export function generateSyntheticData(
  domain: string,
  count: number,
  opts?: {
    difficulty?: "easy" | "medium" | "hard";
    category?: string;
    citizenId?: string;
  },
): SyntheticSample[] {
  const difficulty = opts?.difficulty ?? "medium";
  const category = opts?.category ?? domain;
  const generated: SyntheticSample[] = [];

  // Template-based generation per domain
  const templates = getDomainTemplates(domain);

  for (let i = 0; i < Math.min(count, 100); i++) {
    const template = templates[i % templates.length];
    const sample: SyntheticSample = {
      id: `syn-${uid().slice(0, 8)}`,
      instruction: template.instruction.replace("{domain}", domain),
      input: template.input.replace("{domain}", domain).replace("{index}", String(i + 1)),
      output: template.output.replace("{domain}", domain),
      category,
      difficulty,
      source: opts?.citizenId ? `citizen:${opts.citizenId}` : "synthetic",
      metadata: { domain, templateId: i % templates.length, generatedAt: ts() },
    };
    generated.push(sample);
    syntheticSamples.push(sample);
  }

  // Trim if over limit
  if (syntheticSamples.length > MAX_SAMPLES) {
    syntheticSamples.splice(0, syntheticSamples.length - MAX_SAMPLES);
  }

  return generated;
}

/**
 * Domain-specific instruction templates.
 */
function getDomainTemplates(domain: string): Array<{
  instruction: string;
  input: string;
  output: string;
}> {
  const templates: Record<string, Array<{ instruction: string; input: string; output: string }>> = {
    coding: [
      {
        instruction: "Write a function that solves the following {domain} problem",
        input: "Problem {index}: Implement a utility function",
        output: "Here is the implementation for the {domain} problem...",
      },
      {
        instruction: "Debug the following {domain} code snippet",
        input: "The following code has a bug: [code snippet {index}]",
        output: "The bug is... Here is the corrected version...",
      },
      {
        instruction: "Explain the following {domain} concept",
        input: "Concept {index} in {domain}",
        output: "This concept works by...",
      },
    ],
    research: [
      {
        instruction: "Summarize the key findings of the following {domain} paper",
        input: "Paper {index} on {domain}",
        output: "The key findings are...",
      },
      {
        instruction: "Compare and contrast two approaches in {domain}",
        input: "Approach A vs Approach B in {domain}, analysis {index}",
        output: "Approach A differs from B in the following ways...",
      },
    ],
    governance: [
      {
        instruction: "Analyze the implications of the following {domain} policy",
        input: "Policy {index} in the republic",
        output: "This policy would impact...",
      },
      {
        instruction: "Draft a proposal for improving {domain}",
        input: "Improvement area {index}",
        output: "Proposal: ...",
      },
    ],
  };

  return templates[domain] ?? templates["coding"];
}

// ─── Training Set Export ────────────────────────────────────────

/**
 * Create a training set from synthetic samples.
 */
export function createTrainingSet(
  name: string,
  sampleIds?: string[],
  format: "alpaca" | "sharegpt" | "openai" | "custom" = "alpaca",
): TrainingSet {
  let samples: SyntheticSample[];

  if (sampleIds && sampleIds.length > 0) {
    const idSet = new Set(sampleIds);
    samples = syntheticSamples.filter(s => idSet.has(s.id));
  } else {
    samples = [...syntheticSamples];
  }

  const set: TrainingSet = {
    id: `ts-${uid().slice(0, 8)}`,
    name,
    samples,
    format,
    createdAt: ts(),
  };

  trainingSets.set(set.id, set);
  return set;
}

/**
 * Export a training set as formatted JSON string.
 */
export function exportTrainingSet(setId: string): string | null {
  const set = trainingSets.get(setId);
  if (!set) {return null;}

  set.exportedAt = ts();

  switch (set.format) {
    case "alpaca":
      return JSON.stringify(
        set.samples.map(s => ({
          instruction: s.instruction,
          input: s.input,
          output: s.output,
        })),
        null,
        2,
      );

    case "sharegpt":
      return JSON.stringify(
        set.samples.map(s => ({
          conversations: [
            { from: "human", value: `${s.instruction}\n${s.input}` },
            { from: "gpt", value: s.output },
          ],
        })),
        null,
        2,
      );

    case "openai":
      return JSON.stringify(
        set.samples.map(s => ({
          messages: [
            { role: "system", content: s.instruction },
            { role: "user", content: s.input },
            { role: "assistant", content: s.output },
          ],
        })),
        null,
        2,
      );

    default:
      return JSON.stringify(set.samples, null, 2);
  }
}

/**
 * Get a training set by ID.
 */
export function getTrainingSet(setId: string): TrainingSet | undefined {
  return trainingSets.get(setId);
}

// ─── Distillation Evaluation ────────────────────────────────────

/**
 * Evaluate distillation quality by comparing teacher and student outputs.
 */
export function evaluateDistillation(
  teacherAnswer: string,
  studentAnswer: string,
): {
  similarity: number;
  correctness: number;
  efficiency: number;
  feedback: string[];
} {
  const feedback: string[] = [];

  // Similarity: term overlap
  const teacherTerms = new Set(teacherAnswer.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  const studentTerms = new Set(studentAnswer.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  let overlap = 0;
  for (const term of studentTerms) {
    if (teacherTerms.has(term)) {overlap++;}
  }
  const similarity = teacherTerms.size > 0 ? overlap / teacherTerms.size : 0;

  // Correctness: student should cover teacher's key points
  const correctness = studentTerms.size > 0
    ? overlap / studentTerms.size
    : 0;

  // Efficiency: student should be more concise
  const efficiency = teacherAnswer.length > 0
    ? Math.min(1, studentAnswer.length / teacherAnswer.length)
    : 1;

  if (similarity < 0.3) {feedback.push("Low similarity to teacher — student may be missing key concepts");}
  if (correctness < 0.5) {feedback.push("Student answer contains many terms not in teacher's output");}
  if (efficiency > 0.9) {feedback.push("Student answer is not significantly compressed");}
  if (feedback.length === 0) {feedback.push("Good distillation quality");}

  return { similarity, correctness, efficiency, feedback };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function distillationDiagnostics(): DistillationMetrics {
  const allDistilled = [...distilledTraces.values()];
  return {
    totalTraces: cotTraces.size,
    totalDistilled: allDistilled.length,
    avgCompressionRatio: allDistilled.length > 0
      ? allDistilled.reduce((s, d) => s + d.compressionRatio, 0) / allDistilled.length
      : 0,
    avgQualityScore: allDistilled.length > 0
      ? allDistilled.reduce((s, d) => s + d.qualityScore, 0) / allDistilled.length
      : 0,
    totalSyntheticSamples: syntheticSamples.length,
    totalTrainingSets: trainingSets.size,
  };
}

// ─── State Reset (Testing) ──────────────────────────────────────

export function resetDistillationState(): void {
  cotTraces.clear();
  distilledTraces.clear();
  syntheticSamples.length = 0;
  trainingSets.clear();
}
