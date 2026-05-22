/**
 * HPICSPage — Personal Intelligence Control System
 *
 * 6 tabs:
 *  1. Health      — gateway + 15 router status
 *  2. Domains     — all 15 domain shorthand runners
 *  3. Pipelines   — cross-system HoC ↔ HPICS pipeline bridges
 *  4. Media AI    — voice analysis, deepfake detect, facial biometrics
 *  5. AGIS        — AGIS cascade / omniscient pipeline + digital twin
 *  6. Config      — HPICS connection status + env var guidance
 */

import { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  Brain, Activity, Search, Play, ChevronRight, Zap, Shield, Eye,
  Network, Layers, Target, Mic, FileText, Video, Cpu, Lock, Wrench,
  RefreshCw, Settings, Crosshair, GitBranch, ScanEye, UserCheck,
  Wand2, Globe, AlertTriangle,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, EmptyState,
  PageHeader, RpcStatus, StatCard, Tabs,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HpicsHealth {
  ok: boolean;
  configured: boolean;
  status?: string;
  message?: string;
  routers?: Record<string, { status: string; latency_ms?: number }>;
}

interface HpicsToolCatalog {
  ok: boolean;
  categories?: Record<string, { description: string; tools: string[] }>;
  totalTools?: number;
}

interface ConfigStatus {
  ok: boolean;
  configured: boolean;
  hasUrl: boolean;
  hasKey: boolean;
  gatewayHost: string | null;
}

interface RunResult {
  label: string;
  tool: string;
  ts: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface HpicsRole {
  id: string;
  codename: string;
  title: string;
  realWorldEquivalent: string;
  clearanceLevel: number;
  reportsTo: string | null;
  agisPhases: number[];
  hpicsDomains: string[];
  systemPrompt: string;
  tools: string[];
  skills: string[];
  discipline: string;
  taskPriority: number;
}

interface HpicsRoleListResult {
  ok: boolean;
  roles: HpicsRole[];
  total: number;
}

// ─── Domain routers config ──────────────────────────────────────────────────

const DOMAINS = [
  { id: "analysis", label: "Analysis", icon: Brain, color: "text-accent", rpc: "hpics.analysis.run", desc: "Behavioral & psychological analysis", count: "50+" },
  { id: "intelligence", label: "Intelligence", icon: Eye, color: "text-info", rpc: "hpics.intelligence.run", desc: "Dossier generation & orchestration", count: "55+" },
  { id: "prediction", label: "Prediction", icon: Target, color: "text-warning", rpc: "hpics.prediction.run", desc: "Scenario & trajectory forecasting", count: "27+" },
  { id: "warfare", label: "Warfare", icon: Zap, color: "text-danger", rpc: "hpics.warfare.run", desc: "Cognitive & narrative warfare", count: "30+" },
  { id: "biometric", label: "Biometric", icon: ScanEye, color: "text-success", rpc: "hpics.biometric.run", desc: "Face, voice, gait, deepfake", count: "31+" },
  { id: "network", label: "Network", icon: Network, color: "text-accent", rpc: "hpics.network.run", desc: "Social graph & topology", count: "20+" },
  { id: "enrichment", label: "Enrichment", icon: Search, color: "text-info", rpc: "hpics.enrichment.run", desc: "OSINT & digital footprint", count: "15+" },
  { id: "agis", label: "AGIS", icon: Layers, color: "text-warning", rpc: "hpics.agis.run", desc: "22-phase AGIS pipeline", count: "22+" },
  { id: "fusion", label: "Fusion", icon: GitBranch, color: "text-success", rpc: "hpics.fusion.run", desc: "Multi-source intel fusion", count: "15+" },
  { id: "voice", label: "Voice", icon: Mic, color: "text-accent", rpc: "hpics.voice.run", desc: "Transcription, deception, stress", count: "14+" },
  { id: "document", label: "Document", icon: FileText, color: "text-info", rpc: "hpics.document.run", desc: "Document intel & RAG", count: "14+" },
  { id: "media", label: "Media", icon: Video, color: "text-warning", rpc: "hpics.media.run", desc: "Media metadata & triangulation", count: "6+" },
  { id: "utility", label: "Utility", icon: Wrench, color: "text-success", rpc: "hpics.utility.run", desc: "Alerts, sync, reports, comms", count: "53+" },
  { id: "hardware", label: "Hardware", icon: Cpu, color: "text-accent", rpc: "hpics.hardware.run", desc: "Drone, SDR, TSCM, sensor", count: "15+" },
  { id: "security", label: "Security", icon: Shield, color: "text-danger", rpc: "hpics.security.run", desc: "Red team, OPSEC, crisis", count: "16+" },
];

// ─── Shared Components ───────────────────────────────────────────────────────

function JsonViewer({ data }: { data: unknown }) {
  return (
    <pre className="text-xs text-text-secondary bg-bg-secondary rounded p-3 overflow-auto max-h-52 mt-2 leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function RunCard({ result }: { result: RunResult }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={result.ok ? "success" : "danger"}>{result.ok ? "OK" : "Error"}</Badge>
          <span className="text-xs font-semibold text-text-heading">{result.label}</span>
          <span className="font-mono text-xs text-text-muted">{result.tool}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-text-muted">{new Date(result.ts).toLocaleTimeString()}</span>
          {(result.ok && result.data !== undefined) && (
            <Button variant="ghost" size="sm" onClick={() => { setOpen(v => !v); }}>
              {open ? "Hide" : "Show"}
            </Button>
          )}
        </div>
      </div>
      {result.error && <p className="text-xs text-danger mt-1">{result.error}</p>}
      {open && result.data !== undefined && <JsonViewer data={result.data} />}
    </Card>
  );
}

// ─── Tool Runner Modal ───────────────────────────────────────────────────────

function ToolRunner({
  rpcMethod,
  label,
  onClose,
  onResult,
  extraFields,
}: {
  rpcMethod: string;
  label: string;
  onClose: () => void;
  onResult: (r: RunResult) => void;
  extraFields?: { key: string; label: string; placeholder: string; type?: string }[];
}) {
  const [toolName, setToolName] = useState("");
  const [paramsJson, setParamsJson] = useState("{}");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const showToolField = !extraFields;

  async function handleRun() {
    setErr(null);
    let params: Record<string, unknown>;
    try { params = JSON.parse(paramsJson) as Record<string, unknown>; } catch { setErr("Invalid JSON"); return; }
    if (showToolField && !toolName.trim()) { setErr("Tool name is required"); return; }

    const payload = showToolField
      ? { tool: toolName.trim(), params }
      : { ...extra, ...params };

    setRunning(true);
    try {
      const result = (await rpc(rpcMethod, payload)) as { ok: boolean; data?: unknown; error?: string };
      onResult({ label, tool: showToolField ? toolName : rpcMethod, ts: Date.now(), ok: result.ok, data: result.data, error: result.error });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      onResult({ label, tool: showToolField ? toolName : rpcMethod, ts: Date.now(), ok: false, error: msg });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-lg mx-4 p-6 shadow-2xl">
        <h3 className="font-semibold text-text-heading mb-4">{label}</h3>
        <p className="text-xs text-text-muted mb-4 font-mono">{rpcMethod}</p>

        {err && <Alert variant="danger" className="mb-4">{err}</Alert>}

        <div className="space-y-3">
          {showToolField && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1" htmlFor="tr-tool">Tool name</label>
              <input id="tr-tool" type="text" value={toolName} onChange={e => { setToolName(e.target.value); }}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                placeholder="e.g. analyze-voice-comprehensive" />
            </div>
          )}
          {extraFields?.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-text-secondary mb-1" htmlFor={`tr-${f.key}`}>{f.label}</label>
              <input id={`tr-${f.key}`} type={f.type ?? "text"} value={extra[f.key] ?? ""}
                onChange={e => { setExtra(prev => ({ ...prev, [f.key]: e.target.value })); }}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                placeholder={f.placeholder} />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1" htmlFor="tr-params">Params (JSON)</label>
            <textarea id="tr-params" value={paramsJson} onChange={e => { setParamsJson(e.target.value); }} rows={4}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={running}>Cancel</Button>
          <Button variant="primary" onClick={handleRun} disabled={running}>
            {running ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Running…</> : <><Play className="w-3 h-3 mr-1" />Execute</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper to get initial tab from URL query param ──────────────────────────

function useUrlTab(defaultTab: string) {
  const location = useLocation();
  const initialTab = useMemo(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get("tab");
    return t && t.length > 0 ? t : defaultTab;
    // Only run once on mount — intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState(initialTab);
  return [tab, setTab] as const;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function HPICSPage() {
  const [activeTab, setTab] = useUrlTab("health");
  const [activeRunner, setActiveRunner] = useState<{
    rpcMethod: string;
    label: string;
    extraFields?: { key: string; label: string; placeholder: string; type?: string }[];
  } | null>(null);
  const [results, setResults] = useState<RunResult[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [agisObjective, setAgisObjective] = useState("");
  const [agisDepth, setAgisDepth] = useState<"standard" | "deep">("standard");
  const [agisRunning, setAgisRunning] = useState(false);
  const [agisError, setAgisError] = useState<string | null>(null);

  const { data: health, loading: hLoad, error: hErr, refetch: hRefetch } = useRpc<HpicsHealth>("hpics.health", {});
  const { data: tools, loading: tLoad, error: tErr, refetch: tRefetch } = useRpc<HpicsToolCatalog>("hpics.tools.list", {});
  const { data: cfg, loading: cfgLoad, refetch: cfgRefetch } = useRpc<ConfigStatus>("hpics.config.status", {});
  const { data: agentsData, loading: aLoad, error: aErr, refetch: aRefetch } = useRpc<HpicsRoleListResult>("republic.hpics.roles.list", {});
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const configured = health?.configured !== false;
  const totalTools = tools?.totalTools ?? 407;
  const filteredDomains = DOMAINS.filter(d =>
    !searchQ || d.label.toLowerCase().includes(searchQ.toLowerCase()) || d.desc.toLowerCase().includes(searchQ.toLowerCase())
  );

  function addResult(r: RunResult) {
    setResults(prev => [r, ...prev].slice(0, 30));
  }

  async function runAgis() {
    setAgisError(null);
    if (!agisObjective.trim()) { setAgisError("Objective is required"); return; }
    setAgisRunning(true);
    try {
      const result = (await rpc("hpics.pipeline.agis.full", {
        objective: agisObjective.trim(),
        depth: agisDepth,
      })) as { ok: boolean; data?: unknown; error?: string };
      addResult({ label: "AGIS Full Pipeline", tool: `agis-${agisDepth}`, ts: Date.now(), ok: result.ok, data: result.data, error: result.error });
      setTab("results");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAgisError(msg);
      addResult({ label: "AGIS Full Pipeline", tool: `agis-${agisDepth}`, ts: Date.now(), ok: false, error: msg });
    } finally {
      setAgisRunning(false);
    }
  }

  const TABS = [
    { id: "health", label: "Health" },
    { id: "agents", label: `Agents (${agentsData?.total ?? 0})` },
    { id: "domains", label: "Domains" },
    { id: "pipelines", label: "Pipelines" },
    { id: "media", label: "Media AI" },
    { id: "agis", label: "AGIS" },
    { id: "results", label: `Results (${results.length})` },
    { id: "config", label: "Config" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="HPICS Intelligence"
        description="Personal Intelligence Control System — 407 tools · 15 domain routers · 7 pipeline bridges"
        icon={<Brain className="w-6 h-6 text-accent" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => { hRefetch(); tRefetch(); cfgRefetch(); }} aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      {!hLoad && !configured && (
        <Alert variant="warning">
          <span className="font-semibold">HPICS not connected.</span>{" "}
          Add <code className="text-xs px-1 bg-warning-bg rounded">HPICS_GATEWAY_URL</code> and{" "}
          <code className="text-xs px-1 bg-warning-bg rounded">HPICS_API_KEY</code> to your{" "}
          <code className="text-xs">.env</code> — see the <strong>Config</strong> tab for details.
        </Alert>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Tools" value={`${totalTools}`} icon={<Zap className="w-5 h-5 text-accent" />} />
        <StatCard label="Domain Routers" value="15" icon={<Layers className="w-5 h-5 text-info" />} />
        <StatCard label="Pipeline Bridges" value="7" icon={<GitBranch className="w-5 h-5 text-warning" />} />
        <StatCard label="Results" value={`${results.length}`} icon={<Activity className="w-5 h-5 text-success" />} />
      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setTab} />

      {/* ── HEALTH ── */}
      {activeTab === "health" && (
        <div className="space-y-4">
          <RpcStatus loading={hLoad} error={hErr} onRetry={hRefetch} />
          {!hLoad && health && (
            <>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${configured ? "bg-success" : "bg-warning"}`} />
                <span className="text-sm text-text-secondary">
                  {configured ? "Connected to HPICS gateway" : "Gateway not configured"}
                </span>
              </div>
              {health.message && <Alert variant="info">{health.message}</Alert>}
              {health.routers ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(health.routers).map(([name, info]) => (
                    <Card key={name} className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text-primary capitalize">{name.replace("-router", "")}</span>
                        <Badge variant={["ok", "healthy"].includes(info.status) ? "success" : "danger"}>{info.status}</Badge>
                      </div>
                      {info.latency_ms !== undefined && <p className="text-xs text-text-muted mt-1">{info.latency_ms}ms</p>}
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {DOMAINS.map(d => (
                    <Card key={d.id} className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        <d.icon className={`w-3.5 h-3.5 shrink-0 ${d.color}`} />
                        <span className="text-xs font-medium text-text-primary truncate">{d.label}</span>
                        <Badge variant="neutral" className="ml-auto text-[9px]">{d.count}</Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── AGENTS ── */}
      {activeTab === "agents" && (
        <div className="space-y-4">
          <RpcStatus loading={aLoad} error={aErr} onRetry={aRefetch} />
          {!aLoad && agentsData?.roles && (() => {
            const roles = agentsData.roles;
            const director = roles.find(r => !r.reportsTo);
            const divisions = roles.filter(r => r.reportsTo === director?.id);
            const fieldAgents = roles.filter(r => r.reportsTo && r.reportsTo !== director?.id);

            const clearanceColor = (lvl: number) =>
              lvl >= 5 ? "danger" : lvl >= 4 ? "warning" : lvl >= 3 ? "info" : "neutral";

            const disciplineColor = (d: string) => {
              if (d.includes("CMD")) { return "text-danger"; }
              if (d.includes("INTEL") || d.includes("OSINT")) { return "text-info"; }
              if (d.includes("PSYCH") || d.includes("DECEPTION")) { return "text-warning"; }
              if (d.includes("CW") || d.includes("OPS")) { return "text-danger"; }
              if (d.includes("BIO") || d.includes("SIGINT")) { return "text-success"; }
              return "text-accent";
            };

            const AgentCard = ({ role }: { role: HpicsRole }) => {
              const isExpanded = expandedAgent === role.id;
              return (
                <Card className="p-4 hover:border-border-hover cursor-pointer transition-all" hover
                  onClick={() => { setExpandedAgent(isExpanded ? null : role.id); }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`font-mono font-bold text-sm ${disciplineColor(role.discipline)}`}>{role.codename}</span>
                        <span className="text-sm font-medium text-text-heading">{role.title}</span>
                      </div>
                      <p className="text-xs text-text-muted">{role.realWorldEquivalent}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant={clearanceColor(role.clearanceLevel) as "danger" | "warning" | "info" | "neutral"}>L{role.clearanceLevel}</Badge>
                      <Badge variant="neutral">{role.tools.length} tools</Badge>
                      <Badge variant="purple">{role.discipline.replace("HPICS-", "")}</Badge>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3 animate-fade-in">
                      {/* System Prompt Preview */}
                      <div>
                        <span className="text-xs font-semibold text-text-secondary block mb-1">System Prompt</span>
                        <pre className="text-xs text-text-muted bg-bg-secondary rounded p-3 overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap">
                          {role.systemPrompt}
                        </pre>
                      </div>

                      {/* Tools */}
                      {role.tools.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-text-secondary block mb-1">Tools ({role.tools.length})</span>
                          <div className="flex flex-wrap gap-1.5">
                            {role.tools.map(t => (
                              <button key={t} type="button"
                                className="text-xs bg-bg-secondary hover:bg-bg-input border border-border hover:border-accent rounded px-2 py-0.5 text-text-secondary hover:text-accent transition-colors font-mono"
                                onClick={(e) => { e.stopPropagation(); setActiveRunner({ rpcMethod: "hpics.tool.run", label: `${role.codename}: ${t}` }); }}>
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AGIS Phases + Skills */}
                      <div className="grid grid-cols-2 gap-3">
                        {role.agisPhases.length > 0 && (
                          <div>
                            <span className="text-xs font-semibold text-text-secondary block mb-1">AGIS Phases</span>
                            <div className="flex flex-wrap gap-1">
                              {role.agisPhases.map(p => (
                                <span key={p} className="text-[10px] bg-warning/10 text-warning rounded px-1.5 py-0.5 font-mono">φ{p}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <span className="text-xs font-semibold text-text-secondary block mb-1">Skills</span>
                          <div className="flex flex-wrap gap-1">
                            {role.skills.map(s => (
                              <span key={s} className="text-[10px] bg-accent/10 text-accent rounded px-1.5 py-0.5">{s.replace(/_/g, " ")}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Domains */}
                      <div>
                        <span className="text-xs font-semibold text-text-secondary block mb-1">HPICS Domains</span>
                        <div className="flex flex-wrap gap-1">
                          {role.hpicsDomains.map(d => (
                            <span key={d} className="text-[10px] bg-info/10 text-info rounded px-1.5 py-0.5">{d.replace("-router", "")}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            };

            return (
              <>
                {/* Director */}
                {director && (
                  <div>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Director of Operations</h3>
                    <AgentCard role={director} />
                  </div>
                )}

                {/* Division Chiefs */}
                {divisions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Division Chiefs ({divisions.length})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {divisions.map(r => <AgentCard key={r.id} role={r} />)}
                    </div>
                  </div>
                )}

                {/* Field Agents */}
                {fieldAgents.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Field Agents ({fieldAgents.length})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {fieldAgents.map(r => <AgentCard key={r.id} role={r} />)}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── DOMAINS ── */}
      {activeTab === "domains" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="search" value={searchQ} onChange={e => { setSearchQ(e.target.value); }}
              placeholder="Search domain routers…"
              className="w-full bg-bg-input border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" />
          </div>

          {filteredDomains.length === 0 ? (
            <EmptyState icon={<Search className="w-8 h-8" />} title="No domains found" description="Try a different search" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDomains.map(d => (
                <Card key={d.id} className="p-4 hover:border-border-hover cursor-pointer group transition-all"
                  onClick={() => { setActiveRunner({ rpcMethod: d.rpc, label: `${d.label} Tool` }); }}>
                  <div className="flex items-start gap-3">
                    <d.icon className={`w-4 h-4 mt-0.5 shrink-0 ${d.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-text-heading text-sm">{d.label}</span>
                        <Badge variant="neutral">{d.count}</Badge>
                      </div>
                      <p className="text-text-muted text-xs">{d.desc}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setActiveRunner({ rpcMethod: d.rpc, label: `${d.label} Tool` }); }}>
                      <Play className="w-3 h-3 mr-1" /> Run
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* catalog */}
          {!tLoad && tools?.categories && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-text-heading">Tool Catalog</h3>
              <RpcStatus loading={tLoad} error={tErr} onRetry={tRefetch} />
              {Object.entries(tools.categories).map(([cat, catData]) => (
                <Card key={cat} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-text-primary capitalize">{cat}</span>
                    <Badge variant="info">{catData.tools.length} tools</Badge>
                  </div>
                  <p className="text-xs text-text-muted mb-3">{catData.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {catData.tools.slice(0, 10).map(tool => (
                      <button key={tool} type="button"
                        className="text-xs bg-bg-secondary hover:bg-bg-input border border-border hover:border-accent rounded px-2 py-0.5 text-text-secondary hover:text-accent transition-colors"
                        onClick={() => {
                          const domain = DOMAINS.find(d => d.id === cat);
                          if (domain) { setActiveRunner({ rpcMethod: domain.rpc, label: `${domain.label} — ${tool}` }); }
                          else { setActiveRunner({ rpcMethod: "hpics.tool.run", label: tool }); }
                        }}>
                        {tool}
                      </button>
                    ))}
                    {catData.tools.length > 10 && (
                      <span className="text-xs text-text-muted px-1 py-0.5">+{catData.tools.length - 10} more</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PIPELINES ── */}
      {activeTab === "pipelines" && (
        <div className="space-y-4">
          <Alert variant="info">
            Pipeline bridges chain multiple HPICS tools in sequence, returning a unified intelligence report.
            Each pipeline runs server-side — results appear in the <strong>Results</strong> tab.
          </Alert>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                rpc: "hpics.pipeline.voice.analyze",
                label: "Voice Intelligence Pipeline",
                icon: Mic,
                color: "text-accent",
                desc: "Transcribe → deception → stress → stylometric fingerprint",
                fields: [
                  { key: "audioUrl", label: "Audio URL (WAV/MP3 — from HoC AudioStudio)", placeholder: "https://…/recording.wav" },
                  { key: "transcript", label: "Transcript (optional if audioUrl provided)", placeholder: "Speaker said…" },
                ],
              },
              {
                rpc: "hpics.pipeline.deepfake.analyze",
                label: "Deepfake Detection Pipeline",
                icon: ScanEye,
                color: "text-danger",
                desc: "Image/video deepfake detection via biometric-router",
                fields: [
                  { key: "mediaUrl", label: "Media URL (image or video URL)", placeholder: "https://…/image.jpg" },
                  { key: "mediaType", label: "Media type", placeholder: "image", type: "text" },
                ],
              },
              {
                rpc: "hpics.pipeline.biometric.face",
                label: "Facial Biometrics Pipeline",
                icon: UserCheck,
                color: "text-success",
                desc: "Face vectors, age, emotion map, microexpressions",
                fields: [
                  { key: "imageUrl", label: "Image URL (face photo)", placeholder: "https://…/photo.jpg" },
                ],
              },
              {
                rpc: "hpics.pipeline.digital.twin",
                label: "Digital Twin Generator",
                icon: GitBranch,
                color: "text-info",
                desc: "Build behavioral digital twin → optionally simulate actions",
                fields: [],
              },
              {
                rpc: "hpics.pipeline.media.intelligence",
                label: "Full Media Intelligence",
                icon: Video,
                color: "text-warning",
                desc: "Metadata → triangulation → affective manipulation (parallel)",
                fields: [],
              },
              {
                rpc: "hpics.pipeline.osint.full",
                label: "Full OSINT Pipeline",
                icon: Globe,
                color: "text-accent",
                desc: "Enrich → network graph → digital footprint → dossier",
                fields: [
                  { key: "target", label: "Target (name, email, phone, domain)", placeholder: "john.doe@example.com" },
                  { key: "targetType", label: "Target type", placeholder: "person" },
                  { key: "depth", label: "Depth (basic | deep)", placeholder: "deep" },
                ],
              },
            ].map(p => (
              <Card key={p.rpc} className="p-4 hover:border-border-hover cursor-pointer group transition-all"
                onClick={() => { setActiveRunner({ rpcMethod: p.rpc, label: p.label, extraFields: p.fields.length > 0 ? p.fields : undefined }); }}>
                <div className="flex items-start gap-3">
                  <p.icon className={`w-4 h-4 mt-0.5 shrink-0 ${p.color}`} />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-text-heading text-sm block mb-1">{p.label}</span>
                    <p className="text-xs text-text-muted">{p.desc}</p>
                    <p className="font-mono text-[10px] text-text-muted mt-1">{p.rpc}</p>
                  </div>
                </div>
                <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                  <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); setActiveRunner({ rpcMethod: p.rpc, label: p.label, extraFields: p.fields.length > 0 ? p.fields : undefined }); }}>
                    <Play className="w-3 h-3 mr-1" /> Run pipeline
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── MEDIA AI ── */}
      {activeTab === "media" && (
        <div className="space-y-4">
          <Alert variant="info">
            HoC generates voice/images/video via <strong>AudioStudio</strong>, <strong>ComfyUI</strong>, and <strong>VideoStudio</strong> plugins.
            Pass the generated media URL here to run HPICS intelligence on top of it.
          </Alert>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Mic className="w-4 h-4 text-accent" />
                <span className="font-semibold text-text-heading">Voice Analysis</span>
              </div>
              <p className="text-xs text-text-muted mb-4">
                Run deception detection, stress markers, stylometric fingerprinting, and
                linguistic analysis on any audio recording from HoC AudioStudio.
              </p>
              <div className="space-y-2">
                {["analyze-voice-comprehensive", "linguistic-deception-analyzer", "stylometric-fingerprinter", "voice-stress-correlator"].map(t => (
                  <button key={t} type="button"
                    className="flex items-center gap-2 w-full text-left text-xs text-text-secondary hover:text-accent transition-colors py-1"
                    onClick={() => { setActiveRunner({ rpcMethod: "hpics.voice.run", label: `Voice: ${t}` }); }}>
                    <ChevronRight className="w-3 h-3 shrink-0" /><span className="font-mono">{t}</span>
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-4 w-full"
                onClick={() => { setActiveRunner({ rpcMethod: "hpics.pipeline.voice.analyze", label: "Voice Intelligence Pipeline", extraFields: [{ key: "audioUrl", label: "Audio URL", placeholder: "https://…/recording.wav" }] }); }}>
                Run Voice Pipeline
              </Button>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ScanEye className="w-4 h-4 text-danger" />
                <span className="font-semibold text-text-heading">Deepfake Detection</span>
              </div>
              <p className="text-xs text-text-muted mb-4">
                Detect AI-generated or manipulated images and videos. Works on ComfyUI outputs,
                screen captures, or any media URL.
              </p>
              <div className="space-y-2">
                {["deepfake-analyzer", "extract-facial-biometrics", "microexpression-analyzer", "pupillometry-analyzer"].map(t => (
                  <button key={t} type="button"
                    className="flex items-center gap-2 w-full text-left text-xs text-text-secondary hover:text-accent transition-colors py-1"
                    onClick={() => { setActiveRunner({ rpcMethod: "hpics.biometric.run", label: `Biometric: ${t}` }); }}>
                    <ChevronRight className="w-3 h-3 shrink-0" /><span className="font-mono">{t}</span>
                  </button>
                ))}
              </div>
              <Button variant="danger" size="sm" className="mt-4 w-full"
                onClick={() => { setActiveRunner({ rpcMethod: "hpics.pipeline.deepfake.analyze", label: "Deepfake Detection", extraFields: [{ key: "mediaUrl", label: "Media URL", placeholder: "https://…/image.jpg" }] }); }}>
                Analyze for Deepfakes
              </Button>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wand2 className="w-4 h-4 text-warning" />
                <span className="font-semibold text-text-heading">Diffusion Model Output Analysis</span>
              </div>
              <p className="text-xs text-text-muted mb-4">
                Analyze images generated by ComfyUI / SDXL / Flux diffusion models.
                Runs metadata analysis + affective manipulation detection on generated content.
              </p>
              <div className="space-y-2">
                {["generate-media-metadata", "generate-media-metadata-mosaic", "affective-manipulation-detector", "analyze-media-deep"].map(t => (
                  <button key={t} type="button"
                    className="flex items-center gap-2 w-full text-left text-xs text-text-secondary hover:text-accent transition-colors py-1"
                    onClick={() => { setActiveRunner({ rpcMethod: "hpics.media.run", label: `Media: ${t}` }); }}>
                    <ChevronRight className="w-3 h-3 shrink-0" /><span className="font-mono">{t}</span>
                  </button>
                ))}
              </div>
              <Button variant="warning" size="sm" className="mt-4 w-full"
                onClick={() => { setActiveRunner({ rpcMethod: "hpics.pipeline.media.intelligence", label: "Full Media Intelligence Pipeline" }); }}>
                Full Media Intelligence
              </Button>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <GitBranch className="w-4 h-4 text-info" />
                <span className="font-semibold text-text-heading">Digital Twin Synthesis</span>
              </div>
              <p className="text-xs text-text-muted mb-4">
                Build a behavioral digital twin from profile data, then simulate their decisions
                and predict future actions. Powered by HPICS fusion router.
              </p>
              <div className="space-y-2">
                {["digital-twin-generator", "digital-twin-simulator", "behavioral-digital-twin", "counterfactual-engine"].map(t => (
                  <button key={t} type="button"
                    className="flex items-center gap-2 w-full text-left text-xs text-text-secondary hover:text-accent transition-colors py-1"
                    onClick={() => { setActiveRunner({ rpcMethod: "hpics.fusion.run", label: `Fusion: ${t}` }); }}>
                    <ChevronRight className="w-3 h-3 shrink-0" /><span className="font-mono">{t}</span>
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-4 w-full"
                onClick={() => { setActiveRunner({ rpcMethod: "hpics.pipeline.digital.twin", label: "Digital Twin Generator" }); }}>
                Generate Digital Twin
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* ── AGIS ── */}
      {activeTab === "agis" && (
        <div className="space-y-4 max-w-2xl">
          <Alert variant="warning">
            AGIS (Absolute General Intelligence System) runs a multi-phase orchestration pipeline.
            <strong> Deep mode</strong> may take 60–120 seconds.
          </Alert>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-warning" />
              <span className="font-semibold text-text-heading">AGIS Full Pipeline</span>
            </div>

            {agisError && <Alert variant="danger" className="mb-4">{agisError}</Alert>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1" htmlFor="agis-obj">Intelligence objective</label>
                <textarea id="agis-obj" value={agisObjective} onChange={e => { setAgisObjective(e.target.value); }} rows={3}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
                  placeholder="Describe the intelligence objective…" />
              </div>
              <div className="flex gap-3">
                {(["standard", "deep"] as const).map(d => (
                  <button key={d} type="button"
                    onClick={() => { setAgisDepth(d); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${agisDepth === d ? "bg-warning/10 border-warning text-warning" : "border-border text-text-secondary hover:border-border-hover"}`}>
                    {d === "standard" ? "⚡ Standard (cascade)" : "🌀 Deep (omniscient)"}
                  </button>
                ))}
              </div>
            </div>

            <Button variant="primary" className="mt-5 w-full" onClick={runAgis} disabled={agisRunning || !configured}>
              {agisRunning ? <><RefreshCw className="w-3 h-3 mr-2 animate-spin" />Running AGIS…</> : <><Layers className="w-3 h-3 mr-2" />Launch AGIS Pipeline</>}
            </Button>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { tool: "agis-cascade-orchestrator", desc: "Standard multi-stage orchestration" },
              { tool: "omniscient-orchestrator", desc: "Full-depth omniscient analysis" },
              { tool: "genesis-engine", desc: "Genesis intelligence bootstrapper" },
              { tool: "quantum-cognition-engine", desc: "Quantum-enhanced reasoning model" },
              { tool: "autonomous-campaign-executor", desc: "Autonomous intelligence campaign" },
              { tool: "reality-consensus-engine", desc: "Reality consensus mapping" },
            ].map(t => (
              <button key={t.tool} type="button"
                className="text-left p-3 rounded-lg border border-border hover:border-accent hover:bg-bg-card transition-all"
                onClick={() => { setActiveRunner({ rpcMethod: "hpics.agis.run", label: `AGIS: ${t.tool}` }); }}>
                <p className="font-mono text-xs font-medium text-text-primary">{t.tool}</p>
                <p className="text-xs text-text-muted mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {activeTab === "results" && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <EmptyState icon={<Activity className="w-8 h-8" />} title="No results yet"
              description="Run tools from any tab to see results here"
              action={<Button variant="outline" onClick={() => { setTab("domains"); }}>Browse domains</Button>} />
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setResults([]); }}>
                  Clear all
                </Button>
              </div>
              {results.map((r, i) => <RunCard key={i} result={r} />)}
            </>
          )}
        </div>
      )}

      {/* ── CONFIG ── */}
      {activeTab === "config" && (
        <div className="space-y-4 max-w-xl">
          <RpcStatus loading={cfgLoad} error={null} onRetry={cfgRefetch} />

          {!cfgLoad && cfg && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-accent" />
                <span className="font-semibold text-text-heading">Connection Status</span>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Overall status</span>
                  <Badge variant={cfg.configured ? "success" : "danger"}>{cfg.configured ? "Connected" : "Not configured"}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">HPICS_GATEWAY_URL</span>
                  <Badge variant={cfg.hasUrl ? "success" : "danger"}>{cfg.hasUrl ? `✓ ${cfg.gatewayHost ?? "set"}` : "Missing"}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">HPICS_API_KEY</span>
                  <Badge variant={cfg.hasKey ? "success" : "danger"}>{cfg.hasKey ? "✓ Set" : "Missing"}</Badge>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crosshair className="w-4 h-4 text-info" />
              <span className="font-semibold text-text-heading">How to connect HPICS</span>
            </div>
            <ol className="space-y-3 text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-accent font-bold">1.</span> Get your Supabase project URL from the HPICS dashboard</li>
              <li className="flex gap-2"><span className="text-accent font-bold">2.</span> Find the HOC_API_KEY secret in HPICS Supabase &rarr; Edge Functions &rarr; Secrets</li>
              <li className="flex gap-2"><span className="text-accent font-bold">3.</span> Add to HoC <code className="text-xs bg-bg-secondary px-1 rounded">.env</code>:</li>
            </ol>
            <pre className="mt-3 bg-bg-secondary rounded-lg p-4 text-xs text-text-primary font-mono leading-relaxed overflow-auto">
{`HPICS_GATEWAY_URL=https://<project>.supabase.co/functions/v1/hoc-gateway
HPICS_API_KEY=<your-shared-secret>`}
            </pre>
            <p className="text-xs text-text-muted mt-3">
              Restart the HoC gateway after editing <code>.env</code>. The health tab will turn green when connected.
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="font-semibold text-text-heading">Rate limits</span>
            </div>
            <div className="space-y-1.5 text-xs text-text-secondary">
              <p>HPICS gateway enforces <strong>60 requests/minute</strong> per HOC_API_KEY.</p>
              <p>AGIS pipeline and osint.full pipelines may consume multiple slots per call.</p>
              <p>Multi-stage pipeline handlers use 120s timeout to accommodate long AGIS runs.</p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-success" />
              <span className="font-semibold text-text-heading">Security model</span>
            </div>
            <div className="space-y-1.5 text-xs text-text-secondary">
              <p>Domain shorthands: WRITE scope — valid HoC token required.</p>
              <p>Health, tools.list, categories.list, config.status: READ scope.</p>
              <p>HPICS_API_KEY is never exposed in UI responses (config.status returns boolean flags only).</p>
            </div>
          </Card>
        </div>
      )}

      {/* Runner Modal */}
      {activeRunner && (
        <ToolRunner
          rpcMethod={activeRunner.rpcMethod}
          label={activeRunner.label}
          extraFields={activeRunner.extraFields}
          onClose={() => { setActiveRunner(null); }}
          onResult={r => {
            addResult(r);
            setActiveRunner(null);
            setTab("results");
          }}
        />
      )}
    </div>
  );
}
