/**
 * AI Tools — LLM inference, image/video generation, TTS, upscaling
 * Handles: ai_inference, image_generate, video_generate, tts_speak,
 *          upscale_image, container_manage, cuda_check, deerflow_research
 */

import type {
  VideoGenerationRequest,
  VideoGenerationResult,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "../openclaw/media-provider-registry.js";
import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";
import { getComfyUIStatus } from "../comfyui-manager.js";
import {
  discoverCheckpoints,
  discoverMotionModels,
  findSD15Checkpoint,
  findBestMotionModel,
  buildAnimateDiffWorkflow,
  buildImageWorkflow,
  submitWorkflow,
  pollForCompletion,
  extractVideoOutput,
  extractImageOutput,
  buildViewUrl,
  getMotionModelDownloadCommand,
} from "../comfyui-workflows.js";
import { mediaProviderRegistry } from "../openclaw/media-provider-registry.js";
import {
  discoverWan2GP,
  generateVideo as wan2gpGenerateVideo,
  buildWan2GPDownloadCommand,
} from "../wan2gp-client.js";
// Ensure providers are registered (idempotent)
import "../openclaw/media-providers.js";

export function createAiToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile, key, ensureWarmPoolSweep, touchContainer } = ctx;

  return {
    ai_inference: async (input: ToolInput) => {
      const aiPrompt = input.prompt as string;
      if (!aiPrompt) {
        return "Error: prompt is required";
      }
      const aiSystem = (input.system as string) || "";
      const provider = (input.provider as string) || "anthropic";
      const aiModel = input.model as string;
      const maxTok = (input.max_tokens as number) || 1024;
      const temp = (input.temperature as number) ?? 0.7;

      switch (provider) {
        case "anthropic": {
          const model = aiModel || "claude-haiku-3-5-20241022";
          const body = JSON.stringify({
            model,
            max_tokens: maxTok,
            ...(aiSystem ? { system: aiSystem } : {}),
            messages: [{ role: "user", content: aiPrompt }],
          });
          const result = await sandboxExec(
            `curl -s -X POST https://api.anthropic.com/v1/messages -H "Content-Type: application/json" -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -d '${body.replace(/'/g, "'\\''")}'  2>&1`,
            "/workspace",
            60,
          );
          try {
            const resp = JSON.parse(result.stdout);
            const text = resp.content?.[0]?.text || resp.error?.message || "No response";
            return `🤖 AI (${model}):\n\n${text}`;
          } catch {
            return `AI inference error:\n${result.stdout.slice(0, 2000)}`;
          }
        }
        case "ollama": {
          const model = aiModel || "llama3.2";
          const body = JSON.stringify({
            model,
            prompt: aiPrompt,
            system: aiSystem,
            stream: false,
            options: { temperature: temp, num_predict: maxTok },
          });
          const result = await sandboxExec(
            `curl -s http://localhost:11434/api/generate -d '${body.replace(/'/g, "'\\''")}'  2>&1`,
            "/workspace",
            120,
          );
          try {
            const resp = JSON.parse(result.stdout);
            return `🦙 AI (${model}):\n\n${resp.response || "No response"}`;
          } catch {
            return `Ollama error (is it running?):\n${result.stdout.slice(0, 1000)}`;
          }
        }
        case "openai": {
          const model = aiModel || "gpt-5.4-nano";
          const msgs = aiSystem
            ? [
                { role: "system", content: aiSystem },
                { role: "user", content: aiPrompt },
              ]
            : [{ role: "user", content: aiPrompt }];
          const body = JSON.stringify({
            model,
            messages: msgs,
            max_tokens: maxTok,
            temperature: temp,
          });
          const result = await sandboxExec(
            `curl -s https://api.openai.com/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer $OPENAI_API_KEY" -d '${body.replace(/'/g, "'\\''")}'  2>&1`,
            "/workspace",
            60,
          );
          try {
            const resp = JSON.parse(result.stdout);
            const text =
              resp.choices?.[0]?.message?.content || resp.error?.message || "No response";
            return `🧠 AI (${model}):\n\n${text}`;
          } catch {
            return `OpenAI error:\n${result.stdout.slice(0, 1000)}`;
          }
        }
        case "gemini": {
          const model = aiModel || "gemini-2.0-flash";
          const geminiKey = key("GEMINI_API_KEY") || key("GOOGLE_API_KEY");
          if (!geminiKey) {
            return "Error: GEMINI_API_KEY not set";
          }
          const body = JSON.stringify({
            contents: [{ parts: [{ text: aiSystem ? `${aiSystem}\n\n${aiPrompt}` : aiPrompt }] }],
            generationConfig: { temperature: temp, maxOutputTokens: maxTok },
          });
          const result = await sandboxExec(
            `curl -s -X POST 'https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}' -H 'Content-Type: application/json' -d '${body.replace(/'/g, "'\\''")}' 2>&1`,
            "/workspace",
            60,
          );
          try {
            const resp = JSON.parse(result.stdout);
            const text =
              resp.candidates?.[0]?.content?.parts?.[0]?.text ||
              resp.error?.message ||
              "No response";
            return `🌟 AI (${model}):\n\n${text}`;
          } catch {
            return `Gemini error:\n${result.stdout.slice(0, 1000)}`;
          }
        }
        case "groq": {
          const model = aiModel || "llama-3.3-70b-versatile";
          const groqKey = key("GROQ_API_KEY");
          if (!groqKey) {
            return "Error: GROQ_API_KEY not set";
          }
          const msgs = aiSystem
            ? [
                { role: "system", content: aiSystem },
                { role: "user", content: aiPrompt },
              ]
            : [{ role: "user", content: aiPrompt }];
          const body = JSON.stringify({
            model,
            messages: msgs,
            max_tokens: maxTok,
            temperature: temp,
          });
          const result = await sandboxExec(
            `curl -s https://api.groq.com/openai/v1/chat/completions -H 'Authorization: Bearer ${groqKey}' -H 'Content-Type: application/json' -d '${body.replace(/'/g, "'\\''")}' 2>&1`,
            "/workspace",
            30,
          );
          try {
            const resp = JSON.parse(result.stdout);
            const text =
              resp.choices?.[0]?.message?.content || resp.error?.message || "No response";
            return `⚡ AI/Groq (${model}):\n\n${text}`;
          } catch {
            return `Groq error:\n${result.stdout.slice(0, 1000)}`;
          }
        }
        case "nim":
        case "nvidia": {
          const model = aiModel || "meta/llama-3.1-70b-instruct";
          const nimKey = key("NVIDIA_API_KEY") || key("NIM_API_KEY");
          if (!nimKey) {
            return "Error: NVIDIA_API_KEY not set";
          }
          const msgs = aiSystem
            ? [
                { role: "system", content: aiSystem },
                { role: "user", content: aiPrompt },
              ]
            : [{ role: "user", content: aiPrompt }];
          const body = JSON.stringify({
            model,
            messages: msgs,
            max_tokens: maxTok,
            temperature: temp,
            stream: false,
          });
          const result = await sandboxExec(
            `curl -s https://integrate.api.nvidia.com/v1/chat/completions -H 'Authorization: Bearer ${nimKey}' -H 'Content-Type: application/json' -d '${body.replace(/'/g, "'\\''")}' 2>&1`,
            "/workspace",
            60,
          );
          try {
            const resp = JSON.parse(result.stdout);
            const text =
              resp.choices?.[0]?.message?.content || resp.error?.message || "No response";
            return `🟢 AI/NIM (${model}):\n\n${text}`;
          } catch {
            return `NIM error:\n${result.stdout.slice(0, 1000)}`;
          }
        }
        default:
          return `Unknown provider: ${provider}. Valid: anthropic, ollama, openai, gemini, groq, nim`;
      }
    },

    image_generate: async (input: ToolInput) => {
      ensureWarmPoolSweep();
      const prompt = (input.prompt as string) || "";
      if (!prompt) {
        return "Error: prompt is required";
      }
      const model = (input.model as string) || "flux-schnell";
      const width = (input.width as number) || 1024;
      const height = (input.height as number) || 1024;
      const seed = (input.seed as number) ?? -1;
      const negPrompt = (input.negative_prompt as string) || "";
      const outPath = (input.output_path as string) || "/workspace/generated_image.png";

      // ══════════════════════════════════════════════════════
      // OpenClaw Media Provider Registry — Auto-select best image provider
      // ══════════════════════════════════════════════════════
      const imageProviders = mediaProviderRegistry.listByType("image");
      for (const ip of imageProviders) {
        try {
          const h = await ip.checkHealth();
          mediaProviderRegistry.updateHealth(ip.id, h);
        } catch {
          /* health unknown */
        }
      }

      const registryImgRequest: ImageGenerationRequest = {
        prompt,
        negativePrompt: negPrompt || undefined,
        width,
        height,
        seed,
        sourceImage: (input.source_image as string) || undefined,
        format: "png",
      };

      const bestImageProvider = mediaProviderRegistry.findBestImageProvider(registryImgRequest);

      if (bestImageProvider) {
        try {
          const result: ImageGenerationResult =
            await bestImageProvider.generate(registryImgRequest);

          if (result.images.length > 0) {
            touchContainer("comfyui");
            const imageUrl = result.images[0].url;

            // Rewrite URL for sandbox Docker networking
            let sandboxImageUrl = imageUrl;
            if (sandboxImageUrl.includes("127.0.0.1") || sandboxImageUrl.includes("localhost")) {
              const backendUrl = (result.metadata?.url as string) ?? "";
              const port = backendUrl ? new URL(backendUrl).port || "8188" : "8188";
              const canReachHDInternal = await sandboxExec(
                `curl -sL --connect-timeout 2 http://host.docker.internal:${port}/system_stats 2>/dev/null`,
                "/workspace",
                5,
              );
              const sandboxHost =
                canReachHDInternal.exitCode === 0 ? "host.docker.internal" : "172.17.0.1";
              sandboxImageUrl = sandboxImageUrl.replace(/127\.0\.0\.1|localhost/, sandboxHost);
            }

            const copyResult = await sandboxExec(
              `curl -sL '${sandboxImageUrl}' -o '${outPath}' -m 30 && echo 'OK'`,
              "/workspace",
              35,
            );

            const usedSeed = result.seed === -1 ? "random" : String(result.seed);
            return copyResult.stdout.includes("OK")
              ? `🎨 Image generated: ${outPath}\nProvider: ${bestImageProvider.name} | Size: ${result.images[0].width}×${result.images[0].height} | Seed: ${usedSeed} | Time: ${Math.round(result.durationMs / 1000)}s`
              : `🎨 Image saved to ${bestImageProvider.name}: ${result.metadata?.filename ?? "output"}\nDownload from provider | Size: ${width}×${height}`;
          }
        } catch {
          // Provider failed — fall through to manual pipeline
        }
      }

      // ══════════════════════════════════════════════════════
      // Manual Fallback — HuggingFace cloud or direct ComfyUI
      // ══════════════════════════════════════════════════════
      touchContainer("comfyui");
      const status = await getComfyUIStatus();

      if (!status.running) {
        const hfToken = key("HF_TOKEN") || key("HUGGINGFACE_TOKEN");
        if (hfToken) {
          const hfModel =
            model === "sdxl"
              ? "stabilityai/stable-diffusion-xl-base-1.0"
              : "black-forest-labs/FLUX.1-schnell";
          const r = await sandboxExec(
            `curl -s -X POST 'https://api-inference.huggingface.co/models/${hfModel}' -H 'Authorization: Bearer ${hfToken}' -H 'Content-Type: application/json' -d '{"inputs":"${prompt.replace(/"/g, '\\"')}"}' --output '${outPath}' -m 120`,
            "/workspace",
            130,
          );
          return r.exitCode === 0
            ? `🎨 Image generated (HuggingFace ${model}): ${outPath}`
            : `Error: ${r.stderr.slice(0, 300)}`;
        }
        return `⚠️ ComfyUI sandbox not running and no HF_TOKEN set.\n\n**To use GPU image generation:**\n1. Start ComfyUI sandbox: use \`container_manage\` with action "start" and container_type "comfyui"\n2. Or set HF_TOKEN in .env for HuggingFace cloud inference`;
      }

      // Direct ComfyUI pipeline fallback
      const comfyUrl = status.url;
      const installed = await discoverCheckpoints(comfyUrl);
      let checkpoint: string | undefined;
      if (installed.length > 0) {
        const lower = installed.map((n) => n.toLowerCase());
        if (model.includes("flux") && model.includes("dev")) {
          checkpoint = installed.find(
            (_, i) => lower[i].includes("flux") && lower[i].includes("dev"),
          );
        } else if (model.includes("flux")) {
          checkpoint = installed.find(
            (_, i) => lower[i].includes("flux") && lower[i].includes("schnell"),
          );
          if (!checkpoint) {
            checkpoint = installed.find((_, i) => lower[i].includes("flux"));
          }
        } else if (model.includes("sdxl") || model.includes("xl")) {
          checkpoint = installed.find(
            (_, i) => lower[i].includes("xl") || lower[i].includes("sdxl"),
          );
        }
      }

      const { workflow } = buildImageWorkflow({
        prompt,
        negativePrompt: negPrompt || undefined,
        width,
        height,
        seed: seed === -1 ? undefined : seed,
        model,
        checkpoint,
      });

      const submitResult = await submitWorkflow(comfyUrl, workflow);
      if (!submitResult.ok || !submitResult.promptId) {
        return `ComfyUI submit failed: ${submitResult.error ?? "unknown error"}`;
      }

      const pollResult = await pollForCompletion(comfyUrl, submitResult.promptId, 120_000, 3000);
      if (!pollResult.completed || !pollResult.outputs) {
        return `⏳ Image generation timed out or failed: ${pollResult.error ?? "no output"}\n\nCheck ComfyUI at ${comfyUrl} for status.`;
      }

      const imageOut = extractImageOutput(pollResult.outputs);
      if (!imageOut) {
        return `⚠️ Image generated but could not extract output file. Check ComfyUI at ${comfyUrl}.`;
      }

      const viewUrl = buildViewUrl(comfyUrl, imageOut);
      let sandboxViewUrl = viewUrl;
      if (viewUrl.includes("127.0.0.1") || viewUrl.includes("localhost")) {
        const port = new URL(comfyUrl).port || "8188";
        const canReachHDInternal = await sandboxExec(
          `curl -sL --connect-timeout 2 http://host.docker.internal:${port}/system_stats 2>/dev/null`,
          "/workspace",
          5,
        );
        const sandboxHost =
          canReachHDInternal.exitCode === 0 ? "host.docker.internal" : "172.17.0.1";
        sandboxViewUrl = viewUrl.replace(/127\.0\.0\.1|localhost/, sandboxHost);
      }

      const copyResult = await sandboxExec(
        `curl -sL '${sandboxViewUrl}' -o '${outPath}' -m 30 && echo 'OK'`,
        "/workspace",
        35,
      );

      const usedSeed = seed === -1 ? "random" : String(seed);
      return copyResult.stdout.includes("OK")
        ? `🎨 Image generated: ${outPath}\nModel: ${model} | Size: ${width}×${height} | Seed: ${usedSeed}`
        : `🎨 Image saved to ComfyUI output: ${imageOut.filename}\nDownload from: ${comfyUrl}\nModel: ${model} | Size: ${width}×${height}`;
    },

    video_generate: async (input: ToolInput) => {
      ensureWarmPoolSweep();
      const prompt = (input.prompt as string) || "";
      if (!prompt) {
        return "Error: prompt is required";
      }
      const model = (input.model as string) || "wan2.2";
      const duration = Math.min((input.duration_seconds as number) || 5, 10);
      const fps = (input.fps as number) || 24;
      const width = (input.width as number) || 832;
      const height = (input.height as number) || 480;
      const outPath = (input.output_path as string) || "/workspace/generated_video.mp4";
      const sourceImage = (input.source_image as string) || "";
      const negPrompt = (input.negative_prompt as string) || "";

      // ══════════════════════════════════════════════════════
      // OpenClaw Media Provider Registry — Auto-select best provider
      // The registry scores providers by mode support, resolution,
      // duration fit, and live health. Falls back to manual pipeline
      // if no provider is registered or all are unhealthy.
      // ══════════════════════════════════════════════════════

      // Refresh health for video providers before selection
      const videoProviders = mediaProviderRegistry.listByType("video");
      for (const vp of videoProviders) {
        try {
          const h = await vp.checkHealth();
          mediaProviderRegistry.updateHealth(vp.id, h);
        } catch {
          /* health unknown — registry gives benefit of doubt */
        }
      }

      const registryRequest: VideoGenerationRequest = {
        mode: sourceImage ? "image2video" : "text2video",
        prompt,
        negativePrompt: negPrompt || undefined,
        width,
        height,
        durationSeconds: duration,
        fps,
        sourceMedia: sourceImage || undefined,
        seed: (input.seed as number) ?? -1,
      };

      const bestProvider = mediaProviderRegistry.findBestVideoProvider(registryRequest);

      if (bestProvider) {
        try {
          const result: VideoGenerationResult = await bestProvider.generate(registryRequest);

          // Registry gave us a videoUrl — download to sandbox
          if (result.videoUrl) {
            const backend = (result.metadata?.backend as string) ?? bestProvider.id;
            const backendUrl = (result.metadata?.url as string) ?? "";
            const port = backendUrl ? new URL(backendUrl).port || "7860" : "7860";

            // Touch the backend container for warm-pool tracking
            if (backend.includes("wan2gp")) {
              touchContainer("wan2gp");
            } else if (backend.includes("comfyui")) {
              touchContainer("comfyui");
            }

            // Rewrite URL for sandbox Docker networking
            let sandboxVideoUrl = result.videoUrl;
            if (sandboxVideoUrl.includes("127.0.0.1") || sandboxVideoUrl.includes("localhost")) {
              const canReachHDInternal = await sandboxExec(
                `curl -sL --connect-timeout 2 http://host.docker.internal:${port}/ 2>/dev/null | head -c 20`,
                "/workspace",
                5,
              );
              const sandboxHost =
                canReachHDInternal.exitCode === 0 ? "host.docker.internal" : "172.17.0.1";
              sandboxVideoUrl = sandboxVideoUrl.replace(/127\.0\.0\.1|localhost/, sandboxHost);
            }

            const copyResult = await sandboxExec(
              `curl -sL '${sandboxVideoUrl}' -o '${outPath}' -m 65 && echo 'OK'`,
              "/workspace",
              70,
            );

            if (copyResult.stdout.includes("OK")) {
              return `🎬 Video generated: ${outPath}\nProvider: ${bestProvider.name} | Duration: ${duration}s @ ${fps}fps | Size: ${result.width}×${result.height} | Time: ${Math.round(result.durationMs / 1000)}s${sourceImage ? `\nSource: ${sourceImage}` : ""}`;
            }
            return `🎬 Video generated by ${bestProvider.name}: ${result.videoUrl}\nDuration: ${duration}s @ ${fps}fps | Size: ${result.width}×${result.height}`;
          }
        } catch (err) {
          // Provider failed — fall through to manual pipeline
          const errMsg = err instanceof Error ? err.message : String(err);
          // If the best provider was Wan2GP and it explicitly errored, report it
          if (bestProvider.id === "wan2gp") {
            return `❌ ${bestProvider.name} video generation failed: ${errMsg}\n\nThe WanGP server returned an error.\nTry checking the WanGP web UI to verify the model is loaded.`;
          }
          // Otherwise fall through to manual ComfyUI pipeline with motion model auto-download
        }
      }

      // ══════════════════════════════════════════════════════
      // Manual Fallback — Direct pipeline (motion model auto-download)
      // Used when: no providers registered, all unhealthy, or provider.generate() threw
      // ══════════════════════════════════════════════════════

      // Try Wan2GP direct (in case registry missed it)
      const wan2gpStatus = await discoverWan2GP();
      if (wan2gpStatus.running) {
        touchContainer("wan2gp");
        const result = await wan2gpGenerateVideo(
          {
            prompt,
            negativePrompt: negPrompt || undefined,
            width,
            height,
            durationSec: duration,
            fps,
            model,
            seed: (input.seed as number) ?? -1,
            sourceImage: sourceImage || undefined,
          },
          wan2gpStatus.url,
        );

        if (result.ok && result.videoUrl) {
          const port = new URL(wan2gpStatus.url).port || "7860";
          const canReachHDInternal = await sandboxExec(
            `curl -sL --connect-timeout 2 http://host.docker.internal:${port}/ 2>/dev/null | head -c 20`,
            "/workspace",
            5,
          );
          const sandboxHost =
            canReachHDInternal.exitCode === 0 ? "host.docker.internal" : "172.17.0.1";
          const downloadCmd = buildWan2GPDownloadCommand(result.videoUrl, outPath, sandboxHost);
          const copyResult = await sandboxExec(downloadCmd, "/workspace", 65);
          if (copyResult.stdout.includes("OK")) {
            return `🎬 Video generated: ${outPath}\nBackend: WanGP (${model}) | Duration: ${duration}s @ ${fps}fps | Size: ${width}×${height}${result.duration ? ` | Time: ${result.duration}s` : ""}${sourceImage ? `\nSource: ${sourceImage}` : ""}`;
          }
          return `🎬 Video generated in WanGP: ${result.videoPath ?? "output"}\nDownload: ${result.videoUrl}\nBackend: WanGP (${model}) | Duration: ${duration}s @ ${fps}fps | Size: ${width}×${height}`;
        }
        if (result.error) {
          return `❌ WanGP video generation failed: ${result.error}\n\nThe WanGP server is running at ${wan2gpStatus.url} but returned an error.\nTry checking the WanGP web UI to verify the model is loaded and configured.`;
        }
      }

      // ComfyUI AnimateDiff fallback (with motion model auto-download)
      touchContainer("comfyui");
      const comfyStatus = await getComfyUIStatus();

      if (!comfyStatus.running) {
        return `⚠️ No video generation backend available.\n\n**Option 1 (Recommended):** Start WanGP for high-quality Wan 2.2 video:\n  container_manage action="start" container_type="wan2gp"\n\n**Option 2:** Start ComfyUI for AnimateDiff video:\n  container_manage action="start" container_type="comfyui"\n\nWanGP produces dramatically better video and is easier to use.`;
      }

      const comfyUrl = comfyStatus.url;
      const adWidth = Math.min(width, 512);
      const adHeight = Math.min(height, 512);
      const adFps = Math.min(fps, 8);

      const [installedCheckpoints, installedMotionModels] = await Promise.all([
        discoverCheckpoints(comfyUrl),
        discoverMotionModels(comfyUrl),
      ]);

      let checkpoint = findSD15Checkpoint(installedCheckpoints);
      if (!checkpoint) {
        if (installedCheckpoints.length > 0) {
          checkpoint = installedCheckpoints[0];
        } else {
          return `⚠️ No checkpoints installed in ComfyUI.\n\nFor better results, start WanGP instead:\n  container_manage action="start" container_type="wan2gp"`;
        }
      }

      let motionModel = findBestMotionModel(installedMotionModels);
      if (!motionModel) {
        const downloadModel = "mm_sd_v15_v2.ckpt";
        const downloadCmd = getMotionModelDownloadCommand(downloadModel);
        const containerCheck = await sandboxExec(
          `docker ps --filter "label=hoc.service=comfyui" --filter "status=running" --format "{{.Names}}" 2>/dev/null | head -1`,
          "/workspace",
          5,
        );
        let containerName = containerCheck.stdout.trim();
        if (!containerName) {
          const nameCheck = await sandboxExec(
            `docker ps --filter "name=hoc-comfyui" --filter "status=running" --format "{{.Names}}" 2>/dev/null | head -1`,
            "/workspace",
            5,
          );
          containerName = nameCheck.stdout.trim();
        }
        if (containerName) {
          const dlResult = await sandboxExec(
            `docker exec ${containerName} bash -c '${downloadCmd.replace(/'/g, "'\\''")}' 2>&1`,
            "/workspace",
            300,
          );
          if (dlResult.exitCode === 0) {
            motionModel = downloadModel;
          } else {
            return `⚠️ Failed to download AnimateDiff motion model: ${dlResult.stderr.slice(0, 200)}\n\nFor easier video generation, use WanGP instead:\n  container_manage action="start" container_type="wan2gp"`;
          }
        } else {
          return `⚠️ Cannot find running ComfyUI container.\n\nFor easier video generation, use WanGP instead:\n  container_manage action="start" container_type="wan2gp"`;
        }
      }

      const frames = Math.max(8, Math.min(duration * adFps, 128));
      const { workflow } = buildAnimateDiffWorkflow({
        prompt,
        negativePrompt: negPrompt || undefined,
        width: adWidth,
        height: adHeight,
        fps: adFps,
        frames,
        checkpoint,
        motionModel,
      });

      const submitResult = await submitWorkflow(comfyUrl, workflow);
      if (!submitResult.ok || !submitResult.promptId) {
        return `❌ ComfyUI AnimateDiff failed: ${submitResult.error ?? "unknown error"}\n\nFor better video generation, use WanGP:\n  container_manage action="start" container_type="wan2gp"`;
      }

      const maxWaitMs = Math.max(60_000, duration * 30_000);
      const pollResult = await pollForCompletion(comfyUrl, submitResult.promptId, maxWaitMs, 5000);

      if (!pollResult.completed || !pollResult.outputs) {
        return `⏳ Video generation timed out. Check ComfyUI at ${comfyUrl}.\n\nFor faster, better video generation, use WanGP:\n  container_manage action="start" container_type="wan2gp"`;
      }

      const videoOut = extractVideoOutput(pollResult.outputs);
      if (!videoOut) {
        return `⚠️ Video generated but could not extract output. Check ComfyUI at ${comfyUrl}.`;
      }

      const viewUrl = buildViewUrl(comfyUrl, videoOut);
      let sandboxViewUrl = viewUrl;
      if (viewUrl.includes("127.0.0.1") || viewUrl.includes("localhost")) {
        const port = new URL(comfyUrl).port || "8188";
        const canReachHDInternal = await sandboxExec(
          `curl -sL --connect-timeout 2 http://host.docker.internal:${port}/system_stats 2>/dev/null`,
          "/workspace",
          5,
        );
        const sandboxHost =
          canReachHDInternal.exitCode === 0 ? "host.docker.internal" : "172.17.0.1";
        sandboxViewUrl = viewUrl.replace(/127\.0\.0\.1|localhost/, sandboxHost);
      }

      const copyResult = await sandboxExec(
        `curl -sL '${sandboxViewUrl}' -o '${outPath}' -m 60 && echo 'OK'`,
        "/workspace",
        65,
      );

      if (copyResult.stdout.includes("OK")) {
        return `🎬 Video generated (AnimateDiff fallback): ${outPath}\nSize: ${adWidth}×${adHeight} @ ${adFps}fps | Frames: ${frames}\n\nTip: For much better quality, use WanGP:\n  container_manage action="start" container_type="wan2gp"`;
      }
      return `🎬 Video in ComfyUI: ${videoOut.filename}\nDownload from: ${comfyUrl}`;
    },

    tts_speak: async (input: ToolInput) => {
      touchContainer("comfyui");
      const text = (input.text as string) || "";
      if (!text) {
        return "Error: text is required";
      }
      const ttsModel = (input.model as string) || "turbo";
      const voiceRef = (input.voice_ref as string) || "";
      const language = (input.language as string) || "en";
      const outPath = (input.output_path as string) || "/workspace/speech.wav";
      const outFmt = (input.output_format as string) || "wav";
      const preferredProvider = (input.provider as string) || "chatterbox";

      try {
        const rpcPayload = JSON.stringify({
          method: "chatterbox.speak",
          params: { text, model: ttsModel, voice_ref: voiceRef || undefined, language },
        });
        const rpcResult = await sandboxExec(
          `curl -sL -X POST -H 'Content-Type: application/json' -d '${rpcPayload.replace(/'/g, "\\'")}' 'http://host.docker.internal:3000/rpc' -m 120`,
          "/workspace",
          130,
        );

        if (rpcResult.exitCode === 0 && !rpcResult.stdout.includes("error")) {
          const parsed = JSON.parse(rpcResult.stdout);
          if (parsed?.result?.audio_base64) {
            await sandboxExec(
              `echo '${parsed.result.audio_base64}' | base64 -d > ${outPath}`,
              "/workspace",
              10,
            );
            return `🔊 Speech generated: ${outPath}\nModel: ${ttsModel} | Length: ~${Math.ceil(text.length / 15)}s${voiceRef ? `\nVoice cloned from: ${voiceRef}` : ""}`;
          }
          if (parsed?.result?.file_path) {
            return `🔊 Speech generated: ${parsed.result.file_path}\nModel: ${ttsModel}${voiceRef ? `\nVoice cloned from: ${voiceRef}` : ""}`;
          }
        }
      } catch {
        /* fallthrough to CLI */
      }

      const cliResult = await sandboxExec(
        `python3 -c "
from chatterbox.tts import ChatterboxTTS
model = ChatterboxTTS.from_pretrained('${ttsModel}', device='cuda' if __import__('torch').cuda.is_available() else 'cpu')
wav = model.generate('${text.replace(/'/g, "\\'")}'  )
import torchaudio
torchaudio.save('${outPath}', wav.cpu(), 24000)
print('OK')
" 2>&1`,
        "/workspace",
        120,
      );

      if (cliResult.exitCode === 0 && cliResult.stdout.includes("OK")) {
        if (outFmt === "mp3") {
          await sandboxExec(
            `ffmpeg -i ${outPath} -y ${outPath.replace(".wav", ".mp3")} 2>/dev/null`,
            "/workspace",
            15,
          );
          return `🔊 Speech generated: ${outPath.replace(".wav", ".mp3")}\nModel: ${ttsModel}${voiceRef ? `\nVoice cloned from: ${voiceRef}` : ""}`;
        }
        return `🔊 Speech generated: ${outPath}\nModel: ${ttsModel}${voiceRef ? `\nVoice cloned from: ${voiceRef}` : ""}`;
      }

      // ── Fallback 2: Bark (hoc-plugin-bark) ───────────────────
      if (preferredProvider === "bark" || cliResult.exitCode !== 0) {
        const barkResult = await sandboxExec(
          `curl -sL -X POST -H 'Content-Type: application/json' -d '${JSON.stringify({ method: "bark.speak", params: { text, language } }).replace(/'/g, "'\\''")}' 'http://host.docker.internal:3000/rpc' -m 120`,
          "/workspace",
          130,
        );
        if (barkResult.exitCode === 0 && !barkResult.stdout.includes("error")) {
          try {
            const parsed = JSON.parse(barkResult.stdout);
            if (parsed?.result?.audio_base64) {
              await sandboxExec(
                `echo '${parsed.result.audio_base64}' | base64 -d > ${outPath}`,
                "/workspace",
                10,
              );
              return `🔊 Speech (Bark): ${outPath}\nLength: ~${Math.ceil(text.length / 15)}s`;
            }
          } catch {
            /* fall through */
          }
        }
      }

      // ── Fallback 3: Qwen3-TTS (hoc-plugin-qwen3-tts) ────────
      const qwenResult = await sandboxExec(
        `curl -sL -X POST -H 'Content-Type: application/json' -d '${JSON.stringify({ method: "tts.qwen3.speak", params: { text, language } }).replace(/'/g, "'\\''")}' 'http://host.docker.internal:3000/rpc' -m 120`,
        "/workspace",
        130,
      );
      if (qwenResult.exitCode === 0 && !qwenResult.stdout.includes("error")) {
        try {
          const parsed = JSON.parse(qwenResult.stdout);
          if (parsed?.result?.audio_base64) {
            await sandboxExec(
              `echo '${parsed.result.audio_base64}' | base64 -d > ${outPath}`,
              "/workspace",
              10,
            );
            return `🔊 Speech (Qwen3-TTS): ${outPath}`;
          }
        } catch {
          /* fall through */
        }
      }

      return `⚠️ TTS failed. Tried Chatterbox, Bark, Qwen3-TTS — all unavailable.\n\nActivate one of: hoc-plugin-chatterbox, hoc-plugin-bark, hoc-plugin-qwen3-tts\n\nError: ${cliResult.stderr.slice(0, 300)}`;
    },

    upscale_image: async (input: ToolInput) => {
      ensureWarmPoolSweep();
      touchContainer("comfyui");
      const imgPath = (input.image_path as string) || "";
      if (!imgPath) {
        return "Error: image_path is required";
      }
      const scaleFactor = (input.scale as number) || 4;
      const upModel = (input.model as string) || "realesrgan-x4";
      const outPath =
        (input.output_path as string) || imgPath.replace(/(\.\w+)$/, `_${scaleFactor}x$1`);

      let result = await sandboxExec(
        `realesrgan-ncnn-vulkan -i '${imgPath}' -o '${outPath}' -s ${scaleFactor} 2>&1 || echo 'NOT_INSTALLED'`,
        "/workspace",
        60,
      );

      if (result.stdout.includes("NOT_INSTALLED")) {
        result = await sandboxExec(
          `python3 -c "
from realesrgan import RealESRGANer
from basicsr.archs.rrdbnet_arch import RRDBNet
import cv2, numpy as np
model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=${scaleFactor})
upsampler = RealESRGANer(scale=${scaleFactor}, model_path=None, model=model, half=True)
img = cv2.imread('${imgPath}', cv2.IMREAD_UNCHANGED)
output, _ = upsampler.enhance(img, outscale=${scaleFactor})
cv2.imwrite('${outPath}', output)
print('OK')
" 2>&1`,
          "/workspace",
          120,
        );

        if (result.exitCode !== 0 || !result.stdout.includes("OK")) {
          result = await sandboxExec(
            `python3 -c "
from PIL import Image
img = Image.open('${imgPath}')
w, h = img.size
new = img.resize((w*${scaleFactor}, h*${scaleFactor}), Image.LANCZOS)
new.save('${outPath}')
print(f'OK {w*${scaleFactor}}x{h*${scaleFactor}}')
"`,
            "/workspace",
            30,
          );
          if (result.exitCode === 0) {
            return `🔍 Image upscaled (Lanczos): ${outPath}\nMethod: Pillow LANCZOS (install realesrgan for AI upscaling)\nScale: ${scaleFactor}x`;
          }
          return `Upscale failed: ${result.stderr.slice(0, 300)}`;
        }
      }

      return `🔍 Image upscaled: ${outPath}\nModel: ${upModel} | Scale: ${scaleFactor}x`;
    },

    cuda_check: async (_input: ToolInput) => {
      // Query the gateway GPU status RPC (which uses nvidia-smi on the HOST, not the sandbox)
      const status = await getComfyUIStatus();
      const gpu = status.gpu;

      if (!gpu.available) {
        // Fallback: try nvidia-smi inside sandbox as last resort
        const result = await sandboxExec(
          `nvidia-smi 2>/dev/null || echo "NO_GPU"`,
          "/workspace",
          15,
        );
        if (!result.stdout.includes("NO_GPU") && result.exitCode === 0) {
          return `🖥️ **GPU Status** (sandbox-local)\n\`\`\`\n${result.stdout.slice(0, 4000)}\n\`\`\``;
        }

        return `🖥️ **GPU Status**: ${gpu.error ?? "No NVIDIA GPU detected on the gateway host."}\n\n**ComfyUI**: ${status.running ? `✅ Running at ${status.url}` : "❌ Not running"}\n**Docker**: ${status.dockerAvailable ? "✅ Available" : "❌ Not available"}\n${status.containerName ? `**Container**: ${status.containerName} (${status.containerStatus})` : ""}\n\nOptions for GPU inference:\n- Start ComfyUI: use \`container_manage\` with action "start" and container_type "comfyui"\n- Use NVIDIA NIM cloud API (already configured as a provider)\n- Use Groq cloud API (fast inference, free tier)`;
      }

      return `🖥️ **GPU Status**: ✅ **${gpu.name}** detected\n- **VRAM**: ${gpu.vram}\n- **Driver**: ${gpu.driverVersion ?? "unknown"}\n- **Compute Capability**: ${gpu.cudaVersion ?? "unknown"}\n\n**ComfyUI**: ${status.running ? `✅ Running at ${status.url}` : "❌ Not running — use container_manage to start"}\n**Docker**: ${status.dockerAvailable ? "✅ Available" : "❌ Not available"}\n${status.containerName ? `**Container**: ${status.containerName} (${status.containerStatus})` : ""}\n\nModels installed: ${status.installedModels.length}\nModels available: ${status.availableDownloads.length}\n\n💡 Use \`image_generate\` or \`video_generate\` to create AI media with this GPU.`;
    },

    deerflow_research: async (input: ToolInput) => {
      const researchTask = (input.task as string) || "";
      if (!researchTask) {
        return "Error: task is required";
      }
      const researchMode = (input.mode as string) || "standard";
      const researchFormat = (input.output_format as string) || "markdown";
      const savePath = (input.save_path as string) || "";

      const healthCheck = await sandboxExec(
        "curl -sL --connect-timeout 3 http://host.docker.internal:2026/api/health 2>/dev/null || curl -sL --connect-timeout 3 http://172.17.0.1:2026/api/health 2>/dev/null || echo 'DEERFLOW_DOWN'",
        "/workspace",
        10,
      );

      if (healthCheck.stdout.includes("DEERFLOW_DOWN")) {
        return `⚠️ DeerFlow container is not running (port 2026).\n\n**To start DeerFlow:**\n1. Ensure the \`hoc-plugin-deerflow\` plugin is activated\n2. Run: \`docker compose -f plugins/docker-compose.plugins.yml up deerflow -d\`\n\n**Fallback**: Use \`web_search\` + \`ai_inference\` to do manual research:\n1. \`web_search\` → gather information\n2. \`ai_inference\` → synthesize into a report\n3. \`sandbox_write_file\` → save the report`;
      }

      const payload = JSON.stringify({
        task: researchTask,
        mode: researchMode,
        format: researchFormat,
      });
      const result = await sandboxExec(
        `curl -sL -X POST -H 'Content-Type: application/json' -d '${payload.replace(/'/g, "\\'")}' 'http://host.docker.internal:2026/api/research' --connect-timeout 5 -m 300`,
        "/workspace",
        300,
      );

      if (result.exitCode === 0 && result.stdout.trim()) {
        const report = result.stdout;
        if (savePath) {
          await sandboxWriteFile(savePath, report);
        }
        return `🦌 **DeerFlow Research Report** (${researchMode} mode)\n\n${report.slice(0, 12000)}${savePath ? `\n\n📄 Saved to: ${savePath}` : ""}`;
      }
      return `DeerFlow research failed: ${result.stderr.slice(0, 500)}`;
    },
  };
}

export const aiToolsSummary: ToolSummaryMap = {
  ai_inference: (input) =>
    `🤖 AI: ${((input.prompt as string) ?? "").slice(0, 60)} (${input.provider ?? "anthropic"})`,
  image_generate: (input) =>
    `🎨 Image: "${((input.prompt as string) ?? "").slice(0, 40)}" (${input.model ?? "flux-schnell"})`,
  video_generate: (input) =>
    `🎬 Video: "${((input.prompt as string) ?? "").slice(0, 40)}" (${input.model ?? "wan2.2"})`,
  tts_speak: (input) =>
    `🔊 TTS: "${((input.text as string) ?? "").slice(0, 40)}" (${input.model ?? "turbo"})`,
  upscale_image: (input) => `🔍 Upscale: ${input.image_path ?? "?"} (${input.scale ?? 4}x)`,
  cuda_check: () => `🖥️ GPU Check`,
  deerflow_research: (input) => `🦌 DeerFlow: "${((input.task as string) ?? "").slice(0, 40)}"`,
};
