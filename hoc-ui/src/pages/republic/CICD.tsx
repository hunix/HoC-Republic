import {
  GitBranch,
  Play,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type CICDPipeline = {
  id: string;
  name: string;
  branch?: string;
  status: "idle" | "running" | "success" | "failed" | "cancelled";
  lastRun?: number;
  duration?: number;
  stages?: string[];
};
type CICDRun = {
  id: string;
  pipelineId: string;
  status: string;
  startedAt: number;
  completedAt?: number;
  logs?: string[];
  failedStage?: string;
};

const sv = (s: string) => {
  if (s === "success" || s === "completed") {return "success" as const;}
  if (s === "running") {return "info" as const;}
  if (s === "failed") {return "danger" as const;}
  if (s === "cancelled") {return "warning" as const;}
  return "neutral" as const;
};

export function CICDPage() {
  const { data, loading, refetch, error } = useRpc<{
    pipelines?: CICDPipeline[];
    successRate?: number;
    avgDuration?: number;
  }>("republic.cicd.pipelines", {}, [], { staleTimeMs: 8_000, refetchIntervalMs: 12_000 });
  const { data: runsData } = useRpc<{ runs?: CICDRun[] }>("republic.cicd.runs.recent", {}, [], {
    staleTimeMs: 5_000,
    refetchIntervalMs: 10_000,
  });
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState("main");
  const [selectedRun, setSelectedRun] = useState<CICDRun | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const pipelines = data?.pipelines ?? [];
  const runs = runsData?.runs ?? [];
  const running = pipelines.filter((p) => p.status === "running").length;

  async function triggerPipeline(id: string) {
    try {
      await rpc("republic.cicd.trigger", { pipelineId: id });
      invalidateRpcCache("republic.cicd.pipelines");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createPipeline() {
    if (!newName.trim()) {return;}
    setCreating(true);
    try {
      await rpc("republic.cicd.pipeline.create", {
        name: newName.trim(),
        branch: newBranch.trim(),
      });
      invalidateRpcCache("republic.cicd.pipelines");
      setNewName("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function viewRunLogs(run: CICDRun) {
    try {
      const r = await rpc<CICDRun>("republic.cicd.run.get", { runId: run.id });
      setSelectedRun(r ?? run);
    } catch {
      setSelectedRun(run);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Autonomous CI/CD"
        description="Citizen-driven build-test-deploy pipelines with automatic code integration"
        icon={<GitBranch size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Pipelines" value={pipelines.length} icon={<GitBranch size={16} />} />
        <StatCard label="Running" value={running} icon={<Play size={16} />} />
        <StatCard
          label="Success Rate"
          value={`${(data?.successRate ?? 0).toFixed(0)}%`}
          icon={<CheckCircle size={16} />}
        />
        <StatCard
          label="Avg Duration"
          value={data?.avgDuration ? `${data.avgDuration}s` : "—"}
          icon={<Clock size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Plus size={16} /> New Pipeline
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Pipeline name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Branch (e.g., main)..."
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
            />
            <Button onClick={createPipeline} loading={creating} disabled={!newName.trim()}>
              Create
            </Button>
          </div>
        </Card>

        <div className="md:col-span-2">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4">⚙️ Pipelines</h3>
            {loading ? (
              <p className="text-sm text-text-muted">Loading...</p>
            ) : pipelines.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-6">No pipelines.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pipelines.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={sv(p.status)}>{p.status}</Badge>
                        <span className="text-sm font-medium text-text-heading">{p.name}</span>
                        {p.branch && (
                          <span className="text-xs text-text-muted font-mono">{p.branch}</span>
                        )}
                      </div>
                      {p.lastRun && (
                        <p className="text-xs text-text-muted">
                          Last: {new Date(p.lastRun).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={p.status === "running" ? "outline" : "primary"}
                      icon={p.status === "running" ? <XCircle size={12} /> : <Play size={12} />}
                      onClick={() => triggerPipeline(p.id)}
                    >
                      {p.status === "running" ? "Cancel" : "Run"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <h3 className="font-semibold text-text-heading mb-4">📋 Recent Runs</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No runs yet.</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {runs.slice(0, 20).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-2 rounded bg-bg-secondary border border-border/30 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={sv(r.status)}>{r.status}</Badge>
                  <span className="font-mono text-xs text-text-muted">
                    {r.pipelineId.slice(0, 10)}
                  </span>
                  {r.failedStage && (
                    <span className="text-danger text-xs flex items-center gap-1">
                      <AlertTriangle size={10} />
                      {r.failedStage}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">
                    {new Date(r.startedAt).toLocaleTimeString()}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => viewRunLogs(r)}>
                    Logs
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selectedRun && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-heading">📜 Run Logs</h3>
            <Button size="sm" variant="ghost" onClick={() => setSelectedRun(null)}>
              ✕
            </Button>
          </div>
          <pre className="text-xs font-mono bg-bg-secondary border border-border/30 rounded p-3 max-h-48 overflow-auto whitespace-pre-wrap text-text-secondary">
            {(selectedRun.logs ?? ["No logs."]).join("\n")}
          </pre>
        </Card>
      )}
    </div>
  );
}
