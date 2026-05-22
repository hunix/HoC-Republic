import {
  Briefcase,
  // oxlint-disable-next-line no-unused-vars
  TrendingUp,
  Award,
  Zap,
  Users,
  Activity,
  Target,
  DollarSign,
} from "lucide-react";
import { useState } from "react";
import {
  RpcStatus,
  PageHeader,
  StatCard,
  Card,
  Badge,
  Tabs,
  ProgressBar,
  EmptyState,
} from "@/components/ui";
import { useRpc } from "@/lib/rpc";

interface WorkforceMetrics {
  totalCitizens: number;
  activeWorkers: number;
  idleWorkers: number;
  totalRevenueGenerated: number;
  revenueThisCycle: number;
  averageMastery: number;
  topMasteryDomain: string;
  capabilityGaps: number;
  openOpportunities: number;
  completedAssignments: number;
  activeAssignments: number;
  masteryVelocity: number;
  specializationCoverage: Record<string, number>;
}

interface WorkAssignment {
  id: string;
  citizenId: string;
  citizenName: string;
  workType: string;
  description: string;
  estimatedRevenue: number;
  estimatedMasteryGain: number;
  priority: number;
  assignedAtTick: number;
  completedAtTick?: number;
  status: "active" | "completed" | "abandoned";
}

interface DomainMastery {
  domain: string;
  proficiency: number;
  ticksInvested: number;
  proficiencyCurve: number[];
  zpd: string[];
  certifications: string[];
}

interface MasteryProfile {
  citizenId: string;
  citizenName: string;
  specialization: string;
  domains: Record<string, DomainMastery>;
  overallMastery: number;
  learningVelocity: number;
  revenuePerTick: number;
  totalRevenue: number;
  workCompleted: number;
  workActive: number;
}

interface WorkOpportunity {
  id: string;
  type: string;
  description: string;
  requiredSkills: string[];
  estimatedRevenue: number;
  estimatedMasteryGain: number;
  priority: number;
}

const TYPE_COLORS: Record<
  string,
  "success" | "info" | "warning" | "purple" | "danger" | "neutral"
> = {
  task_bid: "info",
  marketplace: "success",
  project: "purple",
  research: "warning",
  teaching: "info",
  self_improvement: "neutral",
  tool_creation: "purple",
  content_production: "success",
};

export function Workforce() {
  const [tab, setTab] = useState("overview");
  const {
    data: statusData,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useRpc<{ metrics: WorkforceMetrics | null; running: boolean }>(
    "republic.workforce.status",
    {},
    [],
    { refetchIntervalMs: 8000 },
  );
  const {
    data: assignmentsData,
    loading: assignLoading,
    error: assignError,
    refetch: refetchAssign,
  } = useRpc<{ assignments: WorkAssignment[] }>(
    "republic.workforce.assignments",
    { limit: 50 },
    [],
    { refetchIntervalMs: 10000 },
  );
  const {
    data: masteryData,
    loading: mastLoading,
    error: mastError,
    refetch: refetchMast,
  } = useRpc<{ profiles: MasteryProfile[] }>(
    "republic.workforce.mastery",
    { limit: 30, sortBy: "mastery" },
    [],
    { refetchIntervalMs: 15000 },
  );
  const {
    data: discoveryData,
    loading: discLoading,
    error: discError,
    refetch: refetchDisc,
  } = useRpc<{ opportunities: WorkOpportunity[] }>("republic.workforce.discovery", {}, [], {
    refetchIntervalMs: 12000,
  });

  const metrics = statusData?.metrics;
  const assignments = assignmentsData?.assignments ?? [];
  const profiles = masteryData?.profiles ?? [];
  const opportunities = discoveryData?.opportunities ?? [];

  const loading = statusLoading || assignLoading || mastLoading || discLoading;
  const error = statusError || assignError || mastError || discError;
  const refetch = () => {
    refetchStatus();
    refetchAssign();
    refetchMast();
    refetchDisc();
  };

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Workforce"
        description={
          metrics
            ? `${metrics.activeWorkers} active · ${metrics.totalRevenueGenerated.toLocaleString()} ₡ total`
            : "Loading…"
        }
        icon={<Briefcase size={20} />}
      />

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Active"
            value={metrics.activeWorkers}
            icon={<Users size={14} className="text-accent" />}
            sub={`${metrics.idleWorkers} idle`}
          />
          <StatCard
            label="Revenue"
            value={`${metrics.totalRevenueGenerated.toLocaleString()} ₡`}
            icon={<DollarSign size={14} className="text-success" />}
            sub={`+${metrics.revenueThisCycle}`}
          />
          <StatCard
            label="Mastery"
            value={`${(metrics.averageMastery * 100).toFixed(1)}%`}
            icon={<Award size={14} className="text-warning" />}
            sub={metrics.topMasteryDomain}
          />
          <StatCard
            label="Assignments"
            value={metrics.activeAssignments}
            icon={<Activity size={14} className="text-info" />}
            sub={`${metrics.completedAssignments} done`}
          />
        </div>
      )}

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "assignments", label: "Assignments", count: assignments.length },
          { id: "mastery", label: "Mastery", count: profiles.length },
          { id: "discovery", label: "Discovery", count: opportunities.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card compact>
            <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
              <Target size={10} /> Utilization
            </h3>
            <ProgressBar
              value={metrics.activeWorkers}
              max={metrics.totalCitizens}
              labelLeft="Active"
              labelRight={`${metrics.activeWorkers}/${metrics.totalCitizens}`}
              size="sm"
            />
            <div className="mt-2 space-y-1 text-xs text-text-secondary">
              <div className="flex justify-between">
                <span>Gaps</span>
                <span className="text-warning">{metrics.capabilityGaps}</span>
              </div>
              <div className="flex justify-between">
                <span>Opportunities</span>
                <span className="text-info">{metrics.openOpportunities}</span>
              </div>
              <div className="flex justify-between">
                <span>Velocity</span>
                <span className="text-success">{metrics.masteryVelocity.toFixed(4)}/tick</span>
              </div>
            </div>
          </Card>

          <Card compact>
            <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
              <Zap size={10} /> Specializations
            </h3>
            <div className="space-y-1 max-h-48 overflow-auto">
              {Object.entries(metrics.specializationCoverage)
                .toSorted(([, a], [, b]) => b - a)
                .slice(0, 12)
                .map(([spec, count]) => (
                  <div key={spec} className="flex items-center justify-between text-xs">
                    <span className="text-text-primary truncate">{spec}</span>
                    <Badge variant="neutral">{count}</Badge>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "assignments" && (
        <div className="overflow-x-auto rounded-xl border border-border/30 bg-bg-card">
          {assignments.length === 0 ? (
            <EmptyState title="No Assignments" description="Engine hasn't assigned work yet." />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/20">
                  {["Citizen", "Type", "Description", "Revenue", "Mastery", "Status"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border/10 hover:bg-bg-card-hover/50 transition-colors"
                  >
                    <td className="px-3 py-1.5 text-xs text-text-primary">{a.citizenName}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={TYPE_COLORS[a.workType] ?? "neutral"}>
                        {a.workType.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-text-secondary max-w-[200px] truncate">
                      {a.description}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-success text-right tabular-nums">
                      {a.estimatedRevenue} ₡
                    </td>
                    <td className="px-3 py-1.5 text-xs text-warning text-right tabular-nums">
                      +{(a.estimatedMasteryGain * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Badge
                        variant={
                          a.status === "active"
                            ? "info"
                            : a.status === "completed"
                              ? "success"
                              : "danger"
                        }
                        dot
                      >
                        {a.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "mastery" && (
        <div className="space-y-1.5">
          {profiles.length === 0 ? (
            <EmptyState title="No Data" description="Mastery profiles populate as citizens work." />
          ) : (
            profiles.slice(0, 15).map((p, i) => {
              const domainCount = Object.keys(p.domains).length;
              const certCount = Object.values(p.domains).reduce(
                (s, d) => s + d.certifications.length,
                0,
              );
              return (
                <div
                  key={p.citizenId}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-card border border-border/20 hover:border-border/40 transition-colors"
                >
                  <span className="text-lg font-bold text-text-muted w-6 text-center tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-text-primary truncate">
                        {p.citizenName}
                      </span>
                      <Badge variant="neutral">{p.specialization}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-muted">
                      <span>{domainCount} domains</span>
                      <span>{certCount} certs</span>
                      <span>{p.workCompleted} done</span>
                      <span className="text-success">{p.totalRevenue.toLocaleString()} ₡</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-accent tabular-nums">
                      {(p.overallMastery * 100).toFixed(1)}%
                    </div>
                    <div className="text-[9px] text-text-muted tabular-nums">
                      vel: {p.learningVelocity.toFixed(4)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "discovery" && (
        <div className="space-y-1.5">
          {opportunities.length === 0 ? (
            <EmptyState title="No Opportunities" description="Discovery agent scans next tick." />
          ) : (
            opportunities.map((opp) => (
              <div
                key={opp.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/20 hover:border-border/40 transition-colors"
              >
                <Badge variant={TYPE_COLORS[opp.type] ?? "neutral"}>
                  {opp.type.replace(/_/g, " ")}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary truncate">{opp.description}</div>
                  {opp.requiredSkills.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {opp.requiredSkills.map((s) => (
                        <span
                          key={s}
                          className="text-[9px] px-1 py-0.5 rounded bg-bg-input text-text-muted"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs">
                  <div className="text-success tabular-nums">{opp.estimatedRevenue} ₡</div>
                  <div className="text-[9px] text-text-muted tabular-nums">
                    pri: {opp.priority.toFixed(2)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
