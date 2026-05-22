/**
 * PluginBadge — Lightweight inline widget showing plugin status + control.
 *
 * Drop into any page header to:
 *  ● Show which plugin(s) power the page
 *  ● See activation status (green/red dot)
 *  ● Toggle the plugin on/off without navigating to Plugins page
 *  ● Link to the full plugin studio page
 *
 * Usage:
 *   <PluginBadge pluginId="hoc-plugin-bark" />
 *   <PluginBadge pluginId="hoc-plugin-bark" studioPath="/plugins/audio" />
 */

import { Power, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────────

interface PluginInfo {
  id: string;
  name: string;
  status?: string;
  version?: string;
}

interface PluginBadgeProps {
  /** Plugin identifier, e.g. "hoc-plugin-bark" */
  pluginId: string;
  /** Optional route to the plugin's full studio page */
  studioPath?: string;
  /** If true, show a compact version without the name */
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────

export function PluginBadge({ pluginId, studioPath, compact }: PluginBadgeProps) {
  const [toggling, setToggling] = useState(false);

  // Fetch the full plugin list and find this plugin
  const { data } = useRpc<{
    plugins?: PluginInfo[];
    skills?: PluginInfo[];
    channels?: Array<{ id: string; name?: string; enabled?: boolean }>;
  }>("republic.plugins.list", {}, [], { staleTimeMs: 10_000, refetchIntervalMs: 15_000 });

  const allPlugins: PluginInfo[] = [
    ...(data?.plugins ?? []),
    ...(data?.skills ?? []),
    ...(data?.channels ?? []).map((c) => ({
      id: c.id,
      name: c.name ?? c.id,
      status: c.enabled !== false ? "active" : "disabled",
    })),
  ];

  const plugin = allPlugins.find((p) => p.id === pluginId);
  const isActive =
    plugin?.status === "active" ||
    plugin?.status === "enabled" ||
    plugin?.status === "ready";

  const displayName = plugin?.name ?? pluginId.replace(/^hoc-plugin-/, "").replace(/-/g, " ");

  async function toggle() {
    setToggling(true);
    try {
      const method = isActive ? "republic.plugins.deactivate" : "republic.plugins.activate";
      await rpc(method, { id: pluginId });
      invalidateRpcCache("republic.plugins.list");
    } catch {
      // Silently fail — status will be stale but won't crash
    } finally {
      setToggling(false);
    }
  }

  return (
    <div
      className={`
        inline-flex items-center gap-2 rounded-xl border border-border/40
        bg-bg-secondary/60 backdrop-blur-sm
        ${compact ? "px-2 py-1" : "px-3 py-1.5"}
        text-xs transition-all duration-200 hover:border-border-hover
      `}
    >
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          plugin == null
            ? "bg-text-muted/30"
            : isActive
              ? "bg-success animate-pulse"
              : "bg-danger"
        }`}
        title={plugin == null ? "Not found" : isActive ? "Active" : "Inactive"}
      />

      {/* Plugin name */}
      {!compact && (
        <span className="text-text-secondary font-medium capitalize truncate max-w-32">
          {displayName}
        </span>
      )}

      {/* Toggle button */}
      <button
        type="button"
        onClick={toggle}
        disabled={toggling || plugin == null}
        className={`
          p-1 rounded-lg transition-colors disabled:opacity-40
          ${isActive
            ? "text-success hover:bg-success/10"
            : "text-text-muted hover:bg-bg-card"
          }
        `}
        aria-label={isActive ? `Deactivate ${displayName}` : `Activate ${displayName}`}
        title={isActive ? "Deactivate plugin" : "Activate plugin"}
      >
        {toggling ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Power size={12} />
        )}
      </button>

      {/* Link to studio page */}
      {studioPath && (
        <a
          href={studioPath}
          className="p-1 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          title={`Open ${displayName} in studio`}
          aria-label={`Open ${displayName} studio`}
        >
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

// ─── Multi-Plugin Badge Row ──────────────────────────────────────

interface PluginBadgeRowProps {
  /** Array of plugin IDs */
  pluginIds: string[];
  /** Optional studio path for all plugins */
  studioPath?: string;
}

/**
 * Render a row of PluginBadge widgets — use when a page is powered by multiple plugins.
 */
export function PluginBadgeRow({ pluginIds, studioPath }: PluginBadgeRowProps) {
  if (pluginIds.length === 0) {return null;}
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pluginIds.map((id) => (
        <PluginBadge key={id} pluginId={id} studioPath={studioPath} compact={pluginIds.length > 3} />
      ))}
    </div>
  );
}
