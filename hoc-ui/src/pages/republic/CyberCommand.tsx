import {
  ShieldAlert,
  Terminal,
  Search,
  RefreshCw,
  MessageSquare,
  ExternalLink,
  AlertTriangle,
  FileText,
  Shield,
  Sword,
  Server,
  Eye,
  Crosshair,
  Play,
  Trash2,
  Zap,
  Radio,
  Monitor,
} from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  Alert,
  RpcStatus,
  Tabs,
  EmptyState,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface CyberSpec {
  id: string;
  name: string;
  team: "red" | "blue" | "purple" | "osint" | "governance" | "ai-security";
  emoji: string;
  tools: Array<{ name: string; purpose: string; githubUrl?: string }>;
  methodologies: string[];
  certifications: string[];
}

interface SecurityAssessment {
  id: string;
  specialistId: string;
  subject: string;
  type: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  fullReport: string;
  provider: string;
  timestamp: string;
}

interface SecurityLab {
  id: string;
  preset: string;
  containerId?: string;
  containerName?: string;
  status: string;
  purpose: string;
  tools: string[];
  createdAt: string;
}

interface LabPreset {
  name: string;
  description: string;
  tools: string[];
  image: string;
}

interface ThreatAlert {
  id: string;
  type: string;
  severity: string;
  source: string;
  target: string;
  description: string;
  indicators: string[];
  mitreTactics: string[];
  detectedAt: string;
  status: string;
  responseActions: string[];
}

interface CounterPlan {
  id: string;
  threatId: string;
  name: string;
  objective: string;
  status: string;
  createdAt: string;
  result?: string;
  specialistId: string;
}

interface HoneypotConfig {
  id: string;
  type: string;
  port: number;
  description: string;
  active: boolean;
  detections: number;
  lastActivity?: string;
}

interface DefenseStatus {
  posture: string;
  activeThreats: number;
  totalThreats: number;
  resolvedThreats: number;
  counterPlans: number;
  activePlans: number;
  activeLabs: number;
  activeHoneypots: number;
  totalDetections: number;
  securityContainers: number;
  availableLabPresets: string[];
}

const TEAM_COLORS: Record<string, string> = {
  red: "bg-red-500/10 text-red-400 border-red-500/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  osint: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  governance: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  "ai-security": "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

const TEAM_LABELS: Record<string, string> = {
  red: "🔴 Red Team",
  blue: "🔵 Blue Team",
  purple: "🟣 Purple Team",
  osint: "🔍 OSINT",
  governance: "📋 Governance",
  "ai-security": "🤖 AI Security",
};

const RISK_COLORS = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "danger",
} as const;

const POSTURE_COLORS: Record<string, string> = {
  green: "text-green-400 bg-green-500/10",
  yellow: "text-yellow-400 bg-yellow-500/10",
  orange: "text-orange-400 bg-orange-500/10",
  red: "text-red-400 bg-red-500/10",
  black: "text-white bg-gray-800",
};

const SEVERITY_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  informational: "neutral",
  low: "info",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

const ASSESSMENT_TYPES = [
  { value: "pentest", label: "Penetration Test" },
  { value: "code-review", label: "Code Review" },
  { value: "osint", label: "OSINT Research" },
  { value: "forensics", label: "Digital Forensics" },
  { value: "threat-model", label: "Threat Modeling" },
  { value: "vuln-scan", label: "Vulnerability Scan" },
  { value: "counter-strike", label: "Counter-Strike Assessment" },
  { value: "counter-intel", label: "Counter-Intelligence Assessment" },
  { value: "active-defense", label: "Active Defense Assessment" },
  { value: "deception-ops", label: "Deception Operations Assessment" },
];

import { PentAGIPanel } from "./cyber-command/PentAGIPanel";
// PhishingSimPanel (273 lines), TargetScanPanel (384 lines), PentAGIPanel (207 lines) extracted

export function CyberCommandPage() {
  const [activeTab, setActiveTab] = useState("command");
  const [selectedSpec, setSelectedSpec] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [assessType, setAssessType] = useState("pentest");
  const [details, setDetails] = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState<SecurityAssessment | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{
    answer: string;
    provider: string;
    specialistName: string;
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  // Lab state
  const [labPurpose, setLabPurpose] = useState("");
  const [launchingLab, setLaunchingLab] = useState("");
  const [labCmd, setLabCmd] = useState("");
  const [labOutput, setLabOutput] = useState("");
  const [execLabId, setExecLabId] = useState("");

  // Counter-strike state
  const [planningThreatId, setPlanningThreatId] = useState("");
  const [planningInProgress, setPlanningInProgress] = useState(false);

  // Honeypot state
  const [hpType, setHpType] = useState("ssh");
  const [hpPort, setHpPort] = useState(2222);
  const [hpDesc, setHpDesc] = useState("");

  const {
    data: specData,
    loading,
    error: rpcErr,
    refetch,
  } = useRpc<{ specialists: CyberSpec[] }>("republic.cyber.specialists.list", {}, []);

  const { data: statsData } = useRpc<{
    totalSpecializations: number;
    teams: Record<string, number>;
    totalAssessments: number;
    totalToolsCatalog: number;
  }>("republic.cyber.stats", {}, []);

  const { data: historyData } = useRpc<{ assessments: SecurityAssessment[] }>(
    "republic.cyber.history",
    { limit: 10 },
    [],
    { staleTimeMs: 10000 },
  );

  const { data: defenseData, refetch: refetchDefense } = useRpc<DefenseStatus>(
    "republic.cyber.defense.status",
    {},
    [],
    { refetchIntervalMs: 15000 },
  );

  const { data: labsData, refetch: refetchLabs } = useRpc<{
    presets: LabPreset[];
    active: SecurityLab[];
  }>("republic.cyber.defense.labs", {}, []);

  const { data: threatsData, refetch: refetchThreats } = useRpc<{ threats: ThreatAlert[] }>(
    "republic.cyber.defense.threats",
    { limit: 30 },
    [],
    { refetchIntervalMs: 10000 },
  );

  const { data: plansData, refetch: refetchPlans } = useRpc<{ plans: CounterPlan[] }>(
    "republic.cyber.defense.counter-plans",
    { limit: 20 },
    [],
  );

  const { data: honeypotData, refetch: refetchHoneypots } = useRpc<{ honeypots: HoneypotConfig[] }>(
    "republic.cyber.defense.honeypot.list",
    {},
    [],
  );

  const specs = specData?.specialists ?? [];
  const teams = ["all", "red", "blue", "purple", "osint", "governance", "ai-security"];
  const filtered = specs.filter((s) => {
    const matchTeam = teamFilter === "all" || s.team === teamFilter;
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchTeam && matchSearch;
  });
  const selected = specs.find((s) => s.id === selectedSpec);

  const runAssessment = async () => {
    if (!selectedSpec || !subject.trim() || !details.trim()) {
      return;
    }
    setAssessing(true);
    setError("");
    setAssessment(null);
    try {
      const result = await rpc<SecurityAssessment>("republic.cyber.assess", {
        specialistId: selectedSpec,
        subject: subject.trim(),
        type: assessType,
        details: details.trim(),
      });
      setAssessment(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssessing(false);
    }
  };

  const askExpert = async () => {
    if (!selectedSpec || !question.trim()) {
      return;
    }
    setAsking(true);
    setAnswer(null);
    try {
      const result = await rpc<{ answer: string; provider: string; specialistName: string }>(
        "republic.cyber.ask",
        { specialistId: selectedSpec, question: question.trim() },
      );
      setAnswer(result);
    } finally {
      setAsking(false);
    }
  };

  const launchLab = async (preset: string) => {
    if (!labPurpose.trim()) {
      return;
    }
    setLaunchingLab(preset);
    try {
      await rpc("republic.cyber.defense.lab.launch", { preset, purpose: labPurpose.trim() });
      refetchLabs();
      refetchDefense();
      setLabPurpose("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunchingLab("");
    }
  };

  const destroyLab = async (labId: string) => {
    try {
      await rpc("republic.cyber.defense.lab.destroy", { labId });
      refetchLabs();
      refetchDefense();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const execLabCommand = async () => {
    if (!execLabId || !labCmd.trim()) {
      return;
    }
    try {
      const result = await rpc<{ output: string }>("republic.cyber.defense.lab.exec", {
        labId: execLabId,
        command: labCmd.trim(),
      });
      setLabOutput(result.output);
    } catch (e) {
      setLabOutput(e instanceof Error ? e.message : String(e));
    }
  };

  const generatePlan = async (threatId: string) => {
    setPlanningInProgress(true);
    setPlanningThreatId(threatId);
    try {
      await rpc("republic.cyber.defense.counter-plan", { threatId });
      refetchPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanningInProgress(false);
      setPlanningThreatId("");
    }
  };

  const deployHoneypot = async () => {
    if (!hpDesc.trim()) {
      return;
    }
    try {
      await rpc("republic.cyber.defense.honeypot.deploy", {
        type: hpType,
        port: hpPort,
        description: hpDesc.trim(),
      });
      refetchHoneypots();
      setHpDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const tabs = [
    { id: "command", label: "Command Center" },
    { id: "assess", label: "Assessment" },
    { id: "labs", label: "Defense Labs" },
    { id: "counter", label: "Counter-Strike" },
    { id: "ask", label: "Ask Expert" },
    { id: "history", label: "History" },
    { id: "arsenal", label: "Arsenal" },
    { id: "pentagi", label: "⚡ PentAGI" },
    { id: "phishing", label: "🎣 Phishing Sim" },
    { id: "target-scan", label: "🎯 Target Scan" },
  ];

  const posture = defenseData?.posture ?? "green";

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Cyber Command"
        description="20 AI cybersecurity specialists — red team, blue team, counter-intelligence, counter-strike, OSINT, and active defense"
        icon={<ShieldAlert className="w-6 h-6 text-red-400" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Specialists"
          value={statsData?.totalSpecializations ?? 20}
          icon={<Shield className="w-5 h-5" />}
          sub="Cyber roles"
        />
        <StatCard
          label="Defense Posture"
          value={posture.toUpperCase()}
          icon={<Monitor className="w-5 h-5" />}
          sub={
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${POSTURE_COLORS[posture] ?? ""}`}
            >
              {posture === "green" ? "SECURE" : posture === "yellow" ? "ELEVATED" : "ALERT"}
            </span>
          }
        />
        <StatCard
          label="Active Threats"
          value={defenseData?.activeThreats ?? 0}
          icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
          sub="Monitoring"
        />
        <StatCard
          label="Security Labs"
          value={defenseData?.activeLabs ?? 0}
          icon={<Server className="w-5 h-5 text-blue-400" />}
          sub="Running"
        />
        <StatCard
          label="Honeypots"
          value={defenseData?.activeHoneypots ?? 0}
          icon={<Eye className="w-5 h-5 text-amber-400" />}
          sub={`${defenseData?.totalDetections ?? 0} detections`}
        />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ─── Command Center: Specialist Cards ─────────────────────── */}
      {activeTab === "command" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <button
                key={t}
                onClick={() => setTeamFilter(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${teamFilter === t ? "bg-accent text-white" : "bg-bg-secondary text-text-muted hover:bg-bg-card"}`}
              >
                {t === "all" ? "All" : TEAM_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="w-full bg-bg-input border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              placeholder="Search specialists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <RpcStatus loading={loading} error={rpcErr} onRetry={refetch} />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <Card
                key={s.id}
                hover
                onClick={() => {
                  setSelectedSpec(s.id);
                  setActiveTab("assess");
                }}
                className={`cursor-pointer border-2 transition-colors ${selectedSpec === s.id ? "border-accent" : "border-transparent hover:border-border-hover"}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-heading font-semibold text-sm">{s.name}</p>
                    <span
                      className={`mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${TEAM_COLORS[s.team]}`}
                    >
                      {TEAM_LABELS[s.team]}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.certifications.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="text-[10px] bg-bg-secondary text-text-muted px-1.5 py-0.5 rounded"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  {s.tools.length} tools in arsenal
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Security Assessment ──────────────────────────────────── */}
      {activeTab === "assess" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {!selectedSpec && (
              <Alert variant="warning">Select a specialist from Command Center first.</Alert>
            )}
            {selected && (
              <Card className="flex items-center gap-3 py-3">
                <span className="text-2xl">{selected.emoji}</span>
                <div>
                  <p className="font-semibold text-text-heading">{selected.name}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${TEAM_COLORS[selected.team]}`}
                  >
                    {TEAM_LABELS[selected.team]}
                  </span>
                </div>
              </Card>
            )}

            <Card>
              <h3 className="font-semibold text-text-heading text-sm mb-3">
                Assessment Parameters
              </h3>
              <select
                value={assessType}
                onChange={(e) => setAssessType(e.target.value)}
                className="w-full mb-3 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                {ASSESSMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full mb-3 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                placeholder="Subject: e.g. example.com web app, 192.168.1.0/24 network, React app codebase..."
              />
              <textarea
                rows={5}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full mb-3 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
                placeholder="Provide context: tech stack, known vulnerabilities, scope boundaries, business context, threat actors to emulate..."
              />
              <Alert variant="warning">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                Only use on systems you own or have written authorization to test.
              </Alert>
              <Button
                className="w-full mt-3"
                variant="primary"
                onClick={() => void runAssessment()}
                disabled={!selectedSpec || !subject.trim() || !details.trim() || assessing}
              >
                {assessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Conducting Assessment...
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4" /> Run Security Assessment
                  </>
                )}
              </Button>
              {error && (
                <Alert variant="danger" className="mt-3">
                  {error}
                </Alert>
              )}
            </Card>
          </div>

          <div>
            {!assessment && !assessing && (
              <Card className="h-full flex flex-col items-center justify-center py-16 text-text-muted">
                <ShieldAlert className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-medium">Configure and run a security assessment</p>
                <p className="text-xs mt-2 text-center max-w-xs">
                  Select a specialist, define scope, and get a structured security report with
                  findings, CVSS scoring, and mitigations
                </p>
              </Card>
            )}
            {assessing && (
              <Card className="h-full flex flex-col items-center justify-center py-16">
                <RefreshCw className="w-10 h-10 animate-spin text-accent mb-4" />
                <p className="text-text-heading font-medium">Specialist assessing...</p>
                <p className="text-text-muted text-sm mt-1">
                  Security analysis may take 15-30 seconds
                </p>
              </Card>
            )}
            {assessment && (
              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xl">{selected?.emoji}</span>
                  <div>
                    <p className="font-semibold text-text-heading">{assessment.subject}</p>
                    <p className="text-xs text-text-muted">
                      {assessment.type} · {assessment.provider}
                    </p>
                  </div>
                  <Badge variant={RISK_COLORS[assessment.overallRisk]} className="ml-auto">
                    {assessment.overallRisk.toUpperCase()} RISK
                  </Badge>
                </div>
                <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono bg-bg-secondary p-4 rounded-lg max-h-[500px] overflow-auto leading-relaxed">
                  {assessment.fullReport}
                </pre>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── Defense Labs ─────────────────────────────────────────── */}
      {activeTab === "labs" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Available Presets */}
            <div className="space-y-4">
              <h3 className="text-text-heading font-semibold flex items-center gap-2">
                <Server className="w-4 h-4" /> Available Security Labs
              </h3>
              <input
                value={labPurpose}
                onChange={(e) => setLabPurpose(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                placeholder="Purpose: e.g. Internal pentest, CTF training, forensics investigation..."
              />
              {(labsData?.presets ?? []).map((p) => (
                <Card key={p.name} className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-text-heading">{p.name}</p>
                      <p className="text-xs text-text-muted mt-1">{p.description}</p>
                      <p className="text-[10px] text-text-muted mt-1 font-mono">{p.image}</p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void launchLab(p.name)}
                      disabled={!labPurpose.trim() || !!launchingLab}
                    >
                      {launchingLab === p.name ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      {launchingLab === p.name ? " Launching..." : " Launch"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.tools.slice(0, 8).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] bg-bg-secondary text-text-muted px-1.5 py-0.5 rounded"
                      >
                        {t}
                      </span>
                    ))}
                    {p.tools.length > 8 && (
                      <span className="text-[10px] text-text-muted">
                        +{p.tools.length - 8} more
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Active Labs */}
            <div className="space-y-4">
              <h3 className="text-text-heading font-semibold flex items-center gap-2">
                <Terminal className="w-4 h-4" /> Active Labs
              </h3>
              {(labsData?.active ?? []).length === 0 && (
                <EmptyState
                  icon={<Server className="w-8 h-8" />}
                  title="No active labs"
                  description="Launch a security lab to get started"
                />
              )}
              {(labsData?.active ?? []).map((lab) => (
                <Card key={lab.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-text-heading text-sm">{lab.preset}</p>
                      <p className="text-xs text-text-muted">{lab.purpose}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={lab.status === "running" ? "success" : "warning"}>
                        {lab.status}
                      </Badge>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void destroyLab(lab.id)}
                        aria-label="Destroy lab"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {lab.containerId && (
                    <p className="text-[10px] font-mono text-text-muted mb-2">
                      Container: {lab.containerId.slice(0, 12)}
                    </p>
                  )}
                  {lab.status === "running" && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={execLabId === lab.id ? labCmd : ""}
                          onChange={(e) => {
                            setExecLabId(lab.id);
                            setLabCmd(e.target.value);
                          }}
                          onFocus={() => setExecLabId(lab.id)}
                          className="flex-1 bg-bg-input border border-border rounded px-2 py-1 text-xs font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                          placeholder="$ command..."
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void execLabCommand()}
                          disabled={execLabId !== lab.id || !labCmd.trim()}
                        >
                          <Zap className="w-3 h-3" /> Exec
                        </Button>
                      </div>
                      {execLabId === lab.id && labOutput && (
                        <pre className="text-[10px] font-mono bg-bg-secondary p-2 rounded max-h-32 overflow-auto text-text-secondary">
                          {labOutput}
                        </pre>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Counter-Strike ───────────────────────────────────────── */}
      {activeTab === "counter" && (
        <div className="space-y-6">
          {/* Threat List + Counter Plans */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Threats */}
            <div className="space-y-4">
              <h3 className="text-text-heading font-semibold flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-red-400" /> Active Threats
              </h3>
              {(threatsData?.threats ?? []).filter(
                (t) => t.status === "active" || t.status === "investigating",
              ).length === 0 && (
                <Card className="text-center py-8">
                  <Shield className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-50" />
                  <p className="text-text-muted text-sm">No active threats detected</p>
                  <p className="text-text-muted text-xs mt-1">Republic perimeter is secure</p>
                </Card>
              )}
              {(threatsData?.threats ?? []).map((threat) => (
                <Card
                  key={threat.id}
                  className={threat.status === "active" ? "border-l-2 border-l-red-500" : ""}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-text-heading text-sm">
                        {threat.type.toUpperCase()}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        {threat.description.slice(0, 100)}
                      </p>
                    </div>
                    <Badge variant={SEVERITY_BADGE[threat.severity] ?? "neutral"}>
                      {threat.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>Source: {threat.source}</span>
                    <span>→</span>
                    <span>Target: {threat.target}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="warning"
                      size="sm"
                      onClick={() => void generatePlan(threat.id)}
                      disabled={planningInProgress && planningThreatId === threat.id}
                    >
                      {planningInProgress && planningThreatId === threat.id ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" /> Planning...
                        </>
                      ) : (
                        <>
                          <Sword className="w-3 h-3" /> Counter-Plan
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void rpc("republic.cyber.defense.contain", { threatId: threat.id }).then(
                          () => refetchThreats(),
                        )
                      }
                    >
                      Contain
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void rpc("republic.cyber.defense.resolve", {
                          threatId: threat.id,
                          resolution: "Manually resolved",
                        }).then(() => refetchThreats())
                      }
                    >
                      Resolve
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Counter Plans */}
            <div className="space-y-4">
              <h3 className="text-text-heading font-semibold flex items-center gap-2">
                <Sword className="w-4 h-4 text-amber-400" /> Counter-Strike Plans
              </h3>
              {(plansData?.plans ?? []).length === 0 && (
                <EmptyState
                  icon={<Sword className="w-8 h-8" />}
                  title="No counter-strike plans"
                  description="Generate a plan from an active threat"
                />
              )}
              {(plansData?.plans ?? []).map((plan) => (
                <Card key={plan.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-text-heading text-sm">{plan.name}</p>
                      <p className="text-xs text-text-muted">{plan.objective.slice(0, 120)}</p>
                    </div>
                    <Badge
                      variant={
                        plan.status === "authorized"
                          ? "success"
                          : plan.status === "aborted"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {plan.status.toUpperCase()}
                    </Badge>
                  </div>
                  {plan.result && (
                    <details className="mt-2">
                      <summary className="text-xs text-accent cursor-pointer">
                        View full plan
                      </summary>
                      <pre className="text-[10px] font-mono bg-bg-secondary p-2 rounded mt-2 max-h-48 overflow-auto text-text-secondary whitespace-pre-wrap">
                        {plan.result}
                      </pre>
                    </details>
                  )}
                  <div className="flex gap-2 mt-3">
                    {plan.status === "planned" && (
                      <>
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() =>
                            void rpc("republic.cyber.defense.counter-authorize", {
                              planId: plan.id,
                            }).then(() => refetchPlans())
                          }
                        >
                          Authorize
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            void rpc("republic.cyber.defense.counter-abort", {
                              planId: plan.id,
                            }).then(() => refetchPlans())
                          }
                        >
                          Abort
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Honeypots Section */}
          <div className="space-y-4">
            <h3 className="text-text-heading font-semibold flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-400" /> Honeypot Deployment
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <h4 className="text-sm font-medium text-text-heading mb-3">Deploy Honeypot</h4>
                <select
                  value={hpType}
                  onChange={(e) => setHpType(e.target.value)}
                  className="w-full mb-2 bg-bg-input border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                >
                  {["ssh", "http", "smb", "dns", "ftp", "rdp", "custom"].map((t) => (
                    <option key={t} value={t}>
                      {t.toUpperCase()}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={hpPort}
                  onChange={(e) => setHpPort(parseInt(e.target.value, 10))}
                  className="w-full mb-2 bg-bg-input border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                  placeholder="Port"
                />
                <input
                  value={hpDesc}
                  onChange={(e) => setHpDesc(e.target.value)}
                  className="w-full mb-2 bg-bg-input border border-border rounded px-2 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                  placeholder="Description..."
                />
                <Button
                  variant="warning"
                  size="sm"
                  className="w-full"
                  onClick={() => void deployHoneypot()}
                  disabled={!hpDesc.trim()}
                >
                  <Radio className="w-3 h-3" /> Deploy
                </Button>
              </Card>
              {(honeypotData?.honeypots ?? []).map((hp) => (
                <Card key={hp.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-heading text-sm">
                        {hp.type.toUpperCase()} :{hp.port}
                      </p>
                      <p className="text-xs text-text-muted">{hp.description}</p>
                    </div>
                    <Badge variant={hp.active ? "success" : "neutral"}>
                      {hp.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
                    <span>{hp.detections} detections</span>
                    {hp.lastActivity && (
                      <span>Last: {new Date(hp.lastActivity).toLocaleTimeString()}</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}
        </div>
      )}

      {/* ─── Ask Expert ───────────────────────────────────────────── */}
      {activeTab === "ask" && (
        <div className="space-y-4 max-w-2xl">
          {!selectedSpec && (
            <Alert variant="warning">Select a specialist from Command Center first.</Alert>
          )}
          <Card>
            <textarea
              rows={5}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none mb-3"
              placeholder={
                "Ask a cybersecurity question...\n\nExamples:\n• How would you set up a counter-intelligence honeypot network?\n• Design a counter-strike plan for a DDoS attack\n• Write YARA rules to detect Cobalt Strike beacons\n• What is the MITRE D3FEND framework for active defense?"
              }
            />
            <Button
              variant="primary"
              onClick={() => void askExpert()}
              disabled={!selectedSpec || !question.trim() || asking}
            >
              {asking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Consulting Expert...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" /> Ask Expert
                </>
              )}
            </Button>
          </Card>
          {answer && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{selected?.emoji}</span>
                <span className="font-semibold text-text-heading">{answer.specialistName}</span>
                <Badge variant="neutral">{answer.provider}</Badge>
              </div>
              <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed">
                {answer.answer}
              </pre>
            </Card>
          )}
        </div>
      )}

      {/* ─── History ─────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {(historyData?.assessments ?? []).length === 0 && (
            <EmptyState
              icon={<FileText className="w-8 h-8" />}
              title="No assessments yet"
              description="Run a security assessment to see it here"
            />
          )}
          {(historyData?.assessments ?? []).map((a) => (
            <Card key={a.id}>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium text-text-heading">{a.subject}</p>
                  <p className="text-xs text-text-muted">
                    {a.specialistId} · {a.type} · {new Date(a.timestamp).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={RISK_COLORS[a.overallRisk]}>{a.overallRisk.toUpperCase()}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Arsenal ─────────────────────────────────────────────── */}
      {activeTab === "arsenal" && (
        <div className="space-y-4">
          <p className="text-text-muted text-sm">
            Complete tool catalog across all {specs.length} specialists.
          </p>
          {filtered.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{s.emoji}</span>
                <span className="font-semibold text-text-heading text-sm">{s.name}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TEAM_COLORS[s.team]}`}
                >
                  {TEAM_LABELS[s.team]}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {s.tools.map((t) => (
                  <div key={t.name} className="flex items-start gap-2 text-xs">
                    <Terminal className="w-3 h-3 shrink-0 text-accent mt-0.5" />
                    <div>
                      <span className="font-medium text-text-primary">{t.name}</span>
                      {t.githubUrl && (
                        <a
                          href={t.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 text-accent hover:underline inline-flex items-center gap-0.5"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      <p className="text-text-muted">{t.purpose}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ─── PentAGI ─────────────────────────────────────────── */}
      {activeTab === "pentagi" && <PentAGIPanel />}
    </div>
  );
}
