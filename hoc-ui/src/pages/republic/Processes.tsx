import { Cpu, Play, Square, RefreshCw, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type Process = {
  id: string;
  name?: string;
  status: "pending" | "running" | "paused" | "done" | "failed" | "cancelled";
  priority?: number;
  citizenId?: string;
  progress?: number;
  createdAt?: number;
  steps?: Array<{ name: string; status: string }>;
};

const statusVariant = (s: string) => {
  if (s === "running") {return "info";}
  if (s === "done") {return "success";}
  if (s === "failed") {return "danger";}
  if (s === "paused") {return "warning";}
  return "neutral";
};

export function ProcessesPage() {
  const { data, loading, error, refetch } = useRpc<{ processes?: Process[] }>(
    "republic.process.list",
    {},
    [],
    { staleTimeMs: 5_000, refetchIntervalMs: 8_000 },
  );
  const { data: activeData } = useRpc<{ processes?: Process[] }>(
    "republic.process.active",
    {},
    [],
    { staleTimeMs: 3_000, refetchIntervalMs: 5_000 },
  );
  const [newName, setNewName] = useState("");
  const [priority, setPriority] = useState(5);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Process | null>(null);
  const [actionError, setActionError] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const all = data?.processes ?? [];
  const active = activeData?.processes ?? [];

  async function createProcess() {
    if (!newName.trim()) {return;}
    setCreating(true);
    setActionError("");
    try {
      await rpc("republic.process.create", { name: newName.trim(), priority });
      invalidateRpcCache("republic.process.list");
      setNewName("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function startProcess(id: string) {
    try {
      await rpc("republic.process.start", { processId: id });
      invalidateRpcCache("republic.process.list");
      invalidateRpcCache("republic.process.active");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cancelProcess(id: string) {
    try {
      await rpc("republic.process.cancel", { processId: id });
      invalidateRpcCache("republic.process.list");
      invalidateRpcCache("republic.process.active");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function selectProcess(p: Process) {
    try {
      const r = await rpc<{ process?: Process }>("republic.process.get", { processId: p.id });
      setSelected(r?.process ?? p);
    } catch {
      setSelected(p);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Process Manager"
        description="Create, monitor, and control republic processes and their step pipelines"
        icon={<Cpu size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total" value={all.length} icon={<Cpu size={16} />} />
        <StatCard label="Active" value={active.length} icon={<Play size={16} />} />
        <StatCard
          label="Running"
          value={all.filter((p) => p.status === "running").length}
          icon={<Cpu size={16} />}
        />
        <StatCard
          label="Failed"
          value={all.filter((p) => p.status === "failed").length}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      {/* Active Processes */}
      {active.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            Active Processes ({active.length})
          </h3>
          <div className="space-y-2">
            {active.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg bg-accent/5 border border-accent/20"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text-heading">
                    {p.name ?? p.id.slice(0, 12)}
                  </span>
                  {p.citizenId && (
                    <span className="text-xs text-text-muted">by {p.citizenId.slice(0, 8)}</span>
                  )}
                  {p.progress != null && (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-muted">{p.progress}%</span>
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Square size={12} />}
                  onClick={() => cancelProcess(p.id)}
                >
                  Stop
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Plus size={16} /> New Process
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Process name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div>
              <label className="text-xs text-text-muted">Priority: {priority}</label>
              <input
                type="range"
                min={1}
                max={10}
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
            <Button onClick={createProcess} loading={creating} disabled={!newName.trim()}>
              Create
            </Button>
          </div>
        </Card>

        {/* Process List */}
        <div className="md:col-span-2">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4">📋 All Processes</h3>
            {loading ? (
              <p className="text-sm text-text-muted">Loading...</p>
            ) : all.length === 0 ? (
              <p className="text-sm text-text-muted">No processes.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {all.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-bg-secondary border border-border/30 text-sm"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      <button
type="button"                         className="text-text-heading font-medium truncate text-left"
                        onClick={() => selectProcess(p)}
                      >
                        {p.name ?? p.id.slice(0, 12)}
                      </button>
                      {p.priority != null && (
                        <span className="text-xs text-text-muted">P{p.priority}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {p.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Play size={10} />}
                          onClick={() => startProcess(p.id)}
                        >
                          Start
                        </Button>
                      )}
                      {(p.status === "running" || p.status === "pending") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={10} />}
                          onClick={() => cancelProcess(p.id)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-heading">🔍 {selected.name ?? selected.id}</h3>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              ✕
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <span className="text-text-muted">Status: </span>
              <Badge variant={statusVariant(selected.status)}>{selected.status}</Badge>
            </div>
            <div>
              <span className="text-text-muted">Priority: </span>
              {selected.priority ?? "—"}
            </div>
            {selected.citizenId && (
              <div>
                <span className="text-text-muted">Citizen: </span>
                {selected.citizenId}
              </div>
            )}
            {selected.progress != null && (
              <div>
                <span className="text-text-muted">Progress: </span>
                {selected.progress}%
              </div>
            )}
          </div>
          {selected.steps && selected.steps.length > 0 && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2">
                Steps
              </p>
              <div className="space-y-1">
                {selected.steps.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{s.name}</span>
                    <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
