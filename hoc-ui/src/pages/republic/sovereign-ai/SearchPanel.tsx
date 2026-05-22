/**
 * Sovereign AI — Search + RAG Panel
 *
 * Displays search/RAG pipeline diagnostics, grounding classifier test,
 * query stats, and cache performance.
 */

import { Search, Globe, Database, Zap, Activity, FlaskConical, Layers } from "lucide-react";
import { useState } from "react";
import { Card, Badge, Button, RpcStatus, EmptyState, ProgressBar, Alert } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

type SearchDiag = {
  totalQueries: number;
  groundedQueries: number;
  avgLatencyMs: number;
  avgSourcesPerQuery: number;
  cacheHitRate: number;
};

type GroundingResult = {
  decision: string;
  confidence: number;
  signals: Record<string, number>;
};

export function SearchPanel() {
  const { data, loading, error, refetch } = useRpc<SearchDiag>(
    "republic.sovereign.search.diagnostics",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 15_000 },
  );

  const [testQuery, setTestQuery] = useState("");
  const [testing, setTesting] = useState(false);
  const [groundingResult, setGroundingResult] = useState<GroundingResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  if (!data) {
    return <EmptyState icon={<Search size={40} />} title="Search engine initializing..." />;
  }

  const groundedPct =
    data.totalQueries > 0 ? Math.round((data.groundedQueries / data.totalQueries) * 100) : 0;
  const cacheHitPct = Math.round((data.cacheHitRate ?? 0) * 100);

  const handleTestGrounding = async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    setGroundingResult(null);
    setTestError(null);
    try {
      const res = await rpc<{ ok: boolean; signals?: GroundingResult; error?: string }>(
        "republic.sovereign.search.grounding",
        { query: testQuery },
      );
      if (res?.ok && res.signals) {
        setGroundingResult(res.signals);
      } else {
        setTestError(res?.error ?? "Grounding test failed");
      }
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
    }
    setTesting(false);
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{data.totalQueries}</p>
          <p className="text-xs text-text-muted">Total Queries</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-info">{data.groundedQueries}</p>
          <p className="text-xs text-text-muted">Grounded</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-accent">{data.avgLatencyMs}ms</p>
          <p className="text-xs text-text-muted">Avg Latency</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-success">{cacheHitPct}%</p>
          <p className="text-xs text-text-muted">Cache Hit</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">
            {(data.avgSourcesPerQuery ?? 0).toFixed(1)}
          </p>
          <p className="text-xs text-text-muted">Avg Sources</p>
        </Card>
      </div>

      {/* Pipeline overview */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Layers size={14} /> RAG Pipeline
        </h4>
        <div className="flex items-center gap-2 text-xs text-text-secondary flex-wrap">
          {[
            { icon: Search, label: "Query" },
            { icon: FlaskConical, label: "Grounding" },
            { icon: Globe, label: "Search" },
            { icon: Zap, label: "Scrape" },
            { icon: Database, label: "Chunk" },
            { icon: Activity, label: "Rank" },
            { icon: Layers, label: "Synthesize" },
          ].map((step, i, arr) => (
            <span key={step.label} className="flex items-center gap-1">
              <step.icon size={12} className="text-accent" />
              <span>{step.label}</span>
              {i < arr.length - 1 && <span className="text-text-muted mx-1">→</span>}
            </span>
          ))}
        </div>
      </Card>

      {/* Performance breakdown */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Activity size={14} /> Performance
        </h4>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">Grounding Rate</span>
              <span className="text-text-muted">{groundedPct}%</span>
            </div>
            <ProgressBar value={groundedPct} max={100} size="sm" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">Cache Hit Rate</span>
              <span className="text-text-muted">{cacheHitPct}%</span>
            </div>
            <ProgressBar value={cacheHitPct} max={100} size="sm" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">Avg Sources / Query</span>
              <span className="text-text-muted">
                {(data.avgSourcesPerQuery ?? 0).toFixed(1)} sources
              </span>
            </div>
            <ProgressBar
              value={Math.min((data.avgSourcesPerQuery ?? 0) * 20, 100)}
              max={100}
              size="sm"
            />
          </div>
        </div>
      </Card>

      {/* Grounding Classifier Test */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <FlaskConical size={14} /> Grounding Classifier Test
        </h4>
        <p className="text-xs text-text-muted mb-3">
          Test whether a query requires live web search or can be answered from model knowledge.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder='e.g., "What happened in the news today?"'
            className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleTestGrounding();
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleTestGrounding()}
            disabled={testing || !testQuery.trim()}
          >
            {testing ? "Classifying..." : "Classify"}
          </Button>
        </div>

        {groundingResult && (
          <div className="space-y-2 p-3 rounded-lg bg-bg-secondary border border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">Decision:</span>
              <Badge variant={groundingResult.decision === "search_needed" ? "info" : "success"}>
                {groundingResult.decision === "search_needed"
                  ? "🌐 Search Needed"
                  : "🧠 Model Knowledge"}
              </Badge>
              <span className="text-xs text-text-muted">
                ({Math.round((groundingResult.confidence ?? 0) * 100)}% confidence)
              </span>
            </div>
            {groundingResult.signals && Object.keys(groundingResult.signals).length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">
                  Signal Breakdown
                </p>
                {Object.entries(groundingResult.signals)
                  .toSorted(([, a], [, b]) => b - a)
                  .map(([signal, score]) => (
                    <div key={signal} className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-32 truncate">{signal}</span>
                      <div className="flex-1">
                        <ProgressBar value={Math.round(score * 100)} max={100} size="sm" />
                      </div>
                      <span className="text-xs text-text-muted w-10 text-right">
                        {Math.round(score * 100)}%
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {testError && <Alert variant="danger">{testError}</Alert>}
      </Card>
    </div>
  );
}
