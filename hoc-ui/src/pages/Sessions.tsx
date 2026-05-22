import {
  Layers,
  Clock,
  MessageSquare,
  Trash2,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Card, Badge, Button, RpcStatus, DataTable } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useRpc, mutateRpc } from "@/lib/rpc";
import { useSessionStore } from "@/stores/sessions";

interface Session {
  key: string;
  kind?: string;
  displayName?: string;
  agentId?: string;
  label?: string;
  channel?: string;
  updatedAt?: number | null;
  totalTokens?: number;
  modelProvider?: string;
  model?: string;
  sessionId?: string;
}

function relativeTime(ts?: number | null): string {
  if (!ts) {
    return "—";
  }
  const diff = Date.now() - ts;
  if (diff < 60_000) {
    return `${Math.floor(diff / 1000)}s`;
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h`;
  }
  return `${Math.floor(diff / 86_400_000)}d`;
}

const PAGE_SIZE = 25;

export function SessionsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const { data, loading, refetch, error } = useRpc<{
    sessions: Session[];
    count: number;
  }>(
    "sessions.list",
    {
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      includeDerivedTitles: true,
    },
    [debouncedSearch, page],
  );

  const sessions = data?.sessions ?? [];
  const total = data?.count ?? sessions.length;

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeSession = useSessionStore((s) => s.removeSession);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 350);
  }, []);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  async function deleteSession(key: string) {
    setConfirmKey(null);
    removeSession(key);
    try {
      await mutateRpc("sessions.delete", { key });
      refetch();
    } catch {
      /* silent */
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = [
    {
      key: "name",
      label: "Session",
      render: (s: Session) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <MessageSquare size={13} className="text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-text-primary font-mono truncate max-w-[200px]">
              {s.displayName ?? s.label ?? s.key}
            </div>
            {s.kind && (
              <Badge variant="info" className="!text-[9px] mt-0.5">
                {s.kind}
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "agent",
      label: "Agent / Model",
      render: (s: Session) => (
        <div>
          <div className="text-xs text-text-secondary">{s.agentId ?? "—"}</div>
          {s.model && (
            <div className="text-[10px] text-text-muted">
              {s.modelProvider}/{s.model}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "tokens",
      label: "Tokens",
      className: "tabular-nums",
      render: (s: Session) => (
        <span className="text-xs text-text-muted">
          {s.totalTokens ? s.totalTokens.toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "channel",
      label: "Channel",
      render: (s: Session) => <span className="text-xs text-text-muted">{s.channel ?? "—"}</span>,
    },
    {
      key: "time",
      label: "Active",
      render: (s: Session) => (
        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
          <Clock size={11} /> {relativeTime(s.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      className: "w-16",
      render: (s: Session) => (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/chat?session=${encodeURIComponent(s.key)}`);
            }}
            className="p-1 rounded hover:bg-accent/10 text-text-muted hover:text-accent transition-colors"
            aria-label="Open in Chat"
          >
            <MessageSquare size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmKey(s.key);
            }}
            className="p-1 rounded hover:bg-danger-bg text-text-muted hover:text-danger transition-colors"
            aria-label={`Delete session ${s.displayName ?? s.label ?? s.key}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="animate-fade-in space-y-5 p-5">
        <PageHeader
          title="Sessions"
          description={`${total} session${total === 1 ? "" : "s"}`}
          icon={<Layers size={20} />}
          actions={
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={13} />}
              aria-label="Refresh"
              onClick={refetch}
            />
          }
        />

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search sessions…"
            className="w-full bg-bg-input border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-1 focus:ring-accent-glow transition-all"
          />
        </div>

        {/* Table */}
        <Card compact hover={false}>
          <DataTable
            columns={columns}
            data={sessions}
            keyFn={(s) => s.key}
            onRowClick={(s) => navigate(`/chat?session=${encodeURIComponent(s.key)}`)}
            emptyMessage="No sessions found"
            compact
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/20">
              <span className="text-[10px] text-text-muted">
                Page {page + 1}/{totalPages} · {total} total
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ChevronLeft size={13} />}
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ChevronRight size={13} />}
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Next page"
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmKey !== null}
        title="Delete session?"
        message={`Permanently delete "${confirmKey}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => confirmKey && void deleteSession(confirmKey)}
        onCancel={() => setConfirmKey(null)}
      />
    </>
  );
}
