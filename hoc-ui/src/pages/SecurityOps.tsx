import { useRpc, rpc, mutateRpc } from "@/lib/rpc";
import {
  PageHeader,
  RpcStatus,
  Card,
  StatCard,
  Badge,
  Button,
  Tabs,
  EmptyState,
  ProgressBar,
} from "@/components/ui";
import { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Radar,
  Cpu,
  Crosshair,
  Eye,
  UserX,
  Swords,
  Activity,
  Target,
  Bug,
  Smartphone,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThreatPosture {
  ok: boolean;
  threatLevel: string;
  totalThreats: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  exploitedInWild: number;
  citizensAtRisk: number;
  totalCitizensProfiled: number;
  platformBreakdown: Record<string, number>;
}

interface BASOverview {
  ok: boolean;
  totalScenarios: number;
  pending: number;
  completed: number;
  patched: number;
  validated: number;
  avgDetectionRate: number;
  avgBlockRate: number;
  exercisesRun: number;
  lastExerciseScore: number | null;
}

interface FleetOverview {
  ok: boolean;
  totalDevices: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  avgPosture: number;
  citizensWithDevices: number;
  totalVulnerabilities: number;
  totalCritical: number;
  remediationStats: { pending: number; applied: number; verified: number; failed: number };
}

interface CIOverview {
  ok: boolean;
  totalCanaries: number;
  activeCanaries: number;
  triggeredCanaries: number;
  totalOperations: number;
  activeOperations: number;
  byPhase: Record<string, number>;
  byType: Record<string, number>;
  avgConfidence: number;
}

interface CorpsOverview {
  ok: boolean;
  totalUnits: number;
  redTeams: number;
  blueTeams: number;
  purpleTeams: number;
  activeUnits: number;
  totalMembers: number;
  scheduledExercises: number;
}

interface BaselineOverview {
  ok: boolean;
  totalCitizensBaselined: number;
  totalAnomalies: number;
  criticalAnomalies: number;
  warningAnomalies: number;
  recentAnomalies: Array<{
    id: string;
    citizenId: string;
    type: string;
    severity: string;
    description: string;
    timestamp: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function threatLevelBadge(level: string) {
  const variant =
    level === "critical" ? "danger" :
    level === "high" ? "warning" :
    level === "medium" ? "info" : "success";
  return <Badge variant={variant}>{level.toUpperCase()}</Badge>;
}

function formatTime(ts: number) {
  if (!ts) { return "—"; }
  return new Date(ts).toLocaleTimeString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SecurityOps() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: posture, loading: l1, error: e1, refetch: r1 } =
    useRpc<ThreatPosture>("republic.defense.posture", {});
  const { data: basData, loading: l2, error: e2, refetch: r2 } =
    useRpc<BASOverview>("republic.defense.bas.overview", {});
  const { data: fleetData, loading: l3, error: e3, refetch: r3 } =
    useRpc<FleetOverview>("republic.defense.fleet.overview", {});
  const { data: ciData, loading: l4, error: e4, refetch: r4 } =
    useRpc<CIOverview>("republic.defense.ci.overview", {});
  const { data: corpsData, loading: l5, error: e5, refetch: r5 } =
    useRpc<CorpsOverview>("republic.defense.corps.overview", {});
  const { data: baselineData, loading: l6, error: e6, refetch: r6 } =
    useRpc<BaselineOverview>("republic.defense.baseline.overview", {});

  const bas = basData ?? undefined;
  const fleet = fleetData ?? undefined;
  const ci = ciData ?? undefined;
  const corps = corpsData ?? undefined;
  const baseline = baselineData ?? undefined;

  const loading = l1 || l2 || l3 || l4 || l5 || l6;
  const error = e1 || e2 || e3 || e4 || e5 || e6;
  const refetch = () => { r1(); r2(); r3(); r4(); r5(); r6(); };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "threats", label: "Threats" },
    { id: "bas", label: "Attack Sim" },
    { id: "fleet", label: "Device Fleet" },
    { id: "ci", label: "Counter-Intel" },
    { id: "corps", label: "Red Team Corps" },
    { id: "anomalies", label: "Anomalies" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Security Operations Center"
        description="Republic-wide defensive posture, threat intelligence fusion, breach simulation, and counter-intelligence operations"
        icon={<ShieldCheck className="w-6 h-6" />}
        actions={
          <Button variant="primary" size="sm" onClick={() => {
            mutateRpc("republic.defense.threats.ingest", { vulns: [] });
            refetch();
          }}>
            <Radar className="w-4 h-4 mr-1" /> Run Intelligence Sweep
          </Button>
        }
      />

      <RpcStatus loading={loading} error={error} onRetry={refetch} />

      {!loading && !error && (
        <>
          {/* ── Threat Level Banner ── */}
          <div className={`rounded-xl p-4 flex items-center justify-between ${
            posture?.threatLevel === "critical" ? "bg-danger/20 border border-danger/40" :
            posture?.threatLevel === "high" ? "bg-warning/20 border border-warning/40" :
            "bg-success/20 border border-success/40"
          }`}>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-text-primary" />
              <div>
                <div className="text-sm text-text-muted">REPUBLIC THREAT LEVEL</div>
                <div className="text-xl font-bold text-text-heading">
                  {posture?.threatLevel?.toUpperCase() ?? "UNKNOWN"}
                </div>
              </div>
            </div>
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <div className="font-bold text-text-primary">{posture?.totalThreats ?? 0}</div>
                <div className="text-text-muted">Active Threats</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-danger">{posture?.exploitedInWild ?? 0}</div>
                <div className="text-text-muted">Exploited</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-warning">{posture?.citizensAtRisk ?? 0}</div>
                <div className="text-text-muted">Citizens at Risk</div>
              </div>
            </div>
          </div>

          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Active CVEs"
                  value={posture?.totalThreats ?? 0}
                  icon={<Bug className="w-5 h-5" />}
                />
                <StatCard
                  label="Critical"
                  value={posture?.criticalCount ?? 0}
                  icon={<AlertTriangle className="w-5 h-5" />}
                  sub={posture?.criticalCount ? "IMMEDIATE ACTION" : "None"}
                />
                <StatCard
                  label="Device Fleet"
                  value={fleet?.totalDevices ?? 0}
                  icon={<Smartphone className="w-5 h-5" />}
                  sub={`Avg posture: ${Math.round(fleet?.avgPosture ?? 100)}%`}
                />
                <StatCard
                  label="CI Operations"
                  value={ci?.activeOperations ?? 0}
                  icon={<Eye className="w-5 h-5" />}
                  sub={`${ci?.activeCanaries ?? 0} active canaries`}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="BAS Scenarios"
                  value={bas?.totalScenarios ?? 0}
                  icon={<Crosshair className="w-5 h-5" />}
                  sub={`Detection: ${Math.round((bas?.avgDetectionRate ?? 0) * 100)}%`}
                />
                <StatCard
                  label="Red Team Units"
                  value={corps?.totalUnits ?? 0}
                  icon={<Swords className="w-5 h-5" />}
                  sub={`${corps?.activeUnits ?? 0} active`}
                />
                <StatCard
                  label="Anomalies"
                  value={baseline?.totalAnomalies ?? 0}
                  icon={<Activity className="w-5 h-5" />}
                  sub={`${baseline?.criticalAnomalies ?? 0} critical`}
                />
                <StatCard
                  label="Exercises Run"
                  value={bas?.exercisesRun ?? 0}
                  icon={<Target className="w-5 h-5" />}
                  sub={bas?.lastExerciseScore != null ? `Last score: ${bas.lastExerciseScore}%` : "None yet"}
                />
              </div>

              {/* Platform Breakdown */}
              {posture?.platformBreakdown && Object.keys(posture.platformBreakdown).length > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-text-heading mb-3">Threat Distribution by Platform</h3>
                  <div className="space-y-2">
                     {Object.entries(posture.platformBreakdown)
                       .toSorted((a, b) => b[1] - a[1])
                       .map(([platform, count]) => (
                        <ProgressBar
                          key={platform}
                          value={count}
                          max={posture.totalThreats}
                          labelLeft={platform}
                          labelRight={String(count)}
                        />
                      ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ── THREATS TAB ── */}
          {activeTab === "threats" && (
            <ThreatPanel refetch={r1} />
          )}

          {/* ── BAS TAB ── */}
          {activeTab === "bas" && (
            <BASPanel overview={bas} refetch={r2} />
          )}

          {/* ── FLEET TAB ── */}
          {activeTab === "fleet" && (
            <FleetPanel overview={fleet} />
          )}

          {/* ── CI TAB ── */}
          {activeTab === "ci" && (
            <CIPanel overview={ci} />
          )}

          {/* ── CORPS TAB ── */}
          {activeTab === "corps" && (
            <CorpsPanel overview={corps} />
          )}

          {/* ── ANOMALIES TAB ── */}
          {activeTab === "anomalies" && (
            <AnomalyPanel overview={baseline} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-panels ──────────────────────────────────────────────────────────────

function ThreatPanel({ refetch }: { refetch: () => void }) {
  const { data } = useRpc<{ ok: boolean; threats: Array<{
    cveId: string; platform: string; severity: string;
    compositeScore: number; description: string; isExploitedInWild: boolean;
  }> }>("republic.defense.threats.list", { limit: 30 });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-text-heading">Active Threats</h3>
        <Button variant="outline" size="sm" onClick={async () => {
          await rpc("republic.defense.threats.ingest", { vulns: [] });
          refetch();
        }}>
          <Radar className="w-4 h-4 mr-1" /> Scan Now
        </Button>
      </div>
      {!data?.threats?.length ? (
        <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No active threats" description="Republic defenses are clear" />
      ) : (
        <div className="space-y-2">
          {data.threats.map(t => (
            <Card key={t.cveId} hover>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-mono font-bold text-accent">{t.cveId}</div>
                  {threatLevelBadge(t.severity)}
                  {t.isExploitedInWild && <Badge variant="danger">IN THE WILD</Badge>}
                </div>
                <div className="text-sm text-text-muted">{t.platform}</div>
              </div>
              <div className="mt-1 text-xs text-text-secondary line-clamp-2">{t.description}</div>
              <ProgressBar value={t.compositeScore} max={100} labelLeft="Score" labelRight={`${t.compositeScore}/100`} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BASPanel({ overview, refetch }: { overview: BASOverview | undefined; refetch: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending" value={overview?.pending ?? 0} icon={<Crosshair className="w-5 h-5" />} />
        <StatCard label="Completed" value={overview?.completed ?? 0} icon={<Target className="w-5 h-5" />} />
        <StatCard label="Patched" value={overview?.patched ?? 0} icon={<ShieldCheck className="w-5 h-5" />} />
        <StatCard label="Validated" value={overview?.validated ?? 0} icon={<ShieldCheck className="w-5 h-5" />} />
      </div>
      <Card>
        <h3 className="text-sm font-semibold text-text-heading mb-2">Defense Effectiveness</h3>
        <ProgressBar
          value={Math.round((overview?.avgDetectionRate ?? 0) * 100)}
          max={100}
          labelLeft="Detection Rate"
          labelRight={`${Math.round((overview?.avgDetectionRate ?? 0) * 100)}%`}
        />
        <div className="mt-2" />
        <ProgressBar
          value={Math.round((overview?.avgBlockRate ?? 0) * 100)}
          max={100}
          labelLeft="Block Rate"
          labelRight={`${Math.round((overview?.avgBlockRate ?? 0) * 100)}%`}
        />
      </Card>
      <Button variant="primary" size="sm" onClick={async () => {
        await rpc("republic.defense.bas.exercise", {
          name: `Exercise-${Date.now()}`,
          scenarioIds: [],
          redTeamUnit: ["VIPER", "GHOST"],
        });
        refetch();
      }}>
        <Swords className="w-4 h-4 mr-1" /> Run Exercise
      </Button>
    </div>
  );
}

function FleetPanel({ overview }: { overview: FleetOverview | undefined }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Devices" value={overview?.totalDevices ?? 0} icon={<Smartphone className="w-5 h-5" />} />
        <StatCard label="Vulnerabilities" value={overview?.totalVulnerabilities ?? 0} icon={<Bug className="w-5 h-5" />} />
        <StatCard label="Critical" value={overview?.totalCritical ?? 0} icon={<AlertTriangle className="w-5 h-5" />} />
        <StatCard label="Avg Posture" value={`${Math.round(overview?.avgPosture ?? 100)}%`} icon={<ShieldCheck className="w-5 h-5" />} />
      </div>
      {overview?.byRisk && Object.keys(overview.byRisk).length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-text-heading mb-3">Device Risk Distribution</h3>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(overview.byRisk).map(([risk, count]) => (
              <div key={risk} className="flex items-center gap-2">
                {threatLevelBadge(risk)}
                <span className="text-sm text-text-secondary">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {overview?.remediationStats && (
        <Card>
          <h3 className="text-sm font-semibold text-text-heading mb-3">Remediation Pipeline</h3>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div><div className="font-bold text-warning">{overview.remediationStats.pending}</div><div className="text-text-muted">Pending</div></div>
            <div><div className="font-bold text-info">{overview.remediationStats.applied}</div><div className="text-text-muted">Applied</div></div>
            <div><div className="font-bold text-success">{overview.remediationStats.verified}</div><div className="text-text-muted">Verified</div></div>
            <div><div className="font-bold text-danger">{overview.remediationStats.failed}</div><div className="text-text-muted">Failed</div></div>
          </div>
        </Card>
      )}
    </div>
  );
}

function CIPanel({ overview }: { overview: CIOverview | undefined }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Canaries" value={overview?.activeCanaries ?? 0} icon={<Eye className="w-5 h-5" />} />
        <StatCard label="Triggered" value={overview?.triggeredCanaries ?? 0} icon={<AlertTriangle className="w-5 h-5" />} />
        <StatCard label="Active Ops" value={overview?.activeOperations ?? 0} icon={<UserX className="w-5 h-5" />} />
        <StatCard label="Avg Confidence" value={`${Math.round((overview?.avgConfidence ?? 0) * 100)}%`} icon={<Cpu className="w-5 h-5" />} />
      </div>
      {overview?.byPhase && Object.keys(overview.byPhase).length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-text-heading mb-3">Operations by Phase</h3>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(overview.byPhase).map(([phase, count]) => (
              <div key={phase} className="flex items-center gap-2">
                <Badge variant="info">{phase}</Badge>
                <span className="text-sm text-text-secondary">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Button variant="outline" size="sm" onClick={async () => {
        await rpc("republic.defense.ci.canary.deploy", {
          type: "data_fragment",
          description: `Canary-${Date.now()}`,
          payload: `CANARY-TOKEN-${Math.random().toString(36).slice(2, 8)}`,
        });
      }}>
        <Eye className="w-4 h-4 mr-1" /> Deploy New Canary
      </Button>
    </div>
  );
}

function CorpsPanel({ overview }: { overview: CorpsOverview | undefined }) {
  const { data: units } = useRpc<{ ok: boolean; units: Array<{
    id: string; name: string; formation: string; status: string; members: Array<{ codename: string; role: string }>;
  }> }>("republic.defense.corps.units", {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Red Teams" value={overview?.redTeams ?? 0} icon={<Swords className="w-5 h-5" />} />
        <StatCard label="Blue Teams" value={overview?.blueTeams ?? 0} icon={<ShieldCheck className="w-5 h-5" />} />
        <StatCard label="Total Members" value={overview?.totalMembers ?? 0} icon={<Cpu className="w-5 h-5" />} />
        <StatCard label="Active" value={overview?.activeUnits ?? 0} icon={<Activity className="w-5 h-5" />} />
      </div>
      {units?.units?.map(u => (
        <Card key={u.id} hover>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-heading">{u.name}</span>
              <Badge variant={u.formation === "red" ? "danger" : u.formation === "blue" ? "info" : "purple"}>{u.formation.toUpperCase()}</Badge>
              <Badge variant={u.status === "active" ? "success" : "neutral"}>{u.status}</Badge>
            </div>
            <Button variant="ghost" size="sm" aria-label={`Activate ${u.name}`} onClick={async () => {
              await rpc("republic.defense.corps.unit.activate", { unitId: u.id });
            }}>
              Activate
            </Button>
          </div>
          <div className="mt-2 flex gap-2 flex-wrap">
            {u.members.map(m => (
              <Badge key={m.codename} variant="neutral">{m.codename} ({m.role})</Badge>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function AnomalyPanel({ overview }: { overview: BaselineOverview | undefined }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Citizens Baselined" value={overview?.totalCitizensBaselined ?? 0} icon={<Cpu className="w-5 h-5" />} />
        <StatCard label="Total Anomalies" value={overview?.totalAnomalies ?? 0} icon={<Activity className="w-5 h-5" />} />
        <StatCard label="Critical" value={overview?.criticalAnomalies ?? 0} icon={<AlertTriangle className="w-5 h-5" />} />
        <StatCard label="Warnings" value={overview?.warningAnomalies ?? 0} icon={<AlertTriangle className="w-5 h-5" />} />
      </div>
      {!overview?.recentAnomalies?.length ? (
        <EmptyState icon={<Activity className="w-8 h-8" />} title="No anomalies detected" description="All citizen behavior within baseline parameters" />
      ) : (
        <div className="space-y-2">
          {overview.recentAnomalies.map(a => (
            <Card key={a.id} hover>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={a.severity === "critical" ? "danger" : "warning"}>{a.severity}</Badge>
                  <span className="text-sm font-mono text-accent">{a.citizenId}</span>
                  <Badge variant="neutral">{a.type}</Badge>
                </div>
                <span className="text-xs text-text-muted">{formatTime(a.timestamp)}</span>
              </div>
              <div className="mt-1 text-xs text-text-secondary">{a.description}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
