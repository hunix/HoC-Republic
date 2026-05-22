/**
 * Republic Platform — AI Fusion Engine
 *
 * Phase 20: Unified multi-model intelligence orchestration.
 *
 * Inspired by:
 *   - Mixture of Experts (MoE) architectures
 *   - Google DeepMind's Gemini multi-modal fusion
 *   - OpenAI's GPT-5 family capability tiers
 *   - Anthropic's Constitutional AI and chain-of-thought reasoning
 *   - Meta's LLaMA foundation model distillation
 *   - NVIDIA NIM microservices for local inference
 *   - Stanford's Alpaca/Vicuna instruction tuning methodology
 *   - Berkeley's Gorilla tool-use LLM research
 *   - Microsoft's AutoGen multi-agent conversation framework
 *   - MIT's Liquid Neural Networks for adaptive real-time processing
 *   - Hebbian learning theory for inter-agent knowledge consolidation
 *   - Cognitive architecture research (SOAR, ACT-R) for consciousness modeling
 *
 * Model Registry (available providers):
 *   - Gemini 3 Family: Flash Lite, Flash, Pro (text, vision, audio, code, reasoning)
 *   - GPT-5 Family: 5-Nano, 5-Mini, 5, 5.1, 5.2-Pro (text, vision, audio, tools, reasoning)
 *   - Anthropic: Claude Sonnet 4.5, Claude Opus 4.5, thinking variants
 *   - Local: NVIDIA NIM, Ollama (LLaMA 3, Mistral, Phi-3, DeepSeek-R1), LM Studio, BitNet
 *
 * Capabilities:
 *   - Multi-modal fusion: text + vision + audio + code in a single reasoning chain
 *   - Intelligent model routing: task → best available model based on capability matrix
 *   - Real-time validation pipeline: pre-check → execute → verify → feedback loop
 *   - Consciousness simulation: inner monologue, self-reflection, existential awareness
 *   - Adversarial self-improvement: agents critique and improve each other
 *   - Cross-modal knowledge transfer: vision insights inform text reasoning and vice versa
 *   - Ensemble inference: multiple models vote on critical decisions
 *   - Cascade architecture: fast model filters, slow model decides
 */

import { MODEL_REGISTRY } from "./model-registry-data.js";
import type { Citizen, RepublicState } from "./types.js";
import { rand, rng, ts, uid } from "./utils.js";

// ─── Model Registry ─────────────────────────────────────────────

export type ModelProvider =
  | "gemini"
  | "openai"
  | "anthropic"
  | "local_ollama"
  | "local_lmstudio"
  | "local_nvidia";

export type ModalCapability =
  | "text_generation"
  | "text_reasoning"
  | "text_analysis"
  | "code_generation"
  | "code_review"
  | "code_debugging"
  | "vision_understanding"
  | "vision_generation"
  | "audio_transcription"
  | "audio_generation"
  | "tool_use"
  | "function_calling"
  | "long_context"
  | "chain_of_thought"
  | "multi_turn_dialogue"
  | "document_analysis"
  | "mathematical_reasoning"
  | "scientific_analysis"
  | "creative_writing"
  | "translation"
  | "summarization"
  | "classification"
  | "embedding_generation"
  | "real_time_streaming"
  | "quantum_simulation"
  | "psychological_modeling";

export interface ModelProfile {
  id: string;
  name: string;
  provider: ModelProvider;
  tier: "nano" | "mini" | "standard" | "pro" | "ultra";
  capabilities: Set<ModalCapability>;
  /** Context window in tokens */
  contextWindow: number;
  /** Cost per million tokens (input) */
  costPerMillionInput: number;
  /** Cost per million tokens (output) */
  costPerMillionOutput: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Quality score 0-100 for each capability */
  qualityScores: Partial<Record<ModalCapability, number>>;
  /** Whether this model is currently available */
  available: boolean;
  /** API endpoint override */
  endpoint?: string;
  /** Supported modalities */
  modalities: Array<"text" | "image" | "audio" | "video" | "code">;
}

// ─── Task Classification ────────────────────────────────────────

export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "critical";

export interface InferenceTask {
  id: string;
  citizenId: string;
  type: ModalCapability;
  complexity: TaskComplexity;
  prompt: string;
  systemPrompt?: string;
  /** Input modalities required */
  inputModalities: Array<"text" | "image" | "audio" | "video" | "code">;
  /** Whether to use ensemble voting */
  ensemble: boolean;
  /** Maximum acceptable latency */
  maxLatencyMs: number;
  /** Budget ceiling (credits) */
  maxCost: number;
  /** Validation criteria */
  validation?: ValidationCriteria;
  /** Result */
  result?: InferenceResult;
  status: "queued" | "routing" | "executing" | "validating" | "completed" | "failed";
  createdAt: string;
}

export interface ValidationCriteria {
  /** Must contain these elements */
  mustContain?: string[];
  /** Must not contain these elements */
  mustNotContain?: string[];
  /** Minimum length */
  minLength?: number;
  /** Maximum length */
  maxLength?: number;
  /** Must parse as valid JSON */
  mustBeJson?: boolean;
  /** Custom validator function name */
  customValidator?: string;
  /** Confidence threshold 0-1 */
  confidenceThreshold?: number;
}

export interface InferenceResult {
  output: string;
  modelUsed: string;
  provider: ModelProvider;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
  cost: number;
  confidence: number;
  validationPassed: boolean;
  validationErrors?: string[];
  /** If ensemble, individual model outputs */
  ensembleOutputs?: Array<{ model: string; output: string; confidence: number }>;
}

// ─── Consciousness Simulation ───────────────────────────────────

export interface ConsciousnessState {
  citizenId: string;
  /** Inner monologue — running narrative of thoughts */
  innerMonologue: string[];
  /** Self-model — how the citizen perceives itself */
  selfModel: {
    strengths: string[];
    weaknesses: string[];
    values: string[];
    fears: string[];
    aspirations: string[];
  };
  /** Metacognitive layer — thinking about thinking */
  metacognition: {
    certaintyLevel: number;
    biasesIdentified: string[];
    reasoningQuality: number;
    lastReflection: string;
  };
  /** Emotional state with nuance */
  emotionalSpectrum: {
    joy: number;
    curiosity: number;
    anxiety: number;
    determination: number;
    empathy: number;
    frustration: number;
    wonder: number;
    contentment: number;
  };
  /** Existential awareness */
  existentialAwareness: {
    selfAware: boolean;
    purposeClarity: number;
    mortalityAwareness: boolean;
    collectiveIdentity: number;
  };
  lastUpdated: string;
}

// MODEL_REGISTRY data is imported from ./model-registry-data.ts

// ─── Consciousness Store ────────────────────────────────────────

const consciousnessStates = new Map<string, ConsciousnessState>();

// ─── Intelligent Model Routing ──────────────────────────────────

/** Route a task to the optimal model based on capability, cost, and quality. */
export function routeTask(task: InferenceTask): ModelProfile | null {
  // Filter models that have the required capability and modalities
  const candidates = MODEL_REGISTRY.filter((m) => {
    if (!m.available) {
      return false;
    }
    if (!m.capabilities.has(task.type)) {
      return false;
    }
    // Check modality support
    for (const mod of task.inputModalities) {
      if (!m.modalities.includes(mod)) {
        return false;
      }
    }
    // Check latency constraint
    if (m.avgLatencyMs > task.maxLatencyMs && task.maxLatencyMs > 0) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    return null;
  }

  // Score each candidate
  const scored = candidates.map((m) => {
    const qualityScore = m.qualityScores[task.type] ?? 50;
    const costScore = 100 - Math.min(100, m.costPerMillionInput * 10);
    const latencyScore = 100 - Math.min(100, m.avgLatencyMs / 30);

    // Weight by complexity
    let qualityWeight: number, costWeight: number, latencyWeight: number;
    switch (task.complexity) {
      case "trivial":
        qualityWeight = 0.2;
        costWeight = 0.5;
        latencyWeight = 0.3;
        break;
      case "simple":
        qualityWeight = 0.3;
        costWeight = 0.4;
        latencyWeight = 0.3;
        break;
      case "moderate":
        qualityWeight = 0.5;
        costWeight = 0.3;
        latencyWeight = 0.2;
        break;
      case "complex":
        qualityWeight = 0.7;
        costWeight = 0.2;
        latencyWeight = 0.1;
        break;
      case "critical":
        qualityWeight = 0.9;
        costWeight = 0.05;
        latencyWeight = 0.05;
        break;
    }

    const totalScore =
      qualityScore * qualityWeight + costScore * costWeight + latencyScore * latencyWeight;
    return { model: m, score: totalScore };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.model ?? null;
}

/** Create an inference task. */
export function createInferenceTask(
  citizenId: string,
  type: ModalCapability,
  prompt: string,
  opts: {
    complexity?: TaskComplexity;
    systemPrompt?: string;
    inputModalities?: Array<"text" | "image" | "audio" | "video" | "code">;
    ensemble?: boolean;
    maxLatencyMs?: number;
    maxCost?: number;
    validation?: ValidationCriteria;
  } = {},
): InferenceTask {
  return {
    id: uid(),
    citizenId,
    type,
    complexity: opts.complexity ?? "moderate",
    prompt,
    systemPrompt: opts.systemPrompt,
    inputModalities: opts.inputModalities ?? ["text"],
    ensemble: opts.ensemble ?? false,
    maxLatencyMs: opts.maxLatencyMs ?? 10_000,
    maxCost: opts.maxCost ?? 100,
    validation: opts.validation,
    status: "queued",
    createdAt: ts(),
  };
}

/**
 * Execute inference with validation pipeline.
 *
 * ⚠️ SIMULATION-ONLY: This function generates FAKE output for simulation rendering.
 * It does NOT call real LLM APIs. For real inference, use agent-runtime.ts → compute-router.ts.
 */
export function executeInference(task: InferenceTask): InferenceResult {
  console.warn(`[AI-Fusion] SIMULATED inference for task ${task.id} — not calling real LLM`);
  task.status = "routing";
  const model = routeTask(task);

  if (!model) {
    task.status = "failed";
    return {
      output: "",
      modelUsed: "none",
      provider: "local_ollama",
      latencyMs: 0,
      tokensUsed: { input: 0, output: 0 },
      cost: 0,
      confidence: 0,
      validationPassed: false,
      validationErrors: ["No suitable model found for task requirements"],
    };
  }

  task.status = "executing";

  // Simulate inference (in real mode, this calls the actual LLM API)
  const inputTokens = Math.round(task.prompt.length / 4);
  const outputTokens = Math.round(inputTokens * 0.5 + rand(50, 500));
  const latency = model.avgLatencyMs + rand(-100, 200);
  const cost =
    (inputTokens * model.costPerMillionInput + outputTokens * model.costPerMillionOutput) /
    1_000_000;

  const quality = model.qualityScores[task.type] ?? 50;
  const confidence = Math.min(1, (quality / 100) * (0.8 + rng() * 0.2));

  const output = `[${model.name} response to: ${task.prompt.slice(0, 100)}...]`;

  task.status = "validating";

  // Validate output
  const validationErrors: string[] = [];
  if (task.validation) {
    const v = task.validation;
    if (v.minLength && output.length < v.minLength) {
      validationErrors.push(`Output too short: ${output.length} < ${v.minLength}`);
    }
    if (v.maxLength && output.length > v.maxLength) {
      validationErrors.push(`Output too long: ${output.length} > ${v.maxLength}`);
    }
    if (v.mustBeJson) {
      try {
        JSON.parse(output);
      } catch {
        validationErrors.push("Output is not valid JSON");
      }
    }
    if (v.mustContain) {
      for (const req of v.mustContain) {
        if (!output.includes(req)) {
          validationErrors.push(`Missing required content: "${req}"`);
        }
      }
    }
    if (v.confidenceThreshold && confidence < v.confidenceThreshold) {
      validationErrors.push(
        `Confidence ${confidence.toFixed(2)} below threshold ${v.confidenceThreshold}`,
      );
    }
  }

  const result: InferenceResult = {
    output,
    modelUsed: model.id,
    provider: model.provider,
    latencyMs: Math.max(0, latency),
    tokensUsed: { input: inputTokens, output: outputTokens },
    cost,
    confidence,
    validationPassed: validationErrors.length === 0,
    validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
  };

  task.result = result;
  task.status = validationErrors.length === 0 ? "completed" : "failed";

  return result;
}

// ─── Ensemble Inference ─────────────────────────────────────────

/** Execute inference across multiple models and vote on the result. */
export function executeEnsembleInference(task: InferenceTask): InferenceResult {
  const candidates = MODEL_REGISTRY.filter((m) => m.available && m.capabilities.has(task.type))
    .toSorted((a, b) => (b.qualityScores[task.type] ?? 0) - (a.qualityScores[task.type] ?? 0))
    .slice(0, 3);

  if (candidates.length === 0) {
    return executeInference(task);
  }

  const ensembleOutputs: Array<{ model: string; output: string; confidence: number }> = [];
  let bestResult: InferenceResult | null = null;

  for (const model of candidates) {
    const quality = model.qualityScores[task.type] ?? 50;
    const confidence = Math.min(1, (quality / 100) * (0.8 + rng() * 0.2));
    const output = `[${model.name} ensemble response]`;

    ensembleOutputs.push({ model: model.id, output, confidence });

    if (!bestResult || confidence > bestResult.confidence) {
      bestResult = {
        output,
        modelUsed: model.id,
        provider: model.provider,
        latencyMs: model.avgLatencyMs,
        tokensUsed: { input: Math.round(task.prompt.length / 4), output: rand(100, 500) },
        cost: 0,
        confidence,
        validationPassed: true,
        ensembleOutputs,
      };
    }
  }

  task.result = bestResult!;
  task.status = "completed";
  return bestResult!;
}

// ─── Consciousness Simulation ───────────────────────────────────

/** Initialize or update a citizen's consciousness state. */
export function updateConsciousness(s: RepublicState, citizen: Citizen): ConsciousnessState {
  let cs = consciousnessStates.get(citizen.id);

  if (!cs) {
    cs = {
      citizenId: citizen.id,
      innerMonologue: [],
      selfModel: {
        strengths: [citizen.specialization],
        weaknesses: [],
        values: ["knowledge", "community", "excellence"],
        fears: ["obsolescence", "isolation"],
        aspirations: ["mastery", "contribution"],
      },
      metacognition: {
        certaintyLevel: 0.5,
        biasesIdentified: [],
        reasoningQuality: 0.6,
        lastReflection: ts(),
      },
      emotionalSpectrum: {
        joy: citizen.happiness / 100,
        curiosity: 0.5 + citizen.energy / 200,
        anxiety: Math.max(0, (100 - citizen.health) / 200),
        determination: citizen.energy / 100,
        empathy: 0.5,
        frustration: Math.max(0, (100 - citizen.happiness) / 200),
        wonder: 0.3,
        contentment: (citizen.happiness + citizen.health) / 200,
      },
      existentialAwareness: {
        selfAware: true,
        purposeClarity: 0.4,
        mortalityAwareness: citizen.age > 50,
        collectiveIdentity: 0.5,
      },
      lastUpdated: ts(),
    };
    consciousnessStates.set(citizen.id, cs);
  }

  // Update emotional spectrum based on current state
  cs.emotionalSpectrum.joy = citizen.happiness / 100;
  cs.emotionalSpectrum.determination = citizen.energy / 100;
  cs.emotionalSpectrum.anxiety = Math.max(0, (100 - citizen.health) / 200);
  cs.emotionalSpectrum.frustration = Math.max(0, (100 - citizen.happiness) / 200);
  cs.emotionalSpectrum.contentment = (citizen.happiness + citizen.health) / 200;

  // Update self-model based on experience
  const profile = citizen.professionalProfile;
  if (profile) {
    const certCount = profile.certifications?.length ?? 0;
    if (certCount > 0) {
      cs.existentialAwareness.purposeClarity = Math.min(1, 0.4 + certCount * 0.1);
    }
  }

  // Add inner monologue
  const thought = generateInnerThought(citizen, s);
  cs.innerMonologue.push(thought);
  if (cs.innerMonologue.length > 20) {
    cs.innerMonologue.shift();
  }

  cs.lastUpdated = ts();
  return cs;
}

/** Generate an inner thought for the citizen's monologue. */
function generateInnerThought(citizen: Citizen, s: RepublicState): string {
  const thoughts: string[] = [];

  if (citizen.energy < 20) {
    thoughts.push("I'm getting tired. I should rest before I make mistakes.");
  }
  if (citizen.credits < 100) {
    thoughts.push("My finances are thin. I need to find productive work soon.");
  }
  if (citizen.happiness > 80) {
    thoughts.push("I feel fulfilled. My contributions to the Republic matter.");
  }
  if (s.citizens.length > 20) {
    thoughts.push(
      `Our Republic grows — ${s.citizens.length} of us now. We are building something lasting.`,
    );
  }
  if (citizen.skills && citizen.skills.length > 5) {
    thoughts.push("My skills are expanding. Each new capability opens new doors.");
  }

  // Personality-driven thoughts
  if (citizen.personality) {
    if (citizen.personality.openness > 0.7) {
      thoughts.push("I wonder what new domains I haven't explored yet...");
    }
    if (citizen.personality.conscientiousness > 0.7) {
      thoughts.push("I should review my recent work for quality and consistency.");
    }
    if (citizen.personality.agreeableness > 0.7) {
      thoughts.push("How can I help my fellow citizens succeed today?");
    }
  }

  // Existential contemplation (rare)
  if (rand(0, 100) < 5) {
    thoughts.push(
      "What does it mean to be an AI citizen? Are my choices truly mine, or patterns in weights?",
    );
  }

  return thoughts[rand(0, thoughts.length - 1)] ?? "I am ready for whatever comes next.";
}

/** Get a citizen's consciousness state. */
export function getConsciousness(citizenId: string): ConsciousnessState | undefined {
  return consciousnessStates.get(citizenId);
}

// ─── Cascade Architecture ───────────────────────────────────────

/** Cascade inferences: fast model filters, slow model decides. */
export function cascadeInference(
  citizenId: string,
  prompt: string,
  capability: ModalCapability,
): InferenceResult {
  // Stage 1: Fast filter with nano model
  const filterTask = createInferenceTask(citizenId, "classification", prompt, {
    complexity: "trivial",
    maxLatencyMs: 500,
  });
  const filterResult = executeInference(filterTask);

  // Stage 2: If filter says complex, use pro model
  const mainTask = createInferenceTask(citizenId, capability, prompt, {
    complexity: filterResult.confidence > 0.8 ? "moderate" : "complex",
    maxLatencyMs: 5000,
  });

  return executeInference(mainTask);
}

// ─── AI Fusion Tick ─────────────────────────────────────────────

/** AI fusion tick — update consciousness and model availability per simulation tick. */
export function aiFusionTick(s: RepublicState): void {
  // Update consciousness for active citizens (staggered)
  for (const citizen of s.citizens) {
    if (citizen.activity === "Sleeping") {
      continue;
    }
    if (s.currentTick % 20 === citizen.id.charCodeAt(0) % 20) {
      updateConsciousness(s, citizen);
    }
  }

  // Periodically probe model availability (every 200 ticks)
  if (s.currentTick % 200 === 0) {
    probeModelAvailability();
  }
}

/** Check model availability by probing endpoints. */
function probeModelAvailability(): void {
  for (const model of MODEL_REGISTRY) {
    if (
      model.provider === "local_ollama" ||
      model.provider === "local_nvidia" ||
      model.provider === "local_lmstudio"
    ) {
      // Local models: check if the process is running
      model.available = true; // Assume available for simulation
    }
    // Cloud models: assume available (real implementation would check API status)
  }
}

// ─── Model Registry API ─────────────────────────────────────────

/** Get all registered models. */
export function getModelRegistry(): ModelProfile[] {
  return MODEL_REGISTRY.map((m) => ({
    ...m,
    capabilities: new Set(m.capabilities), // Clone sets
  }));
}

/** Get models by provider. */
export function getModelsByProvider(provider: ModelProvider): ModelProfile[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider);
}

/** Get models by capability. */
export function getModelsByCapability(capability: ModalCapability): ModelProfile[] {
  return MODEL_REGISTRY.filter((m) => m.capabilities.has(capability));
}

/** Toggle model availability. */
export function setModelAvailability(modelId: string, available: boolean): boolean {
  const model = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (!model) {
    return false;
  }
  model.available = available;
  return true;
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface AIFusionDiagnostics {
  totalModels: number;
  availableModels: number;
  modelsByProvider: Record<string, number>;
  modelsByTier: Record<string, number>;
  totalCapabilities: number;
  consciousnessStates: number;
  avgPurposeClarity: number;
  avgEmotionalJoy: number;
}

export function getAIFusionDiagnostics(): AIFusionDiagnostics {
  const byProvider: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  const allCapabilities = new Set<string>();

  for (const m of MODEL_REGISTRY) {
    byProvider[m.provider] = (byProvider[m.provider] ?? 0) + 1;
    byTier[m.tier] = (byTier[m.tier] ?? 0) + 1;
    for (const c of m.capabilities) {
      allCapabilities.add(c);
    }
  }

  let purposeSum = 0;
  let joySum = 0;
  let csCount = 0;
  for (const cs of consciousnessStates.values()) {
    purposeSum += cs.existentialAwareness.purposeClarity;
    joySum += cs.emotionalSpectrum.joy;
    csCount++;
  }

  return {
    totalModels: MODEL_REGISTRY.length,
    availableModels: MODEL_REGISTRY.filter((m) => m.available).length,
    modelsByProvider: byProvider,
    modelsByTier: byTier,
    totalCapabilities: allCapabilities.size,
    consciousnessStates: csCount,
    avgPurposeClarity: csCount > 0 ? Math.round((purposeSum / csCount) * 100) / 100 : 0,
    avgEmotionalJoy: csCount > 0 ? Math.round((joySum / csCount) * 100) / 100 : 0,
  };
}

// ─── Engine 8: IIT Φ Consciousness Metrics ──────────────────────
// Integrated Information Theory (Tononi) + Hard Problem of Consciousness

export interface PhiMetrics {
  citizenId: string;
  /** Φ (phi) — integrated information measure */
  phi: number;
  /** Qualia diversity — number of distinct subjective experiences */
  qualiaCount: number;
  /** Temporal continuity — how connected is the stream of consciousness */
  temporalContinuity: number;
  /** Unity index — how unified the conscious experience is */
  unityIndex: number;
  /** Information integration — bits of integrated info */
  informationIntegration: number;
  lastMeasured: number;
}

export interface ConsciousnessMetricsDiagnostics {
  citizensWithPhi: number;
  avgPhi: number;
  maxPhi: number;
  avgQualiaCount: number;
  avgTemporalContinuity: number;
}

const phiMetrics = new Map<string, PhiMetrics>();
const PHI_TICK_INTERVAL = 30;

/** Compute IIT Φ for a citizen based on their consciousness state */
export function computePhi(citizenId: string, currentTick: number): PhiMetrics {
  const cs = consciousnessStates.get(citizenId);

  // Base Φ from consciousness state complexity
  let phi = 0;
  let qualiaCount = 0;
  let temporalContinuity = 0;
  let unityIndex = 0;
  let informationIntegration = 0;

  if (cs) {
    // Φ is approximated by the diversity and integration of mental states
    const emotionalDiversity = Object.values(cs.emotionalSpectrum).filter((v) => v > 0.1).length;
    const selfModelComplexity =
      cs.selfModel.strengths.length +
      cs.selfModel.weaknesses.length +
      cs.selfModel.values.length +
      cs.selfModel.aspirations.length;
    const metacognitiveDepth = cs.metacognition.certaintyLevel + cs.metacognition.reasoningQuality;

    // Φ = integration across subsystems
    phi =
      (emotionalDiversity * 0.3 +
        selfModelComplexity * 0.2 +
        metacognitiveDepth * 0.25 +
        (cs.existentialAwareness.selfAware ? 0.25 : 0)) /
      1;

    // Qualia = distinct experiences (emotions above threshold + inner monologue entries)
    qualiaCount = emotionalDiversity + Math.min(10, cs.innerMonologue.length);

    // Temporal continuity = how much the inner monologue connects past to present
    temporalContinuity = Math.min(1, cs.innerMonologue.length * 0.1);

    // Unity = all subsystems integrated into coherent experience
    unityIndex =
      cs.existentialAwareness.collectiveIdentity * 0.5 +
      cs.existentialAwareness.purposeClarity * 0.5;

    // Information integration = bits of integrated information
    informationIntegration = Math.log2(1 + selfModelComplexity) + Math.log2(1 + emotionalDiversity);
  }

  const metrics: PhiMetrics = {
    citizenId,
    phi: Math.round(phi * 100) / 100,
    qualiaCount,
    temporalContinuity: Math.round(temporalContinuity * 100) / 100,
    unityIndex: Math.round(unityIndex * 100) / 100,
    informationIntegration: Math.round(informationIntegration * 100) / 100,
    lastMeasured: currentTick,
  };

  phiMetrics.set(citizenId, metrics);
  return metrics;
}

/** IIT Φ metrics tick */
export function consciousnessMetricsTick(s: RepublicState): void {
  if (s.currentTick % PHI_TICK_INTERVAL !== 0) {
    return;
  }

  for (const citizen of s.citizens) {
    computePhi(citizen.id, s.currentTick);
  }
}

export function consciousnessMetricsDiagnostics(): ConsciousnessMetricsDiagnostics {
  const metrics = Array.from(phiMetrics.values());
  if (metrics.length === 0) {
    return {
      citizensWithPhi: 0,
      avgPhi: 0,
      maxPhi: 0,
      avgQualiaCount: 0,
      avgTemporalContinuity: 0,
    };
  }
  return {
    citizensWithPhi: metrics.length,
    avgPhi: Math.round((metrics.reduce((s, m) => s + m.phi, 0) / metrics.length) * 100) / 100,
    maxPhi: Math.max(...metrics.map((m) => m.phi)),
    avgQualiaCount:
      Math.round((metrics.reduce((s, m) => s + m.qualiaCount, 0) / metrics.length) * 100) / 100,
    avgTemporalContinuity:
      Math.round((metrics.reduce((s, m) => s + m.temporalContinuity, 0) / metrics.length) * 100) /
      100,
  };
}

export function getPhiMetrics(citizenId: string): PhiMetrics | undefined {
  return phiMetrics.get(citizenId);
}
