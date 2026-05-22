import { Shield, Activity, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PageHeader, Card, Badge, StatCard, Button, ProgressBar , RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

const UPTIME_DATA = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  uptime: 95 + (i % 5),
  incidents: i % 8 === 0 ? 1 : 0,
}));
// Static fallback — no Math.random()
const UPTIME_FALLBACK = UPTIME_DATA;

const SYSTEMS = [
  { name: "Gateway API", health: 99.8, status: "Healthy", uptime: 720 },
  { name: "WebSocket Server", health: 98.5, status: "Healthy", uptime: 720 },
  { name: "Redis State Store", health: 99.9, status: "Healthy", uptime: 720 },
  { name: "Agent Runtime", health: 97.2, status: "Degraded", uptime: 680 },
  { name: "Plugin Manager", health: 94.1, status: "Warning", uptime: 650 },
  { name: "LLM Inference", health: 99.7, status: "Healthy", uptime: 718 },
];

const INCIDENTS = [
  {
    id: "Inc-001",
    title: "Agent Runtime memory spike",
    severity: "Warning",
    resolved: true,
    duration: "12min",
    ts: Date.now() - 7200000,
  },
  {
    id: "Inc-002",
    title: "Plugin load timeout (Docker plugin)",
    severity: "Error",
    resolved: true,
    duration: "5min",
    ts: Date.now() - 86400000,
  },
  {
    id: "Inc-003",
    title: "WebSocket reconnect storm",
    severity: "Info",
    resolved: true,
    duration: "2min",
    ts: Date.now() - 172800000,
  },
];

type System = { name: string; health: number; status: string; uptime: number };
type Incident = {
  id: string;
  title: string;
  severity: string;
  resolved: boolean;
  duration: string;
  ts: number;
};
type UptimePoint = { hour: string; uptime: number; incidents: number };

export function ResiliencePage() {
  const { data, refetch, loading, error } = useRpc<{
    systems?: System[];
    incidents?: Incident[];
    uptimeData?: UptimePoint[];
    avgUptime: number;
  }>("republic.resilience.health", {});
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const systems = data?.systems ?? SYSTEMS;
  const incidents = data?.incidents ?? INCIDENTS;
  const uptimeData = data?.uptimeData ?? UPTIME_FALLBACK;
  const avgUptime = data?.avgUptime ?? 99.2;
  const healthy = systems.filter((s) => s.status === "Healthy").length;
  const degraded = systems.filter((s) => s.status !== "Healthy").length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Resilience"
        description="System health, uptime tracking, and incident recovery"
        icon={<Shield size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Systems Healthy"
          value={`${healthy}/${systems.length}`}
          icon={<CheckCircle size={16} />}
        />
        <StatCard
          label="Issues Pending"
          value={degraded}
          icon={<AlertTriangle size={16} />}
          sub={degraded === 0 ? "All clear!" : "Needs attention"}
        />
        <StatCard label="Avg Uptime" value={`${avgUptime}%`} icon={<Activity size={16} />} />
        <StatCard label="Incidents (30d)" value={incidents.length} icon={<Shield size={16} />} />
      </div>

      {/* Uptime Trend */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">📈 24h System Uptime</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={uptimeData}>
            <defs>
              <linearGradient id="up-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="hour"
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              domain={[90, 100]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            />
            <Area
              type="monotone"
              dataKey="uptime"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#up-grad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* System Health */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">🔍 System Health Status</h3>
        <div className="space-y-3">
          {systems.map((s) => (
            <div key={s.name} className="flex items-center gap-4">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === "Healthy" ? "bg-success" : s.status === "Degraded" ? "bg-danger" : "bg-warning"}`}
              />
              <span className="text-sm text-text-secondary w-44 flex-shrink-0">{s.name}</span>
              <ProgressBar value={s.health} className="flex-1" />
              <span className="text-xs font-semibold w-12 text-right text-text-heading">
                {s.health}%
              </span>
              <Badge
                variant={
                  s.status === "Healthy"
                    ? "success"
                    : s.status === "Degraded"
                      ? "danger"
                      : "warning"
                }
                className="w-20 justify-center"
              >
                {s.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Incidents */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">⚠️ Recent Incidents</h3>
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className="flex items-start justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
            >
              <div className="flex items-start gap-3">
                <Badge
                  variant={
                    inc.severity === "Error"
                      ? "danger"
                      : inc.severity === "Warning"
                        ? "warning"
                        : "info"
                  }
                >
                  {inc.severity}
                </Badge>
                <div>
                  <p className="text-sm font-medium text-text-heading">{inc.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Duration: {inc.duration} · {new Date(inc.ts).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {inc.resolved && <Badge variant="success">✓ Resolved</Badge>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
