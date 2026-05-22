import { Shield, Target } from "lucide-react";
/**
 * SecurityStudio — Full-featured panels for:
 *   BlackEye (phishing awareness simulator), PentAGI (red team / pentest)
 */
import { useState, useRef, useEffect } from "react";
import { Card, Button, Alert } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";
import { PluginStudioLayout, type StudioPlugin } from "./PluginStudioLayout";

// ── BlackEye — Phishing Awareness Simulator ──

const BLACKEYE_MODELS = [
  {
    id: "blackeye-runtime",
    name: "BlackEye Runtime",
    sizeGb: 0.0,
    description: "No model required — template-based simulator",
    downloaded: true,
    required: true,
  },
];

const PHISHING_TEMPLATES = [
  "github",
  "google",
  "linkedin",
  "facebook",
  "instagram",
  "twitter",
  "microsoft",
  "apple",
  "netflix",
  "dropbox",
  "yahoo",
  "adobe",
  "paypal",
  "amazon",
  "spotify",
  "slack",
  "zoom",
  "discord",
  "steam",
  "gitlab",
];

function BlackEyePanel() {
  const [template, setTemplate] = useState("github");
  const [campaignName, setCampaignName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    campaignId?: string;
    url?: string;
    template?: string;
    error?: string;
  } | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function launch() {
    if (!template) { return; }
    setLoading(true);
    setError("");
    setResult(null);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "blackeye.launch-campaign",
        params: {
          templateId: template,
          name: campaignName || `${template} Sim`,
        },
      })) as { result?: { campaignId?: string; url?: string; template?: string } };
      setResult(r?.result ?? {});
      if (r?.result?.campaignId) { setAnalysisTarget(r.result.campaignId); }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "blackeye.launch-campaign", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "blackeye.launch-campaign", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    if (!analysisTarget.trim()) { return; }
    setAnalysisLoading(true);
    setAnalysisResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "blackeye.analyze-campaign",
        params: { campaignId: analysisTarget },
      })) as { result?: unknown };
      setAnalysisResult(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "blackeye.analyze-campaign", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setAnalysisResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "blackeye.analyze-campaign", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setAnalysisLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-blackeye"
      displayName="BlackEye — Phishing Awareness"
      description="Security awareness training platform that simulates phishing campaigns using 38 realistic site templates. Citizens run social engineering defence drills (localhost-only, no real credential capture)."
      models={BLACKEYE_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="info">
          BlackEye runs phishing simulations on localhost:4200 for training purposes only. No real
          credentials are captured or transmitted.
        </Alert>

        {/* Template Picker */}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Phishing Template
          </label>
          <div className="flex flex-wrap gap-1">
            {PHISHING_TEMPLATES.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTemplate(t)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  template === t
                    ? "bg-accent text-white"
                    : "bg-bg-secondary text-text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Card>

        {/* Campaign Name */}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-1">
            Campaign Name (optional)
          </label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g. Q1 Security Training"
            className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </Card>

        {error && <Alert variant="danger">{error}</Alert>}

        <Button
          onClick={() => void launch()}
          loading={loading}
          icon={<Shield size={14} />}
          className="w-full"
        >
          Launch Phishing Simulation
        </Button>

        {/* Campaign Result */}
        {result?.url && (
          <Card>
            <p className="text-xs font-semibold text-success mb-2">
              ✅ Campaign Live — {result.template}
            </p>
            <p className="text-xs text-text-muted mb-1">Campaign ID:</p>
            <code className="text-xs font-mono text-accent block mb-2">{result.campaignId}</code>
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent hover:underline"
            >
              ↗ Open Simulation Page
            </a>
          </Card>
        )}

        {/* Analysis Section */}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Analyze Campaign Results
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={analysisTarget}
              onChange={(e) => setAnalysisTarget(e.target.value)}
              placeholder="Campaign ID"
              className="flex-1 bg-bg-input border border-border rounded-xl px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void analyze()}
              loading={analysisLoading}
              disabled={!analysisTarget.trim()}
            >
              Analyze
            </Button>
          </div>
        </Card>

        {analysisResult && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Analysis Results</p>
            <pre className="text-xs text-text-secondary font-mono overflow-auto max-h-64 whitespace-pre-wrap">
              {analysisResult}
            </pre>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── PentAGI — Red Team / Penetration Testing ──

const PENTAGI_MODELS = [
  {
    id: "pentagi-runtime",
    name: "PentAGI Runtime",
    sizeGb: 0.0,
    description: "Docker-based — no local model required",
    downloaded: true,
    required: true,
  },
];

const SCAN_DEPTHS = ["reconnaissance", "standard", "deep"];

const PENTAGI_TOOLS = [
  "nmap",
  "metasploit",
  "sqlmap",
  "gobuster",
  "ffuf",
  "nikto",
  "nuclei",
  "wfuzz",
  "burpsuite",
  "amass",
  "subfinder",
  "httpx",
  "dirsearch",
  "hydra",
  "john",
];

function PentAGIPanel() {
  const [target, setTarget] = useState("");
  const [objectives, setObjectives] = useState("");
  const [depth, setDepth] = useState("standard");
  const [loading, setLoading] = useState(false);
  const [flowId, setFlowId] = useState("");
  const [statusResult, setStatusResult] = useState("");
  const [reportResult, setReportResult] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [statusResult, reportResult]);

  async function launchScan() {
    if (!target.trim() || !objectives.trim()) { return; }
    setLoading(true);
    setError("");
    setFlowId("");
    setStatusResult("");
    setReportResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "pentagi.launch-scan",
        params: { target, objectives, depth },
      })) as { result?: { id?: string; flowId?: string } };
      const id = r?.result?.flowId ?? r?.result?.id ?? "";
      setFlowId(id);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "pentagi.launch-scan", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "pentagi.launch-scan", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus() {
    if (!flowId) { return; }
    setStatusLoading(true);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "pentagi.scan-status",
        params: { flow_id: flowId },
      })) as { result?: unknown };
      setStatusResult(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "pentagi.scan-status", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setStatusResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "pentagi.scan-status", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setStatusLoading(false);
    }
  }

  async function getReport() {
    if (!flowId) { return; }
    setReportLoading(true);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "pentagi.get-report",
        params: { flow_id: flowId },
      })) as { result?: unknown };
      setReportResult(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "pentagi.get-report", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setReportResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "pentagi.get-report", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-pentagi"
      displayName="PentAGI Red Team"
      description="Autonomous AI penetration testing with 20+ tools (nmap, metasploit, sqlmap, etc.) running in a Docker sandbox. Launch security scans, track real-time agent output, and receive vulnerability reports."
      models={PENTAGI_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="warning">
          PentAGI requires Docker and runs isolated pentest operations. Only scan targets you own or
          have explicit permission to test.
        </Alert>

        {/* Target */}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Target URL / IP / Domain
          </label>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. http://192.168.1.100 or testsite.local"
            className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </Card>

        {/* Objectives */}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Objectives / Attack Scope
          </label>
          <textarea
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            rows={3}
            placeholder="e.g. Find SQL injection, XSS, open ports, misconfigured services, credential exposure..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {/* Depth */}
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Scan Depth</label>
            {SCAN_DEPTHS.map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => setDepth(d)}
                className={`block w-full mb-1 py-1.5 px-2 rounded-lg text-xs text-left font-medium transition-colors ${
                  depth === d
                    ? "bg-accent text-white"
                    : "bg-bg-secondary text-text-muted"
                }`}
              >
                {d}
              </button>
            ))}
          </Card>

          {/* Tools Reference */}
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Available Tools
            </label>
            <div className="flex flex-wrap gap-1">
              {PENTAGI_TOOLS.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 rounded bg-bg-secondary text-[10px] font-mono text-text-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </Card>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Button
          onClick={() => void launchScan()}
          loading={loading}
          icon={<Target size={14} />}
          className="w-full"
          disabled={!target.trim() || !objectives.trim()}
        >
          Launch Security Scan
        </Button>

        {/* Flow tracking */}
        {flowId && (
          <Card>
            <p className="text-xs font-semibold text-success mb-2">✅ Scan Launched</p>
            <p className="text-xs text-text-muted mb-1">Flow ID:</p>
            <code className="text-xs font-mono text-accent block mb-3">{flowId}</code>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void checkStatus()}
                loading={statusLoading}
              >
                Check Status
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void getReport()}
                loading={reportLoading}
              >
                Get Report
              </Button>
            </div>
          </Card>
        )}

        {statusResult && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Scan Status</p>
            <div ref={logRef} className="bg-bg-input rounded-xl p-3 max-h-48 overflow-y-auto">
              <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap">
                {statusResult}
              </pre>
            </div>
          </Card>
        )}

        {reportResult && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Vulnerability Report</p>
            <pre className="text-xs font-mono text-text-secondary overflow-auto max-h-64 whitespace-pre-wrap">
              {reportResult}
            </pre>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ─── Layout ───────────────────────────────────────────────────────

const SECURITY_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-blackeye",
    name: "BlackEye",
    icon: "🎣",
    description: "Phishing awareness simulator — 38 templates, campaign analytics",
    status: "active",
  },
  {
    id: "hoc-plugin-pentagi",
    name: "PentAGI",
    icon: "🔴",
    description: "Autonomous AI red team — nmap, metasploit, sqlmap, Docker sandbox",
    status: "active",
  },
];

function renderSecurityPanel(id: string) {
  switch (id) {
    case "hoc-plugin-blackeye":
      return <BlackEyePanel />;
    case "hoc-plugin-pentagi":
      return <PentAGIPanel />;
    default:
      return null;
  }
}

export function SecurityStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Security Studio"
      categoryIcon={<Shield size={16} />}
      plugins={SECURITY_PLUGINS}
      renderPanel={renderSecurityPanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
