import { Heart, Frown, Laugh, AlertCircle, RefreshCw, BarChart2 } from "lucide-react";
import { PageHeader, Card, Badge, Button, StatCard, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

type EmotionState = {
  citizenId: string;
  name?: string;
  joy?: number;
  sadness?: number;
  anger?: number;
  fear?: number;
  surprise?: number;
  disgust?: number;
  trust?: number;
  anticipation?: number;
  dominant?: string;
  mood?: string;
};
type EmotionStats = {
  avgJoy?: number;
  avgSadness?: number;
  avgAnger?: number;
  avgFear?: number;
  avgTrust?: number;
  mostCommon?: string;
  volatilityIndex?: number;
};

const emotionColor: Record<string, string> = {
  joy: "#22c55e",
  sadness: "#60a5fa",
  anger: "#ef4444",
  fear: "#8b5cf6",
  surprise: "#f59e0b",
  disgust: "#84cc16",
  trust: "#06b6d4",
  anticipation: "#f97316",
};

const moodVariant = (mood?: string) => {
  if (mood === "elated" || mood === "content") {
    return "success" as const;
  }
  if (mood === "anxious" || mood === "melancholic") {
    return "warning" as const;
  }
  if (mood === "furious" || mood === "despondent") {
    return "danger" as const;
  }
  return "neutral" as const;
};

function EmotionBar({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted w-24 capitalize">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-bg-input overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${v * 100}%`, background: emotionColor[label] ?? "#6366f1" }}
        />
      </div>
      <span className="text-xs font-mono text-text-muted w-8 text-right">
        {(v * 100).toFixed(0)}%
      </span>
    </div>
  );
}

export function EmotionsPage() {
  const {
    data: statsData,
    refetch,
    loading,
    error,
  } = useRpc<EmotionStats>("republic.emotion.stats", {}, [], {
    staleTimeMs: 10_000,
    refetchIntervalMs: 15_000,
  });
  const { data: citizenData } = useRpc<{ states?: EmotionState[] }>(
    "republic.emotion.states",
    { limit: 20 },
    [],
    { staleTimeMs: 8_000, refetchIntervalMs: 20_000 },
  );
  const { data: volatileData } = useRpc<{ citizens?: EmotionState[] }>(
    "republic.emotion.volatile",
    {},
    [],
    { staleTimeMs: 10_000 },
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const states = citizenData?.states ?? [];
  const volatile = volatileData?.citizens ?? [];

  const emotions = [
    "joy",
    "sadness",
    "anger",
    "fear",
    "surprise",
    "disgust",
    "trust",
    "anticipation",
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Emotional Intelligence"
        description="Population emotional state monitoring — joy, trust, fear, anger and mood dynamics"
        icon={<Heart size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Avg Joy"
          value={`${((statsData?.avgJoy ?? 0) * 100).toFixed(0)}%`}
          icon={<Laugh size={16} />}
        />
        <StatCard
          label="Avg Sadness"
          value={`${((statsData?.avgSadness ?? 0) * 100).toFixed(0)}%`}
          icon={<Frown size={16} />}
        />
        <StatCard
          label="Avg Anger"
          value={`${((statsData?.avgAnger ?? 0) * 100).toFixed(0)}%`}
          icon={<AlertCircle size={16} />}
        />
        <StatCard
          label="Volatility"
          value={`${(statsData?.volatilityIndex ?? 0).toFixed(2)}`}
          icon={<BarChart2 size={16} />}
        />
      </div>

      {/* Population Emotion Overview */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
          <BarChart2 size={16} /> Population Emotions
          {statsData?.mostCommon && <Badge variant="info">Dominant: {statsData.mostCommon}</Badge>}
        </h3>
        <div className="space-y-3">
          <EmotionBar label="joy" value={statsData?.avgJoy} />
          <EmotionBar label="trust" value={statsData?.avgTrust} />
          <EmotionBar label="sadness" value={statsData?.avgSadness} />
          <EmotionBar label="anger" value={statsData?.avgAnger} />
          <EmotionBar label="fear" value={statsData?.avgFear} />
        </div>
      </Card>

      {/* Volatile Citizens */}
      {volatile.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <AlertCircle size={16} className="text-warning" /> Emotionally Volatile Citizens
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {volatile.slice(0, 6).map((c) => (
              <div
                key={c.citizenId}
                className="p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-heading">
                    {c.name ?? c.citizenId.slice(0, 12)}
                  </span>
                  {c.mood && <Badge variant={moodVariant(c.mood)}>{c.mood}</Badge>}
                </div>
                {c.dominant && (
                  <p className="text-xs text-text-muted">
                    Dominant: <span style={{ color: emotionColor[c.dominant] }}>{c.dominant}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Individual State List */}
      {states.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🫀 Citizen Emotion States</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {states.slice(0, 15).map((s) => (
              <div
                key={s.citizenId}
                className="p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-heading">
                    {s.name ?? s.citizenId.slice(0, 12)}
                  </span>
                  <div className="flex gap-1">
                    {s.dominant && <Badge variant={moodVariant(s.mood)}>{s.dominant}</Badge>}
                    {s.mood && <Badge variant="neutral">{s.mood}</Badge>}
                  </div>
                </div>
                <div className="space-y-1">
                  {emotions.map((em) => {
                    const val = s[em as keyof EmotionState] as number | undefined;
                    if (!val || val < 0.1) {return null;}
                    return (
                      <div key={em} className="flex items-center gap-2">
                        <span className="text-xs text-text-muted w-20 capitalize">{em}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-bg-input overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${val * 100}%`, background: emotionColor[em] }}
                          />
                        </div>
                        <span className="text-xs font-mono text-text-muted w-8 text-right">
                          {(val * 100).toFixed(0)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
