import { SlidersHorizontal, Pause } from "lucide-react";
import { useState } from "react";
import {
  Card,
  Badge,
  Button,
  RpcStatus,
  EmptyState,
  ProgressBar,
  ConfirmDialog,
} from "@/components/ui";
import { useRpc, mutateRpc } from "@/lib/rpc";

type FTJob = {
  id: string;
  name: string;
  status: string;
  baseModel: string;
  progress: number;
  epochs: number;
  learningRate: number;
  datasetSize: number;
  createdAt: string;
};

type FTDiag = {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalDatasetSamples: number;
};

const statusColors: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  completed: "success",
  running: "info",
  queued: "warning",
  failed: "danger",
  cancelled: "neutral",
};

export function FineTunePanel() {
  const { data, loading, error, refetch } = useRpc<{ jobs?: FTJob[] }>(
    "republic.sovereign.finetune.list",
    {},
    [],
    { staleTimeMs: 5_000, refetchIntervalMs: 10_000 },
  );
  const { data: diag } = useRpc<FTDiag>("republic.sovereign.finetune.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });

  const [cancelId, setCancelId] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const jobs = data?.jobs ?? [];

  const handleCancel = async () => {
    if (!cancelId) {
      return;
    }
    await mutateRpc("republic.sovereign.finetune.cancel", { id: cancelId });
    setCancelId(null);
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{diag?.totalJobs ?? 0}</p>
          <p className="text-xs text-text-muted">Total Jobs</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-info">{diag?.activeJobs ?? 0}</p>
          <p className="text-xs text-text-muted">Active</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-success">{diag?.completedJobs ?? 0}</p>
          <p className="text-xs text-text-muted">Completed</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-danger">{diag?.failedJobs ?? 0}</p>
          <p className="text-xs text-text-muted">Failed</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{diag?.totalDatasetSamples ?? 0}</p>
          <p className="text-xs text-text-muted">Dataset Samples</p>
        </Card>
      </div>

      {/* Jobs list */}
      {jobs.length === 0 ? (
        <EmptyState
          icon={<SlidersHorizontal size={40} />}
          title="No training jobs"
          description="Create a fine-tuning job to train a custom model on your conversations and data."
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id} hover>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-text-heading">{job.name}</h4>
                    <Badge variant={statusColors[job.status] ?? "neutral"}>{job.status}</Badge>
                  </div>
                  <p className="text-xs text-text-muted">
                    Base: {job.baseModel} · Epochs: {job.epochs} · LR: {job.learningRate} · Samples:{" "}
                    {job.datasetSize}
                  </p>
                </div>
                {job.status === "running" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pause size={12} />}
                    onClick={() => setCancelId(job.id)}
                    aria-label="Cancel job"
                  />
                )}
              </div>
              {job.status === "running" && (
                <ProgressBar value={Math.round(job.progress * 100)} max={100} size="sm" />
              )}
              {job.status === "completed" && <ProgressBar value={100} max={100} size="sm" />}
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!cancelId}
        title="Cancel Training Job"
        message="This will stop the training job. Progress will be lost."
        onConfirm={handleCancel}
        onCancel={() => setCancelId(null)}
      />
    </div>
  );
}
