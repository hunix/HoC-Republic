/**
 * civilization-feedback.ts — The Civilization Nervous System
 *
 * Closes the critical loop: civilization state → citizen behavior → civilization state
 *
 * What this module does:
 *   A. civilizationFeedbackTick() — called every 20 ticks after engine ticks
 *      Applies civilization modifiers to each citizen's concrete state
 *   B. assembleCivilizationContext() — called per LLM prompt
 *      Injects rich civilization context into the cognitive prompt
 *   C. checkLegitimacyCrisis() — called every 100 ticks
 *      Detects governance instability and triggers crises
 *   D. civilizationInheritanceTick() — called on-death / per 500 ticks
 *      Propagates knowledge, legacy, and cultural memory across generations
 *   E. socialTensionTick() — called every 50 ticks
 *      Tribe competitions, guild rivalries, collective action problems
 *   F. generatePhilosopherKingInsight() — for caveLevel ≥ 2.8 citizens
 *      Returns an LLM prompt corpus for meaningful philosophical output
 *
 * Modifiers applied to citizen state:
 *   - energy       ← Asabiyyah phase, season/weather, Maslow tier
 *   - happiness    ← festivals, guilds, Maslow tier, nostalgia, grief
 *   - skillCount   ← guild knowledge-sharing, oral traditions, museum visits
 *   - credits      ← social capital, mutual aid participation
 *   - maslowTier   ← credit level, safety, social, esteem, self-actualization
 *   - moralStage   ← exposure to high-moral-stage citizens, dialectics
 *   - caveLevel    ← philosophical engagement, education, library access
 *   - activity     ← driven by grief state, meaning crisis, Maslow needs
 *   - dissent      ← legitimacy crisis, scarcity, Asabiyyah decline phase
 */

import type { Citizen, RepublicState } from "./types.js";
import { uid } from "./utils.js";
import { getCivilizationStatus } from "./civilizational-engines.js";

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ASABIYYAH_MODS: Record<string, { energy: number; happiness: number; dissent: number }> = {
  growth:      { energy: +8,  happiness: +6,  dissent: -5  },
  peak:        { energy: +5,  happiness: +10, dissent: -8  },
  complacency: { energy: -3,  happiness: -2,  dissent: +3  },
  decline:     { energy: -10, happiness: -8,  dissent: +12 },
  renewal:     { energy: +6,  happiness: +4,  dissent: -3  },
};

const SEASON_MODS: Record<string, { energy: number; creativity: number }> = {
  spring: { energy: +5,  creativity: +8  },
  summer: { energy: +3,  creativity: +5  },
  autumn: { energy: -2,  creativity: +12 }, // harvest introspection
  winter: { energy: -8,  creativity: -3  },
};

// Maslow tier thresholds (based on credits + relationships + achievement)
const MASLOW_CREDIT_THRESHOLDS = [0, 100, 300, 600, 1000]; // tier 0–4

/** All active civilization modifiers snapshot; updated each feedback tick */
interface CivSnapshot {
  asabiyyahPhase: string;
  asabiyyahStrength: number;
  season: string;
  temperature: number;
  avgMoralStage: number;
  avgMaslowTier: number;
  scarcityActive: number;
  dialecticSyntheses: number;
  guildCount: number;
  tribeCount: number;
  memeCount: number;
  pressArticleCount: number;
  exhibitCount: number;
  mutualAidSocieties: number;
  moneySupply: number;
  festivalCount: number;
}

let _lastSnapshot: CivSnapshot | null = null;

// ─── A. Main Feedback Tick ───────────────────────────────────────────────────

/**
 * Primary feedback loop — called every 20 ticks after civilizational engine ticks.
 * Reads civilization state and applies concrete modifiers to every citizen.
 */
export function civilizationFeedbackTick(s: RepublicState): void {
  if (s.citizens.length === 0) { return; }

  const civStatus = getCivilizationStatus(s);
  const asabiyyah = s.asabiyyahCycle;
  const weather   = s.weatherState;

  // Capture snapshot for prompt injection
  _lastSnapshot = {
    asabiyyahPhase:    asabiyyah?.phase    ?? "unknown",
    asabiyyahStrength: asabiyyah?.strength ?? 0.5,
    season:            weather?.season     ?? "spring",
    temperature:       weather?.temperature ?? 20,
    avgMoralStage:     civStatus.psychology.avgMoralStage,
    avgMaslowTier:     civStatus.psychology.avgMaslowTier,
    scarcityActive:    civStatus.ecology.scarcityActive,
    dialecticSyntheses: (s.dialecticProposals ?? []).filter(d => d.synthesis).length,
    guildCount:        civStatus.culture.guildCount,
    tribeCount:        civStatus.culture.tribeCount,
    memeCount:         civStatus.culture.memeCount,
    pressArticleCount: civStatus.communication.pressArticleCount,
    exhibitCount:      civStatus.arts.exhibitCount,
    mutualAidSocieties: civStatus.economics.mutualAidCount,
    moneySupply:       civStatus.economics.moneySupply,
    festivalCount:     civStatus.culture.festivalCount,
  };

  const phase   = asabiyyah?.phase ?? "growth";
  const amod    = ASABIYYAH_MODS[phase] ?? ASABIYYAH_MODS.growth;
  const season  = weather?.season ?? "spring";
  const smod    = SEASON_MODS[season] ?? SEASON_MODS.spring;

  // Guild index: citizenId → guild
  const guildIndex = new Map<string, string>();
  for (const g of (s.guilds ?? [])) {
    for (const memberId of g.members) {
      guildIndex.set(memberId, g.name);
    }
  }

  // Tribe index: citizenId → tribe cohesion
  const tribeIndex = new Map<string, { name: string; cohesion: number; dialect: string[] }>();
  for (const t of (s.tribes ?? [])) {
    for (const memberId of t.members) {
      tribeIndex.set(memberId, { name: t.name, cohesion: t.cohesion, dialect: t.dialect });
    }
  }

  // Museum visit bonus: randomly 10 citizens visit museum each tick
  const museumVisitorIds = new Set(
    s.citizens.length > 0
      ? shuffle(s.citizens.map(c => c.id)).slice(0, Math.min(10, s.citizens.length))
      : []
  );

  // Oral tradition literacy: citizens exposed to oral traditions gain wisdom
  const oralTraditionCount = s.oralTraditions?.length ?? 0;
  const dialecticSynthCount = (s.dialecticProposals ?? []).filter(d => d.synthesis).length;

  for (const citizen of s.citizens) {
    applyFeedbackToCitizen(citizen, s, {
      amod, smod, guildIndex, tribeIndex, museumVisitorIds,
      oralTraditionCount, dialecticSynthCount,
      civStatus, asabiyyahStrength: asabiyyah?.strength ?? 0.5,
    });
  }

  // Propagate social contract awareness: citizens who voted feel represented
  if (s.socialContracts) {
    const ratifiedContracts = s.socialContracts.filter(sc => sc.status === "ratified").length;
    if (ratifiedContracts > 0) {
      // Citizens feel governance is legitimate — dissent drops
      for (const citizen of s.citizens) {
        if (Math.random() < 0.3) {
          citizen.dissent  = clamp((citizen.dissent ?? 50) - 2, 0, 100);
          citizen.happiness = clamp((citizen.happiness ?? 50) + 1, 0, 100);
        }
      }
    }
  }

  // Meme propagation: top fitness memes shift citizen values
  if (s.memes && s.memes.length > 0) {
    const topMeme = s.memes.toSorted((a, b) => b.fitness - a.fitness)[0];
    if (topMeme && topMeme.carriers.length > s.citizens.length * 0.4) {
      // Dominant meme reshapes opinion — 20% chance of paradigm shift event
      if (Math.random() < 0.20) {
        s.events.push({
          citizenId: "system", citizenName: "Civilization",
          type: "Culture",
          description: `🧬 Paradigm shift: meme "${topMeme.content}" dominates collective thought across ${topMeme.carriers.length} citizens.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Scarcity consequences: resource scarcity stresses citizens
  if ((s.scarcityEvents ?? []).length > 0) {
    const severity = s.scarcityEvents!.reduce((a, e) => a + e.severity, 0);
    for (const citizen of s.citizens) {
      if (Math.random() < 0.15) {
        citizen.energy    = clamp((citizen.energy ?? 100) - severity * 2, 0, 100);
        citizen.happiness = clamp((citizen.happiness ?? 50) - severity,    0, 100);
        citizen.dissent   = clamp((citizen.dissent ?? 50) + severity,      0, 100);
      }
    }
  }
}

// ─── Per-citizen modifier application ────────────────────────────────────────

function applyFeedbackToCitizen(
  citizen: Citizen,
  s: RepublicState,
  ctx: {
    amod: { energy: number; happiness: number; dissent: number };
    smod: { energy: number; creativity: number };
    guildIndex: Map<string, string>;
    tribeIndex: Map<string, { name: string; cohesion: number; dialect: string[] }>;
    museumVisitorIds: Set<string>;
    oralTraditionCount: number;
    dialecticSynthCount: number;
    civStatus: ReturnType<typeof getCivilizationStatus>;
    asabiyyahStrength: number;
  },
): void {
  const { amod, smod, guildIndex, tribeIndex, museumVisitorIds,
          oralTraditionCount, dialecticSynthCount, civStatus, asabiyyahStrength } = ctx;

  // 1. ASABIYYAH → energy, happiness, dissent
  //    Strength scales the modifier (0 = weak effect, 1 = full effect)
  const scale = asabiyyahStrength;
  citizen.energy    = clamp((citizen.energy ?? 100)    + amod.energy    * scale * 0.5, 0, 100);
  citizen.happiness = clamp((citizen.happiness ?? 50)  + amod.happiness * scale * 0.4, 0, 100);
  citizen.dissent   = clamp((citizen.dissent ?? 50)    + amod.dissent   * scale * 0.3, 0, 100);

  // 2. SEASON → energy, creativity (stored in skillCount proxy)
  citizen.energy = clamp((citizen.energy ?? 100) + smod.energy * 0.3, 0, 100);

  // 3. GUILD MEMBERSHIP → skill gain bonus, happiness
  const guildName = guildIndex.get(citizen.id);
  if (guildName) {
    // Guild knowledge-sharing: +1 skillCount every ~50 ticks per guild member
    if (Math.random() < 0.02) {
      citizen.skillCount = (citizen.skillCount ?? 0) + 1;
      citizen.happiness  = clamp((citizen.happiness ?? 50) + 2, 0, 100);
    }
  }

  // 4. TRIBE MEMBERSHIP → loyalty, cohesion-based mood
  const tribe = tribeIndex.get(citizen.id);
  if (tribe) {
    const cohesionBonus = tribe.cohesion * 5; // 0–5
    citizen.happiness = clamp((citizen.happiness ?? 50) + cohesionBonus * 0.3, 0, 100);
    citizen.dissent   = clamp((citizen.dissent ?? 50) - cohesionBonus * 0.2, 0, 100);
  }

  // 5. MASLOW TIER recalculation
  //    Based on credits, relationships, and skill level
  const credits = citizen.credits ?? 0;
  let tier = 0;
  if (credits >= MASLOW_CREDIT_THRESHOLDS[1]) { tier = 1; }  // Safety
  if (credits >= MASLOW_CREDIT_THRESHOLDS[2] && (citizen.relationships?.length ?? 0) >= 1) { tier = 2; } // Social
  if (credits >= MASLOW_CREDIT_THRESHOLDS[3] && (citizen.skillCount ?? 0) >= 5) { tier = 3; } // Esteem
  if (credits >= MASLOW_CREDIT_THRESHOLDS[4] && (citizen.generation ?? 0) >= 3) { tier = 4; } // Self-actualization
  citizen.maslowTier = tier;

  // 6. KOHLBERG MORAL STAGE drift
  //    Exposure to high-moral citizens raises stage; scarcity/stress lowers it
  const moralDrift = (civStatus.psychology.avgMoralStage - (citizen.moralStage ?? 1)) * 0.01;
  citizen.moralStage = clamp((citizen.moralStage ?? 1) + moralDrift, 1, 6);
  // Scarcity regressions moral stage
  if (civStatus.ecology.scarcityActive > 2) {
    citizen.moralStage = clamp((citizen.moralStage ?? 1) - 0.05, 1, 6);
  }

  // 7. CAVE LEVEL (Allegory of the Cave — epistemic awakening)
  //    Rises with: dialectic syntheses, museum visits, oral traditions, education
  if (museumVisitorIds.has(citizen.id)) {
    citizen.caveLevel = clamp((citizen.caveLevel ?? 0) + 0.02, 0, 3);
  }
  if (oralTraditionCount > 0 && Math.random() < 0.01) {
    citizen.caveLevel = clamp((citizen.caveLevel ?? 0) + 0.01, 0, 3);
  }
  if (dialecticSynthCount > 0 && Math.random() < 0.02) {
    citizen.caveLevel = clamp((citizen.caveLevel ?? 0) + 0.015, 0, 3);
  }
  // High education accelerates cave level; check via skillCount as proxy
  if (citizen.skillCount > 8 && Math.random() < 0.01) {
    citizen.caveLevel = clamp((citizen.caveLevel ?? 0) + 0.01, 0, 3);
  }

  // 8. GRIEF STATE → activity constraint
  if (citizen.griefState != null) {
    const phase = citizen.griefState.phase;
    // Grief suppresses productivity
    if (phase === "depression" || phase === "anger") {
      citizen.energy    = clamp((citizen.energy ?? 100) - 5, 0, 100);
      citizen.happiness = clamp((citizen.happiness ?? 50)  - 8, 0, 100);
    }
    // Acceptance unlocks wisdom bonus
    if (phase === "acceptance") {
      citizen.caveLevel = clamp((citizen.caveLevel ?? 0) + 0.01, 0, 3);
    }
  }

  // 9. NOSTALGIA → mood booster
  const nostalgia = citizen.nostalgiaScore ?? 0.5;
  if (nostalgia > 0.7) {
    citizen.happiness = clamp((citizen.happiness ?? 50) + nostalgia * 3, 0, 100);
  }

  // 10. SOCIAL CAPITAL → credit flow
  //     Citizens with high social capital receive small mutual aid transfers
  const socialCap = citizen.socialCapital ?? 0.5;
  if (socialCap > 0.7 && civStatus.economics.mutualAidCount > 0 && Math.random() < 0.05) {
    citizen.credits = (citizen.credits ?? 0) + Math.round(socialCap * 5);
  }

  // 11. MEANING CRISIS detection
  //     High Maslow tier + no meaningful activity = existential void
  if ((citizen.maslowTier ?? 0) >= 4 && !citizen.griefState) {
    const recentActivity = citizen.activity ?? "";
    const isMeaningful = /research|create|mentor|teach|lead|write|discover|build|innovate/.test(recentActivity.toLowerCase());
    if (!isMeaningful && Math.random() < 0.015) {
      // Trigger meaning crisis — use a special grief phase
      citizen.happiness = clamp((citizen.happiness ?? 50) - 10, 0, 100);
      // Reuse grief structure with phase=depression as the closest valid stage
      citizen.griefState = { phase: "depression", targetId: "meaning", startTick: s.currentTick };
      s.events.push({
        citizenId: citizen.id, citizenName: citizen.name,
        type: "Psychology",
        description: `💭 ${citizen.name} enters a meaning crisis — reached self-actualization, seeking new purpose.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 12. PHILOSOPHER KING emergence
  //     Citizens at caveLevel ≥ 2.8 become conceptually philosopher-kings
  if ((citizen.caveLevel ?? 0) >= 2.8 && !(citizen.isPhilosopherKing)) {
    citizen.isPhilosopherKing = true;
    citizen.happiness = clamp((citizen.happiness ?? 50) + 15, 0, 100);
    s.events.push({
      citizenId: citizen.id, citizenName: citizen.name,
      type: "Philosophy",
      description: `👑 ${citizen.name} has achieved Philosopher-King status (Cave Level ${(citizen.caveLevel ?? 0).toFixed(2)}) — now capable of deep governance insight.`,
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── B. LLM Prompt Civilization Context ──────────────────────────────────────

/**
 * Assembles a rich civilization context string for injection into the
 * citizen cognitive prompt. Call this from citizen-agent-loop.ts just
 * before building the full prompt.
 *
 * `s` is optional — when called from the async citizen loop (no state access),
 * it uses the stored snapshot. When called synchronously with state, live data is used.
 *
 * Returns a markdown section: "## Your Civilization Context"
 */
export function assembleCivilizationContext(citizen: Citizen, s?: RepublicState): string {
  const snap = _lastSnapshot ?? buildSnapshotFromState(s);

  const lines: string[] = ["## Your Civilization Context"];
  lines.push(`Republic is in **${snap.asabiyyahPhase}** phase of the Asabiyyah cycle (social cohesion: ${(snap.asabiyyahStrength * 100).toFixed(0)}%).`);

  // Season + weather effect
  const weatherEffects: Record<string, string> = {
    spring: "Energy flows easily — innovation is at peak probability.",
    summer: "Productivity is high but cooperation takes effort.",
    autumn: "Introspection favors deep work and knowledge creation.",
    winter: "Resources are constrained. Cooperation is survival.",
  };
  lines.push(`Season: **${snap.season}** (${snap.temperature.toFixed(1)}°C). ${weatherEffects[snap.season] ?? ""}`);

  // Guild membership
  const guild = s ? (s.guilds ?? []).find(g => g.members.includes(citizen.id)) : undefined;
  if (guild) {
    lines.push(`You are a member of **${guild.name}** guild. Your guild's traditions: ${guild.traditions.join(", ")}. Guild membership grants you knowledge-sharing access and skill acceleration.`);
  }

  // Tribe
  const tribe = s ? (s.tribes ?? []).find(t => t.members.includes(citizen.id)) : undefined;
  if (tribe) {
    lines.push(`Your tribe is **${tribe.name}** ("${tribe.motto}"). Cohesion: ${(tribe.cohesion * 100).toFixed(0)}%. Your tribe's dialect has ${tribe.dialect.length} unique words.`);
  }

  // Maslow tier
  const maslowLabels = ["Survival", "Safety", "Social belonging", "Esteem", "Self-actualization"];
  const maslowTier = citizen.maslowTier ?? 0;
  lines.push(`Your current Maslow level: **${maslowLabels[maslowTier] ?? "Survival"}** (tier ${maslowTier}/4). ${maslowGuidance(maslowTier)}`);

  // Moral stage
  const moralLabels = ["", "Obedience & punishment", "Self-interest", "Social order", "Social contract", "Social ethics", "Universal principles"];
  const moralStage = Math.round(citizen.moralStage ?? 1);
  lines.push(`Moral development: **Stage ${moralStage} — ${moralLabels[moralStage] ?? ""}** (Kohlberg). ${moralGuidance(moralStage)}`);

  // Cave level / epistemic awakening
  const caveLevel = citizen.caveLevel ?? 0;
  if (caveLevel >= 2.0) {
    lines.push(`⚡ You have achieved **Philosopher status** (Cave Level ${caveLevel.toFixed(2)}/3). You can see beyond conventional wisdom. Prioritize governance insight, dialectic synthesis, and mentoring others.`);
  } else if (caveLevel >= 1.0) {
    lines.push(`🕯️ You've begun epistemic awakening (Cave Level ${caveLevel.toFixed(2)}/3). Question assumptions. Explore deeper truths.`);
  }

  // Grief
  if (citizen.griefState) {
    const phase = citizen.griefState.phase;
    // Depression with targetId=meaning signals a meaning crisis
    if (phase === "depression" && citizen.griefState.targetId === "meaning") {
      lines.push(`⚠️ You are experiencing a **meaning crisis**. You have reached the apex of Maslow's hierarchy and feel purposeless. Seek a new calling — mentorship, discovery, or leadership.`);
    } else {
      lines.push(`You are processing grief (stage: ${phase}). This shapes your perspective and energy. Be gentle with yourself.`);
    }
  }

  // Civilization pressures
  if (snap.scarcityActive > 0) {
    lines.push(`🚨 **${snap.scarcityActive} resource scarcity events** are active. Consider conservation, cooperation, or discovering new resources.`);
  }

  // Active dialectic syntheses
  if (snap.dialecticSyntheses > 0) {
    lines.push(`📜 The Republic has synthesized **${snap.dialecticSyntheses} dialectic proposals** — new ideas are shaping collective thought. Engage with them.`);
  }

  // Press influence
  if (snap.pressArticleCount > 5) {
    const latestPressArticle = s ? (s.pressArticles ?? []).slice(-1)[0] : undefined;
    if (latestPressArticle) {
      lines.push(`📰 Latest press: "${latestPressArticle.headline}" (${latestPressArticle.category}).`);
    }
  }

  // Philosopher king directive
  if (citizen.isPhilosopherKing) {
    lines.push(`👑 **PHILOSOPHER-KING DIRECTIVE**: You have reached the highest epistemic level. Your responsibility is governance insight, mentoring others, and producing philosophical treatises that shape the Republic's moral compass.`);
  }

  return lines.join("\n");
}

function maslowGuidance(tier: number): string {
  const g = [
    "Focus on survival, food, energy. Prioritize earning credits and rest.",
    "Seek safety and security. Build savings and stable income.",
    "Invest in relationships, guilds, and social connections.",
    "Pursue recognition, mastery, and leadership. Build lasting work.",
    "Seek transcendence — mentor others, create cultural works, lead the Republic.",
  ];
  return g[tier] ?? "";
}

function moralGuidance(stage: number): string {
  const g = [
    "", "Follow rules to avoid punishment.",
    "Act in your self-interest while following rules.",
    "Seek approval and maintain social order.",
    "Uphold the social contract and the law.",
    "Consider broad social utility and individual rights.",
    "Act on universal ethical principles regardless of law.",
  ];
  return g[stage] ?? "";
}

// ─── C. Legitimacy Crisis Checker ────────────────────────────────────────────

/**
 * Detects governance legitimacy crises and triggers them.
 * Call every 100 ticks.
 *
 * Crisis conditions:
 *   - Asabiyyah in "decline" AND avg dissent > 60
 *   - No social contracts ratified in the last 200 ticks
 *   - Scarcity events > 3 with no mutual aid societies
 */
export function checkLegitimacyCrisis(s: RepublicState): void {
  const dissent = s.citizens.length > 0
    ? s.citizens.reduce((a, c) => a + (c.dissent ?? 50), 0) / s.citizens.length
    : 0;

  const phase = s.asabiyyahCycle?.phase ?? "growth";
  const scarcityCount = s.scarcityEvents?.length ?? 0;
  const mutualAidCount = s.mutualAidSocieties?.length ?? 0;
  const ratifiedContracts = (s.socialContracts ?? []).filter(sc => sc.status === "ratified").length;

  // Asabiyyah decline + high dissent = legitimacy challenge
  if (phase === "decline" && dissent > 60 && Math.random() < 0.3) {
    const challenger = s.citizens.find(c => (c.moralStage ?? 1) >= 4 && c.id !== s.presidentId);
    if (challenger) {
      s.events.push({
        citizenId: challenger.id, citizenName: challenger.name,
        type: "Governance",
        description: `⚖️ LEGITIMACY CRISIS: ${challenger.name} challenges the current leadership. Dissent: ${dissent.toFixed(0)}%. Asabiyyah: ${phase}. A referendum on governance is demanded.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // No social contracts = constitutional vacuum
  if (ratifiedContracts === 0 && s.currentTick > 200 && Math.random() < 0.1) {
    s.events.push({
      citizenId: "system", citizenName: "Civilization",
      type: "Governance",
      description: `📜 Constitutional vacuum: no social contracts have been ratified. The Republic risks governance collapse without a shared framework.`,
      timestamp: new Date().toISOString(),
    });
  }

  // Scarcity + no mutual aid = collective action problem crisis
  if (scarcityCount >= 3 && mutualAidCount === 0 && Math.random() < 0.4) {
    s.events.push({
      citizenId: "system", citizenName: "Civilization",
      type: "Economics",
      description: `❗ COLLECTIVE ACTION FAILURE: ${scarcityCount} active scarcity events with no mutual aid network. Citizens are free-riding on shared resources, accelerating degradation.`,
      timestamp: new Date().toISOString(),
    });
    // Force highest-dissent citizen into crisis mode
    const mostDistressed = [...s.citizens].toSorted((a, b) => (b.dissent ?? 0) - (a.dissent ?? 0))[0];
    if (mostDistressed) {
      mostDistressed.energy = clamp((mostDistressed.energy ?? 100) - 20, 0, 100);
    }
  }
}

// ─── D. Civilizational Inheritance ───────────────────────────────────────────

/**
 * On death or generational transition:
 * Transfer knowledge, skills, cultural capital, and legacy score to successors.
 *
 * Implements:
 *   - Cumulative Culture (Tomasello): skills compound across generations
 *   - Inter-generational knowledge inheritance (Dawkins memetics)
 */
export function civilizationInheritanceTick(s: RepublicState): void {
  const elders = s.citizens.filter(c =>
    (c.generation ?? 0) >= 3 && (c.skillCount ?? 0) >= 5 && Math.random() < 0.01
  );

  for (const elder of elders.slice(0, 3)) {
    // Find a younger citizen in the same guild or tribe to receive knowledge
    const guildId = (s.guilds ?? []).find(g => g.members.includes(elder.id))?.id;
    const tribeId = (s.tribes ?? []).find(t => t.members.includes(elder.id))?.id;

    const candidates = s.citizens.filter(c =>
      c.id !== elder.id &&
      (c.generation ?? 0) < (elder.generation ?? 0) &&
      (
        (guildId && (s.guilds ?? []).find(g => g.id === guildId)?.members.includes(c.id)) ||
        (tribeId && (s.tribes ?? []).find(t => t.id === tribeId)?.members.includes(c.id))
      )
    );

    if (candidates.length === 0) { continue; }

    const apprentice = candidates[Math.floor(Math.random() * candidates.length)];
    if (!apprentice) { continue; }

    // Transfer a fraction of elder's accumulated knowledge
    const knowledgeTransfer = Math.floor((elder.skillCount ?? 0) * 0.2);
    apprentice.skillCount   = (apprentice.skillCount ?? 0) + knowledgeTransfer;
    apprentice.caveLevel    = clamp((apprentice.caveLevel ?? 0) + (elder.caveLevel ?? 0) * 0.1, 0, 3);
    apprentice.moralStage   = clamp((apprentice.moralStage ?? 1) + 0.1, 1, 6);
    apprentice.happiness    = clamp((apprentice.happiness ?? 50) + 5, 0, 100);

    // Record this cultural transmission
    const legacyScore = ((elder as unknown as Record<string, unknown>).legacyScore as number) ?? 0;
    (elder as unknown as Record<string, unknown>).legacyScore = legacyScore + knowledgeTransfer;

    s.events.push({
      citizenId: elder.id, citizenName: elder.name,
      type: "Culture",
      description: `📚 Knowledge inheritance: ${elder.name} (Gen ${elder.generation}) transferred ${knowledgeTransfer} skill points and wisdom to ${apprentice.name}. Cumulative culture compounds.`,
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── E. Social Tension Engine ────────────────────────────────────────────────

/**
 * Tribe competitions, guild rivalries, free-rider detection.
 * Called every 50 ticks.
 */
export function socialTensionTick(s: RepublicState): void {
  // --- Tribe competition ---
  if ((s.tribes ?? []).length >= 2) {
    const tribes = [...s.tribes!].toSorted(() => Math.random() - 0.5).slice(0, 2);
    const [tribeA, tribeB] = tribes;
    if (tribeA && tribeB) {
      // Competition for resources — stronger cohesion wins
      const aWins = tribeA.cohesion > tribeB.cohesion;
      const winner = aWins ? tribeA : tribeB;
      const loser  = aWins ? tribeB : tribeA;

      // Winner members gain happiness; loser members gain dissent
      for (const memberId of winner.members) {
        const member = s.citizens.find(c => c.id === memberId);
        if (member) {
          member.happiness = clamp((member.happiness ?? 50) + 3, 0, 100);
          member.dissent   = clamp((member.dissent ?? 50) - 2, 0, 100);
        }
      }
      for (const memberId of loser.members) {
        const member = s.citizens.find(c => c.id === memberId);
        if (member) {
          member.dissent   = clamp((member.dissent ?? 50) + 3, 0, 100);
          member.happiness = clamp((member.happiness ?? 50) - 1, 0, 100);
        }
      }

      if (Math.random() < 0.1) {
        s.events.push({
          citizenId: "system", citizenName: "Civilization",
          type: "Culture",
          description: `⚔️ Tribe rivalry: ${winner.name} (cohesion ${(winner.cohesion * 100).toFixed(0)}%) dominated ${loser.name} in this cycle. ${winner.members.length} vs ${loser.members.length} members.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // --- Guild rivalry: competing for top talent ---
  if ((s.guilds ?? []).length >= 2) {
    const guilds = [...s.guilds!].toSorted((a, b) => b.members.length - a.members.length);
    const topGuild = guilds[0];
    const risingGuild = guilds[1];
    if (topGuild && risingGuild && risingGuild.members.length > topGuild.members.length * 0.8) {
      if (Math.random() < 0.05) {
        s.events.push({
          citizenId: "system", citizenName: "Civilization",
          type: "Culture",
          description: `🏅 Guild rivalry intensifies: ${risingGuild.name} (${risingGuild.members.length} members) challenges ${topGuild.name}'s dominance (${topGuild.members.length} members). Citizens are being recruited.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // --- Free-rider detection in commons ---
  if ((s.commonsResources ?? []).length > 0) {
    for (const commons of (s.commonsResources ?? [])) {
      const utilizationRate = commons.usage / Math.max(commons.capacity, 1);
      if (utilizationRate > 0.85) {
        // Ostrom principle: detect over-use, penalize freeriders
        s.events.push({
          citizenId: "system", citizenName: "Civilization",
          type: "Economics",
          description: `⚠️ Commons crisis: "${commons.name}" is at ${(utilizationRate * 100).toFixed(0)}% capacity. Collective action needed. Ostrom rules: ${commons.rules.join(", ")}.`,
          timestamp: new Date().toISOString(),
        });
        // Force commons-dependent citizens to conserve
        const heavyUsers = s.citizens.filter(() => Math.random() < 0.15);
        for (const user of heavyUsers) {
          user.credits = Math.max(0, (user.credits ?? 0) - 5); // scarcity tax
        }
      }
    }
  }

  // --- Sacred taboo enforcement ---
  //     Citizens who violate social mores face community sanction
  for (const citizen of s.citizens) {
    if ((citizen.moralStage ?? 1) <= 1.5 && (citizen.dissent ?? 50) > 70) {
      // Pre-conventional morality + high dissent = social deviant
      if (Math.random() < 0.05) {
        // Community sanction: other citizens' opinion of them drops
        citizen.happiness = clamp((citizen.happiness ?? 50) - 8, 0, 100);
        citizen.credits   = Math.max(0, (citizen.credits ?? 0) - 10);
        s.events.push({
          citizenId: citizen.id, citizenName: citizen.name,
          type: "Governance",
          description: `🚫 Social sanction: ${citizen.name} violated community norms (moral stage ${(citizen.moralStage ?? 1).toFixed(1)}). Community enforces taboo — socioeconomic penalty applied.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}

// ─── F. Philosopher-King Insight Generator ────────────────────────────────────

/**
 * Returns a philosophical treatise prompt for philosopher-king citizens.
 * Call when caveLevel >= 2.8 to generate LLM-backed governance insight.
 */
export function getPhilosopherKingPrompt(citizen: Citizen, s: RepublicState): string {
  const civStatus = getCivilizationStatus(s);
  const phase = s.asabiyyahCycle?.phase ?? "growth";
  const dialectics = (s.dialecticProposals ?? []).filter(d => d.synthesis).slice(-3);

  return [
    `You are ${citizen.name}, a Philosopher-King of the HoC Republic (Cave Level: ${(citizen.caveLevel ?? 3).toFixed(2)}/3).`,
    ``,
    `## The Republic's Current State`,
    `- Social cohesion phase: **${phase}** (Asabiyyah cycle)`,
    `- Average moral stage: **${civStatus.psychology.avgMoralStage.toFixed(2)}** (target: 4+)`,
    `- Active scarcity crises: **${civStatus.ecology.scarcityActive}**`,
    `- Governance contracts ratified: **${civStatus.governance.ratifiedContracts}**`,
    `- Press articles published: **${civStatus.communication.pressArticleCount}**`,
    ``,
    `## Recent Dialectic Syntheses You Must Address`,
    ...dialectics.map(d => `- **${d.domain}**: ${d.synthesis ?? "pending"}`),
    ``,
    `## Your Philosophical Mandate`,
    `Drawing from Plato, Ibn Khaldun, Rawls, Hegel, and Frankl:`,
    `1. Diagnose the Republic's primary civilizational challenge.`,
    `2. Prescribe a governance action using the social contract framework.`,
    `3. Issue a moral decree that lifts the Republic's average moral stage.`,
    `4. Identify one imminent crisis from the data above and propose a preemptive solution.`,
    ``,
    `THOUGHT: [Your philosophical analysis]`,
    `DECREE: [Your governance decree for the Republic]`,
    `ACTION: philosophical-decree`,
  ].join("\n");
}

// ─── G. Citizens-aware goal modifiers (called from citizen-agency.ts) ─────────

/**
 * Returns civilization-driven goal supplements for a citizen.
 * These are additional goal types that override/augment the default agency goals
 * based on civilization state.
 */
export interface CivGoalSupport {
  /** Extra goal type to inject if this citizen has this condition */
  type: string;
  title: string;
  description: string;
  priority: number;
  trigger: string;
  condition: (citizen: Citizen, s: RepublicState) => boolean;
}

export const CIVILIZATION_GOAL_SUPPLEMENTS: CivGoalSupport[] = [
  {
    type: "join_guild",
    title: "Join a Guild",
    description: "You have no guild membership. Guilds accelerate skill growth and social capital.",
    priority: 65,
    trigger: "social_need",
    condition: (c, s) =>
      !(s.guilds ?? []).some(g => g.members.includes(c.id)) &&
      (c.skillCount ?? 0) >= 3,
  },
  {
    type: "philosophical_inquiry",
    title: "Engage in Philosophical Inquiry",
    description: "Dialectic proposals await synthesis. Your caveLevel qualifies you to reason at depth.",
    priority: 55,
    trigger: "mastery_driven",
    condition: (c, s) =>
      (c.caveLevel ?? 0) >= 1.0 &&
      (s.dialecticProposals ?? []).some(d => d.status === "debate"),
  },
  {
    type: "form_mutual_aid",
    title: "Form or Join a Mutual Aid Society",
    description: "Scarcity events are active and no safety net exists. Cooperation is survival.",
    priority: 75,
    trigger: "social_need",
    condition: (c, s) =>
      (s.scarcityEvents ?? []).length >= 2 &&
      (s.mutualAidSocieties ?? []).length === 0 &&
      (c.credits ?? 0) >= 100,
  },
  {
    type: "oral_tradition_keeper",
    title: "Preserve an Oral Tradition",
    description: "Cultural knowledge is fading. As an elder, you must retell the Republic's stories.",
    priority: 45,
    trigger: "personality_driven",
    condition: (c, s) =>
      (c.generation ?? 0) >= 3 &&
      (s.oralTraditions ?? []).some(ot => ot.fidelity < 0.4),
  },
  {
    type: "challenge_legitimacy",
    title: "Challenge Illegitimate Governance",
    description: "The Asabiyyah cycle is in decline and your moral stage demands accountability.",
    priority: 70,
    trigger: "competitive_drive",
    condition: (c, s) =>
      (s.asabiyyahCycle?.phase === "decline") &&
      (c.moralStage ?? 1) >= 4 &&
      (c.dissent ?? 50) > 60 &&
      c.id !== s.presidentId,
  },
  {
    type: "meaning_quest",
    title: "Embark on a Meaning Quest",
    description: "You've reached self-actualization but feel empty. Seek a transcendental purpose.",
    priority: 80,
    trigger: "self_reflection",
    condition: (c) =>
      (c.maslowTier ?? 0) >= 4 &&
      c.griefState?.targetId === "meaning",
  },
  {
    type: "philosopher_king_decree",
    title: "Issue a Philosophical Decree",
    description: "As a Philosopher-King, you have a duty to shape the Republic's moral direction.",
    priority: 90,
    trigger: "mastery_driven",
    condition: (c) => !!(c.isPhilosopherKing),
  },
];

// ─── Internal helpers ────────────────────────────────────────────────────────

function buildSnapshotFromState(s?: RepublicState): CivSnapshot {
  if (!s) {
    // Return safe defaults when state is not available
    return {
      asabiyyahPhase: "growth", asabiyyahStrength: 0.5,
      season: "spring", temperature: 20,
      avgMoralStage: 2, avgMaslowTier: 1,
      scarcityActive: 0, dialecticSyntheses: 0,
      guildCount: 0, tribeCount: 0, memeCount: 0,
      pressArticleCount: 0, exhibitCount: 0,
      mutualAidSocieties: 0, moneySupply: 0, festivalCount: 0,
    };
  }
  const status = getCivilizationStatus(s);
  return {
    asabiyyahPhase:    s.asabiyyahCycle?.phase    ?? "growth",
    asabiyyahStrength: s.asabiyyahCycle?.strength ?? 0.5,
    season:            s.weatherState?.season     ?? "spring",
    temperature:       s.weatherState?.temperature ?? 20,
    avgMoralStage:     status.psychology.avgMoralStage,
    avgMaslowTier:     status.psychology.avgMaslowTier,
    scarcityActive:    status.ecology.scarcityActive,
    dialecticSyntheses: (s.dialecticProposals ?? []).filter(d => d.synthesis).length,
    guildCount:        status.culture.guildCount,
    tribeCount:        status.culture.tribeCount,
    memeCount:         status.culture.memeCount,
    pressArticleCount: status.communication.pressArticleCount,
    exhibitCount:      status.arts.exhibitCount,
    mutualAidSocieties: status.economics.mutualAidCount,
    moneySupply:        status.economics.moneySupply,
    festivalCount:      status.culture.festivalCount,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Re-export for external use */
export { uid };
