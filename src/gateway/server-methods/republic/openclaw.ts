/**
 * Republic Gateway — OpenClaw RPC Handlers
 *
 * Exposes all 7 OpenClaw subsystems through the gateway:
 *   - Task Flow Orchestration (task-registry, task-executor, task-flow-registry)
 *   - Context Engine (engine instances + registry)
 *   - Memory Dreaming (dream memory store + phases)
 *   - Media Provider Registry (image/video/music capability negotiation)
 *   - MCP Channel Bridge (conversations, events, approvals)
 *   - Realtime Voice Bridge (sessions, transcripts)
 *   - Realtime Transcription (sessions, results)
 */

import { authProfileRotation } from "../../../republic/openclaw/auth-profile-rotation.js";
import { bootstrapBudget } from "../../../republic/openclaw/bootstrap-budget.js";
import { contextEngineRegistry } from "../../../republic/openclaw/context-engine-registry.js";
import { mcpChannelBridge } from "../../../republic/openclaw/mcp-channel-bridge.js";
import { mediaProviderRegistry } from "../../../republic/openclaw/media-provider-registry.js";
import { dreamMemoryStore } from "../../../republic/openclaw/memory-dreaming.js";
import {
  getFallbackDiagnostics,
  clearAllCooldowns,
} from "../../../republic/openclaw/model-fallback-chain.js";
import { realtimeTranscription } from "../../../republic/openclaw/realtime-transcription.js";
import { realtimeVoiceBridge } from "../../../republic/openclaw/realtime-voice-bridge.js";
import { skillsHub } from "../../../republic/openclaw/skills-hub.js";
import { taskExecutor } from "../../../republic/openclaw/task-executor.js";
import { taskFlowRegistry } from "../../../republic/openclaw/task-flow-registry.js";
import { taskRegistry } from "../../../republic/openclaw/task-registry.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";
// Ensure built-in media providers (Wan2GP, ComfyUI) are registered
import "../../../republic/openclaw/media-providers.js";

const descriptors = defineHandlers({
  // ═══════════════════════════════════════════════════════════════════
  // TASK FLOW ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.tasks.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { state?: string; limit?: number; offset?: number } | undefined;
      const tasks = taskRegistry.listAll({
        state: p?.state as "queued" | "running" | "succeeded" | "failed" | undefined,
        limit: p?.limit,
        offset: p?.offset,
      });
      respond(true, { ok: true, tasks, stats: taskRegistry.getStats() }, undefined);
    },
  },

  "republic.openclaw.tasks.get": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { taskId?: string } | undefined;
      const task = p?.taskId ? taskRegistry.get(p.taskId) : null;
      respond(true, { ok: true, task }, undefined);
    },
  },

  "republic.openclaw.tasks.submit": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as
        | {
            name?: string;
            ownerId?: string;
            flowId?: string;
            params?: Record<string, unknown>;
            ttlMs?: number;
            priority?: number;
            tags?: string[];
          }
        | undefined;
      if (!p?.name || !p?.ownerId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "name and ownerId required" });
        return;
      }
      const task = taskExecutor.submit({
        name: p.name,
        ownerId: p.ownerId,
        flowId: p.flowId,
        params: p.params,
        ttlMs: p.ttlMs,
        priority: p.priority,
        tags: p.tags,
      });
      respond(true, { ok: true, task }, undefined);
    },
  },

  "republic.openclaw.tasks.cancel": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { taskId?: string; reason?: string } | undefined;
      if (!p?.taskId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "taskId required" });
        return;
      }
      const task = taskRegistry.cancel(p.taskId, p.reason);
      respond(true, { ok: true, task }, undefined);
    },
  },

  "republic.openclaw.tasks.events": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const events = taskRegistry.getEvents(p?.limit);
      respond(true, { ok: true, events }, undefined);
    },
  },

  "republic.openclaw.tasks.stats": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...taskRegistry.getStats() }, undefined);
    },
  },

  "republic.openclaw.executor.status": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...taskExecutor.getStatus() }, undefined);
    },
  },

  "republic.openclaw.executor.start": {
    scope: "write",
    handler: ({ respond }) => {
      taskExecutor.start();
      respond(true, { ok: true, message: "Task executor started" }, undefined);
    },
  },

  "republic.openclaw.executor.stop": {
    scope: "write",
    handler: ({ respond }) => {
      taskExecutor.stop();
      respond(true, { ok: true, message: "Task executor stopped" }, undefined);
    },
  },

  // ─── Flows ─────────────────────────────────────────────────────

  "republic.openclaw.flows.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { state?: string; limit?: number } | undefined;
      const flows = taskFlowRegistry.listAll({
        state: p?.state as "active" | "completed" | "failed" | undefined,
        limit: p?.limit,
      });
      respond(true, { ok: true, flows, stats: taskFlowRegistry.getStats() }, undefined);
    },
  },

  "republic.openclaw.flows.create": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { name?: string; ownerId?: string; parentFlowId?: string } | undefined;
      if (!p?.name || !p?.ownerId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "name and ownerId required" });
        return;
      }
      const flow = taskFlowRegistry.create({
        name: p.name,
        ownerId: p.ownerId,
        parentFlowId: p.parentFlowId,
      });
      respond(true, { ok: true, flow }, undefined);
    },
  },

  "republic.openclaw.flows.cancel": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { flowId?: string; reason?: string } | undefined;
      if (!p?.flowId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "flowId required" });
        return;
      }
      const cancelled = taskExecutor.cancelFlow(p.flowId, p.reason);
      respond(true, { ok: true, cancelledTasks: cancelled }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // CONTEXT ENGINE
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.context.status": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...contextEngineRegistry.getDiagnostics() }, undefined);
    },
  },

  "republic.openclaw.context.engines": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, engines: contextEngineRegistry.listEngines() }, undefined);
    },
  },

  "republic.openclaw.context.resolve": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { sessionId?: string; engineName?: string } | undefined;
      if (!p?.sessionId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "sessionId required" });
        return;
      }
      try {
        const engine = await contextEngineRegistry.resolve(p.sessionId, p.engineName);
        respond(
          true,
          { ok: true, engineId: engine.id, diagnostics: engine.getDiagnostics() },
          undefined,
        );
      } catch (err: unknown) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  },

  "republic.openclaw.context.release": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { sessionId?: string } | undefined;
      if (!p?.sessionId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "sessionId required" });
        return;
      }
      contextEngineRegistry.release(p.sessionId);
      respond(true, { ok: true, released: p.sessionId }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // MEMORY DREAMING
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.dreaming.status": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...dreamMemoryStore.getStats() }, undefined);
    },
  },

  "republic.openclaw.dreaming.memories": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; limit?: number } | undefined;
      if (!p?.citizenId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "citizenId required" });
        return;
      }
      const memories = dreamMemoryStore.getMemories(p.citizenId).slice(0, p?.limit ?? 50);
      respond(true, { ok: true, memories, count: memories.length }, undefined);
    },
  },

  "republic.openclaw.dreaming.promoted": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const promoted = dreamMemoryStore.getPromotedMemories(p?.limit);
      respond(true, { ok: true, promoted, count: promoted.length }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // MEDIA PROVIDER REGISTRY
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.media.status": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...mediaProviderRegistry.getDiagnostics() }, undefined);
    },
  },

  "republic.openclaw.media.providers": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { type?: string } | undefined;
      const type = p?.type as "image" | "video" | "music" | undefined;
      const providers = type
        ? mediaProviderRegistry.listByType(type)
        : [
            ...mediaProviderRegistry.listByType("image"),
            ...mediaProviderRegistry.listByType("video"),
            ...mediaProviderRegistry.listByType("music"),
          ];
      respond(
        true,
        { ok: true, providers: providers.map((p) => ({ id: p.id, name: p.name, type: p.type })) },
        undefined,
      );
    },
  },

  "republic.openclaw.media.health": {
    scope: "write",
    handler: async ({ respond }) => {
      const results = await mediaProviderRegistry.checkAllHealth();
      const healthMap: Record<string, unknown> = {};
      for (const [id, health] of results) {
        healthMap[id] = health;
      }
      respond(true, { ok: true, health: healthMap }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // MCP CHANNEL BRIDGE
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.mcp.status": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...mcpChannelBridge.getDiagnostics() }, undefined);
    },
  },

  "republic.openclaw.mcp.servers": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, servers: mcpChannelBridge.listServers() }, undefined);
    },
  },

  "republic.openclaw.mcp.conversations": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { ownerId?: string; active?: boolean; limit?: number } | undefined;
      const conversations = mcpChannelBridge.listConversations(p);
      respond(true, { ok: true, conversations }, undefined);
    },
  },

  "republic.openclaw.mcp.conversation.create": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { name?: string; ownerId?: string; serverUri?: string } | undefined;
      if (!p?.name || !p?.ownerId || !p?.serverUri) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "name, ownerId, and serverUri required",
        });
        return;
      }
      const conversation = mcpChannelBridge.createConversation({
        name: p.name,
        ownerId: p.ownerId,
        serverUri: p.serverUri,
      });
      respond(true, { ok: true, conversation }, undefined);
    },
  },

  "republic.openclaw.mcp.events": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as
        | { conversationId?: string; afterCursor?: string; limit?: number }
        | undefined;
      if (!p?.conversationId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "conversationId required" });
        return;
      }
      const events = mcpChannelBridge.pollEvents(p.conversationId, p);
      respond(true, { ok: true, events }, undefined);
    },
  },

  "republic.openclaw.mcp.approvals": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { conversationId?: string } | undefined;
      const approvals = mcpChannelBridge.getPendingApprovals(p?.conversationId);
      respond(true, { ok: true, approvals }, undefined);
    },
  },

  "republic.openclaw.mcp.approval.respond": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { approvalId?: string; approved?: boolean } | undefined;
      if (!p?.approvalId || p.approved === undefined) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "approvalId and approved required",
        });
        return;
      }
      const result = mcpChannelBridge.respondToApproval(p.approvalId, p.approved);
      respond(true, { ok: true, approval: result }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // REALTIME VOICE
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.voice.status": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...realtimeVoiceBridge.getDiagnostics() }, undefined);
    },
  },

  "republic.openclaw.voice.providers": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, providers: realtimeVoiceBridge.listProviders() }, undefined);
    },
  },

  "republic.openclaw.voice.sessions": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { ownerId?: string; state?: string; limit?: number } | undefined;
      const sessions = realtimeVoiceBridge.listSessions(
        p as {
          ownerId?: string;
          state?: "idle" | "connecting" | "active" | "paused" | "ended" | "error";
          limit?: number;
        },
      );
      respond(true, { ok: true, sessions }, undefined);
    },
  },

  "republic.openclaw.voice.transcript": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { sessionId?: string } | undefined;
      if (!p?.sessionId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "sessionId required" });
        return;
      }
      const transcript = realtimeVoiceBridge.getTranscript(p.sessionId);
      respond(true, { ok: true, transcript }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // REALTIME TRANSCRIPTION
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.transcription.status": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...realtimeTranscription.getDiagnostics() }, undefined);
    },
  },

  "republic.openclaw.transcription.providers": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, providers: realtimeTranscription.listProviders() }, undefined);
    },
  },

  "republic.openclaw.transcription.sessions": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { ownerId?: string; limit?: number } | undefined;
      const sessions = realtimeTranscription.listSessions(p);
      respond(true, { ok: true, sessions }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // MODEL FALLBACK CHAIN
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.fallback.status": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...getFallbackDiagnostics() }, undefined);
    },
  },

  "republic.openclaw.fallback.reset": {
    scope: "admin",
    handler: ({ respond }) => {
      clearAllCooldowns();
      respond(true, { ok: true, message: "All provider cooldowns cleared" }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // SKILLS HUB (CLAWHUB MARKETPLACE)
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.skills.search": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = (params ??
        {}) as import("../../../republic/openclaw/skills-hub.js").SkillSearchParams;
      const result = skillsHub.search(p);
      respond(true, { ok: true, ...result }, undefined);
    },
  },

  "republic.openclaw.skills.get": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { skillId?: string } | undefined;
      const skill = p?.skillId ? skillsHub.get(p.skillId) : null;
      respond(true, { ok: true, skill }, undefined);
    },
  },

  "republic.openclaw.skills.match": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { capabilities?: string[]; topN?: number } | undefined;
      const matches = skillsHub.match(p?.capabilities ?? [], p?.topN);
      respond(true, { ok: true, matches }, undefined);
    },
  },

  "republic.openclaw.skills.trending": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const skills = skillsHub.getTrending(p?.limit);
      respond(true, { ok: true, skills }, undefined);
    },
  },

  "republic.openclaw.skills.featured": {
    scope: "read",
    handler: ({ respond }) => {
      const skills = skillsHub.getFeatured();
      respond(true, { ok: true, skills }, undefined);
    },
  },

  "republic.openclaw.skills.register": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      if (!p?.id || !p?.name) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "id and name required" });
        return;
      }
      skillsHub.register({
        id: p.id as string,
        name: p.name as string,
        description: (p.description as string) ?? "",
        version: (p.version as string) ?? "1.0.0",
        author: (p.author as string) ?? "unknown",
        category: ((p.category as string) ??
          "other") as import("../../../republic/openclaw/skills-hub.js").SkillCategory,
        tags: (p.tags as string[]) ?? [],
        capabilities: (p.capabilities as string[]) ?? [],
        dependencies: (p.dependencies as string[]) ?? [],
        requiredBins: (p.requiredBins as string[]) ?? [],
        featured: (p.featured as boolean) ?? false,
        installCount: 0,
        averageRating: 0,
        ratingCount: 0,
        source: (p.source as "local" | "remote" | "builtin") ?? "local",
        remoteUrl: p.remoteUrl as string | undefined,
        addedAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      respond(true, { ok: true }, undefined);
    },
  },

  "republic.openclaw.skills.rate": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as
        | { skillId?: string; userId?: string; rating?: number; review?: string }
        | undefined;
      if (!p?.skillId || !p?.userId || !p?.rating) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "skillId, userId, and rating required",
        });
        return;
      }
      const ok = skillsHub.addRating({
        skillId: p.skillId,
        userId: p.userId,
        rating: Math.max(1, Math.min(5, p.rating)),
        review: p.review,
        createdAtMs: Date.now(),
      });
      respond(true, { ok }, undefined);
    },
  },

  "republic.openclaw.skills.installHistory": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { skillId?: string; limit?: number } | undefined;
      const history = skillsHub.getInstallHistory(p);
      respond(true, { ok: true, history }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // BOOTSTRAP BUDGET
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.budget.create": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as
        | {
            sessionId?: string;
            provider?: string;
            maxTokens?: number;
            maxCostUsd?: number;
            maxContextWindow?: number;
          }
        | undefined;
      if (!p?.sessionId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "sessionId required" });
        return;
      }
      const config = p.provider
        ? bootstrapBudget.configForProvider(p.provider, {
            maxTokens: p.maxTokens,
            maxCostUsd: p.maxCostUsd,
            maxContextWindow: p.maxContextWindow,
          })
        : {
            maxTokens: p.maxTokens ?? 500_000,
            maxCostUsd: p.maxCostUsd ?? 5.0,
            maxContextWindow: p.maxContextWindow ?? 128_000,
            alertThresholds: [0.5, 0.75, 0.9],
            costPerMillionTokens: 0.3,
          };
      const session = bootstrapBudget.createSession(p.sessionId, config);
      respond(true, { ok: true, sessionId: session.sessionId, config: session.config }, undefined);
    },
  },

  "republic.openclaw.budget.record": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as
        | {
            sessionId?: string;
            inputTokens?: number;
            outputTokens?: number;
            contextTokens?: number;
          }
        | undefined;
      if (!p?.sessionId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "sessionId required" });
        return;
      }
      const result = bootstrapBudget.recordTurn(p.sessionId, {
        inputTokens: p.inputTokens ?? 0,
        outputTokens: p.outputTokens ?? 0,
        contextTokens: p.contextTokens,
      });
      respond(true, { ok: true, ...result }, undefined);
    },
  },

  "republic.openclaw.budget.check": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { sessionId?: string } | undefined;
      if (!p?.sessionId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "sessionId required" });
        return;
      }
      const result = bootstrapBudget.canAffordTurn(p.sessionId);
      respond(true, { ok: true, ...result }, undefined);
    },
  },

  "republic.openclaw.budget.end": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { sessionId?: string } | undefined;
      if (!p?.sessionId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "sessionId required" });
        return;
      }
      bootstrapBudget.endSession(p.sessionId);
      respond(true, { ok: true }, undefined);
    },
  },

  "republic.openclaw.budget.sessions": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { state?: string; limit?: number } | undefined;
      const sessions = bootstrapBudget.listSessions({
        state: p?.state as "active" | "completed" | "exceeded" | undefined,
        limit: p?.limit,
      });
      respond(true, { ok: true, sessions, stats: bootstrapBudget.getStats() }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // AUTH PROFILE ROTATION
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.auth.profiles": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { provider?: string } | undefined;
      // Return profiles WITHOUT the apiKey for security
      const profiles = authProfileRotation.listProfiles(p?.provider).map((prof) => ({
        id: prof.id,
        provider: prof.provider,
        label: prof.label,
        enabled: prof.enabled,
        priority: prof.priority,
        createdAtMs: prof.createdAtMs,
        health: authProfileRotation.getKeyHealth(prof.id),
      }));
      respond(true, { ok: true, profiles, ...authProfileRotation.getDiagnostics() }, undefined);
    },
  },

  "republic.openclaw.auth.addKey": {
    scope: "admin",
    handler: ({ params, respond }) => {
      const p = params as
        | {
            provider?: string;
            apiKey?: string;
            label?: string;
            priority?: number;
          }
        | undefined;
      if (!p?.provider || !p?.apiKey) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "provider and apiKey required",
        });
        return;
      }
      const id = `${p.provider}-manual-${Date.now()}`;
      const ok = authProfileRotation.addProfile({
        id,
        provider: p.provider,
        apiKey: p.apiKey,
        label: p.label ?? `${p.provider} (manual)`,
        enabled: true,
        priority: p.priority ?? 10,
        createdAtMs: Date.now(),
      });
      respond(true, { ok, profileId: id }, undefined);
    },
  },

  "republic.openclaw.auth.removeKey": {
    scope: "admin",
    handler: ({ params, respond }) => {
      const p = params as { profileId?: string } | undefined;
      if (!p?.profileId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "profileId required" });
        return;
      }
      const ok = authProfileRotation.removeProfile(p.profileId);
      respond(true, { ok }, undefined);
    },
  },

  "republic.openclaw.auth.clearCooldown": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { profileId?: string } | undefined;
      if (p?.profileId) {
        const ok = authProfileRotation.clearCooldown(p.profileId);
        respond(true, { ok }, undefined);
      } else {
        authProfileRotation.clearAllCooldowns();
        respond(true, { ok: true, message: "All cooldowns cleared" }, undefined);
      }
    },
  },

  "republic.openclaw.auth.seed": {
    scope: "write",
    handler: ({ respond }) => {
      const seeded = authProfileRotation.seedFromEnv();
      respond(true, { ok: true, seeded }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // UNIFIED DIAGNOSTICS
  // ═══════════════════════════════════════════════════════════════════

  "republic.openclaw.diagnostics": {
    scope: "read",
    handler: ({ respond }) => {
      respond(
        true,
        {
          ok: true,
          tasks: taskRegistry.getStats(),
          executor: taskExecutor.getStatus(),
          flows: taskFlowRegistry.getStats(),
          context: contextEngineRegistry.getDiagnostics(),
          dreaming: dreamMemoryStore.getStats(),
          media: mediaProviderRegistry.getDiagnostics(),
          mcp: mcpChannelBridge.getDiagnostics(),
          voice: realtimeVoiceBridge.getDiagnostics(),
          transcription: realtimeTranscription.getDiagnostics(),
          fallback: getFallbackDiagnostics(),
          skillsHub: skillsHub.getStats(),
          budget: bootstrapBudget.getStats(),
          authProfiles: authProfileRotation.getDiagnostics(),
        },
        undefined,
      );
    },
  },
});

registryRegister(descriptors);
export const openclawHandlers = toHandlerMap(descriptors);
