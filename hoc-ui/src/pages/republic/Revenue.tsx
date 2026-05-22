import {
  DollarSign,
  TrendingUp,
  Zap,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Settings,
} from "lucide-react";
import { PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";
import { RevenueDashboard } from "@/pages/RevenueDashboard";

type Harvester = {
  id: string;
  name: string;
  enabled: boolean;
  earnings?: number;
  type?: string;
};
type RevenueDashboard = {
  totalEarnings?: number;
  monthlyEarnings?: number;
  activeHarvesters?: number;
  harvesters?: Harvester[];
  mode?: string;
};

export function RevenuePage() {
  const { data, loading, error, refetch } = useRpc<RevenueDashboard>(
    "republic.revenue.dashboard",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 30_000 },
  );
  const { data: earningsData } = useRpc<{ earnings?: number; breakdown?: Record<string, number> }>(
    "republic.revenue.earnings",
    {},
    [],
    { staleTimeMs: 15_000 },
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const harvesters = data?.harvesters ?? [];

  async function toggleHarvester(h: Harvester) {
    try {
      await rpc("republic.revenue.harvester", { harvesterId: h.id, enabled: !h.enabled });
      invalidateRpcCache("republic.revenue.dashboard");
      refetch();
    } catch (e) {
      console.error(e);
    }
  }

  async function setMode(mode: string) {
    try {
      await rpc("republic.revenue.mode", { mode });
      invalidateRpcCache("republic.revenue.dashboard");
      refetch();
    } catch (e) {
      console.error(e);
    }
  }

  const fmt = (v?: number) =>
    v != null ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* ── 7 Autonomous Revenue Streams Dashboard ─────────────────────────── */}
      <RevenueDashboard />

      <hr className="border-border" />
      <h2 className="text-text-heading font-bold text-lg">Revenue Harvesters (Legacy)</h2>

      <PageHeader
        title="Revenue"
        description="Earnings dashboard, harvester management, and revenue configuration"
        icon={<DollarSign size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Earnings"
          value={fmt(data?.totalEarnings)}
          icon={<DollarSign size={16} />}
        />
        <StatCard
          label="Monthly"
          value={fmt(data?.monthlyEarnings)}
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Active Harvesters"
          value={data?.activeHarvesters ?? 0}
          icon={<Zap size={16} />}
        />
        <StatCard label="Mode" value={data?.mode ?? "—"} icon={<Settings size={16} />} />
      </div>

      {/* Mode Controls */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">⚡ Revenue Mode</h3>
        <div className="flex gap-3 flex-wrap">
          {["passive", "active", "aggressive"].map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={data?.mode === mode ? "primary" : "outline"}
              onClick={() => setMode(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>
      </Card>

      {/* Harvesters */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">🌾 Revenue Harvesters</h3>
        {loading ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : harvesters.length === 0 ? (
          <p className="text-sm text-text-muted">No harvesters configured.</p>
        ) : (
          <div className="space-y-3">
            {harvesters.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${h.enabled ? "bg-success" : "bg-border"}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-text-heading">{h.name}</p>
                    {h.type && <p className="text-xs text-text-muted capitalize">{h.type}</p>}
                  </div>
                  <Badge variant={h.enabled ? "success" : "neutral"}>
                    {h.enabled ? "Active" : "Off"}
                  </Badge>
                  {h.earnings != null && (
                    <span className="text-sm font-medium text-accent">{fmt(h.earnings)}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={
                    h.enabled ? (
                      <ToggleRight size={14} className="text-success" />
                    ) : (
                      <ToggleLeft size={14} />
                    )
                  }
                  onClick={() => toggleHarvester(h)}
                >
                  {h.enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Earnings Breakdown */}
      {earningsData?.breakdown && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">📊 Earnings Breakdown</h3>
          <div className="space-y-2">
            {Object.entries(earningsData.breakdown).map(([source, amount]) => (
              <div key={source} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary capitalize">{source}</span>
                <span className="font-medium text-accent">{fmt(amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
