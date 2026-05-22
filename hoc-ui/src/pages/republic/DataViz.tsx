
import {
  Activity,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
  Radio,
  BarChart2,
  Map,
  List,
  Cpu,
  Users,
  Zap,
  Globe,
  Eye,
  Layers,
  Plus,
  Download,
  ShieldAlert,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { useRpc } from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────

interface SimStatus {
  running?: boolean;
  currentTick?: number;
  tickRate?: number;
  activeAgents?: number;
  eventsPerSecond?: number;
  memoryUsageMB?: number;
  scenarioName?: string;
}

interface CitizenSummary {
  id: string;
  name: string;
  specialization: string;
  energy: number;
  happiness: number;
  health: number;
  credits: number;
  activity: string;
  x?: number;
  y?: number;
}

interface WorldEvent {
  citizenId?: string;
  citizenName?: string;
  type: string;
  description: string;
  timestamp: string | number;
}

// ─── Topic Panel Types ────────────────────────────────────────────

type PanelKind = "plot" | "map2d" | "log" | "bar" | "inspector" | "timeline" | "argus";

interface Panel {
  id: string;
  kind: PanelKind;
  title: string;
  topic: string;
  pinned?: boolean;
  collapsed?: boolean;
}

const PANEL_ICONS: Record<PanelKind, React.ReactNode> = {
  plot: <Activity size={12} />,
  map2d: <Map size={12} />,
  log: <List size={12} />,
  bar: <BarChart2 size={12} />,
  inspector: <Eye size={12} />,
  timeline: <Layers size={12} />,
  argus: <ShieldAlert size={12} />,
};

const DEFAULT_PANELS: Panel[] = [
  { id: "p1", kind: "map2d", title: "2D Field Map", topic: "/republic/citizens" },
  { id: "p2", kind: "plot", title: "Vitals Over Time", topic: "/republic/vitals" },
  { id: "p3", kind: "log", title: "Event Log", topic: "/republic/events" },
  { id: "p4", kind: "argus", title: "Argus Threat Fusion", topic: "/republic/world" },
  { id: "p5", kind: "inspector", title: "Sim Status", topic: "/republic/sim" },
  { id: "p6", kind: "timeline", title: "Activity Timeline", topic: "/republic/activity" },
];

const TOPICS = [
  "/republic/citizens",
  "/republic/vitals",
  "/republic/events",
  "/republic/specializations",
  "/republic/sim",
  "/republic/activity",
  "/republic/economy",
  "/republic/world",
];

// ─── Color palette (webviz-inspired dark) ─────────────────────────

const COLORS = {
  energy: "#facc15",
  happiness: "#f472b6",
  health: "#4ade80",
  credits: "#60a5fa",
  bg: "#0d1117",
  panel: "#161b22",
  border: "#21262d",
  accent: "#388bfd",
  text: "#c9d1d9",
  muted: "#8b949e",
};

const SPEC_COLORS: Record<string, string> = {
  Artist: "#8b5cf6",
  Engineer: "#3b82f6",
  Scientist: "#06b6d4",
  Merchant: "#f59e0b",
  Philosopher: "#ec4899",
  Healer: "#10b981",
  Educator: "#f97316",
  Politician: "#ef4444",
  Athlete: "#84cc16",
  Musician: "#a78bfa",
};

// ─── 2D Field Map Panel (Canvas) ─────────────────────────────────

function FieldMap2D({ citizens }: { citizens: CitizenSummary[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<CitizenSummary | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx < W; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    // Origin cross-hair
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    if (citizens.length === 0) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No citizen data", W / 2, H / 2);
      return;
    }

    // Map citizens onto a deterministic grid position using their index
    citizens.forEach((c, i) => {
      const cols = Math.ceil(Math.sqrt(citizens.length));
      const col = i % cols;
      const row = Math.floor(i / cols);
      const padding = 20;
      const cellW = (W - padding * 2) / cols;
      const cellH = (H - padding * 2) / Math.ceil(citizens.length / cols);
      const cx2 = padding + col * cellW + cellW / 2 + Math.sin(i * 1.7) * cellW * 0.3;
      const cy2 = padding + row * cellH + cellH / 2 + Math.cos(i * 1.3) * cellH * 0.3;

      // Outer glow based on energy
      const energyRatio = (c.energy ?? 50) / 100;
      const radius = 5 + energyRatio * 4;
      ctx.shadowBlur = hovered?.id === c.id ? 16 : 6;
      ctx.shadowColor = SPEC_COLORS[c.specialization] ?? COLORS.accent;

      ctx.beginPath();
      ctx.arc(cx2, cy2, radius, 0, Math.PI * 2);
      ctx.fillStyle = SPEC_COLORS[c.specialization] ?? COLORS.accent;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Health ring
      ctx.beginPath();
      ctx.arc(cx2, cy2, radius + 3, -Math.PI / 2, -Math.PI / 2 + (c.health / 100) * Math.PI * 2);
      ctx.strokeStyle = COLORS.health;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [citizens, hovered]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={420}
        height={260}
        className="w-full h-full rounded"
        style={{ background: COLORS.bg }}
        onMouseMove={(e) => {
          // Simple nearest-neighbor hover detection
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const scaleX = 420 / rect.width;
          const scaleY = 260 / rect.height;
          const px = mx * scaleX;
          const py = my * scaleY;

          const cols = Math.ceil(Math.sqrt(citizens.length));
          const closest = citizens.find((_c, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cellW = 380 / cols;
            const cellH = 220 / Math.ceil(citizens.length / cols);
            const cx2 = 20 + col * cellW + cellW / 2 + Math.sin(i * 1.7) * cellW * 0.3;
            const cy2 = 20 + row * cellH + cellH / 2 + Math.cos(i * 1.3) * cellH * 0.3;
            return Math.hypot(px - cx2, py - cy2) < 14;
          });
          setHovered(closest ?? null);
        }}
        onMouseLeave={() => setHovered(null)}
      />
      {hovered && (
        <div
          className="absolute bottom-2 left-2 bg-black/90 border border-white/10 rounded-lg p-2 text-[11px] pointer-events-none z-10"
          style={{ color: COLORS.text }}
        >
          <div
            className="font-semibold"
            style={{ color: SPEC_COLORS[hovered.specialization] ?? COLORS.accent }}
          >
            {hovered.name}
          </div>
          <div className="text-[10px] opacity-70">
            {hovered.specialization} · {hovered.activity}
          </div>
          <div className="flex gap-3 mt-1">
            <span>⚡{hovered.energy}</span>
            <span>♥{hovered.happiness}</span>
            <span>💚{hovered.health}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Topic Sidebar ────────────────────────────────────────────────

function TopicSidebar({
  topics,
  activeTopics,
  onToggle,
}: {
  topics: string[];
  activeTopics: Set<string>;
  onToggle: (t: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = topics.filter((t) => t.includes(filter));
  return (
    <div
      className="h-full flex flex-col border-r"
      style={{ background: COLORS.panel, borderColor: COLORS.border, minWidth: 200, width: 200 }}
    >
      <div className="p-2 border-b" style={{ borderColor: COLORS.border }}>
        <div
          className="flex items-center gap-1.5 text-xs font-semibold mb-2"
          style={{ color: COLORS.muted }}
        >
          <Radio size={11} />
          TOPICS
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter topics…"
          className="w-full text-[11px] px-2 py-1 rounded"
          style={{
            background: COLORS.bg,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
          }}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {filtered.map((t) => {
          const active = activeTopics.has(t);
          return (
            <button
type="button"               key={t}
              onClick={() => onToggle(t)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-[11px] mb-0.5 transition-colors"
              style={{
                color: active ? COLORS.accent : COLORS.muted,
                background: active ? `${COLORS.accent}22` : "transparent",
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: active ? COLORS.accent : COLORS.border }}
              />
              <span className="font-mono truncate">{t}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panel Header ─────────────────────────────────────────────────

function PanelHeader({
  panel,
  onCollapse,
  onClose,
}: {
  panel: Panel;
  onCollapse: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 border-b text-[11px] select-none cursor-pointer"
      style={{ borderColor: COLORS.border, background: COLORS.panel }}
      onClick={onCollapse}
    >
      <span style={{ color: COLORS.muted }}>{PANEL_ICONS[panel.kind]}</span>
      <span className="font-semibold truncate flex-1" style={{ color: COLORS.text }}>
        {panel.title}
      </span>
      <span className="font-mono opacity-50 truncate max-w-[100px]" style={{ color: COLORS.muted }}>
        {panel.topic}
      </span>
      <button
type="button"         onClick={(e) => {
          e.stopPropagation();
          onCollapse();
        }}
        className="opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: COLORS.muted }}
      >
        {panel.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
      </button>
      <button
type="button"         onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: COLORS.muted }}
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ─── Individual panel content ─────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#1a242f",
    border: `1px solid ${COLORS.border}`,
    fontSize: 11,
    borderRadius: 6,
  },
  labelStyle: { color: COLORS.muted },
};

function PlotPanel({
  vitalsHistory,
}: {
  vitalsHistory: Array<{ tick: number; energy: number; happiness: number; health: number }>;
}) {
  return (
    <div className="h-[220px] p-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={vitalsHistory} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="tick"
            tick={{ fill: COLORS.muted, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: COLORS.muted, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 10, color: COLORS.muted }} />
          <Area
            type="monotone"
            dataKey="energy"
            stroke={COLORS.energy}
            fill={`${COLORS.energy}22`}
            strokeWidth={1.5}
            dot={false}
            name="Energy"
          />
          <Area
            type="monotone"
            dataKey="happiness"
            stroke={COLORS.happiness}
            fill={`${COLORS.happiness}22`}
            strokeWidth={1.5}
            dot={false}
            name="Happiness"
          />
          <Area
            type="monotone"
            dataKey="health"
            stroke={COLORS.health}
            fill={`${COLORS.health}22`}
            strokeWidth={1.5}
            dot={false}
            name="Health"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EventLog({ events }: { events: WorldEvent[] }) {
  const [filter, setFilter] = useState("");
  const filtered = (events ?? []).filter(
    (e) =>
      !filter ||
      e.type?.toLowerCase().includes(filter) ||
      e.description?.toLowerCase().includes(filter),
  );
  return (
    <div className="flex flex-col h-[220px]">
      <div className="px-2 pt-1.5 pb-1">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
          placeholder="Filter messages…"
          className="w-full text-[11px] px-2 py-1 rounded"
          style={{
            background: COLORS.bg,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
          }}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-0.5">
        {filtered.slice(0, 100).map((e, i) => (
          <div
            key={i}
            className="flex gap-2 text-[10px] py-0.5 border-b"
            style={{ borderColor: `${COLORS.border}66` }}
          >
            <span className="font-semibold min-w-[70px] truncate" style={{ color: COLORS.accent }}>
              {e.citizenName ?? "System"}
            </span>
            <span className="opacity-60 min-w-[60px]">{e.type}</span>
            <span className="truncate flex-1" style={{ color: COLORS.text }}>
              {e.description}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center pt-6 text-[11px]" style={{ color: COLORS.muted }}>
            No messages match filter
          </p>
        )}
      </div>
    </div>
  );
}

function SpecBar({ citizens }: { citizens: CitizenSummary[] }) {
  const counts: Record<string, number> = {};
  for (const c of citizens) {
    counts[c.specialization] = (counts[c.specialization] ?? 0) + 1;
  }
  const data = Object.entries(counts)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([spec, count]) => ({ spec, count }));
  return (
    <div className="h-[220px] p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 60 }}>
          <XAxis
            type="number"
            tick={{ fill: COLORS.muted, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="spec"
            tick={{ fill: COLORS.text, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...TOOLTIP_STYLE} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={12}>
            {data.map((entry, idx) => (
              <rect key={idx} fill={SPEC_COLORS[entry.spec] ?? COLORS.accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SimInspector({ sim }: { sim: SimStatus | null }) {
  if (!sim) {
    return (
      <div className="h-[220px] flex items-center justify-center">
        <p style={{ color: COLORS.muted }} className="text-xs">
          No sim data
        </p>
      </div>
    );
  }
  const rows: Array<{ key: string; value: string | number; color?: string }> = [
    {
      key: "Status",
      value: sim.running ? "RUNNING" : "STOPPED",
      color: sim.running ? COLORS.health : COLORS.happiness,
    },
    { key: "Tick", value: sim.currentTick?.toLocaleString() ?? "—" },
    { key: "Tick Rate", value: `${sim.tickRate ?? "—"} t/s` },
    { key: "Active Agents", value: sim.activeAgents ?? "—", color: COLORS.accent },
    { key: "Events/sec", value: (sim.eventsPerSecond ?? 0).toFixed(1), color: COLORS.energy },
    { key: "Memory", value: `${sim.memoryUsageMB ?? "—"} MB` },
    { key: "Scenario", value: sim.scenarioName ?? "default" },
  ];
  return (
    <div className="h-[220px] overflow-y-auto p-3">
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b" style={{ borderColor: `${COLORS.border}66` }}>
              <td className="py-1.5 pr-4 font-mono" style={{ color: COLORS.muted }}>
                {r.key}
              </td>
              <td className="py-1.5 font-semibold" style={{ color: r.color ?? COLORS.text }}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTimeline({ citizens }: { citizens: CitizenSummary[] }) {
  const activities: Record<string, number> = {};
  for (const c of citizens) {
    activities[c.activity ?? "Unknown"] = (activities[c.activity ?? "Unknown"] ?? 0) + 1;
  }
  const data = Object.entries(activities)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([act, cnt]) => ({
      act,
      cnt,
      pct: Math.round((cnt / Math.max(citizens.length, 1)) * 100),
    }));
  return (
    <div className="h-[220px] overflow-y-auto p-3 space-y-2">
      {data.map((row) => (
        <div key={row.act}>
          <div className="flex justify-between text-[10px] mb-0.5">
            <span style={{ color: COLORS.text }}>{row.act}</span>
            <span style={{ color: COLORS.muted }}>
              {row.cnt} ({row.pct}%)
            </span>
          </div>
          <div className="w-full rounded-full h-1.5" style={{ background: COLORS.border }}>
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${row.pct}%`, background: COLORS.accent }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-center pt-8 text-[11px]" style={{ color: COLORS.muted }}>
          No activity data
        </p>
      )}
    </div>
  );
}

function ArgusDiagnosticsPanel() {
  const { data } = useRpc<{
    diagnostics?: { activeThreats: { level: string; category: string; summary: string }[]; globalSentiment: number; lastScanTimestamp: string };
  }>("republic.worldintel.argus", {}, [], { staleTimeMs: 5000, refetchIntervalMs: 15_000 });

  const diag = data?.diagnostics;

  if (!diag) {
    return (
      <div className="h-[220px] flex items-center justify-center p-3">
        <span className="text-[11px]" style={{ color: COLORS.muted }}>Awaiting Argus telemetry...</span>
      </div>
    );
  }

  const sentimentColor = diag.globalSentiment > 0.6 ? COLORS.health : diag.globalSentiment > 0.3 ? COLORS.energy : COLORS.happiness;

  return (
    <div className="h-[220px] flex flex-col p-3 text-[11px]">
      <div className="flex justify-between border-b pb-2 mb-2" style={{ borderColor: `${COLORS.border}88` }}>
        <span>Global Stability: <span style={{ color: sentimentColor }}>{(diag.globalSentiment * 100).toFixed(1)}%</span></span>
        <span className="font-mono opacity-50">{diag.lastScanTimestamp}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {diag.activeThreats.length === 0 ? (
          <div className="text-center pt-8 opacity-50">No critical threats detected.</div>
        ) : (
          diag.activeThreats.map((threat, idx) => (
            <div key={idx} className="p-2 rounded border" style={{ borderColor: threat.level === "critical" ? "#ef444455" : "#f59e0b55", background: "rgba(0,0,0,0.2)" }}>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="uppercase font-bold" style={{ color: threat.level === "critical" ? "#ef4444" : "#facc15" }}>{threat.level}</span>
                <span className="opacity-70">{threat.category}</span>
              </div>
              <p className="opacity-90 leading-snug">{threat.summary}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Render panel content by kind ────────────────────────────────

function PanelContent({
  panel,
  citizens,
  events,
  sim,
  vitalsHistory,
}: {
  panel: Panel;
  citizens: CitizenSummary[];
  events: WorldEvent[];
  sim: SimStatus | null;
  vitalsHistory: Array<{ tick: number; energy: number; happiness: number; health: number }>;
}) {
  switch (panel.kind) {
    case "map2d":
      return <FieldMap2D citizens={citizens} />;
    case "plot":
      return <PlotPanel vitalsHistory={vitalsHistory} />;
    case "log":
      return <EventLog events={events} />;
    case "bar":
      return <SpecBar citizens={citizens} />;
    case "inspector":
      return <SimInspector sim={sim} />;
    case "timeline":
      return <ActivityTimeline citizens={citizens} />;
    case "argus":
      return <ArgusDiagnosticsPanel />;
    default:
      return null;
  }
}

// ─── Playback bar ─────────────────────────────────────────────────

function PlaybackBar({
  sim,
  onPlay,
  onPause,
  onReset,
  playing,
}: {
  sim: SimStatus | null;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  playing: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-t text-[11px]"
      style={{ background: COLORS.panel, borderColor: COLORS.border }}
    >
      <div className="flex items-center gap-1">
        <button
type="button"           onClick={onReset}
          className="p-1.5 rounded hover:bg-white/5 transition-colors"
          style={{ color: COLORS.muted }}
        >
          <SkipBack size={13} />
        </button>
        <button
type="button"           onClick={playing ? onPause : onPlay}
          className="p-1.5 rounded hover:bg-white/5 transition-colors"
          style={{ color: playing ? COLORS.health : COLORS.text }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
type="button"           className="p-1.5 rounded hover:bg-white/5 transition-colors"
          style={{ color: COLORS.muted }}
        >
          <SkipForward size={13} />
        </button>
      </div>

      {/* Timeline scrubber */}
      <div className="flex-1 flex items-center gap-2">
        <span style={{ color: COLORS.muted }} className="min-w-[30px]">
          0
        </span>
        <div className="flex-1 h-1.5 rounded-full relative" style={{ background: COLORS.border }}>
          <div
            className="h-1.5 rounded-full transition-all duration-1000"
            style={{
              width: `${Math.min(((sim?.currentTick ?? 0) % 1000) / 10, 100)}%`,
              background: `linear-gradient(90deg, ${COLORS.accent}, #8b5cf6)`,
            }}
          />
        </div>
        <span style={{ color: COLORS.text }} className="font-mono min-w-[60px] text-right">
          Tick {(sim?.currentTick ?? 0).toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-3" style={{ color: COLORS.muted }}>
        <span className="flex items-center gap-1">
          <Users size={10} /> {sim?.activeAgents ?? 0}
        </span>
        <span className="flex items-center gap-1">
          <Zap size={10} /> {(sim?.eventsPerSecond ?? 0).toFixed(1)}/s
        </span>
        <span className="flex items-center gap-1">
          <Cpu size={10} /> {sim?.memoryUsageMB ?? 0} MB
        </span>
      </div>

      <div
        className="flex items-center gap-1 px-2 py-0.5 rounded-full"
        style={{ background: sim?.running ? `${COLORS.health}22` : `${COLORS.muted}22` }}
      >
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: sim?.running ? COLORS.health : COLORS.muted }}
        />
        <span style={{ color: sim?.running ? COLORS.health : COLORS.muted }}>
          {sim?.running ? "LIVE" : "PAUSED"}
        </span>
      </div>
    </div>
  );
}

// ─── Panel Add Dialog ─────────────────────────────────────────────

function AddPanelMenu({
  onAdd,
  onClose,
}: {
  onAdd: (kind: PanelKind, topic: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<PanelKind>("plot");
  const [topic, setTopic] = useState(TOPICS[0]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="rounded-xl p-5 w-80 shadow-2xl"
        style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>
          Add Panel
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: COLORS.muted }}>
              Panel Type
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PanelKind)}
              className="w-full text-[12px] px-2 py-1.5 rounded"
              style={{
                background: COLORS.bg,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {(["plot", "map2d", "log", "bar", "inspector", "timeline", "argus"] as PanelKind[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: COLORS.muted }}>
              Topic
            </label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full text-[12px] px-2 py-1.5 rounded"
              style={{
                background: COLORS.bg,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
type="button"             onClick={onClose}
            className="flex-1 py-1.5 rounded text-xs"
            style={{ background: COLORS.border, color: COLORS.text }}
          >
            Cancel
          </button>
          <button
type="button"             onClick={() => {
              onAdd(kind, topic);
              onClose();
            }}
            className="flex-1 py-1.5 rounded text-xs font-semibold"
            style={{ background: COLORS.accent, color: "#fff" }}
          >
            Add Panel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export function DataVizPage() {
  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS);
  const [activeTopics, setActiveTopics] = useState<Set<string>>(
    new Set(DEFAULT_PANELS.map((p) => p.topic)),
  );
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [vitalsHistory, setVitalsHistory] = useState<
    Array<{ tick: number; energy: number; happiness: number; health: number }>
  >([]);

  // ── RPC data ──
  const { data: simData, refetch: refetchSim } = useRpc<{ status?: SimStatus }>(
    "republic.simulation.status",
    {},
    [],
    { staleTimeMs: 2_000, refetchIntervalMs: playing ? 3_000 : 30_000 },
  );
  const { data: citizenData, refetch: refetchCitizens } = useRpc<{
    citizens?: CitizenSummary[];
    total?: number;
  }>("republic.citizens.list", { limit: 200 }, [], {
    staleTimeMs: 5_000,
    refetchIntervalMs: playing ? 6_000 : 60_000,
  });

  const { data: eventsData, refetch: refetchEvents } = useRpc<{ events?: WorldEvent[] }>(
    "republic.world.events",
    { limit: 200 },
    [],
    { staleTimeMs: 3_000, refetchIntervalMs: playing ? 4_000 : 30_000 },
  );


  const sim = simData?.status ?? null;
  const citizens = citizenData?.citizens ?? [];
  const events = eventsData?.events ?? [];

  // ── Build vitals history ring buffer ──
  useEffect(() => {
    if (!sim?.currentTick) {
      return;
    }
    const calcAvg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const snapshot = {
      tick: sim.currentTick,
      energy: Math.round(calcAvg(citizens.map((c) => c.energy))),
      happiness: Math.round(calcAvg(citizens.map((c) => c.happiness))),
      health: Math.round(calcAvg(citizens.map((c) => c.health))),
    };
    // Defer to avoid react-hooks/set-state-in-effect lint rule
    const tid = setTimeout(() => {
      setVitalsHistory((prev) => [...prev, snapshot].slice(-60));
    }, 0);
    return () => clearTimeout(tid);
  }, [sim?.currentTick, citizens]);

  function toggleTopic(t: string) {
    setActiveTopics((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  }

  function collapsePanel(id: string) {
    setPanels((p) => p.map((pan) => (pan.id === id ? { ...pan, collapsed: !pan.collapsed } : pan)));
  }

  function closePanel(id: string) {
    setPanels((p) => p.filter((pan) => pan.id !== id));
  }

  function addPanel(kind: PanelKind, topic: string) {
    const labels: Record<PanelKind, string> = {
      plot: "Plot",
      map2d: "2D Map",
      log: "Log",
      bar: "Bar Chart",
      inspector: "Inspector",
      timeline: "Timeline",
      argus: "Argus OSINT Fusion",
    };
    setPanels((p) => [
      ...p,
      {
        id: `p${Date.now()}`,
        kind,
        topic,
        title: `${labels[kind]} — ${topic.split("/").pop()}`,
      },
    ]);
    setActiveTopics((prev) => new Set([...prev, topic]));
  }

  function handleRefreshAll() {
    refetchSim();
    refetchCitizens();
    refetchEvents();
  }

  function exportSnapshot() {
    const snap = {
      timestamp: new Date().toISOString(),
      tick: sim?.currentTick,
      citizenCount: citizens.length,
      vitalsHistory: vitalsHistory.slice(-10),
      recentEvents: events.slice(0, 20),
    };
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `republic-snapshot-tick${sim?.currentTick ?? 0}.json`;
    a.click();
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: COLORS.bg, color: COLORS.text }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ background: COLORS.panel, borderColor: COLORS.border }}
      >
        <div className="flex items-center gap-3">
          {/* Webviz logo-style indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded"
              style={{ background: `linear-gradient(135deg, ${COLORS.accent}, #8b5cf6)` }}
            />
            <span className="text-sm font-bold tracking-wide" style={{ color: COLORS.text }}>
              Webviz
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: `${COLORS.accent}22`, color: COLORS.accent }}
            >
              HoC Republic
            </span>
          </div>
          <div className="h-4 w-px" style={{ background: COLORS.border }} />
          <span className="text-[11px]" style={{ color: COLORS.muted }}>
            {citizens.length} citizens · {panels.length} panels active
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
type="button"             onClick={handleRefreshAll}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] hover:bg-white/5 transition-colors"
            style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}
          >
            <RefreshCw size={11} /> Refresh
          </button>
          <button
type="button"             onClick={exportSnapshot}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] hover:bg-white/5 transition-colors"
            style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}
          >
            <Download size={11} /> Export
          </button>
          <button
type="button"             onClick={() => setShowAddPanel(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold"
            style={{ background: COLORS.accent, color: "#fff", border: "none" }}
          >
            <Plus size={11} /> Panel
          </button>
        </div>
      </div>

      {/* Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Topic sidebar */}
        <TopicSidebar topics={TOPICS} activeTopics={activeTopics} onToggle={toggleTopic} />

        {/* Panel grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {panels.map((panel) => (
              <div
                key={panel.id}
                className="rounded-lg overflow-hidden border"
                style={{ background: COLORS.panel, borderColor: COLORS.border }}
              >
                <PanelHeader
                  panel={panel}
                  onCollapse={() => collapsePanel(panel.id)}
                  onClose={() => closePanel(panel.id)}
                />
                {!panel.collapsed && (
                  <PanelContent
                    panel={panel}
                    citizens={citizens}
                    events={events}
                    sim={sim}
                    vitalsHistory={vitalsHistory}
                  />
                )}
              </div>
            ))}

            {panels.length === 0 && (
              <div
                className="col-span-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16"
                style={{ borderColor: COLORS.border, color: COLORS.muted }}
              >
                <Globe size={32} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">No panels open</p>
                <p className="text-xs mt-1 opacity-60">Click + Panel to add a visualization</p>
                <button
type="button"                   onClick={() => setShowAddPanel(true)}
                  className="mt-4 px-4 py-1.5 rounded text-xs font-semibold"
                  style={{ background: COLORS.accent, color: "#fff" }}
                >
                  Add Panel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Playback bar */}
      <PlaybackBar
        sim={sim}
        playing={playing}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onReset={() => setVitalsHistory([])}
      />

      {/* Add panel modal */}
      {showAddPanel && <AddPanelMenu onAdd={addPanel} onClose={() => setShowAddPanel(false)} />}
    </div>
  );
}
