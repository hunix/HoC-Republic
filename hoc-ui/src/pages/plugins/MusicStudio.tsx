import { Music } from "lucide-react";
/**
 * MusicStudio — Full-featured panel for FunMusic (InspireMusic)
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Card, Button, Alert } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";
import { PluginStudioLayout, type StudioPlugin } from "./PluginStudioLayout";

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

// ─ Waveform Visualizer
function WaveformPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [playing, setPlaying] = useState(false);

  // Use a ref to hold the latest draw frame to avoid react-hooks/immutability
  // (draw referencing itself before its declaration in useCallback)
  const drawRef = useRef<() => void>(() => {});

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) {
      return;
    }
    const ctx = canvas.getContext("2d")!;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barW = (canvas.width / buf.length) * 2.5;
    let x = 0;
    for (const val of buf) {
      const h = (val / 255) * canvas.height;
      const alpha = 0.4 + (val / 255) * 0.6;
      ctx.fillStyle = `rgba(99,102,241,${alpha})`;
      ctx.fillRect(x, canvas.height - h, barW, h);
      x += barW + 1;
    }
    // Use ref indirection so we don't have draw in its own closure deps
    animRef.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  // Keep drawRef in sync whenever draw changes
  drawRef.current = draw;

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (!analyserRef.current) {
      const ctx2 = new AudioContext();
      const src2 = ctx2.createMediaElementSource(audio);
      const an = ctx2.createAnalyser();
      an.fftSize = 256;
      src2.connect(an);
      an.connect(ctx2.destination);
      analyserRef.current = an;
    }
    if (playing) {
      audio.pause();
      cancelAnimationFrame(animRef.current);
      setPlaying(false);
    } else {
      await audio.play();
      draw();
      setPlaying(true);
    }
  }

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return (
    <Card className="space-y-3">
      <p className="text-xs font-semibold text-text-muted">Generated Music</p>
      <canvas
        ref={canvasRef}
        width={600}
        height={80}
        className="w-full rounded-xl bg-bg-input border border-border/30"
      />
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => {
          setPlaying(false);
          cancelAnimationFrame(animRef.current);
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          onClick={() => void toggle()}
          size="sm"
          variant={playing ? "danger" : "primary"}
          icon={<Music size={12} />}
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <a href={src} download className="text-xs text-accent hover:underline">
          ↓ Download
        </a>
      </div>
    </Card>
  );
}

const FUNMUSIC_MODELS = [
  {
    id: "funmusic-1.5b",
    name: "InspireMusic 1.5B",
    sizeGb: 3.0,
    description: "Autoregressive transformer (Qwen2.5) + flow-matching",
    downloaded: false,
    required: true,
  },
];

const GENRES = [
  "ambient",
  "cinematic",
  "electronic",
  "jazz",
  "orchestral",
  "pop",
  "rock",
  "lo-fi",
  "classical",
  "world",
  "folk",
  "experimental",
];
const MOODS = [
  "uplifting",
  "melancholic",
  "energetic",
  "calm",
  "mysterious",
  "epic",
  "romantic",
  "playful",
  "dark",
  "triumphant",
];
const INSTRUMENTS = [
  "piano",
  "guitar",
  "violin",
  "flute",
  "drums",
  "bass",
  "synthesizer",
  "choir",
  "trumpet",
  "cello",
  "harp",
  "full-orchestra",
];

function FunMusicPanel() {
  const [mode, setMode] = useState<"generate" | "continue">("generate");
  const [prompt, setPrompt] = useState(
    "An epic orchestral piece with rising brass and sweeping strings, building to a triumphant climax",
  );
  const [genre, setGenre] = useState("orchestral");
  const [mood, setMood] = useState("epic");
  const [instruments, setInstruments] = useState<string[]>(["violin", "trumpet"]);
  const [duration, setDuration] = useState(30);
  const [tempo, setTempo] = useState(120);
  const [continuationPath, setContinuationPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  function toggleInstrument(i: string) {
    setInstruments((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]));
  }

  async function generate() {
    if (!prompt.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setAudioSrc("");
    const t0 = Date.now();
    const enrichedPrompt = `${prompt}. Genre: ${genre}. Mood: ${mood}. Instruments: ${instruments.join(", ")}. Tempo: ${tempo} BPM.`;
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "funmusic.generate",
        params: {
          prompt: enrichedPrompt,
          duration_sec: duration,
          continuation_audio: mode === "continue" ? continuationPath || undefined : undefined,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setAudioSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "funmusic.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "funmusic.generate",
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
      pluginId="hoc-plugin-funmusic"
      displayName="FunMusic (InspireMusic)"
      description="AI music generation via InspireMusic. Powered by Qwen2.5 1.5B autoregressive transformer + flow-matching model. Text-to-music and music continuation. Generate up to 5 minutes of high-quality audio."
      models={FUNMUSIC_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["generate", "continue"] as const).map((m) => (
            <button
type="button"               key={m}
              onClick={() => setMode(m)}
              className={`py-2 rounded-xl text-xs font-bold capitalize transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {m === "generate" ? "🎵 Generate Music" : "🔗 Continue Music"}
            </button>
          ))}
        </div>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Music Description
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="A peaceful piano melody with gentle rain in the background, late night study music..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        {mode === "continue" && (
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Audio to Continue
            </label>
            <input
              type="text"
              value={continuationPath}
              onChange={(e) => setContinuationPath(e.target.value)}
              placeholder="/path/to/existing-music.wav"
              className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Genre</label>
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
              {GENRES.map((g) => (
                <button
type="button"                   key={g}
                  onClick={() => setGenre(g)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${genre === g ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Mood</label>
            <div className="flex flex-wrap gap-1">
              {MOODS.map((m) => (
                <button
type="button"                   key={m}
                  onClick={() => setMood(m)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${mood === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Card>
        </div>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Instruments</label>
          <div className="flex flex-wrap gap-1">
            {INSTRUMENTS.map((i) => {
              const on = instruments.includes(i);
              return (
                <button
type="button"                   key={i}
                  onClick={() => toggleInstrument(i)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${on ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {i}
                </button>
              );
            })}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <Slider
              label="Duration"
              min={5}
              max={300}
              step={5}
              value={duration}
              onChange={setDuration}
              unit="s"
            />
          </Card>
          <Card>
            <Slider
              label="Tempo"
              min={60}
              max={200}
              step={5}
              value={tempo}
              onChange={setTempo}
              unit=" BPM"
            />
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Music size={14} />}
          className="w-full"
          disabled={!prompt.trim()}
        >
          {mode === "generate" ? "Generate Music" : "Continue Music"}
        </Button>
        {audioSrc && <WaveformPlayer src={audioSrc} />}
      </div>
    </PluginShell>
  );
}

const MUSIC_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-funmusic",
    name: "FunMusic",
    icon: "🎵",
    description: "InspireMusic — Qwen2.5 + flow-matching, text-to-music, music continuation",
    status: "active",
  },
];

function renderMusicPanel(id: string) {
  if (id === "hoc-plugin-funmusic") {
    return <FunMusicPanel />;
  }
  return null;
}

export function MusicStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Music Studio"
      categoryIcon={<Music size={16} />}
      plugins={MUSIC_PLUGINS}
      renderPanel={renderMusicPanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
