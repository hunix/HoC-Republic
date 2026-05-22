/**
 * Chatterbox TTS Plugin — Entry Point
 *
 * Registers 5 tools and 5 gateway RPC methods to expose
 * AI text-to-speech capabilities to HoC citizens.
 *
 * Capabilities:
 *   • Text-to-Speech (3 models: Turbo, Standard, Multilingual)
 *   • Voice cloning via reference audio
 *   • Paralinguistic tags ([laugh], [cough], [chuckle])
 *   • 23-language support
 *
 * ZERO-CONFIG: First run auto-installs chatterbox-tts via pip.
 */

import type { ChatterboxModel, LanguageId } from "./domain/types.ts";
import {
  initBridge,
  submitGeneration,
  getJobStatus,
  cancelJob,
  getQueueStatusInfo,
  getChatterboxPromptInjection,
  isReady,
} from "./adapter/hoc-bridge.ts";

// ─── Plugin Interface ───────────────────────────────────────────

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void; debug?: (msg: string) => void };
  registerTool: (
    name: string,
    description: string,
    schema: unknown,
    handler: (args: Record<string, unknown>) => unknown,
  ) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

// ─── Registration ───────────────────────────────────────────────

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;

  // ─── Bootstrap ──────────────────────────────────────────────
  const status = initBridge(dataDir, log);
  log.info(`[Chatterbox] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  // ─── Tools ──────────────────────────────────────────────────

  registerTool(
    "chatterbox_speak",
    "Generate speech from text using Chatterbox TTS. Choose from Turbo (fast, paralinguistic tags), Standard (English), or Multilingual (23 languages). Returns a job ID for async tracking.",
    {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "Text to convert to speech. Turbo model supports [laugh], [cough], [chuckle] tags.",
        },
        model: {
          type: "string",
          enum: ["turbo", "standard", "multilingual"],
          description: "Model variant (default: turbo)",
        },
        language_id: {
          type: "string",
          description: "Language code for multilingual model (e.g. 'fr', 'de', 'zh')",
        },
        exaggeration: {
          type: "number",
          description: "Expressiveness 0–1 (default: 0.5, standard model only)",
        },
        cfg_weight: {
          type: "number",
          description: "Classifier-free guidance weight 0–1 (default: 0.5, standard model only)",
        },
      },
      required: ["text"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "Chatterbox TTS not available" };
      }
      const job = submitGeneration({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        model: args.model as ChatterboxModel | undefined,
        text: args.text as string,
        languageId: args.language_id as LanguageId | undefined,
        exaggeration: args.exaggeration as number | undefined,
        cfgWeight: args.cfg_weight as number | undefined,
      });
      return job ? { jobId: job.id, status: job.status } : { error: "Failed to submit job" };
    },
  );

  registerTool(
    "chatterbox_clone_voice",
    "Generate speech using a reference voice clip for voice cloning. Provide a ~10s WAV file as the reference.",
    {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to speak in the cloned voice" },
        audio_prompt_path: {
          type: "string",
          description: "Path to the ~10s reference WAV file for voice cloning",
        },
        model: {
          type: "string",
          enum: ["turbo", "standard", "multilingual"],
          description: "Model variant (default: turbo)",
        },
        language_id: { type: "string", description: "Language code for multilingual model" },
        exaggeration: { type: "number" },
        cfg_weight: { type: "number" },
      },
      required: ["text", "audio_prompt_path"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "Chatterbox TTS not available" };
      }
      const job = submitGeneration({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        model: args.model as ChatterboxModel | undefined,
        text: args.text as string,
        audioPromptPath: args.audio_prompt_path as string,
        languageId: args.language_id as LanguageId | undefined,
        exaggeration: args.exaggeration as number | undefined,
        cfgWeight: args.cfg_weight as number | undefined,
      });
      return job ? { jobId: job.id, status: job.status } : { error: "Failed to submit job" };
    },
  );

  registerTool(
    "chatterbox_job_status",
    "Check the status of a Chatterbox TTS generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => {
      const job = getJobStatus(args.job_id as string);
      if (!job) {
        return { error: "Job not found" };
      }
      return {
        id: job.id,
        status: job.status,
        model: job.model,
        outputPath: job.status === "completed" ? job.outputPath : undefined,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      };
    },
  );

  registerTool(
    "chatterbox_cancel_job",
    "Cancel a queued or running Chatterbox TTS generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "chatterbox_queue_status",
    "View the Chatterbox TTS generation queue status.",
    { type: "object", properties: {} },
    () => getQueueStatusInfo(),
  );

  // ─── Gateway RPCs ───────────────────────────────────────────

  registerGateway("chatterbox.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return submitGeneration({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      model: p.model as ChatterboxModel | undefined,
      text: (p.text as string) ?? "",
      audioPromptPath: p.audioPromptPath as string | undefined,
      languageId: p.languageId as LanguageId | undefined,
      exaggeration: p.exaggeration as number | undefined,
      cfgWeight: p.cfgWeight as number | undefined,
    });
  });

  registerGateway("chatterbox.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });

  registerGateway("chatterbox.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return { cancelled: cancelJob(p.jobId as string) };
  });

  registerGateway("chatterbox.queue-status", () => getQueueStatusInfo());

  registerGateway("chatterbox.prompt-injection", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return { prompt: getChatterboxPromptInjection(p.specialization as string | undefined) };
  });

  log.info("[Chatterbox] Plugin registered: 5 tools, 5 gateway RPCs");
}
