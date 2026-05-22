/**
 * Production Dispatcher — Routes citizen creative tasks to real plugin backends
 *
 * Maps content types to available plugin gateway methods and manages
 * the generation pipeline from request → plugin → output → republic-output/
 *
 * Architecture:
 *   Citizen aspiration → dispatch(type, prompt)
 *     → resolves plugin (bark, deforum, etc.)
 *     → calls plugin gateway RPC
 *     → tracks job in pending map
 *     → on completion, output lands in republic-output/{category}/
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Pipeline Registry ──────────────────────────────────────────

export interface PipelineEntry {
  /** plugin id (matches hoc.plugin.json id) */
  pluginId: string;
  /** Human-readable name */
  displayName: string;
  /** Gateway RPC method to call for generation */
  generateMethod: string;
  /** Gateway RPC method for job status */
  statusMethod: string;
  /** Gateway RPC method to cancel */
  cancelMethod?: string;
  /** Output category in republic-output/ */
  outputCategory: string;
  /** File extension of output */
  outputExt: string;
  /** Default params to merge into every request */
  defaultParams?: Record<string, unknown>;
}

/**
 * Content type → ordered list of pipeline entries (first available wins)
 */
export const PIPELINE_REGISTRY: Record<string, PipelineEntry[]> = {
  audio: [
    {
      pluginId: "hoc-plugin-bark",
      displayName: "Bark (Suno AI)",
      generateMethod: "bark.generate",
      statusMethod: "bark.job-status",
      cancelMethod: "bark.cancel",
      outputCategory: "music",
      outputExt: "wav",
      defaultParams: { mode: "speech" },
    },
    {
      pluginId: "hoc-plugin-funmusic",
      displayName: "FunMusic",
      generateMethod: "funmusic.generate",
      statusMethod: "funmusic.job-status",
      cancelMethod: "funmusic.cancel",
      outputCategory: "music",
      outputExt: "wav",
      defaultParams: { duration: 30 },
    },
    {
      pluginId: "hoc-plugin-chatterbox",
      displayName: "Chatterbox TTS",
      generateMethod: "chatterbox.generate",
      statusMethod: "chatterbox.job-status",
      outputCategory: "music",
      outputExt: "wav",
    },
    {
      pluginId: "hoc-plugin-mmaudio",
      displayName: "MMAudio",
      generateMethod: "mmaudio.generate",
      statusMethod: "mmaudio.job-status",
      outputCategory: "music",
      outputExt: "wav",
    },
    {
      pluginId: "hoc-plugin-qwen3-tts",
      displayName: "Qwen3 TTS",
      generateMethod: "qwen3-tts.generate",
      statusMethod: "qwen3-tts.job-status",
      outputCategory: "music",
      outputExt: "wav",
    },
  ],

  video: [
    {
      pluginId: "hoc-plugin-deforum",
      displayName: "Deforum (Stable Diffusion)",
      generateMethod: "deforum.generate",
      statusMethod: "deforum.job-status",
      cancelMethod: "deforum.cancel",
      outputCategory: "video",
      outputExt: "mp4",
      defaultParams: { fps: 24, steps: 30 },
    },
    {
      pluginId: "hoc-plugin-storydiffusion",
      displayName: "StoryDiffusion",
      generateMethod: "storydiffusion.generate",
      statusMethod: "storydiffusion.job-status",
      outputCategory: "video",
      outputExt: "mp4",
    },
    {
      pluginId: "hoc-plugin-magicanimate",
      displayName: "MagicAnimate",
      generateMethod: "magicanimate.generate",
      statusMethod: "magicanimate.job-status",
      outputCategory: "video",
      outputExt: "mp4",
    },
    {
      pluginId: "hoc-plugin-lingbot-world",
      displayName: "LingBot World",
      generateMethod: "lingbot-world.generate",
      statusMethod: "lingbot-world.job-status",
      outputCategory: "video",
      outputExt: "mp4",
    },
  ],

  image: [
    {
      pluginId: "hoc-plugin-omnigen",
      displayName: "OmniGen",
      generateMethod: "omnigen.generate",
      statusMethod: "omnigen.job-status",
      outputCategory: "art",
      outputExt: "png",
    },
    {
      pluginId: "hoc-plugin-glm-image",
      displayName: "GLM Image",
      generateMethod: "glm-image.generate",
      statusMethod: "glm-image.job-status",
      outputCategory: "art",
      outputExt: "png",
    },
    {
      pluginId: "hoc-plugin-switti",
      displayName: "Switti",
      generateMethod: "switti.generate",
      statusMethod: "switti.job-status",
      outputCategory: "art",
      outputExt: "png",
    },
    // Cloud API fallbacks
    {
      pluginId: "builtin-hf-sd35",
      displayName: "Stable Diffusion 3.5 (HuggingFace)",
      generateMethod: "republic.image.cloud",
      statusMethod: "republic.image.cloud",
      outputCategory: "art",
      outputExt: "png",
      defaultParams: { model: "black-forest-labs/FLUX.1-dev" },
    },
    {
      pluginId: "builtin-nim-sd35",
      displayName: "SD 3.5 (NVIDIA NIM)",
      generateMethod: "republic.image.cloud",
      statusMethod: "republic.image.cloud",
      outputCategory: "art",
      outputExt: "png",
      defaultParams: { provider: "nvidia" },
    },
    {
      pluginId: "builtin-gemini-imagen",
      displayName: "Imagen 3 (Gemini)",
      generateMethod: "republic.image.cloud",
      statusMethod: "republic.image.cloud",
      outputCategory: "art",
      outputExt: "png",
      defaultParams: { provider: "gemini" },
    },
  ],

  "3d": [
    {
      pluginId: "hoc-plugin-sparc3d",
      displayName: "SPARC3D",
      generateMethod: "sparc3d.generate",
      statusMethod: "sparc3d.job-status",
      outputCategory: "3d-models",
      outputExt: "obj",
    },
    {
      pluginId: "builtin-nim-edify3d",
      displayName: "Edify-3D (NVIDIA NIM)",
      generateMethod: "republic.3d.cloud",
      statusMethod: "republic.3d.cloud",
      outputCategory: "3d-models",
      outputExt: "glb",
    },
  ],

  /**
   * Text-to-Speech pipeline — voice output for citizens and content.
   * Priority: ElevenLabs → plugins → HF SpeechT5 → NIM Parakeet → OpenAI TTS
   */
  tts: [
    {
      pluginId: "hoc-plugin-chatterbox",
      displayName: "Chatterbox TTS",
      generateMethod: "chatterbox.generate",
      statusMethod: "chatterbox.job-status",
      outputCategory: "audio",
      outputExt: "wav",
    },
    {
      pluginId: "hoc-plugin-qwen3-tts",
      displayName: "Qwen3 TTS",
      generateMethod: "qwen3-tts.generate",
      statusMethod: "qwen3-tts.job-status",
      outputCategory: "audio",
      outputExt: "wav",
    },
    {
      pluginId: "builtin-elevenlabs",
      displayName: "ElevenLabs TTS",
      generateMethod: "republic.tts.cloud",
      statusMethod: "republic.tts.cloud",
      outputCategory: "audio",
      outputExt: "mp3",
      defaultParams: { provider: "elevenlabs" },
    },
    {
      pluginId: "builtin-hf-speecht5",
      displayName: "SpeechT5 (HuggingFace)",
      generateMethod: "republic.tts.cloud",
      statusMethod: "republic.tts.cloud",
      outputCategory: "audio",
      outputExt: "wav",
      defaultParams: { model: "microsoft/speecht5_tts" },
    },
    {
      pluginId: "builtin-openai-tts",
      displayName: "TTS HD (OpenAI)",
      generateMethod: "republic.tts.cloud",
      statusMethod: "republic.tts.cloud",
      outputCategory: "audio",
      outputExt: "mp3",
      defaultParams: { provider: "openai" },
    },
  ],

  /**
   * Games pipeline — produces runnable React Three Fiber game projects.
   * Primary: plugin backends for AI-assisted game generation.
   * Fallback: deterministic scaffold generator (always works, no plugin needed).
   */
  games: [
    {
      pluginId: "hoc-plugin-open-lovable",
      displayName: "Open Lovable (React 3D Games)",
      generateMethod: "open-lovable.generate",
      statusMethod: "open-lovable.job-status",
      cancelMethod: "open-lovable.cancel",
      outputCategory: "games",
      outputExt: "zip",
      defaultParams: {
        framework: "react-three-fiber",
        target: "3d-game",
        libraries: ["@react-three/fiber", "@react-three/drei", "@react-three/rapier", "leva", "zustand"],
      },
    },
    {
      pluginId: "hoc-plugin-superpowers",
      displayName: "Superpowers (3D Game Engine)",
      generateMethod: "superpowers.generate",
      statusMethod: "superpowers.job-status",
      outputCategory: "games",
      outputExt: "zip",
      defaultParams: { engine: "three", target: "browser" },
    },
    {
      /** Built-in deterministic scaffold — works without any plugin loaded. */
      pluginId: "builtin-game-scaffold",
      displayName: "Built-in R3F Game Scaffold",
      generateMethod: "republic.game.scaffold",
      statusMethod: "republic.game.scaffold",
      outputCategory: "games",
      outputExt: "zip",
      defaultParams: { builtin: true },
    },
  ],

  /**
   * Music pipeline — real AI-generated music tracks.
   * Primary: FunMusic plugin for professional audio.
   * Fallback: HuggingFace MusicGen via built-in inference.
   */
  music: [
    {
      pluginId: "hoc-plugin-funmusic",
      displayName: "FunMusic",
      generateMethod: "funmusic.generate",
      statusMethod: "funmusic.job-status",
      cancelMethod: "funmusic.cancel",
      outputCategory: "music",
      outputExt: "wav",
      defaultParams: { duration: 30 },
    },
    {
      pluginId: "builtin-hf-musicgen",
      displayName: "MusicGen (HuggingFace)",
      generateMethod: "republic.music.generate",
      statusMethod: "republic.music.generate",
      outputCategory: "music",
      outputExt: "flac",
      defaultParams: { model: "facebook/musicgen-small" },
    },
  ],
};


// ─── Job Tracking ───────────────────────────────────────────────

export interface DispatchedJob {
  id: string;
  contentType: string;
  pipeline: PipelineEntry;
  prompt: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  outputPath?: string;
  error?: string;
}

const activeJobs = new Map<string, DispatchedJob>();
let jobCounter = 0;

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get pipeline availability summary — which content types have backends ready.
 */
export function getPipelineStatus(loadedPlugins: Set<string>): Record<string, {
  available: boolean;
  backends: { pluginId: string; displayName: string; ready: boolean }[];
}> {
  const result: Record<string, {
    available: boolean;
    backends: { pluginId: string; displayName: string; ready: boolean }[];
  }> = {};

  for (const [contentType, entries] of Object.entries(PIPELINE_REGISTRY)) {
    const backends = entries.map((e) => ({
      pluginId: e.pluginId,
      displayName: e.displayName,
      ready: loadedPlugins.has(e.pluginId),
    }));
    result[contentType] = {
      available: backends.some((b) => b.ready),
      backends,
    };
  }

  return result;
}

/**
 * Dispatch a content generation request to the first available plugin.
 *
 * @param contentType - "audio" | "video" | "image" | "3d"
 * @param prompt - The text prompt for generation
 * @param callGateway - Function to call a gateway RPC method
 * @param loadedPlugins - Set of currently loaded plugin IDs
 * @returns The dispatched job info
 */
export async function dispatch(
  contentType: string,
  prompt: string,
  callGateway: (method: string, params: Record<string, unknown>) => Promise<unknown>,
  loadedPlugins: Set<string>,
  extra?: Record<string, unknown>,
): Promise<DispatchedJob> {
  const entries = PIPELINE_REGISTRY[contentType];
  if (!entries?.length) {
    throw new Error(`No pipeline registered for content type: ${contentType}`);
  }

  // Find first available backend
  const pipeline = entries.find((e) => loadedPlugins.has(e.pluginId));
  if (!pipeline) {
    throw new Error(
      `No available backend for "${contentType}". Need one of: ${entries.map((e) => e.displayName).join(", ")}`,
    );
  }

  const jobId = `prod-${Date.now()}-${++jobCounter}`;
  const job: DispatchedJob = {
    id: jobId,
    contentType,
    pipeline,
    prompt,
    status: "queued",
    createdAt: Date.now(),
  };
  activeJobs.set(jobId, job);

  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), "republic-output", pipeline.outputCategory);
  fs.mkdirSync(outputDir, { recursive: true });

  // Build params
  const params: Record<string, unknown> = {
    ...pipeline.defaultParams,
    ...extra,
    text: prompt,
    prompt,
    citizenId: (extra?.citizenId as string) ?? "system",
    citizenName: (extra?.citizenName as string) ?? "Production Pipeline",
    outputDir,
    outputFilename: `${jobId}.${pipeline.outputExt}`,
  };

  try {
    job.status = "running";
    const result = await callGateway(pipeline.generateMethod, params);
    const r = result as { jobId?: string; outputPath?: string; error?: string } | undefined;

    if (r?.error) {
      job.status = "failed";
      job.error = r.error;
    } else {
      // Job may be async (returns jobId) or sync (returns outputPath)
      if (r?.jobId) {
        // Async — the plugin will process it in the background
        job.status = "running";
        job.outputPath = r.outputPath;
      } else if (r?.outputPath) {
        job.status = "completed";
        job.completedAt = Date.now();
        job.outputPath = r.outputPath;
      } else {
        // Best effort — mark as running, output should appear in dir
        job.status = "running";
        job.outputPath = path.join(outputDir, `${jobId}.${pipeline.outputExt}`);
      }
    }
  } catch (err) {
    job.status = "failed";
    job.error = String(err);
  }

  return job;
}

/**
 * Get status of a dispatched job.
 */
export function getJob(jobId: string): DispatchedJob | undefined {
  return activeJobs.get(jobId);
}

/**
 * List all active/recent jobs.
 */
export function listJobs(limit = 50): DispatchedJob[] {
  const jobs = [...activeJobs.values()];
  jobs.sort((a, b) => b.createdAt - a.createdAt);
  return jobs.slice(0, limit);
}

/**
 * Get supported content types.
 */
export function getSupportedTypes(): string[] {
  return Object.keys(PIPELINE_REGISTRY);
}
