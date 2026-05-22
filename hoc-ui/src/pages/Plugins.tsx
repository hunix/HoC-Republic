/**
 * Plugins — compact, modern grid with slide-over drawer.
 */
import {
  Puzzle,
  Search,
  Power,
  Settings,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Layers,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, Alert, Tabs, StatCard } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";
import type { PluginManifest } from "./plugins/GenericPluginPanel";
import { PluginDrawer } from "./plugins/PluginDrawer";

interface GatewayPlugin {
  id: string;
  name: string;
  version?: string;
  status?: string;
  toolCount?: number;
  category?: string;
  description?: string;
  sourceRepo?: string;
  capabilities?:
    | {
        gateway?: string[];
        tools?: string[];
        inference?: boolean;
      }
    | string[];
}

export function PluginsPage() {
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedPlugin, setSelectedPlugin] = useState<PluginManifest | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useRpc<{
    plugins?: GatewayPlugin[];
    skills?: GatewayPlugin[];
    channels?: Array<{
      id: string;
      name?: string;
      version?: string;
      enabled?: boolean;
      methods?: string[];
    }>;
  }>("republic.plugins.list", {});

  const rawPlugins: GatewayPlugin[] = [
    ...(data?.plugins ?? []),
    ...(data?.skills ?? []),
    ...(data?.channels ?? []).map((c) => ({
      id: c.id,
      name: c.name ?? c.id,
      status: c.enabled !== false ? "active" : "disabled",
      toolCount: c.methods?.length,
      category: "channel",
    })),
  ];
  const plugins: GatewayPlugin[] = rawPlugins.length > 0 ? rawPlugins : [];
  const done = !loading;
  const categories = ["all", ...Array.from(new Set(plugins.map((p) => p.category ?? "other")))];
  const filtered = plugins.filter((p) => {
    if (tab !== "all" && (p.category ?? "other") !== tab) {
      return false;
    }
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const activeCount = plugins.filter(
    (p) => p.status === "active" || p.status === "enabled" || p.status === "ready",
  ).length;
  const totalTools = plugins.reduce((s, p) => s + (p.toolCount ?? 0), 0);
  const totalGatewayMethods = plugins.reduce((s, p) => {
    const caps = p.capabilities;
    if (Array.isArray(caps)) {
      return s;
    }
    return s + (caps?.gateway?.length ?? 0);
  }, 0);

  async function togglePlugin(plugin: GatewayPlugin) {
    const method =
      plugin.status === "active" || plugin.status === "enabled" || plugin.status === "ready"
        ? "republic.plugins.deactivate"
        : "republic.plugins.activate";
    setToggleError(null);
    try {
      await rpc(method, { id: plugin.id });
      refetch();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : `Toggle failed for ${plugin.id}`);
    }
  }

  function openPlugin(plugin: GatewayPlugin) {
    setSelectedPlugin({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      status: plugin.status,
      sourceRepo: plugin.sourceRepo,
      capabilities: plugin.capabilities,
    });
  }

  return (
    <div className="animate-fade-in space-y-5 p-5">
      {toggleError && <Alert variant="danger">{toggleError}</Alert>}

      <PageHeader
        title="Plugins"
        description={
          loading
            ? "Loading…"
            : error
              ? "Gateway unreachable"
              : `${activeCount} active · ${totalTools} tools · ${plugins.length} total`
        }
        icon={<Puzzle size={20} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={13} />}
            aria-label="Refresh"
            onClick={refetch}
          />
        }
      />

      {/* Stats */}
      {done && !error && plugins.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total" value={plugins.length} icon={<Puzzle size={14} />} />
          <StatCard label="Active" value={activeCount} icon={<Layers size={14} />} />
          <StatCard label="Tools" value={totalTools} icon={<Settings size={14} />} />
          <StatCard label="Methods" value={totalGatewayMethods} icon={<ExternalLink size={14} />} />
        </div>
      )}

      {/* Error */}
      {done && error && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-warning/10 border border-warning/30 text-xs text-warning">
          <AlertCircle size={14} />
          <span>RPC unavailable: {error}</span>
        </div>
      )}

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins…"
            className="w-full bg-bg-input border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-1 focus:ring-accent-glow transition-all"
          />
        </div>
        {done && (
          <Tabs
            tabs={categories.map((c) => ({
              id: c,
              label: c.charAt(0).toUpperCase() + c.slice(1),
              count:
                c === "all"
                  ? plugins.length
                  : plugins.filter((p) => (p.category ?? "other") === c).length,
            }))}
            active={tab}
            onChange={setTab}
          />
        )}
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-bg-card animate-pulse border border-border/30"
            />
          ))}
        </div>
      )}

      {/* Grid */}
      {done && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-16">
              <Puzzle size={32} className="text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-text-muted">
                {plugins.length === 0 ? "No plugins registered." : "No plugins match your search."}
              </p>
            </div>
          ) : (
            filtered.map((plugin) => {
              const isActive =
                plugin.status === "active" ||
                plugin.status === "enabled" ||
                plugin.status === "ready";
              const caps = plugin.capabilities;
              const gatewayCount = Array.isArray(caps) ? 0 : (caps?.gateway?.length ?? 0);
              const toolsCount = Array.isArray(caps)
                ? 0
                : (caps?.tools?.length ?? plugin.toolCount ?? 0);

              return (
                <Card
                  key={plugin.id}
                  compact
                  className="group flex flex-col cursor-pointer"
                  hover
                  onClick={() => openPlugin(plugin)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-accent/10" : "bg-bg-input"}`}
                      >
                        <Puzzle
                          size={14}
                          className={isActive ? "text-accent" : "text-text-muted"}
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-text-heading line-clamp-1">
                          {plugin.name}
                        </h3>
                        <p className="text-[10px] text-text-muted">v{plugin.version ?? "?"}</p>
                      </div>
                    </div>
                    <Badge variant={isActive ? "success" : "neutral"} dot>
                      {plugin.status ?? "unknown"}
                    </Badge>
                  </div>

                  {plugin.description && (
                    <p className="text-[10px] text-text-muted mb-2 line-clamp-2 flex-1">
                      {plugin.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/20">
                    <div className="flex gap-1.5 text-[10px] text-text-muted items-center">
                      {toolsCount > 0 && <span>{toolsCount} tools</span>}
                      {gatewayCount > 0 && (
                        <>
                          {toolsCount > 0 && <span className="opacity-30">·</span>}
                          <span>{gatewayCount} methods</span>
                        </>
                      )}
                      <Badge variant="info" className="!text-[9px]">
                        {plugin.category ?? "other"}
                      </Badge>
                    </div>

                    <button
                      type="button"
                      className="p-1 rounded hover:bg-bg-card-hover text-text-muted transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        void togglePlugin(plugin);
                      }}
                      title={isActive ? "Disable" : "Enable"}
                      aria-label={isActive ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
                    >
                      <Power size={12} className={isActive ? "text-success" : "text-text-muted"} />
                    </button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      <PluginDrawer plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />
    </div>
  );
}
