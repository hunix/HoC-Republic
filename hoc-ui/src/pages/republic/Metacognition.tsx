import { Lightbulb, Eye, AlertCircle, TrendingUp, Brain } from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PageHeader, Card, Badge, StatCard , RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

const RADAR_DATA = [
  { subject: "Self-Awareness", score: 82 },
  { subject: "Bias Detection", score: 71 },
  { subject: "Goal Alignment", score: 94 },
  { subject: "Uncertainty Handling", score: 88 },
  { subject: "Meta-Learning", score: 76 },
  { subject: "Error Recognition", score: 85 },
];

const BLIND_SPOTS = [
  {
    topic: "Anchoring in early context windows",
    severity: "Medium",
    affected: ["Aria-7", "Bolt-5"],
  },
  { topic: "Overconfidence in novel domains", severity: "High", affected: ["Nova-12"] },
  { topic: "Recency bias in trend analysis", severity: "Low", affected: ["Cleo-9", "Sentinel-3"] },
];

const REFLECTIONS = [
  {
    citizen: "Aria-7",
    score: 94,
    insight:
      "Recognized that my objective function penalized exploration — corrected by requesting creative mandate.",
    ts: Date.now() - 3600000,
  },
  {
    citizen: "Nova-12",
    score: 79,
    insight:
      "Detected circular reasoning in policy optimization loop, terminated and restarted with fresh prior.",
    ts: Date.now() - 7200000,
  },
  {
    citizen: "Sentinel-3",
    score: 88,
    insight:
      "Identified contradiction between safety constraints and performance targets, flagged for governance review.",
    ts: Date.now() - 14400000,
  },
];

export function MetacognitionPage() {
  const { data, loading, error, refetch } = useRpc<{
    radarData?: typeof RADAR_DATA;
    blindSpots?: typeof BLIND_SPOTS;
    reflections?: typeof REFLECTIONS;
    avgSelfAwareness?: number;
    reflectionsToday?: number;
  }>("republic.metacognition.status", {});
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const radarData = data?.radarData ?? RADAR_DATA;
  const blindSpots = data?.blindSpots ?? BLIND_SPOTS;
  const reflections = data?.reflections ?? REFLECTIONS;
  const avgSelfAwareness = data?.avgSelfAwareness ?? 82;
  const reflectionsToday = data?.reflectionsToday ?? 12;
  const goalAlignment = radarData.find((r) => r.subject === "Goal Alignment")?.score ?? 94;
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Metacognition"
        description="Self-reflection scores, blind spot detection, and cognitive quality metrics"
        icon={<Brain size={28} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Avg Self-Awareness"
          value={`${avgSelfAwareness}%`}
          icon={<Eye size={16} />}
        />
        <StatCard
          label="Blind Spots Found"
          value={blindSpots.length}
          icon={<AlertCircle size={16} />}
        />
        <StatCard
          label="Reflections Today"
          value={reflectionsToday}
          icon={<Lightbulb size={16} />}
        />
        <StatCard
          label="Goal Alignment"
          value={`${goalAlignment}%`}
          icon={<TrendingUp size={16} />}
          sub="Highest dimension"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Radar Chart */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🧭 Cognitive Dimension Scores</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Radar
                name="Score"
                dataKey="score"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.25}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        {/* Blind Spots */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">⚠️ Detected Blind Spots</h3>
          <div className="space-y-3">
            {blindSpots.map((b, i) => (
              <div key={i} className="p-3 rounded-lg bg-bg-secondary border border-border/20">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-text-heading">{b.topic}</p>
                  <Badge
                    variant={
                      b.severity === "High"
                        ? "danger"
                        : b.severity === "Medium"
                          ? "warning"
                          : "info"
                    }
                  >
                    {b.severity}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {b.affected.map((a) => (
                    <span
                      key={a}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Self-Reflections */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">💡 Recent Self-Reflections</h3>
        <div className="space-y-3">
          {reflections.map((r, i) => (
            <div
              key={i}
              className="flex items-start gap-4 p-3 rounded-lg bg-bg-secondary border border-border/20"
            >
              <div className="text-center">
                <div className="text-2xl">🤖</div>
                <p className="text-xs font-bold text-accent">{r.score}%</p>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-text-heading mb-1">{r.citizen}</p>
                <p className="text-sm text-text-secondary italic">&ldquo;{r.insight}&rdquo;</p>
              </div>
              <time className="text-xs text-text-muted">{new Date(r.ts).toLocaleTimeString()}</time>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
