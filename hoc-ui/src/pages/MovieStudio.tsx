import { useRpc } from "@/lib/rpc";
import { RpcStatus } from "@/components/ui";
import { PageHeader } from "@/components/ui";
import { Card } from "@/components/ui";
import { Badge } from "@/components/ui";
import { StatCard } from "@/components/ui";
import { Tabs } from "@/components/ui";
import { ProgressBar } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import { useState } from "react";
import {
  Film,
  Clapperboard,
  Cpu,
  Layers,
  Clock,
  Play,
  Monitor,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface GPUInfo {
  id: string;
  name: string;
  vramGB: number;
  available: boolean;
  currentJob?: string;
}

interface ProductionMetrics {
  totalMovies: number;
  moviesInProgress: number;
  moviesCompleted: number;
  totalScenesRendered: number;
  totalRenderTimeMs: number;
  averageSceneRenderMs: number;
  gpuUtilization: number;
  estimatedBacklogHours: number;
}

interface Movie {
  id: string;
  title: string;
  genre: string;
  logline: string;
  isSeries: boolean;
  episodes: Episode[];
  status: string;
  crew: { citizenName: string; role: string }[];
  createdAt: number;
}

interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  scenes: Scene[];
  totalDurationSec: number;
  status: string;
}

interface Scene {
  id: string;
  sceneNumber: number;
  description: string;
  status: string;
  durationSec: number;
  videoModel: string;
}

interface RenderQueueItem {
  sceneId: string;
  movieId: string;
  priority: number;
}

// ─── Tab Components ─────────────────────────────────────────────

function OverviewTab({
  metrics,
  gpuFleet,
}: {
  metrics: ProductionMetrics;
  gpuFleet: GPUInfo[];
}) {
  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Movies"
          value={metrics.totalMovies}
          icon={<Film className="w-5 h-5" />}
        />
        <StatCard
          label="In Progress"
          value={metrics.moviesInProgress}
          icon={<Play className="w-5 h-5" />}
        />
        <StatCard
          label="Scenes Rendered"
          value={metrics.totalScenesRendered}
          icon={<Layers className="w-5 h-5" />}
        />
        <StatCard
          label="Avg Render Time"
          value={`${(metrics.averageSceneRenderMs / 1000).toFixed(1)}s`}
          icon={<Clock className="w-5 h-5" />}
        />
      </div>

      {/* GPU Utilization */}
      <Card>
        <div className="p-4">
          <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-accent" /> GPU Fleet
          </h3>
          <ProgressBar
            value={Math.round(metrics.gpuUtilization * 100)}
            max={100}
            labelLeft="GPU Utilization"
            labelRight={`${Math.round(metrics.gpuUtilization * 100)}%`}
          />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {gpuFleet.map((gpu) => (
              <div
                key={gpu.id}
                className="bg-bg-secondary rounded-lg p-3 border border-border"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text-primary font-medium text-sm">
                    {gpu.name}
                  </span>
                  <Badge
                    variant={gpu.available ? "success" : "warning"}
                  >
                    {gpu.available ? "Idle" : "Rendering"}
                  </Badge>
                </div>
                <div className="text-text-muted text-xs">
                  {gpu.vramGB}GB VRAM
                  {gpu.currentJob && (
                    <span className="ml-2 text-warning">
                      → {gpu.currentJob}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Backlog Estimate */}
      {metrics.estimatedBacklogHours > 0 && (
        <Card>
          <div className="p-4">
            <h3 className="text-text-heading font-semibold mb-2">
              Render Backlog
            </h3>
            <p className="text-text-secondary">
              Estimated {metrics.estimatedBacklogHours.toFixed(1)} hours to
              clear render queue
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function MoviesTab({ movies }: { movies: Movie[] }) {
  if (movies.length === 0) {
    return (
      <EmptyState
        icon={<Film className="w-12 h-12" />}
        title="No Productions"
        description="No movies or series in production yet. Citizens can start a new production through the chat."
      />
    );
  }

  return (
    <div className="space-y-4">
      {movies.map((movie) => (
        <Card key={movie.id} hover>
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-text-heading font-semibold text-lg">
                  {movie.title}
                </h3>
                <p className="text-text-muted text-sm">{movie.logline}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="info">{movie.genre}</Badge>
                <Badge
                  variant={
                    movie.status === "completed"
                      ? "success"
                      : movie.status === "production"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {movie.status}
                </Badge>
                {movie.isSeries && (
                  <Badge variant="purple">Series</Badge>
                )}
              </div>
            </div>

            {/* Episodes */}
            <div className="mt-3 flex flex-wrap gap-2">
              {movie.episodes.map((ep) => (
                <div
                  key={ep.id}
                  className="bg-bg-secondary rounded px-3 py-1 text-xs border border-border"
                >
                  <span className="text-text-primary font-medium">
                    Ep. {ep.episodeNumber}
                  </span>
                  <span className="text-text-muted ml-2">
                    {ep.scenes.length} scenes •{" "}
                    {Math.round(ep.totalDurationSec / 60)}min
                  </span>
                </div>
              ))}
            </div>

            {/* Crew */}
            {movie.crew.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {movie.crew.map((c, i) => (
                  <span
                    key={i}
                    className="text-xs bg-bg-input rounded-full px-2 py-0.5 text-text-secondary"
                  >
                    {c.citizenName} ({c.role})
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RenderQueueTab({
  renderQueue,
}: {
  renderQueue: RenderQueueItem[];
}) {
  if (renderQueue.length === 0) {
    return (
      <EmptyState
        icon={<Monitor className="w-12 h-12" />}
        title="Queue Empty"
        description="No scenes queued for rendering. Scenes will appear here when productions enter the rendering phase."
      />
    );
  }

  return (
    <div className="space-y-2">
      {renderQueue.map((item, i) => (
        <Card key={`${item.sceneId}-${i}`}>
          <div className="p-3 flex items-center justify-between">
            <div>
              <span className="text-text-primary font-medium text-sm">
                Scene {item.sceneId}
              </span>
              <span className="text-text-muted text-xs ml-3">
                Movie: {item.movieId}
              </span>
            </div>
            <Badge
              variant={item.priority >= 8 ? "danger" : item.priority >= 5 ? "warning" : "neutral"}
            >
              Priority {item.priority}
            </Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ModelsTab() {
  const models = [
    { name: "CogVideoX", vram: "8GB", quality: "Draft", resolution: "720×480", duration: "6s", gpu: "RTX 5070 / 5060 Ti" },
    { name: "Wan 2.2", vram: "12-24GB", quality: "Cinematic", resolution: "720p", duration: "5-10s", gpu: "RTX 3090 Ti / Titan" },
    { name: "LTX-2", vram: "12-24GB", quality: "Production", resolution: "4K/50fps", duration: "20s", gpu: "RTX 3090 Ti / Titan" },
    { name: "HunyuanVideo 1.5", vram: "14-96GB", quality: "Hero", resolution: "720p→1080p", duration: "15s", gpu: "3090 Ti / Pro 6000" },
    { name: "SkyReels V2", vram: "24-96GB", quality: "Film", resolution: "1080p", duration: "∞", gpu: "RTX Titan / Pro 6000" },
  ];

  return (
    <div className="space-y-3">
      {models.map((model) => (
        <Card key={model.name}>
          <div className="p-4 flex items-center justify-between">
            <div>
              <h4 className="text-text-heading font-semibold">
                {model.name}
              </h4>
              <p className="text-text-muted text-xs mt-1">
                {model.resolution} • {model.duration} • {model.vram} VRAM
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  model.quality === "Hero" || model.quality === "Film"
                    ? "purple"
                    : model.quality === "Production" || model.quality === "Cinematic"
                      ? "success"
                      : "neutral"
                }
              >
                {model.quality}
              </Badge>
              <span className="text-text-secondary text-xs">
                {model.gpu}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "movies", label: "Movies" },
  { id: "queue", label: "Render Queue" },
  { id: "models", label: "AI Models" },
];

export function MovieStudioPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const {
    data: statusData,
    loading,
    error,
    refetch,
  } = useRpc<{
    metrics: ProductionMetrics;
    gpuFleet: GPUInfo[];
    activeMovies: Movie[];
    completedMovies: Movie[];
    renderQueue: RenderQueueItem[];
  }>("republic.production.status", {});

  return (
    <div className="animate-fade-in p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Movie Studio"
        description="Cinematic production pipeline — AI-powered movie and series generation with multi-GPU rendering"
        icon={<Clapperboard className="w-6 h-6" />}
      />

      <RpcStatus loading={loading} error={error} onRetry={refetch} />

      {statusData && (
        <>
          <div className="mt-4 mb-6">
            <Tabs
              tabs={TABS}
              active={activeTab}
              onChange={setActiveTab}
            />
          </div>

          {activeTab === "overview" && (
            <OverviewTab
              metrics={statusData.metrics}
              gpuFleet={statusData.gpuFleet}
            />
          )}
          {activeTab === "movies" && (
            <MoviesTab
              movies={[
                ...statusData.activeMovies,
                ...statusData.completedMovies,
              ]}
            />
          )}
          {activeTab === "queue" && (
            <RenderQueueTab renderQueue={statusData.renderQueue} />
          )}
          {activeTab === "models" && <ModelsTab />}
        </>
      )}
    </div>
  );
}

export default MovieStudioPage;
