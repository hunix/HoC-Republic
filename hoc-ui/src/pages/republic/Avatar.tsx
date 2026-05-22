/**
 * Avatar.tsx — Living Avatar Engine UI
 *
 * Full UI for the republic.avatar.* RPC endpoints.
 * Tabs: Conversation | Face State | Personality | Diagnostics
 */

import {
  Bot,
  MessageCircle,
  Activity,
  Sliders,
  BarChart2,
  Send,
  Plus,
  X,
  RefreshCw,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { PageHeader, Card, Badge, Button, Tabs, StatCard, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvatarSessionInfo {
  sessionId: string;
  userId: string;
  createdAt: number;
  turnCount: number;
}

interface AvatarMessage {
  role: "user" | "avatar";
  text: string;
  emotion?: string;
  intent?: string;
  timestamp: number;
}

interface AvatarFaceState {
  emotion: string;
  blendshapes: Record<string, number>;
  viseme: string | null;
  confidence: number;
}

interface AvatarPersonality {
  formality: number;
  proactivity: number;
  verbosity: number;
  empathy: number;
  humor: number;
  confidence: number;
  [key: string]: number;
}

interface AvatarDiagnostics {
  activeSessions: number;
  totalInteractions: number;
  supportedEmotions: string[];
  blendshapeCount: number;
  uptime: number;
  personality: AvatarPersonality;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const AVATAR_TABS = [
  { id: "conversation", label: "Conversation", icon: <MessageCircle size={14} /> },
  { id: "facemesh", label: "Face State", icon: <Activity size={14} /> },
  { id: "personality", label: "Personality", icon: <Sliders size={14} /> },
  { id: "diagnostics", label: "Diagnostics", icon: <BarChart2 size={14} /> },
];

// ─── Conversation Tab ─────────────────────────────────────────────────────────

function ConversationTab() {
  const { data, loading, error, refetch } = useRpc<{ sessions: AvatarSessionInfo[] }>(
    "republic.avatar.session.list",
    {},
  );
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<AvatarMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sessions = data?.sessions ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createSession = useCallback(async () => {
    setCreating(true);
    try {
      const res = await rpc<{ ok?: boolean; session?: { id: string } }>(
        "republic.avatar.session.create",
        { userId: `ui-user-${Date.now()}` },
      );
      if (res?.session?.id) {
        setActiveSession(res.session.id);
        setMessages([]);
        refetch();
      }
    } catch {
      /* silent */
    } finally {
      setCreating(false);
    }
  }, [refetch]);

  const endSession = useCallback(
    async (sessionId: string) => {
      await rpc("republic.avatar.session.end", { sessionId }).catch(() => null);
      if (activeSession === sessionId) {
        setActiveSession(null);
        setMessages([]);
      }
      refetch();
    },
    [activeSession, refetch],
  );

  const send = useCallback(async () => {
    if (!activeSession || !draft.trim() || sending) {
      return;
    }
    const text = draft.trim();
    setDraft("");
    setSending(true);

    const userMsg: AvatarMessage = { role: "user", text, timestamp: Date.now() };
    setMessages((m) => [...m, userMsg]);

    try {
      const res = await rpc<{
        response?: string;
        emotion?: string;
        intent?: string;
      }>("republic.avatar.speak", { sessionId: activeSession, text });

      const avatarMsg: AvatarMessage = {
        role: "avatar",
        text: res?.response ?? "…",
        emotion: res?.emotion,
        intent: res?.intent,
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, avatarMsg]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "avatar", text: "(RPC error — gateway may be offline)", timestamp: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  }, [activeSession, draft, sending]);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
      {/* Session sidebar */}
      <div className="space-y-3 overflow-y-auto">
        <Button
          icon={<Plus size={14} />}
          loading={creating}
          onClick={() => void createSession()}
          className="w-full"
        >
          New Session
        </Button>
        {sessions.length === 0 && (
          <p className="text-xs text-text-muted text-center py-6">No active sessions.</p>
        )}
        {sessions.map((s) => (
          <Card
            key={s.sessionId}
            className={`cursor-pointer hover:border-accent/40 transition-all ${
              activeSession === s.sessionId ? "border-accent/60 bg-accent/5" : ""
            }`}
            onClick={() => {
              setActiveSession(s.sessionId);
              setMessages([]);
            }}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-mono text-text-muted truncate">{s.sessionId}</p>
                <p className="text-[10px] text-text-muted/60 mt-0.5">
                  {s.turnCount} turns · {s.userId}
                </p>
              </div>
              <button
                type="button"
                className="p-1 text-text-muted hover:text-danger rounded transition-colors ml-1 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  void endSession(s.sessionId);
                }}
                title="End session"
              >
                <X size={12} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Chat area */}
      <div className="lg:col-span-2 flex flex-col">
        {!activeSession ? (
          <Card className="flex-1 flex items-center justify-center text-center">
            <div>
              <Bot size={40} className="text-text-muted/30 mx-auto mb-3" />
              <p className="text-sm text-text-muted">
                Select a session or create a new one to start chatting.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <Card className="flex-1 overflow-y-auto space-y-3 mb-3">
              {messages.length === 0 && (
                <p className="text-xs text-text-muted text-center py-6">
                  Say something to the avatar…
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-accent text-white rounded-br-sm"
                        : "bg-bg-secondary text-text-primary rounded-bl-sm"
                    }`}
                  >
                    <p className="leading-relaxed">{msg.text}</p>
                    {msg.emotion && (
                      <p className="text-[10px] mt-1 opacity-60">
                        😊 {msg.emotion}
                        {msg.intent ? ` · ${msg.intent}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-bg-secondary rounded-2xl rounded-bl-sm px-4 py-2.5">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </Card>

            <div className="flex gap-2">
              <input
                className="flex-1 px-4 py-2.5 bg-bg-secondary border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                placeholder="Say something…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
                disabled={sending}
              />
              <Button
                icon={<Send size={14} />}
                loading={sending}
                disabled={!draft.trim() || sending}
                onClick={() => void send()}
              >
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Face State Tab ───────────────────────────────────────────────────────────

function FaceStateTab() {
  const { data, loading, error, refetch } = useRpc<AvatarFaceState>(
    "republic.avatar.diagnostics",
    {},
  );

  const EMOTION_COLORS: Record<string, string> = {
    joy: "#f59e0b",
    sadness: "#6366f1",
    anger: "#ef4444",
    fear: "#8b5cf6",
    surprise: "#06b6d4",
    disgust: "#10b981",
    neutral: "#64748b",
  };

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  // Use diagnostics to approximate face state display
  const emotion = (data as unknown as AvatarDiagnostics)?.personality ? "neutral" : "neutral";
  const emotionColor = EMOTION_COLORS[emotion] ?? "#64748b";

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-6">
        {/* Emotion ring */}
        <div className="flex-shrink-0">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-4xl"
            style={{
              background: `${emotionColor}20`,
              border: `3px solid ${emotionColor}`,
              boxShadow: `0 0 20px ${emotionColor}40`,
            }}
          >
            😐
          </div>
          <p className="text-center text-xs text-text-muted mt-2 capitalize">{emotion}</p>
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1">
              Current Emotion
            </p>
            <Badge variant="neutral">{emotion}</Badge>
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1">
              Viseme
            </p>
            <span className="font-mono text-sm text-text-secondary">sil</span>
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
          Blendshapes (live face mesh)
        </p>
        <p className="text-sm text-text-muted text-center py-4">
          Blendshape data streams from an active avatar session. Start a conversation to see live
          face mesh values.
        </p>
      </Card>
    </div>
  );
}

// ─── Personality Tab ──────────────────────────────────────────────────────────

function PersonalityTab() {
  const { data, loading, error, refetch } = useRpc<{ personality: AvatarPersonality }>(
    "republic.avatar.personality",
    {},
  );

  const [traits, setTraits] = useState<AvatarPersonality | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.personality) {
      setTraits(data.personality);
    }
  }, [data]);

  const save = async () => {
    if (!traits) {
      return;
    }
    setSaving(true);
    try {
      await rpc("republic.avatar.personality", traits);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      refetch();
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const TRAIT_META: Array<{ key: keyof AvatarPersonality; label: string; desc: string }> = [
    { key: "formality", label: "Formality", desc: "How formal vs casual the avatar speaks" },
    {
      key: "proactivity",
      label: "Proactivity",
      desc: "Tendency to initiate conversations and topics",
    },
    { key: "verbosity", label: "Verbosity", desc: "How long and detailed responses are" },
    { key: "empathy", label: "Empathy", desc: "Emotional attunement to the user" },
    { key: "humor", label: "Humor", desc: "Frequency of light-hearted responses" },
    { key: "confidence", label: "Confidence", desc: "Self-assuredness in answers and tone" },
  ];

  return (
    <div className="space-y-4">
      <Card className="space-y-5">
        <h3 className="font-semibold text-text-heading flex items-center gap-2">
          <Sliders size={16} className="text-accent" /> Personality Traits
        </h3>
        {TRAIT_META.map(({ key, label, desc }) => {
          const val = traits?.[key] ?? 0.5;
          const pct = Math.round(val * 100);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <p className="text-sm font-medium text-text-primary">{label}</p>
                  <p className="text-xs text-text-muted">{desc}</p>
                </div>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{
                    color: pct > 70 ? "#10b981" : pct > 40 ? "#6366f1" : "#64748b",
                  }}
                >
                  {pct}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={val}
                onChange={(e) =>
                  setTraits((t) => (t ? { ...t, [key]: parseFloat(e.target.value) } : t))
                }
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${pct}%, var(--bg-input) ${pct}%, var(--bg-input) 100%)`,
                }}
              />
            </div>
          );
        })}
        <Button
          icon={saved ? undefined : <Sliders size={14} />}
          loading={saving}
          onClick={() => void save()}
          variant={saved ? "success" : "primary"}
          className="w-full"
        >
          {saved ? "✓ Saved!" : "Save Personality"}
        </Button>
      </Card>
    </div>
  );
}

// ─── Diagnostics Tab ──────────────────────────────────────────────────────────

function DiagnosticsTab() {
  const { data, loading, error, refetch } = useRpc<AvatarDiagnostics>(
    "republic.avatar.diagnostics",
    {},
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const d = data;
  const uptimeMin = d?.uptime != null ? Math.round(d.uptime / 60) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Active Sessions" value={d?.activeSessions ?? 0} icon={<Bot size={16} />} />
        <StatCard
          label="Total Interactions"
          value={(d?.totalInteractions ?? 0).toLocaleString()}
          icon={<MessageCircle size={16} />}
        />
        <StatCard
          label="Blendshapes"
          value={d?.blendshapeCount ?? 0}
          icon={<Activity size={16} />}
        />
        <StatCard
          label="Uptime"
          value={
            uptimeMin > 60 ? `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}m` : `${uptimeMin}m`
          }
          icon={<RefreshCw size={16} />}
        />
      </div>

      {d?.supportedEmotions && d.supportedEmotions.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
            Supported Emotions ({d.supportedEmotions.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {d.supportedEmotions.map((e) => (
              <span
                key={e}
                className="text-[11px] px-2.5 py-1 rounded-full bg-bg-secondary border border-border/40 text-text-muted"
              >
                {e}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AvatarPage() {
  const [tab, setTab] = useState("conversation");

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Living Avatar"
        description="Converse with the AI avatar — manage sessions, face state, personality and diagnostics"
        icon={<Bot size={28} />}
      />

      <Tabs tabs={AVATAR_TABS} active={tab} onChange={setTab} />

      {tab === "conversation" && <ConversationTab />}
      {tab === "facemesh" && <FaceStateTab />}
      {tab === "personality" && <PersonalityTab />}
      {tab === "diagnostics" && <DiagnosticsTab />}
    </div>
  );
}
