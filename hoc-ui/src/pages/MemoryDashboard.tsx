import { useState } from "react";
import {
  Brain,
  Network,
  Search,
  Settings,
  Database,
  GitBranch,
  Zap,
  Eye,
  Scissors,
  BarChart3,
} from "lucide-react";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";
import {
  PageHeader,
  Card,
  Badge,
  StatCard,
  Tabs,
  Button,
  RpcStatus,
  EmptyState,
  ProgressBar,
} from "@/components/ui";

/* ── Types ─────────────────────────────────────────────────────── */

interface CogneeStatusData {
  enabled: boolean;
  config: {
    autoCapture: boolean;
    autoRecall: boolean;
    recallTopK: number;
    graphDepth: number;
    relatedTopK: number;
  };
  stats: {
    capturesPerformed: number;
    recallsPerformed: number;
    entitiesExtracted: number;
    factsDistilled: number;
    graphQueriesServed: number;
    lastCaptureAt: string;
    lastRecallAt: string;
  };
  graph: {
    totalNodes: number;
    totalEdges: number;
    nodesByType: Record<string, number>;
    avgEdgesPerNode: number;
    citizenGraphSizes: Record<string, { nodes: number; edges: number }>;
  };
  mem0: {
    totalFacts: number;
    totalCitizens: number;
    avgFactsPerCitizen: number;
    deduplicationsPerformed: number;
    llmExtractions: number;
    offlineExtractions: number;
  };
}

interface ScopesData {
  scopes: {
    graph: {
      totalNodes: number;
      totalEdges: number;
      nodesByType: Record<string, number>;
      citizenGraphs: number;
      avgEdgesPerNode: number;
    };
    mem0: {
      totalFacts: number;
      totalCitizens: number;
      avgFactsPerCitizen: number;
    };
  };
}

/* ── Helper ────────────────────────────────────────────────────── */

function fmtNum(n: number): string {
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
  if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
  return String(n);
}

function fmtTime(s: string): string {
  if (!s) { return "—"; }
  try {
    return new Date(s).toLocaleTimeString();
  } catch {
    return s;
  }
}

/* ── Main Page ─────────────────────────────────────────────────── */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "graph", label: "Knowledge Graph" },
  { id: "mem0", label: "Mem0 Facts" },
  { id: "pipeline", label: "ECL Pipeline" },
  { id: "settings", label: "Settings" },
];

export function MemoryDashboard() {
  const { data: status, loading, error, refetch } = useRpc<CogneeStatusData>(
    "republic.cognee.status",
    {},
  );
  const { data: scopes } = useRpc<ScopesData>("republic.cognee.scopes", {});
  const [active, setActive] = useState("overview");
  const [queryText, setQueryText] = useState("");
  const [queryCitizen, setQueryCitizen] = useState("");
  const [queryResults, setQueryResults] = useState<unknown>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const s = status!;
  const sc = scopes?.scopes;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Memory Dashboard"
        description="Cognee Knowledge Graph + Mem0 Persistent Facts — ECL Pipeline"
        icon={<Brain size={28} />}
        actions={
          <div className="flex gap-2">
            <Badge variant={s.config.autoCapture ? "success" : "neutral"}>
              {s.config.autoCapture ? "Auto-Capture ON" : "Auto-Capture OFF"}
            </Badge>
            <Badge variant={s.config.autoRecall ? "info" : "neutral"}>
              {s.config.autoRecall ? "Auto-Recall ON" : "Auto-Recall OFF"}
            </Badge>
          </div>
        }
      />

      <Tabs tabs={TABS} active={active} onChange={setActive} />

      {active === "overview" && (
        <OverviewTab status={s} scopes={sc} />
      )}
      {active === "graph" && (
        <GraphTab
          status={s}
          queryText={queryText}
          setQueryText={setQueryText}
          queryCitizen={queryCitizen}
          setQueryCitizen={setQueryCitizen}
          queryResults={queryResults}
          setQueryResults={setQueryResults}
        />
      )}
      {active === "mem0" && <Mem0Tab status={s} />}
      {active === "pipeline" && <PipelineTab status={s} refetch={refetch} />}
      {active === "settings" && <SettingsTab status={s} refetch={refetch} />}
    </div>
  );
}

/* ── Overview Tab ──────────────────────────────────────────────── */

function OverviewTab({ status, scopes }: { status: CogneeStatusData; scopes?: ScopesData["scopes"] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Graph Nodes"
          value={fmtNum(status.graph.totalNodes)}
          icon={<Network size={18} />}
          sub={`${status.graph.totalEdges} edges`}
        />
        <StatCard
          label="Mem0 Facts"
          value={fmtNum(status.mem0.totalFacts)}
          icon={<Database size={18} />}
          sub={`${status.mem0.totalCitizens} citizens`}
        />
        <StatCard
          label="Captures"
          value={fmtNum(status.stats.capturesPerformed)}
          icon={<Eye size={18} />}
          sub={`Last: ${fmtTime(status.stats.lastCaptureAt)}`}
        />
        <StatCard
          label="Recalls"
          value={fmtNum(status.stats.recallsPerformed)}
          icon={<Search size={18} />}
          sub={`Last: ${fmtTime(status.stats.lastRecallAt)}`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-text-heading text-sm font-semibold mb-3 flex items-center gap-2">
            <GitBranch size={16} className="text-accent" />
            Knowledge Graph
          </h3>
          <div className="space-y-2">
            {Object.entries(status.graph.nodesByType ?? {}).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary capitalize">{type}</span>
                <Badge variant="info">{String(count)}</Badge>
              </div>
            ))}
            {Object.keys(status.graph.nodesByType ?? {}).length === 0 && (
              <p className="text-text-muted text-sm">No entities yet — graph builds as citizens act</p>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 text-xs text-text-muted">
            Avg edges/node: {status.graph.avgEdgesPerNode.toFixed(1)} · Citizen graphs: {scopes?.graph.citizenGraphs ?? 0}
          </div>
        </Card>

        <Card>
          <h3 className="text-text-heading text-sm font-semibold mb-3 flex items-center gap-2">
            <Brain size={16} className="text-purple" />
            Mem0 Persistent Memory
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Total Facts</span>
              <Badge variant="success">{String(status.mem0.totalFacts)}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Citizens Tracked</span>
              <Badge variant="info">{String(status.mem0.totalCitizens)}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Avg Facts/Citizen</span>
              <Badge variant="neutral">{status.mem0.avgFactsPerCitizen.toFixed(1)}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">LLM Extractions</span>
              <Badge variant="purple">{String(status.mem0.llmExtractions)}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Deductions Performed</span>
              <Badge variant="neutral">{String(status.mem0.deduplicationsPerformed)}</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Graph Tab ─────────────────────────────────────────────────── */

function GraphTab({
  status,
  queryText,
  setQueryText,
  queryCitizen,
  setQueryCitizen,
  queryResults,
  setQueryResults,
}: {
  status: CogneeStatusData;
  queryText: string;
  setQueryText: (v: string) => void;
  queryCitizen: string;
  setQueryCitizen: (v: string) => void;
  queryResults: unknown;
  setQueryResults: (v: unknown) => void;
}) {
  const doQuery = async () => {
    if (!queryText || !queryCitizen) { return; }
    const result = await rpc("republic.cognee.query", {
      citizenId: queryCitizen,
      query: queryText,
      depth: 2,
    });
    setQueryResults(result);
  };

  const doRelated = async () => {
    if (!queryText || !queryCitizen) { return; }
    const result = await rpc("republic.cognee.related", {
      citizenId: queryCitizen,
      query: queryText,
      topK: 10,
    });
    setQueryResults(result);
  };

  const results = queryResults as Record<string, unknown> | null;

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-text-heading text-sm font-semibold mb-3 flex items-center gap-2">
          <Search size={16} className="text-accent" />
          Graph Query
        </h3>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 bg-bg-input border border-border rounded px-3 py-2 text-sm text-text-primary"
            placeholder="Citizen ID..."
            value={queryCitizen}
            onChange={(e) => setQueryCitizen(e.target.value)}
          />
          <input
            className="flex-1 bg-bg-input border border-border rounded px-3 py-2 text-sm text-text-primary"
            placeholder="Search query..."
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
          />
          <Button variant="primary" size="sm" onClick={doQuery}>
            Query
          </Button>
          <Button variant="outline" size="sm" onClick={doRelated}>
            Find Related
          </Button>
        </div>

        {results && (
          <div className="bg-bg-secondary rounded p-3 mt-3 max-h-96 overflow-y-auto">
            <pre className="text-xs text-text-secondary whitespace-pre-wrap break-words">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(status.graph.nodesByType ?? {}).map(([type, count]) => (
          <Card key={type}>
            <div className="flex items-center justify-between">
              <span className="text-text-heading capitalize text-sm font-medium">{type}</span>
              <Badge variant="info">{String(count)}</Badge>
            </div>
            <ProgressBar
              value={count as number}
              max={Math.max(status.graph.totalNodes, 1)}
              size="sm"
              labelRight={`${((count as number / Math.max(status.graph.totalNodes, 1)) * 100).toFixed(0)}%`}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── Mem0 Tab ──────────────────────────────────────────────────── */

function Mem0Tab({ status }: { status: CogneeStatusData }) {
  const [citizenId, setCitizenId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [facts, setFacts] = useState<unknown[]>([]);
  const [totalFacts, setTotalFacts] = useState(0);

  const loadFacts = async () => {
    if (!citizenId) { return; }
    const result = await rpc("republic.cognee.citizen.facts", {
      citizenId,
      query: searchQuery || undefined,
      limit: 50,
    }) as { facts?: unknown[]; total?: number };
    setFacts(result?.facts ?? []);
    setTotalFacts(result?.total ?? 0);
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-text-heading text-sm font-semibold mb-3 flex items-center gap-2">
          <Database size={16} className="text-accent" />
          Citizen Facts Browser
        </h3>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 bg-bg-input border border-border rounded px-3 py-2 text-sm text-text-primary"
            placeholder="Citizen ID..."
            value={citizenId}
            onChange={(e) => setCitizenId(e.target.value)}
          />
          <input
            className="flex-1 bg-bg-input border border-border rounded px-3 py-2 text-sm text-text-primary"
            placeholder="Search facts (optional)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button variant="primary" size="sm" onClick={loadFacts}>
            Load Facts
          </Button>
        </div>

        {facts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              Showing {facts.length} of {totalFacts} facts
            </p>
            {facts.map((fact, i) => {
              const f = fact as Record<string, unknown>;
              return (
                <div
                  key={i}
                  className="bg-bg-secondary rounded p-3 text-sm border border-border/30"
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant={f.category === "preference" ? "purple" : f.category === "skill" ? "info" : "neutral"}>
                      {String(f.category ?? "fact")}
                    </Badge>
                    <span className="text-xs text-text-muted">
                      importance: {typeof f.importance === "number" ? (f.importance * 100).toFixed(0) : "—"}%
                    </span>
                  </div>
                  <p className="text-text-primary">{String(f.text ?? f.content ?? JSON.stringify(f))}</p>
                </div>
              );
            })}
          </div>
        )}
        {facts.length === 0 && citizenId && (
          <EmptyState
            title="No facts found"
            description="This citizen has no extracted facts yet. Facts accumulate automatically as the citizen acts."
          />
        )}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Facts"
          value={fmtNum(status.mem0.totalFacts)}
          icon={<Database size={18} />}
        />
        <StatCard
          label="Citizens"
          value={String(status.mem0.totalCitizens)}
          icon={<Brain size={18} />}
        />
        <StatCard
          label="LLM Extractions"
          value={fmtNum(status.mem0.llmExtractions)}
          icon={<Zap size={18} />}
        />
        <StatCard
          label="Deduplications"
          value={fmtNum(status.mem0.deduplicationsPerformed)}
          icon={<Scissors size={18} />}
        />
      </div>
    </div>
  );
}

/* ── Pipeline Tab ──────────────────────────────────────────────── */

function PipelineTab({ status, refetch }: { status: CogneeStatusData; refetch: () => void }) {
  const [pruning, setPruning] = useState(false);

  const handlePrune = async () => {
    setPruning(true);
    try {
      await rpc("republic.cognee.prune", {});
      invalidateRpcCache("republic.cognee.status");
      refetch();
    } finally {
      setPruning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Entities Extracted"
          value={fmtNum(status.stats.entitiesExtracted)}
          icon={<GitBranch size={18} />}
        />
        <StatCard
          label="Facts Distilled"
          value={fmtNum(status.stats.factsDistilled)}
          icon={<Brain size={18} />}
        />
        <StatCard
          label="Graph Queries"
          value={fmtNum(status.stats.graphQueriesServed)}
          icon={<BarChart3 size={18} />}
        />
      </div>

      <Card>
        <h3 className="text-text-heading text-sm font-semibold mb-3 flex items-center gap-2">
          <Zap size={16} className="text-accent" />
          ECL Pipeline Status
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Extract Phase</span>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Cognify Phase</span>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Load Phase</span>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Last Capture</span>
            <span className="text-text-primary">{fmtTime(status.stats.lastCaptureAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Last Recall</span>
            <span className="text-text-primary">{fmtTime(status.stats.lastRecallAt)}</span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-border/30">
          <Button variant="warning" size="sm" onClick={handlePrune} disabled={pruning}>
            <Scissors size={14} />
            {pruning ? "Pruning..." : "Prune Decayed Edges"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ── Settings Tab ──────────────────────────────────────────────── */

function SettingsTab({ status, refetch }: { status: CogneeStatusData; refetch: () => void }) {
  const toggle = async (key: "autoCapture" | "autoRecall") => {
    await rpc("republic.cognee.config", { [key]: !status.config[key] });
    invalidateRpcCache("republic.cognee.status");
    refetch();
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-text-heading text-sm font-semibold mb-3 flex items-center gap-2">
          <Settings size={16} className="text-accent" />
          Memory Pipeline Configuration
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary font-medium">Auto-Capture</p>
              <p className="text-xs text-text-muted">
                Extract entities and facts after every citizen action
              </p>
            </div>
            <Button
              variant={status.config.autoCapture ? "success" : "outline"}
              size="sm"
              onClick={() => toggle("autoCapture")}
            >
              {status.config.autoCapture ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary font-medium">Auto-Recall</p>
              <p className="text-xs text-text-muted">
                Inject relevant memories before citizen LLM prompts
              </p>
            </div>
            <Button
              variant={status.config.autoRecall ? "success" : "outline"}
              size="sm"
              onClick={() => toggle("autoRecall")}
            >
              {status.config.autoRecall ? "Enabled" : "Disabled"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-text-heading text-sm font-semibold mb-3">Pipeline Parameters</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-text-muted">Recall Top-K</p>
            <p className="text-text-heading font-mono">{status.config.recallTopK}</p>
          </div>
          <div>
            <p className="text-text-muted">Graph Depth</p>
            <p className="text-text-heading font-mono">{status.config.graphDepth}</p>
          </div>
          <div>
            <p className="text-text-muted">Related Top-K</p>
            <p className="text-text-heading font-mono">{status.config.relatedTopK}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
