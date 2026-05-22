/**
 * AsyncTasks.tsx — Async Task Manager Dashboard
 *
 * Visualizes background task status, progress steps, and results.
 * Features:
 *   - Real-time task list with state badges + auto-refresh
 *   - Task detail panel with step timeline + log viewer
 *   - Stats overview (queued, running, completed, failed, cancelled)
 *   - Submit new tasks from the UI
 *   - Cancel running/queued tasks
 */

import {
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  PlayCircle,
  Send,
  RefreshCw,
  ChevronRight,
  Terminal,
  Wrench,
  AlertTriangle,
  ListTodo,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  RpcStatus,
  EmptyState,
  Tabs,
  ConfirmDialog,
  Alert,
} from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface TaskSummary {
  id: string;
  prompt: string;
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stepCount: number;
  hasResult: boolean;
  error: string | null;
}

interface TaskDetail {
  id: string;
  state: string;
  prompt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stepCount: number;
  recentSteps: Array<{ timestamp: string; type: string; content: string }>;
  error: string | null;
}

interface TaskStats {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

// ─── Constants ──────────────────────────────────────────────────

const STATE_BADGES: Record<
  string,
  {
    variant: "success" | "warning" | "danger" | "info" | "neutral" | "purple";
    icon: React.ReactNode;
  }
> = {
  queued: { variant: "info", icon: <Clock size={12} /> },
  running: { variant: "purple", icon: <PlayCircle size={12} /> },
  completed: { variant: "success", icon: <CheckCircle2 size={12} /> },
  failed: { variant: "danger", icon: <XCircle size={12} /> },
  cancelled: { variant: "neutral", icon: <Ban size={12} /> },
};

const STEP_ICONS: Record<string, React.ReactNode> = {
  text: <Terminal size={14} className="text-text-muted" />,
  tool: <Wrench size={14} className="text-accent" />,
  error: <AlertTriangle size={14} className="text-danger" />,
  thinking: <Zap size={14} className="text-purple" />,
};

const FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "queued", label: "Queued" },
];

// ─── Component ──────────────────────────────────────────────────

export function AsyncTasksPage() {
  // ─── State ────────────────────────────────────────────────────
  const [filter, setFilter] = useState("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  // ─── Data Fetching ────────────────────────────────────────────
  const listParams = useMemo(
    () => ({
      state: filter === "all" ? undefined : filter,
      limit: 50,
    }),
    [filter],
  );

  const {
    data: listData,
    loading: listLoading,
    error: listError,
    refetch,
  } = useRpc<{ tasks: TaskSummary[] }>("republic.task.list", listParams, [], {
    refetchIntervalMs: 5000,
  });

  const { data: statsData } = useRpc<{ stats: TaskStats }>("republic.task.stats", {}, [], {
    refetchIntervalMs: 5000,
  });

  const detailParams = useMemo(
    () => (selectedTaskId ? { taskId: selectedTaskId } : undefined),
    [selectedTaskId],
  );

  const { data: detailData, loading: detailLoading } = useRpc<TaskDetail>(
    "republic.task.status",
    detailParams,
    [selectedTaskId],
    { refetchIntervalMs: 3000 },
  );

  // ─── Loading/Error Guard ──────────────────────────────────────
  if (listLoading || listError) {
    return <RpcStatus loading={listLoading} error={listError} onRetry={refetch} />;
  }

  // ─── Derived Data ─────────────────────────────────────────────
  const tasks = listData?.tasks ?? [];
  const stats = statsData?.stats;
  const totalTasks = stats
    ? stats.queued + stats.running + stats.completed + stats.failed + stats.cancelled
    : tasks.length;

  // ─── Handlers ─────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!promptText.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      await rpc("republic.task.submit", { prompt: promptText.trim() });
      setPromptText("");
      setShowSubmit(false);
      invalidateRpcCache("republic.task.list");
      invalidateRpcCache("republic.task.stats");
      refetch();
    } finally {
      setSubmitting(false);
    }
  }, [promptText, refetch]);

  const handleCancel = useCallback(async () => {
    if (!cancelTarget) {
      return;
    }
    await rpc("republic.task.cancel", { taskId: cancelTarget });
    setCancelTarget(null);
    invalidateRpcCache("republic.task.list");
    invalidateRpcCache("republic.task.stats");
    refetch();
  }, [cancelTarget, refetch]);

  // ─── Sub-Components ───────────────────────────────────────────

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) {
      return "—";
    }
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const sec = Math.round((e - s) / 1000);
    if (sec < 60) {
      return `${sec}s`;
    }
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return iso;
    }
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Async Task Manager"
        description="Fire-and-forget background tasks — submit, monitor, and retrieve results"
        icon={<Zap size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowSubmit(!showSubmit)}>
              <Send size={14} className="mr-1" /> New Task
            </Button>
          </div>
        }
      />

      {/* Submit Form */}
      {showSubmit && (
        <Card className="p-4 border-accent/30">
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-secondary">Task Prompt</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-text-primary
                         placeholder:text-text-muted text-sm resize-none focus:outline-none
                         focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
              rows={3}
              placeholder="Describe what you want the agent to build or research..."
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) {
                  void handleSubmit();
                }
              }}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-text-muted">⌘+Enter to submit</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowSubmit(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSubmit()}
                  disabled={!promptText.trim() || submitting}
                >
                  {submitting ? "Submitting..." : "Submit Task"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total" value={totalTasks} icon={<ListTodo size={18} />} />
          <StatCard
            label="Running"
            value={stats.running}
            icon={<PlayCircle size={18} className="text-purple" />}
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            icon={<CheckCircle2 size={18} className="text-success" />}
          />
          <StatCard
            label="Failed"
            value={stats.failed}
            icon={<XCircle size={18} className="text-danger" />}
          />
          <StatCard
            label="Queued"
            value={stats.queued}
            icon={<Clock size={18} className="text-info" />}
          />
        </div>
      )}

      {/* Filter Tabs */}
      <Tabs tabs={FILTER_TABS} active={filter} onChange={setFilter} />

      {/* Task List + Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Task List (3/5) */}
        <div className="lg:col-span-3 space-y-2">
          {tasks.length === 0 ? (
            <EmptyState
              icon={<Zap size={40} className="text-text-muted" />}
              title="No tasks"
              description={
                filter === "all" ? "Submit a new task to get started" : `No ${filter} tasks`
              }
              action={
                <Button variant="primary" size="sm" onClick={() => setShowSubmit(true)}>
                  <Send size={14} className="mr-1" /> Submit Task
                </Button>
              }
            />
          ) : (
            tasks.map((task) => (
              <Card
                key={task.id}
                hover
                onClick={() => setSelectedTaskId(task.id)}
                className={`p-3 cursor-pointer transition-all ${
                  selectedTaskId === task.id ? "ring-2 ring-accent/40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={STATE_BADGES[task.state]?.variant ?? "neutral"}>
                        <span className="flex items-center gap-1">
                          {STATE_BADGES[task.state]?.icon}
                          {task.state}
                        </span>
                      </Badge>
                      <span className="text-xs text-text-muted font-mono">
                        {task.id.slice(0, 20)}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary truncate">{task.prompt}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                      <span>{formatTime(task.createdAt)}</span>
                      <span>•</span>
                      <span>{task.stepCount} steps</span>
                      {task.state === "running" && (
                        <>
                          <span>•</span>
                          <span className="text-purple animate-pulse">
                            {formatDuration(task.startedAt, null)}
                          </span>
                        </>
                      )}
                      {task.completedAt && (
                        <>
                          <span>•</span>
                          <span>{formatDuration(task.startedAt, task.completedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(task.state === "running" || task.state === "queued") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Cancel task"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancelTarget(task.id);
                        }}
                      >
                        <Ban size={14} className="text-danger" />
                      </Button>
                    )}
                    <ChevronRight size={16} className="text-text-muted" />
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Detail Panel (2/5) */}
        <div className="lg:col-span-2">
          {selectedTaskId && detailData ? (
            <Card className="p-4 sticky top-4">
              <div className="space-y-4">
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={STATE_BADGES[detailData.state]?.variant ?? "neutral"}>
                      <span className="flex items-center gap-1">
                        {STATE_BADGES[detailData.state]?.icon}
                        {detailData.state}
                      </span>
                    </Badge>
                    <span className="text-xs text-text-muted font-mono">
                      {detailData.id.slice(0, 24)}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary">{detailData.prompt}</p>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-text-muted">Created</span>
                    <p className="text-text-primary">{formatTime(detailData.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-text-muted">Duration</span>
                    <p className="text-text-primary">
                      {formatDuration(detailData.startedAt, detailData.completedAt)}
                    </p>
                  </div>
                  <div>
                    <span className="text-text-muted">Steps</span>
                    <p className="text-text-primary">{detailData.stepCount}</p>
                  </div>
                  <div>
                    <span className="text-text-muted">Status</span>
                    <p className="text-text-primary capitalize">{detailData.state}</p>
                  </div>
                </div>

                {/* Error */}
                {detailData.error && (
                  <Alert variant="danger">
                    <span className="text-xs break-all">{detailData.error.slice(0, 300)}</span>
                  </Alert>
                )}

                {/* Step Timeline */}
                <div>
                  <h4 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">
                    Recent Steps ({detailData.recentSteps?.length ?? 0})
                  </h4>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                    {(detailData.recentSteps ?? []).map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 px-2 py-1.5 rounded-md
                                   bg-bg-secondary/50 hover:bg-bg-secondary transition-colors"
                      >
                        <div className="mt-0.5 shrink-0">
                          {STEP_ICONS[step.type] ?? STEP_ICONS.text}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-text-primary break-all leading-relaxed">
                            {step.content.slice(0, 300)}
                          </p>
                          <span className="text-[10px] text-text-muted">
                            {formatTime(step.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!detailData.recentSteps || detailData.recentSteps.length === 0) && (
                      <p className="text-xs text-text-muted text-center py-4">
                        No steps recorded yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ) : detailLoading ? (
            <Card className="p-6 text-center text-text-muted text-sm">Loading task details...</Card>
          ) : (
            <Card className="p-6 text-center text-text-muted text-sm">
              Select a task to view details
            </Card>
          )}
        </div>
      </div>

      {/* Cancel Confirmation */}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel Task"
        message="Are you sure you want to cancel this task? This cannot be undone."
        onConfirm={() => void handleCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
