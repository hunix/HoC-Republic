import {
  ScrollText,
  Trash2,
  Pause,
  Play,
  Download,
  Search,
  Filter,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  ChevronDown,
  X,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PageHeader, Badge, Button } from "@/components/ui";
import { rpc } from "@/lib/rpc";

// ── Types ─────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  level: "info" | "warn" | "error" | "debug" | "trace" | "fatal";
  message: string;
  subsystem: string;
  ts: string;
  meta?: Record<string, unknown>;
}

interface TailResult {
  file: string;
  cursor: number;
  size: number;
  lines: string[];
  truncated: boolean;
  reset: boolean;
}

// ── Log Line Parser ───────────────────────────────────────────────

const LEVEL_MAP: Record<string, LogEntry["level"]> = {
  TRACE: "trace",
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
};

function parseLogLine(raw: string, id: string): LogEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      const meta = obj._meta ?? obj;
      const logLevel = (meta.logLevelName ?? meta.level ?? "INFO").toUpperCase();
      const level = LEVEL_MAP[logLevel] ?? "info";
      const subsystem = meta.name ?? meta.subsystem ?? "gateway";
      const dateStr = meta.date ?? meta.time ?? new Date().toISOString();
      const ts = formatTimestamp(dateStr);

      let message = "";
      const metaFields: Record<string, unknown> = {};
      if (typeof obj["1"] === "string") {
        message = obj["1"];
        if (obj["0"] && typeof obj["0"] === "object") {
          Object.assign(metaFields, obj["0"]);
        }
      } else if (typeof obj["0"] === "string") {
        message = obj["0"];
      } else if (typeof obj.message === "string") {
        message = obj.message;
      } else {
        const { _meta, ...rest } = obj;
        message = JSON.stringify(rest);
      }

      for (const key of Object.keys(obj)) {
        if (key === "_meta" || key === "0" || key === "1") {
          continue;
        }
        if (/^\d+$/.test(key) && typeof obj[key] === "string") {
          message += ` ${obj[key]}`;
        } else if (/^\d+$/.test(key) && typeof obj[key] === "object") {
          Object.assign(metaFields, obj[key]);
        }
      }

      return {
        id,
        level,
        message: message.trim(),
        subsystem,
        ts,
        meta: Object.keys(metaFields).length > 0 ? metaFields : undefined,
      };
    } catch {
      // Not valid JSON, fall through
    }
  }

  const plainMatch = trimmed.match(/^(?:(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\s+)?\[([^\]]+)\]\s+(.*)$/);
  if (plainMatch) {
    const [, time, subsystem, msg] = plainMatch;
    const levelMatch = msg.match(/^(ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\s+/i);
    const level = levelMatch ? (LEVEL_MAP[levelMatch[1].toUpperCase()] ?? "info") : "info";
    const message = levelMatch ? msg.slice(levelMatch[0].length) : msg;
    return { id, level, message, subsystem, ts: time ?? new Date().toLocaleTimeString() };
  }

  return {
    id,
    level: "info",
    message: trimmed,
    subsystem: "gateway",
    ts: new Date().toLocaleTimeString(),
  };
}

function formatTimestamp(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return dateStr;
    }
    return d.toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return dateStr;
  }
}

// ── Level Styling ─────────────────────────────────────────────────

const LEVEL_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  error: { color: "text-danger", bg: "bg-danger/10", icon: <AlertCircle size={11} /> },
  fatal: { color: "text-danger", bg: "bg-danger/20", icon: <AlertCircle size={11} /> },
  warn: { color: "text-warning", bg: "bg-warning/10", icon: <AlertTriangle size={11} /> },
  info: { color: "text-info", bg: "bg-transparent", icon: <Info size={11} /> },
  debug: { color: "text-text-muted", bg: "bg-transparent", icon: <Bug size={11} /> },
  trace: { color: "text-text-muted", bg: "bg-transparent", icon: <Bug size={11} /> },
};

const MAX_ENTRIES = 2000;
const POLL_INTERVAL_MS = 1000;

// ── Component ─────────────────────────────────────────────────────

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [subsystemFilter, setSubsystemFilter] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [showSubsystemDropdown, setShowSubsystemDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<number | undefined>(undefined);
  const idCounterRef = useRef(0);
  const pausedRef = useRef(paused);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSubsystemDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchLogs = useCallback(async () => {
    if (pausedRef.current) {
      return;
    }
    try {
      const result = await rpc<TailResult>("logs.tail", { cursor: cursorRef.current, limit: 500 });
      if (!result || !result.lines) {
        return;
      }
      cursorRef.current = result.cursor;
      if (result.lines.length === 0) {
        return;
      }

      const newEntries = result.lines
        .map((line) => {
          const id = `log-${idCounterRef.current++}`;
          return parseLogLine(line, id);
        })
        .filter((e): e is LogEntry => e !== null);

      if (newEntries.length > 0) {
        setLogs((prev) => {
          const combined = [...prev, ...newEntries];
          return combined.length > MAX_ENTRIES ? combined.slice(-MAX_ENTRIES) : combined;
        });
      }
    } catch {
      // silent retry
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    if (!paused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, paused]);

  const subsystems = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      set.add(log.subsystem);
    }
    return [...set].toSorted();
  }, [logs]);

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { info: 0, warn: 0, error: 0, debug: 0 };
    for (const log of logs) {
      if (log.level in counts) {
        counts[log.level]++;
      }
      if (log.level === "fatal") {
        counts.error++;
      }
      if (log.level === "trace") {
        counts.debug++;
      }
    }
    return counts;
  }, [logs]);

  const filtered = useMemo(() => {
    let result = logs;
    if (levelFilter) {
      result = result.filter((l) => {
        if (levelFilter === "error") {
          return l.level === "error" || l.level === "fatal";
        }
        if (levelFilter === "debug") {
          return l.level === "debug" || l.level === "trace";
        }
        return l.level === levelFilter;
      });
    }
    if (subsystemFilter) {
      result = result.filter((l) => l.subsystem === subsystemFilter);
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(
        (l) => l.message.toLowerCase().includes(q) || l.subsystem.toLowerCase().includes(q),
      );
    }
    return result;
  }, [logs, levelFilter, subsystemFilter, searchText]);

  const handleExport = () => {
    const content = filtered
      .map(
        (l) =>
          `[${l.ts}] ${l.level.toUpperCase().padEnd(5)} [${l.subsystem}] ${l.message}${l.meta ? " " + JSON.stringify(l.meta) : ""}`,
      )
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gateway-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in space-y-3 p-5">
      <PageHeader
        title="Logs"
        description={`${logs.length.toLocaleString()} entries · ${subsystems.length} subsystems`}
        icon={<ScrollText size={20} />}
        actions={
          <div className="flex gap-1.5">
            <Button
              variant={paused ? "success" : "ghost"}
              size="sm"
              icon={paused ? <Play size={13} /> : <Pause size={13} />}
              aria-label={paused ? "Resume" : "Pause"}
              onClick={() => setPaused(!paused)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Download size={13} />}
              aria-label="Export"
              onClick={handleExport}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={13} />}
              aria-label="Clear"
              onClick={() => {
                setLogs([]);
                cursorRef.current = undefined;
              }}
            />
          </div>
        }
      />

      {/* Compact stats + filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Level counts */}
        <div className="flex items-center gap-3 text-[10px] tabular-nums">
          <span className="text-info flex items-center gap-0.5">
            <Info size={9} /> {levelCounts.info}
          </span>
          <span className="text-warning flex items-center gap-0.5">
            <AlertTriangle size={9} /> {levelCounts.warn}
          </span>
          <span className="text-danger flex items-center gap-0.5">
            <AlertCircle size={9} /> {levelCounts.error}
          </span>
          <span className="text-text-muted flex items-center gap-0.5">
            <Bug size={9} /> {levelCounts.debug}
          </span>
        </div>

        {paused && (
          <Badge variant="warning" dot>
            Paused
          </Badge>
        )}

        <div className="h-3 w-px bg-border/30" />

        {/* Level filter pills */}
        {(
          [
            { key: "", label: "All", icon: null },
            { key: "info", label: "Info", icon: <Info size={10} /> },
            { key: "warn", label: "Warn", icon: <AlertTriangle size={10} /> },
            { key: "error", label: "Err", icon: <AlertCircle size={10} /> },
            { key: "debug", label: "Dbg", icon: <Bug size={10} /> },
          ] as const
        ).map(({ key, label, icon }) => (
          <button
            type="button"
            key={key}
            onClick={() => setLevelFilter(key)}
            className={`flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border
              ${
                levelFilter === key
                  ? "bg-accent/20 text-accent border-accent/40"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-card border-transparent"
              }`}
          >
            {icon}
            {label}
          </button>
        ))}

        {/* Subsystem dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setShowSubsystemDropdown(!showSubsystemDropdown)}
            className={`flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border
              ${
                subsystemFilter
                  ? "bg-accent/20 text-accent border-accent/40"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-card border-transparent"
              }`}
          >
            <Filter size={9} />
            {subsystemFilter || "System"}
            <ChevronDown size={8} />
          </button>
          {showSubsystemDropdown && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto min-w-[160px]">
              <button
                type="button"
                onClick={() => {
                  setSubsystemFilter("");
                  setShowSubsystemDropdown(false);
                }}
                className="w-full text-left px-2.5 py-1.5 text-[10px] hover:bg-bg-secondary transition-colors text-text-secondary cursor-pointer"
              >
                All
              </button>
              {subsystems.map((sub) => (
                <button
                  type="button"
                  key={sub}
                  onClick={() => {
                    setSubsystemFilter(sub);
                    setShowSubsystemDropdown(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-[10px] hover:bg-bg-secondary transition-colors cursor-pointer
                    ${subsystemFilter === sub ? "text-accent bg-accent/10" : "text-text-secondary"}`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear filters */}
        {(levelFilter || subsystemFilter || searchText) && (
          <button
            type="button"
            onClick={() => {
              setLevelFilter("");
              setSubsystemFilter("");
              setSearchText("");
            }}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] text-text-muted hover:text-danger transition-colors cursor-pointer"
          >
            <X size={9} /> Clear
          </button>
        )}

        {/* Search */}
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search…"
            className="pl-7 pr-2.5 py-1 rounded-lg text-[10px] bg-bg-input border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 w-44 transition-colors"
          />
        </div>
      </div>

      {/* Log Stream */}
      <div className="rounded-xl border border-border/30 bg-bg-card overflow-hidden">
        <div
          ref={containerRef}
          className="h-[calc(100vh-260px)] min-h-[300px] overflow-y-auto font-mono text-[10px] leading-5"
        >
          {filtered.length === 0 && (
            <p className="text-text-muted text-center py-16 text-xs">
              {logs.length === 0 ? "Connecting to gateway logs…" : "No entries match filters"}
            </p>
          )}
          {filtered.map((log) => {
            const cfg = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.info;
            return (
              <div
                key={log.id}
                className={`flex gap-1.5 px-2.5 py-px hover:bg-bg-card-hover/30 border-l-2 ${
                  log.level === "error" || log.level === "fatal"
                    ? "border-l-danger/60"
                    : log.level === "warn"
                      ? "border-l-warning/40"
                      : "border-l-transparent"
                } ${cfg.bg}`}
              >
                <span className="text-text-muted shrink-0 w-[60px] select-all tabular-nums">
                  {log.ts}
                </span>
                <span
                  className={`shrink-0 w-[12px] flex items-center justify-center ${cfg.color}`}
                  title={log.level}
                >
                  {cfg.icon}
                </span>
                <span
                  className="shrink-0 text-purple bg-purple/10 px-1 rounded text-[9px] font-medium max-w-[140px] truncate"
                  title={log.subsystem}
                >
                  {log.subsystem}
                </span>
                <span className="text-text-secondary break-all select-all flex-1 min-w-0">
                  {log.message}
                  {log.meta && (
                    <span className="text-text-muted ml-1.5 text-[9px]">
                      {Object.entries(log.meta)
                        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
                        .join(" ")}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
