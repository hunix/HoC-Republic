/**
 * Republic Gateway Handlers — Society & Civilization
 *
 * RPC handlers for:
 *  Phase 17: Citizen Culture
 *  Phase 22: Temporal Engine
 *  Phase 24: Judicial System
 *  Phase 25: Foreign Relations
 *  Phase 26: Media & Broadcasting
 */

import { ErrorCodes, errorShape } from "../../protocol/index.js";
import type { GatewayRequestHandlers } from "../types.js";

// ─── Phase 17: Citizen Culture ──────────────────────────────────
import {
    createCulturalTrait, foundTradition, getCitizenCulture, getCulturalEvents, getCulturalTraits, getCultureDiagnostics, getTraditions,
    triggerCulturalEvent, type CulturalValue
} from "../../../republic/citizen-culture.js";

// ─── Phase 22: Temporal Engine ──────────────────────────────────
import {
    getClock, getHistory, getScheduledEvents, getTemporalDiagnostics, pauseSimulation, recordHistory, resumeSimulation, scheduleEvent, setSimulationSpeed, transitionEra, type Era
} from "../../../republic/temporal-engine.js";

// ─── Phase 24: Judicial System ──────────────────────────────────
import {
    enactLaw, fileCase, getCases, getJudicialDiagnostics, getLaws, getPrecedents, getViolations, renderVerdict, repealLaw, reportViolation, submitArgument
} from "../../../republic/judicial-system.js";

// ─── Phase 25: Foreign Relations ────────────────────────────────
import {
    fileIntelReport, formAlliance,
    getAlliances, getForeignEntities, getForeignRelationsDiagnostics, getIntelReports, getTradeAgreements, negotiateTradeAgreement, registerForeignEntity, setRelationStatus, updateTrust
} from "../../../republic/foreign-relations.js";

// ─── Phase 26: Media & Broadcasting ─────────────────────────────
import {
    createMediaOutlet, getActiveBroadcasts, getArticles, getChannelSentiment,
    getMediaDiagnostics, getMediaOutlets,
    // oxlint-disable-next-line no-unused-vars
    issueBroadcast, publishArticle, type ArticleTone, type MediaChannel
} from "../../../republic/media-broadcasting.js";

// ─────────────────────────────────────────────────────────────────
export const societyHandlers: Partial<GatewayRequestHandlers> = {

  // ═══ Phase 17: Citizen Culture ═════════════════════════════════

  "republic.culture.citizen": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, culture: getCitizenCulture(p.citizenId) }, undefined);
  },

  "republic.culture.trait.create": ({ params, respond }) => {
    const p = params as {
      name?: string;
      description?: string;
      dominantValues?: CulturalValue[];
      originCitizenId?: string;
    } | undefined;
    if (!p?.name || !p?.description) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name and description required"));
      return;
    }
    const trait = createCulturalTrait(
      p.name,
      p.description,
      p.dominantValues ?? [],
      p.originCitizenId,
    );
    respond(true, { ok: true, trait }, undefined);
  },

  "republic.culture.traits": ({ respond }) => {
    respond(true, { ok: true, traits: getCulturalTraits() }, undefined);
  },

  "republic.culture.tradition.found": ({ params, respond }) => {
    const p = params as {
      name?: string;
      description?: string;
      frequency?: string;
      effect?: { metric: string; modifier: number };
    } | undefined;
    if (!p?.name || !p?.description || !p?.frequency) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name, description, frequency required"));
      return;
    }
    const tradition = foundTradition(
      p.name,
      p.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p.frequency as any,
      p.effect ?? { metric: "morale", modifier: 0.1 },
    );
    respond(true, { ok: true, tradition }, undefined);
  },

  "republic.culture.traditions": ({ respond }) => {
    respond(true, { ok: true, traditions: getTraditions() }, undefined);
  },

  "republic.culture.event.trigger": ({ params, respond }) => {
    const p = params as {
      name?: string;
      type?: string;
      participantIds?: string[];
      culturalImpact?: number;
    } | undefined;
    if (!p?.name || !p?.type) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name and type required"));
      return;
    }
    const event = triggerCulturalEvent(
      p.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p.type as any,
      p.participantIds ?? [],
      p.culturalImpact ?? 0.5,
    );
    respond(true, { ok: true, event }, undefined);
  },

  "republic.culture.events": ({ respond }) => {
    respond(true, { ok: true, events: getCulturalEvents() }, undefined);
  },

  "republic.culture.diagnostics": ({ respond }) => {
    respond(true, getCultureDiagnostics(), undefined);
  },

  // ═══ Phase 22: Temporal Engine ═════════════════════════════════

  "republic.temporal.clock": ({ respond }) => {
    respond(true, { ok: true, clock: getClock() }, undefined);
  },

  "republic.temporal.speed": ({ params, respond }) => {
    const p = params as { multiplier?: number } | undefined;
    if (!p?.multiplier) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "multiplier required"));
      return;
    }
    setSimulationSpeed(p.multiplier);
    respond(true, { ok: true, clock: getClock() }, undefined);
  },

  "republic.temporal.pause": ({ respond }) => {
    pauseSimulation();
    respond(true, { ok: true, clock: getClock() }, undefined);
  },

  "republic.temporal.resume": ({ respond }) => {
    resumeSimulation();
    respond(true, { ok: true, clock: getClock() }, undefined);
  },

  "republic.temporal.era.transition": ({ params, respond }) => {
    const p = params as { era?: string } | undefined;
    if (!p?.era) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "era required"));
      return;
    }
    transitionEra(p.era as Era);
    respond(true, { ok: true, clock: getClock() }, undefined);
  },

  "republic.temporal.event.schedule": ({ params, respond }) => {
    const p = params as {
      name?: string;
      scheduledTick?: number;
      callback?: string;
      payload?: Record<string, unknown>;
    } | undefined;
    if (!p?.name || !p?.scheduledTick) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name and scheduledTick required"));
      return;
    }
    const event = scheduleEvent(p.name, p.scheduledTick, p.callback ?? "noop", p.payload);
    respond(true, { ok: true, event }, undefined);
  },

  "republic.temporal.events": ({ respond }) => {
    respond(true, { ok: true, events: getScheduledEvents() }, undefined);
  },

  "republic.temporal.history.record": ({ params, respond }) => {
    const p = params as {
      category?: string;
      title?: string;
      description?: string;
      significance?: number;
      citizenIds?: string[];
    } | undefined;
    if (!p?.title || !p?.description) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title and description required"));
      return;
    }
    const record = recordHistory(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((p.category as any) ?? "social"),
      p.title,
      p.description,
      p.significance ?? 0.5,
      p.citizenIds ?? [],
    );
    respond(true, { ok: true, record }, undefined);
  },

  "republic.temporal.history": ({ params, respond }) => {
    const p = params as { category?: string; era?: string; minSignificance?: number; limit?: number } | undefined;
    respond(
      true,
      {
        ok: true,
        records: getHistory({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          category: p?.category as any,
          era: p?.era as Era,
          minSignificance: p?.minSignificance,
          limit: p?.limit,
        }),
      },
      undefined,
    );
  },

  "republic.temporal.diagnostics": ({ respond }) => {
    respond(true, getTemporalDiagnostics(), undefined);
  },

  // ═══ Phase 24: Judicial System ═════════════════════════════════

  "republic.judicial.law.enact": ({ params, respond }) => {
    const p = params as {
      name?: string;
      description?: string;
      category?: string;
      severity?: string;
      proposedBy?: string;
    } | undefined;
    if (!p?.name || !p?.description || !p?.category) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name, description, category required"));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const law = enactLaw(p.name, p.description, p.category as any, (p.severity as any) ?? "medium", p.proposedBy ?? "system");
    respond(true, { ok: true, law }, undefined);
  },

  "republic.judicial.law.repeal": ({ params, respond }) => {
    const p = params as { lawId?: string } | undefined;
    if (!p?.lawId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "lawId required"));
      return;
    }
    const result = repealLaw(p.lawId);
    respond(result, result ? { ok: true } : undefined, result ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Law not found"));
  },

  "republic.judicial.laws": ({ params, respond }) => {
    const p = params as { category?: string; activeOnly?: boolean } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    respond(true, { ok: true, laws: getLaws({ category: p?.category as any, activeOnly: p?.activeOnly }) }, undefined);
  },

  "republic.judicial.violation.report": ({ params, respond }) => {
    const p = params as {
      lawId?: string;
      citizenId?: string;
      description?: string;
      evidence?: string[];
    } | undefined;
    if (!p?.lawId || !p?.citizenId || !p?.description) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "lawId, citizenId, description required"));
      return;
    }
    const violation = reportViolation(p.lawId, p.citizenId, p.description, p.evidence);
    respond(true, { ok: true, violation }, undefined);
  },

  "republic.judicial.violations": ({ params, respond }) => {
    const p = params as { citizenId?: string; unresolved?: boolean; limit?: number } | undefined;
    respond(true, { ok: true, violations: getViolations({ citizenId: p?.citizenId, unresolved: p?.unresolved, limit: p?.limit }) }, undefined);
  },

  "republic.judicial.case.file": ({ params, respond }) => {
    const p = params as {
      violationId?: string;
      defendantId?: string;
      prosecutorId?: string;
      judgeId?: string;
    } | undefined;
    if (!p?.violationId || !p?.defendantId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "violationId and defendantId required"));
      return;
    }
    const courtCase = fileCase(p.violationId, p.defendantId, p.prosecutorId, p.judgeId);
    respond(true, { ok: true, case: courtCase }, undefined);
  },

  "republic.judicial.case.argument": ({ params, respond }) => {
    const p = params as {
      caseId?: string;
      side?: string;
      citizenId?: string;
      content?: string;
      weight?: number;
    } | undefined;
    if (!p?.caseId || !p?.side || !p?.citizenId || !p?.content) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "caseId, side, citizenId, content required"));
      return;
    }
    const result = submitArgument(p.caseId, p.side as "prosecution" | "defense", p.citizenId, p.content, p.weight);
    respond(result, result ? { ok: true } : undefined, result ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Case not found or already resolved"));
  },

  "republic.judicial.case.verdict": ({ params, respond }) => {
    const p = params as {
      caseId?: string;
      verdict?: string;
      penalty?: { type: string; magnitude: number; durationTicks?: number; description: string };
    } | undefined;
    if (!p?.caseId || !p?.verdict) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "caseId and verdict required"));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const courtCase = renderVerdict(p.caseId, p.verdict as any, p.penalty as any);
    respond(
      !!courtCase,
      courtCase ? { ok: true, case: courtCase } : undefined,
      courtCase ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Case not found"),
    );
  },

  "republic.judicial.cases": ({ params, respond }) => {
    const p = params as { defendantId?: string; pending?: boolean; limit?: number } | undefined;
    respond(true, { ok: true, cases: getCases({ defendantId: p?.defendantId, pending: p?.pending, limit: p?.limit }) }, undefined);
  },

  "republic.judicial.precedents": ({ params, respond }) => {
    const p = params as { category?: string } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    respond(true, { ok: true, precedents: getPrecedents({ category: p?.category as any }) }, undefined);
  },

  "republic.judicial.diagnostics": ({ respond }) => {
    respond(true, getJudicialDiagnostics(), undefined);
  },

  // ═══ Phase 25: Foreign Relations ═══════════════════════════════

  "republic.foreign.entity.register": ({ params, respond }) => {
    const p = params as {
      name?: string;
      type?: string;
      endpoint?: string;
      metadata?: Record<string, unknown>;
    } | undefined;
    if (!p?.name || !p?.type) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name and type required"));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = registerForeignEntity(p.name, p.type as any, p.endpoint, p.metadata);
    respond(true, { ok: true, entity }, undefined);
  },

  "republic.foreign.entity.trust": ({ params, respond }) => {
    const p = params as { entityId?: string; delta?: number } | undefined;
    if (!p?.entityId || p.delta === undefined) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "entityId and delta required"));
      return;
    }
    const entity = updateTrust(p.entityId, p.delta);
    respond(
      !!entity,
      entity ? { ok: true, entity } : undefined,
      entity ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Entity not found"),
    );
  },

  "republic.foreign.entity.status": ({ params, respond }) => {
    const p = params as { entityId?: string; status?: string } | undefined;
    if (!p?.entityId || !p?.status) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "entityId and status required"));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = setRelationStatus(p.entityId, p.status as any);
    respond(result, result ? { ok: true } : undefined, result ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Entity not found"));
  },

  "republic.foreign.entities": ({ params, respond }) => {
    const p = params as { type?: string; status?: string } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    respond(true, { ok: true, entities: getForeignEntities({ type: p?.type as any, status: p?.status as any }) }, undefined);
  },

  "republic.foreign.alliance.form": ({ params, respond }) => {
    const p = params as {
      name?: string;
      memberIds?: string[];
      purpose?: string;
      durationDays?: number;
    } | undefined;
    if (!p?.name || !p?.memberIds?.length || !p?.purpose) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name, memberIds, purpose required"));
      return;
    }
    const alliance = formAlliance(p.name, p.memberIds, p.purpose, p.durationDays);
    respond(true, { ok: true, alliance }, undefined);
  },

  "republic.foreign.alliances": ({ params, respond }) => {
    const p = params as { activeOnly?: boolean } | undefined;
    respond(true, { ok: true, alliances: getAlliances({ activeOnly: p?.activeOnly }) }, undefined);
  },

  "republic.foreign.trade.negotiate": ({ params, respond }) => {
    const p = params as {
      entityId?: string;
      offerType?: string;
      receiveType?: string;
      exchangeRate?: number;
      volumeLimit?: number;
      durationDays?: number;
    } | undefined;
    if (!p?.entityId || !p?.offerType || !p?.receiveType || !p?.exchangeRate || !p?.volumeLimit) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "entityId, offerType, receiveType, exchangeRate, volumeLimit required"));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agreement = negotiateTradeAgreement(p.entityId, p.offerType as any, p.receiveType as any, p.exchangeRate, p.volumeLimit, p.durationDays);
    respond(true, { ok: true, agreement }, undefined);
  },

  "republic.foreign.trades": ({ params, respond }) => {
    const p = params as { entityId?: string; activeOnly?: boolean } | undefined;
    respond(true, { ok: true, agreements: getTradeAgreements({ entityId: p?.entityId, activeOnly: p?.activeOnly }) }, undefined);
  },

  "republic.foreign.intel.file": ({ params, respond }) => {
    const p = params as {
      entityId?: string;
      category?: string;
      content?: string;
      confidence?: number;
      source?: string;
    } | undefined;
    if (!p?.entityId || !p?.category || !p?.content) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "entityId, category, content required"));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = fileIntelReport(p.entityId, p.category as any, p.content, p.confidence ?? 0.5, p.source ?? "unknown");
    respond(true, { ok: true, report }, undefined);
  },

  "republic.foreign.intel": ({ params, respond }) => {
    const p = params as { entityId?: string; category?: string; limit?: number } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    respond(true, { ok: true, reports: getIntelReports({ entityId: p?.entityId, category: p?.category as any, limit: p?.limit }) }, undefined);
  },

  "republic.foreign.diagnostics": ({ respond }) => {
    respond(true, getForeignRelationsDiagnostics(), undefined);
  },

  // ═══ Phase 26: Media & Broadcasting ════════════════════════════

  "republic.media.article.publish": ({ params, respond }) => {
    const p = params as {
      headline?: string;
      body?: string;
      channel?: string;
      tone?: string;
      authorCitizenId?: string;
      credibility?: number;
    } | undefined;
    if (!p?.headline || !p?.body || !p?.channel) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "headline, body, channel required"));
      return;
    }
    const article = publishArticle(
      p.headline,
      p.body,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p.channel as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.tone as any) ?? "neutral",
      p.authorCitizenId,
      p.credibility,
    );
    respond(true, { ok: true, article }, undefined);
  },

  "republic.media.articles": ({ params, respond }) => {
    const p = params as { channel?: string; tone?: string; authorId?: string; limit?: number } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    respond(true, { ok: true, articles: getArticles({ channel: p?.channel as any, tone: p?.tone as any, authorId: p?.authorId, limit: p?.limit }) }, undefined);
  },

  "republic.media.outlet.create": ({ params, respond }) => {
    const p = params as {
      name?: string;
      channel?: string;
      bias?: number;
      credibility?: number;
    } | undefined;
    if (!p?.name || !p?.channel) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name and channel required"));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outlet = createMediaOutlet(p.name, p.channel as any, p.bias, p.credibility);
    respond(true, { ok: true, outlet }, undefined);
  },

  "republic.media.outlets": ({ params, respond }) => {
    const p = params as { channel?: string } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    respond(true, { ok: true, outlets: getMediaOutlets({ channel: p?.channel as any }) }, undefined);
  },

  "republic.media.broadcast.issue": ({ params, respond }) => {
    const p = params as {
      channel?: string;
      title?: string;
      content?: string;
      priority?: string;
      issuedBy?: string;
      expiresInMs?: number;
    } | undefined;
    if (!p?.channel || !p?.title || !p?.content) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "channel, title, content required"));
      return;
    }
    const broadcast = issueBroadcast(
      p.channel as MediaChannel,
      p.title,
      p.content,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.priority as any) ?? "normal",
      p.issuedBy ?? "system",
      p.expiresInMs,
    );
    respond(true, { ok: true, broadcast }, undefined);
  },

  "republic.media.broadcasts": ({ params, respond }) => {
    const p = params as { channel?: string } | undefined;
    respond(true, { ok: true, broadcasts: getActiveBroadcasts(p?.channel as MediaChannel | undefined) }, undefined);
  },

  "republic.media.sentiment": ({ params, respond }) => {
    const p = params as { channel?: string } | undefined;
    if (!p?.channel) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "channel required"));
      return;
    }
    respond(true, { ok: true, sentiment: getChannelSentiment(p.channel as MediaChannel) }, undefined);
  },

  "republic.media.diagnostics": ({ respond }) => {
    respond(true, getMediaDiagnostics(), undefined);
  },
};
