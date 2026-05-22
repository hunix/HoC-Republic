import {
  LayoutDashboard,
  Bot,
  Users,
  MonitorDot,
  Puzzle,
  MessageSquare,
  Activity,
  Zap,
  Brain,
  RefreshCw,
  Film,
  Cpu,
  Wifi,
  WifiOff,
  ArrowUpRight,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  PageHeader,
  StatCard,
  Card,
  ProgressBar,
  Badge,
  Button,
  RpcStatus,
  MiniChart,
} from "@/components/ui";
import { useRpc, onWsMessage } from "@/lib/rpc";
import { useGatewayStore } from "@/stores/gateway";

interface SessionEntry {
  id: string;
  key?: string;
  agentName?: string;
  agentId?: string;
  messageCount?: number;
  status?: string;
  updatedAt?: number;
}

interface HwCapabilities {
  cpuCores: number;
  cpuModel: string;
  ramGb: number;
  freeRamGb: number;
  totalVramGb: number;
  freeVramGb: number;
  gpus: Array<{ name: string; vramGb: number; freeVramGb: number }>;
}

// ── Helpers ──────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) {
    return `${Math.floor(diff / 1000)}s`;
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h`;
  }
  return `${Math.floor(diff / 86_400_000)}d`;
}

function fmtGb(v: number): string {
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
}

// ── Page ─────────────────────────────────────────────────────────

export function DashboardPage() {
  const gw = useGatewayStore();

  // Live sparkline data (last 30 ticks of WS activity)
  const [sparkMessages, setSparkMessages] = useState<number[]>(() => Array(30).fill(0));
  const [sparkProductions, setSparkProductions] = useState<number[]>(() => Array(30).fill(0));

  // Live activity chart — 24h buckets
  const [activityChart, setActivityChart] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      h: `${i}:00`,
      msg: 0,
      prod: 0,
    })),
  );

  // WS event tracker — feeds both sparkline and chart
  useEffect(() => {
    let msgBucket = 0;
    let prodBucket = 0;

    const unsub = onWsMessage((raw) => {
      const event = (raw as { event?: string }).event ?? "";
      const isProd =
        event.includes("production") || event.includes("output") || event.includes("creative");
      const isMsg = raw.type === "res" || event.includes("message") || event.includes("chat");
      if (isProd) {
        prodBucket++;
      }
      if (isMsg) {
        msgBucket++;
      }
      if (!isProd && !isMsg) {
        return;
      }

      const hourIdx = new Date().getHours();
      setActivityChart((prev) => {
        const next = [...prev];
        if (isProd) {
          next[hourIdx] = { ...next[hourIdx]!, prod: next[hourIdx]!.prod + 1 };
        }
        if (isMsg) {
          next[hourIdx] = { ...next[hourIdx]!, msg: next[hourIdx]!.msg + 1 };
        }
        return next;
      });
    });

    // Sparkline: push a new point every 2s
    const tickTimer = setInterval(() => {
      setSparkMessages((p) => [...p.slice(1), msgBucket]);
      setSparkProductions((p) => [...p.slice(1), prodBucket]);
      msgBucket = 0;
      prodBucket = 0;
    }, 2000);

    return () => {
      unsub();
      clearInterval(tickTimer);
    };
  }, []);

  // RPC calls
  const {
    data: sessionsData,
    loading: sessLoad,
    error: sessErr,
    refetch: refetchSessions,
  } = useRpc<{ sessions: SessionEntry[] }>("sessions.list", {
    limit: 6,
    includeDerivedTitles: true,
  });

  const { data: productionsData } = useRpc<{ ok?: boolean; files?: unknown[] }>(
    "republic.productions.files",
    {},
  );

  const { data: hwData } = useRpc<{
    cpu?: { brand?: string; cores?: number; speed?: number };
    ram?: { totalGb?: number; freeGb?: number; usedGb?: number; percentUsed?: number };
  }>("system.hardware");

  const { data: healthData } = useRpc<{
    hardware?: HwCapabilities;
    hw?: HwCapabilities;
  }>("health");

  // Build HW object
  const hw = useMemo<HwCapabilities | null>(() => {
    if (hwData?.cpu || hwData?.ram) {
      const cap = (healthData?.hardware ?? healthData?.hw) as HwCapabilities | undefined;
      return {
        cpuCores: hwData!.cpu?.cores ?? cap?.cpuCores ?? 0,
        cpuModel: hwData!.cpu?.brand ?? cap?.cpuModel ?? "",
        ramGb: hwData!.ram?.totalGb ?? cap?.ramGb ?? 0,
        freeRamGb: hwData!.ram?.freeGb ?? cap?.freeRamGb ?? 0,
        totalVramGb: cap?.totalVramGb ?? 0,
        freeVramGb: cap?.freeVramGb ?? 0,
        gpus: (cap?.gpus ?? []).map((g) => ({
          name: g.name ?? "",
          vramGb: g.vramGb ?? 0,
          freeVramGb: g.freeVramGb ?? 0,
        })),
      };
    }
    return healthData?.hardware ?? healthData?.hw ?? null;
  }, [hwData, healthData]);

  const recentSessions = sessionsData?.sessions ?? [];
  const citizenCount = gw.citizenCount;
  const agentCount = gw.agentCount;
  const nodeCount = gw.nodeCount;
  const pluginCount = gw.pluginCount;
  const productionCount = (productionsData?.files ?? []).length;

  const ramPct = hw ? Math.round(((hw.ramGb - hw.freeRamGb) / hw.ramGb) * 100) : 0;
  const vramPct =
    hw && hw.totalVramGb > 0
      ? Math.round(((hw.totalVramGb - hw.freeVramGb) / hw.totalVramGb) * 100)
      : 0;

  // Guard after all hooks
  if (sessLoad || sessErr) {
    return <RpcStatus loading={sessLoad} error={sessErr} onRetry={refetchSessions} />;
  }

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Dashboard"
        icon={<LayoutDashboard size={20} />}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant={gw.connected ? "success" : "danger"} dot>
              {gw.connected ? "Online" : "Offline"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={13} />}
              aria-label="Refresh"
              onClick={refetchSessions}
            />
          </div>
        }
      />

      {/* ── Stat Strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Agents" value={agentCount || "—"} icon={<Bot size={15} />} />
        <StatCard label="Citizens" value={citizenCount || "—"} icon={<Users size={15} />} />
        <StatCard label="Nodes" value={nodeCount || "—"} icon={<MonitorDot size={15} />} />
        <StatCard label="Plugins" value={pluginCount || "—"} icon={<Puzzle size={15} />} />
        <StatCard
          label="Productions"
          value={productionCount > 0 ? productionCount.toLocaleString() : "—"}
          icon={<Film size={15} />}
        />
        <StatCard
          label="Sessions"
          value={gw.sessionCount || "—"}
          icon={<MessageSquare size={15} />}
        />
      </div>

      {/* ── Main Bento Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Chart — 2 cols */}
        <Card compact className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-text-muted" />
              <span className="text-xs font-semibold text-text-heading">Activity · 24h</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                Messages
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                Productions
              </span>
            </div>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityChart}>
                <defs>
                  <linearGradient id="msgG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prodG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="h"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval={3}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(15,23,42,0.9)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(148,163,184,0.15)",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    fontSize: "11px",
                    padding: "6px 10px",
                  }}
                  labelStyle={{ color: "#94a3b8", fontSize: "10px" }}
                />
                <Area
                  type="monotone"
                  dataKey="msg"
                  name="Messages"
                  stroke="#3b82f6"
                  fill="url(#msgG)"
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="prod"
                  name="Productions"
                  stroke="#8b5cf6"
                  fill="url(#prodG)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Quick Status — 1 col */}
        <Card compact>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-text-muted" />
            <span className="text-xs font-semibold text-text-heading">Status</span>
          </div>
          <div className="space-y-2.5">
            <StatusRow
              label="Gateway"
              icon={gw.connected ? <Wifi size={13} /> : <WifiOff size={13} />}
              value={gw.connected ? "Online" : "Offline"}
              variant={gw.connected ? "success" : "danger"}
            />
            <StatusRow
              label="Uptime"
              icon={<Activity size={13} />}
              value={gw.uptime || "—"}
              variant="neutral"
            />
            <StatusRow
              label="Version"
              icon={<ArrowUpRight size={13} />}
              value={gw.version || "—"}
              variant="neutral"
            />
          </div>

          {/* Live Sparklines */}
          <div className="mt-4 pt-3 border-t border-border/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Messages/s</span>
              <MiniChart data={sparkMessages} color="#3b82f6" width={80} height={18} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Productions/s</span>
              <MiniChart data={sparkProductions} color="#8b5cf6" width={80} height={18} />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Second Row: HW + Sessions ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* System Resources */}
        <Card compact>
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={14} className="text-text-muted" />
            <span className="text-xs font-semibold text-text-heading">Resources</span>
          </div>
          {hw?.cpuModel && (
            <p className="text-[10px] text-text-muted mb-3 truncate">{hw.cpuModel}</p>
          )}
          <div className="space-y-3">
            <ProgressBar
              value={ramPct}
              labelLeft={`RAM ${hw ? fmtGb(hw.ramGb - hw.freeRamGb) : "—"}G`}
              labelRight={`${hw ? fmtGb(hw.ramGb) : "—"}G`}
              size="sm"
            />
            {hw && hw.totalVramGb > 0 && (
              <ProgressBar
                value={vramPct}
                labelLeft={`VRAM ${fmtGb(hw.totalVramGb - hw.freeVramGb)}G`}
                labelRight={`${fmtGb(hw.totalVramGb)}G`}
                size="sm"
              />
            )}
            {(hw?.gpus ?? []).map((gpu, i) => {
              const used = gpu.vramGb > 0 ? ((gpu.vramGb - gpu.freeVramGb) / gpu.vramGb) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-2">
                  <Brain size={12} className="text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-[10px] text-text-muted mb-0.5">
                      <span className="truncate">{gpu.name}</span>
                      <span>{fmtGb(gpu.freeVramGb)}G free</span>
                    </div>
                    <ProgressBar value={used} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent Sessions — 2 cols */}
        <Card compact className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-text-muted" />
              <span className="text-xs font-semibold text-text-heading">Recent Sessions</span>
            </div>
            <span className="text-[10px] text-text-muted">{recentSessions.length} shown</span>
          </div>
          {recentSessions.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">No sessions yet</p>
          ) : (
            <div className="divide-y divide-border/15">
              {recentSessions.map((s) => (
                <div
                  key={s.key ?? s.id}
                  className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Bot size={13} className="text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-text-primary font-medium font-mono truncate max-w-[200px]">
                        {s.key ?? s.id}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {s.agentName ?? s.agentId ?? "agent"}
                        {s.updatedAt ? ` · ${timeAgo(s.updatedAt)}` : ""}
                      </div>
                    </div>
                  </div>
                  <Badge variant={s.status === "active" ? "success" : "neutral"} dot>
                    {s.status ?? "closed"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Sub Components ────────────────────────────────────────────────

function StatusRow({
  label,
  icon,
  value,
  variant,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  variant: "success" | "danger" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}
