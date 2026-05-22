import { Search, BookOpen, Play, Monitor, RefreshCw, FileText, Plus, Activity } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type ResearchJob = {
  id: string;
  topic: string;
  status: "queued" | "running" | "done" | "error";
  result?: string;
  docsFound?: number;
  startedAt?: number;
};

export function ResearchPage() {
  const { data, loading, error, refetch } = useRpc<{ jobs?: ResearchJob[] }>(
    "republic.research.monitor.list",
    {},
    [],
    { staleTimeMs: 6_000, refetchIntervalMs: 8_000 },
  );
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<ResearchJob | null>(null);
  const [actionError, setActionError] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const jobs = data?.jobs ?? [];
  const running = jobs.filter((j) => j.status === "running").length;
  const done = jobs.filter((j) => j.status === "done").length;

  async function submitResearch() {
    if (!topic.trim()) {return;}
    setSubmitting(true);
    setActionError("");
    try {
      await rpc("republic.research.submit", { topic: topic.trim() });
      invalidateRpcCache("republic.research.monitor.list");
      setTopic("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function viewDocs(job: ResearchJob) {
    try {
      const r = await rpc<{ docs?: string[] }>("republic.research.docs", { jobId: job.id });
      setSelected({ ...job, result: r?.docs?.join("\n\n---\n\n") ?? "(no docs)" });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const statusVariant = (s: string) =>
    s === "done" ? "success" : s === "running" ? "info" : s === "error" ? "danger" : "neutral";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Research Engine"
        description="Submit research topics, monitor pipeline, and browse discovered documents"
        icon={<Search size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Jobs" value={jobs.length} icon={<BookOpen size={16} />} />
        <StatCard label="Running" value={running} icon={<Activity size={16} />} />
        <StatCard label="Completed" value={done} icon={<FileText size={16} />} />
        <StatCard
          label="Errors"
          value={jobs.filter((j) => j.status === "error").length}
          icon={<Monitor size={16} />}
        />
      </div>

      {/* Submit */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
          <Plus size={16} /> New Research Topic
        </h3>
        <div className="flex gap-3">
          <input
            className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
            placeholder="e.g. Quantum computing trends in 2025..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitResearch()}
          />
          <Button
            onClick={submitResearch}
            loading={submitting}
            disabled={!topic.trim()}
            icon={<Play size={14} />}
          >
            Submit
          </Button>
        </div>
      </Card>

      {/* Jobs */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">📚 Research Jobs</h3>
        {loading ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-text-muted">No research jobs yet.</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {j.status === "running" && (
                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-heading truncate">{j.topic}</p>
                    <p className="text-xs text-text-muted">
                      {j.docsFound != null ? `${j.docsFound} docs` : ""}
                      {j.startedAt ? ` · ${new Date(j.startedAt).toLocaleTimeString()}` : ""}
                    </p>
                  </div>
                  <Badge variant={statusVariant(j.status)}>{j.status}</Badge>
                </div>
                {j.status === "done" && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<FileText size={12} />}
                    onClick={() => viewDocs(j)}
                  >
                    Docs
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Doc Viewer */}
      {selected && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-heading">📄 {selected.topic}</h3>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              ✕
            </Button>
          </div>
          <pre className="text-xs text-text-secondary whitespace-pre-wrap bg-bg-secondary rounded-lg p-4 max-h-64 overflow-y-auto border border-border/30">
            {selected.result}
          </pre>
        </Card>
      )}
    </div>
  );
}
