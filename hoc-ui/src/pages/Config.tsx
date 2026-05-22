import { Settings, Save, RotateCcw } from "lucide-react";
import React from "react";
import { useState } from "react";
import { PageHeader, Card, Button, Alert, Tabs, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface ConfigShape {
  name?: string;
  bindAddress?: string;
  port?: string | number;
  logLevel?: string;
  controlUiEnabled?: boolean;
  usageTracking?: boolean;
  defaultModel?: string;
  maxSessions?: string | number;
  sessionTimeout?: string | number;
  allowTools?: boolean;
  enableThinking?: boolean;
  gatewayToken?: string;
  tailscaleAuth?: boolean;
  clusterEnabled?: boolean;
  redisUrl?: string;
  clusterSecret?: string;
  healthCheckInterval?: string | number;
  maxBodySize?: string | number;
  rateLimit?: string | number;
  debugLogging?: boolean;
  federation?: boolean;
}

export function ConfigPage() {
  const [tab, setTab] = useState("general");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<ConfigShape>({});
  const { data: live, loading, refetch, error } = useRpc<ConfigShape>("config.get", {});

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const cfg: ConfigShape = { ...live, ...overrides };

  function set<K extends keyof ConfigShape>(key: K, val: ConfigShape[K]) {
    setOverrides((prev) => ({ ...prev, [key]: val }));
  }

  const handleReset = () => {
    setOverrides({});
    refetch();
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await rpc("config.set", { config: { ...live, ...overrides } });
      setOverrides({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Config"
        description="Gateway settings"
        icon={<Settings size={20} />}
        actions={
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={13} />}
              aria-label="Reset"
              onClick={handleReset}
            />
            <Button size="sm" icon={<Save size={13} />} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />

      {saved && <Alert variant="success">Saved</Alert>}
      {saveError && <Alert variant="danger">{saveError}</Alert>}

      <Tabs
        tabs={[
          { id: "general", label: "General" },
          { id: "agents", label: "Agents" },
          { id: "auth", label: "Auth" },
          { id: "cluster", label: "Cluster" },
          { id: "advanced", label: "Advanced" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "general" && (
        <Card compact>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-3">
            General
          </h3>
          <div className="space-y-3 max-w-lg">
            <Field label="Name" value={cfg.name ?? ""} onChange={(v) => set("name", v)} />
            <Field
              label="Bind Address"
              value={String(cfg.bindAddress ?? "0.0.0.0")}
              onChange={(v) => set("bindAddress", v)}
            />
            <Field
              label="Port"
              value={String(cfg.port ?? "3000")}
              type="number"
              onChange={(v) => set("port", v)}
            />
            <Field
              label="Log Level"
              value={String(cfg.logLevel ?? "info")}
              onChange={(v) => set("logLevel", v)}
            />
            <Toggle
              label="Control UI"
              value={cfg.controlUiEnabled ?? true}
              onChange={(v) => set("controlUiEnabled", v)}
            />
            <Toggle
              label="Usage Tracking"
              value={cfg.usageTracking ?? true}
              onChange={(v) => set("usageTracking", v)}
            />
          </div>
        </Card>
      )}

      {tab === "agents" && (
        <Card compact>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-3">
            Agents
          </h3>
          <div className="space-y-3 max-w-lg">
            <Field
              label="Default Model"
              value={cfg.defaultModel ?? "claude-sonnet-4-20250514"}
              onChange={(v) => set("defaultModel", v)}
            />
            <Field
              label="Max Sessions"
              value={String(cfg.maxSessions ?? "10")}
              type="number"
              onChange={(v) => set("maxSessions", v)}
            />
            <Field
              label="Timeout (s)"
              value={String(cfg.sessionTimeout ?? "3600")}
              type="number"
              onChange={(v) => set("sessionTimeout", v)}
            />
            <Toggle
              label="Tool Execution"
              value={cfg.allowTools ?? true}
              onChange={(v) => set("allowTools", v)}
            />
            <Toggle
              label="Thinking"
              value={cfg.enableThinking ?? true}
              onChange={(v) => set("enableThinking", v)}
            />
          </div>
        </Card>
      )}

      {tab === "auth" && (
        <Card compact>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-3">
            Auth
          </h3>
          <div className="space-y-3 max-w-lg">
            <Field
              label="Gateway Token"
              value={cfg.gatewayToken ?? ""}
              type="password"
              placeholder="Token"
              onChange={(v) => set("gatewayToken", v)}
            />
            <Toggle
              label="Tailscale Auth"
              value={cfg.tailscaleAuth ?? false}
              onChange={(v) => set("tailscaleAuth", v)}
            />
          </div>
        </Card>
      )}

      {tab === "cluster" && (
        <Card compact>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-3">
            Cluster
          </h3>
          <div className="space-y-3 max-w-lg">
            <Toggle
              label="Cluster Mode"
              value={cfg.clusterEnabled ?? false}
              onChange={(v) => set("clusterEnabled", v)}
            />
            <Field
              label="Redis URL"
              value={cfg.redisUrl ?? "redis://localhost:6379"}
              onChange={(v) => set("redisUrl", v)}
            />
            <Field
              label="Secret"
              value={cfg.clusterSecret ?? ""}
              type="password"
              onChange={(v) => set("clusterSecret", v)}
            />
            <Field
              label="Health Interval (ms)"
              value={String(cfg.healthCheckInterval ?? "30000")}
              type="number"
              onChange={(v) => set("healthCheckInterval", v)}
            />
          </div>
        </Card>
      )}

      {tab === "advanced" && (
        <Card compact>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-3">
            Advanced
          </h3>
          <div className="space-y-3 max-w-lg">
            <Field
              label="Max Body (bytes)"
              value={String(cfg.maxBodySize ?? "10485760")}
              type="number"
              onChange={(v) => set("maxBodySize", v)}
            />
            <Field
              label="Rate Limit (req/min)"
              value={String(cfg.rateLimit ?? "100")}
              type="number"
              onChange={(v) => set("rateLimit", v)}
            />
            <Toggle
              label="Debug Logging"
              value={cfg.debugLogging ?? false}
              onChange={(v) => set("debugLogging", v)}
            />
            <Toggle
              label="Federation"
              value={cfg.federation ?? false}
              onChange={(v) => set("federation", v)}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-xs text-text-secondary shrink-0">{label}</label>
      <input
        className="bg-bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 transition-all w-56 text-right"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-9 h-[18px] rounded-full transition-colors duration-200 cursor-pointer relative ${value ? "bg-accent" : "bg-border"}`}
      >
        <span
          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-200 ${value ? "left-[19px]" : "left-[2px]"}`}
        />
      </button>
    </div>
  );
}
