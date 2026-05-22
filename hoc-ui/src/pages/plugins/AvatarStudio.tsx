import { User } from "lucide-react";
/**
 * AvatarStudio — Full-featured panels for:
 *   DeepFaceLab, FaceFusion, DGM, StableAvatar, MagicAnimate
 */
import { useState } from "react";
import { Card, Button, Alert } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";
import { PluginStudioLayout, type StudioPlugin } from "./PluginStudioLayout";

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
function VideoResult({ src }: { src?: string }) {
  if (!src) {
    return null;
  }
  return (
    <Card>
      <p className="text-xs font-semibold text-text-muted mb-2">Output Video</p>
      <video controls className="w-full rounded-xl border border-border" src={src} />
      <a href={src} download className="text-xs text-accent hover:underline mt-2 block">
        ↓ Download
      </a>
    </Card>
  );
}

// ── DeepFaceLab ──

const DFL_MODELS = [
  {
    id: "dfl-saehd",
    name: "SAEHD (High Quality)",
    sizeGb: 0.5,
    description: "Standard HQ face swap",
    downloaded: false,
    required: true,
  },
  {
    id: "dfl-amp",
    name: "AMP (Multi-Person)",
    sizeGb: 0.8,
    description: "Multi-person face handling",
    downloaded: false,
  },
  {
    id: "dfl-quick96",
    name: "Quick96 (Fast)",
    sizeGb: 0.3,
    description: "Rapid prototyping",
    downloaded: false,
  },
];

function DeepFaceLabPanel() {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [model, setModel] = useState("SAEHD");
  const [iterations, setIterations] = useState(10000);
  const [resolution, setResolution] = useState(128);
  const [enhance, setEnhance] = useState(true);
  const [aligned, setAligned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  const [stage, setStage] = useState("pipeline");

  async function run() {
    if (!source || !target) {
      return;
    }
    setLoading(true);
    setError("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: stage === "pipeline" ? "deepfacelab.createPipeline" : "deepfacelab.stages",
        params: {
          sourcePath: source,
          targetPath: target,
          model,
          iterations,
          resolution,
          areFacesAligned: aligned,
          enhanceFace: enhance,
          pipelineId: pipelineId || undefined,
          stage,
        },
      })) as { result?: { pipelineId?: string; outputPath?: string } };
      if (r?.result?.pipelineId) {
        setPipelineId(r.result.pipelineId);
      }
      if (r?.result?.outputPath) {
        setVideoSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: `deepfacelab.${stage}`,
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
          method: `deepfacelab.${stage}`,
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
      pluginId="hoc-plugin-deepfacelab"
      displayName="DeepFaceLab"
      description="Full pipeline: extract faces, sort, train SAEHD/AMP/Quick96, merge video. TF + CUDA. Ethical use — consent required."
      models={DFL_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="warning">⚠️ Consented subjects only. Misuse may be illegal.</Alert>
        <div className="flex flex-wrap gap-2">
          {["pipeline", "extract", "train", "merge"].map((s) => (
            <button
type="button"               key={s}
              onClick={() => setStage(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${stage === s ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <Card className="space-y-3">
          <PathInput
            label="Source Face"
            value={source}
            onChange={setSource}
            placeholder="/path/to/source.mp4"
          />
          <PathInput
            label="Target Media"
            value={target}
            onChange={setTarget}
            placeholder="/path/to/target.mp4"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Model</label>
            {["SAEHD", "AMP", "Quick96"].map((m) => (
              <button
type="button"                 key={m}
                onClick={() => setModel(m)}
                className={`block w-full mb-1 py-1.5 px-3 rounded-lg text-xs font-medium text-left transition-colors ${model === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {m}
              </button>
            ))}
          </Card>
          <Card className="space-y-3">
            <Slider
              label="Train Iterations"
              min={1000}
              max={100000}
              step={1000}
              value={iterations}
              onChange={setIterations}
            />
            <Slider
              label="Resolution"
              min={64}
              max={256}
              step={32}
              value={resolution}
              onChange={setResolution}
              unit="px"
            />
          </Card>
        </div>
        <Card>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={aligned}
                onChange={(e) => setAligned(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-text-secondary">Pre-aligned faces</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enhance}
                onChange={(e) => setEnhance(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-text-secondary">Enhance output</span>
            </label>
          </div>
        </Card>
        {pipelineId && (
          <Alert variant="success">
            Pipeline: <code className="font-mono text-xs">{pipelineId}</code>
          </Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          className="w-full"
          disabled={!source || !target}
        >
          Run {stage} Stage
        </Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── FaceFusion ──

const FF_MODELS = [
  {
    id: "inswapper_128",
    name: "InSwapper 128",
    sizeGb: 0.5,
    description: "Primary face swapper",
    downloaded: false,
    required: true,
  },
  {
    id: "gfpgan_1.4",
    name: "GFPGAN 1.4",
    sizeGb: 0.3,
    description: "Face enhancer/restorer",
    downloaded: false,
  },
  {
    id: "realesrgan_x2plus",
    name: "RealESRGAN x2+",
    sizeGb: 0.06,
    description: "Frame enhancer",
    downloaded: false,
  },
  {
    id: "face_colorizer",
    name: "DDCOLOR Colorizer",
    sizeGb: 0.1,
    description: "Colorize B&W faces",
    downloaded: false,
  },
  {
    id: "expression_restorer",
    name: "Expression Restorer",
    sizeGb: 0.2,
    description: "Restore natural expressions",
    downloaded: false,
  },
];
const FF_PROCS = [
  "face-swapper",
  "face-enhancer",
  "face-debugger",
  "frame-enhancer",
  "face-colorizer",
  "expression-restorer",
];

function FaceFusionPanel() {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [procs, setProcs] = useState<string[]>(["face-swapper"]);
  const [detector, setDetector] = useState("retinaface");
  const [quality, setQuality] = useState(90);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function submit() {
    if (!source || !target) {
      return;
    }
    setLoading(true);
    setError("");
    setVideoSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "facefusion.submit",
        params: {
          source_path: source,
          target_path: target,
          processors: procs,
          face_detector: detector,
          output_quality: quality,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setVideoSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "facefusion.submit", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "facefusion.submit",
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
      pluginId="hoc-plugin-facefusion"
      displayName="FaceFusion"
      description="Modular face manipulation pipeline. Combine processors — swap, enhance, colorize, restore expressions, frame enhance. Configurable detector (retinaface/yunet) and output quality."
      models={FF_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="warning">⚠️ Ethical use only. Consent required for all subjects.</Alert>
        <Card className="space-y-3">
          <PathInput
            label="Source Face"
            value={source}
            onChange={setSource}
            placeholder="/path/to/source.jpg"
          />
          <PathInput
            label="Target Media"
            value={target}
            onChange={setTarget}
            placeholder="/path/to/target.mp4"
          />
        </Card>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Processors (select multiple)
          </label>
          <div className="flex flex-wrap gap-2">
            {FF_PROCS.map((p) => {
              const on = procs.includes(p);
              return (
                <button
type="button"                   key={p}
                  onClick={() => setProcs(on ? procs.filter((x) => x !== p) : [...procs, p])}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${on ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Face Detector
            </label>
            {["retinaface", "yunet", "deface-yolov8"].map((d) => (
              <button
type="button"                 key={d}
                onClick={() => setDetector(d)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${detector === d ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {d}
              </button>
            ))}
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Output Quality
            </label>
            {[80, 90, 95, 100].map((q) => (
              <button
type="button"                 key={q}
                onClick={() => setQuality(q)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${quality === q ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {q}%
              </button>
            ))}
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void submit()}
          loading={loading}
          className="w-full"
          disabled={!source || !target || procs.length === 0}
        >
          Process
        </Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── DGM ──
const DGM_MODELS = [
  {
    id: "dgm-main",
    name: "DGM Face Model",
    sizeGb: 1.2,
    description: "3D face reconstruction",
    downloaded: false,
    required: true,
  },
  {
    id: "bfm2019",
    name: "BFM2019 Morphable Model",
    sizeGb: 0.4,
    description: "Required for UV maps",
    downloaded: false,
    required: true,
  },
];
function DGMPanel() {
  const [imagePath, setImagePath] = useState("");
  const [mode, setMode] = useState("reconstruct");
  const [textureRes, setTextureRes] = useState(1024);
  const [exportFmt, setExportFmt] = useState("obj");
  const [loading, setLoading] = useState(false);
  const [outputSrc, setOutputSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function run() {
    if (!imagePath) {
      return;
    }
    setLoading(true);
    setError("");
    setOutputSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "dgm.evolve",
        params: { imagePath, mode, textureResolution: textureRes, exportFormat: exportFmt },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setOutputSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "dgm.evolve", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "dgm.evolve", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }
  return (
    <PluginShell
      pluginId="hoc-plugin-dgm"
      displayName="DGM"
      description="Deep Generative Model — 3D face mesh reconstruction from a single portrait. UV texture map, configurable texture resolution, OBJ/PLY/GLTF/FBX export."
      models={DGM_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <PathInput
          label="Portrait Image"
          value={imagePath}
          onChange={setImagePath}
          placeholder="/path/to/portrait.jpg (front-facing, well lit)"
        />
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Mode</label>
            {["reconstruct", "uv-map", "render", "animate"].map((m) => (
              <button
type="button"                 key={m}
                onClick={() => setMode(m)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {m}
              </button>
            ))}
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Texture Res</label>
            {[256, 512, 1024, 2048, 4096].map((r) => (
              <button
type="button"                 key={r}
                onClick={() => setTextureRes(r)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${textureRes === r ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {r}px
              </button>
            ))}
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Export Format
            </label>
            {["obj", "ply", "gltf", "fbx"].map((f) => (
              <button
type="button"                 key={f}
                onClick={() => setExportFmt(f)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs font-mono uppercase text-left transition-colors ${exportFmt === f ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {f}
              </button>
            ))}
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          className="w-full"
          disabled={!imagePath}
        >
          Process 3D Mesh
        </Button>
        {outputSrc && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">3D Output</p>
            <img
              src={outputSrc}
              alt="3D render"
              className="w-full rounded-xl border border-border"
            />
            <a href={outputSrc} download className="text-xs text-accent hover:underline mt-2 block">
              ↓ Download {exportFmt.toUpperCase()}
            </a>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── StableAvatar ──
const STAVATAR_MODELS = [
  {
    id: "stable-avatar-main",
    name: "StableAvatar Main",
    sizeGb: 8.0,
    description: "Portrait animation model",
    downloaded: false,
    required: true,
  },
  {
    id: "wav2lip-hq",
    name: "Wav2Lip HQ",
    sizeGb: 0.4,
    description: "Audio-driven lip sync",
    downloaded: false,
  },
];
function StableAvatarPanel() {
  const [portrait, setPortrait] = useState("");
  const [motion, setMotion] = useState("");
  const [audio, setAudio] = useState("");
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(30);
  const [expr, setExpr] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function run() {
    if (!portrait) {
      return;
    }
    setLoading(true);
    setError("");
    setVideoSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "avatar.generate",
        params: {
          portraitPath: portrait,
          motionPath: motion || undefined,
          audioPath: audio || undefined,
          duration_sec: duration,
          fps,
          expressiveness: expr,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setVideoSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "avatar.generate",
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
          method: "avatar.generate",
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
      pluginId="hoc-plugin-stable-avatar"
      displayName="StableAvatar"
      description="Animate a portrait photo into a talking avatar video. Optional motion reference + audio lip-sync. Up to 5 minutes."
      models={STAVATAR_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card className="space-y-3">
          <PathInput
            label="Portrait Photo"
            value={portrait}
            onChange={setPortrait}
            placeholder="/path/to/portrait.jpg"
          />
          <PathInput
            label="Motion Reference Video"
            value={motion}
            onChange={setMotion}
            placeholder="/path/to/motion.mp4"
            optional
          />
          <PathInput
            label="Audio (lip-sync)"
            value={audio}
            onChange={setAudio}
            placeholder="/path/to/speech.wav"
            optional
          />
        </Card>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <Slider
              label="Duration"
              min={1}
              max={300}
              step={1}
              value={duration}
              onChange={setDuration}
              unit="s"
            />
          </Card>
          <Card>
            <Slider label="FPS" min={15} max={60} step={1} value={fps} onChange={setFps} />
          </Card>
          <Card>
            <Slider
              label="Expressiveness"
              min={0.1}
              max={1.0}
              step={0.05}
              value={expr}
              onChange={setExpr}
            />
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<User size={14} />}
          className="w-full"
          disabled={!portrait}
        >
          Animate Avatar
        </Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── MagicAnimate ──
const MAGICANIMATE_MODELS = [
  {
    id: "magicanimate-main",
    name: "MagicAnimate Base",
    sizeGb: 3.5,
    description: "Main animation Model",
    downloaded: false,
    required: true,
  },
  {
    id: "controlnet-pose",
    name: "ControlNet OpenPose",
    sizeGb: 1.4,
    description: "Pose estimation backbone",
    downloaded: false,
    required: true,
  },
  {
    id: "stable-diffusion-1.5",
    name: "Stable Diffusion 1.5",
    sizeGb: 4.0,
    description: "Required base model",
    downloaded: false,
    required: true,
  },
];
function MagicAnimatePanel() {
  const [reference, setReference] = useState("");
  const [motionVid, setMotionVid] = useState("");
  const [fps, setFps] = useState(25);
  const [steps, setSteps] = useState(25);
  const [guidance, setGuidance] = useState(7.5);
  const [seed, setSeed] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function run() {
    if (!reference || !motionVid) {
      return;
    }
    setLoading(true);
    setError("");
    setVideoSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "magicanimate.animate",
        params: {
          referencePath: reference,
          motionPath: motionVid,
          fps,
          num_steps: steps,
          guidance_scale: guidance,
          seed: seed === -1 ? undefined : seed,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setVideoSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "magicanimate.animate",
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
          method: "magicanimate.animate",
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
      pluginId="hoc-plugin-magicanimate"
      displayName="MagicAnimate"
      description="Drive any appearance image with a motion sequence using SD1.5 + ControlNet OpenPose. Preserves identity while transferring full-body motion."
      models={MAGICANIMATE_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card className="space-y-3">
          <PathInput
            label="Reference Appearance Image"
            value={reference}
            onChange={setReference}
            placeholder="/path/to/reference.jpg"
          />
          <PathInput
            label="Motion Sequence Video"
            value={motionVid}
            onChange={setMotionVid}
            placeholder="/path/to/motion.mp4 (dance, walk, etc.)"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider label="FPS" min={8} max={60} step={1} value={fps} onChange={setFps} />
            <Slider
              label="Diffusion Steps"
              min={10}
              max={50}
              step={5}
              value={steps}
              onChange={setSteps}
            />
          </Card>
          <Card className="space-y-3">
            <Slider
              label="Guidance Scale"
              min={1}
              max={15}
              step={0.5}
              value={guidance}
              onChange={setGuidance}
            />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Seed (-1 = random)
              </label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                min={-1}
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<User size={14} />}
          className="w-full"
          disabled={!reference || !motionVid}
        >
          Animate
        </Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ─── Layout ───────────────────────────────────────────────────────

const AVATAR_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-deepfacelab",
    name: "DeepFaceLab",
    icon: "🎭",
    description: "Full pipeline: extract → train SAEHD/AMP → merge",
    status: "active",
  },
  {
    id: "hoc-plugin-facefusion",
    name: "FaceFusion",
    icon: "🔀",
    description: "Modular processor: swap, enhance, colorize, restore",
    status: "active",
  },
  {
    id: "hoc-plugin-dgm",
    name: "DGM",
    icon: "💎",
    description: "3D face mesh reconstruction — OBJ/PLY/GLTF/FBX export",
    status: "active",
  },
  {
    id: "hoc-plugin-stable-avatar",
    name: "StableAvatar",
    icon: "🧑‍💻",
    description: "Portrait → animated avatar with lip-sync",
    status: "active",
  },
  {
    id: "hoc-plugin-magicanimate",
    name: "MagicAnimate",
    icon: "✨",
    description: "Appearance + motion sequence → animated video",
    status: "active",
  },
];

function renderAvatarPanel(id: string) {
  switch (id) {
    case "hoc-plugin-deepfacelab":
      return <DeepFaceLabPanel />;
    case "hoc-plugin-facefusion":
      return <FaceFusionPanel />;
    case "hoc-plugin-dgm":
      return <DGMPanel />;
    case "hoc-plugin-stable-avatar":
      return <StableAvatarPanel />;
    case "hoc-plugin-magicanimate":
      return <MagicAnimatePanel />;
    default:
      return null;
  }
}

export function AvatarStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Avatar Studio"
      categoryIcon={<User size={16} />}
      plugins={AVATAR_PLUGINS}
      renderPanel={renderAvatarPanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
