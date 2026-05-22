/**
 * ImageStudio — Full-featured panels for:
 *   OmniGen, GLM-Image, SWITTI, KV-Edit, StoryDiffusion
 *
 * Each plugin wrapped in PluginShell (Generate | Models | Jobs | Logs).
 */

import { Image } from "lucide-react";
import { useState } from "react";
import { Card, Button, Alert } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";
import { PluginStudioLayout, type StudioPlugin } from "./PluginStudioLayout";

// ─── Helpers ──────────────────────────────────────────────────────

function PathInput({
  label,
  value,
  onChange,
  placeholder,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
        {label}
        {optional && <span className="normal-case font-normal opacity-60 ml-1">(optional)</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent"
      />
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  unit = "",
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-text-muted mb-1">
        <span className="font-semibold uppercase tracking-wide">{label}</span>
        <span className="font-mono">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

function ImageResult({ src }: { src?: string }) {
  if (!src) {
    return null;
  }
  return (
    <Card>
      <p className="text-xs font-semibold text-text-muted mb-2">Generated Image</p>
      <img src={src} alt="Generated" className="w-full rounded-xl border border-border" />
      <div className="flex gap-3 mt-2">
        <a href={src} download className="text-xs text-accent hover:underline">
          ↓ Download PNG
        </a>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-text-muted hover:text-accent"
        >
          ↗ Open full size
        </a>
      </div>
    </Card>
  );
}

// ─── OMNIGEN ──────────────────────────────────────────────────────

const OMNIGEN_MODELS = [
  {
    id: "omnigen-v1",
    name: "OmniGen v1 (Shitao Xiao)",
    sizeGb: 15.0,
    description: "Unified generation model — all tasks",
    downloaded: false,
    required: true,
  },
];

const OMNIGEN_TASKS = [
  { id: "text-to-image", label: "Text → Image", needsImages: 0 },
  { id: "subject-driven", label: "Subject-Driven", needsImages: 1 },
  { id: "identity-preserving", label: "Identity Preserving", needsImages: 1 },
  { id: "image-conditioned", label: "Image Conditioned", needsImages: 1 },
  { id: "image-editing", label: "Image Editing (instruct)", needsImages: 1 },
  { id: "multi-subject", label: "Multi-Subject", needsImages: 2 },
];

function OmniGenPanel() {
  const [task, setTask] = useState(OMNIGEN_TASKS[0]);
  const [prompt, setPrompt] = useState(
    "A majestic snow leopard sitting on a rocky mountain ledge, golden hour light, photorealistic",
  );
  const [inputImages, setInputImages] = useState(["", ""]);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(50);
  const [guidance, setGuidance] = useState(3.0);
  const [imgGuidance, setImgGuidance] = useState(1.6);
  const [offload, setOffload] = useState(true);
  const [loading, setLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  function setImg(i: number, v: string) {
    setInputImages((imgs) => {
      const n = [...imgs];
      n[i] = v;
      return n;
    });
  }

  async function generate() {
    if (!prompt.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setImageSrc("");
    const t0 = Date.now();
    try {
      const params: Record<string, unknown> = {
        prompt,
        task_type: task.id,
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: guidance,
        offload_model: offload,
      };
      if (task.needsImages >= 1 && inputImages[0]) {
        params.input_images = [inputImages[0]];
      }
      if (task.needsImages >= 2 && inputImages[1]) {
        params.input_images = [inputImages[0], inputImages[1]];
      }
      if (task.id !== "text-to-image") {
        params.img_guidance_scale = imgGuidance;
      }
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "omnigen.generate",
        params,
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setImageSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "omnigen.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "omnigen.generate", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-omnigen"
      displayName="OmniGen"
      description="Unified image generation — text-to-image, subject-driven, identity-preserving, image editing, multi-subject generation. All from one model. Requires 16GB+ VRAM (24GB+ without offload)."
      models={OMNIGEN_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        {/* Task selector */}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Task Type</label>
          <div className="flex flex-wrap gap-2">
            {OMNIGEN_TASKS.map((t) => (
              <button
type="button"                 key={t.id}
                onClick={() => setTask(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${task.id === t.id ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="A photorealistic portrait of a woman in a futuristic city at night..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        {task.needsImages > 0 && (
          <Card className="space-y-3">
            <PathInput
              label="Input Image 1"
              value={inputImages[0]}
              onChange={(v) => setImg(0, v)}
              placeholder="/path/to/input1.jpg"
            />
            {task.needsImages > 1 && (
              <PathInput
                label="Input Image 2"
                value={inputImages[1]}
                onChange={(v) => setImg(1, v)}
                placeholder="/path/to/input2.jpg"
              />
            )}
          </Card>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider
              label="Width"
              min={256}
              max={2048}
              step={64}
              value={width}
              onChange={setWidth}
              unit="px"
            />
            <Slider
              label="Height"
              min={256}
              max={2048}
              step={64}
              value={height}
              onChange={setHeight}
              unit="px"
            />
          </Card>
          <Card className="space-y-3">
            <Slider label="Steps" min={10} max={100} step={5} value={steps} onChange={setSteps} />
            <Slider
              label="Guidance"
              min={1}
              max={10}
              step={0.5}
              value={guidance}
              onChange={setGuidance}
            />
            {task.id !== "text-to-image" && (
              <Slider
                label="Image Guidance"
                min={0.5}
                max={3.0}
                step={0.1}
                value={imgGuidance}
                onChange={setImgGuidance}
              />
            )}
          </Card>
        </div>
        <Card>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={offload}
              onChange={(e) => setOffload(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm text-text-secondary">
              Offload model to CPU (saves VRAM, slower)
            </span>
          </label>
        </Card>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Image size={14} />}
          className="w-full"
          disabled={!prompt.trim()}
        >
          Generate
        </Button>
        <ImageResult src={imageSrc} />
      </div>
    </PluginShell>
  );
}

// ─── GLM-IMAGE ────────────────────────────────────────────────────

const GLM_MODELS = [
  {
    id: "glm-image-9b-ar",
    name: "GLM-Image 9B AR",
    sizeGb: 18.0,
    description: "Autoregressive model (9B)",
    downloaded: false,
    required: true,
  },
  {
    id: "glm-image-7b-dit",
    name: "GLM-Image 7B DiT",
    sizeGb: 14.0,
    description: "Diffusion transformer (7B)",
    downloaded: false,
  },
];

const GLM_TASKS = [
  "text-to-image",
  "image-to-image",
  "style-transfer",
  "identity-preserving",
  "text-rendering",
];
const GLM_STYLES = [
  "realistic",
  "anime",
  "oil-painting",
  "watercolor",
  "cinematic",
  "sketch",
  "3d-render",
  "pixel-art",
  "neon",
  "vintage",
];

function GLMImagePanel() {
  const [task, setTask] = useState("text-to-image");
  const [prompt, setPrompt] = useState(
    "A serene Japanese garden with cherry blossoms, koi pond, traditional lanterns at dusk, hyperrealistic",
  );
  const [inputImage, setInputImage] = useState("");
  const [style, setStyle] = useState("realistic");
  const [steps, setSteps] = useState(50);
  const [guidance, setGuidance] = useState(7.5);
  const [imageStrength, setImageStrength] = useState(0.8);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [loading, setLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function generate() {
    if (!prompt.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setImageSrc("");
    const t0 = Date.now();
    try {
      const params: Record<string, unknown> = {
        prompt,
        task_type: task,
        style,
        num_inference_steps: steps,
        guidance_scale: guidance,
        width,
        height,
      };
      if (task !== "text-to-image" && inputImage) {
        params.image_path = inputImage;
        params.image_strength = imageStrength;
      }
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "glm-image.generate",
        params,
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setImageSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "glm-image.generate",
          durationMs: Date.now() - t0,
          success: true,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "glm-image.generate",
          durationMs: Date.now() - t0,
          success: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-glm-image"
      displayName="GLM-Image"
      description="GLM-Image (9B AR + 7B DiT): text-to-image, image-to-image, style transfer, identity-preserving generation, and text rendering. Requires 80GB+ VRAM (single GPU) or multi-GPU."
      models={GLM_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {GLM_TASKS.map((t) => (
            <button
type="button"               key={t}
              onClick={() => setTask(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${task === t ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        {task !== "text-to-image" && (
          <Card className="space-y-3">
            <PathInput
              label="Input Image"
              value={inputImage}
              onChange={setInputImage}
              placeholder="/path/to/image.jpg"
            />
            <Slider
              label="Image Strength"
              min={0.1}
              max={1.0}
              step={0.05}
              value={imageStrength}
              onChange={setImageStrength}
            />
          </Card>
        )}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Style</label>
          <div className="flex flex-wrap gap-1">
            {GLM_STYLES.map((s) => (
              <button
type="button"                 key={s}
                onClick={() => setStyle(s)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${style === s ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider
              label="Width"
              min={256}
              max={2048}
              step={64}
              value={width}
              onChange={setWidth}
              unit="px"
            />
            <Slider
              label="Height"
              min={256}
              max={2048}
              step={64}
              value={height}
              onChange={setHeight}
              unit="px"
            />
          </Card>
          <Card className="space-y-3">
            <Slider label="Steps" min={10} max={100} step={5} value={steps} onChange={setSteps} />
            <Slider
              label="Guidance"
              min={1}
              max={15}
              step={0.5}
              value={guidance}
              onChange={setGuidance}
            />
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Image size={14} />}
          className="w-full"
          disabled={!prompt.trim()}
        >
          Generate
        </Button>
        <ImageResult src={imageSrc} />
      </div>
    </PluginShell>
  );
}

// ─── SWITTI ───────────────────────────────────────────────────────

const SWITTI_MODELS = [
  {
    id: "switti-1b",
    name: "Switti 1B",
    sizeGb: 4.0,
    description: "Scale-wise transformer — fast T2I",
    downloaded: false,
    required: true,
  },
  {
    id: "switti-vae",
    name: "VQVAE",
    sizeGb: 0.8,
    description: "Required token decoder",
    downloaded: false,
    required: true,
  },
];

function SwittiPanel() {
  const [prompt, setPrompt] = useState(
    "An astronaut surfing a neon wave in space, digital art, vivid colors, 8K",
  );
  const [negPrompt, setNegPrompt] = useState("blurry, deformed, low quality, ugly");
  const [cfg, setCfg] = useState(4.0);
  const [topP, setTopP] = useState(0.96);
  const [topK, setTopK] = useState(900);
  const [more2BHP, setMore2BHP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function generate() {
    if (!prompt.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setImageSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "switti.generate",
        params: {
          prompt,
          negative_prompt: negPrompt,
          cfg_scale: cfg,
          top_p: topP,
          top_k: topK,
          more_smooth: more2BHP,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setImageSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "switti.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "switti.generate", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-switti"
      displayName="Switti"
      description="CVPR 2025 — scale-wise transformer for fast text-to-image. Outperforms existing T2I AR models while competing with diffusion models. 8GB VRAM. Uses top-p and top-k sampling."
      models={SWITTI_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Negative Prompt
          </label>
          <input
            type="text"
            value={negPrompt}
            onChange={(e) => setNegPrompt(e.target.value)}
            className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider label="CFG Scale" min={1} max={10} step={0.5} value={cfg} onChange={setCfg} />
            <Slider label="Top-K" min={100} max={2000} step={100} value={topK} onChange={setTopK} />
          </Card>
          <Card className="space-y-3">
            <Slider label="Top-P" min={0.5} max={1.0} step={0.01} value={topP} onChange={setTopP} />
            <label className="flex items-center gap-2 cursor-pointer mt-3">
              <input
                type="checkbox"
                checked={more2BHP}
                onChange={(e) => setMore2BHP(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-text-secondary">Smooth (more_smooth)</span>
            </label>
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Image size={14} />}
          className="w-full"
          disabled={!prompt.trim()}
        >
          Generate
        </Button>
        <ImageResult src={imageSrc} />
      </div>
    </PluginShell>
  );
}

// ─── KV-EDIT ──────────────────────────────────────────────────────

const KVEDIT_MODELS = [
  {
    id: "flux-dev",
    name: "FLUX.1-dev",
    sizeGb: 23.8,
    description: "Required base model (FLUX DiT)",
    downloaded: false,
    required: true,
  },
  {
    id: "flux-vae",
    name: "FLUX VAE",
    sizeGb: 0.3,
    description: "Required image encoder/decoder",
    downloaded: false,
    required: true,
  },
  {
    id: "t5-xxl",
    name: "T5-XXL (text encoder)",
    sizeGb: 9.4,
    description: "Required for text encoding",
    downloaded: false,
    required: true,
  },
  {
    id: "clip-l",
    name: "CLIP-L (text encoder)",
    sizeGb: 0.2,
    description: "Required for text encoding",
    downloaded: false,
    required: true,
  },
];

const KVEDIT_OPERATIONS = [
  "add-object",
  "remove-object",
  "replace-object",
  "change-background",
  "change-style",
  "colorize",
  "other",
];

function KVEditPanel() {
  const [imagePath, setImagePath] = useState("");
  const [mask, setMask] = useState("");
  const [instruction, setInstruction] = useState("Replace the cat with a golden retriever puppy");
  const [operation, setOperation] = useState("replace-object");
  const [strength, setStrength] = useState(0.75);
  const [steps, setSteps] = useState(28);
  const [guidance, setGuidance] = useState(3.5);
  const [kvScale, setKvScale] = useState(0.6);
  const [loading, setLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function generate() {
    if (!imagePath.trim() || !instruction.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setImageSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "kvedit.generate",
        params: {
          image_path: imagePath,
          mask_path: mask || undefined,
          instruction,
          operation,
          edit_strength: strength,
          num_steps: steps,
          guidance_scale: guidance,
          kv_scale: kvScale,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setImageSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "kvedit.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "kvedit.generate", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-kv-edit"
      displayName="KV-Edit"
      description="ICCV 2025 — training-free image editing via KV Cache manipulation in FLUX DiT. Precisely adds, removes, or replaces objects while preserving background with zero re-training. 24GB VRAM."
      models={KVEDIT_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {KVEDIT_OPERATIONS.map((op) => (
            <button
type="button"               key={op}
              onClick={() => setOperation(op)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${operation === op ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {op}
            </button>
          ))}
        </div>
        <Card className="space-y-3">
          <PathInput
            label="Input Image"
            value={imagePath}
            onChange={setImagePath}
            placeholder="/path/to/image.jpg"
          />
          <PathInput
            label="Mask Image"
            value={mask}
            onChange={setMask}
            placeholder="/path/to/mask.png (white=edit, black=preserve)"
            optional
          />
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Edit Instruction
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              placeholder="Replace the cat with a golden retriever puppy..."
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
            />
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider
              label="Edit Strength"
              min={0.1}
              max={1.0}
              step={0.05}
              value={strength}
              onChange={setStrength}
            />
            <Slider
              label="Diffusion Steps"
              min={10}
              max={50}
              step={1}
              value={steps}
              onChange={setSteps}
            />
          </Card>
          <Card className="space-y-3">
            <Slider
              label="Guidance Scale"
              min={1}
              max={10}
              step={0.5}
              value={guidance}
              onChange={setGuidance}
            />
            <Slider
              label="KV Cache Scale"
              min={0.0}
              max={1.0}
              step={0.05}
              value={kvScale}
              onChange={setKvScale}
            />
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Image size={14} />}
          className="w-full"
          disabled={!imagePath.trim() || !instruction.trim()}
        >
          Edit Image
        </Button>
        {imageSrc && (
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-xs text-text-muted mb-2">Original</p>
              <img
                src={`/republic-output/${imagePath}`}
                alt="Original"
                className="w-full rounded-xl border border-border"
              />
            </Card>
            <ImageResult src={imageSrc} />
          </div>
        )}
      </div>
    </PluginShell>
  );
}

// ─── STORYDIFFUSION ───────────────────────────────────────────────

const STORY_MODELS = [
  {
    id: "sdxl-base",
    name: "Stable Diffusion XL Base",
    sizeGb: 6.9,
    description: "Required base model",
    downloaded: false,
    required: true,
  },
  {
    id: "photomaker-v2",
    name: "PhotoMaker v2",
    sizeGb: 2.8,
    description: "Character identity encoder",
    downloaded: false,
    required: true,
  },
  {
    id: "sdxl-refiner",
    name: "SDXL Refiner",
    sizeGb: 6.1,
    description: "Optional quality refiner",
    downloaded: false,
  },
];

function StoryDiffusionPanel() {
  const [story, setStory] = useState(
    "Panel 1: A young explorer named Aria discovers a glowing portal in the forest.\nPanel 2: She bravely steps through and finds herself in a crystal kingdom.\nPanel 3: The crystal queen welcomes Aria with a luminous crown.\nPanel 4: Together they embark on a quest to restore the shattered crystal sun.",
  );
  const [characterRef, setCharacterRef] = useState("");
  const [numPanels, setNumPanels] = useState(4);
  const [style, setStyle] = useState("comic-book");
  const [guidance, setGuidance] = useState(7.5);
  const [steps, setSteps] = useState(50);
  const [charWeight, setCharWeight] = useState(1.0);
  const [outputMode, setOutputMode] = useState<"panels" | "video">("panels");
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  const STYLES = [
    "comic-book",
    "realistic",
    "anime",
    "watercolor",
    "oil-painting",
    "sketch",
    "3d-cartoon",
  ];

  async function generate() {
    if (!story.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setImages([]);
    setVideoSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "storydiffusion.generate",
        params: {
          story_text: story,
          character_image: characterRef || undefined,
          num_panels: numPanels,
          style,
          guidance_scale: guidance,
          num_steps: steps,
          character_weight: charWeight,
          output_mode: outputMode,
        },
      })) as { result?: { outputPaths?: string[]; videoPath?: string } };
      if (r?.result?.outputPaths) {
        setImages(r.result.outputPaths.map((p) => `/republic-output/${p}`));
      }
      if (r?.result?.videoPath) {
        setVideoSrc(`/republic-output/${r.result.videoPath}`);
      }
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "storydiffusion.generate",
          durationMs: Date.now() - t0,
          success: true,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "storydiffusion.generate",
          durationMs: Date.now() - t0,
          success: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-storydiffusion"
      displayName="StoryDiffusion"
      description="NeurIPS 2024 — consistent character story generation. Creates comic panels or animated videos from text with character consistency maintained across all frames. 10GB VRAM."
      models={STORY_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Story Script (one panel per line)
          </label>
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            rows={6}
            placeholder={
              "Panel 1: Description of first scene...\nPanel 2: What happens next...\nPanel 3: Climax of the story...\nPanel 4: Resolution..."
            }
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none font-mono"
          />
        </Card>
        <PathInput
          label="Character Reference Image"
          value={characterRef}
          onChange={setCharacterRef}
          placeholder="/path/to/character.jpg (face photo for identity preservation)"
          optional
        />
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider
              label="Num Panels"
              min={2}
              max={12}
              step={1}
              value={numPanels}
              onChange={setNumPanels}
            />
            <Slider
              label="Character Weight"
              min={0.1}
              max={2.0}
              step={0.1}
              value={charWeight}
              onChange={setCharWeight}
            />
          </Card>
          <Card className="space-y-3">
            <Slider label="Steps" min={20} max={100} step={5} value={steps} onChange={setSteps} />
            <Slider
              label="Guidance"
              min={1}
              max={15}
              step={0.5}
              value={guidance}
              onChange={setGuidance}
            />
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Style</label>
            <div className="flex flex-wrap gap-1">
              {STYLES.map((s) => (
                <button
type="button"                   key={s}
                  onClick={() => setStyle(s)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${style === s ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Output Mode</label>
            {(["panels", "video"] as const).map((m) => (
              <button
type="button"                 key={m}
                onClick={() => setOutputMode(m)}
                className={`block w-full mb-1 py-1.5 rounded-lg text-xs font-medium text-left px-3 transition-colors ${outputMode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {m === "panels" ? "🖼️ Image Panels" : "🎬 Animated Video"}
              </button>
            ))}
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Image size={14} />}
          className="w-full"
          disabled={!story.trim()}
        >
          Generate Story
        </Button>
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {images.map((src, i) => (
              <Card key={i}>
                <p className="text-xs text-text-muted mb-1">Panel {i + 1}</p>
                <img
                  src={src}
                  alt={`Panel ${i + 1}`}
                  className="w-full rounded-xl border border-border"
                />
              </Card>
            ))}
          </div>
        )}
        {videoSrc && (
          <Card>
            <p className="text-xs text-text-muted mb-2">Story Video</p>
            <video controls className="w-full rounded-xl border border-border" src={videoSrc} />
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ─── Layout ───────────────────────────────────────────────────────

const IMAGE_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-omnigen",
    name: "OmniGen",
    icon: "🌐",
    description: "Unified T2I, subject-driven, identity-preserving, image editing — one model",
    status: "active",
  },
  {
    id: "hoc-plugin-glm-image",
    name: "GLM-Image",
    icon: "🎨",
    description: "GLM 9B AR + 7B DiT — text rendering, style transfer, identity-preserving",
    status: "active",
  },
  {
    id: "hoc-plugin-switti",
    name: "Switti",
    icon: "⚡",
    description: "CVPR 2025 scale-wise transformer — fast T2I, 8GB VRAM",
    status: "active",
  },
  {
    id: "hoc-plugin-kv-edit",
    name: "KV-Edit",
    icon: "✏️",
    description: "ICCV 2025 — training-free FLUX image editing, background preservation",
    status: "active",
  },
  {
    id: "hoc-plugin-storydiffusion",
    name: "StoryDiffusion",
    icon: "📖",
    description: "NeurIPS 2024 — consistent character comic panels + animated video",
    status: "active",
  },
];

function renderImagePanel(id: string) {
  switch (id) {
    case "hoc-plugin-omnigen":
      return <OmniGenPanel />;
    case "hoc-plugin-glm-image":
      return <GLMImagePanel />;
    case "hoc-plugin-switti":
      return <SwittiPanel />;
    case "hoc-plugin-kv-edit":
      return <KVEditPanel />;
    case "hoc-plugin-storydiffusion":
      return <StoryDiffusionPanel />;
    default:
      return null;
  }
}

export function ImageStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Image Studio"
      categoryIcon={<Image size={16} />}
      plugins={IMAGE_PLUGINS}
      renderPanel={renderImagePanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
