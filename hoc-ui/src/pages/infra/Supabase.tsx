import {
  Database,
  Play,
  Square,
  RefreshCw,
  GitBranch,
  ArrowUpCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Trash2,
  Container,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type DockerContainer = {
  id: string;
  name: string;
  image: string;
  status: "running" | "exited" | "dead" | "paused" | "created" | "unknown";
  ports: string;
  createdAt: string;
  uptime: string;
  isOrphan: boolean;
};

type SupabaseStatus = {
  status: "running" | "stopped" | "error";
  services?: Array<{ name: string; status: string; port?: number }>;
  projectId?: string;
  apiUrl?: string;
  cliAvailable?: boolean;
  error?: string;
  warning?: string;
  mode?: "cli" | "docker-only" | "both" | "none";
  dockerContainers?: DockerContainer[];
  cloudConnected?: boolean;
};

type CloudStatus = {
  connected: boolean;
  url?: string;
  configured: boolean;
  instanceId?: string;
  error?: string;
};

type ActionResult = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  removed?: string[];
  kept?: string[];
  errors?: string[];
};

/** Extract a human-readable message from any action response or caught value. */
function extractMsg(val: unknown): string {
  if (!val) { return "Unknown error"; }
  if (typeof val === "string") { return val; }
  if (val instanceof Error) { return val.message; }
  const v = val as Record<string, unknown>;
  return String(v.error ?? v.message ?? v.stderr ?? JSON.stringify(val));
}

export function SupabasePage() {
  const { data, loading, error, refetch } = useRpc<SupabaseStatus>(
    "republic.supabase.status",
    {},
    [],
    { staleTimeMs: 8_000, refetchIntervalMs: 15_000 },
  );
  const { data: cloudData } = useRpc<CloudStatus>(
    "republic.supabase.cloud-status",
    {},
    [],
    { staleTimeMs: 15_000 },
  );
  const { data: funcData } = useRpc<{ functions?: Array<{ name: string; entryPoint?: string }> }>(
    "republic.supabase.functions.list",
    {},
    [],
    { staleTimeMs: 15_000 },
  );
  const { data: migData } = useRpc<{
    migrations?: Array<{ version: string; name: string; status?: string; applied?: boolean }>;
  }>("republic.supabase.migrations.list", {}, [], { staleTimeMs: 15_000 });

  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const showMsg = (type: "ok" | "err", text: string) => {
    setActionMsg({ type, text });
    if (type === "ok") { setTimeout(() => setActionMsg(null), 4000); }
  };

  async function runAction(method: string, params: Record<string, unknown> = {}) {
    setActionMsg(null);
    setActionPending(true);
    try {
      const res = await rpc<ActionResult>(method, params);
      if (res?.ok === false) {
        showMsg("err", extractMsg(res));
      } else if (res?.removed && res.removed.length > 0) {
        showMsg("ok", `Removed ${res.removed.length} orphan(s). Kept ${res.kept?.length ?? 0}.`);
      } else {
        showMsg("ok", res?.stdout ? res.stdout.slice(0, 200) : "Done");
      }
    } catch (e) {
      showMsg("err", extractMsg(e));
    } finally {
      setActionPending(false);
    }
  }

  async function startSupabase() {
    await runAction("republic.supabase.start");
    invalidateRpcCache("republic.supabase.status");
    refetch();
  }

  async function stopSupabase() {
    await runAction("republic.supabase.stop");
    invalidateRpcCache("republic.supabase.status");
    refetch();
  }

  async function cleanupOrphans() {
    await runAction("republic.supabase.cleanup");
    invalidateRpcCache("republic.supabase.status");
    refetch();
  }

  async function dbPush() {
    await runAction("republic.supabase.db.push");
  }

  async function dbReset() {
    if (!confirm("Reset the database? This will apply all migrations from scratch.")) { return; }
    await runAction("republic.supabase.db.reset");
  }

  async function deployFunction(name: string) {
    await runAction("republic.supabase.functions.deploy", { name });
  }

  const isRunning = data?.status === "running";
  const cliPresent = data?.cliAvailable !== false;
  const services = data?.services ?? [];
  const functions = funcData?.functions ?? [];
  const migrations = migData?.migrations ?? [];
  const cliWarning = data?.warning;
  const needsLink = cliWarning?.includes("project ref") || cliWarning?.includes("supabase link");
  const needsInit = cliWarning?.includes("supabase init") || cliWarning?.includes("config.toml");
  const dockerContainers = data?.dockerContainers ?? [];
  const orphanCount = dockerContainers.filter((c) => c.isOrphan).length;
  const runningDockerCount = dockerContainers.filter((c) => c.status === "running").length;
  const mode = data?.mode ?? "none";

  // Cloud status
  const cloudConfigured = cloudData?.configured ?? false;
  const cloudConnected = cloudData?.connected ?? data?.cloudConnected ?? false;

  const modeLabel = {
    cli: "CLI Managed",
    "docker-only": "Docker Only",
    both: "CLI + Docker",
    none: "Not Running",
  }[mode];

  const modeBadge = {
    cli: "success" as const,
    "docker-only": "warning" as const,
    both: "success" as const,
    none: "neutral" as const,
  }[mode];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Supabase"
        description="Full-stack management: local Docker containers, CLI tools, cloud sync"
        icon={<Database size={28} />}
        actions={
          <div className="flex gap-2">
            {orphanCount > 0 && (
              <Button
                variant="warning"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={cleanupOrphans}
                disabled={actionPending}
              >
                Clean {orphanCount} Orphan{orphanCount > 1 ? "s" : ""}
              </Button>
            )}
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
            {cliPresent &&
              (isRunning ? (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Square size={14} />}
                  onClick={stopSupabase}
                  disabled={actionPending}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  icon={<Play size={14} />}
                  onClick={startSupabase}
                  disabled={actionPending}
                >
                  Start
                </Button>
              ))}
          </div>
        }
      />

      {/* CLI not available banner */}
      {!loading && data && !cliPresent && (
        <Alert variant="warning">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>
              Supabase CLI not found on PATH. Install it with{" "}
              <code className="font-mono text-xs bg-surface px-1 rounded">npm i -g supabase</code>{" "}
              then restart the gateway.
            </span>
          </div>
        </Alert>
      )}

      {/* CLI warning — setup guidance */}
      {cliWarning && (
        <Alert variant="info">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Info size={14} className="shrink-0" />
              <span className="text-sm font-medium">Setup Required</span>
            </div>
            <div className="text-xs text-text-secondary space-y-1.5 ml-5">
              {needsInit && (
                <p>
                  <strong>1. Initialize Supabase project:</strong>{" "}
                  <code className="font-mono bg-surface px-1.5 py-0.5 rounded">supabase init</code>
                </p>
              )}
              {needsLink && (
                <p>
                  <strong>{needsInit ? "2" : "1"}. Link to a remote project:</strong>{" "}
                  <code className="font-mono bg-surface px-1.5 py-0.5 rounded">
                    supabase link --project-ref &lt;your-project-ref&gt;
                  </code>
                </p>
              )}
              <p className="text-text-muted pt-1 text-[11px]">CLI output: {cliWarning}</p>
            </div>
          </div>
        </Alert>
      )}

      {/* Action feedback */}
      {actionMsg && (
        <Alert variant={actionMsg.type === "ok" ? "success" : "danger"}>
          <div className="flex items-center gap-2">
            {actionMsg.type === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span className="font-mono text-xs break-all">{actionMsg.text}</span>
          </div>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard
          label="Status"
          value={loading ? "…" : (data?.status ?? "unknown")}
          icon={isRunning ? <Play size={16} /> : <Square size={16} />}
        />
        <StatCard
          label="Mode"
          value={modeLabel}
          icon={<Container size={16} />}
        />
        <StatCard
          label="Docker"
          value={`${runningDockerCount} running`}
          sub={orphanCount > 0 ? `${orphanCount} orphan${orphanCount > 1 ? "s" : ""}` : undefined}
          icon={<Container size={16} />}
        />
        <StatCard
          label="Cloud"
          value={cloudConnected ? "Connected" : cloudConfigured ? "Disconnected" : "Not Set"}
          icon={cloudConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
        />
        <StatCard label="Migrations" value={migrations.length} icon={<GitBranch size={16} />} />
      </div>

      {/* Main status indicator */}
      <div
        className={`p-4 rounded-xl border flex items-center gap-3 ${isRunning ? "bg-success/10 border-success/30" : "bg-border/10 border-border/30"}`}
      >
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 ${isRunning ? "bg-success animate-pulse" : "bg-border"}`}
        />
        <div>
          <p className="font-semibold text-text-heading">
            Supabase is{" "}
            <Badge variant={isRunning ? "success" : "neutral"}>
              {loading ? "checking…" : (data?.status ?? "unknown")}
            </Badge>
            {" "}
            <Badge variant={modeBadge}>{modeLabel}</Badge>
          </p>
          {data?.apiUrl && (
            <p className="text-xs text-text-muted font-mono mt-0.5">{data.apiUrl}</p>
          )}
          {data?.projectId && <p className="text-xs text-text-muted">Project: {data.projectId}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Docker Containers */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🐳 Docker Containers</h3>
          {dockerContainers.length === 0 ? (
            <p className="text-xs text-text-muted">No Supabase containers found in Docker.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {dockerContainers.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between text-sm p-2 rounded-lg ${c.isOrphan ? "bg-danger/5 border border-danger/20" : "bg-bg-secondary"}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.status === "running" ? "bg-success" : c.isOrphan ? "bg-danger" : "bg-border"}`}
                    />
                    <div className="min-w-0">
                      <span className="text-text-secondary text-xs block truncate max-w-[180px]">
                        {c.name}
                      </span>
                      <span className="text-text-muted text-[10px] block truncate max-w-[180px]">
                        {c.image}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {c.isOrphan && (
                      <Badge variant="danger">orphan</Badge>
                    )}
                    <Badge variant={c.status === "running" ? "success" : "neutral"}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Cloud Status */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">☁️ Cloud Connector</h3>
          <div className="space-y-3">
            <div
              className={`p-3 rounded-lg flex items-center gap-3 ${cloudConnected ? "bg-success/10" : "bg-border/10"}`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cloudConnected ? "bg-success animate-pulse" : "bg-border"}`}
              />
              <div>
                <p className="text-sm font-medium text-text-heading">
                  {cloudConnected ? "Connected" : cloudConfigured ? "Disconnected" : "Not Configured"}
                </p>
                {cloudData?.url && (
                  <p className="text-[10px] text-text-muted font-mono truncate max-w-[200px]">
                    {cloudData.url}
                  </p>
                )}
                {cloudData?.instanceId && (
                  <p className="text-[10px] text-text-muted">Instance: {cloudData.instanceId}</p>
                )}
              </div>
            </div>
            {!cloudConfigured && (
              <div className="text-xs text-text-muted space-y-1.5 p-2 bg-bg-secondary rounded-lg">
                <p className="font-medium text-text-secondary">Setup cloud sync:</p>
                <p>
                  Add to{" "}
                  <code className="font-mono bg-surface px-1 rounded text-[10px]">.env</code>:
                </p>
                <pre className="font-mono text-[10px] bg-bg-primary p-2 rounded overflow-x-auto">
                  {`SUPABASE_URL=https://your-project.supabase.co\nSUPABASE_SERVICE_KEY=eyJ...your-key`}
                </pre>
              </div>
            )}
            {cloudData?.error && !cloudConnected && cloudConfigured && (
              <p className="text-xs text-danger">{cloudData.error}</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CLI Services */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">⚙️ CLI Services</h3>
          {loading ? (
            <p className="text-xs text-text-muted">Loading…</p>
          ) : services.length === 0 ? (
            <div className="text-xs text-text-muted space-y-2">
              <p>
                {mode === "docker-only"
                  ? "Containers running outside CLI management."
                  : isRunning
                    ? "No services returned."
                    : "Supabase CLI is not running."}
              </p>
              {!isRunning && cliPresent && (
                <Button
                  size="sm"
                  icon={<Play size={12} />}
                  onClick={startSupabase}
                  disabled={actionPending}
                >
                  Start Supabase
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {services.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${svc.status === "running" ? "bg-success" : "bg-border"}`}
                    />
                    <span className="text-text-secondary">{svc.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {svc.port && (
                      <span className="text-xs text-text-muted font-mono">{svc.port}</span>
                    )}
                    <Badge variant={svc.status === "running" ? "success" : "neutral"}>
                      {svc.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* DB Controls */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🗄️ Database</h3>
          <div className="space-y-3">
            <Button
              size="sm"
              className="w-full"
              icon={<ArrowUpCircle size={14} />}
              onClick={dbPush}
              disabled={actionPending || !cliPresent}
            >
              Push Migrations
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              icon={<GitBranch size={14} />}
              onClick={dbReset}
              disabled={actionPending || !cliPresent}
            >
              Reset DB
            </Button>
            {migrations.length > 0 && (
              <div className="space-y-1 mt-3">
                <p className="text-xs text-text-muted uppercase tracking-wider font-semibold">
                  Migrations
                </p>
                {migrations.slice(-5).map((m) => (
                  <div key={m.version} className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary font-mono truncate max-w-[120px]">
                      {m.version}
                    </span>
                    <Badge variant={m.applied || m.status === "applied" ? "success" : "warning"}>
                      {m.applied || m.status === "applied" ? "applied" : (m.status ?? "pending")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Edge Functions */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">⚡ Edge Functions</h3>
          {functions.length === 0 ? (
            <p className="text-xs text-text-muted">
              {cliPresent ? "No edge functions found in supabase/functions/." : "CLI unavailable."}
            </p>
          ) : (
            <div className="space-y-2">
              {functions.map((fn) => (
                <div key={fn.name} className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-mono">{fn.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ArrowUpCircle size={10} />}
                    onClick={() => deployFunction(fn.name)}
                    disabled={actionPending || !cliPresent}
                  >
                    Deploy
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
