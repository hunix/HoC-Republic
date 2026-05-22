import {
  Settings, Wifi, Clock, Shield, Terminal, Cpu, Send, RefreshCw,
  ChevronDown, Power, Zap, Eye, Volume2, Sun,
} from "lucide-react";
import { useState, useCallback } from "react";
import {
  PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface NodeListItem {
  nodeId: string;
  displayName?: string;
  platform?: string;
  connected: boolean;
  deviceFamily?: string;
}

interface NodeConfig {
  ts: number;
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  remoteIp?: string;
  caps: string[];
  commands: string[];
  permissions: Record<string, boolean>;
  connectedAtMs?: number;
  paired: boolean;
  connected: boolean;
  uptimeMs?: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatUptime(ms: number | null | undefined): string {
  if (!ms || ms <= 0) { return "—"; }
  const secs = Math.floor(ms / 1000);
  if (secs < 60) { return `${secs}s`; }
  const mins = Math.floor(secs / 60);
  if (mins < 60) { return `${mins}m`; }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) { return `${hrs}h ${remMins}m`; }
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

const CAP_ICONS: Record<string, typeof Wifi> = {
  chat: Terminal,
  voice: Volume2,
  display: Eye,
  "voice-wake": Volume2,
  sensor: Cpu,
};

const COMPANION_CONFIG_FIELDS = [
  { key: "display.brightness", label: "Display Brightness", icon: Sun, type: "range", min: 0, max: 255 },
  { key: "polling.intervalMs", label: "Polling Interval (ms)", icon: Clock, type: "number", min: 1000, max: 60000 },
  { key: "display.timeoutMs", label: "Display Timeout (ms)", icon: Eye, type: "number", min: 5000, max: 300000 },
  { key: "voice.enabled", label: "Voice Input", icon: Volume2, type: "toggle" },
  { key: "wifi.powerSave", label: "WiFi Power Save", icon: Zap, type: "toggle" },
] as const;

// ─── Component ──────────────────────────────────────────────────

export function NodeConfigPage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string | boolean>>({});

  // Fetch node list
  const {
    data: nodesData,
    loading: nodesLoading,
    error: nodesError,
    refetch: refetchNodes,
  } = useRpc<{ nodes: NodeListItem[] }>("node.list", {});

  const nodes = nodesData?.nodes ?? [];
  const connectedNodes = nodes.filter((n) => n.connected);

  // Auto-select first connected node
  const effectiveNodeId = selectedNodeId ?? connectedNodes[0]?.nodeId ?? null;

  // Fetch config for selected node
  const {
    data: configData,
    loading: configLoading,
    error: configError,
    refetch: refetchConfig,
  } = useRpc<NodeConfig>(
    "node.config.get",
    effectiveNodeId ? { nodeId: effectiveNodeId } : undefined,
    [effectiveNodeId],
    { staleTimeMs: 3000 },
  );

  const cfg = configData;

  const handlePushConfig = useCallback(async () => {
    if (!effectiveNodeId || Object.keys(configValues).length === 0) { return; }
    setPushing(true);
    setPushResult(null);
    try {
      const result = await rpc("node.config.push", {
        nodeId: effectiveNodeId,
        config: configValues,
      }) as { ok?: boolean; pushed?: string[] };
      setPushResult({
        ok: Boolean(result?.ok),
        msg: `Pushed ${result?.pushed?.length ?? 0} config keys`,
      });
    } catch (err) {
      setPushResult({
        ok: false,
        msg: err instanceof Error ? err.message : "Push failed",
      });
    } finally {
      setPushing(false);
    }
  }, [effectiveNodeId, configValues]);

  const updateConfigValue = useCallback((key: string, value: string | boolean) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
    setPushResult(null);
  }, []);

  // ─── Loading / Error ────────────────────────────────────────

  if (nodesLoading || nodesError) {
    return <RpcStatus loading={nodesLoading} error={nodesError} onRetry={refetchNodes} />;
  }

  if (connectedNodes.length === 0) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <PageHeader
          title="Node Configuration"
          description="Configure connected nodes and companions"
          icon={<Settings size={28} />}
        />
        <Alert variant="info">
          No nodes currently connected. Connect a node to manage its configuration.
        </Alert>
      </div>
    );
  }

  const isCompanion = cfg?.deviceFamily === "m5stick" || cfg?.deviceFamily === "esp32";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Node Configuration"
        description="Configure connected nodes and companions"
        icon={<Settings size={28} />}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => { refetchNodes(); refetchConfig(); }}
          >
            Refresh
          </Button>
        }
      />

      {/* ── Node Selector ──────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-secondary">Node:</span>
          <div className="relative flex-1 max-w-sm">
            <select
              className="w-full appearance-none bg-bg-input border border-border rounded-lg px-3 py-2 pr-8 text-sm text-text-primary focus:border-accent focus:outline-none"
              value={effectiveNodeId ?? ""}
              onChange={(e) => {
                setSelectedNodeId(e.target.value);
                setConfigValues({});
                setPushResult(null);
              }}
            >
              {connectedNodes.map((n) => (
                <option key={n.nodeId} value={n.nodeId}>
                  {n.displayName ?? n.nodeId}
                  {n.deviceFamily ? ` (${n.deviceFamily})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
          <Badge variant={cfg?.connected ? "success" : "neutral"}>
            {cfg?.connected ? "online" : "offline"}
          </Badge>
        </div>
      </Card>

      {configLoading || configError ? (
        <RpcStatus loading={configLoading} error={configError} onRetry={refetchConfig} />
      ) : cfg ? (
        <>
          {/* ── Connection Info ──────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Platform" value={cfg.platform ?? "—"} icon={<Cpu size={16} />} />
            <StatCard label="IP" value={cfg.remoteIp ?? "—"} icon={<Wifi size={16} />} />
            <StatCard label="Uptime" value={formatUptime(cfg.uptimeMs)} icon={<Clock size={16} />} />
            <StatCard
              label="Version"
              value={cfg.version ?? "—"}
              icon={<Power size={16} />}
              sub={cfg.coreVersion ? `core ${cfg.coreVersion}` : undefined}
            />
          </div>

          {/* ── Device Info ──────────────────────────────────── */}
          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Cpu size={16} className="text-accent" /> Device Details
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-text-muted text-xs">Device Family</p>
                <p className="font-medium text-text-primary">{cfg.deviceFamily ?? "unknown"}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Model</p>
                <p className="font-medium text-text-primary">{cfg.modelIdentifier ?? "—"}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">UI Version</p>
                <p className="font-medium text-text-primary">{cfg.uiVersion ?? "—"}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Paired</p>
                <Badge variant={cfg.paired ? "success" : "warning"}>
                  {cfg.paired ? "Yes" : "No"}
                </Badge>
              </div>
            </div>
          </Card>

          {/* ── Capabilities ─────────────────────────────────── */}
          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Shield size={16} className="text-purple-400" /> Capabilities
            </h3>
            {cfg.caps.length === 0 ? (
              <p className="text-sm text-text-muted">No capabilities declared</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cfg.caps.map((cap) => {
                  const Icon = CAP_ICONS[cap] ?? Zap;
                  return (
                    <span
                      key={cap}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-sm text-accent"
                    >
                      <Icon size={14} /> {cap}
                    </span>
                  );
                })}
              </div>
            )}
          </Card>

          {/* ── Commands ──────────────────────────────────────── */}
          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Terminal size={16} className="text-info" /> Registered Commands
            </h3>
            {cfg.commands.length === 0 ? (
              <p className="text-sm text-text-muted">No commands registered</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cfg.commands.map((cmd) => (
                  <span
                    key={cmd}
                    className="px-2.5 py-1 rounded-md bg-bg-secondary border border-border text-xs font-mono text-text-secondary"
                  >
                    {cmd}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* ── Permissions ───────────────────────────────────── */}
          <Card>
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Shield size={16} className="text-warning" /> Permissions
            </h3>
            {Object.keys(cfg.permissions).length === 0 ? (
              <p className="text-sm text-text-muted">No permissions declared</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(cfg.permissions).map(([perm, granted]) => (
                  <div key={perm} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-bg-secondary">
                    <span className="text-sm text-text-primary font-mono">{perm}</span>
                    <Badge variant={granted ? "success" : "danger"}>
                      {granted ? "Granted" : "Denied"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Companion Config (M5Stick/ESP32) ─────────────── */}
          {isCompanion && (
            <Card className="border-accent/30">
              <h3 className="text-sm font-semibold text-text-heading mb-4 flex items-center gap-2">
                <Zap size={16} className="text-accent" /> Companion Settings
                <Badge variant="purple">{cfg.deviceFamily}</Badge>
              </h3>
              <div className="space-y-4">
                {COMPANION_CONFIG_FIELDS.map((field) => {
                  const Icon = field.icon;
                  const val = configValues[field.key];
                  return (
                    <div key={field.key} className="flex items-center gap-3">
                      <Icon size={16} className="text-text-muted flex-shrink-0" />
                      <span className="text-sm text-text-secondary w-44 flex-shrink-0">{field.label}</span>
                      {field.type === "toggle" ? (
                        <button
                          type="button"
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            val === true || (val === undefined && false)
                              ? "bg-accent"
                              : "bg-bg-secondary border border-border"
                          }`}
                          onClick={() => updateConfigValue(field.key, !(val as boolean))}
                          aria-label={`Toggle ${field.label}`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              val === true ? "translate-x-5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      ) : field.type === "range" ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="range"
                            min={field.min}
                            max={field.max}
                            value={typeof val === "string" ? parseInt(val, 10) : (field.max ?? 255) / 2}
                            onChange={(e) => updateConfigValue(field.key, e.target.value)}
                            className="flex-1 accent-accent"
                          />
                          <span className="text-xs text-text-muted w-8 text-right">
                            {typeof val === "string" ? val : "—"}
                          </span>
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          value={typeof val === "string" ? val : ""}
                          placeholder="—"
                          onChange={(e) => updateConfigValue(field.key, e.target.value)}
                          className="w-24 bg-bg-input border border-border rounded-md px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} />}
                  onClick={handlePushConfig}
                  disabled={pushing || Object.keys(configValues).length === 0}
                >
                  {pushing ? "Pushing…" : "Push to Node"}
                </Button>
                {pushResult && (
                  <Alert variant={pushResult.ok ? "success" : "danger"}>
                    {pushResult.msg}
                  </Alert>
                )}
              </div>
            </Card>
          )}

          {/* ── Generic Config Push (non-companion) ──────────── */}
          {!isCompanion && (
            <Card>
              <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Send size={16} className="text-success" /> Push Configuration
              </h3>
              <p className="text-sm text-text-muted mb-3">
                Send key-value config to the connected node. The node must support
                the <code className="text-accent">config.update</code> command.
              </p>
              <div className="space-y-2">
                {["key1", "key2", "key3"].map((placeholder, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      placeholder="config.key"
                      className="flex-1 bg-bg-input border border-border rounded-md px-2 py-1.5 text-sm text-text-primary font-mono focus:border-accent focus:outline-none"
                      onChange={(e) => {
                        const key = e.target.value.trim();
                        if (key) { updateConfigValue(key, (configValues[key] as string) || ""); }
                      }}
                    />
                    <input
                      placeholder="value"
                      className="flex-1 bg-bg-input border border-border rounded-md px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
                      onChange={(e) => {
                        updateConfigValue(placeholder, e.target.value);
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} />}
                  onClick={handlePushConfig}
                  disabled={pushing || Object.keys(configValues).length === 0}
                >
                  {pushing ? "Pushing…" : "Push Config"}
                </Button>
                {pushResult && (
                  <Alert variant={pushResult.ok ? "success" : "danger"}>
                    {pushResult.msg}
                  </Alert>
                )}
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
