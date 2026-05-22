import {
  Plug2,
  RefreshCcw,
  Search,
  Zap,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  Badge,
  Card,
  StatCard,
  Tabs,
  RpcStatus,
  Button,
  EmptyState,
  Alert,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface ComposioTool {
  name: string;
  description: string;
  category: string;
}

interface ComposioApp {
  name: string;
  toolCount: number;
}

export function ComposioPage() {
  const { data, loading, error, refetch } = useRpc<{
    connected: boolean;
    enabled: boolean;
    toolCount: number;
    lastSync: number;
    mcpUrl: string;
    error: string | null;
    upSince: number;
  }>("republic.composio.status", {});

  const { data: toolsData } = useRpc<{ tools: ComposioTool[]; total: number }>(
    "republic.composio.tools",
    { limit: 200 },
  );
  const { data: appsData } = useRpc<{ apps: ComposioApp[] }>("republic.composio.apps", {});

  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [reconnecting, setReconnecting] = useState(false);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const connected = data?.connected ?? false;
  const toolCount = data?.toolCount ?? 0;
  const lastSync = data?.lastSync ? new Date(data.lastSync).toLocaleString() : "Never";
  const tools = (toolsData?.tools ?? []).filter(
    (t) =>
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const apps = appsData?.apps ?? [];

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await rpc("republic.composio.reconnect", {});
      refetch();
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Composio"
        description={`${toolCount} tools · ${apps.length} apps · ${connected ? "Connected" : "Disconnected"}`}
        icon={<Plug2 size={20} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReconnect}
            disabled={reconnecting}
            icon={
              reconnecting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCcw size={12} />
              )
            }
            aria-label="Reconnect"
          >
            Reconnect
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Status"
          value={connected ? "Connected" : "Off"}
          icon={connected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
        />
        <StatCard label="Tools" value={toolCount} icon={<Zap size={14} />} />
        <StatCard label="Apps" value={apps.length} icon={<Plug2 size={14} />} />
        <StatCard label="Last Sync" value={lastSync} icon={<RefreshCcw size={14} />} />
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "tools", label: "Tools", count: toolCount },
          { id: "apps", label: "Apps", count: apps.length },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "overview" && (
        <div className="space-y-3">
          {data?.error && <Alert variant="warning">{data.error}</Alert>}
          {!connected && !data?.error && (
            <Alert variant="info">
              Get your key from{" "}
              <a
                href="https://dashboard.composio.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                dashboard.composio.dev <ExternalLink size={10} className="inline" />
              </a>
            </Alert>
          )}
          <Card compact>
            <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
              Connection
            </h3>
            <div className="space-y-1.5 text-xs text-text-secondary">
              <div className="flex justify-between">
                <span>MCP URL</span>
                <code className="text-text-primary text-[10px] bg-bg-input px-1.5 py-0.5 rounded">
                  {data?.mcpUrl ?? "—"}
                </code>
              </div>
              <div className="flex justify-between">
                <span>Enabled</span>
                <Badge variant={data?.enabled ? "success" : "neutral"} dot>
                  {data?.enabled ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Up Since</span>
                <span className="text-text-primary tabular-nums">
                  {data?.upSince ? new Date(data.upSince).toLocaleString() : "—"}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "tools" && (
        <div className="space-y-3">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              placeholder="Search tools…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 bg-bg-input border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
            />
          </div>
          {tools.length === 0 ? (
            <EmptyState
              title="No tools"
              description={searchQuery ? "Try different term" : "Connect to Composio"}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {tools.slice(0, 60).map((tool) => (
                <div
                  key={tool.name}
                  className="px-2.5 py-2 rounded-lg border border-border/20 hover:border-border/40 bg-bg-card transition-colors"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-medium text-text-primary truncate">
                        {tool.name}
                      </h4>
                      <p className="text-[10px] text-text-muted mt-0.5 line-clamp-2">
                        {tool.description || "—"}
                      </p>
                    </div>
                    <Badge variant="info">{tool.category}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "apps" && (
        <div>
          {apps.length === 0 ? (
            <EmptyState title="No apps" description="Connect to see SaaS apps" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {apps.map((app) => (
                <div
                  key={app.name}
                  className="text-center px-2.5 py-3 rounded-lg border border-border/20 hover:border-border/40 bg-bg-card transition-colors"
                >
                  <div className="text-xs font-semibold text-text-heading uppercase">
                    {app.name}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">{app.toolCount} tools</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
