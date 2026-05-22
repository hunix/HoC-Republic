/**
 * Execution Tools — ComfyUI Integration
 *
 * ComfyUI workflow builders, polling, output downloading,
 * generate and status executors.
 */

import type { ExecutionResult, ExecutionContext } from "../execution-types.js";
import { emitNationalEvent } from "../event-sourcing.js";
import { makeFailResult, makeSuccessResult } from "../execution-types.js";

// ─── ComfyUI Workflow Types ─────────────────────────────────────

type ComfyWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

// ─── Workflow Builders ──────────────────────────────────────────

export function buildComfyWorkflow(
  prompt: string,
  negative: string,
  model: string,
  opts: { width?: number; height?: number; steps?: number; seed?: number } = {},
): ComfyWorkflow {
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const lower = model.toLowerCase();

  // FLUX (Schnell / Dev)
  if (lower.includes("flux")) {
    const ckpt = lower.includes("dev")
      ? "flux1-dev-fp8.safetensors"
      : "flux1-schnell-fp8.safetensors";
    const steps = opts.steps ?? (lower.includes("dev") ? 20 : 4);
    return {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
      "4": {
        class_type: "EmptyLatentImage",
        inputs: { batch_size: 1, width: opts.width ?? 1024, height: opts.height ?? 1024 },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed,
          steps,
          cfg: 1.0,
          sampler_name: "euler",
          scheduler: "simple",
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": { class_type: "SaveImage", inputs: { filename_prefix: "HoC_FLUX", images: ["6", 0] } },
    };
  }

  // SDXL
  if (lower.includes("sdxl") || lower.includes("xl")) {
    return {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
      },
      "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
      "4": {
        class_type: "EmptyLatentImage",
        inputs: { batch_size: 1, width: opts.width ?? 1024, height: opts.height ?? 1024 },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed,
          steps: opts.steps ?? 25,
          cfg: 7,
          sampler_name: "euler_ancestral",
          scheduler: "normal",
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": { class_type: "SaveImage", inputs: { filename_prefix: "HoC_SDXL", images: ["6", 0] } },
    };
  }

  // LTX Video
  if (lower.includes("ltx") || lower.includes("video")) {
    return {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "ltx-video-2b-v0.9.1.safetensors" },
      },
      "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
      "4": {
        class_type: "EmptyLatentImage",
        inputs: { batch_size: 16, width: opts.width ?? 512, height: opts.height ?? 512 },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed,
          steps: opts.steps ?? 30,
          cfg: 6,
          sampler_name: "euler",
          scheduler: "normal",
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": {
        class_type: "SaveImage",
        inputs: { filename_prefix: "HoC_LTXVideo", images: ["6", 0] },
      },
    };
  }

  // Default: SD 1.5
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "v1-5-pruned-emaonly.safetensors" },
    },
    "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { batch_size: 1, width: opts.width ?? 512, height: opts.height ?? 512 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: opts.steps ?? 20,
        cfg: 8,
        sampler_name: "euler",
        scheduler: "normal",
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { filename_prefix: "HoC_SD15", images: ["6", 0] } },
  };
}

export function buildComfyVideoWorkflow(
  prompt: string,
  _durationSec: number,
): Record<string, unknown> {
  return {
    "1": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "ltx-video-2b-v0.9.5.safetensors" },
    },
    "3": { class_type: "EmptyLatentImage", inputs: { width: 832, height: 480, batch_size: 1 } },
    "4": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["2", 0],
        positive: ["1", 0],
        negative: ["5", 0],
        latent_image: ["3", 0],
      },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: "text, watermark, ugly, blurry, low quality", clip: ["2", 0] },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["4", 0], vae: ["2", 2] } },
    "7": { class_type: "SaveImage", inputs: { filename_prefix: "hoc_video", images: ["6", 0] } },
  };
}

// ─── Polling & Download Helpers ─────────────────────────────────

export async function pollComfyHistory(
  apiUrl: string,
  promptId: string,
  timeoutMs = 300_000,
  intervalMs = 5_000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiUrl}/history/${promptId}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, Record<string, unknown>>;
        const entry = data[promptId];
        if (entry && entry.outputs) {
          return entry;
        }
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export async function downloadComfyOutput(
  apiUrl: string,
  filename: string,
  subfolder: string,
  type: string,
): Promise<{ localPath: string; sizeBytes: number } | null> {
  const { existsSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const outDir = join(process.cwd(), "republic-output", "comfyui");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const uniqueName = `${Date.now().toString(36)}_${filename}`;
  const destPath = join(outDir, uniqueName);

  try {
    const url = `${apiUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(destPath, buffer);
    return { localPath: `comfyui/${uniqueName}`, sizeBytes: buffer.byteLength };
  } catch {
    return null;
  }
}

// ─── comfyui_generate ───────────────────────────────────────────

export async function executeComfyuiGenerate(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const prompt = String(args.prompt ?? "");
  if (!prompt) {
    return makeFailResult("comfyui_generate", ctx, start, "Prompt required");
  }

  const negative = String(args.negative ?? "text, watermark, ugly, blurry, low quality");
  const model = String(args.model ?? "sd15");
  const width = typeof args.width === "number" ? args.width : undefined;
  const height = typeof args.height === "number" ? args.height : undefined;
  const steps = typeof args.steps === "number" ? args.steps : undefined;

  try {
    const { ensureComfyUI, getComfyUIStatus: getStatus } = await import("../comfyui-manager.js");
    const init = await ensureComfyUI();
    if (init.error) {
      throw new Error(init.error);
    }

    const workflow = buildComfyWorkflow(prompt, negative, model, { width, height, steps });

    let COMFYUI_API = process.env.COMFYUI_API_URL ?? "";
    if (!COMFYUI_API) {
      const comfyStatus = await getStatus();
      COMFYUI_API = comfyStatus.url || "http://127.0.0.1:8188";
    }
    const res = await fetch(`${COMFYUI_API}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`ComfyUI API error: ${errText}`);
    }
    const data = (await res.json()) as { prompt_id: string };
    const promptId = data.prompt_id;

    emitNationalEvent("infrastructure", "comfyui_generation_started", ctx.citizenId, {
      prompt_id: promptId,
      prompt,
      model,
    });

    const history = await pollComfyHistory(COMFYUI_API, promptId, 300_000, 5_000);

    if (!history) {
      return makeSuccessResult(
        "comfyui_generate",
        ctx,
        start,
        `Generation dispatched to ComfyUI (model: ${model}).\nPrompt ID: ${promptId}\n⏳ Timed out waiting for completion (5 min). The job may still be running.\nUse comfyui_status to check, or look in the ComfyUI output folder.`,
        [],
      );
    }

    const outputs = history.outputs as
      | Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>
      | undefined;
    if (!outputs) {
      return makeSuccessResult(
        "comfyui_generate",
        ctx,
        start,
        `Generation completed but no outputs found.\nPrompt ID: ${promptId}`,
        [],
      );
    }

    const downloadedFiles: string[] = [];
    const fileDownloadTags: string[] = [];

    for (const nodeOutput of Object.values(outputs)) {
      for (const img of nodeOutput.images ?? []) {
        const downloaded = await downloadComfyOutput(
          COMFYUI_API,
          img.filename,
          img.subfolder ?? "",
          img.type ?? "output",
        );
        if (downloaded) {
          downloadedFiles.push(downloaded.localPath);
          const sizeStr =
            downloaded.sizeBytes > 1_000_000
              ? `${(downloaded.sizeBytes / 1_000_000).toFixed(1)} MB`
              : `${(downloaded.sizeBytes / 1_000).toFixed(0)} KB`;
          const servePath = `/republic-output/${downloaded.localPath}`;
          fileDownloadTags.push(
            `<file_download url="${servePath}" filename="${img.filename}" size="${sizeStr}" />`,
          );
        }
      }
    }

    const durationSec = ((Date.now() - start) / 1000).toFixed(1);
    const outputSummary =
      downloadedFiles.length > 0
        ? `✅ Generation complete (${durationSec}s, model: ${model}).\n\n${fileDownloadTags.join("\n")}\n\n![Generated output](${`/republic-output/${downloadedFiles[0]}`})`
        : `✅ Generation complete (${durationSec}s) but no output files were downloadable.\nPrompt ID: ${promptId}`;

    emitNationalEvent("infrastructure", "comfyui_generation_complete", ctx.citizenId, {
      prompt_id: promptId,
      files: downloadedFiles,
      durationMs: Date.now() - start,
    });

    return makeSuccessResult("comfyui_generate", ctx, start, outputSummary, downloadedFiles);
  } catch (err) {
    return makeFailResult(
      "comfyui_generate",
      ctx,
      start,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── comfyui_status ─────────────────────────────────────────────

export async function executeComfyuiStatus(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { getComfyUIStatus } = await import("../comfyui-manager.js");
    const status = await getComfyUIStatus();
    return makeSuccessResult(
      "comfyui_status",
      ctx,
      start,
      `ComfyUI Status:\nRunning: ${status.running}\nGPU: ${status.gpu.name} (${status.gpu.vram})\nModels Installed: ${status.installedModels.length}`,
      [],
    );
  } catch (err) {
    return makeFailResult(
      "comfyui_status",
      ctx,
      start,
      err instanceof Error ? err.message : String(err),
    );
  }
}
