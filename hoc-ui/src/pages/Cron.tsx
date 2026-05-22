import { Clock, Plus, Play, Pause, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader, Badge, Button, Alert, RpcStatus, StatCard } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useRpc, rpc } from "@/lib/rpc";

interface CronJob {
  id: string;
  name?: string;
  schedule: string | { kind?: string; expr?: string; tz?: string } | unknown;
  status?: "running" | "paused" | "idle";
  lastRunAt?: number;
  nextRunAt?: number;
}

function fmtSchedule(s: CronJob["schedule"]): string {
  if (!s) {
    return "—";
  }
  if (typeof s === "string") {
    return s;
  }
  if (typeof s === "object") {
    const o = s as { kind?: string; expr?: string; tz?: string };
    return [o.expr ?? o.kind, o.tz].filter(Boolean).join(" ") || JSON.stringify(s);
  }
  return String(s);
}

function relTime(ts?: number): string {
  if (!ts) {
    return "—";
  }
  const diff = Date.now() - ts;
  if (diff < 0) {
    return `in ${Math.abs(Math.round(diff / 60000))}m`;
  }
  if (diff < 60000) {
    return `${Math.floor(diff / 1000)}s`;
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m`;
  }
  return `${Math.floor(diff / 3600000)}h`;
}

export function CronPage() {
  const { data, loading, refetch, error } = useRpc<{ jobs: CronJob[] }>("cron.list", {});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const jobs = data?.jobs ?? [];
  const runningCount = jobs.filter((j) => j.status === "running").length;

  async function toggleJob(job: CronJob) {
    setBusy(job.id);
    setMutationError(null);
    try {
      const method = job.status === "paused" ? "cron.run" : "cron.update";
      await rpc(
        method,
        job.status === "paused" ? { jobId: job.id } : { id: job.id, enabled: false },
      );
      refetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update job");
    } finally {
      setBusy(null);
    }
  }

  async function deleteJob(jobId: string) {
    setConfirmJobId(null);
    setBusy(jobId);
    setMutationError(null);
    try {
      await rpc("cron.remove", { id: jobId });
      refetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to delete job");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="animate-fade-in space-y-5 p-5">
        {mutationError && <Alert variant="danger">{mutationError}</Alert>}
        <PageHeader
          title="Cron Jobs"
          description={`${jobs.length} job${jobs.length !== 1 ? "s" : ""} · ${runningCount} active`}
          icon={<Clock size={20} />}
          actions={
            <Button icon={<Plus size={14} />} size="sm">
              New
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total" value={jobs.length} icon={<Clock size={14} />} />
          <StatCard
            label="Running"
            value={runningCount}
            icon={<Play size={14} className="text-success" />}
          />
          <StatCard
            label="Paused"
            value={jobs.filter((j) => j.status === "paused").length}
            icon={<Pause size={14} className="text-warning" />}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border/30 bg-bg-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/20">
                {["Job", "Schedule", "Status", "Last Run", "Next Run", ""].map((h, i) => (
                  <th
                    key={i}
                    className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-xs text-text-muted">
                    No cron jobs configured.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-border/10 hover:bg-bg-card-hover/50 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium text-text-primary truncate max-w-[180px]">
                        {job.name ?? job.id}
                      </div>
                      <div className="text-[10px] text-text-muted font-mono truncate max-w-[180px]">
                        {job.id}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-[10px] bg-bg-input px-1.5 py-0.5 rounded text-text-secondary">
                        {fmtSchedule(job.schedule)}
                      </code>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={job.status === "running" ? "success" : "warning"} dot>
                        {job.status ?? "idle"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-muted tabular-nums">
                      {relTime(job.lastRunAt)}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-muted tabular-nums">
                      {job.status === "paused" ? "paused" : relTime(job.nextRunAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          aria-label={job.status === "paused" ? "Resume job" : "Pause job"}
                          disabled={busy === job.id}
                          onClick={() => toggleJob(job)}
                          className="p-1 rounded hover:bg-bg-card-hover text-text-muted transition-colors disabled:opacity-50"
                        >
                          {job.status === "paused" ? <Play size={12} /> : <Pause size={12} />}
                        </button>
                        <button
                          type="button"
                          aria-label="Delete job"
                          disabled={busy === job.id}
                          onClick={() => setConfirmJobId(job.id)}
                          className="p-1 rounded hover:bg-danger-bg text-text-muted hover:text-danger transition-colors disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmJobId !== null}
        title="Delete cron job?"
        message="Remove this scheduled job permanently?"
        confirmLabel="Delete"
        onConfirm={() => confirmJobId && void deleteJob(confirmJobId)}
        onCancel={() => setConfirmJobId(null)}
      />
    </>
  );
}
