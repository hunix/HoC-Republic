/**
 * OpenClaw — Concrete Media Provider Adapters
 *
 * Wraps the existing HoC video/image generation backends (Wan2GP, ComfyUI)
 * as standardized MediaProvider instances and registers them with the
 * media-provider-registry.
 *
 * Flow:
 *   video_generate tool → mediaProviderRegistry.findBestVideoProvider()
 *     → Wan2GP adapter → wan2gp-client.ts → actual Wan2GP server
 *     → ComfyUI adapter → comfyui-workflows.ts → actual ComfyUI server
 *
 * These adapters wrap the existing proven pipeline. The registry provides:
 *  - Health-aware provider selection
 *  - Capability negotiation (resolution, modes, duration)
 *  - Centralized diagnostics
 *  - Hot-swappable providers (register/unregister at runtime)
 */

import type {
  VideoProvider,
  VideoCapabilities,
  VideoGenerationRequest,
  VideoGenerationResult,
  ImageProvider,
  ImageCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  ProviderHealth,
} from "./media-provider-registry.js";
import { uid, ts } from "../utils.js";
import { mediaProviderRegistry } from "./media-provider-registry.js";

// ─── Lazy Imports (avoid circular deps / boot overhead) ──────────

let _wan2gp: typeof import("../wan2gp-client.js") | null = null;
async function getWan2gp() {
  return (_wan2gp ??= await import("../wan2gp-client.js"));
}

let _comfyManager: typeof import("../comfyui-manager.js") | null = null;
async function getComfyManager() {
  return (_comfyManager ??= await import("../comfyui-manager.js"));
}

let _comfyWorkflows: typeof import("../comfyui-workflows.js") | null = null;
async function getComfyWorkflows() {
  return (_comfyWorkflows ??= await import("../comfyui-workflows.js"));
}

// ═══════════════════════════════════════════════════════════════════
// WAN2GP VIDEO PROVIDER
// ═══════════════════════════════════════════════════════════════════

const wan2gpCapabilities: VideoCapabilities = {
  supportedModes: ["text2video", "image2video"],
  maxResolution: { width: 1280, height: 720 },
  maxDurationSeconds: 10,
  supportedFormats: ["mp4"],
  supportsAudio: false,
  estimatedTimeMs: 120_000,
  maxFps: 24,
};

export const wan2gpVideoProvider: VideoProvider = {
  id: "wan2gp",
  name: "WanGP (Wan 2.2)",
  type: "video",
  capabilities: wan2gpCapabilities,

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const wan2gp = await getWan2gp();
    const t0 = Date.now();

    // Discover the running instance
    const status = await wan2gp.discoverWan2GP();
    if (!status.running) {
      throw new Error("WanGP is not running");
    }

    const result = await wan2gp.generateVideo(
      {
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        width: request.width ?? 832,
        height: request.height ?? 480,
        durationSec: request.durationSeconds ?? 5,
        fps: request.fps ?? 24,
        seed: request.seed ?? -1,
        sourceImage: request.sourceMedia,
      },
      status.url,
    );

    if (!result.ok || !result.videoUrl) {
      throw new Error(result.error ?? "WanGP generation failed");
    }

    return {
      id: uid(),
      providerId: "wan2gp",
      videoUrl: result.videoUrl,
      width: request.width ?? 832,
      height: request.height ?? 480,
      durationSeconds: request.durationSeconds ?? 5,
      fps: request.fps ?? 24,
      format: "mp4",
      durationMs: Date.now() - t0,
      metadata: {
        backend: "wan2gp",
        url: status.url,
        videoPath: result.videoPath,
        generationDuration: result.duration,
      },
    };
  },

  async checkHealth(): Promise<ProviderHealth> {
    const t0 = Date.now();
    try {
      const wan2gp = await getWan2gp();
      const status = await wan2gp.discoverWan2GP();
      return {
        status: status.running ? "available" : "unavailable",
        lastCheckedAt: ts(),
        latencyMs: Date.now() - t0,
        errorRate: status.running ? 0 : 1,
        uptime: status.running ? 1 : 0,
      };
    } catch {
      return {
        status: "unavailable",
        lastCheckedAt: ts(),
        latencyMs: Date.now() - t0,
        errorRate: 1,
        uptime: 0,
      };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// COMFYUI VIDEO PROVIDER (AnimateDiff fallback)
// ═══════════════════════════════════════════════════════════════════

const comfyuiVideoCapabilities: VideoCapabilities = {
  supportedModes: ["text2video"],
  maxResolution: { width: 512, height: 512 },
  maxDurationSeconds: 8,
  supportedFormats: ["mp4", "gif"],
  supportsAudio: false,
  estimatedTimeMs: 180_000,
  maxFps: 8,
};

export const comfyuiVideoProvider: VideoProvider = {
  id: "comfyui-animatediff",
  name: "ComfyUI AnimateDiff",
  type: "video",
  capabilities: comfyuiVideoCapabilities,

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const comfyManager = await getComfyManager();
    const comfyWorkflows = await getComfyWorkflows();
    const t0 = Date.now();

    const status = await comfyManager.getComfyUIStatus();
    if (!status.running) {
      throw new Error("ComfyUI is not running");
    }

    const comfyUrl = status.url;
    const width = Math.min(request.width ?? 512, 512);
    const height = Math.min(request.height ?? 512, 512);
    const fps = Math.min(request.fps ?? 8, 8);
    const durationSec = request.durationSeconds ?? 5;
    const frames = Math.max(8, Math.min(durationSec * fps, 128));

    // Discover installed models
    const [installedCheckpoints, installedMotionModels] = await Promise.all([
      comfyWorkflows.discoverCheckpoints(comfyUrl),
      comfyWorkflows.discoverMotionModels(comfyUrl),
    ]);

    const checkpoint =
      comfyWorkflows.findSD15Checkpoint(installedCheckpoints) ?? installedCheckpoints[0];
    if (!checkpoint) {
      throw new Error("No checkpoints installed in ComfyUI");
    }

    const motionModel = comfyWorkflows.findBestMotionModel(installedMotionModels);
    if (!motionModel) {
      throw new Error("No AnimateDiff motion model installed in ComfyUI");
    }

    const { workflow } = comfyWorkflows.buildAnimateDiffWorkflow({
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      width,
      height,
      fps,
      frames,
      checkpoint,
      motionModel,
    });

    const submitResult = await comfyWorkflows.submitWorkflow(comfyUrl, workflow);
    if (!submitResult.ok || !submitResult.promptId) {
      throw new Error(submitResult.error ?? "ComfyUI workflow submission failed");
    }

    const maxWaitMs = Math.max(60_000, durationSec * 30_000);
    const pollResult = await comfyWorkflows.pollForCompletion(
      comfyUrl,
      submitResult.promptId,
      maxWaitMs,
      5000,
    );

    if (!pollResult.completed || !pollResult.outputs) {
      throw new Error(pollResult.error ?? "ComfyUI video generation timed out");
    }

    const videoOut = comfyWorkflows.extractVideoOutput(pollResult.outputs);
    if (!videoOut) {
      throw new Error("ComfyUI generated video but output extraction failed");
    }

    const videoUrl = comfyWorkflows.buildViewUrl(comfyUrl, videoOut);

    return {
      id: uid(),
      providerId: "comfyui-animatediff",
      videoUrl,
      width,
      height,
      durationSeconds: durationSec,
      fps,
      format: "mp4",
      durationMs: Date.now() - t0,
      metadata: {
        backend: "comfyui-animatediff",
        url: comfyUrl,
        checkpoint,
        motionModel,
        frames,
        filename: videoOut.filename,
      },
    };
  },

  async checkHealth(): Promise<ProviderHealth> {
    const t0 = Date.now();
    try {
      const comfyManager = await getComfyManager();
      const status = await comfyManager.getComfyUIStatus();
      return {
        status: status.running ? "available" : "unavailable",
        lastCheckedAt: ts(),
        latencyMs: Date.now() - t0,
        errorRate: status.running ? 0 : 1,
        uptime: status.running ? 1 : 0,
      };
    } catch {
      return {
        status: "unavailable",
        lastCheckedAt: ts(),
        latencyMs: Date.now() - t0,
        errorRate: 1,
        uptime: 0,
      };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// COMFYUI IMAGE PROVIDER
// ═══════════════════════════════════════════════════════════════════

const comfyuiImageCapabilities: ImageCapabilities = {
  maxResolution: { width: 2048, height: 2048 },
  supportedFormats: ["png", "jpg", "webp"],
  supportsInpainting: true,
  supportsOutpainting: false,
  supportsImg2Img: true,
  supportsControlNet: true,
  maxBatchSize: 4,
  estimatedTimeMs: 30_000,
};

export const comfyuiImageProvider: ImageProvider = {
  id: "comfyui",
  name: "ComfyUI (FLUX/SDXL)",
  type: "image",
  capabilities: comfyuiImageCapabilities,

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const comfyManager = await getComfyManager();
    const comfyWorkflows = await getComfyWorkflows();
    const t0 = Date.now();

    const status = await comfyManager.getComfyUIStatus();
    if (!status.running) {
      throw new Error("ComfyUI is not running");
    }

    const comfyUrl = status.url;
    const width = request.width ?? 1024;
    const height = request.height ?? 1024;

    // Discover checkpoints
    const installed = await comfyWorkflows.discoverCheckpoints(comfyUrl);
    const checkpoint = installed[0]; // Use best available

    const { workflow } = comfyWorkflows.buildImageWorkflow({
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      width,
      height,
      seed: request.seed === -1 ? undefined : request.seed,
      model: "flux-schnell",
      checkpoint,
    });

    const submitResult = await comfyWorkflows.submitWorkflow(comfyUrl, workflow);
    if (!submitResult.ok || !submitResult.promptId) {
      throw new Error(submitResult.error ?? "ComfyUI workflow submission failed");
    }

    const pollResult = await comfyWorkflows.pollForCompletion(
      comfyUrl,
      submitResult.promptId,
      120_000,
      3000,
    );

    if (!pollResult.completed || !pollResult.outputs) {
      throw new Error(pollResult.error ?? "ComfyUI image generation timed out");
    }

    const imageOut = comfyWorkflows.extractImageOutput(pollResult.outputs);
    if (!imageOut) {
      throw new Error("ComfyUI generated image but output extraction failed");
    }

    const imageUrl = comfyWorkflows.buildViewUrl(comfyUrl, imageOut);

    return {
      id: uid(),
      providerId: "comfyui",
      images: [
        {
          url: imageUrl,
          width,
          height,
          format: request.format ?? "png",
        },
      ],
      durationMs: Date.now() - t0,
      seed: request.seed ?? -1,
      metadata: {
        backend: "comfyui",
        url: comfyUrl,
        checkpoint,
        filename: imageOut.filename,
      },
    };
  },

  async checkHealth(): Promise<ProviderHealth> {
    const t0 = Date.now();
    try {
      const comfyManager = await getComfyManager();
      const status = await comfyManager.getComfyUIStatus();
      return {
        status: status.running ? "available" : "unavailable",
        lastCheckedAt: ts(),
        latencyMs: Date.now() - t0,
        errorRate: status.running ? 0 : 1,
        uptime: status.running ? 1 : 0,
      };
    } catch {
      return {
        status: "unavailable",
        lastCheckedAt: ts(),
        latencyMs: Date.now() - t0,
        errorRate: 1,
        uptime: 0,
      };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// REGISTRATION — Call at module load to seed the registry
// ═══════════════════════════════════════════════════════════════════

/**
 * Register all built-in media providers.
 * Idempotent — safe to call multiple times.
 */
export function registerBuiltinMediaProviders(): void {
  mediaProviderRegistry.register(wan2gpVideoProvider);
  mediaProviderRegistry.register(comfyuiVideoProvider);
  mediaProviderRegistry.register(comfyuiImageProvider);
}

// Auto-register on module load
registerBuiltinMediaProviders();
