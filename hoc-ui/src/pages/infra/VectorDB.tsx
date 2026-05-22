import { Server, Plus, Trash2, RefreshCw, Search, Database } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type VecCluster = { id: string; name?: string; status: string; collections?: number };
type VecCollection = { name: string; vectorCount?: number; dimensions?: number };
type QueryResult = { id: string; score: number; payload?: Record<string, unknown> };

export function VectorDBPage() {
  const {
    data: clusterData,
    loading,
    error,
    refetch,
  } = useRpc<{ clusters?: VecCluster[] }>("republic.vectordb.cluster.list", {}, [], {
    staleTimeMs: 10_000,
  });
  const [selectedCluster, setSelectedCluster] = useState<VecCluster | null>(null);
  const [collections, setCollections] = useState<VecCollection[]>([]);
  const [queryText, setQueryText] = useState("");
  const [queryCol, setQueryCol] = useState("");
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [newClusterName, setNewClusterName] = useState("");
  const [newColName, setNewColName] = useState("");
  const [actionError, setActionError] = useState("");
  const [confirmClusterId, setConfirmClusterId] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const clusters = clusterData?.clusters ?? [];

  async function selectCluster(c: VecCluster) {
    setSelectedCluster(c);
    try {
      const r = await rpc<{ collections?: VecCollection[] }>("republic.vectordb.collection.list", {
        clusterId: c.id,
      });
      setCollections(r?.collections ?? []);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createCluster() {
    if (!newClusterName.trim()) {return;}
    try {
      await rpc("republic.vectordb.cluster.create", { name: newClusterName.trim() });
      invalidateRpcCache("republic.vectordb.cluster.list");
      setNewClusterName("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stopCluster(id: string) {
    try {
      await rpc("republic.vectordb.cluster.stop", { clusterId: id });
      invalidateRpcCache("republic.vectordb.cluster.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteCluster(id: string) {
    setConfirmClusterId(null);
    try {
      await rpc("republic.vectordb.cluster.delete", { clusterId: id });
      invalidateRpcCache("republic.vectordb.cluster.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createCollection() {
    if (!selectedCluster || !newColName.trim()) {return;}
    try {
      await rpc("republic.vectordb.collection.create", {
        clusterId: selectedCluster.id,
        name: newColName.trim(),
        dimensions: 1536,
      });
      setNewColName("");
      selectCluster(selectedCluster);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function queryCollection() {
    if (!selectedCluster || !queryCol || !queryText.trim()) {return;}
    try {
      const r = await rpc<{ results?: QueryResult[] }>("republic.vectordb.query", {
        clusterId: selectedCluster.id,
        collection: queryCol,
        text: queryText.trim(),
        limit: 5,
      });
      setQueryResults(r?.results ?? []);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Vector Database"
        description="Manage clusters, collections, and semantic search queries"
        icon={<Database size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Clusters" value={clusters.length} icon={<Server size={16} />} />
        <StatCard
          label="Running"
          value={clusters.filter((c) => c.status === "running").length}
          icon={<Database size={16} />}
        />
        <StatCard label="Collections" value={collections.length} icon={<Search size={16} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Clusters */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-3 text-sm">🗄️ Clusters</h3>
          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 px-2 py-1.5 rounded bg-bg-secondary border border-border text-xs text-text-primary placeholder:text-text-muted"
              placeholder="New cluster name..."
              value={newClusterName}
              onChange={(e) => setNewClusterName(e.target.value)}
            />
            <Button size="sm" onClick={createCluster} icon={<Plus size={12} />} />
          </div>
          {loading ? (
            <p className="text-xs text-text-muted">Loading...</p>
          ) : clusters.length === 0 ? (
            <p className="text-xs text-text-muted">No clusters.</p>
          ) : (
            <div className="space-y-2">
              {clusters.map((c) => (
                <div
                  key={c.id}
                  className={`p-2 rounded-lg border text-xs ${selectedCluster?.id === c.id ? "border-accent/40 bg-accent/10" : "border-border/30 bg-bg-secondary"}`}
                >
                  <div className="flex items-center justify-between">
                    <button
type="button"                       className="text-text-secondary font-medium text-left flex-1"
                      onClick={() => selectCluster(c)}
                    >
                      {c.name ?? c.id.slice(0, 12)}
                    </button>
                    <div className="flex items-center gap-1">
                      <Badge variant={c.status === "running" ? "success" : "neutral"}>
                        {c.status}
                      </Badge>
                      <button
type="button"                         onClick={() => stopCluster(c.id)}
                        className="text-warning hover:text-warning/70 ml-1"
                      >
                        ■
                      </button>
                      <button
type="button"                         onClick={() => setConfirmClusterId(c.id)}
                        className="text-danger hover:text-danger/70"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Collections */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-3 text-sm">📦 Collections</h3>
          {!selectedCluster ? (
            <p className="text-xs text-text-muted">Select a cluster first.</p>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                <input
                  className="flex-1 px-2 py-1.5 rounded bg-bg-secondary border border-border text-xs text-text-primary placeholder:text-text-muted"
                  placeholder="Collection name..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                />
                <Button size="sm" onClick={createCollection} icon={<Plus size={12} />} />
              </div>
              <div className="space-y-2">
                {collections.map((col) => (
                  <button
type="button"                     key={col.name}
                    className={`w-full text-left p-2 rounded border text-xs ${queryCol === col.name ? "border-accent/40 bg-accent/10" : "border-border/30 bg-bg-secondary"}`}
                    onClick={() => setQueryCol(col.name)}
                  >
                    <p className="font-medium text-text-secondary">{col.name}</p>
                    {col.vectorCount != null && (
                      <p className="text-text-muted">
                        {col.vectorCount} vectors · {col.dimensions}d
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Query */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-3 text-sm">🔍 Semantic Search</h3>
          <div className="space-y-2 mb-3">
            {queryCol && <p className="text-xs text-accent font-mono">Collection: {queryCol}</p>}
            <textarea
              className="w-full px-2 py-2 rounded bg-bg-secondary border border-border text-xs text-text-primary placeholder:text-text-muted h-20 resize-none"
              placeholder="Search query..."
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
            />
            <Button
              size="sm"
              className="w-full"
              icon={<Search size={12} />}
              onClick={queryCollection}
              disabled={!queryCol || !queryText.trim()}
            >
              Search
            </Button>
          </div>
          <div className="space-y-2">
            {queryResults.map((r, i) => (
              <div key={i} className="p-2 rounded bg-bg-secondary border border-border/30 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-text-muted">{r.id.slice(0, 12)}</span>
                  <Badge variant="info">{(r.score * 100).toFixed(1)}%</Badge>
                </div>
                {r.payload && (
                  <pre className="text-text-secondary whitespace-pre-wrap text-xs">
                    {JSON.stringify(r.payload, null, 2).slice(0, 100)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>

    <ConfirmDialog
      open={confirmClusterId !== null}
      title="Delete cluster?"
      message="Delete this vector cluster and all its collections permanently? This cannot be undone."
      confirmLabel="Delete Cluster"
      onConfirm={() => confirmClusterId && void deleteCluster(confirmClusterId)}
      onCancel={() => setConfirmClusterId(null)}
    />
  </>
  );
}
