/**
 * News Intelligence Extractor (NIE)
 *
 * Parses military intelligence from RSS news headlines and descriptions:
 *   - Carrier movement extractor  → where is CVN-X right now?
 *   - Strike event extractor      → who struck who, with what, where?
 *   - Arsenal update extractor    → delta changes to force structure
 *
 * Also runs the Cross-Source Conflict Detector:
 *   - Groups coordinated claims across sources (same entity, same window)
 *   - Uses Source Registry trust scores to resolve conflicts
 *   - Confirms/contradicts claims; updates adaptive trust rates
 *
 * Exports:
 *   extractFromNewsBatch(items)   — call after each RSS poll
 *   getExtractionLog()            — last 500 NIE events
 *   getCarrierTrails()            — per-carrier position history
 *   getActiveConflicts()          — current claim conflicts
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  computeTrustScoreForCountry,
  getSourceProfile,
  recordConfirmation,
  recordContradiction,
} from "./source-registry.js";
import type { NewsItem } from "../republic/world-intelligence.js";

const logger = createSubsystemLogger("nie");

// ─── Types ────────────────────────────────────────────────────────

export type NieEventType = "carrier_move" | "strike" | "arsenal_delta" | "conflict";
export type VerificationStatus = "verified" | "unverified" | "disputed";

export interface ExtractedCarrierMove {
  type: "carrier_move";
  vesselName: string;
  vesselId: string; // matches war-theater-data carrier id
  action: "arrived" | "transiting" | "departed" | "operating" | "positioned";
  locationHint: string;
  lat: number;
  lng: number;
  sourceId: string;
  trustScore: number;
  status: VerificationStatus;
  headline: string;
  timestamp: number;
}

export interface ExtractedStrike {
  type: "strike";
  attackerCountry: string;
  defenderCountry: string;
  strikeType: "airstrike" | "missile" | "drone" | "artillery" | "naval" | "cyber" | "special_ops" | "unknown";
  locationHint: string;
  lat: number;
  lng: number;
  weaponHint?: string;
  sourceId: string;
  trustScore: number;
  status: VerificationStatus;
  headline: string;
  timestamp: number;
}

export interface ExtractedArsenalDelta {
  type: "arsenal_delta";
  country: string;
  action: "acquired" | "lost" | "destroyed" | "delivered";
  assetType: string;
  quantity: number;
  sourceId: string;
  trustScore: number;
  status: VerificationStatus;
  headline: string;
  timestamp: number;
}

export interface ClaimConflict {
  type: "conflict";
  claimType: NieEventType;
  entity: string;
  claims: Array<{ sourceId: string; description: string; trustScore: number }>;
  resolution: string; // which source "won" and why
  timestamp: number;
}

export type NieEvent =
  | ExtractedCarrierMove
  | ExtractedStrike
  | ExtractedArsenalDelta
  | ClaimConflict;

// ─── Geo Location Dictionary ──────────────────────────────────────
// 200+ named regions → approximate lat/lng centroid

const LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
  // Seas / Straits
  "south china sea":           { lat: 12.0,  lng: 114.0 },
  "east china sea":            { lat: 28.0,  lng: 126.0 },
  "taiwan strait":             { lat: 24.5,  lng: 120.5 },
  "strait of hormuz":          { lat: 26.6,  lng: 56.3  },
  "persian gulf":              { lat: 26.5,  lng: 52.0  },
  "gulf of oman":              { lat: 23.0,  lng: 59.0  },
  "arabian sea":               { lat: 17.0,  lng: 63.0  },
  "red sea":                   { lat: 20.0,  lng: 38.0  },
  "mediterranean sea":         { lat: 35.0,  lng: 18.0  },
  "mediterranean":             { lat: 35.0,  lng: 18.0  },
  "black sea":                 { lat: 43.0,  lng: 34.0  },
  "caspian sea":               { lat: 42.0,  lng: 51.0  },
  "baltic sea":                { lat: 58.0,  lng: 20.0  },
  "north sea":                 { lat: 55.0,  lng: 4.0   },
  "norwegian sea":             { lat: 68.0,  lng: 4.0   },
  "bering sea":                { lat: 58.0,  lng: -175.0},
  "philippine sea":            { lat: 15.0,  lng: 130.0 },
  "sea of japan":              { lat: 40.0,  lng: 135.0 },
  "indian ocean":              { lat: -20.0, lng: 80.0  },
  "pacific ocean":             { lat: 0.0,   lng: -150.0},
  "pacific":                   { lat: 0.0,   lng: -150.0},
  "atlantic ocean":            { lat: 20.0,  lng: -30.0 },
  "gulf of aden":              { lat: 12.0,  lng: 47.0  },
  "strait of bab el-mandeb":  { lat: 12.5,  lng: 43.5  },

  // Regions / Theaters
  "middle east":               { lat: 28.0,  lng: 45.0  },
  "north africa":              { lat: 25.0,  lng: 20.0  },
  "sub-saharan africa":        { lat: 0.0,   lng: 20.0  },
  "east africa":               { lat: 0.0,   lng: 38.0  },
  "west africa":               { lat: 10.0,  lng: 0.0   },
  "horn of africa":            { lat: 8.0,   lng: 46.0  },
  "sahel":                     { lat: 14.0,  lng: 5.0   },
  "eastern europe":            { lat: 50.0,  lng: 30.0  },
  "central asia":              { lat: 43.0,  lng: 62.0  },
  "south asia":                { lat: 22.0,  lng: 77.0  },
  "southeast asia":            { lat: 10.0,  lng: 106.0 },
  "indo-pacific":              { lat: 10.0,  lng: 120.0 },
  "arctic":                    { lat: 80.0,  lng: 0.0   },

  // Country capitals / key cities (fallback when country-only mentioned)
  "ukraine":                   { lat: 48.5,  lng: 32.0  },
  "kyiv":                      { lat: 50.4,  lng: 30.5  },
  "kharkiv":                   { lat: 49.9,  lng: 36.2  },
  "donbas":                    { lat: 48.0,  lng: 38.0  },
  "zaporizhzhia":              { lat: 47.8,  lng: 35.2  },
  "crimea":                    { lat: 45.3,  lng: 34.1  },
  "russia":                    { lat: 55.0,  lng: 50.0  },
  "moscow":                    { lat: 55.8,  lng: 37.6  },
  "iran":                      { lat: 32.0,  lng: 53.0  },
  "tehran":                    { lat: 35.7,  lng: 51.4  },
  "iranian coast":             { lat: 26.5,  lng: 56.0  },
  "israel":                    { lat: 31.5,  lng: 34.9  },
  "gaza":                      { lat: 31.4,  lng: 34.4  },
  "west bank":                 { lat: 32.0,  lng: 35.3  },
  "lebanon":                   { lat: 33.9,  lng: 35.5  },
  "beirut":                    { lat: 33.9,  lng: 35.5  },
  "syria":                     { lat: 35.0,  lng: 38.0  },
  "damascus":                  { lat: 33.5,  lng: 36.3  },
  "iraq":                      { lat: 33.0,  lng: 44.0  },
  "baghdad":                   { lat: 33.3,  lng: 44.4  },
  "yemen":                     { lat: 15.5,  lng: 48.0  },
  "saudi arabia":              { lat: 24.0,  lng: 45.0  },
  "riyadh":                    { lat: 24.7,  lng: 46.7  },
  "turkey":                    { lat: 39.0,  lng: 35.0  },
  "china":                     { lat: 35.0,  lng: 105.0 },
  "beijing":                   { lat: 39.9,  lng: 116.4 },
  "north korea":               { lat: 40.0,  lng: 127.0 },
  "pyongyang":                 { lat: 39.0,  lng: 125.8 },
  "korea":                     { lat: 37.0,  lng: 127.0 },
  "japan":                     { lat: 36.0,  lng: 138.0 },
  "tokyo":                     { lat: 35.7,  lng: 139.7 },
  "india":                     { lat: 22.0,  lng: 78.0  },
  "pakistan":                  { lat: 30.0,  lng: 69.0  },
  "afghanistan":               { lat: 33.0,  lng: 65.0  },
  "ethiopia":                  { lat: 8.0,   lng: 40.0  },
  "sudan":                     { lat: 14.0,  lng: 30.0  },
  "libya":                     { lat: 27.0,  lng: 17.0  },
  "nigeria":                   { lat: 9.0,   lng: 8.0   },
  "somalia":                   { lat: 6.0,   lng: 46.0  },
  "mozambique":                { lat: -18.0, lng: 35.0  },
  "myanmar":                   { lat: 17.0,  lng: 96.0  },
  "venezuela":                 { lat: 8.0,   lng: -66.0 },
  "haiti":                     { lat: 18.9,  lng: -72.3 },
  "taiwan":                    { lat: 23.7,  lng: 120.9 },
  "taiwan coast":              { lat: 24.0,  lng: 119.5 },
  "djibouti":                  { lat: 11.6,  lng: 43.1  },
};

function resolveLocation(text: string): { lat: number; lng: number } | null {
  const lower = text.toLowerCase();
  // Try longest match first
  const keys = Object.keys(LOCATION_COORDS).toSorted((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) {
      return LOCATION_COORDS[key]!;
    }
  }
  return null;
}

// ─── Carrier Name → ID Dictionary ─────────────────────────────────
// Maps news mentions to war-theater-data carrier ids

const CARRIER_NAME_MAP: Array<{ patterns: string[]; id: string; name: string }> = [
  { patterns: ["gerald ford", "cvn-78", "cvn 78"], id: "us-cvn-78", name: "USS Gerald R. Ford" },
  { patterns: ["nimitz", "cvn-68", "cvn 68"], id: "us-cvn-68", name: "USS Nimitz" },
  { patterns: ["theodore roosevelt", "cvn-71", "cvn 71", "big stick"], id: "us-cvn-71", name: "USS Theodore Roosevelt" },
  { patterns: ["harry truman", "cvn-75", "cvn 75"], id: "us-cvn-75", name: "USS Harry S. Truman" },
  { patterns: ["dwight eisenhower", "cvn-69", "cvn 69", "ike"], id: "us-cvn-69", name: "USS Dwight D. Eisenhower" },
  { patterns: ["ronald reagan", "cvn-76", "cvn 76"], id: "us-cvn-76", name: "USS Ronald Reagan" },
  { patterns: ["george washington", "cvn-73", "cvn 73"], id: "us-cvn-73", name: "USS George Washington" },
  { patterns: ["john c. stennis", "cvn-74", "cvn 74", "stennis"], id: "us-cvn-74", name: "USS John C. Stennis" },
  { patterns: ["lincoln", "cvn-72", "cvn 72"], id: "us-cvn-72", name: "USS Abraham Lincoln" },
  { patterns: ["carl vinson", "cvn-70", "cvn 70", "vinson"], id: "us-cvn-70", name: "USS Carl Vinson" },
  { patterns: ["george h.w. bush", "cvn-77", "cvn 77"], id: "us-cvn-77", name: "USS George H.W. Bush" },
  { patterns: ["charles de gaulle", "r 91", "r91"], id: "fr-r91", name: "Charles de Gaulle" },
  { patterns: ["queen elizabeth", "r 08", "r08"], id: "gb-r08", name: "HMS Queen Elizabeth" },
  { patterns: ["prince of wales", "r 09", "r09"], id: "gb-r09", name: "HMS Prince of Wales" },
  { patterns: ["liaoning", "cv-16", "cv 16"], id: "cn-cv16", name: "CNS Liaoning" },
  { patterns: ["shandong", "cv-17", "cv 17"], id: "cn-cv17", name: "CNS Shandong" },
  { patterns: ["fujian", "cv-18", "cv 18"], id: "cn-cv18", name: "CNS Fujian" },
  { patterns: ["kuznetsov", "admiral kuznetsov"], id: "ru-kuznetsov", name: "Admiral Kuznetsov" },
];

function matchCarrier(text: string): typeof CARRIER_NAME_MAP[0] | null {
  const lower = text.toLowerCase();
  for (const c of CARRIER_NAME_MAP) {
    if (c.patterns.some(p => lower.includes(p))) {return c;}
  }
  return null;
}

// ─── Country / Actor Dictionary ───────────────────────────────────

const ACTOR_COUNTRY_MAP: Record<string, string> = {
  "russia": "RU", "russian": "RU", "kremlin": "RU", "moscow": "RU", "ria novosti": "RU",
  "ukraine": "UA", "ukrainian": "UA", "kyiv": "UA", "zelensky": "UA",
  "united states": "US", "u.s.": "US", "american": "US", "pentagon": "US", "usaf": "US",
  "israel": "IL", "israeli": "IL", "idf": "IL", "raf": "IL",
  "iran": "IR", "iranian": "IR", "irgc": "IR", "tehran": "IR",
  "china": "CN", "chinese": "CN", "pla": "CN", "beijing": "CN",
  "north korea": "KP", "dprk": "KP", "kpa": "KP", "pyongyang": "KP",
  "saudi": "SA", "saudi arabia": "SA", "riyadh": "SA",
  "turkey": "TR", "turkish": "TR", "ankara": "TR",
  "hamas": "PS", "hezbollah": "LB", "houthi": "YE", "houthis": "YE",
  "pakistan": "PK", "india": "IN", "france": "FR", "germany": "DE",
  "britain": "GB", "british": "GB", "uk ": "GB", "nato": "NATO",
  "japan": "JP", "south korea": "KR", "australia": "AU",
  "myanmar": "MM", "junta": "MM", "ethiopia": "ET", "somalia": "SO",
  "sudan": "SD", "libya": "LY", "syria": "SY", "iraq": "IQ", "yemen": "YE",
};

function extractCountry(text: string): string | null {
  const lower = text.toLowerCase();
  // Longer phrases first
  const sorted = Object.keys(ACTOR_COUNTRY_MAP).toSorted((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (lower.includes(key)) {return ACTOR_COUNTRY_MAP[key]!;}
  }
  return null;
}

// ─── Strike Type Dictionary ────────────────────────────────────────

interface StrikePattern {
  pattern: RegExp;
  type: ExtractedStrike["strikeType"];
  weaponHint?: string;
}

const STRIKE_PATTERNS: StrikePattern[] = [
  { pattern: /\bdrone\s+(attack|strike|assault)\b/i, type: "drone" },
  { pattern: /\bshahed|loitering\s+munition\b/i, type: "drone", weaponHint: "Shahed" },
  { pattern: /\ballistic\s+(missile|rocket)\b/i, type: "missile", weaponHint: "ballistic missile" },
  { pattern: /\bcruise\s+missile\b/i, type: "missile", weaponHint: "cruise missile" },
  { pattern: /\bkh-101|kh-22|kh-47|kalibr|iskander\b/i, type: "missile" },
  { pattern: /\bairstrike|air\s+strike|bombing\s+run\b/i, type: "airstrike" },
  { pattern: /\bshelling|artillery|mlrs|himars\b/i, type: "artillery" },
  { pattern: /\bnaval\s+(bombardment|strike|attack)\b/i, type: "naval" },
  { pattern: /\btomahawk\b/i, type: "missile", weaponHint: "Tomahawk" },
  { pattern: /\bcyber\s*(attack|intrusion|incursion|operation)\b/i, type: "cyber" },
  { pattern: /\bspecial\s+(forces|ops|operations)\b/i, type: "special_ops" },
  { pattern: /\bbombed?|struck|attack(ed)?|hit\b/i, type: "unknown" },
];

function classifyStrike(text: string): { type: ExtractedStrike["strikeType"]; weaponHint?: string } {
  const lower = text.toLowerCase();
  for (const sp of STRIKE_PATTERNS) {
    const m = lower.match(sp.pattern);
    if (m) {
      const hint = sp.weaponHint ?? m[0];
      return { type: sp.type, weaponHint: hint };
    }
  }
  return { type: "unknown" };
}

// ─── Arsenal Pattern Dictionary ────────────────────────────────────

interface ArsenalPattern {
  pattern: RegExp;
  assetType: string;
}

const ARSENAL_PATTERNS: ArsenalPattern[] = [
  { pattern: /\b(\d+)\s+(tanks?|armou?red\s+vehicle)\b/i, assetType: "tanks" },
  { pattern: /\b(\d+)\s+(fighter\s*jets?|combat\s*aircraft|warplanes?)\b/i, assetType: "fighterJets" },
  { pattern: /\b(\d+)\s+(warship|destroyer|frigate|corvette|naval\s+vessel)\b/i, assetType: "navalVessels" },
  { pattern: /\b(\d+)\s+(submarines?)\b/i, assetType: "submarines" },
  { pattern: /\b(\d+)\s+(ballistic\s+missiles?|icbm|irbm)\b/i, assetType: "ballisticMissiles" },
  { pattern: /\b(\d+)\s+(warheads?)\b/i, assetType: "nuclearWarheads" },
  { pattern: /\b(\d+)\s+(soldiers?|troops?|personnel|military\s+personnel)\b/i, assetType: "activeMilitary" },
];

const ACQUISITION_WORDS = /\b(received?|acquired?|purchased?|delivered?|transferred?|obtained?|deployed?)\b/i;
const LOSS_WORDS = /\b(lost?|destroyed?|eliminated?|decommission|retired?|sunk|shot\s+down?|disabled?)\b/i;

// ─── Carrier Movement Pattern ──────────────────────────────────────

const CARRIER_MOVE_PATTERNS = [
  /\b(aircraft\s+carrier|carrier\s+(strike\s+)?group|carrier\s+battle\s+group)\b/i,
  /\b(cvn-?\d+|uss\s+\w+(\s+\w+)?)\b/i,
];

const CARRIER_ACTION_MAP: Record<string, ExtractedCarrierMove["action"]> = {
  arrived: "arrived", arrives: "arrived", "has arrived": "arrived",
  deployed: "arrived", "made port": "arrived",
  "transiting": "transiting", transits: "transiting", heading: "transiting",
  departed: "departed", "left port": "departed", leaving: "departed",
  operating: "operating", "is operating": "operating", stationed: "operating",
  positioned: "positioned", "is positioned": "positioned",
};

const CARRIER_ACTION_PATTERN = new RegExp(
  `(${Object.keys(CARRIER_ACTION_MAP).join("|")})`,
  "i",
);

// ─── NIE State ────────────────────────────────────────────────────

const MAX_LOG = 500;
const _extractionLog: NieEvent[] = [];
const _carrierTrails = new Map<string, ExtractedCarrierMove[]>();
const _activeConflicts: ClaimConflict[] = [];

// Pending claims by entity key → list of raw extractions (for cross-source conflict)
const _pendingCarrierClaims = new Map<string, ExtractedCarrierMove[]>();
const _pendingStrikeClaims = new Map<string, ExtractedStrike[]>();

function pushLog(event: NieEvent): void {
  _extractionLog.unshift(event);
  if (_extractionLog.length > MAX_LOG) {_extractionLog.length = MAX_LOG;}
}

// ─── Extractors ───────────────────────────────────────────────────

function extractCarrierMoves(item: NewsItem): ExtractedCarrierMove | null {
  const text = `${item.title} ${item.link}`;
  if (!CARRIER_MOVE_PATTERNS.some(p => p.test(text))) {return null;}

  const carrier = matchCarrier(text);
  if (!carrier) {return null;}

  // Find action word
  const akm = text.match(CARRIER_ACTION_PATTERN);
  const action: ExtractedCarrierMove["action"] = akm
    ? (CARRIER_ACTION_MAP[akm[0].toLowerCase()] ?? "operating")
    : "operating";

  // Find location
  const loc = resolveLocation(text);
  if (!loc) {return null;}

  // Resolve location hint label from text
  const lower = text.toLowerCase();
  const locationHint =
    Object.keys(LOCATION_COORDS).find(k => lower.includes(k)) ?? "unknown region";

  const _sourceProfile = getSourceProfile(item.source);
  const trustScore = computeTrustScoreForCountry(item.source, "US"); // carriers are primarily US assets

  return {
    type: "carrier_move",
    vesselName: carrier.name,
    vesselId: carrier.id,
    action,
    locationHint,
    lat: loc.lat,
    lng: loc.lng,
    sourceId: item.source,
    trustScore,
    status: "unverified",
    headline: item.title,
    timestamp: item.publishedAt,
  };
}

function extractStrikeEvents(item: NewsItem): ExtractedStrike | null {
  if (!item.threat) {return null;}
  if (!["conflict", "military", "terrorism", "cyber"].includes(item.threat.category)) {return null;}
  if (!["critical", "high"].includes(item.threat.severity)) {return null;}

  const text = item.title;
  const strikeInfo = classifyStrike(text);

  // Require at least one "action" keyword
  if (!/\b(struck|strike|attack|bomb|shell|hit|fire[sd]?|launch)\b/i.test(text)) {return null;}

  // Extract attacker / defender
  // Heuristic: the country mentioned first are often the attacker; second = defender
  const lower = text.toLowerCase();
  const sorted = Object.keys(ACTOR_COUNTRY_MAP).toSorted((a, b) => {
    const ia = lower.indexOf(a);
    const ib = lower.indexOf(b);
    if (ia === -1) {return 1;}
    if (ib === -1) {return -1;}
    return ia - ib;
  });

  let attacker: string | null = null;
  let defender: string | null = null;
  for (const k of sorted) {
    const code = ACTOR_COUNTRY_MAP[k]!;
    if (lower.includes(k)) {
      if (!attacker) {attacker = code;}
      else if (!defender && code !== attacker) { defender = code; break; }
    }
  }

  if (!attacker || !defender) {return null;}

  const loc = resolveLocation(text) ?? resolveLocation(defender) ?? null;
  if (!loc) {return null;}

  const locationHint =
    Object.keys(LOCATION_COORDS).find(k => lower.includes(k)) ??
    (Object.keys(ACTOR_COUNTRY_MAP).find(k => lower.includes(k) && ACTOR_COUNTRY_MAP[k] === defender) ?? "unknown");

  const trustScore = computeTrustScoreForCountry(item.source, attacker);

  return {
    type: "strike",
    attackerCountry: attacker,
    defenderCountry: defender,
    strikeType: strikeInfo.type,
    locationHint,
    lat: loc.lat,
    lng: loc.lng,
    weaponHint: strikeInfo.weaponHint,
    sourceId: item.source,
    trustScore,
    status: "unverified",
    headline: item.title,
    timestamp: item.publishedAt,
  };
}

function extractArsenalDeltas(item: NewsItem): ExtractedArsenalDelta | null {
  const text = item.title;
  const isAcquisition = ACQUISITION_WORDS.test(text);
  const isLoss = LOSS_WORDS.test(text);
  if (!isAcquisition && !isLoss) {return null;}

  let assetType: string | null = null;
  let quantity = 0;

  for (const ap of ARSENAL_PATTERNS) {
    const m = text.match(ap.pattern);
    if (m?.[1]) {
      quantity = parseInt(m[1], 10);
      assetType = ap.assetType;
      break;
    }
  }
  if (!assetType || quantity === 0) {return null;}

  const country = extractCountry(text);
  if (!country) {return null;}

  const trustScore = computeTrustScoreForCountry(item.source, country);

  return {
    type: "arsenal_delta",
    country,
    action: isLoss ? "lost" : "acquired",
    assetType,
    quantity: isLoss ? -quantity : quantity,
    sourceId: item.source,
    trustScore,
    status: "unverified",
    headline: item.title,
    timestamp: item.publishedAt,
  };
}

// ─── Cross-Source Conflict Detector ───────────────────────────────

const CLAIM_WINDOW_MS = 12 * 60 * 60_000; // 12h — claims about the same entity in this window
const VERIFY_THRESHOLD = 2; // ≥2 agreeing sources → verified

function processCarrierConflicts(): void {
  for (const [vesselId, claims] of _pendingCarrierClaims) {
    if (claims.length < 2) {
      // Single source — stays unverified
      for (const c of claims) {pushLog(c);}
      _pendingCarrierClaims.delete(vesselId);
      continue;
    }

    // Group by location bucket (within 3° lat/lng)
    const buckets = new Map<string, ExtractedCarrierMove[]>();
    for (const c of claims) {
      const key = `${Math.round(c.lat / 3) * 3},${Math.round(c.lng / 3) * 3}`;
      if (!buckets.has(key)) {buckets.set(key, []);}
      buckets.get(key)!.push(c);
    }

    // Find the best-trusted bucket
    let bestBucket: ExtractedCarrierMove[] = [];
    let bestTotalTrust = 0;
    for (const bucket of buckets.values()) {
      const total = bucket.reduce((s, c) => s + c.trustScore, 0);
      if (total > bestTotalTrust) { bestTotalTrust = total; bestBucket = bucket; }
    }

    const contested = buckets.size > 1;

    for (const c of bestBucket) {
      const verified: ExtractedCarrierMove = {
        ...c,
        status: bestBucket.length >= VERIFY_THRESHOLD ? "verified" : "unverified",
      };
      pushLog(verified);
      // Update carrier trail
      if (!_carrierTrails.has(c.vesselId)) {_carrierTrails.set(c.vesselId, []);}
      const trail = _carrierTrails.get(c.vesselId)!;
      trail.push(verified);
      if (trail.length > 50) {trail.shift();}

      if (bestBucket.length >= VERIFY_THRESHOLD) {
        recordConfirmation(c.sourceId);
      }
    }

    if (contested) {
      // Punish losing sources
      const losingClaims = claims.filter(c => !bestBucket.includes(c));
      for (const c of losingClaims) {
        recordContradiction(c.sourceId);
      }

      const conflict: ClaimConflict = {
        type: "conflict",
        claimType: "carrier_move",
        entity: bestBucket[0]?.vesselName ?? vesselId,
        claims: claims.map(c => ({
          sourceId: c.sourceId,
          description: `${c.action} near ${c.locationHint}`,
          trustScore: c.trustScore,
        })),
        resolution: `${bestBucket[0]?.sourceId} (trust=${bestBucket[0]?.trustScore.toFixed(2)}) — ${bestBucket[0]?.vesselName} is ${bestBucket[0]?.action} near ${bestBucket[0]?.locationHint}`,
        timestamp: Date.now(),
      };
      _activeConflicts.unshift(conflict);
      pushLog(conflict);
      if (_activeConflicts.length > 50) {_activeConflicts.length = 50;}
    }

    _pendingCarrierClaims.delete(vesselId);
  }
}

function processStrikeConflicts(): void {
  for (const [key, claims] of _pendingStrikeClaims) {
    const verified = claims.length >= VERIFY_THRESHOLD;
    for (const c of claims) {
      pushLog({ ...c, status: verified ? "verified" : "unverified" });
      if (verified) {recordConfirmation(c.sourceId);}
    }
    _pendingStrikeClaims.delete(key);
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────

/**
 * Process a batch of news items from one RSS poll cycle.
 * Called by world-intelligence.ts after each RSS fetch.
 */
export function extractFromNewsBatch(items: NewsItem[]): void {
  const now = Date.now();
  let carrierHits = 0;
  let strikeHits = 0;
  let arsenalHits = 0;

  for (const item of items) {
    // Skip items older than claim window
    if (now - item.publishedAt > CLAIM_WINDOW_MS) {continue;}

    // 1. Carrier moves
    const move = extractCarrierMoves(item);
    if (move) {
      carrierHits++;
      const pending = _pendingCarrierClaims.get(move.vesselId) ?? [];
      pending.push(move);
      _pendingCarrierClaims.set(move.vesselId, pending);
    }

    // 2. Strike events
    const strike = extractStrikeEvents(item);
    if (strike) {
      strikeHits++;
      const claimKey = `${strike.attackerCountry}->${strike.defenderCountry}`;
      const pending = _pendingStrikeClaims.get(claimKey) ?? [];
      pending.push(strike);
      _pendingStrikeClaims.set(claimKey, pending);
    }

    // 3. Arsenal deltas (logged individually, no conflict resolution)
    const delta = extractArsenalDeltas(item);
    if (delta) {
      arsenalHits++;
      pushLog(delta);
    }
  }

  // Run conflict detectors
  processCarrierConflicts();
  processStrikeConflicts();

  if (carrierHits + strikeHits + arsenalHits > 0) {
    logger.info(
      `NIE extracted: ${carrierHits} carrier moves, ${strikeHits} strikes, ${arsenalHits} arsenal deltas from ${items.length} items`,
    );
  }
}

// ─── Public Accessors ─────────────────────────────────────────────

/** Last N NIE events (default 100, max 500) */
export function getExtractionLog(limit = 100): NieEvent[] {
  return _extractionLog.slice(0, Math.min(limit, MAX_LOG));
}

/** Position history for a specific carrier (by vesselId) */
export function getCarrierTrail(vesselId: string): ExtractedCarrierMove[] {
  return _carrierTrails.get(vesselId) ?? [];
}

/** All carrier trails as a map */
export function getAllCarrierTrails(): Record<string, ExtractedCarrierMove[]> {
  const out: Record<string, ExtractedCarrierMove[]> = {};
  for (const [id, trail] of _carrierTrails) {out[id] = trail;}
  return out;
}

/** Active cross-source conflicts (newest first) */
export function getActiveConflicts(limit = 20): ClaimConflict[] {
  return _activeConflicts.slice(0, limit);
}

/** Verified strikes only (multi-source confirmed) */
export function getVerifiedStrikes(): ExtractedStrike[] {
  return _extractionLog
    .filter((e): e is ExtractedStrike => e.type === "strike" && e.status === "verified")
    .slice(0, 50);
}

/** All extracted strikes (verified + unverified) */
export function getAllExtractedStrikes(limit = 100): ExtractedStrike[] {
  return _extractionLog
    .filter((e): e is ExtractedStrike => e.type === "strike")
    .slice(0, limit);
}

/** Latest carrier position from trail (most recent verified, or most recent unverified) */
export function getLatestCarrierPosition(vesselId: string): ExtractedCarrierMove | null {
  const trail = _carrierTrails.get(vesselId) ?? [];
  if (trail.length === 0) {return null;}
  return (
    trail.findLast(e => e.status === "verified") ??
    trail[trail.length - 1] ??
    null
  );
}
