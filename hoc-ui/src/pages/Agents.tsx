import {
  Bot,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Activity,
  MessageSquare,
  Calendar,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SortDir } from "@/components/ui";
import { PageHeader, Card, Badge, Button, StatCard, DetailModal, sortBy } from "@/components/ui";
import { mutateRpc } from "@/lib/rpc";
import { useAgentStore, type Agent } from "@/stores/agents";

type AgentSummary = Agent & {
  sessionCount?: number;
  lastActiveAt?: number;
  createdAt?: number;
  specialization?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatarUrl?: string;
  };
};

type SortKey = "name" | "status" | "sessionCount" | "model";
const PAGE_SIZE = 24;

function relTime(ts?: number): string {
  if (!ts) {
    return "—";
  }
  const d = Date.now() - ts;
  if (d < 60_000) {
    return `${Math.floor(d / 1000)}s`;
  }
  if (d < 3_600_000) {
    return `${Math.floor(d / 60_000)}m`;
  }
  if (d < 86_400_000) {
    return `${Math.floor(d / 3_600_000)}h`;
  }
  return `${Math.floor(d / 86_400_000)}d`;
}

export function AgentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<AgentSummary | null>(null);

  const { agents: rawAgents, loading } = useAgentStore();
  const agents = rawAgents as AgentSummary[];
  const totalFromServer = agents.length;

  const getLabel = (a: AgentSummary) => a.identity?.name ?? a.name ?? a.id;

  const filtered = search
    ? agents.filter((a) => {
        const label = getLabel(a).toLowerCase();
        return (
          label.includes(search.toLowerCase()) ||
          a.id.toLowerCase().includes(search.toLowerCase()) ||
          (a.model ?? "").toLowerCase().includes(search.toLowerCase())
        );
      })
    : agents;

  const sorted = sortBy(filtered, sortKey as keyof AgentSummary | null, sortDir);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageItems = sorted.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);

  const activeCount = agents.filter((a) => a.status === "active" || a.status === "online").length;

  function handleSort(key: SortKey, dir: SortDir) {
    setSortKey(key);
    setSortDir(dir);
    setPage(0);
  }

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Agents"
        description={`${totalFromServer} agent${totalFromServer === 1 ? "" : "s"}`}
        icon={<Bot size={20} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={13} />}
              aria-label="Refresh"
              onClick={() => useAgentStore.getState().setLoading(true)}
            />
            <Button
              icon={<Plus size={14} />}
              size="sm"
              onClick={async () => {
                await mutateRpc("republic.simulation.agent.create", {});
              }}
            >
              New
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={totalFromServer} icon={<Bot size={14} />} />
        <StatCard label="Active" value={activeCount} icon={<Activity size={14} />} />
        <StatCard label="Filtered" value={filtered.length} icon={<Search size={14} />} />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search by name, ID, or model…"
          className="w-full bg-bg-input border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-1 focus:ring-accent-glow transition-all"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span className="ml-3 text-xs text-text-muted">Loading agents…</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Sort bar */}
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-text-muted">
            <span>Sort:</span>
            {(["name", "status", "sessionCount", "model"] as SortKey[]).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => handleSort(k, sortKey === k && sortDir === "asc" ? "desc" : "asc")}
                className={`px-2 py-0.5 rounded-lg border transition-colors ${
                  sortKey === k
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border hover:border-border-focus"
                }`}
              >
                {k} {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
          </div>

          {sorted.length === 0 ? (
            <div className="text-center py-16">
              <Bot size={32} className="text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-text-muted">
                {agents.length === 0 ? "No agents configured." : "No agents match your search."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[10px] text-text-muted px-1">
                <span>
                  {clampedPage * PAGE_SIZE + 1}–
                  {Math.min((clampedPage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} agents
                </span>
                <span>
                  Page {clampedPage + 1}/{totalPages}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pageItems.map((agent) => {
                  const isActive = agent.status === "active" || agent.status === "online";
                  return (
                    <Card
                      key={agent.id}
                      compact
                      className="group relative cursor-pointer hover:border-accent/40 transition-all"
                      onClick={() => setSelected(agent)}
                    >
                      <div className="flex items-start gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-sm shrink-0">
                          {agent.identity?.emoji ?? <Bot size={16} className="text-accent" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xs font-semibold text-text-heading truncate">
                            {getLabel(agent)}
                          </h3>
                          <p className="text-[10px] text-text-muted font-mono truncate">
                            {agent.id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant={isActive ? "success" : "neutral"} dot>
                          {agent.status ?? "configured"}
                        </Badge>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted">
                          {typeof agent.sessionCount === "number" && (
                            <span>{agent.sessionCount} sess</span>
                          )}
                          {agent.lastActiveAt && <span>{relTime(agent.lastActiveAt)}</span>}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={13} />}
                    disabled={clampedPage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="Previous page"
                  />
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const p =
                        totalPages <= 7
                          ? i
                          : clampedPage < 4
                            ? i
                            : clampedPage > totalPages - 5
                              ? totalPages - 7 + i
                              : clampedPage - 3 + i;
                      return (
                        <button
                          type="button"
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-7 h-7 rounded-lg text-[10px] transition-colors ${
                            p === clampedPage
                              ? "bg-accent text-white"
                              : "text-text-muted hover:bg-bg-card-hover"
                          }`}
                        >
                          {p + 1}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronRight size={13} />}
                    disabled={clampedPage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    aria-label="Next page"
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Detail Modal */}
      <DetailModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? (selected.identity?.name ?? selected.name ?? selected.id) : ""}
        subtitle={selected?.id}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-xl">
                {selected.identity?.emoji ?? <Bot size={22} className="text-accent" />}
              </div>
              <div>
                <Badge
                  variant={
                    selected.status === "active" || selected.status === "online"
                      ? "success"
                      : "neutral"
                  }
                  dot
                >
                  {selected.status ?? "configured"}
                </Badge>
                {selected.identity?.theme && (
                  <p className="text-[10px] text-text-muted mt-1">{selected.identity.theme}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              {[
                { label: "Agent ID", value: selected.id },
                { label: "Model", value: selected.model ?? "—" },
                { label: "Sessions", value: String(selected.sessionCount ?? "—") },
                { label: "Last Active", value: relTime(selected.lastActiveAt) },
                {
                  label: "Created",
                  value: selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between py-1 border-b border-border/20"
                >
                  <span className="text-text-muted">{row.label}</span>
                  <span className="text-text-secondary font-medium font-mono truncate max-w-[180px]">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                size="sm"
                icon={<MessageSquare size={13} />}
                onClick={() => navigate(`/chat?agent=${selected.id}`)}
              >
                Open Session
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Calendar size={13} />}
                onClick={() => navigate(`/sessions?agent=${selected.id}`)}
              >
                View History
              </Button>
            </div>
          </div>
        )}
      </DetailModal>
    </div>
  );
}
