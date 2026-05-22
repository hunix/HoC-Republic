import {
  Globe,
  Shield,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  PauseCircle,
  RefreshCw,
  Plus,
  HandshakeIcon,
  Swords,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────────────────

type TreatyStatus = "proposed" | "active" | "suspended" | "terminated";
type ConflictSeverity = "low" | "medium" | "high" | "critical";

interface Treaty {
  id: string;
  name: string;
  partyA: string;
  partyB: string;
  status: TreatyStatus;
  proposedBy?: string;
  proposedAt?: number;
  signedAt?: number;
  durationDays?: number;
  terms?: Array<{ type: string; value: string }>;
}

interface Conflict {
  id: string;
  domainA: string;
  domainB: string;
  description: string;
  severity: ConflictSeverity;
  resolved: boolean;
  resolution?: string;
  registeredAt?: number;
}

interface DiplomacyEvent {
  id: string;
  kind: string;
  sourceDomain: string;
  payload: Record<string, unknown>;
  timestamp?: number;
}

interface DiplomacyDiag {
  totalTreaties?: number;
  activeTreaties?: number;
  totalConflicts?: number;
  unresolvedConflicts?: number;
  totalEvents?: number;
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

const TREATY_VARIANT: Record<TreatyStatus, "success" | "info" | "warning" | "neutral"> = {
  active: "success",
  proposed: "info",
  suspended: "warning",
  terminated: "neutral",
};

const SEVERITY_VARIANT: Record<ConflictSeverity, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
};

const TREATY_ICON: Record<TreatyStatus, React.ReactNode> = {
  active: <CheckCircle size={12} />,
  proposed: <MessageSquare size={12} />,
  suspended: <PauseCircle size={12} />,
  terminated: <XCircle size={12} />,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TreatyCard({ treaty, onRefresh }: { treaty: Treaty; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function act(method: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr("");
    try {
      await rpc(`republic.diplomacy.treaty.${method}`, { treatyId: treaty.id, ...extra });
      invalidateRpcCache("republic.diplomacy.treaties");
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text-heading text-sm truncate">{treaty.name}</p>
          <p className="text-xs text-text-muted">
            {treaty.partyA} ↔ {treaty.partyB}
          </p>
          {treaty.durationDays && (
            <p className="text-xs text-text-muted">{treaty.durationDays} day duration</p>
          )}
        </div>
        <Badge variant={TREATY_VARIANT[treaty.status]}>
          {TREATY_ICON[treaty.status]}
          {treaty.status}
        </Badge>
      </div>

      {treaty.terms && treaty.terms.length > 0 && (
        <div className="text-xs text-text-secondary space-y-0.5">
          {treaty.terms.map((t, i) => (
            <p key={i}>
              <span className="text-text-muted">{t.type}:</span> {t.value}
            </p>
          ))}
        </div>
      )}

      {err && <Alert variant="danger">{err}</Alert>}

      <div className="flex gap-1.5 flex-wrap">
        {treaty.status === "proposed" && (
          <Button size="sm" variant="success" loading={busy} onClick={() => act("sign")}>
            Sign
          </Button>
        )}
        {treaty.status === "active" && (
          <Button
            size="sm"
            variant="outline"
            loading={busy}
            onClick={() => act("suspend", { reason: "Operator action" })}
          >
            Suspend
          </Button>
        )}
        {(treaty.status === "active" || treaty.status === "suspended") && (
          <Button size="sm" variant="danger" loading={busy} onClick={() => act("terminate")}>
            Terminate
          </Button>
        )}
      </div>
    </Card>
  );
}

function ProposeTreatyForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [partyA, setPartyA] = useState("");
  const [partyB, setPartyB] = useState("");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!name.trim() || !partyA.trim() || !partyB.trim()) {
      setErr("Name, Party A, and Party B are required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await rpc("republic.diplomacy.treaty.propose", {
        name: name.trim(),
        partyA: partyA.trim(),
        partyB: partyB.trim(),
        terms: [{ type: "mutual-non-aggression", value: "No military action for treaty duration" }],
        proposedBy: "operator",
        durationDays: duration,
      });
      invalidateRpcCache("republic.diplomacy.treaties");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h4 className="font-semibold text-text-heading text-sm">Propose New Treaty</h4>
      {err && <Alert variant="danger">{err}</Alert>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">Treaty Name</label>
          <input
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder="Non-Aggression Pact"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Duration (days)</label>
          <input
            type="number"
            min={1}
            max={365}
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary focus:outline-none focus:border-accent"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Party A (Domain)</label>
          <input
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder="economy"
            value={partyA}
            onChange={(e) => setPartyA(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Party B (Domain)</label>
          <input
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder="governance"
            value={partyB}
            onChange={(e) => setPartyB(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" loading={busy} icon={<Plus size={13} />} onClick={submit}>
          Propose Treaty
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DiplomacyPage() {
  const [tab, setTab] = useState<"treaties" | "conflicts" | "events">("treaties");
  const [showPropose, setShowPropose] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data: diagData, loading, error, refetch } = useRpc<DiplomacyDiag>("republic.diplomacy.diagnostics", {}, [], {
    staleTimeMs: 15_000,
  });
  const { data: treatyData, refetch: refetchTreaties } = useRpc<{ treaties?: Treaty[] }>(
    "republic.diplomacy.treaties",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 30_000 },
  );
  const { data: conflictData, refetch: refetchConflicts } = useRpc<{ conflicts?: Conflict[] }>(
    "republic.diplomacy.conflicts",
    {},
    [],
    { staleTimeMs: 10_000 },
  );
  const { data: eventsData, refetch: refetchEvents } = useRpc<{ events?: DiplomacyEvent[] }>(
    "republic.diplomacy.events",
    { limit: 50 },
    [],
    { staleTimeMs: 8_000, refetchIntervalMs: 20_000 },
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const treaties = treatyData?.treaties ?? [];
  const conflicts = conflictData?.conflicts ?? [];
  const events = eventsData?.events ?? [];

  async function registerConflict() {
    const domainA = prompt("Domain A (e.g. economy):");
    const domainB = prompt("Domain B (e.g. governance):");
    const description = prompt("Conflict description:");
    if (!domainA || !domainB || !description) {
      return;
    }
    try {
      await rpc("republic.diplomacy.conflict.register", {
        domainA,
        domainB,
        description,
        severity: "medium",
      });
      invalidateRpcCache("republic.diplomacy.conflicts");
      refetchConflicts();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function resolveConflict(conflictId: string) {
    const resolution = prompt("Resolution description:");
    if (!resolution) {
      return;
    }
    try {
      await rpc("republic.diplomacy.conflict.resolve", { conflictId, resolution: "negotiated" });
      invalidateRpcCache("republic.diplomacy.conflicts");
      refetchConflicts();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const TABS = [
    {
      id: "treaties" as const,
      label: `Treaties (${treaties.length})`,
      icon: <HandshakeIcon size={14} />,
    },
    {
      id: "conflicts" as const,
      label: `Conflicts (${conflicts.filter((c) => !c.resolved).length})`,
      icon: <Swords size={14} />,
    },
    { id: "events" as const, label: `Events (${events.length})`, icon: <Zap size={14} /> },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Diplomacy"
        description="Inter-domain treaty negotiation, conflict resolution, and diplomatic event feed"
        icon={<Globe size={28} />}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => {
              refetchTreaties();
              refetchConflicts();
              refetchEvents();
            }}
          >
            Refresh
          </Button>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Active Treaties"
          value={diagData?.activeTreaties ?? 0}
          icon={<Shield size={16} />}
        />
        <StatCard
          label="Total Treaties"
          value={diagData?.totalTreaties ?? 0}
          icon={<HandshakeIcon size={16} />}
        />
        <StatCard
          label="Open Conflicts"
          value={diagData?.unresolvedConflicts ?? 0}
          icon={<AlertTriangle size={16} />}
        />
        <StatCard
          label="Diplo Events"
          value={diagData?.totalEvents ?? 0}
          icon={<Zap size={16} />}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
type="button"             key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              tab === t.id
                ? "bg-accent text-white"
                : "bg-bg-secondary text-text-muted hover:text-text-primary"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Treaties Tab */}
      {tab === "treaties" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text-heading">Active Treaties</h3>
            <Button
              size="sm"
              icon={<Plus size={13} />}
              onClick={() => setShowPropose(!showPropose)}
            >
              Propose
            </Button>
          </div>

          {showPropose && (
            <ProposeTreatyForm
              onDone={() => {
                setShowPropose(false);
                refetchTreaties();
              }}
            />
          )}

          {treaties.length === 0 ? (
            <Card className="text-center py-10">
              <HandshakeIcon size={36} className="mx-auto mb-3 text-text-muted opacity-30" />
              <p className="text-text-muted text-sm">
                No treaties yet — propose one to begin diplomacy
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {treaties.map((t) => (
                <TreatyCard key={t.id} treaty={t} onRefresh={refetchTreaties} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Conflicts Tab */}
      {tab === "conflicts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text-heading">Domain Conflicts</h3>
            <Button
              size="sm"
              variant="outline"
              icon={<Plus size={13} />}
              onClick={registerConflict}
            >
              Register
            </Button>
          </div>

          {conflicts.length === 0 ? (
            <Card className="text-center py-10">
              <Shield size={36} className="mx-auto mb-3 text-text-muted opacity-30" />
              <p className="text-text-muted text-sm">No conflicts registered</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {conflicts.map((c) => (
                <Card key={c.id} className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={SEVERITY_VARIANT[c.severity]}>{c.severity}</Badge>
                      {c.resolved && <Badge variant="success">Resolved</Badge>}
                    </div>
                    <p className="text-sm text-text-heading font-medium">
                      {c.domainA} ↔ {c.domainB}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{c.description}</p>
                    {c.resolution && <p className="text-xs text-success mt-1">✓ {c.resolution}</p>}
                  </div>
                  {!c.resolved && (
                    <Button size="sm" variant="outline" onClick={() => resolveConflict(c.id)}>
                      Resolve
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Events Tab */}
      {tab === "events" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text-heading">Diplomatic Events</h3>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={13} />}
              onClick={refetchEvents}
            >
              Refresh
            </Button>
          </div>

          {events.length === 0 ? (
            <Card className="text-center py-10">
              <Zap size={36} className="mx-auto mb-3 text-text-muted opacity-30" />
              <p className="text-text-muted text-sm">No diplomatic events recorded yet</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {events.toReversed()
                .slice(0, 50)
                .map((e, i) => (
                  <div
                    key={e.id ?? i}
                    className="flex items-start gap-3 py-2.5 px-3 rounded-lg bg-bg-secondary/60 border border-border/20"
                  >
                    <Zap size={12} className="text-accent mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-text-heading">{e.kind}</span>
                        <Badge variant="neutral" className="!text-[10px]">
                          {e.sourceDomain}
                        </Badge>
                      </div>
                      {Object.keys(e.payload ?? {}).length > 0 && (
                        <p className="text-[11px] text-text-muted mt-0.5 truncate">
                          {JSON.stringify(e.payload).slice(0, 80)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
