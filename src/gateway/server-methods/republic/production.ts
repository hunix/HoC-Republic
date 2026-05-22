/**
 * RPC Handlers — Cinematic Production
 *
 * Gateway endpoints for the cinematic production pipeline.
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  createMovie,
  assignCrew,
  addScene,
  generateStoryboard,
  queueSceneForRender,
  advanceProduction,
  getMovie,
  listMovies,
  getProductionMetrics,
  getGPUFleetStatus,
  getRenderQueue,
  recommendModel,
} from "../../../republic/cinematic-production.js";

export const productionHandlers: Partial<GatewayRequestHandlers> = {
  "republic.production.status": ({ respond }) => {
    const metrics = getProductionMetrics();
    const gpuFleet = getGPUFleetStatus();
    const movies = listMovies();
    const renderQueue = getRenderQueue();
    respond(true, {
      ok: true,
      metrics,
      gpuFleet,
      activeMovies: movies.filter(m => m.status !== "completed" && m.status !== "cancelled"),
      completedMovies: movies.filter(m => m.status === "completed"),
      renderQueue,
    });
  },

  "republic.production.create-movie": ({ params, respond }) => {
    const p = params as {
      title: string; genre: string; logline: string; synopsis: string;
      isSeries?: boolean; seasonNumber?: number; episodeCount?: number; targetDurationMin?: number;
    };
    if (!p.title || !p.genre || !p.logline) {
      respond(false, { error: "Missing required fields: title, genre, logline" });
      return;
    }
    const movie = createMovie({
      title: p.title,
      genre: p.genre as Parameters<typeof createMovie>[0]["genre"],
      logline: p.logline,
      synopsis: p.synopsis ?? "",
      isSeries: p.isSeries,
      seasonNumber: p.seasonNumber,
      episodeCount: p.episodeCount,
      targetDurationMin: p.targetDurationMin,
    });
    respond(true, { ok: true, movie });
  },

  "republic.production.movie": ({ params, respond }) => {
    const { movieId } = params as { movieId: string };
    const movie = getMovie(movieId);
    if (!movie) {
      respond(false, { error: "Movie not found" });
      return;
    }
    respond(true, { ok: true, movie });
  },

  "republic.production.movies": ({ respond }) => {
    respond(true, { ok: true, movies: listMovies() });
  },

  "republic.production.assign-crew": ({ params, respond }) => {
    const { movieId, crew } = params as {
      movieId: string;
      crew: { citizenId: string; citizenName: string; role: string; specialization?: string }[];
    };
    const success = assignCrew(movieId, crew.map(c => ({
      citizenId: c.citizenId,
      citizenName: c.citizenName,
      role: c.role as import("../../../republic/cinematic-production.js").CitizenRole,
      specialization: c.specialization,
    })));
    if (!success) {
      respond(false, { error: "Movie not found" });
      return;
    }
    respond(true, { ok: true });
  },

  "republic.production.add-scene": ({ params, respond }) => {
    const p = params as {
      episodeId: string; description: string; dialogue?: string;
      durationSec?: number; videoModel?: string;
    };
    const scene = addScene(p.episodeId, {
      description: p.description,
      dialogue: p.dialogue,
      durationSec: p.durationSec,
      videoModel: p.videoModel as Parameters<typeof addScene>[1]["videoModel"],
    });
    if (!scene) {
      respond(false, { error: "Episode not found" });
      return;
    }
    respond(true, { ok: true, scene });
  },

  "republic.production.storyboard": ({ params, respond }) => {
    const { sceneId } = params as { sceneId: string };
    const shots = generateStoryboard(sceneId);
    respond(true, { ok: true, shots, count: shots.length });
  },

  "republic.production.render-scene": ({ params, respond }) => {
    const { sceneId, priority } = params as { sceneId: string; priority?: number };
    const success = queueSceneForRender(sceneId, priority);
    if (!success) {
      respond(false, { error: "Scene not found" });
      return;
    }
    respond(true, { ok: true });
  },

  "republic.production.advance": ({ params, respond }) => {
    const { movieId } = params as { movieId: string };
    const result = advanceProduction(movieId);
    respond(true, { ok: true, ...result });
  },

  "republic.production.gpu-fleet": ({ respond }) => {
    respond(true, { ok: true, gpus: getGPUFleetStatus() });
  },

  "republic.production.render-queue": ({ respond }) => {
    respond(true, { ok: true, queue: getRenderQueue() });
  },

  "republic.production.recommend-model": ({ params, respond }) => {
    const p = params as { genre: string; sceneType: string; qualityTier: string; maxVRAMGB?: number };
    const recommendation = recommendModel({
      genre: p.genre as Parameters<typeof recommendModel>[0]["genre"],
      sceneType: p.sceneType,
      qualityTier: (p.qualityTier ?? "standard") as "draft" | "standard" | "hero",
      maxVRAMGB: p.maxVRAMGB,
    });
    respond(true, { ok: true, recommendation });
  },
};
