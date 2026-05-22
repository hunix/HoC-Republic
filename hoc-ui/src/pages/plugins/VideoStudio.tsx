import { Film } from "lucide-react";
/**
 * VideoStudio — Full-featured panels for:
 *   Deforum, LingBot-World, EasyVolCap, SPARC-3D
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

// ── DEFORUM ──
const DEFORUM_MODELS = [
  {
    id: "sd-v1-5",
    name: "Stable Diffusion 1.5",
    sizeGb: 4.0,
    description: "Primary animation model",
    downloaded: false,
    required: true,
  },
  {
    id: "sd-xl-base",
    name: "SDXL Base",
    sizeGb: 6.9,
    description: "Higher quality alternative",
    downloaded: false,
  },
  {
    id: "deforum-depth",
    name: "Depth Estimation Model",
    sizeGb: 0.3,
    description: "Required for 3D animation mode",
    downloaded: false,
  },
];
function DeforumPanel() {
  const [prompt, setPrompt] = useState(
    "A cosmic journey through galaxies | A futuristic city of light | Ancient ruins emerging from darkness",
  );
  const [negPrompt, setNegPrompt] = useState("blurry, low quality, deformed");
  const [animMode, setAnimMode] = useState<"2D" | "3D" | "RANSAC">("2D");
  const [maxFrames, setMaxFrames] = useState(120);
  const [fps, setFps] = useState(15);
  const [steps, setSteps] = useState(25);
  const [guidance, setGuidance] = useState(7.5);
  const [strength, setStrength] = useState(0.65);
  const [zoom, setZoom] = useState("0:(1.02)");
  const [angleX, setAngleX] = useState("0:(0)");
  const [transX, setTransX] = useState("0:(0)");
  const [transY, setTransY] = useState("0:(2)");
  const [smooth, setSmooth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function generate() {
    if (!prompt.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setVideoSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "deforum.generate",
        params: {
          prompt,
          negative_prompt: negPrompt,
          animation_mode: animMode,
          max_frames: maxFrames,
          fps,
          num_inference_steps: steps,
          guidance_scale: guidance,
          strength,
          zoom,
          angle_x: angleX,
          translation_x: transX,
          translation_y: transY,
          smooth_video: smooth,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setVideoSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "deforum.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "deforum.generate", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-deforum"
      displayName="Deforum Stable Diffusion"
      description="AI animation engine with 2D/3D/RANSAC modes. Keyframe-based prompt schedule, camera movements (zoom, angle, translation), interpolation, CLIP conditioning. Generate multi-minute AI animations."
      models={DEFORUM_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Prompt Schedule{" "}
            <span className="font-normal opacity-60 ml-1">(separate scenes with |)</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder={"A cosmic nebula | A futuristic city at night | Ancient temple in jungle"}
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
        <div className="grid grid-cols-3 gap-2">
          {(["2D", "3D", "RANSAC"] as const).map((m) => (
            <button
type="button"               key={m}
              onClick={() => setAnimMode(m)}
              className={`py-2 rounded-xl text-xs font-bold transition-colors ${animMode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider
              label="Max Frames"
              min={24}
              max={600}
              step={12}
              value={maxFrames}
              onChange={setMaxFrames}
            />
            <Slider label="FPS" min={8} max={60} step={1} value={fps} onChange={setFps} />
            <Slider
              label="Steps / Frame"
              min={10}
              max={50}
              step={5}
              value={steps}
              onChange={setSteps}
            />
          </Card>
          <Card className="space-y-3">
            <Slider
              label="Guidance"
              min={1}
              max={15}
              step={0.5}
              value={guidance}
              onChange={setGuidance}
            />
            <Slider
              label="Denoise Strength"
              min={0.3}
              max={1.0}
              step={0.05}
              value={strength}
              onChange={setStrength}
            />
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={smooth}
                onChange={(e) => setSmooth(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-text-secondary">Smooth video (FILM)</span>
            </label>
          </Card>
        </div>
        <Card>
          <p className="text-xs font-semibold text-text-muted mb-3">
            Camera Motion Keyframes{" "}
            <span className="font-normal opacity-60">(frame:(value) syntax)</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-muted">Zoom</label>
              <input
                type="text"
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
                className="w-full mt-1 bg-bg-input border border-border rounded-lg px-2 py-1 text-xs font-mono text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted">Angle X</label>
              <input
                type="text"
                value={angleX}
                onChange={(e) => setAngleX(e.target.value)}
                className="w-full mt-1 bg-bg-input border border-border rounded-lg px-2 py-1 text-xs font-mono text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted">Translation X</label>
              <input
                type="text"
                value={transX}
                onChange={(e) => setTransX(e.target.value)}
                className="w-full mt-1 bg-bg-input border border-border rounded-lg px-2 py-1 text-xs font-mono text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted">Translation Y</label>
              <input
                type="text"
                value={transY}
                onChange={(e) => setTransY(e.target.value)}
                className="w-full mt-1 bg-bg-input border border-border rounded-lg px-2 py-1 text-xs font-mono text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>
        </Card>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Film size={14} />}
          className="w-full"
          disabled={!prompt.trim()}
        >
          Generate Animation
        </Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── LINGBOT-WORLD ──
const LINGBOT_MODELS = [
  {
    id: "lingbot-world-7b",
    name: "LingBot World 7B",
    sizeGb: 14.0,
    description: "World simulation + video gen model",
    downloaded: false,
    required: true,
  },
];
function LingBotWorldPanel() {
  const [worldDesc, setWorldDesc] = useState(
    "A thriving futuristic megacity with flying vehicles and holographic advertisements, year 2157",
  );
  const [simSteps, setSimSteps] = useState(100);
  const [duration, setDuration] = useState(10);
  const [fps, setFps] = useState(24);
  const [resolution, setResolution] = useState("1280x720");
  const [seed, setSeed] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function generate() {
    if (!worldDesc.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setVideoSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "lingbot.generate",
        params: {
          description: worldDesc,
          prompt: worldDesc,
          simulation_steps: simSteps,
          duration_sec: duration,
          fps,
          resolution,
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
          method: "lingbot.generate",
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
          method: "lingbot.generate",
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
      pluginId="hoc-plugin-lingbot-world"
      displayName="LingBot World"
      description="AI world simulation + video generation. Describe a world and LingBot simulates its physics, ecology, and civilization dynamics, then renders it as a video."
      models={LINGBOT_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            World Description
          </label>
          <textarea
            value={worldDesc}
            onChange={(e) => setWorldDesc(e.target.value)}
            rows={4}
            placeholder="A lush alien planet with bioluminescent forests and giant arthropods..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider
              label="Simulation Steps"
              min={10}
              max={500}
              step={10}
              value={simSteps}
              onChange={setSimSteps}
            />
            <Slider
              label="Video Duration"
              min={3}
              max={120}
              step={1}
              value={duration}
              onChange={setDuration}
              unit="s"
            />
          </Card>
          <Card className="space-y-3">
            <Slider label="FPS" min={15} max={60} step={1} value={fps} onChange={setFps} />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">Resolution</label>
              {["640x360", "1280x720", "1920x1080"].map((r) => (
                <button
type="button"                   key={r}
                  onClick={() => setResolution(r)}
                  className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs font-mono text-left transition-colors ${resolution === r ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </Card>
        </div>
        <Card>
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
        </Card>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Film size={14} />}
          className="w-full"
          disabled={!worldDesc.trim()}
        >
          Generate World Video
        </Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── EASYVOLCAP ──
const EASYVOLCAP_MODELS = [
  {
    id: "easyvolcap-v1",
    name: "EasyVolCap Main",
    sizeGb: 2.0,
    description: "Volumetric video synthesis model",
    downloaded: false,
    required: true,
  },
  {
    id: "easyvolcap-nerfgs",
    name: "NeRF-GS Backbone",
    sizeGb: 0.5,
    description: "Neural radiance field with Gaussian splatting",
    downloaded: false,
  },
];
function EasyVolCapPanel() {
  const [inputPath, setInputPath] = useState("");
  const [mode, setMode] = useState("reconstruct");
  const [numFrames, setNumFrames] = useState(100);
  const [resolution, setResolution] = useState(512);
  const [novelViewAngle, setNovelViewAngle] = useState(360);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function run() {
    if (!inputPath) {
      return;
    }
    setLoading(true);
    setError("");
    setVideoSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "volcap.run",
        params: {
          inputPath,
          mode,
          num_frames: numFrames,
          resolution,
          novel_view_angle: novelViewAngle,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setVideoSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "volcap.run",
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
          method: "volcap.run",
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
      pluginId="hoc-plugin-easyvolcap"
      displayName="EasyVolCap"
      description="Volumetric video synthesis: reconstruct 3D scenes from multi-view images/video, render novel views, synthesize free-viewpoint video. NeRF + Gaussian Splatting backbone."
      models={EASYVOLCAP_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {["reconstruct", "novel-view", "render-video", "point-cloud"].map((m) => (
            <button
type="button"               key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <PathInput
          label="Input Images / Video Directory"
          value={inputPath}
          onChange={setInputPath}
          placeholder="/path/to/multi-view-images/ or /path/to/video.mp4"
        />
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider
              label="Num Frames"
              min={24}
              max={500}
              step={12}
              value={numFrames}
              onChange={setNumFrames}
            />
            <Slider
              label="Resolution"
              min={256}
              max={1024}
              step={64}
              value={resolution}
              onChange={setResolution}
              unit="px"
            />
          </Card>
          <Card>
            <Slider
              label="Novel View Angle"
              min={0}
              max={360}
              step={15}
              value={novelViewAngle}
              onChange={setNovelViewAngle}
              unit="°"
            />
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Film size={14} />}
          className="w-full"
          disabled={!inputPath}
        >
          Process Volumetric Scene
        </Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── SPARC-3D ──
const SPARC3D_MODELS = [
  {
    id: "sparc3d-main",
    name: "SPARC-3D Main Model",
    sizeGb: 3.0,
    description: "Sparse 3D reconstruction model",
    downloaded: false,
    required: true,
  },
  {
    id: "sparc3d-colmap",
    name: "COLMAP (SfM backbone)",
    sizeGb: 0.1,
    description: "Structure-from-motion for pose estimation",
    downloaded: false,
    required: true,
  },
];
function SPARC3DPanel() {
  const [inputPath, setInputPath] = useState("");
  const [mode, setMode] = useState("reconstruct");
  const [maxPoints, setMaxPoints] = useState(100000);
  const [exportFmt, setExportFmt] = useState("ply");
  const [loading, setLoading] = useState(false);
  const [outputSrc, setOutputSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function run() {
    if (!inputPath) {
      return;
    }
    setLoading(true);
    setError("");
    setOutputSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "sparc3d.generate",
        params: { inputPath, mode, maxPoints, exportFormat: exportFmt },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setOutputSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "sparc3d.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "sparc3d.generate", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }
  return (
    <PluginShell
      pluginId="hoc-plugin-sparc3d"
      displayName="SPARC-3D"
      description="Sparse 3D scene reconstruction from images/video using structure-from-motion + neural rendering. Exports dense/sparse point clouds in PLY/OBJ/PCD format."
      models={SPARC3D_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {["reconstruct", "dense-cloud", "render", "export"].map((m) => (
            <button
type="button"               key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <PathInput
          label="Input Images / Video"
          value={inputPath}
          onChange={setInputPath}
          placeholder="/path/to/images/ or /path/to/video.mp4"
        />
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <Slider
              label="Max Points"
              min={10000}
              max={1000000}
              step={10000}
              value={maxPoints}
              onChange={setMaxPoints}
            />
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Export Format
            </label>
            {["ply", "obj", "pcd", "las"].map((f) => (
              <button
type="button"                 key={f}
                onClick={() => setExportFmt(f)}
                className={`px-3 py-1 mr-1 rounded-lg text-xs font-mono uppercase transition-colors ${exportFmt === f ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
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
          icon={<Film size={14} />}
          className="w-full"
          disabled={!inputPath}
        >
          Reconstruct 3D Scene
        </Button>
        {outputSrc && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Point Cloud Output</p>
            <a href={outputSrc} download className="text-xs text-accent hover:underline">
              ↓ Download {exportFmt.toUpperCase()}
            </a>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── COGVIDEOX ──
const COGVIDEO_MODELS = [
  { id: "cogvideox-2b", name: "CogVideoX 2B", sizeGb: 4.5, description: "Fast generation, 8GB VRAM", downloaded: false, required: true },
  { id: "cogvideox-5b", name: "CogVideoX 5B", sizeGb: 10.0, description: "Higher quality, needs 16GB+", downloaded: false },
];
function CogVideoXPanel() {
  const [prompt, setPrompt] = useState("A drone flying through a futuristic neon-lit city at dusk, cinematic lighting");
  const [model, setModel] = useState<"2B" | "5B">("2B");
  const [numFrames, setNumFrames] = useState(49);
  const [fps, setFps] = useState(16);
  const [guidance, setGuidance] = useState(6);
  const [quantize, setQuantize] = useState<"none" | "int8" | "int4">("int8");
  const [seed, setSeed] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function generate() {
    if (!prompt.trim()) { return; }
    setLoading(true); setError(""); setVideoSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "cogvideo.generate", params: { prompt, model, num_frames: numFrames, fps, guidance_scale: guidance, quantize, seed: seed === -1 ? undefined : seed },
      })) as { result?: { outputPath?: string; jobId?: string } };
      if (r?.result?.outputPath) { setVideoSrc(`/republic-output/${r.result.outputPath}`); }
      setUsageLog((l) => [...l, { ts: Date.now(), method: "cogvideo.generate", durationMs: Date.now() - t0, success: true }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [...l, { ts: Date.now(), method: "cogvideo.generate", durationMs: Date.now() - t0, success: false }]);
    } finally { setLoading(false); }
  }
  return (
    <PluginShell pluginId="hoc-plugin-cogvideox" displayName="CogVideoX" description="Consumer-GPU text-to-video with INT8/INT4 quantization. 2B model for 8GB VRAM, 5B for higher quality. Fast generation with diffusion transformer architecture." models={COGVIDEO_MODELS} usageLog={usageLog}>
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Prompt</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="A slow-motion close-up of a hummingbird feeding..." className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none" />
        </Card>
        <div className="flex gap-2">
          {(["2B", "5B"] as const).map((m) => (
            <button type="button" key={m} onClick={() => setModel(m)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${model === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{m} Model</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["none", "int8", "int4"] as const).map((q) => (
            <button type="button" key={q} onClick={() => setQuantize(q)} className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${quantize === q ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{q === "none" ? "FP16" : q.toUpperCase()}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider label="Frames" min={17} max={97} step={8} value={numFrames} onChange={setNumFrames} />
            <Slider label="FPS" min={8} max={30} step={1} value={fps} onChange={setFps} />
          </Card>
          <Card className="space-y-3">
            <Slider label="Guidance" min={1} max={12} step={0.5} value={guidance} onChange={setGuidance} />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Seed (-1 = random)</label>
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} min={-1} className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
            </div>
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button onClick={() => void generate()} loading={loading} icon={<Film size={14} />} className="w-full" disabled={!prompt.trim()}>Generate Video</Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── HUNYUAN VIDEO ──
const HUNYUAN_MODELS = [
  { id: "hunyuan-video-13b", name: "HunyuanVideo 1.5 (13B)", sizeGb: 26.0, description: "State-of-the-art cinematic quality", downloaded: false, required: true },
];
function HunyuanVideoPanel() {
  const [prompt, setPrompt] = useState("An astronaut walking on Mars during golden hour, cinematic 4K, shallow depth of field");
  const [negPrompt, setNegPrompt] = useState("blurry, low quality, deformed");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(24);
  const [precision, setPrecision] = useState<"fp16" | "fp8" | "bf16">("fp8");
  const [seed, setSeed] = useState(-1);
  const [imagePath, setImagePath] = useState("");
  const [mode, setMode] = useState<"text" | "image">("text");
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function generate() {
    if (mode === "text" && !prompt.trim()) { return; }
    if (mode === "image" && !imagePath.trim()) { return; }
    setLoading(true); setError(""); setVideoSrc("");
    const t0 = Date.now();
    const method = mode === "text" ? "hunyuan.generate" : "hunyuan.image-to-video";
    const params = mode === "text"
      ? { prompt, negative_prompt: negPrompt, resolution, duration_sec: duration, fps, precision, seed: seed === -1 ? undefined : seed }
      : { image_path: imagePath, prompt, duration_sec: duration };
    try {
      const r = (await rpc("republic.plugins.call-gateway", { method, params })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) { setVideoSrc(`/republic-output/${r.result.outputPath}`); }
      setUsageLog((l) => [...l, { ts: Date.now(), method, durationMs: Date.now() - t0, success: true }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [...l, { ts: Date.now(), method, durationMs: Date.now() - t0, success: false }]);
    } finally { setLoading(false); }
  }
  return (
    <PluginShell pluginId="hoc-plugin-hunyuan-video" displayName="HunyuanVideo 1.5" description="13B cinematic video generation with physical realism. Text-to-video and image-to-video modes. FP8 precision for 24GB GPUs." models={HUNYUAN_MODELS} usageLog={usageLog}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["text", "image"] as const).map((m) => (
            <button type="button" key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{m === "text" ? "Text → Video" : "Image → Video"}</button>
          ))}
        </div>
        {mode === "image" && <PathInput label="Source Image" value={imagePath} onChange={setImagePath} placeholder="/path/to/image.png" />}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Prompt</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe the scene..." className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none" />
        </Card>
        {mode === "text" && (
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Negative Prompt</label>
            <input type="text" value={negPrompt} onChange={(e) => setNegPrompt(e.target.value)} className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
          </Card>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">Resolution</label>
              {["540p", "720p", "1080p"].map((r) => (
                <button type="button" key={r} onClick={() => setResolution(r)} className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs font-mono text-left transition-colors ${resolution === r ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{r}</button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">Precision</label>
              <div className="flex gap-1">
                {(["fp16", "fp8", "bf16"] as const).map((p) => (
                  <button type="button" key={p} onClick={() => setPrecision(p)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${precision === p ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{p}</button>
                ))}
              </div>
            </div>
          </Card>
          <Card className="space-y-3">
            <Slider label="Duration" min={1} max={15} step={1} value={duration} onChange={setDuration} unit="s" />
            <Slider label="FPS" min={15} max={60} step={1} value={fps} onChange={setFps} />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Seed (-1 = random)</label>
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} min={-1} className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
            </div>
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button onClick={() => void generate()} loading={loading} icon={<Film size={14} />} className="w-full" disabled={mode === "text" ? !prompt.trim() : !imagePath.trim()}>Generate Cinematic Video</Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── LTX-2 VIDEO ──
const LTX_MODELS = [
  { id: "ltx-2-main", name: "LTX-2 Video Model", sizeGb: 8.0, description: "4K/50fps production-quality with audio", downloaded: false, required: true },
];
function LTXVideoPanel() {
  const [prompt, setPrompt] = useState("A time-lapse of a flower blooming in a sunlit garden, ultra-sharp 4K");
  const [negPrompt, setNegPrompt] = useState("blurry, artifacts");
  const [resolution, setResolution] = useState("1080p");
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(30);
  const [withAudio, setWithAudio] = useState(false);
  const [seed, setSeed] = useState(-1);
  const [imagePath, setImagePath] = useState("");
  const [mode, setMode] = useState<"text" | "image">("text");
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function generate() {
    if (mode === "text" && !prompt.trim()) { return; }
    if (mode === "image" && !imagePath.trim()) { return; }
    setLoading(true); setError(""); setVideoSrc("");
    const t0 = Date.now();
    const method = mode === "text" ? "ltx.generate" : "ltx.image-to-video";
    const params = mode === "text"
      ? { prompt, negative_prompt: negPrompt, resolution, duration_sec: duration, fps, with_audio: withAudio, seed: seed === -1 ? undefined : seed }
      : { image_path: imagePath, prompt, duration_sec: duration, resolution };
    try {
      const r = (await rpc("republic.plugins.call-gateway", { method, params })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) { setVideoSrc(`/republic-output/${r.result.outputPath}`); }
      setUsageLog((l) => [...l, { ts: Date.now(), method, durationMs: Date.now() - t0, success: true }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [...l, { ts: Date.now(), method, durationMs: Date.now() - t0, success: false }]);
    } finally { setLoading(false); }
  }
  return (
    <PluginShell pluginId="hoc-plugin-ltx-video" displayName="LTX-2 Video" description="Production-ready video at up to 4K/50fps with optional synchronized audio generation. Text-to-video and image-to-video modes." models={LTX_MODELS} usageLog={usageLog}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["text", "image"] as const).map((m) => (
            <button type="button" key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{m === "text" ? "Text → Video" : "Image → Video"}</button>
          ))}
        </div>
        {mode === "image" && <PathInput label="Source Image" value={imagePath} onChange={setImagePath} placeholder="/path/to/image.png" />}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Prompt</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe the video..." className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none" />
        </Card>
        {mode === "text" && (
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Negative Prompt</label>
            <input type="text" value={negPrompt} onChange={(e) => setNegPrompt(e.target.value)} className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
          </Card>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">Resolution</label>
              {["720p", "1080p", "4K"].map((r) => (
                <button type="button" key={r} onClick={() => setResolution(r)} className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs font-mono text-left transition-colors ${resolution === r ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{r}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} className="w-4 h-4 accent-accent" />
              <span className="text-sm text-text-secondary">🔊 Generate synchronized audio</span>
            </label>
          </Card>
          <Card className="space-y-3">
            <Slider label="Duration" min={1} max={30} step={1} value={duration} onChange={setDuration} unit="s" />
            <Slider label="FPS" min={15} max={50} step={1} value={fps} onChange={setFps} />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Seed (-1 = random)</label>
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} min={-1} className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
            </div>
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button onClick={() => void generate()} loading={loading} icon={<Film size={14} />} className="w-full" disabled={mode === "text" ? !prompt.trim() : !imagePath.trim()}>Generate 4K Video</Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── SKYREELS V2 ──
const SKYREELS_MODELS = [
  { id: "skyreels-v2-main", name: "SkyReels V2 Director", sizeGb: 12.0, description: "Infinite-length film with camera direction", downloaded: false, required: true },
];
function SkyReelsPanel() {
  const [prompt, setPrompt] = useState("A sweeping aerial shot over a medieval castle at dawn, fog rolling across the moat");
  const [duration, setDuration] = useState(10);
  const [resolution, setResolution] = useState("720p");
  const [shotType, setShotType] = useState("wide");
  const [cameraAngle, setCameraAngle] = useState("eye-level");
  const [cameraMovement, setCameraMovement] = useState("tracking");
  const [seed, setSeed] = useState(-1);
  const [scenes, setScenes] = useState("A knight riding through enchanted forest\nThe knight reaching a dark castle\nDragon emerging from the castle towers");
  const [scenesDuration, setScenesDuration] = useState(8);
  const [transition, setTransition] = useState("seamless");
  const [mode, setMode] = useState<"scene" | "continuous">("scene");
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function generate() {
    setLoading(true); setError(""); setVideoSrc("");
    const t0 = Date.now();
    const method = mode === "scene" ? "skyreels.generate-scene" : "skyreels.generate-continuous";
    const params = mode === "scene"
      ? { prompt, duration_sec: duration, resolution, shot_type: shotType, camera_angle: cameraAngle, camera_movement: cameraMovement, seed: seed === -1 ? undefined : seed }
      : { scenes: scenes.split("\n").map((s) => s.trim()).filter(Boolean), scene_duration_sec: scenesDuration, transition_type: transition };
    try {
      const r = (await rpc("republic.plugins.call-gateway", { method, params })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) { setVideoSrc(`/republic-output/${r.result.outputPath}`); }
      setUsageLog((l) => [...l, { ts: Date.now(), method, durationMs: Date.now() - t0, success: true }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [...l, { ts: Date.now(), method, durationMs: Date.now() - t0, success: false }]);
    } finally { setLoading(false); }
  }
  return (
    <PluginShell pluginId="hoc-plugin-skyreels" displayName="SkyReels V2" description="Infinite-length film generation with camera direction control — shot types, angles, movements. Single scene or multi-scene continuous mode with visual continuity." models={SKYREELS_MODELS} usageLog={usageLog}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["scene", "continuous"] as const).map((m) => (
            <button type="button" key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{m === "scene" ? "🎬 Single Scene" : "🎥 Multi-Scene Film"}</button>
          ))}
        </div>
        {mode === "scene" ? (
          <>
            <Card>
              <label className="block text-xs font-semibold text-text-muted mb-2">Scene Prompt</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe the scene..." className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none" />
            </Card>
            <Card>
              <p className="text-xs font-semibold text-text-muted mb-3">Camera Direction</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Shot Type</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {["wide", "medium", "close-up", "extreme-close-up", "over-shoulder", "aerial", "pov"].map((s) => (
                      <button type="button" key={s} onClick={() => setShotType(s)} className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${shotType === s ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Camera Angle</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {["eye-level", "low-angle", "high-angle", "bird-eye", "dutch-angle"].map((a) => (
                      <button type="button" key={a} onClick={() => setCameraAngle(a)} className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${cameraAngle === a ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{a}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Movement</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {["static", "pan", "tilt", "dolly", "tracking", "crane", "handheld", "steadicam"].map((m_) => (
                      <button type="button" key={m_} onClick={() => setCameraMovement(m_)} className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${cameraMovement === m_ ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{m_}</button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-4">
              <Card className="space-y-3">
                <Slider label="Duration" min={3} max={30} step={1} value={duration} onChange={setDuration} unit="s" />
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-2">Resolution</label>
                  {["480p", "720p", "1080p"].map((r) => (
                    <button type="button" key={r} onClick={() => setResolution(r)} className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs font-mono text-left transition-colors ${resolution === r ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{r}</button>
                  ))}
                </div>
              </Card>
              <Card>
                <label className="block text-xs font-semibold text-text-muted mb-1">Seed (-1 = random)</label>
                <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} min={-1} className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
              </Card>
            </div>
          </>
        ) : (
          <>
            <Card>
              <label className="block text-xs font-semibold text-text-muted mb-2">Scene Prompts <span className="font-normal opacity-60">(one per line)</span></label>
              <textarea value={scenes} onChange={(e) => setScenes(e.target.value)} rows={6} placeholder={"Scene 1 description\nScene 2 description\nScene 3 description"} className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none font-mono" />
              <p className="text-[10px] text-text-muted mt-1">{scenes.split("\n").filter((s) => s.trim()).length} scenes</p>
            </Card>
            <div className="grid grid-cols-2 gap-4">
              <Card><Slider label="Duration per Scene" min={3} max={30} step={1} value={scenesDuration} onChange={setScenesDuration} unit="s" /></Card>
              <Card>
                <label className="block text-xs font-semibold text-text-muted mb-2">Transition</label>
                {["seamless", "fade", "cut"].map((t) => (
                  <button type="button" key={t} onClick={() => setTransition(t)} className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${transition === t ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{t}</button>
                ))}
              </Card>
            </div>
          </>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
        <Button onClick={() => void generate()} loading={loading} icon={<Film size={14} />} className="w-full">{mode === "scene" ? "Generate Scene" : "Generate Multi-Scene Film"}</Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ── WAN 2.2 VIDEO ──
const WAN_MODELS = [
  { id: "wan-2.2-main", name: "Wan 2.2 Video Model", sizeGb: 9.0, description: "Cinematic video with lighting and camera control", downloaded: false, required: true },
];
function WanVideoPanel() {
  const [prompt, setPrompt] = useState("A lone samurai standing on a cliff at sunset, cherry blossoms swirling in the wind, cinematic lighting");
  const [negPrompt, setNegPrompt] = useState("blurry, low quality");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(24);
  const [style, setStyle] = useState("cinematic");
  const [cameraMotion, setCameraMotion] = useState("static");
  const [seed, setSeed] = useState(-1);
  const [imagePath, setImagePath] = useState("");
  const [mode, setMode] = useState<"text" | "image">("text");
  const [loading, setLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  async function generate() {
    if (mode === "text" && !prompt.trim()) { return; }
    if (mode === "image" && !imagePath.trim()) { return; }
    setLoading(true); setError(""); setVideoSrc("");
    const t0 = Date.now();
    const method = mode === "text" ? "wan.generate" : "wan.image-to-video";
    const params = mode === "text"
      ? { prompt, negative_prompt: negPrompt, resolution, duration_sec: duration, fps, style, camera_motion: cameraMotion, seed: seed === -1 ? undefined : seed }
      : { image_path: imagePath, prompt, duration_sec: duration };
    try {
      const r = (await rpc("republic.plugins.call-gateway", { method, params })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) { setVideoSrc(`/republic-output/${r.result.outputPath}`); }
      setUsageLog((l) => [...l, { ts: Date.now(), method, durationMs: Date.now() - t0, success: true }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [...l, { ts: Date.now(), method, durationMs: Date.now() - t0, success: false }]);
    } finally { setLoading(false); }
  }
  return (
    <PluginShell pluginId="hoc-plugin-wan-video" displayName="Wan 2.2" description="Cinematic video with film styles (cinematic, photorealistic, anime, artistic), camera motion control (pan, dolly, orbit, tracking), and image-to-video mode." models={WAN_MODELS} usageLog={usageLog}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["text", "image"] as const).map((m) => (
            <button type="button" key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{m === "text" ? "Text → Video" : "Image → Video"}</button>
          ))}
        </div>
        {mode === "image" && <PathInput label="Source Image" value={imagePath} onChange={setImagePath} placeholder="/path/to/image.png" />}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Prompt</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe the scene..." className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none" />
        </Card>
        {mode === "text" && (
          <>
            <Card>
              <label className="block text-xs font-semibold text-text-muted mb-2">Negative Prompt</label>
              <input type="text" value={negPrompt} onChange={(e) => setNegPrompt(e.target.value)} className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
            </Card>
            <Card>
              <p className="text-xs font-semibold text-text-muted mb-3">Style & Camera</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Film Style</label>
                  <div className="flex gap-1 mt-1">
                    {["cinematic", "photorealistic", "anime", "artistic"].map((s) => (
                      <button type="button" key={s} onClick={() => setStyle(s)} className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${style === s ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Camera Motion</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {["static", "pan-left", "pan-right", "zoom-in", "zoom-out", "orbit", "dolly", "tracking"].map((m_) => (
                      <button type="button" key={m_} onClick={() => setCameraMotion(m_)} className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${cameraMotion === m_ ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{m_}</button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">Resolution</label>
              {["480p", "720p"].map((r) => (
                <button type="button" key={r} onClick={() => setResolution(r)} className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs font-mono text-left transition-colors ${resolution === r ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>{r}</button>
              ))}
            </div>
            <Slider label="Duration" min={1} max={10} step={1} value={duration} onChange={setDuration} unit="s" />
          </Card>
          <Card className="space-y-3">
            <Slider label="FPS" min={15} max={30} step={1} value={fps} onChange={setFps} />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Seed (-1 = random)</label>
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} min={-1} className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
            </div>
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button onClick={() => void generate()} loading={loading} icon={<Film size={14} />} className="w-full" disabled={mode === "text" ? !prompt.trim() : !imagePath.trim()}>Generate Video</Button>
        <VideoResult src={videoSrc} />
      </div>
    </PluginShell>
  );
}

// ─── Layout ───────────────────────────────────────────────────────

const VIDEO_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-deforum",
    name: "Deforum",
    icon: "🎞️",
    description: "2D/3D/RANSAC animation engine, keyframe schedules, camera motion",
    status: "active",
  },
  {
    id: "hoc-plugin-cogvideox",
    name: "CogVideoX",
    icon: "🧠",
    description: "Consumer-GPU text-to-video (2B/5B), INT8/INT4 quantization",
    status: "active",
  },
  {
    id: "hoc-plugin-hunyuan-video",
    name: "HunyuanVideo 1.5",
    icon: "🎬",
    description: "13B cinematic video — text & image-to-video, fp8 precision",
    status: "active",
  },
  {
    id: "hoc-plugin-ltx-video",
    name: "LTX-2 Video",
    icon: "📽️",
    description: "4K/50fps production video with synchronized audio",
    status: "active",
  },
  {
    id: "hoc-plugin-skyreels",
    name: "SkyReels V2",
    icon: "🎥",
    description: "Infinite-length film — camera direction, multi-scene continuity",
    status: "active",
  },
  {
    id: "hoc-plugin-wan-video",
    name: "Wan 2.2",
    icon: "🌊",
    description: "Cinematic film styles, camera motion, image-to-video",
    status: "active",
  },
  {
    id: "hoc-plugin-lingbot-world",
    name: "LingBot World",
    icon: "🌍",
    description: "AI world simulation + video generation (7B model)",
    status: "active",
  },
  {
    id: "hoc-plugin-easyvolcap",
    name: "EasyVolCap",
    icon: "📦",
    description: "Volumetric video — NeRF + Gaussian Splatting, free-viewpoint render",
    status: "active",
  },
  {
    id: "hoc-plugin-sparc3d",
    name: "SPARC-3D",
    icon: "🔷",
    description: "Sparse 3D scene reconstruction + point cloud export",
    status: "active",
  },
];

function renderVideoPanel(id: string) {
  switch (id) {
    case "hoc-plugin-deforum":
      return <DeforumPanel />;
    case "hoc-plugin-cogvideox":
      return <CogVideoXPanel />;
    case "hoc-plugin-hunyuan-video":
      return <HunyuanVideoPanel />;
    case "hoc-plugin-ltx-video":
      return <LTXVideoPanel />;
    case "hoc-plugin-skyreels":
      return <SkyReelsPanel />;
    case "hoc-plugin-wan-video":
      return <WanVideoPanel />;
    case "hoc-plugin-lingbot-world":
      return <LingBotWorldPanel />;
    case "hoc-plugin-easyvolcap":
      return <EasyVolCapPanel />;
    case "hoc-plugin-sparc3d":
      return <SPARC3DPanel />;
    default:
      return null;
  }
}

export function VideoStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Video Studio"
      categoryIcon={<Film size={16} />}
      plugins={VIDEO_PLUGINS}
      renderPanel={renderVideoPanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
