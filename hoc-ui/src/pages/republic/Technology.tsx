import { Cpu, FlaskConical, Zap, Globe, RefreshCw, Brain, Orbit } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, ProgressBar, Tabs , RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

type TechItem = { name: string; level: number; maxLevel: number; unlocked: boolean };
type TechTree = { category: string; color: string; breakthroughs: number; items: TechItem[] };
type Lab = { name: string; status: string; progress: number; researchers: number; eta: string };
type MlModel = { id: string; name?: string; status: string; accuracy?: number; version?: string };
type QuantumCircuit = {
  id: string;
  name?: string;
  qubits?: number;
  depth?: number;
  fidelity?: number;
};
type AtlantisStatus = {
  connected?: boolean;
  models?: string[];
  health?: string;
  memoryUsedMB?: number;
};

const FALLBACK_TREES: TechTree[] = [
  { category: "Computing", color: "#6366f1", breakthroughs: 0, items: [] },
  { category: "Intelligence", color: "#06b6d4", breakthroughs: 0, items: [] },
];

const TECH_TABS = [
  { id: "tree", label: "Research Tree" },
  { id: "labs", label: "Labs" },
  { id: "ml", label: "ML Models" },
  { id: "quantum", label: "Quantum" },
  { id: "atlantis", label: "Atlantis AI" },
];

export function TechnologyPage() {
  const [tab, setTab] = useState("tree");
  const { data, refetch, loading, error } = useRpc<{
    trees?: TechTree[];
    labs?: Lab[];
    totalBreakthroughs?: number;
    activeLabs?: number;
    totalResearchers?: number;
    maxLevel?: number;
  }>("republic.technology.status", {}, [], { staleTimeMs: 15_000 });
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const trees = data?.trees ?? FALLBACK_TREES;
  const labs = data?.labs ?? [];
  const totalBreakthroughs =
    data?.totalBreakthroughs ?? trees.reduce((s, t) => s + t.breakthroughs, 0);
  const activeLabs = data?.activeLabs ?? labs.filter((l) => l.status === "Active").length;
  const totalResearchers = data?.totalResearchers ?? labs.reduce((s, l) => s + l.researchers, 0);
  const maxLevel = data?.maxLevel ?? 5;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Technology"
        description="Research trees, ML models, quantum circuits, Atlantis AI, and lab status"
        icon={<FlaskConical size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Breakthroughs" value={totalBreakthroughs} icon={<Zap size={16} />} />
        <StatCard label="Active Labs" value={activeLabs} icon={<FlaskConical size={16} />} />
        <StatCard label="Researchers" value={totalResearchers} icon={<Cpu size={16} />} />
        <StatCard label="Max Level" value={`Lvl ${maxLevel}`} icon={<Globe size={16} />} />
      </div>

      <Tabs tabs={TECH_TABS} active={tab} onChange={setTab} />

      {tab === "tree" && (
        <div className="space-y-4">
          {trees.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">No research tree data yet.</p>
          )}
          {trees.map((cat) => (
            <Card key={cat.category}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                  <h3 className="font-semibold text-text-heading">{cat.category}</h3>
                </div>
                <Badge variant="purple">🔬 {cat.breakthroughs} breakthroughs</Badge>
              </div>
              <div className="space-y-3">
                {cat.items.map((item) => (
                  <div key={item.name} className={`${!item.unlocked ? "opacity-40" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-text-secondary">
                        {!item.unlocked && "🔒 "}
                        {item.name}
                      </span>
                      <span className="text-xs text-text-muted font-mono">
                        Lv {item.level}/{item.maxLevel}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-bg-input overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(item.level / item.maxLevel) * 100}%`,
                          background: cat.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "labs" && (
        <div className="space-y-4">
          {labs.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">No active labs yet.</p>
          )}
          {labs.map((lab) => (
            <Card key={lab.name}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-text-heading">{lab.name}</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    👩‍🔬 {lab.researchers} researchers · ETA: {lab.eta}
                  </p>
                </div>
                <Badge variant={lab.status === "Active" ? "success" : "neutral"}>
                  {lab.status}
                </Badge>
              </div>
              <ProgressBar
                value={lab.progress * 100}
                labelLeft="Progress"
                labelRight={`${(lab.progress * 100).toFixed(0)}%`}
              />
            </Card>
          ))}
        </div>
      )}

      {tab === "ml" && <MlModelsTab />}
      {tab === "quantum" && <QuantumTab />}
      {tab === "atlantis" && <AtlantisTab />}
    </div>
  );
}

function MlModelsTab() {
  const { data, loading, refetch } = useRpc<{ models?: MlModel[] }>(
    "republic.tech.ml.list",
    {},
    [],
    { staleTimeMs: 15_000 },
  );
  const models = data?.models ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" icon={<RefreshCw size={14} />} onClick={refetch}>
          Refresh
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : models.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No ML models registered.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-text-heading text-sm">{m.name ?? m.id}</span>
                <Badge
                  variant={
                    m.status === "ready" ? "success" : m.status === "training" ? "info" : "neutral"
                  }
                >
                  {m.status}
                </Badge>
              </div>
              {m.accuracy != null && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-text-muted mb-1">
                    <span>Accuracy</span>
                    <span>{(m.accuracy * 100).toFixed(1)}%</span>
                  </div>
                  <ProgressBar value={m.accuracy * 100} />
                </div>
              )}
              {m.version && <p className="text-xs text-text-muted mt-1">v{m.version}</p>}
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => rpc("republic.tech.ml.train", { modelId: m.id })}
                >
                  Train
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => rpc("republic.tech.ml.evaluate", { modelId: m.id })}
                >
                  Eval
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function QuantumTab() {
  const { data, loading } = useRpc<{ circuits?: QuantumCircuit[] }>(
    "republic.tech.quantum.circuits",
    {},
    [],
    { staleTimeMs: 15_000 },
  );
  const { data: stateData } = useRpc<{ coherence?: number }>(
    "republic.tech.quantum.state",
    {},
    [],
    { staleTimeMs: 10_000 },
  );
  const circuits = data?.circuits ?? [];
  return (
    <div className="space-y-4">
      {stateData?.coherence != null && (
        <Card className="flex items-center gap-4">
          <Orbit size={24} className="text-purple-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-text-heading">Quantum Coherence</p>
            <ProgressBar value={stateData.coherence * 100} />
          </div>
          <span className="font-mono text-purple-400">
            {(stateData.coherence * 100).toFixed(1)}%
          </span>
        </Card>
      )}
      {loading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : circuits.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No quantum circuits.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {circuits.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-text-heading text-sm">{c.name ?? c.id}</span>
                <Badge variant="purple">{c.qubits ?? 0}q</Badge>
              </div>
              <div className="flex gap-4 text-xs text-text-muted">
                {c.depth != null && <span>Depth: {c.depth}</span>}
                {c.fidelity != null && <span>Fidelity: {(c.fidelity * 100).toFixed(1)}%</span>}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-3"
                onClick={() => rpc("republic.tech.quantum.run", { circuitId: c.id })}
              >
                Run Circuit
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AtlantisTab() {
  const { data, refetch } = useRpc<AtlantisStatus>("republic.tech.atlantis.status", {}, [], {
    staleTimeMs: 10_000,
  });
  const { data: memData } = useRpc<{
    memories?: Array<{ id: string; content: string; importance?: number }>;
  }>("republic.tech.atlantis.memories", {}, [], { staleTimeMs: 15_000 });
  const memories = memData?.memories ?? [];
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Brain size={20} className="text-cyan-400" />
            <h3 className="font-semibold text-text-heading">Atlantis AI Status</h3>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${data?.connected ? "bg-success animate-pulse" : "bg-border"}`}
            />
            <Badge variant={data?.connected ? "success" : "neutral"}>
              {data?.connected ? "Connected" : "Offline"}
            </Badge>
            <Button size="sm" variant="outline" icon={<RefreshCw size={12} />} onClick={refetch} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {data?.health && (
            <div>
              <span className="text-text-muted">Health: </span>
              {data.health}
            </div>
          )}
          {data?.memoryUsedMB != null && (
            <div>
              <span className="text-text-muted">Memory: </span>
              {data.memoryUsedMB} MB
            </div>
          )}
          {(data?.models ?? []).length > 0 && (
            <div className="col-span-2">
              <span className="text-text-muted">Models:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {(data?.models ?? []).map((m) => (
                  <Badge key={m} variant="info">
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => rpc("republic.tech.atlantis.sync", {})}
          >
            Sync
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => rpc("republic.tech.atlantis.consolidate", {})}
          >
            Consolidate
          </Button>
        </div>
      </Card>
      {memories.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🧠 Atlantis Memories</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {memories.slice(0, 20).map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 text-sm p-2 rounded bg-bg-secondary border border-border/30"
              >
                <span className="text-text-primary flex-1">{m.content}</span>
                {m.importance != null && <Badge variant="purple">{m.importance}</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
