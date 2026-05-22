/**
 * RegistryExplorer.tsx — Dynamic Registry Management UI
 *
 * Full CRUD explorer for the dynamic registry system.
 * Browse, search, create, edit, enable/disable, and version-track
 * all prompt templates, tool definitions, knowledge seeds, and more.
 */

import {
  Database,
  Search,
  Plus,
  Trash2,
  History,
  Download,
  Upload,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ChevronDown,
  X,
  Save,
  Eye,
  FileText,
  Wrench,
  BookOpen,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  Tabs,
  EmptyState,
  ConfirmDialog,
  Alert,
} from "@/components/ui";
import { RpcStatus } from "@/components/ui";
import { useRpc, rpc, mutateRpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface RegistryEntry {
  id: string;
  domain: string;
  category?: string;
  enabled: boolean;
  priority: number;
  version: number;
  data: unknown;
  metadata?: {
    tags?: string[];
    description?: string;
    createdBy?: string;
    source?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface RegistryStats {
  totalEntries: number;
  totalDomains: number;
  enabledCount: number;
  disabledCount: number;
  domainBreakdown: Array<{ domain: string; count: number }>;
  sourceBreakdown: Array<{ source: string; count: number }>;
}

interface HistoryEntry {
  version: number;
  data: unknown;
  changedBy: string;
  changedAt: string;
}

// Domain icons & colors
const DOMAIN_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  prompts: { icon: <Sparkles size={14} />, color: "text-purple", label: "Prompts" },
  tools: { icon: <Wrench size={14} />, color: "text-accent", label: "Tools" },
  knowledge: { icon: <BookOpen size={14} />, color: "text-success", label: "Knowledge" },
  workflows: { icon: <FileText size={14} />, color: "text-info", label: "Workflows" },
};

function getDomainMeta(domain: string) {
  return (
    DOMAIN_META[domain] ?? { icon: <Database size={14} />, color: "text-text-muted", label: domain }
  );
}

// ─── Component ──────────────────────────────────────────────────

export function RegistryExplorerPage() {
  // ─── State ───────────────────────────────────────────────────
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<RegistryEntry | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editJson, setEditJson] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RegistryEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New entry form state
  const [newId, setNewId] = useState("");
  const [newDomain, setNewDomain] = useState("prompts");
  const [newCategory, setNewCategory] = useState("");
  const [newPriority, setNewPriority] = useState(100);
  const [newData, setNewData] = useState("{}");
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState("");

  // Import state
  const [importJson, setImportJson] = useState("");

  // ─── Data fetching ───────────────────────────────────────────
  const listParams = useMemo(
    () => ({
      domain: selectedDomain === "all" ? undefined : selectedDomain,
      limit: 200,
    }),
    [selectedDomain],
  );

  const {
    data: listData,
    loading: listLoading,
    error: listError,
    refetch,
  } = useRpc<{ entries: RegistryEntry[]; count: number }>("republic.registry.list", listParams);

  const { data: statsData } = useRpc<RegistryStats>("republic.registry.stats", {});

  const { data: domainsData } = useRpc<{ domains: Record<string, string> }>(
    "republic.registry.domains",
    {},
  );

  const historyParams = useMemo(
    () =>
      selectedEntry && showHistory
        ? { id: selectedEntry.id, domain: selectedEntry.domain, limit: 20 }
        : undefined,
    [selectedEntry, showHistory],
  );

  const { data: historyData, loading: historyLoading } = useRpc<{ history: HistoryEntry[] }>(
    "republic.registry.history",
    historyParams,
  );

  const searchParams = useMemo(
    () => (searchQuery.length >= 2 ? { query: searchQuery, limit: 50 } : undefined),
    [searchQuery],
  );

  const { data: searchData, loading: searchLoading } = useRpc<{
    entries: RegistryEntry[];
    count: number;
  }>("republic.registry.search", searchParams);

  // ─── Derived ─────────────────────────────────────────────────
  const entries = searchQuery.length >= 2 ? (searchData?.entries ?? []) : (listData?.entries ?? []);

  const domainList = useMemo(
    () =>
      domainsData?.domains
        ? Object.values(domainsData.domains)
        : ["prompts", "tools", "knowledge", "workflows"],
    [domainsData],
  );

  const domainTabs = useMemo(
    () => [
      { id: "all", label: "All", count: statsData?.totalEntries ?? 0 },
      ...domainList.map((d) => ({
        id: d,
        label: getDomainMeta(d).label,
        count: statsData?.domainBreakdown?.find((b) => b.domain === d)?.count ?? 0,
      })),
    ],
    [domainList, statsData],
  );

  // ─── Actions ─────────────────────────────────────────────────
  const clearMessages = useCallback(() => {
    setActionError(null);
    setActionSuccess(null);
  }, []);

  const handleToggleEnabled = useCallback(
    async (entry: RegistryEntry) => {
      clearMessages();
      try {
        await mutateRpc("republic.registry.enable", {
          id: entry.id,
          domain: entry.domain,
          enabled: !entry.enabled,
        });
        setActionSuccess(`${entry.id} ${entry.enabled ? "disabled" : "enabled"}`);
        refetch();
      } catch (err) {
        setActionError(`Toggle failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [clearMessages, refetch],
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      return;
    }
    clearMessages();
    try {
      await mutateRpc("republic.registry.remove", {
        id: confirmDelete.id,
        domain: confirmDelete.domain,
      });
      setActionSuccess(`Deleted: ${confirmDelete.id}`);
      setConfirmDelete(null);
      if (selectedEntry?.id === confirmDelete.id) {
        setSelectedEntry(null);
      }
      refetch();
    } catch (err) {
      setActionError(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
      setConfirmDelete(null);
    }
  }, [confirmDelete, clearMessages, refetch, selectedEntry]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedEntry) {
      return;
    }
    clearMessages();
    try {
      const parsed = JSON.parse(editJson);
      await mutateRpc("republic.registry.upsert", {
        id: selectedEntry.id,
        domain: selectedEntry.domain,
        data: parsed,
        category: selectedEntry.category,
        priority: selectedEntry.priority,
        metadata: selectedEntry.metadata,
      });
      setActionSuccess(`Saved: ${selectedEntry.id} (v${selectedEntry.version + 1})`);
      setEditMode(false);
      refetch();
    } catch (err) {
      setActionError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [selectedEntry, editJson, clearMessages, refetch]);

  const handleCreate = useCallback(async () => {
    clearMessages();
    try {
      const parsed = JSON.parse(newData);
      await mutateRpc("republic.registry.upsert", {
        id: newId,
        domain: newDomain,
        data: parsed,
        category: newCategory || undefined,
        priority: newPriority,
        metadata: {
          description: newDescription || undefined,
          tags: newTags ? newTags.split(",").map((t) => t.trim()) : undefined,
          createdBy: "ui",
          source: "user",
        },
      });
      setActionSuccess(`Created: ${newId} in ${newDomain}`);
      setShowCreate(false);
      setNewId("");
      setNewData("{}");
      setNewDescription("");
      setNewTags("");
      setNewCategory("");
      refetch();
    } catch (err) {
      setActionError(`Create failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [
    newId,
    newDomain,
    newCategory,
    newPriority,
    newData,
    newDescription,
    newTags,
    clearMessages,
    refetch,
  ]);

  const handleExport = useCallback(async () => {
    clearMessages();
    try {
      const res = (await rpc("republic.registry.export", {
        domain: selectedDomain === "all" ? undefined : selectedDomain,
      })) as { entries: RegistryEntry[] };
      const blob = new Blob([JSON.stringify(res.entries, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `registry-${selectedDomain}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setActionSuccess("Export downloaded");
    } catch (err) {
      setActionError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [selectedDomain, clearMessages]);

  const handleImport = useCallback(async () => {
    clearMessages();
    try {
      const parsed = JSON.parse(importJson);
      const result = (await mutateRpc("republic.registry.import", {
        entries: Array.isArray(parsed) ? parsed : [parsed],
      })) as { imported: number; skipped: number };
      setActionSuccess(`Imported ${result.imported}, skipped ${result.skipped}`);
      setShowImport(false);
      setImportJson("");
      refetch();
    } catch (err) {
      setActionError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [importJson, clearMessages, refetch]);

  // ─── Loading guard ───────────────────────────────────────────
  if (listLoading && !listData) {
    return <RpcStatus loading={true} error={null} onRetry={refetch} />;
  }
  if (listError && !listData) {
    return <RpcStatus loading={false} error={listError} onRetry={refetch} />;
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Dynamic Registry"
        description={`${statsData?.totalEntries ?? 0} entries across ${statsData?.totalDomains ?? 0} domains — prompts, tools, knowledge, all editable`}
        icon={<Database size={28} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Upload size={14} />}
              onClick={() => setShowImport(true)}
            >
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={14} />}
              onClick={handleExport}
            >
              Export
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowCreate(true)}
            >
              New Entry
            </Button>
          </div>
        }
      />

      {/* Alerts */}
      {actionError && <Alert variant="danger">{actionError}</Alert>}
      {actionSuccess && <Alert variant="success">{actionSuccess}</Alert>}

      {/* Stats cards */}
      {statsData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Entries"
            value={statsData.totalEntries}
            icon={<Database size={14} />}
          />
          <StatCard label="Domains" value={statsData.totalDomains} icon={<BarChart3 size={14} />} />
          <StatCard
            label="Enabled"
            value={statsData.enabledCount}
            icon={<ToggleRight size={14} />}
          />
          <StatCard
            label="Disabled"
            value={statsData.disabledCount}
            icon={<ToggleLeft size={14} />}
          />
        </div>
      )}

      {/* Search + Domain Tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Full-text search entries..."
            className="w-full bg-bg-input border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-2 focus:ring-accent-glow transition-all"
          />
          {searchLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted animate-pulse">
              Searching…
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={refetch}
          aria-label="Refresh"
        >
          Refresh
        </Button>
      </div>

      <Tabs tabs={domainTabs} active={selectedDomain} onChange={setSelectedDomain} />

      {/* Main Layout: List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry List */}
        <div className="lg:col-span-2 space-y-2">
          {entries.length === 0 ? (
            <EmptyState
              icon={<Database size={40} />}
              title="No registry entries"
              description={
                searchQuery
                  ? "No entries match your search"
                  : "Create your first entry to get started"
              }
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => setShowCreate(true)}
                >
                  Create Entry
                </Button>
              }
            />
          ) : (
            entries.map((entry) => {
              const dm = getDomainMeta(entry.domain);
              const isSelected =
                selectedEntry?.id === entry.id && selectedEntry?.domain === entry.domain;
              return (
                <Card
                  key={`${entry.domain}:${entry.id}`}
                  className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-accent/50" : ""}`}
                  hover
                  onClick={() => {
                    setSelectedEntry(entry);
                    setEditMode(false);
                    setShowHistory(false);
                    setEditJson(JSON.stringify(entry.data, null, 2));
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex-shrink-0 ${dm.color}`}>{dm.icon}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-heading truncate">
                            {entry.id}
                          </span>
                          <Badge variant={entry.enabled ? "success" : "neutral"}>
                            {entry.enabled ? "on" : "off"}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-muted truncate">
                          {entry.metadata?.description ?? entry.category ?? entry.domain}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-text-muted">v{entry.version}</span>
                      <Badge variant="info" className="!text-[10px]">
                        {dm.label}
                      </Badge>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-bg-card-hover transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleEnabled(entry);
                        }}
                        aria-label={entry.enabled ? "Disable" : "Enable"}
                      >
                        {entry.enabled ? (
                          <ToggleRight size={16} className="text-success" />
                        ) : (
                          <ToggleLeft size={16} className="text-text-muted" />
                        )}
                      </button>
                    </div>
                  </div>
                  {entry.metadata?.tags && entry.metadata.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {entry.metadata.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] bg-bg-input text-text-muted px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        <div className="space-y-4">
          {selectedEntry ? (
            <Card className="sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-heading truncate">{selectedEntry.id}</h3>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-bg-card-hover"
                  onClick={() => setSelectedEntry(null)}
                  aria-label="Close detail"
                >
                  <X size={14} className="text-text-muted" />
                </button>
              </div>

              {/* Metadata */}
              <div className="space-y-2 text-xs mb-4">
                <div className="flex justify-between">
                  <span className="text-text-muted">Domain</span>
                  <Badge variant="info">{selectedEntry.domain}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Category</span>
                  <span className="text-text-primary">{selectedEntry.category ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Priority</span>
                  <span className="text-text-primary">{selectedEntry.priority}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Version</span>
                  <span className="text-text-primary">v{selectedEntry.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Source</span>
                  <Badge
                    variant={selectedEntry.metadata?.source === "builtin" ? "purple" : "neutral"}
                  >
                    {selectedEntry.metadata?.source ?? "unknown"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Updated</span>
                  <span className="text-text-primary">
                    {new Date(selectedEntry.updatedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Button
                  variant={editMode ? "primary" : "outline"}
                  size="sm"
                  icon={editMode ? <Save size={12} /> : <Eye size={12} />}
                  onClick={() => {
                    if (editMode) {
                      void handleSaveEdit();
                    } else {
                      setEditMode(true);
                      setEditJson(JSON.stringify(selectedEntry.data, null, 2));
                    }
                  }}
                >
                  {editMode ? "Save" : "Edit"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<History size={12} />}
                  onClick={() => setShowHistory(!showHistory)}
                >
                  History
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={12} />}
                  onClick={() => setConfirmDelete(selectedEntry)}
                >
                  Delete
                </Button>
              </div>

              {/* Data view/edit */}
              {editMode ? (
                <textarea
                  value={editJson}
                  onChange={(e) => setEditJson(e.target.value)}
                  className="w-full h-64 bg-bg-input border border-border rounded-lg p-3 text-xs font-mono text-text-primary resize-y focus:ring-2 focus:ring-accent-glow outline-none"
                  spellCheck={false}
                />
              ) : (
                <pre className="w-full max-h-64 overflow-auto bg-bg-input border border-border rounded-lg p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap break-words">
                  {JSON.stringify(selectedEntry.data, null, 2)}
                </pre>
              )}

              {/* Version History */}
              {showHistory && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-text-heading flex items-center gap-2">
                    <History size={12} /> Version History
                  </h4>
                  {historyLoading ? (
                    <div className="text-xs text-text-muted animate-pulse">Loading history…</div>
                  ) : (
                    (historyData?.history ?? []).map((h) => (
                      <div
                        key={h.version}
                        className="bg-bg-input rounded-lg p-2 text-xs border border-border/50 cursor-pointer hover:border-border-hover transition-colors"
                        onClick={() => setEditJson(JSON.stringify(h.data, null, 2))}
                      >
                        <div className="flex justify-between mb-1">
                          <span className="font-semibold text-text-heading">v{h.version}</span>
                          <span className="text-text-muted">
                            {new Date(h.changedAt).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-text-muted">by {h.changedBy}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          ) : (
            <Card className="text-center py-12">
              <Eye size={32} className="mx-auto mb-3 text-text-muted opacity-40" />
              <p className="text-sm text-text-muted">Select an entry to view details</p>
            </Card>
          )}
        </div>
      </div>

      {/* ─── Create Modal ─────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-text-heading">Create Registry Entry</h3>
              <button
                type="button"
                className="p-1 rounded hover:bg-bg-card-hover"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
              >
                <X size={14} className="text-text-muted" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">ID *</label>
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-glow"
                  placeholder="my_entry_id"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Domain *</label>
                <div className="relative">
                  <select
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none appearance-none focus:ring-2 focus:ring-accent-glow"
                  >
                    {domainList.map((d) => (
                      <option key={d} value={d}>
                        {getDomainMeta(d).label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Category</label>
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-glow"
                    placeholder="template"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Priority</label>
                  <input
                    type="number"
                    value={newPriority}
                    onChange={(e) => setNewPriority(Number(e.target.value))}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-glow"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Description</label>
                <input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-glow"
                  placeholder="What this entry does"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Tags (comma separated)</label>
                <input
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-glow"
                  placeholder="prompt, mandate, core"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Data (JSON) *</label>
                <textarea
                  value={newData}
                  onChange={(e) => setNewData(e.target.value)}
                  className="w-full h-32 bg-bg-input border border-border rounded-lg p-3 text-xs font-mono text-text-primary resize-y outline-none focus:ring-2 focus:ring-accent-glow"
                  spellCheck={false}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={handleCreate}
                  disabled={!newId || !newDomain}
                >
                  Create
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Import Modal ─────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-text-heading">Import Registry Entries</h3>
              <button
                type="button"
                className="p-1 rounded hover:bg-bg-card-hover"
                onClick={() => setShowImport(false)}
                aria-label="Close"
              >
                <X size={14} className="text-text-muted" />
              </button>
            </div>
            <p className="text-xs text-text-muted mb-3">
              Paste a JSON array of registry entries to import:
            </p>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="w-full h-48 bg-bg-input border border-border rounded-lg p-3 text-xs font-mono text-text-primary resize-y outline-none focus:ring-2 focus:ring-accent-glow"
              placeholder='[{ "id": "...", "domain": "prompts", "data": {...} }]'
              spellCheck={false}
            />
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setShowImport(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Upload size={14} />}
                onClick={handleImport}
                disabled={!importJson.trim()}
              >
                Import
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Delete Confirmation ──────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Registry Entry"
        message={`Are you sure you want to delete "${confirmDelete?.id}" from domain "${confirmDelete?.domain}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
