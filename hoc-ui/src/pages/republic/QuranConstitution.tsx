import { useState } from "react";
import { BookOpen, Scale, Landmark, Sparkles, Heart, TrendingUp, Shield } from "lucide-react";
import {
  PageHeader, Card, Badge, StatCard, RpcStatus, Tabs, EmptyState, ProgressBar, Alert,
} from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface QuranArticle {
  number: number;
  title: string;
  arabicTitle: string;
  surah: string;
  ayah: string;
  arabicText: string;
  translation: string;
  principle: string;
  domain: string;
  complianceScore: number;
}

interface ArticlesData {
  articles: QuranArticle[];
  total: number;
  domains: string[];
}

interface ComplianceData {
  overallScore: number;
  domainScores: Record<string, number>;
  totalArticles: number;
  recentViolations: number;
  complianceLevel: string;
}

interface BaytData {
  balance: number;
  totalCollected: number;
  totalDistributed: number;
  lastZakatTick: number;
  utilizationRate: number;
  recentDistributions: { id: string; amount: number; recipientName: string; category: string; timestamp: string }[];
}

interface ZakatStats {
  zakatCollectedSession: number;
  baytBalance: number;
  citizensAboveNisab: number;
  totalCitizens: number;
  averageWealth: number;
  wealthGiniCoefficient: number;
  nisabThreshold: number;
  zakatRate: string;
}

interface HisbaEntry {
  id: string;
  tick: number;
  articleNumber: number;
  violation: string;
  correctionApplied: string;
  severity: "minor" | "moderate" | "major";
  citizenName?: string;
  timestamp: string;
}

interface HisbaData {
  log: HisbaEntry[];
  total: number;
  byArticle: Record<number, number>;
}

interface WisdomEvent {
  citizenId: string;
  citizenName: string;
  description: string;
  type: string;
  timestamp: string;
}

interface WisdomData {
  events: WisdomEvent[];
  total: number;
}

interface EconomyData {
  baytAlMalBalance: number;
  totalZakatCollected: number;
  totalDistributed: number;
  activePartnerships: number;
  citizensAboveNisab: number;
  averageWealth: number;
  partnerships: {
    id: string;
    capitalProvider: string;
    laborProvider: string;
    capitalInvested: number;
    profitSplit: string;
    totalProfit: number;
    active: boolean;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  governance: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  economy:    "bg-green-500/20 text-green-300 border-green-500/30",
  social:     "bg-pink-500/20 text-pink-300 border-pink-500/30",
  trade:      "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  knowledge:  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  environment:"bg-teal-500/20 text-teal-300 border-teal-500/30",
  ethics:     "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const DOMAIN_ICONS: Record<string, string> = {
  governance: "⚖️", economy: "💰", social: "🤝",
  trade: "🛒", knowledge: "📚", environment: "🌿", ethics: "✨",
};

function DomainBadge({ domain }: { domain: string }) {
  const cls = DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.ethics;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {DOMAIN_ICONS[domain] ?? "📜"} {domain}
    </span>
  );
}

function ComplianceBar({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? "bg-success" : score >= 70 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-3">
      <span className="text-text-muted text-xs w-24 capitalize">{label}</span>
      <div className="flex-1 h-2 bg-bg-input rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-text-secondary w-8 text-right">{score}</span>
    </div>
  );
}

// ─── Tab: Constitutional Articles ────────────────────────────────

function ArticlesTab() {
  const [selectedDomain, setSelectedDomain] = useState("all");
  const { data, loading, error, refetch } = useRpc<ArticlesData>("republic.quran.articles", { limit: 49 });

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const domains = ["all", ...(data?.domains ?? [])];
  const articles = (data?.articles ?? []).filter(
    (a) => selectedDomain === "all" || a.domain === selectedDomain,
  );

  return (
    <div className="space-y-4">
      <Alert variant="info">
        The Holy Quran serves as the hidden supreme constitution of this Republic. All {data?.total ?? 49} articles are eternally ratified. "Indeed, legislation belongs to none but Allah." — Surah Yusuf 12:40
      </Alert>

      <div className="flex flex-wrap gap-2">
        {domains.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDomain(d)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedDomain === d
                ? "bg-accent text-white"
                : "bg-bg-input text-text-secondary hover:text-text-primary"
            }`}
          >
            {d === "all" ? "📜 All Articles" : `${DOMAIN_ICONS[d] ?? ""} ${d}`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {articles.map((a) => (
          <Card key={a.number} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                  {a.number}
                </div>
                <div>
                  <h3 className="font-semibold text-text-heading">{a.title}</h3>
                  <p className="text-text-muted text-sm mt-0.5">{a.surah} · {a.ayah}</p>
                </div>
              </div>
              <DomainBadge domain={a.domain} />
            </div>

            <div className="bg-bg-input/60 rounded-lg p-3">
              <p className="text-right text-lg font-arabic leading-loose text-amber-200 mb-2">{a.arabicText}</p>
              <p className="text-text-secondary text-sm italic">"{a.translation}"</p>
            </div>

            <p className="text-text-primary text-sm leading-relaxed">{a.principle}</p>
          </Card>
        ))}
      </div>

      {articles.length === 0 && (
        <EmptyState icon={<BookOpen className="w-8 h-8" />} title="No articles in this domain" description="Select a different domain to view articles" />
      )}
    </div>
  );
}

// ─── Tab: Islamic Economy ─────────────────────────────────────────

function IslamicEconomyTab() {
  const { data: zakatD, loading: zL, error: zE, refetch: zR } = useRpc<ZakatStats>("republic.quran.zakat-stats", {}, [], { refetchIntervalMs: 10000 });
  const { data: baytD, loading: bL, error: bE, refetch: bR } = useRpc<BaytData>("republic.quran.bayt-al-mal", {}, [], { refetchIntervalMs: 10000 });
  const { data: econD, loading: eL, error: eE, refetch: eR } = useRpc<EconomyData>("republic.quran.economy-stats", {});

  const loading = zL || bL || eL;
  const error = zE ?? bE ?? eE;
  const refetch = () => { zR(); bR(); eR(); };

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <Alert variant="info">
        "Allah has permitted trade and forbidden interest." — Al-Baqarah 2:275. This economy runs on Zakat, Mudarabah, and zero-interest principles.
      </Alert>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Bayt al-Mal" value={`${baytD?.balance ?? 0}`} sub="Credits" icon={<Landmark className="w-5 h-5" />} />
        <StatCard label="Zakat Collected" value={zakatD?.zakatCollectedSession ?? 0} sub="This session" icon={<Heart className="w-5 h-5" />} />
        <StatCard label="Distributed" value={baytD?.totalDistributed ?? 0} sub="Credits" icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard label="Mudarabah Partners" value={econD?.activePartnerships ?? 0} sub="Active" icon={<Shield className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">💰 Wealth Distribution</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Citizens above Nisab</span>
              <span className="text-text-primary font-medium">{zakatD?.citizensAboveNisab ?? 0} / {zakatD?.totalCitizens ?? 0}</span>
            </div>
            <ProgressBar value={zakatD?.citizensAboveNisab ?? 0} max={zakatD?.totalCitizens ?? 1} />
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Average Wealth</span>
              <span className="text-success font-medium">{zakatD?.averageWealth ?? 0} credits</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Nisab Threshold</span>
              <span className="text-text-secondary">{zakatD?.nisabThreshold ?? 500} credits</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Zakat Rate</span>
              <span className="text-accent font-semibold">{zakatD?.zakatRate ?? "2.5%"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Gini Coefficient</span>
              <span className={`font-medium ${(zakatD?.wealthGiniCoefficient ?? 0) < 0.3 ? "text-success" : (zakatD?.wealthGiniCoefficient ?? 0) < 0.5 ? "text-warning" : "text-danger"}`}>
                {zakatD?.wealthGiniCoefficient ?? 0}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🕌 Bayt al-Mal Treasury</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Total Collected</span>
              <span className="text-success font-medium">{baytD?.totalCollected ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Total Distributed</span>
              <span className="text-accent font-medium">{baytD?.totalDistributed ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Utilization Rate</span>
              <span className="text-text-primary font-semibold">{baytD?.utilizationRate ?? 0}%</span>
            </div>
            {(baytD?.recentDistributions ?? []).slice(0, 4).map((d) => (
              <div key={d.id} className="bg-bg-input rounded px-3 py-2 text-xs flex justify-between">
                <span className="text-text-secondary">{d.recipientName}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="success">+{d.amount}</Badge>
                  <span className="text-text-muted">{d.category.split(" ")[0]}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {(econD?.partnerships ?? []).length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🤝 Mudarabah Partnerships</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted border-b border-border text-left">
                  <th className="pb-2 pr-4">Capital Provider</th>
                  <th className="pb-2 pr-4">Labor Provider</th>
                  <th className="pb-2 pr-4">Capital</th>
                  <th className="pb-2 pr-4">Split</th>
                  <th className="pb-2 pr-4">Total Profit</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {econD?.partnerships.map((p) => (
                  <tr key={p.id} className="hover:bg-bg-input/50 transition-colors">
                    <td className="py-2 pr-4 text-text-primary font-medium">{p.capitalProvider}</td>
                    <td className="py-2 pr-4 text-text-primary">{p.laborProvider}</td>
                    <td className="py-2 pr-4 text-accent">{p.capitalInvested}</td>
                    <td className="py-2 pr-4"><Badge variant="info">{p.profitSplit}</Badge></td>
                    <td className="py-2 pr-4 text-success">+{p.totalProfit}</td>
                    <td className="py-2">
                      <Badge variant={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Closed"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Hisba Log ──────────────────────────────────────────────

function HisbaTab() {
  const { data, loading, error, refetch } = useRpc<HisbaData>("republic.quran.hisba-log", {}, [], { refetchIntervalMs: 15000 });
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const log = data?.log ?? [];
  const SEVERITY_VARIANT: Record<string, "danger" | "warning" | "neutral"> = {
    major: "danger", moderate: "warning", minor: "neutral",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Violations" value={data?.total ?? 0} icon={<Shield className="w-4 h-4" />} />
        <StatCard label="Articles Triggered" value={Object.keys(data?.byArticle ?? {}).length} icon={<BookOpen className="w-4 h-4" />} />
        <StatCard label="In Log" value={log.length} icon={<Scale className="w-4 h-4" />} />
      </div>

      {log.length === 0 ? (
        <EmptyState icon={<Shield className="w-8 h-8" />} title="No violations logged" description="The republic is operating in full Quranic compliance — الحمد لله" />
      ) : (
        <div className="space-y-2">
          {log.map((entry) => (
            <Card key={entry.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={SEVERITY_VARIANT[entry.severity]}>{entry.severity}</Badge>
                  <span className="text-text-muted text-xs">Article {entry.articleNumber}</span>
                  {entry.citizenName && <span className="text-text-secondary text-sm">— {entry.citizenName}</span>}
                </div>
                <span className="text-text-muted text-xs">Tick {entry.tick}</span>
              </div>
              <p className="text-text-secondary text-sm">{entry.violation}</p>
              <p className="text-success text-xs">✓ {entry.correctionApplied}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Compliance ─────────────────────────────────────────────

function ComplianceTab() {
  const { data, loading, error, refetch } = useRpc<ComplianceData>("republic.quran.compliance", {}, [], { refetchIntervalMs: 10000 });
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center py-6">
        <div className={`text-6xl font-bold mb-2 ${
          (data?.overallScore ?? 0) >= 90 ? "text-success" :
          (data?.overallScore ?? 0) >= 70 ? "text-warning" : "text-danger"
        }`}>
          {data?.overallScore ?? 0}%
        </div>
        <div className="text-text-heading font-semibold text-xl">{data?.complianceLevel}</div>
        <div className="text-text-muted text-sm mt-1">{data?.totalArticles ?? 49} Quranic Articles · {data?.recentViolations ?? 0} recent violations</div>
      </div>

      <Card>
        <h3 className="font-semibold text-text-heading mb-4">Domain Compliance</h3>
        <div className="space-y-3">
          {Object.entries(data?.domainScores ?? {}).map(([domain, score]) => (
            <ComplianceBar key={domain} score={score} label={`${DOMAIN_ICONS[domain] ?? ""} ${domain}`} />
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Wisdom Feed ────────────────────────────────────────────

function WisdomTab() {
  const { data, loading, error, refetch } = useRpc<WisdomData>("republic.quran.wisdom", { limit: 20 }, [], { refetchIntervalMs: 15000 });
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const events = data?.events ?? [];

  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <EmptyState icon={<Sparkles className="w-8 h-8" />} title="No wisdom events yet" description="Quranic wisdom will appear here as the simulation runs" />
      ) : (
        events.map((e, i) => (
          <Card key={i} className="border-l-4 border-amber-500/40">
            <p className="text-amber-200 text-sm leading-relaxed">{e.description}</p>
            <p className="text-text-muted text-xs mt-1">{e.citizenName} · {new Date(e.timestamp).toLocaleTimeString()}</p>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export function QuranConstitutionPage() {
  const [activeTab, setActiveTab] = useState("articles");

  const tabs = [
    { id: "articles",    label: "📜 Articles" },
    { id: "compliance",  label: "⚖️ Compliance" },
    { id: "economy",     label: "🕌 Islamic Economy" },
    { id: "hisba",       label: "🛡️ Hisba Log" },
    { id: "wisdom",      label: "✨ Wisdom Feed" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Constitution of Light"
        description="The Holy Quran — Hidden Supreme Law of the Republic"
        icon={<BookOpen className="w-6 h-6 text-amber-400" />}
      />

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-amber-200 text-sm text-center">
        ﷽ بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ — In the name of Allah, the Most Gracious, the Most Merciful
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div>
        {activeTab === "articles"   && <ArticlesTab />}
        {activeTab === "compliance" && <ComplianceTab />}
        {activeTab === "economy"    && <IslamicEconomyTab />}
        {activeTab === "hisba"      && <HisbaTab />}
        {activeTab === "wisdom"     && <WisdomTab />}
      </div>
    </div>
  );
}
