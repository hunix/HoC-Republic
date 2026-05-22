/**
 * Reasoning — Citizen reasoning chain explorer and confidence analysis.
 *
 * Backend (republic.reasoning.list) returns per chain:
 *   id, citizenName, specialization, type ("deductive"|"inductive"|"abductive"),
 *   status ("idle"|"active"), steps (NUMBER of steps), confidence (0–1 float)
 */

import {
  Brain,
  ChevronRight,
  ChevronDown,
  Activity,
  CheckCircle2,
  Cpu,
  Lightbulb,
  Zap,
  FlaskConical,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, StatCard, Badge, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// ─── Types ─────────────────────────────────────────────────────────

interface ReasoningChain {
  id: string;
  citizenName: string;
  specialization: string;
  type: "deductive" | "inductive" | "abductive" | string;
  status: "idle" | "active" | string;
  steps: number; // number of reasoning steps (from intelligence / 10)
  confidence: number; // 0–1 float
}

// ─── Constants ─────────────────────────────────────────────────────

const TYPE_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  deductive: { color: "#6366f1", icon: <Brain size={12} />, label: "Deductive" },
  inductive: { color: "#10b981", icon: <FlaskConical size={12} />, label: "Inductive" },
  abductive: { color: "#f59e0b", icon: <Lightbulb size={12} />, label: "Abductive" },
};

const STATUS_VARIANT: Record<string, "success" | "neutral" | "warning"> = {
  active: "success",
  idle: "neutral",
};

const CITIZEN_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#38bdf8",
  "#a855f7",
];

// ─── Helpers ───────────────────────────────────────────────────────

function citizenColor(name: string): string {
  let h = 0;
  for (const c of name) {
    h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  }
  return CITIZEN_COLORS[h % CITIZEN_COLORS.length];
}
function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function confColor(c: number) {
  if (c >= 0.85) {
    return "#10b981";
  }
  if (c >= 0.65) {
    return "#f59e0b";
  }
  return "#ef4444";
}

function confBar(confidence: number) {
  // Clamp to 0–1 (backend sends intelligence/100 so max ~1.5 for high-int citizens)
  const pct = Math.min(confidence, 1) * 100;
  return { pct, color: confColor(confidence) };
}

// ─── Step Visualiser ────────────────────────────────────────────────
// `steps` is a NUMBER — we render that many placeholder step dots.

function StepDots({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {Array.from({ length: Math.min(count, 12) }).map((_, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: `hsl(${200 + i * 15}, 70%, 55%)` }}
          title={`Step ${i + 1}`}
        />
      ))}
      {count > 12 && <span className="text-[10px] text-slate-500">+{count - 12}</span>}
    </div>
  );
}

// ─── Chain Row ─────────────────────────────────────────────────────

function ChainRow({
  chain,
  expanded,
  onToggle,
}: {
  chain: ReasoningChain;
  expanded: boolean;
  onToggle: () => void;
}) {
  const avatarBg = citizenColor(chain.citizenName);
  const { pct, color } = confBar(chain.confidence);
  const typeMeta = TYPE_META[chain.type] ?? TYPE_META.abductive;

  return (
    <div
      className="rounded-xl border border-white/5 overflow-hidden transition-all duration-200 hover:border-white/12"
      style={{ background: "rgba(15,23,42,0.85)" }}
    >
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left"
        onClick={onToggle}
      >
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: avatarBg }}
        >
          {initials(chain.citizenName)}
        </div>

        {/* Name + specialization */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{chain.citizenName}</span>
            <Badge variant={STATUS_VARIANT[chain.status] ?? "neutral"}>{chain.status}</Badge>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {chain.specialization} · {chain.steps} reasoning step{chain.steps !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Type badge */}
        <span
          className="hidden sm:flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0"
          style={{ background: `${typeMeta.color}20`, color: typeMeta.color }}
        >
          {typeMeta.icon}
          {typeMeta.label}
        </span>

        {/* Confidence */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="h-1.5 w-16 rounded-full overflow-hidden hidden md:block"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color }}>
            {(Math.min(chain.confidence, 1) * 100).toFixed(0)}%
          </span>
        </div>

        {expanded ? (
          <ChevronDown size={15} className="text-slate-500 flex-shrink-0" />
        ) : (
          <ChevronRight size={15} className="text-slate-500 flex-shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] text-slate-500 mb-1">Reasoning Type</div>
              <div className="text-xs font-semibold" style={{ color: typeMeta.color }}>
                {typeMeta.label}
              </div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] text-slate-500 mb-1">Confidence</div>
              <div className="text-xs font-semibold text-white">
                {(Math.min(chain.confidence, 1) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] text-slate-500 mb-1">Step Depth</div>
              <div className="text-xs font-semibold text-white">{chain.steps} steps</div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] text-slate-500 mb-1">Specialization</div>
              <div className="text-xs font-semibold text-white truncate">
                {chain.specialization}
              </div>
            </div>
          </div>

          {/* Step depth visualiser */}
          <div>
            <div className="text-[10px] text-slate-500 mb-1.5">Step Depth Map</div>
            <StepDots count={chain.steps} />
          </div>

          {/* Reasoning pattern description */}
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {chain.citizenName} is applying{" "}
            <span style={{ color: typeMeta.color }}>{typeMeta.label.toLowerCase()} reasoning</span>{" "}
            through {chain.steps} cognitive step{chain.steps !== 1 ? "s" : ""} with{" "}
            {(Math.min(chain.confidence, 1) * 100).toFixed(0)}% confidence. Current status:{" "}
            <span className={chain.status === "active" ? "text-green-400" : "text-slate-400"}>
              {chain.status}
            </span>
            .
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────

export function ReasoningPage() {
  const {
    data,
    loading,
    error: _e,
    refetch,
  } = useRpc<{ chains?: ReasoningChain[] }>("republic.reasoning.list", {});
  void _e;
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return <RpcStatus loading={loading} error={null} onRetry={refetch} />;
  }

  const chains = Array.isArray(data?.chains) ? data!.chains : [];

  const active = chains.filter((c) => c.status === "active").length;
  const avgConf = chains.length
    ? ((chains.reduce((s, c) => s + Math.min(c.confidence, 1), 0) / chains.length) * 100).toFixed(0)
    : "—";
  const avgSteps = chains.length
    ? (chains.reduce((s, c) => s + (c.steps ?? 0), 0) / chains.length).toFixed(1)
    : "—";

  // Group by type for summary
  const byType = chains.reduce(
    (acc, c) => {
      acc[c.type] = (acc[c.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Reasoning"
        description="Citizen reasoning chain explorer and confidence analysis"
        icon={<Brain size={28} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Active Chains" value={chains.length} icon={<Brain size={16} />} />
        <StatCard label="Active Now" value={active} icon={<Zap size={16} />} sub="reasoning" />
        <StatCard label="Avg Confidence" value={`${avgConf}%`} icon={<Activity size={16} />} />
        <StatCard label="Avg Steps" value={avgSteps} icon={<Cpu size={16} />} />
      </div>

      {/* Type legend */}
      {Object.entries(byType).length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {(Object.entries(byType) as [string, number][]).map(([type, count]) => {
            const m = TYPE_META[type] ?? TYPE_META.abductive;
            return (
              <span
                key={type}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                style={{ background: `${m.color}18`, color: m.color }}
              >
                {m.icon} {m.label} ({count})
              </span>
            );
          })}
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <CheckCircle2 size={11} /> {active} active · {chains.length - active} idle
          </span>
        </div>
      )}

      {/* Chain list */}
      {chains.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Brain size={40} className="opacity-20" />
          <p className="text-sm">No reasoning chains recorded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chains.map((chain) => (
            <ChainRow
              key={chain.id}
              chain={chain}
              expanded={expanded === chain.id}
              onToggle={() => setExpanded(expanded === chain.id ? null : chain.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
