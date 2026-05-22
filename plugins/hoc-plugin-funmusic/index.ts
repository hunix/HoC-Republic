/**
 * FunMusic Plugin — Entry Point
 *
 * Registers 5 tools and 5 gateway RPC methods to expose
 * AI music generation capabilities to HoC citizens.
 *
 * Capabilities:
 *   • Text → Music generation (Qwen2.5 transformer + flow-matching)
 *   • Music continuation / extension
 *   • Song structure control (intro, verse, chorus, outro)
 *   • Long-form audio output
 *
 * ZERO-CONFIG: First run auto-clones repo, installs deps, downloads model.
 */

import type { MusicTask, ChorusMode, OutputFormat } from "./domain/types.ts";
import {
  initBridge,
  submitGeneration,
  getJobStatus,
  cancelJob,
  getQueueStatusInfo,
  getFunMusicPromptInjection,
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
  log.info(`[FunMusic] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  // ─── Tools ──────────────────────────────────────────────────

  registerTool(
    "funmusic_text_to_music",
    `Generate COMMERCIAL-GRADE music from a professional production brief using InspireMusic AI.

REQUIRED FORMAT: [Genre+Subgenre] + [BPM] + [Key] + [Full Instrumentation list] + [Vocal style] + [Production style] + [Mood] + [Song section]

EXAMPLE (POP HOT): "Upbeat commercial pop, 128 BPM, C major, tight kick drum and snare, punchy 808 bass, bright acoustic guitar strums, layered synth pads, electric piano melody, female lead vocal with breathy tone and light reverb, catchy verse hook, professional radio mix, bright energetic feel, verse section"

EXAMPLE (TRAP): "Melodic trap, 140 BPM, F minor, heavy 808 bass long decay, hi-hat rolls, crisp snare, atmospheric strings, ethereal choir pads, male rap lead with autotune, female harmonized chorus hook, dark moody energy, Billboard-ready production, chorus section"

ALWAYS include: multiple instruments (minimum 4), tempo in BPM, vocal description, production/mixing style.
NEVER use vague one-line prompts like 'relaxing piano music' — that produces elevator music.`,
    {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Text description of the desired music (genre, mood, instruments, tempo)",
        },
        chorus_mode: {
          type: "string",
          enum: ["intro", "verse", "chorus", "outro"],
          description: "Song structure section (default: verse)",
        },
        start_time: {
          type: "number",
          description: "Generation start time in seconds (default: 0)",
        },
        end_time: { type: "number", description: "Generation end time in seconds (default: 30)" },
        fast: {
          type: "boolean",
          description: "Skip flow-matching for faster (lower quality) generation",
        },
        output_format: {
          type: "string",
          enum: ["wav", "mp3", "flac"],
          description: "Output audio format (default: wav)",
        },
      },
      required: ["prompt"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "FunMusic not available" };
      }
      const job = submitGeneration({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        task: "text-to-music",
        prompt: args.prompt as string,
        chorusMode: args.chorus_mode as ChorusMode | undefined,
        startTime: args.start_time as number | undefined,
        endTime: args.end_time as number | undefined,
        fast: args.fast as boolean | undefined,
        outputFormat: args.output_format as OutputFormat | undefined,
      });
      return job ? { jobId: job.id, status: job.status } : { error: "Failed to submit job" };
    },
  );

  registerTool(
    "funmusic_continue",
    "Continue/extend an existing audio clip using InspireMusic. Provide the path to the audio file and an optional text description to guide continuation.",
    {
      type: "object",
      properties: {
        audio_path: { type: "string", description: "Path to the audio file to continue from" },
        prompt: {
          type: "string",
          description: "Optional text description to guide the continuation",
        },
        chorus_mode: { type: "string", enum: ["intro", "verse", "chorus", "outro"] },
        fast: { type: "boolean" },
        output_format: { type: "string", enum: ["wav", "mp3", "flac"] },
      },
      required: ["audio_path"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "FunMusic not available" };
      }
      const job = submitGeneration({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        task: "continuation",
        prompt: (args.prompt as string) ?? "",
        audioPromptPath: args.audio_path as string,
        chorusMode: args.chorus_mode as ChorusMode | undefined,
        fast: args.fast as boolean | undefined,
        outputFormat: args.output_format as OutputFormat | undefined,
      });
      return job ? { jobId: job.id, status: job.status } : { error: "Failed to submit job" };
    },
  );

  registerTool(
    "funmusic_job_status",
    "Check the status of a FunMusic generation job.",
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
        task: job.task,
        outputPath: job.status === "completed" ? job.outputPath : undefined,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      };
    },
  );

  registerTool(
    "funmusic_cancel_job",
    "Cancel a queued or running FunMusic generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "funmusic_queue_status",
    "View the FunMusic generation queue status.",
    { type: "object", properties: {} },
    () => getQueueStatusInfo(),
  );

  // ─── Gateway RPCs ───────────────────────────────────────────

  registerGateway("funmusic.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return submitGeneration({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      task: (p.task as MusicTask) ?? "text-to-music",
      prompt: (p.prompt as string) ?? "",
      audioPromptPath: p.audioPromptPath as string | undefined,
      chorusMode: p.chorusMode as ChorusMode | undefined,
      startTime: p.startTime as number | undefined,
      endTime: p.endTime as number | undefined,
      fast: p.fast as boolean | undefined,
      outputFormat: p.outputFormat as OutputFormat | undefined,
    });
  });

  registerGateway("funmusic.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });

  registerGateway("funmusic.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return { cancelled: cancelJob(p.jobId as string) };
  });

  registerGateway("funmusic.queue-status", () => getQueueStatusInfo());

  registerGateway("funmusic.prompt-injection", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return { prompt: getFunMusicPromptInjection(p.specialization as string | undefined) };
  });

  log.info("[FunMusic] Plugin registered: 5 tools, 5 gateway RPCs");
}
