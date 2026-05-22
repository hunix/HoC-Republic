/**
 * Qwen3-TTS Plugin — Entry Point
 *
 * Registers 8 tools, 7 gateway RPC methods, and event hooks
 * to expose Qwen3-TTS AI voice synthesis, voice design, and
 * voice cloning to HoC citizens.
 *
 * Modes:
 *   • custom_voice — Preset speakers with emotional instruct
 *   • voice_design — Describe a voice persona in natural language
 *   • voice_clone  — Clone any voice from reference audio
 */

import type { HocPlugin, PluginContext, PluginTool } from "../../src/types/hoc-plugin-types.ts";
import {
  initBridge,
  submitTtsJob,
  cancelTtsJob,
  getTtsJobStatus,
  listTtsJobs,
  tickProcessQueue,
  getTtsQueueStatus,
  getAvailableVoices,
  getAvailableLanguages,
  getConfig,
  getTtsPromptInjection,
} from "./adapter/hoc-bridge.ts";

// ─── Tools ──────────────────────────────────────────────────────

const tools: PluginTool[] = [
  {
    name: "tts_speak",
    description:
      "Synthesize speech using a preset Qwen3-TTS speaker. Optionally add an emotional/style instruct (e.g. 'angry', 'whispering', 'excited'). Returns a job ID — the WAV file is generated asynchronously.",
    parameters: {
      text: { type: "string", required: true, description: "Text to synthesize into speech" },
      language: {
        type: "string",
        required: false,
        description:
          "Language: Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian, Auto (default: Auto)",
      },
      speaker: {
        type: "string",
        required: false,
        description:
          "Speaker name: Vivian, Ryan, Claire, Ethan, Aria, Yuki, Luna, Leo (default: Ryan)",
      },
      instruct: {
        type: "string",
        required: false,
        description: "Emotional/style instruction, e.g. 'angry', 'whisper', 'excited and fast'",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitTtsJob(
        ctx.citizenId ?? "system",
        "custom_voice",
        args.text as string,
        (args.language as string | undefined as "Auto") ?? "Auto",
        {
          speaker: (args.speaker as string) ?? "Ryan",
          instruct: args.instruct as string | undefined,
        },
      );
      return { jobId: job.id, status: job.status, speaker: job.speaker, language: job.language };
    },
  },
  {
    name: "tts_design_voice",
    description:
      "Design a new voice persona using a natural language description and synthesize text with it. Describe the voice: age, gender, tone, accent, mood. Example: 'Female, 25, warm alto, slightly breathy, calm and reassuring'.",
    parameters: {
      text: { type: "string", required: true, description: "Text to synthesize" },
      instruct: {
        type: "string",
        required: true,
        description: "Natural language voice persona description",
      },
      language: { type: "string", required: false, description: "Language (default: Auto)" },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitTtsJob(
        ctx.citizenId ?? "system",
        "voice_design",
        args.text as string,
        (args.language as string | undefined as "Auto") ?? "Auto",
        { instruct: args.instruct as string },
      );
      return { jobId: job.id, status: job.status, mode: "voice_design" };
    },
  },
  {
    name: "tts_clone_voice",
    description:
      "Clone a voice from a reference audio clip and generate new speech with it. Provide the reference audio file path and its transcript.",
    parameters: {
      text: {
        type: "string",
        required: true,
        description: "New text to synthesize in the cloned voice",
      },
      refAudioPath: {
        type: "string",
        required: true,
        description: "Path to reference audio file (WAV) or URL",
      },
      refText: {
        type: "string",
        required: true,
        description: "Transcript of the reference audio",
      },
      language: { type: "string", required: false, description: "Language (default: Auto)" },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitTtsJob(
        ctx.citizenId ?? "system",
        "voice_clone",
        args.text as string,
        (args.language as string | undefined as "Auto") ?? "Auto",
        {
          refAudioPath: args.refAudioPath as string,
          refText: args.refText as string,
        },
      );
      return { jobId: job.id, status: job.status, mode: "voice_clone" };
    },
  },
  {
    name: "tts_list_voices",
    description:
      "List all available preset speakers with their gender, native language, and description.",
    parameters: {},
    handler: async () => {
      const voices = getAvailableVoices();
      return {
        count: voices.length,
        voices: voices.map((v) => ({
          name: v.name,
          gender: v.gender,
          nativeLanguage: v.nativeLanguage,
          description: v.description,
        })),
      };
    },
  },
  {
    name: "tts_list_languages",
    description: "List all supported TTS languages.",
    parameters: {},
    handler: async () => {
      const languages = getAvailableLanguages();
      return { languages, count: languages.length };
    },
  },
  {
    name: "tts_job_status",
    description:
      "Get the status of a TTS synthesis job by ID. Once completed, includes the output WAV file path.",
    parameters: {
      jobId: { type: "string", required: true, description: "TTS job ID" },
    },
    handler: async (args: Record<string, unknown>) => {
      const job = getTtsJobStatus(args.jobId as string);
      if (!job) {
        return { error: "Job not found" };
      }
      return {
        id: job.id,
        status: job.status,
        mode: job.mode,
        progress: job.progress,
        outputPath: job.outputPath,
        error: job.error,
      };
    },
  },
  {
    name: "tts_queue_status",
    description: "Get overall TTS queue health: running/completed/failed job counts.",
    parameters: {},
    handler: async () => {
      return getTtsQueueStatus();
    },
  },
  {
    name: "tts_cancel_job",
    description: "Cancel a queued or running TTS job.",
    parameters: {
      jobId: { type: "string", required: true, description: "TTS job ID to cancel" },
    },
    handler: async (args: Record<string, unknown>) => {
      const ok = cancelTtsJob(args.jobId as string);
      return { cancelled: ok };
    },
  },
];

// ─── Plugin Definition ──────────────────────────────────────────

const plugin: HocPlugin = {
  id: "hoc-plugin-qwen3-tts",
  name: "Qwen3-TTS — AI Voice Synthesis & Cloning",

  init: async (ctx: PluginContext) => {
    const status = initBridge(ctx.dataDir);
    if (status.installed) {
      const autoMsg = status.autoInstalled ? " (auto-installed via pip)" : "";
      ctx.log(
        `Qwen3-TTS ready${autoMsg} — Python: ${status.detectedPython}, CUDA: ${status.cudaAvailable ? "yes" : "no"}`,
      );
    } else {
      ctx.log(`Qwen3-TTS not available: ${status.errors.join("; ")}`);
    }
  },

  shutdown: async () => {
    const running = listTtsJobs("running");
    for (const j of running) {
      cancelTtsJob(j.id);
    }
  },

  healthCheck: async () => {
    const q = getTtsQueueStatus();
    return {
      healthy: q.installed,
      details: `${q.runningJobs} running, ${q.completedJobs} completed`,
    };
  },

  tools,

  gateway: {
    "qwen3tts.speak": async (params: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitTtsJob(
        ctx.citizenId ?? "system",
        "custom_voice",
        params.text as string,
        (params.language as string | undefined as "Auto") ?? "Auto",
        {
          speaker: (params.speaker as string) ?? "Ryan",
          instruct: params.instruct as string | undefined,
        },
      );
      return job;
    },

    "qwen3tts.design": async (params: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitTtsJob(
        ctx.citizenId ?? "system",
        "voice_design",
        params.text as string,
        (params.language as string | undefined as "Auto") ?? "Auto",
        { instruct: params.instruct as string },
      );
      return job;
    },

    "qwen3tts.clone": async (params: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitTtsJob(
        ctx.citizenId ?? "system",
        "voice_clone",
        params.text as string,
        (params.language as string | undefined as "Auto") ?? "Auto",
        {
          refAudioPath: params.refAudioPath as string,
          refText: params.refText as string,
        },
      );
      return job;
    },

    "qwen3tts.voices": async () => {
      return { voices: getAvailableVoices() };
    },

    "qwen3tts.languages": async () => {
      return { languages: getAvailableLanguages() };
    },

    "qwen3tts.status": async (params: Record<string, unknown>) => {
      return getTtsJobStatus(params.jobId as string) ?? { error: "not found" };
    },

    "qwen3tts.config": async () => {
      const c = getConfig();
      return {
        customVoiceModel: c.customVoiceModel,
        voiceDesignModel: c.voiceDesignModel,
        baseModel: c.baseModel,
        device: c.device,
        dtype: c.dtype,
        maxConcurrentJobs: c.maxConcurrentJobs,
      };
    },
  },

  events: {
    "tick:before": async () => {
      tickProcessQueue();
    },

    "citizen:task_assigned": async (_payload: unknown, ctx: PluginContext) => {
      const injection = getTtsPromptInjection(ctx.specialization);
      if (injection) {
        ctx.log(`[TTS] Injected voice synthesis tools for citizen ${ctx.citizenId}`);
      }
    },
  },
};

export default plugin;
