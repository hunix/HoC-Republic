import { Globe, Search, RefreshCw, ExternalLink, Newspaper, Shield, Radio, AlertTriangle } from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  Card,
  Badge,
  StatCard,
  Button,
  RpcStatus,
  Tabs,
  ProgressBar,
} from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────────

type IntelCategory = "All" | "Politics" | "Technology" | "Economy" | "Environment" | "Security";

const CATEGORY_BADGE: Record<string, "info" | "warning" | "success" | "danger" | "purple" | "neutral"> = {
  Politics: "info",
  Technology: "purple",
  Economy: "warning",
  Environment: "success",
  Security: "danger",
};

interface FeedItem {
  id: string;
  headline: string;
  source: string;
  category: string;
  sentiment: string;
  ts: number;
  region: string;
}

interface SourceProfile {
  id: string;
  honesty: number;
  accuracy: number;
  tendency: string;
  confirmRate: number;
  conflictRate: number;
  trustScore: number;
  lastUpdated: string;
}

interface NieEvent {
  type: string;
  vesselName?: string;
  attackerCountry?: string;
  defenderCountry?: string;
  country?: string;
  action?: string;
  strikeType?: string;
  assetType?: string;
  quantity?: number;
  locationHint?: string;
  status?: string;
  headline: string;
  timestamp: number;
  resolution?: string;
}

const FALLBACK_FEEDS: FeedItem[] = [
  {
    id: "F1",
    headline: "G7 nations agree on joint AI governance framework",
    source: "Reuters",
    category: "Politics",
    sentiment: "Positive",
    ts: Date.now() - 1800000,
    region: "Global",
  },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 3600000) {return `${Math.round(diff / 60000)}m ago`;}
  if (diff < 86400000) {return `${Math.round(diff / 3600000)}h ago`;}
  return `${Math.round(diff / 86400000)}d ago`;
}

function TrustBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "text-success" : pct >= 55 ? "text-warning" : "text-danger";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-text-muted truncate">{label}</span>
      <div className="flex-1">
        <ProgressBar value={pct} max={100} size="sm" />
      </div>
      <span className={`w-8 text-right font-mono ${color}`}>{pct}%</span>
    </div>
  );
}

function TendencyBadge({ tendency }: { tendency: string }) {
  const v = tendency.includes("west") || tendency.includes("ukraine") || tendency.includes("eu") || tendency.includes("japan")
    ? "info"
    : tendency.includes("china") || tendency.includes("russia") || tendency.includes("arab")
    ? "warning"
    : tendency === "neutral" || tendency === "academic"
    ? "neutral"
    : "purple";
  return <Badge variant={v}>{tendency.replace("pro-", "→ ").replace("-", " ")}</Badge>;
}

// ─── Main Component ───────────────────────────────────────────────

export function WorldIntelPage() {
  const [category, setCategory] = useState<IntelCategory>("All");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("feed");

  // ── Data hooks (all at top) ──
  const { data, loading, error, refetch } = useRpc<{
    news?: Array<{
      id?: string;
      headline?: string;
      title?: string;
      source?: string;
      category?: string;
      severity?: string;
      sentiment?: string;
      ts?: number;
      timestamp?: number;
      region?: string;
      country?: string;
    }>;
  }>("republic.worldintel.news", { limit: 30 });

  const { data: sourcesData, loading: sourcesLoading, error: sourcesError, refetch: sourcesRefetch } =
    useRpc<{ sources?: SourceProfile[] }>("republic.worldintel.sources", {});

  const { data: nieData, loading: nieLoading, error: nieError, refetch: nieRefetch } =
    useRpc<{ events?: NieEvent[] }>("republic.worldintel.nie-log", { limit: 50 });

  const { data: conflictsData, loading: conflictsLoading, error: conflictsError, refetch: conflictsRefetch } =
    useRpc<{ conflicts?: NieEvent[] }>("republic.worldintel.conflicts", { limit: 20 });

  // ── Guard ──
  if (loading || error) {return <RpcStatus loading={loading} error={error} onRetry={refetch} />;}

  // ── Feed tab data ──
  const FEEDS: FeedItem[] =
    (data?.news ?? []).length > 0
      ? (data?.news ?? []).map((n, i) => ({
          id: n.id ?? `F${i}`,
          headline: n.headline ?? n.title ?? "—",
          source: n.source ?? "Intel",
          category: n.category ?? n.severity ?? "Security",
          sentiment: n.sentiment ?? "Neutral",
          ts: n.ts ?? n.timestamp ?? Date.now(),
          region: n.region ?? n.country ?? "Global",
        }))
      : FALLBACK_FEEDS;

  const filtered = FEEDS.filter((f) => {
    const matchCat = category === "All" || f.category === category;
    const matchSearch = !search || f.headline.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const sources = sourcesData?.sources ?? [];
  const nieEvents = nieData?.events ?? [];
  const conflicts = conflictsData?.conflicts ?? [];

  const TABS = [
    { id: "feed", label: "Intel Feed" },
    { id: "sources", label: `Sources (${sources.length || "…"})` },
    { id: "nie", label: `Extractions (${nieEvents.length || "…"})` },
    { id: "conflicts", label: conflicts.length > 0 ? `⚠️ Conflicts (${conflicts.length})` : "Conflicts" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="World Intel"
        description="Global intelligence feed powered by live RSS + News Intelligence Extractor"
        icon={<Globe size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Feed Items" value={FEEDS.length} icon={<Newspaper size={16} />} />
        <StatCard
          label="Security Alerts"
          value={FEEDS.filter((f) => f.category === "Security").length}
          icon={<Shield size={16} />}
        />
        <StatCard
          label="NIE Extractions"
          value={nieEvents.length}
          icon={<Radio size={16} />}
          sub="carrier/strike/arsenal"
        />
        <StatCard
          label="Claim Conflicts"
          value={conflicts.length}
          icon={<AlertTriangle size={16} />}
          sub={conflicts.length > 0 ? "sources disagree" : "all clear"}
        />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Feed Tab ── */}
      {tab === "feed" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="w-full pl-9 pr-4 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                placeholder="Search intel..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["All", "Politics", "Technology", "Economy", "Environment", "Security"] as IntelCategory[]).map(
              (cat) => (
                <Button
                  key={cat}
                  variant={category === cat ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </Button>
              ),
            )}
          </div>
          <div className="space-y-3">
            {filtered.map((f) => (
              <Card key={f.id} className="hover:border-accent/40 transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={CATEGORY_BADGE[f.category] ?? "neutral"}>{f.category}</Badge>
                      <Badge
                        variant={
                          f.sentiment === "Positive" ? "success" : f.sentiment === "Negative" ? "danger" : "neutral"
                        }
                      >
                        {f.sentiment}
                      </Badge>
                      <span className="text-xs text-text-muted">📍 {f.region}</span>
                    </div>
                    <p className="font-semibold text-text-heading text-sm leading-relaxed">{f.headline}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                      <span>📰 {f.source}</span>
                      <span>{relativeTime(f.ts)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-text-muted hover:text-accent transition-colors cursor-pointer flex-shrink-0 mt-1"
                    onClick={() =>
                      window.open(`https://www.google.com/search?q=${encodeURIComponent(f.headline)}`, "_blank")
                    }
                    aria-label="Search for this headline"
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Sources Tab ── */}
      {tab === "sources" && (
        <div className="space-y-4">
          {sourcesLoading || sourcesError ? (
            <RpcStatus loading={sourcesLoading} error={sourcesError} onRetry={sourcesRefetch} />
          ) : (
            <>
              <p className="text-sm text-text-muted">
                Trust scores adapt over time using EMA learning (α=0.05). Sources with strong political affinity are
                penalised when reporting about countries they favour or oppose.
              </p>
              <div className="grid gap-3">
                {sources.map((s) => {
                  const trust = Math.round(s.trustScore * 100);
                  const trustVariant =
                    trust >= 75 ? "success" : trust >= 55 ? "warning" : "danger";
                  return (
                    <Card key={s.id} className="hover:border-accent/30 transition-all">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-text-heading text-sm">{s.id}</span>
                            <TendencyBadge tendency={s.tendency} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={trustVariant}>Trust {trust}%</Badge>
                            <span className="text-xs text-text-muted">
                              ✅ {Math.round(s.confirmRate * 100)}% confirmed · ⚠️{" "}
                              {Math.round(s.conflictRate * 100)}% disputed
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <TrustBar value={s.honesty} label="Honesty" />
                          <TrustBar value={s.accuracy} label="Accuracy" />
                          <TrustBar value={s.confirmRate} label="Confirm %" />
                          <TrustBar value={1 - s.conflictRate} label="Reliability" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── NIE Extractions Tab ── */}
      {tab === "nie" && (
        <div className="space-y-3">
          {nieLoading || nieError ? (
            <RpcStatus loading={nieLoading} error={nieError} onRetry={nieRefetch} />
          ) : nieEvents.length === 0 ? (
            <Card>
              <p className="text-text-muted text-sm text-center py-4">
                No extractions yet — waiting for next RSS poll cycle (every 5 min)
              </p>
            </Card>
          ) : (
            nieEvents.map((e, i) => {
              const icon =
                e.type === "carrier_move" ? "🚢" : e.type === "strike" ? "💥" : e.type === "arsenal_delta" ? "⚔️" : "⚠️";
              const statusVariant =
                e.status === "verified" ? "success" : e.status === "disputed" ? "warning" : "neutral";
              const label =
                e.type === "carrier_move"
                  ? `${e.vesselName ?? "Carrier"} — ${e.action ?? ""} near ${e.locationHint ?? "?"}`
                  : e.type === "strike"
                  ? `${e.attackerCountry} → ${e.defenderCountry} (${e.strikeType ?? "attack"})`
                  : e.type === "arsenal_delta"
                  ? `${e.country} ${e.action} ${Math.abs(e.quantity ?? 0)} ${e.assetType}`
                  : e.resolution ?? "—";
              return (
                <Card key={i} className="text-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={statusVariant}>{e.status ?? e.type}</Badge>
                        <span className="text-text-muted text-xs">{relativeTime(e.timestamp)}</span>
                      </div>
                      <p className="text-text-heading font-medium leading-snug">{label}</p>
                      <p className="text-text-muted text-xs mt-1 truncate">{e.headline}</p>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── Conflicts Tab ── */}
      {tab === "conflicts" && (
        <div className="space-y-3">
          {conflictsLoading || conflictsError ? (
            <RpcStatus loading={conflictsLoading} error={conflictsError} onRetry={conflictsRefetch} />
          ) : conflicts.length === 0 ? (
            <Card>
              <p className="text-text-muted text-sm text-center py-4">
                ✅ No active source conflicts — all claims are consistent
              </p>
            </Card>
          ) : (
            conflicts.map((c, i) => (
              <Card key={i} className="border-warning/30">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-warning" />
                    <span className="font-semibold text-text-heading text-sm">{(c as unknown as { entity?: string }).entity ?? "—"}</span>
                    <Badge variant="warning">Disputed</Badge>
                    <span className="text-xs text-text-muted ml-auto">{relativeTime(c.timestamp)}</span>
                  </div>
                  <div className="space-y-1">
                    {((c as unknown as { claims?: Array<{ sourceId: string; description: string; trustScore: number }> }).claims ?? []).map(
                      (claim, ci) => (
                        <div key={ci} className="flex items-center gap-2 text-xs text-text-secondary">
                          <span className="w-32 truncate font-medium text-text-muted">{claim.sourceId}</span>
                          <span className="flex-1">{claim.description}</span>
                          <span className="text-text-muted">trust {Math.round(claim.trustScore * 100)}%</span>
                        </div>
                      ),
                    )}
                  </div>
                  {(c as unknown as { resolution?: string }).resolution && (
                    <p className="text-xs text-success border-t border-border pt-2">
                      ✓ Resolution: {(c as unknown as { resolution?: string }).resolution}
                    </p>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
