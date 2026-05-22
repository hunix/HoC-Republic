import { useState } from "react";
import {
  Briefcase, Users, Target, DollarSign, Scale, Building,
  Search, ChevronDown, ChevronRight, CheckCircle, XCircle,
  AlertTriangle, Award, TrendingUp, FileText,
} from "lucide-react";
import { useRpc, rpc } from "@/lib/rpc";
import {
  PageHeader, Card, Badge, StatCard, Tabs,
  RpcStatus, Button, ProgressBar, EmptyState,
} from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────

interface HROverview {
  jobCatalog: { totalJobs: number; totalDepartments: number; departments: string[]; totalUniqueCompetencies: number; avgSalaryMid: number };
  competencies: { totalAssessments: number; uniqueCitizensAssessed: number; totalCompetencies: number; avgScore: number; passRate: number; byCategory: Record<string, number> };
  okrs: { totalOKRs: number; activeOKRs: number; completedOKRs: number; avgProgress: number; currentQuarter: string; byType: Record<string, number> };
  payroll: { totalCycles: number; latestPayout: number; latestAvgPay: number; totalPayslips: number; treasury: number };
  labor: { totalViolations: number; unresolvedViolations: number; totalGrievances: number; openGrievances: number; complianceScore: number };
  orgStructure: { totalDepartments: number; totalPositions: number; filledPositions: number; vacantPositions: number; fillRate: number };
}

interface JD {
  id: string; title: string; specialization: string; department: string; division: string;
  summary: string; responsibilities: string[]; requiredCompetencies: Array<{ competencyId: string; name: string; requiredLevel: number; weight: number; category: string }>;
  preferredCompetencies: Array<{ competencyId: string; name: string; requiredLevel: number; weight: number }>;
  minIntelligence: number; minMasteryLevel: number; minAutonomy: number;
  educationPath: string[]; certificationPath: string[];
  salaryBand: { min: number; mid: number; max: number };
  careerPath: { from: string[]; to: string[] };
}

interface CompetencyDef {
  id: string; name: string; category: string; description: string; relatedDomains: string[];
}

interface OKRItem {
  id: string; type: string; ownerId: string; ownerName: string; objective: string;
  keyResults: Array<{ id: string; description: string; target: number; current: number; unit: string; weight: number }>;
  quarter: string; status: string; progress: number; createdAt: string; updatedAt: string;
}

interface PayrollCycle {
  id: string; cycleNumber: number; totalPayout: number; citizensPaid: number; avgNetPay: number;
  totalBonuses: number; totalDeductions: number; treasuryBefore: number; treasuryAfter: number; ranAt: string;
}

interface LaborViolation {
  id: string; citizenId: string; citizenName: string; type: string; description: string;
  severity: string; detectedAt: string; resolved: boolean;
}

interface Grievance {
  id: string; filedByName: string; subject: string; status: string; priority: string; filedAt: string;
}

interface OrgDept {
  id: string; name: string; citizenCount: number;
  divisions: Array<{ id: string; name: string; positions: Array<{ id: string; title: string; level: string; assignedCitizenName?: string; vacant: boolean }> }>;
}

// ─── Helpers ────────────────────────────────────────────────────

const fmt = (n: number) => n?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "0";

const severityBadge = (s: string) => {
  const map: Record<string, "danger" | "warning" | "info" | "neutral"> = { critical: "danger", high: "danger", medium: "warning", low: "info" };
  return <Badge variant={map[s] ?? "neutral"}>{s}</Badge>;
};

const statusBadge = (s: string) => {
  const map: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
    active: "success", completed: "info", cancelled: "neutral", draft: "warning",
    open: "warning", investigating: "info", resolved: "success", dismissed: "neutral",
  };
  return <Badge variant={map[s] ?? "neutral"}>{s}</Badge>;
};

// ─── Component ──────────────────────────────────────────────────

const HR_TABS = [
  { id: "overview", label: "Overview" },
  { id: "catalog", label: "Job Catalog" },
  { id: "competency", label: "Competencies" },
  { id: "okr", label: "OKRs" },
  { id: "payroll", label: "Payroll" },
  { id: "labor", label: "Labor & Compliance" },
  { id: "org", label: "Org Structure" },
];

export function HRDepartmentPage() {
  const [tab, setTab] = useState("overview");

  // All hooks at top
  const { data: overview, loading: oL, error: oE, refetch: oR } = useRpc<HROverview>("republic.hr.overview", {});
  const { data: jdData, loading: jL, error: jE, refetch: jR } = useRpc<{ items: JD[] }>("republic.hr.jd.list", {});
  const { data: compData, loading: cL, error: cE, refetch: cR } = useRpc<{ items: CompetencyDef[] }>("republic.hr.competency.list", {});
  const { data: okrData, loading: okL, error: okE, refetch: okR } = useRpc<{ items: OKRItem[] }>("republic.hr.okr.list", {});
  const { data: payData, loading: pL, error: pE, refetch: pR } = useRpc<{ items: PayrollCycle[] }>("republic.hr.payroll.history", {});
  const { data: violData, loading: vL, error: vE, refetch: vR } = useRpc<{ items: LaborViolation[] }>("republic.hr.labor.violations", {});
  const { data: grievData, loading: gL, error: gE, refetch: gR } = useRpc<{ items: Grievance[] }>("republic.hr.labor.grievances", {});
  const { data: orgData, loading: orgL, error: orgE, refetch: orgR } = useRpc<{ departments: OrgDept[] }>("republic.hr.org.structure", {});

  const [search, setSearch] = useState("");
  const [expandedJD, setExpandedJD] = useState<string | null>(null);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  // Gate for overview
  if (oL || oE) { return <RpcStatus loading={oL} error={oE} onRetry={oR} />; }

  const o = overview!;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="HR Department"
        description="Job Catalog · Competency Assessment · OKRs · Payroll · Labor Law · Org Structure"
        icon={<Briefcase size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              await rpc("republic.hr.okr.generate", {});
              okR();
            }}>
              <Target size={14} className="mr-1" /> Generate OKRs
            </Button>
            <Button variant="outline" size="sm" onClick={async () => {
              await rpc("republic.hr.org.autoAssign", {});
              orgR();
            }}>
              <Users size={14} className="mr-1" /> Auto-Assign
            </Button>
            <Button variant="primary" size="sm" onClick={async () => {
              await rpc("republic.hr.payroll.run", {});
              pR();
              oR();
            }}>
              <DollarSign size={14} className="mr-1" /> Run Payroll
            </Button>
          </div>
        }
      />

      <Tabs tabs={HR_TABS} active={tab} onChange={setTab} />

      {/* ── Overview Tab ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Job Descriptions" value={o.jobCatalog.totalJobs} icon={<FileText size={18} />} sub={`${o.jobCatalog.totalDepartments} departments`} />
            <StatCard label="Competencies" value={o.competencies.totalCompetencies} icon={<Award size={18} />} sub={`${o.competencies.totalAssessments} assessments`} />
            <StatCard label="Active OKRs" value={o.okrs.activeOKRs} icon={<Target size={18} />} sub={`${fmt(o.okrs.avgProgress * 100)}% avg progress`} />
            <StatCard label="Latest Payout" value={`${fmt(o.payroll.latestPayout)} cr`} icon={<DollarSign size={18} />} sub={`Avg ${fmt(o.payroll.latestAvgPay)} cr/citizen`} />
            <StatCard label="Compliance" value={`${o.labor.complianceScore}%`} icon={<Scale size={18} />} sub={`${o.labor.unresolvedViolations} violations`} />
            <StatCard label="Org Fill Rate" value={`${o.orgStructure.fillRate}%`} icon={<Building size={18} />} sub={`${o.orgStructure.vacantPositions} vacancies`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-text-heading font-semibold mb-3">Competency Breakdown</h3>
              <div className="space-y-2">
                {Object.entries(o.competencies.byCategory).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-text-secondary capitalize">{cat}</span>
                    <Badge variant="info">{count}</Badge>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-text-secondary">Avg Score</span>
                  <span className="text-text-primary font-medium">{fmt(o.competencies.avgScore)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Pass Rate</span>
                  <span className="text-text-primary font-medium">{fmt(o.competencies.passRate * 100)}%</span>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-text-heading font-semibold mb-3">OKR Distribution</h3>
              <div className="space-y-2">
                {Object.entries(o.okrs.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-text-secondary capitalize">{type}</span>
                    <Badge variant="neutral">{count as number}</Badge>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-text-secondary">Completed</span>
                  <Badge variant="success">{o.okrs.completedOKRs}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Quarter</span>
                  <span className="text-text-primary font-medium">{o.okrs.currentQuarter}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Job Catalog Tab ── */}
      {tab === "catalog" && (
        <div className="space-y-4">
          {jL || jE ? <RpcStatus loading={jL} error={jE} onRetry={jR} /> : (
            <>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    className="w-full pl-10 pr-4 py-2 bg-bg-input border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                    placeholder="Search job descriptions..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Badge variant="info">{(jdData?.items ?? []).length} JDs</Badge>
              </div>

              <div className="space-y-2">
                {(jdData?.items ?? [])
                  .filter((jd) => !search || jd.title.toLowerCase().includes(search.toLowerCase()) || jd.department.toLowerCase().includes(search.toLowerCase()))
                  .map((jd) => (
                    <Card key={jd.id} hover className="cursor-pointer" onClick={() => setExpandedJD(expandedJD === jd.id ? null : jd.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedJD === jd.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <div>
                            <span className="font-medium text-text-heading">{jd.title}</span>
                            <div className="text-xs text-text-muted">{jd.department} · {jd.division}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="neutral">{jd.requiredCompetencies.length} competencies</Badge>
                          <span className="text-sm text-text-secondary">{fmt(jd.salaryBand.min)}–{fmt(jd.salaryBand.max)} cr</span>
                        </div>
                      </div>

                      {expandedJD === jd.id && (
                        <div className="mt-4 pt-4 border-t border-border space-y-3">
                          <p className="text-text-secondary text-sm">{jd.summary}</p>

                          <div>
                            <h4 className="text-xs font-semibold text-text-muted uppercase mb-1">Required Competencies</h4>
                            <div className="flex flex-wrap gap-1">
                              {jd.requiredCompetencies.map((c) => (
                                <Badge key={c.competencyId} variant="info">
                                  {c.name} (L{c.requiredLevel})
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div><span className="text-text-muted">Min IQ:</span> <span className="text-text-primary">{jd.minIntelligence}</span></div>
                            <div><span className="text-text-muted">Min Mastery:</span> <span className="text-text-primary">{jd.minMasteryLevel}</span></div>
                            <div><span className="text-text-muted">Min Autonomy:</span> <span className="text-text-primary">{jd.minAutonomy}</span></div>
                          </div>

                          {jd.careerPath.to.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-text-muted uppercase mb-1">Career Progression</h4>
                              <div className="flex items-center gap-2 text-sm text-text-secondary">
                                {jd.careerPath.from.length > 0 && <span className="text-text-muted">{jd.careerPath.from.join(", ")} →</span>}
                                <span className="text-accent font-medium">{jd.title}</span>
                                <span className="text-text-muted">→ {jd.careerPath.to.join(", ")}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Competencies Tab ── */}
      {tab === "competency" && (
        <div className="space-y-4">
          {cL || cE ? <RpcStatus loading={cL} error={cE} onRetry={cR} /> : (
            <>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    className="w-full pl-10 pr-4 py-2 bg-bg-input border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                    placeholder="Search competencies..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Badge variant="info">{(compData?.items ?? []).length} total</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(compData?.items ?? [])
                  .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
                  .map((c) => (
                    <Card key={c.id}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-text-heading text-sm">{c.name}</span>
                        <Badge variant={c.category === "technical" ? "info" : c.category === "behavioral" ? "purple" : "success"}>
                          {c.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-muted mb-2">{c.description}</p>
                      {c.relatedDomains.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.relatedDomains.slice(0, 4).map((d) => (
                            <span key={d} className="text-[10px] px-1.5 py-0.5 bg-bg-secondary rounded text-text-muted">{d}</span>
                          ))}
                          {c.relatedDomains.length > 4 && (
                            <span className="text-[10px] text-text-muted">+{c.relatedDomains.length - 4}</span>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── OKRs Tab ── */}
      {tab === "okr" && (
        <div className="space-y-4">
          {okL || okE ? <RpcStatus loading={okL} error={okE} onRetry={okR} /> : (
            <>
              {(okrData?.items ?? []).length === 0 ? (
                <EmptyState
                  icon={<Target size={48} />}
                  title="No OKRs Yet"
                  description="Generate OKRs for citizens and departments using the button above."
                />
              ) : (
                <div className="space-y-3">
                  {(okrData?.items ?? []).map((okr) => (
                    <Card key={okr.id}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-medium text-text-heading">{okr.objective}</span>
                          <div className="text-xs text-text-muted">{okr.ownerName} · {okr.quarter}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={okr.type === "citizen" ? "info" : okr.type === "department" ? "purple" : "success"}>
                            {okr.type}
                          </Badge>
                          {statusBadge(okr.status)}
                        </div>
                      </div>
                      <ProgressBar value={Math.round(okr.progress * 100)} max={100} labelLeft="Progress" labelRight={`${fmt(okr.progress * 100)}%`} />
                      <div className="mt-3 space-y-1">
                        {okr.keyResults.map((kr) => (
                          <div key={kr.id} className="flex items-center justify-between text-sm">
                            <span className="text-text-secondary truncate flex-1">{kr.description}</span>
                            <span className="text-text-muted ml-2">{fmt(kr.current)}/{kr.target} {kr.unit}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Payroll Tab ── */}
      {tab === "payroll" && (
        <div className="space-y-4">
          {pL || pE ? <RpcStatus loading={pL} error={pE} onRetry={pR} /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Cycles" value={o.payroll.totalCycles} icon={<DollarSign size={18} />} />
                <StatCard label="Latest Payout" value={`${fmt(o.payroll.latestPayout)} cr`} icon={<TrendingUp size={18} />} />
                <StatCard label="Avg Pay" value={`${fmt(o.payroll.latestAvgPay)} cr`} icon={<DollarSign size={18} />} />
                <StatCard label="Treasury" value={`${fmt(o.payroll.treasury)} cr`} icon={<DollarSign size={18} />} />
              </div>

              {(payData?.items ?? []).length === 0 ? (
                <EmptyState icon={<DollarSign size={48} />} title="No Payroll History" description="Run your first payroll cycle using the button above." />
              ) : (
                <Card>
                  <h3 className="text-text-heading font-semibold mb-3">Payroll Cycles</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-text-muted text-left border-b border-border">
                          <th className="pb-2">Cycle</th>
                          <th className="pb-2">Citizens</th>
                          <th className="pb-2">Total Payout</th>
                          <th className="pb-2">Avg Net Pay</th>
                          <th className="pb-2">Bonuses</th>
                          <th className="pb-2">Treasury After</th>
                          <th className="pb-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(payData?.items ?? []).toReversed().slice(0, 20).map((c) => (
                          <tr key={c.id} className="border-b border-border/30">
                            <td className="py-2 text-text-primary">#{c.cycleNumber}</td>
                            <td className="py-2">{c.citizensPaid}</td>
                            <td className="py-2 text-accent font-medium">{fmt(c.totalPayout)} cr</td>
                            <td className="py-2">{fmt(c.avgNetPay)} cr</td>
                            <td className="py-2">{fmt(c.totalBonuses)} cr</td>
                            <td className="py-2">{fmt(c.treasuryAfter)} cr</td>
                            <td className="py-2 text-text-muted">{new Date(c.ranAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Labor & Compliance Tab ── */}
      {tab === "labor" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Compliance Score" value={`${o.labor.complianceScore}%`} icon={<Scale size={18} />} />
            <StatCard label="Total Violations" value={o.labor.totalViolations} icon={<AlertTriangle size={18} />} sub={`${o.labor.unresolvedViolations} unresolved`} />
            <StatCard label="Grievances" value={o.labor.totalGrievances} icon={<FileText size={18} />} sub={`${o.labor.openGrievances} open`} />
            <Button variant="outline" size="sm" onClick={async () => {
              await rpc("republic.hr.labor.check", {});
              vR();
              oR();
            }}>
              <Scale size={14} className="mr-1" /> Run Compliance Check
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-text-heading font-semibold mb-3">Violations</h3>
              {vL || vE ? <RpcStatus loading={vL} error={vE} onRetry={vR} /> : (
                (violData?.items ?? []).length === 0 ? (
                  <EmptyState icon={<CheckCircle size={32} />} title="No Violations" description="All citizens are in compliance." />
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(violData?.items ?? []).slice(0, 30).map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-sm p-2 bg-bg-secondary rounded">
                        <div>
                          <span className="text-text-primary">{v.citizenName}</span>
                          <div className="text-xs text-text-muted">{v.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {severityBadge(v.severity)}
                          {v.resolved ? <CheckCircle size={14} className="text-success" /> : <XCircle size={14} className="text-danger" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </Card>

            <Card>
              <h3 className="text-text-heading font-semibold mb-3">Grievances</h3>
              {gL || gE ? <RpcStatus loading={gL} error={gE} onRetry={gR} /> : (
                (grievData?.items ?? []).length === 0 ? (
                  <EmptyState icon={<FileText size={32} />} title="No Grievances" description="No grievances filed." />
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(grievData?.items ?? []).slice(0, 30).map((g) => (
                      <div key={g.id} className="flex items-center justify-between text-sm p-2 bg-bg-secondary rounded">
                        <div>
                          <span className="text-text-primary">{g.filedByName}</span>
                          <div className="text-xs text-text-muted">{g.subject}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={g.priority === "high" ? "danger" : g.priority === "medium" ? "warning" : "info"}>{g.priority}</Badge>
                          {statusBadge(g.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ── Org Structure Tab ── */}
      {tab === "org" && (
        <div className="space-y-4">
          {orgL || orgE ? <RpcStatus loading={orgL} error={orgE} onRetry={orgR} /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Departments" value={o.orgStructure.totalDepartments} icon={<Building size={18} />} />
                <StatCard label="Positions" value={o.orgStructure.totalPositions} icon={<Users size={18} />} />
                <StatCard label="Filled" value={o.orgStructure.filledPositions} icon={<CheckCircle size={18} />} />
                <StatCard label="Fill Rate" value={`${o.orgStructure.fillRate}%`} icon={<TrendingUp size={18} />} />
              </div>

              <div className="space-y-4">
                {(orgData?.departments ?? []).map((dept) => (
                  <Card key={dept.id}>
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedDept(expandedDept === dept.id ? null : dept.id)}
                    >
                      <div className="flex items-center gap-2">
                        {expandedDept === dept.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <h3 className="font-semibold text-text-heading">{dept.name}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="info">{dept.citizenCount} assigned</Badge>
                        <Badge variant="neutral">{dept.divisions.length} divisions</Badge>
                      </div>
                    </div>

                    {expandedDept === dept.id && (
                      <div className="mt-4 space-y-3">
                        {dept.divisions.map((div) => (
                          <div key={div.id} className="pl-4 border-l-2 border-accent/30">
                            <h4 className="text-sm font-medium text-text-secondary mb-2">{div.name}</h4>
                            <div className="space-y-1">
                              {div.positions.map((pos) => (
                                <div key={pos.id} className="flex items-center justify-between text-sm p-2 bg-bg-secondary rounded">
                                  <div>
                                    <span className="text-text-primary">{pos.title}</span>
                                    <span className="text-xs text-text-muted ml-2">({pos.level})</span>
                                  </div>
                                  {pos.vacant ? (
                                    <Badge variant="warning">Vacant</Badge>
                                  ) : (
                                    <Badge variant="success">{pos.assignedCitizenName}</Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
