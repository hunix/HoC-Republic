import {
  Network, Send, Link, RefreshCw, Trash2, CheckCircle, ChevronRight,
  X, Zap, Brain, Activity, Clock, Users, Star,
} from "lucide-react";
import { useState } from "react";
import {
  PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus, ProgressBar,
} from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────────

type A2AAgent = {
  id: string;
  name?: string;
  endpoint?: string;
  status: string;
  capabilities?: string[];
  lastSeen?: number;
  currentActivity?: string;
  masteryLevel?: number;
  intelligence?: number;
  specialization?: string;
};

type A2AMessage = {
  id: string;
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  method: string;
  content?: string;
  status: string;
  timestamp: number;
};

type A2ATask = {
  id: string;
  agentId: string;
  agentName?: string;
  agentSpec?: string;
  method: string;
  task?: string;
  status: string;
  createdAt: number;
  updatedAt?: number;
  collaboratorId?: string | null;
  collaboratorName?: string | null;
  collaboratorSpec?: string | null;
  activeSkill?: string | null;
  masteryLevel?: number;
  energyLevel?: number;
  intelligence?: number;
  learningRate?: number;
  topSkills?: string[];
  progress?: number;
};

// ─── Helpers ────────────────────────────────────────────────────────

const statusVariant = (s: string): "success" | "info" | "warning" | "danger" | "neutral" => {
  if (s === "connected" || s === "completed" || s === "success" || s === "delivered" || s === "active") { return "success"; }
  if (s === "pending" || s === "running" || s === "in_progress") { return "info"; }
  if (s === "failed" || s === "error") { return "danger"; }
  if (s === "disconnected" || s === "idle") { return "warning"; }
  return "neutral";
};

function fmtTime(ts?: number | null): string {
  if (!ts || ts <= 0) { return "—"; }
  // Guard against bogus timestamps (e.g. seconds instead of ms)
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (isNaN(d.getTime())) { return "—"; }
  const now = Date.now();
  const diffMs = now - ms;
  if (diffMs < 60_000) { return `${Math.round(diffMs / 1000)}s ago`; }
  if (diffMs < 3_600_000) { return `${Math.round(diffMs / 60_000)}m ago`; }
  if (diffMs < 86_400_000) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Task Detail Panel ──────────────────────────────────────────────

function TaskDetailPanel({ task, onClose, agents }: {
  task: A2ATask;
  onClose: () => void;
  agents: A2AAgent[];
}) {
  const agent = agents.find((a) => a.id === task.agentId);
  const collaborator = agents.find((a) => a.id === task.collaboratorId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative w-full max-w-lg h-full bg-bg-primary border-l border-border shadow-2xl flex flex-col animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg-secondary">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-accent" />
            <div>
              <h2 className="font-semibold text-text-heading text-sm">{task.agentName ?? task.agentId}</h2>
              <p className="text-xs text-text-muted">{task.agentSpec}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-bg-card text-text-muted hover:text-text-primary transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Task Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-bg-secondary border border-border/30">
              <p className="text-xs text-text-muted mb-1">Task / Method</p>
              <p className="text-sm font-medium text-text-heading font-mono">{task.method}</p>
              {task.task && task.task !== task.method && (
                <p className="text-xs text-text-muted mt-0.5">{task.task}</p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-bg-secondary border border-border/30">
              <p className="text-xs text-text-muted mb-1">Started</p>
              <p className="text-sm font-medium text-text-heading">{fmtTime(task.createdAt)}</p>
              {task.updatedAt && (
                <p className="text-xs text-text-muted mt-0.5">Updated {fmtTime(task.updatedAt)}</p>
              )}
            </div>
          </div>

          {/* Progress */}
          {task.progress != null && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted">Task Progress</span>
                <span className="text-xs font-medium text-accent">{task.progress}%</span>
              </div>
              <ProgressBar value={task.progress} max={100} />
            </div>
          )}

          {/* Agent Stats */}
          <Card>
            <h4 className="text-xs font-semibold text-text-heading mb-3 flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-accent" /> Agent Profile
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded bg-bg-secondary">
                <p className="text-lg font-bold text-accent">{task.intelligence ?? 100}</p>
                <p className="text-[10px] text-text-muted">IQ</p>
              </div>
              <div className="text-center p-2 rounded bg-bg-secondary">
                <p className="text-lg font-bold text-success">{Math.round((task.masteryLevel ?? 0) * 100)}%</p>
                <p className="text-[10px] text-text-muted">Mastery</p>
              </div>
              <div className="text-center p-2 rounded bg-bg-secondary">
                <p className="text-lg font-bold text-warning">
                  {agent?.currentActivity ?? task.task ?? "—"}
                </p>
                <p className="text-[10px] text-text-muted">Activity</p>
              </div>
            </div>
            {task.energyLevel != null && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted">Energy</span>
                  <span className="text-xs text-text-primary">{task.energyLevel}%</span>
                </div>
                <ProgressBar value={task.energyLevel} max={100} />
              </div>
            )}
            {task.topSkills && task.topSkills.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-text-muted mb-1.5 flex items-center gap-1.5">
                  <Star className="w-3 h-3" /> Active Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {task.topSkills.map((sk) => (
                    <span
                      key={sk}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${sk === task.activeSkill ? "border-accent text-accent bg-accent/10" : "border-border text-text-muted bg-bg-secondary"}`}
                    >
                      {sk}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Collaboration Context */}
          {(task.collaboratorId || task.collaboratorName) && (
            <Card>
              <h4 className="text-xs font-semibold text-text-heading mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-accent" /> Collaboration
              </h4>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-bg-secondary border border-border flex items-center justify-center text-base">
                  {task.agentName?.[0] ?? "A"}
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-xs font-semibold text-text-heading">{task.agentName}</p>
                    <p className="text-[10px] text-text-muted">{task.agentSpec}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                  <Zap className="w-4 h-4 text-accent" />
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                  <div>
                    <p className="text-xs font-semibold text-text-heading">{task.collaboratorName}</p>
                    <p className="text-[10px] text-text-muted">{task.collaboratorSpec}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-bg-secondary border border-border flex items-center justify-center text-base">
                    {task.collaboratorName?.[0] ?? "C"}
                  </div>
                </div>
              </div>
              {collaborator && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-bg-secondary">
                    <p className="text-text-muted">Partner Mastery</p>
                    <p className="font-medium text-text-heading">{Math.round((collaborator.masteryLevel ?? 0) * 100)}%</p>
                  </div>
                  <div className="p-2 rounded bg-bg-secondary">
                    <p className="text-text-muted">Partner IQ</p>
                    <p className="font-medium text-text-heading">{collaborator.intelligence ?? 100}</p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Endpoint */}
          {agent?.endpoint && (
            <div className="p-3 rounded-lg bg-bg-secondary border border-border/30">
              <p className="text-xs text-text-muted mb-1">A2A Endpoint</p>
              <p className="text-xs font-mono text-accent break-all">{agent.endpoint}</p>
            </div>
          )}

          {/* Learning Rate */}
          {task.learningRate != null && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30">
              <span className="text-xs text-text-muted">Learning Rate Multiplier</span>
              <Badge variant={task.learningRate >= 1.5 ? "success" : task.learningRate >= 1 ? "info" : "warning"}>
                ×{task.learningRate.toFixed(2)}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export function A2APage() {
  const { data: agentsData, refetch, loading, error } = useRpc<{ agents?: A2AAgent[] }>(
    "republic.a2a.agents",
    {},
    [],
    { staleTimeMs: 8_000, refetchIntervalMs: 15_000 },
  );
  const { data: messagesData } = useRpc<{ messages?: A2AMessage[] }>(
    "republic.a2a.messages.recent",
    {},
    [],
    { staleTimeMs: 5_000, refetchIntervalMs: 10_000 },
  );
  const { data: tasksData } = useRpc<{ tasks?: A2ATask[] }>(
    "republic.a2a.tasks",
    {},
    [],
    { staleTimeMs: 8_000, refetchIntervalMs: 12_000 },
  );

  const [actionError, setActionError] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendMethod, setSendMethod] = useState("");
  const [sendPayload, setSendPayload] = useState("{}");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<A2AAgent | null>(null);
  const [selectedTask, setSelectedTask] = useState<A2ATask | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const agents = agentsData?.agents ?? [];
  const messages = messagesData?.messages ?? [];
  const tasks = tasksData?.tasks ?? [];

  async function sendMessage() {
    if (!sendTo.trim() || !sendMethod.trim()) { return; }
    setSending(true);
    setActionError("");
    setSendResult("");
    try {
      let payload: unknown = {};
      try { payload = JSON.parse(sendPayload); } catch { payload = {}; }
      const r = await rpc("republic.a2a.send", {
        agentId: sendTo.trim(),
        method: sendMethod.trim(),
        payload,
      });
      setSendResult(JSON.stringify(r, null, 2));
      invalidateRpcCache("republic.a2a.messages.recent");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function discoverAgents() {
    try {
      await rpc("republic.a2a.discover", {});
      invalidateRpcCache("republic.a2a.agents");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cancelTask(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await rpc("republic.a2a.task.cancel", { taskId: id });
      invalidateRpcCache("republic.a2a.tasks");
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  const connectedCount = agents.filter((a) => a.status === "active" || a.status === "connected").length;
  const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "pending");

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Task Detail Slide-over */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          agents={agents}
        />
      )}

      <PageHeader
        title="A2A Protocol"
        description="Agent-to-Agent communication: discover agents, inspect running tasks, send messages"
        icon={<Network size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
            <Button size="sm" icon={<Link size={14} />} onClick={discoverAgents}>
              Discover
            </Button>
          </div>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="A2A Agents" value={agents.length} icon={<Network size={16} />} />
        <StatCard label="Active" value={connectedCount} icon={<CheckCircle size={16} />} />
        <StatCard label="Message Log" value={messages.length} icon={<Send size={16} />} />
        <StatCard label="Running Tasks" value={activeTasks.length} icon={<Activity size={16} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Agents List */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Network size={16} /> Agents ({agents.length})
          </h3>
          {agents.length === 0 ? (
            <p className="text-sm text-text-muted">No agents discovered. Click Discover.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedAgent?.id === a.id ? "border-accent bg-accent/5" : "border-border/30 bg-bg-secondary hover:border-accent/40"}`}
                  onClick={() => setSelectedAgent(selectedAgent?.id === a.id ? null : a)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.status === "active" || a.status === "connected" ? "bg-success" : "bg-warning"}`} />
                      <span className="text-xs font-medium text-text-heading truncate">
                        {a.name ?? a.id.slice(0, 12)}
                      </span>
                    </div>
                    <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                  </div>
                  {a.specialization && (
                    <p className="text-[10px] text-text-muted mt-0.5 ml-4">{a.specialization}</p>
                  )}
                  {selectedAgent?.id === a.id && (
                    <div className="mt-2 ml-4 space-y-1.5">
                      {a.endpoint && (
                        <p className="text-[10px] font-mono text-accent break-all">{a.endpoint}</p>
                      )}
                      {a.capabilities && a.capabilities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {a.capabilities.slice(0, 4).map((cap) => (
                            <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input text-text-muted">{cap}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-text-muted">
                        <span>IQ {a.intelligence ?? 100}</span>
                        <span>Mastery {Math.round((a.masteryLevel ?? 0) * 100)}%</span>
                        {a.lastSeen && <span>Seen {fmtTime(a.lastSeen)}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Send Message */}
        <div className="md:col-span-2">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Send size={16} /> Send A2A Message
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                  placeholder="Target Agent ID..."
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                />
                <input
                  className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                  placeholder="Method (e.g. research.query)..."
                  value={sendMethod}
                  onChange={(e) => setSendMethod(e.target.value)}
                />
              </div>
              <textarea
                className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm font-mono text-text-primary placeholder:text-text-muted resize-y min-h-[5rem] focus:outline-none focus:border-accent"
                placeholder='Payload (JSON) e.g. {"query": "quantum entanglement"}'
                value={sendPayload}
                onChange={(e) => setSendPayload(e.target.value)}
              />
              {/* Autocomplete from known agents */}
              {agents.length > 0 && !sendTo && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-text-muted">Quick select:</span>
                  {agents.slice(0, 5).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSendTo(a.id)}
                      className="text-[10px] px-2 py-0.5 rounded bg-bg-secondary border border-border text-accent hover:bg-accent/10 transition-colors"
                    >
                      {a.name ?? a.id.slice(0, 8)}
                    </button>
                  ))}
                </div>
              )}
              <Button
                onClick={sendMessage}
                loading={sending}
                disabled={!sendTo.trim() || !sendMethod.trim()}
                icon={<Send size={14} />}
              >
                Send Message
              </Button>
              {sendResult && (
                <pre className="text-xs font-mono bg-bg-secondary border border-border/30 rounded p-3 max-h-32 overflow-auto text-success whitespace-pre-wrap">
                  {sendResult}
                </pre>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Active Tasks — clickable for detail */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-1 flex items-center gap-2">
          <Activity size={16} /> A2A Tasks
          <Badge variant="neutral">{tasks.length}</Badge>
          {activeTasks.length > 0 && <Badge variant="info">{activeTasks.length} running</Badge>}
        </h3>
        <p className="text-xs text-text-muted mb-4">Click any task to see full collaboration details</p>
        {tasks.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No active tasks. Citizens are idle.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {tasks.slice(0, 30).map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTask(t)}
                className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border/30 text-sm cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                  <div className="min-w-0">
                    <span className="font-semibold text-text-heading truncate block text-xs">
                      {t.agentName ?? t.agentId.slice(0, 10)}
                    </span>
                    <span className="text-[10px] text-text-muted">{t.agentSpec}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs text-text-secondary font-mono truncate block">{t.method}</span>
                    {t.collaboratorName && (
                      <span className="text-[10px] text-accent">↔ {t.collaboratorName}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.progress != null && (
                    <div className="hidden sm:flex items-center gap-1">
                      <div className="w-16 h-1.5 rounded-full bg-bg-input overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${t.progress}%` }} />
                      </div>
                      <span className="text-[10px] text-text-muted">{t.progress}%</span>
                    </div>
                  )}
                  <span className="text-[10px] text-text-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" />{fmtTime(t.createdAt)}
                  </span>
                  {(t.status === "running" || t.status === "pending") && (
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-danger/10 text-danger"
                      onClick={(e) => cancelTask(t.id, e)}
                      aria-label="Cancel task"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Message Log */}
      {messages.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Send size={16} /> Message Log
            <Badge variant="neutral">{messages.length}</Badge>
          </h3>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {messages.slice(0, 20).map((m) => (
              <div
                key={m.id}
                className="flex items-start justify-between p-2 rounded text-xs border-b border-border/20 last:border-0 hover:bg-bg-secondary/50 transition-colors"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-text-muted font-mono">
                      <span className="text-text-secondary font-semibold truncate max-w-[80px]">
                        {m.fromName ?? m.from.slice(0, 8)}
                      </span>
                      <span>→</span>
                      <span className="truncate max-w-[80px]">
                        {m.toName ?? m.to.slice(0, 8)}
                      </span>
                    </div>
                    <span className="text-text-secondary font-semibold">{m.method}</span>
                    {m.content && (
                      <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{m.content}</p>
                    )}
                  </div>
                </div>
                <span className="text-text-muted flex-shrink-0 ml-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{fmtTime(m.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
