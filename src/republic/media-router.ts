/**
 * Republic Platform — Media Router
 *
 * Capability-aware dispatcher that routes media generation requests
 * (image, video, audio) through local GPU plugins FIRST, falling
 * back to SD WebUI / ComfyUI / DALL-E only if no plugin is available.
 *
 * Priority chain for image generation:
 *   Plugin (GLM-Image/OmniGen/Switti) → SD WebUI → ComfyUI → DALL-E (gated) → Placeholder
 *
 * This module exists to ensure the RTX 6000 Pro 96GB and RTX 3090 Ti
 * are utilized for all media generation before any cloud API is called.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  cloudImageGeneration,
  cloudVideoGeneration,
  cloudTTS,
} from "./cloud-media.js";
import { getPluginsByCapability, getPluginTool } from "./hoc-plugin-manager.js";

const logger = createSubsystemLogger("republic:media-router");

// ─── Types ──────────────────────────────────────────────────────

export type MediaCapability =
  | "text-to-image"
  | "image-to-image"
  | "image-editing"
  | "style-transfer"
  | "identity-preserving"
  | "text-to-video"
  | "image-to-video"
  | "animation-generation"
  | "avatar-video-generation"
  | "comic-generation"
  | "text-to-speech"
  | "voice-cloning"
  | "text-to-music"
  | "audio-generation"
  | "video-to-audio"
  | "text-to-3d"
  | "image-to-3d";

export interface MediaGenerationResult {
  /** Whether the generation succeeded */
  success: boolean;
  /** Plugin or provider that performed the generation */
  provider: string;
  /** Base64-encoded output (for images) */
  base64?: string;
  /** File path to the generated output */
  outputPath?: string;
  /** Job ID for async operations */
  jobId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Well-known tool names for each plugin, mapped by capability.
 * Each entry maps a capability to the list of tool names known
 * to handle that capability across all plugins.
 */
const CAPABILITY_TOOL_MAP: Record<string, string[]> = {
  "text-to-image": [
    "glm_generate_image",
    "omnigen_generate",
    "switti_generate",
    "kv_edit_generate",
  ],
  "image-to-image": [
    "glm_edit_image",
    "omnigen_generate", // OmniGen supports multi-modal conditioned generation
    "kv_edit_inpaint",
  ],
  "image-editing": ["glm_edit_image", "kv_edit_inpaint", "kv_edit_generate"],
  "style-transfer": ["glm_edit_image"],
  "text-to-video": ["deforum_generate", "storydiffusion_generate_video", "lingbot_generate"],
  "image-to-video": ["magicanimate_animate", "storydiffusion_generate_video", "lingbot_generate"],
  "animation-generation": ["deforum_generate", "magicanimate_animate"],
  "avatar-video-generation": ["stableavatar_generate"],
  "comic-generation": ["storydiffusion_generate_comic"],
  "text-to-speech": ["chatterbox_synthesize", "bark_generate"],
  "voice-cloning": ["chatterbox_clone_voice"],
  "text-to-music": ["funmusic_generate", "bark_generate"],
  "audio-generation": ["funmusic_generate", "mmaudio_generate", "bark_generate"],
  "video-to-audio": ["mmaudio_generate"],
  "text-to-3d": ["sparc3d_generate"],
  "image-to-3d": ["sparc3d_generate"],
};

// ─── Core Router ────────────────────────────────────────────────

/**
 * Find the first available (registered + callable) tool for a given capability.
 * Returns the tool name and handler, or undefined if none found.
 */
export function findMediaTool(
  capability: MediaCapability,
): { toolName: string; handler: (args: Record<string, unknown>) => unknown } | undefined {
  // 1. Check if any plugin with this capability is loaded and ready
  const plugins = getPluginsByCapability(capability);
  if (plugins.length === 0) {
    return undefined;
  }

  // 2. Find a callable tool from the capability tool map
  const toolNames = CAPABILITY_TOOL_MAP[capability] ?? [];
  for (const toolName of toolNames) {
    const handler = getPluginTool(toolName);
    if (handler) {
      return { toolName, handler };
    }
  }

  return undefined;
}

/**
 * Route an image generation request through local GPU plugins.
 * Returns a result if a plugin handled it, or undefined to let the caller
 * fall through to SD/ComfyUI/DALL-E.
 */
export async function routeImageGeneration(
  prompt: string,
  opts?: {
    width?: number;
    height?: number;
    citizenId?: string;
    citizenName?: string;
    seed?: number;
    steps?: number;
    guidanceScale?: number;
    allowCloud?: boolean;
  },
): Promise<MediaGenerationResult | undefined> {
  const match = findMediaTool("text-to-image");
  if (match) {
    logger.info(`Routing image generation to plugin tool: ${match.toolName}`);
    try {
      const result = await Promise.resolve(
        match.handler({
          prompt,
          width: opts?.width ?? 1024,
          height: opts?.height ?? 1024,
          citizen_id: opts?.citizenId ?? "system",
          citizen_name: opts?.citizenName ?? "System",
          seed: opts?.seed,
          steps: opts?.steps,
          guidance_scale: opts?.guidanceScale,
        }),
      );
      const res = result as Record<string, unknown>;
      if (!res.error) {
        return {
          success: true,
          provider: match.toolName,
          jobId: res.jobId as string | undefined,
          outputPath: res.outputPath as string | undefined,
          base64: res.base64 as string | undefined,
        };
      }
      logger.warn(`Plugin tool ${match.toolName} returned error: ${String(res.error)}`);
    } catch (err) {
      logger.warn(`Plugin tool ${match.toolName} threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Cloud API fallback: HF → NIM → Gemini → OpenAI
  logger.info("No plugin available for image — trying cloud APIs");
  const cloud = await cloudImageGeneration(prompt, {
    width: opts?.width,
    height: opts?.height,
    allowCloud: opts?.allowCloud,
  });
  if (cloud.success) {
    return {
      success: true,
      provider: cloud.provider,
      outputPath: cloud.outputPath,
    };
  }

  return undefined;
}

/**
 * Route an image edit/inpaint request through local GPU plugins.
 */
export async function routeImageEdit(
  prompt: string,
  inputImages: string[],
  opts?: {
    width?: number;
    height?: number;
    citizenId?: string;
    citizenName?: string;
  },
): Promise<MediaGenerationResult | undefined> {
  // Try image-editing first, then image-to-image
  for (const capability of ["image-editing", "image-to-image"] as MediaCapability[]) {
    const match = findMediaTool(capability);
    if (!match) {
      continue;
    }

    logger.info(`Routing image edit to plugin tool: ${match.toolName}`);

    try {
      const result = await Promise.resolve(
        match.handler({
          prompt,
          input_images: inputImages,
          width: opts?.width,
          height: opts?.height,
          citizen_id: opts?.citizenId ?? "system",
          citizen_name: opts?.citizenName ?? "System",
        }),
      );

      const res = result as Record<string, unknown>;
      if (res.error) {
        continue; // Try next capability
      }

      return {
        success: true,
        provider: match.toolName,
        jobId: res.jobId as string | undefined,
        outputPath: res.outputPath as string | undefined,
        base64: res.base64 as string | undefined,
      };
    } catch {
      continue; // Try next capability
    }
  }

  return undefined;
}

/**
 * Route a video generation request through local GPU plugins.
 */
export async function routeVideoGeneration(
  prompt: string,
  opts?: {
    inputImage?: string;
    citizenId?: string;
    citizenName?: string;
  },
): Promise<MediaGenerationResult | undefined> {
  const capability: MediaCapability = opts?.inputImage ? "image-to-video" : "text-to-video";
  const match = findMediaTool(capability);
  if (match) {
    logger.info(`Routing video generation to plugin tool: ${match.toolName}`);
    try {
      const result = await Promise.resolve(
        match.handler({
          prompt,
          input_image: opts?.inputImage,
          citizen_id: opts?.citizenId ?? "system",
          citizen_name: opts?.citizenName ?? "System",
        }),
      );
      const res = result as Record<string, unknown>;
      if (!res.error) {
        return {
          success: true,
          provider: match.toolName,
          jobId: res.jobId as string | undefined,
          outputPath: res.outputPath as string | undefined,
        };
      }
    } catch { /* fall through to cloud */ }
  }

  // Cloud API fallback: HF → NIM Cosmos
  logger.info("No plugin available for video — trying cloud APIs");
  const cloud = await cloudVideoGeneration(prompt);
  if (cloud.success) {
    return {
      success: true,
      provider: cloud.provider,
      outputPath: cloud.outputPath,
      jobId: cloud.jobId,
    };
  }

  return undefined;
}

/**
 * Route an audio generation request through local GPU plugins.
 */
export async function routeAudioGeneration(
  prompt: string,
  opts?: {
    type?: "speech" | "music" | "sound";
    referenceAudio?: string;
    citizenId?: string;
    citizenName?: string;
  },
): Promise<MediaGenerationResult | undefined> {
  let capability: MediaCapability;
  if (opts?.type === "music") {
    capability = "text-to-music";
  } else if (opts?.type === "speech") {
    capability = "text-to-speech";
  } else {
    capability = "audio-generation";
  }

  const match = findMediaTool(capability);
  if (match) {
    logger.info(`Routing audio generation to plugin tool: ${match.toolName}`);
    try {
      const result = await Promise.resolve(
        match.handler({
          prompt,
          text: prompt,
          reference_audio: opts?.referenceAudio,
          citizen_id: opts?.citizenId ?? "system",
          citizen_name: opts?.citizenName ?? "System",
        }),
      );
      const res = result as Record<string, unknown>;
      if (!res.error) {
        return {
          success: true,
          provider: match.toolName,
          jobId: res.jobId as string | undefined,
          outputPath: res.outputPath as string | undefined,
        };
      }
    } catch { /* fall through to cloud */ }
  }

  // Cloud API fallback: ElevenLabs → HF → NIM → OpenAI
  if (opts?.type === "speech" || opts?.type === "music") {
    logger.info("No plugin for audio — trying cloud TTS");
    const cloud = await cloudTTS(prompt);
    if (cloud.success) {
      return {
        success: true,
        provider: cloud.provider,
        outputPath: cloud.outputPath,
      };
    }
  }

  return undefined;
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface MediaRouterDiagnostics {
  availableCapabilities: string[];
  pluginsByCapability: Record<string, string[]>;
  totalMediaPlugins: number;
}

/**
 * Get diagnostics for the media router — which capabilities are available
 * and which plugins provide them.
 */
export function getMediaRouterDiagnostics(): MediaRouterDiagnostics {
  const allCapabilities = Object.keys(CAPABILITY_TOOL_MAP);
  const availableCapabilities: string[] = [];
  const pluginsByCapability: Record<string, string[]> = {};
  const seenPlugins = new Set<string>();

  for (const cap of allCapabilities) {
    const plugins = getPluginsByCapability(cap);
    if (plugins.length > 0) {
      availableCapabilities.push(cap);
      pluginsByCapability[cap] = plugins.map((p) => p.id);
      for (const p of plugins) {
        seenPlugins.add(p.id);
      }
    }
  }

  return {
    availableCapabilities,
    pluginsByCapability,
    totalMediaPlugins: seenPlugins.size,
  };
}
