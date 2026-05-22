import { useRpc } from "@/lib/rpc";
import {
  PageHeader,
  Card,
  Badge,
  RpcStatus,
  EmptyState,
} from "@/components/ui";
import { Activity } from "lucide-react";

interface TraceSpan {
  traceId: string;
  spanId: string;
  citizenId: string;
  operation: string;
  status: "ok" | "error" | "timeout";
  durationTicks: number;
  tokensUsed: number;
  timestamp: string;
  toolIds: string[];
}

export function TracingPage() {
  const { data, loading, error, refetch } = useRpc<{ traces: TraceSpan[] }>("system.traces.list", { limit: 100 });

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const traces = data?.traces ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Trace Explorer"
        description="Distributed reasoning traces and decision audit logs across the Republic."
        icon={<Activity size={28} className="text-info" />}
      />
      <div className="grid gap-4">
        {traces.length === 0 ? (
          <EmptyState title="No traces" description="No reasoning spans recorded yet." icon={<Activity />} />
        ) : (
          traces.toReversed().map((trace: TraceSpan) => (
            <Card key={trace.spanId} className="p-4" glass hover>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm text-text-primary shadow-sm bg-bg-secondary px-1.5 py-0.5 rounded">
                      {trace.operation}
                    </span>
                    <Badge variant={trace.status === "ok" ? "success" : "danger"}>
                      {trace.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-text-muted flex items-center space-x-3 mt-1">
                    <span className="text-text-secondary font-medium">Citizen: {trace.citizenId}</span>
                    <span>&bull;</span>
                    <span>Tokens: {trace.tokensUsed.toLocaleString()}</span>
                    <span>&bull;</span>
                    <span>Duration: {trace.durationTicks} ticks</span>
                  </div>
                </div>
                <div className="text-xs text-text-muted flex flex-col items-end">
                  <span>{new Date(trace.timestamp).toLocaleTimeString()}</span>
                  <span className="text-[10px] opacity-60">Trace: {trace.traceId}</span>
                </div>
              </div>
              {trace.toolIds && trace.toolIds.length > 0 && (
                <div className="mt-3 flex gap-2">
                  <span className="text-xs text-text-muted py-0.5">Tools:</span>
                  {trace.toolIds.map((tool: string) => (
                    <Badge key={tool} variant="neutral">{tool}</Badge>
                  ))}
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
