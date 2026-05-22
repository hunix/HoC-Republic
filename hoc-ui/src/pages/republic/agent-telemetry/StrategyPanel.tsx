import { Target, Send, BarChart3, Brain } from "lucide-react";
import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { rpc, useRpc } from "@/lib/rpc";
import IntelligenceResultView, {
  type IntelligenceResult,
  STRATEGY_ICONS,
  STRATEGY_COLORS,
} from "./IntelligenceResultView";

const STRATEGY_BAR_COLORS: Record<string, string> = {
  DIRECT: "bg-success/30",
  RESEARCH: "bg-info/30",
  BUILD: "bg-accent/30",
  CREATIVE: "bg-purple/30",
  ANALYSIS: "bg-warning/30",
  FULL_STACK: "bg-danger/30",
  DEEP_THINK: "bg-info/30",
};

export default function StrategyPanel() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: distData } = useRpc<{ distribution: Record<string, number> }>(
    "republic.agent.strategy.distribution",
    {},
  );

  const { data: outcomesData } = useRpc<{
    totalOutcomes: number;
    byStrategy: Record<
      string,
      {
        count: number;
        avgIterations: number;
        successRate: number;
        avgDurationMs: number;
      }
    >;
  }>("republic.agent.strategy.outcomes", {});

  async function handleAnalyze() {
    if (!prompt.trim()) {
      return;
    }
    setLoading(true);
    try {
      const res = await rpc("republic.agent.intelligence.assess", { prompt: prompt.trim() });
      setResult(res as IntelligenceResult);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  const distribution = distData?.distribution ?? {};
  const totalPlans = Object.values(distribution).reduce((s, v) => s + (v as number), 0);

  return (
    <div className="space-y-6">
      {/* Intelligence Analyzer */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-text-heading mb-2 flex items-center gap-2">
          <Brain size={20} className="text-accent" />
          Loop Intelligence Analyzer
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          See exactly how the closed-loop intelligence controller would handle a prompt — strategy
          selection, iteration budget, tool filtering, phase decomposition, and system directive.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter a prompt to analyze (e.g. 'build me a React dashboard')..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            className="flex-1 px-4 py-2.5 rounded-lg bg-bg-input border border-border text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
          <Button onClick={handleAnalyze} variant="primary" disabled={loading || !prompt.trim()}>
            <Send size={16} className="mr-1" />
            {loading ? "Analyzing..." : "Assess"}
          </Button>
        </div>
      </Card>

      {/* Intelligence Result */}
      {result && <IntelligenceResultView result={result} />}

      {/* Historical Distribution */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-text-heading mb-1 flex items-center gap-2">
          <BarChart3 size={20} className="text-info" />
          Strategy Distribution
        </h3>
        <p className="text-xs text-text-muted mb-4">
          {totalPlans > 0
            ? `${totalPlans} sessions analyzed · strategies learned from actual outcomes`
            : "No data yet — run agent sessions to build learning history"}
        </p>
        {totalPlans === 0 ? (
          <p className="text-text-muted text-sm text-center py-4">
            No strategy data yet — strategies are recorded as agent sessions run
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(distribution)
              .toSorted((a, b) => (b[1] as number) - (a[1] as number))
              .map(([strategy, count]) => {
                const pct = totalPlans > 0 ? ((count as number) / totalPlans) * 100 : 0;
                const Icon = STRATEGY_ICONS[strategy] ?? Target;
                const outcome = outcomesData?.byStrategy?.[strategy];
                return (
                  <div key={strategy} className="flex items-center gap-3">
                    <Icon size={16} className={STRATEGY_COLORS[strategy] ?? "text-accent"} />
                    <span className="w-24 font-medium text-text-primary text-sm">{strategy}</span>
                    <div className="flex-1 h-5 bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full ${STRATEGY_BAR_COLORS[strategy] ?? "bg-accent/30"} rounded-full transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-muted w-16 text-right">
                      {count as number} ({pct.toFixed(0)}%)
                    </span>
                    {outcome && (
                      <span
                        className={`text-[10px] w-16 text-right ${
                          outcome.successRate >= 0.8
                            ? "text-success"
                            : outcome.successRate >= 0.5
                              ? "text-warning"
                              : "text-danger"
                        }`}
                      >
                        {Math.round(outcome.successRate * 100)}% ok
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}
