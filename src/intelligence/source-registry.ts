/**
 * Source Credibility Registry
 *
 * Maintains a live trust profile for every RSS/news source in the
 * World Intelligence pipeline.  Each profile combines:
 *   - static priors  (honesty, accuracy, initial tendency/affinity)
 *   - adaptive rates (confirmRate, conflictRate — drift with EMA α=0.05)
 *   - computed trustScore used by the NIE conflict resolver
 *
 * Trust score formula:
 *   trustScore = (
 *     honesty    × 0.30 +
 *     accuracy   × 0.25 +
 *     confirmRate× 0.25 +
 *     (1–conflictRate) × 0.20
 *   ) × affinityPenalty(reportedCountry)
 *
 * Affinity penalty: sources with strong affinity toward/against a country
 * are trusted 30 % less when reporting about that country.
 */

// ─── Types ────────────────────────────────────────────────────────

export type SourceTendency =
  | "neutral"
  | "pro-west"
  | "pro-russia"
  | "pro-china"
  | "pro-arab"
  | "pro-ukraine"
  | "pro-israel"
  | "pro-eu"
  | "pro-japan"
  | "academic"
  | "sensationalist"
  | "tech-focused"
  | "defense-industry";

export interface SourceProfile {
  /** Matches the `source` field in NewsItem */
  id: string;
  /** RSS feed URL — informational only */
  url: string;

  // ── Static priors (0–1) ──
  /** Overall factual truthfulness */
  honesty: number;
  /** Precision of specific claims (dates, names, numbers) */
  accuracy: number;
  /** Narrative framing tendency */
  tendency: SourceTendency;
  /** country-code → bias score -1..1  (+1 = strongly favors, -1 = strongly opposes) */
  affinity: Record<string, number>;

  // ── Adaptive metrics (EMA with α=0.05) ──
  /** Fraction of this source's claims later confirmed by ≥2 other sources */
  confirmRate: number;
  /** Fraction of this source's claims contradicted by ≥2 other sources */
  conflictRate: number;
  /** Average hours from event occurrence to publish */
  latencyHours: number;

  // ── Computed (refreshed on each poll cycle) ──
  trustScore: number;

  /** ISO timestamp of last adaptive update */
  lastUpdated: string;
}

// ─── EMA helpers ─────────────────────────────────────────────────

const EMA_ALPHA = 0.05;

function ema(prev: number, next: number): number {
  return prev + EMA_ALPHA * (next - prev);
}

// ─── Initial Registry ────────────────────────────────────────────
// Priors are hand-tuned based on published media-bias research
// (AllSides, Ad Fontes Media, RSF Press Freedom Index 2024).

const INITIAL_PROFILES: Omit<SourceProfile, "trustScore" | "lastUpdated">[] = [

  // ═══════════════════════════════════════════════════════════════
  // TIER 1 — Wire Services (highest trust, near-neutral)
  // ═══════════════════════════════════════════════════════════════
  { id: "BBC World",       url: "https://feeds.bbci.co.uk/news/world/rss.xml",              honesty: 0.82, accuracy: 0.80, tendency: "neutral",         affinity: { GB: 0.15, US: 0.10, RU: -0.20, CN: -0.10 },          confirmRate: 0.70, conflictRate: 0.10, latencyHours: 1.5 },
  { id: "NYT World",       url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",   honesty: 0.80, accuracy: 0.78, tendency: "pro-west",          affinity: { US: 0.25, RU: -0.30, CN: -0.20, IL: 0.10 },          confirmRate: 0.68, conflictRate: 0.12, latencyHours: 2.0 },
  { id: "AP News",         url: "https://rsshub.app/apnews/topics/apf-topnews",             honesty: 0.90, accuracy: 0.87, tendency: "neutral",           affinity: { US: 0.05 },                                           confirmRate: 0.78, conflictRate: 0.07, latencyHours: 0.5 },
  { id: "Reuters",         url: "https://feeds.reuters.com/reuters/topNews",                honesty: 0.91, accuracy: 0.89, tendency: "neutral",           affinity: {},                                                     confirmRate: 0.80, conflictRate: 0.06, latencyHours: 0.3 },
  { id: "Reuters World",   url: "https://feeds.reuters.com/reuters/worldNews",              honesty: 0.91, accuracy: 0.89, tendency: "neutral",           affinity: {},                                                     confirmRate: 0.80, conflictRate: 0.06, latencyHours: 0.4 },
  { id: "Reuters Americas",url: "https://www.reuters.com/rssfeed/200",                     honesty: 0.90, accuracy: 0.88, tendency: "neutral",           affinity: { US: 0.05 },                                           confirmRate: 0.77, conflictRate: 0.07, latencyHours: 0.5 },
  { id: "The Guardian",    url: "https://www.theguardian.com/world/rss",                   honesty: 0.78, accuracy: 0.76, tendency: "pro-west",          affinity: { GB: 0.20, US: 0.10, RU: -0.25, IL: -0.15 },          confirmRate: 0.65, conflictRate: 0.13, latencyHours: 2.0 },
  { id: "The Intercept",   url: "https://theintercept.com/feed/?rss",                      honesty: 0.72, accuracy: 0.73, tendency: "pro-west",          affinity: { US: -0.10, IL: -0.30 },                               confirmRate: 0.58, conflictRate: 0.18, latencyHours: 4.0 },

  // ═══════════════════════════════════════════════════════════════
  // TIER 2 — UK English-language media
  // ═══════════════════════════════════════════════════════════════
  { id: "Sky News",            url: "https://feeds.skynews.com/feeds/rss/world.xml",                  honesty: 0.76, accuracy: 0.75, tendency: "neutral",    affinity: { GB: 0.15, US: 0.10 },                                 confirmRate: 0.63, conflictRate: 0.13, latencyHours: 1.0 },
  { id: "The Independent",     url: "https://www.independent.co.uk/news/rss",                        honesty: 0.74, accuracy: 0.73, tendency: "pro-west",    affinity: { GB: 0.15, RU: -0.15 },                               confirmRate: 0.60, conflictRate: 0.15, latencyHours: 2.0 },
  { id: "The Telegraph",       url: "https://www.telegraph.co.uk/rss.xml",                           honesty: 0.72, accuracy: 0.74, tendency: "pro-west",    affinity: { GB: 0.25, US: 0.10, RU: -0.20 },                    confirmRate: 0.60, conflictRate: 0.15, latencyHours: 2.0 },
  { id: "Guardian UK",         url: "https://feeds.theguardian.com/theguardian/uk-news/rss",         honesty: 0.78, accuracy: 0.76, tendency: "pro-west",    affinity: { GB: 0.20, RU: -0.20 },                              confirmRate: 0.64, conflictRate: 0.13, latencyHours: 2.0 },
  { id: "BBC Politics",        url: "https://feeds.bbci.co.uk/news/politics/rss.xml",                honesty: 0.82, accuracy: 0.80, tendency: "neutral",      affinity: { GB: 0.15 },                                          confirmRate: 0.70, conflictRate: 0.10, latencyHours: 1.0 },
  { id: "Financial Times",     url: "https://www.ft.com/rss/home/uk",                               honesty: 0.84, accuracy: 0.84, tendency: "neutral",      affinity: { GB: 0.10, US: 0.10 },                                confirmRate: 0.72, conflictRate: 0.09, latencyHours: 2.0 },

  // France
  { id: "France24",            url: "https://www.france24.com/en/rss",                              honesty: 0.78, accuracy: 0.77, tendency: "pro-eu",       affinity: { FR: 0.25, EU: 0.20, RU: -0.20 },                    confirmRate: 0.65, conflictRate: 0.12, latencyHours: 1.5 },
  { id: "RFI English",         url: "https://www.rfi.fr/en/rss",                                    honesty: 0.76, accuracy: 0.75, tendency: "pro-eu",       affinity: { FR: 0.20, EU: 0.15 },                               confirmRate: 0.62, conflictRate: 0.13, latencyHours: 2.0 },
  { id: "Le Monde English",    url: "https://en.lemonde.fr/rss/une.xml",                            honesty: 0.80, accuracy: 0.79, tendency: "pro-eu",       affinity: { FR: 0.25, EU: 0.15, RU: -0.15 },                    confirmRate: 0.66, conflictRate: 0.11, latencyHours: 3.0 },

  // Germany
  { id: "DW",                  url: "https://www.dw.com/rss/en/top-stories/s-9097",                 honesty: 0.80, accuracy: 0.79, tendency: "pro-eu",       affinity: { DE: 0.20, EU: 0.20, RU: -0.15 },                    confirmRate: 0.67, conflictRate: 0.10, latencyHours: 1.5 },
  { id: "DW World",            url: "https://www.dw.com/rss/en/world/s-1429",                       honesty: 0.80, accuracy: 0.79, tendency: "pro-eu",       affinity: { DE: 0.15, EU: 0.15, RU: -0.15 },                    confirmRate: 0.67, conflictRate: 0.10, latencyHours: 1.5 },
  { id: "DW Security",         url: "https://www.dw.com/rss/en/security/s-63602",                   honesty: 0.80, accuracy: 0.81, tendency: "pro-eu",       affinity: { DE: 0.15, EU: 0.15, RU: -0.20, CN: -0.10 },         confirmRate: 0.68, conflictRate: 0.10, latencyHours: 2.0 },
  { id: "Der Spiegel Intl",    url: "https://www.spiegel.de/international/index.rss",               honesty: 0.79, accuracy: 0.78, tendency: "pro-eu",       affinity: { DE: 0.20, EU: 0.15, RU: -0.20 },                    confirmRate: 0.65, conflictRate: 0.12, latencyHours: 3.0 },

  // Japan / Asia-Pacific
  { id: "Nikkei Asia",         url: "https://asia.nikkei.com/rss",                                  honesty: 0.82, accuracy: 0.80, tendency: "pro-japan",   affinity: { JP: 0.25, CN: -0.15, KP: -0.20 },                   confirmRate: 0.68, conflictRate: 0.09, latencyHours: 2.0 },
  { id: "Japan Times",         url: "https://www.japantimes.co.jp/feed",                            honesty: 0.80, accuracy: 0.79, tendency: "pro-japan",   affinity: { JP: 0.20, CN: -0.10 },                              confirmRate: 0.66, conflictRate: 0.10, latencyHours: 2.5 },
  { id: "NHK World",           url: "https://www3.nhk.or.jp/rss/news/cat6.xml",                    honesty: 0.80, accuracy: 0.80, tendency: "pro-japan",   affinity: { JP: 0.20 },                                          confirmRate: 0.68, conflictRate: 0.10, latencyHours: 1.5 },
  { id: "CNA",                 url: "https://www.channelnewsasia.com/rssfeeds/8395744",             honesty: 0.76, accuracy: 0.77, tendency: "neutral",      affinity: { SG: 0.20, CN: 0.05 },                               confirmRate: 0.63, conflictRate: 0.12, latencyHours: 1.5 },
  { id: "Straits Times",       url: "https://www.straitstimes.com/global/rss.xml",                  honesty: 0.75, accuracy: 0.76, tendency: "neutral",      affinity: { SG: 0.20 },                                         confirmRate: 0.62, conflictRate: 0.12, latencyHours: 2.0 },
  { id: "SCMP",                url: "https://www.scmp.com/rss/2/feed",                              honesty: 0.65, accuracy: 0.75, tendency: "pro-china",    affinity: { CN: 0.45, HK: 0.20, US: -0.20, TW: -0.30 },         confirmRate: 0.55, conflictRate: 0.22, latencyHours: 3.0 },
  { id: "The Hindu Intl",      url: "https://www.thehindu.com/news/international/feeder/default.rss", honesty: 0.76, accuracy: 0.75, tendency: "neutral",   affinity: { IN: 0.20, PK: -0.15 },                              confirmRate: 0.62, conflictRate: 0.13, latencyHours: 2.5 },

  // Middle East (non-state English independent)
  { id: "Middle East Eye",     url: "https://www.middleeasteye.net/rss",                            honesty: 0.68, accuracy: 0.72, tendency: "pro-arab",    affinity: { QA: 0.30, SA: 0.10, IL: -0.40, US: -0.15 },         confirmRate: 0.58, conflictRate: 0.20, latencyHours: 2.0 },
  { id: "Al Arabiya English",  url: "https://english.alarabiya.net/tools/rss",                      honesty: 0.62, accuracy: 0.70, tendency: "pro-arab",    affinity: { SA: 0.40, UAE: 0.20, IR: -0.40, QA: -0.20 },        confirmRate: 0.52, conflictRate: 0.24, latencyHours: 2.0 },
  { id: "Arab News",           url: "https://www.arabnews.com/taxonomy/term/2/feed",                honesty: 0.64, accuracy: 0.70, tendency: "pro-arab",    affinity: { SA: 0.45, IR: -0.35, IL: -0.20 },                   confirmRate: 0.53, conflictRate: 0.23, latencyHours: 2.5 },
  { id: "Al-Monitor",          url: "https://www.almonitor.com/rss.xml",                            honesty: 0.73, accuracy: 0.76, tendency: "neutral",      affinity: {},                                                    confirmRate: 0.63, conflictRate: 0.13, latencyHours: 3.0 },
  { id: "Al Jazeera English",  url: "https://www.aljazeera.com/xml/rss/all.xml",                   honesty: 0.66, accuracy: 0.71, tendency: "pro-arab",    affinity: { QA: 0.35, IL: -0.35, US: -0.10 },                   confirmRate: 0.56, conflictRate: 0.21, latencyHours: 1.5 },

  // Latin America
  { id: "MercoPress",          url: "https://en.mercopress.com/rss.xml",                            honesty: 0.72, accuracy: 0.72, tendency: "neutral",      affinity: {},                                                    confirmRate: 0.60, conflictRate: 0.14, latencyHours: 3.0 },

  // Africa
  { id: "AllAfrica",           url: "https://allafrica.com/tools/headlines/rdf/africa/headlines.rdf", honesty: 0.68, accuracy: 0.70, tendency: "neutral",   affinity: {},                                                    confirmRate: 0.55, conflictRate: 0.18, latencyHours: 4.0 },
  { id: "BBC Africa",          url: "https://www.bbc.co.uk/africa/rss.xml",                         honesty: 0.82, accuracy: 0.80, tendency: "neutral",      affinity: { GB: 0.10 },                                          confirmRate: 0.70, conflictRate: 0.10, latencyHours: 2.0 },

  // ═══════════════════════════════════════════════════════════════
  // TIER 3 — State / Alignment Media
  // High affinity penalty applied automatically when reporting on "home" topics
  // ═══════════════════════════════════════════════════════════════

  // Russia — state outlets (strong RU affinity, heavy anti-West bias → large penalty)
  { id: "TASS",                url: "https://tass.com/rss/v2.xml",                                  honesty: 0.35, accuracy: 0.55, tendency: "pro-russia",  affinity: { RU: 0.70, BY: 0.40, UA: -0.60, US: -0.50, NATO: -0.60 }, confirmRate: 0.38, conflictRate: 0.45, latencyHours: 1.0 },
  { id: "RIA Novosti",         url: "https://ria.ru/export/rss2/archive/index.xml",                 honesty: 0.32, accuracy: 0.50, tendency: "pro-russia",  affinity: { RU: 0.75, UA: -0.65, US: -0.55, NATO: -0.65 },      confirmRate: 0.35, conflictRate: 0.48, latencyHours: 1.0 },
  { id: "RT",                  url: "https://www.rt.com/rss/news/",                                 honesty: 0.28, accuracy: 0.45, tendency: "pro-russia",  affinity: { RU: 0.80, US: -0.60, UK: -0.40, NATO: -0.70 },      confirmRate: 0.30, conflictRate: 0.52, latencyHours: 0.5 },
  { id: "Sputnik World",       url: "https://sputnikglobe.com/export/rss2/world/index.xml",         honesty: 0.30, accuracy: 0.48, tendency: "pro-russia",  affinity: { RU: 0.75, US: -0.60, NATO: -0.65 },                 confirmRate: 0.32, conflictRate: 0.50, latencyHours: 0.5 },
  // Russia — independent/exiled (anti-Kremlin, higher trust but anti-RU bias)
  { id: "Moscow Times",        url: "https://www.themoscowtimes.com/rss",                           honesty: 0.72, accuracy: 0.74, tendency: "pro-west",    affinity: { RU: -0.20, UA: 0.15 },                               confirmRate: 0.62, conflictRate: 0.14, latencyHours: 2.0 },
  { id: "Meduza",              url: "https://meduza.io/rss/all",                                    honesty: 0.74, accuracy: 0.75, tendency: "pro-west",    affinity: { RU: -0.30, UA: 0.20 },                               confirmRate: 0.63, conflictRate: 0.14, latencyHours: 2.0 },

  // China — state outlets
  { id: "Xinhua",              url: "https://www.xinhuanet.com/english/rss/worldrss.xml",           honesty: 0.32, accuracy: 0.55, tendency: "pro-china",   affinity: { CN: 0.80, TW: -0.70, US: -0.50, HK: 0.40 },        confirmRate: 0.33, conflictRate: 0.48, latencyHours: 1.0 },
  { id: "Global Times",        url: "https://www.globaltimes.cn/rss/outbrain.xml",                 honesty: 0.25, accuracy: 0.45, tendency: "pro-china",   affinity: { CN: 0.85, TW: -0.80, US: -0.65, IN: -0.30 },       confirmRate: 0.28, conflictRate: 0.55, latencyHours: 1.0 },
  { id: "CGTN",                url: "https://english.cctv.com/RSS/english.xml",                    honesty: 0.32, accuracy: 0.52, tendency: "pro-china",   affinity: { CN: 0.75, TW: -0.70, US: -0.50 },                   confirmRate: 0.30, conflictRate: 0.50, latencyHours: 1.0 },
  { id: "China Daily",         url: "https://www.chinadaily.com.cn/rss/world_rss.xml",             honesty: 0.33, accuracy: 0.55, tendency: "pro-china",   affinity: { CN: 0.75, TW: -0.65, US: -0.40 },                   confirmRate: 0.32, conflictRate: 0.48, latencyHours: 1.5 },
  { id: "Sixth Tone",          url: "https://www.sixthtone.com/feed",                              honesty: 0.55, accuracy: 0.63, tendency: "pro-china",   affinity: { CN: 0.30 },                                          confirmRate: 0.50, conflictRate: 0.20, latencyHours: 3.0 },

  // Israel — English outlets
  { id: "Jerusalem Post",      url: "https://www.jpost.com/Rss/RssFeedsHeadlines.aspx",            honesty: 0.63, accuracy: 0.68, tendency: "pro-israel",  affinity: { IL: 0.40, IR: -0.40, PS: -0.30, US: 0.20 },         confirmRate: 0.55, conflictRate: 0.20, latencyHours: 1.5 },
  { id: "Haaretz",             url: "https://www.haaretz.com/cmlink/1.628765",                     honesty: 0.72, accuracy: 0.73, tendency: "neutral",      affinity: { IL: 0.15 },                                          confirmRate: 0.62, conflictRate: 0.14, latencyHours: 2.0 },
  { id: "Times of Israel",     url: "https://www.timesofisrael.com/feed/",                         honesty: 0.68, accuracy: 0.70, tendency: "pro-israel",  affinity: { IL: 0.30, IR: -0.35, PS: -0.20 },                   confirmRate: 0.57, conflictRate: 0.18, latencyHours: 1.5 },
  { id: "Israeli MFA",         url: "https://mfa.gov.il/MFA/PressRoom/rss/Pages/default.aspx",    honesty: 0.50, accuracy: 0.65, tendency: "pro-israel",  affinity: { IL: 0.90, IR: -0.60, PS: -0.50 },                   confirmRate: 0.45, conflictRate: 0.30, latencyHours: 2.0 },

  // Iran — English outlets
  { id: "PressTV",             url: "https://www.presstv.ir/rssfeed/en/1/world.rss",               honesty: 0.28, accuracy: 0.45, tendency: "pro-arab",    affinity: { IR: 0.80, IL: -0.75, US: -0.65, SA: -0.50 },        confirmRate: 0.28, conflictRate: 0.52, latencyHours: 1.0 },
  { id: "Mehr News",           url: "https://en.mehrnews.com/rss",                                 honesty: 0.32, accuracy: 0.50, tendency: "pro-arab",    affinity: { IR: 0.70, IL: -0.65, US: -0.55 },                   confirmRate: 0.30, conflictRate: 0.50, latencyHours: 1.0 },
  { id: "Tehran Times",        url: "https://tehrantimes.com/rss.xml",                             honesty: 0.33, accuracy: 0.52, tendency: "pro-arab",    affinity: { IR: 0.70, IL: -0.60, US: -0.50 },                   confirmRate: 0.31, conflictRate: 0.49, latencyHours: 1.5 },
  { id: "IRNA",                url: "https://www.irna.ir/en/rss.xml",                              honesty: 0.30, accuracy: 0.50, tendency: "pro-arab",    affinity: { IR: 0.80, IL: -0.70, US: -0.60 },                   confirmRate: 0.29, conflictRate: 0.51, latencyHours: 1.0 },

  // Turkey
  { id: "Hurriyet Daily News", url: "https://www.hurriyetdailynews.com/rss.aspx",                  honesty: 0.62, accuracy: 0.65, tendency: "neutral",      affinity: { TR: 0.30, KU: -0.20, GR: -0.15 },                   confirmRate: 0.53, conflictRate: 0.20, latencyHours: 2.0 },
  { id: "Anadolu Agency",      url: "https://www.aa.com.tr/en/rss/default?cat=world",              honesty: 0.55, accuracy: 0.62, tendency: "neutral",      affinity: { TR: 0.50, GR: -0.20, IL: -0.15, KU: -0.25 },        confirmRate: 0.48, conflictRate: 0.25, latencyHours: 1.0 },
  { id: "Daily Sabah",         url: "https://www.dailysabah.com/feeds/rss/world",                  honesty: 0.55, accuracy: 0.60, tendency: "neutral",      affinity: { TR: 0.45, GR: -0.20, IL: -0.10 },                   confirmRate: 0.47, conflictRate: 0.25, latencyHours: 2.0 },

  // India / Pakistan
  { id: "Times of India",      url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",  honesty: 0.68, accuracy: 0.68, tendency: "neutral",      affinity: { IN: 0.30, PK: -0.30, CN: -0.10 },                   confirmRate: 0.57, conflictRate: 0.18, latencyHours: 2.0 },
  { id: "Dawn (Pakistan)",     url: "https://www.dawn.com/feeds/latest-news",                      honesty: 0.70, accuracy: 0.70, tendency: "neutral",      affinity: { PK: 0.30, IN: -0.20 },                              confirmRate: 0.58, conflictRate: 0.17, latencyHours: 2.5 },
  { id: "NDTV World",          url: "https://www.ndtv.com/rss/feeds/2070",                         honesty: 0.66, accuracy: 0.67, tendency: "neutral",      affinity: { IN: 0.30, PK: -0.25, CN: -0.10 },                   confirmRate: 0.55, conflictRate: 0.19, latencyHours: 1.5 },

  // Gulf
  { id: "The National (UAE)", url: "https://www.thenationalnews.com/rss.xml",                      honesty: 0.63, accuracy: 0.68, tendency: "pro-arab",    affinity: { UAE: 0.40, SA: 0.20, IR: -0.25, QA: -0.15 },        confirmRate: 0.53, conflictRate: 0.20, latencyHours: 2.0 },
  { id: "Gulf News",           url: "https://gulfnews.com/rss",                                    honesty: 0.63, accuracy: 0.67, tendency: "pro-arab",    affinity: { UAE: 0.40, SA: 0.20, IR: -0.20 },                   confirmRate: 0.52, conflictRate: 0.20, latencyHours: 2.0 },

  // Ukraine conflict-focused independents
  { id: "Kyiv Independent",    url: "https://www.kyivindependent.com/feed/",                       honesty: 0.72, accuracy: 0.73, tendency: "pro-ukraine",  affinity: { UA: 0.55, RU: -0.55 },                              confirmRate: 0.60, conflictRate: 0.20, latencyHours: 1.5 },
  { id: "Ukrainska Pravda EN", url: "https://english.nv.ua/rss.html",                              honesty: 0.70, accuracy: 0.71, tendency: "pro-ukraine",  affinity: { UA: 0.50, RU: -0.50 },                              confirmRate: 0.58, conflictRate: 0.22, latencyHours: 2.0 },

  // ═══════════════════════════════════════════════════════════════
  // TIER 4 — Specialty / Defense / OSINT / Think-tanks
  // ═══════════════════════════════════════════════════════════════
  { id: "Defense One",         url: "https://www.defenseone.com/rss/",                             honesty: 0.75, accuracy: 0.82, tendency: "defense-industry", affinity: { US: 0.30, NATO: 0.20, RU: -0.20, CN: -0.20 },  confirmRate: 0.72, conflictRate: 0.09, latencyHours: 3.0 },
  { id: "Defense News",        url: "https://www.defensenews.com/rss/",                            honesty: 0.74, accuracy: 0.81, tendency: "defense-industry", affinity: { US: 0.25, NATO: 0.15 },                         confirmRate: 0.71, conflictRate: 0.10, latencyHours: 3.0 },
  { id: "The Record (Cyber)",  url: "https://therecord.media/feed",                                honesty: 0.85, accuracy: 0.88, tendency: "tech-focused",  affinity: { RU: -0.10, CN: -0.10 },                            confirmRate: 0.78, conflictRate: 0.07, latencyHours: 1.0 },
  { id: "ISW",                 url: "https://understandingwar.org/rss.xml",                        honesty: 0.70, accuracy: 0.78, tendency: "pro-ukraine",    affinity: { UA: 0.40, US: 0.20, RU: -0.50 },                  confirmRate: 0.62, conflictRate: 0.18, latencyHours: 6.0 },
  { id: "Georgetown Security", url: "https://gjia.georgetown.edu/feed/",                           honesty: 0.78, accuracy: 0.76, tendency: "academic",       affinity: { US: 0.10 },                                        confirmRate: 0.65, conflictRate: 0.10, latencyHours: 12.0 },
  { id: "Janes",               url: "https://www.janes.com/feeds/news",                            honesty: 0.80, accuracy: 0.85, tendency: "defense-industry", affinity: {},                                               confirmRate: 0.75, conflictRate: 0.08, latencyHours: 4.0 },
  { id: "Army Recognition",    url: "https://www.armyrecognition.com/rss.xml",                     honesty: 0.73, accuracy: 0.78, tendency: "defense-industry", affinity: {},                                               confirmRate: 0.65, conflictRate: 0.12, latencyHours: 4.0 },
  { id: "Bellingcat",          url: "https://www.bellingcat.com/feed/",                            honesty: 0.80, accuracy: 0.83, tendency: "pro-west",        affinity: { RU: -0.25 },                                      confirmRate: 0.73, conflictRate: 0.10, latencyHours: 6.0 },
  { id: "SIPRI",               url: "https://www.sipri.org/feed",                                  honesty: 0.88, accuracy: 0.87, tendency: "academic",        affinity: {},                                                  confirmRate: 0.80, conflictRate: 0.06, latencyHours: 24.0 },
  { id: "Foreign Policy",      url: "https://foreignpolicy.com/feed/",                            honesty: 0.76, accuracy: 0.78, tendency: "pro-west",        affinity: { US: 0.15 },                                        confirmRate: 0.65, conflictRate: 0.12, latencyHours: 4.0 },
  { id: "The Economist",       url: "https://www.economist.com/international/rss.xml",             honesty: 0.82, accuracy: 0.82, tendency: "neutral",         affinity: { GB: 0.10, US: 0.10 },                             confirmRate: 0.72, conflictRate: 0.09, latencyHours: 24.0 },
  { id: "Foreign Affairs",     url: "https://www.foreignaffairs.com/rss.xml",                      honesty: 0.80, accuracy: 0.80, tendency: "pro-west",        affinity: { US: 0.15 },                                       confirmRate: 0.70, conflictRate: 0.10, latencyHours: 72.0 },
  { id: "ICG",                 url: "https://www.crisisgroup.org/rss.xml",                         honesty: 0.83, accuracy: 0.83, tendency: "academic",        affinity: {},                                                  confirmRate: 0.74, conflictRate: 0.08, latencyHours: 24.0 },
  { id: "War on the Rocks",    url: "https://warontherocks.com/feed/",                             honesty: 0.78, accuracy: 0.80, tendency: "defense-industry", affinity: { US: 0.10 },                                     confirmRate: 0.68, conflictRate: 0.10, latencyHours: 12.0 },

  // ═══════════════════════════════════════════════════════════════
  // TIER 5 — Official Government / International Institutions
  // Consider authoritative for official positions, not for ground truth (often delayed/PR)
  // ═══════════════════════════════════════════════════════════════
  { id: "UN News",             url: "https://www.un.org/cyberschoolbus/rss/rss.asp",               honesty: 0.72, accuracy: 0.75, tendency: "neutral",         affinity: {},                                                 confirmRate: 0.65, conflictRate: 0.12, latencyHours: 6.0 },
  { id: "NATO",                url: "https://www.nato.int/nato_static_fl2014/assets/rss/news.xml", honesty: 0.70, accuracy: 0.74, tendency: "pro-west",         affinity: { NATO: 0.90, RU: -0.60, BY: -0.40 },              confirmRate: 0.62, conflictRate: 0.18, latencyHours: 4.0 },
  { id: "US State Dept",       url: "https://www.state.gov/rss-feeds/press-releases/",            honesty: 0.65, accuracy: 0.72, tendency: "pro-west",         affinity: { US: 0.90, RU: -0.50, CN: -0.50, IR: -0.55 },    confirmRate: 0.58, conflictRate: 0.22, latencyHours: 4.0 },
  { id: "US News",             url: "https://www.usnews.com/rss/news",                            honesty: 0.75, accuracy: 0.75, tendency: "neutral",           affinity: { US: 0.10 },                                      confirmRate: 0.62, conflictRate: 0.14, latencyHours: 3.0 },
  { id: "White House",         url: "https://www.whitehouse.gov/feed/press-releases/",            honesty: 0.58, accuracy: 0.68, tendency: "pro-west",          affinity: { US: 0.95 },                                      confirmRate: 0.50, conflictRate: 0.30, latencyHours: 2.0 },
  { id: "UK Gov",              url: "https://www.gov.uk/search/news-and-communications.atom",     honesty: 0.65, accuracy: 0.70, tendency: "pro-west",          affinity: { GB: 0.90 },                                      confirmRate: 0.55, conflictRate: 0.25, latencyHours: 4.0 },
  { id: "UK MOD",              url: "https://www.mod.uk/rss.xml",                                 honesty: 0.62, accuracy: 0.69, tendency: "defense-industry",  affinity: { GB: 0.90, RU: -0.50, CN: -0.30 },               confirmRate: 0.53, conflictRate: 0.27, latencyHours: 4.0 },
  { id: "EU Press",            url: "https://www.europa.eu/rapid/rss.xml",                        honesty: 0.68, accuracy: 0.72, tendency: "pro-eu",            affinity: { EU: 0.90, RU: -0.40 },                           confirmRate: 0.58, conflictRate: 0.22, latencyHours: 6.0 },
  { id: "IAEA",                url: "https://www.iaea.org/newscenter/pressreleases/feed",          honesty: 0.80, accuracy: 0.82, tendency: "academic",          affinity: {},                                                 confirmRate: 0.72, conflictRate: 0.08, latencyHours: 12.0 },
  { id: "ICRC",                url: "https://www.icrc.org/en/rss.xml",                            honesty: 0.85, accuracy: 0.84, tendency: "academic",          affinity: {},                                                 confirmRate: 0.77, conflictRate: 0.07, latencyHours: 6.0 },
  { id: "UNHCR",               url: "https://www.unhcr.org/rss/news.xml",                         honesty: 0.82, accuracy: 0.81, tendency: "academic",          affinity: {},                                                 confirmRate: 0.73, conflictRate: 0.09, latencyHours: 6.0 },
];


// ─── Registry Store ───────────────────────────────────────────────

const _registry = new Map<string, SourceProfile>();

function computeTrustScore(p: Omit<SourceProfile, "trustScore" | "lastUpdated">): number {
  const base =
    p.honesty    * 0.30 +
    p.accuracy   * 0.25 +
    p.confirmRate * 0.25 +
    (1 - p.conflictRate) * 0.20;
  return Math.max(0, Math.min(1, base));
}

export function computeTrustScoreForCountry(sourceId: string, countryCode: string): number {
  const p = _registry.get(sourceId);
  if (!p) {return 0.5;}
  const base = p.trustScore;
  const bias = p.affinity[countryCode] ?? 0;
  // Strong affinity → trust penalty up to 30%
  const penalty = 1 - Math.abs(bias) * 0.30;
  return Math.max(0, Math.min(1, base * penalty));
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Bootstrap the registry from initial priors */
export function initSourceRegistry(): void {
  if (_registry.size > 0) {return;} // already initialised
  for (const prior of INITIAL_PROFILES) {
    _registry.set(prior.id, {
      ...prior,
      trustScore: computeTrustScore(prior),
      lastUpdated: nowIso(),
    });
  }
}

/** Get all source profiles (sorted by trust score desc) */
export function getSourceProfiles(): SourceProfile[] {
  return [..._registry.values()].toSorted((a, b) => b.trustScore - a.trustScore);
}

/** Get a single source profile by id */
export function getSourceProfile(id: string): SourceProfile | undefined {
  return _registry.get(id);
}

/**
 * Record that a source's claim was confirmed by ≥2 independent sources.
 * Nudges confirmRate up and conflictRate down via EMA.
 */
export function recordConfirmation(sourceId: string): void {
  const p = _registry.get(sourceId);
  if (!p) {return;}
  p.confirmRate  = ema(p.confirmRate, 1);
  p.conflictRate = ema(p.conflictRate, 0);
  p.trustScore   = computeTrustScore(p);
  p.lastUpdated  = nowIso();
}

/**
 * Record that a source's claim was contradicted by ≥2 independent sources.
 * Nudges conflictRate up and confirmRate down via EMA.
 */
export function recordContradiction(sourceId: string): void {
  const p = _registry.get(sourceId);
  if (!p) {return;}
  p.conflictRate = ema(p.conflictRate, 1);
  p.confirmRate  = ema(p.confirmRate, 0);
  p.trustScore   = computeTrustScore(p);
  p.lastUpdated  = nowIso();
}

/**
 * Returns only sources above a minimum trust threshold (default 0.55).
 */
export function getTrustedSources(minTrust = 0.55): SourceProfile[] {
  return getSourceProfiles().filter(p => p.trustScore >= minTrust);
}

// Auto-initialise on import
initSourceRegistry();
