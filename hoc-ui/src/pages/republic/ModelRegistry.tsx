import { Package, Download, Upload, RefreshCw, Plus, Trash2, Star } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type ModelEntry = {
  id: string;
  name: string;
  type?: string;
  version?: string;
  provider?: string;
  status: "available" | "loading" | "loaded" | "error" | "deprecated";
  sizeGB?: number;
  quantization?: string;
  contextLength?: number;
  downloads?: number;
  tags?: string[];
};

const sv = (s: string) => {
  if (s === "available" || s === "loaded") {return "success" as const;}
  if (s === "loading") {return "info" as const;}
  if (s === "error") {return "danger" as const;}
  if (s === "deprecated") {return "warning" as const;}
  return "neutral" as const;
};

export function ModelRegistryPage() {
  const { data, loading, refetch, error } = useRpc<{
    models?: ModelEntry[];
    total?: number;
    loaded?: number;
  }>("republic.model.registry.list", {}, [], { staleTimeMs: 10_000 });
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [registerName, setRegisterName] = useState("");
  const [registerProvider, setRegisterProvider] = useState("");
  const [registerType, setRegisterType] = useState("llm");
  const [registering, setRegistering] = useState(false);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const models = (data?.models ?? []).filter((m) => {
    const q = filter.toLowerCase();
    const matchName =
      !q || m.name.toLowerCase().includes(q) || (m.provider ?? "").toLowerCase().includes(q);
    const matchType = typeFilter === "all" || m.type === typeFilter;
    return matchName && matchType;
  });

  const types = [...new Set((data?.models ?? []).map((m) => m.type).filter(Boolean))];

  async function registerModel() {
    if (!registerName.trim()) {return;}
    setRegistering(true);
    try {
      await rpc("republic.model.registry.register", {
        name: registerName.trim(),
        provider: registerProvider.trim() || undefined,
        type: registerType,
      });
      invalidateRpcCache("republic.model.registry.list");
      setRegisterName("");
      setRegisterProvider("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistering(false);
    }
  }

  async function loadModel(id: string) {
    try {
      await rpc("republic.model.registry.load", { modelId: id });
      invalidateRpcCache("republic.model.registry.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function unloadModel(id: string) {
    try {
      await rpc("republic.model.registry.unload", { modelId: id });
      invalidateRpcCache("republic.model.registry.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteModel(id: string) {
    if (!confirm("Remove this model from registry?")) {return;}
    try {
      await rpc("republic.model.registry.delete", { modelId: id });
      invalidateRpcCache("republic.model.registry.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function setDefault(id: string) {
    try {
      await rpc("republic.model.registry.set_default", { modelId: id });
      invalidateRpcCache("republic.model.registry.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Model Registry"
        description="Register, load, unload, and manage all AI models used by the republic"
        icon={<Package size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Models"
          value={data?.total ?? models.length}
          icon={<Package size={16} />}
        />
        <StatCard
          label="Loaded"
          value={data?.loaded ?? models.filter((m) => m.status === "loaded").length}
          icon={<Upload size={16} />}
        />
        <StatCard
          label="Available"
          value={models.filter((m) => m.status === "available").length}
          icon={<Download size={16} />}
        />
        <StatCard label="Types" value={types.length} icon={<Package size={16} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Register Model */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Plus size={16} /> Register Model
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Model name or path..."
              value={registerName}
              onChange={(e) => setRegisterName(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Provider (ollama, hf, openai...)"
              value={registerProvider}
              onChange={(e) => setRegisterProvider(e.target.value)}
            />
            <select
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary"
              value={registerType}
              onChange={(e) => setRegisterType(e.target.value)}
            >
              {["llm", "embedding", "vision", "audio", "image", "multimodal", "tool"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button onClick={registerModel} loading={registering} disabled={!registerName.trim()}>
              Register
            </Button>
          </div>
        </Card>

        {/* Model List */}
        <div className="md:col-span-2">
          <Card>
            <div className="flex gap-2 mb-4">
              <input
                className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
                placeholder="Filter models..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <select
                className="px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All</option>
                {types.map((t) => (
                  <option key={t} value={t!}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {loading ? (
              <p className="text-sm text-text-muted">Loading...</p>
            ) : models.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-6">No models found.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {models.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg bg-bg-secondary border border-border/30"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge variant={sv(m.status)}>{m.status}</Badge>
                        {m.type && <Badge variant="neutral">{m.type}</Badge>}
                        <span className="text-sm font-medium text-text-heading truncate">
                          {m.name}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Star size={12} />}
                          onClick={() => setDefault(m.id)}
                        />
                        {m.status === "available" && (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Upload size={12} />}
                            onClick={() => loadModel(m.id)}
                          >
                            Load
                          </Button>
                        )}
                        {m.status === "loaded" && (
                          <Button size="sm" variant="outline" onClick={() => unloadModel(m.id)}>
                            Unload
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={12} />}
                          onClick={() => deleteModel(m.id)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-text-muted">
                      {m.provider && <span>{m.provider}</span>}
                      {m.version && <span>v{m.version}</span>}
                      {m.sizeGB != null && <span>{m.sizeGB.toFixed(1)} GB</span>}
                      {m.quantization && <span>{m.quantization}</span>}
                      {m.contextLength && <span>{m.contextLength.toLocaleString()} ctx</span>}
                      {m.downloads != null && <span>⬇ {m.downloads}</span>}
                    </div>
                    {m.tags && m.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.tags.slice(0, 5).map((t) => (
                          <Badge key={t} variant="info">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
