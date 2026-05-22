import { Card, PageHeader, RpcStatus, Button } from "@/components/ui";
import { useRpc } from "@/lib/rpc";
import { ShieldCheck, ShieldAlert, Cpu, HeartPulse } from "lucide-react";

export interface ResilienceDiagnostics {
  status: "nominal" | "degraded" | "critical";
  activeAnomalies: number;
  totalAnomaliesResolved: number;
  lastPatchTimestamp: number | null;
  recentLogs: string[];
}

export function ResiliencePage() {
  const { data, loading, error, refetch } = useRpc<ResilienceDiagnostics>(
    "cluster.resilience.status",
    {},
    [],
    { refetchIntervalMs: 5000 }
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader
        title="Aegis Resilience Engine"
        description="Autonomous self-healing infrastructure, anomaly detection, and CI/CD patching pipeline."
        icon={<ShieldCheck className="w-8 h-8 text-success" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
            Force Diagnostics
          </Button>
        }
      />

      <RpcStatus loading={loading && !data} error={error} onRetry={refetch} />

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 flex flex-col justify-between" glass>
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm text-text-muted">Aegis Status</span>
                <HeartPulse className={`w-5 h-5 ${
                  data.status === "nominal" ? "text-success" : data.status === "degraded" ? "text-warning" : "text-danger"
                }`} />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight uppercase">
                {data.status}
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-between" glass>
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm text-text-muted">Active Anomalies</span>
                <ShieldAlert className="w-5 h-5 text-warning" />
              </div>
              <div className="text-2xl font-bold font-mono">
                {data.activeAnomalies}
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-between" glass>
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm text-text-muted">Anomalies Resolved</span>
                <ShieldCheck className="w-5 h-5 text-success" />
              </div>
              <div className="text-2xl font-bold font-mono">
                {data.totalAnomaliesResolved}
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-between" glass>
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm text-text-muted">Last Patch</span>
                <Cpu className="w-5 h-5 text-info" />
              </div>
              <div className="text-lg font-bold">
                {data.lastPatchTimestamp 
                  ? new Date(data.lastPatchTimestamp).toLocaleTimeString() 
                  : "Never"}
              </div>
            </Card>
          </div>

          <Card title="Aegis Daemon Logs" glass className="mt-6">
            <div className="h-[400px] overflow-y-auto font-mono text-xs bg-bg-primary rounded border border-border p-4">
              {data.recentLogs.length === 0 ? (
                <div className="text-text-muted flex items-center justify-center h-full">
                  Listening for anomalies on the Intelligence Bus...
                </div>
              ) : (
                data.recentLogs.map((log, i) => (
                  <div key={i} className={`py-1 border-b border-border-hover last:border-0 ${
                    log.includes('critical') ? 'text-danger' : 
                    log.includes('degraded') ? 'text-warning' : 
                    log.includes('patch successful') ? 'text-success' : 'text-text-secondary'
                  }`}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
