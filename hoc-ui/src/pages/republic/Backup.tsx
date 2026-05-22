import { HardDrive, RefreshCw, Download, Plus, Trash2, Clock } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type BackupEntry = {
  id: string;
  name?: string;
  type: "full" | "incremental" | "snapshot";
  status: "pending" | "running" | "completed" | "failed";
  sizeBytes?: number;
  createdAt: number;
  completedAt?: number;
  path?: string;
};
type RestoreJob = {
  id: string;
  backupId: string;
  status: string;
  progress?: number;
  startedAt: number;
};

const statusVariant = (s: string) => {
  if (s === "completed" || s === "success") {return "success";}
  if (s === "running" || s === "pending") {return "info";}
  if (s === "failed") {return "danger";}
  return "neutral";
};

function formatBytes(bytes?: number): string {
  if (!bytes) {return "—";}
  if (bytes > 1_073_741_824) {return `${(bytes / 1_073_741_824).toFixed(1)} GB`;}
  if (bytes > 1_048_576) {return `${(bytes / 1_048_576).toFixed(1)} MB`;}
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function BackupPage() {
  const { data, loading, refetch, error } = useRpc<{
    backups?: BackupEntry[];
    totalSize?: number;
    lastBackup?: number;
  }>("republic.backup.list", {}, [], { staleTimeMs: 15_000 });
  const { data: jobData } = useRpc<{ jobs?: RestoreJob[] }>(
    "republic.backup.restore.jobs",
    {},
    [],
    { staleTimeMs: 5_000, refetchIntervalMs: 10_000 },
  );
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [backupType, setBackupType] = useState<"full" | "incremental" | "snapshot">("incremental");
  const [backupName, setBackupName] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const backups = data?.backups ?? [];
  const jobs = jobData?.jobs ?? [];
  const activeJobs = jobs.filter((j) => j.status === "running" || j.status === "pending");

  async function createBackup() {
    setCreating(true);
    setActionError("");
    try {
      await rpc("republic.backup.create", {
        type: backupType,
        name: backupName.trim() || undefined,
      });
      invalidateRpcCache("republic.backup.list");
      setBackupName("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function restoreBackup(id: string) {
    if (!confirm("Restore from this backup? This will overwrite current state.")) {return;}
    setRestoring(id);
    try {
      await rpc("republic.backup.restore", { backupId: id });
      invalidateRpcCache("republic.backup.restore.jobs");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(null);
    }
  }

  async function deleteBackup(id: string) {
    if (!confirm("Delete this backup?")) {return;}
    try {
      await rpc("republic.backup.delete", { backupId: id });
      invalidateRpcCache("republic.backup.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Backup Manager"
        description="Create, restore, and manage republic state backups and snapshots"
        icon={<HardDrive size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Backups" value={backups.length} icon={<HardDrive size={16} />} />
        <StatCard
          label="Total Size"
          value={formatBytes(data?.totalSize)}
          icon={<HardDrive size={16} />}
        />
        <StatCard
          label="Active Restores"
          value={activeJobs.length}
          icon={<RefreshCw size={16} />}
        />
        <StatCard
          label="Last Backup"
          value={data?.lastBackup ? new Date(data.lastBackup).toLocaleDateString() : "—"}
          icon={<Clock size={16} />}
        />
      </div>

      {/* Active restore jobs */}
      {activeJobs.length > 0 && (
        <Card className="border-info/30 bg-info/5">
          <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
            <RefreshCw size={16} className="animate-spin" /> Active Restore Jobs
          </h3>
          {activeJobs.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between text-sm p-2 rounded bg-bg-secondary border border-border/30"
            >
              <div className="flex items-center gap-2">
                <Badge variant="info">{j.status}</Badge>
                <span className="font-mono text-xs text-text-muted">
                  backup: {j.backupId.slice(0, 10)}
                </span>
              </div>
              {j.progress != null && (
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${j.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono">{j.progress}%</span>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create Backup */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Plus size={16} /> Create Backup
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Backup name (optional)..."
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
            />
            <div className="flex gap-2">
              {(["full", "incremental", "snapshot"] as const).map((t) => (
                <button
type="button"                   key={t}
                  onClick={() => setBackupType(t)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${backupType === t ? "bg-accent text-white border-accent" : "bg-bg-secondary text-text-muted border-border hover:border-accent"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button onClick={createBackup} loading={creating} icon={<HardDrive size={14} />}>
              Create {backupType}
            </Button>
          </div>
        </Card>

        {/* Backup List */}
        <div className="md:col-span-2">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4">📦 Backup History</h3>
            {loading ? (
              <p className="text-sm text-text-muted">Loading...</p>
            ) : backups.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-6">No backups yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {backups.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                        <Badge variant="neutral">{b.type}</Badge>
                        <span className="text-sm font-medium text-text-heading truncate">
                          {b.name ?? b.id.slice(0, 12)}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-text-muted">
                        <span>{formatBytes(b.sizeBytes)}</span>
                        <span>{new Date(b.createdAt).toLocaleString()}</span>
                        {b.path && <span className="font-mono truncate max-w-32">{b.path}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-3">
                      {b.status === "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Download size={12} />}
                          loading={restoring === b.id}
                          onClick={() => restoreBackup(b.id)}
                        >
                          Restore
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={12} />}
                        onClick={() => deleteBackup(b.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
