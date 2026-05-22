/**
 * CPE Dashboard — Citizen Production Engine Monitor (compact)
 */
import {
  Activity,
  Cpu,
  FlaskConical,
  Gauge,
  History,
  ListOrdered,
  Music,
  RefreshCw,
  Thermometer,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import { Badge, Card, PageHeader, ProgressBar, RpcStatus, StatCard } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

interface PluginStatus {
  pluginId: string;
  state: "cold" | "loading" | "warm" | "busy" | "failed" | "evicted";
  runningJobs: number;
  pendingWakeJobs: number;
  coldStartEtaSec: number | null;
  lastActivatedAt: number | null;
}

interface SchedulerStats {
  queue: { total: number; CRITICAL: number; HIGH: number; NORMAL: number; warming: number };
  slots: Record<string, { running: number; max: number }>;
  plugins: PluginStatus[];
  budget: { totalCitizens: number; tokensAvailable: number; activeJobs: number; blocked: number };
  historySize: number;
}

interface ScheduledJob {
  id: string;
  citizenName: string;
  pluginId: string;
  method: string;
  contentType: string;
  tier: string;
  status: string;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

function stateDot(state: PluginStatus["state"]) {
  switch (state) {
    case "warm":
      return "bg-success";
    case "busy":
      return "bg-accent";
    case "loading":
      return "bg-warning animate-pulse";
    case "failed":
      return "bg-danger";
    default:
      return "bg-text-muted";
  }
}

function stateLabel(s: PluginStatus["state"]) {
  const m: Record<string, string> = {
    warm: "Warm",
    busy: "Busy",
    loading: "Loading",
    failed: "Fail",
    evicted: "Evict",
    cold: "Cold",
  };
  return m[s] ?? s;
}

function jobStatusVariant(s: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (s === "completed") {
    return "success";
  }
  if (s === "running") {
    return "info";
  }
  if (s === "warming") {
    return "warning";
  }
  if (s === "failed") {
    return "danger";
  }
  return "neutral";
}

function pluginShort(id: string) {
  return id.replace("hoc-plugin-", "").replace(/-/g, " ");
}

function elapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }
  return `${Math.floor(s / 3600)}h`;
}

export function CPEDashboard() {
  const {
    data: statusData,
    loading,
    error,
    refetch,
  } = useRpc<{ ok: boolean; stats: SchedulerStats }>("republic.cpe.status", {}, [], {
    staleTimeMs: 3000,
    refetchIntervalMs: 5000,
  });
  const { data: historyData } = useRpc<{ ok: boolean; jobs: ScheduledJob[] }>(
    "republic.cpe.history",
    { limit: 20 },
    [],
    { staleTimeMs: 5000, refetchIntervalMs: 8000 },
  );

  const stats = statusData?.stats;
  const jobs = historyData?.jobs ?? [];
  const warmCount = stats?.plugins.filter((p) => p.state === "warm").length ?? 0;
  const busyCount = stats?.plugins.filter((p) => p.state === "busy").length ?? 0;
  const coldCount =
    stats?.plugins.filter((p) => p.state === "cold" || p.state === "evicted").length ?? 0;
  const totalRunning = Object.values(stats?.slots ?? {}).reduce((s, v) => s + v.running, 0);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Production Pipeline"
        description={`${stats?.queue.total ?? 0} queued · ${totalRunning} running · ${warmCount + busyCount} warm`}
        icon={<Activity size={20} />}
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh"
            className="p-1.5 rounded-lg hover:bg-bg-secondary transition-colors text-text-muted hover:text-text-primary cursor-pointer"
          >
            <RefreshCw size={14} />
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Queued"
          value={stats?.queue.total ?? 0}
          icon={<ListOrdered size={14} />}
          sub={`${stats?.queue.warming ?? 0} warming`}
        />
        <StatCard
          label="Running"
          value={totalRunning}
          icon={<Zap size={14} />}
          sub={`${busyCount} busy`}
        />
        <StatCard
          label="Warm"
          value={warmCount + busyCount}
          icon={<Thermometer size={14} />}
          sub={`${coldCount} cold`}
        />
        <StatCard
          label="Citizens"
          value={stats?.budget.activeJobs ?? 0}
          icon={<Users size={14} />}
          sub={`${stats?.budget.blocked ?? 0} limited`}
        />
      </div>

      {/* Queue tiers */}
      <Card compact>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
          <Gauge size={10} /> Queue Tiers
        </h3>
        <div className="space-y-2">
          {[
            { tier: "CRITICAL", max: 30 },
            { tier: "HIGH", max: 100 },
            { tier: "NORMAL", max: 200 },
          ].map(({ tier, max }) => {
            const depth = stats?.queue[tier as "CRITICAL" | "HIGH" | "NORMAL"] ?? 0;
            const pct = Math.min(100, (depth / max) * 100);
            return (
              <div key={tier}>
                <div className="flex justify-between text-[10px] text-text-secondary mb-0.5">
                  <span className="font-medium">{tier}</span>
                  <span className="tabular-nums">
                    {depth}/{max}
                  </span>
                </div>
                <ProgressBar value={depth} max={max} size="sm" />
                {pct >= 80 && (
                  <p className="text-[9px] text-warning mt-0.5">⚠ Backpressure active</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Plugin states */}
      <Card compact>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
          <Cpu size={10} /> Plugins
        </h3>
        {!stats?.plugins.length && (
          <p className="text-[10px] text-text-muted">No plugins tracked yet.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(stats?.plugins ?? []).map((p) => {
            const slot = stats?.slots[p.pluginId];
            return (
              <div
                key={p.pluginId}
                className="flex flex-col gap-1.5 px-2.5 py-2 rounded-lg bg-bg-secondary border border-border/20"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateDot(p.state)}`} />
                  <span className="text-[10px] font-semibold text-text-primary capitalize truncate">
                    {pluginShort(p.pluginId)}
                  </span>
                  <Badge variant="neutral" className="ml-auto !text-[8px]">
                    {stateLabel(p.state)}
                  </Badge>
                </div>
                {slot && (
                  <ProgressBar
                    value={slot.running}
                    max={slot.max}
                    size="sm"
                    labelLeft=""
                    labelRight={`${slot.running}/${slot.max}`}
                  />
                )}
                {p.state === "loading" && p.coldStartEtaSec !== null && (
                  <div className="text-[9px] text-warning flex items-center gap-0.5">
                    <Timer size={8} />~{p.coldStartEtaSec}s
                  </div>
                )}
                {p.pendingWakeJobs > 0 && (
                  <div className="text-[9px] text-text-muted">{p.pendingWakeJobs} waiting</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Budget */}
      <Card compact>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
          <FlaskConical size={10} /> Token Budget
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-text-muted text-[10px]">Citizens</span>
            <div className="text-text-primary font-semibold tabular-nums">
              {stats?.budget.totalCitizens ?? 0}
            </div>
          </div>
          <div>
            <span className="text-text-muted text-[10px]">Tokens</span>
            <div className="text-success font-semibold tabular-nums">
              {stats?.budget.tokensAvailable ?? 0}
            </div>
          </div>
          <div>
            <span className="text-text-muted text-[10px]">Active</span>
            <div className="text-accent font-semibold tabular-nums">
              {stats?.budget.activeJobs ?? 0}
            </div>
          </div>
          <div>
            <span className="text-text-muted text-[10px]">Limited</span>
            <div className="text-danger font-semibold tabular-nums">
              {stats?.budget.blocked ?? 0}
            </div>
          </div>
        </div>
      </Card>

      {/* History */}
      <Card compact>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
          <History size={10} /> Recent Jobs
        </h3>
        {jobs.length === 0 && <p className="text-[10px] text-text-muted">No jobs yet.</p>}
        <div className="space-y-1">
          {jobs.map((job) => {
            const duration =
              job.completedAt && job.startedAt ? elapsed(job.completedAt - job.startedAt) : null;
            return (
              <div
                key={job.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-bg-secondary border border-border/10 text-[10px]"
              >
                <Music size={10} className="text-text-muted shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-text-primary font-medium truncate">{job.citizenName}</span>
                  <span className="text-text-muted truncate">
                    {pluginShort(job.pluginId)} · {job.contentType}
                  </span>
                </div>
                <Badge variant={jobStatusVariant(job.status)} dot>
                  {job.status}
                </Badge>
                {duration && (
                  <span className="text-text-muted flex items-center gap-0.5">
                    <Timer size={8} />
                    {duration}
                  </span>
                )}
                <Badge
                  variant={
                    job.tier === "CRITICAL" ? "danger" : job.tier === "HIGH" ? "warning" : "neutral"
                  }
                >
                  {job.tier}
                </Badge>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
