import { Sparkles, Image, Music, Film, FileText, Mic, Play, Trash2, Clock } from "lucide-react";
import React from "react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Tabs, ProgressBar, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

type MediaType = "image" | "music" | "video" | "podcast" | "article";

const MEDIA_ICONS: Record<MediaType, React.ReactNode> = {
  image: <Image size={14} />,
  music: <Music size={14} />,
  video: <Film size={14} />,
  podcast: <Mic size={14} />,
  article: <FileText size={14} />,
};

const STUDIO_TABS = [
  { id: "generate", label: "Generate" },
  { id: "queue", label: "Queue" },
  { id: "history", label: "History" },
];

export function MediaStudioPage() {
  const [tab, setTab] = useState("generate");
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const { data: histData, loading, error, refetch } = useRpc<{
    history?: {
      id: string;
      type: string;
      prompt?: string;
      title?: string;
      creator?: string;
      status?: string;
      completedAt?: number | null;
      size?: string;
      url?: string;
    }[];
    queue?: { id: string; type: string; prompt: string; status: string; progress: number }[];
    totalGenerated?: number;
    byType?: Record<string, number>;
  }>("republic.mediastudio.history", { limit: 50 });

  const history = histData?.history ?? [];
  const queue = histData?.queue ?? [];
  const totalGenerated = histData?.totalGenerated ?? history.length;
  const byType = histData?.byType ?? {};

  async function handleGenerate() {
    if (!prompt.trim()) {
      return;
    }
    setGenerating(true);
    try {
      await rpc("republic.mediastudio.generate", { type: mediaType, prompt });
      setPrompt("");
      setTab("queue");
      setTimeout(refetch, 1000);
    } catch {
      /* silent */
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <RpcStatus loading={loading} error={error} onRetry={refetch} />
      <PageHeader
        title="Media Studio"
        description="Generate and manage AI-created media assets for the republic"
        icon={<Sparkles size={28} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Generated" value={totalGenerated} icon={<Sparkles size={16} />} />
        <StatCard label="In Queue" value={queue.length} icon={<Clock size={16} />} />
        <StatCard label="Images" value={byType.image ?? 0} icon={<Image size={16} />} />
        <StatCard label="Podcasts" value={byType.podcast ?? 0} icon={<Mic size={16} />} />
      </div>

      <Tabs tabs={STUDIO_TABS} active={tab} onChange={setTab} />

      {tab === "generate" && (
        <Card className="space-y-4">
          <h3 className="font-semibold text-text-heading">🎨 New Generation</h3>

          {/* Media type selector */}
          <div className="flex gap-2 flex-wrap">
            {(Object.entries(MEDIA_ICONS) as [MediaType, React.ReactNode][]).map(([type, icon]) => (
              <Button
                key={type}
                variant={mediaType === type ? "primary" : "outline"}
                size="sm"
                icon={icon}
                onClick={() => setMediaType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Button>
            ))}
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wide block mb-2">
              Prompt
            </label>
            <textarea
              className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
              rows={4}
              placeholder={`Describe the ${mediaType} you want to generate...`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {mediaType === "image" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide block mb-2">
                  Style
                </label>
                <select className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent">
                  <option>Photorealistic</option>
                  <option>Cyberpunk</option>
                  <option>Abstract</option>
                  <option>Anime</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide block mb-2">
                  Resolution
                </label>
                <select className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent">
                  <option>1024×1024</option>
                  <option>1920×1080</option>
                  <option>512×512</option>
                </select>
              </div>
            </div>
          )}

          <Button
            icon={<Sparkles size={14} />}
            disabled={!prompt.trim() || generating}
            className="w-full"
            onClick={handleGenerate}
          >
            {generating
              ? "Generating…"
              : `Generate ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}`}
          </Button>
        </Card>
      )}

      {tab === "queue" && (
        <div className="space-y-3">
          {queue.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted text-center py-4">No items in queue.</p>
            </Card>
          ) : (
            queue.map((item) => (
              <Card key={item.id}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {MEDIA_ICONS[item.type as MediaType] ?? <Sparkles size={14} />}
                    <Badge variant={item.status === "generating" ? "warning" : "neutral"}>
                      {item.status}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={12} />}
                    onClick={async () => {
                      await rpc("republic.mediastudio.delete", { id: item.id });
                      refetch();
                    }}
                  />
                </div>
                <p className="text-sm text-text-secondary mb-3 line-clamp-2">{item.prompt}</p>
                {item.progress > 0 && (
                  <ProgressBar
                    value={item.progress * 100}
                    labelLeft="Generating..."
                    labelRight={`${(item.progress * 100).toFixed(0)}%`}
                  />
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted text-center py-4">
                No media generated yet. Go to Generate tab to create content.
              </p>
            </Card>
          ) : (
            history.map((item) => (
              <Card key={item.id} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-xl">
                  {item.type === "image"
                    ? "🖼️"
                    : item.type === "podcast"
                      ? "🎙️"
                      : item.type === "article"
                        ? "📝"
                        : "🎵"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-heading text-sm">
                    {item.title ?? item.prompt ?? `${item.type} generation`}
                  </p>
                  <p className="text-xs text-text-muted">
                    {item.creator ? `by ${item.creator} · ` : ""}
                    {item.size ?? item.status ?? "complete"}
                  </p>
                </div>
                <span className="text-xs text-text-muted">
                  {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : "—"}
                </span>
                <div className="flex gap-2">
                  {(item.type === "podcast" || item.type === "music" || item.type === "video") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Play size={12} />}
                      onClick={() => {
                        if (item.url) {
                          window.open(item.url, "_blank", "noopener");
                        }
                      }}
                    />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (item.url) {
                        window.open(item.url, "_blank", "noopener");
                      }
                    }}
                  >
                    View
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
