/**
 * Execution Tools — Media Production
 *
 * Registry-first provider selection via OpenClaw media-provider-registry,
 * with fallback to legacy cascades.
 *
 * create_art (Registry → SVG → plugins → DALL-E cascade),
 * generate_video (Registry → WanGP → ComfyUI → plugins → cloud → FFmpeg cascade),
 * generate_video_clip, generate_music_track.
 */

import type { ExecutionResult, ExecutionContext } from "../execution-types.js";
import type {
  ImageGenerationRequest,
  VideoGenerationRequest,
  MusicGenerationRequest,
} from "../openclaw/media-provider-registry.js";
import { cloudVideoGeneration } from "../cloud-media.js";
import { emitNationalEvent } from "../event-sourcing.js";
import { callLLM } from "../execution-llm.js";
import { makeFailResult, makeSuccessResult, envKey } from "../execution-types.js";
import {
  routeImageGeneration,
  routeVideoGeneration,
  routeAudioGeneration,
} from "../media-router.js";
import { selectModel } from "../model-council.js";
import { mediaProviderRegistry } from "../openclaw/media-provider-registry.js";
import { uid, ts } from "../utils.js";
import { writeWorkspaceFile } from "../workspace-manager.js";
import { buildComfyVideoWorkflow, pollComfyHistory, downloadComfyOutput } from "./comfyui.js";
// Ensure built-in media providers (Wan2GP, ComfyUI) are registered
import "../openclaw/media-providers.js";

// ─── create_art ─────────────────────────────────────────────────

export async function executeCreateArt(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const description = (args.description as string) ?? "Artwork";
  const style = (args.style as string) ?? "vivid";
  const fileName = (args.fileName as string) ?? `art-${uid()}.png`;
  const outputPath = `output/${fileName}`;
  const allowDalleAutonomous = process.env.ALLOW_DALLE_AUTONOMOUS === "1";

  // ── OpenClaw Registry — try health-checked provider first ──────
  try {
    const registryReq: ImageGenerationRequest = {
      prompt: description,
      width: 1024,
      height: 1024,
      format: "png",
    };
    // Live health check all image providers
    for (const ip of mediaProviderRegistry.listByType("image")) {
      try {
        const h = await ip.checkHealth();
        mediaProviderRegistry.updateHealth(ip.id, h);
      } catch {
        /* skip */
      }
    }
    const bestProvider = mediaProviderRegistry.findBestImageProvider(registryReq);
    if (bestProvider) {
      const result = await bestProvider.generate(registryReq);
      if (result.images.length > 0) {
        emitNationalEvent("infrastructure", "art_created", ctx.citizenId, {
          provider: bestProvider.name,
          prompt: description.slice(0, 100),
          durationMs: Date.now() - start,
        });
        return makeSuccessResult(
          "create_art",
          ctx,
          start,
          `🎨 Generated art via **${bestProvider.name}** (registry): ${description} → ${result.images[0].url}`,
          [(result.metadata?.filename as string) ?? outputPath],
        );
      }
    }
  } catch {
    // Registry provider failed — fall through to legacy cascade
  }

  // 1. Local LLM SVG generation (free)
  const decision = selectModel({
    toolName: "create_art",
    task: {
      type: "decision",
      complexity: 0.3,
      citizenId: ctx.citizenId,
      description: `Create art: ${description}`,
    },
    specialization: ctx.specialization,
    skillLevel: ctx.skillLevel,
  });

  try {
    const svgCode = await callLLM({
      prompt: `Generate a complete SVG image for: ${description}\nStyle: ${style}\n\nReturn ONLY the raw SVG markup, starting with <svg and ending with </svg>.`,
      systemPrompt: `You are ${ctx.citizenName}, a digital artist. Create beautiful SVG artwork. Output only the SVG code.`,
      decision,
    });
    if (svgCode && svgCode.includes("<svg")) {
      const svgPath = outputPath.replace(/\.png$/, ".svg");
      await writeWorkspaceFile({
        projectId: ctx.projectId,
        relativePath: svgPath,
        content: svgCode,
        language: "xml",
        citizenId: ctx.citizenId,
      });
      return {
        id: uid(),
        toolName: "create_art",
        citizenId: ctx.citizenId,
        projectId: ctx.projectId,
        status: "success",
        output: `Generated SVG art (local): ${description} → ${svgPath}`,
        filesAffected: [svgPath],
        modelDecision: decision,
        durationMs: Date.now() - start,
        timestamp: ts(),
      };
    }
  } catch {
    /* fall through */
  }

  // 2. Local GPU plugins
  try {
    const pluginResult = await routeImageGeneration(description, {
      citizenId: ctx.citizenId,
      citizenName: ctx.citizenName,
    });
    if (pluginResult?.success) {
      const resultPath = pluginResult.outputPath ?? outputPath;
      return {
        id: uid(),
        toolName: "create_art",
        citizenId: ctx.citizenId,
        projectId: ctx.projectId,
        status: "success",
        output: `Generated art via plugin (${pluginResult.provider}): ${description} → ${resultPath}`,
        filesAffected: [resultPath],
        modelDecision: null,
        durationMs: Date.now() - start,
        timestamp: ts(),
      };
    }
  } catch {
    /* fall through */
  }

  // 3. DALL-E fallback
  if (envKey("OPENAI_API_KEY") && allowDalleAutonomous) {
    try {
      const imageUrl = await generateWithDallE(description, style);
      const imageData = await downloadImage(imageUrl);
      await writeWorkspaceFile({
        projectId: ctx.projectId,
        relativePath: outputPath,
        content: imageData,
        language: "binary",
        citizenId: ctx.citizenId,
      });
      return {
        id: uid(),
        toolName: "create_art",
        citizenId: ctx.citizenId,
        projectId: ctx.projectId,
        status: "success",
        output: `Generated image via DALL-E 3: ${description} → ${outputPath}`,
        filesAffected: [outputPath],
        modelDecision: null,
        durationMs: Date.now() - start,
        timestamp: ts(),
      };
    } catch (err) {
      console.warn(
        `[create_art] DALL-E failed: ${String(err instanceof Error ? err.message : err)}`,
      );
    }
  }

  return {
    id: uid(),
    toolName: "create_art",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: `Art description (no image provider available): ${description}`,
    filesAffected: [],
    modelDecision: null,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

async function generateWithDallE(description: string, style: string): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${envKey("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: description,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: style === "natural" ? "natural" : "vivid",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`DALL-E API error: ${resp.status} ${t}`);
  }
  const data = (await resp.json()) as { data?: Array<{ url?: string }> };
  const url = data.data?.[0]?.url;
  if (!url) {
    throw new Error("No image URL in DALL-E response");
  }
  return url;
}

async function downloadImage(url: string): Promise<string> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) {
    throw new Error(`Image download failed: ${resp.status}`);
  }
  return Buffer.from(await resp.arrayBuffer()).toString("base64");
}

// ─── generate_video ─────────────────────────────────────────────

export async function executeGenerateVideo(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const prompt = String(args.prompt ?? "");
  if (!prompt) {
    return makeFailResult("generate_video", ctx, start, "Prompt required");
  }

  const format = String(args.format ?? "text_to_video");
  const durationSec = typeof args.durationSeconds === "number" ? args.durationSeconds : 10;
  const inputImage = typeof args.inputImage === "string" ? args.inputImage : undefined;
  const providers: string[] = [];

  // ── OpenClaw Registry — try health-checked provider first ──────
  try {
    const registryReq: VideoGenerationRequest = {
      prompt,
      negativePrompt: typeof args.negativePrompt === "string" ? args.negativePrompt : undefined,
      width: typeof args.width === "number" ? args.width : 832,
      height: typeof args.height === "number" ? args.height : 480,
      durationSeconds: durationSec,
      fps: typeof args.fps === "number" ? args.fps : 24,
      sourceMedia: inputImage,
      mode: inputImage ? "image2video" : "text2video",
    };
    // Live health check all video providers
    for (const vp of mediaProviderRegistry.listByType("video")) {
      try {
        const h = await vp.checkHealth();
        mediaProviderRegistry.updateHealth(vp.id, h);
      } catch {
        /* skip */
      }
    }
    const bestProvider = mediaProviderRegistry.findBestVideoProvider(registryReq);
    if (bestProvider) {
      providers.push(`registry:${bestProvider.id}`);
      const result = await bestProvider.generate(registryReq);
      if (result.videoUrl) {
        const sp = result.videoUrl.startsWith("/republic-output/")
          ? result.videoUrl
          : `/republic-output/video/${result.videoUrl.split(/[/\\]/).pop()}`;
        emitNationalEvent("infrastructure", "video_generated", ctx.citizenId, {
          provider: bestProvider.name,
          prompt: prompt.slice(0, 100),
          durationMs: Date.now() - start,
          source: "openclaw-registry",
        });
        return makeSuccessResult(
          "generate_video",
          ctx,
          start,
          `✅ Video generated via **${bestProvider.name}** (registry)${result.durationMs ? ` — ${Math.round(result.durationMs / 1000)}s` : ""}\n\n![${prompt.slice(0, 60)}](${sp})\n\n<file_download url="${sp}" filename="${sp.split("/").pop()}" />`,
          [(result.metadata?.videoPath as string) ?? sp],
        );
      }
    }
  } catch {
    // Registry provider failed — fall through to legacy cascade
  }

  // 1. WanGP
  try {
    const { generateVideo: wan, checkWan2GPHealth } = await import("../wan2gp-client.js");
    const status = await checkWan2GPHealth();
    if (status.running) {
      providers.push("wan2gp");
      const r = await wan({ prompt, durationSec, sourceImage: inputImage }, status.url);
      if (r.ok && r.videoPath) {
        const sp = r.videoPath.startsWith("/republic-output/")
          ? r.videoPath
          : `/republic-output/video/${r.videoPath.split(/[/\\]/).pop()}`;
        emitNationalEvent("infrastructure", "video_generated", ctx.citizenId, {
          provider: "WanGP",
          prompt: prompt.slice(0, 100),
          durationMs: Date.now() - start,
        });
        return makeSuccessResult(
          "generate_video",
          ctx,
          start,
          `✅ Video generated via **WanGP** (local GPU)${r.duration ? ` — ${r.duration}s generation time` : ""}\n\n![${prompt.slice(0, 60)}](${sp})\n\n<file_download url="${sp}" filename="${sp.split("/").pop()}" />`,
          [r.videoPath],
        );
      }
    }
  } catch {
    /* fall through */
  }

  // 2. ComfyUI
  try {
    const { ensureComfyUI, getComfyUIStatus } = await import("../comfyui-manager.js");
    const init = await ensureComfyUI();
    if (!init.error) {
      providers.push("comfyui");
      const cs = await getComfyUIStatus();
      const API = process.env.COMFYUI_API_URL || cs.url || "http://127.0.0.1:8188";
      const wf = buildComfyVideoWorkflow(prompt, durationSec);
      const res = await fetch(`${API}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: wf }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const d = (await res.json()) as { prompt_id: string };
        const h = await pollComfyHistory(API, d.prompt_id, 600_000, 10_000);
        if (h) {
          const outs = h.outputs as
            | Record<
                string,
                { images?: Array<{ filename: string; subfolder: string; type: string }> }
              >
            | undefined;
          if (outs) {
            for (const no of Object.values(outs)) {
              for (const img of no.images ?? [])
                // oxlint-disable-next-line curly
                if (/\.(mp4|webm|gif)$/i.test(img.filename)) {
                  const dl = await downloadComfyOutput(
                    API,
                    img.filename,
                    img.subfolder ?? "",
                    img.type ?? "output",
                  );
                  if (dl) {
                    const sp = `/republic-output/${dl.localPath}`;
                    emitNationalEvent("infrastructure", "video_generated", ctx.citizenId, {
                      provider: "ComfyUI",
                      prompt: prompt.slice(0, 100),
                      durationMs: Date.now() - start,
                    });
                    return makeSuccessResult(
                      "generate_video",
                      ctx,
                      start,
                      `✅ Video via **ComfyUI**\n\n![${prompt.slice(0, 60)}](${sp})\n\n<file_download url="${sp}" filename="${img.filename}" />`,
                      [dl.localPath],
                    );
                  }
                }
            }
          }
        }
      }
    }
  } catch {
    /* fall through */
  }

  // 3. Media Router plugins
  try {
    providers.push("media-router");
    const pr = await routeVideoGeneration(prompt, {
      inputImage,
      citizenId: ctx.citizenId,
      citizenName: ctx.citizenName,
    });
    if (pr?.success && pr.outputPath) {
      const sp = pr.outputPath.startsWith("/republic-output/")
        ? pr.outputPath
        : `/republic-output/video/${pr.outputPath.split(/[/\\]/).pop()}`;
      emitNationalEvent("infrastructure", "video_generated", ctx.citizenId, {
        provider: pr.provider,
        prompt: prompt.slice(0, 100),
        durationMs: Date.now() - start,
      });
      return makeSuccessResult(
        "generate_video",
        ctx,
        start,
        `✅ Video via **${pr.provider}**\n\n![${prompt.slice(0, 60)}](${sp})`,
        [pr.outputPath],
      );
    }
  } catch {
    /* fall through */
  }

  // 4. Cloud APIs
  try {
    providers.push("cloud");
    const c = await cloudVideoGeneration(prompt, { duration: durationSec });
    if (c.success && c.outputPath) {
      const sp = c.outputPath.startsWith("/republic-output/")
        ? c.outputPath
        : `/republic-output/video/${c.outputPath.split(/[/\\]/).pop()}`;
      emitNationalEvent("infrastructure", "video_generated", ctx.citizenId, {
        provider: c.provider,
        prompt: prompt.slice(0, 100),
        durationMs: Date.now() - start,
      });
      return makeSuccessResult(
        "generate_video",
        ctx,
        start,
        `✅ Video via **${c.provider}** (cloud)\n\n![${prompt.slice(0, 60)}](${sp})`,
        [c.outputPath],
      );
    }
  } catch {
    /* fall through */
  }

  // 5. FFmpeg SVG fallback
  try {
    providers.push("ffmpeg-programmatic");
    const { produceVideo } = await import("../video-producer.js");
    const outputDir = (await import("node:path")).join(process.cwd(), "republic-output", "video");
    const r = await produceVideo({
      type: format === "slideshow" ? "slideshow" : "motion_graphics",
      title: prompt.slice(0, 80),
      description: prompt,
      durationSec,
      citizenId: ctx.citizenId,
      citizenName: ctx.citizenName,
      outputDir,
    });
    if (r.success) {
      const sp = `/republic-output/video/${r.fileName}`;
      emitNationalEvent("infrastructure", "video_generated", ctx.citizenId, {
        provider: "FFmpeg-Programmatic",
        prompt: prompt.slice(0, 100),
        durationMs: Date.now() - start,
      });
      return makeSuccessResult(
        "generate_video",
        ctx,
        start,
        `✅ Video via **FFmpeg**\n\n![${prompt.slice(0, 60)}](${sp})`,
        [r.filePath],
      );
    }
  } catch {
    /* fall through */
  }

  return makeFailResult(
    "generate_video",
    ctx,
    start,
    `All providers failed. Tried: ${providers.join(" → ")}`,
  );
}

// ─── generate_video_clip ────────────────────────────────────────

export async function executeGenerateVideoClip(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const mapped: Record<string, unknown> = {
    prompt: args.prompt,
    durationSeconds: typeof args.durationSec === "number" ? args.durationSec : 5,
    format: "text_to_video",
    qualityTier: args.qualityTier ?? "standard",
  };
  const result = await executeGenerateVideo(mapped, ctx);
  return { ...result, toolName: "generate_video_clip" };
}

// ─── generate_music_track ───────────────────────────────────────

export async function executeGenerateMusicTrack(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const theme = String(args.theme ?? "Untitled Track");
  const style = String(args.style ?? "electronic");
  const type = String(args.type ?? "instrumental");
  const prompt = `${style} ${type} music track about "${theme}"`;

  // ── OpenClaw Registry — try health-checked provider first ──────
  try {
    const registryReq: MusicGenerationRequest = {
      prompt,
      durationSeconds: typeof args.durationSec === "number" ? args.durationSec : 30,
      format: "wav",
    };
    for (const mp of mediaProviderRegistry.listByType("music")) {
      try {
        const h = await mp.checkHealth();
        mediaProviderRegistry.updateHealth(mp.id, h);
      } catch {
        /* skip */
      }
    }
    const bestProvider = mediaProviderRegistry.findBestMusicProvider(registryReq);
    if (bestProvider) {
      const result = await bestProvider.generate(registryReq);
      if (result.audioUrl) {
        const sp = result.audioUrl.startsWith("/republic-output/")
          ? result.audioUrl
          : `/republic-output/music/${result.audioUrl.split(/[/\\]/).pop()}`;
        emitNationalEvent("infrastructure", "music_generated", ctx.citizenId, {
          provider: bestProvider.name,
          theme,
          style,
          durationMs: Date.now() - start,
          source: "openclaw-registry",
        });
        return makeSuccessResult(
          "generate_music_track",
          ctx,
          start,
          `✅ Music via **${bestProvider.name}** (registry)\n\n🎵 "${theme}" (${style})\n\n![${theme}](${sp})`,
          [sp],
        );
      }
    }
  } catch {
    // Registry provider failed — fall through to legacy cascade
  }

  // 1. Local GPU plugins
  try {
    const pr = await routeAudioGeneration(prompt, {
      type: "music",
      citizenId: ctx.citizenId,
      citizenName: ctx.citizenName,
    });
    if (pr?.success && pr.outputPath) {
      const sp = pr.outputPath.startsWith("/republic-output/")
        ? pr.outputPath
        : `/republic-output/music/${pr.outputPath.split(/[/\\]/).pop()}`;
      emitNationalEvent("infrastructure", "music_generated", ctx.citizenId, {
        provider: pr.provider,
        theme,
        style,
        durationMs: Date.now() - start,
      });
      return makeSuccessResult(
        "generate_music_track",
        ctx,
        start,
        `✅ Music via **${pr.provider}**\n\n🎵 "${theme}" (${style})\n\n![${theme}](${sp})`,
        [pr.outputPath],
      );
    }
  } catch {
    /* fall through */
  }

  // 2. Cloud HuggingFace MusicGen
  try {
    const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
    if (hfToken) {
      const resp = await fetch(
        "https://api-inference.huggingface.co/models/facebook/musicgen-small",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${hfToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: prompt }),
          signal: AbortSignal.timeout(120_000),
        },
      );
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length >= 1_000) {
          const { join } = await import("node:path");
          const { mkdirSync, writeFileSync } = await import("node:fs");
          const dir = join(process.cwd(), "republic-output", "music");
          mkdirSync(dir, { recursive: true });
          const fn = `${uid()}_musicgen.wav`;
          writeFileSync(join(dir, fn), buf);
          return makeSuccessResult(
            "generate_music_track",
            ctx,
            start,
            `✅ Music via **HuggingFace/MusicGen**\n\n🎵 "${theme}" (${style})`,
            [join(dir, fn)],
          );
        }
      }
    }
  } catch {
    /* fall through */
  }

  // 3. TTS last resort
  try {
    const { cloudTTS } = await import("../cloud-media.js");
    const tts = await cloudTTS(`Create ${style} music: ${theme}`);
    if (tts.success && tts.outputPath) {
      return makeSuccessResult(
        "generate_music_track",
        ctx,
        start,
        `✅ Audio via **${tts.provider}** (TTS)\n\n🎵 "${theme}"`,
        [tts.outputPath],
      );
    }
  } catch {
    /* fall through */
  }

  return makeFailResult(
    "generate_music_track",
    ctx,
    start,
    "All music generation providers failed or unavailable.",
  );
}
