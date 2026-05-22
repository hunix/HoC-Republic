import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Package, Search, Download, Star, Clock, Tag, Grid3X3,
  Filter, ExternalLink, RefreshCw, HardDrive,
  TrendingUp, Layers, Zap, Shield,
} from "lucide-react";
import {
  PageHeader, Card, Badge, StatCard, RpcStatus, Tabs,
  EmptyState, Button,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface ClawHubSkillStats {
  comments: number;
  downloads: number;
  installsAllTime: number;
  installsCurrent: number;
  stars: number;
  versions: number;
}

interface ClawHubSkillVersion {
  version: string;
  createdAt: number;
  changelog: string | null;
  license: string | null;
}

interface ClawHubSkill {
  slug: string;
  displayName: string;
  summary: string;
  tags: Record<string, string>;
  stats: ClawHubSkillStats;
  createdAt: number;
  updatedAt: number;
  latestVersion: ClawHubSkillVersion | null;
  metadata: { os: string[] | null; systems: string[] | null } | null;
}

interface StatsData {
  totalSkills: number;
  lastSyncAt: number;
  syncing: boolean;
  syncError: string | null;
  diskPath: string;
  topTags: { tag: string; count: number }[];
  categories: { name: string; count: number }[];
}

interface ListData {
  items: ClawHubSkill[];
  total: number;
}

// ─── Constants ──────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "downloads", label: "Most Downloaded" },
  { value: "newest", label: "Newest First" },
  { value: "stars", label: "Most Stars" },
  { value: "name", label: "Alphabetical" },
] as const;

const CATEGORY_ICONS: Record<string, string> = {
  "development": "💻", "ai-ml": "🤖", "security": "🔒", "productivity": "📋",
  "communication": "💬", "content-creative": "🎨", "research-education": "📚",
  "devops-infra": "🚀", "finance-business": "💰", "health-wellness": "⚕️",
  "self-improvement": "🧠", "testing-qa": "🧪", "web-api": "🌐",
  "data-analytics": "📊", "gaming": "🎮", "general": "⭐",
};

const PAGE_SIZE = 50;

const TABS = [
  { id: "browse", label: "Browse Skills" },
  { id: "categories", label: "Categories" },
  { id: "trending", label: "Trending Tags" },
];

// ─── Helpers ────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
  if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
  return String(n);
}

function timeAgo(ts: number): string {
  if (!ts) { return "—"; }
  const d = Date.now() - ts;
  const mins = Math.floor(d / 60_000);
  if (mins < 60) { return `${mins}m ago`; }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) { return `${hrs}h ago`; }
  const days = Math.floor(hrs / 24);
  if (days < 30) { return `${days}d ago`; }
  return new Date(ts).toLocaleDateString();
}

// ─── Skill Card ─────────────────────────────────────────────────

function SkillCard({ skill }: { skill: ClawHubSkill }) {
  const [installing, setInstalling] = useState(false);
  const tags = Object.keys(skill.tags).filter((t) => t !== "latest").slice(0, 4);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await rpc("skills.install", {
        name: skill.slug,
        installId: `clawhub-${skill.slug}`,
      });
    } catch {
      // Silently handle — install will show in UI
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Card hover className="flex flex-col gap-3 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text-heading text-sm truncate">
            {skill.displayName}
          </h3>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
            {skill.summary}
          </p>
        </div>
        <a
          href={`https://clawhub.ai/skills/${skill.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 rounded text-text-muted hover:text-accent transition-colors"
          aria-label="View on ClawHub"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-muted">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs text-text-muted mt-auto">
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3" /> {formatNumber(skill.stats.downloads)}
        </span>
        <span className="flex items-center gap-1">
          <Star className="w-3 h-3" /> {skill.stats.stars}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> {timeAgo(skill.updatedAt)}
        </span>
        {skill.latestVersion && (
          <Badge variant="neutral">{skill.latestVersion.version}</Badge>
        )}
      </div>

      {/* Install */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleInstall}
        disabled={installing}
        className="w-full"
      >
        {installing ? "Installing..." : "Install"}
      </Button>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export function ClawHubRegistryPage() {
  const [tab, setTab] = useState("browse");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<string>("downloads");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) { clearTimeout(searchTimer.current); }
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => { if (searchTimer.current) { clearTimeout(searchTimer.current); } };
  }, [search]);

  // Stats
  const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } =
    useRpc<StatsData>("republic.clawhub.stats", {}, [], { staleTimeMs: 30_000 });

  // Skills list
  const listParams = useMemo(() => {
    if (debouncedSearch) {
      return { __method: "republic.clawhub.search", query: debouncedSearch, offset, limit: PAGE_SIZE };
    }
    return {
      __method: "republic.clawhub.list",
      offset,
      limit: PAGE_SIZE,
      sort,
      ...(selectedCategory ? { category: selectedCategory } : {}),
      ...(selectedTag ? { tag: selectedTag } : {}),
    };
  }, [debouncedSearch, offset, sort, selectedCategory, selectedTag]);

  const rpcMethod = debouncedSearch ? "republic.clawhub.search" : "republic.clawhub.list";
  const { data: listData, loading: listLoading, error: listError, refetch: refetchList } =
    useRpc<ListData>(rpcMethod, listParams, [rpcMethod, offset, sort, selectedCategory, selectedTag, debouncedSearch]);

  const skills = listData?.items ?? [];
  const total = listData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const handleRefresh = useCallback(() => {
    refetchStats();
    refetchList();
  }, [refetchStats, refetchList]);

  const categories = stats?.categories ?? [];
  const topTags = stats?.topTags ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="ClawHub Skill Registry"
        description={`${stats?.totalSkills ? formatNumber(stats.totalSkills) : "24,000+"} community skills from clawhub.ai — browse, search & install`}
        icon={<Package size={28} />}
        actions={
          <div className="flex items-center gap-2">
            {stats?.syncing && (
              <Badge variant="info">
                <RefreshCw className="w-3 h-3 mr-1 inline animate-spin" />
                Syncing...
              </Badge>
            )}
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <RpcStatus loading={statsLoading && !stats} error={statsError} onRetry={refetchStats} />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard label="Total Skills" value={formatNumber(stats.totalSkills)} icon={<Package className="w-4 h-4" />} />
          <StatCard label="Categories" value={categories.length} icon={<Layers className="w-4 h-4" />} />
          <StatCard label="Tags" value={topTags.length} icon={<Tag className="w-4 h-4" />} />
          <StatCard label="Last Sync" value={timeAgo(stats.lastSyncAt)} icon={<Clock className="w-4 h-4" />} />
          <StatCard label="On Disk" value={stats.diskPath ? "✓" : "—"} icon={<HardDrive className="w-4 h-4" />} sub="republic-output/skills" />
          <StatCard label="Status" value={stats.syncing ? "Syncing" : stats.syncError ? "Error" : "Ready"} icon={<Shield className="w-4 h-4" />} />
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setOffset(0); }} />

      {/* ── Browse Skills ── */}
      {tab === "browse" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search 24,000+ skills..."
                className="w-full pl-9 pr-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-text-muted" />
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setOffset(0); }}
                className="bg-bg-input border border-border rounded-lg text-sm text-text-primary px-2 py-1.5 focus:outline-none focus:border-accent"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Category filter */}
            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setOffset(0); }}
                className="bg-bg-input border border-border rounded-lg text-sm text-text-primary px-2 py-1.5 focus:outline-none focus:border-accent"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {CATEGORY_ICONS[c.name] ?? "📦"} {c.name} ({c.count})
                  </option>
                ))}
              </select>
            )}

            {/* Tag filter */}
            {selectedTag && (
              <Badge variant="info">
                <Tag className="w-3 h-3 mr-1 inline" />
                {selectedTag}
                <button onClick={() => { setSelectedTag(""); setOffset(0); }} className="ml-1 hover:text-danger">×</button>
              </Badge>
            )}

            <Badge variant="neutral">{formatNumber(total)} results</Badge>
          </div>

          {/* Grid */}
          <RpcStatus loading={listLoading && skills.length === 0} error={listError} onRetry={refetchList} />

          {skills.length === 0 && !listLoading ? (
            <EmptyState
              icon={<Search className="w-8 h-8" />}
              title="No Skills Found"
              description={debouncedSearch ? "Try a different search term" : "Skills catalog is syncing — check back shortly"}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {skills.map((skill) => (
                <SkillCard key={skill.slug} skill={skill} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
              <span className="text-sm text-text-muted">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Categories ── */}
      {tab === "categories" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {categories.length === 0 ? (
            <EmptyState
              icon={<Grid3X3 className="w-8 h-8" />}
              title="Loading Categories"
              description="Catalog is syncing from ClawHub..."
            />
          ) : (
            categories.map((cat) => (
              <Card
                key={cat.name}
                hover
                className="cursor-pointer"
                onClick={() => {
                  setSelectedCategory(cat.name);
                  setTab("browse");
                  setOffset(0);
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{CATEGORY_ICONS[cat.name] ?? "📦"}</span>
                  <div>
                    <p className="font-semibold text-text-heading text-sm capitalize">
                      {cat.name.replace(/-/g, " ")}
                    </p>
                    <p className="text-xs text-text-muted">{formatNumber(cat.count)} skills</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Trending Tags ── */}
      {tab === "trending" && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" /> Top Tags
          </h3>
          {topTags.length === 0 ? (
            <EmptyState title="Syncing" description="Tag data populates after first sync." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {topTags.map((t) => (
                <button
                  key={t.tag}
                  onClick={() => {
                    setSelectedTag(t.tag);
                    setTab("browse");
                    setOffset(0);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-bg-secondary border border-border hover:border-accent text-sm text-text-secondary hover:text-accent transition-colors flex items-center gap-1.5"
                >
                  <Zap className="w-3 h-3" />
                  {t.tag}
                  <span className="text-text-muted text-xs">({formatNumber(t.count)})</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
