import {
  Building2,
  Ticket,
  BarChart3,
  RefreshCw,
  Network,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  PlusCircle,
  Coins,
} from "lucide-react";
import { useState } from "react";
import {
  Button,
  Card,
  Badge,
  StatCard,
  PageHeader,
  RpcStatus,
  Alert,
  Tabs,
  EmptyState,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PaperclipStatus {
  ok: boolean;
  online: boolean;
  port: number;
  setupRequired: boolean;
  setupHint: string | null;
}

interface Company {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
}

interface Ticket {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigneeId?: string;
  companyId?: string;
  createdAt?: string;
}

interface OrgNode {
  id: string;
  label: string;
  role?: string;
  level?: number;
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "neutral"> = {
  done: "success",
  in_progress: "warning",
  open: "info",
  blocked: "neutral",
};

// ─── Setup Banner ──────────────────────────────────────────────────────────────

function SetupBanner({ hint }: { hint: string | null }) {
  return (
    <Alert variant="info">
      <div className="space-y-2">
        <p className="font-semibold">Paperclip Company OS — Setup Required</p>
        <p className="text-sm opacity-80">
          The Paperclip service is not running. Clone and build the vendor repo to activate this feature.
        </p>
        {hint && (
          <pre className="text-xs bg-black/30 rounded p-2 mt-2 overflow-x-auto">{hint}</pre>
        )}
      </div>
    </Alert>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ online }: { online: boolean }) {
  const { data, loading, error, refetch } = useRpc<{ ok: boolean; companies?: Company[] }>(
    "paperclip.companies.list",
    {},
    [],
    { staleTimeMs: 30_000 },
  );
  const { data: budgetData } = useRpc<{ ok: boolean; budget?: { tokens: number; used: number; remaining: number } }>(
    "paperclip.budget.get",
    {},
    [],
    { staleTimeMs: 60_000 },
  );

  const companies = data?.companies ?? [];
  const budget = budgetData?.budget;

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Companies" value={companies.length} icon={<Building2 size={18} />} />
        <StatCard label="Status" value={online ? "Online" : "Offline"} icon={online ? <CheckCircle2 size={18} className="text-success" /> : <AlertCircle size={18} className="text-danger" />} />
        {budget && (
          <>
            <StatCard label="Token Budget" value={budget.tokens.toLocaleString()} icon={<Coins size={18} />} />
            <StatCard label="Tokens Used" value={budget.used.toLocaleString()} sub={`${budget.remaining.toLocaleString()} remaining`} icon={<BarChart3 size={18} />} />
          </>
        )}
      </div>

      {/* Companies grid */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-text-heading">AI Companies</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw size={13} className="mr-1" /> Refresh
          </Button>
        </div>
        {companies.length === 0 ? (
          <EmptyState
            icon={<Building2 size={28} />}
            title="No Companies Yet"
            description="Create an AI Company to organize citizens into employees with org charts, tickets, and budgets."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {companies.map((c) => (
              <div key={c.id} className="p-4 rounded-xl bg-bg-secondary border border-border/30 hover:border-border transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Building2 size={16} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-heading text-sm truncate">{c.name}</p>
                    {c.description && (
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{c.description}</p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-text-muted shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Network, label: "Org Charts", desc: "Citizens as employees in reporting hierarchies" },
          { icon: Ticket, label: "Ticket System", desc: "Atomic work units assigned to AI employees" },
          { icon: Clock, label: "Heartbeats", desc: "Scheduled check-ins where agents review goals" },
        ].map((f) => (
          <Card key={f.label} className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
              <f.icon size={15} className="text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-heading">{f.label}</p>
              <p className="text-xs text-text-muted mt-0.5">{f.desc}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Tickets Tab ──────────────────────────────────────────────────────────────

function TicketsTab() {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data, loading, error, refetch } = useRpc<{ ok: boolean; tickets?: Ticket[] }>(
    "paperclip.tickets.list",
    { limit: 50 },
    [],
    { staleTimeMs: 15_000 },
  );

  const tickets = data?.tickets ?? [];

  const handleCreate = async () => {
    if (!newTitle.trim()) { return; }
    setCreating(true);
    try {
      await rpc("paperclip.tickets.create", { title: newTitle.trim(), description: newDesc.trim() });
      setNewTitle("");
      setNewDesc("");
      refetch();
    } finally {
      setCreating(false);
    }
  };

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Quick create */}
      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">Create Ticket</p>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Ticket title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
          />
          <textarea
            placeholder="Description (optional)…"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={2}
            className="resize-none bg-bg-input border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
          />
          <Button variant="primary" size="sm" onClick={() => void handleCreate()} disabled={!newTitle.trim() || creating}>
            <PlusCircle size={13} className="mr-1.5" />
            {creating ? "Creating…" : "Create Ticket"}
          </Button>
        </div>
      </Card>

      {/* Ticket list */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-text-heading">{tickets.length} Tickets</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
        </div>
        {tickets.length === 0 ? (
          <EmptyState icon={<Ticket size={24} />} title="No Tickets" description="Tickets are created when citizens or operators assign work items." />
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg bg-bg-input border border-border/20 hover:border-border/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{t.title}</p>
                  {t.assigneeId && (
                    <p className="text-xs text-text-muted mt-0.5">→ {t.assigneeId}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0 mt-0.5">
                  <Badge variant={PRIORITY_VARIANT[t.priority] ?? "neutral"}>{t.priority}</Badge>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "neutral"}>{t.status?.replace("_", " ")}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Org Chart Tab ────────────────────────────────────────────────────────────

function OrgChartTab() {
  const { data, loading, error, refetch } = useRpc<{ ok: boolean; nodes?: OrgNode[]; edges?: { source: string; target: string }[] }>(
    "paperclip.orgchart.get",
    {},
    [],
    { staleTimeMs: 30_000 },
  );

  const nodes = data?.nodes ?? [];

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  if (nodes.length === 0) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={<Network size={28} />}
          title="No Org Chart"
          description="Add citizens as employees to build an organizational hierarchy."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">
          {nodes.length} Employees Charted
        </p>
        <div className="flex flex-col gap-2">
          {nodes.map((n) => (
            <div key={n.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-input border border-border/20"
              style={{ marginLeft: `${(n.level ?? 0) * 20}px` }}>
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                {n.label.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{n.label}</p>
                {n.role && <p className="text-xs text-text-muted">{n.role}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function CompanyOS() {
  const { data: statusData, loading: statusLoading } = useRpc<PaperclipStatus>(
    "paperclip.status",
    {},
    [],
    { staleTimeMs: 30_000 },
  );

  const online = statusData?.online ?? false;
  const setupHint = statusData?.setupHint ?? null;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "tickets", label: "Tickets" },
    { id: "orgchart", label: "Org Chart" },
  ];
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="animate-fade-in p-6 space-y-6">
      <PageHeader
        title="Company OS"
        description="Manage AI companies, assign citizens as employees, track tickets, heartbeats, and budgets."
        icon={<Building2 size={22} />}
        actions={
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${online ? "bg-success" : "bg-danger"}`} />
            <span className="text-xs text-text-muted">{statusLoading ? "…" : online ? "Paperclip Online" : "Stub Mode"}</span>
          </div>
        }
      />

      {!statusLoading && !online && (
        <SetupBanner hint={setupHint} />
      )}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && <OverviewTab online={online} />}
      {activeTab === "tickets" && <TicketsTab />}
      {activeTab === "orgchart" && <OrgChartTab />}
    </div>
  );
}
