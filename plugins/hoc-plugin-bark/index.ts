/**
 * Bark Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for text-to-audio generation
 * including speech, music, sound effects, and nonverbal audio.
 */

import {
  initBridge,
  generate,
  getJobStatus,
  cancelJob,
  getQueueStatus,
  isReady,
} from "./adapter/hoc-bridge.ts";

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  registerTool: (
    name: string,
    description: string,
    schema: unknown,
    handler: (args: Record<string, unknown>) => unknown,
  ) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;
  const status = initBridge(dataDir, log);
  log.info(`[Bark] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "bark_generate",
    "Generate audio from text — speech, music (♪), sound effects, nonverbal [laughs]. Supports 100+ voice presets and 13 languages.",
    {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text prompt with optional markup ([laughs], ♪, etc.)",
        },
        voice_preset: { type: "string", description: "Voice preset ID (e.g., 'v2/en_speaker_1')" },
        mode: {
          type: "string",
          enum: ["speech", "music", "sound-effect", "mixed"],
          description: "Audio mode",
        },
        text_temp: { type: "number", description: "Text generation temperature (default: 0.7)" },
        waveform_temp: {
          type: "number",
          description: "Waveform generation temperature (default: 0.7)",
        },
        seed: { type: "number", description: "Random seed (-1 for random)" },
      },
      required: ["text"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "Bark not available" };
      }
      return generate({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        text: args.text as string,
        voicePreset: args.voice_preset as string | undefined,
        mode: args.mode as string | undefined,
        textTemp: args.text_temp as number | undefined,
        waveformTemp: args.waveform_temp as number | undefined,
        seed: args.seed as number | undefined,
      });
    },
  );

  registerTool(
    "bark_job_status",
    "Check audio generation job progress.",
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
        progress: job.progress,
        outputPath: job.outputPath,
        error: job.error,
      };
    },
  );

  registerTool(
    "bark_cancel",
    "Cancel a queued audio generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "bark_queue_status",
    "View audio generation queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("bark.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return generate({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      text: (p.text as string) ?? "",
      voicePreset: p.voicePreset as string | undefined,
    });
  });
  registerGateway("bark.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("bark.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("bark.queue-status", () => getQueueStatus());

  log.info("[Bark] Plugin registered: 4 tools, 4 gateway RPCs");
}
