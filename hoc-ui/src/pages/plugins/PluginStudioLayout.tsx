/**
 * PluginStudioLayout — Shared layout shell for plugin category studio pages.
 *
 * Renders a sidebar of plugin tabs on the left and the active plugin panel
 * on the right. Also provides a "Submit to Queue" modal so any studio action
 * can be submitted for citizen queue/senior approval rather than run directly.
 */

import { ChevronRight, Clock, Send, X, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, PluginBadge } from "@/components/ui";
import { rpc } from "@/lib/rpc";

export interface StudioPlugin {
  id: string;
  name: string;
  icon: string;
  description?: string;
  status?: string;
}

interface PluginStudioLayoutProps {
  title: string;
  categoryIcon: React.ReactNode;
  plugins: StudioPlugin[];
  renderPanel: (pluginId: string) => React.ReactNode;
  defaultPlugin?: string;
}

// ─── Submit to Queue Modal ────────────────────────────────────────

interface QueueModalProps {
  pluginId: string;
  method: string;
  params: Record<string, unknown>;
  onClose: () => void;
}

function QueueModal({ pluginId, method, params, onClose }: QueueModalProps) {
  const [citizenName, setCitizenName] = useState("Operator");
  const [priority, setPriority] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await rpc("republic.plugin-queue.submit", {
        pluginId,
        method,
        params,
        citizenName,
        priority,
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 space-y-4 animate-fade-in shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-accent" />
            <h3 className="font-bold text-text-heading">Submit to Citizen Queue</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {submitted ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-text-heading">Job Submitted!</p>
            <p className="text-sm text-text-muted mt-1">Awaiting senior citizen approval.</p>
            <Button size="sm" variant="outline" onClick={onClose} className="mt-4">
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="bg-bg-secondary rounded-xl p-3 space-y-1 text-xs font-mono">
              <div className="text-accent">{pluginId}</div>
              <div className="text-text-muted">{method}</div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">
                  Your Name / Citizen ID
                </label>
                <input
                  type="text"
                  value={citizenName}
                  onChange={(e) => setCitizenName(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">
                  Priority (1=low → 5=urgent)
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((p) => (
                    <button
type="button"                       key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        priority === p
                          ? "bg-accent text-white"
                          : "bg-bg-secondary text-text-muted hover:bg-bg-card"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-danger">
                <AlertCircle size={12} />
                {error}
              </div>
            )}

            <Button
              onClick={() => void submit()}
              loading={submitting}
              icon={<Send size={14} />}
              className="w-full"
            >
              Submit for Approval
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Context for child panels to trigger queue submission ─────────

export interface QueueSubmitPayload {
  method: string;
  params: Record<string, unknown>;
}

// ─── Main Layout ──────────────────────────────────────────────────

export function PluginStudioLayout({
  title,
  categoryIcon,
  plugins,
  renderPanel,
  defaultPlugin,
}: PluginStudioLayoutProps) {
  const [activeId, setActiveId] = useState(defaultPlugin ?? plugins[0]?.id ?? "");
  const [queueModal, setQueueModal] = useState<QueueSubmitPayload | null>(null);

  const activePlugin = plugins.find((p) => p.id === activeId);

  return (
    <div className="flex h-full min-h-[calc(100vh-8rem)] animate-fade-in">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-border/50 flex flex-col">
        {/* Category Header */}
        <div className="px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <span className="text-accent">{categoryIcon}</span>
            <h2 className="text-sm font-bold text-text-heading">{title}</h2>
          </div>
        </div>

        {/* Plugin List */}
        <nav className="flex-1 overflow-y-auto py-2">
          {plugins.map((plugin) => {
            const isActive = plugin.id === activeId;
            const isActivePluginStatus = plugin.status === "active" || plugin.status === "ready";
            return (
              <button
type="button"                 key={plugin.id}
                onClick={() => setActiveId(plugin.id)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors ${
                  isActive
                    ? "bg-accent/10 text-text-heading border-r-2 border-accent"
                    : "text-text-secondary hover:bg-bg-card/50 hover:text-text-heading"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base flex-shrink-0">{plugin.icon}</span>
                  <span className="text-xs font-medium truncate">{plugin.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isActivePluginStatus ? "bg-success" : "bg-text-muted/30"}`}
                  />
                  {isActive && <ChevronRight size={10} className="text-accent" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Queue Shortcut */}
        <div className="p-3 border-t border-border/30">
          <a
            href="/plugins/queue"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-secondary hover:bg-bg-card text-xs text-text-muted hover:text-text-heading transition-colors"
          >
            <Clock size={12} className="text-accent" />
            Job Queue
            <Badge variant="info" className="!text-[9px] ml-auto">
              Queue
            </Badge>
          </a>
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex-1 overflow-y-auto">
        {/* Panel Header */}
        {activePlugin && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-border/30 bg-bg-primary/95 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl">{activePlugin.icon}</span>
              <div>
                <h3 className="text-sm font-bold text-text-heading">{activePlugin.name}</h3>
                {activePlugin.description && (
                  <p className="text-xs text-text-muted line-clamp-1">{activePlugin.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PluginBadge pluginId={activePlugin.id} />
              <Button
                size="sm"
                variant="outline"
                icon={<Clock size={12} />}
                onClick={() => setQueueModal({ method: activeId + ".default", params: {} })}
              >
                Queue Job
              </Button>
            </div>
          </div>
        )}

        <div className="p-5">
          {plugins.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <Loader2 size={32} className="animate-spin mx-auto mb-3" />
              <p className="text-sm">Loading plugins...</p>
            </div>
          ) : (
            renderPanel(activeId)
          )}
        </div>
      </div>

      {/* Queue Submission Modal */}
      {queueModal && activePlugin && (
        <QueueModal
          pluginId={activePlugin.id}
          method={queueModal.method}
          params={queueModal.params}
          onClose={() => setQueueModal(null)}
        />
      )}
    </div>
  );
}
