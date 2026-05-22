import {
  MonitorDot,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Wifi,
  Container,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Card, Badge, Button, Tabs, Alert, RpcStatus, StatCard } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface GatewayNode {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  remoteIp?: string;
  caps?: string[];
  commands?: string[];
  connected: boolean;
  paired: boolean;
  connectedAtMs?: number;
}

interface PairRequest {
  requestId: string;
  nodeId?: string;
  displayName?: string;
  platform?: string;
  remoteIp?: string;
  createdAt?: number;
  status?: string;
}

// ─── Add Node Dialog ─────────────────────────────────────────────

function AddNodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const gatewayUrl = window.location.origin.replace(/:\d+$/, ":3000");

  if (!open) {
    return null;
  }

  function copyUrl() {
    void navigator.clipboard.writeText(gatewayUrl).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
              <MonitorDot size={16} className="text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-heading">Connect a Remote Node</h2>
              <p className="text-[10px] text-text-muted">
                Pair another HoC instance to this gateway
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {[
            {
              step: 1,
              title: "Install HoC on the remote machine",
              desc: (
                <>
                  Run{" "}
                  <code className="px-1 py-0.5 rounded bg-bg-secondary font-mono text-[10px]">
                    pnpm install && pnpm dev
                  </code>
                </>
              ),
            },
            {
              step: 2,
              title: "Point the remote node at this gateway",
              desc: null,
            },
            {
              step: 3,
              title: "Approve the pairing request",
              desc: "It will appear in the Pairing Requests tab.",
            },
          ].map((s) => (
            <div key={s.step} className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-heading">
                <span className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                  {s.step}
                </span>
                {s.title}
              </div>
              {s.desc && <p className="text-[10px] text-text-muted ml-6">{s.desc}</p>}
            </div>
          ))}

          {/* Gateway URL copy */}
          <div className="ml-6 flex items-center gap-2 bg-bg-secondary border border-border rounded-lg px-3 py-1.5">
            <code className="text-[10px] font-mono text-accent flex-1 truncate">{gatewayUrl}</code>
            <button
              onClick={copyUrl}
              className="text-text-muted hover:text-accent transition-colors shrink-0"
              aria-label="Copy gateway URL"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </div>

          <Alert variant="info">
            Ensure the remote machine can reach this gateway on port 3000.
          </Alert>
        </div>

        <div className="px-5 pb-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export function NodesPage() {
  const [tab, setTab] = useState("nodes");
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const navigate = useNavigate();
  const {
    data: nodesData,
    refetch: refetchNodes,
    loading,
    error,
  } = useRpc<{ nodes: GatewayNode[] }>("node.list", {});
  const { data: pairingData, refetch: refetchPairing } = useRpc<{
    pending?: PairRequest[];
    paired?: PairRequest[];
  }>("node.pair.list", {});

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetchNodes} />;
  }
  const nodes = nodesData?.nodes ?? [];
  const pending = pairingData?.pending ?? [];
  const onlineCount = nodes.filter((n) => n.connected).length;

  async function approveNode(requestId: string) {
    setActionError(null);
    try {
      await rpc("node.pair.approve", { requestId });
      refetchPairing();
      refetchNodes();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve node");
    }
  }
  async function rejectNode(requestId: string) {
    setActionError(null);
    try {
      await rpc("node.pair.reject", { requestId });
      refetchPairing();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject node");
    }
  }

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <AddNodeDialog
        open={showAddNode}
        onClose={() => {
          setShowAddNode(false);
        }}
      />
      {actionError && <Alert variant="danger">{actionError}</Alert>}
      <PageHeader
        title="Nodes"
        description={`${nodes.length} node${nodes.length !== 1 ? "s" : ""} · ${onlineCount} online`}
        icon={<MonitorDot size={20} />}
        actions={
          <Button
            icon={<Plus size={14} />}
            size="sm"
            onClick={() => {
              setShowAddNode(true);
            }}
          >
            Add
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={nodes.length} icon={<MonitorDot size={14} />} />
        <StatCard
          label="Online"
          value={onlineCount}
          icon={<CheckCircle size={14} className="text-success" />}
        />
        <StatCard
          label="Pending"
          value={pending.length}
          icon={<Clock size={14} className="text-warning" />}
        />
      </div>

      <Tabs
        tabs={[
          { id: "nodes", label: "Connected", count: nodes.length },
          { id: "pending", label: "Pairing", count: pending.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "nodes" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {nodes.length === 0 && (
            <div className="text-center py-12 col-span-full">
              <MonitorDot size={28} className="text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-text-muted">No nodes connected.</p>
            </div>
          )}
          {nodes.map((node) => (
            <Card
              key={node.nodeId}
              compact
              className="relative overflow-hidden cursor-pointer"
              hover
              onClick={() => {
                navigate(`/node?nodeId=${node.nodeId}`);
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent via-purple to-info" />
              <div className="flex items-start justify-between mb-2 pt-0.5">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-text-heading truncate">
                    {node.displayName ?? node.nodeId}
                  </h3>
                  <p className="text-[10px] text-text-muted font-mono truncate">{node.nodeId}</p>
                </div>
                <Badge variant={node.connected ? "success" : "neutral"} dot>
                  {node.connected ? "online" : "offline"}
                </Badge>
              </div>

              <div className="flex items-center gap-2 mb-2 text-[10px] text-text-muted flex-wrap">
                {node.remoteIp && (
                  <span className="flex items-center gap-1">
                    <Wifi size={10} /> {node.remoteIp}
                  </span>
                )}
                {node.platform && <span>{node.platform}</span>}
                {node.version && <span>v{node.version}</span>}
              </div>

              <div className="flex flex-wrap gap-1 items-center">
                {(node.caps ?? []).slice(0, 3).map((cap) => (
                  <span
                    key={cap}
                    className="text-[9px] px-1 py-0.5 rounded-md bg-bg-input border border-border/30 text-text-muted"
                  >
                    {cap}
                  </span>
                ))}
                {node.paired && (
                  <span className="text-[9px] px-1 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">
                    paired
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Container size={11} />}
                  className="ml-auto !text-[9px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/node/docker?nodeId=${node.nodeId}`);
                  }}
                  aria-label="View Docker"
                >
                  Docker
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "pending" && (
        <div className="space-y-2">
          {pending.length === 0 ? (
            <div className="text-center py-12">
              <Clock size={28} className="text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-text-muted">No pending pairing requests.</p>
            </div>
          ) : (
            pending.map((req) => (
              <Card key={req.requestId} compact>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-warning-bg flex items-center justify-center">
                      <Clock size={14} className="text-warning" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-text-heading">
                        {req.displayName ?? req.nodeId ?? req.requestId}
                      </h3>
                      <p className="text-[10px] text-text-muted">
                        {req.remoteIp} · {req.platform}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="success"
                      icon={<CheckCircle size={12} />}
                      onClick={() => {
                        void approveNode(req.requestId);
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<XCircle size={12} />}
                      onClick={() => {
                        void rejectNode(req.requestId);
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
