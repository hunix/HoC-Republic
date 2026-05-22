import {
  Zap,
  // oxlint-disable-next-line no-unused-vars
  Plus,
  Trash2,
  Power,
  PowerOff,
  Clock,
  Mail,
  Globe,
  Monitor,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { Card, Badge, RpcStatus, EmptyState, ConfirmDialog } from "@/components/ui";
import { useRpc, mutateRpc } from "@/lib/rpc";

type Trigger = {
  id: string;
  name: string;
  source: string;
  status: string;
  fireCount: number;
  maxFires: number;
  cooldownMs: number;
  createdAt: string;
  lastFiredAt?: string;
};

type ProactiveDiag = {
  totalTriggers: number;
  activeTriggers: number;
  totalFires: number;
  triggersBySource: Record<string, number>;
};

const sourceIcons: Record<string, React.ReactNode> = {
  system: <Monitor size={14} />,
  email: <Mail size={14} />,
  cron: <Clock size={14} />,
  webhook: <Globe size={14} />,
  file_watch: <FileText size={14} />,
  calendar: <Clock size={14} />,
};

const statusBadge = (s: string): "success" | "warning" | "danger" | "neutral" =>
  s === "active" ? "success" : s === "paused" ? "warning" : s === "expired" ? "danger" : "neutral";

export function ProactivePanel() {
  const { data, loading, error, refetch } = useRpc<{ triggers?: Trigger[] }>(
    "republic.sovereign.proactive.list",
    {},
    [],
    { staleTimeMs: 5_000 },
  );
  const { data: diag } = useRpc<ProactiveDiag>("republic.sovereign.proactive.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const triggers = data?.triggers ?? [];

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }
    await mutateRpc("republic.sovereign.proactive.delete", { id: deleteId });
    setDeleteId(null);
    refetch();
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await mutateRpc("republic.sovereign.proactive.setStatus", { id, status: newStatus });
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{diag?.totalTriggers ?? 0}</p>
          <p className="text-xs text-text-muted">Total Triggers</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-success">{diag?.activeTriggers ?? 0}</p>
          <p className="text-xs text-text-muted">Active</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-accent">{diag?.totalFires ?? 0}</p>
          <p className="text-xs text-text-muted">Total Fires</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">
            {Object.keys(diag?.triggersBySource ?? {}).length}
          </p>
          <p className="text-xs text-text-muted">Source Types</p>
        </Card>
      </div>

      {/* Source breakdown chips */}
      {diag?.triggersBySource && Object.keys(diag.triggersBySource).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(diag.triggersBySource).map(([source, count]) => (
            <div
              key={source}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-bg-secondary text-text-secondary"
            >
              {sourceIcons[source] ?? <Zap size={12} />}
              {source} ({count})
            </div>
          ))}
        </div>
      )}

      {/* Triggers list */}
      {triggers.length === 0 ? (
        <EmptyState
          icon={<Zap size={40} />}
          title="No proactive triggers"
          description="Create triggers to automate actions based on system events, schedules, emails, webhooks, or file changes."
        />
      ) : (
        <div className="space-y-2">
          {triggers.map((t) => (
            <Card key={t.id} hover className="group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-bg-secondary text-text-muted">
                    {sourceIcons[t.source] ?? <Zap size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-text-heading truncate">{t.name}</h4>
                      <Badge variant={statusBadge(t.status)}>{t.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span>Source: {t.source}</span>
                      <span>Fired: {t.fireCount}×</span>
                      {t.maxFires > 0 && <span>Max: {t.maxFires}</span>}
                      <span>Cooldown: {Math.round(t.cooldownMs / 1000)}s</span>
                      {t.lastFiredAt && (
                        <span>Last: {new Date(t.lastFiredAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="p-1.5 rounded-md hover:bg-warning/10 text-warning"
                    onClick={() => toggleStatus(t.id, t.status)}
                    aria-label={t.status === "active" ? "Pause trigger" : "Activate trigger"}
                  >
                    {t.status === "active" ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>
                  <button
                    className="p-1.5 rounded-md hover:bg-danger/10 text-danger"
                    onClick={() => setDeleteId(t.id)}
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Trigger"
        message="This will permanently remove this trigger. Scheduled or watched events will no longer fire."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
