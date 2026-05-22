import {
  Fish,
  AlertTriangle,
  BarChart2,
  ChevronDown,
  ChevronRight,
  // oxlint-disable-next-line no-unused-vars
  Play,
  Trash2,
  // oxlint-disable-next-line no-unused-vars
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── BlackEye Phishing Sim Panel ──────────────────────────────────────────────

interface PhishingTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  difficulty: "easy" | "medium" | "hard";
  description: string;
}

interface PhishingCampaign {
  id: string;
  name: string;
  templateId: string;
  citizenId: string;
  status: "created" | "active" | "stopped";
  url: string;
  createdAt: string;
  stats: {
    views: number;
    submissions: number;
    detected: number;
    clickThroughRate: number;
    submissionRate: number;
    detectionRate: number;
  };
}

const DIFF_VARIANT: Record<string, string> = {
  easy: "text-success",
  medium: "text-warning",
  hard: "text-danger",
};
const CAT_ICONS: Record<string, string> = {
  social: "👥",
  email: "📧",
  finance: "💳",
  gaming: "🎮",
  cloud: "☁️",
  shopping: "🛍️",
};

function PhishingSimPanel() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [expandResults, setExpandResults] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");

  const { data: statusData } = useRpc<{
    ok: boolean;
    serverRunning?: boolean;
    templateCount?: number;
    activeCampaigns?: number;
  }>("blackeye.status", {}, [], { staleTimeMs: 15_000 });

  const { data: templatesData } = useRpc<{ ok: boolean; templates?: PhishingTemplate[] }>(
    "blackeye.templates.list",
    {},
    [],
    { staleTimeMs: 60_000 },
  );

  const { data: campaignsData, refetch: refetchCampaigns } = useRpc<{
    ok: boolean;
    campaigns?: PhishingCampaign[];
  }>("blackeye.campaign.list", {}, [], { staleTimeMs: 8_000 });

  const templates = templatesData?.templates ?? [];
  const campaigns = campaignsData?.campaigns ?? [];
  const categories = ["all", ...Array.from(new Set(templates.map((t) => t.category)))];
  const filtered =
    catFilter === "all" ? templates : templates.filter((t) => t.category === catFilter);
  const tpl = templates.find((t) => t.id === selectedTemplate);

  const handleLaunch = async () => {
    if (!selectedTemplate) {
      return;
    }
    setLaunching(true);
    setLaunchError("");
    try {
      const res = (await rpc("blackeye.campaign.create", {
        templateId: selectedTemplate,
        name: campaignName.trim() || `${tpl?.name ?? selectedTemplate} Training`,
        citizenId: "operator",
      })) as { ok?: boolean; campaign?: PhishingCampaign };
      if (res?.campaign) {
        await rpc("blackeye.campaign.start", { id: res.campaign.id });
        setCampaignName("");
        setSelectedTemplate(null);
        refetchCampaigns();
      }
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  };

  const handleStop = async (id: string) => {
    await rpc("blackeye.campaign.stop", { id });
    refetchCampaigns();
  };

  const handleDelete = async (id: string) => {
    await rpc("blackeye.campaign.delete", { id });
    refetchCampaigns();
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header banner */}
      <Card>
        <div className="flex items-center gap-3">
          <Fish size={20} className="text-danger shrink-0" />
          <div>
            <p className="font-semibold text-sm text-text-heading">
              BlackEye — Phishing Awareness Simulator
            </p>
            <p className="text-xs text-text-muted">
              Localhost-only training environment · No real credentials stored · 41 platform
              templates
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${statusData?.serverRunning ? "bg-success animate-pulse" : "bg-text-muted"}`}
            />
            <span className="text-xs text-text-muted">
              {statusData?.serverRunning ? `${statusData.activeCampaigns ?? 0} active` : "Idle"}
            </span>
          </div>
        </div>
      </Card>

      {/* Template gallery */}
      <Card>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">
            Template Gallery ({templates.length})
          </p>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${catFilter === c ? "bg-danger text-white" : "bg-bg-secondary text-text-muted hover:bg-bg-card"}`}
            >
              {c === "all" ? "All" : `${CAT_ICONS[c] ?? ""} ${c}`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTemplate(t.id === selectedTemplate ? null : t.id)}
              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all text-center ${
                selectedTemplate === t.id
                  ? "border-danger bg-danger/10"
                  : "border-border/30 hover:border-border hover:bg-bg-secondary"
              }`}
            >
              <span className="text-2xl leading-none">{t.icon}</span>
              <span className="text-[11px] font-semibold text-text-primary leading-tight">
                {t.name}
              </span>
              <span className={`text-[9px] font-bold uppercase ${DIFF_VARIANT[t.difficulty]}`}>
                {t.difficulty}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Launch panel — only shown when template selected */}
      {selectedTemplate && tpl && (
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{tpl.icon}</span>
            <div>
              <p className="font-semibold text-sm text-text-heading">{tpl.name} Simulation</p>
              <p className="text-xs text-text-muted">{tpl.description}</p>
            </div>
          </div>
          {launchError && <div className="text-xs text-danger mb-3">{launchError}</div>}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={`Campaign name (default: "${tpl.name} Training")`}
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="flex-1 bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-danger/60"
            />
            <Button variant="danger" onClick={() => void handleLaunch()} disabled={launching}>
              <Fish size={13} className="mr-1.5" />
              {launching ? "Launching…" : "Launch Sim"}
            </Button>
          </div>
          <div className="flex items-start gap-2 mt-3 p-2.5 bg-warning-bg rounded-lg">
            <AlertTriangle size={13} className="text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-text-secondary">
              This creates a <strong>localhost:4200/sim/…</strong> page — sandboxed, no real
              credentials captured. Share the URL with citizens to test their phishing awareness.
            </p>
          </div>
        </Card>
      )}

      {/* Active & recent campaigns */}
      {campaigns.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart2 size={12} /> Campaigns ({campaigns.length})
          </p>
          <div className="space-y-2">
            {campaigns.map((c) => {
              const template = templates.find((t) => t.id === c.templateId);
              const open = expandResults === c.id;
              return (
                <div key={c.id} className="border border-border/20 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <span className="text-xl">{template?.icon ?? "🎣"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-heading truncate">{c.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${c.status === "active" ? "bg-success/20 text-success" : c.status === "stopped" ? "bg-text-muted/10 text-text-muted" : "bg-info/10 text-info"}`}
                        >
                          {c.status}
                        </span>
                        {c.status === "active" && (
                          <code className="text-[10px] font-mono text-accent bg-accent/10 px-1 rounded truncate max-w-[180px]">
                            {c.url}
                          </code>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        aria-label="Toggle results"
                        className="text-text-muted hover:text-text-primary transition-colors"
                        onClick={() => setExpandResults(open ? null : c.id)}
                      >
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {c.status === "active" && (
                        <Button
                          variant="warning"
                          size="sm"
                          onClick={() => void handleStop(c.id)}
                          aria-label="Stop campaign"
                        >
                          Stop
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDelete(c.id)}
                        aria-label="Delete campaign"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded results */}
                  {open && (
                    <div className="px-4 pb-4 pt-0 bg-bg-secondary/50">
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        <div className="text-center">
                          <p className="text-xl font-bold text-text-heading">{c.stats.views}</p>
                          <p className="text-[10px] text-text-muted">Page Views</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-danger">
                            {Math.round(c.stats.submissionRate * 100)}%
                          </p>
                          <p className="text-[10px] text-text-muted">Submission Rate</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-success">
                            {Math.round(c.stats.detectionRate * 100)}%
                          </p>
                          <p className="text-[10px] text-text-muted">Detection Rate</p>
                        </div>
                      </div>
                      <div className="mt-3 p-2 bg-bg-input rounded-lg text-xs text-text-muted text-center">
                        {c.stats.submissionRate > 0.5
                          ? "🚨 High risk — most users submitted credentials. Urgent training needed."
                          : c.stats.views === 0
                            ? "No visits yet — share the campaign URL to run the simulation."
                            : c.stats.detectionRate > 0.7
                              ? "✅ Excellent — most citizens detected the phish!"
                              : "📊 Moderate — consider scheduling a phishing awareness workshop."}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {campaigns.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-text-muted">
          <Fish size={24} className="opacity-40" />
          <p className="text-sm">
            No campaigns yet — pick a template above and launch your first simulation.
          </p>
        </div>
      )}
    </div>
  );
}

export { PhishingSimPanel };
