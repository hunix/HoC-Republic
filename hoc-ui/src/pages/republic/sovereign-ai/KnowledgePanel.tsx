import { Database, Plus, Search, Trash2, Tag } from "lucide-react";
import { useState } from "react";
import {
  // oxlint-disable-next-line no-unused-vars
  PageHeader,
  Card,
  Badge,
  Button,
  RpcStatus,
  // oxlint-disable-next-line no-unused-vars
  Tabs,
  EmptyState,
  ConfirmDialog,
} from "@/components/ui";
import { useRpc, mutateRpc } from "@/lib/rpc";

type KBEntry = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  confidence: number;
  retrievalCount: number;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
};

type KBDiag = {
  totalEntries: number;
  categoryBreakdown: Record<string, number>;
  totalRetrievals: number;
  avgConfidence: number;
};

const CATEGORIES = [
  "fact",
  "preference",
  "instruction",
  "decision",
  "context",
  "procedure",
] as const;

const categoryColors: Record<
  string,
  "success" | "info" | "warning" | "purple" | "danger" | "neutral"
> = {
  fact: "info",
  preference: "purple",
  instruction: "warning",
  decision: "success",
  context: "neutral",
  procedure: "danger",
};

export function KnowledgePanel() {
  const { data, loading, error, refetch } = useRpc<{ entries?: KBEntry[] }>(
    "republic.sovereign.knowledge.list",
    { limit: 200 },
    [],
    { staleTimeMs: 5_000 },
  );
  const { data: diag } = useRpc<KBDiag>("republic.sovereign.knowledge.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", content: "", category: "fact", tags: "" });

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const entries = data?.entries ?? [];

  // Client-side search + filter
  const filtered = entries.filter((e) => {
    if (filterCategory && e.category !== filterCategory) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q);
    }
    return true;
  });

  const handleAdd = async () => {
    if (!addForm.title.trim() || !addForm.content.trim()) {
      return;
    }
    await mutateRpc("republic.sovereign.knowledge.add", {
      title: addForm.title,
      content: addForm.content,
      category: addForm.category,
      tags: addForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setAddForm({ title: "", content: "", category: "fact", tags: "" });
    setShowAdd(false);
    refetch();
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }
    await mutateRpc("republic.sovereign.knowledge.delete", { id: deleteId });
    setDeleteId(null);
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{diag?.totalEntries ?? 0}</p>
          <p className="text-xs text-text-muted">Total Entries</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{diag?.totalRetrievals ?? 0}</p>
          <p className="text-xs text-text-muted">Total Retrievals</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">
            {Math.round((diag?.avgConfidence ?? 0) * 100)}%
          </p>
          <p className="text-xs text-text-muted">Avg Confidence</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">
            {Object.keys(diag?.categoryBreakdown ?? {}).length}
          </p>
          <p className="text-xs text-text-muted">Categories Used</p>
        </Card>
      </div>

      {/* Category breakdown chips */}
      {diag?.categoryBreakdown && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(diag.categoryBreakdown).map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(filterCategory === cat ? "" : cat)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${filterCategory === cat ? "bg-accent text-white ring-2 ring-accent/30" : "bg-bg-secondary text-text-secondary hover:bg-bg-card"}`}
            >
              {cat} <span className="opacity-70">({count})</span>
            </button>
          ))}
          {filterCategory && (
            <button
              onClick={() => setFilterCategory("")}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-all"
            >
              Clear filter ×
            </button>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setShowAdd(!showAdd)}
        >
          Add Entry
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="space-y-3 border-accent/30">
          <h4 className="font-semibold text-text-heading text-sm">New Knowledge Entry</h4>
          <input
            type="text"
            placeholder="Title"
            value={addForm.title}
            onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <textarea
            placeholder="Content"
            value={addForm.content}
            onChange={(e) => setAddForm({ ...addForm, content: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
          />
          <div className="flex gap-3">
            <select
              value={addForm.category}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              className="px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Tags (comma-separated)"
              value={addForm.tags}
              onChange={(e) => setAddForm({ ...addForm, tags: e.target.value })}
              className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAdd}>
              Save Entry
            </Button>
          </div>
        </Card>
      )}

      {/* Entries list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Database size={40} />}
          title={searchQuery ? "No matching entries" : "Knowledge base is empty"}
          description={
            searchQuery
              ? "Try adjusting your search query or clearing filters."
              : "Add knowledge entries manually or let the system auto-extract from conversations."
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">{filtered.length} entries</p>
          {filtered.map((entry) => (
            <Card key={entry.id} hover className="group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-text-heading truncate">
                      {entry.title}
                    </h4>
                    <Badge variant={categoryColors[entry.category] ?? "neutral"}>
                      {entry.category}
                    </Badge>
                    {entry.verified && <Badge variant="success">✓ Verified</Badge>}
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2 mb-2">{entry.content}</p>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span>Confidence: {Math.round(entry.confidence * 100)}%</span>
                    <span>Retrieved: {entry.retrievalCount}×</span>
                    {entry.tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Tag size={10} />
                        {entry.tags.slice(0, 3).join(", ")}
                        {entry.tags.length > 3 && ` +${entry.tags.length - 3}`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-danger/10 text-danger"
                  onClick={() => setDeleteId(entry.id)}
                  aria-label={`Delete ${entry.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete Knowledge Entry"
        message="This will permanently remove this knowledge entry. This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
