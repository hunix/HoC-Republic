import { useRpc, rpc } from "@/lib/rpc";
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
  ConfirmDialog,
  Alert,
} from "@/components/ui";
import { useState } from "react";
import {
  ShieldAlert,
  Smartphone,
  Scan,
  Bug,
  Brain,
  Play,
  Square,
  RefreshCw,
  FlaskConical,
  FileCode,
  Shield,
  Wifi,
  AlertTriangle,
  CheckCircle,
  Clock,
  MessageSquare,
  Radio,
  Cpu,
  Plug,
  Unplug,
  Terminal,
  Search,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface GuardianStatus {
  ok: boolean;
  devicesMonitored: number;
  activeMitigations: number;
  totalProbes: number;
  exposedDevices: string[];
  lastScanAt: number | null;
}

interface ResearcherStatus {
  ok: boolean;
  running: boolean;
  totalAnalyzed: number;
  totalFindings: number;
  totalHarnesses: number;
  cycleCount: number;
  lastCycleAt: number | null;
  processedCount: number;
}

interface Finding {
  id: string;
  vulnId: string;
  cve: string;
  title: string;
  analysis: string;
  pocIdea: string;
  harnessCode: string;
  harnessLanguage: string;
  mitigationDraft: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  status: "pending" | "testing" | "confirmed" | "false_positive" | "mitigated";
  testedAt?: number;
  testResult?: string;
  createdAt: number;
}

interface Device {
  id: string;
  label: string;
  platform: string;
  ipAddress?: string;
  osVersion?: string;
  appVersion?: string;
}

interface Mitigation {
  id: string;
  deviceId: string;
  vulnId: string;
  cve: string;
  mitigationType: string;
  mitigationDetail: string;
  appliedAt: number;
  resolved: boolean;
}

interface ProbeResult {
  deviceId: string;
  vulnId: string;
  cve: string;
  severity: string;
  exposed: boolean;
  probeMethod: string;
  evidence?: string;
  timestamp: number;
}

interface AndroidDevice {
  id: string;
  serial: string;
  label: string;
  model: string;
  brand: string;
  androidVersion: string;
  apiLevel: number;
  securityPatch: string;
  isRooted: boolean;
  encryptionState: string;
  selinuxMode: string;
  connectedAt: number;
  lastScanAt?: number;
  status: string;
  ipAddress?: string;
}

interface FlipperStatus {
  connected: boolean;
  port?: string;
  firmwareVersion?: string;
  firmwareType?: string;
  deviceName?: string;
  batteryLevel?: number;
  batteryCharging?: boolean;
  sdCardPresent?: boolean;
  sdCardFreeKB?: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function severityBadge(severity: string) {
  const v = severity === "critical" ? "danger"
    : severity === "high" ? "warning"
    : severity === "medium" ? "info" : "success";
  return <Badge variant={v}>{severity.toUpperCase()}</Badge>;
}

function statusBadge(status: string) {
  const v = status === "confirmed" ? "danger"
    : status === "pending" ? "warning"
    : status === "testing" ? "info"
    : status === "mitigated" ? "success" : "neutral";
  return <Badge variant={v}>{status.toUpperCase()}</Badge>;
}

function fmtTime(ts: number | null | undefined): string {
  if (!ts) { return "—"; }
  const d = new Date(ts);
  return d.toLocaleString();
}

function fmtAgo(ts: number | null | undefined): string {
  if (!ts) { return "never"; }
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) { return `${s}s ago`; }
  if (s < 3600) { return `${Math.round(s / 60)}m ago`; }
  return `${Math.round(s / 3600)}h ago`;
}

// ─── Main Page ──────────────────────────────────────────────────

export function GuardianDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [connectIp, setConnectIp] = useState("");
  const [flipperCmd, setFlipperCmd] = useState("");
  const [flipperOutput, setFlipperOutput] = useState("");

  // All hooks at the top — before any conditional returns
  const { data: guardian, loading: l1, error: e1, refetch: r1 } =
    useRpc<GuardianStatus>("republic.cyber.kali.guardian.status", {});
  const { data: researcher, loading: l2, error: e2, refetch: r2 } =
    useRpc<ResearcherStatus>("republic.cyber.kali.researcher.status", {});
  const { data: devicesData, loading: l3, error: e3, refetch: r3 } =
    useRpc<{ ok: boolean; devices: Device[] }>("republic.cyber.kali.guardian.devices.list", {});
  const { data: findingsData, loading: l4, error: e4, refetch: r4 } =
    useRpc<{ ok: boolean; total: number; findings: Finding[] }>("republic.cyber.kali.researcher.findings", { limit: 50 });
  const { data: mitigationsData, loading: l5, error: e5, refetch: r5 } =
    useRpc<{ ok: boolean; mitigations: Mitigation[] }>("republic.cyber.kali.guardian.mitigations", {});
  const { data: probesData, loading: l6, error: e6, refetch: r6 } =
    useRpc<{ ok: boolean; probes: ProbeResult[] }>("republic.cyber.kali.guardian.probes", {});

  // Android + Flipper hooks
  const { data: androidData, loading: l7, refetch: r7 } =
    useRpc<{ ok: boolean; devices: AndroidDevice[] }>("republic.cyber.android.devices.list", {});
  const { data: flipperData, loading: l8, refetch: r8 } =
    useRpc<FlipperStatus>("republic.cyber.flipper.status", {});

  const loading = l1 || l2 || l3 || l4 || l5 || l6;
  const error = e1 || e2 || e3 || e4 || e5 || e6;
  const refetchAll = () => { r1(); r2(); r3(); r4(); r5(); r6(); r7(); r8(); };

  const devices = devicesData?.devices ?? [];
  const findings = findingsData?.findings ?? [];
  const mitigations = mitigationsData?.mitigations ?? [];
  const probes = probesData?.probes ?? [];
  const androidDevices = androidData?.devices ?? [];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "devices", label: `Devices (${devices.length})` },
    { id: "findings", label: `Findings (${findings.length})` },
    { id: "mitigations", label: `Mitigations (${mitigations.length})` },
    { id: "probes", label: `Probes (${probes.length})` },
    { id: "android", label: `Android Lab (${androidDevices.length})` },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "flipper", label: "Flipper Zero" },
  ];

  const criticalFindings = findings.filter(f => f.severity === "critical").length;
  const confirmedFindings = findings.filter(f => f.status === "confirmed").length;
  const pendingFindings = findings.filter(f => f.status === "pending").length;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Zero-Day Guardian"
        description="Autonomous device protection, vulnerability research, Android forensics, Flipper Zero control, and blue-team defense synthesis"
        icon={<ShieldAlert className="w-6 h-6" />}
        actions={
          <div className="flex gap-2">
            <Button variant={researcher?.running ? "danger" : "success"} size="sm" onClick={async () => {
              if (researcher?.running) {
                await rpc("republic.cyber.kali.researcher.stop", {});
              } else {
                await rpc("republic.cyber.kali.researcher.start", {});
              }
              r2();
            }}>
              {researcher?.running
                ? <><Square className="w-4 h-4 mr-1" /> Stop Researcher</>
                : <><Play className="w-4 h-4 mr-1" /> Start Researcher</>}
            </Button>
            <Button variant="primary" size="sm" onClick={async () => {
              await rpc("republic.cyber.kali.guardian.scan", {});
              refetchAll();
            }}>
              <Scan className="w-4 h-4 mr-1" /> Scan Devices
            </Button>
          </div>
        }
      />

      <RpcStatus loading={loading} error={error} onRetry={refetchAll} />

      {!loading && !error && (
        <>
          {/* ── Status Banner ── */}
          <div className={`rounded-xl p-4 flex items-center justify-between ${
            (guardian?.exposedDevices?.length ?? 0) > 0
              ? "bg-danger/20 border border-danger/40"
              : "bg-success/20 border border-success/40"
          }`}>
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-8 h-8 text-text-primary" />
              <div>
                <div className="text-sm text-text-muted">GUARDIAN STATUS</div>
                <div className="text-xl font-bold text-text-heading">
                  {(guardian?.exposedDevices?.length ?? 0) > 0
                    ? `⚠️ ${guardian!.exposedDevices.length} DEVICE(S) EXPOSED`
                    : "✅ ALL DEVICES SECURE"}
                </div>
              </div>
            </div>
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <div className="font-bold text-text-primary">{guardian?.devicesMonitored ?? 0}</div>
                <div className="text-text-muted">Monitored</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-danger">{guardian?.activeMitigations ?? 0}</div>
                <div className="text-text-muted">Active Mitigations</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-accent">{guardian?.totalProbes ?? 0}</div>
                <div className="text-text-muted">Total Probes</div>
              </div>
            </div>
          </div>

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Researcher" value={researcher?.running ? "ACTIVE" : "IDLE"}
              icon={<Brain className="w-5 h-5" />}
              sub={`${researcher?.totalAnalyzed ?? 0} analyzed · ${researcher?.cycleCount ?? 0} cycles`} />
            <StatCard label="Findings" value={findings.length}
              icon={<Bug className="w-5 h-5" />}
              sub={`${criticalFindings} critical · ${confirmedFindings} confirmed`} />
            <StatCard label="Harnesses" value={researcher?.totalHarnesses ?? 0}
              icon={<FlaskConical className="w-5 h-5" />}
              sub={`${pendingFindings} pending test`} />
            <StatCard label="Last Scan" value={fmtAgo(guardian?.lastScanAt)}
              icon={<Clock className="w-5 h-5" />}
              sub={`Last cycle: ${fmtAgo(researcher?.lastCycleAt)}`} />
          </div>

          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3">Quick Actions</h3>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={async () => {
                    await rpc("republic.cyber.kali.researcher.cycle", { batchSize: 5 });
                    r4();
                  }}>
                    <RefreshCw className="w-4 h-4 mr-1" /> Run Research Cycle
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    await rpc("republic.cyber.kali.guardian.patch.check", {});
                    refetchAll();
                  }}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Check Patches
                  </Button>
                </div>
              </Card>

              {(guardian?.exposedDevices?.length ?? 0) > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-danger mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Exposed Devices
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(guardian?.exposedDevices ?? []).map(d => (
                      <Badge key={d} variant="danger">{d}</Badge>
                    ))}
                  </div>
                </Card>
              )}

              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3">Recent Findings</h3>
                {findings.length === 0 ? (
                  <EmptyState icon={<Bug className="w-8 h-8" />} title="No findings yet"
                    description="Start the researcher or run a manual cycle" />
                ) : (
                  <div className="space-y-2">
                    {findings.slice(0, 5).map(f => (
                      <div key={f.id} className="flex items-center justify-between p-2 rounded bg-bg-secondary">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-accent">{f.cve}</span>
                          {severityBadge(f.severity)}
                          {statusBadge(f.status)}
                        </div>
                        <span className="text-xs text-text-muted">{fmtAgo(f.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ═══ DEVICES TAB ═══ */}
          {activeTab === "devices" && (
            <div className="space-y-3">
              {devices.length === 0 ? (
                <EmptyState icon={<Smartphone className="w-8 h-8" />} title="No devices registered"
                  description="Register devices via RPC: republic.cyber.kali.guardian.device.register" />
              ) : (
                devices.map(d => (
                  <Card key={d.id} hover>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Smartphone className="w-5 h-5 text-accent" />
                        <div>
                          <div className="font-semibold text-text-heading">{d.label}</div>
                          <div className="text-xs text-text-muted">{d.platform} · {d.osVersion ?? d.appVersion ?? "—"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.ipAddress && (
                          <Badge variant="neutral"><Wifi className="w-3 h-3 mr-1 inline" />{d.ipAddress}</Badge>
                        )}
                        <Badge variant={
                          (guardian?.exposedDevices ?? []).includes(d.label) ? "danger" : "success"
                        }>
                          {(guardian?.exposedDevices ?? []).includes(d.label) ? "EXPOSED" : "SECURE"}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ═══ FINDINGS TAB ═══ */}
          {activeTab === "findings" && (
            <div className="space-y-3">
              {findings.length === 0 ? (
                <EmptyState icon={<Bug className="w-8 h-8" />} title="No findings"
                  description="Run a research cycle to analyze vulnerabilities" />
              ) : (
                findings.map(f => (
                  <Card key={f.id} hover>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-accent">{f.cve}</span>
                        {severityBadge(f.severity)}
                        {statusBadge(f.status)}
                        {f.harnessCode && <Badge variant="purple"><FileCode className="w-3 h-3 mr-1 inline" />Harness</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{Math.round(f.confidence * 100)}% conf</span>
                        {f.status === "pending" && f.harnessCode && (
                          <Button variant="warning" size="sm" onClick={() => { setTestingId(f.id); setShowConfirm(true); }}>
                            <FlaskConical className="w-3 h-3 mr-1" /> Test
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-text-secondary line-clamp-2">{f.analysis}</div>
                    {f.mitigationDraft && (
                      <div className="mt-2 text-xs text-success bg-success-bg rounded p-2">
                        <Shield className="w-3 h-3 inline mr-1" /> {f.mitigationDraft.slice(0, 200)}
                      </div>
                    )}
                    <ProgressBar value={f.confidence * 100} max={100} labelLeft="Confidence" labelRight={`${Math.round(f.confidence * 100)}%`} size="sm" />
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ═══ MITIGATIONS TAB ═══ */}
          {activeTab === "mitigations" && (
            <div className="space-y-3">
              {mitigations.length === 0 ? (
                <EmptyState icon={<Shield className="w-8 h-8" />} title="No active mitigations"
                  description="Mitigations are applied automatically when devices are found exposed" />
              ) : (
                mitigations.map(m => (
                  <Card key={m.id} hover>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-accent">{m.cve}</span>
                        <Badge variant={m.resolved ? "success" : "warning"}>
                          {m.resolved ? "RESOLVED" : "ACTIVE"}
                        </Badge>
                        <Badge variant="info">{m.mitigationType}</Badge>
                      </div>
                      <span className="text-xs text-text-muted">{fmtTime(m.appliedAt)}</span>
                    </div>
                    <div className="text-xs text-text-secondary whitespace-pre-wrap font-mono bg-bg-input rounded p-2 max-h-24 overflow-auto">
                      {m.mitigationDetail}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ═══ PROBES TAB ═══ */}
          {activeTab === "probes" && (
            <div className="space-y-3">
              {probes.length === 0 ? (
                <EmptyState icon={<Scan className="w-8 h-8" />} title="No probe history"
                  description="Run a device scan to probe for vulnerabilities" />
              ) : (
                probes.map((p, i) => (
                  <Card key={`${p.vulnId}-${i}`} hover>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={p.exposed ? "danger" : "success"}>
                          {p.exposed ? "EXPOSED" : "SAFE"}
                        </Badge>
                        <span className="text-sm font-mono text-accent">{p.cve}</span>
                        {severityBadge(p.severity)}
                        <Badge variant="neutral">{p.probeMethod}</Badge>
                      </div>
                      <span className="text-xs text-text-muted">{fmtAgo(p.timestamp)}</span>
                    </div>
                    {p.evidence && (
                      <div className="mt-1 text-xs text-text-secondary">{p.evidence}</div>
                    )}
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ═══ ANDROID LAB TAB ═══ */}
          {activeTab === "android" && (
            <div className="space-y-4">
              {/* Connect Device */}
              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                  <Plug className="w-4 h-4" /> Connect Android Device
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-text-primary text-sm placeholder:text-text-muted"
                    placeholder="Device IP (e.g. 192.168.1.100)"
                    value={connectIp}
                    onChange={(e) => setConnectIp(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && connectIp.trim()) {
                        await rpc("republic.cyber.android.device.connect", { ip: connectIp.trim() });
                        setConnectIp("");
                        r7();
                      }
                    }}
                  />
                  <Button variant="success" size="sm" onClick={async () => {
                    if (!connectIp.trim()) { return; }
                    await rpc("republic.cyber.android.device.connect", { ip: connectIp.trim() });
                    setConnectIp("");
                    r7();
                  }}>
                    <Plug className="w-4 h-4 mr-1" /> Connect
                  </Button>
                </div>
                <p className="text-xs text-text-muted mt-2">
                  Enable Wireless Debugging on the Android device and pair it first. Requires USB debugging authorization.
                </p>
              </Card>

              {/* Device List */}
              {l7 ? (
                <div className="text-sm text-text-muted">Loading devices...</div>
              ) : androidDevices.length === 0 ? (
                <EmptyState icon={<Smartphone className="w-8 h-8" />} title="No Android devices connected"
                  description="Enter a device IP above to connect via ADB over WiFi" />
              ) : (
                androidDevices.map(d => (
                  <Card key={d.id} hover>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Smartphone className="w-5 h-5 text-accent" />
                        <div>
                          <div className="font-semibold text-text-heading">{d.label}</div>
                          <div className="text-xs text-text-muted">
                            Android {d.androidVersion} (API {d.apiLevel}) · {d.serial}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={d.status === "connected" ? "success" : d.status === "scanning" ? "info" : "neutral"}>
                          {d.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    {/* Device details grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                      <div className="bg-bg-secondary rounded p-2">
                        <div className="text-text-muted">Security Patch</div>
                        <div className="font-mono text-text-primary">{d.securityPatch}</div>
                      </div>
                      <div className="bg-bg-secondary rounded p-2">
                        <div className="text-text-muted">Encryption</div>
                        <div className={`font-mono ${d.encryptionState === "encrypted" ? "text-success" : "text-danger"}`}>
                          {d.encryptionState}
                        </div>
                      </div>
                      <div className="bg-bg-secondary rounded p-2">
                        <div className="text-text-muted">SELinux</div>
                        <div className={`font-mono ${d.selinuxMode.toLowerCase() === "enforcing" ? "text-success" : "text-danger"}`}>
                          {d.selinuxMode}
                        </div>
                      </div>
                      <div className="bg-bg-secondary rounded p-2">
                        <div className="text-text-muted">Root</div>
                        <div className={`font-mono ${d.isRooted ? "text-warning" : "text-success"}`}>
                          {d.isRooted ? "ROOTED" : "NOT ROOTED"}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" size="sm" onClick={async () => {
                        await rpc("republic.cyber.android.scan.quick", { deviceId: d.id });
                        r7();
                      }}>
                        <Search className="w-3 h-3 mr-1" /> Quick Scan
                      </Button>
                      <Button variant="warning" size="sm" onClick={async () => {
                        await rpc("republic.cyber.android.scan.full", { deviceId: d.id });
                        r7();
                      }}>
                        <Scan className="w-3 h-3 mr-1" /> Full Forensic
                      </Button>
                      <Button variant="success" size="sm" onClick={async () => {
                        await rpc("republic.cyber.whatsapp.scan", { deviceId: d.id });
                      }}>
                        <MessageSquare className="w-3 h-3 mr-1" /> Scan WhatsApp
                      </Button>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        await rpc("republic.cyber.android.device.disconnect", { deviceId: d.id });
                        r7();
                      }}>
                        <Unplug className="w-3 h-3 mr-1" /> Disconnect
                      </Button>
                    </div>

                    {d.lastScanAt && (
                      <div className="text-xs text-text-muted mt-2">Last scan: {fmtAgo(d.lastScanAt)}</div>
                    )}
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ═══ WHATSAPP TAB ═══ */}
          {activeTab === "whatsapp" && (
            <div className="space-y-4">
              <Alert variant="info">
                WhatsApp scanning works via ADB — no phone number needed. Connect an Android device in the Android Lab tab first, then scan WhatsApp from here.
              </Alert>

              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> WhatsApp Security Scanner
                </h3>
                {androidDevices.length === 0 ? (
                  <EmptyState icon={<Smartphone className="w-8 h-8" />} title="No Android devices connected"
                    description="Connect a device in the Android Lab tab first" />
                ) : (
                  <div className="space-y-3">
                    {androidDevices.map(d => (
                      <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary">
                        <div className="flex items-center gap-3">
                          <Smartphone className="w-5 h-5 text-accent" />
                          <div>
                            <div className="text-sm font-semibold text-text-heading">{d.label}</div>
                            <div className="text-xs text-text-muted">Android {d.androidVersion}</div>
                          </div>
                        </div>
                        <Button variant="success" size="sm" onClick={async () => {
                          await rpc("republic.cyber.whatsapp.scan", { deviceId: d.id });
                        }}>
                          <MessageSquare className="w-3 h-3 mr-1" /> Scan WhatsApp
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Known CVEs reference */}
              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                  <Bug className="w-4 h-4" /> WhatsApp CVE Database
                </h3>
                <div className="space-y-2">
                  {[
                    { cve: "CVE-2025-30401", severity: "critical", title: "MIME Type Confusion RCE", below: "2.25.8.82" },
                    { cve: "CVE-2025-55177", severity: "critical", title: "Paragon Graphite Zero-Click", below: "2.25.6.80" },
                    { cve: "CVE-2024-7587", severity: "critical", title: "Video Call Buffer Overflow", below: "2.24.20.76" },
                    { cve: "CVE-2024-0024", severity: "high", title: "GIF Processing OOB Read", below: "2.24.3.77" },
                    { cve: "CVE-2023-38831", severity: "critical", title: "Archive Extraction RCE", below: "2.23.25.83" },
                    { cve: "CVE-2022-36934", severity: "critical", title: "Video Call Integer Overflow", below: "2.22.16.12" },
                    { cve: "CVE-2019-3568", severity: "critical", title: "Pegasus VoIP Buffer Overflow", below: "2.19.134" },
                  ].map(c => (
                    <div key={c.cve} className="flex items-center justify-between p-2 rounded bg-bg-secondary">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-accent">{c.cve}</span>
                        {severityBadge(c.severity)}
                        <span className="text-xs text-text-secondary">{c.title}</span>
                      </div>
                      <span className="text-xs text-text-muted">Below {c.below}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Spyware Indicators */}
              <Card>
                <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Spyware Detection Indicators
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-bg-secondary rounded p-3">
                    <div className="text-xs font-semibold text-danger mb-2">Known Spyware Processes</div>
                    <div className="flex flex-wrap gap-1">
                      {["Pegasus", "Chrysaor", "Graphite", "Predator", "Hermit", "Candiru", "Cytrox", "Paragon"].map(n => (
                        <Badge key={n} variant="danger">{n}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="bg-bg-secondary rounded p-3">
                    <div className="text-xs font-semibold text-warning mb-2">Suspicious File Indicators</div>
                    <div className="space-y-1 text-xs font-mono text-text-muted">
                      <div>/data/local/tmp/.X11</div>
                      <div>/system/csk</div>
                      <div>/sdcard/.graphite</div>
                      <div>libjustart.so</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ═══ FLIPPER ZERO TAB ═══ */}
          {activeTab === "flipper" && (
            <div className="space-y-4">
              {/* Connection Status */}
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text-heading flex items-center gap-2">
                    <Radio className="w-4 h-4" /> Flipper Zero
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge variant={flipperData?.connected ? "success" : "neutral"}>
                      {flipperData?.connected ? "CONNECTED" : "DISCONNECTED"}
                    </Badge>
                    {!flipperData?.connected ? (
                      <Button variant="success" size="sm" onClick={async () => {
                        await rpc("republic.cyber.flipper.connect", {});
                        r8();
                      }}>
                        <Plug className="w-3 h-3 mr-1" /> Connect
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={async () => {
                        await rpc("republic.cyber.flipper.disconnect", {});
                        r8();
                      }}>
                        <Unplug className="w-3 h-3 mr-1" /> Disconnect
                      </Button>
                    )}
                  </div>
                </div>

                {l8 ? (
                  <div className="text-sm text-text-muted">Loading...</div>
                ) : flipperData?.connected ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-bg-secondary rounded p-2">
                      <div className="text-text-muted">Device</div>
                      <div className="font-semibold text-text-primary">{flipperData.deviceName ?? "Flipper Zero"}</div>
                    </div>
                    <div className="bg-bg-secondary rounded p-2">
                      <div className="text-text-muted">Firmware</div>
                      <div className="font-semibold text-text-primary">
                        {flipperData.firmwareVersion} ({flipperData.firmwareType})
                      </div>
                    </div>
                    <div className="bg-bg-secondary rounded p-2">
                      <div className="text-text-muted">Battery</div>
                      <div className="font-semibold text-text-primary">
                        {flipperData.batteryLevel ?? "?"}% {flipperData.batteryCharging ? "⚡" : ""}
                      </div>
                    </div>
                    <div className="bg-bg-secondary rounded p-2">
                      <div className="text-text-muted">Port</div>
                      <div className="font-mono text-text-primary">{flipperData.port}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    Connect your Flipper Zero via USB. Auto-detects COM port. Works with Official, Momentum, and Unleashed firmware.
                  </p>
                )}
              </Card>

              {/* Module Quick Actions */}
              {flipperData?.connected && (
                <>
                  <Card>
                    <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                      <Cpu className="w-4 h-4" /> Module Controls
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Button variant="outline" size="sm" onClick={async () => {
                        const r = await rpc("republic.cyber.flipper.subghz.read", { frequency: 433920000, duration: 5 }) as { signals?: unknown[] };
                        setFlipperOutput(`Sub-GHz scan: ${(r?.signals ?? []).length} signals captured`);
                      }}>
                        <Radio className="w-3 h-3 mr-1" /> Sub-GHz Scan
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        const r = await rpc("republic.cyber.flipper.nfc.read", {}) as { card?: Record<string, unknown> };
                        setFlipperOutput(r?.card ? `NFC: ${JSON.stringify(r.card)}` : "No NFC card detected");
                      }}>
                        <Scan className="w-3 h-3 mr-1" /> NFC Read
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        const r = await rpc("republic.cyber.flipper.command", { command: "bt scan" }) as { output?: string };
                        setFlipperOutput(`BLE: ${r?.output ?? "No output"}`);
                      }}>
                        <Wifi className="w-3 h-3 mr-1" /> BLE Scan
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        const r = await rpc("republic.cyber.flipper.command", { command: "power info" }) as { output?: string };
                        setFlipperOutput(r?.output ?? "No output");
                      }}>
                        <Cpu className="w-3 h-3 mr-1" /> Device Info
                      </Button>
                    </div>
                  </Card>

                  {/* CLI Console */}
                  <Card>
                    <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
                      <Terminal className="w-4 h-4" /> Flipper CLI Console
                    </h3>
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-text-primary text-sm font-mono placeholder:text-text-muted"
                        placeholder="Enter Flipper CLI command (e.g. info, storage list /ext, subghz rx)"
                        value={flipperCmd}
                        onChange={(e) => setFlipperCmd(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && flipperCmd.trim()) {
                            const r = await rpc("republic.cyber.flipper.command", { command: flipperCmd.trim() }) as { output?: string; error?: string };
                            setFlipperOutput(r?.output || r?.error || "No output");
                            setFlipperCmd("");
                          }
                        }}
                      />
                      <Button variant="primary" size="sm" onClick={async () => {
                        if (!flipperCmd.trim()) { return; }
                        const r = await rpc("republic.cyber.flipper.command", { command: flipperCmd.trim() }) as { output?: string; error?: string };
                        setFlipperOutput(r?.output || r?.error || "No output");
                        setFlipperCmd("");
                      }}>
                        <Play className="w-3 h-3 mr-1" /> Run
                      </Button>
                    </div>
                    {flipperOutput && (
                      <div className="bg-bg-input rounded-lg p-3 font-mono text-xs text-text-secondary whitespace-pre-wrap max-h-64 overflow-auto">
                        {flipperOutput}
                      </div>
                    )}
                  </Card>
                </>
              )}
            </div>
          )}

          {/* ── Confirm Dialog for Testing ── */}
          <ConfirmDialog
            open={showConfirm}
            title="Test Exploit Harness in Kali Sandbox"
            message="This will submit the harness code to the running Kali container for safe testing. The harness only targets localhost. Continue?"
            onConfirm={async () => {
              setShowConfirm(false);
              if (testingId) {
                await rpc("republic.cyber.kali.researcher.test", { findingId: testingId });
                setTestingId(null);
                r4();
              }
            }}
            onCancel={() => { setShowConfirm(false); setTestingId(null); }}
          />
        </>
      )}
    </div>
  );
}
