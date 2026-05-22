import { Building2, Scale, Users, Landmark, Vote, RefreshCw } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, Tabs, StatCard , RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

type BillStatus = "Proposed" | "InCommittee" | "OnFloor" | "Passed" | "Vetoed" | "Failed";
type CaseStatus = "Filed" | "InProgress" | "Resolved" | "Appealed";

const BILL_COLORS: Record<BillStatus, string> = {
  Proposed: "bg-purple-500",
  InCommittee: "bg-warning",
  OnFloor: "bg-info",
  Passed: "bg-success",
  Vetoed: "bg-danger",
  Failed: "bg-neutral-500",
};

const CASE_BADGE: Record<CaseStatus, "info" | "warning" | "success" | "danger"> = {
  Filed: "info",
  InProgress: "warning",
  Resolved: "success",
  Appealed: "danger",
};

type GovernmentData = {
  president: { role: string; appointedAt: number };
  cabinet: Array<{ role: string; department: string }>;
  senators: number;
  representatives: number;
  constitution: {
    preamble: string;
    articles: Array<{ number: number; title: string; text: string; ratifiedAt: number }>;
    totalAmendments: number;
    lawCount: number;
  };
  laws: Array<{ id: string; title: string; passedAt: number }>;
  pendingBills: Array<{
    id: string;
    title: string;
    description: string;
    sponsor: string;
    status: BillStatus;
    proposedAt: number;
    votesFor: number;
    votesAgainst: number;
  }>;
  cases: Array<{
    id: string;
    plaintiff: string;
    defendant: string;
    description: string;
    status: CaseStatus;
    filedAt: number;
    verdict?: string;
  }>;
  departments: Array<{
    type: string;
    staffCount: number;
    budget: number;
    responsibilities: string[];
  }>;
  elections: Array<{
    id: string;
    position: string;
    candidates: string[];
    winner?: string;
    totalVotes: number;
    heldAt: number;
  }>;
};

const GOV_TABS = [
  { id: "executive", label: "Executive", icon: <Building2 size={14} /> },
  { id: "legislature", label: "Legislature", icon: <Scale size={14} /> },
  { id: "judiciary", label: "Judiciary", icon: <Landmark size={14} /> },
  { id: "departments", label: "Departments", icon: <Users size={14} /> },
  { id: "elections", label: "Elections", icon: <Vote size={14} /> },
];

function formatBudget(n: number): string {
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`;
  }
  return `$${n}`;
}

export function GovernmentPage() {
  const [activeTab, setActiveTab] = useState("executive");
  const { data: govData,
    loading,
    refetch, error } = useRpc<{ status: GovernmentData }>("republic.government.status", {});
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const g = govData?.status;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-text-muted animate-pulse flex flex-col items-center gap-4">
          <Building2 size={32} />
          <span>Loading Republic Government...</span>
        </div>
      </div>
    );
  }

  // Handle case where government hasn't been initialized yet
  if (!g) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-text-muted flex flex-col items-center gap-4 text-center">
          <Building2 size={32} className="opacity-30" />
          <p className="text-sm">Government not initialized yet.</p>
          <p className="text-xs text-text-muted/60">
            The Republic simulation needs to run for at least one tick to generate government data.
          </p>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Government"
        description="Constitutional structure, legislation, judiciary, and elections"
        icon={<Building2 size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {/* Constitution Banner */}
      <Card className="bg-gradient-to-r from-accent/10 to-purple-500/10 border-accent/30">
        <div className="flex items-start gap-4">
          <span className="text-3xl">🏛️</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-text-heading mb-1">
              Constitution of the HoC Republic
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {g.constitution?.preamble}
            </p>
            <div className="flex gap-4 mt-2 text-xs text-text-muted">
              <span>📜 {g.constitution?.articles?.length ?? 0} Articles</span>
              <span>⚖️ {g.constitution?.totalAmendments ?? 0} Amendments</span>
              <span>📋 {g.constitution?.lawCount ?? 0} Laws</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Section Tabs */}
      <Tabs tabs={GOV_TABS} active={activeTab} onChange={setActiveTab} />

      {/* Executive */}
      {activeTab === "executive" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-accent/40 bg-gradient-to-br from-accent/5 to-transparent">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-heading">President</h3>
              <Badge variant="purple">Executive</Badge>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-2xl">
                🏛️
              </div>
              <div>
                <p className="font-bold text-text-heading">{g.president.role}</p>
                <p className="text-sm text-text-muted">
                  Since {new Date(g.president.appointedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-heading">Cabinet</h3>
              <Badge>{g.cabinet.length} Members</Badge>
            </div>
            <div className="space-y-2">
              {g.cabinet.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                >
                  <span className="text-sm text-text-secondary">{m.role}</span>
                  <Badge variant="info">{m.department}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Legislature */}
      {activeTab === "legislature" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Senators" value={g.senators} icon={<Users size={16} />} />
            <StatCard
              label="Representatives"
              value={g.representatives}
              icon={<Users size={16} />}
            />
            <StatCard label="Laws Enacted" value={g.laws.length} icon={<Scale size={16} />} />
          </div>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-heading">Pending Bills</h3>
              <Badge variant="warning">{g.pendingBills.length} Active</Badge>
            </div>
            <div className="space-y-3">
              {g.pendingBills.map((b) => (
                <div key={b.id} className="p-3 rounded-lg bg-bg-secondary border border-border/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${BILL_COLORS[b.status]}`} />
                      <div>
                        <p className="font-medium text-sm text-text-heading">{b.title}</p>
                        <p className="text-xs text-text-muted mt-0.5">{b.description}</p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        b.status === "Passed"
                          ? "success"
                          : b.status === "Vetoed"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {b.status}
                    </Badge>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-success">✓ {b.votesFor} for</span>
                    <span className="text-danger">✗ {b.votesAgainst} against</span>
                    <span className="text-text-muted">Sponsored by {b.sponsor}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-heading">Enacted Laws</h3>
              <Badge>{g.laws.length}</Badge>
            </div>
            <div className="divide-y divide-border/20">
              {g.laws.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-text-secondary">{l.title}</span>
                  <span className="text-xs text-text-muted">
                    {new Date(l.passedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Judiciary */}
      {activeTab === "judiciary" && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-heading">Court Cases</h3>
            <Badge>{g.cases.length}</Badge>
          </div>
          <div className="space-y-3">
            {g.cases.map((c) => (
              <div key={c.id} className="p-3 rounded-lg bg-bg-secondary border border-border/30">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm text-text-heading">
                      {c.plaintiff} vs {c.defendant}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{c.description}</p>
                    {c.verdict && <p className="text-xs text-warning mt-1">⚖️ {c.verdict}</p>}
                  </div>
                  <Badge variant={CASE_BADGE[c.status]}>{c.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Departments */}
      {activeTab === "departments" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {g.departments.map((d) => (
            <Card key={d.type} className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-text-heading">{d.type}</h4>
                <Badge variant="success">Active</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-text-muted">
                <span>👥 {d.staffCount} staff</span>
                <span>💰 {formatBudget(d.budget)}</span>
              </div>
              <ul className="space-y-1">
                {d.responsibilities.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-xs text-text-secondary flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-accent/60 flex-shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {/* Elections */}
      {activeTab === "elections" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Button
              icon={<Vote size={14} />}
              onClick={async () => {
                await rpc("republic.government.election.hold", { position: "President" });
                refetch();
              }}
            >
              🗳️ Presidential Election
            </Button>
            <Button
              variant="outline"
              icon={<Vote size={14} />}
              onClick={async () => {
                await rpc("republic.government.election.hold", { position: "Senator" });
                refetch();
              }}
            >
              🗳️ Senate Election
            </Button>
          </div>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-heading">Election History</h3>
              <Badge>{(g.elections ?? []).length}</Badge>
            </div>
            <div className="space-y-3">
              {(g.elections ?? []).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between py-3 border-b border-border/20 last:border-0"
                >
                  <div>
                    <p className="font-medium text-text-heading">{e.position}</p>
                    <p className="text-xs text-text-muted">
                      {e.candidates.length} candidates · {e.totalVotes} votes ·{" "}
                      {new Date(e.heldAt).toLocaleDateString()}
                    </p>
                  </div>
                  {e.winner && <Badge variant="warning">🏆 {e.winner}</Badge>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
