/**
 * Sovereign AI — Code Interpreter Panel
 *
 * Displays code execution diagnostics, supported languages,
 * sandbox container health, and runtime environment info.
 */

import { Code2, Terminal, Cpu, Activity, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card, Badge, RpcStatus, EmptyState, ProgressBar } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

type InterpreterDiag = {
  totalExecutions: number;
  successRate: number;
  avgExecutionTimeMs: number;
  executionsByLanguage: Record<string, number>;
  containerReady: boolean;
  supportedLanguages: string[];
};

const LANG_ICONS: Record<string, string> = {
  python: "🐍",
  javascript: "🟨",
  typescript: "🔷",
  bash: "🖥️",
  node: "🟢",
  sh: "📜",
};

const LANG_COLORS: Record<string, string> = {
  python: "text-info",
  javascript: "text-warning",
  typescript: "text-info",
  bash: "text-success",
  node: "text-success",
};

export function InterpreterPanel() {
  const { data, loading, error, refetch } = useRpc<InterpreterDiag>(
    "republic.sovereign.interpreter.diagnostics",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 15_000 },
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  if (!data) {
    return <EmptyState icon={<Code2 size={40} />} title="Code interpreter initializing..." />;
  }

  const successPct = Math.round((data.successRate ?? 0) * 100);
  const languages = data.supportedLanguages ?? ["python", "javascript", "bash"];
  const execByLang = data.executionsByLanguage ?? {};

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{data.totalExecutions ?? 0}</p>
          <p className="text-xs text-text-muted">Executions</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-success">{successPct}%</p>
          <p className="text-xs text-text-muted">Success Rate</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-accent">{data.avgExecutionTimeMs ?? 0}ms</p>
          <p className="text-xs text-text-muted">Avg Runtime</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-text-heading">{languages.length}</p>
          <p className="text-xs text-text-muted">Languages</p>
        </Card>
        <Card className="p-3 text-center">
          <div className="flex items-center justify-center gap-1.5">
            {data.containerReady !== false ? (
              <CheckCircle2 size={16} className="text-success" />
            ) : (
              <XCircle size={16} className="text-danger" />
            )}
            <p className="text-sm font-bold">{data.containerReady !== false ? "Ready" : "Down"}</p>
          </div>
          <p className="text-xs text-text-muted">Sandbox</p>
        </Card>
      </div>

      {/* Supported Languages */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Terminal size={14} /> Supported Runtimes
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {languages.map((lang) => {
            const execCount = execByLang[lang] ?? 0;
            return (
              <div
                key={lang}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border/30"
              >
                <span className="text-base">{LANG_ICONS[lang] ?? "📝"}</span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium capitalize ${LANG_COLORS[lang] ?? "text-text-primary"}`}
                  >
                    {lang}
                  </p>
                  {execCount > 0 && (
                    <p className="text-[10px] text-text-muted">{execCount} executions</p>
                  )}
                </div>
                <Badge variant="success" className="text-[9px]">
                  Active
                </Badge>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Execution breakdown */}
      {Object.keys(execByLang).length > 0 && (
        <Card>
          <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
            <Activity size={14} /> Execution Distribution
          </h4>
          <div className="space-y-2">
            {Object.entries(execByLang)
              .toSorted(([, a], [, b]) => b - a)
              .map(([lang, count]) => {
                const pct =
                  (data.totalExecutions ?? 0) > 0
                    ? Math.round((count / (data.totalExecutions ?? 1)) * 100)
                    : 0;
                return (
                  <div key={lang} className="flex items-center gap-3">
                    <span className="text-xs w-5">{LANG_ICONS[lang] ?? "📝"}</span>
                    <span className="text-xs text-text-secondary w-20 capitalize truncate">
                      {lang}
                    </span>
                    <div className="flex-1">
                      <ProgressBar value={pct} max={100} size="sm" />
                    </div>
                    <span className="text-xs text-text-muted w-20 text-right">{count} runs</span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Environment capabilities */}
      <Card>
        <h4 className="font-semibold text-text-heading text-sm mb-3 flex items-center gap-2">
          <Cpu size={14} /> Environment
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Python + pip", available: true },
            { label: "Node.js + npm", available: true },
            { label: "Bash / Shell", available: true },
            { label: "File I/O (/workspace)", available: true },
            { label: "Network access", available: true },
            { label: "Image output (matplotlib)", available: true },
            { label: "Data analysis (pandas)", available: true },
            { label: "GPU compute (CUDA)", available: false },
          ].map((cap) => (
            <div key={cap.label} className="flex items-center gap-2 py-1">
              {cap.available ? (
                <CheckCircle2 size={12} className="text-success shrink-0" />
              ) : (
                <Clock size={12} className="text-text-muted shrink-0" />
              )}
              <span className="text-xs text-text-secondary">{cap.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
