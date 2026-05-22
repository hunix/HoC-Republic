/**
 * Republic Gateway — Quranic Constitution & Islamic Economy Handlers
 *
 * Exposes the Quranic constitutional articles, Hisba compliance log,
 * Bayt al-Mal treasury stats, and Islamic economy diagnostics to the UI.
 */

import {
  createQuranArticles,
  getBaytAlMal,
  getHisbaLog,
  getQuranComplianceScore,
  getZakatCollectedSession,
} from "../../../republic/quran-constitution.js";
import { getIslamicEconomyDiagnostics, getMudarabahPartnerships } from "../../../republic/islamic-economy.js";
import { getState } from "../../../republic/state.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";

// Cache articles to avoid rebuilding on every request
let _cachedArticles: ReturnType<typeof createQuranArticles> | null = null;
function getArticles() {
  if (!_cachedArticles) { _cachedArticles = createQuranArticles(); }
  return _cachedArticles;
}

const descriptors = defineHandlers({
  // ── republic.quran.articles ───────────────────────────────────────
  "republic.quran.articles": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { domain?: string; limit?: number } | undefined;
      let articles = getArticles();
      if (p?.domain) {
        articles = articles.filter((a) => a.domain === p.domain);
      }
      const limit = Math.min(p?.limit ?? 49, 49);
      respond(true, {
        ok: true,
        articles: articles.slice(0, limit).map((a) => ({
          number: a.number,
          title: a.title,
          arabicTitle: a.arabicTitle,
          surah: a.surah,
          ayah: a.ayah,
          arabicText: a.arabicText,
          translation: a.translation,
          principle: a.principle,
          domain: a.domain,
          complianceScore: a.complianceScore,
        })),
        total: articles.length,
        domains: ["governance", "economy", "social", "trade", "knowledge", "environment", "ethics"],
      }, undefined);
    },
  },

  // ── republic.quran.compliance ─────────────────────────────────────
  "republic.quran.compliance": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const score = getQuranComplianceScore();
      const articles = getArticles();
      const domainScores: Record<string, number> = {};
      for (const domain of ["governance", "economy", "social", "trade", "knowledge", "environment", "ethics"]) {
        const domainArticles = articles.filter((a) => a.domain === domain);
        domainScores[domain] = domainArticles.length > 0
          ? Math.round(domainArticles.reduce((sum, a) => sum + a.complianceScore, 0) / domainArticles.length)
          : 100;
      }
      const hisbaLog = getHisbaLog();
      respond(true, {
        ok: true,
        overallScore: score,
        domainScores,
        totalArticles: articles.length,
        recentViolations: hisbaLog.slice(-5).length,
        citizenCount: s.citizens.length,
        complianceLevel:
          score >= 90 ? "Excellent — مَاشَاءَاللّه" :
          score >= 75 ? "Good — إِن شَاءَ اللّه" :
          score >= 60 ? "Moderate — Needs improvement" : "Critical — Correction required",
      }, undefined);
    },
  },

  // ── republic.quran.bayt-al-mal ────────────────────────────────────
  "republic.quran.bayt-al-mal": {
    scope: "read",
    handler: ({ respond }) => {
      const bayt = getBaytAlMal();
      respond(true, {
        ok: true,
        balance: bayt.balance,
        totalCollected: bayt.totalCollected,
        totalDistributed: bayt.totalDistributed,
        lastZakatTick: bayt.lastZakatTick,
        recentDistributions: bayt.distributions.slice(-20),
        utilizationRate: bayt.totalCollected > 0
          ? parseFloat(((bayt.totalDistributed / bayt.totalCollected) * 100).toFixed(1))
          : 0,
      }, undefined);
    },
  },

  // ── republic.quran.wisdom ─────────────────────────────────────────
  "republic.quran.wisdom": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 20, 50);
      const s = getState();
      const wisdomEvents = s.events
        .filter((e) => e.description?.includes("Quranic Wisdom") || e.description?.includes("Zakat") ||
          e.description?.includes("Bayt al-Mal") || e.description?.includes("Mudarabah") ||
          e.description?.includes("Sadaqah") || e.description?.includes("Waqf") ||
          e.description?.includes("📖") || e.description?.includes("🕌"))
        .slice(-limit)
        .toReversed();
      respond(true, { ok: true, events: wisdomEvents, total: wisdomEvents.length }, undefined);
    },
  },

  // ── republic.quran.zakat-stats ────────────────────────────────────
  "republic.quran.zakat-stats": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const zakatCollected = getZakatCollectedSession();
      const bayt = getBaytAlMal();
      const n = s.citizens.length || 1;
      const NISAB = 500;
      const citizensAboveNisab = s.citizens.filter((c) => (c.credits ?? 0) >= NISAB).length;
      const totalWealth = s.citizens.reduce((sum, c) => sum + (c.credits ?? 0), 0);
      const wealthGini = totalWealth > 0
        ? parseFloat((1 - (2 * s.citizens.reduce((sum, c, i) =>
          sum + (c.credits ?? 0) * (n - i), 0) / (n * totalWealth))).toFixed(3))
        : 0;
      respond(true, {
        ok: true,
        zakatCollectedSession: zakatCollected,
        baytBalance: bayt.balance,
        citizensAboveNisab,
        totalCitizens: s.citizens.length,
        averageWealth: parseFloat((totalWealth / n).toFixed(1)),
        wealthGiniCoefficient: Math.abs(wealthGini),
        nisabThreshold: NISAB,
        zakatRate: "2.5%",
      }, undefined);
    },
  },

  // ── republic.quran.hisba-log ──────────────────────────────────────
  "republic.quran.hisba-log": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number; severity?: string } | undefined;
      const limit = Math.min(p?.limit ?? 50, 200);
      let log = getHisbaLog();
      if (p?.severity) {
        log = log.filter((e) => e.severity === p.severity);
      }
      respond(true, {
        ok: true,
        log: log.slice(-limit).toReversed(),
        total: log.length,
        byArticle: log.reduce<Record<number, number>>((acc, e) => {
          acc[e.articleNumber] = (acc[e.articleNumber] ?? 0) + 1;
          return acc;
        }, {}),
      }, undefined);
    },
  },

  // ── republic.quran.economy-stats ──────────────────────────────────
  "republic.quran.economy-stats": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const diag = getIslamicEconomyDiagnostics(s);
      const partnerships = getMudarabahPartnerships();
      respond(true, {
        ok: true,
        ...diag,
        partnerships: partnerships.slice(0, 10).map((p) => ({
          id: p.id,
          capitalProvider: p.capitalProviderName,
          laborProvider: p.laborProviderName,
          capitalInvested: p.capitalInvested,
          profitSplit: `${Math.round(p.profitShareCapital * 100)}/${Math.round(p.profitShareLabor * 100)}`,
          totalProfit: p.totalProfit,
          active: p.active,
          formedAt: p.formedAt,
        })),
      }, undefined);
    },
  },
});

registryRegister(descriptors);
export const quranHandlers = toHandlerMap(descriptors);
