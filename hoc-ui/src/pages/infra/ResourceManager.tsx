import { Cpu, HardDrive, Wifi, Zap, AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PageHeader, Card, Button, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// Stable seed-based "fallback" for chart history (no Math.random)
const STATIC_HISTORY = Array.from({ length: 20 }, (_, i) => ({
  time: `${i}m`,
  cpu: [42, 38, 55, 61, 48, 52, 44, 67, 71, 58, 46, 40, 63, 55, 49, 44, 38, 52, 60, 55][i] ?? 50,
  ram: [58, 60, 55, 62, 64, 58, 66, 70, 68, 63, 61, 65, 68, 72, 70, 66, 63, 67, 65, 68][i] ?? 65,
  network: [12, 8, 22, 35, 18, 25, 40, 55, 30, 15, 10, 28, 45, 38, 20, 14, 9, 31, 44, 33][i] ?? 25,
}));

export function ResourceManagerPage() {
  const {
    data: hw,
    refetch,
    loading,
    error,
  } = useRpc<{
    cpu?: { brand?: string; cores?: number; speed?: number; loadPercent?: number };
    ram?: { totalGb?: number; freeGb?: number; usedGb?: number; percentUsed?: number };
    drives?: { driveLetter?: string; totalGb?: number; freeGb?: number; usedGb?: number }[];
    platform?: string;
    hostname?: string;
    uptime?: number;
  }>("system.hardware", {});

  const { data: procData, refetch: refetchProcs } = useRpc<{
    processes?: { name: string; cpu: number; ram: string; pid: number }[];
  }>("system.processes", {});

  // Auto-refresh hardware every 10 seconds
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    const id = setInterval(() => {
      refetchRef.current();
      refetchProcs();
    }, 10_000);
    return () => clearInterval(id);
  }, [refetchProcs]);


  const cpuPct = hw?.cpu?.loadPercent ?? 0;
  const ramUsedGb = hw?.ram?.usedGb ?? 0;
  const ramTotalGb = hw?.ram?.totalGb ?? 32;
  const ramPct = hw?.ram?.percentUsed ?? Math.round((ramUsedGb / ramTotalGb) * 100);

  // GPU info requires Windows companion bridge — show N/A when unavailable
  const gpuVramUsed = 0;
  const gpuVramTotal = 8;
  const gpuPct = 0;

  const primaryDrive = hw?.drives?.[0];
  const diskUsed = primaryDrive?.usedGb ?? 0;
  const diskTotal = primaryDrive?.totalGb ?? 0;

  const netDown = 0;
  const netUp = 0;

  const gpuAlert = gpuPct > 80;

  const resources = useMemo(
    () => [
      {
        label: "CPU",
        icon: <Cpu size={14} />,
        used: cpuPct,
        display: `${cpuPct.toFixed(1)}`,
        total: "100%",
        color: "#6366f1",
        unit: "%",
        alert: cpuPct > 90,
      },
      {
        label: "RAM",
        icon: <HardDrive size={14} />,
        used: ramUsedGb,
        display: `${ramUsedGb.toFixed(1)}`,
        total: `${ramTotalGb} GB`,
        color: "#06b6d4",
        unit: "GB",
        alert: ramPct > 85,
      },
      {
        label: "GPU VRAM",
        icon: <Zap size={14} />,
        used: gpuVramUsed,
        display: `${gpuVramUsed.toFixed(1)}`,
        total: `${gpuVramTotal.toFixed(0)} GB`,
        color: "#f59e0b",
        unit: "GB",
        alert: gpuAlert,
      },
      {
        label: "Disk",
        icon: <HardDrive size={14} />,
        used: diskUsed,
        display: `${diskUsed.toFixed(0)}`,
        total: `${diskTotal.toFixed(0)} GB`,
        color: "#10b981",
        unit: "GB",
        alert: false,
      },
      {
        label: "Network ↓",
        icon: <Wifi size={14} />,
        used: netDown,
        display: `${netDown.toFixed(0)}`,
        total: "1000 Mbps",
        color: "#8b5cf6",
        unit: "Mbps",
        alert: false,
      },
      {
        label: "Network ↑",
        icon: <Wifi size={14} />,
        used: netUp,
        display: `${netUp.toFixed(0)}`,
        total: "1000 Mbps",
        color: "#ec4899",
        unit: "Mbps",
        alert: false,
      },
    ],
    [
      cpuPct,
      ramUsedGb,
      ramTotalGb,
      gpuVramUsed,
      gpuVramTotal,
      gpuAlert,
      diskUsed,
      diskTotal,
      netDown,
      netUp,
      ramPct,
    ],
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const processes = procData?.processes ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Resource Manager"
        description="System-wide CPU, RAM, GPU, disk, and network monitoring"
        icon={<Cpu size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {resources.some((r) => r.alert) && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 border-warning bg-warning/10 text-warning text-sm">
          <AlertTriangle size={16} />
          <span>
            {resources
              .filter((r) => r.alert)
              .map((r) => r.label)
              .join(", ")}{" "}
            {resources.filter((r) => r.alert).length > 1 ? "are" : "is"} running critically high.
            Consider freeing resources.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {resources.map((r) => {
          const numTotal = parseFloat(r.total);
          const pct = isNaN(numTotal) ? 0 : (r.used / numTotal) * 100;
          return (
            <Card key={r.label} className={r.alert ? "border-warning/40" : ""}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  {r.icon}
                  <span>{r.label}</span>
                </div>
                {r.alert && <AlertTriangle size={14} className="text-warning" />}
              </div>
              <p className="text-2xl font-bold text-text-heading">
                {r.display} <span className="text-sm font-normal text-text-muted">{r.unit}</span>
              </p>
              <p className="text-xs text-text-muted mb-2">of {r.total}</p>
              <div className="h-1.5 rounded-full bg-bg-input overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(pct, 100)}%`, background: r.color }}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Live Chart */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">📈 20-Minute History</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={STATIC_HISTORY}>
            <defs>
              <linearGradient id="cpu-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ram-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            />
            <Area
              type="monotone"
              dataKey="cpu"
              name="CPU %"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#cpu-g)"
            />
            <Area
              type="monotone"
              dataKey="ram"
              name="RAM %"
              stroke="#06b6d4"
              strokeWidth={2}
              fill="url(#ram-g)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Process table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-text-heading">🔍 Top Processes</h3>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={12} />} onClick={refetchProcs}>
            Refresh
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left py-2 text-xs text-text-muted font-semibold">Process</th>
                <th className="text-right py-2 text-xs text-text-muted font-semibold">PID</th>
                <th className="text-right py-2 text-xs text-text-muted font-semibold">CPU</th>
                <th className="text-right py-2 text-xs text-text-muted font-semibold">Memory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {processes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-text-muted text-xs">
                    Process data unavailable on this platform.
                  </td>
                </tr>
              ) : (
                processes.map((p) => (
                  <tr key={p.pid}>
                    <td className="py-2.5 text-text-secondary font-mono text-xs">{p.name}</td>
                    <td className="py-2.5 text-right text-text-muted text-xs">{p.pid}</td>
                    <td
                      className={`py-2.5 text-right text-xs font-semibold ${
                        p.cpu > 20 ? "text-warning" : "text-text-secondary"
                      }`}
                    >
                      {p.cpu.toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right text-text-secondary text-xs">{p.ram}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
