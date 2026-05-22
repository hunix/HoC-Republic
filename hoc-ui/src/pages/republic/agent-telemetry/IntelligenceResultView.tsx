import {
  Target,
  BarChart3,
  Layers,
  Zap,
  Brain,
  ArrowRight,
  Shield,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";

export interface IntelligenceResult {
  strategy: string;
  confidence: number;
  effectiveMaxIterations: number;
  filteredTools: string[];
  phases: Array<{
    phase: string;
    description: string;
    tools: string[];
    budget: number;
  }>;
  estimatedIterations: number;
  reasoning: string;
  promptModifier: string;
  historicalOutcomes?: {
    count: number;
    avgIterations: number;
    successRate: number;
    avgDurationMs: number;
  } | null;
  totalOutcomes?: number;
  errorProneTools?: Array<{ name: string; errorRate: number; errors: number }>;
}

export const STRATEGY_ICONS: Record<string, typeof Target> = {
  DIRECT: Zap,
  RESEARCH: BarChart3,
  BUILD: Layers,
  CREATIVE: Target,
  ANALYSIS: BarChart3,
  FULL_STACK: Layers,
  DEEP_THINK: Brain,
};

export const STRATEGY_COLORS: Record<string, string> = {
  DIRECT: "text-success",
  RESEARCH: "text-info",
  BUILD: "text-accent",
  CREATIVE: "text-purple",
  ANALYSIS: "text-warning",
  FULL_STACK: "text-danger",
  DEEP_THINK: "text-info",
};

export default function IntelligenceResultView({ result }: { result: IntelligenceResult }) {
  return (
    <div className="space-y-4">
      {/* Strategy Header */}
      <Card className="p-6 border-accent/30">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {(() => {
              const Icon = STRATEGY_ICONS[result.strategy] ?? Target;
              return (
                <div className="p-3 rounded-xl bg-accent/10">
                  <Icon size={28} className={STRATEGY_COLORS[result.strategy] ?? "text-accent"} />
                </div>
              );
            })()}
            <div>
              <h4 className="text-xl font-bold text-text-heading">{result.strategy}</h4>
              <p className="text-xs text-text-muted">{result.reasoning}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                result.confidence > 0.7
                  ? "success"
                  : result.confidence > 0.4
                    ? "warning"
                    : "neutral"
              }
            >
              {Math.round(result.confidence * 100)}% confidence
            </Badge>
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="p-3 rounded-lg bg-bg-secondary border border-border text-center">
            <Clock size={16} className="mx-auto text-info mb-1" />
            <div className="text-lg font-bold text-text-heading">{result.estimatedIterations}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              Est. Iterations
            </div>
          </div>
          <div className="p-3 rounded-lg bg-bg-secondary border border-border text-center">
            <Shield size={16} className="mx-auto text-accent mb-1" />
            <div className="text-lg font-bold text-text-heading">
              {result.effectiveMaxIterations}
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Max Budget</div>
          </div>
          <div className="p-3 rounded-lg bg-bg-secondary border border-border text-center">
            <Filter size={16} className="mx-auto text-warning mb-1" />
            <div className="text-lg font-bold text-text-heading">{result.filteredTools.length}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              Tools Excluded
            </div>
          </div>
        </div>

        {/* System Directive */}
        {result.promptModifier && (
          <div className="mb-5 p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm text-text-secondary">
            <span className="font-medium text-accent">System Directive: </span>
            {result.promptModifier}
          </div>
        )}

        {/* Excluded Tools */}
        {result.filteredTools.length > 0 && (
          <div className="mb-5 p-3 rounded-lg bg-danger/5 border border-danger/20">
            <span className="text-xs font-medium text-danger">Excluded from tool set:</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {result.filteredTools.map((t) => (
                <Badge key={t} variant="danger">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Phase Pipeline */}
        <h5 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
          <Layers size={16} className="text-accent" />
          Execution Pipeline ({result.phases.length} phases)
        </h5>
        <div className="space-y-2">
          {result.phases.map((phase, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg bg-bg-secondary border border-border hover:border-accent/30 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary text-sm">{phase.phase}</span>
                  {i < result.phases.length - 1 && (
                    <ArrowRight size={12} className="text-text-muted flex-shrink-0" />
                  )}
                </div>
                <span className="text-xs text-text-secondary">{phase.description}</span>
              </div>
              <Badge variant="info">{phase.budget} iters</Badge>
              <div className="flex gap-1 flex-wrap max-w-[200px]">
                {phase.tools.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input text-text-muted"
                  >
                    {t}
                  </span>
                ))}
                {phase.tools.length > 3 && (
                  <span className="text-[10px] text-text-muted">+{phase.tools.length - 3}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Intelligence Features Card */}
      <Card className="p-6">
        <h5 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
          <Shield size={16} className="text-success" />
          Active Intelligence Features
        </h5>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              icon: <Clock size={14} />,
              name: "Dynamic Iteration Budget",
              desc: `Capped at ${result.effectiveMaxIterations} (not default 500)`,
              active: result.effectiveMaxIterations < 500,
            },
            {
              icon: <Filter size={14} />,
              name: "Tool Set Filtering",
              desc: `${result.filteredTools.length} irrelevant tools removed`,
              active: result.filteredTools.length > 0,
            },
            {
              icon: <AlertTriangle size={14} />,
              name: "Stall Detection",
              desc: "Detects 3+ consecutive no-progress iterations",
              active: true,
            },
            {
              icon: <CheckCircle size={14} />,
              name: "Corrective Injection",
              desc: "Injects system nudge when agent stalls",
              active: true,
            },
            {
              icon: <BarChart3 size={14} />,
              name: "Phase Progress Tracking",
              desc: `${result.phases.length} phases with budget tracking`,
              active: result.phases.length > 1,
            },
            {
              icon: <Brain size={14} />,
              name: "Historical Learning",
              desc: result.historicalOutcomes
                ? `${result.historicalOutcomes.count} past outcomes · ${Math.round(result.historicalOutcomes.successRate * 100)}% success`
                : "Waiting for 3+ samples to activate",
              active: !!result.historicalOutcomes,
            },
            {
              icon: <Clock size={14} />,
              name: "Adaptive Timeouts",
              desc: "Tool timeouts adjusted from p95 latency telemetry",
              active: (result.totalOutcomes ?? 0) > 0,
            },
            {
              icon: <AlertTriangle size={14} />,
              name: "Error-Prone Auto-Exclusion",
              desc:
                (result.errorProneTools?.length ?? 0) > 0
                  ? `Auto-excluded: ${result.errorProneTools!.map((t) => t.name).join(", ")}`
                  : "No consistently failing tools detected",
              active: (result.errorProneTools?.length ?? 0) > 0,
            },
          ].map((feature) => (
            <div
              key={feature.name}
              className={`p-3 rounded-lg border ${feature.active ? "border-success/30 bg-success/5" : "border-border bg-bg-secondary"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={feature.active ? "text-success" : "text-text-muted"}>
                  {feature.icon}
                </span>
                <span className="text-sm font-medium text-text-primary">{feature.name}</span>
                <Badge variant={feature.active ? "success" : "neutral"}>
                  {feature.active ? "ON" : "IDLE"}
                </Badge>
              </div>
              <p className="text-xs text-text-muted pl-6">{feature.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Historical Learning Card */}
      {result.historicalOutcomes && (
        <Card className="p-6 border-info/30">
          <h5 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
            <Brain size={16} className="text-info" />
            Historical Learning for {result.strategy}
          </h5>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-bg-secondary">
              <div className="text-lg font-bold text-text-heading">
                {result.historicalOutcomes.count}
              </div>
              <div className="text-[10px] text-text-muted uppercase">Past Sessions</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-bg-secondary">
              <div className="text-lg font-bold text-text-heading">
                {result.historicalOutcomes.avgIterations}
              </div>
              <div className="text-[10px] text-text-muted uppercase">Avg Iterations</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-bg-secondary">
              <div
                className={`text-lg font-bold ${
                  result.historicalOutcomes.successRate >= 0.8
                    ? "text-success"
                    : result.historicalOutcomes.successRate >= 0.5
                      ? "text-warning"
                      : "text-danger"
                }`}
              >
                {Math.round(result.historicalOutcomes.successRate * 100)}%
              </div>
              <div className="text-[10px] text-text-muted uppercase">Success Rate</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-bg-secondary">
              <div className="text-lg font-bold text-text-heading">
                {Math.round(result.historicalOutcomes.avgDurationMs / 1000)}s
              </div>
              <div className="text-[10px] text-text-muted uppercase">Avg Duration</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
