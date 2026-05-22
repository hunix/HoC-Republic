import { useState, useMemo, useCallback } from "react";
import {
  Briefcase, Search, Users, Brain, Shield, Zap, Plus, Trash2, Download,
  ChevronUp, ChevronDown, RefreshCw, Sparkles, ArrowUpDown, Filter,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  PageHeader, Card, Badge, StatCard, RpcStatus, Button, ConfirmDialog,
  EmptyState, ProgressBar, Tabs,
} from "@/components/ui";
import { useRpc, rpc, mutateRpc } from "@/lib/rpc";
import { useNavigate } from "react-router-dom";

// ─── Types ──────────────────────────────────────────────────────

interface CitizenSummary {
  id: string;
  name: string;
  specialization: string;
  intelligence: number;
  autonomyScore: number;
  masteryLevel: number;
  activity: string;
  status: string;
  xp: number;
  level: number;
  role?: string;
  projects?: number;
}

interface RoleSummary {
  name: string;
  count: number;
  avgIntelligence: number;
  avgMastery: number;
  avgAutonomy: number;
  citizens: CitizenSummary[];
}

// ─── Helpers ─────────────────────────────────────────────────────

const fmt = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function exportCSV(roles: RoleSummary[]) {
  const header = "Role,Citizens,Avg Intelligence,Avg Mastery,Avg Autonomy\n";
  const rows = roles.map((r) =>
    `"${r.name}",${r.count},${fmt(r.avgIntelligence)},${fmt(r.avgMastery)},${fmt(r.avgAutonomy)}`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `roles-export-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCitizensCSV(citizens: CitizenSummary[]) {
  const header = "Name,Role,Intelligence,Autonomy,Mastery,Activity,XP,Level\n";
  const rows = citizens.map((c) =>
    `"${c.name}","${c.specialization}",${fmt(c.intelligence)},${fmt(c.autonomyScore)},${fmt(c.masteryLevel)},"${c.activity}",${c.xp ?? 0},${c.level ?? 0}`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `citizens-export-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type SortKey = "name" | "count" | "avgIntelligence" | "avgMastery" | "avgAutonomy";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

const TABS = [
  { id: "overview", label: "Role Overview" },
  { id: "citizens", label: "Citizens by Role" },
];

// ─── Main Page ───────────────────────────────────────────────────

export function RolesPage() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useRpc<{
    citizens?: CitizenSummary[];
    stats?: { specializationDistribution?: Record<string, number> };
  }>("republic.population.list", { limit: 10000 });

  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [seedRole, setSeedRole] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [tablePage, setTablePage] = useState(0);

  const citizens = data?.citizens ?? [];

  // Build role summaries from citizen data
  const roles = useMemo(() => {
    const map = new Map<string, CitizenSummary[]>();
    for (const c of citizens) {
      const role = c.role ?? c.specialization;
      if (!map.has(role)) { map.set(role, []); }
      map.get(role)!.push(c);
    }
    const result: RoleSummary[] = [];
    for (const [name, cits] of map) {
      const n = cits.length;
      result.push({
        name,
        count: n,
        avgIntelligence: n > 0 ? cits.reduce((s, c) => s + (c.intelligence ?? 0), 0) / n : 0,
        avgMastery: n > 0 ? cits.reduce((s, c) => s + (c.masteryLevel ?? 0), 0) / n : 0,
        avgAutonomy: n > 0 ? cits.reduce((s, c) => s + (c.autonomyScore ?? 0), 0) / n : 0,
        citizens: cits,
      });
    }
    return result;
  }, [citizens]);

  // Filtered + sorted
  const filteredRoles = useMemo(() => {
    let list = roles;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    list = list.toSorted((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [roles, search, sortKey, sortDir]);

  // Selected role citizens
  const selectedCitizens = useMemo(() => {
    if (!selectedRole) { return citizens; }
    return citizens.filter((c) => (c.role ?? c.specialization) === selectedRole);
  }, [citizens, selectedRole]);

  const totalPages = Math.max(1, Math.ceil(selectedCitizens.length / PAGE_SIZE));
  const pageRows = selectedCitizens.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);

  // Sort handler
  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); }
    else { setSortKey(key); setSortDir("desc"); }
  }, [sortKey]);

  // CRUD actions
  const handleSeedCitizen = async () => {
    if (!seedRole) { return; }
    setShowSeedDialog(false);
    await mutateRpc("republic.simulation.agent.create", { specialization: seedRole });
    refetch();
  };

  const handleDelete = async () => {
    if (!deleteTarget) { return; }
    await mutateRpc("republic.citizen.delete", { citizenId: deleteTarget.id });
    setDeleteTarget(null);
    refetch();
  };

  const handleAIGenerate = async () => {
    setGeneratingAI(true);
    try {
      await rpc("republic.simulation.agent.create", { specialization: selectedRole ?? undefined });
      refetch();
    } finally {
      setGeneratingAI(false);
    }
  };

  // Stats
  const totalCitizens = citizens.length;
  const totalRoles = roles.length;
  const avgIQ = totalCitizens > 0 ? citizens.reduce((s, c) => s + (c.intelligence ?? 0), 0) / totalCitizens : 0;
  const topRole = roles.length > 0 ? roles.toSorted((a, b) => b.count - a.count)[0] : null;

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) { return <ArrowUpDown size={12} className="text-text-muted opacity-40" />; }
    return sortDir === "asc"
      ? <ChevronUp size={12} className="text-accent" />
      : <ChevronDown size={12} className="text-accent" />;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <RpcStatus loading={loading} error={error} onRetry={refetch} />
      <PageHeader
        title="Roles & Specializations"
        description={`${totalRoles} active roles across ${totalCitizens.toLocaleString()} citizens — manage, analyze, and seed new roles`}
        icon={<Briefcase size={28} />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => exportCSV(filteredRoles)}>
              Export
            </Button>
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => { setSeedRole(""); setShowSeedDialog(true); }}>
              Seed Citizen
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Roles" value={totalRoles} icon={<Briefcase size={16} />} sub="Active specializations" />
        <StatCard label="Total Citizens" value={totalCitizens.toLocaleString()} icon={<Users size={16} />} />
        <StatCard label="Avg Intelligence" value={fmt(avgIQ)} icon={<Brain size={16} />} />
        <StatCard label="Top Role" value={topRole?.name ?? "—"} sub={topRole ? `${topRole.count} citizens` : ""} icon={<Zap size={16} />} />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setSearch(""); setSelectedRole(null); setTablePage(0); }} />

      {/* ── Role Overview Tab ── */}
      {tab === "overview" && (
        <Card hover={false}>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <div className="relative w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roles..."
                className="w-full bg-bg-input border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus transition-all"
              />
            </div>
            <Badge variant="neutral"><Filter size={10} className="mr-1 inline" />{filteredRoles.length} roles</Badge>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {([
                    ["name", "Role"],
                    ["count", "Citizens"],
                    ["avgIntelligence", "Avg IQ"],
                    ["avgMastery", "Avg Mastery"],
                    ["avgAutonomy", "Avg Autonomy"],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted border-b border-border cursor-pointer hover:text-text-primary transition-colors select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        {label}
                        <SortIcon col={key} />
                      </div>
                    </th>
                  ))}
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted border-b border-border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-text-muted">
                      No roles found.
                    </td>
                  </tr>
                ) : (
                  filteredRoles.map((r) => (
                    <tr
                      key={r.name}
                      className="hover:bg-accent/5 transition-colors cursor-pointer border-b border-border/20 last:border-0"
                      onClick={() => { setSelectedRole(r.name); setTab("citizens"); setTablePage(0); }}
                      title="Click to view citizens in this role"
                    >
                      <td className="px-4 py-3">
                        <Badge variant="purple">{r.name}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">{r.count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={Math.min(Math.round(r.avgIntelligence), 100)} className="w-16" size="sm" />
                          <span className="text-xs text-text-muted">{fmt(r.avgIntelligence)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={Math.min(Math.round(r.avgMastery * 100), 100)} className="w-16" size="sm" />
                          <span className="text-xs text-text-muted">{pct(r.avgMastery)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={Math.min(Math.round(r.avgAutonomy * 100), 100)} className="w-16" size="sm" />
                          <span className="text-xs text-text-muted">{pct(r.avgAutonomy)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="sm"
                            icon={<Plus size={12} />}
                            aria-label={`Seed citizen as ${r.name}`}
                            onClick={(e) => { e.stopPropagation(); setSeedRole(r.name); setShowSeedDialog(true); }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Citizens by Role Tab ── */}
      {tab === "citizens" && (
        <Card hover={false}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-text-heading">
                {selectedRole ? (
                  <><Badge variant="purple">{selectedRole}</Badge> <span className="ml-2 text-text-muted font-normal">({selectedCitizens.length} citizens)</span></>
                ) : (
                  <>All Citizens <span className="text-text-muted font-normal text-xs">({citizens.length})</span></>
                )}
              </h3>
              {selectedRole && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedRole(null)}>
                  Show All
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" icon={<Download size={12} />} onClick={() => exportCitizensCSV(selectedCitizens)}>
                Export CSV
              </Button>
              <Button variant="primary" size="sm" icon={<Sparkles size={12} />} onClick={handleAIGenerate} disabled={generatingAI}>
                {generatingAI ? "Generating..." : "AI Generate"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {["Citizen", "Role", "Intelligence", "Autonomy", "Mastery", "Activity", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted border-b border-border">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedCitizens.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <EmptyState title="No Citizens" description="No citizens match the selected role." />
                    </td>
                  </tr>
                ) : (
                  pageRows.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-accent/5 transition-colors cursor-pointer border-b border-border/20 last:border-0 group"
                      onClick={() => navigate(`/republic/citizens/${c.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-purple flex items-center justify-center text-white text-xs font-bold">
                            {c.name.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-text-primary">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge variant="purple">{c.role ?? c.specialization}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Brain size={12} className="text-accent" />
                          <ProgressBar value={Math.min(Math.round(c.intelligence ?? 0), 100)} className="w-16" size="sm" />
                          <span className="text-xs text-text-muted">{Math.round(c.intelligence ?? 0)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Zap size={12} className="text-warning" />
                          <span className="text-xs text-text-muted">{Math.round((c.autonomyScore ?? 0) * 100)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Shield size={12} className="text-success" />
                          <span className="text-xs text-text-muted">{Math.round((c.masteryLevel ?? 0) * 100)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={c.activity !== "Sleeping" ? "success" : "neutral"}>
                          {c.activity !== "Sleeping" ? "active" : "sleeping"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost" size="sm"
                          icon={<Trash2 size={12} />}
                          aria-label={`Delete ${c.name}`}
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: c.id, name: c.name }); }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-border/30">
              <Button variant="outline" size="sm" icon={<ChevronLeft size={14} />} disabled={tablePage === 0} onClick={() => setTablePage((p) => Math.max(0, p - 1))}>
                Prev
              </Button>
              <span className="text-xs text-text-muted">Page {tablePage + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={tablePage >= totalPages - 1} onClick={() => setTablePage((p) => Math.min(totalPages - 1, p + 1))}>
                Next <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Seed Dialog */}
      <ConfirmDialog
        open={showSeedDialog}
        title="Seed New Citizen"
        message={
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              Create a new citizen with the specified specialization role.
            </p>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Specialization / Role</label>
              <input
                value={seedRole}
                onChange={(e) => setSeedRole(e.target.value)}
                placeholder="e.g. NeuroinformaticsEngineer"
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus"
                list="role-suggestions"
              />
              <datalist id="role-suggestions">
                {roles.map((r) => <option key={r.name} value={r.name} />)}
              </datalist>
              <p className="text-[11px] text-text-muted mt-1">
                The citizen will be seeded with random stats and assigned to this role. You can pick from existing roles or type a new one.
              </p>
            </div>
          </div>
        }
        onConfirm={handleSeedCitizen}
        onCancel={() => setShowSeedDialog(false)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Citizen"
        message={`Are you sure you want to permanently remove "${deleteTarget?.name}" from the republic? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
