import { Clock, FastForward, Pause, Play, Plus, RefreshCw, Calendar } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type TemporalClock = { tick: number; era: string; year?: number; speed: number; paused?: boolean };
type TemporalEvent = {
  id: string;
  name: string;
  scheduledAt: number;
  type?: string;
  triggered?: boolean;
};

export function TemporalPage() {
  const { data: clock, refetch: refetchClock, loading, error } = useRpc<TemporalClock>(
    "republic.temporal.clock",
    {},
    [],
    { staleTimeMs: 2_000, refetchIntervalMs: 3_000 },
  );
  const { data: eventsData, refetch: refetchEvents } = useRpc<{ events?: TemporalEvent[] }>(
    "republic.temporal.events",
    {},
    [],
    { staleTimeMs: 5_000, refetchIntervalMs: 10_000 },
  );
   const { data: histData } = useRpc<{
    history?: Array<{ era: string; startTick: number; endTick?: number }>;
  }>("republic.temporal.history", {}, [], { staleTimeMs: 30_000 });

  const [actionError, setActionError] = useState("");
  const [speed, setSpeed] = useState(1);
  const [newEventName, setNewEventName] = useState("");
  const [newEventAt, setNewEventAt] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetchClock} />;
  }

  function refetch() {
    refetchClock();
    refetchEvents();
  }

  async function pauseTime() {
    try {
      await rpc("republic.temporal.pause", {});
      invalidateRpcCache("republic.temporal.clock");
      refetchClock();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function resumeTime() {
    try {
      await rpc("republic.temporal.resume", {});
      invalidateRpcCache("republic.temporal.clock");
      refetchClock();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function applySpeed() {
    try {
      await rpc("republic.temporal.speed", { speed });
      invalidateRpcCache("republic.temporal.clock");
      refetchClock();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function scheduleEvent() {
    if (!newEventName.trim() || !newEventAt) {return;}
    try {
      await rpc("republic.temporal.event.schedule", {
        name: newEventName.trim(),
        scheduledAt: parseInt(newEventAt),
      });
      invalidateRpcCache("republic.temporal.events");
      setNewEventName("");
      setNewEventAt("");
      refetchEvents();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function transitionEra() {
    const era = prompt("New era name:");
    if (!era) {return;}
    try {
      await rpc("republic.temporal.era.transition", { era });
      invalidateRpcCache("republic.temporal.clock");
      refetchClock();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const events = eventsData?.events ?? [];
  const history = histData?.history ?? [];
  const pending = events.filter((e) => !e.triggered).length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Temporal Engine"
        description="Control time flow, eras, speed, and scheduled events in the republic"
        icon={<Clock size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
            {clock?.paused ? (
              <Button size="sm" icon={<Play size={14} />} onClick={resumeTime}>
                Resume
              </Button>
            ) : (
              <Button size="sm" variant="outline" icon={<Pause size={14} />} onClick={pauseTime}>
                Pause
              </Button>
            )}
          </div>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Current Tick" value={clock?.tick ?? 0} icon={<Clock size={16} />} />
        <StatCard label="Era" value={clock?.era ?? "—"} icon={<Calendar size={16} />} />
        <StatCard label="Speed" value={`${clock?.speed ?? 1}x`} icon={<FastForward size={16} />} />
        <StatCard label="Pending Events" value={pending} icon={<Calendar size={16} />} />
      </div>

      {/* Status Banner */}
      <div
        className={`p-4 rounded-xl border flex items-center gap-3 ${clock?.paused ? "bg-warning/10 border-warning/30" : "bg-success/10 border-success/30"}`}
      >
        <div
          className={`w-3 h-3 rounded-full ${clock?.paused ? "bg-warning" : "bg-success animate-pulse"}`}
        />
        <div>
          <p className="font-semibold text-text-heading">
            Time is{" "}
            <Badge variant={clock?.paused ? "warning" : "success"}>
              {clock?.paused ? "PAUSED" : "FLOWING"}
            </Badge>
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Era: {clock?.era ?? "Unknown"} · Tick {clock?.tick ?? 0} · {clock?.speed ?? 1}x speed
          </p>
        </div>
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={transitionEra}>
            ⏭ Transition Era
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Speed Control */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <FastForward size={16} /> Time Speed
          </h3>
          <div className="flex items-center gap-4 mb-3">
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="text-sm font-mono text-accent w-12 text-right">
              {speed.toFixed(1)}x
            </span>
          </div>
          <div className="flex gap-2 mb-3">
            {[0.5, 1, 2, 5, 10].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={speed === s ? "primary" : "outline"}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </Button>
            ))}
          </div>
          <Button className="w-full" size="sm" onClick={applySpeed}>
            Apply Speed
          </Button>
        </Card>

        {/* Schedule Event */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Plus size={16} /> Schedule Event
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Event name..."
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
            />
            <input
              type="number"
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Tick number to trigger at..."
              value={newEventAt}
              onChange={(e) => setNewEventAt(e.target.value)}
            />
            <Button onClick={scheduleEvent} disabled={!newEventName.trim() || !newEventAt}>
              Schedule
            </Button>
          </div>
        </Card>
      </div>

      {/* Events */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
          <Calendar size={16} /> Timeline Events
        </h3>
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">No events scheduled.</p>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={ev.triggered ? "success" : "info"}>
                    {ev.triggered ? "triggered" : "pending"}
                  </Badge>
                  <span className="text-sm font-medium text-text-heading">{ev.name}</span>
                  {ev.type && <span className="text-xs text-text-muted">[{ev.type}]</span>}
                </div>
                <span className="text-xs font-mono text-text-muted">tick {ev.scheduledAt}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Era History */}
      {history.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">📜 Era History</h3>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                  <span className="text-text-heading font-medium">{h.era}</span>
                </div>
                <span className="text-xs text-text-muted font-mono">
                  ticks {h.startTick}–{h.endTick ?? "present"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
