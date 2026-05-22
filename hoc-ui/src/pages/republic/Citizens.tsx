import { Users, Search, Star, Zap, Cpu, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Card, Badge, StatCard, Button , RpcStatus } from "@/components/ui";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useRpc } from "@/lib/rpc";

type CitizenStatus = "Active" | "Idle" | "Sleeping" | "Error";

interface Citizen {
  id: string;
  name: string;
  specialization?: string;
  role?: string;
  intelligence?: number;
  mastery?: number;
  autonomy?: number;
  status: string;
  level?: number;
  tasksCompleted?: number;
  node?: string;
  avatar?: string;
  avatarUrl?: string;
  skills?: string[];
  projectsCreated?: number;
  memoryTokens?: number;
  model?: string;
  age?: number;
  createdAt?: number;
}

const STATUS_BADGE: Record<string, "success" | "neutral" | "info" | "danger"> = {
  Active: "success",
  active: "success",
  Idle: "neutral",
  idle: "neutral",
  Sleeping: "info",
  sleeping: "info",
  Error: "danger",
  error: "danger",
};

const PAGE_SIZE = 50;

function eliteScore(citizen: Citizen): number {
  return ((citizen.intelligence ?? 0) + (citizen.mastery ?? 0) + (citizen.autonomy ?? 0)) / 3;
}

const EliteScore = React.memo(function EliteScore({ citizen }: { citizen: Citizen }) {
  const score = eliteScore(citizen);
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Star size={12} className={score >= 90 ? "text-warning fill-warning" : "text-text-muted"} />
      <span className="text-xs font-semibold">{score.toFixed(0)}%</span>
    </div>
  );
});

/** Memoized citizen card — prevents re-rendering 50 cards when only one is hovered */
const CitizenCard = React.memo(function CitizenCard({
  citizen,
  onOpen,
  onOpenNewTab,
}: {
  citizen: Citizen;
  onOpen: (c: Citizen) => void;
  onOpenNewTab: (e: React.MouseEvent, c: Citizen) => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-all hover:border-accent/50 hover:bg-accent/5 group"
      onClick={() => onOpen(citizen)}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
          {citizen.avatarUrl ? (
            <img
              src={citizen.avatarUrl}
              alt={citizen.name}
              className="w-full h-full object-cover rounded-xl"
              loading="lazy"
            />
          ) : (
            (citizen.avatar ?? "🤖")
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-text-heading text-sm truncate">
              {citizen.name}
            </span>
            <Badge variant={STATUS_BADGE[citizen.status] ?? "neutral"}>{citizen.status}</Badge>
          </div>
          <p className="text-xs text-text-muted truncate">
            {citizen.specialization ?? "—"} · Lv {citizen.level ?? "?"} · {citizen.node ?? "gateway"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <EliteScore citizen={citizen} />
          <button
            type="button"
            title="Open in new tab"
            aria-label="Open citizen detail in new tab"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-bg-input text-text-muted hover:text-accent"
            onClick={(e) => onOpenNewTab(e, citizen)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15,3 21,3 21,9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>
      </div>
    </Card>
  );
});

export function CitizensPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [statusFilter, setStatusFilter] = useState<CitizenStatus | "All">("All");
  const [page, setPage] = useState(0);

  const { data, loading, refetch, error } = useRpc<{
    citizens?: Citizen[];
    total?: number;
  }>("republic.population.list", { limit: 10000 });

  // Stable reference — prevents downstream useMemos from recomputing on every render
  const allCitizens = useMemo(() => data?.citizens ?? [], [data]);
  const totalFromServer = data?.total ?? allCitizens.length;

  // Memoized filtering — only recomputes when data, filter, or debounced search changes
  const filtered = useMemo(() => {
    const lowerSearch = debouncedSearch.toLowerCase();
    return allCitizens.filter((c) => {
      if (statusFilter !== "All" && c.status?.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (
        lowerSearch &&
        !c.name?.toLowerCase().includes(lowerSearch) &&
        !(c.specialization ?? "").toLowerCase().includes(lowerSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [allCitizens, statusFilter, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);

  // Memoized page slice — prevents recomputing on unrelated state changes
  const pageItems = useMemo(
    () => filtered.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE),
    [filtered, clampedPage],
  );

  // Memoized stats
  const stats = useMemo(() => {
    const active = allCitizens.filter((c) => c.status?.toLowerCase() === "active").length;
    const elite = allCitizens.filter((c) => eliteScore(c) >= 90).length;
    const avgLevel =
      allCitizens.length > 0
        ? (allCitizens.reduce((s, c) => s + (c.level ?? 0), 0) / allCitizens.length).toFixed(1)
        : "—";
    return { active, elite, avgLevel };
  }, [allCitizens]);

  const openDetail = useCallback((c: Citizen) => navigate(`/republic/citizens/${c.id}`), [navigate]);
  const openNewTab = useCallback((e: React.MouseEvent, c: Citizen) => {
    e.stopPropagation();
    window.open(`/republic/citizens/${c.id}`, "_blank");
  }, []);

  // Loading/error guard — AFTER all hooks (Error #310)
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Citizens"
        description={`Browse, search, and inspect all ${totalFromServer.toLocaleString()} republic citizens. Click any citizen to view their full profile.`}
        icon={<Users size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Citizens"
          value={totalFromServer.toLocaleString()}
          icon={<Users size={16} />}
        />
        <StatCard label="Active Now" value={stats.active} icon={<Zap size={16} />} />
        <StatCard label="Elite Citizens" value={stats.elite} icon={<Star size={16} />} />
        <StatCard label="Avg Level" value={stats.avgLevel} icon={<Cpu size={16} />} />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full pl-9 pr-4 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder="Search citizens..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {(["All", "Active", "Idle", "Sleeping", "Error"] as (CitizenStatus | "All")[]).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "primary" : "outline"}
            size="sm"
            onClick={() => {
              setStatusFilter(s);
              setPage(0);
            }}
          >
            {s}
          </Button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span className="ml-3 text-sm text-text-muted">Loading citizens…</span>
        </div>
      )}

      {!loading && (
        <div>
          {filtered.length === 0 ? (
            <Card className="py-12 text-center">
              <Users size={32} className="text-text-muted/30 mx-auto mb-3" />
              <p className="text-sm text-text-muted">
                {allCitizens.length === 0
                  ? "No citizens found. The republic simulation may not be running."
                  : "No citizens match your filters."}
              </p>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-text-muted mb-3 px-1">
                <span>
                  Showing {clampedPage * PAGE_SIZE + 1}–
                  {Math.min((clampedPage + 1) * PAGE_SIZE, filtered.length)} of{" "}
                  {filtered.length.toLocaleString()} citizens
                </span>
                {filtered.length !== allCitizens.length && (
                  <span className="text-accent">
                    (filtered from {allCitizens.length.toLocaleString()} total)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {pageItems.map((c) => (
                  <CitizenCard
                    key={c.id}
                    citizen={c}
                    onOpen={openDetail}
                    onOpenNewTab={openNewTab}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<ChevronLeft size={14} />}
                    disabled={clampedPage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-text-muted">
                    Page {clampedPage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clampedPage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    Next <ChevronRight size={14} className="ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
