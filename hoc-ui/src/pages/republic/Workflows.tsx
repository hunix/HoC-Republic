import { GitBranch, Play, Pause, Square, Plus, RefreshCw, Users, Clock } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type Workflow = {
  id: string;
  name: string;
  status: "idle" | "running" | "paused" | "done" | "error";
  citizenIds?: string[];
  progress?: number;
  createdAt?: number;
  description?: string;
};

export function WorkflowsPage() {
  const { data, loading, error, refetch } = useRpc<{ workflows?: Workflow[] }>(
    "republic.workflow.list",
    {},
    [],
    { staleTimeMs: 6_000, refetchIntervalMs: 10_000 },
  );
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const workflows = data?.workflows ?? [];
  const running = workflows.filter((w) => w.status === "running").length;

  const statusVariant = (s: string) =>
    s === "running"
      ? "info"
      : s === "done"
        ? "success"
        : s === "error"
          ? "danger"
          : s === "paused"
            ? "warning"
            : "neutral";

  async function createWorkflow() {
    if (!newName.trim()) {return;}
    setCreating(true);
    setActionError("");
    try {
      await rpc("republic.workflow.create", { name: newName.trim(), description: newDesc.trim() });
      invalidateRpcCache("republic.workflow.list");
      setNewName("");
      setNewDesc("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function startWorkflow(id: string) {
    try {
      await rpc("republic.workflow.start", { workflowId: id });
      invalidateRpcCache("republic.workflow.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pauseWorkflow(id: string) {
    try {
      await rpc("republic.workflow.pause", { workflowId: id });
      invalidateRpcCache("republic.workflow.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cancelWorkflow(id: string) {
    try {
      await rpc("republic.workflow.cancel", { workflowId: id });
      invalidateRpcCache("republic.workflow.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Workflows"
        description="Create, assign, and orchestrate citizen workflows"
        icon={<GitBranch size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total" value={workflows.length} icon={<GitBranch size={16} />} />
        <StatCard label="Running" value={running} icon={<Play size={16} />} />
        <StatCard
          label="Done"
          value={workflows.filter((w) => w.status === "done").length}
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Errors"
          value={workflows.filter((w) => w.status === "error").length}
          icon={<Square size={16} />}
        />
      </div>

      {/* Create */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
          <Plus size={16} /> New Workflow
        </h3>
        <div className="flex flex-col gap-3">
          <input
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
            placeholder="Workflow name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
            placeholder="Description (optional)..."
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <Button onClick={createWorkflow} loading={creating} disabled={!newName.trim()}>
            Create Workflow
          </Button>
        </div>
      </Card>

      {/* List */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">🔄 All Workflows</h3>
        {loading ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : workflows.length === 0 ? (
          <p className="text-sm text-text-muted">No workflows yet.</p>
        ) : (
          <div className="space-y-3">
            {workflows.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {w.status === "running" && (
                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-heading truncate">{w.name}</p>
                    {w.description && (
                      <p className="text-xs text-text-muted truncate">{w.description}</p>
                    )}
                    {w.citizenIds?.length ? (
                      <p className="text-xs text-text-muted flex items-center gap-1">
                        <Users size={10} /> {w.citizenIds.length} assigned
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={statusVariant(w.status)}>{w.status}</Badge>
                  {w.progress != null && (
                    <span className="text-xs text-text-muted">{w.progress}%</span>
                  )}
                </div>
                <div className="flex gap-2 ml-3">
                  {(w.status === "idle" || w.status === "paused") && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Play size={12} />}
                      onClick={() => startWorkflow(w.id)}
                    >
                      Start
                    </Button>
                  )}
                  {w.status === "running" && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pause size={12} />}
                      onClick={() => pauseWorkflow(w.id)}
                    >
                      Pause
                    </Button>
                  )}
                  {(w.status === "running" || w.status === "paused") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Square size={12} />}
                      onClick={() => cancelWorkflow(w.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
