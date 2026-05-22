import { Grid3x3, Cpu, HardDrive, Wifi, Zap, RefreshCw } from "lucide-react";
import React from "react";
import { PageHeader, Card, Badge, StatCard, Button, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

type ZoneType = "Compute" | "Storage" | "Network" | "Energy" | "Unused";

const ZONE_COLORS: Record<ZoneType, string> = {
  Compute: "#6366f1",
  Storage: "#06b6d4",
  Network: "#f59e0b",
  Energy: "#10b981",
  Unused: "#1e293b",
};

function loadOpacity(load: number, zone: ZoneType): number {
  if (zone === "Unused") {
    return 0.08;
  }
  return 0.15 + (load / 100) * 0.85;
}

const ZONE_ICONS: Record<ZoneType, React.ReactNode> = {
  Compute: <Cpu size={14} />,
  Storage: <HardDrive size={14} />,
  Network: <Wifi size={14} />,
  Energy: <Zap size={14} />,
  Unused: null,
};

const FALLBACK_ZONE_STATS = [
  { type: "Compute" as ZoneType, count: 22, avgLoad: 68 },
  { type: "Storage" as ZoneType, count: 11, avgLoad: 55 },
  { type: "Network" as ZoneType, count: 9, avgLoad: 42 },
  { type: "Energy" as ZoneType, count: 7, avgLoad: 30 },
];

function generateFallbackGrid(): Array<{ zone: ZoneType; load: number; name: string }> {
  return Array.from({ length: 64 }, (_, n) => {
    const zones: ZoneType[] = ["Compute", "Compute", "Storage", "Network", "Energy", "Unused"];
    const zone = zones[n % zones.length];
    return { zone, load: zone === "Unused" ? 0 : 30 + (n % 70), name: `${zone}-${n}` };
  });
}

export function GridPage() {
  const { data, loading, error, refetch } = useRpc<{
    zoneStats?: Array<{ type: ZoneType; count: number; avgLoad: number }>;
    cells?: Array<{ zone: ZoneType; load: number; name: string }>;
  }>("republic.grid.status", {});

  const zoneStats = data?.zoneStats ?? FALLBACK_ZONE_STATS;
  const grid = data?.cells ?? generateFallbackGrid();

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <RpcStatus loading={loading} error={error} onRetry={refetch} />
      <PageHeader
        title="Infrastructure Grid"
        description="Zone allocation heatmap across compute, storage, network, and energy sectors"
        icon={<Grid3x3 size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {zoneStats
          .filter((s) => s.type !== "Unused")
          .map((s) => (
            <StatCard
              key={s.type}
              label={s.type}
              value={`${s.avgLoad}% load`}
              sub={`${s.count} zones`}
              icon={ZONE_ICONS[s.type]}
            />
          ))}
      </div>

      {/* Heatmap Grid */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-text-heading">Zone Heatmap</h3>
          <div className="flex items-center gap-3">
            {(Object.entries(ZONE_COLORS) as [ZoneType, string][])
              .filter(([t]) => t !== "Unused")
              .map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded" style={{ background: color }} />
                  <span className="text-xs text-text-muted">{type}</span>
                </div>
              ))}
          </div>
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
          {grid.map((cell, i) => (
            <div
              key={i}
              className="aspect-square rounded flex items-center justify-center text-[8px] cursor-pointer hover:scale-110 transition-transform"
              style={{
                background: ZONE_COLORS[cell.zone],
                opacity: loadOpacity(cell.load, cell.zone),
              }}
              title={`${cell.name}: ${cell.load.toFixed(0)}% load`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
          <span>↑ Low usage</span>
          <span className="flex items-center gap-2">
            <span>Usage intensity:</span>
            <div className="flex gap-0.5">
              {[0.15, 0.35, 0.55, 0.75, 1.0].map((o, i) => (
                <span
                  key={i}
                  className="w-4 h-2 rounded-sm inline-block"
                  style={{ background: "#6366f1", opacity: o }}
                />
              ))}
            </div>
          </span>
          <span>High usage ↑</span>
        </div>
      </Card>

      {/* Zone Detail Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {zoneStats
          .filter((s) => s.type !== "Unused")
          .map((s) => (
            <Card key={s.type} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-text-secondary text-sm">
                  {ZONE_ICONS[s.type]}
                  <span>{s.type}</span>
                </div>
                <Badge variant={s.avgLoad > 70 ? "danger" : s.avgLoad > 45 ? "warning" : "success"}>
                  {s.avgLoad}%
                </Badge>
              </div>
              <div className="h-1.5 rounded-full bg-bg-input overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${s.avgLoad}%`, background: ZONE_COLORS[s.type] }}
                />
              </div>
              <p className="text-xs text-text-muted">{s.count} zones active</p>
            </Card>
          ))}
      </div>
    </div>
  );
}
