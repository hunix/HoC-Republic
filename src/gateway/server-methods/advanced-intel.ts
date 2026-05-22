/**
 * Gateway Handler — hpics.intel.* & hpics.ci.*
 *
 * Advanced Intelligence Collection & Counter-Intelligence (CI) handlers.
 * Built from real-world tradecraft frameworks:
 *   - IC OSINT Strategy 2024-2026 (CIA/ODNI)
 *   - OPSEC 5-step process (NSA)
 *   - HUMINT elicitation doctrine (FM 2-22.3)
 *   - FININT/AML framework (FinCEN/FATF)
 *   - MISO/PSYOP doctrine (FM 3-53)
 *   - MITRE ATT&CK TTPs
 *   - RAND ML deception detection research
 *   - FBI BAP behavioral indicators
 *   - Barton Whaley cyber deception theory
 *
 * ─── Intelligence Collection Disciplines Implemented ───────────────────────
 *
 *  HUMINT   Human Intelligence — behavioral profiling, elicitation, targeting
 *  OSINT    Open Source Intelligence — deep enrichment, web/social/news mining
 *  SIGINT   Signals Intelligence — RF signal analysis, SDR, electronic intercept
 *  FININT   Financial Intelligence — transaction anomaly, wealth tracking, AML
 *  GEOINT   Geospatial Intelligence — location fusion, pattern-of-life, aerial
 *  CYBINT   Cyber Intelligence — adversary profiling, red-team, network exploitation
 *  IMINT    Imagery Intelligence — biometric extraction, deepfake detect, gait
 *  TSCM     Technical Surveillance Countermeasures — RF sweep, device detection
 *  CI       Counter-Intelligence — threat assessment, OPSEC, CI monitor, reflexive control
 *  IW       Information Warfare — cognitive warfare, narrative control, MISO
 *  FUSION   All-source fusion — Dempster-Shafer, cross-modal deception, mosaic
 *
 * ─── Methods Exposed (15 domains) ──────────────────────────────────────────
 *
 *  hpics.intel.humint.*     — HUMINT collection + behavioral targeting
 *  hpics.intel.osint.*      — OSINT collection pipeline
 *  hpics.intel.sigint.*     — SIGINT / hardware sensor collection
 *  hpics.intel.finint.*     — Financial intelligence
 *  hpics.intel.geoint.*     — Geospatial intelligence
 *  hpics.intel.imint.*      — Imagery intelligence
 *  hpics.intel.cybint.*     — Cyber/adversary intelligence
 *  hpics.intel.fusion.*     — All-source fusion & mosaic intelligence
 *  hpics.ci.assess.*        — CI threat assessment
 *  hpics.ci.opsec.*         — OPSEC vulnerability analysis
 *  hpics.ci.warfare.*       — Cognitive / information warfare
 *  hpics.ci.tscm.*          — Technical surveillance countermeasures
 *  hpics.ci.detect.*        — CI detection: reflexive control, deception, CI monitor
 *  hpics.ci.counter.*       — Counter-measures: active defense, red-team, reputation
 *  hpics.ci.predict.*       — Predictive & preemptive CI
 */

import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

// ─── HPICS HTTP helper (standalone, no circular import) ──────────────────────

async function callHpics(
  body: Record<string, unknown>,
  timeoutMs = 45_000,
): Promise<{ ok: boolean; data?: unknown; error?: string; meta?: unknown }> {
  const url = process.env.HPICS_GATEWAY_URL?.trim();
  const key = process.env.HPICS_API_KEY?.trim();
  if (!url || !key) {
    return { ok: false, error: "HPICS_GATEWAY_URL and HPICS_API_KEY must be set" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => { ctrl.abort(); }, timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const payload = (await res.json()) as {
      success?: boolean; data?: unknown; meta?: unknown;
      error?: string; message?: string;
    };
    if (!res.ok || payload.success === false) {
      return { ok: false, error: payload.error ?? payload.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: payload.data, meta: payload.meta };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, error: `Timeout after ${timeoutMs / 1000}s` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Param helpers ────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function reqStr(p: Record<string, unknown>, field: string): { v: string } | { err: string } {
  const s = str(p[field]);
  return s ? { v: s } : { err: `${field} (string) is required` };
}

function makeHandler(
  tool: string,
  requiredStr?: string,
  extraMs = 45_000,
): GatewayRequestHandlers[string] {
  return async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    if (requiredStr) {
      const r = reqStr(p, requiredStr);
      if ("err" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.err)); return; }
    }
    const result = await callHpics({ tool, params: p }, extraMs);
    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? `${tool} failed`)); return; }
    respond(true, { ok: true, tool, data: result.data, meta: result.meta }, undefined);
  };
}

// ─── Handler implementation ───────────────────────────────────────────────────

export const advancedIntelHandlers: Partial<GatewayRequestHandlers> = {

  // ══════════════════════════════════════════════════════════════════
  // HUMINT — Human Intelligence Collection
  //
  // Real-world basis:
  //   CIA HUMINT Management Directive — MICE framework (Money, Ideology,
  //   Coercion, Ego) for recruitment targeting.
  //   FM 2-22.3 — three elicitation modes: direct question, leading
  //   statement, provocative approach.
  //   FBI behavioral profiling — dark tetrad, betrayal likelihood,
  //   attachment vulnerabilities.
  // ══════════════════════════════════════════════════════════════════

  /** MICE recruitment targeting — identify motivation & vulnerability profile */
  "hpics.intel.humint.mice": makeHandler("mice-recruitment-analyzer", "contactId"),

  /** Deep psychological profile — dark tetrad, attachment theory, existential leverage */
  "hpics.intel.humint.psych": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const r = reqStr(p, "contactId");
    if ("err" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.err)); return; }

    const [dark, attachment, existential, behavioral] = await Promise.allSettled([
      callHpics({ tool: "dark-tetrad-profiler", params: p }),
      callHpics({ tool: "attachment-vulnerability-analyzer", params: p }),
      callHpics({ tool: "existential-leverage-calculator", params: p }),
      callHpics({ tool: "deep-psychological-analysis", params: p }),
    ]);

    respond(true, {
      ok: true,
      contactId: r.v,
      pipeline: "humint-psych-profile",
      dark_tetrad: dark.status === "fulfilled" ? dark.value.data : null,
      attachment: attachment.status === "fulfilled" ? attachment.value.data : null,
      existential_leverage: existential.status === "fulfilled" ? existential.value.data : null,
      behavioral: behavioral.status === "fulfilled" ? behavioral.value.data : null,
    }, undefined);
  },

  /** Betrayal likelihood + behavioral DNA — predicts disloyalty, insider risk */
  "hpics.intel.humint.betrayal": makeHandler("betrayal-likelihood-scorer", "contactId"),

  /** Behavioral baseline monitoring — detect deviations from established norm */
  "hpics.intel.humint.baseline": makeHandler("behavioral-baseline-monitor", "contactId"),

  /** Elicitation analysis — evaluate communication patterns for elicitation vulnerability */
  "hpics.intel.humint.elicitation": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const r = reqStr(p, "contactId");
    if ("err" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.err)); return; }

    const [patterns, coercion, manipulation] = await Promise.allSettled([
      callHpics({ tool: "analyze-communication-patterns", params: p }),
      callHpics({ tool: "coercion-resistance-assessor", params: p }),
      callHpics({ tool: "manipulation-vulnerability-assessment", params: p }),
    ]);

    respond(true, {
      ok: true,
      contactId: r.v,
      pipeline: "humint-elicitation-profile",
      communication_patterns: patterns.status === "fulfilled" ? patterns.value.data : null,
      coercion_resistance: coercion.status === "fulfilled" ? coercion.value.data : null,
      manipulation_vulnerability: manipulation.status === "fulfilled" ? manipulation.value.data : null,
    }, undefined);
  },

  /** Pattern-of-life analysis — behavioral routine, schedule, predictability */
  "hpics.intel.humint.pattern_of_life": makeHandler("pattern-of-life-engine", "contactId", 60_000),

  // ══════════════════════════════════════════════════════════════════
  // OSINT — Open Source Intelligence
  //
  // Real-world basis:
  //   IC OSINT Strategy 2024-2026 (CIA/ODNI) — data acquisition,
  //   collection management, AI/ML integration.
  //   Social Media Intelligence (SOCMINT) — link analysis, SNA.
  //   FININT — transaction pattern analysis, entity resolution.
  // ══════════════════════════════════════════════════════════════════

  /** Full OSINT pipeline — OSINT scan → digital footprint → social scrape → news correlate */
  "hpics.intel.osint.full": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const r = reqStr(p, "contactId");
    if ("err" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.err)); return; }

    const osint = await callHpics({ tool: "deep-osint-scan", params: p }, 90_000);
    const [footprint, social, news] = await Promise.allSettled([
      callHpics({ tool: "digital-footprint-scanner", params: p }),
      callHpics({ tool: "scrape-comprehensive-social", params: p }),
      callHpics({ tool: "contact-news-correlator", params: p }),
    ]);

    respond(true, {
      ok: true,
      contactId: r.v,
      pipeline: "osint-full",
      osint: osint.data,
      digital_footprint: footprint.status === "fulfilled" ? footprint.value.data : null,
      social_intelligence: social.status === "fulfilled" ? social.value.data : null,
      news_correlations: news.status === "fulfilled" ? news.value.data : null,
    }, undefined);
  },

  /** Comprehensive contact scan (HPICS native full-context analysis) */
  "hpics.intel.osint.comprehensive": makeHandler("comprehensive-contact-scan", "contactId", 90_000),

  /** Web mention monitoring — tracks online presence, new appearances, darkweb */
  "hpics.intel.osint.monitor": makeHandler("monitor-web-mentions", "contactId"),

  /** Financial intelligence scan — wealth signals, transaction patterns, AML indicators */
  "hpics.intel.finint.scan": makeHandler("financial-intelligence-scan", "contactId", 60_000),

  /** Economic intelligence — market position, business intelligence, economic leverage */
  "hpics.intel.finint.economic": makeHandler("economic-intelligence-engine", "contactId", 60_000),

  // ══════════════════════════════════════════════════════════════════
  // SIGINT / Hardware Intelligence Collection
  //
  // Real-world basis:
  //   NSA SIGINT doctrine — electronic intercept, RF analysis.
  //   TSCM — Technical Surveillance Countermeasures.
  //   SDR (Software Defined Radio) intelligence.
  // ══════════════════════════════════════════════════════════════════

  /** RF signal intelligence — intercept, classify, analyze radio frequency signals */
  "hpics.intel.sigint.rf": makeHandler("rf-signal-intelligence"),

  /** SDR (Software Defined Radio) intelligence analysis */
  "hpics.intel.sigint.sdr": makeHandler("sdr-intelligence"),

  /** Aerial/drone intelligence collection */
  "hpics.intel.sigint.aerial": makeHandler("aerial-intelligence"),

  /** Mobile sensor intelligence — phone sensors, accelerometer, microphone patterns */
  "hpics.intel.sigint.mobile": makeHandler("mobile-sensor-intelligence"),

  /** Hardware intelligence fusion — fuse data from multiple hardware sources */
  "hpics.intel.sigint.hardware_fusion": makeHandler("hardware-intelligence-fusion", undefined, 60_000),

  // ══════════════════════════════════════════════════════════════════
  // GEOINT — Geospatial Intelligence
  //
  // Real-world basis:
  //   NGA GEOINT framework — imagery, spatial analysis, pattern-of-life.
  //   Location history correlation for contact proximity analysis.
  // ══════════════════════════════════════════════════════════════════

  /** Geospatial communication fusion — location + communication pattern correlation */
  "hpics.intel.geoint.fusion": makeHandler("geospatial-communication-fusion", undefined, 60_000),

  /** Location-contact correlation — who was near whom, when, proximity analysis */
  "hpics.intel.geoint.correlate": makeHandler("correlate-location-contacts"),

  /** Geospatial supremacy analysis — strategic location dominance mapping */
  "hpics.intel.geoint.supremacy": makeHandler("geospatial-supremacy-engine", undefined, 90_000),

  // ══════════════════════════════════════════════════════════════════
  // IMINT — Imagery Intelligence
  //
  // Real-world basis:
  //   CIA IMINT collection — facial recognition, biometric vectors.
  //   Gait analysis (US DOD research 2023).
  //   Pupillometry — cognitive load, deception arousal detection.
  // ══════════════════════════════════════════════════════════════════

  /** Multi-view facial extraction — 3D facial model from multiple angles */
  "hpics.intel.imint.face_multiview": makeHandler("extract-facial-multiview"),

  /** Gait pattern analysis — identify individuals by walking pattern */
  "hpics.intel.imint.gait": makeHandler("analyze-gait-pattern"),

  /** Pupillometry — arousal, cognitive load, stress, deception indicators via pupil */
  "hpics.intel.imint.pupillometry": makeHandler("pupillometry-analyzer"),

  /** Body language analysis — full-body nonverbal communication read */
  "hpics.intel.imint.body_language": makeHandler("analyze-body-language"),

  /** Gaze pattern analysis — visual attention map, fixation, avoidance */
  "hpics.intel.imint.gaze": makeHandler("gaze-pattern-analyzer"),

  /** Subvocalization detection — detect silent inner speech from lip/throat micro-movements */
  "hpics.intel.imint.subvocalization": makeHandler("subvocalization-detector"),

  /** Mosaic biometric match — combine multiple biometric vectors for identity confirmation */
  "hpics.intel.imint.mosaic_match": makeHandler("mosaic-biometric-match"),

  /** Biometric-behavioral fusion — fuse physical biometrics + behavioral patterns */
  "hpics.intel.imint.bio_behavioral": makeHandler("biometric-behavioral-fusion", undefined, 60_000),

  // ══════════════════════════════════════════════════════════════════
  // CYBINT — Cyber & Adversary Intelligence
  //
  // Real-world basis:
  //   MITRE ATT&CK — Tactics, Techniques, Procedures (TTPs).
  //   NSA cybersecurity advisories.
  //   Red-team doctrine (Mandiant, CrowdStrike).
  // ══════════════════════════════════════════════════════════════════

  /** Shadow network detection — hidden organizational structures, covert cells */
  "hpics.intel.cybint.shadow_networks": makeHandler("detect-shadow-networks"),

  /** Network exploitation mapping — identify highest-value attack paths */
  "hpics.intel.cybint.exploitation_map": makeHandler("network-exploitation-mapper"),

  /** Power network analysis — centrality, brokers, chokepoints in network */
  "hpics.intel.cybint.power_nodes": makeHandler("power-network-analyzer"),

  /** Link prediction — predict future relationship formation in network */
  "hpics.intel.cybint.link_predict": makeHandler("ctdg-link-predictor"),

  /** Entity resolution — de-duplicate and consolidate identity across sources */
  "hpics.intel.cybint.entity_resolve": makeHandler("entity-resolution-engine"),

  // ══════════════════════════════════════════════════════════════════
  // ALL-SOURCE FUSION
  //
  // Real-world basis:
  //   Dempster-Shafer evidence theory — probabilistic multi-source fusion.
  //   Cross-modal fusion — simultaneous video+audio+behavioral analysis.
  //   Temporal fusion transformer — time-series intelligence synthesis.
  // ══════════════════════════════════════════════════════════════════

  /** Dempster-Shafer fusion — probabilistic evidence combination from multiple sources */
  "hpics.intel.fusion.dempster_shafer": makeHandler("dempster-shafer-fusion", undefined, 60_000),

  /** Cross-modal real-time fusion — simultaneous audio+video+behavioral analysis */
  "hpics.intel.fusion.cross_modal": makeHandler("cross-modal-fusion-realtime", undefined, 90_000),

  /** Cross-modal deception engine — detect deception across modalities simultaneously */
  "hpics.intel.fusion.cross_modal_deception": makeHandler("cross-modal-deception-engine", undefined, 90_000),

  /** Temporal fusion transformer — intelligence trend analysis over time */
  "hpics.intel.fusion.temporal": makeHandler("temporal-fusion-transformer", undefined, 60_000),

  /** Unified data fusion — fuse all available intelligence into single picture */
  "hpics.intel.fusion.unified": makeHandler("unified-data-fusion", undefined, 90_000),

  /** Mosaic intelligence — aggregate all intelligence into full target mosaic */
  "hpics.intel.fusion.mosaic": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const r = reqStr(p, "contactId");
    if ("err" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.err)); return; }

    const [dossier, network, prediction, aggregate] = await Promise.allSettled([
      callHpics({ tool: "generate-intelligence-dossier", params: p }),
      callHpics({ tool: "analyze-network-deep", params: p }),
      callHpics({ tool: "predictive-doctrine-engine", params: p }),
      callHpics({ tool: "mosaic-intelligence-fuser", params: p }),
    ]);

    respond(true, {
      ok: true,
      contactId: r.v,
      pipeline: "mosaic-intelligence",
      dossier: dossier.status === "fulfilled" ? dossier.value.data : null,
      network: network.status === "fulfilled" ? network.value.data : null,
      prediction: prediction.status === "fulfilled" ? prediction.value.data : null,
      mosaic: aggregate.status === "fulfilled" ? aggregate.value.data : null,
    }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // COUNTER-INTELLIGENCE — Threat Assessment
  //
  // Real-world basis:
  //   FBI NCIX (National Counterintelligence and Security Center) guidelines.
  //   CDSE (Center for Development of Security Excellence) insider threat.
  //   ODNI CI threat landscape reports.
  // ══════════════════════════════════════════════════════════════════

  /** Threat assessment — classify threat level, type, intent, capability */
  "hpics.ci.assess.threat": makeHandler("assess-threat"),

  /** Trust assessment — evaluate contact trust score with multi-factor analysis */
  "hpics.ci.assess.trust": makeHandler("assess-trust"),

  /** Adversary profiler — full adversary TTPs, capabilities, intent analysis */
  "hpics.ci.assess.adversary": makeHandler("adversary-profiler", undefined, 60_000),

  /** Security threat analyzer — combined threat landscape for target/environment */
  "hpics.ci.assess.threat_landscape": makeHandler("security-threat-analyzer", undefined, 60_000),

  /** Insider threat matrix — detect insider threat indicators, risk score */
  "hpics.ci.assess.insider": makeHandler("insider-threat-matrix-engine"),

  // ══════════════════════════════════════════════════════════════════
  // COUNTER-INTELLIGENCE — OPSEC
  //
  // Real-world basis:
  //   NSA OPSEC 5-step process: identify critical info → analyze threats
  //   → analyze vulnerabilities → assess risk → apply countermeasures.
  //   NISP (National Industrial Security Program) operational security.
  // ══════════════════════════════════════════════════════════════════

  /** OPSEC vulnerability analysis — 5-step exposure assessment */
  "hpics.ci.opsec.analyze": makeHandler("opsec-vulnerability-analyzer"),

  /** Security monitoring — continuous anomaly detection in communications/behavior */
  "hpics.ci.opsec.monitor": makeHandler("security-monitor"),

  /** Proportional response engine — calibrate OPSEC countermeasure intensity */
  "hpics.ci.opsec.response": makeHandler("proportional-response-engine"),

  // ══════════════════════════════════════════════════════════════════
  // COUNTER-INTELLIGENCE — Detection
  //
  // Real-world basis:
  //   Barton Whaley cyber deception theory — camouflage+confusion, show+hide.
  //   RAND ML deception detection — linguistic patterns, ML models.
  //   Reflexive control theory (Russian military doctrine) — forcing adversary
  //   into predetermined decision path.
  // ══════════════════════════════════════════════════════════════════

  /** CI monitor — continuous counter-intelligence surveillance detection */
  "hpics.ci.detect.ci_monitor": makeHandler("counter-intelligence-monitor"),

  /** Reflexive control detection — detect when adversary is manipulating your decisions */
  "hpics.ci.detect.reflexive_control": makeHandler("reflexive-control-detector"),

  /** Enhanced deception detection — multi-signal lie-detection across voice/text/behavior */
  "hpics.ci.detect.deception": makeHandler("enhanced-deception-detector"),

  /** Cross-modal deception v2 — latest cross-modal deception engine */
  "hpics.ci.detect.cross_modal_deception": makeHandler("cross-modal-deception-v2", undefined, 60_000),

  /** Multi-party deception detection — detect deception in group/multi-person interactions */
  "hpics.ci.detect.multi_party": makeHandler("multi-party-deception-detector"),

  /** Cognitive IW detection — identify cognitive information warfare operations targeting you */
  "hpics.ci.detect.cognitive_iw": makeHandler("cognitive-iw-detector"),

  /** Economic warfare detection — identify economic coercion, sanctions evasion, financial attack */
  "hpics.ci.detect.economic_warfare": makeHandler("economic-warfare-detector"),

  /** Warfare verification chamber — validate alleged intelligence against known baselines */
  "hpics.ci.detect.verify": makeHandler("warfare-verification-chamber"),

  // ══════════════════════════════════════════════════════════════════
  // COUNTER-INTELLIGENCE — Active Counter-Measures
  //
  // Real-world basis:
  //   CIA counter-deception operations — injecting false information.
  //   TSCM (Technical Surveillance Countermeasures) — RF sweep, bug detection.
  //   Active defense doctrine — disrupting adversary collection operations.
  // ══════════════════════════════════════════════════════════════════

  /** Active defense orchestrator — deploy dynamic defensive countermeasures */
  "hpics.ci.counter.active_defense": makeHandler("active-defense-orchestrator", undefined, 90_000),

  /** Red-team simulation — simulate adversary attack on your own assets */
  "hpics.ci.counter.red_team": makeHandler("automated-red-team-engine", undefined, 90_000),

  /** Adversary simulation — simulate specific adversary TTPs */
  "hpics.ci.counter.adversary_sim": makeHandler("red-team-adversary-simulator", undefined, 90_000),

  /** Counter-narrative generator — craft counter-narratives to hostile disinformation */
  "hpics.ci.counter.narrative": makeHandler("counter-narrative-generator", undefined, 60_000),

  /** Reputation defense engine — proactive/reactive reputation protection */
  "hpics.ci.counter.reputation": makeHandler("reputation-defense-engine"),

  /** DRACO deception orchestrator — deploy structured deception operations */
  "hpics.ci.counter.draco": makeHandler("draco-deception-orchestrator", undefined, 90_000),

  // ══════════════════════════════════════════════════════════════════
  // TSCM — Technical Surveillance Countermeasures
  //
  // Real-world basis:
  //   TSCM discipline (NSA, CISA) — RF detection, thermal imaging,
  //   non-linear junction detection, spectrum analysis.
  // ══════════════════════════════════════════════════════════════════

  /** TSCM intelligence — full technical surveillance threat assessment */
  "hpics.ci.tscm.assess": makeHandler("tscm-intelligence"),

  /** TSCM sweep analyzer — analyze sweep data for hidden devices/bugs */
  "hpics.ci.tscm.sweep": makeHandler("tscm-sweep-analyzer"),

  /** Thermal intelligence — thermal imaging analysis for hidden devices/people */
  "hpics.ci.tscm.thermal": makeHandler("thermal-intelligence"),

  // ══════════════════════════════════════════════════════════════════
  // INFORMATION WARFARE — Cognitive & Narrative
  //
  // Real-world basis:
  //   FM 3-53 (MISO) — target audience analysis, message development.
  //   Cognitive warfare doctrine (NATO 2022) — attacking human cognition.
  //   Memetic warfare — viral information spread modeling.
  // ══════════════════════════════════════════════════════════════════

  /** Cognitive warfare engine — design cognitive effect operations */
  "hpics.ci.warfare.cognitive": makeHandler("cognitive-warfare-engine", undefined, 60_000),

  /** Cognitive warfare planner — full campaign plan for cognitive operations */
  "hpics.ci.warfare.plan": makeHandler("cognitive-warfare-planner", undefined, 90_000),

  /** Narrative control engine — control narrative landscape, detect/neutralize hostile narratives */
  "hpics.ci.warfare.narrative": makeHandler("narrative-control-engine", undefined, 60_000),

  /** Semantic warfare engine — linguistic/semantic-level information operations */
  "hpics.ci.warfare.semantic": makeHandler("semantic-warfare-engine", undefined, 60_000),

  /** Memetic propagation engine — model viral spread of information/narratives */
  "hpics.ci.warfare.memetic": makeHandler("memetic-propagation-engine", undefined, 60_000),

  /** Mass formation analyzer — detect/analyze mass formation psychosis patterns */
  "hpics.ci.warfare.mass_formation": makeHandler("mass-formation-analyzer"),

  /** Influence campaign optimizer — optimize influence operation targeting and delivery */
  "hpics.ci.warfare.influence": makeHandler("influence-campaign-optimizer", undefined, 60_000),

  /** Synthetic consensus generator — detect/generate synthetic consensus operations */
  "hpics.ci.warfare.synthetic_consensus": makeHandler("synthetic-consensus-generator", undefined, 60_000),

  // ══════════════════════════════════════════════════════════════════
  // PREDICTIVE CI
  //
  // Real-world basis:
  //   Bayesian intent networks — probabilistic adversary prediction.
  //   Trajectory intercept — preemptive intervention before threat materializes.
  //   Cascade predictor — predict intelligence/campaign cascade effects.
  // ══════════════════════════════════════════════════════════════════

  /** Bayesian intent prediction — probabilistic model of adversary intent */
  "hpics.ci.predict.intent": makeHandler("bayesian-intention-predictor"),

  /** Trajectory intercept engine — identify point to interdict adversary operation */
  "hpics.ci.predict.intercept": makeHandler("trajectory-intercept-engine", undefined, 60_000),

  /** Precognitive pattern engine — detect pre-event patterns before threat materializes */
  "hpics.ci.predict.precognitive": makeHandler("precognitive-pattern-engine", undefined, 60_000),

  /** Predictive opportunity scanner — identify exploitation opportunities in adversary posture */
  "hpics.ci.predict.opportunity": makeHandler("predictive-opportunity-scanner"),

  /** Cascade predictor — model downstream effects of intelligence actions */
  "hpics.ci.predict.cascade": makeHandler("cascade-predictor", undefined, 60_000),

  // ══════════════════════════════════════════════════════════════════
  // GRAND SYNTHESIS — Combined HUMINT + CI + IW
  //
  // Full pipeline: collect → fuse → assess → predict → counter
  // ══════════════════════════════════════════════════════════════════

  /**
   * hpics.intel.full_spectrum
   *
   * Complete intelligence cycle on a target:
   *   1. OSINT enrichment (data acquisition)
   *   2. Behavioral analysis (HUMINT targeting)
   *   3. Network analysis (social graph, shadow networks)
   *   4. CI threat assessment (trust, adversary profile)
   *   5. Predictive modeling (trajectory, cascade)
   *   6. Mosaic fusion (all-source picture)
   *   7. Dossier + recommended countermeasures
   *
   * Timeout: 120s (all stages run sequentially for depth).
   */
  "hpics.intel.full_spectrum": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const r = reqStr(p, "contactId");
    if ("err" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.err)); return; }

    // Stage 1: Collect
    const osint = await callHpics({ tool: "deep-osint-scan", params: p }, 30_000);

    // Stage 2: Behavioral analysis (parallel)
    const [psych, betrayal, patterns] = await Promise.allSettled([
      callHpics({ tool: "dark-tetrad-profiler", params: p }),
      callHpics({ tool: "betrayal-likelihood-scorer", params: p }),
      callHpics({ tool: "pattern-of-life-engine", params: p }),
    ]);

    // Stage 3: Network + shadow
    const [network, shadow] = await Promise.allSettled([
      callHpics({ tool: "analyze-network-deep", params: p }),
      callHpics({ tool: "detect-shadow-networks", params: p }),
    ]);

    // Stage 4: CI assessment (parallel)
    const [threat, trust, insider] = await Promise.allSettled([
      callHpics({ tool: "assess-threat", params: p }),
      callHpics({ tool: "assess-trust", params: p }),
      callHpics({ tool: "insider-threat-matrix-engine", params: p }),
    ]);

    // Stage 5: Prediction
    const prediction = await callHpics({ tool: "predictive-doctrine-engine", params: p }, 30_000);

    // Stage 6: Dossier
    const dossier = await callHpics({ tool: "generate-intelligence-dossier", params: p }, 30_000);

    respond(true, {
      ok: true,
      contactId: r.v,
      pipeline: "full-spectrum-intelligence",
      stages: {
        osint: osint.data,
        psychology: {
          dark_tetrad: psych.status === "fulfilled" ? psych.value.data : null,
          betrayal: betrayal.status === "fulfilled" ? betrayal.value.data : null,
          pattern_of_life: patterns.status === "fulfilled" ? patterns.value.data : null,
        },
        network: {
          graph: network.status === "fulfilled" ? network.value.data : null,
          shadow: shadow.status === "fulfilled" ? shadow.value.data : null,
        },
        ci_assessment: {
          threat: threat.status === "fulfilled" ? threat.value.data : null,
          trust: trust.status === "fulfilled" ? trust.value.data : null,
          insider_risk: insider.status === "fulfilled" ? insider.value.data : null,
        },
        prediction: prediction.data,
        dossier: dossier.data,
      },
    }, undefined);
  },
};
