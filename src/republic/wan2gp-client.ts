/**
 * Wan2GP Client — Gradio 5.x API integration for video generation
 *
 * Connects to a running WanGP instance (Gradio 5.29+ server) and submits
 * video generation jobs via @gradio/client (handles sessions + state).
 *
 * WanGP Architecture (stateful Gradio Blocks, 109+ params):
 *   1. Connect via @gradio/client (creates session, WebSocket, state)
 *   2. Call /browser_session_started to initialize
 *   3. Call /save_inputs with target="state" (stores params in session state)
 *   4. Call /process_prompt_and_add_tasks to queue the job
 *   5. Poll /refresh_status_async for completion
 *   6. Call /refresh_gallery to retrieve the generated video files
 *
 * Key discovery: save_inputs `target` must be "state" (not "settings") so
 * the inputs are stored in session state, which process_prompt_and_add_tasks
 * then reads via get_model_settings(state, model_type).
 *
 * WanGP runs at http://localhost:7860 by default.
 * API prefix: /gradio_api (Gradio 5.x)
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("wan2gp-client");

// ─── Types ──────────────────────────────────────────────────────

export interface Wan2GPStatus {
  running: boolean;
  url: string;
  version?: string;
  availableModels?: string[];
  error?: string;
}

export interface Wan2GPVideoRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  fps?: number;
  model?: string; // e.g. "wan2.2-t2v-14B", "ltx-2.3"
  seed?: number;
  sourceImage?: string; // for image-to-video
  steps?: number; // inference steps (default: 30)
  guidanceScale?: number; // CFG scale (default: 5)
}

export interface Wan2GPResult {
  ok: boolean;
  videoPath?: string; // local path to downloaded MP4
  videoUrl?: string; // Gradio file URL
  duration?: number; // generation time in seconds
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

const DEFAULT_WAN2GP_URL = "http://127.0.0.1:7860";

// ─── Resolution Helpers ─────────────────────────────────────────

/** Convert width/height to WanGP resolution string */
function toResolutionStr(w: number, h: number): string {
  return `${w}x${h}`;
}

/** Convert duration in seconds to WanGP video_length in frames (16fps default) */
function durationToFrames(durationSec: number, fps: number = 16): number {
  // WanGP uses multiples of 4+1 for frame counts: 5, 9, 13, 17, 21, ... 81, ...
  const rawFrames = Math.round(durationSec * fps);
  // Snap to nearest valid frame count (4n + 1)
  const n = Math.max(1, Math.round((rawFrames - 1) / 4));
  return n * 4 + 1;
}

// ─── Health Check ───────────────────────────────────────────────

/**
 * Check if WanGP is running and accessible.
 */
export async function checkWan2GPHealth(
  baseUrl: string = DEFAULT_WAN2GP_URL,
): Promise<Wan2GPStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // Gradio 5.x: try /gradio_api/info first, fall back to root
    let resp = await fetch(`${baseUrl}/gradio_api/info`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const info = (await resp.json()) as Record<string, string>;
      return {
        running: true,
        url: baseUrl,
        version: info.version,
      };
    }

    // Fall back to root
    resp = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      return { running: true, url: baseUrl };
    }

    return { running: false, url: baseUrl, error: `HTTP ${resp.status}` };
  } catch (err) {
    return {
      running: false,
      url: baseUrl,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Try multiple ports to find a running WanGP instance.
 */
export async function discoverWan2GP(): Promise<Wan2GPStatus> {
  const ports = [7860, 7861, 7862, 7863];
  const hosts = ["127.0.0.1", "localhost"];

  for (const host of hosts) {
    for (const port of ports) {
      const status = await checkWan2GPHealth(`http://${host}:${port}`);
      if (status.running) {
        logger.info(`Discovered WanGP at ${status.url}`);
        return status;
      }
    }
  }

  return { running: false, url: DEFAULT_WAN2GP_URL, error: "WanGP not found on any known port" };
}

// ─── @gradio/client Integration ─────────────────────────────────

/** Lazily imported @gradio/client.Client */
let GradioClient: typeof import("@gradio/client").Client | undefined;

async function getGradioClient(): Promise<typeof import("@gradio/client").Client> {
  if (!GradioClient) {
    const mod = await import("@gradio/client");
    GradioClient = mod.Client;
  }
  return GradioClient;
}

// ─── Video Generation ───────────────────────────────────────────

/**
 * Submit a video generation request to WanGP via @gradio/client.
 *
 * Uses @gradio/client for proper Gradio session management (WebSocket state).
 * WanGP requires stateful sessions — raw fetch won't work because the
 * Gradio State objects need to persist across calls within a session.
 *
 * Flow:
 * 1. Client.connect() → creates session with WebSocket
 * 2. /browser_session_started → initializes WanGP session
 * 3. /save_inputs (target="state") → stores all 109 params in session state
 * 4. /process_prompt_and_add_tasks → queues the generation task
 * 5. Poll /refresh_status_async → watch for completion
 * 6. /refresh_gallery → retrieve generated video files
 */
export async function generateVideo(
  request: Wan2GPVideoRequest,
  baseUrl: string = DEFAULT_WAN2GP_URL,
): Promise<Wan2GPResult> {
  const startTime = Date.now();

  // ── Connect via @gradio/client ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: {
    predict: (endpoint: string, data?: unknown[]) => Promise<{ data: unknown[] }>;
  } & Record<string, any>;
  try {
    const Client = await getGradioClient();
    app = await Client.connect(baseUrl);
    logger.info("Connected to WanGP via @gradio/client");
  } catch (err) {
    logger.warn(`@gradio/client connect failed: ${err instanceof Error ? err.message : err}`);
    return {
      ok: false,
      error: `Cannot connect to WanGP at ${baseUrl}: ${err instanceof Error ? err.message : err}`,
    };
  }

  try {
    // ── Step 0: Initialize browser session ──
    try {
      await app.predict("/browser_session_started");
      logger.info("WanGP session initialized");
    } catch (err) {
      logger.warn(
        `/browser_session_started failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
    }

    // ── Step 1: Build & send save_inputs ──
    const width = request.width ?? 832;
    const height = request.height ?? 480;
    const resolution = toResolutionStr(width, height);
    const fps = request.fps ?? 16;
    const durationSec = request.durationSec ?? 5;
    const videoLength = durationToFrames(durationSec, fps);

    // 109 parameters matching /save_inputs parameter order exactly.
    // CRITICAL: target must be "state" (not "settings") so params are
    // stored in Gradio session state for process_prompt_and_add_tasks.
    const saveInputsData: unknown[] = [
      "state", // target ★ MUST be "state"
      null, // image_mask_guide
      "", // lset_name
      "", // client_id
      0, // image_mode
      request.prompt, // prompt ★
      "", // alt_prompt
      request.negativePrompt ?? "", // negative_prompt ★
      resolution, // resolution ★
      videoLength, // video_length ★
      0, // duration_seconds (0 = use video_length)
      0, // pause_seconds
      1, // batch_size
      request.seed ?? -1, // seed ★
      request.fps ? String(request.fps) : "", // force_fps
      request.steps ?? 30, // num_inference_steps ★
      request.guidanceScale ?? 5, // guidance_scale ★
      5, // guidance2_scale
      5, // guidance3_scale
      0, // switch_threshold
      0, // switch_threshold2
      1, // guidance_phases
      1, // model_switch_phase
      1, // alt_guidance_scale
      0, // alt_scale
      4, // audio_guidance_scale
      1, // audio_scale
      5, // flow_shift
      "unipc", // sample_solver
      6, // embedded_guidance_scale
      1, // repeat_generation
      0, // multi_prompts_gen_type
      0, // multi_images_gen_type
      "", // skip_steps_cache_type
      1.75, // skip_steps_multiplier
      0, // skip_steps_start_step_perc
      [], // loras_choices
      "", // loras_multipliers
      "", // image_prompt_type
      [], // image_start
      [], // image_end
      null, // model_mode
      null, // video_source
      "", // keep_frames_video_source
      1, // input_video_strength
      "#", // video_guide_outpainting
      "", // video_prompt_type
      [], // image_refs
      "", // frames_positions
      null, // video_guide
      null, // image_guide
      "", // keep_frames_video_guide
      0.5, // denoising_strength
      1, // masking_strength
      null, // video_mask
      null, // image_mask
      1, // control_net_weight
      1, // control_net_weight2
      1, // control_net_weight_alt
      1, // motion_amplitude
      0, // mask_expand
      null, // audio_guide
      null, // audio_guide2
      null, // custom_guide
      null, // audio_source
      "", // audio_prompt_type
      "0:45 55:100", // speakers_locations
      81, // sliding_window_size
      5, // sliding_window_overlap
      0, // sliding_window_color_correction_strength
      0, // sliding_window_overlap_noise
      0, // sliding_window_discard_last_frames
      50, // image_refs_relative_size
      1, // remove_background_images_ref
      "", // temporal_upsampling
      "", // spatial_upsampling
      0, // film_grain_intensity
      0.5, // film_grain_saturation
      0, // MMAudio_setting
      "", // MMAudio_prompt
      "", // MMAudio_neg_prompt
      0, // RIFLEx_setting
      1, // NAG_scale
      3.5, // NAG_tau
      0.5, // NAG_alpha
      0, // perturbation_switch
      [9], // perturbation_layers
      10, // perturbation_start_perc
      90, // perturbation_end_perc
      0, // apg_switch
      0, // cfg_star_switch
      -1, // cfg_zero_step
      "", // prompt_enhancer
      1, // min_frames_if_references
      -1, // override_profile
      "", // override_attention
      0.8, // temperature
      "", // custom_setting_1
      "", // custom_setting_2
      "", // custom_setting_3
      "", // custom_setting_4
      "", // custom_setting_5
      0.9, // top_p
      50, // top_k
      0, // self_refiner_setting (disabled)
      0, // self_refiner_f_uncertainty
      0.999, // self_refiner_certain_percentage
      "", // output_filename
      "", // mode
    ];

    logger.info(
      `Submitting: prompt="${request.prompt.slice(0, 60)}..." res=${resolution} frames=${videoLength} steps=${request.steps ?? 30}`,
    );

    await app.predict("/save_inputs", saveInputsData);
    logger.info("save_inputs OK (target=state)");

    // ── Step 2: Queue the generation ──
    const processResult = await app.predict("/process_prompt_and_add_tasks", [0, "t2v"]);
    logger.info(`Generation queued: ${JSON.stringify(processResult.data).slice(0, 150)}`);

    // ── Step 3: Poll for completion ──
    // WanGP first downloads the model if needed (can take 15-30 min for first run),
    // then runs inference. Total timeout scaled to duration + model load buffer.
    const maxPollMs = Math.max(600_000, durationSec * 90_000); // At least 10 min
    const pollIntervalMs = 5_000;
    const deadline = Date.now() + maxPollMs;
    let lastStatus = "";
    let sawActivity = false;

    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);

      try {
        const status = await app.predict("/refresh_status_async");
        const statusText = String(status.data[0] ?? "");

        if (statusText && statusText !== "null" && statusText !== lastStatus) {
          logger.info(`WanGP status: ${statusText.slice(0, 150)}`);
          lastStatus = statusText;
          sawActivity = true;
        }

        // Check for completion
        const lower = statusText.toLowerCase();
        if (lower.includes("saved") || lower.includes("finished") || lower.includes("completed")) {
          logger.info("Generation completed!");
          break;
        }

        // Check for errors
        if (
          lower.includes("error") ||
          lower.includes("out of memory") ||
          lower.includes("failed")
        ) {
          return { ok: false, error: `WanGP generation failed: ${statusText.slice(0, 300)}` };
        }
      } catch (err) {
        logger.warn(`Poll error (non-fatal): ${err instanceof Error ? err.message : err}`);
      }
    }

    // ── Step 4: Retrieve results ──
    try {
      const gallery = await app.predict("/refresh_gallery");
      const videoResult = extractVideoFromGallery(baseUrl, gallery.data);
      if (videoResult) {
        videoResult.duration = Math.round((Date.now() - startTime) / 1000);
        logger.info(
          `Video generated in ${videoResult.duration}s: ${videoResult.videoUrl ?? videoResult.videoPath}`,
        );
        return videoResult;
      }
    } catch (err) {
      logger.warn(`Gallery refresh failed: ${err instanceof Error ? err.message : err}`);
    }

    // Check output directory directly as fallback
    const outputResult = await checkOutputDirectory(baseUrl);
    if (outputResult) {
      outputResult.duration = Math.round((Date.now() - startTime) / 1000);
      return outputResult;
    }

    return {
      ok: sawActivity,
      duration: Math.round((Date.now() - startTime) / 1000),
      videoUrl: baseUrl,
      error: sawActivity
        ? "Generation may have completed. Check WanGP UI for output."
        : "No progress detected. Model may still be downloading — check WanGP UI.",
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Handle the known "Webform" error — means state wasn't properly set
    if (errMsg.includes("Webform")) {
      return {
        ok: false,
        error:
          "WanGP session state error. The UI may need a browser refresh. " +
          "Try generating directly from the WanGP UI at " +
          baseUrl,
      };
    }

    return {
      ok: false,
      error: `WanGP generation error: ${errMsg}`,
    };
  }
}

// ─── Output Extraction ──────────────────────────────────────────

/**
 * Check WanGP output directory for recently generated video files.
 * Gradio 5 files are accessible via /gradio_api/file=<path>
 */
async function checkOutputDirectory(_baseUrl: string): Promise<Wan2GPResult | null> {
  // WanGP typically saves to /workspace/outputs/
  // We can't easily list files remotely, but this is a placeholder for
  // when the gallery extraction works properly.
  return null;
}

/**
 * Extract video file info from WanGP gallery data.
 * Gallery returns: [tab_index, gallery_items[], ...]
 */
function extractVideoFromGallery(baseUrl: string, data: unknown[]): Wan2GPResult | null {
  for (const item of data) {
    if (Array.isArray(item)) {
      for (const entry of item) {
        const videoInfo = extractVideoFileInfo(baseUrl, entry);
        if (videoInfo) {
          return videoInfo;
        }
      }
    } else if (typeof item === "object" && item !== null) {
      const videoInfo = extractVideoFileInfo(baseUrl, item);
      if (videoInfo) {
        return videoInfo;
      }
    }
  }
  return null;
}

/**
 * Extract video file path/URL from a single gallery entry.
 */
function extractVideoFileInfo(baseUrl: string, entry: unknown): Wan2GPResult | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const obj = entry as Record<string, unknown>;

  // Gradio 5.x FileData format: { path, url, orig_name, mime_type, ... }
  if (obj.video) {
    return extractPath(baseUrl, obj.video as Record<string, unknown>);
  }

  // Direct file object
  const result = extractPath(baseUrl, obj);
  if (result) {
    return result;
  }

  // Nested in "image" key (Gradio gallery uses this for video too)
  if (obj.image) {
    return extractPath(baseUrl, obj.image as Record<string, unknown>);
  }

  return null;
}

function extractPath(baseUrl: string, obj: Record<string, unknown>): Wan2GPResult | null {
  const path = (obj.path ?? obj.name ?? obj.url) as string | undefined;
  if (!path) {
    return null;
  }

  const isVideo =
    path.endsWith(".mp4") ||
    path.endsWith(".webm") ||
    path.endsWith(".gif") ||
    (typeof obj.mime_type === "string" && obj.mime_type.startsWith("video/"));

  if (!isVideo && !path.includes("video") && !path.includes("output")) {
    return null;
  }

  const videoUrl = path.startsWith("http") ? path : `${baseUrl}/gradio_api/file=${path}`;

  return {
    ok: true,
    videoUrl,
    videoPath: path,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download a video from WanGP to a local path (via curl in sandbox).
 */
export function buildWan2GPDownloadCommand(
  videoUrl: string,
  outputPath: string,
  sandboxHost?: string,
): string {
  let url = videoUrl;
  if (sandboxHost && (url.includes("127.0.0.1") || url.includes("localhost"))) {
    url = url.replace(/127\.0\.0\.1|localhost/, sandboxHost);
  }
  return `curl -sL '${url}' -o '${outputPath}' -m 60 && echo 'OK'`;
}

/**
 * Reset the API discovery cache (no-op in current impl).
 */
export function resetWan2GPCache(): void {
  // No cache to reset — each call creates a fresh @gradio/client session
}
