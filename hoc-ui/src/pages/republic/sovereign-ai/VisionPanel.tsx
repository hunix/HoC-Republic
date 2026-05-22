import { Eye, Activity, Cpu } from "lucide-react";
import { Card, RpcStatus, EmptyState, ProgressBar } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

type VisionDiag = {
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  availableProviders: string[];
  requestsByAction: Record<string, number>;
  requestsByProvider: Record<string, number>;
};

export function VisionPanel() {
  const { data, loading, error, refetch } = useRpc<VisionDiag>(
    "republic.sovereign.vision.diagnostics",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 15_000 },
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  if (!data) {
    return <EmptyState icon={<Eye size={40} />} title="Vision engine initializing..." />;
  }

  const providers = data.availableProviders ?? [];
  const actions = data.requestsByAction ?? {};
  const providerStats = data.requestsByProvider ?? {};

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{data.totalRequests}</p>
          <p className="text-xs text-text-muted">Total Analyses</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-success">
            {Math.round((data.successRate ?? 0) * 100)}%
          </p>
          <p className="text-xs text-text-muted">Success Rate</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-accent">{data.avgLatencyMs ?? 0}ms</p>
          <p className="text-xs text-text-muted">Avg Latency</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{providers.length}</p>
          <p className="text-xs text-text-muted">Providers</p>
        </Card>
      </div>

      {/* Providers */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Cpu size={14} /> Available Providers
        </h4>
        <div className="flex flex-wrap gap-2">
          {providers.length > 0 ? (
            providers.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm text-text-primary font-medium">{p}</span>
                {providerStats[p] !== undefined && (
                  <span className="text-xs text-text-muted">({providerStats[p]} reqs)</span>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-text-muted">
              No vision providers available. Configure OLLAMA_HOST, GEMINI_API_KEY, or
              OPENAI_API_KEY.
            </p>
          )}
        </div>
      </Card>

      {/* Action breakdown */}
      {Object.keys(actions).length > 0 && (
        <Card>
          <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
            <Activity size={14} /> Analysis Types
          </h4>
          <div className="space-y-2">
            {Object.entries(actions)
              .toSorted(([, a], [, b]) => b - a)
              .map(([action, count]) => {
                const pct =
                  data.totalRequests > 0 ? Math.round((count / data.totalRequests) * 100) : 0;
                return (
                  <div key={action} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary w-24 truncate">{action}</span>
                    <div className="flex-1">
                      <ProgressBar value={pct} max={100} size="sm" />
                    </div>
                    <span className="text-xs text-text-muted w-16 text-right">{count} reqs</span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}
    </div>
  );
}
