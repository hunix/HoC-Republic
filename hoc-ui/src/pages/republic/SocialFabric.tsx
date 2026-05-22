import { Users, Heart, MessageCircle, Home, RefreshCw, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type SocialBond = {
  citizenA: string;
  citizenB: string;
  type: string;
  strength: number;
  createdAt: number;
};
type SocialEvent = {
  id: string;
  type: string;
  participants: string[];
  description?: string;
  timestamp: number;
};
type Community = { id: string; name: string; members: number; cohesion?: number; type?: string };

const bondVariant = (type: string) => {
  if (type === "friendship") {return "success";}
  if (type === "romance") {return "purple";}
  if (type === "rivalry") {return "danger";}
  if (type === "mentorship") {return "info";}
  return "neutral";
};

export function SocialFabricPage() {
  const { data: statsData, refetch, loading, error } = useRpc<{
    totalBonds?: number;
    avgCohesion?: number;
    totalEvents?: number;
    communities?: number;
    isolatedCitizens?: number;
  }>("republic.social.stats", {}, [], { staleTimeMs: 10_000 });
  const { data: bondsData } = useRpc<{ bonds?: SocialBond[] }>("republic.social.bonds", {}, [], {
    staleTimeMs: 15_000,
  });
  const { data: commData } = useRpc<{ communities?: Community[] }>(
    "republic.social.communities",
    {},
    [],
    { staleTimeMs: 20_000 },
  );
  const { data: eventsData } = useRpc<{ events?: SocialEvent[] }>(
    "republic.social.events.recent",
    {},
    [],
    { staleTimeMs: 8_000, refetchIntervalMs: 20_000 },
  );
  const [actionError, setActionError] = useState("");
  const [newBondA, setNewBondA] = useState("");
  const [newBondB, setNewBondB] = useState("");
  const [bondType, setBondType] = useState("friendship");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }


  async function createBond() {
    if (!newBondA.trim() || !newBondB.trim()) {return;}
    try {
      await rpc("republic.social.bond.create", {
        citizenA: newBondA.trim(),
        citizenB: newBondB.trim(),
        type: bondType,
      });
      invalidateRpcCache("republic.social.bonds");
      invalidateRpcCache("republic.social.stats");
      setNewBondA("");
      setNewBondB("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function simulateSocialTick() {
    try {
      await rpc("republic.social.tick", {});
      invalidateRpcCache("republic.social.stats");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const bonds = bondsData?.bonds ?? [];
  const communities = commData?.communities ?? [];
  const events = eventsData?.events ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Social Fabric"
        description="Citizen bonds, communities, social cohesion, and interaction events"
        icon={<Users size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
            <Button size="sm" icon={<Zap size={14} />} onClick={simulateSocialTick}>
              Social Tick
            </Button>
          </div>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard
          label="Total Bonds"
          value={statsData?.totalBonds ?? 0}
          icon={<Heart size={16} />}
        />
        <StatCard
          label="Avg Cohesion"
          value={`${(statsData?.avgCohesion ?? 0).toFixed(1)}%`}
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Communities"
          value={statsData?.communities ?? communities.length}
          icon={<Home size={16} />}
        />
        <StatCard
          label="Events"
          value={statsData?.totalEvents ?? events.length}
          icon={<MessageCircle size={16} />}
        />
        <StatCard
          label="Isolated"
          value={statsData?.isolatedCitizens ?? 0}
          icon={<Users size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create Bond */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
            <Heart size={16} /> Create Bond
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Citizen A ID..."
              value={newBondA}
              onChange={(e) => setNewBondA(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Citizen B ID..."
              value={newBondB}
              onChange={(e) => setNewBondB(e.target.value)}
            />
            <select
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary"
              value={bondType}
              onChange={(e) => setBondType(e.target.value)}
            >
              {["friendship", "romance", "mentorship", "rivalry", "family", "colleague"].map(
                (t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ),
              )}
            </select>
            <Button onClick={createBond} disabled={!newBondA.trim() || !newBondB.trim()}>
              Create Bond
            </Button>
          </div>
        </Card>

        {/* Communities */}
        <div className="md:col-span-2">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Home size={16} /> Communities ({communities.length})
            </h3>
            {communities.length === 0 ? (
              <p className="text-sm text-text-muted">No communities formed yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {communities.slice(0, 8).map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg bg-bg-secondary border border-border/30"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-text-heading text-sm">{c.name}</span>
                      {c.type && <Badge variant="info">{c.type}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span>👥 {c.members}</span>
                      {c.cohesion != null && <span>Cohesion: {c.cohesion.toFixed(0)}%</span>}
                    </div>
                    {c.cohesion != null && (
                      <div className="mt-2 h-1.5 rounded-full bg-bg-input overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${c.cohesion}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Bonds */}
      {bonds.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Heart size={16} /> Active Bonds ({bonds.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
            {bonds.slice(0, 30).map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 rounded bg-bg-secondary border border-border/30 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={bondVariant(b.type)}>{b.type}</Badge>
                  <span className="font-mono text-text-muted truncate">
                    {b.citizenA.slice(0, 7)}…{b.citizenB.slice(0, 7)}
                  </span>
                </div>
                <span className="font-mono text-accent flex-shrink-0">
                  {b.strength.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Social Events */}
      {events.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🎭 Social Events</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {events.slice(0, 15).map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-border/20 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="info">{ev.type}</Badge>
                  <span className="text-text-secondary text-xs">
                    {ev.description ?? ev.participants.slice(0, 2).join(" & ")}
                  </span>
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
