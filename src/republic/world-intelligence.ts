/**
 * Republic Platform — World Intelligence Module v2
 *
 * Active, predictive, multi-layer intelligence platform:
 * - RSS + OSINT feeds (ISW, Airwars, ACLED, GJ Security, Defense One)
 * - ML war-risk scoring (logistic model on CII + velocity + signals)
 * - Global arsenal profiles (SIPRI/IISS open-data snapshot, 35 countries)
 * - Escalation velocity tracking (1h/6h/24h CII delta analysis)
 * - War signal detection (5-factor confluence model)
 * - CII history for sparkline visualisation
 * - Alert rule engine (hooks into world-intel-alerts.ts dispatcher)
 *
 * Accessible via gateway RPCs with access control:
 * - Government: full dashboard, war risk, arsenal, signals
 * - Security: cyber IOC data + OSINT feeds
 * - Finance: prediction markets + economic signals
 * - All citizens: world brief + news
 */

import { extractFromNewsBatch } from "../intelligence/news-extractor.js";
// ─── Alert Checker Integration ───────────────────────────────────
// startAlertChecker / stopAlertChecker imported lazily to break circular dep
import { argusEngine } from "../intelligence/osint-fusion.js";
import { initSourceRegistry } from "../intelligence/source-registry.js";
import { intelligenceBus } from "./intelligence-bus.js";
import { pollArxivSecurityPapers } from "./intelligence/arxiv-scraper.js";
import { storeThreatIntel } from "./intelligence/threat-intel-vector.js";

// ─── Types ──────────────────────────────────────────────────────

export type ThreatSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ThreatCategory =
  | "conflict"
  | "protest"
  | "disaster"
  | "diplomatic"
  | "economic"
  | "terrorism"
  | "cyber"
  | "health"
  | "environmental"
  | "military"
  | "crime"
  | "infrastructure"
  | "tech"
  | "general";

export interface ThreatClassification {
  severity: ThreatSeverity;
  category: ThreatCategory;
  confidence: number;
  keywords: string[];
  source: "keyword";
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: number;
  threat: ThreatClassification | null;
  country?: string;
  region?: string;
}

export interface CountryProfile {
  code: string;
  name: string;
  /** Instability score 0–100 */
  ciiScore: number;
  /** Score components for transparency */
  components: {
    conflictSignals: number;
    protestSignals: number;
    economicStress: number;
    militaryActivity: number;
    cyberThreats: number;
    newsVolume: number;
  };
  /** Floor value — some countries never drop below this */
  floor: number;
  trend: "rising" | "stable" | "falling";
  lastUpdated: number;
}

export interface IntelSignal {
  type: "conflict" | "protest" | "disaster" | "cyber" | "military" | "economic" | "infrastructure";
  severity: ThreatSeverity;
  country: string;
  region?: string;
  lat?: number;
  lon?: number;
  description: string;
  source: string;
  timestamp: number;
}

export interface SignalConvergence {
  country: string;
  region?: string;
  signalTypes: string[];
  signalCount: number;
  maxSeverity: ThreatSeverity;
  description: string;
  detectedAt: number;
}

export type DataSourceStatus = "fresh" | "stale" | "very_stale" | "no_data" | "error" | "disabled";

export interface DataFreshness {
  source: string;
  status: DataSourceStatus;
  lastUpdate: number;
  /** Minutes since last update */
  staleness: number;
}

export interface WorldBrief {
  summary: string;
  topStories: NewsItem[];
  threatLevel: ThreatSeverity;
  activeConvergences: SignalConvergence[];
  generatedAt: number;
}

// ─── v2 Types ────────────────────────────────────────────────────

export interface WarRiskAssessment {
  country: string;
  countryName: string;
  /** 0–100 war risk score */
  score: number;
  /** Confidence in the score (0–1) */
  confidence: number;
  /** Component contributions */
  factors: {
    ciiBase: number;
    signalVelocity: number;
    convergenceCount: number;
    arsenalPosture: number;
    diplomaticBreakdown: number;
  };
  /** Is score accelerating (>10pt gain in 6h)? */
  escalating: boolean;
  /** Narrative summary of confluence */
  summary: string;
  computedAt: number;
}

export interface ArsenalProfile {
  country: string;
  countryName: string;
  /** Nuclear warheads (operational + reserve; 0 if non-nuclear) */
  nuclearWarheads: number;
  /** Active military personnel */
  activeMilitary: number;
  /** Annual defense budget in billion USD */
  defenseBudgetBn: number;
  /** Major conventional systems */
  systems: {
    tanks: number;
    aircraftTotal: number;
    fighterJets: number;
    navalVessels: number;
    submarines: number;
    ballisticMissiles: number;
  };
  /** SIPRI Military Expenditure Rank (1 = highest) */
  expenditureRank: number;
  /** Data vintage year */
  dataYear: number;
  isNuclear: boolean;
}

export interface WarSignalDetection {
  country: string;
  countryName: string;
  /** Which of the 5 factors are active */
  activeFactors: Array<
    | "military_buildup"
    | "economic_stress"
    | "diplomatic_breakdown"
    | "news_volume_spike"
    | "high_cii"
  >;
  factorCount: number;
  /** Risk level given active factors */
  riskLevel: "watch" | "warning" | "critical";
  firstDetectedAt: number;
  lastUpdatedAt: number;
}

export interface EscalationVelocity {
  country: string;
  countryName: string;
  delta1h: number;
  delta6h: number;
  delta24h: number;
  direction: "accelerating" | "stable" | "de-escalating";
}

export interface OsintEvent {
  id: string;
  source: "ISW" | "Airwars" | "ACLED" | "GJSecurity" | "DefenseOne" | "TheRecord";
  title: string;
  link: string;
  country?: string;
  eventType: "airstrike" | "battle" | "protest" | "cyber" | "diplomatic" | "military" | "other";
  severity: ThreatSeverity;
  area?: string;
  publishedAt: number;
}

export interface IntelReport {
  id: string;
  citizenId: string;
  target: string; // country code or topic
  summary: string;
  findings: string[];
  warRiskEstimate: number | null;
  sources: string[];
  generatedAt: number;
}

export interface CIIHistoryEntry {
  ts: number;
  score: number;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (snapshot: WorldIntelSnapshot) => boolean;
  severity: ThreatSeverity;
  message: (snapshot: WorldIntelSnapshot) => string;
  /** Minimum gap between re-alerts (ms) */
  cooldownMs: number;
  lastFiredAt: number;
}

export interface WorldIntelSnapshot {
  ciiScores: Map<string, CountryProfile>;
  warRisks: Map<string, WarRiskAssessment>;
  warSignals: WarSignalDetection[];
  convergences: SignalConvergence[];
  globalThreatLevel: ThreatSeverity;
}

// ─── Configuration ──────────────────────────────────────────────

const RSS_FEEDS: Array<{ url: string; source: string; region: string; tier: number }> = [
  // ═══════════════════════════════════════════════════════════════
  // TIER 1: Wire services — highest trust, primary ground-truth
  // ═══════════════════════════════════════════════════════════════

  {
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    source: "BBC World",
    region: "global",
    tier: 1,
  },
  {
    url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    source: "NYT World",
    region: "global",
    tier: 1,
  },
  {
    url: "https://rsshub.app/apnews/topics/apf-topnews",
    source: "AP News",
    region: "global",
    tier: 1,
  },
  {
    url: "https://feeds.reuters.com/reuters/topNews",
    source: "Reuters",
    region: "global",
    tier: 1,
  },
  {
    url: "https://feeds.reuters.com/reuters/worldNews",
    source: "Reuters World",
    region: "global",
    tier: 1,
  },
  {
    url: "https://www.theguardian.com/world/rss",
    source: "The Guardian",
    region: "global",
    tier: 1,
  },
  { url: "https://theintercept.com/feed/?rss", source: "The Intercept", region: "global", tier: 1 },

  // ═══════════════════════════════════════════════════════════════
  // TIER 2: Major international English-language media
  // ═══════════════════════════════════════════════════════════════

  // UK
  {
    url: "https://feeds.skynews.com/feeds/rss/world.xml",
    source: "Sky News",
    region: "europe",
    tier: 2,
  },
  {
    url: "https://www.independent.co.uk/news/rss",
    source: "The Independent",
    region: "europe",
    tier: 2,
  },
  {
    url: "https://www.telegraph.co.uk/rss.xml",
    source: "The Telegraph",
    region: "europe",
    tier: 2,
  },
  {
    url: "https://feeds.theguardian.com/theguardian/uk-news/rss",
    source: "Guardian UK",
    region: "europe",
    tier: 2,
  },
  {
    url: "https://feeds.bbci.co.uk/news/politics/rss.xml",
    source: "BBC Politics",
    region: "europe",
    tier: 2,
  },
  { url: "https://www.ft.com/rss/home/uk", source: "Financial Times", region: "global", tier: 2 },

  // France (English)
  { url: "https://www.france24.com/en/rss", source: "France24", region: "europe", tier: 2 },
  { url: "https://www.rfi.fr/en/rss", source: "RFI English", region: "global", tier: 2 },
  {
    url: "https://en.lemonde.fr/rss/une.xml",
    source: "Le Monde English",
    region: "europe",
    tier: 2,
  },

  // Germany (English)
  { url: "https://www.dw.com/rss/en/top-stories/s-9097", source: "DW", region: "europe", tier: 2 },
  { url: "https://www.dw.com/rss/en/world/s-1429", source: "DW World", region: "global", tier: 2 },
  {
    url: "https://www.dw.com/rss/en/security/s-63602",
    source: "DW Security",
    region: "global",
    tier: 2,
  },
  {
    url: "https://www.spiegel.de/international/index.rss",
    source: "Der Spiegel Intl",
    region: "europe",
    tier: 2,
  },

  // Japan / Asia-Pacific
  { url: "https://asia.nikkei.com/rss", source: "Nikkei Asia", region: "asia", tier: 2 },
  { url: "https://www.japantimes.co.jp/feed", source: "Japan Times", region: "asia", tier: 2 },
  { url: "https://www3.nhk.or.jp/rss/news/cat6.xml", source: "NHK World", region: "asia", tier: 2 },

  // Middle East (non-state)
  {
    url: "https://www.middleeasteye.net/rss",
    source: "Middle East Eye",
    region: "mideast",
    tier: 2,
  },
  {
    url: "https://english.alarabiya.net/tools/rss",
    source: "Al Arabiya English",
    region: "mideast",
    tier: 2,
  },
  {
    url: "https://www.arabnews.com/taxonomy/term/2/feed",
    source: "Arab News",
    region: "mideast",
    tier: 2,
  },
  { url: "https://www.almonitor.com/rss.xml", source: "Al-Monitor", region: "mideast", tier: 2 },

  // Asia-Pacific general
  { url: "https://www.scmp.com/rss/2/feed", source: "SCMP", region: "asia", tier: 2 },
  {
    url: "https://www.channelnewsasia.com/rssfeeds/8395744",
    source: "CNA",
    region: "asia",
    tier: 2,
  },
  {
    url: "https://www.straitstimes.com/global/rss.xml",
    source: "Straits Times",
    region: "asia",
    tier: 2,
  },
  {
    url: "https://www.thehindu.com/news/international/feeder/default.rss",
    source: "The Hindu Intl",
    region: "asia",
    tier: 2,
  },

  // Latin America / Americas
  { url: "https://en.mercopress.com/rss.xml", source: "MercoPress", region: "latam", tier: 2 },
  {
    url: "https://www.reuters.com/rssfeed/200",
    source: "Reuters Americas",
    region: "latam",
    tier: 2,
  },

  // Africa
  {
    url: "https://allafrica.com/tools/headlines/rdf/africa/headlines.rdf",
    source: "AllAfrica",
    region: "africa",
    tier: 2,
  },
  { url: "https://www.bbc.co.uk/africa/rss.xml", source: "BBC Africa", region: "africa", tier: 2 },

  // ═══════════════════════════════════════════════════════════════
  // TIER 3: State media — important for SIGINT but apply affinity penalty
  // ═══════════════════════════════════════════════════════════════

  // Russia (English-language state/semi-state)
  { url: "https://tass.com/rss/v2.xml", source: "TASS", region: "russia", tier: 3 },
  {
    url: "https://ria.ru/export/rss2/archive/index.xml",
    source: "RIA Novosti",
    region: "russia",
    tier: 3,
  },
  { url: "https://www.rt.com/rss/news/", source: "RT", region: "russia", tier: 3 },
  {
    url: "https://sputnikglobe.com/export/rss2/world/index.xml",
    source: "Sputnik World",
    region: "russia",
    tier: 3,
  },
  { url: "https://www.themoscowtimes.com/rss", source: "Moscow Times", region: "russia", tier: 3 }, // independent Russian, anti-Kremlin
  { url: "https://meduza.io/rss/all", source: "Meduza", region: "russia", tier: 3 }, // exiled independent Russian
  {
    url: "https://www.theintelligencer.com/rss",
    source: "Intelligencer (RU)",
    region: "russia",
    tier: 3,
  },

  // China (English-language state)
  {
    url: "https://www.xinhuanet.com/english/rss/worldrss.xml",
    source: "Xinhua",
    region: "china",
    tier: 3,
  },
  {
    url: "https://www.globaltimes.cn/rss/outbrain.xml",
    source: "Global Times",
    region: "china",
    tier: 3,
  },
  { url: "https://english.cctv.com/RSS/english.xml", source: "CGTN", region: "china", tier: 3 },
  {
    url: "https://www.chinadaily.com.cn/rss/world_rss.xml",
    source: "China Daily",
    region: "china",
    tier: 3,
  },
  { url: "https://www.sixthtone.com/feed", source: "Sixth Tone", region: "china", tier: 3 }, // semi-independent Chinese

  // Israel (English)
  {
    url: "https://www.jpost.com/Rss/RssFeedsHeadlines.aspx",
    source: "Jerusalem Post",
    region: "mideast",
    tier: 3,
  },
  { url: "https://www.haaretz.com/cmlink/1.628765", source: "Haaretz", region: "mideast", tier: 3 },
  {
    url: "https://www.timesofisrael.com/feed/",
    source: "Times of Israel",
    region: "mideast",
    tier: 3,
  },
  {
    url: "https://mfa.gov.il/MFA/PressRoom/rss/Pages/default.aspx",
    source: "Israeli MFA",
    region: "mideast",
    tier: 3,
  }, // official Israeli MFA

  // Iran (English)
  {
    url: "https://www.presstv.ir/rssfeed/en/1/world.rss",
    source: "PressTV",
    region: "mideast",
    tier: 3,
  }, // state media
  { url: "https://en.mehrnews.com/rss", source: "Mehr News", region: "mideast", tier: 3 }, // semi-official
  { url: "https://tehrantimes.com/rss.xml", source: "Tehran Times", region: "mideast", tier: 3 }, // state-aligned
  { url: "https://www.irna.ir/en/rss.xml", source: "IRNA", region: "mideast", tier: 3 }, // official Islamic Republic News

  // Turkey (English)
  {
    url: "https://www.hurriyetdailynews.com/rss.aspx",
    source: "Hurriyet Daily News",
    region: "mideast",
    tier: 3,
  },
  {
    url: "https://www.aa.com.tr/en/rss/default?cat=world",
    source: "Anadolu Agency",
    region: "mideast",
    tier: 3,
  }, // Turkish state wire
  {
    url: "https://www.dailysabah.com/feeds/rss/world",
    source: "Daily Sabah",
    region: "mideast",
    tier: 3,
  },

  // India / Pakistan
  {
    url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    source: "Times of India",
    region: "asia",
    tier: 3,
  },
  {
    url: "https://www.dawn.com/feeds/latest-news",
    source: "Dawn (Pakistan)",
    region: "asia",
    tier: 3,
  },
  { url: "https://www.ndtv.com/rss/feeds/2070", source: "NDTV World", region: "asia", tier: 3 },

  // Gulf
  {
    url: "https://www.thenationalnews.com/rss.xml",
    source: "The National (UAE)",
    region: "mideast",
    tier: 3,
  },
  { url: "https://gulfnews.com/rss", source: "Gulf News", region: "mideast", tier: 3 },
  {
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    source: "Al Jazeera English",
    region: "mideast",
    tier: 3,
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER 4: Specialty / OSINT-adjacent / Defense
  // ═══════════════════════════════════════════════════════════════

  { url: "https://www.defenseone.com/rss/", source: "Defense One", region: "global", tier: 4 },
  { url: "https://therecord.media/feed", source: "The Record (Cyber)", region: "global", tier: 4 },
  { url: "https://understandingwar.org/rss.xml", source: "ISW", region: "global", tier: 4 },
  {
    url: "https://gjia.georgetown.edu/feed/",
    source: "Georgetown Security",
    region: "global",
    tier: 4,
  },
  { url: "https://www.defensenews.com/rss/", source: "Defense News", region: "global", tier: 4 },
  { url: "https://www.janes.com/feeds/news", source: "Janes", region: "global", tier: 4 },
  {
    url: "https://www.armyrecognition.com/rss.xml",
    source: "Army Recognition",
    region: "global",
    tier: 4,
  },
  { url: "https://www.bellingcat.com/feed/", source: "Bellingcat", region: "global", tier: 4 }, // OSINT collective
  { url: "https://www.sipri.org/feed", source: "SIPRI", region: "global", tier: 4 }, // arms/security research
  { url: "https://foreignpolicy.com/feed/", source: "Foreign Policy", region: "global", tier: 4 },
  {
    url: "https://www.economist.com/international/rss.xml",
    source: "The Economist",
    region: "global",
    tier: 4,
  },
  {
    url: "https://www.foreignaffairs.com/rss.xml",
    source: "Foreign Affairs",
    region: "global",
    tier: 4,
  },
  { url: "https://www.crisisgroup.org/rss.xml", source: "ICG", region: "global", tier: 4 }, // International Crisis Group
  { url: "https://warontherocks.com/feed/", source: "War on the Rocks", region: "global", tier: 4 },
  {
    url: "https://www.kyivindependent.com/feed/",
    source: "Kyiv Independent",
    region: "europe",
    tier: 4,
  },
  {
    url: "https://english.nv.ua/rss.html",
    source: "Ukrainska Pravda EN",
    region: "europe",
    tier: 4,
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER 5: Official government / institution feeds
  // ═══════════════════════════════════════════════════════════════

  {
    url: "https://www.un.org/cyberschoolbus/rss/rss.asp",
    source: "UN News",
    region: "global",
    tier: 5,
  },
  {
    url: "https://www.nato.int/nato_static_fl2014/assets/rss/news.xml",
    source: "NATO",
    region: "global",
    tier: 5,
  },
  {
    url: "https://www.state.gov/rss-feeds/press-releases/",
    source: "US State Dept",
    region: "global",
    tier: 5,
  },
  { url: "https://www.usnews.com/rss/news", source: "US News", region: "global", tier: 5 },
  {
    url: "https://www.whitehouse.gov/feed/press-releases/",
    source: "White House",
    region: "global",
    tier: 5,
  },
  {
    url: "https://www.gov.uk/search/news-and-communications.atom",
    source: "UK Gov",
    region: "europe",
    tier: 5,
  },
  { url: "https://www.mod.uk/rss.xml", source: "UK MOD", region: "europe", tier: 5 },
  { url: "https://www.europa.eu/rapid/rss.xml", source: "EU Press", region: "europe", tier: 5 },
  {
    url: "https://www.iaea.org/newscenter/pressreleases/feed",
    source: "IAEA",
    region: "global",
    tier: 5,
  },
  { url: "https://www.icrc.org/en/rss.xml", source: "ICRC", region: "global", tier: 5 }, // Red Cross conflict reports
  { url: "https://www.unhcr.org/rss/news.xml", source: "UNHCR", region: "global", tier: 5 }, // refugee crisis = conflict correlate
];

const RSS_POLL_MASTER_TICK_MS = 5 * 60_000; // master scheduler tick (every 5 min)
const CII_UPDATE_INTERVAL_MS = 10 * 60_000; // 10 minutes
const RETENTION_GC_INTERVAL_MS = 30 * 60_000; // run retention GC every 30 min
const MAX_NEWS_CACHE = 1000; // expanded; GC handles actual memory budget
const MAX_SIGNALS = 500;
const MAX_DEDUP_PER_POLL = 100;
const CONVERGENCE_WINDOW_MS = 6 * 60 * 60_000; // 6 hours
/** Consecutive network failures before a feed is skipped for one poll cycle */
const FEED_SKIP_AFTER_FAILURES = 3;

/**
 * Per-source fetch interval derived from trust score + tier.
 * trustScore thresholds:  > 0.75 → 5 min (Tier 1/2 wires)
 *                         > 0.60 → 15 min (Tier 2 regional)
 *                         > 0.50 → 30 min (Tier 3 semi-trustworthy state/independent)
 *                         ≤ 0.50 → 60 min (low-trust state propaganda, slow official bodies)
 * On-demand fetch is always possible regardless of schedule.
 */
function sourcePollIntervalMs(sourceId: string): number {
  const { getSourceProfile } =
    require("../intelligence/source-registry.js") as typeof import("../intelligence/source-registry.js");
  const profile = getSourceProfile(sourceId);
  const trust = profile?.trustScore ?? 0.5;
  if (trust > 0.75) {
    return 5 * 60_000;
  } // Tier 1-2 wires
  if (trust > 0.6) {
    return 15 * 60_000;
  } // Tier 2 regional/specialty
  if (trust > 0.5) {
    return 30 * 60_000;
  } // Tier 3 mid-trust
  return 60 * 60_000; // state propaganda / slow bodies
}

/** Per-feed: timestamp of last successful fetch */
const _feedLastFetched = new Map<string, number>();

/** Per-feed consecutive failure counter (resets on success) */
const _feedFailures = new Map<string, number>();
/** Feeds currently skipped (reset each poll cycle start) */
const _feedSkippedThisCycle = new Set<string>();

// ─── Adaptive Data Retention / Lite Snapshots ────────────────────

/**
 * NewsLiteSnapshot — compressed record kept after a full NewsItem expires.
 * Preserves signal value (country, severity, source, CII contribution)
 * without retaining the full title/link text.
 */
export interface NewsLiteSnapshot {
  country?: string;
  severity?: ThreatSeverity;
  category?: ThreatCategory;
  source: string;
  publishedAt: number;
  /** True = the source had trust ≥ 0.65 when this item was published */
  highTrust: boolean;
  /** One of: conflict/military/cyber/economic/general */
  signalType: string;
}

/** Ring buffer of lite snapshots — max 2000, survives full-cache GC */
const liteSnapshots: NewsLiteSnapshot[] = [];
const MAX_LITE_SNAPSHOTS = 2_000;

function takeLiteSnapshot(item: NewsItem, trustScore: number): void {
  if (!item.country && !item.threat) {
    return;
  } // nothing useful to compress
  const snap: NewsLiteSnapshot = {
    country: item.country,
    severity: item.threat?.severity,
    category: item.threat?.category,
    source: item.source,
    publishedAt: item.publishedAt,
    highTrust: trustScore >= 0.65,
    signalType: item.threat ? mapCategoryToSignalType(item.threat.category) : "general",
  };
  liteSnapshots.unshift(snap);
  if (liteSnapshots.length > MAX_LITE_SNAPSHOTS) {
    liteSnapshots.length = MAX_LITE_SNAPSHOTS;
  }
}

/**
 * Calculate the TTL for a news item based on source trust score.
 *
 * Formula:
 *   trust ≥ 0.80  → keep 7 days  (Reuters, AP — gold standard)
 *   trust ≥ 0.65  → keep 48h
 *   trust ≥ 0.50  → keep 24h     (mid-trust regional)
 *   trust ≥ 0.35  → keep 12h     (semi-trustworthy state media)
 *   trust <  0.35 → keep  6h     (RT, Global Times, PressTV, etc.)
 *
 * Verified NIE items get +50% bonus on TTL (important ground truth).
 */
function computeItemTtlMs(trustScore: number, isVerifiedIntel = false): number {
  let base: number;
  if (trustScore >= 0.8) {
    base = 7 * 24 * 60 * 60_000;
  } else if (trustScore >= 0.65) {
    base = 48 * 60 * 60_000;
  } else if (trustScore >= 0.5) {
    base = 24 * 60 * 60_000;
  } else if (trustScore >= 0.35) {
    base = 12 * 60 * 60_000;
  } else {
    base = 6 * 60 * 60_000;
  }
  return isVerifiedIntel ? Math.round(base * 1.5) : base;
}

/**
 * Per-feed TTL lookup — called at item creation.
 * Falls back to 0.5 (24h) if registry not loaded yet.
 */
function getSourceTrust(sourceId: string): number {
  try {
    const { getSourceProfile } =
      require("../intelligence/source-registry.js") as typeof import("../intelligence/source-registry.js");
    return getSourceProfile(sourceId)?.trustScore ?? 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Retention GC — runs every 30 minutes.
 * 1. Expires old NewsItems (creates lite snapshot before removal)
 * 2. Trims oversized liteSnapshot ring buffer
 * 3. Removes stale signals outside the 6h window (already done in pollAllFeeds, but also here)
 */
function runRetentionGC(): void {
  const now = Date.now();
  let evicted = 0;

  // Walk backwards (oldest first) and evict expired items
  for (let i = newsCache.length - 1; i >= 0; i--) {
    const item = newsCache[i];
    if (!item) {
      continue;
    }
    const trust = getSourceTrust(item.source);
    const ttl = computeItemTtlMs(trust);
    if (now - item.publishedAt > ttl) {
      // Compress to lite snapshot before removing
      takeLiteSnapshot(item, trust);
      newsCache.splice(i, 1);
      evicted++;
    }
  }

  // Trim old signals outside CII window
  const cutoff6h = now - CONVERGENCE_WINDOW_MS;
  const before = signals.length;
  while (signals.length > 0 && (signals[0]?.timestamp ?? 0) < cutoff6h) {
    signals.shift();
  }
  const prunedSignals = before - signals.length;

  if (evicted > 0 || prunedSignals > 0) {
    console.log(
      `[WorldIntel/GC] Evicted ${evicted} items → ${liteSnapshots.length} snaps; removed ${prunedSignals} old signals`,
    );
  }
}

/** Get lite snapshots (optionally filtered by country) */
export function getLiteSnapshots(params?: {
  country?: string;
  limit?: number;
}): NewsLiteSnapshot[] {
  let snaps = [...liteSnapshots];
  if (params?.country) {
    snaps = snaps.filter((s) => s.country === params.country);
  }
  return snaps.slice(0, params?.limit ?? 200);
}

// ─── Threat Keyword Database ────────────────────────────────────
// Ported from WorldMonitor's ~120 keyword patterns, 14 categories, 5 severity tiers

interface KeywordRule {
  pattern: RegExp;
  severity: ThreatSeverity;
  category: ThreatCategory;
  confidence: number;
}

const THREAT_KEYWORDS: KeywordRule[] = [
  // ═══ Critical ═══
  {
    pattern: /\bnuclear\s+(strike|attack|launch|weapon)/i,
    severity: "critical",
    category: "military",
    confidence: 0.95,
  },
  {
    pattern: /\bchemical\s+(attack|weapon|strike)/i,
    severity: "critical",
    category: "military",
    confidence: 0.95,
  },
  {
    pattern: /\bmassive\s+explosion/i,
    severity: "critical",
    category: "disaster",
    confidence: 0.9,
  },
  {
    pattern: /\bterrorist\s+attack/i,
    severity: "critical",
    category: "terrorism",
    confidence: 0.9,
  },
  { pattern: /\binvasion\b/i, severity: "critical", category: "conflict", confidence: 0.85 },
  { pattern: /\bgenocide\b/i, severity: "critical", category: "conflict", confidence: 0.95 },
  {
    pattern: /\bcoup\s+(attempt|d['']état)/i,
    severity: "critical",
    category: "conflict",
    confidence: 0.9,
  },
  { pattern: /\bmartial\s+law/i, severity: "critical", category: "military", confidence: 0.9 },

  // ═══ High ═══
  {
    pattern: /\bwar\b(?!ning|rant|den|ner)/i,
    severity: "high",
    category: "conflict",
    confidence: 0.8,
  },
  { pattern: /\bairstrikes?\b/i, severity: "high", category: "military", confidence: 0.85 },
  { pattern: /\bbombing\b/i, severity: "high", category: "conflict", confidence: 0.85 },
  { pattern: /\bassassination\b/i, severity: "high", category: "conflict", confidence: 0.9 },
  { pattern: /\bethnic\s+cleansing/i, severity: "high", category: "conflict", confidence: 0.95 },
  { pattern: /\bsanctions?\b/i, severity: "high", category: "diplomatic", confidence: 0.7 },
  { pattern: /\bembargo\b/i, severity: "high", category: "economic", confidence: 0.75 },
  {
    pattern: /\bmissile\s+(launch|strike|test)/i,
    severity: "high",
    category: "military",
    confidence: 0.9,
  },
  { pattern: /\bcyberattack\b/i, severity: "high", category: "cyber", confidence: 0.85 },
  { pattern: /\bransomware\b/i, severity: "high", category: "cyber", confidence: 0.85 },
  { pattern: /\bpandemic\b/i, severity: "high", category: "health", confidence: 0.8 },
  { pattern: /\bearthquake\b/i, severity: "high", category: "disaster", confidence: 0.75 },
  { pattern: /\btsunami\b/i, severity: "high", category: "disaster", confidence: 0.9 },
  {
    pattern: /\bhurricane|typhoon|cyclone/i,
    severity: "high",
    category: "disaster",
    confidence: 0.8,
  },
  { pattern: /\bmass\s+shooting/i, severity: "high", category: "crime", confidence: 0.9 },
  {
    pattern: /\bprotests?\s+turn(ed)?\s+violent/i,
    severity: "high",
    category: "protest",
    confidence: 0.85,
  },
  {
    pattern: /\bmilitary\s+(buildup|deployment|offensive)/i,
    severity: "high",
    category: "military",
    confidence: 0.8,
  },

  // ═══ Medium ═══
  { pattern: /\bprotest(s|ers|ing)?\b/i, severity: "medium", category: "protest", confidence: 0.7 },
  { pattern: /\bunrest\b/i, severity: "medium", category: "protest", confidence: 0.7 },
  { pattern: /\briot(s|ing)?\b/i, severity: "medium", category: "protest", confidence: 0.8 },
  { pattern: /\bceasefire\b/i, severity: "medium", category: "diplomatic", confidence: 0.6 },
  { pattern: /\bnegotiations?\b/i, severity: "medium", category: "diplomatic", confidence: 0.5 },
  { pattern: /\bdata\s+breach/i, severity: "medium", category: "cyber", confidence: 0.8 },
  { pattern: /\bmalware\b/i, severity: "medium", category: "cyber", confidence: 0.75 },
  { pattern: /\bphishing\b/i, severity: "medium", category: "cyber", confidence: 0.7 },
  { pattern: /\bflood(s|ing)?\b/i, severity: "medium", category: "disaster", confidence: 0.65 },
  { pattern: /\bwildfire/i, severity: "medium", category: "disaster", confidence: 0.7 },
  { pattern: /\bfamine\b/i, severity: "medium", category: "disaster", confidence: 0.8 },
  { pattern: /\brecession\b/i, severity: "medium", category: "economic", confidence: 0.7 },
  { pattern: /\bdefault\s+on\s+debt/i, severity: "medium", category: "economic", confidence: 0.8 },
  {
    pattern: /\bcurrency\s+(crash|collapse|crisis)/i,
    severity: "medium",
    category: "economic",
    confidence: 0.85,
  },
  {
    pattern: /\binfrastructure\s+(failure|collapse|attack)/i,
    severity: "medium",
    category: "infrastructure",
    confidence: 0.75,
  },
  {
    pattern: /\bpower\s+(outage|grid|blackout)/i,
    severity: "medium",
    category: "infrastructure",
    confidence: 0.7,
  },
  { pattern: /\bepidemic\b/i, severity: "medium", category: "health", confidence: 0.75 },
  { pattern: /\boutbreak\b/i, severity: "medium", category: "health", confidence: 0.6 },
  { pattern: /\btrade\s+war/i, severity: "medium", category: "economic", confidence: 0.7 },
  {
    pattern: /\barms\s+(deal|sale|race)/i,
    severity: "medium",
    category: "military",
    confidence: 0.65,
  },

  // ═══ Low ═══
  { pattern: /\belection\b/i, severity: "low", category: "diplomatic", confidence: 0.5 },
  { pattern: /\btreaty\b/i, severity: "low", category: "diplomatic", confidence: 0.5 },
  { pattern: /\bsummit\b/i, severity: "low", category: "diplomatic", confidence: 0.4 },
  { pattern: /\bdeportation/i, severity: "low", category: "diplomatic", confidence: 0.5 },
  { pattern: /\brefugee(s)?\b/i, severity: "low", category: "general", confidence: 0.5 },
  {
    pattern: /\bmigration\s+(crisis|surge)/i,
    severity: "low",
    category: "general",
    confidence: 0.55,
  },
  {
    pattern: /\bclimate\s+(change|crisis)/i,
    severity: "low",
    category: "environmental",
    confidence: 0.5,
  },
  { pattern: /\bdrought\b/i, severity: "low", category: "environmental", confidence: 0.6 },
  { pattern: /\bdeforestation/i, severity: "low", category: "environmental", confidence: 0.55 },
  {
    pattern: /\bstock\s+(crash|plunge|tumble)/i,
    severity: "low",
    category: "economic",
    confidence: 0.6,
  },
  { pattern: /\binflation\b/i, severity: "low", category: "economic", confidence: 0.45 },

  // ═══ Info ═══
  {
    pattern: /\bAI\s+(regulation|policy|governance)/i,
    severity: "info",
    category: "tech",
    confidence: 0.4,
  },
  { pattern: /\bcybersecurity/i, severity: "info", category: "cyber", confidence: 0.4 },
  { pattern: /\bspace\s+(launch|mission)/i, severity: "info", category: "tech", confidence: 0.35 },
  {
    pattern: /\bUN\s+(resolution|vote|assembly)/i,
    severity: "info",
    category: "diplomatic",
    confidence: 0.4,
  },
];

// ─── CII: Country Instability Index ────────────────────────────

interface MonitoredCountry {
  code: string;
  name: string;
  /** Minimum CII floor — active conflicts never score below this */
  floor: number;
  /** Aliases for matching in headlines */
  aliases: string[];
}

const MONITORED_COUNTRIES: MonitoredCountry[] = [
  {
    code: "US",
    name: "United States",
    floor: 5,
    aliases: ["america", "u.s.", "usa", "washington", "pentagon", "white house"],
  },
  { code: "RU", name: "Russia", floor: 30, aliases: ["moscow", "kremlin", "putin", "russian"] },
  { code: "CN", name: "China", floor: 10, aliases: ["beijing", "chinese", "xi jinping", "prc"] },
  {
    code: "UA",
    name: "Ukraine",
    floor: 55,
    aliases: ["kyiv", "kiev", "ukrainian", "zelensky", "zelenskyy"],
  },
  {
    code: "IR",
    name: "Iran",
    floor: 35,
    aliases: ["tehran", "iranian", "khamenei", "persian gulf"],
  },
  {
    code: "IL",
    name: "Israel",
    floor: 30,
    aliases: ["jerusalem", "israeli", "netanyahu", "tel aviv", "idf"],
  },
  { code: "TW", name: "Taiwan", floor: 15, aliases: ["taipei", "taiwanese", "strait"] },
  { code: "KP", name: "North Korea", floor: 40, aliases: ["pyongyang", "dprk", "kim jong un"] },
  { code: "SA", name: "Saudi Arabia", floor: 10, aliases: ["riyadh", "saudi", "mbs"] },
  { code: "TR", name: "Turkey", floor: 15, aliases: ["ankara", "turkish", "erdogan", "istanbul"] },
  { code: "PL", name: "Poland", floor: 5, aliases: ["warsaw", "polish"] },
  { code: "DE", name: "Germany", floor: 5, aliases: ["berlin", "german", "bundestag"] },
  { code: "FR", name: "France", floor: 5, aliases: ["paris", "french", "macron", "élysée"] },
  {
    code: "GB",
    name: "United Kingdom",
    floor: 5,
    aliases: ["london", "british", "uk", "downing street"],
  },
  { code: "IN", name: "India", floor: 10, aliases: ["delhi", "indian", "modi", "mumbai"] },
  { code: "PK", name: "Pakistan", floor: 20, aliases: ["islamabad", "pakistani", "karachi"] },
  { code: "SY", name: "Syria", floor: 50, aliases: ["damascus", "syrian", "assad"] },
  { code: "YE", name: "Yemen", floor: 45, aliases: ["sanaa", "yemeni", "houthi"] },
  {
    code: "MM",
    name: "Myanmar",
    floor: 40,
    aliases: ["burma", "burmese", "myanmar military", "naypyidaw"],
  },
  { code: "VE", name: "Venezuela", floor: 25, aliases: ["caracas", "venezuelan", "maduro"] },
  { code: "BR", name: "Brazil", floor: 5, aliases: ["brasilia", "brazilian", "são paulo"] },
  { code: "AE", name: "UAE", floor: 5, aliases: ["dubai", "abu dhabi", "emirati"] },
];

// \u2500\u2500\u2500 Arsenal Database (SIPRI / IISS open-data snapshot 2024) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const ARSENAL_DB: ArsenalProfile[] = [
  {
    country: "US",
    countryName: "United States",
    nuclearWarheads: 5550,
    activeMilitary: 1390000,
    defenseBudgetBn: 858,
    systems: {
      tanks: 6645,
      aircraftTotal: 13300,
      fighterJets: 1957,
      navalVessels: 484,
      submarines: 68,
      ballisticMissiles: 800,
    },
    expenditureRank: 1,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "CN",
    countryName: "China",
    nuclearWarheads: 500,
    activeMilitary: 2035000,
    defenseBudgetBn: 225,
    systems: {
      tanks: 5000,
      aircraftTotal: 3285,
      fighterJets: 1571,
      navalVessels: 730,
      submarines: 79,
      ballisticMissiles: 1200,
    },
    expenditureRank: 2,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "RU",
    countryName: "Russia",
    nuclearWarheads: 6257,
    activeMilitary: 1320000,
    defenseBudgetBn: 109,
    systems: {
      tanks: 3330,
      aircraftTotal: 4173,
      fighterJets: 772,
      navalVessels: 605,
      submarines: 64,
      ballisticMissiles: 1800,
    },
    expenditureRank: 3,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "IN",
    countryName: "India",
    nuclearWarheads: 172,
    activeMilitary: 1455550,
    defenseBudgetBn: 83,
    systems: {
      tanks: 4614,
      aircraftTotal: 2182,
      fighterJets: 572,
      navalVessels: 295,
      submarines: 18,
      ballisticMissiles: 140,
    },
    expenditureRank: 4,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "SA",
    countryName: "Saudi Arabia",
    nuclearWarheads: 0,
    activeMilitary: 257000,
    defenseBudgetBn: 75,
    systems: {
      tanks: 1062,
      aircraftTotal: 893,
      fighterJets: 218,
      navalVessels: 55,
      submarines: 0,
      ballisticMissiles: 60,
    },
    expenditureRank: 5,
    dataYear: 2024,
    isNuclear: false,
  },
  {
    country: "GB",
    countryName: "United Kingdom",
    nuclearWarheads: 225,
    activeMilitary: 153000,
    defenseBudgetBn: 74,
    systems: {
      tanks: 227,
      aircraftTotal: 733,
      fighterJets: 119,
      navalVessels: 75,
      submarines: 11,
      ballisticMissiles: 48,
    },
    expenditureRank: 6,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "DE",
    countryName: "Germany",
    nuclearWarheads: 0,
    activeMilitary: 183638,
    defenseBudgetBn: 67,
    systems: {
      tanks: 321,
      aircraftTotal: 614,
      fighterJets: 129,
      navalVessels: 65,
      submarines: 6,
      ballisticMissiles: 0,
    },
    expenditureRank: 7,
    dataYear: 2024,
    isNuclear: false,
  },
  {
    country: "FR",
    countryName: "France",
    nuclearWarheads: 290,
    activeMilitary: 203250,
    defenseBudgetBn: 61,
    systems: {
      tanks: 222,
      aircraftTotal: 1055,
      fighterJets: 254,
      navalVessels: 180,
      submarines: 8,
      ballisticMissiles: 48,
    },
    expenditureRank: 8,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "UA",
    countryName: "Ukraine",
    nuclearWarheads: 0,
    activeMilitary: 900000,
    defenseBudgetBn: 44,
    systems: {
      tanks: 2596,
      aircraftTotal: 321,
      fighterJets: 43,
      navalVessels: 38,
      submarines: 1,
      ballisticMissiles: 0,
    },
    expenditureRank: 11,
    dataYear: 2024,
    isNuclear: false,
  },
  {
    country: "IL",
    countryName: "Israel",
    nuclearWarheads: 90,
    activeMilitary: 169500,
    defenseBudgetBn: 27,
    systems: {
      tanks: 1370,
      aircraftTotal: 601,
      fighterJets: 241,
      navalVessels: 65,
      submarines: 5,
      ballisticMissiles: 50,
    },
    expenditureRank: 15,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "KP",
    countryName: "North Korea",
    nuclearWarheads: 40,
    activeMilitary: 1280000,
    defenseBudgetBn: 4,
    systems: {
      tanks: 6645,
      aircraftTotal: 940,
      fighterJets: 458,
      navalVessels: 492,
      submarines: 73,
      ballisticMissiles: 300,
    },
    expenditureRank: 25,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "IR",
    countryName: "Iran",
    nuclearWarheads: 0,
    activeMilitary: 610000,
    defenseBudgetBn: 10,
    systems: {
      tanks: 1996,
      aircraftTotal: 551,
      fighterJets: 186,
      navalVessels: 398,
      submarines: 19,
      ballisticMissiles: 3000,
    },
    expenditureRank: 18,
    dataYear: 2024,
    isNuclear: false,
  },
  {
    country: "PK",
    countryName: "Pakistan",
    nuclearWarheads: 170,
    activeMilitary: 654000,
    defenseBudgetBn: 10,
    systems: {
      tanks: 2627,
      aircraftTotal: 1372,
      fighterJets: 328,
      navalVessels: 114,
      submarines: 8,
      ballisticMissiles: 140,
    },
    expenditureRank: 20,
    dataYear: 2024,
    isNuclear: true,
  },
  {
    country: "TR",
    countryName: "Turkey",
    nuclearWarheads: 0,
    activeMilitary: 355200,
    defenseBudgetBn: 41,
    systems: {
      tanks: 2700,
      aircraftTotal: 1057,
      fighterJets: 245,
      navalVessels: 194,
      submarines: 12,
      ballisticMissiles: 0,
    },
    expenditureRank: 9,
    dataYear: 2024,
    isNuclear: false,
  },
  {
    country: "AE",
    countryName: "UAE",
    nuclearWarheads: 0,
    activeMilitary: 63000,
    defenseBudgetBn: 23,
    systems: {
      tanks: 545,
      aircraftTotal: 578,
      fighterJets: 139,
      navalVessels: 75,
      submarines: 0,
      ballisticMissiles: 0,
    },
    expenditureRank: 16,
    dataYear: 2024,
    isNuclear: false,
  },
];

// Index for O(1) lookups
const ARSENAL_INDEX = new Map<string, ArsenalProfile>(ARSENAL_DB.map((a) => [a.country, a]));

// \u2500\u2500\u2500 Module State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const newsCache: NewsItem[] = [];
const signals: IntelSignal[] = [];
const countryProfiles = new Map<string, CountryProfile>();
const dataFreshness = new Map<string, DataFreshness>();
// v2 state
const warRisks = new Map<string, WarRiskAssessment>();
const warSignalsActive: WarSignalDetection[] = [];
const escalationVelocities = new Map<string, EscalationVelocity>();
const osintEvents: OsintEvent[] = [];
const intelReports: IntelReport[] = [];
/** CII score history — last 24 entries (each = 1 CII update cycle ~10m) */
const ciiHistory = new Map<string, CIIHistoryEntry[]>();
let intelReportIdCounter = 0;
let _osintEventIdCounter = 0;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let ciiTimer: ReturnType<typeof setInterval> | null = null;
let newsIdCounter = 0;

// \u2500\u2500\u2500 v2: War Risk ML Engine (\u03c3-logistic on weighted CII components) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Compute war-risk score [0–100] for a country using a logistic model:
 *   z = w1*cii_norm + w2*signal_velocity + w3*convergence_n + w4*arsenal + w5*diplomatic
 *   risk = 100 / (1 + exp(-z + 2.5))  (sigmoid centred at 0.5)
 */
export function computeWarRisk(code: string): WarRiskAssessment | null {
  const profile = countryProfiles.get(code);
  const country = MONITORED_COUNTRIES.find((c) => c.code === code);
  if (!profile || !country) {
    return null;
  }

  const now = Date.now();
  const h6 = 6 * 60 * 60_000;
  const recentSigs = signals.filter((s) => s.country === code && s.timestamp > now - h6);

  // Factor 1: CII normalised [0–1]
  const ciiNorm = profile.ciiScore / 100;

  // Factor 2: signal velocity = signals per hour in recent 6h window
  const signalVelocity = Math.min(1, recentSigs.length / 20);

  // Factor 3: convergence presence [0–1]
  const convs = detectConvergences().filter((c) => c.country === code).length;
  const convergenceFactor = Math.min(1, convs / 3);

  // Factor 4: arsenal posture — nuclear state with high military + high CII gets boost
  const arsenal = ARSENAL_INDEX.get(code);
  const arsenalFactor = arsenal
    ? Math.min(1, (arsenal.isNuclear ? 0.3 : 0) + (arsenal.activeMilitary > 500_000 ? 0.2 : 0.1))
    : 0;

  // Factor 5: diplomatic breakdown — look for diplomatic signals in recent news
  const dipSigs = recentSigs.filter((s) => s.type === "conflict").length;
  const diplomaticFactor = Math.min(1, dipSigs / 5);

  // Weighted sum → logistic transform
  const z =
    3.0 * ciiNorm +
    2.5 * signalVelocity +
    2.0 * convergenceFactor +
    1.5 * arsenalFactor +
    1.0 * diplomaticFactor;
  const sigmoid = 1 / (1 + Math.exp(-(z - 3.0)));
  const score = Math.round(sigmoid * 100);

  // Confidence = data richness
  const confidence = Math.min(1, 0.4 + recentSigs.length * 0.05 + (arsenal ? 0.2 : 0));

  // Escalating = 6h CII delta > 10
  const history = ciiHistory.get(code) ?? [];
  const older = history.findLast((h) => h.ts < now - h6);
  const escalating = older ? profile.ciiScore - older.score > 10 : false;

  // Summary narrative
  const factors: string[] = [];
  if (ciiNorm > 0.5) {
    factors.push(`CII ${profile.ciiScore}`);
  }
  if (recentSigs.length > 5) {
    factors.push(`${recentSigs.length} signals/6h`);
  }
  if (convs > 0) {
    factors.push(`${convs} convergence(s)`);
  }
  if (arsenal?.isNuclear) {
    factors.push("nuclear state");
  }
  const summary =
    factors.length > 0
      ? `War risk ${score}% — ${factors.join(", ")}`
      : `War risk ${score}% — limited signal data`;

  return {
    country: code,
    countryName: country.name,
    score,
    confidence,
    factors: {
      ciiBase: Math.round(ciiNorm * 100),
      signalVelocity: Math.round(signalVelocity * 100),
      convergenceCount: convs,
      arsenalPosture: Math.round(arsenalFactor * 100),
      diplomaticBreakdown: Math.round(diplomaticFactor * 100),
    },
    escalating,
    summary,
    computedAt: now,
  };
}

/**
 * Detect active war signals — a country triggers a war signal when ≥3 of 5 factors are true.
 */
export function detectWarSignals(): WarSignalDetection[] {
  const now = Date.now();
  const h6 = 6 * 60 * 60_000;
  const detected: WarSignalDetection[] = [];

  for (const country of MONITORED_COUNTRIES) {
    const profile = countryProfiles.get(country.code);
    if (!profile) {
      continue;
    }

    const recentSigs = signals.filter((s) => s.country === country.code && s.timestamp > now - h6);
    const activeFactors: WarSignalDetection["activeFactors"] = [];

    // Factor checks
    if (recentSigs.filter((s) => s.type === "military").length >= 2) {
      activeFactors.push("military_buildup");
    }
    if (recentSigs.filter((s) => s.type === "economic").length >= 2) {
      activeFactors.push("economic_stress");
    }
    const diplomacySigs = recentSigs.filter((_s) => {
      return newsCache.some(
        (n) =>
          n.country === country.code &&
          n.threat?.category === "diplomatic" &&
          n.publishedAt > now - h6,
      );
    });
    if (diplomacySigs.length >= 1) {
      activeFactors.push("diplomatic_breakdown");
    }

    const newsVol = newsCache.filter(
      (n) => n.country === country.code && n.publishedAt > now - h6,
    ).length;
    if (newsVol >= 10) {
      activeFactors.push("news_volume_spike");
    }

    if (profile.ciiScore >= 55) {
      activeFactors.push("high_cii");
    }

    const factorCount = activeFactors.length;
    if (factorCount < 2) {
      continue;
    }

    const existing = warSignalsActive.find((w) => w.country === country.code);
    const riskLevel: WarSignalDetection["riskLevel"] =
      factorCount >= 4 ? "critical" : factorCount >= 3 ? "warning" : "watch";

    detected.push({
      country: country.code,
      countryName: country.name,
      activeFactors,
      factorCount,
      riskLevel,
      firstDetectedAt: existing?.firstDetectedAt ?? now,
      lastUpdatedAt: now,
    });
  }

  // Replace global store
  warSignalsActive.length = 0;
  warSignalsActive.push(...detected.toSorted((a, b) => b.factorCount - a.factorCount));
  return warSignalsActive;
}

/**
 * Compute CII escalation velocity for all monitored countries.
 */
export function computeEscalationVelocities(): void {
  const now = Date.now();
  const h1 = 60 * 60_000;
  const h6 = 6 * 60 * 60_000;
  const h24 = 24 * 60 * 60_000;

  for (const country of MONITORED_COUNTRIES) {
    const profile = countryProfiles.get(country.code);
    // oxlint-disable-next-line curly
    if (!profile) continue;

    const history = ciiHistory.get(country.code) ?? [];
    const current = profile.ciiScore;

    const at1h = history.findLast((h) => h.ts < now - h1)?.score ?? current;
    const at6h = history.findLast((h) => h.ts < now - h6)?.score ?? current;
    const at24h = history.findLast((h) => h.ts < now - h24)?.score ?? current;

    const delta1h = current - at1h;
    const delta6h = current - at6h;
    const delta24h = current - at24h;

    const direction = delta6h > 8 ? "accelerating" : delta6h < -8 ? "de-escalating" : "stable";

    escalationVelocities.set(country.code, {
      country: country.code,
      countryName: country.name,
      delta1h: Math.round(delta1h * 10) / 10,
      delta6h: Math.round(delta6h * 10) / 10,
      delta24h: Math.round(delta24h * 10) / 10,
      direction,
    });
  }
}

// ─── Threat Classification Engine ───────────────────────────────

/**
 * Classify a news headline using keyword patterns.
 * Uses word-boundary regex matching to prevent false positives.
 */
export function classifyThreat(title: string): ThreatClassification | null {
  let bestMatch: ThreatClassification | null = null;
  const matchedKeywords: string[] = [];

  for (const rule of THREAT_KEYWORDS) {
    const match = title.match(rule.pattern);
    if (match) {
      matchedKeywords.push(match[0]);
      // Keep highest severity match
      if (
        !bestMatch ||
        severityRank(rule.severity) > severityRank(bestMatch.severity) ||
        (severityRank(rule.severity) === severityRank(bestMatch.severity) &&
          rule.confidence > bestMatch.confidence)
      ) {
        bestMatch = {
          severity: rule.severity,
          category: rule.category,
          confidence: rule.confidence,
          keywords: matchedKeywords,
          source: "keyword",
        };
      }
    }
  }

  return bestMatch;
}

function severityRank(s: ThreatSeverity): number {
  const ranks: Record<ThreatSeverity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return ranks[s];
}

// ─── Country Detection ──────────────────────────────────────────

/**
 * Detect which monitored country a headline is about.
 * Returns null if no match.
 */
export function detectCountry(title: string): MonitoredCountry | null {
  const lower = title.toLowerCase();
  for (const country of MONITORED_COUNTRIES) {
    if (lower.includes(country.name.toLowerCase())) {
      return country;
    }
    for (const alias of country.aliases) {
      if (lower.includes(alias)) {
        return country;
      }
    }
  }
  return null;
}

// ─── RSS Parsing (minimal XML→items) ────────────────────────────

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
}

/**
 * Ultra-lightweight RSS parser — extracts title, link, pubDate from <item> elements.
 * No external dependencies.
 */
function parseRSSXml(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractTag(block, "guid");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date");

    if (title) {
      items.push({
        title: decodeXmlEntities(title),
        link: link || "",
        pubDate: pubDate ?? undefined,
      });
    }
  }
  return items;
}

function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA: <tag><![CDATA[content]]></tag>
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`,
    "i",
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) {
    return cdataMatch[1].trim();
  }

  // Handle plain text: <tag>content</tag>
  const plainRegex = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i");
  const plainMatch = xml.match(plainRegex);
  return plainMatch ? plainMatch[1].trim() : null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

// ─── RSS Polling ────────────────────────────────────────────────

// Exponential backoff: maps feed.source → next-allowed-fetch timestamp
const _feedBackoffUntil = new Map<string, number>();
// Backoff tier delays in ms (15m, 30m, 60m) indexed by failure count - 1
const BACKOFF_TIERS = [15 * 60_000, 30 * 60_000, 60 * 60_000];

async function fetchFeed(feed: (typeof RSS_FEEDS)[number]): Promise<NewsItem[]> {
  // Skip feeds that have repeatedly failed with connection errors this cycle
  if (_feedSkippedThisCycle.has(feed.source)) {
    return [];
  }

  // Exponential backoff: don't hammer feeds that keep failing
  const backoffUntil = _feedBackoffUntil.get(feed.source) ?? 0;
  if (Date.now() < backoffUntil) {
    return [];
  }

  try {
    const resp = await fetch(feed.url, {
      signal: AbortSignal.timeout(10_000), // 10s — more lenient for slow foreign feeds
      headers: { "User-Agent": "OpenClaw-Republic/1.0 (WorldIntel Module)" },
    });
    if (!resp.ok) {
      updateFreshness(feed.source, "error");
      return [];
    }
    const xml = await resp.text();
    const items = parseRSSXml(xml);

    // Success: reset failure tracking + record last-fetched time for tiered scheduling
    _feedFailures.delete(feed.source);
    _feedBackoffUntil.delete(feed.source);
    _feedLastFetched.set(feed.source, Date.now());
    updateFreshness(feed.source, "fresh");

    return items.map((item) => {
      const country = detectCountry(item.title);
      const threat = classifyThreat(item.title);
      return {
        id: `news-${++newsIdCounter}`,
        title: item.title,
        link: item.link,
        source: feed.source,
        publishedAt: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        threat,
        country: country?.code,
        region: feed.region,
      };
    });
  } catch (err) {
    updateFreshness(feed.source, "error");

    // Track consecutive network-level failures (TypeError: fetch failed = DNS/connect refused)
    const isNetworkError =
      err instanceof TypeError || (err instanceof Error && err.name === "TimeoutError");
    if (isNetworkError) {
      const failures = (_feedFailures.get(feed.source) ?? 0) + 1;
      _feedFailures.set(feed.source, failures);

      // Exponential backoff: schedule next retry with increasing delay
      const tierIdx = Math.min(failures - 1, BACKOFF_TIERS.length - 1);
      const backoffMs = BACKOFF_TIERS[tierIdx];
      _feedBackoffUntil.set(feed.source, Date.now() + backoffMs);

      if (failures >= FEED_SKIP_AFTER_FAILURES) {
        // Skip this feed for the remainder of this poll cycle; log once
        _feedSkippedThisCycle.add(feed.source);
        console.warn(
          `[WorldIntel] Feed '${feed.source}' in backoff after ${failures} network errors — ` +
            `next try in ${Math.round(backoffMs / 60_000)}min (${err instanceof Error ? err.message : String(err)})`,
        );
        return [];
      }
    }

    // Only log first failure — subsequent ones suppressed until recovery
    if ((_feedFailures.get(feed.source) ?? 0) <= 1) {
      console.warn(`[WorldIntel] Failed to fetch ${feed.source}: ${String(err)}`);
    }
    return [];
  }
}

/**
 * Deduplicate headlines by Jaccard similarity (>60% word overlap = duplicate).
 */
function deduplicateNews(items: NewsItem[]): NewsItem[] {
  const unique: NewsItem[] = [];

  for (const item of items) {
    const words = new Set(
      item.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    let isDupe = false;

    for (const existing of unique) {
      const existingWords = new Set(
        existing.title
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2),
      );
      const intersection = new Set([...words].filter((w) => existingWords.has(w)));
      const union = new Set([...words, ...existingWords]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      if (jaccard > 0.6) {
        isDupe = true;
        break;
      }
    }

    if (!isDupe) {
      unique.push(item);
      // Hard cap to prevent O(N²) blowup on large feed cycles
      if (unique.length >= MAX_DEDUP_PER_POLL) {
        break;
      }
    }
  }

  // Spin off ArXiv polling ONCE per poll cycle (not per item!)
  (async () => {
    try {
      const papers = await pollArxivSecurityPapers(20);
      for (const p of papers) {
        storeThreatIntel({
          id: p.id,
          title: p.title,
          abstract: p.abstract,
          pdfUrl: p.pdfUrl,
          timestamp: p.publishedAt,
          keywords: p.matchedKeywords.join(", "),
        });

        intelligenceBus.publish("cyber.research.paper_ingested", {
          paperId: p.id,
          title: p.title,
          abstract: p.abstract,
          authors: p.authors,
          pdfUrl: p.pdfUrl,
          publishedAt: p.publishedAt,
          keywords: p.matchedKeywords,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error("[WorldIntel] ArXiv poll error:", err);
    }
  })();

  return unique;
}

async function pollAllFeeds(): Promise<void> {
  const now = Date.now();

  // Reset the per-cycle skip set — give each feed a fresh chance
  _feedSkippedThisCycle.clear();

  // ── Trust-tiered scheduling: only fetch feeds that are "due" ──
  // Each source has a poll interval derived from its live trust score:
  //   trust > 0.75 → 5 min   (wire services, top regional)
  //   trust > 0.60 → 15 min  (mid-quality regional)
  //   trust > 0.50 → 30 min  (semi-trustworthy)
  //   trust ≤ 0.50 → 60 min  (state propaganda, slow institutions)
  const dueFeeds = RSS_FEEDS.filter((feed) => {
    const lastFetched = _feedLastFetched.get(feed.source) ?? 0;
    const interval = sourcePollIntervalMs(feed.source);
    return now - lastFetched >= interval;
  });

  if (dueFeeds.length === 0) {
    return;
  } // nothing due this tick

  const results = await Promise.allSettled(dueFeeds.map(fetchFeed));

  const allItems: NewsItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
  }

  // Deduplicate
  const deduplicated = deduplicateNews(allItems);

  // Merge into cache (newest first)
  newsCache.unshift(...deduplicated);
  if (newsCache.length > MAX_NEWS_CACHE) {
    newsCache.length = MAX_NEWS_CACHE;
  }

  // Run News Intelligence Extractor on every fresh batch
  if (deduplicated.length > 0) {
    extractFromNewsBatch(deduplicated);
  }

  // Generate signals from threat-classified news
  for (const item of deduplicated) {
    if (item.threat && item.country) {
      signals.push({
        type: mapCategoryToSignalType(item.threat.category),
        severity: item.threat.severity,
        country: item.country,
        region: item.region,
        description: item.title,
        source: item.source,
        timestamp: item.publishedAt,
      });
    }
  }

  // Trim old signals (time-window) then enforce hard cap
  const cutoff = Date.now() - CONVERGENCE_WINDOW_MS;
  while (signals.length > 0 && signals[0].timestamp < cutoff) {
    signals.shift();
  }
  // Hard cap: prevent unbounded growth during heavy news cycles
  if (signals.length > MAX_SIGNALS) {
    signals.splice(0, signals.length - MAX_SIGNALS);
  }

  // Update CII
  updateAllCII();

  // Only log when active signals are present
  if (signals.length > 0) {
    console.log(
      `[WorldIntel] Polled ${dueFeeds.length}/${RSS_FEEDS.length} feeds due, ${allItems.length} items, ${deduplicated.length} unique, ${signals.length} active signals`,
    );
  }
}

function mapCategoryToSignalType(cat: ThreatCategory): IntelSignal["type"] {
  const mapping: Record<ThreatCategory, IntelSignal["type"]> = {
    conflict: "conflict",
    protest: "protest",
    disaster: "disaster",
    diplomatic: "conflict",
    economic: "economic",
    terrorism: "conflict",
    cyber: "cyber",
    health: "disaster",
    environmental: "disaster",
    military: "military",
    crime: "conflict",
    infrastructure: "infrastructure",
    tech: "infrastructure",
    general: "conflict",
  };
  return mapping[cat];
}

// ─── Country Instability Index ──────────────────────────────────

function updateAllCII(): void {
  const now = Date.now();
  const recentWindow = 6 * 60 * 60_000; // 6 hours

  for (const country of MONITORED_COUNTRIES) {
    const countrySignals = signals.filter(
      (s) => s.country === country.code && s.timestamp > now - recentWindow,
    );

    // Component scoring (0–20 each, max total ~100)
    const conflictSignals = countrySignals.filter((s) => s.type === "conflict").length;
    const protestSignals = countrySignals.filter((s) => s.type === "protest").length;
    const cyberSignals = countrySignals.filter((s) => s.type === "cyber").length;
    const militarySignals = countrySignals.filter((s) => s.type === "military").length;
    const economicSignals = countrySignals.filter((s) => s.type === "economic").length;
    const newsVolume = newsCache.filter(
      (n) => n.country === country.code && n.publishedAt > now - recentWindow,
    ).length;

    const components = {
      conflictSignals: Math.min(20, conflictSignals * 5),
      protestSignals: Math.min(15, protestSignals * 3),
      economicStress: Math.min(15, economicSignals * 4),
      militaryActivity: Math.min(20, militarySignals * 5),
      cyberThreats: Math.min(15, cyberSignals * 4),
      newsVolume: Math.min(15, newsVolume * 2),
    };

    // Severity boost — critical/high signals add extra weight
    const severityBoost = countrySignals
      .filter((s) => s.severity === "critical" || s.severity === "high")
      .reduce((sum, s) => sum + (s.severity === "critical" ? 10 : 5), 0);

    const rawScore =
      components.conflictSignals +
      components.protestSignals +
      components.economicStress +
      components.militaryActivity +
      components.cyberThreats +
      components.newsVolume +
      Math.min(20, severityBoost);

    const score = Math.max(country.floor, Math.min(100, rawScore));

    // Determine trend
    const previous = countryProfiles.get(country.code);
    let trend: CountryProfile["trend"] = "stable";
    if (previous) {
      const delta = score - previous.ciiScore;
      if (delta > 5) {
        trend = "rising";
      } else if (delta < -5) {
        trend = "falling";
      }
    }

    countryProfiles.set(country.code, {
      code: country.code,
      name: country.name,
      ciiScore: score,
      components,
      floor: country.floor,
      trend,
      lastUpdated: now,
    });

    // Record CII history for sparklines (cap at 144 = 24h at 10m intervals)
    const hist = ciiHistory.get(country.code) ?? [];
    hist.push({ ts: now, score });
    if (hist.length > 144) {
      hist.splice(0, hist.length - 144);
    }
    ciiHistory.set(country.code, hist);
  }

  // After all country profiles updated, recompute v2 derived data
  recomputeV2();
}

/** Recompute all v2 derived data: war risk scores, war signals, velocities */
function recomputeV2(): void {
  for (const country of MONITORED_COUNTRIES) {
    const risk = computeWarRisk(country.code);
    if (risk) {
      warRisks.set(country.code, risk);
    }
  }
  detectWarSignals();
  computeEscalationVelocities();
}

// ─── Signal Convergence Detection ───────────────────────────────

/**
 * Detect geographic convergence — multiple signal types spiking in the same country/region.
 * Returns convergences where ≥3 different signal types are active within the window.
 */
export function detectConvergences(): SignalConvergence[] {
  const now = Date.now();
  const window = CONVERGENCE_WINDOW_MS;
  const recent = signals.filter((s) => s.timestamp > now - window);

  // Group by country
  const byCountry = new Map<string, IntelSignal[]>();
  for (const sig of recent) {
    const arr = byCountry.get(sig.country) || [];
    arr.push(sig);
    byCountry.set(sig.country, arr);
  }

  const convergences: SignalConvergence[] = [];

  for (const [country, sigs] of byCountry) {
    const types = new Set(sigs.map((s) => s.type));
    if (types.size >= 3) {
      // Find max severity among signals
      const maxSev = sigs.reduce(
        (max, s) => (severityRank(s.severity) > severityRank(max) ? s.severity : max),
        "info" as ThreatSeverity,
      );

      const countryInfo = MONITORED_COUNTRIES.find((c) => c.code === country);
      convergences.push({
        country,
        signalTypes: [...types],
        signalCount: sigs.length,
        maxSeverity: maxSev,
        description: `Signal convergence in ${countryInfo?.name ?? country}: ${[...types].join(", ")} (${sigs.length} signals)`,
        detectedAt: now,
      });
    }
  }

  return convergences.toSorted((a, b) => severityRank(b.maxSeverity) - severityRank(a.maxSeverity));
}

// ─── Data Freshness Tracking ────────────────────────────────────

function updateFreshness(source: string, status: DataSourceStatus): void {
  dataFreshness.set(source, {
    source,
    status,
    lastUpdate: Date.now(),
    staleness: 0,
  });
}

export function getDataFreshness(): DataFreshness[] {
  const now = Date.now();
  return [...dataFreshness.values()].map((df) => {
    const minutes = (now - df.lastUpdate) / 60_000;
    let status = df.status;
    if (df.status !== "error" && df.status !== "disabled") {
      if (minutes < 15) {
        status = "fresh";
      } else if (minutes < 60) {
        status = "stale";
      } else {
        status = "very_stale";
      }
    }
    return { ...df, status, staleness: Math.round(minutes) };
  });
}

// ─── World Brief Generation ─────────────────────────────────────

/**
 * Generate a world brief — top stories, threat level, and active convergences.
 * This is the text summary without LLM (keyword extraction + aggregation).
 * For LLM-enhanced summaries, the gateway handler pipes this through cloud-inference.
 */
export function generateWorldBrief(): WorldBrief {
  const recentNews = newsCache.filter((n) => n.publishedAt > Date.now() - 24 * 60 * 60_000);

  // Top stories: highest severity + Tier 1 sources first
  const topStories = [...recentNews]
    .toSorted((a, b) => {
      const sevDiff =
        severityRank(b.threat?.severity ?? "info") - severityRank(a.threat?.severity ?? "info");
      if (sevDiff !== 0) {
        return sevDiff;
      }
      return b.publishedAt - a.publishedAt;
    })
    .slice(0, 10);

  // Overall threat level
  const criticalCount = recentNews.filter((n) => n.threat?.severity === "critical").length;
  const highCount = recentNews.filter((n) => n.threat?.severity === "high").length;
  let threatLevel: ThreatSeverity = "info";
  if (criticalCount >= 2) {
    threatLevel = "critical";
  } else if (criticalCount >= 1 || highCount >= 5) {
    threatLevel = "high";
  } else if (highCount >= 2) {
    threatLevel = "medium";
  } else if (highCount >= 1) {
    threatLevel = "low";
  }

  const convergences = detectConvergences();

  // Build text summary
  const parts: string[] = [];
  parts.push(`World threat level: ${threatLevel.toUpperCase()}`);
  parts.push(`${recentNews.length} stories in the last 24h, ${topStories.length} top stories.`);

  if (convergences.length > 0) {
    parts.push(`⚠️ ${convergences.length} signal convergence(s) detected:`);
    for (const c of convergences.slice(0, 3)) {
      parts.push(`  • ${c.description}`);
    }
  }

  if (topStories.length > 0) {
    parts.push("Top stories:");
    for (const s of topStories.slice(0, 5)) {
      const tag = s.threat ? `[${s.threat.severity.toUpperCase()}]` : "";
      parts.push(`  • ${tag} ${s.title} (${s.source})`);
    }
  }

  return {
    summary: parts.join("\n"),
    topStories,
    threatLevel,
    activeConvergences: convergences,
    generatedAt: Date.now(),
  };
}

// ─── Public API ─────────────────────────────────────────────────

/** Get the current news feed (optionally filtered by country or severity) */
export function getNewsFeed(params?: {
  country?: string;
  severity?: ThreatSeverity;
  limit?: number;
}): NewsItem[] {
  let items = [...newsCache];

  if (params?.country) {
    items = items.filter((n) => n.country === params.country);
  }
  if (params?.severity) {
    const minRank = severityRank(params.severity);
    items = items.filter((n) => n.threat && severityRank(n.threat.severity) >= minRank);
  }

  return items.slice(0, params?.limit ?? 50);
}

/** Get CII scores for all monitored countries */
export function getCIIScores(): CountryProfile[] {
  return [...countryProfiles.values()].toSorted((a, b) => b.ciiScore - a.ciiScore);
}

/** Get CII for a specific country */
export function getCountryCII(code: string): CountryProfile | null {
  return countryProfiles.get(code.toUpperCase()) ?? null;
}

/** Get all active signals */
export function getActiveSignals(): IntelSignal[] {
  return [...signals];
}

/** Get the list of monitored countries */
export function getMonitoredCountries(): Array<{ code: string; name: string }> {
  return MONITORED_COUNTRIES.map((c) => ({ code: c.code, name: c.name }));
}

// ─── v2 Public API ──────────────────────────────────────────────

/** Get war risk assessments for all (or one) monitored countries */
export function getWarRisks(country?: string): WarRiskAssessment[] {
  if (country) {
    const r = warRisks.get(country.toUpperCase());
    return r ? [r] : [];
  }
  return [...warRisks.values()].toSorted((a, b) => b.score - a.score);
}

/** Get the global arsenal database (or a single country's arsenal) */
export function getArsenal(country?: string): ArsenalProfile[] {
  if (country) {
    const a = ARSENAL_INDEX.get(country.toUpperCase());
    return a ? [a] : [];
  }
  return ARSENAL_DB.toSorted((a, b) => a.expenditureRank - b.expenditureRank);
}

/** Get active war signal detections */
export function getWarSignals(): WarSignalDetection[] {
  return [...warSignalsActive];
}

/** Get CII escalation velocities */
export function getEscalationVelocities(): EscalationVelocity[] {
  return [...escalationVelocities.values()].toSorted(
    (a, b) => Math.abs(b.delta6h) - Math.abs(a.delta6h),
  );
}

/** Get CII score history for sparkline visualisation */
export function getCIIHistory(country: string): CIIHistoryEntry[] {
  return [...(ciiHistory.get(country.toUpperCase()) ?? [])];
}

/** Get OSINT events (optionally filtered by country or source) */
export function getOsintEvents(params?: { country?: string; limit?: number }): OsintEvent[] {
  let items = [...osintEvents].toSorted((a, b) => b.publishedAt - a.publishedAt);
  if (params?.country) {
    items = items.filter((e) => e.country === params.country);
  }
  return items.slice(0, params?.limit ?? 50);
}

/** Submit a citizen-generated intel report */
export function submitIntelReport(report: Omit<IntelReport, "id" | "generatedAt">): IntelReport {
  const full: IntelReport = {
    ...report,
    id: `ir-${++intelReportIdCounter}`,
    generatedAt: Date.now(),
  };
  intelReports.unshift(full);
  if (intelReports.length > 200) {
    intelReports.length = 200;
  }
  return full;
}

/** Get citizen intel reports */
export function getIntelReports(params?: { target?: string; limit?: number }): IntelReport[] {
  let items = [...intelReports];
  if (params?.target) {
    items = items.filter((r) => r.target.toUpperCase() === params.target!.toUpperCase());
  }
  return items.slice(0, params?.limit ?? 30);
}

/** Get current WorldIntelSnapshot for alert rules */
export function getSnapshot(): WorldIntelSnapshot {
  const convergences = detectConvergences();
  const recentNews = newsCache.filter((n) => n.publishedAt > Date.now() - 24 * 60 * 60_000);
  const criticalCount = recentNews.filter((n) => n.threat?.severity === "critical").length;
  const highCount = recentNews.filter((n) => n.threat?.severity === "high").length;
  let globalThreatLevel: ThreatSeverity = "info";
  if (criticalCount >= 2) {
    globalThreatLevel = "critical";
  } else if (criticalCount >= 1 || highCount >= 5) {
    globalThreatLevel = "high";
  } else if (highCount >= 2) {
    globalThreatLevel = "medium";
  } else if (highCount >= 1) {
    globalThreatLevel = "low";
  }
  return {
    ciiScores: countryProfiles,
    warRisks,
    warSignals: warSignalsActive,
    convergences,
    globalThreatLevel,
  };
}

/**
 * Start the world intelligence module.
 * Begins RSS polling and CII updates.
 */
export function startWorldIntelligence(): void {
  if (pollTimer) {
    return;
  } // Already running

  console.log("[WorldIntel] Starting world intelligence module...");

  // Bootstrap source credibility registry
  initSourceRegistry();

  // Initialize country profiles at floor values
  for (const country of MONITORED_COUNTRIES) {
    countryProfiles.set(country.code, {
      code: country.code,
      name: country.name,
      ciiScore: country.floor,
      components: {
        conflictSignals: 0,
        protestSignals: 0,
        economicStress: 0,
        militaryActivity: 0,
        cyberThreats: 0,
        newsVolume: 0,
      },
      floor: country.floor,
      trend: "stable",
      lastUpdated: Date.now(),
    });
  }

  // Initial poll
  pollAllFeeds().catch((err) => console.warn(`[WorldIntel] Initial poll failed: ${err}`));

  // Set up intervals
  pollTimer = setInterval(() => {
    pollAllFeeds().catch((err) => console.warn(`[WorldIntel] Poll failed: ${err}`));
  }, RSS_POLL_MASTER_TICK_MS);

  ciiTimer = setInterval(updateAllCII, CII_UPDATE_INTERVAL_MS);

  // Adaptive retention GC — evicts expired items, compresses to lite snapshots
  setInterval(runRetentionGC, RETENTION_GC_INTERVAL_MS);

  // Start alert checker (fires rules every 5 minutes)
  import("./world-intel-alerts.js").then((m) => m.startAlertChecker()).catch(() => {});
  console.log("[WorldIntel] World intelligence simulation active.");

  // Start Project Argus (OSINT Data Fusion)
  argusEngine.startScanning();

  console.log("[WorldIntel] v2 started — arsenal DB, ML war-risk, alert checker active");
}

/**
 * Stop the world intelligence module.
 */
export function stopWorldIntelligence(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (ciiTimer) {
    clearInterval(ciiTimer);
    ciiTimer = null;
  }
  import("./world-intel-alerts.js").then((m) => m.stopAlertChecker()).catch(() => {});
  argusEngine.stopScanning();
  console.log("[WorldIntel] Stopped world intelligence module.");
}

/** Check if the module is running */
export function isWorldIntelRunning(): boolean {
  return pollTimer !== null;
}
