/**
 * Sovereign Tool Executors
 *
 * Wires the self-sovereign engine tools into the real-execution system:
 * - analyze_image → Vision Engine
 * - sovereign_search → Search+RAG pipeline
 * - knowledge_store / knowledge_query → Knowledge Base
 * - run_code → Code Interpreter
 * - transcribe_audio → Voice STT
 * - synthesize_speech → Voice TTS
 */

import type { InterpreterLanguage } from "../code-interpreter/types.js";
import type { ExecutionResult, ExecutionContext } from "../execution-types.js";
import type { KnowledgeCategory } from "../knowledge-base/types.js";
import type { VisionAction, VisionProvider } from "../vision-engine/types.js";
import type { STTProvider } from "../voice-engine/types.js";
import type { TTSProvider } from "../voice-engine/types.js";
import { makeSuccessResult, makeFailResult } from "../execution-types.js";

// ─── analyze_image ─────────────────────────────────────────────────

export async function executeAnalyzeImage(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { analyzeImage } = await import("../vision-engine/core.js");
    const result = await analyzeImage({
      image: String(args.image ?? ""),
      action: (args.action as VisionAction) ?? "describe",
      question: args.question as string | undefined,
      provider: args.provider as VisionProvider | undefined,
    });
    return makeSuccessResult("analyze_image", ctx, start, result.text);
  } catch (err: unknown) {
    return makeFailResult(
      "analyze_image",
      ctx,
      start,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── sovereign_search ──────────────────────────────────────────────

export async function executeSovereignSearch(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { classifyGrounding, needsSearch } = await import("../search-rag/grounding.js");
    const query = String(args.query ?? "");

    // If no web search needed, return grounding analysis
    if (!needsSearch(query)) {
      const signals = classifyGrounding(query);
      return makeSuccessResult(
        "sovereign_search",
        ctx,
        start,
        `Grounding analysis: This query can be answered from model knowledge (confidence: ${Math.round(signals.confidence * 100)}%). No web search needed.`,
      );
    }

    // For now, delegate through grounding classifier result
    const signals = classifyGrounding(query);
    return makeSuccessResult(
      "sovereign_search",
      ctx,
      start,
      `Grounding analysis: decision=${signals.decision}, confidence=${Math.round(signals.confidence * 100)}%, needs_search=true. Use web_search or browse_web for fetching live results.`,
    );
  } catch (err: unknown) {
    return makeFailResult(
      "sovereign_search",
      ctx,
      start,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── knowledge_store ──────────────────────────────────────────────

export async function executeKnowledgeStore(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { addKnowledge } = await import("../knowledge-base/core.js");
    const entry = addKnowledge({
      title: String(args.title ?? ""),
      content: String(args.content ?? ""),
      category: (args.category as KnowledgeCategory) ?? "fact",
      tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
      source: "agent",
    });
    return makeSuccessResult(
      "knowledge_store",
      ctx,
      start,
      `Stored knowledge entry "${entry.title}" (id: ${entry.id}, category: ${entry.category})`,
    );
  } catch (err: unknown) {
    return makeFailResult(
      "knowledge_store",
      ctx,
      start,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── knowledge_query ──────────────────────────────────────────────

export async function executeKnowledgeQuery(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { queryKnowledge } = await import("../knowledge-base/core.js");
    const result = queryKnowledge({
      query: String(args.query ?? ""),
      category: args.category as KnowledgeCategory | undefined,
      topK: Number(args.top_k ?? 5),
    });

    if (result.entries.length === 0) {
      return makeSuccessResult("knowledge_query", ctx, start, "No relevant knowledge found.");
    }

    const formatted = result.entries
      .map(
        (e, i) =>
          `[${i + 1}] ${e.title} (${e.category}, confidence: ${Math.round(e.confidence * 100)}%)\n   ${e.content.slice(0, 200)}`,
      )
      .join("\n\n");

    return makeSuccessResult(
      "knowledge_query",
      ctx,
      start,
      `Found ${result.entries.length} entries (${result.queryTimeMs}ms):\n\n${formatted}`,
    );
  } catch (err: unknown) {
    return makeFailResult(
      "knowledge_query",
      ctx,
      start,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── run_code ──────────────────────────────────────────────────────

export async function executeRunCode(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { executeCode } = await import("../code-interpreter/core.js");

    // Get sandbox from Docker orchestrator (or provide a local fallback)
    const sandbox = {
      exec: async (cmd: string, cwd: string, timeout: number) => {
        const { execSync } = await import("child_process");
        try {
          const stdout = execSync(cmd, {
            cwd,
            timeout: timeout * 1000,
            encoding: "utf8",
            maxBuffer: 50 * 1024 * 1024,
          });
          return { exitCode: 0, stdout: stdout ?? "", stderr: "" };
        } catch (err: unknown) {
          const e = err as { status?: number; stdout?: string; stderr?: string };
          return {
            exitCode: e.status ?? 1,
            stdout: String(e.stdout ?? ""),
            stderr: String(e.stderr ?? ""),
          };
        }
      },
      writeFile: async (path: string, content: string) => {
        const { writeFileSync, mkdirSync } = await import("fs");
        const { dirname } = await import("path");
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, "utf8");
      },
      readFile: async (path: string) => {
        const { readFileSync } = await import("fs");
        return readFileSync(path, "utf8");
      },
    };

    const result = await executeCode(
      {
        code: String(args.code ?? ""),
        language: (args.language as InterpreterLanguage) ?? "python",
        timeoutSec: Math.round(Number(args.timeout_ms ?? 30_000) / 1000),
      },
      sandbox,
    );

    const parts = [`Exit code: ${result.exitCode}`];
    if (result.stdout) {
      parts.push(`stdout:\n${result.stdout}`);
    }
    if (result.stderr) {
      parts.push(`stderr:\n${result.stderr}`);
    }
    if (result.outputFiles?.length) {
      parts.push(`Generated ${result.outputFiles.length} output file(s)`);
    }

    return result.exitCode === 0
      ? makeSuccessResult("run_code", ctx, start, parts.join("\n\n"))
      : makeFailResult("run_code", ctx, start, parts.join("\n\n"));
  } catch (err: unknown) {
    return makeFailResult("run_code", ctx, start, err instanceof Error ? err.message : String(err));
  }
}

// ─── transcribe_audio ──────────────────────────────────────────────

export async function executeTranscribeAudio(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { transcribe } = await import("../voice-engine/stt.js");
    const audioBase64 = String(args.audio_base64 ?? "");

    const result = await transcribe(
      audioBase64,
      args.provider as STTProvider | undefined,
      (args.language as string) ?? "en",
    );

    return makeSuccessResult(
      "transcribe_audio",
      ctx,
      start,
      `Transcription (${result.latencyMs}ms, confidence: ${Math.round(result.confidence * 100)}%):\n${result.text}`,
    );
  } catch (err: unknown) {
    return makeFailResult(
      "transcribe_audio",
      ctx,
      start,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── synthesize_speech ─────────────────────────────────────────────

export async function executeSynthesizeSpeech(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { synthesize } = await import("../voice-engine/tts-stream.js");
    const result = await synthesize(
      String(args.text ?? ""),
      args.provider as TTSProvider | undefined,
      args.voice_id as string | undefined,
    );

    return makeSuccessResult(
      "synthesize_speech",
      ctx,
      start,
      `Speech synthesized (${result.latencyMs}ms, ${result.durationMs}ms duration). Format: ${result.format}, size: ${Math.round(result.audioBase64.length * 0.75)} bytes`,
    );
  } catch (err: unknown) {
    return makeFailResult(
      "synthesize_speech",
      ctx,
      start,
      err instanceof Error ? err.message : String(err),
    );
  }
}
