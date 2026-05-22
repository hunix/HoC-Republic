import { HardDrive, Cpu, Thermometer, Zap, RefreshCw } from "lucide-react";
import { PageHeader, Card, StatCard, ProgressBar, Badge, Button , RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

interface Drive {
  name: string;
  size: string;
  usedGb: number;
  totalGb: number;
  speed?: string;
}

export function NodeHardwarePage() {
  const { data: gpuInfo, refetch: refetchGpu, loading, error } = useRpc<{
    gpus?: {
      name?: string;
      vram?: string;
      vramTotalMb?: number;
      vramUsedMb?: number;
      driver?: string;
      utilizationPercent?: number;
      temperatureC?: number;
    }[];
  }>("windows.hardware.gpu.info", {});
  const { data: memInfo, refetch: refetchMem } = useRpc<{
    totalGb?: number;
    usedGb?: number;
    percentUsed?: number;
    speed?: string;
  }>("windows.hardware.memory.info", {});

  const { data: diskInfo, refetch: refetchDisk } = useRpc<{
    drives?: {
      driveLetter?: string;
      label?: string;
      totalGb?: number;
      usedGb?: number;
      freeGb?: number;
    }[];
  }>("windows.hardware.disk.info", {});

  const { data: sysInfo, refetch: refetchSys } = useRpc<{
    cpu?: {
      brand?: string;
      cores?: number;
      threads?: number;
      speed?: number;
      speedMax?: number;
      loadPercent?: number;
      temperatureC?: number;
    };
  }>("windows.system.info", {});

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetchGpu} />;
  }

  function refetchAll() {
    refetchGpu();
    refetchMem();
    refetchDisk();
    refetchSys();
  }

  const cpu = sysInfo?.cpu;
  const cpuUsage = Math.round(cpu?.loadPercent ?? 0);
  const cpuTemp = cpu?.temperatureC ?? null;

  const gpu = gpuInfo?.gpus?.[0];
  const gpuUsage = Math.round(gpu?.utilizationPercent ?? 0);
  const gpuTemp = gpu?.temperatureC ?? null;
  const gpuVramUsedMb = gpu?.vramUsedMb ?? 0;
  const gpuVramTotalMb = gpu?.vramTotalMb ?? 0;
  const gpuVramPct = gpuVramTotalMb > 0 ? Math.round((gpuVramUsedMb / gpuVramTotalMb) * 100) : 0;

  const ramUsedGb = memInfo?.usedGb ?? 0;
  const ramTotalGb = memInfo?.totalGb ?? 0;
  const ramPct =
    memInfo?.percentUsed ?? (ramTotalGb > 0 ? Math.round((ramUsedGb / ramTotalGb) * 100) : 0);

  const drives: Drive[] = (diskInfo?.drives ?? []).map((d) => ({
    name: `Drive ${d.driveLetter ?? "?"} ${d.label ? `(${d.label})` : ""}`.trim(),
    size: `${(d.totalGb ?? 0).toFixed(0)}GB`,
    usedGb: d.usedGb ?? 0,
    totalGb: d.totalGb ?? 1,
    speed: undefined,
  }));

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Node Hardware"
        description="Physical hardware specifications and real-time resource monitoring"
        icon={<HardDrive size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetchAll}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="CPU Usage"
          value={`${cpuUsage}%`}
          icon={<Cpu size={16} />}
          sub={cpu?.cores ? `${cpu.cores}C / ${cpu.threads ?? "?"}T` : undefined}
        />
        <StatCard
          label="RAM Usage"
          value={`${ramUsedGb.toFixed(1)} GB`}
          icon={<HardDrive size={16} />}
          sub={ramTotalGb > 0 ? `of ${ramTotalGb.toFixed(0)} GB` : undefined}
        />
        <StatCard
          label="GPU Temp"
          value={gpuTemp !== null ? `${gpuTemp}°C` : "—"}
          icon={<Thermometer size={16} />}
        />
        <StatCard
          label="GPU Usage"
          value={`${gpuUsage}%`}
          icon={<Zap size={16} />}
          sub={gpu?.name ?? undefined}
        />
      </div>

      {/* CPU */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Cpu size={18} className="text-accent" />
          <h3 className="font-semibold text-text-heading">CPU — {cpu?.brand ?? "Detecting…"}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
          <div>
            <p className="text-text-muted text-xs">Cores / Threads</p>
            <p className="font-bold text-text-heading">
              {cpu?.cores ?? "?"}/{cpu?.threads ?? "?"}
            </p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Base Clock</p>
            <p className="font-bold text-text-heading">{cpu?.speed ? `${cpu.speed} GHz` : "—"}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Max Clock</p>
            <p className="font-bold text-text-heading">
              {cpu?.speedMax ? `${cpu.speedMax} GHz` : "—"}
            </p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Temperature</p>
            <p className="font-bold text-text-heading">{cpuTemp !== null ? `${cpuTemp}°C` : "—"}</p>
          </div>
        </div>
        <ProgressBar value={cpuUsage} labelLeft="Usage" labelRight={`${cpuUsage}%`} />
      </Card>

      {/* GPU */}
      {gpu && (
        <Card className="border-purple-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-purple-400" />
              <h3 className="font-semibold text-text-heading">GPU — {gpu.name ?? "Unknown"}</h3>
            </div>
            {gpu.driver && <Badge variant="purple">Driver {gpu.driver}</Badge>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <p className="text-text-muted text-xs">VRAM</p>
              <p className="font-bold text-text-heading">
                {gpu.vramUsedMb
                  ? `${(gpu.vramUsedMb / 1024).toFixed(1)} / ${(gpuVramTotalMb / 1024).toFixed(1)} GB`
                  : (gpu.vram ?? "—")}
              </p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Temperature</p>
              <p className="font-bold text-text-heading">
                {gpuTemp !== null ? `${gpuTemp}°C` : "—"}
              </p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Utilization</p>
              <p className="font-bold text-text-heading">{gpuUsage}%</p>
            </div>
          </div>
          <ProgressBar value={gpuVramPct} labelLeft="VRAM" labelRight={`${gpuVramPct}%`} />
        </Card>
      )}

      {/* RAM */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <HardDrive size={18} className="text-info" />
          <h3 className="font-semibold text-text-heading">
            RAM — {ramTotalGb > 0 ? `${ramTotalGb.toFixed(0)} GB` : "Detecting…"}
            {memInfo?.speed ? ` · ${memInfo.speed}` : ""}
          </h3>
        </div>
        <ProgressBar
          value={ramPct}
          labelLeft={`${ramUsedGb.toFixed(1)} GB used`}
          labelRight={`${ramPct}%`}
        />
      </Card>

      {/* Storage */}
      {drives.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <HardDrive size={18} className="text-success" />
            <h3 className="font-semibold text-text-heading">Storage</h3>
          </div>
          <div className="space-y-4">
            {drives.map((d) => {
              const pct = Math.round((d.usedGb / d.totalGb) * 100);
              return (
                <div key={d.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-text-secondary">{d.name}</span>
                    <span className="text-text-muted text-xs">
                      {d.usedGb.toFixed(0)}GB / {d.size} {d.speed ? `· ${d.speed}` : ""}
                    </span>
                  </div>
                  <ProgressBar value={pct} />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
