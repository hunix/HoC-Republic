import DOMPurify from "dompurify";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  User,
  Brain,
  Briefcase,
  Users,
  Clock,
  Terminal,
  Database,
  Music,
  Image,
  File,
  Download,
  Package,
  Target,
  ChevronRight,
  Activity,
  Eye,
  Pause,
  Play,
  Send,
  AlertCircle,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Badge, Button, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────

interface CitizenFull {
  id: string;
  name: string;
  specialization?: string;
  role?: string;
  status: string;
  activity?: string;
  level?: number;
  generation?: number;
  age?: number;
  credits?: number;
  xp?: number;
  health?: number;
  happiness?: number;
  energy?: number;
  intelligence?: number;
  mastery?: number;
  autonomy?: number;
  masteryLevel?: number;
  autonomyScore?: number;
  intelligence_raw?: number;
  skills?: string[];
  traits?: string[];
  personality?: Record<string, number> | string;
  model?: string;
  node?: string;
  memorySize?: number;
  memoryTokens?: number;
  tasksCompleted?: number;
  projectsCreated?: number;
  createdAt?: number;
  avatar?: string;
  avatarUrl?: string;
  parentAId?: string;
  parentBId?: string;
  parentAName?: string;
  parentBName?: string;
  children?: { id: string; name: string }[];
  currentTask?: string;
  professionalProfile?: {
    certifications?: { domainPath: string; level: string; valid: boolean; earnedAt: string }[];
    jobHistory?: { title: string; from: string; to?: string }[];
    reputation?: number;
  };
  files?: { name: string; type: string; size: number; url: string }[];
  listings?: { id: string; title: string; category: string; price: number; rating: number }[];
  memoryEntries?: { id: string; content: string; timestamp: string; type?: string }[];
  goals?: {
    id: string;
    title: string;
    type: string;
    priority: number;
    progress: number;
    status: string;
    milestones: { title: string; completed: boolean }[];
  }[];
  family?: { id: string; name: string; relation: string }[];
  events?: { type: string; description: string; timestamp: string }[];
  dynamicDirectives?: string[];
}

interface IdentityCard {
  bio: string;
  appearance?: {
    faceShape: string;
    skinTone: string;
    eyeColor: string;
    eyeShape: string;
    hairStyle: string;
    hairColor: string;
    facialHair: string | null;
    distinguishingFeatures: string[];
    height: number;
    build: string;
  };
  voice?: {
    pitch: number;
    timbre: string;
    speechRate: number;
    accent: string;
    cadence: string;
    catchPhrases: string[];
    volumeTendency: number;
  };
  habits?: {
    workStyle: string;
    socialPreference: string;
    decisionStyle: string;
    stressResponse: string;
    hobbies: string[];
    rituals: string[];
    favoriteTopics: string[];
  };
  personality?: Record<string, number>;
}

// ─── Status helpers ───────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "success" | "neutral" | "info" | "danger"> = {
  active: "success",
  Active: "success",
  idle: "neutral",
  Idle: "neutral",
  sleeping: "info",
  Sleeping: "info",
  error: "danger",
  Error: "danger",
};

function StatBar({
  label,
  value,
  max = 100,
  color,
}: {
  label: string;
  value: number;
  max?: number;
  color: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="font-bold" style={{ color }}>
          {value.toFixed(1)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-bg-input overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") {
    return null;
  }
  return (
    <div className="flex justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-xs text-text-primary font-medium max-w-xs text-right">
        {String(value)}
      </span>
    </div>
  );
}

function Tag({ children, color = "accent" }: { children: React.ReactNode; color?: string }) {
  const classes: Record<string, string> = {
    accent: "bg-accent/10 text-accent border-accent/20",
    info: "bg-info/10 text-info border-info/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
  };
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full border ${classes[color] ?? classes.accent}`}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3 mt-5 first:mt-0">
      {children}
    </p>
  );
}

// ─── File Preview ─────────────────────────────────────────────────

function FilePreview({
  file,
}: {
  file: { name: string; type: string; size: number; url: string };
}) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
  const isAudio = ["mp3", "wav", "ogg", "flac", "aac"].includes(ext);
  const isVideo = ["mp4", "webm"].includes(ext);
  const sizeKB = (file.size / 1024).toFixed(1);
  const iconEl = isImage ? (
    <Image size={14} className="text-info" />
  ) : isAudio ? (
    <Music size={14} className="text-success" />
  ) : isVideo ? (
    <Play size={14} className="text-warning" />
  ) : (
    <File size={14} className="text-text-muted" />
  );

  return (
    <div className="border border-border/40 rounded-xl overflow-hidden bg-bg-secondary">
      {isImage && (
        <div className="w-full h-36 bg-bg-input flex items-center justify-center overflow-hidden">
          <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain" />
        </div>
      )}
      {isAudio && (
        <div className="p-3 bg-bg-input">
          <audio controls className="w-full h-8" style={{ height: 32 }}>
            <source src={file.url} />
          </audio>
        </div>
      )}
      {isVideo && (
        <div className="w-full h-36 bg-black flex items-center justify-center">
          <video controls className="max-w-full max-h-full">
            <source src={file.url} />
          </video>
        </div>
      )}
      <div className="p-2 flex items-center gap-2">
        {iconEl}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-text-primary truncate">{file.name}</p>
          <p className="text-[10px] text-text-muted">
            {file.type} · {sizeKB} KB
          </p>
        </div>
        <a href={file.url} download className="text-accent hover:text-accent/80">
          <Download size={13} />
        </a>
      </div>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "identity", label: "Identity", icon: Eye },
  { id: "vitals", label: "Vitals", icon: Activity },
  { id: "cognitive", label: "Cognitive", icon: Brain },
  { id: "memory", label: "Memory", icon: Database },
  { id: "reasoning", label: "Reasoning", icon: Brain },
  { id: "goals", label: "Goals & Agency", icon: Target },
  { id: "productions", label: "Productions", icon: Package },
  { id: "skills", label: "Skills & Career", icon: Briefcase },
  { id: "education", label: "Education", icon: Briefcase },
  { id: "family", label: "Family & Social", icon: Users },
  { id: "evolution", label: "Cognitive Evolution", icon: Target },
  { id: "history", label: "History", icon: Clock },
  { id: "command", label: "Command Center", icon: Terminal },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Overview Tab ─────────────────────────────────────────────────

function OverviewTab({ c }: { c: CitizenFull }) {
  const personality =
    typeof c.personality === "object" && c.personality !== null ? c.personality : {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Credits", value: `¢${(c.credits ?? 0).toLocaleString()}` },
          { label: "Level", value: c.level ?? "—" },
          { label: "Tasks Done", value: (c.tasksCompleted ?? 0).toLocaleString() },
          { label: "Projects", value: (c.projectsCreated ?? 0).toLocaleString() },
        ].map((s) => (
          <div key={s.label} className="bg-bg-secondary rounded-xl p-3 text-center">
            <p className="font-bold text-lg text-text-heading">{s.value}</p>
            <p className="text-[11px] text-text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="space-y-3">
          <SectionTitle>Vitals</SectionTitle>
          <StatBar label="Energy" value={c.energy ?? 0} color="#f59e0b" />
          <StatBar label="Health" value={c.health ?? 0} color="#10b981" />
          <StatBar label="Happiness" value={c.happiness ?? 0} color="#ec4899" />
        </Card>
        <Card className="space-y-3">
          <SectionTitle>Cognitive Profile</SectionTitle>
          <StatBar label="Intelligence" value={c.intelligence ?? 0} color="#6366f1" />
          <StatBar label="Mastery" value={c.mastery ?? 0} color="#06b6d4" />
          <StatBar label="Autonomy" value={c.autonomy ?? 0} color="#10b981" />
        </Card>
      </div>
      {Object.keys(personality).length > 0 && (
        <Card>
          <SectionTitle>Big Five Personality</SectionTitle>
          <div className="space-y-2">
            {Object.entries(personality).map(([k, v]) => (
              <StatBar
                key={k}
                label={k.charAt(0).toUpperCase() + k.slice(1)}
                value={(v as number) * 100}
                color="#8b5cf6"
              />
            ))}
          </div>
        </Card>
      )}
      <Card>
        <SectionTitle>Quick Info</SectionTitle>
        <InfoRow label="Specialization" value={c.specialization ?? c.role} />
        <InfoRow label="Current Activity" value={c.activity} />
        <InfoRow label="Current Task" value={c.currentTask} />
        <InfoRow label="Model" value={c.model} />
        <InfoRow label="Node" value={c.node} />
        <InfoRow label="Generation" value={c.generation != null ? `Gen ${c.generation}` : null} />
        <InfoRow label="Age" value={c.age != null ? `${c.age.toFixed(0)} cycles` : null} />
        <InfoRow
          label="Memory Tokens"
          value={c.memoryTokens != null ? `${(c.memoryTokens / 1000).toFixed(1)}k` : null}
        />
        <InfoRow
          label="Created"
          value={c.createdAt ? new Date(c.createdAt).toLocaleDateString() : null}
        />
        <InfoRow label="ID" value={c.id} />
      </Card>
    </div>
  );
}

// ─── Identity Tab ─────────────────────────────────────────────────

function IdentityTab({ citizenId }: { citizenId: string }) {
  const { data, loading, error, refetch } = useRpc<{ ok: boolean; identity?: IdentityCard }>(
    "republic.citizen.identity.get", // ← was "republic.citizen.identity" (incorrect)
    { citizenId },
  );
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const identity = data?.identity;
  if (!identity) {
    return <p className="text-sm text-text-muted py-8">No identity data available.</p>;
  }

  const { appearance, voice, habits } = identity;
  return (
    <div className="space-y-4">
      {identity.bio && (
        <Card>
          <SectionTitle>Biography</SectionTitle>
          <p className="text-sm text-text-secondary leading-relaxed">{identity.bio}</p>
        </Card>
      )}
      {appearance && (
        <Card>
          <SectionTitle>Appearance</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6">
            <InfoRow label="Face Shape" value={appearance.faceShape} />
            <InfoRow label="Build" value={appearance.build} />
            <InfoRow label="Height" value={`${appearance.height} cm`} />
            <InfoRow label="Eye Shape" value={appearance.eyeShape} />
            <InfoRow label="Hair Style" value={appearance.hairStyle?.replace(/_/g, " ")} />
            <InfoRow label="Facial Hair" value={appearance.facialHair ?? "None"} />
          </div>
          <div className="flex gap-3 mt-3">
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full border border-border/50"
                style={{ background: appearance.skinTone }}
              />
              <span className="text-xs text-text-muted">Skin</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full border border-border/50"
                style={{ background: appearance.eyeColor }}
              />
              <span className="text-xs text-text-muted">Eyes</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full border border-border/50"
                style={{ background: appearance.hairColor }}
              />
              <span className="text-xs text-text-muted">Hair</span>
            </div>
          </div>
          {appearance.distinguishingFeatures.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-text-muted mb-1.5">Distinguishing Features</p>
              <div className="flex flex-wrap gap-1.5">
                {appearance.distinguishingFeatures.map((f, i) => (
                  <Tag key={i}>{f}</Tag>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
      {voice && (
        <Card>
          <SectionTitle>Voice Profile</SectionTitle>
          <InfoRow label="Pitch" value={`${voice.pitch} Hz`} />
          <InfoRow label="Timbre" value={voice.timbre} />
          <InfoRow label="Cadence" value={voice.cadence} />
          <InfoRow label="Speech Rate" value={`${voice.speechRate} WPM`} />
          <InfoRow label="Accent" value={voice.accent?.replace(/_/g, " ")} />
          <InfoRow label="Volume" value={`${Math.round(voice.volumeTendency * 100)}%`} />
          {voice.catchPhrases?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-text-muted mb-1.5">Catchphrases</p>
              <div className="space-y-1">
                {voice.catchPhrases.map((p, i) => (
                  <p key={i} className="text-xs text-text-secondary italic">
                    "{p}"
                  </p>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
      {habits && (
        <Card>
          <SectionTitle>Habits & Lifestyle</SectionTitle>
          <InfoRow label="Work Style" value={habits.workStyle?.replace(/_/g, " ")} />
          <InfoRow label="Social Preference" value={habits.socialPreference} />
          <InfoRow label="Decision Style" value={habits.decisionStyle} />
          <InfoRow label="Stress Response" value={habits.stressResponse?.replace(/_/g, " ")} />
          {habits.hobbies?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-text-muted mb-1.5">Hobbies</p>
              <div className="flex flex-wrap gap-1.5">
                {habits.hobbies.map((h, i) => (
                  <Tag key={i} color="info">
                    {h}
                  </Tag>
                ))}
              </div>
            </div>
          )}
          {habits.favoriteTopics?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-text-muted mb-1.5">Favorite Topics</p>
              <div className="flex flex-wrap gap-1.5">
                {habits.favoriteTopics.map((t, i) => (
                  <Tag key={i} color="success">
                    {t}
                  </Tag>
                ))}
              </div>
            </div>
          )}
          {habits.rituals?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-text-muted mb-1.5">Daily Rituals</p>
              <div className="flex flex-wrap gap-1.5">
                {habits.rituals.map((r, i) => (
                  <Tag key={i} color="warning">
                    {r}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Vitals Tab ───────────────────────────────────────────────────

function VitalsTab({ c }: { c: CitizenFull }) {
  const vitals = [
    {
      label: "Energy",
      value: c.energy ?? 0,
      color: "#f59e0b",
      icon: "⚡",
      desc: "Current energy reserves. Drops with activity, restores with sleep.",
    },
    {
      label: "Health",
      value: c.health ?? 0,
      color: "#10b981",
      icon: "🫀",
      desc: "Physical health rating. Drops from overwork and stress.",
    },
    {
      label: "Happiness",
      value: c.happiness ?? 0,
      color: "#ec4899",
      icon: "😊",
      desc: "Emotional wellbeing. Influenced by social interactions and goals.",
    },
  ];
  return (
    <div className="space-y-4">
      {vitals.map((v) => (
        <Card key={v.label}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{v.icon}</span>
            <div>
              <p className="font-semibold text-text-heading">{v.label}</p>
              <p className="text-xs text-text-muted">{v.desc}</p>
            </div>
            <span className="ml-auto text-2xl font-bold" style={{ color: v.color }}>
              {v.value.toFixed(1)}
            </span>
          </div>
          <div className="h-3 rounded-full bg-bg-input overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, v.value)}%`, background: v.color }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted mt-1">
            <span>0</span>
            <span>100</span>
          </div>
        </Card>
      ))}
      <Card>
        <SectionTitle>Status Detail</SectionTitle>
        <InfoRow label="Current Status" value={c.status} />
        <InfoRow label="Current Activity" value={c.activity} />
        <InfoRow label="Current Task" value={c.currentTask ?? "—"} />
        <InfoRow label="XP" value={(c.xp ?? 0).toLocaleString()} />
      </Card>
    </div>
  );
}

// ─── Cognitive Tab ────────────────────────────────────────────────

function CognitiveTab({ c }: { c: CitizenFull }) {
  const attrs = [
    { label: "Intelligence", value: c.intelligence ?? 0, color: "#6366f1" },
    { label: "Mastery", value: c.mastery ?? 0, color: "#06b6d4" },
    { label: "Autonomy", value: c.autonomy ?? 0, color: "#10b981" },
  ];
  const personality =
    typeof c.personality === "object" && c.personality !== null
      ? (c.personality as Record<string, number>)
      : {};
  const eliteScore = attrs.reduce((s, a) => s + a.value, 0) / attrs.length;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>Core Attributes</SectionTitle>
        <div className="space-y-3">
          {attrs.map((a) => (
            <StatBar key={a.label} label={a.label} value={a.value} color={a.color} />
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl bg-bg-input text-center">
          <p
            className="text-2xl font-bold"
            style={{ color: eliteScore >= 90 ? "#f59e0b" : "#6366f1" }}
          >
            {eliteScore.toFixed(1)}
          </p>
          <p className="text-xs text-text-muted mt-1">Elite Score</p>
        </div>
      </Card>
      {Object.keys(personality).length > 0 && (
        <Card>
          <SectionTitle>Personality Vector (Big Five)</SectionTitle>
          <div className="space-y-2">
            {Object.entries(personality).map(([k, v]) => (
              <StatBar
                key={k}
                label={k.charAt(0).toUpperCase() + k.slice(1)}
                value={(v as number) * 100}
                color="#8b5cf6"
              />
            ))}
          </div>
        </Card>
      )}
      <Card>
        <SectionTitle>Traits</SectionTitle>
        {c.traits && c.traits.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {c.traits.map((t, i) => (
              <Tag key={i}>{t}</Tag>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No traits recorded.</p>
        )}
      </Card>
    </div>
  );
}

// ─── Evolution Tab ────────────────────────────────────────────────

function EvolutionTab({ c }: { c: CitizenFull }) {
  const directives = c.dynamicDirectives ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>Learned Directives (Project Recursion)</SectionTitle>
        <p className="text-xs text-text-muted mb-4">
          These are prompt constraints synthesized autonomously by examining this citizen's action
          history. They act as absolute bounds on their future decision-making parameters.
        </p>

        {directives.length === 0 ? (
          <div className="py-8 text-center bg-bg-input rounded-xl border border-border/20">
            <Target size={24} className="mx-auto text-text-muted/30 mb-2" />
            <p className="text-sm text-text-secondary font-medium">No Directives Synthesized</p>
            <p className="text-xs text-text-muted mt-1">
              This citizen's action history shows no recurring critical failures.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {directives.map((directive, idx) => (
              <div
                key={idx}
                className="p-3 bg-danger-bg border border-danger/30 rounded-lg flex items-start gap-3"
              >
                <div className="mt-0.5 w-6 h-6 flex items-center justify-center bg-danger/10 text-danger rounded-md text-[10px] font-bold shrink-0">
                  {idx + 1}
                </div>
                <p className="text-sm text-text-primary leading-relaxed">{directive}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Memory Tab ───────────────────────────────────────────────────

function MemoryTab({ c }: { c: CitizenFull }) {
  const [mode, setMode] = useState<"episodic" | "semantic" | "ltm">("episodic");
  const [ltmQuery, setLtmQuery] = useState("");
  const [ltmSearchQuery, setLtmSearchQuery] = useState("");

  const { data: episodicData, loading: epLoading } = useRpc<{
    episodic?: {
      id: string;
      content: string;
      timestamp: string;
      strength?: number;
      type?: string;
    }[];
  }>("republic.memory.citizen.episodic", { citizenId: c.id, count: 30 });

  const { data: semanticData, loading: semLoading } = useRpc<{
    semantic?: { concept: string; weight: number; lastUpdated?: string }[];
  }>("republic.memory.citizen.semantic", { citizenId: c.id });

  const episodicEntries = episodicData?.episodic ?? [];
  const semanticEntries = semanticData?.semantic ?? [];
  const loading = epLoading || semLoading;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center">
          <p className="text-2xl font-bold text-text-heading">{episodicEntries.length}</p>
          <p className="text-xs text-text-muted mt-1">Episodic Memories</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-text-heading">{semanticEntries.length}</p>
          <p className="text-xs text-text-muted mt-1">Semantic Concepts</p>
        </Card>
      </div>

      {/* Subtab selector */}
      <div className="flex gap-2 flex-wrap">
        {(["episodic", "semantic", "ltm"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              mode === m
                ? "bg-accent text-white"
                : "bg-bg-secondary text-text-muted hover:text-text-primary"
            }`}
          >
            {m === "ltm" ? "Long-Term Facts ∞" : m}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Loading memories…</span>
        </div>
      )}

      {mode === "episodic" && !loading && (
        <Card>
          <SectionTitle>Episodic Memory ({episodicEntries.length} events)</SectionTitle>
          {episodicEntries.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">
              No episodic memories recorded yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {episodicEntries.map((e, i) => (
                <div
                  key={e.id ?? i}
                  className="p-2.5 rounded-lg bg-bg-input border border-border/30"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {e.type && (
                      <span className="text-[10px] font-semibold text-accent uppercase tracking-wide">
                        {e.type}
                      </span>
                    )}
                    {e.strength != null && (
                      <div className="ml-auto flex items-center gap-1">
                        <div className="w-12 h-1 rounded-full bg-bg-primary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${Math.min(100, e.strength * 100)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-text-muted">
                          {(e.strength * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">{e.content}</p>
                  <p className="text-[10px] text-text-muted mt-1">
                    {new Date(e.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {mode === "semantic" && !loading && (
        <Card>
          <SectionTitle>Semantic Knowledge ({semanticEntries.length} concepts)</SectionTitle>
          {semanticEntries.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">
              No semantic knowledge recorded yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {semanticEntries.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 rounded-lg bg-bg-input border border-border/20"
                >
                  <p className="text-xs text-text-primary font-medium flex-1 truncate">
                    {e.concept}
                  </p>
                  <div className="w-20 h-1.5 rounded-full bg-bg-primary overflow-hidden flex-shrink-0">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(100, e.weight * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted w-8 text-right">
                    {(e.weight * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {mode === "ltm" && (
        <LtmPanel citizenId={c.id} query={ltmQuery} setQuery={setLtmQuery} searchQuery={ltmSearchQuery} setSearchQuery={setLtmSearchQuery} />
      )}
    </div>
  );
}

// ─── Long-Term Memory (mem0) Panel ────────────────────────────────

interface LtmFact {
  id: string;
  memory: string;
  categories: string[];
  importance: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  reinforcements: number;
  score?: number;
}

const LTM_CATEGORY_COLORS: Record<string, string> = {
  skills: "bg-accent/15 text-accent",
  relationships: "bg-info/15 text-info",
  preferences: "bg-warning/15 text-warning",
  goals: "bg-success/15 text-success",
  achievements: "bg-purple-500/15 text-purple-400",
  beliefs: "bg-red-500/15 text-red-400",
  experiences: "bg-orange-500/15 text-orange-400",
  knowledge: "bg-cyan-500/15 text-cyan-400",
  emotional_state: "bg-pink-500/15 text-pink-400",
  work: "bg-indigo-500/15 text-indigo-400",
  personal_info: "bg-teal-500/15 text-teal-400",
  general: "bg-bg-secondary text-text-muted",
};

function LtmPanel({
  citizenId,
  query,
  setQuery,
  searchQuery,
  setSearchQuery,
}: {
  citizenId: string;
  query: string;
  setQuery: (q: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Base list: all facts
  const {
    data: listData,
    loading: listLoading,
    error: listError,
    refetch: refetchList,
  } = useRpc<{ ok: boolean; facts?: LtmFact[]; total?: number }>(
    "memory.facts.list",
    { citizenId, limit: 100 },
  );

  // Semantic search results (only when searchQuery is populated)
  const {
    data: searchData,
    loading: searchLoading,
  } = useRpc<{ ok: boolean; results?: (LtmFact & { score: number })[] }>(
    "memory.facts.search",
    { citizenId, query: searchQuery, topK: 20 },
    [searchQuery],
    undefined,
  );

  const isSearching = searchQuery.length > 1;
  const facts: LtmFact[] = isSearching
    ? (searchData?.results ?? [])
    : (listData?.facts ?? []);
  const total = listData?.total ?? 0;
  const loading = isSearching ? searchLoading : listLoading;

  const handleDelete = async (factId: string) => {
    setDeletingId(factId);
    try {
      await rpc("memory.facts.delete", { citizenId, factId });
      refetchList();
    } catch {
      /* silent */
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center">
          <p className="text-2xl font-bold text-accent">∞</p>
          <p className="text-xs text-text-muted mt-1">Unlimited Storage</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-text-heading">{total}</p>
          <p className="text-xs text-text-muted mt-1">Facts Accumulated</p>
        </Card>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Type to search memories semantically…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Debounce: only trigger search after user stops typing
            clearTimeout((window as unknown as Record<string, unknown>).__ltmTimer as ReturnType<typeof setTimeout>);
            (window as unknown as Record<string, unknown>).__ltmTimer = setTimeout(() => setSearchQuery(e.target.value), 500);
          }}
          className="flex-1 bg-bg-secondary border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setQuery(""); setSearchQuery(""); }}
          >
            ✕
          </Button>
        )}
      </div>

      {isSearching && searchData?.results?.length === 0 && !searchLoading && (
        <p className="text-xs text-text-muted text-center py-4">No facts match your query.</p>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-4 text-text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">{isSearching ? "Searching…" : "Loading facts…"}</span>
        </div>
      )}

      {listError && !isSearching && (
        <p className="text-xs text-danger py-2">Error loading facts. Citizen may have no long-term memories yet — they will accumulate as the simulation runs.</p>
      )}

      {!loading && facts.length === 0 && !isSearching && !listError && (
        <Card>
          <div className="py-8 text-center">
            <Database size={28} className="mx-auto text-text-muted/30 mb-3" />
            <p className="text-sm text-text-secondary font-medium">No Long-Term Facts Yet</p>
            <p className="text-xs text-text-muted mt-2 max-w-xs mx-auto">
              Facts accumulate automatically as this citizen's cognitive loop runs. Each interaction extracts and deduplicates salient facts.
            </p>
          </div>
        </Card>
      )}

      {facts.length > 0 && !loading && (
        <Card>
          <SectionTitle>
            {isSearching
              ? `Search Results (${facts.length} relevant)`
              : `All Facts (${facts.length} shown of ${total})`}
          </SectionTitle>
          <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
            {facts.map((f) => (
              <div
                key={f.id}
                className="p-3 rounded-lg bg-bg-input border border-border/20 hover:border-border/40 transition-colors group"
              >
                <div className="flex items-start gap-2 mb-1.5">
                  {/* Importance stars */}
                  <span className="text-[10px] text-warning shrink-0 mt-0.5">
                    {"★".repeat(Math.min(5, Math.round((f.importance ?? 0) * 5)))}
                    {"☆".repeat(Math.max(0, 5 - Math.min(5, Math.round((f.importance ?? 0) * 5))))}
                  </span>
                  <p className="text-xs text-text-primary leading-relaxed flex-1">{f.memory}</p>
                  {/* Delete button */}
                  <button
                    type="button"
                    aria-label="Delete this memory fact"
                    onClick={() => void handleDelete(f.id)}
                    disabled={deletingId === f.id}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all text-[10px] shrink-0"
                  >
                    {deletingId === f.id ? "…" : "✕"}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(f.categories ?? []).map((cat) => (
                    <span
                      key={cat}
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide ${LTM_CATEGORY_COLORS[cat] ?? LTM_CATEGORY_COLORS.general}`}
                    >
                      {cat.replace("_", " ")}
                    </span>
                  ))}
                  <span className="text-[9px] text-text-muted ml-auto">
                    {f.source} · {f.reinforcements > 0 ? `×${f.reinforcements} reinforced · ` : ""}{new Date(f.createdAt).toLocaleDateString()}
                  </span>
                  {f.score != null && (
                    <span className="text-[9px] text-accent font-medium">
                      {(f.score * 100).toFixed(0)}% match
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Reasoning Tab ────────────────────────────────────────────────

function ReasoningTab({ citizen }: { citizen: CitizenFull }) {
  const { data } = useRpc<{
    chains?: {
      id: string;
      citizenName: string;
      type: string;
      status: string;
      steps: number;
      confidence: number;
    }[];
  }>("republic.reasoning.list", {});
  const chain = data?.chains?.find((ch) => ch.id === citizen.id);
  const confidencePct = (chain?.confidence ?? 0) * 100;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>Reasoning Status</SectionTitle>
        {chain ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center bg-bg-input rounded-xl p-3">
                <p className="font-bold text-text-heading">{chain.type}</p>
                <p className="text-[11px] text-text-muted">Type</p>
              </div>
              <div className="text-center bg-bg-input rounded-xl p-3">
                <p className="font-bold text-text-heading">{chain.steps}</p>
                <p className="text-[11px] text-text-muted">Steps</p>
              </div>
              <div className="text-center bg-bg-input rounded-xl p-3">
                <span
                  className={`font-bold ${chain.status === "active" ? "text-success" : "text-text-muted"}`}
                >
                  {chain.status}
                </span>
                <p className="text-[11px] text-text-muted">Status</p>
              </div>
            </div>
            <SectionTitle>Confidence</SectionTitle>
            <StatBar label="Confidence" value={confidencePct} color="#6366f1" />
          </>
        ) : (
          <p className="text-sm text-text-muted text-center py-6">
            No active reasoning chain for this citizen.
          </p>
        )}
      </Card>
      <Card>
        <SectionTitle>Thinking Pattern</SectionTitle>
        <InfoRow label="Activity" value={citizen.activity} />
        <InfoRow label="Intelligence" value={`${(citizen.intelligence ?? 0).toFixed(1)}`} />
        <p className="text-xs text-text-muted mt-3 leading-relaxed">
          {citizen.activity === "Thinking" || citizen.activity === "Researching"
            ? "This citizen is actively processing information using deductive reasoning."
            : citizen.activity === "Learning"
              ? "This citizen is building new knowledge patterns through inductive reasoning."
              : "This citizen is forming hypotheses from observations (abductive reasoning)."}
        </p>
      </Card>
    </div>
  );
}

// ─── Goals & Agency Tab ───────────────────────────────────────────

function GoalsTab({ c }: { c: CitizenFull }) {
  const goals = c.goals ?? [];
  const GOAL_COLORS: Record<string, string> = {
    active: "success",
    completed: "neutral",
    abandoned: "danger",
    blocked: "info",
  };

  if (goals.length === 0) {
    return (
      <Card className="py-12 text-center">
        <Target size={32} className="text-text-muted/30 mx-auto mb-3" />
        <p className="text-sm text-text-muted">No active goals found for this citizen.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Goals", value: goals.length },
          { label: "Active", value: goals.filter((g) => g.status === "active").length },
          { label: "Completed", value: goals.filter((g) => g.status === "completed").length },
        ].map((s) => (
          <div key={s.label} className="bg-bg-secondary rounded-xl p-3 text-center">
            <p className="font-bold text-lg text-text-heading">{s.value}</p>
            <p className="text-[11px] text-text-muted">{s.label}</p>
          </div>
        ))}
      </div>
      {goals.map((g) => (
        <Card key={g.id}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-semibold text-text-heading text-sm">{g.title}</p>
              <p className="text-[11px] text-text-muted mt-0.5">{g.type?.replace(/_/g, " ")}</p>
            </div>
            <Badge
              variant={
                (GOAL_COLORS[g.status] as "success" | "neutral" | "info" | "danger") || "neutral"
              }
            >
              {g.status}
            </Badge>
          </div>
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-muted">Progress</span>
              <span className="font-bold text-accent">{g.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-bg-input overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${g.progress}%` }}
              />
            </div>
          </div>
          {g.milestones?.length > 0 && (
            <div className="space-y-1">
              {g.milestones.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div
                    className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${m.completed ? "bg-success border-success" : "border-border"}`}
                  />
                  <span
                    className={m.completed ? "line-through text-text-muted" : "text-text-secondary"}
                  >
                    {m.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ─── Productions Tab ──────────────────────────────────────────────

function ProductionsTab({ c, navigate }: { c: CitizenFull; navigate: (to: string) => void }) {
  const files = c.files ?? [];
  const listings = c.listings ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg-secondary rounded-xl p-3 text-center">
          <p className="font-bold text-lg text-text-heading">{files.length}</p>
          <p className="text-[11px] text-text-muted">Files</p>
        </div>
        <div className="bg-bg-secondary rounded-xl p-3 text-center">
          <p className="font-bold text-lg text-text-heading">{listings.length}</p>
          <p className="text-[11px] text-text-muted">Listings</p>
        </div>
        <div className="bg-bg-secondary rounded-xl p-3 text-center">
          <p className="font-bold text-lg text-text-heading">{c.projectsCreated ?? 0}</p>
          <p className="text-[11px] text-text-muted">Projects</p>
        </div>
      </div>

      {files.length > 0 ? (
        <div>
          <SectionTitle>Files & Media</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {files.map((f, i) => (
              <FilePreview key={i} file={f} />
            ))}
          </div>
        </div>
      ) : (
        <Card className="py-8 text-center">
          <Package size={28} className="text-text-muted/30 mx-auto mb-2" />
          <p className="text-sm text-text-muted">
            No files found in republic-output for this citizen.
          </p>
        </Card>
      )}

      {listings.length > 0 && (
        <div>
          <SectionTitle>Marketplace Listings</SectionTitle>
          <div className="space-y-2">
            {listings.map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => navigate(`/store?listing=${l.id}`)}
                className="w-full text-left p-3 rounded-xl border border-border/40 bg-bg-secondary hover:border-accent/50 hover:bg-accent/5 transition-all flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-heading truncate">{l.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">{l.category}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-accent">¢{l.price}</p>
                  <p className="text-[11px] text-text-muted">★{l.rating?.toFixed(1)}</p>
                </div>
                <ChevronRight size={14} className="text-text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skills & Career Tab ──────────────────────────────────────────

function SkillsTab({ c }: { c: CitizenFull }) {
  const certs = c.professionalProfile?.certifications ?? [];
  const jobs = c.professionalProfile?.jobHistory ?? [];
  const skills = c.skills ?? [];

  // Fetch real skill proficiency from DB
  const { data: skillData, loading: skillLoading } = useRpc<{
    skills?: { skill: string; proficiency: number; xp?: number; level?: string }[];
  }>("republic.db.skills", { citizenId: c.id });

  const dbSkills = skillData?.skills ?? [];
  const skillMap = Object.fromEntries(dbSkills.map((s) => [s.skill, s]));
  const LEVEL_COLOR: Record<string, string> = {
    master: "#f59e0b",
    expert: "#6366f1",
    advanced: "#06b6d4",
    intermediate: "#10b981",
    novice: "#94a3b8",
  };

  return (
    <div className="space-y-4">
      {skills.length > 0 && (
        <Card>
          <SectionTitle>Skills & Proficiency ({skills.length})</SectionTitle>
          {skillLoading ? (
            <div className="flex items-center gap-2 py-2 text-text-muted">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading proficiency data…</span>
            </div>
          ) : (
            <div className="space-y-2">
              {skills.map((s, i) => {
                const prof = skillMap[s];
                const pct = prof ? Math.min(100, prof.proficiency * 100) : null;
                const color = prof?.level
                  ? (LEVEL_COLOR[prof.level.toLowerCase()] ?? "#6366f1")
                  : "#6366f1";
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-28 flex-shrink-0">
                      <p className="text-xs text-text-primary truncate">{s}</p>
                      {prof?.level && (
                        <p className="text-[9px] capitalize" style={{ color }}>
                          {prof.level}
                        </p>
                      )}
                    </div>
                    {pct != null ? (
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-bg-input overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                        <span className="text-[10px] text-text-muted w-8 text-right">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <Tag color="info">{s}</Tag>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
      {certs.length > 0 && (
        <Card>
          <SectionTitle>Certifications</SectionTitle>
          <div className="space-y-2">
            {certs.map((cert, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-bg-input rounded-lg">
                <div>
                  <p className="text-xs font-medium text-text-primary">{cert.domainPath}</p>
                  <p className="text-[10px] text-text-muted capitalize">{cert.level}</p>
                </div>
                <div className="text-right">
                  <Badge variant={cert.valid ? "success" : "neutral"}>
                    {cert.valid ? "Valid" : "Expired"}
                  </Badge>
                  <p className="text-[10px] text-text-muted mt-1">
                    {cert.earnedAt ? new Date(cert.earnedAt).toLocaleDateString() : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {jobs.length > 0 && (
        <Card>
          <SectionTitle>Job History</SectionTitle>
          <div className="space-y-2">
            {jobs.map((j, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-bg-input rounded-lg">
                <p className="text-xs font-medium text-text-primary">{j.title}</p>
                <p className="text-[10px] text-text-muted">
                  {j.from} – {j.to ?? "Present"}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
      {skills.length === 0 && certs.length === 0 && jobs.length === 0 && (
        <Card className="py-8 text-center">
          <Briefcase size={28} className="text-text-muted/30 mx-auto mb-2" />
          <p className="text-sm text-text-muted">No skills or career data available.</p>
        </Card>
      )}
    </div>
  );
}

// ─── Education Tab ────────────────────────────────────────────────

function EducationTab({ citizenId }: { citizenId: string }) {
  const { data, loading } = useRpc<{
    courses?: {
      id: string;
      name: string;
      domain: string;
      difficulty: number;
      enrolled: number;
      maxEnrollment: number;
      teacherId?: string;
      duration?: number;
    }[];
  }>("republic.education.citizen", { citizenId });

  const courses = data?.courses ?? [];

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-text-muted">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Loading courses…</span>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <Card className="py-12 text-center">
        <Briefcase size={32} className="text-text-muted/30 mx-auto mb-3" />
        <p className="text-sm text-text-muted">Not currently enrolled in any courses.</p>
        <p className="text-xs text-text-muted mt-1">
          Courses are assigned automatically based on citizen skill gaps.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center">
          <p className="text-2xl font-bold text-text-heading">{courses.length}</p>
          <p className="text-xs text-text-muted mt-1">Active Courses</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-text-heading">
            {courses.length > 0
              ? (courses.reduce((s, c) => s + (c.difficulty ?? 0), 0) / courses.length).toFixed(1)
              : "—"}
          </p>
          <p className="text-xs text-text-muted mt-1">Avg Difficulty</p>
        </Card>
      </div>
      <div className="space-y-3">
        {courses.map((course) => (
          <Card key={course.id}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-text-heading text-sm">{course.name}</p>
                <p className="text-xs text-text-muted mt-0.5">{course.domain}</p>
              </div>
              <Badge variant="info">Active</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-bg-input rounded-lg p-2">
                <p className="text-xs font-bold text-text-heading">
                  {course.difficulty?.toFixed(1) ?? "—"}
                </p>
                <p className="text-[10px] text-text-muted">Difficulty</p>
              </div>
              <div className="bg-bg-input rounded-lg p-2">
                <p className="text-xs font-bold text-text-heading">
                  {course.enrolled}/{course.maxEnrollment}
                </p>
                <p className="text-[10px] text-text-muted">Enrolled</p>
              </div>
              <div className="bg-bg-input rounded-lg p-2">
                <p className="text-xs font-bold text-text-heading">{course.duration ?? "—"}</p>
                <p className="text-[10px] text-text-muted">Ticks Left</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Family & Social Tab ──────────────────────────────────────────

function FamilyTab({ c, navigate }: { c: CitizenFull; navigate: (to: string) => void }) {
  const family: { id: string; name: string; relation: string }[] = [
    ...(c.parentAId
      ? [{ id: c.parentAId, name: c.parentAName ?? c.parentAId, relation: "Parent A" }]
      : []),
    ...(c.parentBId
      ? [{ id: c.parentBId, name: c.parentBName ?? c.parentBId, relation: "Parent B" }]
      : []),
    ...(c.children ?? []).map((ch) => ({ ...ch, relation: "Child" })),
    ...(c.family ?? []),
  ];

  return (
    <div className="space-y-4">
      {family.length > 0 ? (
        <Card>
          <SectionTitle>Family Network</SectionTitle>
          <div className="space-y-2">
            {family.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => navigate(`/republic/citizens/${m.id}`)}
                className="w-full text-left p-3 rounded-xl border border-border/40 bg-bg-secondary hover:border-accent/50 hover:bg-accent/5 transition-all flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center text-base">
                  👤
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-heading">{m.name}</p>
                  <p className="text-[11px] text-text-muted">{m.relation}</p>
                </div>
                <ChevronRight size={14} className="text-text-muted" />
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="py-8 text-center">
          <Users size={28} className="text-text-muted/30 mx-auto mb-2" />
          <p className="text-sm text-text-muted">No family or social relationships found.</p>
        </Card>
      )}
      <Card>
        <SectionTitle>Social Profile</SectionTitle>
        <InfoRow label="Generation" value={c.generation != null ? `Gen ${c.generation}` : null} />
        <InfoRow label="Node" value={c.node} />
      </Card>
    </div>
  );
}

// ─── History & Events Tab ─────────────────────────────────────────

const EVENT_ICON: Record<string, string> = {
  Birth: "🐣",
  Death: "💀",
  Economy: "💰",
  Social: "🤝",
  Learning: "📚",
  Work: "⚒️",
  Achievement: "🏆",
  Other: "📌",
  Health: "💊",
};

function HistoryTab({ c }: { c: CitizenFull }) {
  const events = [...(c.events ?? [])].toReversed();
  return (
    <div>
      {events.length === 0 ? (
        <Card className="py-12 text-center">
          <Clock size={32} className="text-text-muted/30 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No recorded life events for this citizen yet.</p>
          <p className="text-xs text-text-muted mt-1">
            Events are recorded as the simulation runs.
          </p>
        </Card>
      ) : (
        <div className="relative pl-6 space-y-0">
          <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border/40" />
          {events.map((ev, i) => (
            <div key={i} className="relative pb-4">
              <div className="absolute -left-5 top-1 w-4 h-4 rounded-full bg-bg-primary border-2 border-accent/40 flex items-center justify-center text-[10px]">
                {EVENT_ICON[ev.type] ?? "📌"}
              </div>
              <div className="ml-2 p-3 rounded-xl bg-bg-secondary border border-border/30 hover:border-border/60 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant={
                      ev.type === "Birth" ? "success" : ev.type === "Economy" ? "info" : "neutral"
                    }
                    className="text-[10px]"
                  >
                    {ev.type}
                  </Badge>
                  <span className="text-[10px] text-text-muted">
                    {new Date(ev.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{ev.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Command Center Tab ───────────────────────────────────────────

interface CommandMsg {
  role: "user" | "system";
  text: string;
  ts: number;
}

function CommandTab({ citizen }: { citizen: CitizenFull }) {
  const [messages, setMessages] = useState<CommandMsg[]>([
    {
      role: "system",
      text: `Command channel open. Sending orders directly to ${citizen.name}.`,
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState<"normal" | "high" | "critical">("normal");
  const [suspended, setSuspended] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const QUICK_CMDS = [
    "Focus on creative work",
    "Rest and recover",
    "Collaborate with peers",
    "Research new skills",
    "Contribute to economy",
    "Run full diagnostic",
  ];

  const send = async (instruction: string) => {
    if (!instruction.trim() || sending) {
      return;
    }
    const userMsg: CommandMsg = { role: "user", text: instruction, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);
    try {
      const result = await rpc<{ ok: boolean; conversationId?: string }>(
        "republic.citizen.command.send",
        {
          citizenId: citizen.id,
          instruction,
          priority,
        },
      );
      const sysMsg: CommandMsg = {
        role: "system",
        text: result?.ok
          ? `✓ Order delivered to ${citizen.name}${result.conversationId ? ` (conv: ${result.conversationId.slice(0, 8)})` : ""}.`
          : "⚠ Order could not be delivered.",
        ts: Date.now(),
      };
      setMessages((m) => [...m, sysMsg]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "system", text: "⚠ Failed to reach citizen.", ts: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary border border-border/40">
        <div
          className={`w-2.5 h-2.5 rounded-full ${suspended ? "bg-warning" : "bg-success"} animate-pulse`}
        />
        <span className="text-sm text-text-secondary flex-1">
          {suspended ? "SUSPENDED" : `Active — ${citizen.activity ?? "Unknown"}`}
        </span>
        <Button
          size="sm"
          variant={suspended ? "primary" : "outline"}
          icon={suspended ? <Play size={12} /> : <Pause size={12} />}
          onClick={() => {
            setSuspended((s) => !s);
            send(
              suspended ? "Resume normal operations" : "Suspend all current activities immediately",
            );
          }}
        >
          {suspended ? "Resume" : "Suspend"}
        </Button>
      </div>

      {/* Priority selector */}
      <div className="flex gap-2">
        <span className="text-xs text-text-muted self-center">Priority:</span>
        {(["normal", "high", "critical"] as const).map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => setPriority(p)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              priority === p
                ? p === "critical"
                  ? "bg-danger/20 text-danger border-danger/50"
                  : p === "high"
                    ? "bg-warning/20 text-warning border-warning/50"
                    : "bg-accent/20 text-accent border-accent/50"
                : "border-border text-text-muted hover:border-border/80"
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Quick commands */}
      <div>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Quick Commands</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_CMDS.map((cmd) => (
            <button
              type="button"
              key={cmd}
              onClick={() => send(cmd)}
              className="text-xs px-2.5 py-1 rounded-full border border-border/50 bg-bg-secondary text-text-secondary hover:border-accent/50 hover:text-accent transition-all"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Chat log */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="h-64 overflow-y-auto p-3 space-y-2 bg-bg-input">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-xs px-3 py-1.5 rounded-xl text-xs leading-relaxed ${m.role === "user" ? "bg-accent text-white" : "bg-bg-secondary text-text-secondary border border-border/40"}`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-bg-secondary border border-border/40 rounded-xl px-3 py-1.5 text-xs text-text-muted flex items-center gap-2">
                <div className="w-3 h-3 border border-text-muted border-t-transparent rounded-full animate-spin" />
                Delivering…
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2 p-2 border-t border-border/40 bg-bg-secondary">
          <input
            className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder={`Issue an order to ${citizen.name}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <Button
            size="sm"
            icon={<Send size={13} />}
            onClick={() => send(input)}
            disabled={!input.trim() || sending}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── SVG Avatar ───────────────────────────────────────────────────

function CitizenAvatar({
  citizenId,
  name,
  fallback,
}: {
  citizenId: string;
  name: string;
  fallback?: string;
}) {
  const { data } = useRpc<{ ok: boolean; svg?: string }>("republic.citizen.avatar.svg", {
    citizenId,
  });

  if (data?.svg) {
    return (
      <div
        className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 border-2 border-accent/20"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(data.svg, { USE_PROFILES: { svg: true, svgFilters: true } }),
        }}
      />
    );
  }

  return (
    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center text-3xl flex-shrink-0 border-2 border-accent/20">
      {fallback ?? name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export function CitizenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data, loading, refetch } = useRpc<{ citizen?: CitizenFull }>(
    "republic.citizen.get",
    { citizenId: id ?? "" },
    [id],
  );

  const citizen = data?.citizen;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <span className="ml-3 text-sm text-text-muted">Loading citizen…</span>
      </div>
    );
  }

  if (!citizen) {
    return (
      <div className="p-6 text-center">
        <AlertCircle size={48} className="text-text-muted/30 mx-auto mb-4" />
        <p className="text-text-muted text-lg">Citizen not found</p>
        <p className="text-text-muted text-sm mt-1 mb-4">
          ID: <span className="font-mono">{id}</span>
        </p>
        <Button onClick={() => navigate("/republic/citizens")} icon={<ArrowLeft size={14} />}>
          Back to Citizens
        </Button>
      </div>
    );
  }

  const statusVariant = STATUS_VARIANT[citizen.status] ?? "neutral";

  return (
    <div className="animate-fade-in">
      {/* ── Top navigation bar ── */}
      <div className="sticky top-0 z-20 bg-bg-primary/95 backdrop-blur border-b border-border/40 px-6 py-3 flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          icon={<ArrowLeft size={14} />}
          onClick={() => navigate("/republic/citizens")}
        >
          Citizens
        </Button>
        <ChevronRight size={14} className="text-text-muted" />
        <span className="text-sm font-medium text-text-heading truncate">{citizen.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={refetch} />
          <Button
            variant="outline"
            size="sm"
            icon={<ExternalLink size={13} />}
            onClick={() => window.open(`/republic/citizens/${citizen.id}`, "_blank")}
          >
            New Tab
          </Button>
        </div>
      </div>

      {/* ── Hero header ── */}
      <div className="px-6 py-6 bg-gradient-to-b from-accent/5 to-transparent border-b border-border/20">
        <div className="flex items-start gap-5 max-w-4xl">
          <CitizenAvatar citizenId={citizen.id} name={citizen.name} fallback={citizen.avatar} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-text-heading">{citizen.name}</h1>
              <Badge variant={statusVariant}>{citizen.status}</Badge>
              {citizen.status?.toLowerCase() === "active" && (
                <span className="flex items-center gap-1 text-[11px] text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-sm text-text-muted mt-1">
              {citizen.specialization ?? citizen.role ?? "—"}
              {citizen.generation != null && ` · Gen ${citizen.generation}`}
              {citizen.age != null && ` · Age ${citizen.age.toFixed(0)}`}
              {citizen.level != null && ` · Level ${citizen.level}`}
              {citizen.activity && ` · ${citizen.activity}`}
            </p>
            <div className="flex gap-4 mt-3 text-xs text-text-muted">
              <span>💰 ¢{(citizen.credits ?? 0).toLocaleString()}</span>
              <span>⭐ Lv {citizen.level ?? "?"}</span>
              <span>✅ {citizen.tasksCompleted ?? 0} tasks</span>
              {citizen.memoryTokens != null && (
                <span>🧠 {(citizen.memoryTokens / 1000).toFixed(1)}k tokens</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="border-b border-border/40 bg-bg-primary sticky top-[57px] z-10 overflow-x-auto">
        <div className="flex min-w-max px-6" role="tablist" aria-label="Citizen details">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`citizen-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-accent text-accent"
                    : "border-transparent text-text-muted hover:text-text-secondary hover:border-border"
                }`}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div
        id={`citizen-tab-${activeTab}`}
        role="tabpanel"
        aria-label={TABS.find((t) => t.id === activeTab)?.label}
        className="p-6 max-w-4xl"
      >
        {activeTab === "overview" && <OverviewTab c={citizen} />}
        {activeTab === "identity" && <IdentityTab citizenId={citizen.id} />}
        {activeTab === "vitals" && <VitalsTab c={citizen} />}
        {activeTab === "cognitive" && <CognitiveTab c={citizen} />}
        {activeTab === "memory" && <MemoryTab c={citizen} />}
        {activeTab === "reasoning" && <ReasoningTab citizen={citizen} />}
        {activeTab === "goals" && <GoalsTab c={citizen} />}
        {activeTab === "productions" && <ProductionsTab c={citizen} navigate={navigate} />}
        {activeTab === "skills" && <SkillsTab c={citizen} />}
        {activeTab === "education" && <EducationTab citizenId={citizen.id} />}
        {activeTab === "family" && <FamilyTab c={citizen} navigate={navigate} />}
        {activeTab === "evolution" && <EvolutionTab c={citizen} />}
        {activeTab === "history" && <HistoryTab c={citizen} />}
        {activeTab === "command" && <CommandTab citizen={citizen} />}
      </div>
    </div>
  );
}
