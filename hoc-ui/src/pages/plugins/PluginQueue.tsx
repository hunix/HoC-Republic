/**
 * PluginQueue — Citizen plugin job queue management page
 *
 * 4 tabs: Pending Approval | Queued | Running | History
 * Senior citizens can approve/reject pending jobs.
 */

import {
  Clock,
  CheckCircle,
  XCircle,
  Play,
  AlertCircle,
  Loader2,
  RefreshCw,
  Cpu,
  HardDrive,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, Tabs, StatCard } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface ResourceCost {
  gpuHours: number;
  ramGb: number;
  diskGb: number;
  estimatedSec: number;
}

interface PluginJob {
  id: string;
  pluginId: string;
  method: string;
  params: Record<string, unknown>;
  citizenId?: string;
  citizenName?: string;
  requestedAt: number;
  priority: 1 | 2 | 3 | 4 | 5;
  status:
    | "pending-approval"
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "rejected"
    | "cancelled";
  approvedBy?: string;
  rejectionReason?: string;
  startedAt?: number;
  completedAt?: number;
  resourceCost: ResourceCost;
}

interface QueueStats {
  pendingApproval: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  rejected: number;
  cancelled: number;
  totalJobs: number;
}

// ─── Priority Badge ───────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: number }) {
  const map: Record<
    number,
    { v: "success" | "info" | "warning" | "danger" | "neutral"; label: string }
  > = {
    5: { v: "danger", label: "P5 Urgent" },
    4: { v: "warning", label: "P4 High" },
    3: { v: "info", label: "P3 Normal" },
    2: { v: "neutral", label: "P2 Low" },
    1: { v: "neutral", label: "P1 Minimal" },
  };
  const { v, label } = map[priority] ?? { v: "neutral" as const, label: `P${priority}` };
  return <Badge variant={v}>{label}</Badge>;
}

// ─── Status Badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { v: "success" | "info" | "warning" | "danger" | "neutral" | "purple"; icon: React.ReactNode }
  > = {
    "pending-approval": { v: "warning", icon: <Clock size={10} /> },
    queued: { v: "info", icon: <Clock size={10} /> },
    running: { v: "purple", icon: <Loader2 size={10} className="animate-spin" /> },
    completed: { v: "success", icon: <CheckCircle size={10} /> },
    failed: { v: "danger", icon: <AlertCircle size={10} /> },
    rejected: { v: "danger", icon: <XCircle size={10} /> },
    cancelled: { v: "neutral", icon: <XCircle size={10} /> },
  };
  const { v, icon } = map[status] ?? { v: "neutral" as const, icon: null };
  return (
    <Badge variant={v}>
      {icon}
      {status}
    </Badge>
  );
}

// ─── Resource Cost Display ────────────────────────────────────────

function CostBadge({ cost }: { cost: ResourceCost }) {
  const min = Math.ceil(cost.estimatedSec / 60);
  return (
    <div className="flex gap-2 text-[10px] text-text-muted flex-wrap">
      <span className="flex items-center gap-1">
        <Cpu size={9} /> {cost.gpuHours > 0 ? `${cost.gpuHours}h GPU` : "CPU only"}
      </span>
      <span className="flex items-center gap-1">
        <Zap size={9} /> {cost.ramGb}GB RAM
      </span>
      <span className="flex items-center gap-1">
        <HardDrive size={9} /> {cost.diskGb}GB disk
      </span>
      <span className="flex items-center gap-1">
        <Clock size={9} /> ~{min}m
      </span>
    </div>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────

function JobCard({
  job,
  onRefresh,
  isSenior = true,
}: {
  job: PluginJob;
  onRefresh: () => void;
  isSenior?: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      await rpc("republic.plugin-queue.approve", { jobId: job.id, approverCitizenId: "operator" });
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectReason.trim()) {
      return;
    }
    setBusy(true);
    try {
      await rpc("republic.plugin-queue.reject", {
        jobId: job.id,
        approverCitizenId: "operator",
        reason: rejectReason,
      });
      setRejecting(false);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await rpc("republic.plugin-queue.cancel", { jobId: job.id });
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-text-heading truncate">
              {job.pluginId.replace("hoc-plugin-", "")}
            </span>
            <code className="text-[10px] font-mono text-accent">{job.method}</code>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-muted">
              by <span className="text-text-secondary">{job.citizenName ?? job.citizenId}</span>
            </span>
            <span className="text-xs text-text-muted">
              {new Date(job.requestedAt).toLocaleTimeString()}
            </span>
            <PriorityBadge priority={job.priority} />
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <CostBadge cost={job.resourceCost} />

      {/* Params preview */}
      {Object.keys(job.params).length > 0 && (
        <div className="bg-bg-input rounded-lg px-3 py-2 text-[11px] font-mono text-text-muted overflow-auto max-h-16">
          {JSON.stringify(job.params)}
        </div>
      )}

      {job.rejectionReason && (
        <p className="text-xs text-danger bg-danger-bg rounded px-2 py-1">
          Rejected: {job.rejectionReason}
        </p>
      )}

      {/* Actions for pending-approval */}
      {job.status === "pending-approval" && isSenior && (
        <div className="space-y-2 pt-1 border-t border-border/30">
          {rejecting ? (
            <div className="space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-danger"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy}
                  onClick={() => void reject()}
                  disabled={!rejectReason.trim()}
                >
                  Confirm Reject
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="success"
                loading={busy}
                icon={<CheckCircle size={12} />}
                onClick={() => void approve()}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<XCircle size={12} />}
                onClick={() => setRejecting(true)}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Cancel for queued jobs */}
      {(job.status === "queued" || job.status === "pending-approval") && !rejecting && (
        <button
          type="button"
          onClick={() => void cancel()}
          disabled={busy}
          className="text-xs text-text-muted hover:text-danger transition-colors"
        >
          Cancel job
        </button>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export function PluginQueuePage() {
  const [tab, setTab] = useState("pending-approval");
  const [isSenior] = useState(true); // In production, derive from citizen rank

  const { data: statsData, refetch: refetchStats } = useRpc<QueueStats>(
    "republic.plugin-queue.status",
    {},
  );

  const statusMap: Record<string, string | string[]> = {
    "pending-approval": "pending-approval",
    queued: "queued",
    running: "running",
    history: ["completed", "failed", "rejected", "cancelled"],
  };

  const {
    data: jobsData,
    loading,
    refetch,
  } = useRpc<{ jobs?: PluginJob[] }>("republic.plugin-queue.list", { status: statusMap[tab] }, [
    tab,
  ]);

  const jobs = jobsData?.jobs ?? [];
  const stats = statsData;

  function refresh() {
    refetch();
    refetchStats();
  }

  const tabDefs = [
    { id: "pending-approval", label: "Pending Approval", count: stats?.pendingApproval },
    { id: "queued", label: "Queued", count: stats?.queued },
    { id: "running", label: "Running", count: stats?.running },
    {
      id: "history",
      label: "History",
      count: (stats?.completed ?? 0) + (stats?.failed ?? 0) + (stats?.rejected ?? 0),
    },
  ];

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        title="Plugin Job Queue"
        description={
          stats
            ? `${stats.pendingApproval} pending approval · ${stats.running} running · ${stats.totalJobs} total jobs`
            : "Loading..."
        }
        icon={<Clock size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refresh}>
            Refresh
          </Button>
        }
      />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Pending Approval"
            value={stats.pendingApproval}
            icon={<Clock size={14} />}
          />
          <StatCard label="Queued" value={stats.queued} icon={<Play size={14} />} />
          <StatCard label="Running" value={stats.running} icon={<Loader2 size={14} />} />
          <StatCard label="Completed" value={stats.completed} icon={<CheckCircle size={14} />} />
        </div>
      )}

      {isSenior && tab === "pending-approval" && jobs.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm text-warning">
          <AlertCircle size={16} />
          <span>
            <strong>{jobs.length}</strong> job{jobs.length !== 1 ? "s" : ""} awaiting your senior
            approval
          </span>
        </div>
      )}

      <Tabs tabs={tabDefs} active={tab} onChange={setTab} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-xl bg-bg-card animate-pulse border border-border/30"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16">
          <Clock size={40} className="text-text-muted mx-auto mb-3 opacity-30" />
          <p className="text-sm text-text-muted">
            {tab === "pending-approval"
              ? "No jobs awaiting approval"
              : tab === "queued"
                ? "Queue is empty"
                : tab === "running"
                  ? "No jobs running"
                  : "No history yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onRefresh={refresh} isSenior={isSenior} />
          ))}
        </div>
      )}
    </div>
  );
}
