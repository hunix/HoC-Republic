import {
  Workflow, Play, Trash2, RefreshCw, Plus, Clock, CheckCircle,
  ExternalLink, Pause, Zap, LayoutTemplate, Eye, Terminal, Power,
  GitBranch, AlertTriangle,
} from "lucide-react";
import { useState, useCallback } from "react";
import {
  PageHeader, Card, Badge, Button, StatCard, Alert, Tabs, RpcStatus, EmptyState,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useRpc, rpc, mutateRpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

type N8nWorkflowInfo = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nodes: number;
};

type N8nExecution = {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
  mode: string;
};

type N8nTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
};

type StatusData = {
  available: boolean;
  url?: string;
  version?: string;
  workflows: N8nWorkflowInfo[];
  stats: {
    totalWorkflows: number;
    activeWorkflows: number;
    recentExecutions: number;
    successRate: number;
  };
  orchestrator: {
    seedComplete: boolean;
    seededCount: number;
    templateCount: number;
    availableCategories: string[];
  };
};

type ExecutionsData = { executions: N8nExecution[] };
type TemplatesData = { templates: N8nTemplate[]; seededCount: number };
type IframeData = { url: string | null; available: boolean; version?: string };

// ─── Component ──────────────────────────────────────────────────

export function N8NPage() {
  const {
    data: status,
    loading,
    error,
    refetch: refetchStatus,
  } = useRpc<StatusData>("republic.n8n.status", {}, [], {
    staleTimeMs: 10_000,
    refetchIntervalMs: 15_000,
  });

  const { data: execData, refetch: refetchExec } = useRpc<ExecutionsData>(
    "republic.n8n.executions.list",
    { limit: 30 },
    [],
    { staleTimeMs: 8_000, refetchIntervalMs: 10_000 },
  );

  const { data: templatesData, refetch: refetchTemplates } = useRpc<TemplatesData>(
    "republic.n8n.templates.list",
    {},
    [],
    { staleTimeMs: 60_000 },
  );

  const { data: iframeData } = useRpc<IframeData>(
    "republic.n8n.iframe-url",
    {},
    [],
    { staleTimeMs: 30_000 },
  );

  const [activeTab, setActiveTab] = useState("dashboard");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deployingTemplate, setDeployingTemplate] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const refetch = useCallback(() => {
    refetchStatus();
    refetchExec();
    refetchTemplates();
  }, [refetchStatus, refetchExec, refetchTemplates]);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const available = status?.available ?? false;
  const workflows = status?.workflows ?? [];
  const executions = execData?.executions ?? [];
  const templates = templatesData?.templates ?? [];
  const running = executions.filter((e) => e.status === "running").length;

  const statusVariant = (s: string) =>
    s === "success" ? "success" : s === "error" ? "danger" : s === "running" ? "info" : "warning";

  const categoryIcon = (cat: string): string => {
    const map: Record<string, string> = {
      "full-stack-app": "🚀", "media-production": "🎬", "music-production": "🎵",
      "document-generation": "📄", "3d-production": "🎮", "research-analysis": "🔬",
      "qa-debugging": "🐛", "story-writing": "✍️", "graphics-design": "🎨",
      "devops-deploy": "⚙️", "data-pipeline": "📊", "multi-agent-collab": "🤝",
    };
    return map[cat] ?? "📦";
  };

  async function createWorkflow() {
    if (!newName.trim()) { return; }
    setCreating(true);
    setActionError("");
    try {
      await mutateRpc("republic.n8n.workflows.create", { name: newName.trim() });
      setNewName("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function deleteWorkflow(id: string) {
    setConfirmDelete(null);
    try {
      await mutateRpc("republic.n8n.workflows.delete", { id });
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleWorkflow(id: string, active: boolean) {
    try {
      await mutateRpc("republic.n8n.workflows.toggle", { id, active });
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function triggerWorkflow(id: string) {
    try {
      await rpc("republic.n8n.workflows.trigger", { id });
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deployTemplate(templateId: string) {
    setDeployingTemplate(templateId);
    try {
      await mutateRpc("republic.n8n.templates.deploy", { templateId });
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeployingTemplate(null);
    }
  }

  async function deployAllTemplates() {
    setDeployingTemplate("all");
    try {
      await mutateRpc("republic.n8n.templates.deploy", { all: true });
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeployingTemplate(null);
    }
  }

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <Workflow size={14} /> },
    { id: "workflows", label: "Workflows", icon: <GitBranch size={14} /> },
    { id: "templates", label: "Templates", icon: <LayoutTemplate size={14} /> },
    { id: "executions", label: "Executions", icon: <Clock size={14} /> },
    { id: "editor", label: "n8n Editor", icon: <ExternalLink size={14} /> },
  ];

  return (
    <>
      <div className="p-6 space-y-6 animate-fade-in">
        <PageHeader
          title="n8n Workflow Orchestration"
          description="Production-grade workflow automation — 12 built-in templates, AI agents, visual editor"
          icon={<Workflow size={28} />}
          actions={
            <div className="flex gap-2">
              {available && iframeData?.url && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<ExternalLink size={14} />}
                  onClick={() => window.open(iframeData.url ?? "", "_blank")}
                >
                  Open n8n
                </Button>
              )}
              <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
                Refresh
              </Button>
            </div>
          }
        />

        {!available && (
          <Alert variant="warning">
            <span className="flex items-center gap-2">
              <AlertTriangle size={16} />
              n8n is not available. Start it with <code className="bg-bg-input px-1 rounded">docker compose up -d n8n</code> or configure <code className="bg-bg-input px-1 rounded">N8N_BASE_URL / N8N_API_KEY</code> in .env
            </span>
          </Alert>
        )}

        {actionError && <Alert variant="danger">{actionError}</Alert>}

        <Tabs
          tabs={tabs}
          active={activeTab}
          onChange={setActiveTab}
        />

        {/* ─── Dashboard Tab ───────────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Workflows"
                value={status?.stats.totalWorkflows ?? 0}
                icon={<Workflow size={16} />}
              />
              <StatCard
                label="Active"
                value={status?.stats.activeWorkflows ?? 0}
                icon={<Play size={16} />}
              />
              <StatCard
                label="Executions"
                value={status?.stats.recentExecutions ?? 0}
                icon={<Clock size={16} />}
              />
              <StatCard
                label="Success Rate"
                value={status?.stats.successRate != null ? `${status.stats.successRate}%` : "—"}
                icon={<CheckCircle size={16} />}
              />
            </div>

            {/* Orchestrator Status */}
            <Card>
              <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
                <Zap size={16} /> Orchestrator Engine
              </h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-text-muted">Templates</p>
                  <p className="text-text-primary font-medium">{status?.orchestrator.templateCount ?? 12}</p>
                </div>
                <div>
                  <p className="text-text-muted">Deployed</p>
                  <p className="text-text-primary font-medium">{status?.orchestrator.seededCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-text-muted">Status</p>
                  <Badge variant={status?.orchestrator.seedComplete ? "success" : "warning"}>
                    {status?.orchestrator.seedComplete ? "Ready" : "Pending"}
                  </Badge>
                </div>
              </div>
              {(status?.orchestrator.seededCount ?? 0) === 0 && (
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={() => void deployAllTemplates()}
                    loading={deployingTemplate === "all"}
                  >
                    Deploy All Templates to n8n
                  </Button>
                </div>
              )}
            </Card>

            {/* Connection Info */}
            {available && (
              <Card>
                <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
                  <Power size={16} /> Connection
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-text-muted">URL</p>
                    <p className="text-text-primary font-mono text-xs">{status?.url}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Version</p>
                    <p className="text-text-primary">{status?.version ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Status</p>
                    <Badge variant="success">Connected</Badge>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ─── Workflows Tab ───────────────────────────────────── */}
        {activeTab === "workflows" && (
          <div className="space-y-6">
            {/* Create Workflow */}
            <Card>
              <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
                <Plus size={16} /> New Workflow
              </h3>
              <div className="flex gap-3">
                <input
                  className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
                  placeholder="Workflow name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createWorkflow()}
                />
                <Button onClick={() => void createWorkflow()} loading={creating} disabled={!newName.trim()}>
                  Create
                </Button>
              </div>
            </Card>

            {/* Workflow List */}
            {workflows.length === 0 ? (
              <EmptyState
                icon={<Workflow size={48} />}
                title="No Workflows"
                description="Create a workflow manually or deploy templates"
              />
            ) : (
              <div className="space-y-2">
                {workflows.map((wf) => (
                  <Card key={wf.id} hover className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          wf.active ? "bg-success" : "bg-text-muted"
                        }`}
                      />
                      <div>
                        <p className="text-text-heading font-medium text-sm">{wf.name}</p>
                        <p className="text-xs text-text-muted">
                          {wf.nodes} nodes · Updated {new Date(wf.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={wf.active ? "success" : "neutral"}>
                        {wf.active ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={wf.active ? <Pause size={12} /> : <Play size={12} />}
                        onClick={() => void toggleWorkflow(wf.id, !wf.active)}
                        aria-label={wf.active ? "Pause workflow" : "Activate workflow"}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Zap size={12} />}
                        onClick={() => void triggerWorkflow(wf.id)}
                        aria-label="Trigger workflow"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={12} />}
                        onClick={() => setConfirmDelete(wf.id)}
                        aria-label="Delete workflow"
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Templates Tab ──────────────────────────────────── */}
        {activeTab === "templates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">
                {templates.length} pre-built workflow templates · {templatesData?.seededCount ?? 0} deployed
              </p>
              <Button
                size="sm"
                variant="primary"
                icon={<Plus size={14} />}
                onClick={() => void deployAllTemplates()}
                loading={deployingTemplate === "all"}
              >
                Deploy All
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((t) => (
                <Card key={t.id} hover>
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl">{categoryIcon(t.category)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-text-heading font-semibold text-sm truncate">{t.name}</p>
                      <p className="text-xs text-text-muted mt-1 line-clamp-2">{t.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {t.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-bg-secondary rounded text-xs text-text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Plus size={12} />}
                    onClick={() => void deployTemplate(t.id)}
                    loading={deployingTemplate === t.id}
                    className="w-full"
                  >
                    Deploy to n8n
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ─── Executions Tab ─────────────────────────────────── */}
        {activeTab === "executions" && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-heading flex items-center gap-2">
                <Clock size={16} /> Recent Executions
                {running > 0 && (
                  <Badge variant="info" className="animate-pulse">
                    {running} running
                  </Badge>
                )}
              </h3>
            </div>
            {executions.length === 0 ? (
              <EmptyState
                icon={<Terminal size={32} />}
                title="No Executions"
                description="Trigger a workflow to see execution history"
              />
            ) : (
              <div className="space-y-2">
                {executions.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {e.status === "running" && (
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-text-heading font-medium">
                          {e.workflowId?.slice(0, 12) ?? e.id.slice(0, 12)}
                        </p>
                        <p className="text-xs text-text-muted">
                          {new Date(e.startedAt).toLocaleString()}
                          {e.stoppedAt && ` → ${new Date(e.stoppedAt).toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                      <Badge variant="neutral">{e.mode}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Eye size={12} />}
                        aria-label="View execution details"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* ─── Editor Tab ─────────────────────────────────────── */}
        {activeTab === "editor" && (
          <div className="space-y-4">
            {iframeData?.available && iframeData.url ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-secondary">
                    n8n Editor {iframeData.version ? `v${iframeData.version}` : ""}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={showEditor ? <Eye size={14} /> : <ExternalLink size={14} />}
                      onClick={() => setShowEditor(!showEditor)}
                    >
                      {showEditor ? "Hide Embed" : "Show Embed"}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<ExternalLink size={14} />}
                      onClick={() => window.open(iframeData.url ?? "", "_blank")}
                    >
                      Open in New Tab
                    </Button>
                  </div>
                </div>
                {showEditor && (
                  <div className="rounded-xl overflow-hidden border border-border" style={{ height: "75vh" }}>
                    <iframe
                      src={iframeData.url}
                      className="w-full h-full"
                      title="n8n Workflow Editor"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    />
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={<ExternalLink size={48} />}
                title="n8n Not Available"
                description="Start the n8n service to access the visual workflow editor"
                action={
                  <Button variant="primary" size="sm" onClick={refetch}>
                    Check Again
                  </Button>
                }
              />
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete Workflow?"
        message="This will permanently delete this workflow from n8n. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && void deleteWorkflow(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
