import { Database, Search, TrendingUp, BarChart2, Star } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

type RagResult = { id: string; text: string; score: number; source?: string };
type RagTrend = { topic: string; count: number; avgScore: number };

export function RAGPage() {
  const { data: diagData, loading, error, refetch } = useRpc<{ ready?: boolean; collections?: number; totalDocs?: number }>(
    "republic.rag.diagnostics",
    {},
    [],
    { staleTimeMs: 15_000 },
  );
  const { data: trendData } = useRpc<{ trends?: RagTrend[] }>("republic.rag.trend", {}, [], {
    staleTimeMs: 30_000,
  });
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RagResult[]>([]);
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState("");
  const [actionError, setActionError] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  async function search() {
    if (!query.trim()) {return;}
    setSearching(true);
    setActionError("");
    setResults([]);
    try {
      const r = await rpc<{ results?: RagResult[] }>("republic.rag.search", {
        query: query.trim(),
        limit: 10,
      });
      setResults(r?.results ?? []);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  async function gradeSearch() {
    if (!query.trim() || results.length === 0) {return;}
    setGrading(true);
    try {
      const r = await rpc<{ grade?: string; score?: number; feedback?: string }>(
        "republic.rag.grade",
        { query: query.trim(), results },
      );
      setGradeResult(`Grade: ${r?.grade ?? "?"} (${r?.score ?? 0}/10)\n${r?.feedback ?? ""}`);
    } catch (e) {
      setGradeResult(`Error: ${e}`);
    } finally {
      setGrading(false);
    }
  }

  async function evaluate() {
    try {
      const r = await rpc<{ score?: number; summary?: string }>("republic.rag.evaluate", {});
      alert(`RAG Evaluation:\nScore: ${r?.score}/100\n${r?.summary ?? ""}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const trends = trendData?.trends ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="RAG / Knowledge Base"
        description="Retrieval-Augmented Generation — search, grade, and evaluate knowledge retrieval"
        icon={<Database size={28} />}
        actions={
          <Button size="sm" variant="outline" icon={<BarChart2 size={14} />} onClick={evaluate}>
            Evaluate
          </Button>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label="Status"
          value={diagData?.ready ? "Ready" : "Not Ready"}
          icon={<Database size={16} />}
        />
        <StatCard
          label="Collections"
          value={diagData?.collections ?? 0}
          icon={<Database size={16} />}
        />
        <StatCard label="Total Docs" value={diagData?.totalDocs ?? 0} icon={<Search size={16} />} />
      </div>

      {/* Search */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
          <Search size={16} /> Semantic Search
        </h3>
        <div className="flex gap-3 mb-4">
          <input
            className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
            placeholder="Search the knowledge base..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <Button onClick={search} loading={searching} icon={<Search size={14} />}>
            Search
          </Button>
          {results.length > 0 && (
            <Button
              variant="outline"
              onClick={gradeSearch}
              loading={grading}
              icon={<Star size={14} />}
            >
              Grade
            </Button>
          )}
        </div>

        {gradeResult && (
          <pre className="text-xs font-mono bg-bg-secondary border border-border/30 rounded p-3 mb-4 whitespace-pre-wrap text-text-secondary">
            {gradeResult}
          </pre>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className="p-3 rounded-lg bg-bg-secondary border border-border/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted">{r.source ?? `Result ${i + 1}`}</span>
                  <Badge
                    variant={r.score > 0.8 ? "success" : r.score > 0.6 ? "warning" : "neutral"}
                  >
                    {(r.score * 100).toFixed(1)}%
                  </Badge>
                </div>
                <p className="text-sm text-text-primary">{r.text}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Trends */}
      {trends.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <TrendingUp size={16} /> Query Trends
          </h3>
          <div className="space-y-2">
            {trends.slice(0, 10).map((t, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{t.topic}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted">{t.count} queries</span>
                  <Badge variant={t.avgScore > 0.8 ? "success" : "warning"}>
                    {(t.avgScore * 100).toFixed(0)}% avg
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
