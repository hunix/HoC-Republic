/**
 * Dreams — Citizen dream logs, sentiment analysis, and recurring themes.
 *
 * Backend (republic.dreams.list) returns per dream:
 *   id, citizenId, citizenName, theme, description (string), intensity (0–100),
 *   status ("vivid"|"fading"|"nightmare"), tick
 */

import { Moon, Star, Heart, X, Users, Sparkles } from "lucide-react";
import { useState } from "react";
import { PageHeader, Badge, StatCard, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// ─── Types ─────────────────────────────────────────────────────────

interface Dream {
  id: string;
  citizenId?: string;
  citizenName: string;
  theme: string;
  description: string;
  intensity: number; // 0–100
  status: "vivid" | "fading" | "nightmare" | string;
  tick?: number;
}

// ─── Constants ─────────────────────────────────────────────────────

const THEME_COLORS: Record<string, string> = {
  Exploration: "#6366f1",
  Learning: "#06b6d4",
  Connection: "#8b5cf6",
  Achievement: "#f59e0b",
  Discovery: "#10b981",
  Creation: "#10b981",
  Justice: "#ef4444",
  Freedom: "#38bdf8",
};

const THEME_EMOJI: Record<string, string> = {
  Exploration: "🔭",
  Learning: "📚",
  Connection: "🫂",
  Achievement: "🏆",
  Discovery: "✨",
  Creation: "🎨",
  Justice: "⚖️",
  Freedom: "🕊️",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  vivid: "success",
  fading: "warning",
  nightmare: "danger",
};

const STATUS_EMOJI: Record<string, string> = {
  vivid: "🌟",
  fading: "🌫️",
  nightmare: "💀",
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

// ─── Dream Card ────────────────────────────────────────────────────

function DreamCard({ dream, onClick }: { dream: Dream; onClick: () => void }) {
  const color = THEME_COLORS[dream.theme] ?? "#6366f1";
  const emoji = THEME_EMOJI[dream.theme] ?? "🌙";
  const avatarBg = citizenColor(dream.citizenName);

  return (
    <div
      className="group relative rounded-xl border border-white/5 overflow-hidden cursor-pointer transition-all duration-200 hover:border-white/15 hover:shadow-lg hover:-translate-y-0.5"
      style={{ background: "rgba(15,23,42,0.85)" }}
      onClick={onClick}
    >
      {/* Colored top bar by theme */}
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}66)` }}
      />

      <div className="p-4 flex flex-col gap-3">
        {/* Citizen */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: avatarBg }}
          >
            {initials(dream.citizenName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white leading-tight truncate">
              {dream.citizenName}
            </div>
            <div className="text-[10px] text-slate-500">Citizen</div>
          </div>
          <span className="text-xl">{emoji}</span>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ background: color }}
          >
            {dream.theme}
          </span>
          <Badge variant={STATUS_VARIANT[dream.status] ?? "neutral"}>
            {STATUS_EMOJI[dream.status] ?? "💭"} {dream.status}
          </Badge>
        </div>

        {/* Description */}
        <p className="text-[12px] text-slate-300 leading-relaxed line-clamp-3 italic">
          &ldquo;{dream.description}&rdquo;
        </p>

        {/* Intensity bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">Dream intensity</span>
            <span className="text-[10px] font-bold" style={{ color }}>
              {dream.intensity}%
            </span>
          </div>
          <div
            className="h-1 rounded-full w-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${dream.intensity}%`, background: color }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-0.5 border-t border-white/5">
          <span className="text-[10px] text-slate-500">
            {dream.tick != null ? `Tick #${dream.tick}` : ""}
          </span>
          <span className="text-[10px] text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
            Read →
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Dream Modal ───────────────────────────────────────────────────

function DreamModal({ dream, onClose }: { dream: Dream; onClose: () => void }) {
  const color = THEME_COLORS[dream.theme] ?? "#6366f1";
  const emoji = THEME_EMOJI[dream.theme] ?? "🌙";
  const avatarBg = citizenColor(dream.citizenName);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ background: "rgba(8,15,30,0.98)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 pt-6 pb-4"
          style={{ background: `linear-gradient(135deg, ${color}1a 0%, transparent 100%)` }}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-slate-400 hover:text-white"
            onClick={onClose}
          >
            <X size={18} />
          </button>
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ background: avatarBg }}
            >
              {initials(dream.citizenName)}
            </div>
            <div>
              <div className="text-lg font-bold text-white">{dream.citizenName}</div>
              <div className="text-sm text-slate-400">Citizen · {dream.citizenId ?? "–"}</div>
            </div>
            <span className="ml-auto text-3xl">{emoji}</span>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span
              className="px-2.5 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: color }}
            >
              {dream.theme}
            </span>
            <Badge variant={STATUS_VARIANT[dream.status] ?? "neutral"}>
              {STATUS_EMOJI[dream.status] ?? "💭"} {dream.status}
            </Badge>
            <span className="text-xs text-slate-500 ml-auto">Intensity: {dream.intensity}%</span>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Dream Content
          </div>
          <blockquote
            className="rounded-lg p-4 text-sm text-slate-200 leading-relaxed italic border-l-2"
            style={{ background: `${color}10`, borderColor: color }}
          >
            {dream.description}
          </blockquote>
          <div className="mt-4">
            <div className="text-[10px] text-slate-500 mb-1">Dream Intensity</div>
            <div
              className="h-2 rounded-full w-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${dream.intensity}%`, background: color }}
              />
            </div>
          </div>
          {dream.tick != null && (
            <p className="mt-3 text-xs text-slate-500">Recorded at simulation tick #{dream.tick}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────

export function DreamsPage() {
  const {
    data,
    loading,
    error: _e,
    refetch,
  } = useRpc<{ dreams?: Dream[] }>("republic.dreams.list", {});
  void _e;

  const [filter, setFilter] = useState<string>("All");
  const [selected, setSelected] = useState<Dream | null>(null);

  if (loading) {
    return <RpcStatus loading={loading} error={null} onRetry={refetch} />;
  }

  const dreams = Array.isArray(data?.dreams) ? data!.dreams : [];
  const filtered = filter === "All" ? dreams : dreams.filter((d) => d.theme === filter);

  const themeCounts = dreams.reduce<Record<string, number>>((acc, d) => {
    acc[d.theme] = (acc[d.theme] ?? 0) + 1;
    return acc;
  }, {});

  const vividCount = dreams.filter((d) => d.status === "vivid").length;
  const nightmareCount = dreams.filter((d) => d.status === "nightmare").length;
  const uniqueDreamers = new Set(dreams.map((d) => d.citizenName)).size;
  const avgIntensity = dreams.length
    ? Math.round(dreams.reduce((s, d) => s + (d.intensity ?? 0), 0) / dreams.length)
    : 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Dreams"
        description="Citizen dream logs, sentiment analysis, and recurring themes"
        icon={<Moon size={28} />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Dream Entries" value={dreams.length} icon={<Moon size={16} />} />
        <StatCard
          label="Vivid Dreams"
          value={vividCount}
          icon={<Sparkles size={16} />}
          sub="positive"
        />
        <StatCard label="Dreamers" value={uniqueDreamers} icon={<Users size={16} />} />
        <StatCard
          label="Avg Intensity"
          value={`${avgIntensity}%`}
          icon={<Heart size={16} />}
          sub={`${nightmareCount} nightmares`}
        />
      </div>

      {/* Theme filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => setFilter("All")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            filter === "All"
              ? "bg-indigo-600 text-white"
              : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
          }`}
        >
          All ({dreams.length})
        </button>
        {(Object.entries(themeCounts) as [string, number][]).map(([theme, count]) => {
          const color = THEME_COLORS[theme] ?? "#6366f1";
          const active = filter === theme;
          return (
            <button
              type="button"
              key={theme}
              onClick={() => setFilter(theme)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer"
              style={{
                background: active ? color : "rgba(100,116,139,0.12)",
                color: active ? "#fff" : "#94a3b8",
                border: `1px solid ${active ? color : "transparent"}`,
              }}
            >
              {THEME_EMOJI[theme] ?? "🌙"} {theme} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {dreams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Moon size={40} className="opacity-20" />
          <p className="text-sm">No dreams recorded yet — citizens are still awake</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Star size={40} className="opacity-20" />
          <p className="text-sm">No dreams for this theme yet</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Showing {filtered.length} dream{filtered.length !== 1 ? "s" : ""} — click any card to
            read full content
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((d) => (
              <DreamCard key={d.id} dream={d} onClick={() => setSelected(d)} />
            ))}
          </div>
        </>
      )}

      {selected && <DreamModal dream={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
