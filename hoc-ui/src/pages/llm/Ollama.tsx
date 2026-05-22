import { Bot, Download, Trash2, Play, Square, RefreshCw, Search, HardDrive, Loader2 } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, ProgressBar, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface OllamaModel {
  name: string;
  size?: string;
  quantization?: string;
  status?: "loaded" | "available" | "downloading";
  downloadProgress?: number;
  params?: string;
  contextLen?: number;
  tokensPerSec?: number;
  digest?: string;
  modifiedAt?: string;
}

const STATUS_BADGE: Record<string, "success" | "neutral" | "info"> = {
  loaded: "success",
  available: "neutral",
  downloading: "info",
};

export function OllamaDashboardPage() {
  // republic.compute.local.status returns real Ollama data when the gateway
  // HoC plugin is running and Ollama is installed
  const { data, refetch, loading, error } = useRpc<{
    ollama?: {
      running?: boolean;
      models?: OllamaModel[];
      version?: string;
    };
    models?: OllamaModel[];
  }>("republic.compute.local.status", {});

  const [search, setSearch] = useState("");
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatOutput, setChatOutput] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const models: OllamaModel[] = data?.ollama?.models ?? data?.models ?? [];
  const filtered = models.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const loadedModel = models.find((m) => m.status === "loaded");
  const ollamaRunning = data?.ollama?.running ?? false;

  // Compute disk usage from model sizes (sum GB values from size strings like "4.1GB")
  const diskUsedGB = models.reduce((sum, m) => {
    if (!m.size) { return sum; }
    const gb = parseFloat(m.size.replace(/GB$/i, ""));
    return sum + (isNaN(gb) ? 0 : gb);
  }, 0);

  async function handleLoad(name: string) {
    setActionLoading(`load-${name}`);
    try {
      await rpc("republic.compute.ollama.load", { name });
      refetch();
    } catch (err) {
      console.error("Load failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnload(name: string) {
    setActionLoading(`unload-${name}`);
    try {
      await rpc("republic.compute.ollama.unload", { name });
      refetch();
    } catch (err) {
      console.error("Unload failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(name: string) {
    setActionLoading(`delete-${name}`);
    try {
      await rpc("republic.compute.ollama.delete", { name });
      refetch();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function testChat() {
    if (!loadedModel || !chatPrompt.trim()) { return; }
    setChatLoading(true);
    setChatOutput("▌ Thinking...");
    try {
      const res = await rpc("republic.compute.ollama.generate", {
        name: loadedModel.name,
        prompt: chatPrompt,
      }) as { response?: string; tokensPerSec?: number; totalDurationMs?: number };
      const perf = res.tokensPerSec ? ` (${res.tokensPerSec} tok/s, ${res.totalDurationMs}ms)` : "";
      setChatOutput(`${res.response ?? ""}${perf ? `\n\n─── ${perf}` : ""}`);
    } catch (err) {
      setChatOutput(`Error: ${String(err)}`);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Ollama"
        description="Manage local Ollama models and test inference"
        icon={<Bot size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Sync Models
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Ollama" value={ollamaRunning ? "Online" : "Offline"} icon={<Bot size={16} />} sub={ollamaRunning ? `${models.length} models` : "Not running"} />
        <StatCard
          label="Loaded"
          value={models.filter((m) => m.status === "loaded").length}
          icon={<Play size={16} />}
        />
        <StatCard label="Disk Used" value={diskUsedGB > 0 ? `${diskUsedGB.toFixed(1)} GB` : "—"} icon={<HardDrive size={16} />} />
        <StatCard
          label="Tokens/sec"
          value={`${loadedModel?.tokensPerSec ?? 0}`}
          sub={loadedModel?.name}
          icon={<RefreshCw size={16} />}
        />
      </div>

      {/* Model list */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="font-semibold text-text-heading">🤖 Models</h3>
          <div className="relative flex-1 max-w-xs">
            <Search
              size={12}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              className="w-full pl-8 pr-3 py-1.5 bg-bg-secondary border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              placeholder="Filter models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-3">
          {filtered.map((m) => (
            <Card key={m.name}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-xl flex-shrink-0">
                  🦙
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-mono font-semibold text-text-heading text-sm">{m.name}</p>
                    <Badge variant={STATUS_BADGE[m.status ?? "available"] ?? "neutral"}>
                      {m.status ?? "available"}
                    </Badge>
                    {m.tokensPerSec && <Badge variant="info">{m.tokensPerSec} tok/s</Badge>}
                  </div>
                  <div className="flex gap-3 text-xs text-text-muted">
                    <span>{m.params} params</span>
                    <span>{m.quantization}</span>
                    <span>{m.size}</span>
                    <span>
                      {m.contextLen != null ? `${(m.contextLen / 1000).toFixed(0)}K ctx` : ""}
                    </span>
                  </div>
                  {m.status === "downloading" && m.downloadProgress !== undefined && (
                    <div className="mt-2">
                      <ProgressBar
                        value={m.downloadProgress * 100}
                        labelLeft="Downloading..."
                        labelRight={`${(m.downloadProgress * 100).toFixed(0)}%`}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {m.status === "available" && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Download size={12} />}
                      onClick={async () => {
                        await rpc("republic.compute.local.download", {
                          type: "ollama",
                          repoOrTag: m.name,
                        });
                        refetch();
                      }}
                    >
                      Pull
                    </Button>
                  )}
                  {m.status === "loaded" && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={actionLoading === `unload-${m.name}` ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                      onClick={() => handleUnload(m.name)}
                      disabled={actionLoading === `unload-${m.name}`}
                    >
                      {actionLoading === `unload-${m.name}` ? "Unloading…" : "Unload"}
                    </Button>
                  )}
                  {m.status !== "loaded" && m.status !== "downloading" && (
                    <Button
                      size="sm"
                      icon={actionLoading === `load-${m.name}` ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      onClick={() => handleLoad(m.name)}
                      disabled={actionLoading === `load-${m.name}`}
                    >
                      {actionLoading === `load-${m.name}` ? "Loading…" : "Load"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={actionLoading === `delete-${m.name}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    onClick={() => handleDelete(m.name)}
                    disabled={actionLoading === `delete-${m.name}`}
                    aria-label={`Delete ${m.name}`}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Test chat */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-3">💬 Test Inference</h3>
        {loadedModel ? (
          <div className="space-y-3">
            <div className="text-xs text-text-muted mb-2">
              Model: <span className="font-mono text-accent">{loadedModel.name}</span>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 px-4 py-2.5 bg-bg-secondary border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                placeholder="Enter a prompt to test..."
                value={chatPrompt}
                onChange={(e) => setChatPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && chatPrompt.trim() && !chatLoading && testChat()}
              />
              <Button icon={chatLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} disabled={!chatPrompt.trim() || chatLoading} onClick={testChat}>
                {chatLoading ? "Running…" : "Run"}
              </Button>
            </div>
            {chatOutput && (
              <div className="bg-bg-secondary rounded-xl p-4 font-mono text-xs text-text-secondary whitespace-pre-wrap border border-border/30 max-h-40 overflow-auto">
                {chatOutput}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-muted">Load a model first to test inference.</p>
        )}
      </Card>
    </div>
  );
}
