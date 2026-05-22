import {
  FileText,
  Search,
  Download,
  Eye,
  RefreshCw,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Globe,
  Send,
  X,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { PageHeader, Card, Badge, Button, Alert, StatCard, RpcStatus } from "@/components/ui";
import { rpc, useRpc } from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────

type ResearchDepth = "quick" | "standard" | "deep";
type ResearchFormat = "pdf" | "docx" | "pptx" | "xlsx" | "md" | "html";
type ResearchStatus =
  | "queued"
  | "planning"
  | "searching"
  | "extracting"
  | "synthesizing"
  | "writing"
  | "done"
  | "failed";

interface ResearchJob {
  id: string;
  query: string;
  format: string;
  depth: string;
  status: ResearchStatus;
  progress: {
    phase: string;
    phasePct: number;
    totalSources: number;
    extractedSources: number;
    sectionsWritten: number;
  };
  plan?: {
    title: string;
    executiveSummary: string;
    subTopics: string[];
    keyQuestions: string[];
  };
  result?: {
    filePath: string;
    downloadUrl: string;
    format: string;
    sizeKb: number;
    pageCount: number;
    markdownPath?: string;
  };
  error?: string;
  log?: string[];
  createdAt: string;
  completedAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: ResearchFormat; label: string; emoji: string }[] = [
  { value: "md", label: "Markdown", emoji: "📝" },
  { value: "pdf", label: "PDF Report", emoji: "📄" },
  { value: "docx", label: "Word (.docx)", emoji: "📋" },
  { value: "pptx", label: "PowerPoint", emoji: "🎯" },
  { value: "xlsx", label: "Excel", emoji: "📊" },
  { value: "html", label: "HTML Page", emoji: "🌐" },
];

const DEPTH_OPTIONS: { value: ResearchDepth; label: string; desc: string }[] = [
  { value: "quick", label: "Quick", desc: "2 topics · 10 sources · ~2 min" },
  { value: "standard", label: "Standard", desc: "4 topics · 32 sources · ~5 min" },
  { value: "deep", label: "Deep", desc: "6 topics · 72 sources · ~10 min" },
];

const STATUS_STEPS: ResearchStatus[] = [
  "planning",
  "searching",
  "extracting",
  "synthesizing",
  "writing",
  "done",
];

const STATUS_LABELS: Record<ResearchStatus, string> = {
  queued: "Queued",
  planning: "Planning",
  searching: "Searching Web",
  extracting: "Extracting Content",
  synthesizing: "Synthesizing",
  writing: "Writing Document",
  done: "Complete",
  failed: "Failed",
};

const STATUS_COLOR: Record<ResearchStatus, string> = {
  queued: "text-text-muted",
  planning: "text-blue-400",
  searching: "text-cyan-400",
  extracting: "text-yellow-400",
  synthesizing: "text-purple-400",
  writing: "text-emerald-400",
  done: "text-success",
  failed: "text-destructive",
};

// ─── Helpers ─────────────────────────────────────────────────────

function formatAge(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(min / 60);
  if (hr > 0) {
    return `${hr}h ${min % 60}m ago`;
  }
  if (min > 0) {
    return `${min}m ago`;
  }
  return "just now";
}

function progressPct(job: ResearchJob): number {
  if (job.status === "done") {
    return 100;
  }
  if (job.status === "failed") {
    return 0;
  }
  const idx = STATUS_STEPS.indexOf(job.status);
  if (idx < 0) {
    return 0;
  }
  return Math.min(
    95,
    (idx / (STATUS_STEPS.length - 1)) * 100 + (job.progress?.phasePct ?? 0) * 0.1,
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function ResearchStudio() {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ResearchFormat>("md");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [context, setContext] = useState("");
  const [starting, setStarting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<ResearchJob | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [followUpMsg, setFollowUpMsg] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waSendError, setWaSendError] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load job list
  const {
    data: listData,
    refetch: refetchList,
    loading,
    error,
  } = useRpc<{ jobs?: ResearchJob[] }>("republic.research.list", { limit: 30 });

  // Active job polling — ALL hooks must be before any conditional returns
  const [activeJob, setActiveJob] = useState<ResearchJob | null>(null);

  const pollActiveJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await rpc<{
          ok: boolean;
          status: ResearchStatus;
          progress: ResearchJob["progress"];
          plan: ResearchJob["plan"];
          log: string[];
          error?: string;
          completedAt?: string;
        }>("republic.research.status", { jobId });
        if (res.ok) {
          setActiveJob((prev) =>
            prev
              ? {
                  ...prev,
                  status: res.status,
                  progress: res.progress,
                  plan: res.plan,
                  log: res.log,
                  error: res.error,
                  completedAt: res.completedAt,
                }
              : prev,
          );
          if (res.status === "done" || res.status === "failed") {
            if (pollerRef.current) {
              clearInterval(pollerRef.current);
              pollerRef.current = null;
            }
            refetchList();
            // Fetch result
            if (res.status === "done") {
              const result = await rpc<{ ok: boolean; result: ResearchJob["result"] }>(
                "republic.research.result",
                { jobId },
              );
              if (result.ok && result.result) {
                setActiveJob((prev) => (prev ? { ...prev, result: result.result } : prev));
              }
            }
          }
        }
      } catch {
        /* silent */
      }
    },
    [refetchList],
  );

  useEffect(() => {
    if (!activeJobId) {
      return;
    }
    pollActiveJob(activeJobId);
    pollerRef.current = setInterval(() => {
      void pollActiveJob(activeJobId);
    }, 3000);
    return () => {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
      }
    };
  }, [activeJobId, pollActiveJob]);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetchList} />;
  }
  const jobs: ResearchJob[] = listData?.jobs ?? [];

  async function startResearch() {
    if (!query.trim() || starting) {
      return;
    }
    setStarting(true);
    try {
      const res = await rpc<{ ok: boolean; jobId: string }>("republic.research.start", {
        query: query.trim(),
        format,
        depth,
        context: context.trim() || undefined,
        alsoMarkdown: format !== "md",
      });
      if (res.ok && res.jobId) {
        setActiveJobId(res.jobId);
        setActiveJob({
          id: res.jobId,
          query: query.trim(),
          format,
          depth,
          status: "queued",
          progress: {
            phase: "queued",
            phasePct: 0,
            totalSources: 0,
            extractedSources: 0,
            sectionsWritten: 0,
          },
          createdAt: new Date().toISOString(),
          log: [],
        });
        setQuery("");
        setContext("");
        refetchList();
      }
    } catch (e) {
      console.error("Research start failed", e);
    } finally {
      setStarting(false);
    }
  }

  async function openPreview(job: ResearchJob) {
    setPreviewJob(job);
    setPreviewContent(null);
    if (!job.result?.downloadUrl) {
      return;
    }
    // For md/html, fetch content from the gateway
    const ext =
      job.result.format === "md" || job.result.format === "html" ? job.result.format : "md";
    try {
      const gatewayBase = (window as { __GATEWAY_URL__?: string }).__GATEWAY_URL__ ?? "";
      const url = `${gatewayBase}${job.result.downloadUrl}${ext === "md" && job.result.markdownPath ? `/../${encodeURIComponent(job.result.markdownPath.split("\\").at(-1) ?? "")}` : ""}`;
      // NOTE: fetch() is intentional here — this retrieves a generated binary file (.md/.html)
      // from the gateway's static file server for preview rendering. There is no RPC equivalent
      // for raw file bytes; this is NOT a data RPC call.
      const resp = await fetch(url);
      if (resp.ok) {
        setPreviewContent(await resp.text());
      }
    } catch {
      /* show fallback */
    }
  }

  async function sendToWhatsApp(job: ResearchJob) {
    if (!job.result?.downloadUrl) {
      return;
    }
    setWaSending(true);
    setWaSendError(null);
    try {
      await rpc("channels.send", {
        platform: "WhatsApp",
        content: `📄 Research Complete: **${job.query}**\n\nYour ${job.result.format.toUpperCase()} document (${job.result.sizeKb} KB, ${job.result.pageCount} sections) is ready.\n\nDownload: ${window.location.origin}${job.result.downloadUrl}`,
        attachUrl: job.result.downloadUrl,
      });
    } catch (err) {
      setWaSendError(err instanceof Error ? err.message : "Failed to send via WhatsApp");
    }
    setWaSending(false);
  }

  async function sendFollowUp() {
    if (!followUpMsg.trim() || !previewJob || sendingFollowUp) {
      return;
    }
    setSendingFollowUp(true);
    setFollowUpError(null);
    const msg = `[Research follow-up on "${previewJob.query}"]: ${followUpMsg.trim()}`;
    try {
      await rpc("chat.send", { content: msg });
      setFollowUpMsg("");
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : "Failed to send follow-up");
    }
    setSendingFollowUp(false);
  }

  const donJobs = jobs.filter((j) => j.status === "done");
  const runJobs = jobs.filter((j) => !["done", "failed"].includes(j.status));
  const failJobs = jobs.filter((j) => j.status === "failed");

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {waSendError && <Alert variant="danger">{waSendError}</Alert>}
      {followUpError && <Alert variant="danger">{followUpError}</Alert>}
      <PageHeader
        title="Research Studio"
        description="Ask any question — a citizen team researches it and delivers a professional document"
        icon={<Search size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetchList}>
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Jobs" value={jobs.length} icon={<FileText size={16} />} />
        <StatCard label="Completed" value={donJobs.length} icon={<CheckCircle size={16} />} />
        <StatCard label="In Progress" value={runJobs.length} icon={<Loader2 size={16} />} />
        <StatCard label="Failed" value={failJobs.length} icon={<XCircle size={16} />} />
      </div>

      {/* Two-column layout: form + active job */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Form */}
        <Card className="space-y-5">
          <h3 className="font-semibold text-text-heading flex items-center gap-2">
            <Zap size={16} className="text-accent" /> New Research Request
          </h3>

          {/* Query */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Research Topic *</label>
            <textarea
              rows={3}
              placeholder="e.g. Latest trends in AI chip manufacturing and their impact on the global semiconductor market..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-bg-secondary border border-border/40 rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent/60 transition-colors"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  void startResearch();
                }
              }}
            />
          </div>

          {/* Format */}
          <div>
            <label className="text-xs text-text-muted mb-2 block">Output Format</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map((f) => (
                <button
                  type="button"
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${format === f.value ? "border-accent bg-accent/10 text-accent" : "border-border/30 text-text-muted hover:border-border/60"}`}
                >
                  <span>{f.emoji}</span> {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Depth */}
          <div>
            <label className="text-xs text-text-muted mb-2 block">Research Depth</label>
            <div className="flex gap-2">
              {DEPTH_OPTIONS.map((d) => (
                <button
                  type="button"
                  key={d.value}
                  onClick={() => setDepth(d.value)}
                  className={`flex-1 p-2 rounded-lg border text-xs font-medium transition-all ${depth === d.value ? "border-accent bg-accent/10 text-accent" : "border-border/30 text-text-muted hover:border-border/60"}`}
                >
                  <div>{d.label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Context */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Additional Context (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Focus on commercial applications, target audience: executives"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="w-full bg-bg-secondary border border-border/40 rounded-lg p-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={startResearch}
            disabled={!query.trim() || starting}
            icon={starting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          >
            {starting ? "Starting Research Team…" : "Start Research"}
          </Button>
          <p className="text-xs text-text-muted text-center">Ctrl+Enter to submit</p>
        </Card>

        {/* Active Job Pipeline */}
        <Card className="space-y-4">
          <h3 className="font-semibold text-text-heading flex items-center gap-2">
            <Loader2 size={16} className="text-accent animate-spin" /> Research Pipeline
          </h3>

          {activeJob ? (
            <div className="space-y-4">
              {/* Job header */}
              <div>
                <p className="text-sm font-medium text-text-heading truncate">{activeJob.query}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant={
                      activeJob.status === "done"
                        ? "success"
                        : activeJob.status === "failed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {STATUS_LABELS[activeJob.status]}
                  </Badge>
                  <span className="text-xs text-text-muted">
                    {activeJob.format.toUpperCase()} · {activeJob.depth}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-text-muted mb-1">
                  <span className={STATUS_COLOR[activeJob.status]}>
                    {STATUS_LABELS[activeJob.status]}
                  </span>
                  <span>{Math.round(progressPct(activeJob))}%</span>
                </div>
                <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-blue-500 transition-all duration-500"
                    style={{ width: `${progressPct(activeJob)}%` }}
                  />
                </div>
              </div>

              {/* Phase steps */}
              <div className="flex items-center gap-1 overflow-x-auto py-1">
                {STATUS_STEPS.map((step, i) => {
                  const idx = STATUS_STEPS.indexOf(activeJob.status);
                  const done = i < idx || activeJob.status === "done";
                  const active = i === idx && activeJob.status !== "done";
                  return (
                    <div key={step} className="flex items-center shrink-0">
                      <div
                        className={`text-xs px-2 py-0.5 rounded-full border ${done ? "border-success/50 text-success bg-success/10" : active ? "border-accent/50 text-accent bg-accent/10" : "border-border/30 text-text-muted"}`}
                      >
                        {STATUS_LABELS[step]}
                      </div>
                      {i < STATUS_STEPS.length - 1 && (
                        <ChevronRight size={12} className="text-text-muted mx-0.5" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Stats */}
              {activeJob.progress && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Sources Found", value: activeJob.progress.totalSources },
                    { label: "Extracted", value: activeJob.progress.extractedSources },
                    { label: "Sections", value: activeJob.progress.sectionsWritten },
                  ].map((s) => (
                    <div key={s.label} className="bg-bg-secondary rounded-lg p-2">
                      <p className="text-lg font-bold text-text-heading">{s.value}</p>
                      <p className="text-[10px] text-text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Plan sub-topics */}
              {activeJob.plan?.subTopics && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">Research Topics:</p>
                  {activeJob.plan.subTopics.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                      <div className="w-4 h-4 rounded-full bg-accent/20 flex items-center justify-center text-[9px] text-accent font-bold">
                        {i + 1}
                      </div>
                      <span className="truncate">{t}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Log tail */}
              {activeJob.log && activeJob.log.length > 0 && (
                <div className="bg-bg-secondary rounded-lg p-2.5 max-h-24 overflow-y-auto">
                  {activeJob.log.slice(-4).map((l, i) => (
                    <p key={i} className="text-xs text-text-muted font-mono truncate">
                      {l.split("] ")[1] ?? l}
                    </p>
                  ))}
                </div>
              )}

              {/* Done — download + preview */}
              {activeJob.status === "done" && activeJob.result && (
                <div className="flex gap-2 pt-2">
                  <a
                    href={activeJob.result.downloadUrl}
                    download
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-accent/20 hover:bg-accent/30 border border-accent/40 rounded-lg text-sm font-medium text-accent transition-all"
                  >
                    <Download size={14} /> Download {activeJob.result.format.toUpperCase()}
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Eye size={14} />}
                    onClick={() => openPreview(activeJob)}
                  >
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Globe size={14} />}
                    onClick={() => sendToWhatsApp(activeJob)}
                    disabled={waSending}
                  >
                    WhatsApp
                  </Button>
                </div>
              )}

              {activeJob.status === "failed" && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive">
                  {activeJob.error ?? "Research pipeline failed"}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-text-muted space-y-2">
              <Search size={32} className="opacity-30" />
              <p className="text-sm">No active research</p>
              <p className="text-xs">Start a research request to see the pipeline here</p>
            </div>
          )}
        </Card>
      </div>

      {/* Job History */}
      {jobs.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading flex items-center gap-2 mb-4">
            <Clock size={16} /> Research History
          </h3>
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/20 hover:border-border/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${job.status === "done" ? "bg-success" : job.status === "failed" ? "bg-destructive" : "bg-accent animate-pulse"}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-heading truncate max-w-xs">
                      {job.query}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-text-muted">
                        {job.format.toUpperCase()} · {job.depth}
                      </span>
                      <span className="text-xs text-text-muted">·</span>
                      <span className="text-xs text-text-muted">{formatAge(job.createdAt)}</span>
                      {job.result && (
                        <span className="text-xs text-text-muted">· {job.result.sizeKb} KB</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <Badge
                    variant={
                      job.status === "done"
                        ? "success"
                        : job.status === "failed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {STATUS_LABELS[job.status]}
                  </Badge>
                  {job.status === "done" && job.result && (
                    <>
                      <button
                        type="button"
                        onClick={() => openPreview(job)}
                        className="p-1.5 hover:bg-bg-primary rounded-md text-text-muted hover:text-text-primary transition-colors"
                        title="Preview"
                        aria-label={`Preview research: ${job.query}`}
                      >
                        <Eye size={14} />
                      </button>
                      <a
                        href={job.result.downloadUrl}
                        download
                        className="p-1.5 hover:bg-bg-primary rounded-md text-text-muted hover:text-accent transition-colors"
                        title="Download"
                        aria-label={`Download ${job.result.format.toUpperCase()} for: ${job.query}`}
                      >
                        <Download size={14} />
                      </a>
                      <button
                        type="button"
                        onClick={() => sendToWhatsApp(job)}
                        className="p-1.5 hover:bg-bg-primary rounded-md text-text-muted hover:text-green-400 transition-colors"
                        title="Send via WhatsApp"
                        aria-label={`Send via WhatsApp: ${job.query}`}
                      >
                        <Globe size={14} />
                      </button>
                    </>
                  )}
                  {!["done", "failed"].includes(job.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveJobId(job.id);
                        setActiveJob(job);
                      }}
                      className="p-1.5 hover:bg-bg-primary rounded-md text-accent transition-colors"
                      title="Watch progress"
                      aria-label={`Watch progress for: ${job.query}`}
                    >
                      <Eye size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Preview Modal */}
      {previewJob && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg-primary border border-border/40 rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/20">
              <div className="min-w-0">
                <p className="font-semibold text-text-heading truncate">
                  {previewJob.plan?.title ?? previewJob.query}
                </p>
                <p className="text-xs text-text-muted">
                  {previewJob.result?.format.toUpperCase()} · {previewJob.result?.sizeKb} KB ·{" "}
                  {previewJob.result?.pageCount} sections
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {previewJob.result && (
                  <>
                    <a
                      href={previewJob.result.downloadUrl}
                      download
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/20 hover:bg-accent/30 border border-accent/40 rounded-lg text-xs font-medium text-accent transition-all"
                    >
                      <Download size={12} /> Download
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Globe size={13} />}
                      onClick={() => sendToWhatsApp(previewJob)}
                      disabled={waSending}
                    >
                      WhatsApp
                    </Button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewJob(null)}
                  className="p-1.5 hover:bg-bg-secondary rounded-lg text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto p-6">
                {previewContent ? (
                  previewJob.result?.format === "html" ? (
                    <iframe
                      srcDoc={previewContent}
                      className="w-full h-full border-0 rounded-lg"
                      sandbox="allow-same-origin"
                      title="Research Preview"
                    />
                  ) : (
                    /* Markdown rendered as pre-formatted text (no external dep) */
                    <div className="prose prose-invert max-w-none">
                      <pre className="text-sm text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                        {previewContent}
                      </pre>
                    </div>
                  )
                ) : previewJob.plan ? (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-text-heading">
                        {previewJob.plan.title}
                      </h2>
                      <p className="text-text-secondary mt-2 text-sm leading-relaxed">
                        {previewJob.plan.executiveSummary}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text-muted mb-2">
                        Research Topics Covered
                      </h3>
                      <div className="space-y-2">
                        {previewJob.plan.subTopics.map((t, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-2 bg-bg-secondary rounded-lg"
                          >
                            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] text-accent font-bold shrink-0">
                              {i + 1}
                            </div>
                            <span className="text-sm text-text-secondary">{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-center text-text-muted text-sm py-6">
                      {previewJob.result?.format === "md" || previewJob.result?.format === "html"
                        ? "Loading preview..."
                        : `Full preview available after download (${previewJob.result?.format?.toUpperCase()} format).`}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={32} className="text-accent animate-spin" />
                  </div>
                )}
              </div>

              {/* Follow-up chat */}
              <div className="border-t border-border/20 p-4">
                <p className="text-xs text-text-muted mb-2">
                  💬 Request changes or ask for more detail:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Add more detail to the conclusions section, or research the European market more..."
                    value={followUpMsg}
                    onChange={(e) => setFollowUpMsg(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void sendFollowUp();
                      }
                    }}
                    className="flex-1 bg-bg-secondary border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={sendFollowUp}
                    disabled={!followUpMsg.trim() || sendingFollowUp}
                    icon={
                      sendingFollowUp ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )
                    }
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
