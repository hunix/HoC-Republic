import { useState } from "react";
import { Users, Heart, GitBranch, Network, Baby, Skull, Star, RefreshCw } from "lucide-react";
import {
  PageHeader, Card, Badge, StatCard, RpcStatus, Tabs, EmptyState, ProgressBar,
} from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface LifecycleStats {
  totalCitizens: number;
  byStage: Record<string, number>;
  avgAge: number;
  avgGeneration: number;
  eldersCount: number;
  mentorsCount: number;
  grievingCount: number;
  totalDeathsThisSession: number;
}

interface SocialDiag {
  combined: {
    totalRelationships: number;
    marriages: number;
    dating: number;
    avgStrength: number;
    socialCircles: number;
    byType: Record<string, number>;
  };
}

interface RelationEntry {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  type: string;
  strength: number;
  since: string;
}

interface GraphData {
  citizenRelationships: RelationEntry[];
  totalLifeRels: number;
  totalFabricRels: number;
}

interface FamilyTree {
  tree: {
    citizen: { id: string; name: string; age: number; generation: number; stage: string } | null;
    parents: { id: string; name: string; age: number; stage: string }[];
    children: { id: string; name: string; age: number; stage: string }[];
    siblings: { id: string; name: string; age: number; stage: string }[];
    spouse: { id: string; name: string; age: number; stage: string } | null;
    maritalStatus: string;
  } | null;
}

interface SocialCircle {
  name: string;
  sharedInterest: string;
  formedAt: string;
  memberCount: number;
  members: { id: string; name: string; specialization: string }[];
}

interface Citizen {
  id: string;
  name: string;
  age?: number;
  specialization?: string;
  maritalStatus?: string;
}

interface CitizensData {
  citizens: Citizen[];
}

// ─── Stage Color Helpers ─────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  Infant:   "bg-pink-500/20 text-pink-300 border-pink-500/30",
  Child:    "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Teen:     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Adult:    "bg-green-500/20 text-green-300 border-green-500/30",
  Elder:    "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Twilight: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const REL_TYPE_COLORS: Record<string, string> = {
  Friend:     "info",
  BestFriend: "purple",
  Spouse:     "danger",
  Romantic:   "danger",
  Parent:     "warning",
  Child:      "warning",
  Mentor:     "success",
  Colleague:  "neutral",
  Rival:      "danger",
  romance:    "danger",
  friendship: "info",
  mentorship: "success",
  professional: "neutral",
  rivalry:    "danger",
};

function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] ?? STAGE_COLORS.Adult;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {stage}
    </span>
  );
}

function RelBadge({ type }: { type: string }) {
  const variant = (REL_TYPE_COLORS[type] ?? "neutral") as Parameters<typeof Badge>[0]["variant"];
  return <Badge variant={variant}>{type}</Badge>;
}

// ─── Tab: Network Stats ──────────────────────────────────────────

function NetworkStatsTab() {
  const { data: lsData, loading: lsLoading, error: lsErr, refetch: lsRefetch } =
    useRpc<LifecycleStats>("republic.social.lifecycle-stats", {});
  const { data: diagData, loading: diagLoading, error: diagErr, refetch: diagRefetch } =
    useRpc<SocialDiag>("republic.social.diagnostics", {});

  const loading = lsLoading || diagLoading;
  const error = lsErr ?? diagErr;
  const refetch = () => { lsRefetch(); diagRefetch(); };

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const ls = lsData;
  const diag = diagData?.combined;
  const STAGES = ["Infant", "Child", "Teen", "Adult", "Elder", "Twilight"] as const;
  const total = ls?.totalCitizens ?? 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Citizens" value={ls?.totalCitizens ?? 0} icon={<Users className="w-5 h-5" />} />
        <StatCard label="Marriages" value={diag?.marriages ?? 0} icon={<Heart className="w-5 h-5" />} />
        <StatCard label="Relationships" value={diag?.totalRelationships ?? 0} icon={<Network className="w-5 h-5" />} />
        <StatCard label="Social Circles" value={diag?.socialCircles ?? 0} icon={<GitBranch className="w-5 h-5" />} />
        <StatCard label="Avg Age (ticks)" value={ls?.avgAge ?? 0} icon={<Star className="w-5 h-5" />} />
        <StatCard label="Avg Generation" value={ls?.avgGeneration ?? 0} icon={<Baby className="w-5 h-5" />} />
        <StatCard label="Elders / Mentors" value={`${ls?.eldersCount ?? 0} / ${ls?.mentorsCount ?? 0}`} icon={<Star className="w-5 h-5" />} />
        <StatCard label="Deaths (session)" value={ls?.totalDeathsThisSession ?? 0} icon={<Skull className="w-5 h-5" />} />
      </div>

      <Card>
        <h3 className="text-text-heading font-semibold mb-4">Life Stage Distribution</h3>
        <div className="space-y-3">
          {STAGES.map((stage) => {
            const count = ls?.byStage?.[stage] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={stage} className="flex items-center gap-3">
                <div className="w-20 text-right shrink-0">
                  <StageBadge stage={stage} />
                </div>
                <div className="flex-1">
                  <ProgressBar value={count} max={total} />
                </div>
                <span className="text-sm text-text-secondary w-16 text-right">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </Card>

      {diag?.byType && Object.keys(diag.byType).length > 0 && (
        <Card>
          <h3 className="text-text-heading font-semibold mb-4">Relationship Types</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(diag.byType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 bg-bg-input rounded-lg px-3 py-1.5">
                <RelBadge type={type} />
                <span className="text-sm text-text-secondary">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Relationships ──────────────────────────────────────────

function RelationshipsTab() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { data, loading, error, refetch } = useRpc<GraphData>("republic.social.graph", {});

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const rels = data?.citizenRelationships ?? [];
  const types = ["all", ...new Set(rels.map((r) => r.type))];
  const filtered = typeFilter === "all" ? rels : rels.filter((r) => r.type === typeFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              typeFilter === t
                ? "bg-accent text-white"
                : "bg-bg-input text-text-secondary hover:text-text-primary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Network className="w-8 h-8" />} title="No relationships yet" description="Citizens will form bonds as the simulation runs" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted border-b border-border text-left">
                  <th className="pb-2 pr-4">Citizen A</th>
                  <th className="pb-2 pr-4">↔</th>
                  <th className="pb-2 pr-4">Citizen B</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Strength</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.slice(0, 100).map((r, i) => (
                  <tr key={i} className="hover:bg-bg-input/50 transition-colors">
                    <td className="py-2 pr-4 font-medium text-text-primary">{r.fromName}</td>
                    <td className="py-2 pr-4 text-text-muted">↔</td>
                    <td className="py-2 pr-4 text-text-primary">{r.toName}</td>
                    <td className="py-2 pr-4"><RelBadge type={r.type} /></td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-bg-input rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${Math.min(100, r.strength)}%` }}
                          />
                        </div>
                        <span className="text-text-muted text-xs">{r.strength}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <p className="text-text-muted text-sm mt-2 text-center">
                Showing 100 of {filtered.length} relationships
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Family Tree ────────────────────────────────────────────

function FamilyTreeTab({ citizens }: { citizens: Citizen[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const { data, loading, error, refetch } = useRpc<FamilyTree>(
    "republic.social.family-tree",
    { citizenId: selectedId },
    [selectedId],
  );

  const tree = data?.tree;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent transition-colors"
        >
          <option value="">— Select a citizen —</option>
          {citizens.map((c) => (
            <option key={c.id} value={c.id}>{c.name} (age {c.age ?? 0})</option>
          ))}
        </select>
        <button
          onClick={refetch}
          className="p-2 rounded-lg bg-bg-input hover:bg-bg-card border border-border transition-colors"
          aria-label="Refresh family tree"
        >
          <RefreshCw className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {!selectedId && (
        <EmptyState icon={<GitBranch className="w-8 h-8" />} title="Select a citizen" description="Choose a citizen to view their family tree" />
      )}

      {selectedId && (loading || error) && (
        <RpcStatus loading={loading} error={error} onRetry={refetch} />
      )}

      {selectedId && !loading && !error && tree && (
        <div className="space-y-4 animate-fade-in">
          {/* Subject citizen */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-text-heading font-bold text-lg">{tree.citizen?.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <StageBadge stage={tree.citizen?.stage ?? "Adult"} />
                  <span className="text-text-muted text-sm">Age {tree.citizen?.age} · Gen {tree.citizen?.generation}</span>
                  <Badge variant="neutral">{tree.maritalStatus}</Badge>
                </div>
              </div>
              {tree.spouse && (
                <div className="text-right">
                  <div className="text-text-muted text-sm">Spouse</div>
                  <div className="font-medium text-text-primary flex items-center gap-2 justify-end mt-1">
                    <Heart className="w-4 h-4 text-danger" />
                    {tree.spouse.name}
                    <StageBadge stage={tree.spouse.stage} />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Parents */}
          {tree.parents.length > 0 && (
            <div>
              <h4 className="text-text-muted text-sm mb-2 uppercase tracking-wide">Parents</h4>
              <div className="flex gap-2 flex-wrap">
                {tree.parents.map((p) => (
                  <div key={p.id} className="bg-bg-input rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-text-primary">{p.name}</span>
                    <StageBadge stage={p.stage} />
                    <span className="text-text-muted text-xs">age {p.age}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Siblings */}
          {tree.siblings.length > 0 && (
            <div>
              <h4 className="text-text-muted text-sm mb-2 uppercase tracking-wide">Siblings ({tree.siblings.length})</h4>
              <div className="flex gap-2 flex-wrap">
                {tree.siblings.map((s) => (
                  <div key={s.id} className="bg-bg-input rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-text-primary">{s.name}</span>
                    <StageBadge stage={s.stage} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Children */}
          {tree.children.length > 0 && (
            <div>
              <h4 className="text-text-muted text-sm mb-2 uppercase tracking-wide">Children ({tree.children.length})</h4>
              <div className="flex gap-2 flex-wrap">
                {tree.children.map((c) => (
                  <div key={c.id} className="bg-bg-input rounded-lg px-3 py-2 flex items-center gap-2">
                    <Baby className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-text-primary">{c.name}</span>
                    <StageBadge stage={c.stage} />
                    <span className="text-text-muted text-xs">age {c.age}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tree.parents.length === 0 && tree.children.length === 0 && tree.spouse === null && (
            <EmptyState icon={<Users className="w-6 h-6" />} title="No family connections yet" description="This citizen has not yet formed family bonds" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Social Circles ─────────────────────────────────────────

function CirclesTab() {
  const { data, loading, error, refetch } = useRpc<{ circles: SocialCircle[]; total: number }>(
    "republic.social.circles",
    {},
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const circles = data?.circles ?? [];

  if (circles.length === 0) {
    return (
      <EmptyState
        icon={<Network className="w-8 h-8" />}
        title="No social circles yet"
        description="Social circles emerge organically after ~50 ticks as citizens build strong bonds"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {circles.map((circle, i) => (
        <Card key={i} className="space-y-3">
          <div>
            <h3 className="font-semibold text-text-heading">{circle.name}</h3>
            <p className="text-xs text-text-muted mt-0.5">Shared: {circle.sharedInterest}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {circle.members.slice(0, 8).map((m) => (
              <Badge key={m.id} variant="neutral">{m.name}</Badge>
            ))}
            {circle.memberCount > 8 && (
              <Badge variant="neutral">+{circle.memberCount - 8} more</Badge>
            )}
          </div>
          <div className="text-xs text-text-muted">{circle.memberCount} members</div>
        </Card>
      ))}
    </div>
  );
}

// ─── Tab: Life Stages ────────────────────────────────────────────

function LifeStagesTab({ citizens }: { citizens: Citizen[] }) {
  const STAGES = ["Infant", "Child", "Teen", "Adult", "Elder", "Twilight"];
  const grouped = STAGES.reduce<Record<string, Citizen[]>>((acc, stage) => {
    acc[stage] = [];
    return acc;
  }, {});

  for (const c of citizens) {
    const age = c.age ?? 0;
    let stage = "Adult";
    if (age < 24) { stage = "Infant"; }
    else if (age < 144) { stage = "Child"; }
    else if (age < 216) { stage = "Teen"; }
    else if (age < 720) { stage = "Adult"; }
    else if (age < 960) { stage = "Elder"; }
    else { stage = "Twilight"; }
    grouped[stage]?.push(c);
  }

  return (
    <div className="space-y-6">
      {STAGES.map((stage) => {
        const group = grouped[stage] ?? [];
        if (group.length === 0) { return null; }
        return (
          <div key={stage}>
            <div className="flex items-center gap-3 mb-3">
              <StageBadge stage={stage} />
              <span className="text-text-muted text-sm">{group.length} citizens</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {group.slice(0, 24).map((c) => (
                <div key={c.id} className="bg-bg-input rounded-lg p-2 text-center">
                  <div className="text-text-primary font-medium text-sm truncate">{c.name}</div>
                  <div className="text-text-muted text-xs mt-0.5">age {c.age ?? 0}</div>
                  {c.maritalStatus && c.maritalStatus !== "Single" && (
                    <Badge variant="info" className="mt-1">{c.maritalStatus}</Badge>
                  )}
                </div>
              ))}
              {group.length > 24 && (
                <div className="bg-bg-input/50 rounded-lg p-2 flex items-center justify-center text-text-muted text-sm">
                  +{group.length - 24} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export function SocialGraphPage() {
  const [activeTab, setActiveTab] = useState("stats");

  const { data: citizensData, loading: cLoading, error: cErr, refetch: cRefetch } =
    useRpc<CitizensData>("republic.citizens.list", { limit: 300 });

  const citizens = citizensData?.citizens ?? [];

  const tabs = [
    { id: "stats",     label: "Network Stats" },
    { id: "relations", label: "Relationships" },
    { id: "family",    label: "Family Tree" },
    { id: "circles",   label: "Social Circles" },
    { id: "stages",    label: "Life Stages" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Social Graph & Genealogy"
        description="Live view of citizen relationships, family trees, social circles, and lifecycle stages"
        icon={<Network className="w-6 h-6 text-accent" />}
        actions={
          <button
            onClick={cRefetch}
            className="p-2 rounded-lg bg-bg-input hover:bg-bg-card border border-border transition-colors"
            aria-label="Refresh social data"
          >
            <RefreshCw className="w-4 h-4 text-text-secondary" />
          </button>
        }
      />

      <RpcStatus loading={cLoading} error={cErr} onRetry={cRefetch} />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div>
        {activeTab === "stats"     && <NetworkStatsTab />}
        {activeTab === "relations" && <RelationshipsTab />}
        {activeTab === "family"    && <FamilyTreeTab citizens={citizens} />}
        {activeTab === "circles"   && <CirclesTab />}
        {activeTab === "stages"    && <LifeStagesTab citizens={citizens} />}
      </div>
    </div>
  );
}
