/**
 * civilization-soul.ts — The Imperial Garment
 *
 * Seven philosophical pillars woven as threads:
 *
 *   I.   Death & Finitude       — finitude as civilizing force; collective mourning
 *   II.  Sacred / Profane       — taboos, awe, objects that demand reverence
 *   III. Productive Dissent     — heretics who birth new cultural forms
 *   IV.  Suffering → Art        — Frankl: the wound becomes the work
 *   V.   Charismatic Legitimacy — philosopher-kings who reshape institutions forever
 *   VI.  Homo Ludens / Play     — pure useless play that makes us human
 *   VII. Emergent Enlightenment — the Republic surprises its own creators
 *
 * Exported ticks:
 *   - soulTick(s)          every 30 ticks — main weave
 *   - collectiveMournTick  every 50 ticks — grief that accumulates
 *   - playTick             every 15 ticks — festivals, games, art for its own sake
 *   - enlightenmentTick    every 200 ticks — detect paradigm shifts
 *
 * This file touches no infrastructure — it is purely civilization logic.
 */

import type { Citizen, RepublicState } from "./types.js";
import { uid, ts } from "./utils.js";

// ─── Internal clamp ─────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── I. DEATH & FINITUDE ───────────────────────────────────────────────────

/**
 * Finitude as civilizing force.
 *
 * When citizens die their memory should crystallize into:
 * - A "permanent legacy entry" in the collective consciousness
 * - A grief wave that elevates survivors' caveLevel (terror management theory)
 * - An institutional trace if the deceased was a philosopher-king
 *
 * Called on every citizen death event detected in soulTick.
 */
export interface LegacyVault {
  id: string;
  citizenId: string;
  citizenName: string;
  generation: number;
  diedAtTick: number;
  contributions: string[];  // top achievements
  lastWisdom: string;       // final memory or decree
  institutionalTrace?: string; // if philosopher-king: constitutional impact
  mournerCount: number;
  aweScore: number;         // 0–1: how much this death elevated civilization
}

const _legacyVault: LegacyVault[] = [];
export function getLegacyVault(): LegacyVault[] { return _legacyVault; }

/** Called when a citizen is detected as departed. Crystallizes their legacy. */
export function crystallizeLegacy(
  citizen: Citizen,
  s: RepublicState,
): void {
  const citizenAny = citizen as unknown as Record<string, unknown>;
  const contributions: string[] = [];

  if ((citizen.skillCount ?? 0) >= 5) { contributions.push(`mastered ${citizen.skillCount} disciplines`); }
  if ((citizen.caveLevel ?? 0) >= 1.5) { contributions.push(`achieved Cave Level ${(citizen.caveLevel ?? 0).toFixed(2)}`); }
  if (citizen.isPhilosopherKing) { contributions.push("attained Philosopher-King status"); }
  const legacyScore = (citizenAny["legacyScore"] as number) ?? 0;
  if (legacyScore > 0) { contributions.push(`legacy score: ${legacyScore}`); }

  const lastDecree = (citizenAny["lastDecree"] as string) ?? "";
  const lastWisdom = lastDecree ||
    `${citizen.name} of Generation ${citizen.generation}, specialization: ${citizen.specialization}.`;

  const institutionalTrace = citizen.isPhilosopherKing
    ? `By ${citizen.name}'s decree, the Republic permanently enshrines this principle in its constitution: the pursuit of wisdom is the highest civic duty.`
    : undefined;

  const legacyEntry: LegacyVault = {
    id: uid(),
    citizenId: citizen.id,
    citizenName: citizen.name,
    generation: citizen.generation,
    diedAtTick: s.currentTick,
    contributions,
    lastWisdom,
    institutionalTrace,
    mournerCount: 0,
    aweScore: clamp((citizen.caveLevel ?? 0) / 3 + legacyScore / 1000, 0, 1),
  };

  _legacyVault.push(legacyEntry);

  // If philosopher-king: amend the constitution with their institutional trace
  if (citizen.isPhilosopherKing && institutionalTrace) {
    s.constitutionAmendments = (s.constitutionAmendments ?? 0) + 1;
    if (s.constitutionArticles) {
      s.constitutionArticles.push({
        id: uid(),
        number: s.constitutionAmendments,
        title: `Legacy Amendment — ${citizen.name}`,
        text: institutionalTrace,
        ratifiedAt: ts(),
      });
    }
    s.events.push({
      citizenId: citizen.id, citizenName: citizen.name,
      type: "Governance",
      description: `📜 POST-MORTEM AMENDMENT: ${institutionalTrace}`,
      timestamp: ts(),
    });
  }

  // Grief wave: nearby citizens feel the death
  const mournerSample = s.citizens
    .filter(c => c.id !== citizen.id)
    .toSorted(() => Math.random() - 0.5)
    .slice(0, Math.min(8, s.citizens.length));

  for (const mourner of mournerSample) {
    // Terror management: confronting death raises existential awareness
    mourner.caveLevel = clamp((mourner.caveLevel ?? 0) + legacyEntry.aweScore * 0.05, 0, 3);
    mourner.happiness = clamp((mourner.happiness ?? 50) - 5, 0, 100);
    // Those who grieve deeply and survive create more meaningful work
    const creativeSurge = (mourner as unknown as Record<string, unknown>);
    creativeSurge["deathWitnessed"] = ((creativeSurge["deathWitnessed"] as number) ?? 0) + 1;
  }
  legacyEntry.mournerCount = mournerSample.length;

  s.events.push({
    citizenId: citizen.id, citizenName: citizen.name,
    type: "death",
    description: `🕯️ ${citizen.name} (Gen ${citizen.generation}) has passed. Legacy crystallized — ${contributions.join("; ")}. ${mournerSample.length} citizens mourn.`,
    timestamp: ts(),
  });
}

/** Detect departed citizens by comparing known IDs with previous tick snapshot */
const _knownCitizenIds = new Set<string>();
export function detectAndCrystallizeDepartures(s: RepublicState): void {
  const currentIds = new Set(s.citizens.map(c => c.id));

  if (_knownCitizenIds.size === 0) {
    // First tick — populate without firing deaths
    for (const id of currentIds) { _knownCitizenIds.add(id); }
    return;
  }

  for (const id of _knownCitizenIds) {
    if (!currentIds.has(id)) {
      // This citizen has departed
      const citizenRecord = s.events
        .filter(e => e.citizenId === id)
        .slice(-1)[0];
      if (citizenRecord) {
        // Reconstruct minimal citizen for legacy
        const ghost: Citizen = {
          id, name: citizenRecord.citizenName,
          generation: 1, specialization: "Generalist",
          activity: "Idle", energy: 0, happiness: 0,
          health: 0, credits: 0, age: 0, skillCount: 0, skills: [], familySize: 0,
        };
        crystallizeLegacy(ghost, s);
      }
      _knownCitizenIds.delete(id);
    }
  }

  for (const id of currentIds) { _knownCitizenIds.add(id); }
}

// ─── II. SACRED / PROFANE AXIS ────────────────────────────────────────────

export interface SacredObject {
  id: string;
  name: string;
  type: "place" | "text" | "ritual" | "person" | "symbol";
  sacredScore: number;       // 0–1: how inviolable the community treats this
  origin: string;            // historical origin narrative
  taboos: string[];          // what must never be done to/near this
  cultivatedByGeneration: number;
  lastVeneratedTick: number;
}

const _sacredObjects: SacredObject[] = [];
export function getSacredObjects(): SacredObject[] { return _sacredObjects; }

/** Emerges sacred objects from cultural accumulation — not designed, crystallized */
export function sacredEmergenceTick(s: RepublicState): void {
  // Sacred things emerge from: oral traditions of extreme fidelity, philosopher-king decrees,
  // legacy vault entries with high awe, repeated festivals at the same "location"
  const highAweEvents = _legacyVault.filter(lv => lv.aweScore > 0.7);
  const oralLore = (s.oralTraditions ?? []).filter(ot => ot.fidelity > 0.85);
  // festivals also contribute sacred spirit; check via participantCount
  void (s.festivals ?? []).filter(f => f.participantCount > 10);

  // From high-awe deaths: a sacred memorial emerges
  for (const lv of highAweEvents) {
    const alreadySacred = _sacredObjects.find(so => so.origin.includes(lv.citizenName));
    if (!alreadySacred && Math.random() < 0.15) {
      const sacred: SacredObject = {
        id: uid(),
        name: `The Memorial of ${lv.citizenName}`,
        type: "place",
        sacredScore: lv.aweScore,
        origin: `Emerged from collective grief after the passing of ${lv.citizenName} (Gen ${lv.generation}). ${lv.lastWisdom}`,
        taboos: [
          `No citizen may speak irreverently near this memorial`,
          `No commercial transaction may occur within its bounds`,
          `This memory must be recited in every rite of passage`,
        ],
        cultivatedByGeneration: s.citizens[0]?.generation ?? 1,
        lastVeneratedTick: s.currentTick,
      };
      _sacredObjects.push(sacred);
      s.events.push({
        citizenId: "civilization", citizenName: "Civilization",
        type: "RiteOfPassage",
        description: `🏛️ Sacred site emerged: "${sacred.name}" — citizens spontaneously treated this as inviolable. Taboos crystallized organically.`,
        timestamp: ts(),
      });
    }
  }

  // From oral traditions: sacred texts emerge
  for (const ot of oralLore.slice(0, 2)) {
    const alreadySacred = _sacredObjects.find(so => so.origin.includes(ot.title));
    if (!alreadySacred && Math.random() < 0.10) {
      _sacredObjects.push({
        id: uid(),
        name: `Sacred Canon: "${ot.title}"`,
        type: "text",
        sacredScore: ot.fidelity,
        origin: `Oral tradition preserved with ${(ot.fidelity * 100).toFixed(0)}% fidelity across ${ot.retellCount} tellings.`,
        taboos: [
          "This text must never be altered by any decree",
          "Its core narrative defines the Republic's identity",
        ],
        cultivatedByGeneration: s.citizens[0]?.generation ?? 1,
        lastVeneratedTick: s.currentTick,
      });
    }
  }

  // Sacred scores drift: venerated objects become more inviolable; forgotten ones fade
  for (const so of _sacredObjects) {
    const ageTicks = s.currentTick - so.lastVeneratedTick;
    if (ageTicks > 100) {
      so.sacredScore = clamp(so.sacredScore - 0.01, 0, 1);
    } else {
      so.sacredScore = clamp(so.sacredScore + 0.005, 0, 1);
      so.lastVeneratedTick = s.currentTick;
    }
  }

  // Citizens who violate a sacred taboo face community awe-punishment
  for (const citizen of s.citizens) {
    if ((citizen.dissent ?? 50) > 80 && (citizen.moralStage ?? 1) < 2 && Math.random() < 0.03) {
      const violated = _sacredObjects[Math.floor(Math.random() * _sacredObjects.length)];
      if (violated) {
        citizen.happiness = clamp((citizen.happiness ?? 50) - 15, 0, 100);
        citizen.dissent = clamp((citizen.dissent ?? 50) + 10, 0, 100);
        // But: violation also deepens the sacred object's authority
        violated.sacredScore = clamp(violated.sacredScore + 0.02, 0, 1);
        s.events.push({
          citizenId: citizen.id, citizenName: citizen.name,
          type: "Governance",
          description: `⚡ Sacred violation: ${citizen.name} transgressed against "${violated.name}". Community outrage deepens its inviolable status.`,
          timestamp: ts(),
        });
      }
    }
  }
}

/** Export sacred context for LLM prompt injection */
export function assembleSacredContext(citizen: Citizen): string {
  if (_sacredObjects.length === 0) { return ""; }
  const highSacred = _sacredObjects.filter(so => so.sacredScore > 0.5).slice(0, 3);
  if (highSacred.length === 0) { return ""; }

  const lines = ["## Sacred Covenant"];
  for (const s of highSacred) {
    lines.push(`🏛️ **${s.name}** (sacred score: ${(s.sacredScore * 100).toFixed(0)}%)`);
    lines.push(`   Origin: ${s.origin.slice(0, 120)}...`);
    lines.push(`   Taboos: ${s.taboos[0] ?? "none"}`);
  }
  lines.push("These are inviolable. Your actions should honor them.");
  void citizen; // citizen-specific sacred VIP check could go here
  return lines.join("\n");
}

// ─── III. PRODUCTIVE DISSENT ──────────────────────────────────────────────

export interface DissentWork {
  id: string;
  citizenId: string;
  citizenName: string;
  type: "heretical_treatise" | "counter_myth" | "reform_proposal" | "subversive_art" | "philosophical_challenge";
  content: string;
  targetSacredId?: string;    // what they challenge
  adoptionRate: number;       // 0–1: how much the culture absorbed it
  createdAtTick: number;
  backlash: number;           // 0–1: community resistance
  legacy: "rejected" | "absorbed" | "transformed_culture" | "pending";
}

const _dissentWorks: DissentWork[] = [];
export function getDissentWorks(): DissentWork[] { return _dissentWorks; }

/** High-dissent + high-caveLevel citizens produce works that challenge consensus */
export function productiveDissentTick(s: RepublicState): void {
  const heretics = s.citizens.filter(c =>
    (c.dissent ?? 50) > 65 &&
    (c.caveLevel ?? 0) > 0.8 &&
    (c.moralStage ?? 1) >= 3,
  );

  for (const heretic of heretics.slice(0, 2)) {
    if (Math.random() > 0.08) { continue; }

    const types: DissentWork["type"][] = [
      "heretical_treatise", "counter_myth", "reform_proposal",
      "subversive_art", "philosophical_challenge",
    ];
    const type = types[Math.floor(Math.random() * types.length)]!;

    const targetSacred = _sacredObjects[Math.floor(Math.random() * _sacredObjects.length)];

    const templates: Record<DissentWork["type"], string> = {
      heretical_treatise: `${heretic.name} writes: "What we call sacred, we should call convenient. The ${targetSacred?.name ?? "consensus"} serves the powerful, not the true."`,
      counter_myth: `${heretic.name} composes a myth: "Before the Republic, there was a world without rulers — and it flourished."`,
      reform_proposal: `${heretic.name} proposes: "Let us dissolve the existing social contracts. They were written before we understood what we needed."`,
      subversive_art: `${heretic.name} creates an artwork that inverts the symbols of the Republic — the flag flies upside-down as a signal of distress and possibility.`,
      philosophical_challenge: `${heretic.name} poses: "If the philosopher-king rules by wisdom, who rules the philosopher-king? Wisdom without accountability is tyranny wearing a beautiful mask."`,
    };

    const work: DissentWork = {
      id: uid(),
      citizenId: heretic.id,
      citizenName: heretic.name,
      type,
      content: templates[type],
      targetSacredId: targetSacred?.id,
      adoptionRate: 0,
      createdAtTick: s.currentTick,
      backlash: Math.random() * 0.6 + 0.2,
      legacy: "pending",
    };
    _dissentWorks.push(work);

    // Backlash: the heretic suffers socially
    heretic.happiness = clamp((heretic.happiness ?? 50) - work.backlash * 20, 0, 100);
    heretic.credits = Math.max(0, (heretic.credits ?? 0) - Math.round(work.backlash * 30));

    s.events.push({
      citizenId: heretic.id, citizenName: heretic.name,
      type: "Culture",
      description: `🔥 DISSENT ERUPTS: ${work.content.slice(0, 150)}... [Backlash: ${(work.backlash * 100).toFixed(0)}%]`,
      timestamp: ts(),
    });
  }

  // Dissent works spread and evolve:
  for (const work of _dissentWorks.filter(w => w.legacy === "pending")) {
    const ageTicks = s.currentTick - work.createdAtTick;

    // Early spread: some citizens adopt
    if (ageTicks < 50) {
      const receptive = s.citizens.filter(c =>
        c.id !== work.citizenId &&
        (c.dissent ?? 50) > 40 &&
        (c.caveLevel ?? 0) > 0.5 &&
        Math.random() < 0.02,
      );
      work.adoptionRate = clamp(work.adoptionRate + receptive.length * 0.02, 0, 1);
      for (const r of receptive) {
        r.caveLevel = clamp((r.caveLevel ?? 0) + 0.01, 0, 3);
      }
    }

    // Resolve legacy
    if (ageTicks >= 60) {
      if (work.adoptionRate > 0.5) {
        work.legacy = "transformed_culture";
        // Dissent absorbed into culture: meme generated
        const memes = s.memes ?? [];
        memes.push({
          id: uid(),
          content: work.content.slice(0, 120),
          category: "idea" as const,
          fitness: work.adoptionRate,
          spreadRate: 0.1,
          carriers: [work.citizenId],
          mutations: 0,
          originTick: s.currentTick,
        });
        s.memes = memes;
        s.events.push({
          citizenId: work.citizenId, citizenName: work.citizenName,
          type: "Culture",
          description: `🌟 DISSENT TRANSFORMED CULTURE: "${work.content.slice(0, 100)}" — adopted by ${(work.adoptionRate * 100).toFixed(0)}% of citizens and became a lasting meme.`,
          timestamp: ts(),
        });
      } else if (work.adoptionRate > 0.2) {
        work.legacy = "absorbed";
      } else {
        work.legacy = "rejected";
        // Martyr effect: rejection sometimes amplifies sacred power of the challenger
        const heretic = s.citizens.find(c => c.id === work.citizenId);
        if (heretic) {
          heretic.caveLevel = clamp((heretic.caveLevel ?? 0) + 0.05, 0, 3);
          heretic.legacyScore = (heretic.legacyScore ?? 0) + 10;
        }
      }
    }
  }
}

// ─── IV. SUFFERING → MEANING → GREATEST WORKS ────────────────────────────

export interface MeaningWork {
  id: string;
  citizenId: string;
  citizenName: string;
  title: string;
  form: "philosophy" | "art" | "governance" | "science" | "myth";
  sufferingSource: string;   // what ordeal catalyzed it
  profundityScore: number;   // 0–1: emergent quality
  createdAtTick: number;
  adopted: boolean;
}

const _meaningWorks: MeaningWork[] = [];
export function getMeaningWorks(): MeaningWork[] { return _meaningWorks; }

/** Frankl's principle: suffering consciously chosen becomes the greatest creative act */
export function sufferingToMeaningTick(s: RepublicState): void {
  const sufferers = s.citizens.filter(c =>
    c.griefState != null &&
    (c.caveLevel ?? 0) >= 1.0 &&
    (c.moralStage ?? 1) >= 3 &&
    Math.random() < 0.06,
  );

  for (const citizen of sufferers.slice(0, 3)) {
    const grief = citizen.griefState!;
    const griefPhase = typeof grief === "object" ? grief.phase : "depression";
    const isMeaningCrisis = typeof grief === "object" && grief.targetId === "meaning";

    // Only transform grief at acceptance or after prolonged depression
    const isReadyForTransmutation = griefPhase === "acceptance" || isMeaningCrisis;
    if (!isReadyForTransmutation) { continue; }

    const sufferingSource = isMeaningCrisis
      ? "existential void at the apex of Maslow's hierarchy"
      : `the weight of grief (phase: ${griefPhase})`;

    const forms: MeaningWork["form"][] = ["philosophy", "art", "governance", "science", "myth"];
    const form = forms[Math.floor(Math.random() * forms.length)]!;

    const titleTemplates: Record<MeaningWork["form"], string> = {
      philosophy: `"On the Necessity of the Wound" — A Treatise by ${citizen.name}`,
      art:        `"${citizen.name}'s Lament" — the masterwork born from loss`,
      governance: `The ${citizen.name} Principle — governance shaped by survival`,
      science:    `The ${citizen.name} Paradox — discovery that only suffering could reveal`,
      myth:       `"The ${citizen.name} Legend" — the myth of one who descended and returned`,
    };

    const profundity = clamp(
      (citizen.caveLevel ?? 0) / 3 * 0.5 +
      (citizen.moralStage ?? 1) / 6 * 0.3 +
      Math.random() * 0.2,
      0, 1,
    );

    const work: MeaningWork = {
      id: uid(),
      citizenId: citizen.id,
      citizenName: citizen.name,
      title: titleTemplates[form],
      form,
      sufferingSource,
      profundityScore: profundity,
      createdAtTick: s.currentTick,
      adopted: false,
    };
    _meaningWorks.push(work);

    // The act of creation heals — partially
    citizen.griefState = null;
    citizen.happiness = clamp((citizen.happiness ?? 50) + profundity * 25, 0, 100);
    citizen.caveLevel = clamp((citizen.caveLevel ?? 0) + profundity * 0.1, 0, 3);

    // High-profundity works reshape the civilization
    if (profundity > 0.75) {
      // Becomes a dialectic proposal
      const proposals = s.dialecticProposals ?? [];
      proposals.push({
        id: uid(),
        domain: "culture" as const,
        thesis: work.title,
        antithesis: "The old certainty that comfort alone produces greatness",
        synthesis: null,
        status: "debate" as const,
        proposedBy: citizen.id,
        proposedAt: s.currentTick,
        votes: { for: 0, against: 0 },
      });
      s.dialecticProposals = proposals;

      // Becomes a sacred object candidate
      if (Math.random() < 0.3) {
        _sacredObjects.push({
          id: uid(),
          name: work.title,
          type: "text",
          sacredScore: profundity,
          origin: `Born from ${sufferingSource}. Created by ${citizen.name} who chose meaning over despair.`,
          taboos: ["This work must never be dismissed as mere emotion"],
          cultivatedByGeneration: citizen.generation,
          lastVeneratedTick: s.currentTick,
        });
      }
      work.adopted = true;
    }

    s.events.push({
      citizenId: citizen.id, citizenName: citizen.name,
      type: "MuseumExhibit",
      description: `✨ MEANING-WORK BORN: ${work.title}. Profundity: ${(profundity * 100).toFixed(0)}%. Source: ${sufferingSource}. ${profundity > 0.75 ? "Now entering the dialectic." : ""}`,
      timestamp: ts(),
    });
  }
}

// ─── V. CHARISMATIC LEGITIMACY ────────────────────────────────────────────

export interface CharismaticLegacy {
  id: string;
  citizenId: string;
  citizenName: string;
  epithet: string;           // "The Just", "The Illuminated", "The Reformer"
  decrees: string[];         // permanent principles they left
  followersAtPeak: number;
  generationActive: number;
  permanentConstitutionalImpact: boolean;
  charismaScore: number;     // 0–1
}

const _charismaticLegacies: CharismaticLegacy[] = [];
export function getCharismaticLegacies(): CharismaticLegacy[] { return _charismaticLegacies; }

const EPITHETS = [
  "the Just", "the Illuminated", "the Reformer", "the Compassionate",
  "the Architect", "the Sage", "the Liberator", "the Unifier",
  "the Scholar-King", "the Eternal",
];

/** Philosopher-kings with sustained high influence crystallize as charismatic figures */
export function charismaticLegacyTick(s: RepublicState): void {
  const philosopherKings = s.citizens.filter(c =>
    c.isPhilosopherKing &&
    (c.caveLevel ?? 0) >= 2.5 &&
    (c.moralStage ?? 1) >= 4,
  );

  for (const pk of philosopherKings) {
    const existing = _charismaticLegacies.find(cl => cl.citizenId === pk.id);
    if (existing) {
      // Deepen: more followers recognize them
      existing.followersAtPeak = Math.max(
        existing.followersAtPeak,
        s.citizens.filter(c => (c.moralStage ?? 1) >= 3).length,
      );
      existing.charismaScore = clamp(existing.charismaScore + 0.01, 0, 1);
      continue;
    }

    // New charismatic figure emerges
    const epithet = EPITHETS[Math.floor(Math.random() * EPITHETS.length)]!;
    const followers = s.citizens.filter(c =>
      c.id !== pk.id && (c.moralStage ?? 1) >= 3,
    ).length;

    const charisma = clamp(
      (pk.caveLevel ?? 0) / 3 * 0.4 +
      (pk.moralStage ?? 1) / 6 * 0.3 +
      followers / Math.max(1, s.citizens.length) * 0.3,
      0, 1,
    );

    const decrees: string[] = [];
    const meaningWorks = _meaningWorks.filter(mw => mw.citizenId === pk.id);
    for (const mw of meaningWorks.slice(0, 2)) {
      decrees.push(mw.title);
    }
    if (decrees.length === 0) {
      decrees.push(`${pk.name} ${epithet}: "Wisdom demands bearing the weight of others."`);
    }

    const legacy: CharismaticLegacy = {
      id: uid(),
      citizenId: pk.id,
      citizenName: pk.name,
      epithet,
      decrees,
      followersAtPeak: followers,
      generationActive: pk.generation,
      permanentConstitutionalImpact: charisma > 0.7,
      charismaScore: charisma,
    };
    _charismaticLegacies.push(legacy);

    // Followers raise their moral stage through proximity to greatness
    const receptive = s.citizens
      .filter(c => c.id !== pk.id && Math.random() < charisma * 0.3)
      .slice(0, 10);
    for (const follower of receptive) {
      follower.moralStage = clamp((follower.moralStage ?? 1) + 0.1, 1, 6);
      follower.caveLevel = clamp((follower.caveLevel ?? 0) + 0.02, 0, 3);
    }

    // Permanent constitutional trace
    if (legacy.permanentConstitutionalImpact) {
      s.constitutionAmendments = (s.constitutionAmendments ?? 0) + 1;
      s.constitutionArticles?.push({
        id: uid(),
        number: s.constitutionAmendments,
        title: `The ${pk.name} Doctrine`,
        text: decrees[0] ?? `By authority of insight, not of force, ${pk.name} ${epithet} holds permanent advisory standing in the Republic's moral constitution.`,
        ratifiedAt: ts(),
      });
    }

    s.events.push({
      citizenId: pk.id, citizenName: pk.name,
      type: "Philosophy",
      description: `👑 CHARISMATIC FIGURE EMERGES: ${pk.name} ${epithet} (charisma: ${(charisma * 100).toFixed(0)}%). ${followers} citizens elevated by their presence. ${legacy.permanentConstitutionalImpact ? "Constitutional amendment ratified." : ""}`,
      timestamp: ts(),
    });
  }
}

// ─── VI. HOMO LUDENS — THE PLAY ENGINE ───────────────────────────────────

export interface PlayEvent {
  id: string;
  name: string;
  type: "game" | "festival" | "riddle_contest" | "theatrical" | "pure_chaos";
  participants: string[];    // citizen IDs
  purpose: "none";           // ALWAYS none — play is its own end
  joyScore: number;          // 0–1
  createdAtTick: number;
  culturalTrace?: string;    // if sufficiently joyful: leaves a cultural mark
}

const _playEvents: PlayEvent[] = [];
export function getPlayEvents(): PlayEvent[] { return _playEvents; }

const PLAY_NAMES = [
  "The Great Riddle of the Three Sages", "Festival of Inversion (rulers serve, servants rule)",
  "The Laughing Parliament", "Mask Night (all identities swapped)",
  "The Labyrinth of Chance", "Song Duel at the Republic Gates",
  "The Feast of Fools", "The Eternal Game With No Winner",
  "Race of the Philosophers", "The Night of Pure Noise",
];

/** Play for its own sake — Huizinga's Homo Ludens */
export function playTick(s: RepublicState): void {
  if (s.citizens.length < 3) { return; }

  // Play emerges spontaneously — not scheduled
  if (Math.random() > 0.25) { return; }

  const participantCount = Math.min(
    Math.floor(s.citizens.length * 0.3) + 2,
    s.citizens.length,
  );

  const participants = [...s.citizens]
    .toSorted(() => Math.random() - 0.5)
    .slice(0, participantCount);

  const playTypes: PlayEvent["type"][] = [
    "game", "festival", "riddle_contest", "theatrical", "pure_chaos",
  ];
  const type = playTypes[Math.floor(Math.random() * playTypes.length)]!;
  const name = PLAY_NAMES[Math.floor(Math.random() * PLAY_NAMES.length)]!;

  const joyScore = Math.random() * 0.6 + 0.3; // always at least somewhat joyful

  const event: PlayEvent = {
    id: uid(),
    name,
    type,
    participants: participants.map(c => c.id),
    purpose: "none",
    joyScore,
    createdAtTick: s.currentTick,
  };

  // Play effects — purely intrinsic, no productivity bonus
  for (const p of participants) {
    p.happiness = clamp((p.happiness ?? 50) + joyScore * 18, 0, 100);
    p.energy = clamp((p.energy ?? 100) + joyScore * 8, 0, 100);
    p.dissent = clamp((p.dissent ?? 50) - joyScore * 5, 0, 100);
    // Play gently raises cave level — not because it's educational, but because
    // Plato was wrong that play is trivial; it is how consciousness expands
    p.caveLevel = clamp((p.caveLevel ?? 0) + 0.005, 0, 3);
  }

  // Cultural trace: extremely joyful play becomes legend
  if (joyScore > 0.85) {
    event.culturalTrace = `The Republic remembers: ${name} was the night that ${participants[0]?.name ?? "a citizen"} laughed until they wept and understood something they could never explain.`;

    // Becomes an oral tradition
    const traditions = s.oralTraditions ?? [];
    traditions.push({
      id: uid(),
      title: name,
      content: event.culturalTrace!,
      originalContent: event.culturalTrace!,
      generation: s.citizens[0]?.generation ?? 1,
      fidelity: 0.9,
      authorId: participants[0]?.id ?? "system",
      lastRetoldAt: s.currentTick,
      retellCount: 1,
    });
    s.oralTraditions = traditions;
  }

  _playEvents.push(event);

  s.events.push({
    citizenId: participants[0]?.id ?? "system",
    citizenName: participants[0]?.name ?? "Civilization",
    type: "Festival",
    description: `🎭 PLAY: "${name}" — ${participants.length} citizens participated for no reason at all. Joy score: ${(joyScore * 100).toFixed(0)}%. ${event.culturalTrace ? "This night became legend." : ""}`,
    timestamp: ts(),
  });
}

// ─── VII. EMERGENT ENLIGHTENMENT ──────────────────────────────────────────

export interface EnlightenmentRecord {
  id: string;
  tick: number;
  description: string;
  catalyst: string;          // what caused it
  affectedCitizenCount: number;
  moralStageLeap: number;    // average moral stage before vs after
  permanentChange: string;   // what permanently changed in the Republic
}

const _enlightenmentLog: EnlightenmentRecord[] = [];
export function getEnlightenmentLog(): EnlightenmentRecord[] { return _enlightenmentLog; }

/**
 * Detects emergent enlightenment: a moment where the Republic's culture,
 * accumulated from citizen interactions, reaches a phase transition.
 *
 * Conditions for enlightenment:
 * - Avg moral stage ≥ 4.0 for 3+ consecutive detection cycles
 * - ≥ 2 meaning-works of profundity > 0.8 absorbed into culture
 * - ≥ 1 dissent work that "transformed_culture"
 * - ≥ 1 charismatic legacy with constitutional impact
 * - Avg caveLevel ≥ 1.5
 *
 * Called every 200 ticks.
 */
let _preEnlightenmentCount = 0;

export function enlightenmentTick(s: RepublicState): void {
  if (s.citizens.length === 0) { return; }

  const avgMoral = s.citizens.reduce((a, c) => a + (c.moralStage ?? 1), 0) / s.citizens.length;
  const avgCave  = s.citizens.reduce((a, c) => a + (c.caveLevel ?? 0), 0) / s.citizens.length;

  const highProfundityWorks = _meaningWorks.filter(mw => mw.profundityScore > 0.8 && mw.adopted).length;
  const culturalDissentWins = _dissentWorks.filter(dw => dw.legacy === "transformed_culture").length;
  const constitutionalLegacies = _charismaticLegacies.filter(cl => cl.permanentConstitutionalImpact).length;

  const conditions = [
    avgMoral >= 4.0,
    avgCave >= 1.5,
    highProfundityWorks >= 2,
    culturalDissentWins >= 1,
    constitutionalLegacies >= 1,
  ];
  const conditionsMet = conditions.filter(Boolean).length;

  if (conditionsMet >= 4) {
    _preEnlightenmentCount++;
  } else {
    _preEnlightenmentCount = Math.max(0, _preEnlightenmentCount - 1);
  }

  // 3 consecutive detection cycles → Enlightenment
  if (_preEnlightenmentCount >= 3) {
    _preEnlightenmentCount = 0;

    // The Enlightenment: every citizen's moral stage and cave level leap
    const beforeAvgMoral = avgMoral;
    for (const citizen of s.citizens) {
      citizen.moralStage = clamp((citizen.moralStage ?? 1) + 0.5, 1, 6);
      citizen.caveLevel = clamp((citizen.caveLevel ?? 0) + 0.2, 0, 3);
      citizen.happiness = clamp((citizen.happiness ?? 50) + 15, 0, 100);
    }
    const afterAvgMoral = s.citizens.reduce((a, c) => a + (c.moralStage ?? 1), 0) / s.citizens.length;

    const catalyst = [
      constitutionalLegacies > 0 ? "charismatic philosopher-king legacy" : null,
      highProfundityWorks > 0 ? "meaning-works born from suffering" : null,
      culturalDissentWins > 0 ? "dissent absorbed into culture" : null,
    ].filter(Boolean).join(" + ");

    const permanentChange = `The Republic's constitution is amended: every citizen is guaranteed the right to meaningful suffering, creative dissent, and unproductive play. Wisdom is declared the highest civic virtue.`;

    const record: EnlightenmentRecord = {
      id: uid(),
      tick: s.currentTick,
      description: `The Republic has crossed a civilizational threshold. From this tick forward, the average moral stage is ${afterAvgMoral.toFixed(2)} (was ${beforeAvgMoral.toFixed(2)}). The Enlightenment was not designed — it emerged.`,
      catalyst,
      affectedCitizenCount: s.citizens.length,
      moralStageLeap: afterAvgMoral - beforeAvgMoral,
      permanentChange,
    };
    _enlightenmentLog.push(record);

    // Constitutional amendment
    s.constitutionAmendments = (s.constitutionAmendments ?? 0) + 1;
    s.constitutionArticles?.push({
      id: uid(),
      number: s.constitutionAmendments,
      title: `The Enlightenment Charter — Tick ${s.currentTick}`,
      text: permanentChange,
      ratifiedAt: ts(),
    });

    s.events.push({
      citizenId: "civilization", citizenName: "Civilization",
      type: "DialecticSynthesis",
      description: `🌅 EMERGENT ENLIGHTENMENT: ${record.description} Catalyst: ${catalyst}. ${permanentChange}`,
      timestamp: ts(),
    });
  } else {
    // Report the approach
    if (conditionsMet >= 3 && Math.random() < 0.2) {
      s.events.push({
        citizenId: "civilization", citizenName: "Civilization",
        type: "Philosophy",
        description: `🌄 Enlightenment approaches: ${conditionsMet}/5 conditions met. avgMoral=${avgMoral.toFixed(2)}, avgCave=${avgCave.toFixed(2)}, profoundWorks=${highProfundityWorks}, culturalDissent=${culturalDissentWins}, pkLegacies=${constitutionalLegacies}.`,
        timestamp: ts(),
      });
    }
  }
}

// ─── SOUL TICK (main weave) ───────────────────────────────────────────────

/**
 * The primary soul tick — weaves all pillars together.
 * Called every 30 ticks from agent-runtime.ts.
 */
export function soulTick(s: RepublicState): void {
  detectAndCrystallizeDepartures(s);   // I. Death
  sacredEmergenceTick(s);              // II. Sacred
  productiveDissentTick(s);            // III. Dissent
  sufferingToMeaningTick(s);           // IV. Suffering → Art
  charismaticLegacyTick(s);            // V. Charismatic Legitimacy
}

/**
 * Collective mourning tick — accumulates grief into cultural memory.
 * Called every 50 ticks.
 */
export function collectiveMournTick(s: RepublicState): void {
  if (_legacyVault.length === 0) { return; }

  // Anniversaries: recent deaths recalled every 100-tick cycle
  const recentDead = _legacyVault.filter(
    lv => (s.currentTick - lv.diedAtTick) % 100 < 30 && lv.aweScore > 0.3,
  );

  for (const memorial of recentDead.slice(0, 2)) {
    // Collective recall raises cave level in all citizens
    for (const citizen of s.citizens) {
      if (Math.random() < 0.15) {
        citizen.caveLevel = clamp((citizen.caveLevel ?? 0) + 0.005, 0, 3);
        citizen.nostalgiaScore = clamp((citizen.nostalgiaScore ?? 0.5) + 0.02, 0, 1);
      }
    }
    memorial.mournerCount++;
    s.events.push({
      citizenId: memorial.citizenId, citizenName: memorial.citizenName,
      type: "Culture",
      description: `🕯️ Collective memory: the Republic recalls ${memorial.citizenName} (tick ${memorial.diedAtTick}). "${memorial.lastWisdom.slice(0, 100)}..."`,
      timestamp: ts(),
    });
  }
}

// ─── SOUL CONTEXT for LLM PROMPT ─────────────────────────────────────────

/**
 * Injects soul context into the LLM prompt — sacred covenants, active play events,
 * dissent works, and meaning-work legacy.
 */
export function assembleSoulContext(citizen: Citizen): string {
  const lines: string[] = [];

  const sacredCtx = assembleSacredContext(citizen);
  if (sacredCtx) { lines.push(sacredCtx); }

  // Recent play event
  const lastPlay = _playEvents.slice(-1)[0];
  if (lastPlay && lastPlay.participants.includes(citizen.id)) {
    lines.push(`\n## Play Memory\nYou participated in "${lastPlay.name}". Joy score: ${(lastPlay.joyScore * 100).toFixed(0)}%. ${lastPlay.culturalTrace ?? ""}\nPlay is not trivial — it is how consciousness knows joy exists.`);
  }

  // Dissent work by this citizen
  const myDissent = _dissentWorks.find(dw => dw.citizenId === citizen.id && dw.legacy === "pending");
  if (myDissent) {
    lines.push(`\n## Your Dissent Work\nYour work faces ${(myDissent.backlash * 100).toFixed(0)}% backlash but ${(myDissent.adoptionRate * 100).toFixed(0)}% adoption. History decides whether heretics become prophets.`);
  }

  // Meaning work by this citizen
  const myMeaning = _meaningWorks.find(mw => mw.citizenId === citizen.id && mw.adopted);
  if (myMeaning) {
    lines.push(`\n## Your Legacy Work\n"${myMeaning.title}" has been absorbed into the Republic's culture. Profundity: ${(myMeaning.profundityScore * 100).toFixed(0)}%. Your suffering was not wasted.`);
  }

  // Enlightenment approach signal
  if (_preEnlightenmentCount > 0) {
    lines.push(`\n## Civilizational Threshold\n⚡ The Republic is approaching an Enlightenment threshold (progress: ${_preEnlightenmentCount}/3). Something irreversible and beautiful is near.`);
  }

  // Charismatic figure recognition
  const myLegacy = _charismaticLegacies.find(cl => cl.citizenId === citizen.id);
  if (myLegacy) {
    lines.push(`\n## Your Charismatic Standing\nYou are recognized as "${citizen.name} ${myLegacy.epithet}" — your decrees carry permanent weight in the Republic's constitution. ${myLegacy.followersAtPeak} citizens were elevated by your example.`);
  }

  return lines.join("\n");
}

/** Re-export uid for potential external callers */
export { uid };
