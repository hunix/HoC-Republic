import { Database, Table, RefreshCw, Search, Trash2, Download, Eye } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

type DBCollection = {
  name: string;
  count: number;
  sizeBytes?: number;
  lastModified?: number;
  indexes?: string[];
};
type DBRecord = Record<string, unknown>;
type DBStats = {
  totalCollections?: number;
  totalRecords?: number;
  sizeBytes?: number;
  engine?: string;
};

function formatBytes(b?: number) {
  if (!b) {return "—";}
  if (b > 1_073_741_824) {return `${(b / 1_073_741_824).toFixed(2)} GB`;}
  if (b > 1_048_576) {return `${(b / 1_048_576).toFixed(1)} MB`;}
  return `${(b / 1024).toFixed(0)} KB`;
}

export function PersistencePage() {
  const { data: stats, refetch, loading, error } = useRpc<DBStats>("republic.db.stats", {}, [], {
    staleTimeMs: 15_000,
  });
  const { data: colData, loading: colLoading } = useRpc<{ collections?: DBCollection[] }>(
    "republic.db.collections",
    {},
    [],
    { staleTimeMs: 10_000 },
  );
  const [actionError, setActionError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("{}");
  const [records, setRecords] = useState<DBRecord[]>([]);
  const [querying, setQuerying] = useState(false);
  const [limit, setLimit] = useState(20);
  const [viewRecord, setViewRecord] = useState<DBRecord | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const collections = colData?.collections ?? [];

  async function queryCollection(name: string) {
    if (!name) {return;}
    setQuerying(true);
    setActionError("");
    try {
      let filter: unknown = {};
      try {
        filter = JSON.parse(query);
      } catch {
        filter = {};
      }
      const r = await rpc<{ records?: DBRecord[] }>("republic.db.query", {
        collection: name,
        filter,
        limit,
      });
      setRecords(r?.records ?? []);
      setSelected(name);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setQuerying(false);
    }
  }

  async function dropCollection(name: string) {
    if (!confirm(`Drop collection "${name}"? This is irreversible.`)) {return;}
    try {
      await rpc("republic.db.collection.drop", { collection: name });
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteRecord(collection: string, id: unknown) {
    try {
      await rpc("republic.db.record.delete", { collection, id });
      setRecords((r) => r.filter((rec) => rec.id !== id && rec._id !== id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  function exportCsv() {
    if (!records.length) {return;}
    const keys = Object.keys(records[0]);
    const rows = records.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","));
    const blob = new Blob([[keys.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${selected ?? "export"}.csv`;
    a.click();
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Persistence Layer"
        description="Browse, query, and manage all republic database collections and records"
        icon={<Database size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Engine" value={stats?.engine ?? "—"} icon={<Database size={16} />} />
        <StatCard
          label="Collections"
          value={stats?.totalCollections ?? collections.length}
          icon={<Table size={16} />}
        />
        <StatCard
          label="Total Records"
          value={(stats?.totalRecords ?? 0).toLocaleString()}
          icon={<Database size={16} />}
        />
        <StatCard
          label="DB Size"
          value={formatBytes(stats?.sizeBytes)}
          icon={<Database size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Collections List */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Table size={16} /> Collections
          </h3>
          {colLoading ? (
            <p className="text-sm text-text-muted">Loading...</p>
          ) : collections.length === 0 ? (
            <p className="text-sm text-text-muted">No collections.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {collections.map((c) => (
                <div
                  key={c.name}
                  className={`p-2 rounded-lg border cursor-pointer transition-colors ${selected === c.name ? "border-accent bg-accent/5" : "border-border/30 bg-bg-secondary hover:border-accent/40"}`}
                  onClick={() => queryCollection(c.name)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-text-heading truncate">
                      {c.name}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={10} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        dropCollection(c.name);
                      }}
                    />
                  </div>
                  <div className="flex gap-2 text-xs text-text-muted">
                    <span>{c.count.toLocaleString()} docs</span>
                    <span>{formatBytes(c.sizeBytes)}</span>
                  </div>
                  {c.indexes && c.indexes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.indexes.slice(0, 3).map((idx) => (
                        <Badge key={idx} variant="neutral">
                          {idx}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Query + Records */}
        <div className="md:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-heading flex items-center gap-2">
                <Search size={16} /> {selected ? `Records: ${selected}` : "Select a collection"}
              </h3>
              {records.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Download size={12} />}
                  onClick={exportCsv}
                >
                  Export CSV
                </Button>
              )}
            </div>

            <div className="flex gap-2 mb-4">
              <input
                className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm font-mono text-text-primary placeholder:text-text-muted"
                placeholder="Query filter (JSON)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                className="px-2 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                icon={<Search size={12} />}
                loading={querying}
                onClick={() => selected && queryCollection(selected)}
              >
                Query
              </Button>
            </div>

            {records.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">
                {selected ? "No records matched." : "Click a collection to browse records."}
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {records.map((rec, i) => {
                  const id = (rec.id ?? rec._id ?? i) as string;
                  const keys = Object.keys(rec).slice(0, 5);
                  return (
                    <div
                      key={i}
                      className="p-2 rounded bg-bg-secondary border border-border/30 text-xs font-mono"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-text-muted font-semibold">
                          {String(id).slice(0, 20)}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Eye size={10} />}
                            onClick={() => setViewRecord(rec)}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 size={10} />}
                            onClick={() => selected && deleteRecord(selected, id)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-text-secondary">
                        {keys.map((k) => (
                          <div key={k} className="truncate">
                            <span className="text-accent">{k}: </span>
                            {JSON.stringify(rec[k])?.slice(0, 30)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Record Detail Modal */}
      {viewRecord && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-heading">🔍 Record Detail</h3>
            <Button size="sm" variant="ghost" onClick={() => setViewRecord(null)}>
              ✕
            </Button>
          </div>
          <pre className="text-xs font-mono bg-bg-secondary border border-border/30 rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap text-text-secondary">
            {JSON.stringify(viewRecord, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
