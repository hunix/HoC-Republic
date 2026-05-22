import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import { PageHeader, Card, Badge, Button, StatCard, ProgressBar, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

type Currency = "USD" | "BTC" | "ETH" | "Credits";
type HarvesterType = "Microwork" | "APIService" | "CryptoMining";

const CURRENCY_ICON: Record<Currency, string> = { USD: "💵", BTC: "₿", ETH: "⬡", Credits: "🪙" };
const TX_ICON: Record<string, string> = {
  TaxCollection: "🏛️",
  ResourcePurchase: "📦",
  Salary: "💰",
  Trade: "🔄",
  Investment: "📈",
  Donation: "🎁",
};

function fmt(amount: number | null | undefined, currency: Currency): string {
  const safeAmount = amount ?? 0;
  if (currency === "USD") {
    return `$${safeAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (currency === "BTC") {
    return `${safeAmount.toFixed(8)} BTC`;
  }
  if (currency === "ETH") {
    return `${safeAmount.toFixed(6)} ETH`;
  }
  return `${safeAmount.toLocaleString()} ¤`;
}

type TreasuryData = {
  balances: Array<{ currency: Currency; balance: number; change24h: number }>;
  totalValueUSD: number;
  taxRate: number;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    currency: Currency;
    description: string;
    timestamp: number;
    income?: boolean;
  }>;
  harvesters: Array<{
    type: HarvesterType;
    enabled: boolean;
    earning: number;
    earningCurrency: Currency;
    tasksCompleted: number;
    successRate: number;
    lastHarvest: number;
  }>;
  resources: Array<{
    resource: string;
    unitCost: number;
    available: number;
    consumed: number;
  }>;
  dailyRevenue: number;
  dailyExpenses: number;
};

export function EconomyPage() {
  const {
    data: ecoData,
    loading,
    refetch,
    error,
  } = useRpc<{ treasury: TreasuryData }>("republic.economy.treasury", {});
  const eco = ecoData?.treasury;

  // Use local state to drive sliders, but only init once eco is loaded
  const [harvesters, setHarvesters] = useState<TreasuryData["harvesters"]>([]);
  const [taxRate, setTaxRate] = useState<number>(0);

  // Sync state whenever the backend data updates
  useEffect(() => {
    if (!eco) {
      return;
    }
    const tid = setTimeout(() => {
      setHarvesters(eco.harvesters);
      setTaxRate(eco.taxRate);
    }, 0);
    return () => clearTimeout(tid);
  }, [eco]);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  if (!eco) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-text-muted animate-pulse flex flex-col items-center gap-4">
          <DollarSign size={32} />
          <span>Loading Treasury...</span>
        </div>
      </div>
    );
  }

  const net = eco.dailyRevenue - eco.dailyExpenses;

  const toggleHarvester = (type: HarvesterType) => {
    setHarvesters((prev) => prev.map((h) => (h.type === type ? { ...h, enabled: !h.enabled } : h)));
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Economy"
        description="National treasury, harvesters, resources, and transactions"
        icon={<DollarSign size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {/* Treasury Total */}
      <Card className="bg-gradient-to-r from-success/10 to-accent/10 border-success/30">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-heading">💰 National Treasury</h2>
          <Badge variant="success" className="text-base px-3 py-1">
            ${(eco.totalValueUSD ?? 0).toLocaleString()} Total Value
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {eco.balances.map((b) => (
            <div key={b.currency} className="bg-bg-secondary/60 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{CURRENCY_ICON[b.currency]}</span>
                <span className="text-xs font-semibold text-text-muted uppercase">
                  {b.currency}
                </span>
              </div>
              <p className="font-bold text-text-heading text-sm">{fmt(b.balance, b.currency)}</p>
              <div
                className={`flex items-center gap-1 text-xs mt-1 ${b.change24h >= 0 ? "text-success" : "text-danger"}`}
              >
                {b.change24h >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {Math.abs(b.change24h).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Revenue / Expenses / Net */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Daily Revenue"
          value={`$${(eco.dailyRevenue ?? 0).toLocaleString()}`}
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Daily Expenses"
          value={`$${(eco.dailyExpenses ?? 0).toLocaleString()}`}
          icon={<TrendingDown size={16} />}
        />
        <StatCard
          label="Net Flow"
          value={`${net > 0 ? "+" : ""}$${(net ?? 0).toLocaleString()}`}
          sub={net > 0 ? "Surplus 🟢" : "Deficit 🔴"}
          icon={<DollarSign size={16} />}
        />
      </div>

      {/* Tax Rate */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-heading">Tax Rate</h3>
          <Badge variant="info">{(taxRate * 100).toFixed(1)}%</Badge>
        </div>
        <ProgressBar value={taxRate * 100} labelLeft="0%" labelRight="50%" />
        <div className="mt-3 flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.01"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            className="flex-1 accent-accent"
          />
        </div>
      </Card>

      {/* Harvesters */}
      <div>
        <h3 className="font-semibold text-text-heading mb-3">⚡ Resource Harvesters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {harvesters.map((h) => (
            <Card
              key={h.type}
              className={`${h.enabled ? "border-success/40" : "border-border/30 opacity-70"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-text-heading">{h.type}</h4>
                <button
                  type="button"
                  aria-label={`${h.enabled ? "Disable" : "Enable"} ${h.type} harvester`}
                  onClick={() => toggleHarvester(h.type)}
                  className="cursor-pointer"
                >
                  {h.enabled ? (
                    <ToggleRight size={24} className="text-success" />
                  ) : (
                    <ToggleLeft size={24} className="text-text-muted" />
                  )}
                </button>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Earning</span>
                  <span className="font-semibold text-success">
                    {fmt(h.earning, h.earningCurrency)}/hr
                  </span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Tasks Done</span>
                  <span>{h.tasksCompleted.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Success Rate</span>
                  <span className={h.successRate > 0.9 ? "text-success" : "text-warning"}>
                    {(h.successRate * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Resources */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">🗄️ Resource Usage</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {eco.resources.map((r) => {
            const pct = (r.consumed / r.available) * 100;
            return (
              <div key={r.resource}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-text-secondary">{r.resource}</span>
                  <span className="text-text-muted">
                    {r.consumed.toLocaleString()} / {r.available.toLocaleString()}
                  </span>
                </div>
                <ProgressBar value={pct} />
                <p className="text-xs text-text-muted mt-0.5">${r.unitCost}/unit</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Transactions */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-text-heading">📋 Recent Transactions</h3>
          <Badge>{eco.recentTransactions.length}</Badge>
        </div>
        <div className="divide-y divide-border/20">
          {eco.recentTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-3">
              <span className="text-xl w-8 text-center">{TX_ICON[tx.type] ?? "💳"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-heading">{tx.type}</p>
                <p className="text-xs text-text-muted">{tx.description}</p>
              </div>
              <div className={`text-sm font-bold ${tx.income ? "text-success" : "text-danger"}`}>
                {tx.income ? "+" : "-"}
                {fmt(tx.amount, tx.currency)}
              </div>
              <span className="text-xs text-text-muted w-20 text-right">
                {new Date(tx.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
