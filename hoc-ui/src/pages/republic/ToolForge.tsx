import { Hammer, RefreshCw, Plus, Play, Trash2, Star, Code } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type ForgedTool = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  status: "draft" | "testing" | "active" | "deprecated";
  language?: string;
  calls?: number;
  successRate?: number;
  createdAt?: number;
};

const sv = (s: string) =>
  s === "active"
    ? ("success" as const)
    : s === "testing"
      ? ("info" as const)
      : s === "deprecated"
        ? ("warning" as const)
        : ("neutral" as const);

export function ToolForgePage() {
  const { data, loading, refetch, error } = useRpc<{
    tools?: ForgedTool[];
    total?: number;
    activeCalls?: number;
  }>("republic.tools.list", {}, [], { staleTimeMs: 10_000 });
  const { data: queued } = useRpc<{
    requests?: Array<{ id: string; toolId: string; status: string; citizenId?: string }>;
  }>("republic.tools.queue", {}, [], { staleTimeMs: 5_000, refetchIntervalMs: 10_000 });
  const [actionError, setActionError] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCode, setNewCode] = useState("");
  const [forging, setForging] = useState(false);
  const [selected, setSelected] = useState<ForgedTool | null>(null);
  const [testInput, setTestInput] = useState("{}");
  const [testResult, setTestResult] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const tools = data?.tools ?? [];
  const queue = queued?.requests ?? [];

  async function forgeTool() {
    if (!newName.trim()) {return;}
    setForging(true);
    setActionError("");
    try {
      await rpc("republic.tools.forge", {
        name: newName.trim(),
        description: newDesc.trim(),
        code: newCode.trim(),
      });
      invalidateRpcCache("republic.tools.list");
      setNewName("");
      setNewDesc("");
      setNewCode("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setForging(false);
    }
  }

  async function testTool(id: string) {
    try {
      let input: unknown = {};
      try {
        input = JSON.parse(testInput);
      } catch {
        input = {};
      }
      const r = await rpc("republic.tools.test", { toolId: id, input });
      setTestResult(JSON.stringify(r, null, 2));
    } catch (e) {
      setTestResult(String(e));
    }
  }

  async function activateTool(id: string) {
    try {
      await rpc("republic.tools.activate", { toolId: id });
      invalidateRpcCache("republic.tools.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteTool(id: string) {
    if (!confirm("Delete this tool?")) {return;}
    try {
      await rpc("republic.tools.delete", { toolId: id });
      invalidateRpcCache("republic.tools.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Tool Forge"
        description="Autonomously forge, test, activate, and manage dynamic tools for agents and citizens"
        icon={<Hammer size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Tools"
          value={data?.total ?? tools.length}
          icon={<Hammer size={16} />}
        />
        <StatCard
          label="Active"
          value={tools.filter((t) => t.status === "active").length}
          icon={<Star size={16} />}
        />
        <StatCard label="In Queue" value={queue.length} icon={<Play size={16} />} />
        <StatCard label="Active Calls" value={data?.activeCalls ?? 0} icon={<Code size={16} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Forge New Tool */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Plus size={16} /> Forge Tool
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Tool name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Description..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm font-mono text-text-primary placeholder:text-text-muted resize-y min-h-24"
              placeholder="Tool code (TypeScript/JS)..."
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
            <Button onClick={forgeTool} loading={forging} disabled={!newName.trim()}>
              Forge
            </Button>
          </div>
        </Card>

        {/* Tool List */}
        <div className="md:col-span-2">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4">🔨 Forged Tools</h3>
            {loading ? (
              <p className="text-sm text-text-muted">Loading...</p>
            ) : tools.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-6">No tools forged yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {tools.map((t) => (
                  <div
                    key={t.id}
                    className={`p-3 rounded-lg border ${selected?.id === t.id ? "border-accent bg-accent/5" : "border-border/30 bg-bg-secondary"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={sv(t.status)}>{t.status}</Badge>
                        {t.language && <Badge variant="neutral">{t.language}</Badge>}
                        <span className="text-sm font-medium text-text-heading">{t.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected(selected?.id === t.id ? null : t)}
                        >
                          Test
                        </Button>
                        {t.status !== "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Star size={10} />}
                            onClick={() => activateTool(t.id)}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={10} />}
                          onClick={() => deleteTool(t.id)}
                        />
                      </div>
                    </div>
                    {t.description && <p className="text-xs text-text-muted">{t.description}</p>}
                    <div className="flex gap-3 text-xs text-text-muted mt-1">
                      {t.author && <span>By: {t.author}</span>}
                      {t.calls != null && <span>📞 {t.calls} calls</span>}
                      {t.successRate != null && <span>✓ {(t.successRate * 100).toFixed(0)}%</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Test Panel */}
      {selected && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-3">🧪 Test: {selected.name}</h3>
          <div className="flex gap-4">
            <div className="flex-1">
              <textarea
                className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm font-mono text-text-primary min-h-20 resize-y"
                placeholder="Input JSON..."
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
              />
              <Button
                size="sm"
                className="mt-2"
                icon={<Play size={12} />}
                onClick={() => testTool(selected.id)}
              >
                Run Test
              </Button>
            </div>
            {testResult && (
              <pre className="flex-1 text-xs font-mono bg-bg-secondary border border-border/30 rounded p-3 max-h-40 overflow-auto whitespace-pre-wrap text-text-secondary">
                {testResult}
              </pre>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
