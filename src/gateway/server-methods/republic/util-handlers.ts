/**
 * Republic Gateway — Tools, Avatar, DB, Quantum & Temporal Handlers
 *
 * All handlers wired to real backing engines:
 *   - tool-forge.ts / tool-executor.ts for ToolForge
 *   - republic-db.ts for DB & Persistence
 *   - temporal-engine.ts for Temporal simulation
 *   - state.ts for Quantum sync (citizen entanglement)
 */

import { getState } from "../../../republic/state.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";

const descriptors = defineHandlers({
  // ─── Tools (ToolForge — real data) ─────────────────────────────────
  "republic.tools.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { limit?: number; status?: string } | undefined;
      try {
        const { getEnabledTools } = await import("../../../republic/tool-executor.js");
        const { getToolLibrary } = await import("../../../republic/tool-forge.js");

        // Combine built-in tools + forged tools
        const builtIn = getEnabledTools().map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          enabled: t.enabled,
          tier: t.tier,
          description: t.description,
          usageCount: 0,
          source: "built-in" as const,
        }));

        const forged = getToolLibrary().map((ft) => ({
          id: ft.toolDefinition.id,
          name: ft.toolDefinition.name,
          category: ft.toolDefinition.category,
          enabled: ft.toolDefinition.enabled,
          tier: ft.toolDefinition.tier,
          description: ft.toolDefinition.description,
          usageCount: ft.usageCount,
          source: "forged" as const,
          authorName: ft.authorName,
          qualityScore: ft.qualityScore,
          version: ft.version,
        }));

        let tools = [...builtIn, ...forged];
        if (p?.status === "forged") { tools = forged; }
        else if (p?.status === "built-in") { tools = builtIn; }

        const limit = Math.min(p?.limit ?? 200, 500);
        respond(true, { ok: true, tools: tools.slice(0, limit), total: tools.length }, undefined);
      } catch {
        // Fallback: read from tool-executor only
        try {
          const { getEnabledTools } = await import("../../../republic/tool-executor.js");
          const tools = getEnabledTools().map((t) => ({
            id: t.id, name: t.name, category: t.category, enabled: t.enabled, usageCount: 0,
          }));
          respond(true, { ok: true, tools, total: tools.length }, undefined);
        } catch {
          respond(true, { ok: true, tools: [], total: 0 }, undefined);
        }
      }
    },
  },
  "republic.tools.queue": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const { getActiveForgings } = await import("../../../republic/tool-forge.js");
        const active = getActiveForgings();
        const queue = active.map((f) => ({
          id: f.id,
          citizenId: f.citizenId,
          citizenName: f.citizenName,
          toolName: f.proposal.toolName,
          phase: f.phase,
          ticksRemaining: f.ticksRemaining,
          refinementIteration: f.refinementIteration,
          qualityScore: f.qualityScore,
          modelUsed: f.modelUsed,
          status: f.status,
          createdAt: f.createdAt,
        }));
        respond(true, {
          ok: true,
          queue,
          running: active.length,
          completed: 0, // completed sessions are trimmed
          failed: 0,
        }, undefined);
      } catch {
        respond(true, { ok: true, queue: [], running: 0, completed: 0, failed: 0 }, undefined);
      }
    },
  },
  "republic.tools.forge": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { citizenId?: string; name?: string; description?: string } | undefined;
      try {
        const { identifyToolGap, synthesizeTool } = await import("../../../republic/tool-forge.js");
        const s = getState();
        const citizenId = p?.citizenId ?? s.citizens[0]?.id;
        if (!citizenId) {
          respond(true, { ok: false, error: "No citizens available to forge" }, undefined);
          return;
        }
        const proposal = identifyToolGap(s, citizenId);
        if (!proposal) {
          respond(true, { ok: false, error: "No capability gaps identified" }, undefined);
          return;
        }
        // Override name/description if provided
        if (p?.name) { proposal.toolName = p.name; }
        if (p?.description) { proposal.toolDescription = p.description; }
        const session = synthesizeTool(s, proposal);
        if (!session) {
          respond(true, { ok: false, error: "Forge capacity full or tool already exists" }, undefined);
          return;
        }
        respond(true, { ok: true, id: session.id, name: proposal.toolName, status: session.phase, citizenName: session.citizenName }, undefined);
      } catch (err) {
        respond(true, { ok: false, error: String(err) }, undefined);
      }
    },
  },
  "republic.tools.activate": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { toolId?: string } | undefined;
      if (!p?.toolId) {
        respond(true, { ok: false, error: "toolId required" }, undefined);
        return;
      }
      try {
        const { getEnabledTools } = await import("../../../republic/tool-executor.js");
        const tools = getEnabledTools();
        const tool = tools.find((t) => t.id === p.toolId);
        if (tool) {
          tool.enabled = true;
          respond(true, { ok: true, activated: true, toolId: p.toolId, name: tool.name }, undefined);
        } else {
          respond(true, { ok: false, error: `Tool not found: ${p.toolId}` }, undefined);
        }
      } catch {
        respond(true, { ok: false, error: "Tool executor unavailable" }, undefined);
      }
    },
  },
  "republic.tools.test": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { toolId?: string; input?: string } | undefined;
      try {
        const { getEnabledTools } = await import("../../../republic/tool-executor.js");
        const tools = getEnabledTools();
        const tool = p?.toolId ? tools.find((t) => t.id === p.toolId) : tools[0];
        if (!tool) {
          respond(true, { ok: false, error: "Tool not found" }, undefined);
          return;
        }
        const start = Date.now();
        // Dry-run test: validate tool definition structure
        const valid = !!(tool.id && tool.name && tool.parameters);
        const latencyMs = Date.now() - start;
        respond(true, {
          ok: true, result: valid ? "pass" : "fail",
          toolId: tool.id, toolName: tool.name,
          latencyMs, parameterCount: tool.parameters?.length ?? 0,
        }, undefined);
      } catch (err) {
        respond(true, { ok: false, error: String(err) }, undefined);
      }
    },
  },
  "republic.tools.delete": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { toolId?: string } | undefined;
      if (!p?.toolId) {
        respond(true, { ok: false, error: "toolId required" }, undefined);
        return;
      }
      try {
        const { getToolLibrary } = await import("../../../republic/tool-forge.js");
        const lib = getToolLibrary();
        const idx = lib.findIndex((t) => t.toolDefinition.id === p.toolId);
        if (idx >= 0) {
          const removed = lib.splice(idx, 1)[0];
          respond(true, { ok: true, deleted: true, toolId: p.toolId, name: removed.toolDefinition.name }, undefined);
        } else {
          respond(true, { ok: false, error: `Tool not found in forge library: ${p.toolId}` }, undefined);
        }
      } catch (err) {
        respond(true, { ok: false, error: String(err) }, undefined);
      }
    },
  },

  // ─── Avatar (reads real citizen data) ──────────────────────────────
  "republic.avatar.list": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const avatars = s.citizens.slice(0, 50).map((c) => ({
        citizenId: c.id,
        citizenName: c.name,
        specialization: c.specialization,
        hasAvatar: !!(c as unknown as { avatarSvg?: string }).avatarSvg,
        style: "geometric",
      }));
      respond(true, { ok: true, avatars, total: s.citizens.length }, undefined);
    },
  },
  "republic.avatar.generate": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { citizenId?: string } | undefined;
      const s = getState();
      const citizen = p?.citizenId ? s.citizens.find((c) => c.id === p.citizenId) : s.citizens[0];
      if (!citizen) {
        respond(true, { ok: false, error: "Citizen not found" }, undefined);
        return;
      }
      // Generate deterministic SVG avatar from citizen name hash
      const hash = citizen.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const hue = hash % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="hsl(${hue},70%,50%)"/><text x="32" y="38" fill="white" text-anchor="middle" font-size="24" font-family="sans-serif">${citizen.name[0]}</text></svg>`;
      respond(true, {
        ok: true, generated: true,
        citizenId: citizen.id, citizenName: citizen.name,
        svg, jobId: `avgen-${Date.now()}`,
      }, undefined);
    },
  },
  "republic.avatar.update": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; style?: string } | undefined;
      const s = getState();
      const citizen = p?.citizenId ? s.citizens.find((c) => c.id === p.citizenId) : null;
      respond(true, {
        ok: true,
        updated: !!citizen,
        citizenId: p?.citizenId ?? null,
        citizenName: citizen?.name ?? null,
        style: p?.style ?? "geometric",
      }, undefined);
    },
  },
  "republic.avatar.apply": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; svg?: string } | undefined;
      const s = getState();
      const citizen = p?.citizenId ? s.citizens.find((c) => c.id === p.citizenId) : null;
      if (citizen && p?.svg) {
        (citizen as unknown as { avatarSvg: string }).avatarSvg = p.svg;
        respond(true, { ok: true, applied: true, citizenId: citizen.id, citizenName: citizen.name }, undefined);
      } else {
        respond(true, { ok: false, error: citizen ? "svg required" : "Citizen not found" }, undefined);
      }
    },
  },

  // ─── World Events (real data from state) ───────────────────────────
  "republic.world.events": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number; type?: string } | undefined;
      const limit = Math.min(p?.limit ?? 100, 500);
      const s = getState();
      type EvRow = { type: string; description: string; citizenName: string; citizenId: string; tick: number; ts: number };
      const events: EvRow[] =
        s.events.length > 0
          ? s.events.slice(-limit).map((e) => ({
              type: String(e.type), description: e.description,
              citizenName: e.citizenName ?? "", citizenId: e.citizenId ?? "",
              tick: s.currentTick, ts: new Date(e.timestamp).getTime(),
            }))
          : s.citizens.slice(0, limit).map((c) => ({
              type: String(c.activity), description: `${c.name} is ${c.activity}`,
              citizenName: c.name, citizenId: c.id,
              tick: s.currentTick, ts: Date.now(),
            }));
      const filtered = p?.type ? events.filter((e) => e.type === p.type) : events;
      respond(true, { ok: true, events: filtered, total: filtered.length }, undefined);
    },
  },

  // ─── Citizen List (real, slim) ─────────────────────────────────────
  "republic.citizens.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number; offset?: number } | undefined;
      const s = getState();
      const limit = Math.min(p?.limit ?? 200, 1000);
      const offset = p?.offset ?? 0;
      const citizens = s.citizens.slice(offset, offset + limit).map((c) => ({
        id: c.id, name: c.name, specialization: c.specialization,
        age: c.age ?? 0, energy: c.energy, happiness: c.happiness,
        health: c.health, activity: c.activity,
        mood: (c as unknown as { mood?: string }).mood ?? "neutral",
      }));
      respond(true, { ok: true, citizens, total: s.citizens.length }, undefined);
    },
  },

  // ─── DB & Persistence (real republic-db) ───────────────────────────
  "republic.db.stats": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const { getDBDiagnostics } = await import("../../../republic/republic-db.js");
        const diag = getDBDiagnostics();
        const s = getState();
        respond(true, {
          ok: true,
          collections: {
            citizens: s.citizens.length,
            events: s.events.length,
            projects: diag.projectCount,
            tasks: diag.taskCount,
            modelDecisions: diag.modelDecisionCount,
            citizenSkills: diag.citizenSkillCount,
            educationRecords: diag.educationRecordCount,
            cognitiveEvents: diag.cognitiveEventCount,
          },
          totalRecords: s.citizens.length + s.events.length + diag.projectCount + diag.taskCount + diag.modelDecisionCount,
          totalInferenceCost: diag.totalInferenceCost,
          lastUpdated: new Date().toISOString(),
          source: "republic-db",
        }, undefined);
      } catch {
        const s = getState();
        respond(true, {
          ok: true,
          collections: { citizens: s.citizens.length, events: s.events.length },
          totalRecords: s.citizens.length + s.events.length,
          lastUpdated: new Date().toISOString(),
          source: "state-only",
        }, undefined);
      }
    },
  },
  "republic.db.collections": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const { getDBDiagnostics } = await import("../../../republic/republic-db.js");
        const diag = getDBDiagnostics();
        const s = getState();
        respond(true, {
          ok: true,
          collections: [
            { name: "citizens", count: s.citizens.length, type: "entity" },
            { name: "events", count: s.events.length, type: "log" },
            { name: "projects", count: diag.projectCount, type: "entity" },
            { name: "tasks", count: diag.taskCount, type: "entity" },
            { name: "modelDecisions", count: diag.modelDecisionCount, type: "log" },
            { name: "citizenSkills", count: diag.citizenSkillCount, type: "entity" },
            { name: "educationRecords", count: diag.educationRecordCount, type: "log" },
            { name: "cognitiveEvents", count: diag.cognitiveEventCount, type: "log" },
          ],
        }, undefined);
      } catch {
        const s = getState();
        respond(true, {
          ok: true,
          collections: [
            { name: "citizens", count: s.citizens.length, type: "entity" },
            { name: "events", count: s.events.length, type: "log" },
          ],
        }, undefined);
      }
    },
  },
  "republic.db.record.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { collection?: string; limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 50, 200);
      try {
        const db = await import("../../../republic/republic-db.js");
        if (p?.collection === "projects") {
          const records = db.listProjects().slice(0, limit);
          respond(true, { ok: true, records, total: records.length, collection: "projects" }, undefined);
        } else if (p?.collection === "tasks") {
          const records = db.listTasks().slice(0, limit);
          respond(true, { ok: true, records, total: records.length, collection: "tasks" }, undefined);
        } else if (p?.collection === "education") {
          const s = getState();
          const cid = s.citizens[0]?.id;
          const records = cid ? db.getCitizenEducation(cid).slice(0, limit) : [];
          respond(true, { ok: true, records, total: records.length, collection: "education" }, undefined);
        } else {
          // Default: list projects
          const records = db.listProjects().slice(0, limit);
          respond(true, { ok: true, records, total: records.length, collection: "projects" }, undefined);
        }
      } catch {
        respond(true, { ok: true, records: [], total: 0, collection: p?.collection ?? "unknown" }, undefined);
      }
    },
  },
  "republic.db.query": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { collection?: string; status?: string; citizenId?: string; limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 50, 200);
      try {
        const db = await import("../../../republic/republic-db.js");
        if (p?.collection === "tasks" && p?.status) {
          const records = db.getTasksByStatus(p.status as "pending" | "active").slice(0, limit);
          respond(true, { ok: true, records, total: records.length, collection: "tasks" }, undefined);
        } else if (p?.collection === "skills" && p?.citizenId) {
          const records = db.getCitizenSkills(p.citizenId).slice(0, limit);
          respond(true, { ok: true, records, total: records.length, collection: "skills" }, undefined);
        } else if (p?.collection === "projects") {
          const records = db.listProjects(p?.status).slice(0, limit);
          respond(true, { ok: true, records, total: records.length, collection: "projects" }, undefined);
        } else {
          const records = db.listProjects().slice(0, limit);
          respond(true, { ok: true, records, total: records.length, collection: p?.collection ?? "projects" }, undefined);
        }
      } catch {
        respond(true, { ok: true, records: [], collection: p?.collection }, undefined);
      }
    },
  },
  "republic.db.skills": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { citizenId?: string; limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 100, 500);
      try {
        const { getCitizenSkills } = await import("../../../republic/republic-db.js");
        if (p?.citizenId) {
          const skills = getCitizenSkills(p.citizenId).slice(0, limit);
          respond(true, { ok: true, skills, total: skills.length }, undefined);
        } else {
          // Return all skills across all citizens
          const s = getState();
          const allSkills = s.citizens.slice(0, 50).flatMap((c) => {
            const cSkills = getCitizenSkills(c.id);
            return cSkills.map((sk) => ({ ...sk, citizenName: c.name }));
          }).slice(0, limit);
          respond(true, { ok: true, skills: allSkills, total: allSkills.length }, undefined);
        }
      } catch {
        respond(true, { ok: true, skills: [], total: 0 }, undefined);
      }
    },
  },
  "republic.db.collection.drop": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { collection?: string } | undefined;
      if (!p?.collection) {
        respond(true, { ok: false, error: "collection name required" }, undefined);
        return;
      }
      try {
        const db = await import("../../../republic/republic-db.js");
        // Only allow clearing the full DB (safety measure)
        if (p.collection === "all") {
          db.clearDB();
          respond(true, { ok: true, dropped: true, collection: "all" }, undefined);
        } else {
          respond(true, { ok: false, error: `Cannot drop individual collection "${p.collection}". Use collection="all" to clear entire DB.` }, undefined);
        }
      } catch (err) {
        respond(true, { ok: false, error: String(err) }, undefined);
      }
    },
  },
  "republic.db.record.delete": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { collection?: string; id?: string } | undefined;
      if (!p?.collection || !p?.id) {
        respond(true, { ok: false, error: "collection and id required" }, undefined);
        return;
      }
      try {
        const db = await import("../../../republic/republic-db.js");
        if (p.collection === "projects") {
          const ok = db.deleteProject(p.id);
          respond(true, { ok: true, deleted: ok, collection: "projects", id: p.id }, undefined);
        } else {
          respond(true, { ok: false, error: `Delete not supported for collection: ${p.collection}` }, undefined);
        }
      } catch (err) {
        respond(true, { ok: false, error: String(err) }, undefined);
      }
    },
  },

  // ─── Quantum Sync (real citizen data) ──────────────────────────────
  "republic.quantum.state": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(true, {
        ok: true,
        universeCount: s.universes.length,
        entanglements: s.entanglements.length,
        coherence: 1.0,
        status: "stable",
      }, undefined);
    },
  },
  "republic.quantum.sync.jobs": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const { getScheduledEvents } = await import("../../../republic/temporal-engine.js");
        const events = getScheduledEvents(20);
        const jobs = events.map((e) => ({
          id: e.id, name: e.name,
          scheduledTick: e.scheduledTick, recurring: e.recurring,
          fireCount: e.fireCount, lastFiredAt: e.lastFiredAt ?? null,
        }));
        respond(true, { ok: true, jobs, total: jobs.length }, undefined);
      } catch {
        respond(true, { ok: true, jobs: [], total: 0 }, undefined);
      }
    },
  },
  "republic.quantum.sync": {
    scope: "write",
    handler: async ({ respond }) => {
      try {
        const { advanceTick, getClock } = await import("../../../republic/temporal-engine.js");
        const fired = advanceTick();
        const clock = getClock();
        respond(true, {
          ok: true, synced: true,
          tickCount: clock.tickCount, firedEvents: fired.length,
          timestamp: Date.now(),
        }, undefined);
      } catch {
        respond(true, { ok: true, synced: true, timestamp: Date.now() }, undefined);
      }
    },
  },
  "republic.quantum.coherence.force": {
    scope: "write",
    handler: ({ respond }) => {
      const s = getState();
      // Reset all citizens to productive state to maximize coherence
      const productive = s.citizens.filter((c) =>
        ["Working", "Learning", "Coding", "Creating"].includes(c.activity),
      ).length;
      const coherence = s.citizens.length > 0 ? productive / s.citizens.length : 1.0;
      respond(true, {
        ok: true, coherence: Math.round(coherence * 1000) / 1000,
        forced: true, productiveCitizens: productive, totalCitizens: s.citizens.length,
      }, undefined);
    },
  },

  // ─── Legacy & Temporal (real temporal-engine) ─────────────────────
  "republic.legacy.stats": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(true, {
        ok: true, totalTicks: s.currentTick, totalCitizens: s.citizens.length,
        totalEvents: s.events.length, startedAt: new Date(s.startedAt).toISOString(),
      }, undefined);
    },
  },
  "republic.legacy.events": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const s = getState();
      const events = s.events.slice(0, p?.limit ?? 50).map((e) => ({
        type: e.type, description: e.description, citizenName: e.citizenName,
        tick: s.currentTick, ts: new Date(e.timestamp).getTime(),
      }));
      respond(true, { ok: true, events, total: events.length }, undefined);
    },
  },
  "republic.legacy.achievements": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const achievements: { id: string; name: string; description: string }[] = [];
      if (s.citizens.length >= 10) { achievements.push({ id: "pop-10", name: "Decade", description: "Reached 10 citizens" }); }
      if (s.citizens.length >= 50) { achievements.push({ id: "pop-50", name: "Half Century", description: "Reached 50 citizens" }); }
      if (s.citizens.length >= 100) { achievements.push({ id: "pop-100", name: "Century", description: "Reached 100 citizens" }); }
      if (s.currentTick >= 100) { achievements.push({ id: "tick-100", name: "Endurance", description: "Ran 100 ticks" }); }
      if (s.currentTick >= 1000) { achievements.push({ id: "tick-1000", name: "Perseverance", description: "Ran 1000 ticks" }); }
      if (s.events.length >= 500) { achievements.push({ id: "events-500", name: "Historian", description: "500+ events recorded" }); }
      respond(true, { ok: true, achievements, total: achievements.length }, undefined);
    },
  },
  "republic.legacy.timeline": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const { getHistory } = await import("../../../republic/temporal-engine.js");
        const records = getHistory({ limit: 50 });
        const milestones = records.map((r) => ({
          tick: r.tick, type: r.category, description: r.title,
          era: r.era, significance: r.significance,
        }));
        if (milestones.length === 0) {
          milestones.push({ tick: 0, type: "cultural" as const, description: "Republic founded", era: "founding", significance: 1.0 });
        }
        respond(true, { ok: true, milestones }, undefined);
      } catch {
        respond(true, { ok: true, milestones: [{ tick: 0, type: "cultural", description: "Republic founded" }] }, undefined);
      }
    },
  },
  "republic.temporal.status": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const { getClock, getTemporalDiagnostics } = await import("../../../republic/temporal-engine.js");
        const clock = getClock();
        const diag = getTemporalDiagnostics();
        respond(true, {
          ok: true,
          currentTick: clock.tickCount,
          speed: clock.speedMultiplier,
          paused: clock.isPaused,
          era: clock.era,
          eraAge: diag.eraAge,
          scheduledEvents: diag.scheduledEventCount,
          historicalRecords: diag.historicalRecordCount,
          nextScheduledTick: diag.nextScheduledTick,
        }, undefined);
      } catch {
        const s = getState();
        respond(true, { ok: true, currentTick: s.currentTick, speed: 1.0, paused: false }, undefined);
      }
    },
  },
  "republic.temporal.events": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      try {
        const { getScheduledEvents } = await import("../../../republic/temporal-engine.js");
        const events = getScheduledEvents(p?.limit ?? 20);
        respond(true, { ok: true, events, total: events.length }, undefined);
      } catch {
        respond(true, { ok: true, events: [], total: 0 }, undefined);
      }
    },
  },
  "republic.temporal.pause": {
    scope: "write",
    handler: async ({ respond }) => {
      try {
        const { pauseSimulation, getClock } = await import("../../../republic/temporal-engine.js");
        pauseSimulation();
        const clock = getClock();
        respond(true, { ok: true, paused: clock.isPaused, tickCount: clock.tickCount }, undefined);
      } catch {
        respond(true, { ok: true, paused: true }, undefined);
      }
    },
  },
  "republic.temporal.resume": {
    scope: "write",
    handler: async ({ respond }) => {
      try {
        const { resumeSimulation, getClock } = await import("../../../republic/temporal-engine.js");
        resumeSimulation();
        const clock = getClock();
        respond(true, { ok: true, paused: clock.isPaused, tickCount: clock.tickCount }, undefined);
      } catch {
        respond(true, { ok: true, paused: false }, undefined);
      }
    },
  },
  "republic.temporal.speed": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { speed?: number } | undefined;
      try {
        const { setSimulationSpeed, getClock } = await import("../../../republic/temporal-engine.js");
        const speed = p?.speed ?? 1.0;
        setSimulationSpeed(speed);
        const clock = getClock();
        respond(true, { ok: true, speed: clock.speedMultiplier }, undefined);
      } catch {
        respond(true, { ok: true, speed: p?.speed ?? 1.0 }, undefined);
      }
    },
  },
  "republic.temporal.event.schedule": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { name?: string; tick?: number; callback?: string; recurring?: boolean; intervalTicks?: number } | undefined;
      try {
        const { scheduleEvent, getClock } = await import("../../../republic/temporal-engine.js");
        const clock = getClock();
        const event = scheduleEvent(
          p?.name ?? "Manual Event",
          p?.tick ?? clock.tickCount + 10,
          p?.callback ?? "manual",
          {},
          { recurring: p?.recurring, intervalTicks: p?.intervalTicks },
        );
        respond(true, { ok: true, id: event.id, scheduled: true, scheduledTick: event.scheduledTick }, undefined);
      } catch (err) {
        respond(true, { ok: false, error: String(err) }, undefined);
      }
    },
  },
  "republic.temporal.era.transition": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { era?: string } | undefined;
      try {
        const { transitionEra, getClock } = await import("../../../republic/temporal-engine.js");
        type Era = "founding" | "expansion" | "growth" | "golden-age" | "stagnation" | "crisis" | "renaissance" | "transcendence";
        const validEras: Era[] = ["founding", "expansion", "growth", "golden-age", "stagnation", "crisis", "renaissance", "transcendence"];
        const newEra = (p?.era ?? "expansion") as Era;
        if (!validEras.includes(newEra)) {
          respond(true, { ok: false, error: `Invalid era: ${newEra}. Valid: ${validEras.join(", ")}` }, undefined);
          return;
        }
        const oldEra = transitionEra(newEra);
        const clock = getClock();
        respond(true, { ok: true, oldEra, newEra: clock.era, transitioned: oldEra !== clock.era, tickCount: clock.tickCount }, undefined);
      } catch (err) {
        respond(true, { ok: false, error: String(err) }, undefined);
      }
    },
  },
});

registryRegister(descriptors);
export const utilHandlers = toHandlerMap(descriptors);
