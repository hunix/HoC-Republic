import { useState } from "react";
import {
  Anvil,
  Brain,
  Zap,
  Eye,
  Sparkles,
  Activity,
  RefreshCcw,
  Trash2,
  BookOpen,
  Lightbulb,
  BarChart3,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { useRpc, rpc } from "@/lib/rpc";
import {
  Button,
  Card,
  Badge,
  StatCard,
  PageHeader,
  Tabs,
  RpcStatus,
  EmptyState,
} from "@/components/ui";

/* ─── Types ────────────────────────────────────────────────── */

interface FoundryStatus {
  enabled: boolean;
  workflowsRecorded: number;
  patternsIdentified: number;
  patternsCrystallized: number;
  skillsGenerated: number;
  learningsCount: number;
  brainEntries: number;
  overseerLastRun: string | null;
  overseerRunCount: number;
  overseerLastReport: {
    tick: number;
    skillsGenerated: number;
    patternsPruned: number;
    durationMs: number;
  } | null;
}

interface WorkflowRecord {
  id: string;
  citizenName: string;
  goal: string;
  toolSequence: string[];
  outcome: "success" | "failure" | "partial";
  durationTicks: number;
  timestamp: string;
}

interface WorkflowPattern {
  id: string;
  keywords: string[];
  toolSequence: string[];
  usageCount: number;
  successRate: number;
  avgDuration: number;
  firstSeen: string;
  lastUsed: string;
  crystallized: boolean;
  generatedSkillId?: string;
  evolutionScore: number;
}

interface FoundryLearning {
  id: string;
  insight: string;
  source: string;
  confidence: number;
  reinforcements: number;
  timestamp: string;
}

interface OverseerReport {
  id: string;
  tick: number;
  duration: number;
  candidatesFound: number;
  skillsGenerated: number;
  patternsPruned: number;
  actions: Array<{
    action: string;
    description: string;
    timestamp: string;
  }>;
  timestamp: string;
}

/* ─── Page Component ───────────────────────────────────────── */

export function FoundryPage() {
  const [tab, setTab] = useState("overview");
  const {
    data: status,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useRpc<FoundryStatus>("republic.foundry.status", {});
  const { data: workflowData, refetch: refetchWorkflows } = useRpc<{
    workflows: WorkflowRecord[];
  }>("republic.foundry.workflows", { limit: 50 });
  const { data: patternData, refetch: refetchPatterns } = useRpc<{
    patterns: WorkflowPattern[];
    crystallizationCandidates: number;
  }>("republic.foundry.patterns", {});
  const { data: learningData } = useRpc<{
    learnings: FoundryLearning[];
  }>("republic.foundry.learnings", { limit: 50 });
  const { data: overseerData } = useRpc<{
    reports: OverseerReport[];
  }>("republic.foundry.overseer", { limit: 10 });

  if (statusLoading || statusError) {
    return (
      <RpcStatus
        loading={statusLoading}
        error={statusError}
        onRetry={refetchStatus}
      />
    );
  }

  const workflows = workflowData?.workflows ?? [];
  const patterns = patternData?.patterns ?? [];
  const candidates = patternData?.crystallizationCandidates ?? 0;
  const learnings = learningData?.learnings ?? [];
  const reports = overseerData?.reports ?? [];

  async function handleCrystallize(patternId: string) {
    await rpc("republic.foundry.crystallize", { patternId });
    refetchPatterns();
    refetchStatus();
  }

  async function handlePrune() {
    await rpc("republic.foundry.prune", {});
    refetchPatterns();
    refetchStatus();
  }

  const tabs = [
    { id: "overview", label: "Overview", icon: <BarChart3 size={14} /> },
    { id: "workflows", label: "Workflows", icon: <Activity size={14} /> },
    { id: "patterns", label: "Patterns", icon: <Sparkles size={14} /> },
    { id: "learnings", label: "Learnings", icon: <Lightbulb size={14} /> },
    { id: "overseer", label: "Overseer", icon: <Eye size={14} /> },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Foundry"
        description="Self-evolving meta-engine — observes workflows, learns patterns, and autonomously generates new skills"
        icon={<Anvil size={28} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchStatus();
                refetchWorkflows();
                refetchPatterns();
              }}
            >
              <RefreshCcw size={14} className="mr-1" /> Refresh
            </Button>
            <Button variant="warning" size="sm" onClick={handlePrune}>
              <Trash2 size={14} className="mr-1" /> Prune Stale
            </Button>
          </div>
        }
      />

      {/* ── Stats Grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Workflows Recorded"
          value={status?.workflowsRecorded ?? 0}
          icon={<Activity size={18} />}
        />
        <StatCard
          label="Patterns Found"
          value={status?.patternsIdentified ?? 0}
          icon={<Brain size={18} />}
          sub={`${candidates} ready to crystallize`}
        />
        <StatCard
          label="Skills Generated"
          value={status?.skillsGenerated ?? 0}
          icon={<Sparkles size={18} />}
          sub={`${status?.patternsCrystallized ?? 0} patterns crystallized`}
        />
        <StatCard
          label="Overseer Runs"
          value={status?.overseerRunCount ?? 0}
          icon={<Eye size={18} />}
          sub={
            status?.overseerLastRun
              ? `Last: ${new Date(status.overseerLastRun).toLocaleTimeString()}`
              : "Never"
          }
        />
      </div>

      {/* ── Brain & Learning Stats ──────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Brain Entries"
          value={status?.brainEntries ?? 0}
          icon={<BookOpen size={18} />}
        />
        <StatCard
          label="Learnings"
          value={status?.learningsCount ?? 0}
          icon={<Lightbulb size={18} />}
        />
        <StatCard
          label="Engine Status"
          value={status?.enabled ? "Active" : "Disabled"}
          icon={<Zap size={18} />}
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && <OverviewTab lastReport={status?.overseerLastReport ?? null} />}
      {tab === "workflows" && <WorkflowsTab workflows={workflows} />}
      {tab === "patterns" && (
        <PatternsTab patterns={patterns} onCrystallize={handleCrystallize} />
      )}
      {tab === "learnings" && <LearningsTab learnings={learnings} />}
      {tab === "overseer" && <OverseerTab reports={reports} />}
    </div>
  );
}

/* ─── Sub-Components ───────────────────────────────────────── */

function OverviewTab({
  lastReport,
}: {
  lastReport: FoundryStatus["overseerLastReport"];
}) {
  return (
    <div className="space-y-4">
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
          <Anvil size={18} className="text-accent" /> How Foundry Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
          {[
            {
              phase: "1. Observe",
              desc: "Records every citizen goal → tools → outcome",
              icon: <Eye size={16} />,
            },
            {
              phase: "2. Research",
              desc: "Builds knowledge from docs, arXiv, GitHub",
              icon: <BookOpen size={16} />,
            },
            {
              phase: "3. Learn",
              desc: "Calculates success rates, identifies patterns",
              icon: <Brain size={16} />,
            },
            {
              phase: "4. Write",
              desc: "Generates skills from high-value patterns",
              icon: <Sparkles size={16} />,
            },
            {
              phase: "5. Deploy",
              desc: "Validates in sandbox, activates in skill library",
              icon: <Zap size={16} />,
            },
          ].map((p) => (
            <div
              key={p.phase}
              className="p-3 rounded-lg bg-bg-secondary border border-border/30 text-center"
            >
              <div className="text-accent mb-1 flex justify-center">{p.icon}</div>
              <div className="font-medium text-text-primary">{p.phase}</div>
              <div className="text-text-muted text-xs mt-1">{p.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {lastReport && (
        <Card glass>
          <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
            <Eye size={18} className="text-info" /> Last Overseer Report
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-text-muted">Tick:</span>{" "}
              <span className="text-text-primary font-mono">
                {lastReport.tick}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Skills Generated:</span>{" "}
              <Badge
                variant={lastReport.skillsGenerated > 0 ? "success" : "neutral"}
              >
                {lastReport.skillsGenerated}
              </Badge>
            </div>
            <div>
              <span className="text-text-muted">Patterns Pruned:</span>{" "}
              <Badge
                variant={lastReport.patternsPruned > 0 ? "warning" : "neutral"}
              >
                {lastReport.patternsPruned}
              </Badge>
            </div>
            <div>
              <span className="text-text-muted">Duration:</span>{" "}
              <span className="text-text-primary">
                {lastReport.durationMs}ms
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function WorkflowsTab({ workflows }: { workflows: WorkflowRecord[] }) {
  if (workflows.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={40} />}
        title="No Workflows Recorded Yet"
        description="Workflows will appear here as citizens execute tasks. Start the simulation to begin observing."
      />
    );
  }

  return (
    <Card glass>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 text-text-muted">
              <th className="text-left py-2 px-3">Citizen</th>
              <th className="text-left py-2 px-3">Goal</th>
              <th className="text-left py-2 px-3">Tools</th>
              <th className="text-left py-2 px-3">Outcome</th>
              <th className="text-left py-2 px-3">Duration</th>
              <th className="text-left py-2 px-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((w) => (
              <tr
                key={w.id}
                className="border-b border-border/10 hover:bg-bg-secondary/50"
              >
                <td className="py-2 px-3 text-text-primary font-medium">
                  {w.citizenName}
                </td>
                <td className="py-2 px-3 text-text-secondary max-w-[200px] truncate">
                  {w.goal}
                </td>
                <td className="py-2 px-3">
                  <div className="flex gap-1 flex-wrap">
                    {w.toolSequence.slice(0, 3).map((t, i) => (
                      <Badge key={i} variant="info">
                        {t}
                      </Badge>
                    ))}
                    {w.toolSequence.length > 3 && (
                      <Badge variant="neutral">
                        +{w.toolSequence.length - 3}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="py-2 px-3">
                  <Badge
                    variant={
                      w.outcome === "success"
                        ? "success"
                        : w.outcome === "failure"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {w.outcome === "success" && <CheckCircle2 size={12} className="mr-1" />}
                    {w.outcome === "failure" && <XCircle size={12} className="mr-1" />}
                    {w.outcome === "partial" && <AlertTriangle size={12} className="mr-1" />}
                    {w.outcome}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-text-muted font-mono">
                  {w.durationTicks}t
                </td>
                <td className="py-2 px-3 text-text-muted text-xs">
                  {new Date(w.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PatternsTab({
  patterns,
  onCrystallize,
}: {
  patterns: WorkflowPattern[];
  onCrystallize: (id: string) => void;
}) {
  if (patterns.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={40} />}
        title="No Patterns Detected Yet"
        description="Patterns emerge when citizens repeatedly use similar tool sequences. Keep the simulation running."
      />
    );
  }

  const sorted = [...patterns].toSorted((a, b) => b.evolutionScore - a.evolutionScore);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sorted.map((p) => (
        <Card key={p.id} glass hover>
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex gap-1 flex-wrap mb-1">
                {p.keywords.slice(0, 5).map((kw) => (
                  <Badge key={kw} variant="info">
                    {kw}
                  </Badge>
                ))}
              </div>
              <div className="text-text-muted text-xs">
                {p.toolSequence.join(" → ")}
              </div>
            </div>
            {p.crystallized ? (
              <Badge variant="success">
                <Sparkles size={12} className="mr-1" /> Crystallized
              </Badge>
            ) : p.usageCount >= 5 && p.successRate >= 0.7 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onCrystallize(p.id)}
              >
                <Sparkles size={12} className="mr-1" /> Crystallize
              </Button>
            ) : (
              <Badge variant="neutral">Observing</Badge>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs mt-3">
            <div>
              <span className="text-text-muted">Uses:</span>{" "}
              <span className="text-text-primary font-medium">
                {p.usageCount}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Success:</span>{" "}
              <span
                className={
                  p.successRate >= 0.7
                    ? "text-success font-medium"
                    : "text-warning font-medium"
                }
              >
                {(p.successRate * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-text-muted">Avg:</span>{" "}
              <span className="text-text-primary">
                {p.avgDuration.toFixed(1)}t
              </span>
            </div>
            <div>
              <span className="text-text-muted">Score:</span>{" "}
              <span className="text-accent font-medium">
                {p.evolutionScore.toFixed(2)}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function LearningsTab({ learnings }: { learnings: FoundryLearning[] }) {
  if (learnings.length === 0) {
    return (
      <EmptyState
        icon={<Lightbulb size={40} />}
        title="No Learnings Yet"
        description="Foundry will record insights from workflow outcomes, pattern crystallization, and overseer runs."
      />
    );
  }

  return (
    <Card glass>
      <div className="space-y-3">
        {learnings.map((l) => (
          <div
            key={l.id}
            className="p-3 rounded-lg bg-bg-secondary border border-border/30"
          >
            <div className="flex items-start justify-between">
              <p className="text-text-primary text-sm">{l.insight}</p>
              <div className="flex gap-2 ml-3 shrink-0">
                <Badge variant={l.source === "experience" ? "info" : l.source === "pattern" ? "purple" : "neutral"}>
                  {l.source}
                </Badge>
                <Badge variant="neutral">
                  ×{l.reinforcements}
                </Badge>
              </div>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-text-muted">
              <span>
                Confidence: {(l.confidence * 100).toFixed(0)}%
              </span>
              <span>
                <Clock size={10} className="inline mr-1" />
                {new Date(l.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OverseerTab({ reports }: { reports: OverseerReport[] }) {
  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<Eye size={40} />}
        title="No Overseer Reports"
        description="The Overseer runs every 100 ticks to analyze patterns, generate skills, and prune stale data."
      />
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((r) => (
        <Card key={r.id} glass>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-text-heading font-semibold flex items-center gap-2">
              <Eye size={16} className="text-info" />
              Tick {r.tick}
            </h4>
            <div className="flex gap-2 text-xs">
              <Badge variant="info">{r.candidatesFound} candidates</Badge>
              <Badge variant="success">{r.skillsGenerated} skills</Badge>
              <Badge variant="warning">{r.patternsPruned} pruned</Badge>
              <Badge variant="neutral">{r.duration}ms</Badge>
            </div>
          </div>
          <div className="space-y-1">
            {(r.actions ?? []).map((a, i) => (
              <div
                key={i}
                className="text-sm text-text-secondary flex items-center gap-2"
              >
                <Badge
                  variant={
                    a.action === "crystallize"
                      ? "success"
                      : a.action === "prune"
                        ? "warning"
                        : "info"
                  }
                >
                  {a.action}
                </Badge>
                <span>{a.description}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-text-muted mt-2">
            {new Date(r.timestamp).toLocaleString()}
          </div>
        </Card>
      ))}
    </div>
  );
}
