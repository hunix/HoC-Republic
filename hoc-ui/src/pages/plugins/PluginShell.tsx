/**
 * PluginShell — Shared wrapper for every plugin panel in any studio.
 *
 * Provides 4 tabs:
 *   1. Generate   – main generation controls (rendered by caller via `children`)
 *   2. Models     – download / delete models for this plugin
 *   3. Jobs       – live job queue + history / cancel
 *   4. Logs       – usage log (requests, params, timestamps)
 */

import {
  Download,
  Trash2,
  RefreshCw,
  StopCircle,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  HardDrive,
  Cpu,
  Activity,
  Settings,
  Package,
  Monitor,
  Save,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, Button, Badge } from "@/components/ui";
import { rpc, useRpc } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────────

export interface PluginModel {
  id: string;
  name: string;
  sizeGb: number;
  description?: string;
  downloaded: boolean;
  required?: boolean;
}

export interface PluginJobEntry {
  id: string;
  method: string;
  params: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: number;
  completedAt?: number;
  error?: string;
  outputPath?: string;
}

export interface PluginUsageEntry {
  ts: number;
  method: string;
  durationMs?: number;
  success: boolean;
}

// ─── Model Manager ────────────────────────────────────────────────

function ModelManager({ pluginId, models }: { pluginId: string; models: PluginModel[] }) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [states, setStates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(models.map((m) => [m.id, m.downloaded])),
  );
  const [hfChecked, setHfChecked] = useState(false);

  // Check HuggingFace cache on mount to detect already-downloaded models
  const { data: hfData } = useRpc<{ models?: string[]; hubDir?: string }>("system.hf.models", {});

  useEffect(() => {
    if (!hfData?.models || hfChecked) {
      return;
    }
    const hfModels = hfData.models.map((m) => m.toLowerCase());
    setStates((prev) => {
      const next = { ...prev };
      for (const m of models) {
        // Match by: org/repo substring in model ID, or model name keywords
        const idLower = m.id.toLowerCase();
        const nameLower = m.name.toLowerCase();
        const matched = hfModels.some((hm) => {
          const orgRepo = hm.replace(/[/\\]/g, "-");
          return (
            idLower.includes(orgRepo.split("/").pop() ?? "") ||
            nameLower.split(" ").some((word) => word.length > 3 && hm.includes(word))
          );
        });
        if (matched) {
          next[m.id] = true;
        }
      }
      return next;
    });
    setHfChecked(true);
  }, [hfData, models, hfChecked]);

  async function download(model: PluginModel) {
    setBusy((b) => ({ ...b, [model.id]: true }));
    try {
      await rpc("republic.plugins.call-gateway", {
        method: `${pluginId}.model-download`,
        params: { modelId: model.id },
      });
      setStates((s) => ({ ...s, [model.id]: true }));
    } catch {
      // Silently fail – error shown via status
    } finally {
      setBusy((b) => ({ ...b, [model.id]: false }));
    }
  }

  async function remove(model: PluginModel) {
    if (!confirm(`Delete model "${model.name}"? This cannot be undone.`)) {
      return;
    }
    setBusy((b) => ({ ...b, [model.id]: true }));
    try {
      await rpc("republic.plugins.call-gateway", {
        method: `${pluginId}.model-delete`,
        params: { modelId: model.id },
      });
      setStates((s) => ({ ...s, [model.id]: false }));
    } catch {
      // ignore
    } finally {
      setBusy((b) => ({ ...b, [model.id]: false }));
    }
  }

  // Show HF cache directory hint
  const hubDir = hfData?.hubDir;

  if (models.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted text-sm">
        No model configuration available for this plugin.
      </div>
    );
  }

  const allDownloaded = models.filter((m) => m.required).every((m) => states[m.id]);

  return (
    <div className="space-y-3">
      {hubDir && (
        <div className="flex items-center gap-2 text-[11px] text-text-muted px-1">
          <HardDrive size={10} />
          <span>
            HF cache: <code className="font-mono">{hubDir}</code>
          </span>
        </div>
      )}
      {allDownloaded && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-success text-xs">
          <CheckCircle size={13} />
          All required models detected in HuggingFace cache — ready to use.
        </div>
      )}
      {models.map((m) => {
        const downloaded = states[m.id] ?? m.downloaded;
        const loading = busy[m.id] ?? false;
        return (
          <Card key={m.id} className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-text-heading truncate">{m.name}</span>
                {m.required && <Badge variant="warning">required</Badge>}
                {downloaded ? (
                  <Badge variant="success">✓ Downloaded</Badge>
                ) : (
                  <Badge variant="neutral">Not downloaded</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-text-muted">
                <span className="flex items-center gap-1">
                  <HardDrive size={9} /> {m.sizeGb} GB
                </span>
                {m.description && <span>{m.description}</span>}
              </div>
            </div>
            {downloaded ? (
              <Button
                size="sm"
                variant="danger"
                loading={loading}
                icon={<Trash2 size={12} />}
                onClick={() => void remove(m)}
              >
                Delete
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                loading={loading}
                icon={<Download size={12} />}
                onClick={() => void download(m)}
              >
                Download
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Job Monitor ─────────────────────────────────────────────────

function JobMonitor({ pluginId }: { pluginId: string }) {
  const { data, loading, refetch } = useRpc<{ jobs?: PluginJobEntry[] }>(
    "republic.plugins.call-gateway",
    { method: `${pluginId}.queue-status`, params: {} },
    [],
  );
  const jobs: PluginJobEntry[] = data?.jobs ?? [];

  async function cancel(jobId: string) {
    await rpc("republic.plugins.call-gateway", { method: `${pluginId}.cancel`, params: { jobId } });
    refetch();
  }

  const statusIcon = (s: string) =>
    s === "running" ? (
      <Loader2 size={12} className="animate-spin text-accent" />
    ) : s === "completed" ? (
      <CheckCircle size={12} className="text-success" />
    ) : s === "failed" ? (
      <AlertCircle size={12} className="text-danger" />
    ) : s === "cancelled" ? (
      <StopCircle size={12} className="text-text-muted" />
    ) : (
      <Clock size={12} className="text-warning" />
    );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm py-8 justify-center">
        <Loader2 size={14} className="animate-spin" /> Loading jobs...
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted text-sm">
        No jobs yet. Generate something to see it here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={refetch}>
          Refresh
        </Button>
      </div>
      {jobs.map((job) => {
        const dur =
          job.startedAt && job.completedAt
            ? `${((job.completedAt - job.startedAt) / 1000).toFixed(1)}s`
            : undefined;
        return (
          <Card key={job.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {statusIcon(job.status)}
                <code className="text-xs text-accent font-mono">{job.method}</code>
                <Badge
                  variant={
                    job.status === "completed"
                      ? "success"
                      : job.status === "failed"
                        ? "danger"
                        : job.status === "running"
                          ? "info"
                          : "neutral"
                  }
                >
                  {job.status}
                </Badge>
                {dur && <span className="text-[10px] text-text-muted">{dur}</span>}
              </div>
              {(job.status === "running" || job.status === "queued") && (
                <button
type="button"                   onClick={() => void cancel(job.id)}
                  className="text-xs text-danger hover:underline"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="bg-bg-input rounded-lg px-3 py-2 text-[11px] font-mono text-text-muted overflow-auto max-h-14">
              {JSON.stringify(job.params)}
            </div>
            {job.error && <p className="text-xs text-danger">{job.error}</p>}
            {job.outputPath && (
              <a
                href={`/republic-output/${job.outputPath}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent hover:underline"
              >
                ↗ View output
              </a>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Usage Log ────────────────────────────────────────────────────

function UsageLog({ entries }: { entries: PluginUsageEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  if (entries.length === 0) {
    return <div className="text-center py-12 text-text-muted text-sm">No usage recorded yet.</div>;
  }

  return (
    <div ref={ref} className="space-y-1 max-h-[500px] overflow-y-auto">
      {entries.map((e, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-bg-secondary text-xs font-mono"
        >
          <span className="text-text-muted/60 shrink-0 w-20 text-right">
            {new Date(e.ts).toLocaleTimeString()}
          </span>
          <span className={e.success ? "text-success" : "text-danger"}>
            {e.success ? "✓" : "✗"}
          </span>
          <span className="text-accent">{e.method}</span>
          {e.durationMs !== undefined && (
            <span className="text-text-muted">{(e.durationMs / 1000).toFixed(2)}s</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Plugin Status Banner ─────────────────────────────────────────

function PluginStatusBanner({ pluginId }: { pluginId: string }) {
  const { data } = useRpc<{ running?: number; queued?: number; status?: string }>(
    "republic.plugins.call-gateway",
    { method: `${pluginId}.queue-status`, params: {} },
    [],
  );

  const running = data?.running ?? 0;
  const queued = data?.queued ?? 0;
  const ok = data?.status !== "error";

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-bg-secondary border border-border/30 text-xs text-text-secondary">
      <span className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${ok ? "bg-success" : "bg-danger"} animate-pulse`} />
        {ok ? "Online" : "Offline"}
      </span>
      <span className="flex items-center gap-1">
        <Activity size={10} /> {running} running
      </span>
      <span className="flex items-center gap-1">
        <Clock size={10} /> {queued} queued
      </span>
      <span className="flex items-center gap-1">
        <Cpu size={10} /> GPU required
      </span>
    </div>
  );
}

// ─── Requirements Panel (Setup Tab) ───────────────────────────────

interface RequirementsCheck {
  binaries: { name: string; available: boolean; path?: string }[];
  pythonDeps: { name: string; importable: boolean }[];
  gpuVram: { required: number; available: number; sufficient: boolean } | null;
  overallReady: boolean;
}

function RequirementsPanel({ pluginId }: { pluginId: string }) {
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<RequirementsCheck | null>(null);
  const [reqInfo, setReqInfo] = useState<{
    binaries: string[];
    pythonDeps: string[];
    gpuVramGb: number | null;
    backendType: string | null;
    sourceRepo: string | null;
  } | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  async function runChecks() {
    setChecking(true);
    try {
      const res = (await rpc("republic.plugins.check-requirements", { id: pluginId })) as {
        requirements?: typeof reqInfo;
        checks?: RequirementsCheck;
      };
      if (res?.requirements) {
        setReqInfo(res.requirements);
      }
      if (res?.checks) {
        setChecks(res.checks);
      }
    } catch {
      // Silently fail — show empty state
    } finally {
      setChecking(false);
    }
  }

  // Auto-check on mount
  const hasChecked = useRef(false);
  useEffect(() => {
    if (!hasChecked.current) {
      hasChecked.current = true;
      void runChecks();
    }
  });

  async function saveConfig() {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      await rpc("republic.plugins.configure", { id: pluginId, config: configValues });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSavingConfig(false);
    }
  }

  const StatusIcon = ({ ok }: { ok: boolean }) =>
    ok ? (
      <CheckCircle size={14} className="text-success flex-shrink-0" />
    ) : (
      <AlertCircle size={14} className="text-danger flex-shrink-0" />
    );

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      {checks && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold ${
            checks.overallReady
              ? "bg-success/10 border-success/20 text-success"
              : "bg-warning/10 border-warning/20 text-warning"
          }`}
        >
          {checks.overallReady ? (
            <><CheckCircle size={16} /> All requirements met — plugin is ready to use</>
          ) : (
            <><AlertCircle size={16} /> Some requirements are missing — see details below</>
          )}
        </div>
      )}

      {/* Check Button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          loading={checking}
          icon={<RefreshCw size={12} />}
          onClick={() => void runChecks()}
        >
          {checks ? "Re-check" : "Check Requirements"}
        </Button>
      </div>

      {/* System Binaries */}
      {(reqInfo?.binaries?.length ?? 0) > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={14} className="text-accent" />
            <h4 className="text-sm font-bold text-text-heading">System Binaries</h4>
          </div>
          <div className="space-y-2">
            {(checks?.binaries ?? []).map((b) => (
              <div key={b.name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-secondary">
                <StatusIcon ok={b.available} />
                <code className="text-xs font-mono text-text-primary">{b.name}</code>
                {b.available ? (
                  <span className="text-[10px] text-text-muted ml-auto font-mono truncate max-w-[300px]">
                    {b.path}
                  </span>
                ) : (
                  <Badge variant="danger" className="ml-auto">Not Found</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Python Dependencies */}
      {(reqInfo?.pythonDeps?.length ?? 0) > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Package size={14} className="text-accent" />
            <h4 className="text-sm font-bold text-text-heading">Python Packages</h4>
          </div>
          <div className="space-y-2">
            {(checks?.pythonDeps ?? []).map((d) => (
              <div key={d.name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-secondary">
                <StatusIcon ok={d.importable} />
                <code className="text-xs font-mono text-text-primary">{d.name}</code>
                {d.importable ? (
                  <Badge variant="success" className="ml-auto">Installed</Badge>
                ) : (
                  <Badge variant="danger" className="ml-auto">Missing</Badge>
                )}
              </div>
            ))}
          </div>
          {checks?.pythonDeps?.some((d) => !d.importable) && (
            <div className="mt-3 p-3 bg-bg-input rounded-lg">
              <p className="text-xs text-text-muted mb-2">Install missing packages:</p>
              <code className="text-[11px] text-accent font-mono break-all">
                pip install {checks.pythonDeps.filter((d) => !d.importable).map((d) => d.name).join(" ")}
              </code>
            </div>
          )}
        </Card>
      )}

      {/* GPU Requirements */}
      {checks?.gpuVram && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={14} className="text-accent" />
            <h4 className="text-sm font-bold text-text-heading">GPU Requirements</h4>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-secondary">
            <StatusIcon ok={checks.gpuVram.sufficient} />
            <div className="flex-1">
              <div className="text-xs text-text-primary">
                {checks.gpuVram.required} GB VRAM required
              </div>
              <div className="text-[10px] text-text-muted">
                {checks.gpuVram.available > 0
                  ? `${checks.gpuVram.available} GB detected`
                  : "No NVIDIA GPU detected (nvidia-smi not found)"}
              </div>
            </div>
            <Badge variant={checks.gpuVram.sufficient ? "success" : "danger"}>
              {checks.gpuVram.sufficient ? "Sufficient" : "Insufficient"}
            </Badge>
          </div>
        </Card>
      )}

      {/* Backend Info */}
      {reqInfo?.backendType && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Settings size={14} className="text-accent" />
            <h4 className="text-sm font-bold text-text-heading">Backend</h4>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="px-3 py-2 rounded-lg bg-bg-secondary">
              <span className="text-text-muted">Type:</span>{" "}
              <span className="font-semibold text-text-primary">{reqInfo.backendType}</span>
            </div>
            {reqInfo.sourceRepo && (
              <div className="px-3 py-2 rounded-lg bg-bg-secondary">
                <a
                  href={reqInfo.sourceRepo}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  ↗ Source Repository
                </a>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Plugin Configuration */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-accent" />
            <h4 className="text-sm font-bold text-text-heading">Configuration</h4>
          </div>
          <Button
            size="sm"
            variant={configSaved ? "success" : "primary"}
            loading={savingConfig}
            icon={configSaved ? <CheckCircle size={12} /> : <Save size={12} />}
            onClick={() => void saveConfig()}
            disabled={Object.keys(configValues).length === 0}
          >
            {configSaved ? "Saved!" : "Save Config"}
          </Button>
        </div>
        <div className="space-y-3">
          {["output_dir", "model_path", "max_concurrent_jobs", "quality_preset"].map((key) => (
            <div key={key}>
              <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">
                {key.replace(/_/g, " ")}
              </label>
              <input
                type="text"
                value={configValues[key] ?? ""}
                onChange={(e) => setConfigValues((v) => ({ ...v, [key]: e.target.value }))}
                placeholder={`Default (auto)`}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}
          <p className="text-[10px] text-text-muted/60">
            Leave empty to use defaults. Config is saved to the plugin's data directory.
          </p>
        </div>
      </Card>

      {/* Loading state */}
      {checking && !checks && (
        <div className="flex items-center justify-center gap-2 text-text-muted text-sm py-8">
          <Loader2 size={14} className="animate-spin" /> Checking system requirements...
        </div>
      )}
    </div>
  );
}

// ─── Main PluginShell ─────────────────────────────────────────────

const TABS = ["Generate", "Models", "Setup", "Jobs", "Logs"] as const;
type Tab = (typeof TABS)[number];

interface PluginShellProps {
  pluginId: string;
  displayName: string;
  description: string;
  models?: PluginModel[];
  children: React.ReactNode; // Generate tab content
  usageLog?: PluginUsageEntry[];
}

export function PluginShell({
  pluginId,
  displayName,
  description,
  models = [],
  children,
  usageLog = [],
}: PluginShellProps) {
  const [tab, setTab] = useState<Tab>("Generate");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div>
          <h2 className="text-base font-bold text-text-heading">{displayName}</h2>
          <p className="text-xs text-text-muted leading-relaxed">{description}</p>
        </div>
        <PluginStatusBanner pluginId={pluginId} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/30">
        {TABS.map((t) => (
          <button
type="button"             key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              tab === t
                ? "bg-accent text-white"
                : "text-text-muted hover:text-text-primary hover:bg-bg-secondary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Generate" && <div>{children}</div>}
      {tab === "Models" && <ModelManager pluginId={pluginId} models={models} />}
      {tab === "Setup" && <RequirementsPanel pluginId={pluginId} />}
      {tab === "Jobs" && <JobMonitor pluginId={pluginId} />}
      {tab === "Logs" && <UsageLog entries={usageLog} />}
    </div>
  );
}
