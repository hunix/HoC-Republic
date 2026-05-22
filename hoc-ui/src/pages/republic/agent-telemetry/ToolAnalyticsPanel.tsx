import { Zap, Clock, AlertTriangle, TrendingDown, Search } from "lucide-react";
import { useState } from "react";
import { Card, Badge, ProgressBar } from "@/components/ui";
import type { ToolStat } from "../AgentTelemetryPage";

interface Props {
  toolStats: Record<string, ToolStat>;
}

type SortKey = "calls" | "errors" | "avgMs" | "p95Ms" | "name";

export default function ToolAnalyticsPanel({ toolStats }: Props) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("calls");

  const entries = Object.entries(toolStats)
    .filter(([name]) => !search || name.toLowerCase().includes(search.toLowerCase()))
    .toSorted((a, b) => {
      switch (sortBy) {
        case "calls":
          return b[1].totalCalls - a[1].totalCalls;
        case "errors":
          return b[1].totalErrors - a[1].totalErrors;
        case "avgMs":
          return b[1].avgDurationMs - a[1].avgDurationMs;
        case "p95Ms":
          return b[1].p95DurationMs - a[1].p95DurationMs;
        case "name":
          return a[0].localeCompare(b[0]);
        default:
          return 0;
      }
    });

  function formatMs(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-bg-input border border-border text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              ["calls", "By Calls"],
              ["errors", "By Errors"],
              ["avgMs", "By Latency"],
              ["p95Ms", "By P95"],
              ["name", "By Name"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sortBy === key
                  ? "bg-accent/20 text-accent border border-accent/30"
                  : "bg-bg-secondary text-text-secondary hover:text-text-primary border border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-bg-secondary border border-border text-center">
          <div className="text-2xl font-bold text-text-heading">{entries.length}</div>
          <div className="text-xs text-text-muted">Unique Tools</div>
        </div>
        <div className="p-3 rounded-lg bg-bg-secondary border border-border text-center">
          <div className="text-2xl font-bold text-text-heading">
            {entries.reduce((s, [, t]) => s + t.totalCalls, 0).toLocaleString()}
          </div>
          <div className="text-xs text-text-muted">Total Calls</div>
        </div>
        <div className="p-3 rounded-lg bg-bg-secondary border border-border text-center">
          <div className="text-2xl font-bold text-danger">
            {entries.reduce((s, [, t]) => s + t.totalErrors, 0)}
          </div>
          <div className="text-xs text-text-muted">Total Errors</div>
        </div>
        <div className="p-3 rounded-lg bg-bg-secondary border border-border text-center">
          <div className="text-2xl font-bold text-warning">
            {entries.length > 0
              ? formatMs(
                  Math.round(entries.reduce((s, [, t]) => s + t.avgDurationMs, 0) / entries.length),
                )
              : "—"}
          </div>
          <div className="text-xs text-text-muted">Global Avg Latency</div>
        </div>
      </div>

      {/* Tool Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {entries.map(([name, ts]) => {
          const errorRate = ts.totalCalls > 0 ? ts.totalErrors / ts.totalCalls : 0;
          return (
            <Card key={name} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-accent" />
                  <span className="font-medium text-text-primary text-sm truncate max-w-[180px]">
                    {name}
                  </span>
                </div>
                <Badge variant={errorRate > 0.1 ? "danger" : errorRate > 0 ? "warning" : "success"}>
                  {Math.round((1 - errorRate) * 100)}%
                </Badge>
              </div>

              <div className="space-y-2 text-xs text-text-secondary">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <Zap size={10} /> Calls
                  </span>
                  <span className="font-mono text-text-primary">{ts.totalCalls}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <AlertTriangle size={10} /> Errors
                  </span>
                  <span
                    className={`font-mono ${ts.totalErrors > 0 ? "text-danger" : "text-text-primary"}`}
                  >
                    {ts.totalErrors}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <Clock size={10} /> Avg
                  </span>
                  <span className="font-mono text-text-primary">{formatMs(ts.avgDurationMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <TrendingDown size={10} /> P95
                  </span>
                  <span
                    className={`font-mono ${ts.p95DurationMs > 5000 ? "text-warning" : "text-text-primary"}`}
                  >
                    {formatMs(ts.p95DurationMs)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Max</span>
                  <span className="font-mono text-text-primary">{formatMs(ts.maxDurationMs)}</span>
                </div>
              </div>

              <div className="mt-3">
                <ProgressBar
                  value={ts.totalCalls - ts.totalErrors}
                  max={Math.max(ts.totalCalls, 1)}
                  size="sm"
                />
              </div>
            </Card>
          );
        })}
      </div>

      {entries.length === 0 && (
        <div className="text-center py-8 text-text-muted">
          {search ? "No tools match your search" : "No tool data yet — run an agent session"}
        </div>
      )}
    </div>
  );
}
