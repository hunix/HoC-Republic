import { RefreshCw, Book, Scroll, Trophy, Clock } from "lucide-react";
import { PageHeader, Card, Badge, Button, StatCard , RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

type LegacyEvent = {
  id: string;
  type: string;
  title: string;
  description?: string;
  significance: number;
  era?: string;
  tick?: number;
  timestamp: number;
  participants?: string[];
};
type Achievement = {
  id: string;
  name: string;
  description?: string;
  era?: string;
  unlockedAt: number;
  rarity?: string;
};
type LegacyStats = {
  totalEvents?: number;
  totalAchievements?: number;
  currentEra?: string;
  civilizationAge?: number;
  peakPopulation?: number;
  totalLeaders?: number;
};

const sigVariant = (sig: number) => {
  if (sig >= 8) {return "danger" as const;}
  if (sig >= 5) {return "warning" as const;}
  if (sig >= 3) {return "info" as const;}
  return "neutral" as const;
};

const rarityVariant = (r?: string) => {
  if (r === "legendary") {return "purple" as const;}
  if (r === "epic") {return "danger" as const;}
  if (r === "rare") {return "info" as const;}
  return "neutral" as const;
};

export function CivilizationLegacyPage() {
  const { data: stats, refetch, loading, error } = useRpc<LegacyStats>("republic.legacy.stats", {}, [], {
    staleTimeMs: 30_000,
  });
  const { data: eventsData } = useRpc<{ events?: LegacyEvent[] }>(
    "republic.legacy.events",
    {},
    [],
    { staleTimeMs: 20_000 },
  );
  const { data: achData } = useRpc<{ achievements?: Achievement[] }>(
    "republic.legacy.achievements",
    {},
    [],
    { staleTimeMs: 20_000 },
  );
  const { data: timelineData } = useRpc<{
    eras?: Array<{ name: string; startTick: number; endTick?: number; summary?: string }>;
  }>("republic.legacy.timeline", {}, [], { staleTimeMs: 30_000 });

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const events = (eventsData?.events ?? []).toSorted((a, b) => b.significance - a.significance);
  const achievements = achData?.achievements ?? [];
  const eras = timelineData?.eras ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Civilization Legacy"
        description="Historical record of civilization events, achievements, era timeline, and memories"
        icon={<Book size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard
          label="Total Events"
          value={stats?.totalEvents ?? events.length}
          icon={<Scroll size={16} />}
        />
        <StatCard
          label="Achievements"
          value={stats?.totalAchievements ?? achievements.length}
          icon={<Trophy size={16} />}
        />
        <StatCard label="Current Era" value={stats?.currentEra ?? "—"} icon={<Clock size={16} />} />
        <StatCard
          label="Civilization Age"
          value={stats?.civilizationAge != null ? `${stats.civilizationAge} ticks` : "—"}
          icon={<Book size={16} />}
        />
        <StatCard
          label="Peak Population"
          value={stats?.peakPopulation?.toLocaleString() ?? "—"}
          icon={<Trophy size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Clock size={16} /> Era Timeline
          </h3>
          {eras.length === 0 ? (
            <p className="text-sm text-text-muted">No eras recorded.</p>
          ) : (
            <div className="relative pl-4 space-y-4">
              {eras.map((era, i) => (
                <div key={i} className="relative pl-4 border-l-2 border-accent/30">
                  <div className="absolute -left-1.5 top-0 w-2.5 h-2.5 rounded-full bg-accent" />
                  <p className="text-sm font-semibold text-text-heading">{era.name}</p>
                  <p className="text-xs text-text-muted">
                    Ticks {era.startTick}–{era.endTick ?? "now"}
                  </p>
                  {era.summary && <p className="text-xs text-text-secondary mt-1">{era.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Trophy size={16} /> Achievements
          </h3>
          {achievements.length === 0 ? (
            <p className="text-sm text-text-muted">No achievements yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {achievements.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 p-2 rounded bg-bg-secondary border border-border/30"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 text-lg">
                    🏆
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-heading">{a.name}</span>
                      {a.rarity && <Badge variant={rarityVariant(a.rarity)}>{a.rarity}</Badge>}
                    </div>
                    {a.description && <p className="text-xs text-text-muted">{a.description}</p>}
                    <p className="text-xs text-text-muted">
                      {a.era ? `Era: ${a.era} · ` : ""}
                      {new Date(a.unlockedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-text-heading mb-4">📜 Civilization Events</h3>
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">No events recorded.</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {events.slice(0, 25).map((ev) => (
              <div
                key={ev.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <Badge variant={sigVariant(ev.significance)}>S:{ev.significance}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-text-heading">{ev.title}</span>
                    {ev.era && <Badge variant="neutral">{ev.era}</Badge>}
                    <Badge variant="neutral">{ev.type}</Badge>
                  </div>
                  {ev.description && (
                    <p className="text-xs text-text-secondary">{ev.description}</p>
                  )}
                  {ev.participants && ev.participants.length > 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      Participants: {ev.participants.slice(0, 4).join(", ")}
                    </p>
                  )}
                </div>
                <span className="text-xs text-text-muted flex-shrink-0">
                  {ev.tick ? `T${ev.tick}` : new Date(ev.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
