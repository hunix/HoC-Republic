import {
  Workflow,
  Users,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Play,
  Star,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { PageHeader, Card, Badge, Button, ProgressBar, RpcStatus } from "@/components/ui";
import { useRpc, rpc, onWsMessage } from "@/lib/rpc";

// ── Types ──────────────────────────────────────────────────────────

interface GSDSession {
  id: string;
  prompt: string;
  source: string;
  status: string;
  projectId: string | null;
  teamMembers: Array<{
    citizenId: string;
    citizenName: string;
    specialization: string;
    role: string;
    tasksAssigned: number;
    tasksCompleted: number;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    type: string;
    assignedToName: string;
    status: string;
    priority: string;
  }>;
  peerReviews: Array<{
    id: string;
    filePath: string;
    authorName: string;
    reviewerName: string;
    status: string;
    issues: Array<{ severity: string; category: string; message: string }>;
    qualityBefore: number;
    qualityAfter: number;
  }>;
  qualityGate: {
    syntaxPassed: boolean;
    logicPassed: boolean;
    securityPassed: boolean;
    peerReviewPassed: boolean;
    integrationPassed: boolean;
    overallScore: number;
  };
  timeline: Array<{
    timestamp: string;
    type: string;
    citizenName?: string;
    detail: string;
  }>;
  createdAt: string;
  completedAt: string | null;
  totalFilesGenerated: number;
  totalPeerReviews: number;
  totalAutoFixes: number;
}

// ── Helpers ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  analyzing: "info",
  "forming-team": "info",
  distributing: "info",
  executing: "warning",
  reviewing: "warning",
  validating: "warning",
  delivering: "success",
  complete: "success",
  failed: "danger",
};

const PRIORITY_VARIANTS: Record<string, string> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

function QualityGate({ gate }: { gate: GSDSession["qualityGate"] }) {
  const checks = [
    { label: "Syntax", ok: gate.syntaxPassed },
    { label: "Logic", ok: gate.logicPassed },
    { label: "Security", ok: gate.securityPassed },
    { label: "Peer Review", ok: gate.peerReviewPassed },
    { label: "Integration", ok: gate.integrationPassed },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-text-heading">Quality Gate</span>
        <Badge
          variant={
            gate.overallScore >= 0.8 ? "success" : gate.overallScore >= 0.5 ? "warning" : "danger"
          }
        >
          {Math.round(gate.overallScore * 100)}%
        </Badge>
      </div>
      <ProgressBar value={gate.overallScore * 100} size="md" />
      <div className="grid grid-cols-2 gap-1 mt-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-xs">
            {c.ok ? (
              <CheckCircle size={12} className="text-success shrink-0" />
            ) : (
              <AlertCircle size={12} className="text-danger shrink-0" />
            )}
            <span className={c.ok ? "text-text-secondary" : "text-danger"}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GSD Page ───────────────────────────────────────────────────────

export function GSDPage() {
  // ✅ ALL hooks first — no conditional returns before this block
  const [sessions, setSessions] = useState<GSDSession[]>([]);
  const [selected, setSelected] = useState<GSDSession | null>(null);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"tasks" | "reviews" | "timeline">("tasks");

  const { data, loading, refetch, error } = useRpc<{ sessions: GSDSession[] }>("gsd.list", {});

  useEffect(() => {
    if (data?.sessions) {
      setSessions(data.sessions);
    }
  }, [data]);

  // Live updates via WebSocket
  useEffect(() => {
    const off = onWsMessage((msg) => {
      if (msg.type !== "event") {
        return;
      }
      const event = msg.event as string;
      if (event !== "gsd" && event !== "gsd.update") {
        return;
      }
      refetch();
    });
    return off;
  }, [refetch]);

  // ✅ All hooks called above — now safe to do conditional early return
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  async function launchGSD() {
    if (!prompt.trim() || running) {
      return;
    }
    setRunning(true);
    try {
      const res = await rpc<{ session: GSDSession }>("gsd.execute", {
        prompt: prompt.trim(),
        source: "webui",
      });
      if (res?.session) {
        setSessions((prev) => [res.session, ...prev]);
        setSelected(res.session);
        setPrompt("");
      }
    } catch {
      // Silently fail — backend may not be running
    } finally {
      setRunning(false);
    }
  }

  // Enrich selected session from latest data
  const selectedFresh = sessions.find((s) => s.id === selected?.id) ?? selected;

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        title="GSD Pipeline"
        description="Get Shit Done — autonomous dev operations with peer review"
        icon={<Workflow size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {/* Launch Bar */}
      <Card hover={false}>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-text-muted mb-1.5 font-medium">
              Project Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void launchGSD();
                }
              }}
              placeholder="Build a React SaaS dashboard with authentication, real-time analytics…"
              rows={2}
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-2 focus:ring-accent-glow transition-all resize-none"
            />
          </div>
          <Button
            onClick={() => void launchGSD()}
            disabled={!prompt.trim() || running}
            icon={running ? <Clock size={16} className="animate-spin" /> : <Play size={16} />}
          >
            {running ? "Launching…" : "Launch GSD"}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sessions list */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">
            Sessions ({sessions.length})
          </h3>
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-bg-card animate-pulse rounded-xl border border-border/30"
                />
              ))}
            </div>
          )}
          {!loading && sessions.length === 0 && (
            <Card hover={false}>
              <p className="text-sm text-text-muted text-center py-6">
                No GSD sessions yet. Launch one above!
              </p>
            </Card>
          )}
          {sessions.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selected?.id === s.id
                  ? "border-accent/60 bg-accent/5"
                  : "border-border bg-bg-card hover:border-border-focus hover:bg-bg-card-hover"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-mono text-text-muted">{s.id.slice(0, 8)}</span>
                <Badge
                  variant={
                    (STATUS_COLORS[s.status] as
                      | "info"
                      | "warning"
                      | "success"
                      | "danger"
                      | "neutral") ?? "neutral"
                  }
                >
                  {s.status}
                </Badge>
              </div>
              <p className="text-xs text-text-secondary line-clamp-2">{s.prompt}</p>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
                <span className="flex items-center gap-1">
                  <Users size={10} /> {s.teamMembers.length}
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={10} /> {s.totalFilesGenerated}
                </span>
                <span className="flex items-center gap-1">
                  <Star size={10} /> {s.totalPeerReviews}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Session detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedFresh ? (
            <Card hover={false}>
              <div className="py-16 text-center text-text-muted text-sm">
                Select a session to view details
              </div>
            </Card>
          ) : (
            <>
              {/* Overview */}
              <Card hover={false}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-text-heading">
                      {selectedFresh.projectId ?? selectedFresh.id}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                      {selectedFresh.prompt}
                    </p>
                  </div>
                  <Badge
                    variant={
                      (STATUS_COLORS[selectedFresh.status] as
                        | "info"
                        | "warning"
                        | "success"
                        | "danger"
                        | "neutral") ?? "neutral"
                    }
                  >
                    {selectedFresh.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Team", value: selectedFresh.teamMembers.length },
                    { label: "Tasks", value: selectedFresh.tasks.length },
                    { label: "Files", value: selectedFresh.totalFilesGenerated },
                    { label: "Reviews", value: selectedFresh.totalPeerReviews },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-bg-input rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-text-primary">{stat.value}</div>
                      <div className="text-[10px] text-text-muted">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <QualityGate gate={selectedFresh.qualityGate} />
              </Card>

              {/* Tabs */}
              <div className="flex gap-1 bg-bg-input rounded-xl p-1">
                {(["tasks", "reviews", "timeline"] as const).map((tab) => (
                  <button
                    type="button"
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-1.5 text-xs rounded-lg capitalize font-medium transition-all ${
                      activeTab === tab
                        ? "bg-bg-card text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tasks */}
              {activeTab === "tasks" && (
                <Card hover={false} className="!p-0">
                  <div className="divide-y divide-border">
                    {selectedFresh.tasks.length === 0 && (
                      <p className="text-sm text-text-muted text-center py-8">No tasks yet.</p>
                    )}
                    {selectedFresh.tasks.map((t) => (
                      <div key={t.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {t.status === "completed" ? (
                            <CheckCircle size={14} className="text-success shrink-0" />
                          ) : t.status === "active" ? (
                            <Clock size={14} className="text-warning shrink-0 animate-spin" />
                          ) : t.status === "blocked" ? (
                            <AlertTriangle size={14} className="text-danger shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs text-text-primary font-medium truncate">
                              {t.title}
                            </div>
                            <div className="text-[10px] text-text-muted">
                              {t.assignedToName} · {t.type}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={
                              (PRIORITY_VARIANTS[t.priority] as
                                | "danger"
                                | "warning"
                                | "info"
                                | "neutral") ?? "neutral"
                            }
                          >
                            {t.priority}
                          </Badge>
                          <Badge variant="neutral">{t.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Peer Reviews */}
              {activeTab === "reviews" && (
                <div className="space-y-3">
                  {selectedFresh.peerReviews.length === 0 && (
                    <Card hover={false}>
                      <p className="text-sm text-text-muted text-center py-8">
                        No peer reviews yet.
                      </p>
                    </Card>
                  )}
                  {selectedFresh.peerReviews.map((r) => (
                    <Card key={r.id} hover={false}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-xs font-mono text-accent">{r.filePath}</div>
                          <div className="text-[10px] text-text-muted mt-0.5">
                            by {r.authorName} · reviewed by {r.reviewerName}
                          </div>
                        </div>
                        <Badge
                          variant={
                            r.status === "approved" || r.status === "fixed"
                              ? "success"
                              : r.status === "changes-requested"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {r.status}
                        </Badge>
                      </div>
                      <ProgressBar
                        value={r.qualityAfter * 100}
                        labelLeft={`Quality: ${Math.round(r.qualityBefore * 100)}% → ${Math.round(r.qualityAfter * 100)}%`}
                        size="sm"
                      />
                      {r.issues.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {r.issues.slice(0, 3).map((issue, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px]">
                              <AlertCircle
                                size={11}
                                className={
                                  issue.severity === "critical" || issue.severity === "major"
                                    ? "text-danger shrink-0 mt-0.5"
                                    : "text-warning shrink-0 mt-0.5"
                                }
                              />
                              <span className="text-text-muted">{issue.message}</span>
                            </div>
                          ))}
                          {r.issues.length > 3 && (
                            <div className="text-[10px] text-text-muted pl-4">
                              +{r.issues.length - 3} more issues
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}

              {/* Timeline */}
              {activeTab === "timeline" && (
                <Card hover={false} className="!p-0">
                  <div className="max-h-80 overflow-y-auto p-4 space-y-3">
                    {selectedFresh.timeline.length === 0 && (
                      <p className="text-sm text-text-muted text-center py-8">No events yet.</p>
                    )}
                    {selectedFresh.timeline.toReversed().map((evt, i) => (
                      <div key={i} className="flex gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-text-secondary capitalize">
                              {evt.type.replace(/-/g, " ")}
                            </span>
                            {evt.citizenName && (
                              <Badge variant="neutral" className="!text-[9px] !py-0 !px-1">
                                {evt.citizenName}
                              </Badge>
                            )}
                          </div>
                          <p className="text-text-muted break-words">{evt.detail}</p>
                        </div>
                        <span className="text-[10px] text-text-muted shrink-0">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
