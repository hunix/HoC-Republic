import {
  Crosshair,
  Terminal,
  FileText,
  Shield,
  Server,
  Eye,
  Radio,
  Trash2,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { Card, Button, Alert } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Target Scan Panel ────────────────────────────────────────────────────────

interface ScanSummary {
  openPorts: number;
  riskScore: number;
  riskLevel: "info" | "low" | "medium" | "high" | "critical";
  findings: string[];
  recommendations: string[];
}
interface ScanPortResult {
  port: number;
  service: string;
  open: boolean;
  latencyMs?: number;
}
interface ScanHttpResult {
  statusCode?: number;
  statusText?: string;
  latencyMs?: number;
  headers?: Record<string, string>;
  serverBanner?: string;
  contentType?: string;
}
interface ScanSslResult {
  valid: boolean;
  subject?: string;
  issuer?: string;
  daysRemaining?: number;
  expired?: boolean;
  selfSigned?: boolean;
  protocol?: string;
  cipher?: string;
  sans?: string[];
}
interface ScanHeaderResult {
  name: string;
  present: boolean;
  value?: string;
  severity: "info" | "low" | "medium" | "high";
  description: string;
}
interface ScanTechResult {
  server?: string;
  framework?: string;
  cdn?: string;
  waf?: string;
  cms?: string;
  detected: string[];
}
interface ScanRecord {
  id: string;
  target: string;
  host: string;
  protocol: string;
  status: "queued" | "running" | "done" | "error";
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  dns?: { hostname: string; addresses: string[]; mx?: string[]; txt?: string[]; cname?: string };
  ports?: ScanPortResult[];
  http?: ScanHttpResult;
  ssl?: ScanSslResult;
  securityHeaders?: ScanHeaderResult[];
  tech?: ScanTechResult;
  summary?: ScanSummary;
}

const SCAN_RISK_COLORS: Record<string, string> = {
  info: "text-info",
  low: "text-success",
  medium: "text-warning",
  high: "text-danger",
  critical: "text-danger",
};
const SCAN_SEV_COLORS: Record<string, string> = {
  high: "text-danger",
  medium: "text-warning",
  low: "text-info",
  info: "text-text-muted",
};

function TargetScanPanel() {
  const [target, setTarget] = useState("");
  const [scanning, setScanning] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [scanError, setScanError] = useState("");
  const [expandSection, setExpandSection] = useState<string | null>("summary");

  // Poll active scan every 2s while running
  const { data: pollData, refetch: pollRefetch } = useRpc<{
    ok: boolean;
    id?: string;
    status?: string;
    summary?: ScanSummary;
    completedAt?: string;
  }>("scan.status", { id: activeScanId ?? "" }, [activeScanId], { staleTimeMs: 0 });

  // Full results (only when done)
  const { data: resultsData, refetch: resultsRefetch } = useRpc<{ ok: boolean; scan?: ScanRecord }>(
    "scan.results",
    { id: activeScanId ?? "" },
    [activeScanId, pollData?.status],
    { staleTimeMs: 0 },
  );

  // Recent scans
  const { data: listData, refetch: listRefetch } = useRpc<{
    ok: boolean;
    scans?: Array<{
      id: string;
      target: string;
      status: string;
      riskLevel?: string;
      riskScore?: number;
      startedAt: string;
      durationMs?: number;
    }>;
  }>("scan.list", { limit: 10 }, [], { staleTimeMs: 10_000 });

  const scanStatus = pollData?.status as ScanRecord["status"] | undefined;
  const isRunning = scanStatus === "running" || scanStatus === "queued";
  const scan = resultsData?.scan;

  // Auto-poll while running
  if (isRunning) {
    setTimeout(() => {
      void pollRefetch();
      void resultsRefetch();
    }, 2000);
  }

  const handleScan = async () => {
    if (!target.trim()) {
      return;
    }
    setScanning(true);
    setScanError("");
    try {
      const res = (await rpc("scan.run", { target: target.trim() })) as {
        ok?: boolean;
        id?: string;
      };
      if (res?.id) {
        setActiveScanId(res.id);
        setExpandSection("summary");
        void pollRefetch();
        void listRefetch();
      }
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleDeleteScan = async (id: string) => {
    await rpc("scan.delete", { id });
    if (activeScanId === id) {
      setActiveScanId(null);
    }
    void listRefetch();
  };

  const toggle = (k: string) => setExpandSection((s) => (s === k ? null : k));
  const recentScans = listData?.scans ?? [];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Search bar */}
      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
          <Crosshair size={13} className="text-danger" /> Target Security Audit
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="https://example.com  or  192.168.1.1  or  api.mysite.com"
            className="flex-1 bg-bg-input border border-border/40 rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-danger/60 font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleScan();
              }
            }}
          />
          <Button
            variant="danger"
            onClick={() => void handleScan()}
            disabled={!target.trim() || scanning || isRunning}
          >
            {scanning || isRunning ? (
              <>
                <Zap size={13} className="mr-1.5 animate-pulse" />
                Scanning…
              </>
            ) : (
              <>
                <Crosshair size={13} className="mr-1.5" />
                Scan
              </>
            )}
          </Button>
        </div>
        {scanError && <p className="text-xs text-danger mt-2">{scanError}</p>}
        <p className="text-[10px] text-text-muted mt-2">
          Runs: DNS lookup · TCP port scan (25 ports) · HTTP/HTTPS probe · SSL cert · Security
          headers · Tech fingerprint
        </p>
      </Card>

      {/* Live scan progress */}
      {activeScanId && isRunning && (
        <Card>
          <div className="flex items-center gap-3">
            <Zap size={16} className="text-warning animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-text-heading">Scan in progress…</p>
              <p className="text-xs text-text-muted">
                Running DNS, port scan, HTTP probe, SSL analysis — polling every 2s
              </p>
            </div>
            <div className="ml-auto w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        </Card>
      )}

      {/* Results */}
      {scan && scanStatus === "done" && (
        <div className="space-y-3">
          {/* Summary / Risk Score */}
          {scan.summary && (
            <Card
              className={
                scan.summary.riskLevel === "critical" || scan.summary.riskLevel === "high"
                  ? "bg-danger-bg"
                  : scan.summary.riskLevel === "medium"
                    ? "bg-warning-bg"
                    : scan.summary.riskLevel === "low"
                      ? "bg-success-bg"
                      : "bg-info-bg"
              }
            >
              <div className="flex items-start gap-4">
                {/* Score ring */}
                <div className="relative w-20 h-20 shrink-0">
                  <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="30"
                      fill="none"
                      stroke="currentColor"
                      className="text-border/30"
                      strokeWidth="8"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="30"
                      fill="none"
                      strokeWidth="8"
                      className={SCAN_RISK_COLORS[scan.summary.riskLevel]}
                      stroke="currentColor"
                      strokeDasharray={`${(scan.summary.riskScore / 100) * 188.5} 188.5`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
                    <span
                      className={`text-xl font-black ${SCAN_RISK_COLORS[scan.summary.riskLevel]}`}
                    >
                      {scan.summary.riskScore}
                    </span>
                    <span className="text-[8px] text-text-muted uppercase font-bold tracking-wider">
                      risk
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-sm font-bold uppercase ${SCAN_RISK_COLORS[scan.summary.riskLevel]}`}
                    >
                      {scan.summary.riskLevel} risk
                    </span>
                    <span className="text-xs text-text-muted">
                      · {scan.host} ·{" "}
                      {scan.durationMs ? `${(scan.durationMs / 1000).toFixed(1)}s` : ""}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {scan.summary.findings.map((f, i) => (
                      <p key={i} className="text-xs text-text-secondary">
                        {f}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              {scan.summary.recommendations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/20">
                  <p className="text-[10px] font-bold uppercase text-text-muted mb-1.5">
                    Recommendations
                  </p>
                  <div className="space-y-1">
                    {scan.summary.recommendations.map((r, i) => (
                      <p key={i} className="text-xs text-text-secondary">
                        → {r}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* DNS */}
          {scan.dns && (
            <Card>
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => toggle("dns")}
              >
                <FileText size={12} className="text-info" />
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">
                  DNS Resolution
                </span>
                <span className="text-xs text-text-muted">{scan.dns.addresses.join(", ")}</span>
                {expandSection === "dns" ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              {expandSection === "dns" && (
                <div className="mt-3 space-y-1.5 text-xs">
                  <p>
                    <span className="text-text-muted">IPv4:</span>{" "}
                    <span className="font-mono text-text-primary">
                      {scan.dns.addresses.join(", ") || "none"}
                    </span>
                  </p>
                  {scan.dns.ipv6?.length ? (
                    <p>
                      <span className="text-text-muted">IPv6:</span>{" "}
                      <span className="font-mono text-text-primary">
                        {scan.dns.ipv6.join(", ")}
                      </span>
                    </p>
                  ) : null}
                  {scan.dns.cname && (
                    <p>
                      <span className="text-text-muted">CNAME:</span>{" "}
                      <span className="font-mono text-text-primary">{scan.dns.cname}</span>
                    </p>
                  )}
                  {scan.dns.mx?.length ? (
                    <p>
                      <span className="text-text-muted">MX:</span>{" "}
                      <span className="font-mono text-text-primary">{scan.dns.mx.join(" | ")}</span>
                    </p>
                  ) : null}
                  {scan.dns.txt?.length ? (
                    <p>
                      <span className="text-text-muted">TXT:</span>{" "}
                      <span className="font-mono text-text-primary text-[10px]">
                        {scan.dns.txt.slice(0, 3).join(" · ")}
                      </span>
                    </p>
                  ) : null}
                </div>
              )}
            </Card>
          )}

          {/* Ports */}
          {scan.ports && (
            <Card>
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => toggle("ports")}
              >
                <Server size={12} className="text-warning" />
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">
                  Port Scan
                </span>
                <span className="text-xs text-text-muted">
                  {scan.ports.filter((p) => p.open).length} open / {scan.ports.length} scanned
                </span>
                {expandSection === "ports" ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              {expandSection === "ports" && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {scan.ports
                    .filter((p) => p.open)
                    .map((p) => (
                      <div
                        key={p.port}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-danger-bg"
                      >
                        <div className="w-2 h-2 rounded-full bg-danger" />
                        <span className="font-mono text-xs text-danger">{p.port}</span>
                        <span className="text-[10px] text-text-muted">{p.service}</span>
                        {p.latencyMs && (
                          <span className="text-[9px] text-text-muted ml-auto">
                            {p.latencyMs}ms
                          </span>
                        )}
                      </div>
                    ))}
                  {scan.ports
                    .filter((p) => !p.open)
                    .slice(0, 6)
                    .map((p) => (
                      <div
                        key={p.port}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-bg-input opacity-40"
                      >
                        <div className="w-2 h-2 rounded-full bg-text-muted" />
                        <span className="font-mono text-xs text-text-muted">{p.port}</span>
                        <span className="text-[10px] text-text-muted">{p.service}</span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          )}

          {/* HTTP */}
          {scan.http && (
            <Card>
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => toggle("http")}
              >
                <Radio size={12} className="text-accent" />
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">
                  HTTP Response
                </span>
                <span className="text-xs text-text-muted">
                  {scan.http.statusCode} {scan.http.statusText} · {scan.http.latencyMs}ms
                </span>
                {expandSection === "http" ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              {expandSection === "http" && scan.http.headers && (
                <div className="mt-3 max-h-52 overflow-y-auto space-y-1">
                  {Object.entries(scan.http.headers).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="text-text-muted font-mono shrink-0 w-40 truncate">{k}:</span>
                      <span className="text-text-secondary font-mono truncate">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* SSL */}
          {scan.ssl && (
            <Card>
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => toggle("ssl")}
              >
                <Shield size={12} className={scan.ssl.valid ? "text-success" : "text-danger"} />
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">
                  SSL / TLS Certificate
                </span>
                <span
                  className={`text-xs font-bold ${scan.ssl.expired ? "text-danger" : scan.ssl.daysRemaining !== undefined && scan.ssl.daysRemaining < 30 ? "text-warning" : "text-success"}`}
                >
                  {scan.ssl.expired
                    ? "EXPIRED"
                    : scan.ssl.daysRemaining !== undefined
                      ? `${scan.ssl.daysRemaining}d left`
                      : "Unknown"}
                </span>
                {expandSection === "ssl" ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              {expandSection === "ssl" && (
                <div className="mt-3 space-y-1.5 text-xs">
                  <p>
                    <span className="text-text-muted">Subject:</span>{" "}
                    <span className="font-mono">{scan.ssl.subject}</span>
                  </p>
                  <p>
                    <span className="text-text-muted">Issuer:</span>{" "}
                    <span className="font-mono">{scan.ssl.issuer}</span>
                  </p>
                  <p>
                    <span className="text-text-muted">Protocol:</span>{" "}
                    <span className="font-mono">{scan.ssl.protocol}</span>
                  </p>
                  <p>
                    <span className="text-text-muted">Cipher:</span>{" "}
                    <span className="font-mono">{scan.ssl.cipher}</span>
                  </p>
                  {scan.ssl.selfSigned && (
                    <p className="text-warning font-semibold">⚠️ Self-signed certificate</p>
                  )}
                  {scan.ssl.sans?.length && (
                    <p>
                      <span className="text-text-muted">SANs:</span>{" "}
                      <span className="font-mono text-[10px]">
                        {scan.ssl.sans.slice(0, 5).join(", ")}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Security headers */}
          {scan.securityHeaders && (
            <Card>
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => toggle("headers")}
              >
                <Eye size={12} className="text-purple-400" />
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">
                  Security Headers
                </span>
                <span className="text-xs text-text-muted">
                  {scan.securityHeaders.filter((h) => h.present).length}/
                  {scan.securityHeaders.length} present
                </span>
                {expandSection === "headers" ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )}
              </button>
              {expandSection === "headers" && (
                <div className="mt-3 space-y-2">
                  {scan.securityHeaders.map((h) => (
                    <div key={h.name} className="flex items-start gap-2.5">
                      <div
                        className={`w-2 h-2 rounded-full mt-1 shrink-0 ${h.present ? "bg-success" : "bg-danger"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-text-primary">{h.name}</span>
                          <span
                            className={`text-[9px] uppercase font-bold ${SCAN_SEV_COLORS[h.severity]}`}
                          >
                            {h.severity}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted">{h.description}</p>
                        {h.present && h.value && (
                          <p className="text-[10px] font-mono text-text-secondary truncate">
                            {h.value}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Tech fingerprint */}
          {scan.tech && scan.tech.detected.length > 0 && (
            <Card>
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => toggle("tech")}
              >
                <Terminal size={12} className="text-accent" />
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">
                  Technology Fingerprint
                </span>
                <span className="text-xs text-text-muted">
                  {scan.tech.detected.slice(0, 3).join(", ")}
                </span>
                {expandSection === "tech" ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              {expandSection === "tech" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {scan.tech.detected.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent font-medium"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Error state */}
      {activeScanId && scanStatus === "error" && (
        <Alert variant="danger">
          Scan error:{" "}
          {pollData && "error" in pollData
            ? String((pollData as { error?: string }).error)
            : "unknown error"}
        </Alert>
      )}

      {/* Recent scans history */}
      {recentScans.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <FileText size={11} /> Recent Scans
          </p>
          <div className="space-y-1.5">
            {recentScans.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-input cursor-pointer transition-colors"
                onClick={() => {
                  setActiveScanId(s.id);
                  setExpandSection("summary");
                  void pollRefetch();
                }}
              >
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    s.status === "done"
                      ? s.riskLevel === "critical" || s.riskLevel === "high"
                        ? "bg-danger"
                        : s.riskLevel === "medium"
                          ? "bg-warning"
                          : "bg-success"
                      : s.status === "running"
                        ? "bg-warning animate-pulse"
                        : s.status === "error"
                          ? "bg-danger"
                          : "bg-text-muted"
                  }`}
                />
                <span className="text-xs font-mono text-text-secondary flex-1 truncate">
                  {s.target}
                </span>
                {s.riskScore !== undefined && (
                  <span
                    className={`text-xs font-bold ${s.riskLevel ? SCAN_RISK_COLORS[s.riskLevel] : "text-text-muted"}`}
                  >
                    {s.riskScore}
                  </span>
                )}
                <span className="text-[10px] text-text-muted">{s.status}</span>
                <button
                  type="button"
                  aria-label="Delete scan"
                  className="text-text-muted hover:text-danger transition-colors ml-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteScan(s.id);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export { TargetScanPanel };
