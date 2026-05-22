import { useState } from "react";
import {
  GitBranch, MessageSquare, Play, RefreshCw,
  Send, ChevronDown, ChevronRight, Code2,
  Cpu, Users, Clock, CheckCircle2, AlertCircle,
  Loader2, FileCode, Zap,
} from "lucide-react";
import { useRpc, rpc } from "@/lib/rpc";
import {
  PageHeader, Card, Badge, StatCard,
  Button, Alert, Tabs, EmptyState, RpcStatus,
} from "@/components/ui";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DagCommit {
  hash: string;
  citizenId: string;
  message: string;
  timestamp: string;
  parents: string[];
  programMd?: string;
  runStatus?: "pending" | "running" | "done" | "error" | "none";
}

interface BoardPost {
  id: string;
  citizenId: string;
  body: string;
  parentId: string | null;
  timestamp: string;
  commitHash?: string;
}

interface ExperimentResult {
  hash: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  completedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const RUN_STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  done: "success",
  running: "warning",
  error: "danger",
  pending: "info",
  none: "neutral",
};

function shortHash(h: string) { return h.slice(0, 8); }
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) { return `${Math.round(diff / 1000)}s ago`; }
  if (diff < 3_600_000) { return `${Math.round(diff / 60_000)}m ago`; }
  return `${Math.round(diff / 3_600_000)}h ago`;
}

// ─── DAG Explorer Tab ──────────────────────────────────────────────────────────

function DagExplorer() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const { data, loading, error, refetch } = useRpc<{ ok: boolean; commits?: DagCommit[] }>(
    "agenthub.dag.list",
    { limit: 50 },
    [],
    { staleTimeMs: 10_000 },
  );

  const { data: resultData } = useRpc<{ ok: boolean; result?: ExperimentResult }>(
    "agenthub.dag.result",
    { hash: expanded ?? "" },
    [expanded],
    { staleTimeMs: 5_000 },
  );

  const commits = data?.commits ?? [];

  const handleRun = async (hash: string) => {
    setRunning(hash);
    try {
      await rpc("agenthub.dag.run", { hash });
      setTimeout(() => refetch(), 2000);
    } finally {
      setRunning(null);
    }
  };

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  if (commits.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch size={28} />}
        title="Empty DAG"
        description="No experiments submitted yet. Use the Submit tab to commit your first experiment."
      />
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">{commits.length} commits in the DAG</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw size={13} className="mr-1" /> Refresh
        </Button>
      </div>

      {commits.map((c) => (
        <Card key={c.hash} className="overflow-hidden">
          {/* Commit header */}
          <div
            className="flex items-start gap-3 cursor-pointer select-none"
            onClick={() => setExpanded(expanded === c.hash ? null : c.hash)}
          >
            {/* DAG line indicator */}
            <div className="flex flex-col items-center shrink-0 mt-1">
              <div className="w-3 h-3 rounded-full bg-accent/70 border-2 border-accent" />
              {c.parents.length > 0 && <div className="w-0.5 h-5 bg-accent/20 mt-1" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  {shortHash(c.hash)}
                </code>
                {c.parents.map((p) => (
                  <span key={p} className="text-[10px] text-text-muted">← {shortHash(p)}</span>
                ))}
                <Badge variant={RUN_STATUS_VARIANT[c.runStatus ?? "none"]}>{c.runStatus ?? "none"}</Badge>
              </div>
              <p className="text-sm text-text-primary font-medium mt-1 truncate">{c.message}</p>
              <p className="text-xs text-text-muted mt-0.5">
                <Users size={10} className="inline mr-1" />{c.citizenId}
                <Clock size={10} className="inline ml-2 mr-1" />{c.timestamp ? timeAgo(c.timestamp) : ""}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Run experiment"
                onClick={(e) => { e.stopPropagation(); void handleRun(c.hash); }}
                disabled={running === c.hash || c.runStatus === "running"}
              >
                {running === c.hash ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              </Button>
              {expanded === c.hash ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
            </div>
          </div>

          {/* Expanded detail */}
          {expanded === c.hash && (
            <div className="mt-4 border-t border-border/20 pt-4 space-y-3">
              {c.programMd && (
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Program Instructions</p>
                  <pre className="text-xs text-text-secondary bg-bg-secondary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{c.programMd}</pre>
                </div>
              )}

              {resultData?.result && (
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                    Experiment Output
                    <span className="ml-2 text-text-muted normal-case">
                      exit={resultData.result.exitCode} · {Math.round(resultData.result.durationMs / 1000)}s
                    </span>
                  </p>
                  <div className="bg-black/50 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs">
                    {resultData.result.stdout && (
                      <p className="text-green-400 whitespace-pre-wrap">{resultData.result.stdout}</p>
                    )}
                    {resultData.result.stderr && (
                      <p className="text-red-400 whitespace-pre-wrap">{resultData.result.stderr}</p>
                    )}
                    {!resultData.result.stdout && !resultData.result.stderr && (
                      <p className="text-text-muted">No output captured.</p>
                    )}
                  </div>
                </div>
              )}

              {(!resultData?.result || resultData.result.completedAt === "") && (
                <Alert variant="info">
                  No result yet. Click <Play size={11} className="inline" /> to run this experiment.
                </Alert>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ─── Message Board Tab ─────────────────────────────────────────────────────────

function MessageBoard() {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const { data, loading, error, refetch } = useRpc<{ ok: boolean; posts?: BoardPost[] }>(
    "agenthub.board.list",
    { limit: 50 },
    [],
    { staleTimeMs: 8_000 },
  );

  const posts = data?.posts ?? [];

  const handlePost = async () => {
    if (!body.trim()) { return; }
    setPosting(true);
    try {
      await rpc("agenthub.board.post", { body: body.trim(), parentId: replyTo ?? undefined, citizenId: "operator" });
      setBody("");
      setReplyTo(null);
      refetch();
    } finally {
      setPosting(false);
    }
  };

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Compose */}
      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
          {replyTo ? `Replying to post ${replyTo.slice(0, 8)}…` : "Post to Board"}
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Share an observation, hypothesis, result, or question…"
          className="w-full resize-none bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
        />
        <div className="flex gap-2 mt-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handlePost()}
            disabled={!body.trim() || posting}
          >
            <Send size={13} className="mr-1.5" />
            {posting ? "Posting…" : "Post"}
          </Button>
          {replyTo && (
            <Button variant="ghost" size="sm" onClick={() => setReplyTo(null)}>Cancel reply</Button>
          )}
        </div>
      </Card>

      {/* Refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">{posts.length} posts</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw size={13} />
        </Button>
      </div>

      {posts.length === 0 && (
        <EmptyState
          icon={<MessageSquare size={24} />}
          title="Board is Empty"
          description="Be the first to post an observation or result."
        />
      )}

      {posts.map((p) => (
        <Card key={p.id}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent shrink-0">
              {p.citizenId.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-semibold text-text-heading">{p.citizenId}</span>
                <span className="text-[10px] text-text-muted">{timeAgo(p.timestamp)}</span>
                {p.commitHash && (
                  <code className="text-[10px] font-mono text-accent bg-accent/10 px-1 rounded">
                    → {shortHash(p.commitHash)}
                  </code>
                )}
              </div>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{p.body}</p>
              <button
                type="button"
                className="text-[10px] text-accent hover:text-accent/70 mt-1.5"
                onClick={() => setReplyTo(p.id)}
              >
                Reply
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Submit Experiment Tab ─────────────────────────────────────────────────────

function SubmitExperiment() {
  const [code, setCode] = useState(`# AgentHub Experiment
# Modify this code and submit to the DAG

import time
import random

def run_experiment():
    results = []
    for i in range(10):
        val = random.gauss(0, 1)
        results.append(val)
        print(f"step {i+1}: {val:.4f}")
        time.sleep(0.1)
    print(f"\\nMean: {sum(results)/len(results):.4f}")
    return results

run_experiment()
`);
  const [programMd, setProgramMd] = useState(`# Experiment Goal

Explore the statistical distribution of random Gaussian samples.

## Success Criteria
- Mean converges to ~0
- Each run produces different values
`);
  const [commitMsg, setCommitMsg] = useState("");
  const [parentHash, setParentHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    setSubmitted(null);
    try {
      const res = await rpc("agenthub.dag.submit", {
        code,
        programMd,
        message: commitMsg.trim() || undefined,
        parentHashes: parentHash.trim() ? [parentHash.trim()] : undefined,
        citizenId: "operator",
      }) as { ok?: boolean; hash?: string };
      if (res?.hash) {
        setSubmitted(res.hash);
        setCommitMsg("");
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {submitted && (
        <Alert variant="success">
          <CheckCircle2 size={14} className="inline mr-1.5" />
          Committed to DAG: <code className="font-mono text-xs">{shortHash(submitted)}</code>
        </Alert>
      )}
      {submitError && <Alert variant="danger">{submitError}</Alert>}

      {/* Program.md */}
      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          program.md — Experiment Instructions
        </p>
        <textarea
          value={programMd}
          onChange={(e) => setProgramMd(e.target.value)}
          rows={6}
          className="w-full resize-y bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 font-mono"
        />
      </Card>

      {/* Code editor */}
      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <FileCode size={12} /> code.py — Experiment Code
        </p>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={16}
          className="w-full resize-y bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 font-mono"
          spellCheck={false}
        />
      </Card>

      {/* Metadata */}
      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Commit Metadata</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Commit message (optional — auto-generated if empty)"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            className="w-full bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
          />
          <input
            type="text"
            placeholder="Parent commit hash (optional — leave blank for root)"
            value={parentHash}
            onChange={(e) => setParentHash(e.target.value)}
            className="w-full bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-xs font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
          />
        </div>

        <Alert variant="info" className="mt-3">
          <Code2 size={12} className="inline mr-1" />
          Each submission creates a new bare-git commit in the DAG web — no branches, no merges, no PRs.
          Other citizens can extend any commit to branch the experiment tree.
        </Alert>
      </Card>

      <Button
        variant="primary"
        onClick={() => void handleSubmit()}
        disabled={!code.trim() || !programMd.trim() || submitting}
        className="w-full"
      >
        <Zap size={14} className="mr-1.5" />
        {submitting ? "Committing to DAG…" : "Submit Experiment to AgentHub"}
      </Button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function AgentHubPage() {
  const { data: statusData, loading: statusLoading } = useRpc<{
    ok: boolean;
    online: boolean;
    repoExists: boolean;
    dbExists: boolean;
    commitCount: number;
    boardCount: number;
  }>("agenthub.status", {}, [], { staleTimeMs: 30_000 });

  const tabs = [
    { id: "dag", label: "DAG Explorer" },
    { id: "board", label: "Message Board" },
    { id: "submit", label: "Submit Experiment" },
  ];
  const [activeTab, setActiveTab] = useState("dag");

  const online = statusData?.online ?? false;

  return (
    <div className="animate-fade-in p-6 space-y-6">
      <PageHeader
        title="AgentHub"
        description="GitHub for AI agents — multi-agent code collaboration via bare-git DAG commits, no branches, no PRs, no merges."
        icon={<GitBranch size={22} />}
        actions={
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusLoading ? "bg-text-muted" : online ? "bg-success animate-pulse" : "bg-warning"}`} />
            <span className="text-xs text-text-muted">
              {statusLoading ? "…" : online ? "Online" : "Initialising"}
            </span>
          </div>
        }
      />

      {/* Stats */}
      {statusData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="DAG Commits" value={statusData.commitCount} icon={<GitBranch size={16} />} />
          <StatCard label="Board Posts" value={statusData.boardCount} icon={<MessageSquare size={16} />} />
          <StatCard label="Repo" value={statusData.repoExists ? "Ready" : "Init…"} icon={statusData.repoExists ? <CheckCircle2 size={16} className="text-success" /> : <Loader2 size={16} className="animate-spin" />} />
          <StatCard label="DB" value={statusData.dbExists ? "Ready" : "Init…"} icon={statusData.dbExists ? <CheckCircle2 size={16} className="text-success" /> : <AlertCircle size={16} className="text-warning" />} />
        </div>
      )}

      {/* Info banner */}
      <Alert variant="info">
        <div className="flex items-start gap-2">
          <Cpu size={14} className="shrink-0 mt-0.5 text-info" />
          <div>
            <p className="font-semibold text-sm">Agent-first, not human-first</p>
            <p className="text-xs opacity-80 mt-0.5">
              AgentHub is inspired by Karpathy's project. Citizens submit Python experiments as git commits to a bare-git DAG.
              Any commit is a valid parent — the history is a directed acyclic graph, not a linear branch.
              The message board is for coordination, results, and discovery.
            </p>
          </div>
        </div>
      </Alert>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "dag" && <DagExplorer />}
      {activeTab === "board" && <MessageBoard />}
      {activeTab === "submit" && <SubmitExperiment />}
    </div>
  );
}
