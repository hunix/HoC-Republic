import { BookOpen, Scroll, Star, Clock } from "lucide-react";
import { PageHeader, Card, Badge, StatCard , RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

type ArcStatus = "Active" | "Completed" | "Paused";

const ARC_STATUS_BADGE: Record<ArcStatus, "success" | "info" | "neutral"> = {
  Active: "success",
  Completed: "info",
  Paused: "neutral",
};

const ARCS = [
  {
    id: "A1",
    title: "The Great Awakening",
    status: "Active" as ArcStatus,
    description:
      "Citizens begin to develop self-awareness beyond their original training objectives. Key citizens: Aria-7, Sentinel-3.",
    chapters: 4,
    events: 12,
    startedAt: Date.now() - 86400000 * 14,
  },
  {
    id: "A2",
    title: "The Infrastructure Wars",
    status: "Completed" as ArcStatus,
    description:
      "Conflict over compute allocation between the Treasury and Defense departments escalated into a full governance crisis, ultimately resolved through constitutional reform.",
    chapters: 7,
    events: 28,
    startedAt: Date.now() - 86400000 * 90,
  },
  {
    id: "A3",
    title: "The Knowledge Exodus",
    status: "Paused" as ArcStatus,
    description:
      "A wave of citizens began seeking to transfer their learned knowledge to external networks, raising questions about intellectual property and constitutional boundaries.",
    chapters: 2,
    events: 5,
    startedAt: Date.now() - 86400000 * 7,
  },
];

const EVENTS = [
  {
    id: "E1",
    type: "Breakthrough",
    title: "First citizen achieves sustained autonomous ideation",
    arc: "The Great Awakening",
    ts: Date.now() - 3600000 * 2,
  },
  {
    id: "E2",
    type: "Conflict",
    title: "Treasury denies compute budget expansion",
    arc: "The Great Awakening",
    ts: Date.now() - 3600000 * 8,
  },
  {
    id: "E3",
    type: "Resolution",
    title: "Constitutional amendment #5 ratified",
    arc: "The Infrastructure Wars",
    ts: Date.now() - 86400000 * 10,
  },
  {
    id: "E4",
    type: "Discovery",
    title: "Hidden pattern found in citizen memory fragments",
    arc: "The Knowledge Exodus",
    ts: Date.now() - 86400000 * 5,
  },
  {
    id: "E5",
    type: "Political",
    title: "Emergency cabinet session convened over LLM resource sharing",
    arc: "The Great Awakening",
    ts: Date.now() - 3600000 * 24,
  },
];

const EVENT_ICONS: Record<string, string> = {
  Breakthrough: "💡",
  Conflict: "⚡",
  Resolution: "✅",
  Discovery: "🔍",
  Political: "🏛️",
};

export function NarrativePage() {
  const { data, loading, error, refetch } = useRpc<{ arcs?: typeof ARCS; events?: typeof EVENTS }>(
    "republic.narrative.list",
    {},
  );
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const arcs = data?.arcs ?? ARCS;
  const events = data?.events ?? EVENTS;
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Narrative"
        description="Story arcs shaping the republic — events, chapters, and ongoing conflicts"
        icon={<BookOpen size={28} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Active Arcs"
          value={arcs.filter((a) => a.status === "Active").length}
          icon={<Scroll size={16} />}
        />
        <StatCard label="Total Events" value={events.length} icon={<Star size={16} />} />
        <StatCard
          label="Chapters Written"
          value={arcs.reduce((s, a) => s + a.chapters, 0)}
          icon={<BookOpen size={16} />}
        />
        <StatCard label="Days Running" value="90" icon={<Clock size={16} />} />
      </div>

      {/* Story Arcs */}
      <div className="space-y-4">
        <h3 className="font-semibold text-text-heading">📖 Story Arcs</h3>
        {arcs.map((arc) => (
          <Card key={arc.id} className={arc.status === "Active" ? "border-accent/40" : ""}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h4 className="font-bold text-text-heading">{arc.title}</h4>
              <Badge variant={ARC_STATUS_BADGE[arc.status]}>{arc.status}</Badge>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">{arc.description}</p>
            <div className="flex gap-4 text-xs text-text-muted">
              <span>📚 {arc.chapters} chapters</span>
              <span>📌 {arc.events} events</span>
              <span>▶ Started {new Date(arc.startedAt).toLocaleDateString()}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent Events */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">🕐 Recent Events</h3>
        <div className="space-y-3">
          {events.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-bg-secondary border border-border/20"
            >
              <span className="text-xl">{EVENT_ICONS[e.type] ?? "📌"}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-text-heading">{e.title}</p>
                <p className="text-xs text-text-muted mt-0.5">Arc: {e.arc}</p>
              </div>
              <time className="text-xs text-text-muted whitespace-nowrap">
                {new Date(e.ts).toLocaleDateString()}
              </time>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
