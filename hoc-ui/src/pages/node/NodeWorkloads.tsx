import { Boxes, Play, Pause, Cpu, Clock, RefreshCw } from "lucide-react";
import { PageHeader, Card, StatCard, Badge, Button, ProgressBar , RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface Workload {
  id: string;
  name: string;
  type: string;
  status: "running" | "paused" | "queued" | "error";
  cpu?: number;
  ram?: string;
  startedAt?: number;
  citizen?: string;
}

const STATUS_BADGE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  running: "success",
  paused: "warning",
  queued: "neutral",
  error: "danger",
};

export function NodeWorkloadsPage() {
  const { data, refetch, loading, error } = useRpc<{
    workloads?: Workload[];
    totalCpu?: number;
    oldestMs?: number;
  }>("node.workloads.list", {});
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const workloads = data?.workloads ?? [];
  const totalCpu =
    data?.totalCpu ??
    workloads.filter((w) => w.status === "running").reduce((s, w) => s + (w.cpu ?? 0), 0);
  const oldestMs = data?.oldestMs ?? 0;
  const oldestH = Math.floor(oldestMs / 3600000);

  async function toggleWorkload(id: string, current: string) {
    try {
      if (current === "running") {
        await rpc("node.workloads.pause", { id });
      } else {
        await rpc("node.workloads.resume", { id });
      }
      setTimeout(refetch, 1000);
    } catch {
      /* silent */
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Workloads"
        description="Active and queued workloads running on this node"
        icon={<Boxes size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Running"
          value={workloads.filter((w) => w.status === "running").length}
          icon={<Play size={16} />}
        />
        <StatCard label="Total" value={workloads.length} icon={<Boxes size={16} />} />
        <StatCard
          label="CPU Allocated"
          value={`${totalCpu.toFixed(1)}%`}
          icon={<Cpu size={16} />}
        />
        <StatCard
          label="Oldest"
          value={oldestMs > 0 ? `${oldestH}h` : "—"}
          icon={<Clock size={16} />}
        />
      </div>

      {workloads.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted text-center py-4">
            No active workloads. Workloads will appear here when agents are running tasks.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {workloads.map((w) => (
            <Card key={w.id}>
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-text-heading text-sm">{w.name}</p>
                    <Badge variant={STATUS_BADGE[w.status] ?? "neutral"}>{w.status}</Badge>
                    <Badge variant="neutral">{w.type}</Badge>
                  </div>
                  <div className="flex gap-3 text-xs text-text-muted">
                    {w.cpu !== undefined && <span>⚙️ {w.cpu}% CPU</span>}
                    {w.ram && <span>💾 {w.ram}</span>}
                    {w.startedAt && <span>⏱ {new Date(w.startedAt).toLocaleTimeString()}</span>}
                    {w.citizen && <span>👤 {w.citizen}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {w.status === "running" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pause size={12} />}
                      onClick={() => toggleWorkload(w.id, w.status)}
                    >
                      Pause
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      icon={<Play size={12} />}
                      onClick={() => toggleWorkload(w.id, w.status)}
                    >
                      Resume
                    </Button>
                  )}
                </div>
              </div>
              {w.status === "running" && w.cpu !== undefined && w.cpu > 0 && (
                <div className="mt-3">
                  <ProgressBar value={w.cpu} labelLeft="CPU" labelRight={`${w.cpu}%`} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
