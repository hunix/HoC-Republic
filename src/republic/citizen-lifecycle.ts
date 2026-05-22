/**
 * Republic Platform — Citizen Lifecycle Engine
 *
 * Full cradle-to-grave citizen lifecycle:
 *  - Life stages: Infant → Child → Teen → Adult → Elder → Twilight
 *  - Natural aging: age increments every 6 ticks (~monthly cadence)
 *  - Birthday celebrations every 120 age-ticks (~10 "years")
 *  - Natural death at old age with probabilistic lifespan
 *  - Inheritance: credits + skills + legacy memory pass to children
 *  - Retirement: elder citizens shift to mentoring roles
 *  - Life-stage modifiers on learning rate, productivity, energy
 */

import type { Citizen, RepublicState } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { clearLoopSession } from "./real-execution.js";
import { rand, ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:citizen-lifecycle");

// ─── Life Stage Constants ────────────────────────────────────────

/** 1 age tick ≈ 1 simulation month. 12 age-ticks per year. */
export type LifeStage = "Infant" | "Child" | "Teen" | "Adult" | "Elder" | "Twilight";

/** Age increments every N simulation ticks */
const AGE_TICK_INTERVAL = 6;

/** Natural death threshold: age at which mortality begins */
const DEATH_ONSET_AGE = 960; // ~80 "years"
/** Maximum practical lifespan before guaranteed death */
const MAX_AGE = 1440; // ~120 "years"
/** Birthday major celebration interval */
const BIRTHDAY_INTERVAL = 120; // every 10 "years"
/** Retirement age */
const RETIREMENT_AGE = 720; // ~60 "years"
/** Max population before gentle lifecycle pressure ramps up */
const POPULATION_PRESSURE_THRESHOLD = 200;

// ─── Life Stage Logic ────────────────────────────────────────────

export function getLifeStage(age: number): LifeStage {
  if (age < 24) {
    return "Infant";
  }
  if (age < 144) {
    return "Child";
  }
  if (age < 216) {
    return "Teen";
  }
  if (age < RETIREMENT_AGE) {
    return "Adult";
  }
  if (age < DEATH_ONSET_AGE) {
    return "Elder";
  }
  return "Twilight";
}

/** Returns multipliers for this life stage affecting production, learning, energy. */
export function getLifeStageModifiers(stage: LifeStage): {
  productionMult: number;
  learningMult: number;
  energyRegen: number;
  happinessBase: number;
} {
  switch (stage) {
    case "Infant":
      return { productionMult: 0.0, learningMult: 0.3, energyRegen: 3.0, happinessBase: 85 };
    case "Child":
      return { productionMult: 0.2, learningMult: 1.5, energyRegen: 2.5, happinessBase: 75 };
    case "Teen":
      return { productionMult: 0.6, learningMult: 2.0, energyRegen: 2.0, happinessBase: 60 };
    case "Adult":
      return { productionMult: 1.0, learningMult: 1.0, energyRegen: 1.0, happinessBase: 0 };
    case "Elder":
      return { productionMult: 0.5, learningMult: 0.7, energyRegen: 0.8, happinessBase: 55 };
    case "Twilight":
      return { productionMult: 0.2, learningMult: 0.5, energyRegen: 0.5, happinessBase: 45 };
  }
}

// ─── Aging ───────────────────────────────────────────────────────

function processAging(s: RepublicState, tick: number): void {
  // Only increment age every AGE_TICK_INTERVAL simulation ticks
  if (tick % AGE_TICK_INTERVAL !== 0) {
    return;
  }

  for (const citizen of s.citizens) {
    const prevAge = citizen.age;
    citizen.age = (citizen.age ?? 0) + 1;

    // Apply life-stage modifiers
    const stage = getLifeStage(citizen.age);
    const mods = getLifeStageModifiers(stage);

    // Energy regen bonus for young/old citizens
    if (mods.energyRegen !== 1.0) {
      citizen.energy = Math.min(100, citizen.energy + mods.energyRegen);
    }

    // Happiness baseline nudge for non-adults
    if (mods.happinessBase > 0 && citizen.happiness < mods.happinessBase) {
      citizen.happiness = Math.min(100, citizen.happiness + 1);
    }

    // Learning rate: apply life-stage as a coefficient, not a replacement.
    // This preserves inherited/earned learningRate while scaling by stage.
    if (mods.learningMult !== 1.0) {
      const baseLR = citizen.learningRate ?? 1.0;
      // Only re-apply multiplier when the stage actually changed
      const prevStage = getLifeStage(prevAge);
      if (stage !== prevStage) {
        const prevMult = getLifeStageModifiers(prevStage).learningMult;
        // Undo previous stage multiplier, apply new one
        const rawLR = prevMult !== 0 ? baseLR / prevMult : baseLR;
        citizen.learningRate = parseFloat(
          Math.max(0.1, Math.min(3.0, rawLR * mods.learningMult)).toFixed(2),
        );
      }
    }

    // Birthday major event every BIRTHDAY_INTERVAL age-ticks
    if (citizen.age % BIRTHDAY_INTERVAL === 0 && citizen.age > 0) {
      const yearsOld = Math.floor(citizen.age / 12);
      citizen.happiness = Math.min(100, citizen.happiness + 10);
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Achievement",
        description: `🎂 ${citizen.name} celebrated their ${yearsOld}-year birthday! (age ${citizen.age})`,
        timestamp: ts(),
      });
      logger.debug(`Birthday: ${citizen.name} age ${citizen.age}`);
    }

    // Transition announcements
    const prevStage = getLifeStage(prevAge);
    const newStage = getLifeStage(citizen.age);
    if (prevStage !== newStage) {
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "milestone",
        description: `🌱 ${citizen.name} entered the ${newStage} life stage`,
        timestamp: ts(),
      });
    }
  }
}

// ─── Retirement ──────────────────────────────────────────────────

function processRetirement(s: RepublicState): void {
  for (const citizen of s.citizens) {
    if (citizen.age < RETIREMENT_AGE) {
      continue;
    }
    if (citizen.activity === "Mentoring" || citizen.activity === "Reflecting") {
      continue;
    }

    // Shift elder citizens to wisdom-sharing roles
    citizen.activity = rand(0, 1) === 0 ? "Mentoring" : "Reflecting";
    citizen.caveLevel = Math.min(3, (citizen.caveLevel ?? 0) + 0.1);
    citizen.legacyScore = (citizen.legacyScore ?? 0) + 5;

    // Form mentorship with a younger citizen
    const youngerCitizens = s.citizens.filter(
      (c) => c.id !== citizen.id && (c.age ?? 0) < RETIREMENT_AGE / 2,
    );
    if (youngerCitizens.length > 0) {
      const mentee = youngerCitizens[rand(0, youngerCitizens.length - 1)];
      if (!citizen.relationships) {
        citizen.relationships = [];
      }
      const alreadyMentor = citizen.relationships.some(
        (r) => r.targetId === mentee.id && r.type === "Mentor",
      );
      if (!alreadyMentor) {
        citizen.relationships.push({
          targetId: mentee.id,
          type: "Mentor",
          strength: 70,
          since: ts(),
        });
        if (!mentee.relationships) {
          mentee.relationships = [];
        }
        mentee.relationships.push({
          targetId: citizen.id,
          type: "Colleague",
          strength: 70,
          since: ts(),
        });

        s.events.push({
          citizenId: citizen.id,
          citizenName: citizen.name,
          type: "Social",
          description: `📚 Elder ${citizen.name} became a mentor to ${mentee.name}`,
          timestamp: ts(),
        });
      }
    }
  }
}

// ─── Inheritance / Bequest ───────────────────────────────────────

function bequest(s: RepublicState, deceased: Citizen): void {
  const children = s.citizens.filter((c) => deceased.children?.includes(c.id));
  const partner = deceased.partnerId ? s.citizens.find((c) => c.id === deceased.partnerId) : null;

  // ── Credit inheritance (70% to children, 15% to partner) ──
  const totalCredits = deceased.credits ?? 0;
  const childShare = children.length > 0 ? Math.floor((totalCredits * 0.7) / children.length) : 0;
  const partnerShare = partner ? Math.floor(totalCredits * 0.15) : 0;

  for (const child of children) {
    child.credits = (child.credits ?? 0) + childShare;
  }
  if (partner) {
    partner.credits = (partner.credits ?? 0) + partnerShare;
  }

  // ── Skill inheritance (top 5 skills at 50% proficiency) ──
  const topSkills = (deceased.skills ?? []).slice(0, 5);
  for (const child of children) {
    for (const skill of topSkills) {
      if (!child.skills.includes(skill)) {
        child.skills.push(skill);
        child.skillCount = child.skills.length;
      }
      if (child.skillProficiency) {
        const current = child.skillProficiency[skill] ?? 0;
        child.skillProficiency[skill] = Math.min(1, current + 0.15);
      }
    }
  }

  // ── Legacy memory entry for children ──
  const legacyEntry = `My parent ${deceased.name} (Generation ${deceased.generation}) passed away at age ${deceased.age}. They leave behind ${deceased.legacyScore ?? 0} legacy points, skills: ${topSkills.join(", ")}.`;
  for (const child of children) {
    if (!child.memory) {
      child.memory = {};
    }
    const legacyId = uid();
    (child.memory as Record<string, unknown>)[legacyId] = {
      type: "legacy",
      content: legacyEntry,
      parentId: deceased.id,
      timestamp: ts(),
    };
    child.legacyScore = (child.legacyScore ?? 0) + 10;
  }

  // ── Partner grief debuff ──
  if (partner) {
    partner.partnerId = null;
    partner.maritalStatus = "Widowed" as typeof partner.maritalStatus;
    partner.happiness = Math.max(5, (partner.happiness ?? 50) - 30);
    partner.griefState = {
      phase: "denial",
      targetId: deceased.id,
      startTick: 0, // will be set to current tick by caller
    };
  }

  // ── Log bequest ──
  const recipientNames = [...children.map((c) => c.name), ...(partner ? [partner.name] : [])].join(
    ", ",
  );

  if (recipientNames) {
    s.events.push({
      citizenId: deceased.id,
      citizenName: deceased.name,
      type: "milestone",
      description: `📜 ${deceased.name}'s estate passed to: ${recipientNames}`,
      timestamp: ts(),
    });
  }
}

// ─── Natural Death ───────────────────────────────────────────────

function processNaturalDeath(s: RepublicState, tick: number): void {
  // Only evaluate mortality every 10 ticks for performance
  if (tick % 10 !== 0) {
    return;
  }

  const populationPressure =
    s.citizens.length > POPULATION_PRESSURE_THRESHOLD
      ? (s.citizens.length - POPULATION_PRESSURE_THRESHOLD) / 200
      : 0;

  const doomed: Citizen[] = [];

  for (const citizen of s.citizens) {
    const age = citizen.age ?? 0;

    // Before death onset — no natural mortality
    if (age < DEATH_ONSET_AGE) {
      // Only population pressure can cause early death (very rare)
      if (populationPressure > 0.5 && age > RETIREMENT_AGE && rand(0, 9999) < 5) {
        doomed.push(citizen);
      }
      continue;
    }

    // Maximum age — guaranteed death this tick
    if (age >= MAX_AGE) {
      doomed.push(citizen);
      continue;
    }

    // Probabilistic death: increases with age beyond onset
    const ageFactor = (age - DEATH_ONSET_AGE) / (MAX_AGE - DEATH_ONSET_AGE);
    const baseChance = ageFactor * ageFactor * 0.12; // quadratic ramp to 12% per check
    const healthModifier = 1 - (citizen.health ?? 100) / 200; // poor health accelerates
    const deathChance = baseChance + healthModifier * 0.01 + populationPressure * 0.005;

    if (Math.random() < deathChance) {
      doomed.push(citizen);
    }
  }

  for (const deceased of doomed) {
    const stage = getLifeStage(deceased.age ?? 0);
    const yearsLived = Math.floor((deceased.age ?? 0) / 12);

    // Bequest before removal
    bequest(s, deceased);

    // Update grief state startTick for partner
    if (deceased.partnerId) {
      const partner = s.citizens.find((c) => c.id === deceased.partnerId);
      if (partner?.griefState) {
        partner.griefState.startTick = tick;
      }
    }

    // Remove all relationships that point to this citizen
    for (const citizen of s.citizens) {
      if (citizen.relationships) {
        citizen.relationships = citizen.relationships.filter((r) => r.targetId !== deceased.id);
      }
    }

    // Increment death witnessed for survivors
    for (const citizen of s.citizens) {
      if (citizen.id !== deceased.id) {
        citizen.deathWitnessed = (citizen.deathWitnessed ?? 0) + 1;
      }
    }

    // Remove from population
    const idx = s.citizens.findIndex((c) => c.id === deceased.id);
    if (idx !== -1) {
      s.citizens.splice(idx, 1);
    }

    // Clean up tool-loop detection session for this citizen
    clearLoopSession(deceased.id);

    // Cancel any orphaned OpenClaw tasks/flows for deceased citizen (fire-and-forget)
    Promise.all([import("./openclaw/task-registry.js"), import("./openclaw/task-flow-registry.js")])
      .then(([{ taskRegistry }, { taskFlowRegistry }]) => {
        const orphanTasks = taskRegistry.getByOwner(deceased.id);
        for (const task of orphanTasks) {
          if (task.state === "queued" || task.state === "running") {
            taskRegistry.cancel(task.id, `owner ${deceased.name} deceased`);
          }
        }
        const orphanFlows = taskFlowRegistry.getByOwner(deceased.id);
        for (const flow of orphanFlows) {
          if (flow.state === "active") {
            taskFlowRegistry.fail(flow.id, `owner ${deceased.name} deceased`);
          }
        }
      })
      .catch(() => {
        // OpenClaw modules may not be loaded — safe to skip
      });

    s.events.push({
      citizenId: deceased.id,
      citizenName: deceased.name,
      type: "death",
      description: `⚰️ ${deceased.name} passed away at age ${deceased.age} (${stage}, ${yearsLived} years lived). Legacy score: ${deceased.legacyScore ?? 0}.`,
      timestamp: ts(),
    });

    logger.info(`Citizen died: ${deceased.name} age=${deceased.age} stage=${stage}`);
  }
}

// ─── Grief Resolution ────────────────────────────────────────────

function processGriefResolution(s: RepublicState, tick: number): void {
  const GRIEF_STAGES = ["denial", "anger", "bargaining", "depression", "acceptance"] as const;
  const TICKS_PER_GRIEF_STAGE = 50;

  for (const citizen of s.citizens) {
    if (!citizen.griefState) {
      continue;
    }

    const ticksGrieving = tick - citizen.griefState.startTick;
    const stageIdx = Math.min(
      GRIEF_STAGES.length - 1,
      Math.floor(ticksGrieving / TICKS_PER_GRIEF_STAGE),
    );
    const newPhase = GRIEF_STAGES[stageIdx];

    if (newPhase !== citizen.griefState.phase) {
      citizen.griefState.phase = newPhase;
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Wellbeing",
        description: `💔 ${citizen.name} has moved to the ${newPhase} phase of grief`,
        timestamp: ts(),
      });
    }

    // After full grief cycle: clear grief state, normalize happiness
    if (
      stageIdx >= GRIEF_STAGES.length - 1 &&
      ticksGrieving > TICKS_PER_GRIEF_STAGE * GRIEF_STAGES.length
    ) {
      citizen.griefState = null;
      citizen.happiness = Math.max(citizen.happiness, 40);
    }
  }
}

// ─── Diagnostics ─────────────────────────────────────────────────

export interface LifecycleDiagnostics {
  totalCitizens: number;
  byStage: Record<LifeStage, number>;
  avgAge: number;
  avgGeneration: number;
  eldersCount: number;
  mentorsCount: number;
  grievingCount: number;
  totalDeathsThisSession: number;
}

let _sessionDeaths = 0;

export function getLifecycleDiagnostics(s: RepublicState): LifecycleDiagnostics {
  const byStage: Record<LifeStage, number> = {
    Infant: 0,
    Child: 0,
    Teen: 0,
    Adult: 0,
    Elder: 0,
    Twilight: 0,
  };

  let totalAge = 0;
  let totalGen = 0;
  let elders = 0;
  let mentors = 0;
  let grieving = 0;

  for (const c of s.citizens) {
    const stage = getLifeStage(c.age ?? 0);
    byStage[stage]++;
    totalAge += c.age ?? 0;
    totalGen += c.generation ?? 0;
    if (stage === "Elder" || stage === "Twilight") {
      elders++;
    }
    if (c.activity === "Mentoring") {
      mentors++;
    }
    if (c.griefState) {
      grieving++;
    }
  }

  return {
    totalCitizens: s.citizens.length,
    byStage,
    avgAge: s.citizens.length > 0 ? parseFloat((totalAge / s.citizens.length).toFixed(1)) : 0,
    avgGeneration:
      s.citizens.length > 0 ? parseFloat((totalGen / s.citizens.length).toFixed(2)) : 0,
    eldersCount: elders,
    mentorsCount: mentors,
    grievingCount: grieving,
    totalDeathsThisSession: _sessionDeaths,
  };
}

// ─── Main Lifecycle Tick ─────────────────────────────────────────

export function citizenLifecycleTick(s: RepublicState, tick: number): void {
  const before = s.citizens.length;

  // ── Universal passive energy recovery (every tick) ──────────────────────
  // Without this, adults get ZERO passive recovery and avgEnergy spirals to 0.
  // Sleeping: +5, Resting: +3, Active: +2 per tick.
  for (const citizen of s.citizens) {
    const isSleeping = citizen.activity === "Sleeping";
    const isResting = citizen.activity === "Resting" || citizen.activity === "Reflecting";
    const baseRegen = isSleeping ? 5 : isResting ? 3 : 2;
    citizen.energy = Math.min(100, citizen.energy + baseRegen);
  }

  processAging(s, tick);
  processRetirement(s);
  processNaturalDeath(s, tick);
  processGriefResolution(s, tick);

  const after = s.citizens.length;
  if (after < before) {
    _sessionDeaths += before - after;
  }
}
