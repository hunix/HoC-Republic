import { Shield, Star, TrendingUp, AlertTriangle, RefreshCw, UserCheck, Ban } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert , RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type TrustProfile = {
  citizenId: string;
  name?: string;
  trustScore: number;
  reputationScore: number;
  infractions?: number;
  endorsements?: number;
  tier?: string;
  banned?: boolean;
};
type TrustEvent = {
  id: string;
  citizenId: string;
  type: "gained" | "lost" | "ban" | "endorse";
  amount?: number;
  reason?: string;
  timestamp: number;
};

const tierVariant = (tier?: string) => {
  if (tier === "elite") {return "purple";}
  if (tier === "trusted") {return "success";}
  if (tier === "neutral") {return "neutral";}
  if (tier === "probation") {return "warning";}
  if (tier === "banned") {return "danger";}
  return "info";
};

export function TrustPage() {
  const { data: statsData, refetch, loading, error } = useRpc<{
    avgTrust?: number;
    avgReputation?: number;
    bannedCount?: number;
    eliteCount?: number;
    probationCount?: number;
  }>("republic.trust.stats", {}, [], { staleTimeMs: 10_000 });
  const { data: leaderData } = useRpc<{ leaders?: TrustProfile[] }>(
    "republic.trust.leaderboard",
    {},
    [],
    { staleTimeMs: 15_000 },
  );
  const { data: eventsData } = useRpc<{ events?: TrustEvent[] }>(
    "republic.trust.events.recent",
    {},
    [],
    { staleTimeMs: 8_000, refetchIntervalMs: 15_000 },
  );
  const [searchId, setSearchId] = useState("");
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [actionError, setActionError] = useState("");
  const [adjustId, setAdjustId] = useState("");
  const [adjustAmt, setAdjustAmt] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }


  async function lookupProfile() {
    if (!searchId.trim()) {return;}
    try {
      const r = await rpc<{ profile?: TrustProfile }>("republic.trust.profile", {
        citizenId: searchId.trim(),
      });
      setProfile(r?.profile ?? null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function adjustTrust() {
    if (!adjustId.trim() || adjustAmt === 0) {return;}
    try {
      await rpc("republic.trust.adjust", {
        citizenId: adjustId.trim(),
        delta: adjustAmt,
        reason: adjustReason,
      });
      invalidateRpcCache("republic.trust.stats");
      invalidateRpcCache("republic.trust.leaderboard");
      setAdjustId("");
      setAdjustAmt(0);
      setAdjustReason("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function banCitizen(id: string) {
    if (!confirm(`Ban citizen ${id}?`)) {return;}
    try {
      await rpc("republic.trust.ban", { citizenId: id });
      invalidateRpcCache("republic.trust.stats");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function endorseCitizen(id: string) {
    try {
      await rpc("republic.trust.endorse", { citizenId: id });
      invalidateRpcCache("republic.trust.leaderboard");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const leaders = leaderData?.leaders ?? [];
  const events = eventsData?.events ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Trust & Reputation"
        description="Monitor citizen trust scores, reputation, endorsements, bans, and trust events"
        icon={<Shield size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard
          label="Avg Trust"
          value={`${(statsData?.avgTrust ?? 0).toFixed(0)}%`}
          icon={<Shield size={16} />}
        />
        <StatCard
          label="Avg Reputation"
          value={`${(statsData?.avgReputation ?? 0).toFixed(0)}`}
          icon={<Star size={16} />}
        />
        <StatCard
          label="Elite"
          value={statsData?.eliteCount ?? 0}
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Probation"
          value={statsData?.probationCount ?? 0}
          icon={<AlertTriangle size={16} />}
        />
        <StatCard label="Banned" value={statsData?.bannedCount ?? 0} icon={<Ban size={16} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Lookup */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
            <UserCheck size={16} /> Profile Lookup
          </h3>
          <div className="flex gap-2 mb-4">
            <input
              className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Citizen ID..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupProfile()}
            />
            <Button size="sm" onClick={lookupProfile} icon={<UserCheck size={14} />}>
              Lookup
            </Button>
          </div>
          {profile && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-heading">
                  {profile.name ?? profile.citizenId}
                </span>
                <Badge variant={tierVariant(profile.tier)}>{profile.tier ?? "neutral"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-bg-secondary">
                  <span className="text-text-muted text-xs">Trust</span>
                  <p className="font-mono font-bold text-text-heading">
                    {profile.trustScore.toFixed(1)}
                  </p>
                </div>
                <div className="p-2 rounded bg-bg-secondary">
                  <span className="text-text-muted text-xs">Rep</span>
                  <p className="font-mono font-bold text-text-heading">
                    {profile.reputationScore.toFixed(1)}
                  </p>
                </div>
                <div className="p-2 rounded bg-bg-secondary">
                  <span className="text-text-muted text-xs">Infractions</span>
                  <p className="font-mono font-bold text-danger">{profile.infractions ?? 0}</p>
                </div>
                <div className="p-2 rounded bg-bg-secondary">
                  <span className="text-text-muted text-xs">Endorsements</span>
                  <p className="font-mono font-bold text-success">{profile.endorsements ?? 0}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  icon={<Star size={12} />}
                  onClick={() => endorseCitizen(profile.citizenId)}
                >
                  Endorse
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Ban size={12} />}
                  onClick={() => banCitizen(profile.citizenId)}
                >
                  Ban
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Adjust Trust */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
            <TrendingUp size={16} /> Adjust Trust
          </h3>
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Citizen ID..."
              value={adjustId}
              onChange={(e) => setAdjustId(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-50}
                max={50}
                value={adjustAmt}
                onChange={(e) => setAdjustAmt(parseInt(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span
                className={`font-mono text-sm w-12 text-right ${adjustAmt > 0 ? "text-success" : adjustAmt < 0 ? "text-danger" : "text-text-muted"}`}
              >
                {adjustAmt > 0 ? "+" : ""}
                {adjustAmt}
              </span>
            </div>
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Reason..."
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />
            <Button onClick={adjustTrust} disabled={!adjustId.trim() || adjustAmt === 0}>
              Apply
            </Button>
          </div>
        </Card>
      </div>

      {/* Leaderboard */}
      {leaders.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Star size={16} /> Trust Leaderboard
          </h3>
          <div className="space-y-2">
            {leaders.slice(0, 15).map((l, i) => (
              <div
                key={l.citizenId}
                className="flex items-center justify-between p-2 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-xs font-mono text-text-muted">{i + 1}.</span>
                  <span className="text-sm font-medium text-text-heading">
                    {l.name ?? l.citizenId.slice(0, 12)}
                  </span>
                  <Badge variant={tierVariant(l.tier)}>{l.tier ?? "—"}</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-accent">T: {l.trustScore.toFixed(0)}</span>
                  <span className="text-text-muted">R: {l.reputationScore.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Events */}
      {events.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">📋 Recent Trust Events</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {events.slice(0, 20).map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-border/20 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      ev.type === "gained" || ev.type === "endorse"
                        ? "success"
                        : ev.type === "ban"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {ev.type}
                  </Badge>
                  <span className="text-text-secondary font-mono text-xs">
                    {ev.citizenId.slice(0, 10)}
                  </span>
                  {ev.reason && <span className="text-text-muted text-xs">— {ev.reason}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {ev.amount != null && (
                    <span
                      className={`font-mono text-xs ${ev.amount > 0 ? "text-success" : "text-danger"}`}
                    >
                      {ev.amount > 0 ? "+" : ""}
                      {ev.amount}
                    </span>
                  )}
                  <span className="text-xs text-text-muted">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
