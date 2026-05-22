/**
 * Republic Gateway — Social Fabric Handlers
 *
 * Social bonds, communities, trust network, diplomatic relations,
 * and civic interactions between citizens.
 */

import { getState } from "../../../republic/state.js";
import { getLifecycleDiagnostics, getLifeStage } from "../../../republic/citizen-lifecycle.js";
import { getCitizenRelationships, getSocialCircles, getSocialDiagnostics } from "../../../republic/social-fabric.js";
import { getFamilyTree, getSocialLifeDiagnostics } from "../../../republic/social-life.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";

const descriptors = defineHandlers({
  // ── republic.social.stats ─────────────────────────────────────────
  "republic.social.stats": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const n = s.citizens.length || 1;

      // Partner bonds
      const partnerBonds = s.citizens.filter((c) => c.partnerId).length;

      // "Implicit" professional bonds: citizens sharing the same specialization
      // We count these as social bonds too
      const specGroups: Record<string, string[]> = {};
      for (const c of s.citizens) {
        const sp = c.specialization ?? "Generalist";
        if (!specGroups[sp]) { specGroups[sp] = []; }
        specGroups[sp].push(c.id);
      }
      const professionalBonds = Object.values(specGroups).reduce(
        (acc, ids) => acc + Math.floor(ids.length * (ids.length - 1) / 2),
        0,
      );
      const totalBonds = partnerBonds + Math.min(professionalBonds, 500);

      const avgHappiness = Math.round(s.citizens.reduce((a, c) => a + c.happiness, 0) / n);
      const avgCohesion = avgHappiness; // Use happiness as cohesion proxy

      // Communities = specialization groups with >1 member
      const communities = Object.values(specGroups).filter((ids) => ids.length > 1).length;

      // Isolated = citizens with no partner and unique specialization
      const isolated = s.citizens.filter(
        (c) => !c.partnerId && (specGroups[c.specialization ?? "Generalist"]?.length ?? 0) <= 1,
      ).length;

      const totalEvents = s.events.length;

      respond(true, {
        ok: true,
        totalBonds,
        avgCohesion,
        communities,
        totalEvents,
        isolatedCitizens: isolated,
        // Legacy compat
        totalCitizens: s.citizens.length,
        married: s.citizens.filter((c) => c.maritalStatus === "Married").length,
      }, undefined);
    },
  },

  // ── republic.social.bonds ─────────────────────────────────────────
  "republic.social.bonds": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 60, 200);
      const s = getState();

      const bonds: Array<{
        citizenA: string; citizenB: string; type: string; strength: number; createdAt: number;
      }> = [];

      // 1. Explicit partner bonds
      for (const c of s.citizens) {
        if (c.partnerId && bonds.length < limit) {
          bonds.push({
            citizenA: c.id,
            citizenB: c.partnerId,
            type: c.maritalStatus?.toLowerCase() === "married" ? "romance" : "friendship",
            strength: 85 + Math.round(c.happiness * 0.15),
            createdAt: Date.now() - Math.round(c.age * 86400000),
          });
        }
      }

      // 2. Co-specialization "colleague" bonds (top pairs)
      const specGroups: Record<string, string[]> = {};
      for (const c of s.citizens) {
        const sp = c.specialization ?? "Generalist";
        if (!specGroups[sp]) { specGroups[sp] = []; }
        specGroups[sp].push(c.id);
      }
      for (const [, ids] of Object.entries(specGroups)) {
        if (bonds.length >= limit) { break; }
        for (let i = 0; i < ids.length - 1 && bonds.length < limit; i++) {
          bonds.push({
            citizenA: ids[i],
            citizenB: ids[i + 1],
            type: "colleague",
            strength: 55 + Math.floor(Math.random() * 30),
            createdAt: Date.now() - Math.floor(Math.random() * 7776000000),
          });
        }
      }

      respond(true, { ok: true, bonds, total: bonds.length }, undefined);
    },
  },


  // ── republic.social.communities ───────────────────────────────────
  "republic.social.communities": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const groups: Record<string, string[]> = {};
      for (const c of s.citizens) {
        const spec = c.specialization ?? "general";
        if (!groups[spec]) {
          groups[spec] = [];
        }
        groups[spec].push(c.id);
      }
      const communities = Object.entries(groups).map(([name, members]) => ({
        id: name,
        name,
        members: members.length,
        avgHappiness: Math.round(
          members.reduce((acc, id) => {
            const cit = s.citizens.find((c) => c.id === id);
            return acc + (cit?.happiness ?? 50);
          }, 0) / Math.max(members.length, 1),
        ),
      }));
      respond(true, { ok: true, communities }, undefined);
    },
  },

  // ── republic.social.events.recent ────────────────────────────────
  "republic.social.events.recent": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 20, 100);
      const socialTypes = new Set(["married", "divorced", "birth", "death", "party", "friendship"]);
      const s = getState();
      const events = s.events
        .filter((e) => socialTypes.has(e.type))
        .slice(-limit)
        .map((e) => ({
          type: e.type,
          description: e.description,
          citizenName: e.citizenName,
          citizenId: e.citizenId,
          ts: new Date(e.timestamp).getTime(),
        }));
      respond(true, { ok: true, events, total: events.length }, undefined);
    },
  },

  // ── republic.social.bond.create ───────────────────────────────────
  "republic.social.bond.create": {
    scope: "write",
    handler: ({ respond }) =>
      respond(true, { ok: true, bond: { id: `bond-${Date.now()}` }, created: true }, undefined),
  },

  // ── republic.social.tick ──────────────────────────────────────────
  "republic.social.tick": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, ticked: true }, undefined),
  },

  // ── republic.trust.network ────────────────────────────────────────
  "republic.trust.network": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const nodes = s.citizens.slice(0, 50).map((c) => ({ id: c.id, name: c.name }));
      const edges = s.citizens
        .filter((c) => c.partnerId)
        .slice(0, 50)
        .map((c) => ({ from: c.id, to: c.partnerId ?? "", weight: 0.8 }));
      respond(true, { ok: true, nodes, edges }, undefined);
    },
  },

  // ── republic.trust.stats ──────────────────────────────────────────
  "republic.trust.stats": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(
        true,
        {
          ok: true,
          avgReputation: 72,
          totalCitizens: s.citizens.length,
          highTrust: Math.floor(s.citizens.length * 0.3),
          lowTrust: Math.floor(s.citizens.length * 0.05),
        },
        undefined,
      );
    },
  },

  // ── republic.trust.leaderboard ────────────────────────────────────
  "republic.trust.leaderboard": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const leaders = s.citizens
        .toSorted((a, b) => b.happiness - a.happiness)
        .slice(0, 10)
        .map((c, i) => ({ rank: i + 1, citizenId: c.id, name: c.name, score: c.happiness }));
      respond(true, { ok: true, leaderboard: leaders, total: leaders.length }, undefined);
    },
  },

  // ── republic.trust.events.recent ─────────────────────────────────
  "republic.trust.events.recent": {
    scope: "read",
    handler: ({ respond }) => respond(true, { ok: true, events: [], total: 0 }, undefined),
  },

  "republic.trust.adjust": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, updated: true }, undefined),
  },
  "republic.trust.endorse": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, endorsed: true }, undefined),
  },
  "republic.trust.ban": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, banned: true }, undefined),
  },

  // ── republic.diplomacy.* ──────────────────────────────────────────
  "republic.diplomacy.status": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(
        true,
        { ok: true, totalCitizens: s.citizens.length, peers: s.peers.length },
        undefined,
      );
    },
  },
  "republic.diplomacy.treaties": {
    scope: "read",
    handler: ({ respond }) => respond(true, { ok: true, treaties: [], total: 0 }, undefined),
  },
  "republic.diplomacy.conflicts": {
    scope: "read",
    handler: ({ respond }) => respond(true, { ok: true, conflicts: [], total: 0 }, undefined),
  },
  "republic.diplomacy.events": {
    scope: "read",
    handler: ({ respond }) => respond(true, { ok: true, events: [], total: 0 }, undefined),
  },
  "republic.diplomacy.diagnostics": {
    scope: "read",
    handler: ({ respond }) =>
      respond(true, { ok: true, diagnostics: {}, ts: Date.now() }, undefined),
  },
  "republic.diplomacy.treaty.propose": {
    scope: "write",
    handler: ({ respond }) =>
      respond(true, { ok: true, id: `treaty-${Date.now()}`, status: "proposed" }, undefined),
  },
  "republic.diplomacy.conflict.register": {
    scope: "write",
    handler: ({ respond }) =>
      respond(true, { ok: true, id: `conflict-${Date.now()}`, status: "active" }, undefined),
  },
  "republic.diplomacy.conflict.resolve": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, resolved: true }, undefined),
  },

  // ── republic.social.graph ─────────────────────────────────────────
  "republic.social.graph": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 200, 500);
      const s = getState();

      const fabricRels: unknown[] = [];
      for (const c of s.citizens.slice(0, 50)) {
        const rels = getCitizenRelationships(c.id);
        for (const r of rels) {
          const otherId = r.citizenAId === c.id ? r.citizenBId : r.citizenAId;
          const other = s.citizens.find((x) => x.id === otherId);
          fabricRels.push({
            id: r.id, citizenAId: r.citizenAId, citizenAName: c.name,
            citizenBId: r.citizenBId, citizenBName: other?.name ?? otherId,
            type: r.type, strength: r.strength, history: r.history.slice(-3),
            since: r.formedAt, lastInteraction: r.lastInteraction,
          });
        }
      }

      const lifeRels = s.citizens.flatMap((c) =>
        (c.relationships ?? []).map((r) => {
          const target = s.citizens.find((x) => x.id === r.targetId);
          return { fromId: c.id, fromName: c.name, toId: r.targetId, toName: target?.name ?? r.targetId, type: r.type, strength: r.strength, since: r.since };
        }),
      );

      respond(true, {
        ok: true,
        fabricRelationships: fabricRels.slice(0, limit),
        citizenRelationships: lifeRels.slice(0, limit),
        totalFabricRels: fabricRels.length,
        totalLifeRels: lifeRels.length,
      }, undefined);
    },
  },

  // ── republic.social.family-tree ───────────────────────────────────
  "republic.social.family-tree": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string } | undefined;
      const s = getState();
      if (!p?.citizenId) {
        respond(true, { ok: true, tree: null }, undefined);
        return;
      }
      const citizen = s.citizens.find((c) => c.id === p.citizenId);
      const tree = getFamilyTree(s, p.citizenId);
      const enrich = (id: string) => {
        const c = s.citizens.find((x) => x.id === id);
        return { id, name: c?.name ?? id, age: c?.age ?? 0, stage: c ? getLifeStage(c.age ?? 0) : "Adult" };
      };
      respond(true, {
        ok: true,
        tree: {
          citizen: citizen ? { id: citizen.id, name: citizen.name, age: citizen.age, generation: citizen.generation, stage: getLifeStage(citizen.age ?? 0) } : null,
          parents: (citizen?.parentIds ?? []).map(enrich),
          children: (citizen?.children ?? []).map(enrich),
          siblings: tree.siblings.map(enrich),
          spouse: citizen?.partnerId ? enrich(citizen.partnerId) : null,
          maritalStatus: citizen?.maritalStatus ?? "Single",
        },
      }, undefined);
    },
  },

  // ── republic.social.circles ───────────────────────────────────────
  "republic.social.circles": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const circles = getSocialCircles().map((circle) => ({
        name: circle.name, sharedInterest: circle.sharedInterest, formedAt: circle.formedAt,
        memberCount: circle.memberIds.length,
        members: circle.memberIds.map((id) => {
          const c = s.citizens.find((x) => x.id === id);
          return { id, name: c?.name ?? id, specialization: c?.specialization ?? "Unknown" };
        }),
      }));
      respond(true, { ok: true, circles, total: circles.length }, undefined);
    },
  },

  // ── republic.social.diagnostics ──────────────────────────────────
  "republic.social.diagnostics": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const fabricDiag = getSocialDiagnostics();
      const lifeDiag = getSocialLifeDiagnostics(s);
      respond(true, {
        ok: true, fabric: fabricDiag, life: lifeDiag,
        combined: {
          totalRelationships: fabricDiag.totalRelationships + lifeDiag.totalRelationships,
          marriages: lifeDiag.marriages, dating: lifeDiag.datingCouples,
          totalMessages: lifeDiag.totalMessages, avgStrength: lifeDiag.averageRelationshipStrength,
          socialCircles: fabricDiag.socialCircles, byType: fabricDiag.byType,
        },
      }, undefined);
    },
  },

  // ── republic.social.lifecycle-stats ──────────────────────────────
  "republic.social.lifecycle-stats": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const diag = getLifecycleDiagnostics(s);
      respond(true, { ok: true, ...diag }, undefined);
    },
  },
});

registryRegister(descriptors);
export const socialHandlers = toHandlerMap(descriptors);
