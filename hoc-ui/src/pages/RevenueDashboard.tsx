import { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Briefcase,
  Globe,
  Bot,
  Zap,
  RefreshCw,
  Key,
  Activity,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  StatCard,
  PageHeader,
  Alert,
  Tabs,
  RpcStatus,
  EmptyState,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RevenueSummary {
  totalCollectedUsd: number;
  totalPendingUsd: number;
  byStream: Record<string, { collectedUsd: number; count: number }>;
  recentEntries: Array<{
    id: string;
    stream: number;
    streamName: string;
    amountCentsUsd: number;
    description: string;
    status: string;
    createdAt: string;
    customerId?: string;
  }>;
}

interface StreamStatus {
  id: number;
  name: string;
  status: "active" | "pending-config" | "passive";
  endpoint?: string;
  rpc?: string;
  config?: string;
}

interface GigStats {
  total: number;
  bidsPlaced: number;
  inProgress: number;
  completed: number;
  totalEarnedUsd: number;
  pendingBidValueUsd: number;
}

interface MarketplaceStats {
  total: number;
  listed: number;
  pending: number;
  totalRevenueUsd: number;
}

// ─── Stream Status Badge ───────────────────────────────────────────────────────

function StreamStatusBadge({ status }: { status: StreamStatus["status"] }) {
  return status === "active"
    ? <Badge variant="success">Active</Badge>
    : status === "pending-config"
    ? <Badge variant="warning">Needs Config</Badge>
    : <Badge variant="neutral">Passive</Badge>;
}

// ─── Revenue Overview Tab ─────────────────────────────────────────────────────

function OverviewTab() {
  const { data: summary, loading, error, refetch } = useRpc<RevenueSummary>(
    "republic.revenue.api.summary",
    {},
    [],
    { staleTimeMs: 10000, refetchIntervalMs: 30000 },
  );

  const { data: streamsData } = useRpc<{ streams: StreamStatus[] }>(
    "republic.revenue.streams.status",
    {},
    [],
    { staleTimeMs: 60000 },
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const streams = streamsData?.streams ?? [];
  const activeStreams = streams.filter((s) => s.status === "active").length;

  return (
    <div className="space-y-6">
      {/* Total Revenue Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Collected"
          value={`$${(summary?.totalCollectedUsd ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<DollarSign className="w-5 h-5" />}
          sub="USD"
        />
        <StatCard
          label="Pending Revenue"
          value={`$${(summary?.totalPendingUsd ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<Clock className="w-5 h-5" />}
          sub="awaiting confirmation"
        />
        <StatCard
          label="Active Streams"
          value={`${activeStreams} / 7`}
          icon={<Activity className="w-5 h-5" />}
          sub="revenue channels"
        />
        <StatCard
          label="Transactions"
          value={String(summary?.recentEntries?.length ?? 0)}
          icon={<TrendingUp className="w-5 h-5" />}
          sub="recent records"
        />
      </div>

      {/* Revenue by Stream */}
      {summary?.byStream && Object.keys(summary.byStream).length > 0 && (
        <Card glass>
          <h3 className="text-text-heading font-semibold mb-4">Revenue by Stream</h3>
          <div className="space-y-3">
            {Object.entries(summary.byStream).map(([name, data]) => (
              <div key={name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className="text-text-primary text-sm font-medium">{name}</span>
                  <span className="text-text-muted text-xs ml-2">({data.count} transactions)</span>
                </div>
                <span className="text-success font-semibold">${data.collectedUsd.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stream Status Grid */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4">Revenue Streams</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {streams.map((stream) => (
            <div
              key={stream.id}
              className="flex items-start gap-3 p-3 bg-bg-secondary rounded-lg border border-border"
            >
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                <span className="text-accent font-bold text-sm">{stream.id}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-text-primary text-sm font-medium">{stream.name}</span>
                  <StreamStatusBadge status={stream.status} />
                </div>
                {stream.endpoint && (
                  <p className="text-text-muted text-xs mt-1 truncate font-mono">{stream.endpoint}</p>
                )}
                {stream.config && stream.status !== "active" && (
                  <p className="text-warning text-xs mt-1">⚠ {stream.config}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Ledger Entries */}
      {(summary?.recentEntries ?? []).length > 0 && (
        <Card glass>
          <h3 className="text-text-heading font-semibold mb-4">Recent Transactions</h3>
          <div className="space-y-2">
            {(summary?.recentEntries ?? []).slice(0, 10).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  {entry.status === "succeeded" ? (
                    <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                  ) : entry.status === "failed" ? (
                    <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-warning flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-text-primary text-sm">{entry.description}</p>
                    <p className="text-text-muted text-xs">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`font-semibold text-sm ${entry.status === "succeeded" ? "text-success" : "text-text-muted"}`}>
                    ${(entry.amountCentsUsd / 100).toFixed(2)}
                  </span>
                  <p className="text-text-muted text-xs">Stream {entry.stream}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(summary?.recentEntries ?? []).length === 0 && (
        <EmptyState
          icon={<DollarSign className="w-8 h-8" />}
          title="No revenue yet"
          description="Revenue will appear here once customers subscribe to intelligence feeds or submit AaaS tasks. Create an API key and start earning!"
          action={
            <Button variant="primary" onClick={() => {}}>
              Create API Key
            </Button>
          }
        />
      )}
    </div>
  );
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────────

function ApiKeysTab() {
  const [customerId, setCustomerId] = useState("");
  const [plan, setPlan] = useState<"free" | "starter" | "pro" | "enterprise">("free");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreateKey() {
    if (!customerId) { return; }
    setCreating(true);
    try {
      const result = await rpc<{ key: string; plan: string; callsPerMonth: number }>(
        "republic.revenue.api.keys.create",
        { customerId, plan },
      );
      if (result && "key" in result) {
        setNewKey((result as { key: string }).key);
      }
    } finally {
      setCreating(false);
    }
  }

  const PLANS = [
    { id: "free", label: "Free", calls: "100/month", price: "$0/mo", streams: "Intel only" },
    { id: "starter", label: "Starter", calls: "1,000/month", price: "$29/mo", streams: "Intel + AaaS" },
    { id: "pro", label: "Pro", calls: "10,000/month", price: "$99/mo", streams: "Intel + AaaS + Licensing" },
    { id: "enterprise", label: "Enterprise", calls: "Unlimited", price: "$499/mo", streams: "All streams" },
  ];

  return (
    <div className="space-y-6">
      <Alert variant="info">
        API keys grant external subscribers access to the HoC Intelligence API. Share the key with customers
        after payment is confirmed. All calls are metered against the plan limit.
      </Alert>

      {/* New Key Form */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <Key className="w-4 h-4" />
          Issue New API Key
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-text-secondary text-sm mb-1 block">Customer ID / Email</label>
            <input
              id="revenue-customer-id"
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="customer@example.com or stripe_customer_id"
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-text-secondary text-sm mb-2 block">Plan</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  id={`plan-${p.id}`}
                  onClick={() => setPlan(p.id as typeof plan)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    plan === p.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-bg-secondary hover:border-border-hover"
                  }`}
                >
                  <div className="text-text-primary font-semibold text-sm">{p.label}</div>
                  <div className="text-accent text-sm font-bold">{p.price}</div>
                  <div className="text-text-muted text-xs mt-1">{p.calls}</div>
                  <div className="text-text-muted text-xs">{p.streams}</div>
                </button>
              ))}
            </div>
          </div>

          <Button
            id="btn-create-api-key"
            variant="primary"
            onClick={() => void handleCreateKey()}
            disabled={!customerId || creating}
          >
            {creating ? "Creating..." : "Issue API Key"}
          </Button>
        </div>

        {newKey && (
          <div className="mt-4 p-4 bg-success-bg border border-success rounded-lg">
            <p className="text-success font-semibold text-sm mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              API Key Created — Share with customer
            </p>
            <code className="text-text-primary font-mono text-xs break-all bg-bg-secondary px-2 py-1 rounded">
              {newKey}
            </code>
            <p className="text-text-muted text-xs mt-2">⚠ This key will not be shown again. Copy it now.</p>
          </div>
        )}
      </Card>

      {/* API Endpoint Reference */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4">API Quick Reference</h3>
        <div className="space-y-2 font-mono text-xs">
          {[
            { method: "GET", path: "/api/v1/system/health", desc: "Health check (no auth)" },
            { method: "GET", path: "/api/v1/intel/brief", desc: "World intelligence brief" },
            { method: "GET", path: "/api/v1/intel/news", desc: "Live threat-classified news" },
            { method: "GET", path: "/api/v1/intel/signals", desc: "Active intelligence signals" },
            { method: "GET", path: "/api/v1/intel/cii", desc: "Country Instability Index" },
            { method: "POST", path: "/api/v1/agent/task", desc: "Submit task to citizen agent" },
            { method: "GET", path: "/api/v1/agent/catalog", desc: "Browse citizen specializations" },
            { method: "GET", path: "/api/v1/billing/usage", desc: "Current key usage" },
          ].map((endpoint) => (
            <div key={endpoint.path} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
              <span className={`w-12 text-center rounded px-1 py-0.5 text-xs font-bold ${
                endpoint.method === "GET" ? "bg-info-bg text-info" : "bg-success-bg text-success"
              }`}>
                {endpoint.method}
              </span>
              <span className="text-text-secondary flex-1 truncate">{endpoint.path}</span>
              <span className="text-text-muted hidden md:block">{endpoint.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-text-muted text-xs mt-3">
          Authentication: <code className="bg-bg-secondary px-1 rounded">X-HoC-API-Key: hoc_live_xxx</code>
        </p>
      </Card>
    </div>
  );
}

// ─── Gig Economy Tab ─────────────────────────────────────────────────────────

function GigEconomyTab() {
  const { data: statsData, loading, error, refetch } = useRpc<{ stats: GigStats | null; message?: string }>(
    "republic.revenue.gigs.stats",
    {},
    [],
  );
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    setScanning(true);
    try {
      await rpc("republic.revenue.gigs.scan", {});
      refetch();
    } finally {
      setScanning(false);
    }
  }

  const stats = statsData?.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Alert variant="info">
          Citizens autonomously scan and bid on freelance gigs. Set <code>GIG_ENABLED=true</code> to activate.
        </Alert>
        <Button
          id="btn-scan-gigs"
          variant="outline"
          onClick={() => void handleScan()}
          disabled={scanning}
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning..." : "Scan Now"}
        </Button>
      </div>

      <RpcStatus loading={loading} error={error} onRetry={refetch} />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Bids Placed" value={String(stats.bidsPlaced)} icon={<Briefcase className="w-5 h-5" />} />
          <StatCard label="In Progress" value={String(stats.inProgress)} icon={<Activity className="w-5 h-5" />} />
          <StatCard label="Completed" value={String(stats.completed)} icon={<CheckCircle className="w-5 h-5" />} />
          <StatCard label="Earned" value={`$${stats.totalEarnedUsd.toFixed(2)}`} icon={<DollarSign className="w-5 h-5" />} />
          <StatCard label="Pending Value" value={`$${stats.pendingBidValueUsd.toFixed(2)}`} icon={<Clock className="w-5 h-5" />} />
          <StatCard label="Total Gigs" value={String(stats.total)} icon={<Globe className="w-5 h-5" />} />
        </div>
      )}

      {!stats && !loading && (
        <EmptyState
          icon={<Briefcase className="w-8 h-8" />}
          title="Gig economy not active"
          description="Set GIG_ENABLED=true environment variable to enable autonomous gig bidding."
        />
      )}
    </div>
  );
}

// ─── Marketplace Tab ──────────────────────────────────────────────────────────

function MarketplaceTab() {
  const { data: statsData, loading, error, refetch } = useRpc<{ stats: MarketplaceStats | null }>(
    "republic.revenue.marketplace.stats",
    {},
    [],
  );
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    setScanning(true);
    try {
      await rpc("republic.revenue.marketplace.scan", {});
      refetch();
    } finally {
      setScanning(false);
    }
  }

  const stats = statsData?.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Alert variant="info">
          Citizens auto-produce content. Set <code>GUMROAD_ACCESS_TOKEN</code> to auto-list on Gumroad.
        </Alert>
        <Button
          id="btn-scan-marketplace"
          variant="outline"
          onClick={() => void handleScan()}
          disabled={scanning}
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning..." : "Scan Now"}
        </Button>
      </div>

      <RpcStatus loading={loading} error={error} onRetry={refetch} />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Products" value={String(stats.total)} icon={<ShoppingCart className="w-5 h-5" />} />
          <StatCard label="Listed" value={String(stats.listed)} icon={<CheckCircle className="w-5 h-5" />} />
          <StatCard label="Pending" value={String(stats.pending)} icon={<Clock className="w-5 h-5" />} />
          <StatCard label="Revenue" value={`$${stats.totalRevenueUsd.toFixed(2)}`} icon={<DollarSign className="w-5 h-5" />} />
        </div>
      )}

      {!stats && !loading && (
        <EmptyState
          icon={<ShoppingCart className="w-8 h-8" />}
          title="No marketplace listings yet"
          description="Citizens will automatically scan republic-output/ for sellable content every 6 hours."
        />
      )}
    </div>
  );
}

// ─── AaaS Tasks Tab ───────────────────────────────────────────────────────────

function AaaSTasksTab() {
  const { data, loading, error, refetch } = useRpc<{ tasks: Array<{
    taskId: string;
    specialization: string;
    status: string;
    instruction: string;
    customerId: string;
    earnedUsd?: number;
    createdAt: string;
    completedAt?: string;
  }> }>(
    "republic.revenue.tasks.list",
    { limit: 20 },
    [],
    { staleTimeMs: 10000, refetchIntervalMs: 15000 },
  );

  return (
    <div className="space-y-6">
      <RpcStatus loading={loading} error={error} onRetry={refetch} />

      {(data?.tasks ?? []).length > 0 ? (
        <Card glass>
          <div className="space-y-3">
            {(data?.tasks ?? []).map((task) => (
              <div
                key={task.taskId}
                className="flex items-start gap-3 p-3 bg-bg-secondary rounded-lg border border-border"
              >
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  task.status === "completed" ? "bg-success" :
                  task.status === "running" ? "bg-accent animate-pulse" :
                  task.status === "failed" ? "bg-danger" : "bg-warning"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-text-primary text-sm font-medium">{task.specialization}</span>
                    <Badge variant={task.status === "completed" ? "success" : task.status === "failed" ? "danger" : "info"}>
                      {task.status}
                    </Badge>
                  </div>
                  <p className="text-text-muted text-xs mt-1 truncate">{task.instruction}</p>
                  <p className="text-text-muted text-xs">{task.customerId} · {new Date(task.createdAt).toLocaleString()}</p>
                </div>
                {task.status === "completed" && (
                  <span className="text-success text-sm font-semibold flex-shrink-0">$0.05</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : !loading ? (
        <EmptyState
          icon={<Bot className="w-8 h-8" />}
          title="No AaaS tasks yet"
          description="External customers submit tasks via POST /api/v1/agent/task. Create an API key and share it."
        />
      ) : null}

      <Button
        id="btn-refresh-tasks"
        variant="ghost"
        onClick={refetch}
        size="sm"
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        Refresh
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function RevenueDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview",     label: "Overview" },
    { id: "api-keys",     label: "API Keys" },
    { id: "aas-tasks",    label: "AaaS Tasks" },
    { id: "gig-economy",  label: "Gig Economy" },
    { id: "marketplace",  label: "Marketplace" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Revenue Dashboard"
        description="Manage all 7 autonomous revenue streams — from intelligence subscriptions to agent-as-a-service"
        icon={<DollarSign className="w-6 h-6 text-success" />}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="success">
              <Zap className="w-3 h-3 mr-1" />
              Autonomous
            </Badge>
            <Button
              id="btn-view-api-docs"
              variant="outline"
              size="sm"
              onClick={() => window.open("/api/v1/system/sdk-info", "_blank")}
            >
              <ChevronRight className="w-4 h-4 mr-1" />
              API Docs
            </Button>
          </div>
        }
      />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "api-keys" && <ApiKeysTab />}
      {activeTab === "aas-tasks" && <AaaSTasksTab />}
      {activeTab === "gig-economy" && <GigEconomyTab />}
      {activeTab === "marketplace" && <MarketplaceTab />}
    </div>
  );
}
