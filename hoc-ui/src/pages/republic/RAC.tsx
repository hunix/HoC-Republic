import { useState } from "react";
import {
  MessageSquareDot, Target, Brain, ChevronDown,
  ChevronRight, Plus, Trash2, CheckCircle2,
  Circle, Zap, RefreshCw, Send,
  TrendingUp, Database, Clock,
} from "lucide-react";
import { useRpc, rpc, mutateRpc } from "@/lib/rpc";
import {
  PageHeader, Card, Badge, StatCard,
  Button, Alert, Tabs, EmptyState,
  RpcStatus, ProgressBar, ConfirmDialog,
} from "@/components/ui";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RacFact {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  confidence: number;
  tags: string[];
  timestamp: string;
}

interface RacTurn {
  index: number;
  role: "user" | "citizen" | "system";
  content: string;
  timestamp: string;
  clarificationNeeded?: string;
  outcomeProgress?: number;
  retrievedFacts?: string[];
}

interface RacOutcome {
  label: string;
  score: number;
  milestones: string[];
  reached: boolean[];
  targetMetric?: string;
  targetValue?: number;
  currentValue?: number;
}

interface RacSession {
  id: string;
  name: string;
  citizenId: string;
  goal: string;
  context: string;
  status: "active" | "completed" | "paused";
  outcome: RacOutcome;
  turns: RacTurn[];
  facts: RacFact[];
  pendingClarifications: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) { return `${Math.round(diff / 1000)}s ago`; }
  if (diff < 3_600_000) { return `${Math.round(diff / 60_000)}m ago`; }
  return `${Math.round(diff / 3_600_000)}h ago`;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "neutral"> = {
  completed: "success",
  active: "info",
  paused: "warning",
};

const ROLE_COLORS: Record<string, string> = {
  user: "text-accent",
  citizen: "text-success",
  system: "text-text-muted",
};

// ─── Session Detail View ────────────────────────────────────────────────────────

function SessionDetail({ session, onBack, onRefresh }: { session: RacSession; onBack: () => void; onRefresh: () => void }) {
  const [userInput, setUserInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expandFacts, setExpandFacts] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleUserTurn = async () => {
    if (!userInput.trim()) { return; }
    setSending(true);
    try {
      await rpc("rac.turn.user", { sessionId: session.id, content: userInput.trim() });
      setUserInput("");
      onRefresh();
    } finally {
      setSending(false);
    }
  };

  const handleMilestone = async (idx: number) => {
    await rpc("rac.milestone.reach", { sessionId: session.id, milestoneIndex: idx });
    onRefresh();
  };

  const handleDelete = async () => {
    await mutateRpc("rac.session.delete", { id: session.id });
    onBack();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-text-heading truncate">{session.name}</h2>
          <p className="text-xs text-text-muted">{session.citizenId} · {timeAgo(session.updatedAt)}</p>
        </div>
        <Badge variant={STATUS_VARIANT[session.status]}>{session.status}</Badge>
        <Button variant="ghost" size="sm" aria-label="Refresh" onClick={onRefresh}><RefreshCw size={13} /></Button>
        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} aria-label="Delete session"><Trash2 size={13} /></Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Session"
        message="This will permanently delete all turns and facts in this session."
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Outcome progress */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-accent" />
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Outcome Progress</span>
          <span className="ml-auto text-sm font-bold text-accent">{Math.round(session.outcome.score * 100)}%</span>
        </div>
        <ProgressBar value={session.outcome.score} max={1} />
        <p className="text-xs text-text-secondary mt-2 italic">{session.goal}</p>

        {session.outcome.milestones.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {session.outcome.milestones.map((m, i) => (
              <button
                key={i}
                type="button"
                className="flex items-center gap-2 text-sm w-full text-left hover:opacity-80 transition-opacity"
                onClick={() => void handleMilestone(i)}
                disabled={session.outcome.reached[i]}
              >
                {session.outcome.reached[i]
                  ? <CheckCircle2 size={14} className="text-success shrink-0" />
                  : <Circle size={14} className="text-text-muted shrink-0" />}
                <span className={session.outcome.reached[i] ? "line-through text-text-muted" : "text-text-secondary"}>{m}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Pending clarifications */}
      {session.pendingClarifications.length > 0 && (
        <Alert variant="warning">
          <p className="font-semibold text-sm mb-1">Clarifications needed:</p>
          <ul className="space-y-0.5">
            {session.pendingClarifications.map((c, i) => <li key={i} className="text-xs">• {c}</li>)}
          </ul>
        </Alert>
      )}

      {/* Conversation */}
      <Card className="space-y-3">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Conversation</p>

        {session.turns.length === 0 && (
          <p className="text-sm text-text-muted italic">No turns yet. Send a message below to start.</p>
        )}

        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {session.turns.map((t) => (
            <div key={t.index} className={`flex gap-2.5 ${t.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${t.role === "user" ? "bg-accent/20 text-accent" : t.role === "citizen" ? "bg-success/20 text-success" : "bg-text-muted/10 text-text-muted"}`}>
                {t.role === "user" ? "U" : t.role === "citizen" ? "C" : "S"}
              </div>
              <div className={`flex-1 max-w-[80%] rounded-xl px-3 py-2 ${t.role === "user" ? "bg-accent/10 rounded-tr-sm" : "bg-bg-secondary rounded-tl-sm"}`}>
                <p className={`text-sm ${ROLE_COLORS[t.role]}`}>{t.content}</p>
                {t.clarificationNeeded && (
                  <p className="text-[10px] text-warning mt-1">⚠ {t.clarificationNeeded}</p>
                )}
                {(t.retrievedFacts?.length ?? 0) > 0 && (
                  <p className="text-[10px] text-info mt-1">📎 {t.retrievedFacts!.length} facts used</p>
                )}
                <p className="text-[9px] text-text-muted mt-1">{timeAgo(t.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        {session.status === "active" && (
          <div className="flex gap-2 pt-2 border-t border-border/20">
            <textarea
              rows={2}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Add a user message… (facts will be auto-extracted)"
              className="flex-1 resize-none bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleUserTurn(); } }}
            />
            <Button variant="primary" size="sm" onClick={() => void handleUserTurn()} disabled={!userInput.trim() || sending}>
              <Send size={13} />
            </Button>
          </div>
        )}
      </Card>

      {/* Facts panel */}
      <Card>
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpandFacts(!expandFacts)}
        >
          <Database size={13} className="text-info" />
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">
            Extracted Facts ({session.facts.length})
          </span>
          {expandFacts ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {expandFacts && (
          <div className="mt-3 space-y-2">
            {session.facts.length === 0 && <p className="text-xs text-text-muted italic">No facts extracted yet.</p>}
            {session.facts.map((f) => (
              <div key={f.id} className="flex items-start gap-2 text-xs">
                <div className="flex gap-1 flex-wrap shrink-0">
                  {f.tags.map(t => <Badge key={t} variant="neutral">{t}</Badge>)}
                </div>
                <span className="text-text-secondary">
                  <span className="font-mono text-info">{f.subject}</span>
                  {" "}<span className="text-text-muted">{f.predicate}</span>{" "}
                  <span className="font-semibold text-text-primary">{f.value}</span>
                  <span className="text-text-muted ml-1">({Math.round(f.confidence * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Sessions List Tab ─────────────────────────────────────────────────────────

function SessionsList({ onSelect }: { onSelect: (s: RacSession) => void }) {
  const { data, loading, error, refetch } = useRpc<{ ok: boolean; sessions?: RacSession[] }>(
    "rac.session.list",
    { limit: 50 },
    [],
    { staleTimeMs: 8_000 },
  );
  const sessions = data?.sessions ?? [];

  if (loading || error) { return <RpcStatus loading={loading} error={error} onRetry={refetch} />; }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareDot size={24} />}
        title="No RAC Sessions"
        description="Create a session in the New Session tab to start stateful outcome-driving conversations."
      />
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">{sessions.length} sessions</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </div>
      {sessions.map((s) => (
        <Card key={s.id} hover onClick={() => onSelect(s)} className="cursor-pointer">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-sm text-text-heading truncate">{s.name}</span>
                <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
              </div>
              <p className="text-xs text-text-secondary truncate mb-2">{s.goal}</p>
              <ProgressBar value={s.outcome.score} max={1} labelLeft={`${Math.round(s.outcome.score * 100)}% done`} labelRight={`${s.turns.length} turns`} />
            </div>
            <div className="text-right shrink-0">
              <Clock size={11} className="inline mr-1 text-text-muted" />
              <span className="text-[10px] text-text-muted">{timeAgo(s.updatedAt)}</span>
              {s.pendingClarifications.length > 0 && (
                <div className="mt-1">
                  <Badge variant="warning">{s.pendingClarifications.length} pending</Badge>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── New Session Tab ───────────────────────────────────────────────────────────

function NewSession({ onCreate }: { onCreate: (s: RacSession) => void }) {
  const [form, setForm] = useState({
    name: "",
    goal: "",
    context: "business operations",
    citizenId: "",
    targetMetric: "",
    targetValue: "",
    milestones: ["", "", ""],
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const setMilestone = (i: number, v: string) => {
    const m = [...form.milestones];
    m[i] = v;
    setForm(f => ({ ...f, milestones: m }));
  };

  const handleCreate = async () => {
    if (!form.goal.trim()) { setError("Goal is required"); return; }
    setCreating(true);
    setError("");
    try {
      const res = await rpc("rac.session.create", {
        name: form.name.trim() || `RAC – ${form.goal.slice(0, 30)}`,
        citizenId: form.citizenId.trim() || "operator",
        goal: form.goal.trim(),
        context: form.context.trim(),
        milestones: form.milestones.filter(m => m.trim() !== ""),
        targetMetric: form.targetMetric.trim() || undefined,
        targetValue: form.targetValue ? Number(form.targetValue) : undefined,
      }) as { ok?: boolean; session?: RacSession };
      if (res?.session) { onCreate(res.session); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">Session Definition</p>
        <div className="space-y-3">
          <input type="text" placeholder="Session name (auto-generated if blank)"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60" />

          <textarea rows={2} placeholder="Conversation goal — what outcome should this conversation drive? *"
            value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
            className="w-full resize-none bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60" />

          <input type="text" placeholder="Domain context (e.g. 'enterprise SaaS sales', 'budgeting', 'hiring')"
            value={form.context} onChange={e => setForm(f => ({ ...f, context: e.target.value }))}
            className="w-full bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60" />

          <input type="text" placeholder="Citizen ID to guide this session (optional)"
            value={form.citizenId} onChange={e => setForm(f => ({ ...f, citizenId: e.target.value }))}
            className="w-full bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60" />
        </div>
      </Card>

      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          <TrendingUp size={12} className="inline mr-1.5" />Measurable Outcome (optional)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <input type="text" placeholder="Metric name (e.g. 'deal_value')"
            value={form.targetMetric} onChange={e => setForm(f => ({ ...f, targetMetric: e.target.value }))}
            className="bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60" />
          <input type="number" placeholder="Target value"
            value={form.targetValue} onChange={e => setForm(f => ({ ...f, targetValue: e.target.value }))}
            className="bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60" />
        </div>
      </Card>

      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          <CheckCircle2 size={12} className="inline mr-1.5" />Milestones (up to 3)
        </p>
        <div className="space-y-2">
          {form.milestones.map((m, i) => (
            <input key={i} type="text" placeholder={`Milestone ${i + 1} (optional)`}
              value={m} onChange={e => setMilestone(i, e.target.value)}
              className="w-full bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60" />
          ))}
        </div>
      </Card>

      <Alert variant="info">
        <Brain size={12} className="inline mr-1.5" />
        RAC sessions automatically extract facts (entities, budgets, timelines, preferences) from each user turn and inject them as context into the citizen's next response — driving conversations toward a measurable outcome, not just answering questions.
      </Alert>

      <Button variant="primary" onClick={() => void handleCreate()} disabled={!form.goal.trim() || creating} className="w-full">
        <Plus size={14} className="mr-1.5" />
        {creating ? "Creating…" : "Create RAC Session"}
      </Button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function RACPage() {
  const { data: stats, loading: statsLoading } = useRpc<{
    ok: boolean;
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    totalFacts: number;
    totalTurns: number;
    avgOutcomeScore: number;
  }>("rac.stats", {}, [], { staleTimeMs: 30_000 });

  const [activeTab, setActiveTab] = useState("sessions");
  const [selected, setSelected] = useState<RacSession | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = [
    { id: "sessions", label: "Sessions" },
    { id: "new", label: "+ New Session" },
  ];

  const handleSelect = (s: RacSession) => { setSelected(s); };
  const handleBack = () => { setSelected(null); setRefreshKey(k => k + 1); };
  const handleRefreshDetail = () => { setRefreshKey(k => k + 1); };

  // Re-fetch selected session on refresh
  const { data: selectedData } = useRpc<{ ok: boolean; session?: RacSession }>(
    "rac.session.get",
    { id: selected?.id ?? "" },
    [selected?.id, refreshKey],
    { staleTimeMs: 3_000 },
  );
  const liveSession = selectedData?.session ?? selected;

  return (
    <div className="animate-fade-in p-6 space-y-6">
      <PageHeader
        title="RAC — Retrieval-Augmented Conversation"
        description="Multi-turn, stateful dialogues that remember facts and drive conversations toward measurable business outcomes."
        icon={<MessageSquareDot size={22} />}
        actions={
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Zap size={13} className="text-accent" />
            Outcome-driven · Fact-aware · Stateful
          </div>
        }
      />

      {/* Stats */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Sessions" value={stats.totalSessions} icon={<MessageSquareDot size={14} />} />
          <StatCard label="Active" value={stats.activeSessions} icon={<Zap size={14} className="text-info" />} />
          <StatCard label="Completed" value={stats.completedSessions} icon={<CheckCircle2 size={14} className="text-success" />} />
          <StatCard label="Facts Stored" value={stats.totalFacts} icon={<Database size={14} className="text-purple-400" />} />
          <StatCard label="Total Turns" value={stats.totalTurns} icon={<MessageSquareDot size={14} />} />
          <StatCard label="Avg Progress" value={`${Math.round((stats.avgOutcomeScore ?? 0) * 100)}%`} icon={<TrendingUp size={14} className="text-accent" />} />
        </div>
      )}

      {selected && liveSession ? (
        <SessionDetail
          key={`${liveSession.id}-${refreshKey}`}
          session={liveSession}
          onBack={handleBack}
          onRefresh={handleRefreshDetail}
        />
      ) : (
        <>
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
          {activeTab === "sessions" && <SessionsList key={refreshKey} onSelect={handleSelect} />}
          {activeTab === "new" && (
            <NewSession
              onCreate={(s) => { setSelected(s); setActiveTab("sessions"); }}
            />
          )}
        </>
      )}
    </div>
  );
}
