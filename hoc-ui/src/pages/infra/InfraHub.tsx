/**
 * InfraHub — One-Click Infrastructure Management
 *
 * Premium dashboard for deploying and monitoring all critical
 * HoC infrastructure services: databases, sandboxes, AI runtimes,
 * security environments, and automation tools.
 */

import {
  Database,
  Server,
  Shield,
  Bot,
  Zap,
  HardDrive,
  FlaskConical,
  Globe,
  Image as ImageIcon,
  Terminal,
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Rocket,
} from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Alert,
  RpcStatus,
  Tabs,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────────

interface InfraService {
  key: string;
  name: string;
  preset: string;
  port?: number;
  uiPort?: number;
  uiPath?: string;
  description: string;
  category: string;
  essential: boolean;
  status: "running" | "stopped" | "missing" | "docker-unavailable";
  containerId: string | null;
  image: string | null;
}

interface InfraStatus {
  ok: boolean;
  dockerAvailable: boolean;
  totalServices: number;
  running: number;
  essentialRunning: number;
  essentialTotal: number;
  services: InfraService[];
}

// ─── Category Config ──────────────────────────────────────────────

const CATEGORIES: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  infra: {
    label: "Databases & Core",
    icon: <Database size={14} />,
    color: "text-info",
  },
  storage: {
    label: "Storage",
    icon: <HardDrive size={14} />,
    color: "text-purple",
  },
  ml: {
    label: "AI / ML",
    icon: <FlaskConical size={14} />,
    color: "text-accent",
  },
  research: {
    label: "Research",
    icon: <Globe size={14} />,
    color: "text-info",
  },
  creative: {
    label: "Creative (GPU)",
    icon: <ImageIcon size={14} />,
    color: "text-warning",
  },
  agents: {
    label: "Agent Sandboxes",
    icon: <Bot size={14} />,
    color: "text-success",
  },
  automation: {
    label: "Automation",
    icon: <Zap size={14} />,
    color: "text-accent",
  },
  security: {
    label: "Security",
    icon: <Shield size={14} />,
    color: "text-danger",
  },
};

// ─── Status Badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        <span className="text-xs font-medium text-success">Running</span>
      </div>
    );
  }
  if (status === "stopped") {
    return (
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={12} className="text-warning" />
        <span className="text-xs font-medium text-warning">Stopped</span>
      </div>
    );
  }
  if (status === "docker-unavailable") {
    return (
      <div className="flex items-center gap-1.5">
        <Circle size={12} className="text-text-muted" />
        <span className="text-xs text-text-muted">Docker unavailable</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Circle size={12} className="text-text-muted" />
      <span className="text-xs text-text-muted">Not deployed</span>
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────

function ServiceCard({
  service,
  onRefetch,
}: {
  service: InfraService;
  onRefetch: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function callRpc(method: string, payload?: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await rpc(method, payload ?? {});
      setSuccess(method.includes("stop") ? "Service stopped" : "Service deployed");
      setTimeout(() => {
        setSuccess(null);
        onRefetch();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  }

  const isRunning = service.status === "running";
  const isStopped = service.status === "stopped";
  const isDockerDown = service.status === "docker-unavailable";

  const cardBorder = isRunning
    ? "border-success/30"
    : isStopped
      ? "border-warning/30"
      : "border-border";

  const openUrl = service.uiPort
    ? `http://localhost:${service.uiPort}${service.uiPath ?? "/"}`
    : null;

  return (
    <Card className={`space-y-3 ${cardBorder} transition-colors duration-300`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-text-heading truncate">
              {service.key}
            </p>
            {service.essential && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium uppercase tracking-wide">
                Essential
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            {service.description}
          </p>
          {service.port && (
            <p className="text-[10px] font-mono text-text-muted mt-1">
              :{service.port}
            </p>
          )}
        </div>
        <StatusBadge status={service.status} />
      </div>

      {/* Error / Success */}
      {error && (
        <p className="text-xs text-danger bg-danger-bg rounded-lg px-2 py-1">{error}</p>
      )}
      {success && (
        <p className="text-xs text-success bg-success-bg rounded-lg px-2 py-1">
          <CheckCircle2 size={10} className="inline mr-1" />
          {success}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {!isRunning && !isDockerDown && (
          <Button
            size="sm"
            variant={isStopped ? "warning" : "primary"}
            icon={
              loading ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Play size={11} />
              )
            }
            disabled={loading}
            onClick={() => {
              void callRpc(`republic.infra.ensure.${service.key}`);
            }}
          >
            {loading ? "Deploying…" : isStopped ? "Restart" : "Deploy"}
          </Button>
        )}
        {isRunning && (
          <Button
            size="sm"
            variant="danger"
            icon={
              loading ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Square size={11} />
              )
            }
            disabled={loading}
            onClick={() => {
              void callRpc("republic.infra.stop", { service: service.key });
            }}
          >
            {loading ? "Stopping…" : "Stop"}
          </Button>
        )}
        {(isRunning || isStopped) && (
          <Button
            size="sm"
            variant="ghost"
            icon={
              loading ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <RefreshCw size={11} />
              )
            }
            disabled={loading}
            onClick={() => {
              void callRpc("republic.infra.restart", { service: service.key });
            }}
            aria-label="Restart service"
          />
        )}
        {openUrl && isRunning && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto"
          >
            <Button
              size="sm"
              variant="ghost"
              icon={<ExternalLink size={11} />}
              aria-label={`Open ${service.key} UI`}
            />
          </a>
        )}
      </div>
    </Card>
  );
}

// ─── Log Drawer ───────────────────────────────────────────────────

function LogDrawer({
  service,
  onClose,
}: {
  service: string;
  onClose: () => void;
}) {
  const { data, loading, error, refetch } = useRpc<{
    ok: boolean;
    logs: string;
  }>("republic.infra.logs", { service, lines: 300 }, [service]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-accent" />
            <span className="font-semibold text-sm text-text-heading">
              {service} — Container Logs
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={refetch} aria-label="Refresh logs" />
            <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={onClose} aria-label="Close logs" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-bg-primary">
          {loading && (
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <Loader2 size={12} className="animate-spin" /> Loading logs…
            </div>
          )}
          {error && (
            <p className="text-danger text-xs">{String(error)}</p>
          )}
          {data?.logs && (
            <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
              {data.logs}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────

export function InfraHubPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<string | null>(null);
  const [logService, setLogService] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const {
    data,
    loading,
    error,
    refetch,
  } = useRpc<InfraStatus>(
    "republic.infra.status",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 15_000 },
  );

  // All hooks must be declared before any conditional returns (React rule #310)
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const services = data?.services ?? [];
  const dockerAvailable = data?.dockerAvailable ?? false;

  // Filter by tab
  const filtered =
    activeTab === "all"
      ? services
      : services.filter((s) => s.category === activeTab);

  // Group by category
  const byCategory: Record<string, InfraService[]> = {};
  for (const svc of filtered) {
    (byCategory[svc.category] ??= []).push(svc);
  }

  const runningCount = data?.running ?? 0;
  const totalCount = data?.totalServices ?? 0;
  const essentialOk = data?.essentialRunning ?? 0;
  const essentialTotal = data?.essentialTotal ?? 0;

  async function deployAll() {
    setDeploying(true);
    setDeployResult(null);
    try {
      const result = await rpc("republic.infra.ensure.all", {}) as {
        ok: boolean;
        results?: Record<string, { ok: boolean; status: string }>;
      };
      const succeeded = Object.values(result.results ?? {}).filter((r) => r.ok).length;
      const total = Object.keys(result.results ?? {}).length;
      setDeployResult(`✅ Deployed ${succeeded}/${total} essential services`);
      setTimeout(() => {
        setDeployResult(null);
        void refetch();
      }, 4000);
    } catch (err) {
      setDeployResult(`❌ ${err instanceof Error ? err.message : "Deployment failed"}`);
    } finally {
      setDeploying(false);
    }
  }

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  const tabs = [
    { id: "all", label: "All Services", count: services.length },
    ...Object.entries(CATEGORIES)
      .filter(([cat]) => services.some((s) => s.category === cat))
      .map(([cat, cfg]) => ({
        id: cat,
        label: cfg.label,
        count: services.filter((s) => s.category === cat).length,
      })),
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {logService && (
        <LogDrawer service={logService} onClose={() => { setLogService(null); }} />
      )}

      <PageHeader
        title="Infrastructure Hub"
        description="One-click deploy and manage all critical HoC containers"
        icon={<Server size={28} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => { void refetch(); }}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={
                deploying ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Rocket size={14} />
                )
              }
              disabled={deploying || !dockerAvailable}
              onClick={() => { void deployAll(); }}
            >
              {deploying ? "Deploying…" : "Deploy All Essential"}
            </Button>
          </div>
        }
      />

      {/* Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Running",
            value: runningCount,
            total: totalCount,
            color: runningCount > 0 ? "text-success" : "text-text-muted",
          },
          {
            label: "Essential",
            value: essentialOk,
            total: essentialTotal,
            color: essentialOk === essentialTotal ? "text-success" : "text-warning",
          },
          {
            label: "Stopped",
            value: services.filter((s) => s.status === "stopped").length,
            total: null,
            color: "text-warning",
          },
          {
            label: "Not Deployed",
            value: services.filter((s) => s.status === "missing").length,
            total: null,
            color: "text-text-muted",
          },
        ].map((stat) => (
          <Card key={stat.label} className="text-center py-3">
            <p className={`text-2xl font-bold ${stat.color}`}>
              {stat.value}
              {stat.total !== null && (
                <span className="text-base text-text-muted">/{stat.total}</span>
              )}
            </p>
            <p className="text-xs text-text-muted mt-1">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* Docker warning */}
      {!dockerAvailable && (
        <Alert variant="warning">
          Docker is not available on this machine. Start Docker Desktop and reload to enable
          container management.
        </Alert>
      )}

      {/* Deploy result */}
      {deployResult && (
        <Alert variant={deployResult.startsWith("✅") ? "success" : "danger"}>
          {deployResult}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Service Grid by Category */}
      <div className="space-y-6">
        {Object.entries(byCategory).map(([cat, svcs]) => {
          const cfg = CATEGORIES[cat];
          const isExpanded = expandedCategories[cat] !== false; // default open
          const runningInCat = svcs.filter((s) => s.status === "running").length;

          return (
            <div key={cat}>
              {/* Category Header */}
              <button
                className="w-full flex items-center gap-3 mb-3 group"
                onClick={() => { toggleCategory(cat); }}
              >
                <span className={`${cfg?.color ?? "text-text-muted"} group-hover:opacity-80`}>
                  {cfg?.icon}
                </span>
                <span className="text-sm font-semibold text-text-heading group-hover:text-accent transition-colors">
                  {cfg?.label ?? cat}
                </span>
                <Badge variant={runningInCat > 0 ? "success" : "neutral"}>
                  {runningInCat}/{svcs.length}
                </Badge>
                <div className="flex-1 h-px bg-border" />
                {isExpanded ? (
                  <ChevronUp size={14} className="text-text-muted" />
                ) : (
                  <ChevronDown size={14} className="text-text-muted" />
                )}
              </button>

              {isExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {svcs.map((svc) => (
                    <div key={svc.key} className="relative group/card">
                      <ServiceCard service={svc} onRefetch={() => { void refetch(); }} />
                      {/* Log button */}
                      {(svc.status === "running" || svc.status === "stopped") && (
                        <button
                          className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity text-text-muted hover:text-accent"
                          onClick={() => { setLogService(svc.key); }}
                          aria-label={`View ${svc.key} logs`}
                        >
                          <Terminal size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-text-muted text-sm">
          No services in this category.
        </div>
      )}
    </div>
  );
}
