import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  FileText,
  RefreshCw,
  Radio,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type VoiceSession = {
  id: string;
  status: "active" | "paused" | "ended";
  citizenId?: string;
  startedAt?: number;
  transcript?: string[];
};

export function VoicePage() {
  const { data, loading, error, refetch } = useRpc<{ sessions?: VoiceSession[] }>(
    "republic.voice.sessions",
    {},
    [],
    { staleTimeMs: 4_000, refetchIntervalMs: 5_000 },
  );
  const { data: diagData } = useRpc<{ ready?: boolean; provider?: string }>(
    "republic.voice.diagnostics",
    {},
    [],
    { staleTimeMs: 10_000 },
  );
  const [speakText, setSpeakText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const sessions = data?.sessions ?? [];
  const active = sessions.filter((s) => s.status === "active").length;

  async function startSession() {
    try {
      await rpc("republic.voice.session.start", {});
      invalidateRpcCache("republic.voice.sessions");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function endSession(id: string) {
    try {
      await rpc("republic.voice.session.end", { sessionId: id });
      invalidateRpcCache("republic.voice.sessions");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function speak() {
    if (!speakText.trim()) {return;}
    setSpeaking(true);
    setActionError("");
    try {
      await rpc("republic.voice.speak", { text: speakText.trim() });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSpeaking(false);
    }
  }

  async function listen() {
    setListening(true);
    setActionError("");
    try {
      const r = await rpc<{ transcript?: string }>("republic.voice.listen", { duration: 5 });
      if (r?.transcript) {setTranscript((t) => [...t, r.transcript!]);}
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setListening(false);
    }
  }

  async function pauseSession(id: string) {
    try {
      await rpc("republic.voice.session.pause", { sessionId: id });
      invalidateRpcCache("republic.voice.sessions");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Voice I/O"
        description="Voice sessions, text-to-speech, speech-to-text, and live transcripts"
        icon={<Mic size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Active Sessions" value={active} icon={<Mic size={16} />} />
        <StatCard label="Total Sessions" value={sessions.length} icon={<Radio size={16} />} />
        <StatCard label="Provider" value={diagData?.provider ?? "—"} icon={<Volume2 size={16} />} />
        <StatCard
          label="Ready"
          value={diagData?.ready ? "Yes" : "No"}
          icon={<Activity size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TTS */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Volume2 size={16} /> Text to Speech
          </h3>
          <textarea
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted h-28 resize-none mb-3"
            placeholder="Enter text to speak aloud..."
            value={speakText}
            onChange={(e) => setSpeakText(e.target.value)}
          />
          <Button
            onClick={speak}
            loading={speaking}
            disabled={!speakText.trim()}
            icon={<Volume2 size={14} />}
          >
            Speak
          </Button>
        </Card>

        {/* STT */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Mic size={16} /> Speech to Text
          </h3>
          <p className="text-sm text-text-muted mb-3">
            Record 5 seconds of audio and get a transcript.
          </p>
          <Button
            onClick={listen}
            loading={listening}
            icon={listening ? <MicOff size={14} /> : <Mic size={14} />}
            className="mb-4"
          >
            {listening ? "Listening..." : "Listen (5s)"}
          </Button>
          {transcript.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Transcript
              </h4>
              {transcript.map((t, i) => (
                <div
                  key={i}
                  className="text-sm p-2 rounded bg-bg-secondary border border-border/30"
                >
                  "{t}"
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sessions */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-text-heading flex items-center gap-2">
            <FileText size={16} /> Voice Sessions
          </h3>
          <Button size="sm" onClick={startSession} icon={<Play size={12} />}>
            New Session
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-text-muted">No sessions. Start one above.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === "active" ? "bg-success animate-pulse" : "bg-border"}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-text-heading font-mono">
                      {s.id.slice(0, 12)}...
                    </p>
                    {s.citizenId && (
                      <p className="text-xs text-text-muted">Citizen: {s.citizenId}</p>
                    )}
                  </div>
                  <Badge variant={s.status === "active" ? "success" : "neutral"}>{s.status}</Badge>
                </div>
                <div className="flex gap-2">
                  {s.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<VolumeX size={12} />}
                      onClick={() => pauseSession(s.id)}
                    >
                      Pause
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Square size={12} />}
                    onClick={() => endSession(s.id)}
                  >
                    End
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Activity({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
