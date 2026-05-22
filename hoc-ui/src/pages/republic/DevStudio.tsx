import { useState, useMemo } from "react";
import {
  Server, CheckCircle, XCircle, AlertCircle, Package, Rocket, Code2,
  Search, Copy, ExternalLink, RefreshCw, Terminal, Globe, Database,
  Cpu, GitBranch, Zap, ChevronRight, Clock
} from "lucide-react";
import { useRpc, rpc } from "@/lib/rpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import { RpcStatus } from "@/components/ui/RpcStatus";
import { Alert } from "@/components/ui/Alert";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolInfo {
  name: string;
  displayName: string;
  category: string;
  status: "present" | "missing" | "outdated";
  version: string | null;
  installCommand: string;
  docs: string;
  description: string;
}

interface RuntimeReport {
  tools: ToolInfo[];
  ready: boolean;
  missing: string[];
  warnings: string[];
  nodeVersion: string | null;
  pnpmVersion: string | null;
  gitVersion: string | null;
  checkedAt: string;
}

interface LibraryEntry {
  name: string;
  displayName: string;
  domain: string;
  description: string;
  install: string;
  docs: string;
  weekly?: string;
  tags: string[];
  reactOnly?: boolean;
  backendOnly?: boolean;
}

interface LibraryDomain {
  id: string;
  label: string;
  description: string;
  icon: string;
  count: number;
}

interface CatalogStats {
  totalDomains: number;
  totalPackages: number;
  reactPackages: number;
  serverPackages: number;
}

interface DeploymentRecord {
  id: string;
  platform: string;
  projectName: string;
  status: "queued" | "building" | "deploying" | "live" | "failed" | "skipped";
  url: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  environment: "preview" | "production";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  runtime: <Cpu className="w-4 h-4" />,
  "package-manager": <Package className="w-4 h-4" />,
  vcs: <GitBranch className="w-4 h-4" />,
  deployment: <Rocket className="w-4 h-4" />,
  compiler: <Code2 className="w-4 h-4" />,
  database: <Database className="w-4 h-4" />,
  container: <Server className="w-4 h-4" />,
};

const PLATFORM_COLORS: Record<string, string> = {
  vercel: "from-slate-800 to-slate-900",
  railway: "from-purple-900 to-purple-800",
  netlify: "from-teal-900 to-teal-800",
  fly: "from-blue-900 to-blue-800",
  cloudflare: "from-orange-900 to-orange-800",
};

function StatusIcon({ status }: { status: ToolInfo["status"] }) {
  if (status === "present") { return <CheckCircle className="w-4 h-4 text-success" />; }
  if (status === "outdated") { return <AlertCircle className="w-4 h-4 text-warning" />; }
  return <XCircle className="w-4 h-4 text-danger" />;
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) { return "just now"; }
  if (m < 60) { return `${m}m ago`; }
  return `${Math.floor(m / 60)}h ago`;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: ToolInfo }) {
  const bgClass = tool.status === "present"
    ? "border-border"
    : tool.status === "outdated"
    ? "border-warning/30 bg-warning-bg"
    : "border-danger/30 bg-danger-bg";

  return (
    <div className={`p-3 rounded-lg border ${bgClass} flex items-start gap-3`}>
      <div className="mt-0.5 text-text-muted">{CATEGORY_ICONS[tool.category] ?? <Terminal className="w-4 h-4" />}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <StatusIcon status={tool.status} />
          <span className="text-text-heading text-sm font-medium">{tool.displayName}</span>
          {tool.version && (
            <Badge variant="neutral">v{tool.version}</Badge>
          )}
        </div>
        <p className="text-text-muted text-xs mt-1 line-clamp-2">{tool.description}</p>
        {tool.status !== "present" && (
          <button
            className="mt-1.5 flex items-center gap-1 text-xs text-accent hover:text-accent/80"
            onClick={() => copyToClipboard(tool.installCommand)}
            aria-label={`Copy install command for ${tool.displayName}`}
          >
            <Copy className="w-3 h-3" />
            <code className="font-mono">{tool.installCommand}</code>
          </button>
        )}
      </div>
    </div>
  );
}

function LibraryCard({ pkg }: { pkg: LibraryEntry }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-bg-card hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text-heading text-sm font-semibold">{pkg.displayName}</span>
            {pkg.reactOnly && <Badge variant="info">React</Badge>}
            {pkg.backendOnly && <Badge variant="purple">Server</Badge>}
            {pkg.weekly && <span className="text-text-muted text-xs">~{pkg.weekly}/wk</span>}
          </div>
          <p className="text-text-muted text-xs mt-1 line-clamp-2">{pkg.description}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {pkg.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-bg-secondary text-text-muted">{t}</span>
            ))}
          </div>
        </div>
        <a href={pkg.docs} target="_blank" rel="noreferrer" aria-label="Docs" className="text-text-muted hover:text-accent mt-0.5">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <code className="text-xs text-accent bg-bg-secondary px-2 py-0.5 rounded font-mono flex-1 truncate">{pkg.install}</code>
        <button
          className="text-text-muted hover:text-text-primary ml-1"
          onClick={() => copyToClipboard(pkg.install)}
          aria-label={`Copy install command for ${pkg.name}`}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function DeploymentRow({ dep }: { dep: DeploymentRecord }) {
  const statusVariant = dep.status === "live" ? "success"
    : dep.status === "failed" ? "danger"
    : dep.status === "skipped" ? "warning"
    : "info";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-bg-card hover:border-border-hover transition-colors">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${PLATFORM_COLORS[dep.platform] ?? "from-bg-secondary to-bg-card"} flex items-center justify-center`}>
        <Globe className="w-4 h-4 text-text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-text-heading text-sm font-medium truncate">{dep.projectName}</span>
          <Badge variant={statusVariant}>{dep.status}</Badge>
          <Badge variant="neutral">{dep.environment}</Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-text-muted text-xs capitalize">{dep.platform}</span>
          <span className="text-text-muted text-xs">·</span>
          <Clock className="w-3 h-3 text-text-muted" />
          <span className="text-text-muted text-xs">{timeAgo(dep.startedAt)}</span>
          {dep.error && <span className="text-danger text-xs truncate ml-1">{dep.error.slice(0, 60)}</span>}
        </div>
      </div>
      {dep.url && (
        <a href={dep.url} target="_blank" rel="noreferrer" aria-label="Open deployed URL">
          <ExternalLink className="w-4 h-4 text-accent" />
        </a>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DevStudioPage() {
  const [activeTab, setActiveTab] = useState("runtime");
  const [libraryDomain, setLibraryDomain] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [checkingRuntime, setCheckingRuntime] = useState(false);

  const { data: runtimeData, loading: runtimeLoading, error: runtimeError, refetch: refetchRuntime } =
    useRpc<RuntimeReport>("republic.devstudio.runtime.check", {}, []);

  const { data: domainsData, loading: domainsLoading, error: domainsError } =
    useRpc<{ domains: LibraryDomain[] }>("republic.devstudio.libraries.domains", {}, []);

  const { data: libraryData, loading: libLoading } =
    useRpc<{ packages: LibraryEntry[] }>(
      libraryDomain ? "republic.devstudio.libraries.list" : "republic.devstudio.libraries.all",
      libraryDomain ? { domainId: libraryDomain } : {},
      [libraryDomain]
    );

  const { data: deploymentsData, loading: deploymentsLoading, refetch: refetchDeploys } =
    useRpc<{ deployments: DeploymentRecord[] }>("republic.devstudio.deploy.list", {}, []);

  const { data: catalogStats } =
    useRpc<CatalogStats>("republic.devstudio.libraries.stats", {}, []);

  const allPackages = (libraryData as { packages?: LibraryEntry[] } | null)?.packages ?? [];
  const filteredPackages = useMemo(() => {
    if (!librarySearch) { return allPackages; }
    const q = librarySearch.toLowerCase();
    return allPackages.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.displayName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.includes(q))
    );
  }, [allPackages, librarySearch]);

  const tools = runtimeData?.tools ?? [];
  const present = tools.filter((t) => t.status === "present");
  const missing = tools.filter((t) => t.status !== "present");
  const byCategory = useMemo(() => {
    const m = new Map<string, ToolInfo[]>();
    for (const tool of tools) {
      if (!m.has(tool.category)) { m.set(tool.category, []); }
      m.get(tool.category)!.push(tool);
    }
    return m;
  }, [tools]);

  const handleRecheckRuntime = async () => {
    setCheckingRuntime(true);
    await rpc("republic.devstudio.runtime.check", { force: true });
    refetchRuntime();
    setCheckingRuntime(false);
  };

  const tabs = [
    { id: "runtime", label: "Runtime Health" },
    { id: "libraries", label: "Library Browser" },
    { id: "deployments", label: "Deployments" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="DevStudio"
        description="Citizen full-stack development environment — runtime health, library catalog, and deployment management"
        icon={<Code2 className="w-6 h-6 text-accent" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRecheckRuntime()}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingRuntime ? "animate-spin" : ""}`} />
            Re-check Runtime
          </Button>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Tools Present"
          value={`${present.length} / ${tools.length}`}
          icon={<CheckCircle className="w-5 h-5" />}
          sub={runtimeData?.ready ? "All critical tools ready" : `${missing.length} tools missing`}
        />
        <StatCard
          label="Node.js"
          value={runtimeData?.nodeVersion ? `v${runtimeData.nodeVersion}` : "—"}
          icon={<Server className="w-5 h-5" />}
          sub="JavaScript runtime"
        />
        <StatCard
          label="npm Packages"
          value={catalogStats?.totalPackages ?? "—"}
          icon={<Package className="w-5 h-5" />}
          sub={`${catalogStats?.totalDomains ?? 0} domains`}
        />
        <StatCard
          label="Deployments"
          value={deploymentsData?.deployments?.length ?? 0}
          icon={<Rocket className="w-5 h-5" />}
          sub={`${deploymentsData?.deployments?.filter((d) => d.status === "live").length ?? 0} live`}
        />
      </div>

      {runtimeData && !runtimeData.ready && (
        <Alert variant="warning">
          Critical tools missing: <strong>{runtimeData.missing.join(", ")}</strong>.
          Citizens cannot build production systems until these are installed.
        </Alert>
      )}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ─── Runtime Health Tab ─────────────────────────────────────── */}
      {activeTab === "runtime" && (
        <div className="space-y-4">
          <RpcStatus loading={runtimeLoading} error={runtimeError} onRetry={refetchRuntime} />
          {runtimeData && (
            <>
              {runtimeData.warnings.length > 0 && (
                <Alert variant="warning">{runtimeData.warnings.join(" · ")}</Alert>
              )}
              {[...byCategory.entries()].map(([category, catTools]) => (
                <Card key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-text-muted">{CATEGORY_ICONS[category] ?? <Terminal className="w-4 h-4" />}</span>
                    <h3 className="text-text-heading font-semibold text-sm capitalize">{category.replace("-", " ")}</h3>
                    <Badge variant={catTools.every((t) => t.status === "present") ? "success" : "warning"}>
                      {catTools.filter((t) => t.status === "present").length}/{catTools.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {catTools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* ─── Library Browser Tab ────────────────────────────────────── */}
      {activeTab === "libraries" && (
        <div className="space-y-4">
          <RpcStatus loading={domainsLoading} error={domainsError} onRetry={() => {}} />

          {/* Domain pills */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-accent" />
              <h3 className="text-text-heading font-semibold text-sm">Domains</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setLibraryDomain(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  libraryDomain === null
                    ? "bg-accent text-white"
                    : "bg-bg-secondary text-text-secondary hover:bg-bg-card"
                }`}
              >
                All ({catalogStats?.totalPackages ?? "?"})
              </button>
              {(domainsData?.domains ?? []).map((d) => (
                <button
                  key={d.id}
                  onClick={() => setLibraryDomain(d.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    libraryDomain === d.id
                      ? "bg-accent text-white"
                      : "bg-bg-secondary text-text-secondary hover:bg-bg-card"
                  }`}
                >
                  {d.icon} {d.label} ({d.count})
                </button>
              ))}
            </div>
          </Card>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="w-full bg-bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
              placeholder="Search packages (e.g. stripe, three.js, supabase...)"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
            />
            {librarySearch && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                onClick={() => setLibrarySearch("")}
                aria-label="Clear search"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>

          {libLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-28 rounded-lg bg-bg-secondary animate-pulse" />
              ))}
            </div>
          )}

          {!libLoading && filteredPackages.length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No packages found for "{librarySearch}"</p>
            </div>
          )}

          {!libLoading && filteredPackages.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredPackages.map((pkg) => <LibraryCard key={`${pkg.domain}-${pkg.name}`} pkg={pkg} />)}
            </div>
          )}
        </div>
      )}

      {/* ─── Deployments Tab ────────────────────────────────────────── */}
      {activeTab === "deployments" && (
        <div className="space-y-4">
          {/* Platform tiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {["vercel", "railway", "netlify", "fly", "cloudflare"].map((platform) => {
              const toolPresent = tools.find((t) => t.name === platform || t.name === "wrangler" && platform === "cloudflare")?.status === "present";
              return (
                <Card key={platform} className={`text-center py-4 ${!toolPresent ? "opacity-50" : ""}`}>
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${PLATFORM_COLORS[platform]} mx-auto mb-2 flex items-center justify-center`}>
                    <Globe className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-text-heading text-sm font-medium capitalize">{platform}</p>
                  <Badge variant={toolPresent ? "success" : "danger"} className="mt-1">
                    {toolPresent ? "CLI ready" : "Not installed"}
                  </Badge>
                </Card>
              );
            })}
          </div>

          {!tools.some((t) => t.category === "deployment" && t.status === "present") && (
            <Alert variant="info">
              No deployment CLIs detected. Install one to enable autonomous deployments:
              <code className="ml-2 text-xs font-mono">npm install -g vercel</code>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-text-heading font-semibold">Deployment History</h3>
            <Button variant="ghost" size="sm" onClick={refetchDeploys}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {deploymentsLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-bg-secondary animate-pulse" />
              ))}
            </div>
          )}

          {!deploymentsLoading && (deploymentsData?.deployments ?? []).length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <Rocket className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No deployments yet</p>
              <p className="text-xs mt-1">Citizens will deploy projects here automatically</p>
            </div>
          )}

          <div className="space-y-2">
            {(deploymentsData?.deployments ?? []).map((dep) => (
              <DeploymentRow key={dep.id} dep={dep} />
            ))}
          </div>
        </div>
      )}

      {/* Capabilities summary footer */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-warning" />
          <h3 className="text-text-heading font-semibold text-sm">Citizen Dev Capabilities</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-1.5 gap-x-6 text-xs text-text-secondary">
          {[
            "Next.js / Vite / React full-stack apps",
            "Python fastAPI, Django, Flask backends",
            "Go microservices (Gin, Echo, Fiber)",
            "Rust + WebAssembly via cargo/wasm-pack",
            ".NET / C# / ASP.NET Core / Blazor",
            "React 3D games (R3F, Three.js, Rapier)",
            "Supabase: auth, database, storage, edge functions",
            "Real-time: Socket.IO, Ably, Yjs CRDTs",
            "AI/LLM: OpenAI, Claude, Gemini, Ollama (local)",
            "Payments: Stripe, PayPal, Lemon Squeezy",
            "Email/SMS: Resend, Nodemailer, Twilio",
            "Ecommerce: MedusaJS, Commerce Layer",
            "Docker containerization + CI/CD via GitHub Actions",
            "Deploy: Vercel, Railway, Netlify, Fly.io, Cloudflare",
            "PWA + React Native mobile apps",
          ].map((cap) => (
            <div key={cap} className="flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3 text-accent flex-shrink-0" />
              <span>{cap}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
