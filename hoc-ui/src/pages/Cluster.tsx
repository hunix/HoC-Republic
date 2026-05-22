import { Globe, Wifi, Server, GitBranch, RefreshCw, Activity } from "lucide-react";
import { PageHeader, Card, Badge, StatCard, Button, ProgressBar, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

interface ClusterNode {
  id: string;
  name: string;
  role: string;
  status: string;
  latency?: number;
  citizens?: number;
  cpu?: number;
  ram?: number;
  location?: string;
}

interface SyncEvent {
  type: string;
  source: string;
  target: string;
  ts: number;
  size?: string;
}

const FALLBACK_NODES: ClusterNode[] = [
  {
    id: "gateway",
    name: "Gateway Node",
    role: "Primary",
    status: "online",
    latency: 0,
    citizens: 0,
    cpu: 0,
    ram: 0,
    location: "Local",
  },
];

export function ClusterPage() {
  const { data, loading, refetch, error } = useRpc<{
    nodes?: ClusterNode[];
    syncEvents?: SyncEvent[];
    totalCitizens?: number;
    avgLatencyMs?: number;
  }>("cluster.status", {});

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const nodes = data?.nodes ?? FALLBACK_NODES;
  const syncEvents = data?.syncEvents ?? [];
  const online = nodes.filter((n) => n.status === "online").length;
  const totalCitizens = data?.totalCitizens ?? nodes.reduce((s, n) => s + (n.citizens ?? 0), 0);
  const avgLatency =
    data?.avgLatencyMs ??
    nodes.filter((n) => n.latency).reduce((s, n) => s + (n.latency ?? 0), 0) /
      Math.max(nodes.filter((n) => n.latency).length, 1);

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Cluster"
        description={`${online}/${nodes.length} online · ${avgLatency.toFixed(0)}ms avg latency`}
        icon={<Globe size={20} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={13} />}
            aria-label="Sync"
            onClick={refetch}
          />
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Online" value={`${online}/${nodes.length}`} icon={<Server size={14} />} />
        <StatCard label="Citizens" value={totalCitizens} icon={<Activity size={14} />} />
        <StatCard
          label="Avg Latency"
          value={`${avgLatency.toFixed(0)}ms`}
          icon={<Wifi size={14} />}
        />
        <StatCard label="Sync (1h)" value={syncEvents.length} icon={<GitBranch size={14} />} />
      </div>

      {/* Topology */}
      <Card compact>
        <h3 className="text-xs font-semibold text-text-heading mb-3">Cluster Topology</h3>
        <div className="relative flex flex-col items-center gap-3">
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-xl bg-accent/20 border-2 border-accent flex flex-col items-center justify-center">
              <Server size={18} className="text-accent" />
              <span className="text-[8px] font-bold text-accent mt-0.5">GATEWAY</span>
            </div>
            <p className="text-[10px] text-text-muted mt-1">Primary</p>
          </div>
          <div className="flex items-center justify-center gap-6 w-full flex-wrap">
            {nodes
              .filter((n) => n.role !== "Primary")
              .map((node) => (
                <div key={node.id} className="flex flex-col items-center">
                  <div
                    className={`w-1.5 h-6 rounded-full mb-1.5 ${node.status === "online" ? "bg-success/50" : "bg-border/30"}`}
                  />
                  <div
                    className={`w-12 h-12 rounded-lg border-2 flex flex-col items-center justify-center ${node.status === "online" ? "border-success bg-success/10" : "border-border bg-bg-secondary"}`}
                  >
                    <Server
                      size={14}
                      className={node.status === "online" ? "text-success" : "text-text-muted"}
                    />
                    <span className="text-[8px] font-bold mt-0.5 text-text-muted truncate max-w-[40px]">
                      {node.name.split(" ").pop()}
                    </span>
                  </div>
                  <p className="text-[9px] text-text-muted mt-0.5">
                    {node.latency ? `${node.latency}ms` : "Offline"}
                  </p>
                </div>
              ))}
            {nodes.filter((n) => n.role !== "Primary").length === 0 && (
              <p className="text-[10px] text-text-muted py-3">Standalone mode · no workers</p>
            )}
          </div>
        </div>
      </Card>

      {/* Node Status */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-text-heading">Node Status</h3>
        {nodes.map((n) => (
          <Card key={n.id} compact>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Server
                  size={13}
                  className={n.status === "online" ? "text-success" : "text-text-muted"}
                />
                <div>
                  <p className="text-xs font-semibold text-text-heading">{n.name}</p>
                  <p className="text-[10px] text-text-muted">
                    {n.role} · {n.location ?? "—"} {n.latency ? `· ${n.latency}ms` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {n.citizens !== undefined && (
                  <span className="text-[10px] text-text-muted">{n.citizens} citizens</span>
                )}
                <Badge variant={n.status === "online" ? "success" : "danger"} dot>
                  {n.status}
                </Badge>
              </div>
            </div>
            {n.status === "online" && (n.cpu !== undefined || n.ram !== undefined) && (
              <div className="grid grid-cols-2 gap-2">
                {n.cpu !== undefined && (
                  <ProgressBar value={n.cpu} labelLeft="CPU" labelRight={`${n.cpu}%`} size="sm" />
                )}
                {n.ram !== undefined && (
                  <ProgressBar value={n.ram} labelLeft="RAM" labelRight={`${n.ram}%`} size="sm" />
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Sync events */}
      {syncEvents.length > 0 && (
        <Card compact>
          <h3 className="text-xs font-semibold text-text-heading mb-2">Recent Sync Events</h3>
          <div className="divide-y divide-border/10">
            {syncEvents.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {e.type === "state-sync"
                      ? "🔄"
                      : e.type === "citizen-migrate"
                        ? "👤"
                        : e.type === "heartbeat"
                          ? "💗"
                          : "📦"}
                  </span>
                  <div>
                    <span className="text-[10px] font-mono text-text-secondary">
                      {e.source} → {e.target}
                    </span>
                    <p className="text-[9px] text-text-muted">
                      {e.type} {e.size ? `· ${e.size}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-[9px] text-text-muted tabular-nums">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {syncEvents.length === 0 && (
        <Card compact>
          <p className="text-[10px] text-text-muted text-center py-3">
            No sync events · Standalone mode
          </p>
        </Card>
      )}
    </div>
  );
}
