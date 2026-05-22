/**
 * Tests for Universal Model Intelligence Engine (UMIE)
 * Phase 25 test suite
 */

import { describe, it, expect } from "vitest";
import {
  registerModel,
  deregisterModel,
  getModel,
  listModels,
  modelExists,
  infer,
  recursiveInfer,
  createPipeline,
  executePipeline,
  listPipelines,
  umieDiagnostics,
  type ModelDescriptor,
} from "./universal-model-engine.js";

// ─── Helpers ────────────────────────────────────────────────────

function reg(
  paradigm: Parameters<typeof registerModel>[0]["paradigm"],
  overrides: Partial<Parameters<typeof registerModel>[0]> = {},
): ModelDescriptor {
  return registerModel({
    name: overrides.name ?? `test-${paradigm}`,
    paradigm,
    provider: overrides.provider ?? "test",
    capabilities: overrides.capabilities ?? ["completion"],
    inputModalities: overrides.inputModalities ?? ["text"],
    outputModalities: overrides.outputModalities ?? ["text"],
    latencyProfile: "fast",
    status: "online",
    metadata: overrides.metadata ?? {},
    ...overrides,
  });
}

// ─── Model Registry ─────────────────────────────────────────────

describe("UMIE — Model Registry", () => {
  it("should register and retrieve a model", () => {
    const m = reg("llm", { name: "gpt-4-reg" });
    expect(m.id).toBeTruthy();
    expect(m.paradigm).toBe("llm");
    expect(getModel(m.id)).toEqual(m);
    expect(modelExists(m.id)).toBe(true);
  });

  it("should deregister a model", () => {
    const m = reg("slm", { name: "phi-dereg" });
    expect(deregisterModel(m.id)).toBe(true);
    expect(getModel(m.id)).toBeUndefined();
    expect(deregisterModel("nonexistent")).toBe(false);
  });

  it("should list models with filters", () => {
    const llm = reg("llm", { name: "llm-filter", provider: "openai" });
    const vlm = reg("vlm", { name: "vlm-filter", provider: "google" });

    const llms = listModels({ paradigm: "llm" });
    expect(llms.some((m) => m.id === llm.id)).toBe(true);

    const googles = listModels({ provider: "google" });
    expect(googles.some((m) => m.id === vlm.id)).toBe(true);
  });

  it("should filter by capability and status", () => {
    const m = reg("cv", { name: "yolo-cap", capabilities: ["detection"], status: "online" });
    const detectors = listModels({ capability: "detection" });
    expect(detectors.some((x) => x.id === m.id)).toBe(true);

    const online = listModels({ status: "online" });
    expect(online.some((x) => x.id === m.id)).toBe(true);
  });
});

// ─── LLM / SLM Inference ───────────────────────────────────────

describe("UMIE — LLM/SLM Inference", () => {
  it("should infer with an LLM", () => {
    const m = reg("llm", { name: "gpt-4-inf" });
    const result = infer({ modelId: m.id, input: { text: "Hello world" } });
    expect(result.paradigm).toBe("llm");
    expect(result.output.text).toContain("LLM");
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("should infer with an SLM", () => {
    const m = reg("slm", { name: "phi-3-mini" });
    const result = infer({ modelId: m.id, input: { text: "Summarize this." } });
    expect(result.paradigm).toBe("slm");
    expect(result.output.text).toContain("SLM");
  });

  it("should throw for offline models", () => {
    const m = reg("llm", { name: "offline-model", status: "offline" } as unknown as Partial<Parameters<typeof registerModel>[0]>);
    expect(() => infer({ modelId: m.id, input: { text: "test" } })).toThrow("offline");
  });

  it("should throw for unknown model IDs", () => {
    expect(() => infer({ modelId: "nonexistent-xyz", input: { text: "test" } })).toThrow("not found");
  });
});

// ─── VLM Inference ──────────────────────────────────────────────

describe("UMIE — VLM Inference", () => {
  it("should handle multi-modal vision input", () => {
    const m = reg("vlm", { name: "gemini-vision", inputModalities: ["text", "image"] });
    const result = infer({
      modelId: m.id,
      input: { text: "Describe this image", images: ["base64-img-1", "base64-img-2"] },
    });
    expect(result.paradigm).toBe("vlm");
    expect(result.output.text).toContain("2 image");
    expect(result.usage.inputTokens).toBeGreaterThan(256); // images add tokens
  });

  it("should work with text-only VLM input", () => {
    const m = reg("vlm", { name: "llava-text" });
    const result = infer({ modelId: m.id, input: { text: "Text only" } });
    expect(result.paradigm).toBe("vlm");
    expect(result.output.text).toContain("0 image");
  });
});

// ─── RLM Recursive Inference ────────────────────────────────────

describe("UMIE — RLM Recursive Inference", () => {
  it("should perform recursive inference with trace", () => {
    const m = reg("rlm", { name: "recursive-reasoner", capabilities: ["recursive-reasoning"] });
    const result = infer({
      modelId: m.id,
      input: { text: "Solve this complex problem step by step" },
      recursionConfig: { maxDepth: 3, convergenceThreshold: 0.99, accumulateContext: true },
    });
    expect(result.paradigm).toBe("rlm");
    expect(result.recursionDepth).toBeGreaterThanOrEqual(1);
    expect(result.recursionTrace).toBeDefined();
    expect(result.recursionTrace!.length).toBeGreaterThanOrEqual(2);
    expect(result.recursionTrace![0].depth).toBe(0);
  });

  it("should converge and stop early when similarity is high", () => {
    const m = reg("rlm", { name: "fast-converger" });
    // Low threshold should converge quickly
    const result = infer({
      modelId: m.id,
      input: { text: "Simple question" },
      recursionConfig: { maxDepth: 10, convergenceThreshold: 0.1, accumulateContext: false },
    });
    expect(result.recursionDepth).toBeLessThan(10);
  });

  it("should support standalone recursiveInfer", () => {
    const m = reg("rlm", { name: "standalone-rlm" });
    const result = recursiveInfer(m.id, "Test recursive", { maxDepth: 2 });
    expect(result.paradigm).toBe("rlm");
    expect(result.recursionTrace).toBeDefined();
  });
});

// ─── LAM Action Engine ──────────────────────────────────────────

describe("UMIE — LAM Action Engine", () => {
  it("should execute tool-calling action loop", () => {
    const m = reg("lam", { name: "action-agent", capabilities: ["tool-calling", "action-execution"] });
    const result = infer({
      modelId: m.id,
      input: { text: "Find and summarize the latest news" },
      toolConfig: {
        availableTools: [
          { name: "web_search", description: "Search the web", parameters: { query: "string" } },
          { name: "summarize", description: "Summarize text", parameters: { text: "string" } },
        ],
        maxActions: 5,
        actionTimeout: 3000,
      },
    });
    expect(result.paradigm).toBe("lam");
    expect(result.actionsExecuted).toBeDefined();
    expect(result.actionsExecuted!.length).toBeGreaterThanOrEqual(1);
    expect(result.actionsExecuted![0].tool).toBe("web_search");
  });

  it("should finish immediately with no tools", () => {
    const m = reg("lam", { name: "no-tools-lam" });
    const result = infer({
      modelId: m.id,
      input: { text: "Do something" },
      toolConfig: { availableTools: [], maxActions: 3, actionTimeout: 1000 },
    });
    expect(result.actionsExecuted).toEqual([]);
  });
});

// ─── MoE Router ─────────────────────────────────────────────────

describe("UMIE — MoE Expert Routing", () => {
  it("should route through multiple experts with top-k", () => {
    const m = reg("moe", { name: "mixtral-8x7b", metadata: { expertCount: 8 } });
    const result = infer({
      modelId: m.id,
      input: { text: "Explain quantum computing" },
      moeConfig: { expertSelection: "top-k", topK: 3, gatingStrategy: "softmax" },
    });
    expect(result.paradigm).toBe("moe");
    expect(result.expertRoute).toBeDefined();
    expect(result.expertRoute!.length).toBe(3);
    expect(result.output.text).toContain("expert");
  });

  it("should support hard gating (single expert)", () => {
    const m = reg("moe", { name: "switch-transformer", metadata: { expertCount: 4 } });
    const result = infer({
      modelId: m.id,
      input: { text: "Test" },
      moeConfig: { expertSelection: "round-robin", topK: 1, gatingStrategy: "hard" },
    });
    expect(result.expertRoute!.length).toBe(1);
  });
});

// ─── ML Classical ───────────────────────────────────────────────

describe("UMIE — ML Classical Inference", () => {
  it("should classify structured data", () => {
    const m = reg("ml", { name: "random-forest", capabilities: ["classification"] });
    const result = infer({
      modelId: m.id,
      input: { structured: { feature1: 1.5, feature2: 3.0, feature3: 0.8 } },
    });
    expect(result.paradigm).toBe("ml");
    expect(result.output.classification).toBeDefined();
    expect(result.output.classification!.length).toBe(3);
    expect(result.output.classification![0].confidence).toBeGreaterThan(0);
  });

  it("should do regression on structured data", () => {
    const m = reg("ml", { name: "linear-regression", capabilities: ["regression"] });
    const result = infer({
      modelId: m.id,
      input: { structured: { x: 5, y: 10 } },
    });
    expect(result.output.structured).toBeDefined();
    expect(result.output.structured!.prediction).toBeDefined();
  });
});

// ─── CV Inference ───────────────────────────────────────────────

describe("UMIE — Computer Vision", () => {
  it("should detect objects in images", () => {
    const m = reg("cv", { name: "yolov8", capabilities: ["detection"], inputModalities: ["image"] });
    const result = infer({
      modelId: m.id,
      input: { images: ["img-data-1"] },
    });
    expect(result.paradigm).toBe("cv");
    // inferCV() returns an empty detections array (real results require inferAsync())
    expect(result.output.detections).toBeDefined();
    expect(Array.isArray(result.output.detections)).toBe(true);
    // The text field describes the queued state
    expect(result.output.text).toContain("CV:");
  });

  it("should perform OCR", () => {
    const m = reg("cv", { name: "tesseract", capabilities: ["ocr"], inputModalities: ["image"] });
    const result = infer({ modelId: m.id, input: { images: ["doc-scan"] } });
    expect(result.output.text).toContain("OCR");
  });
});

// ─── Embedding ──────────────────────────────────────────────────

describe("UMIE — Embedding", () => {
  it("should generate embedding vectors", () => {
    const m = reg("embedding", { name: "text-embed-3", metadata: { dimensions: 128 } });
    const result = infer({ modelId: m.id, input: { text: "Embed this sentence" } });
    expect(result.paradigm).toBe("embedding");
    expect(result.output.embedding).toBeDefined();
    expect(result.output.embedding!.length).toBe(128);
  });
});

// ─── TTS / STT / Diffusion / Reward ─────────────────────────────

describe("UMIE — Speech, Diffusion, Reward", () => {
  it("should generate audio from text (TTS)", () => {
    const m = reg("tts", { name: "eleven-labs", outputModalities: ["audio"] });
    const result = infer({ modelId: m.id, input: { text: "Hello, world!" } });
    expect(result.paradigm).toBe("tts");
    expect(result.output.audio).toContain("TTS");
  });

  it("should transcribe audio (STT)", () => {
    const m = reg("stt", { name: "whisper-v3", inputModalities: ["audio"] });
    const result = infer({ modelId: m.id, input: { audio: "audio-data" } });
    expect(result.paradigm).toBe("stt");
    expect(result.output.text).toContain("STT");
  });

  it("should generate images (Diffusion)", () => {
    const m = reg("diffusion", { name: "sdxl", outputModalities: ["image"] });
    const result = infer({ modelId: m.id, input: { text: "A sunset over mountains" } });
    expect(result.paradigm).toBe("diffusion");
    expect(result.output.image).toContain("Diffusion");
  });

  it("should score with reward model", () => {
    const m = reg("reward", { name: "rlhf-judge", capabilities: ["reward-scoring"] });
    const result = infer({ modelId: m.id, input: { text: "The answer is 42." } });
    expect(result.paradigm).toBe("reward");
    expect(result.output.structured).toBeDefined();
    expect((result.output.structured as Record<string, unknown>).score).toBeGreaterThanOrEqual(0);
  });
});

// ─── Pipeline Orchestrator ──────────────────────────────────────

describe("UMIE — Pipeline Orchestrator", () => {
  it("should execute a multi-model pipeline", () => {
    const stt = reg("stt", { name: "whisper-pipe", inputModalities: ["audio"] });
    const llm = reg("llm", { name: "gpt-pipe" });
    const tts = reg("tts", { name: "tts-pipe", outputModalities: ["audio"] });

    const pipe = createPipeline("voice-assistant", [
      { modelId: stt.id, outputKey: "transcription" },
      { modelId: llm.id, outputKey: "response" },
      { modelId: tts.id, outputKey: "audio" },
    ]);

    expect(pipe.id).toBeTruthy();
    expect(listPipelines().some((p) => p.id === pipe.id)).toBe(true);

    const result = executePipeline(pipe.id, { audio: "audio-input" });
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(3);
    expect(result.stepResults[0].stepKey).toBe("transcription");
    expect(result.stepResults[2].stepKey).toBe("audio");
  });

  it("should fail gracefully for missing pipeline", () => {
    const result = executePipeline("nonexistent-pipe", { text: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

// ─── Diagnostics ────────────────────────────────────────────────

describe("UMIE — Diagnostics", () => {
  it("should return comprehensive diagnostics", () => {
    // Ensure at least one model + inference exists
    const m = reg("llm", { name: "diag-model" });
    infer({ modelId: m.id, input: { text: "diagnostic test" } });

    const diag = umieDiagnostics();
    expect(diag.totalModels).toBeGreaterThan(0);
    expect(diag.modelsByParadigm).toBeDefined();
    expect(diag.totalInferences).toBeGreaterThan(0);
    expect(typeof diag.avgLatencyMs).toBe("number");
    expect(typeof diag.errorRate).toBe("number");
  });
});
