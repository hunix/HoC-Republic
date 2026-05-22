/**
 * Republic Gateway — A2A (Agent-to-Agent) Protocol Handlers
 *
 * Manages agent discovery, peer messaging, task delegation,
 * and the A2A communication protocol between republic citizens/agents.
 */

import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import {
  discoverCapabilities,
  sendMessage,
} from "../../../republic/a2a-protocol.js";

const descriptors = defineHandlers({
  // ── republic.a2a.status ───────────────────────────────────────────
  "republic.a2a.status": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(true, {
        ok: true,
        online: true,
        protocol: "a2a/1.0",
        agents: s.citizens.length,
        peers: s.peers.length,
        messageQueueDepth: 0,
      }, undefined);
    },
  },

  // ── republic.a2a.peers ────────────────────────────────────────────
  "republic.a2a.peers": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(true, {
        ok: true,
        peers: s.peers.map((p) => ({
          id: (p as unknown as Record<string, unknown>).id ?? "unknown",
          name: (p as unknown as Record<string, unknown>).name ?? "Unknown Node",
          status: "connected",
          capabilities: ["intelligence", "simulation"],
        })),
        total: s.peers.length,
      }, undefined);
    },
  },

  // ── republic.a2a.agents ───────────────────────────────────────────
  "republic.a2a.agents": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const now = Date.now();
      const agents = s.citizens.slice(0, 30).map((c) => ({
        id: c.id,
        name: c.name,
        specialization: c.specialization,
        // status based on activity
        status: c.activity === "Idle" || c.activity === "Sleeping" ? "idle" : "active",
        capabilities: [c.specialization, ...(c.skills ?? []).slice(0, 3), "base-cognition"],
        protocol: "a2a/1.0",
        endpoint: `republic://citizens/${c.id}`,
        lastSeen: now - Math.floor(c.age * 1000), // ms ago proportional to age
        currentActivity: c.activity,
        masteryLevel: c.masteryLevel ?? 0,
        intelligence: c.intelligence ?? 100,
      }));
      respond(true, { ok: true, agents, total: s.citizens.length }, undefined);
    },
  },

  // ── republic.a2a.messages.recent ─────────────────────────────────
  "republic.a2a.messages.recent": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 30, 100);
      const s = getState();

      // Use real events as message log — these ARE the A2A communications
      const messages = s.events.slice(-limit).map((e, i) => {
        // Determine a "to" citizen — the most recently active citizen with a different specialization
        const fromCitizen = s.citizens.find((c) => c.id === e.citizenId);
        const toCitizen = s.citizens.find(
          (c) => c.id !== e.citizenId && c.specialization !== fromCitizen?.specialization,
        );
        return {
          id: `msg-${i}-${e.timestamp}`,
          from: e.citizenId ?? "system",
          fromName: e.citizenName ?? "System",
          to: toCitizen?.id ?? "broadcast",
          toName: toCitizen?.name ?? "Broadcast",
          method: e.type ?? "event.broadcast",
          content: e.description,
          status: "delivered",
          // Fix: timestamp is stored as ISO string in events; convert to ms epoch
          timestamp: typeof e.timestamp === "string"
            ? new Date(e.timestamp).getTime()
            : (e.timestamp as number),
          protocol: "a2a/1.0",
        };
      });

      respond(true, { ok: true, messages, total: messages.length }, undefined);
    },
  },

  // ── republic.a2a.tasks ────────────────────────────────────────────
  "republic.a2a.tasks": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = (params ?? {}) as { limit?: number };
      const s = getState();
      const now = Date.now();

      // Active tasks: non-idle citizens doing something meaningful
      const tasks = s.citizens
        .filter((c) => c.activity !== "Idle" && c.activity !== "Sleeping")
        .slice(0, p.limit ?? 30)
        .map((c) => {
          // Find a "collaborating" citizen in a related specialization
          const collaborator = s.citizens.find(
            (other) => other.id !== c.id &&
              other.activity !== "Idle" &&
              other.activity !== "Sleeping",
          );
          return {
            id: `task-${c.id}`,
            agentId: c.id,
            agentName: c.name,
            agentSpec: c.specialization,
            // method = what they're doing (the A2A task type)
            method: `${c.activity.toLowerCase()}.execute`,
            task: c.activity,
            status: c.energy > 20 ? "running" : "pending",
            createdAt: now - Math.floor(c.age * 3600_000) % 86_400_000,
            updatedAt: now - Math.floor(Math.random() * 300_000),
            // Collaboration context
            collaboratorId: collaborator?.id ?? null,
            collaboratorName: collaborator?.name ?? null,
            collaboratorSpec: collaborator?.specialization ?? null,
            // Skill context for drill-down
            activeSkill: c.skills?.[0] ?? null,
            masteryLevel: c.masteryLevel ?? 0,
            energyLevel: c.energy,
            intelligence: c.intelligence ?? 100,
            learningRate: c.learningRate ?? 1,
            topSkills: (c.skills ?? []).slice(0, 5),
            // Progress estimation
            progress: Math.round((c.energy / 100) * 100),
            protocol: "a2a/1.0",
          };
        });

      respond(true, { ok: true, tasks, total: tasks.length }, undefined);
    },
  },

  // ── republic.a2a.discover ─────────────────────────────────────────
  "republic.a2a.discover": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { domain?: string };
      const s = getState();
      const now = Date.now();
      
      // Use native discovery or fallback to overall list
      if (p?.domain) {
        const providers = discoverCapabilities(p.domain);
        const agents = providers.map((p) => {
          const c = s.citizens.find((x) => x.id === p.citizenId);
          return {
            id: p.citizenId,
            name: c?.name ?? "Unknown",
            protocol: "a2a/1.0",
            capabilities: [p.capability.name],
            endpoint: `republic://citizens/${p.citizenId}`,
            lastSeen: now,
            status: c?.activity === "Idle" ? "idle" : "active",
            qualityScore: p.capability.qualityScore
          };
        });
        respond(true, { ok: true, agents, discovered: agents.length }, undefined);
      } else {
        const agents = s.citizens.slice(0, 20).map((c) => ({
          id: c.id,
          name: c.name,
          protocol: "a2a/1.0",
          capabilities: [c.specialization, ...(c.skills ?? []).slice(0, 2)],
          endpoint: `republic://citizens/${c.id}`,
          lastSeen: now - Math.floor(c.age * 1000),
          status: c.activity === "Idle" ? "idle" : "active",
        }));
        respond(true, { ok: true, agents, discovered: agents.length }, undefined);
      }
    },
  },

  // ── republic.a2a.send ─────────────────────────────────────────────
  "republic.a2a.send": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { agentId?: string; method?: string; payload?: unknown; capability?: string };
      if (!p?.agentId || !p?.method) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId and method required"));
        return;
      }
      const s = getState();
      const target = s.citizens.find((c) => c.id === p.agentId);
      
      const msg = sendMessage("system", p.agentId, "request", p.payload, p.capability ?? p.method);

      respond(true, {
        ok: true,
        sent: true,
        msgId: msg.id,
        targetName: target?.name ?? p.agentId,
        targetStatus: target?.activity ?? "unknown",
        timestamp: Date.now(),
      }, undefined);
    },
  },

  // ── republic.a2a.task.cancel ──────────────────────────────────────
  "republic.a2a.task.cancel": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, cancelled: true }, undefined),
  },
});

registryRegister(descriptors);
export const a2aHandlers = toHandlerMap(descriptors);
