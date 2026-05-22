import { Atom, RefreshCw, Link, Zap, BarChart2 } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type QuantumState = {
  nodeId: string;
  name?: string;
  coherence: number;
  entangled?: boolean;
  syncedAt?: number;
  divergence?: number;
};
type QuantumSyncJob = {
  id: string;
  sourceNode: string;
  targetNode: string;
  status: "pending" | "syncing" | "completed" | "failed";
  progress?: number;
  startedAt: number;
};

const sv = (s: string) => {
  if (s === "completed") {return "success" as const;}
  if (s === "syncing" || s === "pending") {return "info" as const;}
  if (s === "failed") {return "danger" as const;}
  return "neutral" as const;
};

export function QuantumSyncPage() {
  const { data, refetch, loading, error } = useRpc<{
    globalCoherence?: number;
    syncedNodes?: number;
    totalNodes?: number;
    avgDivergence?: number;
    states?: QuantumState[];
  }>("republic.quantum.state", {}, [], { staleTimeMs: 5_000, refetchIntervalMs: 8_000 });
  const { data: jobsData } = useRpc<{ jobs?: QuantumSyncJob[] }>(
    "republic.quantum.sync.jobs",
    {},
    [],
    { staleTimeMs: 5_000, refetchIntervalMs: 8_000 },
  );
  const [actionError, setActionError] = useState("");
  const [syncSource, setSyncSource] = useState("");
  const [syncTarget, setSyncTarget] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const states = data?.states ?? [];
  const jobs = jobsData?.jobs ?? [];
  const activeJobs = jobs.filter((j) => j.status === "syncing" || j.status === "pending");

  async function triggerSync() {
    try {
      await rpc("republic.quantum.sync", {
        sourceNodeId: syncSource.trim() || undefined,
        targetNodeId: syncTarget.trim() || undefined,
      });
      invalidateRpcCache("republic.quantum.sync.jobs");
      setSyncSource("");
      setSyncTarget("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function forceCoherence() {
    try {
      await rpc("republic.quantum.coherence.force", {});
      invalidateRpcCache("republic.quantum.state");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const gc = data?.globalCoherence ?? 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Quantum State Sync"
        description="Maintain quantum coherence across distributed republic nodes and agents"
        icon={<Atom size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
            <Button size="sm" icon={<Zap size={14} />} onClick={forceCoherence}>
              Force Coherence
            </Button>
          </div>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div
        className={`p-4 rounded-xl border flex items-center gap-4 ${gc > 0.8 ? "bg-success/10 border-success/30" : gc > 0.5 ? "bg-warning/10 border-warning/30" : "bg-danger/10 border-danger/30"}`}
      >
        <div className="flex-shrink-0">
          <Atom
            size={32}
            className={gc > 0.8 ? "text-success" : gc > 0.5 ? "text-warning" : "text-danger"}
          />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-text-heading">Global Quantum Coherence</p>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 h-3 rounded-full bg-bg-input overflow-hidden max-w-xs">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${gc * 100}%`,
                  background: gc > 0.8 ? "#22c55e" : gc > 0.5 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
            <span className="font-mono font-bold text-lg">{(gc * 100).toFixed(1)}%</span>
          </div>
        </div>
        <Badge variant={gc > 0.8 ? "success" : gc > 0.5 ? "warning" : "danger"}>
          {gc > 0.8 ? "Stable" : gc > 0.5 ? "Drifting" : "Critical"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Synced Nodes"
          value={`${data?.syncedNodes ?? 0}/${data?.totalNodes ?? 0}`}
          icon={<Link size={16} />}
        />
        <StatCard label="Active Jobs" value={activeJobs.length} icon={<RefreshCw size={16} />} />
        <StatCard
          label="Avg Divergence"
          value={`${(data?.avgDivergence ?? 0).toFixed(3)}`}
          icon={<BarChart2 size={16} />}
        />
        <StatCard label="States" value={states.length} icon={<Atom size={16} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <RefreshCw size={16} /> Trigger Sync
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Source Node ID (blank = all)..."
              value={syncSource}
              onChange={(e) => setSyncSource(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Target Node ID (blank = all)..."
              value={syncTarget}
              onChange={(e) => setSyncTarget(e.target.value)}
            />
            <Button onClick={triggerSync} icon={<RefreshCw size={14} />}>
              Sync Nodes
            </Button>
          </div>
          {activeJobs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-text-muted font-semibold mb-2">Active Sync Jobs</p>
              {activeJobs.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between text-xs p-2 rounded bg-bg-secondary border border-border/30 mb-1"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={sv(j.status)}>{j.status}</Badge>
                    <span className="font-mono text-text-muted">
                      {j.sourceNode.slice(0, 8)} → {j.targetNode.slice(0, 8)}
                    </span>
                  </div>
                  {j.progress != null && (
                    <span className="font-mono text-accent">{j.progress}%</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🔮 Node States</h3>
          {states.length === 0 ? (
            <p className="text-sm text-text-muted">No state data.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {states.map((s) => (
                <div key={s.nodeId} className="p-2 rounded bg-bg-secondary border border-border/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-text-heading">
                      {s.name ?? s.nodeId.slice(0, 12)}
                    </span>
                    <div className="flex items-center gap-2">
                      {s.entangled && <Badge variant="purple">entangled</Badge>}
                      <span
                        className={`text-xs font-mono ${s.coherence > 0.8 ? "text-success" : s.coherence > 0.5 ? "text-warning" : "text-danger"}`}
                      >
                        {(s.coherence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-input overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.coherence * 100}%`,
                        background:
                          s.coherence > 0.8 ? "#22c55e" : s.coherence > 0.5 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                  {s.divergence != null && s.divergence > 0.1 && (
                    <p className="text-xs text-warning mt-1">
                      Divergence: {s.divergence.toFixed(3)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {jobs.filter((j) => j.status === "completed" || j.status === "failed").length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">📋 Sync History</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {jobs
              .filter((j) => j.status !== "syncing" && j.status !== "pending")
              .slice(0, 15)
              .map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between text-xs p-2 rounded bg-bg-secondary border border-border/20"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={sv(j.status)}>{j.status}</Badge>
                    <span className="font-mono text-text-muted">
                      {j.sourceNode.slice(0, 8)} → {j.targetNode.slice(0, 8)}
                    </span>
                  </div>
                  <span className="text-text-muted">
                    {new Date(j.startedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
