import { Wifi, Link, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, Alert, StatCard, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface PairRequest {
  requestId: string;
  nodeId: string;
  name?: string;
  publicKey?: string;
  ts?: number;
}

interface PairedNode {
  nodeId: string;
  name?: string;
  gatewayUrl?: string;
  pairedAt?: number;
  status?: string;
}

export function NodePairingPage() {
  const { data, loading, refetch, error } = useRpc<{
    pending?: PairRequest[];
    paired?: PairedNode[];
    gatewayUrl?: string;
    nodeId?: string;
    pairedAt?: number;
    status?: string;
  }>("node.pair.list", {});

  const [processing, setProcessing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const pending = data?.pending ?? [];
  const paired = data?.paired ?? [];
  const isPaired = data?.status === "paired" || paired.length > 0;
  const gatewayUrl = data?.gatewayUrl ?? "—";
  const nodeId = data?.nodeId ?? "—";
  const pairedAt = data?.pairedAt;

  async function approve(requestId: string) {
    setProcessing(requestId);
    setActionError(null);
    try {
      await rpc("node.pair.approve", { requestId });
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve pairing request");
    } finally {
      setProcessing(null);
    }
  }

  async function reject(requestId: string) {
    setProcessing(requestId);
    setActionError(null);
    try {
      await rpc("node.pair.reject", { requestId });
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject pairing request");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {actionError && <Alert variant="danger">{actionError}</Alert>}
      <PageHeader
        title="Node Pairing"
        description="Connect this node to a HoC gateway"
        icon={<Link size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Status"
          value={loading ? "…" : isPaired ? "Paired" : "Unpaired"}
          icon={isPaired ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
        />
        <StatCard label="Gateway" value={gatewayUrl} icon={<Wifi size={16} />} />
        <StatCard
          label="Connected Since"
          value={pairedAt ? new Date(pairedAt).toLocaleDateString() : "—"}
          icon={<Link size={16} />}
        />
      </div>

      {/* Pending pairing requests */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-text-heading">⏳ Pending Requests</h3>
          {pending.map((req) => (
            <Card key={req.requestId} className="border-warning/30">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-text-heading text-sm">
                    {req.name ?? req.nodeId}
                  </p>
                  <p className="text-xs text-text-muted font-mono">{req.requestId}</p>
                  {req.ts && (
                    <p className="text-xs text-text-muted">{new Date(req.ts).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="success"
                    disabled={processing === req.requestId}
                    onClick={() => approve(req.requestId)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={processing === req.requestId}
                    onClick={() => reject(req.requestId)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Current Connection */}
      {isPaired && (
        <Card className="border-success/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text-heading">✅ Current Connection</h3>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="space-y-2 text-sm">
            {[
              { label: "Gateway URL", value: gatewayUrl },
              { label: "Node ID", value: nodeId },
              {
                label: "Paired At",
                value: pairedAt ? new Date(pairedAt).toLocaleDateString() : "—",
              },
              { label: "Protocol", value: "WebSocket v2" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between">
                <span className="text-text-muted">{item.label}</span>
                <span className="font-mono text-text-secondary text-xs">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Paired nodes list */}
      {paired.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-text-heading">🔗 Paired Nodes</h3>
          {paired.map((node) => (
            <Card key={node.nodeId}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-text-heading text-sm">
                    {node.name ?? node.nodeId}
                  </p>
                  <p className="text-xs text-text-muted">{node.gatewayUrl}</p>
                </div>
                <Badge variant={node.status === "online" ? "success" : "neutral"}>
                  {node.status ?? "—"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && !isPaired && pending.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted text-center py-4">
            No pairing requests. To pair a new node, run the node agent and initiate pairing from
            the gateway.
          </p>
        </Card>
      )}
    </div>
  );
}
