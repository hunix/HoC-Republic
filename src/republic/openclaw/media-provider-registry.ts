/**
 * OpenClaw Media Generation Provider Registry — Adapted for HoC Republic
 *
 * Unified, type-safe provider registry for:
 *   - Image generation (ComfyUI, DALL-E, Stable Diffusion, etc.)
 *   - Video generation (Wan2GP, CogVideoX, LTX-Video, etc.)
 *   - Music generation (Bark, Chatterbox, FunMusic, etc.)
 *
 * Each provider declares its capabilities. The registry provides
 * capability negotiation so callers can find the best provider
 * for a given request (resolution, duration, style, etc.)
 *
 * Wraps existing HoC plugins with standardized provider interfaces.
 *
 * Ported from upstream openclaw/src/{image,video,music}-generation/
 */

import { ts } from "../utils.js";

// ─── Shared Types ────────────────────────────────────────────────

export type MediaType = "image" | "video" | "music";
export type ProviderStatus = "available" | "unavailable" | "degraded" | "loading";

export interface ProviderHealth {
  status: ProviderStatus;
  lastCheckedAt: string;
  latencyMs: number | null;
  errorRate: number;
  uptime: number; // 0–1
}

// ─── Image Generation ────────────────────────────────────────────

export interface ImageCapabilities {
  maxResolution: { width: number; height: number };
  supportedFormats: string[]; // "png", "jpg", "webp"
  supportsInpainting: boolean;
  supportsOutpainting: boolean;
  supportsImg2Img: boolean;
  supportsControlNet: boolean;
  maxBatchSize: number;
  estimatedTimeMs: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  format?: string;
  count?: number;
  seed?: number;
  /** For img2img */
  sourceImage?: string;
  strength?: number;
}

export interface ImageGenerationResult {
  id: string;
  providerId: string;
  images: Array<{ url: string; width: number; height: number; format: string }>;
  durationMs: number;
  seed: number;
  metadata: Record<string, unknown>;
}

export interface ImageProvider {
  id: string;
  name: string;
  type: "image";
  capabilities: ImageCapabilities;
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  checkHealth(): Promise<ProviderHealth>;
}

// ─── Video Generation ────────────────────────────────────────────

export type VideoMode = "text2video" | "image2video" | "video2video";

export interface VideoCapabilities {
  supportedModes: VideoMode[];
  maxResolution: { width: number; height: number };
  maxDurationSeconds: number;
  supportedFormats: string[]; // "mp4", "webm", "gif"
  supportsAudio: boolean;
  estimatedTimeMs: number;
  maxFps: number;
}

export interface VideoGenerationRequest {
  mode: VideoMode;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  format?: string;
  /** For image2video or video2video */
  sourceMedia?: string;
  seed?: number;
}

export interface VideoGenerationResult {
  id: string;
  providerId: string;
  videoUrl: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  format: string;
  durationMs: number;
  metadata: Record<string, unknown>;
}

export interface VideoProvider {
  id: string;
  name: string;
  type: "video";
  capabilities: VideoCapabilities;
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
  checkHealth(): Promise<ProviderHealth>;
}

// ─── Music Generation ────────────────────────────────────────────

export interface MusicCapabilities {
  maxDurationSeconds: number;
  supportedFormats: string[]; // "mp3", "wav", "flac"
  supportsTextPrompt: boolean;
  supportsMelodyInput: boolean;
  supportsVocals: boolean;
  estimatedTimeMs: number;
}

export interface MusicGenerationRequest {
  prompt: string;
  durationSeconds?: number;
  format?: string;
  /** For melody-conditioned generation */
  melodyInput?: string;
  seed?: number;
  temperature?: number;
}

export interface MusicGenerationResult {
  id: string;
  providerId: string;
  audioUrl: string;
  durationSeconds: number;
  format: string;
  sampleRate: number;
  durationMs: number;
  metadata: Record<string, unknown>;
}

export interface MusicProvider {
  id: string;
  name: string;
  type: "music";
  capabilities: MusicCapabilities;
  generate(request: MusicGenerationRequest): Promise<MusicGenerationResult>;
  checkHealth(): Promise<ProviderHealth>;
}

// ─── Union Provider Type ─────────────────────────────────────────

export type MediaProvider = ImageProvider | VideoProvider | MusicProvider;

// ─── Registry Implementation ─────────────────────────────────────

class MediaProviderRegistry {
  private readonly providers = new Map<string, MediaProvider>();
  private readonly healthCache = new Map<string, ProviderHealth>();

  /**
   * Register a media generation provider.
   */
  register(provider: MediaProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Unregister a provider.
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId);
    this.healthCache.delete(providerId);
  }

  /**
   * Get a specific provider by ID.
   */
  get(providerId: string): MediaProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  /**
   * List all providers of a given type.
   */
  listByType<T extends MediaType>(type: T): MediaProvider[] {
    return [...this.providers.values()].filter((p) => p.type === type);
  }

  /**
   * Find the best image provider for a request.
   * Scores providers based on capability match and health.
   */
  findBestImageProvider(request: ImageGenerationRequest): ImageProvider | null {
    const providers = this.listByType("image") as ImageProvider[];

    let bestProvider: ImageProvider | null = null;
    let bestScore = -1;

    for (const provider of providers) {
      const health = this.healthCache.get(provider.id);
      if (health && health.status === "unavailable") {
        continue;
      }

      let score = 0;
      const caps = provider.capabilities;

      // Resolution fit
      const reqW = request.width ?? 1024;
      const reqH = request.height ?? 1024;
      if (caps.maxResolution.width >= reqW && caps.maxResolution.height >= reqH) {
        score += 3;
      } else {
        score -= 2;
      }

      // Feature support bonus
      if (request.sourceImage && caps.supportsImg2Img) {
        score += 2;
      }
      if ((request.count ?? 1) <= caps.maxBatchSize) {
        score += 1;
      }

      // Health bonus
      if (health) {
        score += health.uptime * 2;
        if (health.latencyMs && health.latencyMs < 5000) {
          score += 1;
        }
      } else {
        score += 1; // Unknown health = give it a chance
      }

      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }

  /**
   * Find the best video provider for a request.
   */
  findBestVideoProvider(request: VideoGenerationRequest): VideoProvider | null {
    const providers = this.listByType("video") as VideoProvider[];

    let bestProvider: VideoProvider | null = null;
    let bestScore = -1;

    for (const provider of providers) {
      const health = this.healthCache.get(provider.id);
      if (health && health.status === "unavailable") {
        continue;
      }

      let score = 0;
      const caps = provider.capabilities;

      // Mode support
      if (caps.supportedModes.includes(request.mode)) {
        score += 5;
      } else {
        continue;
      } // Mode not supported = skip

      // Resolution fit
      const reqW = request.width ?? 1280;
      const reqH = request.height ?? 720;
      if (caps.maxResolution.width >= reqW && caps.maxResolution.height >= reqH) {
        score += 2;
      }

      // Duration fit
      const reqDur = request.durationSeconds ?? 5;
      if (caps.maxDurationSeconds >= reqDur) {
        score += 2;
      }

      // Health bonus
      if (health) {
        score += health.uptime * 2;
      } else {
        score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }

  /**
   * Find the best music provider for a request.
   */
  findBestMusicProvider(request: MusicGenerationRequest): MusicProvider | null {
    const providers = this.listByType("music") as MusicProvider[];

    let bestProvider: MusicProvider | null = null;
    let bestScore = -1;

    for (const provider of providers) {
      const health = this.healthCache.get(provider.id);
      if (health && health.status === "unavailable") {
        continue;
      }

      let score = 0;
      const caps = provider.capabilities;

      // Duration fit
      const reqDur = request.durationSeconds ?? 30;
      if (caps.maxDurationSeconds >= reqDur) {
        score += 3;
      }

      // Feature support
      if (request.melodyInput && caps.supportsMelodyInput) {
        score += 2;
      }
      if (caps.supportsVocals) {
        score += 1;
      }

      // Health
      if (health) {
        score += health.uptime * 2;
      } else {
        score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }

  /**
   * Update health cache for a provider.
   */
  updateHealth(providerId: string, health: ProviderHealth): void {
    this.healthCache.set(providerId, health);
  }

  /**
   * Run health checks on all providers.
   */
  async checkAllHealth(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    for (const [id, provider] of this.providers) {
      try {
        const health = await provider.checkHealth();
        this.healthCache.set(id, health);
        results.set(id, health);
      } catch {
        const health: ProviderHealth = {
          status: "unavailable",
          lastCheckedAt: ts(),
          latencyMs: null,
          errorRate: 1,
          uptime: 0,
        };
        this.healthCache.set(id, health);
        results.set(id, health);
      }
    }

    return results;
  }

  /**
   * Get registry diagnostics.
   */
  getDiagnostics(): {
    totalProviders: number;
    byType: Record<MediaType, number>;
    healthSummary: Array<{ id: string; name: string; type: MediaType; status: ProviderStatus }>;
  } {
    const byType: Record<MediaType, number> = { image: 0, video: 0, music: 0 };
    const healthSummary: Array<{
      id: string;
      name: string;
      type: MediaType;
      status: ProviderStatus;
    }> = [];

    for (const provider of this.providers.values()) {
      byType[provider.type]++;
      const health = this.healthCache.get(provider.id);
      healthSummary.push({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        status: health?.status ?? "available",
      });
    }

    return {
      totalProviders: this.providers.size,
      byType,
      healthSummary,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const mediaProviderRegistry = new MediaProviderRegistry();
