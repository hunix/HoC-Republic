/**
 * Cinematic Production Engine
 *
 * Orchestrates the full movie/series production pipeline:
 *   1. Script → Storyboard → Scenes → Render → Edit → Final
 *   2. GPU resource scheduling across multi-GPU fleet
 *   3. Citizen role assignment (Director, Screenwriter, VFX, etc.)
 *   4. Episode/season management for series production
 *   5. Quality control and continuity tracking
 *
 * Integrates: ComfyUI, Wan 2.2, LTX-2, HunyuanVideo, CogVideoX,
 *   SkyReels V2, MMAudio, Bark, FunMusic, FaceFusion, MagicAnimate,
 *   StoryDiffusion, DeepFaceLab, EasyVolcap
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("cinematic-production");

// ─── Core Types ─────────────────────────────────────────────────

export type ProductionStatus =
  | "concept"       // Initial idea / pitch
  | "pre-production" // Script, storyboard, casting
  | "production"    // Active scene rendering
  | "post-production" // Editing, audio, VFX
  | "review"        // Quality check
  | "completed"     // Final output ready
  | "cancelled";

export type SceneStatus =
  | "scripted" | "storyboarded" | "rendering" | "rendered"
  | "audio-sync" | "post-processed" | "approved" | "failed";

export type CitizenRole =
  | "director" | "screenwriter" | "cinematographer"
  | "vfx-artist" | "sound-designer" | "editor"
  | "continuity-manager" | "producer"
  // Oscar-level additions
  | "casting-director" | "production-designer" | "costume-designer"
  | "makeup-artist" | "colorist" | "gaffer"
  | "stunt-coordinator" | "dialogue-coach" | "score-composer"
  | "foley-artist" | "location-scout" | "line-producer";

export type Genre =
  | "action" | "sci-fi" | "comedy" | "drama" | "horror"
  | "thriller" | "romance" | "documentary" | "animation"
  | "fantasy" | "mystery" | "western";

export type VideoModel =
  | "wan-2.2" | "ltx-2" | "hunyuan-1.5" | "cogvideox"
  | "skyreels-v2" | "deforum" | "comfyui";

// ─── Scene ──────────────────────────────────────────────────────

export interface Scene {
  id: string;
  episodeId: string;
  sceneNumber: number;
  description: string;
  dialogue?: string;
  shotList: ShotPlan[];
  videoClips: string[];      // paths to rendered clips
  audioTracks: string[];     // paths to audio files
  status: SceneStatus;
  durationSec: number;
  assignedCitizenIds: string[];
  videoModel: VideoModel;
  renderStartedAt?: number;
  renderCompletedAt?: number;
  error?: string;
}

export interface ShotPlan {
  shotNumber: number;
  description: string;
  shotType: "wide" | "medium" | "close-up" | "extreme-close-up" | "over-shoulder" | "aerial" | "pov";
  cameraAngle: "eye-level" | "low-angle" | "high-angle" | "bird-eye" | "dutch-angle";
  cameraMovement: "static" | "pan" | "tilt" | "dolly" | "tracking" | "crane" | "handheld" | "steadicam";
  durationSec: number;
  prompt: string;           // AI-generation prompt
  negativePrompt?: string;
}

// ─── Episode ────────────────────────────────────────────────────

export interface Episode {
  id: string;
  movieId: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  scenes: Scene[];
  totalDurationSec: number;
  status: ProductionStatus;
  outputVideoPath?: string;
}

// ─── Movie / Series ─────────────────────────────────────────────

export interface Movie {
  id: string;
  title: string;
  genre: Genre;
  logline: string;          // One-sentence pitch
  synopsis: string;         // Full synopsis
  isSeries: boolean;
  seasonNumber?: number;
  episodes: Episode[];
  targetDurationMin: number; // Target runtime in minutes
  crew: CrewAssignment[];
  status: ProductionStatus;
  gpuAssignment: GPUAssignment;
  createdAt: number;
  completedAt?: number;
  outputDir: string;
}

export interface CrewAssignment {
  citizenId: string;
  citizenName: string;
  role: CitizenRole;
  specialization?: string;   // e.g., "action choreographer", "dialogue writer"
}

export interface GPUAssignment {
  primaryGPU: string;        // e.g., "RTX Pro 6000 96GB"
  primaryModel: VideoModel;  // Model for hero renders
  draftGPU?: string;         // e.g., "RTX 5070 8GB"
  draftModel?: VideoModel;   // Model for quick previews
  audioGPU?: string;         // GPU for audio generation
}

// ─── Production Pipeline State ──────────────────────────────────

interface ProductionState {
  movies: Map<string, Movie>;
  activeRenders: Map<string, { sceneId: string; gpuId: string; startedAt: number }>;
  renderQueue: { sceneId: string; movieId: string; priority: number }[];
  metrics: ProductionMetrics;
}

export interface ProductionMetrics {
  totalMovies: number;
  moviesInProgress: number;
  moviesCompleted: number;
  totalScenesRendered: number;
  totalRenderTimeMs: number;
  averageSceneRenderMs: number;
  gpuUtilization: number;       // 0-1
  estimatedBacklogHours: number;
}

const state: ProductionState = {
  movies: new Map(),
  activeRenders: new Map(),
  renderQueue: [],
  metrics: {
    totalMovies: 0, moviesInProgress: 0, moviesCompleted: 0,
    totalScenesRendered: 0, totalRenderTimeMs: 0, averageSceneRenderMs: 0,
    gpuUtilization: 0, estimatedBacklogHours: 0,
  },
};

let nextId = 1;
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(nextId++).toString(36)}`;
}

// ─── GPU Fleet Management ───────────────────────────────────────

interface GPUInfo {
  id: string;
  name: string;
  vramGB: number;
  available: boolean;
  currentJob?: string;
}

const GPU_FLEET: GPUInfo[] = [
  { id: "gpu-5070", name: "RTX 5070", vramGB: 8, available: true },
  { id: "gpu-5060ti", name: "RTX 5060 Ti", vramGB: 8, available: true },
  { id: "gpu-3090ti", name: "RTX 3090 Ti", vramGB: 24, available: true },
  { id: "gpu-titan", name: "RTX Titan", vramGB: 24, available: true },
  { id: "gpu-pro6000", name: "RTX Pro 6000", vramGB: 96, available: true },
];

function selectBestGPU(model: VideoModel): GPUInfo | null {
  const vramRequired: Record<VideoModel, number> = {
    "cogvideox": 8, "deforum": 8, "comfyui": 8,
    "wan-2.2": 12, "ltx-2": 12,
    "hunyuan-1.5": 14, "skyreels-v2": 24,
  };
  const required = vramRequired[model] ?? 12;
  const available = GPU_FLEET
    .filter(g => g.available && g.vramGB >= required)
    .toSorted((a, b) => a.vramGB - b.vramGB); // Use smallest capable GPU
  return available[0] ?? null;
}

// ─── Movie Creation ─────────────────────────────────────────────

export function createMovie(params: {
  title: string;
  genre: Genre;
  logline: string;
  synopsis: string;
  isSeries?: boolean;
  seasonNumber?: number;
  episodeCount?: number;
  targetDurationMin?: number;
}): Movie {
  const movieId = genId("movie");
  const episodeCount = params.isSeries ? (params.episodeCount ?? 1) : 1;
  const episodes: Episode[] = [];

  for (let i = 1; i <= episodeCount; i++) {
    episodes.push({
      id: genId("ep"),
      movieId,
      episodeNumber: i,
      title: episodeCount > 1 ? `Episode ${i}` : params.title,
      synopsis: "",
      scenes: [],
      totalDurationSec: 0,
      status: "concept",
    });
  }

  const movie: Movie = {
    id: movieId,
    title: params.title,
    genre: params.genre,
    logline: params.logline,
    synopsis: params.synopsis,
    isSeries: params.isSeries ?? false,
    seasonNumber: params.seasonNumber,
    episodes,
    targetDurationMin: params.targetDurationMin ?? (params.isSeries ? 30 : 90),
    crew: [],
    status: "concept",
    gpuAssignment: {
      primaryGPU: "RTX Pro 6000 96GB",
      primaryModel: "skyreels-v2",
      draftGPU: "RTX 5070 8GB",
      draftModel: "cogvideox",
    },
    createdAt: Date.now(),
    outputDir: "",
  };

  state.movies.set(movieId, movie);
  state.metrics.totalMovies++;
  logger.info(`Created movie: "${params.title}" (${movieId}), ${episodeCount} episodes`);
  return movie;
}

// ─── Crew Assignment ────────────────────────────────────────────

export function assignCrew(movieId: string, assignments: CrewAssignment[]): boolean {
  const movie = state.movies.get(movieId);
  if (!movie) { return false; }
  movie.crew = assignments;
  logger.info(`Assigned ${assignments.length} crew members to "${movie.title}"`);
  return true;
}

// ─── Scene Management ───────────────────────────────────────────

export function addScene(episodeId: string, params: {
  description: string;
  dialogue?: string;
  durationSec?: number;
  shotPlans?: ShotPlan[];
  videoModel?: VideoModel;
}): Scene | null {
  for (const movie of state.movies.values()) {
    const episode = movie.episodes.find(e => e.id === episodeId);
    if (episode) {
      const scene: Scene = {
        id: genId("scene"),
        episodeId,
        sceneNumber: episode.scenes.length + 1,
        description: params.description,
        dialogue: params.dialogue,
        shotList: params.shotPlans ?? [],
        videoClips: [],
        audioTracks: [],
        status: "scripted",
        durationSec: params.durationSec ?? 10,
        assignedCitizenIds: [],
        videoModel: params.videoModel ?? movie.gpuAssignment.primaryModel,
      };
      episode.scenes.push(scene);
      episode.totalDurationSec += scene.durationSec;
      logger.info(`Added scene ${scene.sceneNumber} to episode ${episode.episodeNumber}: "${params.description.slice(0, 50)}..."`);
      return scene;
    }
  }
  return null;
}

export function generateStoryboard(sceneId: string): ShotPlan[] {
  // AI-assisted storyboard generation — creates shot list from scene description
  const scene = findScene(sceneId);
  if (!scene) { return []; }

  // Auto-generate shot plans based on scene description
  const shots: ShotPlan[] = [];
  const sceneDuration = scene.durationSec;
  const avgShotDuration = 5; // 5 seconds per shot
  const shotCount = Math.max(1, Math.round(sceneDuration / avgShotDuration));

  for (let i = 0; i < shotCount; i++) {
    shots.push({
      shotNumber: i + 1,
      description: `Shot ${i + 1} of scene: ${scene.description}`,
      shotType: i === 0 ? "wide" : i === shotCount - 1 ? "close-up" : "medium",
      cameraAngle: "eye-level",
      cameraMovement: i === 0 ? "dolly" : "static",
      durationSec: avgShotDuration,
      prompt: `${scene.description}, cinematic lighting, film grain, 4K quality`,
    });
  }

  scene.shotList = shots;
  scene.status = "storyboarded";
  logger.info(`Generated storyboard for scene ${scene.sceneNumber}: ${shots.length} shots`);
  return shots;
}

// ─── Render Queue Management ────────────────────────────────────

export function queueSceneForRender(sceneId: string, priority: number = 5): boolean {
  const scene = findScene(sceneId);
  if (!scene) { return false; }

  const movieId = findMovieByScene(sceneId)?.id;
  if (!movieId) { return false; }

  state.renderQueue.push({ sceneId, movieId, priority });
  state.renderQueue.toSorted((a, b) => b.priority - a.priority);
  scene.status = "rendering";
  logger.info(`Queued scene ${scene.sceneNumber} for render (priority: ${priority})`);
  return true;
}

function processRenderQueue(): void {
  if (state.renderQueue.length === 0) { return; }

  for (const item of state.renderQueue) {
    const scene = findScene(item.sceneId);
    if (!scene || scene.status !== "rendering") { continue; }

    const gpu = selectBestGPU(scene.videoModel);
    if (!gpu) { continue; } // No GPU available

    // Reserve GPU
    gpu.available = false;
    gpu.currentJob = item.sceneId;
    state.activeRenders.set(item.sceneId, {
      sceneId: item.sceneId,
      gpuId: gpu.id,
      startedAt: Date.now(),
    });

    scene.renderStartedAt = Date.now();
    logger.info(`Rendering scene ${scene.sceneNumber} on ${gpu.name} (${gpu.vramGB}GB) using ${scene.videoModel}`);

    // Remove from queue
    const idx = state.renderQueue.indexOf(item);
    if (idx >= 0) { state.renderQueue.splice(idx, 1); }
  }
}

// ─── Production Pipeline Steps ──────────────────────────────────

export function advanceProduction(movieId: string): {
  status: ProductionStatus;
  nextStep: string;
  progress: number;
} {
  const movie = state.movies.get(movieId);
  if (!movie) { return { status: "cancelled", nextStep: "Movie not found", progress: 0 }; }

  const totalScenes = movie.episodes.reduce((sum, ep) => sum + ep.scenes.length, 0);
  const completedScenes = movie.episodes.reduce(
    (sum, ep) => sum + ep.scenes.filter(s => s.status === "approved").length, 0
  );
  const progress = totalScenes > 0 ? completedScenes / totalScenes : 0;

  let nextStep: string;

  switch (movie.status) {
    case "concept":
      nextStep = "Write screenplay and episode outlines";
      if (movie.crew.length > 0) {
        movie.status = "pre-production";
        nextStep = "Generate storyboards for all scenes";
      }
      break;

    case "pre-production": {
      const unstoryboarded = movie.episodes.flatMap(ep =>
        ep.scenes.filter(s => s.status === "scripted")
      );
      if (unstoryboarded.length > 0) {
        nextStep = `Storyboard ${unstoryboarded.length} remaining scenes`;
      } else if (totalScenes > 0) {
        movie.status = "production";
        nextStep = "Queue scenes for GPU rendering";
      } else {
        nextStep = "Add scenes to episodes";
      }
      break;
    }

    case "production": {
      const unrendered = movie.episodes.flatMap(ep =>
        ep.scenes.filter(s => s.status === "storyboarded" || s.status === "rendering")
      );
      if (unrendered.length > 0) {
        nextStep = `Render ${unrendered.length} remaining scenes`;
        // Auto-queue unrendered scenes
        for (const scene of unrendered) {
          if (scene.status === "storyboarded") {
            queueSceneForRender(scene.id);
          }
        }
      } else if (completedScenes === totalScenes) {
        movie.status = "post-production";
        nextStep = "Audio sync, music, sound effects, color grading";
      } else {
        nextStep = `Waiting for ${totalScenes - completedScenes} scenes to complete rendering`;
      }
      break;
    }

    case "post-production":
      nextStep = "Final assembly: stitch scenes, add transitions, render final video";
      break;

    case "review":
      nextStep = "Quality review and final approval";
      break;

    case "completed":
      nextStep = "Production complete";
      break;

    default:
      nextStep = "Unknown state";
  }

  return { status: movie.status, nextStep, progress };
}

// ─── Tick Handler ───────────────────────────────────────────────

export function cinematicProductionTick(): void {
  // Process render queue
  processRenderQueue();

  // Check active renders for completion
  for (const [sceneId, render] of state.activeRenders.entries()) {
    const elapsed = Date.now() - render.startedAt;
    const scene = findScene(sceneId);

    if (!scene) {
      state.activeRenders.delete(sceneId);
      continue;
    }

    // Simulate render completion (in production, this checks actual GPU job status)
    if (elapsed > 60_000) { // 60s simulated render time
      scene.status = "rendered";
      scene.renderCompletedAt = Date.now();
      state.metrics.totalScenesRendered++;
      state.metrics.totalRenderTimeMs += elapsed;
      state.metrics.averageSceneRenderMs = state.metrics.totalRenderTimeMs / state.metrics.totalScenesRendered;

      // Release GPU
      const gpu = GPU_FLEET.find(g => g.id === render.gpuId);
      if (gpu) {
        gpu.available = true;
        gpu.currentJob = undefined;
      }
      state.activeRenders.delete(sceneId);
      logger.info(`Scene ${scene.sceneNumber} rendered in ${(elapsed / 1000).toFixed(1)}s`);
    }
  }

  // Update metrics
  const activeGPUs = GPU_FLEET.filter(g => !g.available).length;
  state.metrics.gpuUtilization = activeGPUs / GPU_FLEET.length;
  state.metrics.moviesInProgress = [...state.movies.values()].filter(
    m => m.status !== "completed" && m.status !== "cancelled"
  ).length;
  state.metrics.moviesCompleted = [...state.movies.values()].filter(
    m => m.status === "completed"
  ).length;

  // Estimate backlog
  const pendingScenes = state.renderQueue.length;
  const avgRenderMs = state.metrics.averageSceneRenderMs || 60_000;
  state.metrics.estimatedBacklogHours = (pendingScenes * avgRenderMs) / (1000 * 60 * 60);

  // Auto-advance productions
  for (const movie of state.movies.values()) {
    if (movie.status !== "completed" && movie.status !== "cancelled") {
      advanceProduction(movie.id);
    }
  }
}

// ─── Queries ────────────────────────────────────────────────────

export function getMovie(movieId: string): Movie | undefined {
  return state.movies.get(movieId);
}

export function listMovies(): Movie[] {
  return [...state.movies.values()];
}

export function getProductionMetrics(): ProductionMetrics {
  return { ...state.metrics };
}

export function getGPUFleetStatus(): GPUInfo[] {
  return GPU_FLEET.map(g => ({ ...g }));
}

export function getRenderQueue(): { sceneId: string; movieId: string; priority: number }[] {
  return [...state.renderQueue];
}

// ─── Helpers ────────────────────────────────────────────────────

function findScene(sceneId: string): Scene | undefined {
  for (const movie of state.movies.values()) {
    for (const episode of movie.episodes) {
      const scene = episode.scenes.find(s => s.id === sceneId);
      if (scene) { return scene; }
    }
  }
  return undefined;
}

function findMovieByScene(sceneId: string): Movie | undefined {
  for (const movie of state.movies.values()) {
    for (const episode of movie.episodes) {
      if (episode.scenes.some(s => s.id === sceneId)) { return movie; }
    }
  }
  return undefined;
}

// ─── Model Recommendation Engine ────────────────────────────────

export function recommendModel(params: {
  genre: Genre;
  sceneType: string;
  qualityTier: "draft" | "standard" | "hero";
  maxVRAMGB?: number;
}): { model: VideoModel; gpu: string; reason: string } {
  const maxVRAM = params.maxVRAMGB ?? 96;

  if (params.qualityTier === "hero" && maxVRAM >= 96) {
    return { model: "skyreels-v2", gpu: "RTX Pro 6000", reason: "Full-precision 14B for cinematic hero shots" };
  }
  if (params.qualityTier === "hero" && maxVRAM >= 24) {
    return { model: "hunyuan-1.5", gpu: "RTX 3090 Ti", reason: "13B model with FP8 for high-quality scenes" };
  }
  if (params.genre === "action" || params.genre === "sci-fi") {
    return { model: "wan-2.2", gpu: "RTX 3090 Ti", reason: "Wan 2.2 excels at cinematic lighting and dynamic action" };
  }
  if (maxVRAM >= 12) {
    return { model: "ltx-2", gpu: "RTX 3090 Ti", reason: "LTX-2 for 4K output with synchronized audio" };
  }
  return { model: "cogvideox", gpu: "RTX 5070", reason: "CogVideoX-2B fits 8GB VRAM for rapid drafts" };
}
