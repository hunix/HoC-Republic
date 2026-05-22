/**
 * AudioStudio — Full-featured panels for:
 *   Bark (V2), Chatterbox (turbo/standard/multilingual), Qwen3-TTS, MMAudio
 *
 * Each plugin wrapped in PluginShell (Generate | Models | Jobs | Logs).
 */

import { Volume2 } from "lucide-react";
import { useState } from "react";
import { Card, Button, Alert } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";
import { PluginStudioLayout, type StudioPlugin } from "./PluginStudioLayout";

// ─── Shared helpers ───────────────────────────────────────────────

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
        {optional && <span className="font-normal normal-case ml-1 opacity-60">(optional)</span>}
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
      <div className="flex justify-between text-[10px] text-text-muted/50 mt-0.5">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

function AudioPlayer({ src }: { src: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold text-text-muted mb-2">Generated Audio</p>
      <audio controls className="w-full" src={src} />
      <div className="flex gap-2 mt-2">
        <a href={src} download className="text-xs text-accent hover:underline">
          ↓ Download WAV
        </a>
      </div>
    </Card>
  );
}

// ─── BARK ─────────────────────────────────────────────────────────

const BARK_MODELS = [
  {
    id: "bark-large",
    name: "Bark Large",
    sizeGb: 5.7,
    description: "Full quality model (default)",
    downloaded: false,
    required: true,
  },
  {
    id: "bark-small",
    name: "Bark Small",
    sizeGb: 0.5,
    description: "Faster, lower quality",
    downloaded: false,
  },
];

const BARK_VOICE_PRESETS = [
  "v2/en_speaker_0",
  "v2/en_speaker_1",
  "v2/en_speaker_2",
  "v2/en_speaker_3",
  "v2/en_speaker_4",
  "v2/en_speaker_5",
  "v2/en_speaker_6",
  "v2/en_speaker_7",
  "v2/en_speaker_8",
  "v2/en_speaker_9",
  "v2/de_speaker_0",
  "v2/de_speaker_1",
  "v2/de_speaker_2",
  "v2/de_speaker_3",
  "v2/es_speaker_0",
  "v2/es_speaker_1",
  "v2/es_speaker_2",
  "v2/es_speaker_3",
  "v2/fr_speaker_0",
  "v2/fr_speaker_1",
  "v2/fr_speaker_2",
  "v2/fr_speaker_3",
  "v2/it_speaker_0",
  "v2/it_speaker_1",
  "v2/ja_speaker_0",
  "v2/ja_speaker_1",
  "v2/ja_speaker_2",
  "v2/ko_speaker_0",
  "v2/ko_speaker_1",
  "v2/pl_speaker_0",
  "v2/pl_speaker_1",
  "v2/pl_speaker_2",
  "v2/pl_speaker_3",
  "v2/pt_speaker_0",
  "v2/pt_speaker_1",
  "v2/pt_speaker_2",
  "v2/ru_speaker_0",
  "v2/ru_speaker_1",
  "v2/ru_speaker_2",
  "v2/ru_speaker_3",
  "v2/tr_speaker_0",
  "v2/tr_speaker_1",
  "v2/tr_speaker_2",
  "v2/zh_speaker_0",
  "v2/zh_speaker_1",
  "v2/zh_speaker_2",
  "v2/zh_speaker_3",
  "v2/hi_speaker_0",
  "v2/hi_speaker_1",
  "v2/hi_speaker_2",
  "v2/hi_speaker_3",
];

function BarkPanel() {
  const [text, setText] = useState(
    "Hello! [laughs] Welcome to the House of Cognition. ♪ We're building something incredible. ♪",
  );
  const [voice, setVoice] = useState("v2/en_speaker_6");
  const [mode, setMode] = useState<"speech" | "music" | "sound-effect" | "mixed">("speech");
  const [textTemp, setTextTemp] = useState(0.7);
  const [waveformTemp, setWaveformTemp] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function generate() {
    if (!text.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setAudioSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "bark.generate",
        params: {
          text,
          voice_preset: voice,
          mode,
          text_temp: textTemp,
          waveform_temp: waveformTemp,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setAudioSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "bark.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "bark.generate", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-bark"
      displayName="Bark TTS (Suno AI)"
      description="State-of-the-art text-to-audio. Generates speech, music, sound effects, and nonverbal audio. Supports 100+ voice presets, 13 languages, and paralinguistic markup ([laughs], ♪ music, [sighs], etc.)"
      models={BARK_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="info">
          Use paralinguistic markup in text: <code className="text-xs">[laughs]</code>{" "}
          <code className="text-xs">[sighs]</code> <code className="text-xs">[gasps]</code>{" "}
          <code className="text-xs">♪ lyrics ♪</code> — Bark generates nonverbal audio natively.
        </Alert>
        <Card>
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Text / Prompt
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={"Hello [laughs] ♪ This is a musical greeting ♪ [sighs] How beautiful..."}
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Audio Mode</label>
            {(["speech", "music", "sound-effect", "mixed"] as const).map((m) => (
              <button
type="button"                 key={m}
                onClick={() => setMode(m)}
                className={`block w-full mb-1 py-1.5 px-3 rounded-lg text-xs font-medium text-left transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {m}
              </button>
            ))}
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Voice Preset</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
            >
              {BARK_VOICE_PRESETS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Card>
        </div>
        <Card className="space-y-4">
          <Slider
            label="Text Temperature"
            min={0.1}
            max={1.0}
            step={0.05}
            value={textTemp}
            onChange={setTextTemp}
          />
          <Slider
            label="Waveform Temperature"
            min={0.1}
            max={1.0}
            step={0.05}
            value={waveformTemp}
            onChange={setWaveformTemp}
          />
        </Card>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Volume2 size={14} />}
          className="w-full"
          disabled={!text.trim()}
        >
          Generate Audio
        </Button>
        {audioSrc && <AudioPlayer src={audioSrc} />}
      </div>
    </PluginShell>
  );
}

// ─── CHATTERBOX ───────────────────────────────────────────────────

const CHATTERBOX_MODELS = [
  {
    id: "chatterbox-turbo",
    name: "Chatterbox Turbo (350M)",
    sizeGb: 1.4,
    description: "Low-latency, paralinguistic tags",
    downloaded: false,
    required: true,
  },
  {
    id: "chatterbox-standard",
    name: "Chatterbox Standard",
    sizeGb: 1.4,
    description: "English, higher quality",
    downloaded: false,
  },
  {
    id: "chatterbox-multilingual",
    name: "Chatterbox Multilingual",
    sizeGb: 2.2,
    description: "23 languages supported",
    downloaded: false,
  },
];

const CHATTERBOX_LANGUAGES = [
  "en",
  "de",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pl",
  "pt",
  "ru",
  "tr",
  "zh",
  "hi",
  "nl",
  "sv",
  "ar",
  "fi",
  "hu",
  "cs",
  "da",
  "ro",
  "uk",
  "sk",
];

function ChatterboxPanel() {
  const [text, setText] = useState(
    "Welcome to the Republic! Our civilization grows stronger every day.",
  );
  const [model, setModel] = useState<"turbo" | "standard" | "multilingual">("turbo");
  const [voiceRef, setVoiceRef] = useState("");
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function generate() {
    if (!text.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setAudioSrc("");
    const t0 = Date.now();
    try {
      const params: Record<string, unknown> = { text, model };
      if (voiceRef) {
        params.voice_ref = voiceRef;
      }
      if (model === "multilingual") {
        params.language = language;
      }
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "chatterbox.generate",
        params,
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setAudioSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "chatterbox.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "chatterbox.generate", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-chatterbox"
      displayName="Chatterbox TTS"
      description="State-of-the-art TTS by Resemble AI. Three variants: Turbo (350M, low-latency, paralinguistic tags, voice cloning), Standard (English, highest quality), Multilingual (23 languages)."
      models={CHATTERBOX_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Text
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Enter text to synthesize..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-3 gap-3">
          {(["turbo", "standard", "multilingual"] as const).map((m) => (
            <button
type="button"               key={m}
              onClick={() => setModel(m)}
              className={`py-2 px-3 rounded-xl text-xs font-medium transition-colors ${model === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              <div className="font-bold capitalize">{m}</div>
              <div className="opacity-70 text-[10px]">
                {m === "turbo" ? "350M · fast" : m === "standard" ? "EN · HQ" : "23 langs"}
              </div>
            </button>
          ))}
        </div>
        {model === "multilingual" && (
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Language</label>
            <div className="flex flex-wrap gap-1">
              {CHATTERBOX_LANGUAGES.map((l) => (
                <button
type="button"                   key={l}
                  onClick={() => setLanguage(l)}
                  className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${language === l ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </Card>
        )}
        <PathInput
          label="Voice Clone Reference"
          value={voiceRef}
          onChange={setVoiceRef}
          placeholder="/path/to/voice-sample.wav (min 5s)"
          optional
        />
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Volume2 size={14} />}
          className="w-full"
          disabled={!text.trim()}
        >
          Synthesize
        </Button>
        {audioSrc && <AudioPlayer src={audioSrc} />}
      </div>
    </PluginShell>
  );
}

// ─── QWEN3-TTS ────────────────────────────────────────────────────

const QWEN3_MODELS = [
  {
    id: "qwen3-tts-main",
    name: "Qwen3-TTS (Alibaba)",
    sizeGb: 8.5,
    description: "Main TTS model, all voices",
    downloaded: false,
    required: true,
  },
];

const QWEN3_VOICES = [
  "Chelsie",
  "Ethan",
  "Aria",
  "River",
  "Brook",
  "Sage",
  "Dawn",
  "Ember",
  "Ash",
  "Aurora",
  "Cove",
  "Cypress",
  "Echo",
  "Fern",
  "Forest",
  "Glade",
  "Hazel",
  "Iris",
  "Jade",
  "Lake",
  "Lark",
  "Luna",
  "Maple",
  "Meadow",
  "Mist",
  "Moon",
  "Oak",
  "Pearl",
  "Pine",
  "Rain",
  "Reed",
  "Robin",
  "Rose",
  "Rowan",
  "Ruby",
  "Sable",
  "Stone",
  "Thorn",
  "Vale",
  "Vera",
  "Vine",
  "Violet",
  "Wave",
  "Wren",
  "Zephyr",
];

const QWEN3_LANGUAGES = [
  "en",
  "zh",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "ru",
  "ar",
  "hi",
  "nl",
  "pl",
  "tr",
  "th",
  "vi",
  "id",
  "ms",
  "uk",
  "cs",
  "ro",
  "fi",
  "da",
  "sv",
  "no",
  "he",
  "hu",
  "sk",
  "hr",
];

function Qwen3TTSPanel() {
  const [activeTab, setActiveTab] = useState<"speak" | "design" | "clone">("speak");
  const [text, setText] = useState("The future belongs to those who build it.");
  const [voice, setVoice] = useState("Chelsie");
  const [language, setLanguage] = useState("en");
  const [voiceDesc, setVoiceDesc] = useState(
    "A warm, calm, authoritative male voice with a slight British accent",
  );
  const [cloneRef, setCloneRef] = useState("");
  const [cloneName, setCloneName] = useState("MyVoice");
  const [loading, setLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function run() {
    setLoading(true);
    setError("");
    setAudioSrc("");
    const t0 = Date.now();
    try {
      let method = "qwen3tts.speak";
      let params: Record<string, unknown> = {};
      if (activeTab === "speak") {
        method = "qwen3tts.speak";
        params = { text, voice, language };
      } else if (activeTab === "design") {
        method = "qwen3tts.design";
        params = { description: voiceDesc };
      } else {
        method = "qwen3tts.clone";
        params = { audio_path: cloneRef, name: cloneName };
      }
      const r = (await rpc("republic.plugins.call-gateway", { method, params })) as {
        result?: { outputPath?: string };
      };
      if (r?.result?.outputPath) {
        setAudioSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method, durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: `qwen3tts.${activeTab}`,
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
      pluginId="hoc-plugin-qwen3-tts"
      displayName="Qwen3-TTS"
      description="Alibaba Qwen3-TTS — synthesize with 45+ preset voices, design new voice personas from text descriptions, or clone any voice from a reference audio clip. 30+ languages supported."
      models={QWEN3_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        {/* Sub-mode tabs */}
        <div className="grid grid-cols-3 gap-2">
          {(["speak", "design", "clone"] as const).map((t) => (
            <button
type="button"               key={t}
              onClick={() => setActiveTab(t)}
              className={`py-2 rounded-xl text-xs font-semibold capitalize transition-colors ${activeTab === t ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {t === "speak" ? "🔊 Speak" : t === "design" ? "🎨 Design Voice" : "🧬 Clone Voice"}
            </button>
          ))}
        </div>

        {activeTab === "speak" && (
          <>
            <Card>
              <label className="block text-xs font-semibold text-text-muted mb-2">Text</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
                placeholder="Enter text to synthesize..."
              />
            </Card>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <label className="block text-xs font-semibold text-text-muted mb-2">Voice</label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {QWEN3_VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Card>
              <Card>
                <label className="block text-xs font-semibold text-text-muted mb-2">Language</label>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {QWEN3_LANGUAGES.map((l) => (
                    <button
type="button"                       key={l}
                      onClick={() => setLanguage(l)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${language === l ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}

        {activeTab === "design" && (
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Voice Description
            </label>
            <textarea
              value={voiceDesc}
              onChange={(e) => setVoiceDesc(e.target.value)}
              rows={4}
              placeholder="A warm, authoritative female voice with a slight Australian accent, calm and reassuring in tone..."
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
            />
            <p className="text-[10px] text-text-muted/60 mt-1">
              Describe the desired voice characteristics. Qwen3-TTS will create a matching voice
              persona.
            </p>
          </Card>
        )}

        {activeTab === "clone" && (
          <Card className="space-y-3">
            <PathInput
              label="Reference Audio"
              value={cloneRef}
              onChange={setCloneRef}
              placeholder="/path/to/voice-sample.wav (5–30 seconds ideal)"
            />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Voice Name</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="MyClonedVoice"
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
          </Card>
        )}

        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Volume2 size={14} />}
          className="w-full"
          disabled={
            activeTab === "speak"
              ? !text.trim()
              : activeTab === "design"
                ? !voiceDesc.trim()
                : !cloneRef.trim() || !cloneName.trim()
          }
        >
          {activeTab === "speak"
            ? "Synthesize"
            : activeTab === "design"
              ? "Design Voice"
              : "Clone Voice"}
        </Button>
        {audioSrc && <AudioPlayer src={audioSrc} />}
      </div>
    </PluginShell>
  );
}

// ─── MMAUDIO ─────────────────────────────────────────────────────

const MMAUDIO_MODELS = [
  {
    id: "mmaudio-large-44k-v2",
    name: "MMAudio Large 44kHz v2",
    sizeGb: 3.9,
    description: "Recommended — best quality",
    downloaded: false,
    required: true,
  },
  {
    id: "mmaudio-medium-44k",
    name: "MMAudio Medium 44kHz",
    sizeGb: 1.9,
    description: "Balanced speed/quality",
    downloaded: false,
  },
  {
    id: "mmaudio-small-16k",
    name: "MMAudio Small 16kHz",
    sizeGb: 0.6,
    description: "Fast, lower quality",
    downloaded: false,
  },
  {
    id: "synchformer",
    name: "Synchformer",
    sizeGb: 0.2,
    description: "Required for video sync",
    downloaded: false,
    required: true,
  },
  {
    id: "clip-vit-l14",
    name: "CLIP ViT-L/14 (vision encoder)",
    sizeGb: 0.9,
    description: "Required for video encoding",
    downloaded: false,
    required: true,
  },
];

function MMAudioPanel() {
  const [mode, setMode] = useState<"video-to-audio" | "text-to-audio" | "combined">(
    "video-to-audio",
  );
  const [videoPath, setVideoPath] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [duration, setDuration] = useState(8);
  const [numSteps, setNumSteps] = useState(25);
  const [cfgStrength, setCfgStrength] = useState(4.5);
  const [negPrompt, setNegPrompt] = useState("music, speech, voice");
  const [loading, setLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function generate() {
    const hasVideo = mode !== "text-to-audio" && videoPath.trim();
    const hasText = mode !== "video-to-audio" && textPrompt.trim();
    if (!hasVideo && !hasText) {
      return;
    }
    setLoading(true);
    setError("");
    setAudioSrc("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "mmaudio.synthesize",
        params: {
          video_path: hasVideo ? videoPath : undefined,
          text_prompt: textPrompt || undefined,
          duration_sec: duration,
          num_steps: numSteps,
          cfg_strength: cfgStrength,
          negative_prompt: negPrompt || undefined,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setAudioSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "mmaudio.synthesize", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "mmaudio.synthesize", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-mmaudio"
      displayName="MMAudio"
      description="CVPR 2025 — multimodal audio synthesis. Generate synchronized sound effects, ambient audio, or music from video content + text prompts. Uses CLIP + Synchformer for precise video-audio alignment."
      models={MMAUDIO_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(["video-to-audio", "text-to-audio", "combined"] as const).map((m) => (
            <button
type="button"               key={m}
              onClick={() => setMode(m)}
              className={`py-2 rounded-xl text-xs font-semibold transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {m === "video-to-audio"
                ? "🎬 Video → Audio"
                : m === "text-to-audio"
                  ? "📝 Text → Audio"
                  : "🔀 Combined"}
            </button>
          ))}
        </div>

        <Card className="space-y-3">
          {mode !== "text-to-audio" && (
            <PathInput
              label="Video File"
              value={videoPath}
              onChange={setVideoPath}
              placeholder="/path/to/video.mp4"
            />
          )}
          {mode !== "video-to-audio" && (
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Text Prompt
              </label>
              <textarea
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
                rows={3}
                placeholder="Rain falling on leaves, distant thunder, birds chirping..."
                className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
              />
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <Slider
              label="Duration"
              min={2}
              max={30}
              step={1}
              value={duration}
              onChange={setDuration}
              unit="s"
            />
            <Slider
              label="Diffusion Steps"
              min={10}
              max={50}
              step={5}
              value={numSteps}
              onChange={setNumSteps}
            />
          </Card>
          <Card className="space-y-3">
            <Slider
              label="CFG Strength"
              min={1}
              max={10}
              step={0.5}
              value={cfgStrength}
              onChange={setCfgStrength}
            />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Negative Prompt
              </label>
              <input
                type="text"
                value={negPrompt}
                onChange={(e) => setNegPrompt(e.target.value)}
                placeholder="music, speech..."
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              />
            </div>
          </Card>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Volume2 size={14} />}
          className="w-full"
          disabled={
            mode === "video-to-audio"
              ? !videoPath.trim()
              : mode === "text-to-audio"
                ? !textPrompt.trim()
                : !videoPath.trim() && !textPrompt.trim()
          }
        >
          Generate Synchronized Audio
        </Button>
        {audioSrc && <AudioPlayer src={audioSrc} />}
      </div>
    </PluginShell>
  );
}

// ─── Layout config ────────────────────────────────────────────────

const AUDIO_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-bark",
    name: "Bark",
    icon: "🐕",
    description: "Suno AI TTS — 100+ voices, music, sound effects, paralinguistic markup",
    status: "active",
  },
  {
    id: "hoc-plugin-chatterbox",
    name: "Chatterbox",
    icon: "💬",
    description: "Resemble AI TTS — Turbo/Standard/Multilingual + voice cloning",
    status: "active",
  },
  {
    id: "hoc-plugin-qwen3-tts",
    name: "Qwen3-TTS",
    icon: "🗣️",
    description: "Alibaba TTS — speak, design voice, clone voice, 30+ languages",
    status: "active",
  },
  {
    id: "hoc-plugin-mmaudio",
    name: "MMAudio",
    icon: "🎬",
    description: "CVPR 2025 — video-to-audio, text-to-audio, combined synthesis",
    status: "active",
  },
];

function renderAudioPanel(id: string) {
  switch (id) {
    case "hoc-plugin-bark":
      return <BarkPanel />;
    case "hoc-plugin-chatterbox":
      return <ChatterboxPanel />;
    case "hoc-plugin-qwen3-tts":
      return <Qwen3TTSPanel />;
    case "hoc-plugin-mmaudio":
      return <MMAudioPanel />;
    default:
      return null;
  }
}

export function AudioStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Audio Studio"
      categoryIcon={<Volume2 size={16} />}
      plugins={AUDIO_PLUGINS}
      renderPanel={renderAudioPanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
