import {
  // oxlint-disable-next-line no-unused-vars
  Shield,
  Terminal,
  Play,
  // oxlint-disable-next-line no-unused-vars
  ExternalLink,
  // oxlint-disable-next-line no-unused-vars
  BarChart2,
  // oxlint-disable-next-line no-unused-vars
  ChevronDown,
  // oxlint-disable-next-line no-unused-vars
  ChevronRight,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Card, Badge, Button, EmptyState, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── PentAGI Panel ───────────────────────────────────────────────

interface PentAGIFlow {
  id: string;
  target: string;
  objectives?: string;
  status: string;
  depth?: string;
  createdAt?: string;
}

const FLOW_STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "danger" | "neutral"> = {
  completed: "success",
  running: "warning",
  pending: "info",
  failed: "danger",
  stopped: "neutral",
};

function PentAGIPanel() {
  const [target, setTarget] = useState("");
  const [objectives, setObjectives] = useState("");
  const [depth, setDepth] = useState("standard");
  const [launching, setLaunching] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState("");

  const { data: statusData } = useRpc<{ ok: boolean; online: boolean; setupHint: string | null }>(
    "pentagi.status",
    {},
    [],
    { staleTimeMs: 30_000 },
  );
  const {
    data: flowsData,
    loading,
    error,
    refetch,
  } = useRpc<{ ok: boolean; flows?: PentAGIFlow[] }>("pentagi.flows.list", { limit: 20 }, [], {
    staleTimeMs: 10_000,
  });
  const { data: toolsData } = useRpc<{
    ok: boolean;
    tools?: { name: string; category: string; description: string }[];
  }>("pentagi.tools.list", {}, [], { staleTimeMs: 300_000 });
  const { data: logsData } = useRpc<{
    ok: boolean;
    logs?: { role: string; content: string; ts?: string }[];
  }>("pentagi.flows.logs", { flowId: selectedFlow ?? "", limit: 50 }, [selectedFlow], {
    staleTimeMs: 5_000,
  });

  const online = statusData?.online ?? false;
  const flows = flowsData?.flows ?? [];
  const tools = toolsData?.tools ?? [];

  const handleLaunch = async () => {
    if (!target.trim() || !objectives.trim()) {
      return;
    }
    setLaunching(true);
    setLaunchError("");
    try {
      await rpc("pentagi.flows.create", {
        target: target.trim(),
        objectives: objectives.trim(),
        depth,
      });
      setTarget("");
      setObjectives("");
      refetch();
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : "Failed to launch scan");
    } finally {
      setLaunching(false);
    }
  };

  const handleStop = async (flowId: string) => {
    try {
      await rpc("pentagi.flows.stop", { flowId });
      refetch();
    } catch {
      /* silent */
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {!online && (
        <Alert variant="info">
          <div>
            <p className="font-semibold">PentAGI — Setup Required</p>
            <p className="text-sm opacity-80 mt-1">
              Docker-based red team engine not running. Clone and start to activate.
            </p>
            {statusData?.setupHint && (
              <pre className="text-xs bg-black/30 rounded p-2 mt-2 overflow-x-auto">
                {statusData.setupHint}
              </pre>
            )}
          </div>
        </Alert>
      )}

      {/* Launch Form */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-danger" />
          <p className="font-semibold text-text-heading text-sm">Launch Autonomous Pentest</p>
          {online && <div className="ml-auto w-2 h-2 rounded-full bg-success animate-pulse" />}
        </div>
        <Alert variant="warning" className="mb-4">
          Only use on systems you own or have explicit written authorization to test.
        </Alert>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Target: URL, IP, domain, or CIDR range"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
          />
          <textarea
            rows={3}
            placeholder="Objectives: what vulnerabilities or behaviors to test for"
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            className="w-full resize-none bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
          />
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className="w-full bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
          >
            <option value="reconnaissance">Reconnaissance only</option>
            <option value="standard">Standard (recommended)</option>
            <option value="deep">Deep scan (intensive)</option>
          </select>
          {launchError && <Alert variant="danger">{launchError}</Alert>}
          <Button
            variant="danger"
            onClick={() => void handleLaunch()}
            disabled={!target.trim() || !objectives.trim() || launching}
            className="w-full"
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            {launching ? "Launching…" : "Launch PentAGI Scan"}
          </Button>
        </div>
      </Card>

      {/* Active Flows */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-text-heading text-sm">Active Flows ({flows.length})</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw size={13} />
          </Button>
        </div>
        {(loading || error) && <RpcStatus loading={loading} error={error} onRetry={refetch} />}
        {!loading && flows.length === 0 && (
          <EmptyState
            icon={<Search size={24} />}
            title="No Active Flows"
            description="Launch a scan above to start an autonomous penetration test."
          />
        )}
        <div className="space-y-2">
          {flows.map((f) => (
            <div
              key={f.id}
              className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                selectedFlow === f.id
                  ? "border-accent/50 bg-accent/5"
                  : "border-border/20 bg-bg-input hover:border-border/40"
              }`}
              onClick={() => setSelectedFlow(selectedFlow === f.id ? null : f.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{f.target}</p>
                  {f.objectives && (
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{f.objectives}</p>
                  )}
                  <p className="text-[10px] text-text-muted mt-1">
                    {f.depth ?? "standard"} ·{" "}
                    {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge variant={FLOW_STATUS_VARIANT[f.status] ?? "neutral"}>{f.status}</Badge>
                  {(f.status === "running" || f.status === "pending") && (
                    <button
                      type="button"
                      aria-label="Stop flow"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleStop(f.id);
                      }}
                      className="text-[10px] text-danger hover:text-danger/70"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
              {/* Logs panel */}
              {selectedFlow === f.id && (
                <div className="mt-3 border-t border-border/20 pt-3">
                  <div className="bg-black/40 rounded-lg p-3 max-h-52 overflow-y-auto space-y-1 font-mono text-[11px]">
                    {(logsData?.logs ?? []).length === 0 ? (
                      <p className="text-text-muted">No logs yet…</p>
                    ) : (
                      (logsData?.logs ?? []).map((l, i) => (
                        <p
                          key={i}
                          className={
                            l.role === "agent"
                              ? "text-accent"
                              : l.role === "system"
                                ? "text-warning"
                                : "text-text-secondary"
                          }
                        >
                          <span className="text-text-muted">[{l.role}] </span>
                          {l.content}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Tool Catalog */}
      {tools.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">
            {tools.length} Security Tools Available
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tools.map((t) => (
              <div key={t.name} className="flex items-start gap-2 p-2 rounded-lg bg-bg-input">
                <Terminal className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-text-primary">{t.name}</p>
                  <p className="text-[10px] text-text-muted">
                    {t.category} · {t.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── Phishing Sim (BlackEye) ──────────────────────────────────── */}
      {activeTab === "phishing" && <PhishingSimPanel />}

      {/* ─── Target Scan ─────────────────────────────────────── */}
      {activeTab === "target-scan" && <TargetScanPanel />}
    </div>
  );
}

export { PentAGIPanel };
