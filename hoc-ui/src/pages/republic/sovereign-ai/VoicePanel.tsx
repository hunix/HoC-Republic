/**
 * Sovereign AI — Voice Engine Panel
 *
 * Displays STT + TTS provider availability, diagnostics,
 * and provides a quick test interface for speech synthesis.
 */

import { Mic, Volume2, Radio, Cpu, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Card, Badge, Button, RpcStatus, EmptyState, Alert } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

type VoiceProviders = {
  stt: string[];
  tts: string[];
};

export function VoicePanel() {
  const { data, loading, error, refetch } = useRpc<VoiceProviders>(
    "republic.sovereign.voice.providers",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 30_000 },
  );

  const [testText, setTestText] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthResult, setSynthResult] = useState<string | null>(null);
  const [synthError, setSynthError] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  if (!data) {
    return <EmptyState icon={<Mic size={40} />} title="Voice engine initializing..." />;
  }

  const sttProviders = data.stt ?? [];
  const ttsProviders = data.tts ?? [];
  const totalProviders = sttProviders.length + ttsProviders.length;

  const handleSynthesize = async () => {
    if (!testText.trim()) return;
    setSynthesizing(true);
    setSynthResult(null);
    setSynthError(null);
    try {
      const res = await rpc<{
        ok: boolean;
        result?: { audioBase64?: string; text?: string };
        error?: string;
      }>("republic.sovereign.voice.synthesize", { text: testText });
      if (res?.ok && res.result) {
        setSynthResult(
          `✅ Synthesized successfully (${res.result.audioBase64 ? "audio data received" : "completed"})`,
        );
      } else {
        setSynthError(res?.error ?? "Synthesis failed");
      }
    } catch (e) {
      setSynthError(e instanceof Error ? e.message : String(e));
    }
    setSynthesizing(false);
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{totalProviders}</p>
          <p className="text-xs text-text-muted">Total Providers</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-info">{sttProviders.length}</p>
          <p className="text-xs text-text-muted">STT Providers</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-accent">{ttsProviders.length}</p>
          <p className="text-xs text-text-muted">TTS Providers</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-success">
            {totalProviders > 0 ? "Online" : "Offline"}
          </p>
          <p className="text-xs text-text-muted">Status</p>
        </Card>
      </div>

      {/* STT Providers */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Mic size={14} /> Speech-to-Text (STT)
        </h4>
        <div className="flex flex-wrap gap-2">
          {sttProviders.length > 0 ? (
            sttProviders.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm text-text-primary font-medium">{p}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-text-muted">
              No STT providers available. Install Whisper via Ollama or set cloud API keys.
            </p>
          )}
        </div>
      </Card>

      {/* TTS Providers */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Volume2 size={14} /> Text-to-Speech (TTS)
        </h4>
        <div className="flex flex-wrap gap-2">
          {ttsProviders.length > 0 ? (
            ttsProviders.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-sm text-text-primary font-medium">{p}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-text-muted">
              No TTS providers available. Enable Bark, Chatterbox, or Qwen3-TTS plugins.
            </p>
          )}
        </div>
      </Card>

      {/* Test Synthesis */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Radio size={14} /> Test Synthesis
        </h4>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Enter text to synthesize..."
            className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSynthesize();
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSynthesize()}
            disabled={synthesizing || !testText.trim() || ttsProviders.length === 0}
          >
            {synthesizing ? "Synthesizing..." : "Test TTS"}
          </Button>
        </div>
        {synthResult && <Alert variant="success">{synthResult}</Alert>}
        {synthError && <Alert variant="danger">{synthError}</Alert>}
        {ttsProviders.length === 0 && (
          <p className="text-xs text-text-muted mt-1">
            <AlertCircle size={10} className="inline mr-1" />
            Enable a TTS plugin to test synthesis.
          </p>
        )}
      </Card>

      {/* Capabilities */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Cpu size={14} /> Capabilities
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Real-time Transcription", available: sttProviders.length > 0 },
            { label: "Multi-language STT", available: sttProviders.length > 0 },
            { label: "Voice Synthesis", available: ttsProviders.length > 0 },
            { label: "Streaming TTS", available: false },
            { label: "Voice Cloning", available: false },
            { label: "Voice Activity Detection", available: false },
          ].map((cap) => (
            <div key={cap.label} className="flex items-center gap-2 py-1">
              <Badge variant={cap.available ? "success" : "neutral"} className="text-[10px]">
                {cap.available ? "Ready" : "Planned"}
              </Badge>
              <span className="text-xs text-text-secondary">{cap.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
