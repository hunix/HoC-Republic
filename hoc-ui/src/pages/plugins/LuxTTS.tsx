import { Volume2 } from "lucide-react";
import { useState } from "react";
import { Card, Button, Alert, PageHeader } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";

// ─── Shared helpers (from other studios) ──────────────────────────────────
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

// ─── LUXTTS ───────────────────────────────────────────────────────

const LUXTTS_MODELS = [
  {
    id: "YatharthS/LuxTTS",
    name: "LuxTTS Model",
    sizeGb: 1.2,
    description: "Main model for multi-language TTS and fast voice cloning",
    downloaded: false,
    required: true,
  },
];

const LUXTTS_LANGUAGES = [
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
];

function LuxTTSPanel() {
  const [text, setText] = useState("Hello! This is a test of the LuxTTS voice cloning system.");
  const [language, setLanguage] = useState("en");
  const [referenceAudio, setReferenceAudio] = useState("");
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
        method: "luxtts.generate",
        params: {
          text,
          target_lang: language,
          reference_audio: referenceAudio || undefined,
        },
      })) as { result?: { outputPath?: string } };
      
      if (r?.result?.outputPath) {
        setAudioSrc(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "luxtts.generate", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "luxtts.generate", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-luxtts"
      displayName="LuxTTS Voice Cloning"
      description="Zero-shot multi-language TTS and instant voice cloning. Provide a brief 5-10 second reference audio clip to match the speaker's voice in any language."
      models={LUXTTS_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="info">
          Zero-Shot Voice Cloning: For best results, use a high-quality 5–10 second clean reference audio without background noise. Leave blank for a default synthesized voice.
        </Alert>
        <Card>
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Text / Prompt
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Enter the text to synthesize..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Target Language</label>
          <div className="flex flex-wrap gap-1">
            {LUXTTS_LANGUAGES.map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-3 py-1 rounded text-[11px] font-mono transition-colors uppercase font-bold
                  ${language === l ? "bg-accent text-white" : "bg-bg-secondary text-text-muted hover:bg-bg-input"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <PathInput
            label="Voice Clone Reference Audio Path"
            value={referenceAudio}
            onChange={setReferenceAudio}
            placeholder="/paths/to/sample.wav (min 5s)"
            optional
          />
        </Card>

        {error && <Alert variant="danger">{error}</Alert>}
        
        <Button
          onClick={() => void generate()}
          loading={loading}
          icon={<Volume2 size={14} />}
          className="w-full h-12 text-lg"
          disabled={!text.trim()}
        >
          {referenceAudio ? "Clone & Synthesize" : "Synthesize Default"}
        </Button>
        
        {audioSrc && <AudioPlayer src={audioSrc} />}
      </div>
    </PluginShell>
  );
}

export function LuxTTSPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto animate-fade-in">
      <PageHeader
        title="LuxTTS Voice Cloning"
        description="Zero-shot cross-lingual text-to-speech and voice cloning."
        icon={<Volume2 size={24} className="text-accent" />}
      />

      {/* LuxTTS uses PluginShell, which occupies the page */}
      <LuxTTSPanel />
    </div>
  );
}
