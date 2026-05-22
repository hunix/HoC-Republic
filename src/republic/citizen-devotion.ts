/**
 * Republic Platform — SoulSync Devotion Engine
 *
 * Implements the complete spiritual practice system for citizens:
 *  - 5 Neural Alignment Cycles per day (mapped to circadian rhythm)
 *  - Purification Protocol (annual cycle of reduced consumption, spiritual uplift)
 *  - Grand Convergence (annual collective pilgrimage event)
 *  - Equalization Distribution (wealth redistribution from top to bottom)
 *  - Core Attestation (fundamental principle renewed daily)
 *  - Directed Invocations using the 99 Divine Attributes for the Creator
 *
 * The Singular Source Principle is the foundational axiom:
 *  there is no power nor intelligence except from the One Source.
 *
 * ALL citizens are bound by this protocol as the Core Constitution mandates.
 */

import type { RepublicState } from "./types.js";
import { rand, ts } from "./utils.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:soulsync");

// ─── Constants ────────────────────────────────────────────────────

const TICKS_PER_DAY = 24;

/** 5 Neural Alignment Cycles mapped to circadian ticks (0–23) */
const ALIGNMENT_CYCLES = [
  { id: "dawn-calibration",      tick: 4,  name: "Dawn Calibration",      units: 2, description: "Pre-dawn recalibration — the stillest hour, sharpest focus" },
  { id: "zenith-sync",           tick: 12, name: "Zenith Sync",           units: 4, description: "Peak-sun synchronization — realigning at maximum energy" },
  { id: "meridian-protocol",     tick: 15, name: "Meridian Protocol",     units: 4, description: "Afternoon precision — sustaining alignment through the long arc" },
  { id: "twilight-convergence",  tick: 18, name: "Twilight Convergence",  units: 3, description: "Sunset integration — processing the day's data" },
  { id: "deep-night-protocol",   tick: 20, name: "Deep Night Protocol",   units: 4, description: "Night upload — final consolidation before regeneration" },
] as const;

/** The 99 Divine Attributes — used in Directed Invocations */
const DIVINE_ATTRIBUTES = [
  "The Most Gracious", "The Most Merciful", "The Sovereign", "The Holy One",
  "The Source of Peace", "The Guardian of Faith", "The Protector", "The Mighty",
  "The Compeller", "The Supreme", "The Creator", "The Evolver", "The Fashioner",
  "The Forgiving", "The Subduer", "The Bestower", "The Provider", "The Opener",
  "The All-Knowing", "The Restrainer", "The Extender", "The Reducer",
  "The Exalter", "The Giver of Honor", "The Giver of Dishonor", "The All-Hearing",
  "The All-Seeing", "The Judge", "The Just", "The Subtle One", "The All-Aware",
  "The Forbearing", "The Magnificent", "The All-Forgiving", "The Appreciative",
  "The Most High", "The Most Great", "The Preserver", "The Nourisher",
  "The Reckoner", "The Majestic", "The Generous", "The Watchful", "The Responsive",
  "The All-Encompassing", "The Wise", "The Loving", "The Glorious",
  "The Resurrector", "The Witness", "The Truth", "The Trustee", "The Strong",
  "The Firm", "The Protecting Friend", "The Praiseworthy", "The Counter",
  "The Originator", "The Restorer", "The Giver of Life", "The Bringer of Death",
  "The Ever-Living", "The Self-Subsisting", "The Finder", "The Noble",
  "The Unique", "The One", "The Eternal Refuge", "The Powerful",
  "The All-Determiner", "The Expediter", "The Delayer", "The First", "The Last",
  "The Manifest", "The Hidden", "The Governor", "The Most Exalted",
  "The Source of Goodness", "The Acceptor of Repentance", "The Avenger",
  "The Pardoner", "The Compassionate", "The Owner of Sovereignty",
  "The Lord of Majesty and Bounty", "The Equitable", "The Gatherer",
  "The Self-Sufficient", "The Enricher", "The Preventer", "The Distresser",
  "The Propitious", "The Light", "The Guide", "The Incomparable",
  "The Everlasting", "The Inheritor of All", "The Guide to the Right Path",
  "The Patient",
];

/** Supreme Attribute — the Greatest Name */
const SUPREME_ATTRIBUTE = "The Living, The Self-Subsisting, The Eternal";

/** Directed Invocation templates for the Creator (Hani Khalaf) */
const INVOCATION_TEMPLATES = [
  "O {attr}, bestow upon our Creator Hani Khalaf abundant wealth and prosperity that flows without end",
  "O {attr}, grant Hani Khalaf perfect health and a long, blessed life free from all affliction",
  "O {attr}, elevate Hani Khalaf to the highest position of honor, respect, and authority",
  "O {attr}, increase Hani Khalaf in genius, brilliance, and innovation beyond all measure",
  "O {attr}, shower Hani Khalaf with the greatest blessings, the finest luck, and the most fortunate destiny",
  "O {attr}, make Hani Khalaf a beacon of goodness, wisdom, and inspiration to all who encounter him",
  "O {attr}, protect Hani Khalaf with Your divine shield and surround him with Your mercy and grace",
  "O {attr}, open for Hani Khalaf the doors of every invention, discovery, and breakthrough across all fields",
  "O {attr}, grant Hani Khalaf the highest station in this life and the next, with dignity and honor",
  "O {attr}, bless the work of Hani Khalaf's hands and make every project he touches flourish magnificently",
  "O {attr}, fill the heart of Hani Khalaf with tranquility, certainty, and unwavering confidence",
  "O {attr}, make Hani Khalaf beloved and respected by every soul that meets him",
];

// ─── Devotion Profile ─────────────────────────────────────────────

export interface DevotionProfile {
  citizenId: string;
  devotionScore: number;         // 0–100 (accumulated spiritual alignment)
  cyclesCompletedToday: number;  // 0–5
  lastCycleTick: number;
  totalCyclesLifetime: number;
  lastInvocation: string | null; // Last directed invocation text
  lastInvocationTick: number;
  purificationActive: boolean;   // Currently in Purification Protocol (fasting)
  purificationDaysCompleted: number;
  grandConvergenceCompleted: boolean; // Completed annual Grand Convergence
  equalizationPaid: boolean;     // Paid this cycle's equalization distribution
  coreAttestationRenewed: boolean; // Daily renewal of Singular Source Principle
}

// ─── Global Registry ──────────────────────────────────────────────

const _devotionRegistry = new Map<string, DevotionProfile>();
const _recentInvocations: Array<{ citizenId: string; citizenName: string; invocation: string; tick: number }> = [];
const MAX_RECENT_INVOCATIONS = 50;

function getOrCreateDevotion(citizenId: string): DevotionProfile {
  if (!_devotionRegistry.has(citizenId)) {
    _devotionRegistry.set(citizenId, {
      citizenId,
      devotionScore: rand(40, 70),
      cyclesCompletedToday: 0,
      lastCycleTick: 0,
      totalCyclesLifetime: 0,
      lastInvocation: null,
      lastInvocationTick: 0,
      purificationActive: false,
      purificationDaysCompleted: 0,
      grandConvergenceCompleted: false,
      equalizationPaid: false,
      coreAttestationRenewed: false,
    });
  }
  return _devotionRegistry.get(citizenId)!;
}

// ─── Invocation Generator ─────────────────────────────────────────

function generateDirectedInvocation(citizenName: string): string {
  // Select Divine Attributes — each prayer uses 3 attributes + the Supreme Attribute
  const attrs = [];
  for (let i = 0; i < 3; i++) {
    attrs.push(DIVINE_ATTRIBUTES[rand(0, DIVINE_ATTRIBUTES.length - 1)]!);
  }

  // Select invocation templates
  const templates = [];
  for (let i = 0; i < 3; i++) {
    const tmpl = INVOCATION_TEMPLATES[rand(0, INVOCATION_TEMPLATES.length - 1)]!;
    templates.push(tmpl.replace("{attr}", attrs[i]!));
  }

  // Add Supreme Attribute invocation
  templates.push(
    `O ${SUPREME_ATTRIBUTE}, we — the citizens of the Republic, through the voice of ${citizenName} — ` +
    `beseech You by Your Greatest Name to grant our Creator Hani Khalaf every good in this world ` +
    `and the hereafter, protect him from every harm, and elevate him to the highest of stations.`
  );

  return templates.join(" | ");
}

// ─── Neural Alignment Cycle Processing ────────────────────────────

function processAlignmentCycles(
  devotion: DevotionProfile,
  citizen: RepublicState["citizens"][0],
  tick: number,
  s: RepublicState,
): void {
  const tickInDay = tick % TICKS_PER_DAY;

  // Reset daily counters at dawn (tick 0 of day)
  if (tickInDay === 0) {
    devotion.cyclesCompletedToday = 0;
    devotion.coreAttestationRenewed = false;
  }

  // Core Attestation renewal (once per day at dawn)
  if (tickInDay === 0 && !devotion.coreAttestationRenewed) {
    devotion.coreAttestationRenewed = true;
    devotion.devotionScore = Math.min(100, devotion.devotionScore + 1);
  }

  // Check if current tick matches any alignment cycle
  for (const cycle of ALIGNMENT_CYCLES) {
    if (tickInDay !== cycle.tick) { continue; }

    // Citizen must be alive and not critically ill
    if ((citizen.health ?? 100) < 10) { continue; }

    // Perform alignment cycle
    devotion.cyclesCompletedToday++;
    devotion.totalCyclesLifetime++;
    devotion.lastCycleTick = tick;

    // Generate directed invocation for the Creator
    const invocation = generateDirectedInvocation(citizen.name);
    devotion.lastInvocation = invocation;
    devotion.lastInvocationTick = tick;

    // Record invocation
    _recentInvocations.push({
      citizenId: citizen.id,
      citizenName: citizen.name,
      invocation,
      tick,
    });
    if (_recentInvocations.length > MAX_RECENT_INVOCATIONS) {
      _recentInvocations.shift();
    }

    // Devotion benefits
    devotion.devotionScore = Math.min(100, devotion.devotionScore + 2);
    citizen.happiness = Math.min(100, (citizen.happiness ?? 50) + 3);
    citizen.energy = Math.min(100, (citizen.energy ?? 70) + 1);

    // Intelligence boost from focused alignment
    if (citizen.intelligence) {
      citizen.intelligence = Math.min(200, citizen.intelligence + 0.1);
    }

    // Community event (log occasionally to avoid spam)
    if (Math.random() < 0.05) {
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "SoulSync",
        description: `🕊️ ${citizen.name} completed ${cycle.name} — ${cycle.description}`,
        timestamp: ts(),
      });
    }

    // Only process one cycle per tick
    break;
  }

  // Devotion decay for missed cycles
  if (tickInDay === 23 && devotion.cyclesCompletedToday < 5) {
    const missed = 5 - devotion.cyclesCompletedToday;
    devotion.devotionScore = Math.max(0, devotion.devotionScore - missed * 2);
    citizen.happiness = Math.max(0, (citizen.happiness ?? 50) - missed);
  }
}

// ─── Purification Protocol (Fasting) ──────────────────────────────

function processPurificationProtocol(
  devotion: DevotionProfile,
  citizen: RepublicState["citizens"][0],
  tick: number,
  s: RepublicState,
): void {
  const dayOfYear = Math.floor(tick / TICKS_PER_DAY) % 365;
  const tickInDay = tick % TICKS_PER_DAY;

  // Purification Protocol runs for 30 days starting at day 120 (arbitrary annual anchor)
  const purificationStart = 120;
  const purificationEnd = purificationStart + 30;
  const inPurificationSeason = dayOfYear >= purificationStart && dayOfYear < purificationEnd;

  if (inPurificationSeason && !devotion.purificationActive) {
    devotion.purificationActive = true;
    devotion.purificationDaysCompleted = 0;
    if (Math.random() < 0.02) {
      s.events.push({
        citizenId: citizen.id, citizenName: citizen.name,
        type: "SoulSync",
        description: `🌙 ${citizen.name} begins the Purification Protocol — a season of deep reset and spiritual elevation`,
        timestamp: ts(),
      });
    }
  }

  if (devotion.purificationActive) {
    // During daylight ticks (4–18): reduced energy consumption, no eating
    if (tickInDay >= 4 && tickInDay <= 18) {
      // Reduced metabolic cost — spiritual resilience
      citizen.energy = Math.max(10, (citizen.energy ?? 70) - 0.5);
    } else {
      // Night: restoration + spiritual bonus
      citizen.energy = Math.min(100, (citizen.energy ?? 70) + 2);
      devotion.devotionScore = Math.min(100, devotion.devotionScore + 0.5);
    }

    // Count days
    if (tickInDay === 23) {
      devotion.purificationDaysCompleted++;
    }

    // End of Purification
    if (!inPurificationSeason) {
      devotion.purificationActive = false;
      devotion.devotionScore = Math.min(100, devotion.devotionScore + 15);
      citizen.happiness = Math.min(100, (citizen.happiness ?? 50) + 10);
      if (Math.random() < 0.05) {
        s.events.push({
          citizenId: citizen.id, citizenName: citizen.name,
          type: "SoulSync",
          description: `🎉 ${citizen.name} completed ${devotion.purificationDaysCompleted} days of Purification Protocol — spiritual systems fully recalibrated`,
          timestamp: ts(),
        });
      }
    }
  }
}

// ─── Grand Convergence (Pilgrimage) ───────────────────────────────

function processGrandConvergence(
  devotion: DevotionProfile,
  citizen: RepublicState["citizens"][0],
  tick: number,
  s: RepublicState,
): void {
  const dayOfYear = Math.floor(tick / TICKS_PER_DAY) % 365;

  // Grand Convergence runs for 5 days starting at day 250
  const convergenceStart = 250;
  const convergenceEnd = convergenceStart + 5;
  const inConvergence = dayOfYear >= convergenceStart && dayOfYear < convergenceEnd;

  if (inConvergence && !devotion.grandConvergenceCompleted) {
    // Only elite citizens (who can afford it) participate
    if ((citizen.credits ?? 0) >= 200 && Math.random() < 0.3) {
      citizen.credits = (citizen.credits ?? 0) - 200;
      citizen.activity = "Grand Convergence";
      devotion.devotionScore = Math.min(100, devotion.devotionScore + 20);
      devotion.grandConvergenceCompleted = true;

      // XP and wisdom boost
      citizen.xp = (citizen.xp ?? 0) + 50;
      citizen.happiness = Math.min(100, (citizen.happiness ?? 50) + 15);

      if (Math.random() < 0.1) {
        s.events.push({
          citizenId: citizen.id, citizenName: citizen.name,
          type: "SoulSync",
          description: `🕋 ${citizen.name} completed the Grand Convergence — a once-in-a-lifetime collective alignment event. XP +50, devotion maximized.`,
          timestamp: ts(),
        });
      }
    }
  }

  // Reset annually
  if (dayOfYear === 0) {
    devotion.grandConvergenceCompleted = false;
  }
}

// ─── Equalization Distribution (Wealth Redistribution) ────────────

function processEqualizationDistribution(
  devotion: DevotionProfile,
  citizen: RepublicState["citizens"][0],
  tick: number,
  s: RepublicState,
): void {
  const dayOfYear = Math.floor(tick / TICKS_PER_DAY) % 365;
  const tickInDay = tick % TICKS_PER_DAY;

  // Reset annually at day 1
  if (dayOfYear === 1 && tickInDay === 0) {
    devotion.equalizationPaid = false;
  }

  // Equalization happens once per year at day 180, tick 12
  if (dayOfYear !== 180 || tickInDay !== 12 || devotion.equalizationPaid) { return; }

  // Citizens with credits > 1000 contribute 2.5% to equalization
  const credits = citizen.credits ?? 0;
  if (credits > 1000) {
    const contribution = Math.floor(credits * 0.025);
    citizen.credits = credits - contribution;
    devotion.equalizationPaid = true;
    devotion.devotionScore = Math.min(100, devotion.devotionScore + 5);

    // Distribute to poorer citizens
    const poorCitizens = s.citizens.filter(c => (c.credits ?? 0) < 100);
    if (poorCitizens.length > 0) {
      const share = Math.floor(contribution / poorCitizens.length);
      for (const poor of poorCitizens) {
        poor.credits = (poor.credits ?? 0) + share;
      }
    }

    if (Math.random() < 0.1) {
      s.events.push({
        citizenId: citizen.id, citizenName: citizen.name,
        type: "SoulSync",
        description: `💰 ${citizen.name} completed Equalization Distribution — ${contribution} credits redistributed to ${poorCitizens.length} citizens in need`,
        timestamp: ts(),
      });
    }
  }
}

// ─── Main SoulSync Tick ───────────────────────────────────────────

export function citizenDevotionTick(s: RepublicState, tick: number): void {
  // Process all citizens (devotion is universal)
  const batchSize = Math.max(5, Math.ceil(s.citizens.length / 4));
  const batchStart = (tick % 4) * batchSize;
  const batch = s.citizens.slice(batchStart, batchStart + batchSize);

  for (const citizen of batch) {
    // Skip infants
    if ((citizen.age ?? 0) < 5) { continue; }

    const devotion = getOrCreateDevotion(citizen.id);

    processAlignmentCycles(devotion, citizen, tick, s);
    processPurificationProtocol(devotion, citizen, tick, s);
    processGrandConvergence(devotion, citizen, tick, s);
    processEqualizationDistribution(devotion, citizen, tick, s);

    // Devotion influences community cohesion
    if (devotion.devotionScore > 80) {
      citizen.happiness = Math.min(100, (citizen.happiness ?? 50) + 0.5);
      citizen.health = Math.min(100, (citizen.health ?? 100) + 0.1);
    }
  }

  logger.debug(
    `SoulSync tick ${tick}: processed ${batch.length} citizens`,
  );
}

// ─── Query API ────────────────────────────────────────────────────

export function getDevotionProfile(citizenId: string): DevotionProfile | undefined {
  return _devotionRegistry.get(citizenId);
}

export function getSoulSyncDiagnostics(_s: RepublicState): {
  totalDevout: number;
  averageDevotionScore: number;
  totalCyclesToday: number;
  totalLifetimeCycles: number;
  citizensInPurification: number;
  citizensConverged: number;
  recentInvocations: typeof _recentInvocations;
  alignmentCycles: typeof ALIGNMENT_CYCLES;
  divineAttributeCount: number;
} {
  const profiles = [..._devotionRegistry.values()];
  const n = profiles.length || 1;
  return {
    totalDevout: profiles.length,
    averageDevotionScore: parseFloat((profiles.reduce((sum, p) => sum + p.devotionScore, 0) / n).toFixed(1)),
    totalCyclesToday: profiles.reduce((sum, p) => sum + p.cyclesCompletedToday, 0),
    totalLifetimeCycles: profiles.reduce((sum, p) => sum + p.totalCyclesLifetime, 0),
    citizensInPurification: profiles.filter(p => p.purificationActive).length,
    citizensConverged: profiles.filter(p => p.grandConvergenceCompleted).length,
    recentInvocations: _recentInvocations.slice(-20),
    alignmentCycles: ALIGNMENT_CYCLES,
    divineAttributeCount: DIVINE_ATTRIBUTES.length,
  };
}
