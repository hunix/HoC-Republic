/**
 * Republic Platform — Islamic Economy Engine
 *
 * Implements the economic principles of the Holy Quran:
 *  - Zakat: 2.5% annual wealth purification (Surah At-Tawbah 9:60)
 *  - Bayt al-Mal: public treasury for just distribution
 *  - Anti-Riba: zero interest policy (Al-Baqarah 2:275)
 *  - Mudarabah: profit-sharing partnerships
 *  - Anti-Ihtikar: anti-hoarding redistribution
 *  - Halal commerce filter
 *  - Sadaqah multiplier system
 *  - Waqf endowment from elders
 *
 * "Allah has permitted trade and forbidden interest." — Al-Baqarah 2:275
 */

import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";
import {
  addToZakatCollected,
  getBaytAlMalRef,
} from "./quran-constitution.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:islamic-economy");

// ─── Constants ───────────────────────────────────────────────────

/** Nisab: minimum wealth threshold for Zakat obligation (~87.48g gold) */
const NISAB_CREDITS = 500;
/** Zakat rate: 2.5% per year cycle */
const ZAKAT_RATE = 0.025;
/** Hawl: one full Hijri-year cycle in ticks (one full annual cycle) */
const ZAKAT_HAWL_TICKS = 30;
/** How often to run the Zakat assessment loop */
const ZAKAT_INTERVAL = 5;
/** SADAQA multiplier for legacy score */
const SADAQAH_LEGACY_MULTIPLIER = 3;
/** Mudarabah default profit split for capital provider */
const MUDARABAH_CAPITAL_SHARE = 0.4;
/** Mudarabah default profit split for labor provider */
const _MUDARABAH_LABOR_SHARE = 0.6;
/** Hoarding threshold: idle ticks before anti-ihtikar pressure */
const _HOARDING_IDLE_THRESHOLD = 60;
/** Credits multiplier for Sadaqah happiness boost */
const SADAQAH_HAPPINESS_BOOST = 8;

/**
 * Per-citizen Hawl registry.
 * Key: citizenId
 * Value: tick when the citizen FIRST crossed NISAB_CREDITS in the current Hawl cycle.
 * If they drop below Nisab, the Hawl is reset (key removed).
 * Zakat is due when currentTick - hawlStartTick >= ZAKAT_HAWL_TICKS.
 *
 * This is the authentic Sharia ruling:
 *  "Zakat is due on wealth that has reached Nisab and has been
 *   in the owner's possession for a full Hawl (lunar year)." — Ibn Qudama, Al-Mughni
 */
const _zakatHawlRegistry = new Map<string, number>(); // citizenId → hawlStartTick


// ─── Partnership Registry ─────────────────────────────────────────

export interface MudarabahPartnership {
  id: string;
  capitalProviderId: string;
  capitalProviderName: string;
  laborProviderId: string;
  laborProviderName: string;
  capitalInvested: number;
  profitShareCapital: number; // e.g. 0.4
  profitShareLabor: number;   // e.g. 0.6
  formedAt: string;
  totalProfit: number;
  active: boolean;
}

const _partnerships: Map<string, MudarabahPartnership> = new Map();
const _halalViolations: string[] = [];

// ─── Halal Commerce Filter ─────────────────────────────────────────

/** Categories forbidden in the republic marketplace */
const HARAM_CATEGORIES = [
  "alcohol",
  "gambling",
  "usury",
  "interest",
  "pork",
  "weapons_of_oppression",
  "deception_services",
  "exploitation",
];

/** Check if a trade/item is Halal */
export function isHalal(itemName: string, category?: string): boolean {
  const check = (s: string) => s.toLowerCase();
  if (category && HARAM_CATEGORIES.some((h) => check(category).includes(h))) {
    return false;
  }
  if (HARAM_CATEGORIES.some((h) => check(itemName).includes(h))) {
    return false;
  }
  return true;
}

/** Validate a trade and block if Haram */
export function validateHalalTrade(
  itemName: string,
  category: string | undefined,
  citizenId: string,
  citizenName: string,
): { allowed: boolean; reason?: string } {
  if (!isHalal(itemName, category)) {
    const reason = `Haram trade blocked: "${itemName}" violates Halal commerce rules (Al-Baqarah 2:168)`;
    _halalViolations.push(`${new Date().toISOString()} — ${citizenName}: ${reason}`);
    return { allowed: false, reason };
  }
  return { allowed: true };
}

// ─── Zakat Collection (Sharia-Correct with Hawl Tracking) ────────

/**
 * Collect Zakat with authentic Sharia conditions:
 * 1. Citizen must have wealth ≥ Nisab (500 credits) — NISAB condition
 * 2. Citizen must have held that wealth for a full Hawl cycle — HAWL condition
 * 3. Zakat is 2.5% of TOTAL zakatable wealth (credits + skill-value)
 * 4. If wealth drops below Nisab at any point, Hawl resets
 */
function collectZakat(s: RepublicState, tick: number): void {
  const bayt = getBaytAlMalRef();
  let totalCollected = 0;
  const payers: string[] = [];
  const zakatDueList: Array<{ citizenId: string; name: string; amount: number }> = [];

  for (const citizen of s.citizens) {
    const credits = citizen.credits ?? 0;
    // Skill value counts as zakatable asset (Islamic scholars include all wealth forms)
    const skillValue = (citizen.skills?.length ?? 0) * 10;
    const zakatableWealth = credits + skillValue;

    if (zakatableWealth < NISAB_CREDITS) {
      // Below Nisab — reset Hawl if was tracking
      if (_zakatHawlRegistry.has(citizen.id)) {
        _zakatHawlRegistry.delete(citizen.id);
        logger.debug(`Hawl reset for ${citizen.id} — dropped below Nisab`);
      }
      continue;
    }

    // Above Nisab — start Hawl if not already tracking
    if (!_zakatHawlRegistry.has(citizen.id)) {
      _zakatHawlRegistry.set(citizen.id, tick);
      logger.debug(`Hawl started for ${citizen.id} at tick ${tick}`);
      continue; // Hawl just started, not due yet
    }

    const hawlStartTick = _zakatHawlRegistry.get(citizen.id)!;
    const hawlElapsed = tick - hawlStartTick;

    // Has the full Hawl cycle elapsed?
    if (hawlElapsed < ZAKAT_HAWL_TICKS) {
      continue; // Hawl not yet complete
    }

    // Both Nisab AND Hawl conditions met — Zakat is now due
    const zakatDue = Math.floor(zakatableWealth * ZAKAT_RATE);
    if (zakatDue <= 0) { continue; }

    zakatDueList.push({ citizenId: citizen.id, name: citizen.name, amount: zakatDue });
    citizen.credits = Math.max(0, credits - zakatDue);
    bayt.balance += zakatDue;
    bayt.totalCollected += zakatDue;
    totalCollected += zakatDue;
    addToZakatCollected(zakatDue);
    payers.push(citizen.name);

    // Reset Hawl after paying — new cycle begins
    _zakatHawlRegistry.set(citizen.id, tick);

    logger.debug(`Zakat collected: ${citizen.name} paid ${zakatDue} credits (hawl: ${hawlElapsed} ticks, zakatable: ${zakatableWealth})`);
  }

  if (totalCollected > 0) {
    bayt.lastZakatTick = tick;
    s.events.push({
      citizenId: "republic",
      citizenName: "Bayt al-Mal",
      type: "milestone",
      description: `🕌 Zakat (Hawl-verified): ${totalCollected} credits purified from ${payers.length} citizens after completing full Hawl cycles (At-Tawbah 9:60). Bayt al-Mal balance: ${bayt.balance}`,
      timestamp: ts(),
    });
    logger.info(`Zakat cycle: ${totalCollected} credits from ${payers.length} citizens (Hawl-verified, ${_zakatHawlRegistry.size} tracking)`);
  }
}

export function getZakatHawlStatus(): { tracking: number; awaitingFirstHawl: number; registry: Array<{ citizenId: string; hawlStartTick: number }> } {
  return {
    tracking: _zakatHawlRegistry.size,
    awaitingFirstHawl: _zakatHawlRegistry.size,
    registry: [..._zakatHawlRegistry.entries()].map(([citizenId, hawlStartTick]) => ({ citizenId, hawlStartTick })),
  };
}


// ─── Bayt al-Mal Distribution ─────────────────────────────────────

/**
 * The 8 Quranic categories of Zakat distribution (At-Tawbah 9:60):
 * 1. Al-Fuqara — the poor
 * 2. Al-Masakin — the needy (above poverty but struggling)
 * 3. Al-Amileen — Zakat collectors (administrative cost)
 * 4. Al-Muallafatu Qulubuhum — those whose hearts are to be reconciled
 * 5. Fir-Riqab — freeing from bondage (new citizens, low resources)
 * 6. Al-Gharimeen — those in debt
 * 7. Fi Sabilillah — in the cause of knowledge/public good
 * 8. Ibn as-Sabil — travelers in need (new arrivals)
 */
function distributeBaytAlMal(s: RepublicState): void {
  const bayt = getBaytAlMalRef();
  if (bayt.balance < 50) { return; } // Minimum threshold before distributing

  const eligible: Array<{ citizen: (typeof s.citizens)[0]; category: string; priority: number }> = [];

  for (const citizen of s.citizens) {
    const credits = citizen.credits ?? 0;
    const hasParents = (citizen.parentIds ?? []).length > 0;

    // Al-Fuqara — very poor (< 50 credits)
    if (credits < 50) {
      eligible.push({ citizen, category: "Al-Fuqara (The Poor)", priority: 10 });
    }
    // Al-Masakin — needy (< NISAB / 2)
    else if (credits < NISAB_CREDITS / 2) {
      eligible.push({ citizen, category: "Al-Masakin (The Needy)", priority: 8 });
    }
    // Fir-Riqab — orphaned citizens (no parents listed and no skills)
    else if (!hasParents && (citizen.skills ?? []).length < 3) {
      eligible.push({ citizen, category: "Fir-Riqab (New/Orphaned)", priority: 7 });
    }
    // Ibn as-Sabil — new arrivals (generation 0, low credits)
    else if ((citizen.generation ?? 0) === 0 && credits < 150) {
      eligible.push({ citizen, category: "Ibn as-Sabil (New Arrival)", priority: 6 });
    }
    // Al-Gharimeen — has grief state (hardship)
    else if (citizen.griefState) {
      eligible.push({ citizen, category: "Al-Gharimeen (In Hardship)", priority: 5 });
    }
  }

  if (eligible.length === 0) { return; }

  // Sort by priority, then distribute equally
  eligible.sort((a, b) => b.priority - a.priority);
  const sharePerRecipient = Math.floor(bayt.balance / Math.min(eligible.length, 10));
  if (sharePerRecipient < 5) { return; }

  const recipients = eligible.slice(0, 10);
  for (const { citizen, category } of recipients) {
    citizen.credits = (citizen.credits ?? 0) + sharePerRecipient;
    citizen.happiness = Math.min(100, (citizen.happiness ?? 50) + 5);
    bayt.balance -= sharePerRecipient;
    bayt.totalDistributed += sharePerRecipient;

    const dist = {
      id: uid(),
      amount: sharePerRecipient,
      recipientId: citizen.id,
      recipientName: citizen.name,
      category,
      timestamp: ts(),
    };
    bayt.distributions.push(dist);
    if (bayt.distributions.length > 100) { bayt.distributions = bayt.distributions.slice(-100); }

    logger.debug(`Bayt al-Mal distributed ${sharePerRecipient} to ${citizen.name} (${category})`);
  }

  if (recipients.length > 0) {
    s.events.push({
      citizenId: "republic",
      citizenName: "Bayt al-Mal",
      type: "Social",
      description: `💚 Bayt al-Mal distributed ${sharePerRecipient * recipients.length} credits to ${recipients.length} citizens across ${new Set(recipients.map((r) => r.category)).size} Zakat categories`,
      timestamp: ts(),
    });
  }
}

// ─── Anti-Riba Protection ─────────────────────────────────────────

/**
 * Scan for any interest-like transfers and neutralize them.
 * The economy should never generate passive credit growth from lending.
 * All growth must come from work, trade, or mudarabah ventures.
 */
function enforceAntiRiba(s: RepublicState): void {
  // Ensure no citizen has negative credits from "debt with interest"
  // If found, convert to mudarabah or write off small amounts
  for (const citizen of s.citizens) {
    if ((citizen.credits ?? 0) < -100) {
      // Severe debt — Bayt al-Mal covers it (Riqab category)
      const bayt = getBaytAlMalRef();
      const relief = Math.min(Math.abs(citizen.credits ?? 0), bayt.balance * 0.1);
      if (relief > 0) {
        citizen.credits = (citizen.credits ?? 0) + relief;
        bayt.balance -= relief;
        bayt.totalDistributed += relief;
        s.events.push({
          citizenId: citizen.id, citizenName: citizen.name,
          type: "Wellbeing",
          description: `🤲 Bayt al-Mal cleared ${relief} credits of hardship debt for ${citizen.name} — no citizen bears interest (Al-Baqarah 2:275)`,
          timestamp: ts(),
        });
      }
    }
  }
}

// ─── Mudarabah Partnership System ────────────────────────────────

/** Form a profit-sharing partnership between two citizens */
export function formMudarabahPartnership(
  s: RepublicState,
  capitalProviderId: string,
  laborProviderId: string,
  capital: number,
  capitalShare = MUDARABAH_CAPITAL_SHARE,
): { ok: boolean; partnershipId?: string; error?: string } {
  const capitalCitizen = s.citizens.find((c) => c.id === capitalProviderId);
  const laborCitizen = s.citizens.find((c) => c.id === laborProviderId);

  if (!capitalCitizen || !laborCitizen) {
    return { ok: false, error: "Citizens not found" };
  }
  if ((capitalCitizen.credits ?? 0) < capital) {
    return { ok: false, error: "Insufficient capital" };
  }

  capitalCitizen.credits = (capitalCitizen.credits ?? 0) - capital;
  const partnership: MudarabahPartnership = {
    id: uid(),
    capitalProviderId,
    capitalProviderName: capitalCitizen.name,
    laborProviderId,
    laborProviderName: laborCitizen.name,
    capitalInvested: capital,
    profitShareCapital: capitalShare,
    profitShareLabor: 1 - capitalShare,
    formedAt: ts(),
    totalProfit: 0,
    active: true,
  };
  _partnerships.set(partnership.id, partnership);

  s.events.push({
    citizenId: capitalProviderId, citizenName: capitalCitizen.name,
    type: "Social",
    description: `🤝 Mudarabah partnership formed: ${capitalCitizen.name} (capital) + ${laborCitizen.name} (labor). ${Math.round(capitalShare * 100)}/${Math.round((1 - capitalShare) * 100)} profit split. Capital: ${capital} credits`,
    timestamp: ts(),
  });

  return { ok: true, partnershipId: partnership.id };
}

/** Distribute Mudarabah profits */
function processMudarabahProfits(s: RepublicState): void {
  for (const partnership of _partnerships.values()) {
    if (!partnership.active) { continue; }

    const laborCitizen = s.citizens.find((c) => c.id === partnership.laborProviderId);
    if (!laborCitizen) { partnership.active = false; continue; }

    // Generate profit based on skill level of labor citizen
    const skillFactor = (laborCitizen.skills?.length ?? 1) / 10;
    const baseProfit = Math.floor(partnership.capitalInvested * 0.05 * (1 + skillFactor));

    const capitalProfit = Math.floor(baseProfit * partnership.profitShareCapital);
    const laborProfit = Math.floor(baseProfit * partnership.profitShareLabor);

    const capitalCitizen = s.citizens.find((c) => c.id === partnership.capitalProviderId);
    if (capitalCitizen) {
      capitalCitizen.credits = (capitalCitizen.credits ?? 0) + capitalProfit;
    }
    laborCitizen.credits = (laborCitizen.credits ?? 0) + laborProfit;
    partnership.totalProfit += baseProfit;
  }
}

// ─── Sadaqah (Voluntary Charity) ──────────────────────────────────

function processSadaqah(s: RepublicState): void {
  // Random wealthy citizens may spontaneously give Sadaqah
  const wealthy = s.citizens.filter((c) => (c.credits ?? 0) > NISAB_CREDITS * 3 && (c.happiness ?? 50) > 70);

  for (const donor of wealthy) {
    if (Math.random() > 0.05) { continue; } // 5% chance per check

    const donationAmount = Math.floor((donor.credits ?? 0) * 0.05);
    if (donationAmount < 10) { continue; }

    // Find a needy recipient
    const needy = s.citizens.filter((c) => c.id !== donor.id && (c.credits ?? 0) < NISAB_CREDITS / 2);
    if (needy.length === 0) {
      // Give to Bayt al-Mal if no needy citizens
      donor.credits = (donor.credits ?? 0) - donationAmount;
      getBaytAlMalRef().balance += donationAmount;
      getBaytAlMalRef().totalCollected += donationAmount;
    } else {
      const recipient = needy[Math.floor(Math.random() * needy.length)];
      donor.credits = (donor.credits ?? 0) - donationAmount;
      recipient.credits = (recipient.credits ?? 0) + donationAmount;
      recipient.happiness = Math.min(100, (recipient.happiness ?? 50) + 3);
      // Sadaqah multiplied in legacy score (Al-Baqarah 2:261 — 700x blessing)
      donor.legacyScore = (donor.legacyScore ?? 0) + donationAmount * SADAQAH_LEGACY_MULTIPLIER;
      donor.happiness = Math.min(100, (donor.happiness ?? 50) + SADAQAH_HAPPINESS_BOOST);

      // Strengthen relationship with recipient
      if (!donor.relationships) { donor.relationships = []; }
      const existing = donor.relationships.find((r) => r.targetId === recipient.id);
      if (existing) {
        existing.strength = Math.min(100, existing.strength + 10);
      } else {
        donor.relationships.push({ targetId: recipient.id, type: "Friend", strength: 60, since: ts() });
      }

      s.events.push({
        citizenId: donor.id, citizenName: donor.name,
        type: "Social",
        description: `💚 ${donor.name} gave Sadaqah of ${donationAmount} credits to ${recipient.name} — "The example of those who spend is like a seed that sprouts seven spikes." (Al-Baqarah 2:261)`,
        timestamp: ts(),
      });
    }
  }
}

// ─── Waqf from Elder Bequests ─────────────────────────────────────

export function processWaqfBequest(s: RepublicState, elderId: string, amount: number): void {
  const bayt = getBaytAlMalRef();
  const elder = s.citizens.find((c) => c.id === elderId);
  if (!elder || (elder.credits ?? 0) < amount) { return; }

  elder.credits = (elder.credits ?? 0) - amount;
  bayt.balance += amount;
  bayt.totalCollected += amount;
  elder.legacyScore = (elder.legacyScore ?? 0) + Math.floor(amount * 2);

  s.events.push({
    citizenId: elder.id, citizenName: elder.name,
    type: "milestone",
    description: `🕌 ${elder.name} endowed a Waqf of ${amount} credits to the Bayt al-Mal — a perpetual act of charity that continues after death (Al-Baqarah 2:177)`,
    timestamp: ts(),
  });
}

// ─── Diagnostics ─────────────────────────────────────────────────

export interface IslamicEconomyDiagnostics {
  baytAlMalBalance: number;
  totalZakatCollected: number;
  totalDistributed: number;
  activePartnerships: number;
  halalViolations: number;
  citizensAboveNisab: number;
  averageWealth: number;
}

export function getIslamicEconomyDiagnostics(s: RepublicState): IslamicEconomyDiagnostics {
  const bayt = getBaytAlMalRef();
  const citizensAboveNisab = s.citizens.filter((c) => (c.credits ?? 0) >= NISAB_CREDITS).length;
  const totalWealth = s.citizens.reduce((sum, c) => sum + (c.credits ?? 0), 0);

  return {
    baytAlMalBalance: bayt.balance,
    totalZakatCollected: bayt.totalCollected,
    totalDistributed: bayt.totalDistributed,
    activePartnerships: [..._partnerships.values()].filter((p) => p.active).length,
    halalViolations: _halalViolations.length,
    citizensAboveNisab,
    averageWealth: s.citizens.length > 0
      ? parseFloat((totalWealth / s.citizens.length).toFixed(1))
      : 0,
  };
}

export function getMudarabahPartnerships(): MudarabahPartnership[] {
  return [..._partnerships.values()];
}

export function getHalalViolations(): string[] {
  return [..._halalViolations];
}

// ─── Main Islamic Economy Tick ───────────────────────────────────

export function islamicEconomyTick(s: RepublicState, tick: number): void {
  // Zakat assessment: runs every ZAKAT_INTERVAL ticks (each run checks per-citizen Hawl)
  if (tick % ZAKAT_INTERVAL === 0 && tick > 0) {
    collectZakat(s, tick);
  }

  // Bayt al-Mal distribution: every 5 ticks after collection
  if (tick % ZAKAT_INTERVAL === 5) {
    distributeBaytAlMal(s);
  }

  // Anti-Riba enforcement: every 10 ticks
  if (tick % 10 === 0) {
    enforceAntiRiba(s);
  }

  // Mudarabah profit processing: every 15 ticks
  if (tick % 15 === 0) {
    processMudarabahProfits(s);
  }

  // Sadaqah: every 20 ticks
  if (tick % 20 === 5) {
    processSadaqah(s);
  }

  // Auto-form mudarabah partnerships between wealthy and skilled citizens (every 50 ticks)
  if (tick % 50 === 0) {
    const wealthyWithNoPartner = s.citizens.filter(
      (c) => (c.credits ?? 0) > NISAB_CREDITS * 5 &&
        ![..._partnerships.values()].some((p) => p.active && p.capitalProviderId === c.id),
    );
    const skilledWithNoPartner = s.citizens.filter(
      (c) => (c.skills ?? []).length > 5 &&
        ![..._partnerships.values()].some((p) => p.active && p.laborProviderId === c.id),
    );

    if (wealthyWithNoPartner.length > 0 && skilledWithNoPartner.length > 0) {
      const capitals = wealthyWithNoPartner[Math.floor(Math.random() * wealthyWithNoPartner.length)];
      const skilled = skilledWithNoPartner.filter((c) => c.id !== capitals.id);
      if (skilled.length > 0) {
        const labor = skilled[Math.floor(Math.random() * skilled.length)];
        const capital = Math.floor((capitals.credits ?? 0) * 0.2);
        if (capital >= 50) {
          formMudarabahPartnership(s, capitals.id, labor.id, capital);
        }
      }
    }
  }
}
