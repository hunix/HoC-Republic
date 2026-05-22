import {
  Hammer,
  Play,
  CheckCircle,
  AlertCircle,
  Plus,
  FileText,
  Eye,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Tabs , RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface ManusTask {
  id: string;
  title: string;
  description: string;
  status: "running" | "completed" | "failed" | "queued";
  creator: string;
  steps: number;
  completedSteps: number;
  startedAt: number;
  artifacts: { name: string; type: string; size: string }[];
}

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  running: "warning",
  completed: "success",
  failed: "danger",
  queued: "neutral",
};

const TASKS: ManusTask[] = [
  {
    id: "T1",
    title: "Research AI governance frameworks",
    status: "running",
    creator: "Aria-7",
    description:
      "Autonomously research global AI governance frameworks, synthesis into a comparative report with recommendations for the republic.",
    steps: 8,
    completedSteps: 5,
    startedAt: Date.now() - 3600000,
    artifacts: [
      { name: "governance_notes.md", type: "markdown", size: "24KB" },
      { name: "citations.json", type: "json", size: "8KB" },
    ],
  },
  {
    id: "T2",
    title: "Analyze economy Q1 report",
    status: "completed",
    creator: "Cleo-9",
    description:
      "Full economic analysis of Q1 performance: treasury balance, harvester efficiency, resource consumption trends.",
    steps: 6,
    completedSteps: 6,
    startedAt: Date.now() - 86400000,
    artifacts: [
      { name: "q1_economy_report.pdf", type: "pdf", size: "1.2MB" },
      { name: "charts.zip", type: "zip", size: "450KB" },
    ],
  },
  {
    id: "T3",
    title: "Draft constitutional amendment #6",
    status: "queued",
    creator: "Sentinel-3",
    description: "Draft proposed amendment for LLM resource sharing rights between nodes.",
    steps: 5,
    completedSteps: 0,
    startedAt: Date.now(),
    artifacts: [],
  },
  {
    id: "T4",
    title: "Bug fix: citizen reasoning loop",
    status: "failed",
    creator: "Nova-12",
    description:
      "Investigate and fix the circular reasoning loop observed in citizen Flux-1 during governance analysis.",
    steps: 4,
    completedSteps: 2,
    startedAt: Date.now() - 7200000,
    artifacts: [{ name: "debug_log.txt", type: "text", size: "128KB" }],
  },
];

const MANUS_TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "new", label: "New Task" },
];

export function ManusPage() {
  const { data, refetch, loading, error } = useRpc<{ tasks?: ManusTask[] }>("manus.tasks.list", {});
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const tasks = data?.tasks ?? TASKS;
  const [tab, setTab] = useState("tasks");
  const [selected, setSelected] = useState<ManusTask | null>(null);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [newTitle, setNewTitle] = useState("");

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Manus"
        description="Autonomous task execution with artifact generation and step tracking"
        icon={<Hammer size={28} />}
        actions={
          <Button
            icon={<Plus size={14} />}
            onClick={() => {
              setTab("new");
              refetch();
            }}
          >
            New Task
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Tasks" value={tasks.length} icon={<Hammer size={16} />} />
        <StatCard
          label="Running"
          value={tasks.filter((t) => t.status === "running").length}
          icon={<Play size={16} />}
        />
        <StatCard
          label="Completed"
          value={tasks.filter((t) => t.status === "completed").length}
          icon={<CheckCircle size={16} />}
        />
        <StatCard
          label="Failed"
          value={tasks.filter((t) => t.status === "failed").length}
          icon={<AlertCircle size={16} />}
        />
      </div>

      <Tabs tabs={MANUS_TABS} active={tab} onChange={setTab} />

      {tab === "tasks" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Task list */}
          <div className="lg:col-span-2 space-y-3">
            {tasks.map((t) => (
              <Card
                key={t.id}
                className={`cursor-pointer hover:border-accent/40 transition-all ${selected?.id === t.id ? "border-accent/60" : ""}`}
                onClick={() => setSelected(t)}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-text-heading text-sm">{t.title}</p>
                    <p className="text-xs text-text-muted">
                      by {t.creator} · {new Date(t.startedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[t.status]}>{t.status}</Badge>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2 mb-3">{t.description}</p>
                {/* Step progress */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-bg-input overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${t.steps > 0 ? (t.completedSteps / t.steps) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-muted">
                    {t.completedSteps}/{t.steps} steps
                  </span>
                </div>
              </Card>
            ))}
          </div>

          {/* Detail panel */}
          <div>
            {selected ? (
              <Card className="sticky top-20 space-y-4">
                <div>
                  <h3 className="font-bold text-text-heading text-sm mb-1">{selected.title}</h3>
                  <Badge variant={STATUS_BADGE[selected.status]}>{selected.status}</Badge>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {selected.description}
                </p>

                {/* Steps */}
                <div>
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Execution Steps
                  </h4>
                  <div className="space-y-1.5">
                    {Array.from({ length: selected.steps }, (_, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 text-xs ${i < selected.completedSteps ? "text-success" : i === selected.completedSteps && selected.status === "running" ? "text-warning" : "text-text-muted"}`}
                      >
                        <span>
                          {i < selected.completedSteps
                            ? "✓"
                            : i === selected.completedSteps && selected.status === "running"
                              ? "⚙"
                              : "○"}
                        </span>
                        <span>Step {i + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Artifacts */}
                {selected.artifacts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                      Artifacts
                    </h4>
                    <div className="space-y-1.5">
                      {selected.artifacts.map((a, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-text-secondary">
                            <FileText size={10} />
                            {a.name}
                          </span>
                          <span className="text-text-muted">{a.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    icon={<Eye size={12} />}
                    onClick={() => {
                      console.group(`Manus Task: ${selected.title}`);
                      console.log("Status:", selected.status);
                      console.log("Steps:", `${selected.completedSteps}/${selected.steps}`);
                      console.log("Artifacts:", selected.artifacts);
                      console.log("Full task:", selected);
                      console.groupEnd();
                      window.open("", "_blank")?.close(); // brief flash so user sees something happened
                    }}
                  >
                    View Log
                  </Button>
                  {selected.status === "failed" && (
                    <Button
                      size="sm"
                      className="flex-1"
                      icon={<RefreshCw size={12} />}
                      onClick={async () => {
                        await rpc("manus.retry", { taskId: selected.id });
                        refetch();
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="flex flex-col items-center justify-center py-12 text-center">
                <Hammer size={32} className="text-text-muted/30 mb-3" />
                <p className="text-sm text-text-muted">Select a task to view details</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "new" && (
        <Card className="max-w-2xl space-y-4">
          <h3 className="font-semibold text-text-heading">🔨 New Autonomous Task</h3>
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wide block mb-2">
              Task Title
            </label>
            <input
              className="w-full px-4 py-2.5 bg-bg-secondary border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              placeholder="e.g. Research competitor AI products and write a comparison report"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wide block mb-2">
              Task Description
            </label>
            <textarea
              className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
              rows={5}
              placeholder="Describe the full task in detail. Manus will autonomously plan and execute the steps..."
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide block mb-2">
                Assigned To
              </label>
              <select className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent">
                <option>Auto-assign</option>
                <option>Aria-7</option>
                <option>Nova-12</option>
                <option>Sentinel-3</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide block mb-2">
                Priority
              </label>
              <select className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent">
                <option>Normal</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              icon={<Play size={14} />}
              disabled={!taskPrompt.trim() || !newTitle.trim()}
              onClick={async () => {
                await rpc("manus.task", { title: newTitle, prompt: taskPrompt });
                setNewTitle("");
                setTaskPrompt("");
                setTab("tasks");
                refetch();
              }}
            >
              Start Task
            </Button>
            <Button variant="outline" onClick={() => setTab("tasks")}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
