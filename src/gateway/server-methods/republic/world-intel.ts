/**
 * Republic Gateway Handlers — World Intelligence
 *
 * RPC handlers for the World Intelligence module.
 * Provides news feeds, threat classification, CII scores,
 * signal convergence, and data freshness to citizens and government.
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  checkAlertRules,
  fireTestAlert,
  getAlertConfig,
  getAlertHistory,
  setAlertConfig,
} from "../../../republic/world-intel-alerts.js";
import {
  buildDashboard,
  resolveAccessLevel,
  type WorldIntelAccessLevel,
} from "../../../republic/world-intel-view.js";
import {
  classifyThreat,
  detectConvergences,
  generateWorldBrief,
  getActiveSignals,
  getArsenal,
  getCIIHistory,
  getCIIScores,
  getCountryCII,
  getDataFreshness,
  getEscalationVelocities,
  getIntelReports,
  getMonitoredCountries,
  getNewsFeed,
  getOsintEvents,
  getWarRisks,
  getWarSignals,
  isWorldIntelRunning,
  startWorldIntelligence,
  stopWorldIntelligence,
  submitIntelReport,
  getLiteSnapshots,
  type ThreatSeverity,
} from "../../../republic/world-intelligence.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { argusEngine } from "../../../intelligence/osint-fusion.js";
import {
  getExtractionLog,
  getActiveConflicts,
  getAllCarrierTrails,
  getCarrierTrail,
} from "../../../intelligence/news-extractor.js";
import { getSourceProfiles } from "../../../intelligence/source-registry.js";

// ─── Handlers ───────────────────────────────────────────────────

export const worldIntelHandlers: Partial<GatewayRequestHandlers> = {
  /**
   * Get a full role-based dashboard payload.
   * Params: { citizenId: string, specialization: string, isPresident?: boolean, isDepartmentHead?: boolean }
   */
  "republic.worldintel.dashboard": ({ params, respond }) => {
    try {
      const p = params as
        | {
            accessLevel?: WorldIntelAccessLevel;
            citizenId?: string;
            specialization?: string;
            isPresident?: boolean;
            isDepartmentHead?: boolean;
          }
        | undefined;

      // Resolve access level either from explicit param or from citizen info
      let accessLevel: WorldIntelAccessLevel = "citizen";
      if (p?.accessLevel) {
        accessLevel = p.accessLevel;
      } else if (p?.citizenId && p?.specialization) {
        accessLevel = resolveAccessLevel({
          citizenId: p.citizenId,
          specialization: p.specialization,
          isPresident: p.isPresident ?? false,
          isDepartmentHead: p.isDepartmentHead ?? false,
        });
      }

      const dashboard = buildDashboard(accessLevel);
      respond(true, { ok: true, dashboard }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to build dashboard: ${String(err)}`),
      );
    }
  },

  /**
   * Get a comprehensive world brief — top stories, threat level, convergences.
   * Available to all citizens.
   */
  "republic.worldintel.brief": ({ respond }) => {
    try {
      const brief = generateWorldBrief();
      respond(true, { ok: true, brief }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to generate world brief: ${String(err)}`),
      );
    }
  },

  /**
   * Get the aggregated news feed with threat classification.
   * Available String(to )all citizens.
   * Params: { country?: string, severity?: ThreatSeverity, limit?: number }
   */
  "republic.worldintel.news": ({ params, respond }) => {
    try {
      const p = params as { country?: string; severity?: string; limit?: number } | undefined;
      const news = getNewsFeed({
        country: p?.country,
        severity: p?.severity as ThreatSeverity | undefined,
        limit: p?.limit,
      });
      respond(true, { ok: true, news }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to get news feed: ${String(err)}`),
      );
    }
  },

  /**
   * Get Country Instability Index scores for all monitored countries.
   * Government-only access recommended.
   * Params: { country?: string } — optional filter for single country
   */
  "republic.worldintel.cii": ({ params, respond }) => {
    try {
      const p = params as { country?: string } | undefined;
      if (p?.country) {
        const profile = getCountryCII(p.country);
        if (!profile) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.NOT_FOUND, `Country "${p.country}" is not monitored`),
          );
          return;
        }
        respond(true, { ok: true, profile }, undefined);
      } else {
        const scores = getCIIScores();
        respond(true, { ok: true, scores }, undefined);
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to get CII scores: ${String(err)}`),
      );
    }
  },

  /**
   * Get active intelligence signals.
   * Filter by country or type.
   * Params: { country?: string, type?: string }
   */
  "republic.worldintel.signals": ({ params, respond }) => {
    try {
      const p = params as { country?: string; type?: string } | undefined;
      let sigs = getActiveSignals();

      if (p?.country) {
        sigs = sigs.filter((s) => s.country === p.country!.toUpperCase());
      }
      if (p?.type) {
        sigs = sigs.filter((s) => s.type === p.type);
      }

      respond(true, { ok: true, signals: sigs }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to get signals: ${String(err)}`),
      );
    }
  },

  /**
   * Detect signal convergences — regions where ≥3 different signal types overlap.
   * Government-only access recommended.
   */
  "republic.worldintel.convergences": ({ respond }) => {
    try {
      const convergences = detectConvergences();
      respond(true, { ok: true, convergences }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to detect convergences: ${String(err)}`),
      );
    }
  },

  /**
   * Classify a text headline for threat severity and category.
   * Available to all citizens.
   * Params: { text: string }
   */
  "republic.worldintel.classify": ({ params, respond }) => {
    try {
      const p = params as { text?: string } | undefined;
      if (!p?.text) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "text required"));
        return;
      }
      const classification = classifyThreat(p.text);
      respond(true, { ok: true, classification }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Classification failed: ${String(err)}`),
      );
    }
  },

  /**
   * Get data freshness status for all intelligence sources.
   */
  "republic.worldintel.freshness": ({ respond }) => {
    try {
      const freshness = getDataFreshness();
      respond(true, { ok: true, freshness }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to get freshness: ${String(err)}`),
      );
    }
  },

  /**
   * Get monitored countries list.
   */
  "republic.worldintel.countries": ({ respond }) => {
    try {
      const countries = getMonitoredCountries();
      respond(true, { ok: true, countries }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to get countries: ${String(err)}`),
      );
    }
  },

  /**
   * Start/stop/status of the world intelligence module.
   * Params: { action: "start" | "stop" | "status" }
   */
  "republic.worldintel.control": ({ params, respond }) => {
    try {
      const p = params as { action?: string } | undefined;
      const action = p?.action || "status";

      switch (action) {
        case "start":
          startWorldIntelligence();
          respond(
            true,
            { ok: true, running: true, message: "World intelligence started" },
            undefined,
          );
          break;
        case "stop":
          stopWorldIntelligence();
          respond(
            true,
            { ok: true, running: false, message: "World intelligence stopped" },
            undefined,
          );
          break;
        case "status":
          respond(true, { ok: true, running: isWorldIntelRunning() }, undefined);
          break;
        default:
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `Unknown action: ${action}. Use start, stop, or status.`,
            ),
          );
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Control action failed: ${String(err)}`),
      );
    }
  },

  // ─── v2: War Risk, Arsenal, Signals, Alerts ─────────────────────

  /** War risk ML String(sco)res for all or one country */
  "republic.worldintel.war-risk": ({ params, respond }) => {
    try {
      const p = params as { country?: string } | undefined;
      const risks = getWarRisks(p?.country);
      respond(true, { ok: true, risks }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `War risk failed: ${String(err)}`));
    }
  },

  /** Project Argus: OSINT Fusion Engine Diagnostics */
  "republic.worldintel.argus": ({ respond }) => {
    try {
      const diagnostics = argusEngine.getDiagnostics();
      respond(true, { ok: true, diagnostics }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Argus diagnostics failed: ${String(err)}`)
      );
    }
  },

  /** Global arsenal database */
  "republic.worldintel.arsenal": ({ params, respond }) => {
    try {
      const p = params as { country?: string } | undefined;
      const arsenal = getArsenal(p?.country);
      respond(true, { ok: true, arsenal }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Arsenal failed: ${String(err)}`));
    }
  },

  /** Active war signal detections */
  "republic.worldintel.war-signals": ({ respond }) => {
    try {
      const signals = getWarSignals();
        respond(true, { ok: true, signals }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `War signals failed: ${String(err)}`),
      );
    }
  },

  /** CII escalation velocities */
  "republic.worldintel.velocities": ({ respond }) => {
    try {
      const velocities = getEscalationVelocities();
      respond(true, { ok: true, velocities }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Velocities failed: ${String(err)}`));
    }
  },

  /** CII history for sparklines */
  "republic.worldintel.cii-history": ({ params, respond }) => {
    try {
      const p = params as { country?: string } | undefined;
      if (!p?.country) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "country required"));
        return;
      }
      const history = getCIIHistory(p.country);
      respond(true, { ok: true, history }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `CII history failed: ${String(err)}`),
      );
    }
  },

  /** OSINT events feed */
  "republic.worldintel.osint": ({ params, respond }) => {
    try {
      const p = params as { country?: string; limit?: number } | undefined;
      const events = getOsintEvents(p ?? undefined);
      respond(true, { ok: true, events }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `OSINT events failed: ${String(err)}`),
      );
    }
  },

  /** Alert config — GET + SET */
  "republic.worldintel.alerts": ({ params, respond }) => {
    try {
      const p = params as { action?: string; config?: Record<string, unknown> } | undefined;
      if (p?.action === "set" && p.config) {
        setAlertConfig(p.config as Parameters<typeof setAlertConfig>[0]);
        respond(true, { ok: true, config: getAlertConfig() }, undefined);
      } else if (p?.action === "history") {
        respond(true, { ok: true, history: getAlertHistory() }, undefined);
      } else if (p?.action === "check") {
        // Manual trigger of rule check
        checkAlertRules().catch(() => {});
        respond(true, { ok: true, message: "Alert check triggered" }, undefined);
      } else {
        respond(
          true,
          { ok: true, config: getAlertConfig(), history: getAlertHistory() },
          undefined,
        );
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Alerts failed: ${String(err)}`));
    }
  },

  /** Fire a test alert on a specific channel */
  "republic.worldintel.alerts.test": ({ params, respond }) => {
    const p = params as { channel?: string } | undefined;
    const channel = p?.channel ?? "system_chat";
    fireTestAlert(channel)
      .then(() => respond(true, { ok: true, message: `Test alert sent to ${channel}` }, undefined))
      .catch((err) =>
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INTERNAL_ERROR, `Test alert failed: ${err}`),
        ),
      );
  },

  /** Citizen intel reports */
  "republic.worldintel.intel-report": ({ params, respond }) => {
    try {
      const p = params as
        | { action?: string; target?: string; limit?: number; report?: Record<string, unknown> }
        | undefined;
      if (p?.action === "submit" && p.report) {
        const submitted = submitIntelReport(p.report as Parameters<typeof submitIntelReport>[0]);
        respond(true, { ok: true, report: submitted }, undefined);
      } else {
        const reports = getIntelReports({ target: p?.target, limit: p?.limit });
        respond(true, { ok: true, reports }, undefined);
      }
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Intel reports failed: ${String(err)}`),
      );
    }
  },

  // ─── World Events Feed ───────────────────────────────────────────

  /**
   * Get recent world events as geo-tagged incident feed for map pages.
   * Combines OSINT events + news into a unified map-ready format.
   * Params: { limit?: number, since?: number }
   * Returns: { ok: true, events: Array<{ id, description, region, severity, lat, lng, timestamp }> }
   */
  "republic.world.events": ({ params, respond }) => {
    try {
      const p = params as { limit?: number; since?: number } | undefined;
      const limit = Math.min(p?.limit ?? 30, 100);
      const since = p?.since ?? 0;

      // Merge OSINT events and recent news into a unified event list
      const osint = getOsintEvents({ limit: limit * 2 });
      const news = getNewsFeed({ limit }).slice(0, limit);

      // Convert OSINT events first (they have geo coords)
      const osintEvents = osint
        .filter((e) => since === 0 || ((e as unknown as { timestamp?: number }).timestamp ?? 0) > since)
        .slice(0, limit)
        .map((e: unknown) => {
          const ev = e as {
            id?: string;
            title?: string;
            description?: string;
            country?: string;
            severity?: string;
            lat?: number;
            lng?: number;
            lon?: number;
            timestamp?: number;
          };
          return {
            id: ev.id ?? `osint-${Math.random().toString(36).slice(2)}`,
            description: ev.title ?? ev.description ?? "Intel event",
            region: ev.country ?? "Global",
            severity: ev.severity ?? "medium",
            lat: ev.lat ?? 0,
            lng: ev.lng ?? ev.lon ?? 0,
            timestamp: ev.timestamp ?? Date.now(),
          };
        });

      // Fill with news events (approximate lat/lng from country CII data)
      const newsEvents = news
        .filter(
          (n: unknown) =>
            since === 0 ||
            ((n as { timestamp?: number }).timestamp ?? 0) > since,
        )
        .map((n: unknown) => {
          const item = n as {
            id?: string;
            headline?: string;
            summary?: string;
            country?: string;
            severity?: string;
            lat?: number;
            lng?: number;
            timestamp?: number;
          };
          return {
            id: item.id ?? `news-${Math.random().toString(36).slice(2)}`,
            description: item.headline ?? item.summary ?? "World intelligence update",
            region: item.country ?? "Global",
            severity: item.severity ?? "low",
            lat: item.lat ?? 0,
            lng: item.lng ?? 0,
            timestamp: item.timestamp ?? Date.now(),
          };
        });

      // Dedup by id, prefer osint over news, sort newest first
      const seen = new Set<string>();
      const events = [...osintEvents, ...newsEvents]
        .filter((e) => {
          if (seen.has(e.id)) {return false;}
          seen.add(e.id);
          return true;
        })
        .toSorted((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      respond(true, { ok: true, events, count: events.length, timestamp: Date.now() }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `World events failed: ${String(err)}`),
      );
    }
  },

  // ─── Tactical Map Screenshot ──────────────────────────────────────

  /**
   * Capture a screenshot of the tactical map or world monitor.
   * Params: { country?: string, zoom?: number, page?: "tactical" | "world" }
   * Returns: { ok: true, base64: string, dataUri: string } or { ok: false, error }
   */
  "republic.intel.screenshot": ({ params, respond }) => {
    import("../../../gateway/screenshot-service.js")
      .then(({ captureMapScreenshot }) => {
        const p = params as
          | { country?: string; zoom?: number; page?: "tactical" | "world" }
          | undefined;
        return captureMapScreenshot({
          country: p?.country,
          zoom: p?.zoom,
          page: p?.page ?? "tactical",
        });
      })
      .then((result) => {
        if (result.ok) {
          respond(
            true,
            { ok: true, base64: result.base64, dataUri: result.dataUri, filePath: result.filePath },
            undefined,
          );
        } else {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INTERNAL_ERROR, result.error ?? "Screenshot failed"),
          );
        }
      })
      .catch((err) => {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INTERNAL_ERROR, `Screenshot error: ${err}`),
        );
      });
  },

  // ─── Specialist Citizen Data ──────────────────────────────────────

  /**
   * Get CII forecasts from DataScientist citizens.
   * Params: { country?: string, limit?: number }
   */
  "republic.intel.forecasts": ({ params, respond }) => {
    try {
      const p = params as { country?: string; limit?: number } | undefined;
      import("../../../republic/specialist-citizens.js")
        .then(({ getForecasts }) => {
          const forecasts = getForecasts(p ?? undefined);
          respond(true, { ok: true, forecasts }, undefined);
        })
        .catch((err) =>
          respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Forecasts: ${err}`)),
        );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Forecasts: ${String(err)}`));
    }
  },

  /**
   * Get policy briefs from Politician citizens.
   * Params: { limit?: number }
   */
  "republic.intel.policy-briefs": ({ params, respond }) => {
    try {
      const p = params as { limit?: number } | undefined;
      void import("../../../republic/specialist-citizens.js")
        .then(({ getPolicyBriefs }) => {
          const briefs = getPolicyBriefs(p ?? undefined);
          respond(true, { ok: true, briefs }, undefined);
        })
        .catch((err) =>
          respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Policy briefs: ${err}`)),
        );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Policy briefs: ${String(err)}`));
    }
  },

  /**
   * Semantic news search.
   * Params: { query: string, limit?: number }
   */
  "republic.intel.news-search": ({ params, respond }) => {
    try {
      const p = params as { query?: string; limit?: number } | undefined;
      if (!p?.query) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
        return;
      }
      import("../../../republic/news-vector-store.js")
        .then(({ semanticSearch }) => {
          const results = semanticSearch(p.query!, p.limit ?? 10);
          respond(true, { ok: true, results }, undefined);
        })
        .catch((err) =>
          respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `News search: ${err}`)),
        );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `News search: ${String(err)}`));
    }
  },

  // ─── NIE: News Intelligence Extractor APIs ─────────────────────────

  /**

   * Get the NIE extraction event log.
   * Params: { limit?: number, type?: "carrier_move" | "strike" | "arsenal_delta" | "conflict" }
   */
  "republic.worldintel.nie-log": ({ params, respond }) => {
    try {
      const p = params as { limit?: number; type?: string } | undefined;
      const limit = Math.min(p?.limit ?? 100, 500);
      let events = getExtractionLog(limit);
      if (p?.type) {events = events.filter((e) => e.type === p.type);}
      respond(true, { ok: true, events, count: events.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `NIE log: ${String(err)}`));
    }
  },

  /**
   * Get source credibility profiles with live trust scores.
   * Params: { minTrust?: number }
   */
  "republic.worldintel.sources": ({ params, respond }) => {
    try {
      const p = params as { minTrust?: number } | undefined;
      let sources = getSourceProfiles();
      if (p?.minTrust != null) {sources = sources.filter((s) => s.trustScore >= p.minTrust!);}
      respond(true, { ok: true, sources, count: sources.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Sources: ${String(err)}`));
    }
  },

  /**
   * Get active cross-source claim conflicts.
   * Params: { limit?: number }
   */
  "republic.worldintel.conflicts": ({ params, respond }) => {
    try {
      const p = params as { limit?: number } | undefined;
      const conflicts = getActiveConflicts(p?.limit ?? 20);
      respond(true, { ok: true, conflicts, count: conflicts.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Conflicts: ${String(err)}`));
    }
  },

  /**
   * Get news-derived carrier position trail.
   * Params: { vesselId?: string }
   */
  "republic.worldintel.carrier-trail": ({ params, respond }) => {
    try {
      const p = params as { vesselId?: string } | undefined;
      if (p?.vesselId) {
        const trail = getCarrierTrail(p.vesselId);
        respond(true, { ok: true, trail, count: trail.length }, undefined);
      } else {
        const trails = getAllCarrierTrails();
        respond(true, { ok: true, trails }, undefined);
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Carrier trail: ${String(err)}`));
    }
  },

  // ─── Retention: Lite Snapshots ──────────────────────────────────

  /**
   * Get compressed lite snapshots (post-GC intelligence fragments).
   * Params: { country?: string; limit?: number }
   */
  "republic.worldintel.lite-snapshots": ({ params, respond }) => {
    try {
      const p = params as { country?: string; limit?: number } | undefined;
      const snaps = getLiteSnapshots({ country: p?.country, limit: p?.limit ?? 200 });
      respond(true, { ok: true, snapshots: snaps, count: snaps.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Lite snapshots: ${String(err)}`));
    }
  },

  /**
   * Get semantic threat intelligence whitepapers gathered by the ArXiv RAG scraper.
   * Params: { query?: string, limit?: number }
   */
  "republic.worldintel.research.list": ({ params, respond }) => {
    try {
      const p = params as { query?: string; limit?: number } | undefined;
      import("../../../republic/intelligence/threat-intel-vector.js")
        .then(({ queryThreatIntel }) => {
          // If query is empty, just match all simply
          const papers = queryThreatIntel(p?.query || "*", p?.limit ?? 50);
          respond(true, { ok: true, papers, count: papers.length }, undefined);
        })
        .catch((err) =>
          respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Threat intel list: ${err}`))
        );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Threat intel list: ${String(err)}`));
    }
  },

  /**
   * Get the current poll schedule — which sources are due next and when.
   * Shows tier, trust score, last fetch, next fetch for every feed.
   * Params: {}
   */
  "republic.worldintel.poll-schedule": ({ respond }) => {
    try {
      const RSS_FEEDS: Array<{ source: string; tier: number }> =
        (require("../../../republic/world-intelligence.js") as Record<string, unknown>)._RSS_FEEDS as Array<{ source: string; tier: number }> ?? [];
      const schedule = getSourceProfiles().map(p => {
        const trust = p.trustScore;
        const intervalMs = trust > 0.75 ? 5*60_000 : trust > 0.60 ? 15*60_000 : trust > 0.50 ? 30*60_000 : 60*60_000;
        const tierLabel = trust > 0.75 ? "5 min" : trust > 0.60 ? "15 min" : trust > 0.50 ? "30 min" : "60 min";
        return {
          source: p.id,
          trustScore: Math.round(p.trustScore * 100),
          tendency: p.tendency,
          pollInterval: tierLabel,
          pollIntervalMs: intervalMs,
          feedTier: RSS_FEEDS.find(f => f.source === p.id)?.tier ?? null,
          lastUpdated: p.lastUpdated,
        };
      }).toSorted((a, b) => a.pollIntervalMs - b.pollIntervalMs);
      respond(true, { ok: true, schedule, count: schedule.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Poll schedule: ${String(err)}`));
    }
  },
};

