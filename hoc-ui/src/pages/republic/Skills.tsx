import { useState, useMemo } from "react";
import {
  Swords, Star, Award, TrendingUp, Search, ChevronDown, ChevronRight,
  Users, Zap, AlertCircle, Target, BookOpen, RefreshCw,
} from "lucide-react";
import {
  PageHeader, Card, Badge, StatCard, RpcStatus, Tabs,
  EmptyState, ProgressBar,
} from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface SkillEntry {
  name: string;
  proficiency: number;   // 0–100
  citizensWithSkill: number;
}

interface SpecEntry {
  id: string;
  name: string;
  icon: string;
  citizenCount: number;
  avgMastery: number;
  skills: SkillEntry[];
}

interface DomainEntry {
  name: string;
  color: string;
  specializations: SpecEntry[];
}

interface TopCitizen {
  id: string;
  name: string;
  specialization: string;
  icon: string;
  mastery: number;
  skillCount: number;
  topSkills: string[];
  intelligence: number;
  learningRate: number;
}

interface HotSkill {
  skill: string;
  citizenCount: number;
  avgProficiency: number;
}

interface GapSkill {
  spec: string;
  skill: string;
}

interface SkillStats {
  totalSpecializations: number;
  totalSkillsInRegistry: number;
  learnedSkills: number;
  masteredSkills: number;
  globalAvgProficiency: number;
  citizensWithSkills: number;
  skillGapCount: number;
}

interface SkillsData {
  domains: DomainEntry[];
  stats: SkillStats;
  topCitizens: TopCitizen[];
  hotSkills: HotSkill[];
  skillGaps: GapSkill[];
}

// ─── Helpers ─────────────────────────────────────────────────────

function proficiencyColor(p: number): string {
  if (p >= 90) { return "bg-success"; }
  if (p >= 70) { return "bg-accent"; }
  if (p >= 40) { return "bg-warning"; }
  return "bg-danger";
}

function proficiencyBadge(p: number): "success" | "info" | "warning" | "danger" | "neutral" {
  if (p >= 90) { return "success"; }
  if (p >= 70) { return "info"; }
  if (p >= 40) { return "warning"; }
  if (p > 0)   { return "danger"; }
  return "neutral";
}

// ─── Sub-components ──────────────────────────────────────────────

function SpecializationCard({ spec, showAll }: { spec: SpecEntry; showAll: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visibleSkills = expanded || showAll ? spec.skills : spec.skills.slice(0, 5);
  const hasMore = spec.skills.length > 5;

  return (
    <Card className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{spec.icon}</span>
          <div>
            <p className="font-semibold text-text-heading text-sm">{spec.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={spec.citizenCount > 0 ? "info" : "neutral"}>
                <Users className="w-3 h-3 mr-1 inline" />
                {spec.citizenCount}
              </Badge>
              {spec.avgMastery > 0 && (
                <Badge variant={proficiencyBadge(spec.avgMastery)}>
                  {spec.avgMastery}% mastery
                </Badge>
              )}
            </div>
          </div>
        </div>
        <span className="text-xs text-text-muted">{spec.skills.length} skills</span>
      </div>

      {/* Skill bars */}
      <div className="space-y-1.5">
        {visibleSkills.map((sk) => (
          <div key={sk.name}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-text-secondary truncate max-w-[65%]">{sk.name}</span>
              <span className="text-text-muted">
                {sk.proficiency > 0 ? `${sk.proficiency}%` : "—"}
                {sk.citizensWithSkill > 0 && (
                  <span className="text-text-muted ml-1">({sk.citizensWithSkill})</span>
                )}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-input overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${proficiencyColor(sk.proficiency)}`}
                style={{ width: `${Math.max(sk.proficiency, 2)}%`, opacity: sk.proficiency === 0 ? 0.2 : 1 }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Expand button */}
      {!showAll && hasMore && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          {expanded
            ? <><ChevronDown className="w-3 h-3" /> Show less</>
            : <><ChevronRight className="w-3 h-3" /> +{spec.skills.length - 5} more skills</>}
        </button>
      )}
    </Card>
  );
}

function DomainSection({
  domain,
  search,
  showAll,
}: {
  domain: DomainEntry;
  search: string;
  showAll: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const filteredSpecs = useMemo(() => {
    if (!search) { return domain.specializations; }
    const q = search.toLowerCase();
    return domain.specializations.filter(
      (s) => s.name.toLowerCase().includes(q) || s.skills.some((sk) => sk.name.toLowerCase().includes(q)),
    );
  }, [domain.specializations, search]);

  if (filteredSpecs.length === 0) { return null; }

  const totalSkills = filteredSpecs.reduce((s, sp) => s + sp.skills.length, 0);
  const totalCitizens = filteredSpecs.reduce((s, sp) => s + sp.citizenCount, 0);

  return (
    <div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-bg-secondary border border-border hover:border-border-hover transition-colors mb-3"
      >
        <div className="flex items-center gap-3">
          {collapsed ? <ChevronRight className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
          <span className="font-semibold text-text-heading">{domain.name}</span>
          <Badge variant="neutral">{filteredSpecs.length} specs</Badge>
          <Badge variant="neutral">{totalSkills} skills</Badge>
          {totalCitizens > 0 && <Badge variant="info">{totalCitizens} citizens</Badge>}
        </div>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {filteredSpecs.map((spec) => (
            <SpecializationCard key={spec.id} spec={spec} showAll={showAll} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

const TABS = [
  { id: "domains", label: "All Domains" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "hot", label: "Hot Skills" },
  { id: "gaps", label: "Skill Gaps" },
];

export function SkillsPage() {
  const [tab, setTab] = useState("domains");
  const [search, setSearch] = useState("");
  const [showAllSkills, setShowAllSkills] = useState(false);

  const { data, loading, error, refetch } = useRpc<SkillsData>(
    "republic.skills.list",
    {},
    [],
    { staleTimeMs: 30_000, refetchIntervalMs: 60_000 },
  );

  const domains = data?.domains ?? [];
  const stats = data?.stats;
  const topCitizens = data?.topCitizens ?? [];
  const hotSkills = data?.hotSkills ?? [];
  const skillGaps = data?.skillGaps ?? [];

  const filteredDomains = useMemo(() => {
    if (!search) { return domains; }
    const q = search.toLowerCase();
    return domains.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      d.specializations.some(
        (s) => s.name.toLowerCase().includes(q) || s.skills.some((sk) => sk.name.toLowerCase().includes(q)),
      ),
    );
  }, [domains, search]);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Republic Skills"
        description={`${stats?.totalSpecializations ?? 48} specializations · ${stats?.totalSkillsInRegistry ?? "500+"} skills in registry · live citizen proficiency data`}
        icon={<Swords size={28} />}
        actions={
          <button
            onClick={refetch}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        }
      />

      <RpcStatus loading={loading} error={error} onRetry={refetch} />

      {/* ── Stats Row ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Specializations" value={stats.totalSpecializations} icon={<Target className="w-4 h-4" />} />
          <StatCard label="Skills Registry" value={stats.totalSkillsInRegistry} icon={<BookOpen className="w-4 h-4" />} />
          <StatCard label="Skills Learned" value={stats.learnedSkills} icon={<Award className="w-4 h-4" />} />
          <StatCard label="Mastered (≥90%)" value={stats.masteredSkills} icon={<Star className="w-4 h-4" />} />
          <StatCard label="Avg Proficiency" value={`${stats.globalAvgProficiency}%`} icon={<TrendingUp className="w-4 h-4" />} />
          <StatCard label="Active Learners" value={stats.citizensWithSkills} icon={<Users className="w-4 h-4" />} />
          <StatCard label="Skill Gaps" value={stats.skillGapCount} icon={<AlertCircle className="w-4 h-4" />} sub="Untouched skills" />
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setSearch(""); }} />

      {/* ── All Domains ── */}
      {tab === "domains" && (
        <div className="space-y-2">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search specializations or skills..."
                className="w-full pl-9 pr-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={() => setShowAllSkills((v) => !v)}
              className="text-sm px-3 py-2 rounded-lg border border-border text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
            >
              {showAllSkills ? "Collapse Skills" : "Expand All Skills"}
            </button>
            <Badge variant="neutral">{filteredDomains.reduce((s, d) => s + d.specializations.length, 0)} specs</Badge>
          </div>

          {filteredDomains.length === 0 ? (
            <EmptyState
              icon={<Search className="w-8 h-8" />}
              title="No matches"
              description="Try a different search term"
            />
          ) : (
            filteredDomains.map((domain) => (
              <DomainSection key={domain.name} domain={domain} search={search} showAll={showAllSkills} />
            ))
          )}
        </div>
      )}

      {/* ── Leaderboard ── */}
      {tab === "leaderboard" && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" /> Top Citizens by Mastery
          </h3>
          {topCitizens.length === 0 ? (
            <EmptyState title="No Data" description="Citizens are still learning. Check back next tick." />
          ) : (
            <div className="divide-y divide-border/20">
              {topCitizens.map((c, i) => (
                <div key={c.id} className="flex items-center gap-4 py-3">
                  <span className="text-base font-bold text-text-muted w-6 text-center">{i + 1}</span>
                  <span className="text-2xl">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-heading text-sm">{c.name}</p>
                    <p className="text-xs text-text-muted">{c.specialization} · {c.skillCount} skills</p>
                    {c.topSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.topSkills.map((sk) => (
                          <span key={sk} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-muted">{sk}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <Badge variant={proficiencyBadge(c.mastery)}>{c.mastery}% mastery</Badge>
                    <div className="text-xs text-text-muted">IQ {c.intelligence} · ×{c.learningRate} rate</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Hot Skills ── */}
      {tab === "hot" && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-warning" /> Most Widely Learned Skills
            </h3>
            {hotSkills.length === 0 ? (
              <EmptyState title="No Data" description="Skill data will appear as citizens learn." />
            ) : (
              <div className="space-y-3">
                {hotSkills.map((sk) => (
                  <div key={sk.skill}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-text-primary font-medium">{sk.skill}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral">
                          <Users className="w-3 h-3 mr-1 inline" />{sk.citizenCount}
                        </Badge>
                        <Badge variant={proficiencyBadge(sk.avgProficiency)}>
                          {sk.avgProficiency}%
                        </Badge>
                      </div>
                    </div>
                    <ProgressBar value={sk.citizenCount} max={Math.max(...hotSkills.map((h) => h.citizenCount))} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Skill Gaps ── */}
      {tab === "gaps" && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-1 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-danger" /> Untouched Skills
          </h3>
          <p className="text-xs text-text-muted mb-4">Skills in the registry that zero citizens have learned yet — learning opportunities.</p>
          {skillGaps.length === 0 ? (
            <EmptyState
              icon={<Award className="w-8 h-8" />}
              title="All Skills Covered"
              description="Every skill in the registry has been learned by at least one citizen."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {skillGaps.map((g) => (
                <div key={`${g.spec}-${g.skill}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border">
                  <AlertCircle className="w-3 h-3 text-danger shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-text-primary truncate">{g.skill}</p>
                    <p className="text-[10px] text-text-muted">{g.spec}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
