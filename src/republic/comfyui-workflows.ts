/**
 * ComfyUI Workflow Builders — Correct API-format workflows for image & video
 *
 * Builds well-formed ComfyUI /prompt payloads for:
 *   - AnimateDiff video generation (SD 1.5 + motion model)
 *   - Standard image generation (Flux / SDXL / SD 1.5)
 *
 * Key design decisions:
 *   - Workflows use `ADE_AnimateDiffLoaderWithContext` + `ADE_AnimateDiffUniformContextOptions`
 *     for proper temporal coherence (sliding window approach)
 *   - `VHS_VideoCombine` outputs MP4 directly inside ComfyUI
 *   - Auto-discovery queries `/object_info` to find installed checkpoints & motion models
 *   - Prompt IDs are tracked for accurate history polling
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("comfyui-workflows");

// ─── Types ──────────────────────────────────────────────────────

export interface VideoWorkflowOpts {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  fps?: number;
  frames?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  checkpoint?: string;       // Override checkpoint name
  motionModel?: string;      // Override motion model name
}

export interface ImageWorkflowOpts {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  model?: string;            // flux-schnell, flux-dev, sdxl, sd15
  checkpoint?: string;       // Override checkpoint name
}

export interface WorkflowResult {
  workflow: Record<string, unknown>;
  nodeCount: number;
}

export interface PromptSubmitResult {
  ok: boolean;
  promptId?: string;
  error?: string;
}

export interface VideoOutputInfo {
  filename: string;
  subfolder: string;
  type: string;
}

// ─── Known Motion Models ────────────────────────────────────────

/** AnimateDiff motion models in order of preference */
const KNOWN_MOTION_MODELS = [
  "mm_sd_v15_v3.ckpt",
  "mm_sd_v15_v2.ckpt",
  "mm_sd_v15.ckpt",
  "v3_sd15_mm.ckpt",
  "v2_lora_AnimateDiff.ckpt",
  "animatediffMotion_v15V2.ckpt",
  "mm-Stabilized_high.pth",
  "mm-Stabilized_mid.pth",
];

/** SD 1.5 checkpoints commonly used with AnimateDiff (preference order) */
const PREFERRED_SD15_CHECKPOINTS = [
  "dreamshaper_8.safetensors",
  "Realistic_Vision_V5.1.safetensors",
  "deliberate_v3.safetensors",
  "epicrealism_naturalSin.safetensors",
  "toonyou_beta6.safetensors",
  "revAnimated_v122.safetensors",
  "absolutereality_v181.safetensors",
  "majicmixRealistic_v7.safetensors",
];

// ─── Checkpoint & Model Discovery ───────────────────────────────

/**
 * Query ComfyUI's /object_info to discover installed checkpoints.
 * Falls back to a sensible default if the endpoint is unavailable.
 */
export async function discoverCheckpoints(
  comfyHostUrl: string,
): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${comfyHostUrl}/object_info/CheckpointLoaderSimple`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) { return []; }
    const data = await resp.json() as Record<string, unknown>;
    const nodeInfo = data["CheckpointLoaderSimple"] as Record<string, unknown> | undefined;
    const inputReq = nodeInfo?.["input"] as Record<string, unknown> | undefined;
    const required = inputReq?.["required"] as Record<string, unknown> | undefined;
    const ckptInput = required?.["ckpt_name"] as unknown[] | undefined;
    // ckptInput is [ [list_of_names], {} ]
    if (Array.isArray(ckptInput) && Array.isArray(ckptInput[0])) {
      return ckptInput[0] as string[];
    }
    return [];
  } catch (err) {
    logger.warn(`Failed to discover checkpoints: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Find an SD 1.5 checkpoint from the installed list.
 * SD 1.5 checkpoints are generally < 5GB and don't have "xl", "sdxl", or "flux" in the name.
 */
export function findSD15Checkpoint(installed: string[]): string | null {
  const lower = installed.map(name => ({ name, lower: name.toLowerCase() }));

  // First pass: exact match against preferred list
  for (const preferred of PREFERRED_SD15_CHECKPOINTS) {
    const found = lower.find(c => c.lower === preferred.toLowerCase());
    if (found) { return found.name; }
  }

  // Second pass: partial match against preferred list
  for (const preferred of PREFERRED_SD15_CHECKPOINTS) {
    const stem = preferred.replace(/\.(safetensors|ckpt|pth)$/i, "").toLowerCase();
    const found = lower.find(c => c.lower.includes(stem));
    if (found) { return found.name; }
  }

  // Third pass: any checkpoint that doesn't look like SDXL/Flux
  const sd15Candidates = lower.filter(c =>
    !c.lower.includes("xl") &&
    !c.lower.includes("flux") &&
    !c.lower.includes("sdxl") &&
    !c.lower.includes("pony") &&
    !c.lower.includes("cascade") &&
    !c.lower.includes("playground") &&
    !c.lower.includes("turbo") &&
    (c.lower.endsWith(".safetensors") || c.lower.endsWith(".ckpt"))
  );
  return sd15Candidates[0]?.name ?? null;
}

/**
 * Query ComfyUI for installed AnimateDiff motion models.
 */
export async function discoverMotionModels(
  comfyHostUrl: string,
): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${comfyHostUrl}/object_info/ADE_AnimateDiffLoaderWithContext`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) { return []; }
    const data = await resp.json() as Record<string, unknown>;
    const nodeInfo = data["ADE_AnimateDiffLoaderWithContext"] as Record<string, unknown> | undefined;
    const inputReq = nodeInfo?.["input"] as Record<string, unknown> | undefined;
    const required = inputReq?.["required"] as Record<string, unknown> | undefined;
    const modelInput = required?.["model_name"] as unknown[] | undefined;
    if (Array.isArray(modelInput) && Array.isArray(modelInput[0])) {
      return modelInput[0] as string[];
    }
    return [];
  } catch (err) {
    logger.warn(`Failed to discover motion models: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Find the best AnimateDiff motion model from installed list.
 */
export function findBestMotionModel(installed: string[]): string | null {
  const lower = installed.map(name => ({ name, lower: name.toLowerCase() }));

  for (const preferred of KNOWN_MOTION_MODELS) {
    const found = lower.find(c => c.lower === preferred.toLowerCase());
    if (found) { return found.name; }
  }

  // Any model with "mm_sd" or "animatediff" in the name
  const candidate = lower.find(c =>
    c.lower.includes("mm_sd") ||
    c.lower.includes("animatediff") ||
    c.lower.includes("mm-stabilized")
  );
  return candidate?.name ?? installed[0] ?? null;
}

// ─── Workflow Builders ──────────────────────────────────────────

/**
 * Build a proper AnimateDiff video generation workflow.
 *
 * Uses the AnimateDiff-Evolved node pack:
 *   1. Load SD 1.5 checkpoint
 *   2. Load AnimateDiff motion model with context options
 *   3. Apply to model via ADE_AnimateDiffLoaderWithContext
 *   4. Encode prompts with CLIP
 *   5. Create empty latent batch (frame count)
 *   6. Sample with KSampler
 *   7. Decode with VAE
 *   8. Combine into MP4 with VHS_VideoCombine
 */
export function buildAnimateDiffWorkflow(opts: VideoWorkflowOpts): WorkflowResult {
  const {
    prompt,
    negativePrompt = "ugly, blurry, low quality, distorted, deformed, watermark, text",
    width = 512,
    height = 512,
    fps = 8,
    frames = 16,
    seed = Math.floor(Math.random() * 2147483647),
    steps = 20,
    cfg = 7.5,
    checkpoint = "dreamshaper_8.safetensors",
    motionModel = "mm_sd_v15_v2.ckpt",
  } = opts;

  // Context window: 16 frames is the standard AnimateDiff context length
  const contextLength = Math.min(frames, 16);

  const workflow: Record<string, unknown> = {
    // Node 1: Load SD 1.5 checkpoint
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: checkpoint,
      },
    },

    // Node 2: Uniform context options for AnimateDiff (sliding window)
    "2": {
      class_type: "ADE_AnimateDiffUniformContextOptions",
      inputs: {
        context_length: contextLength,
        context_stride: 1,
        context_overlap: 4,
        context_schedule: "uniform",
        closed_loop: false,
        fuse_method: "flat",
      },
    },

    // Node 3: Load AnimateDiff motion model with context
    "3": {
      class_type: "ADE_AnimateDiffLoaderWithContext",
      inputs: {
        model_name: motionModel,
        beta_schedule: "sqrt_linear (AnimateDiff)",
        motion_scale: 1.0,
        apply_v2_models_properly: true,
        model: ["1", 0],                  // model from checkpoint
        context_options: ["2", 0],         // context from node 2
      },
    },

    // Node 4: Positive prompt
    "4": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: prompt,
        clip: ["1", 1],  // CLIP from checkpoint
      },
    },

    // Node 5: Negative prompt
    "5": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: negativePrompt,
        clip: ["1", 1],
      },
    },

    // Node 6: Empty latent image (batch_size = total frames)
    "6": {
      class_type: "EmptyLatentImage",
      inputs: {
        width,
        height,
        batch_size: frames,
      },
    },

    // Node 7: KSampler (uses AnimateDiff-patched model)
    "7": {
      class_type: "KSampler",
      inputs: {
        model: ["3", 0],           // AnimateDiff-patched model
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
        seed,
        steps,
        cfg,
        sampler_name: "euler_ancestral",
        scheduler: "normal",
        denoise: 1.0,
      },
    },

    // Node 8: VAE Decode
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["7", 0],
        vae: ["1", 2],  // VAE from checkpoint
      },
    },

    // Node 9: VHS Video Combine — creates MP4
    "9": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["8", 0],
        frame_rate: fps,
        loop_count: 0,
        filename_prefix: "hoc_video",
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
      },
    },
  };

  return { workflow, nodeCount: 9 };
}

/**
 * Build a standard image generation workflow.
 *
 * Supports Flux, SDXL, and SD 1.5 models.
 */
export function buildImageWorkflow(opts: ImageWorkflowOpts): WorkflowResult {
  const {
    prompt,
    negativePrompt = "ugly, blurry, low quality",
    width = 1024,
    height = 1024,
    seed = Math.floor(Math.random() * 2147483647),
    steps = 20,
    cfg = 7,
    model = "flux-schnell",
  } = opts;

  // Select checkpoint based on model param
  let checkpointName: string;
  if (opts.checkpoint) {
    checkpointName = opts.checkpoint;
  } else if (model.includes("flux") && model.includes("dev")) {
    checkpointName = "flux1-dev-fp8.safetensors";
  } else if (model.includes("flux")) {
    checkpointName = "flux1-schnell-fp8.safetensors";
  } else if (model.includes("sdxl") || model.includes("xl")) {
    checkpointName = "sd_xl_base_1.0.safetensors";
  } else {
    checkpointName = "dreamshaper_8.safetensors";
  }

  const workflow: Record<string, unknown> = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpointName },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativePrompt, clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed,
        steps,
        cfg,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "hoc_gen" },
    },
  };

  return { workflow, nodeCount: 7 };
}

// ─── Prompt Submission & Polling Helpers ─────────────────────────

/**
 * Submit a workflow to ComfyUI and return the prompt_id.
 */
export async function submitWorkflow(
  comfyHostUrl: string,
  workflow: Record<string, unknown>,
): Promise<PromptSubmitResult> {
  try {
    const body = JSON.stringify({ prompt: workflow });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${comfyHostUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await resp.json() as Record<string, unknown>;

    if (data.error) {
      const errMsg = typeof data.error === "string"
        ? data.error
        : JSON.stringify(data.error);
      return { ok: false, error: errMsg };
    }

    const promptId = data.prompt_id as string | undefined;
    if (!promptId) {
      return { ok: false, error: `No prompt_id in response: ${JSON.stringify(data).slice(0, 300)}` };
    }

    return { ok: true, promptId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Poll ComfyUI /history/{prompt_id} until the job completes.
 * Returns output info or null on timeout.
 */
export async function pollForCompletion(
  comfyHostUrl: string,
  promptId: string,
  maxWaitMs: number = 180_000,
  pollIntervalMs: number = 3000,
): Promise<{
  completed: boolean;
  outputs: Record<string, unknown> | null;
  error?: string;
}> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${comfyHostUrl}/history/${promptId}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const data = await resp.json() as Record<string, unknown>;
        const entry = data[promptId] as Record<string, unknown> | undefined;

        if (entry) {
          const status = entry.status as Record<string, unknown> | undefined;
          const statusStr = status?.status_str as string | undefined;

          if (statusStr === "error") {
            const messages = status?.messages as unknown[][] | undefined;
            const errMsg = messages?.[0]?.[1] as string ?? "Unknown ComfyUI error";
            return { completed: false, outputs: null, error: String(errMsg) };
          }

          const outputs = entry.outputs as Record<string, unknown> | undefined;
          if (outputs && Object.keys(outputs).length > 0) {
            return { completed: true, outputs };
          }
        }
      }
    } catch {
      // Network error during poll — retry
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return { completed: false, outputs: null, error: "Timeout waiting for ComfyUI completion" };
}

/**
 * Extract video file info from ComfyUI history outputs.
 *
 * VHS_VideoCombine stores output in the "gifs" array (despite the name),
 * with fields: filename, subfolder, type.
 */
export function extractVideoOutput(
  outputs: Record<string, unknown>,
): VideoOutputInfo | null {
  for (const nodeOutputs of Object.values(outputs)) {
    const nodeOut = nodeOutputs as Record<string, unknown>;

    // VHS stores video in "gifs" array
    const gifs = nodeOut.gifs as VideoOutputInfo[] | undefined;
    if (gifs && gifs.length > 0) {
      return gifs[0];
    }

    // Fallback: some versions use "videos"
    const videos = nodeOut.videos as VideoOutputInfo[] | undefined;
    if (videos && videos.length > 0) {
      return videos[0];
    }
  }
  return null;
}

/**
 * Extract image file info from ComfyUI history outputs.
 */
export function extractImageOutput(
  outputs: Record<string, unknown>,
): VideoOutputInfo | null {
  for (const nodeOutputs of Object.values(outputs)) {
    const nodeOut = nodeOutputs as Record<string, unknown>;
    const images = nodeOut.images as VideoOutputInfo[] | undefined;
    if (images && images.length > 0) {
      return images[0];
    }
  }
  return null;
}

/**
 * Build the /view URL for downloading a ComfyUI output file.
 */
export function buildViewUrl(
  comfyHostUrl: string,
  output: VideoOutputInfo,
): string {
  const params = new URLSearchParams();
  params.set("filename", output.filename);
  if (output.subfolder) { params.set("subfolder", output.subfolder); }
  if (output.type) { params.set("type", output.type); }
  return `${comfyHostUrl}/view?${params.toString()}`;
}

// ─── Motion Model Download Helper ────────────────────────────────

/**
 * Download an AnimateDiff motion model into the ComfyUI container.
 * Uses huggingface_hub or wget inside the container.
 */
export function getMotionModelDownloadCommand(modelName: string): string {
  const modelUrls: Record<string, string> = {
    "mm_sd_v15_v2.ckpt": "https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v2.ckpt",
    "mm_sd_v15_v3.ckpt": "https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v3.ckpt",
    "mm_sd_v15.ckpt": "https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15.ckpt",
    "v3_sd15_mm.ckpt": "https://huggingface.co/guoyww/animatediff/resolve/main/v3_sd15_mm.ckpt",
  };

  const url = modelUrls[modelName];
  if (!url) {
    return `echo "Unknown motion model: ${modelName}"`;
  }

  // Download to ComfyUI's custom_nodes/ComfyUI-AnimateDiff-Evolved/models/ directory
  // The megapak image stores AnimateDiff models here
  const destDir = "/root/ComfyUI/custom_nodes/ComfyUI-AnimateDiff-Evolved/models";
  return `mkdir -p "${destDir}" && wget -q --show-progress -O "${destDir}/${modelName}" "${url}"`;
}

/**
 * Download an SD 1.5 checkpoint into the ComfyUI container.
 */
export function getSD15DownloadCommand(checkpointName: string): string {
  const urls: Record<string, string> = {
    "dreamshaper_8.safetensors": "https://civitai.com/api/download/models/128713",
    "Realistic_Vision_V5.1.safetensors": "https://civitai.com/api/download/models/130072",
  };

  const url = urls[checkpointName];
  if (!url) {
    return `echo "Unknown checkpoint: ${checkpointName}"`;
  }

  const destDir = "/root/ComfyUI/models/checkpoints";
  return `mkdir -p "${destDir}" && wget -q --show-progress -O "${destDir}/${checkpointName}" "${url}"`;
}
