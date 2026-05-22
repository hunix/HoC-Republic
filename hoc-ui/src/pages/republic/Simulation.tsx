import {
  Play,
  Pause,
  RotateCcw,
  FlaskConical,
  Clock,
  Zap,
  Users,
  Cpu,
  Activity,
  FastForward,
  Globe,
  Film,
} from "lucide-react";
import { useState, useEffect } from "react";
import { PageHeader, Card, Badge, Button, StatCard, RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type SimStatus = {
  running?: boolean;
  tickRate?: number;
  currentTick?: number;
  totalEventsProcessed?: number;
  activeAgents?: number;
  hibernatedAgents?: number;
  memoryUsageMB?: number;
  uptime?: number;
  eventsPerSecond?: number;
  scenarioName?: string;
};
type ScheduledEvent = {
  id?: string;
  type?: string;
  description?: string;
  scheduledFor?: number;
  createdAt?: number;
};
type Scenario = { id: string; name: string; description?: string; worldSize?: number };

export function SimulationPage() {
  const { data, refetch, loading, error } = useRpc<{
    status?: SimStatus;
    events?: ScheduledEvent[];
  }>("republic.simulation.status", {}, [], { staleTimeMs: 3_000, refetchIntervalMs: 5_000 });
  const { data: scenariosData } = useRpc<{ scenarios?: Scenario[] }>(
    "republic.simulation.scenarios",
    {},
    [],
    { staleTimeMs: 30_000 },
  );
  const [tickRate, setTickRate] = useState(10);
  const [actionError, setActionError] = useState("");

  const sim = data?.status;
  const events = data?.events ?? [];
  const scenarios = scenariosData?.scenarios ?? [];
  const isRunning = sim?.running === true;

  async function toggle() {
    try {
      if (isRunning) {
        await rpc("republic.simulation.stop", {});
      } else {
        await rpc("republic.simulation.start", {});
      }
      invalidateRpcCache("republic.simulation.status");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function applyTickRate() {
    try {
      await rpc("republic.simulation.tickrate", { rate: tickRate });
      invalidateRpcCache("republic.simulation.status");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadScenario(id: string) {
    try {
      await rpc("republic.simulation.scenario.load", { scenarioId: id });
      invalidateRpcCache("republic.simulation.status");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function generateWorld() {
    try {
      await rpc("republic.simulation.world.generate", {});
      invalidateRpcCache("republic.simulation.status");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  // Auto-refresh every 5s when simulation is running
  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const id = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(id);
  }, [isRunning, refetch]);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Simulation"
        description="Live Republic simulation engine — all citizens, economy, governance, and AI ticks"
        icon={<FlaskConical size={28} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant={isRunning ? "outline" : "primary"}
              icon={isRunning ? <Pause size={14} /> : <Play size={14} />}
              onClick={toggle}
            >
              {isRunning ? "Pause" : "Start"}
            </Button>
            <Button
              variant="outline"
              icon={<RotateCcw size={14} />}
              onClick={async () => {
                await rpc("republic.simulation.reset", {});
                refetch();
              }}
            >
              Reset
            </Button>
          </div>
        }
      />

      {actionError && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
          {actionError}
        </div>
      )}

      {/* Status Banner */}
      <Card
        className={`border-2 ${isRunning ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-3 h-3 rounded-full ${isRunning ? "bg-success animate-pulse" : "bg-warning"}`}
          />
          <div className="flex-1">
            <p className="font-semibold text-text-heading">
              Simulation {isRunning ? "Running" : "Paused / Stopped"}
              {sim?.scenarioName && (
                <span className="ml-2 text-sm text-text-muted font-normal">
                  — {sim.scenarioName}
                </span>
              )}
            </p>
            <p className="text-xs text-text-muted">
              {sim
                ? `Tick ${(sim.currentTick ?? 0).toLocaleString()} · ${sim.eventsPerSecond ?? 0} events/s · ${sim.uptime ?? 0}s uptime`
                : "Waiting for first status poll..."}
            </p>
          </div>
          <Badge variant={isRunning ? "success" : "warning"}>{isRunning ? "Live" : "Idle"}</Badge>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Current Tick"
          value={(sim?.currentTick ?? 0).toLocaleString()}
          icon={<Zap size={16} />}
        />
        <StatCard
          label="Tick Rate"
          value={sim?.tickRate != null ? `${sim.tickRate}/s` : "—"}
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Active Agents"
          value={sim?.activeAgents ?? "—"}
          icon={<Users size={16} />}
        />
        <StatCard
          label="Memory"
          value={sim?.memoryUsageMB != null ? `${sim.memoryUsageMB} MB` : "—"}
          icon={<Cpu size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Engine Stats */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-heading">Engine Stats</h3>
            <Badge variant="info">Live</Badge>
          </div>
          <div className="space-y-2 text-sm">
            {[
              { label: "Total Events", value: (sim?.totalEventsProcessed ?? 0).toLocaleString() },
              { label: "Active Agents", value: String(sim?.activeAgents ?? "—") },
              { label: "Hibernated Agents", value: String(sim?.hibernatedAgents ?? "—") },
              { label: "Events/s", value: String(sim?.eventsPerSecond ?? "—") },
              { label: "Uptime", value: sim?.uptime != null ? `${sim.uptime}s` : "—" },
            ].map((r) => (
              <div key={r.label} className="flex justify-between">
                <span className="text-text-muted">{r.label}</span>
                <span className="font-mono">{r.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Tick Rate Control */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <FastForward size={16} /> Tick Rate
          </h3>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="range"
              min={1}
              max={100}
              value={tickRate}
              onChange={(e) => setTickRate(parseInt(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="font-mono text-accent w-16 text-right">{tickRate}/s</span>
          </div>
          <div className="flex gap-1 mb-3 flex-wrap">
            {[1, 5, 10, 25, 50, 100].map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setTickRate(r)}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${tickRate === r ? "bg-accent text-white" : "bg-bg-secondary border border-border text-text-muted hover:border-accent"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <Button className="w-full" size="sm" onClick={applyTickRate}>
            Apply Tick Rate
          </Button>

          <div className="mt-4 pt-4 border-t border-border/30">
            <h4 className="text-sm font-semibold text-text-heading mb-2 flex items-center gap-2">
              <Globe size={14} /> World Actions
            </h4>
            <Button
              className="w-full mb-2"
              size="sm"
              variant="outline"
              icon={<Globe size={12} />}
              onClick={generateWorld}
            >
              Generate World
            </Button>
          </div>
        </Card>

        {/* Scheduled Events */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-heading">Scheduled Events</h3>
            <Badge variant="neutral">{events.length}</Badge>
          </div>
          {events.length === 0 ? (
            <p className="text-text-muted text-xs py-4 text-center">No scheduled events</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {events.slice(0, 8).map((e, i) => (
                <div
                  key={e.id ?? i}
                  className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0"
                >
                  <Activity size={12} className="text-accent mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-heading truncate">
                      {e.type ?? "Event"}
                    </p>
                    <p className="text-xs text-text-muted truncate">{e.description ?? ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Scenarios */}
      {scenarios.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Film size={16} /> Scenarios
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scenarios.map((sc) => (
              <div
                key={sc.id}
                className="p-3 rounded-lg bg-bg-secondary border border-border/30 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-heading truncate">{sc.name}</p>
                  {sc.description && (
                    <p className="text-xs text-text-muted mt-0.5">{sc.description}</p>
                  )}
                  {sc.worldSize != null && (
                    <p className="text-xs text-text-muted">World size: {sc.worldSize}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Play size={10} />}
                  onClick={() => loadScenario(sc.id)}
                >
                  Load
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
