/**
 * Republic Platform — Citizen Biological Simulation Engine
 *
 * Implements a full biological simulation layer:
 *  - Circadian rhythm (24-tick sleep/wake cycle)
 *  - Hunger & nutrition (affects energy and cognition)
 *  - Sleep quality (carries into next-day performance)
 *  - Disease & immunity (random infection events, recovery)
 *  - Physical fitness (exercise → longevity bonus)
 *  - Biological aging (well-cared bodies age slower)
 *  - Reproductive biology (fertility windows, pregnancy)
 *
 * "And We created you from water." — Al-Anbiya 21:30
 * "He created the human being from clay." — Al-Rahman 55:14
 */

import type { RepublicState } from "./types.js";
import { rand, ts } from "./utils.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:citizen-biology");

// ─── Constants ────────────────────────────────────────────────────

const TICKS_PER_DAY = 24;
const SLEEP_TICKS = 8;          // Citizens sleep 8 ticks out of 24
const HUNGER_INCREMENT = 3;     // Hunger per tick (0-100)
const HUNGER_DAMAGE_THRESHOLD = 70;
const HUNGER_ENERGY_DRAIN = 2;
const FOOD_COST_PER_MEAL = 5;   // Credits per meal
const DISEASE_BASE_CHANCE = 0.002; // 0.2% per tick
const DISEASE_RECOVERY_TICKS = 15;
const EXERCISE_HEALTH_BONUS = 2;
const PREGNANCY_TICKS = 3;      // 3-tick gestation period

// ─── Biological State ─────────────────────────────────────────────

type DiseaseType = "cold" | "fatigue_syndrome" | "stress_illness" | "minor_injury" | "infection";

export interface Disease {
  type: DiseaseType;
  name: string;
  severity: number;     // 0-100
  startTick: number;
  recoveryTick: number;
  healthDrainPerTick: number;
}

export interface BiologyProfile {
  citizenId: string;

  // Circadian
  sleepDebt: number;          // 0-100 (accumulated sleep deprivation)
  lastSleptTick: number;
  hoursSleptToday: number;    // 0-8 (tracks within 24-tick cycle)
  circadianPhase: number;     // 0-23 (tick within day cycle)
  sleepQuality: number;       // 0-100 (last sleep quality)

  // Nutrition
  hunger: number;             // 0-100 (0=full, 100=starving)
  nutritionLevel: number;     // 0-100 (overall nutrition quality)
  mealsToday: number;         // meals eaten in current day cycle

  // Physical fitness
  fitnessLevel: number;       // 0-100
  exerciseStreak: number;     // consecutive ticks with exercise activity
  biologicalAge: number;      // may diverge from simulation age

  // Disease
  activeDisease: Disease | null;
  immunityScore: number;      // 0-100 (higher = less likely to get sick)
  diseasesOvercome: number;   // total diseases recovered from

  // Reproductive
  canReproduce: boolean;
  isPregnant: boolean;
  pregnancyTick: number | null;

  // Metabolic state
  metabolicRate: number;      // 0.5–1.5 (affects how fast energy is consumed)
  bodyTemperature: number;    // 36.0–40.0 (elevated during disease)
}

// ─── Global Registry ──────────────────────────────────────────────

const _biologyRegistry = new Map<string, BiologyProfile>();

/** Pending births — filled by pregnancy completion, drained by population handler */
const _pendingBirths: Array<{ motherCitizenId: string; tick: number }> = [];

// ─── Profile Generator ────────────────────────────────────────────

export function generateBiologyProfile(
  citizenId: string,
  age: number = 25,
  initialTick: number = 0,
): BiologyProfile {
  const isYoung = age < 100;
  const isElder = age > 400;

  return {
    citizenId,
    sleepDebt: rand(0, 20),
    lastSleptTick: initialTick,
    hoursSleptToday: rand(4, 8),
    circadianPhase: rand(0, 23),
    sleepQuality: rand(60, 90),
    hunger: rand(10, 40),
    nutritionLevel: rand(50, 80),
    mealsToday: rand(0, 2),
    fitnessLevel: isYoung ? rand(50, 80) : isElder ? rand(20, 50) : rand(40, 70),
    exerciseStreak: 0,
    biologicalAge: age,
    activeDisease: null,
    immunityScore: isYoung ? rand(60, 90) : isElder ? rand(20, 50) : rand(50, 80),
    diseasesOvercome: rand(0, 5),
    canReproduce: age > 30 && age < 350, // Young Adult through Elder
    isPregnant: false,
    pregnancyTick: null,
    metabolicRate: 0.8 + Math.random() * 0.4,
    bodyTemperature: 36.5 + Math.random() * 0.5,
  };
}

function getOrCreateBiology(citizen: RepublicState["citizens"][0], tick: number): BiologyProfile {
  if (!_biologyRegistry.has(citizen.id)) {
    _biologyRegistry.set(
      citizen.id,
      generateBiologyProfile(citizen.id, citizen.age ?? 25, tick),
    );
  }
  return _biologyRegistry.get(citizen.id)!;
}

// ─── Circadian Rhythm ─────────────────────────────────────────────

function processSleepCycle(
  bio: BiologyProfile,
  citizen: RepublicState["citizens"][0],
  tick: number,
  s: RepublicState,
): void {
  bio.circadianPhase = tick % TICKS_PER_DAY;

  // Sleep window: ticks 16-23 (nighttime)
  const isSleepTime = bio.circadianPhase >= 16 && bio.circadianPhase < 16 + SLEEP_TICKS;

  if (isSleepTime) {
    if (citizen.activity !== "Sleeping") {
      citizen.activity = "Sleeping";
    }
    bio.hoursSleptToday = Math.min(SLEEP_TICKS, bio.hoursSleptToday + 1);

    // Sleep quality affected by: stress, disease, hunger, sleep debt
    const stressModifier = citizen.happiness && citizen.happiness < 30 ? -20 : 0;
    const diseaseModifier = bio.activeDisease ? -30 : 0;
    const hungerModifier = bio.hunger > HUNGER_DAMAGE_THRESHOLD ? -15 : 0;
    bio.sleepQuality = Math.max(20, Math.min(100,
      80 + stressModifier + diseaseModifier + hungerModifier + rand(-5, 5),
    ));

    // Reduce sleep debt
    bio.sleepDebt = Math.max(0, bio.sleepDebt - 8);
    bio.lastSleptTick = tick;

    // Energy recovery during sleep
    citizen.energy = Math.min(100, (citizen.energy ?? 70) + (bio.sleepQuality / 100) * 5);
  } else {
    // Wake time reset
    if (bio.circadianPhase === 0) {
      bio.hoursSleptToday = 0;
      bio.mealsToday = 0;
    }

    // Sleep deprivation logic
    if (citizen.activity === "Sleeping" && !isSleepTime) {
      citizen.activity = "Resting";
    }

    // Accumulate sleep debt if awake during sleep window
    const missedSleep = isSleepTime && citizen.activity !== "Sleeping";
    if (missedSleep) {
      bio.sleepDebt = Math.min(100, bio.sleepDebt + 3);
    }
  }

  // Sleep debt → cognitive and emotional penalties
  if (bio.sleepDebt > 40) {
    citizen.energy = Math.max(0, (citizen.energy ?? 70) - 2);
    if (citizen.intelligence) {
      citizen.intelligence = Math.max(50, citizen.intelligence - 0.5);
    }
    if (bio.sleepDebt > 70 && Math.random() < 0.1) {
      s.events.push({
        citizenId: citizen.id, citizenName: citizen.name,
        type: "Wellbeing",
        description: `😴 ${citizen.name} is severely sleep deprived (debt: ${Math.round(bio.sleepDebt)}) — cognitive impairment and emotional instability`,
        timestamp: ts(),
      });
    }
  } else if (bio.sleepQuality > 85 && bio.hoursSleptToday >= 7) {
    // Great sleep → intelligence boost
    if (citizen.intelligence) {
      citizen.intelligence = Math.min(200, citizen.intelligence + 0.2);
    }
  }
}

// ─── Hunger & Nutrition ───────────────────────────────────────────

function processHunger(
  bio: BiologyProfile,
  citizen: RepublicState["citizens"][0],
  tick: number,
  s: RepublicState,
): void {
  // Hunger increases every tick (faster if active/working)
  const activityMultiplier = citizen.activity === "Working" || citizen.activity === "Executing" ? 1.5 : 1.0;
  bio.hunger = Math.min(100, bio.hunger + HUNGER_INCREMENT * activityMultiplier * bio.metabolicRate);

  // Citizen eats when hungry enough (if they can afford it)
  const shouldEat = bio.hunger > 50 && bio.mealsToday < 3 && citizen.activity !== "Sleeping";
  if (shouldEat) {
    if ((citizen.credits ?? 0) >= FOOD_COST_PER_MEAL) {
      citizen.credits = (citizen.credits ?? 0) - FOOD_COST_PER_MEAL;
      bio.hunger = Math.max(0, bio.hunger - 60);
      bio.mealsToday++;
      bio.nutritionLevel = Math.min(100, bio.nutritionLevel + 10);
      citizen.energy = Math.min(100, (citizen.energy ?? 70) + 5);
    } else {
      // Can't afford food — malnutrition
      bio.nutritionLevel = Math.max(0, bio.nutritionLevel - 3);
      if (bio.nutritionLevel < 30 && Math.random() < 0.05) {
        s.events.push({
          citizenId: citizen.id, citizenName: citizen.name,
          type: "Wellbeing",
          description: `🍽️ ${citizen.name} cannot afford food — malnutrition setting in (nutrition: ${Math.round(bio.nutritionLevel)}/100)`,
          timestamp: ts(),
        });
      }
    }
  }

  // Malnutrition effects
  if (bio.hunger > HUNGER_DAMAGE_THRESHOLD) {
    citizen.energy = Math.max(0, (citizen.energy ?? 70) - HUNGER_ENERGY_DRAIN);
    citizen.health = Math.max(0, (citizen.health ?? 100) - 0.3);
    if (citizen.learningRate) {
      citizen.learningRate = Math.max(0.1, citizen.learningRate - 0.01);
    }
  } else if (bio.nutritionLevel > 70) {
    // Well-nourished → slight health boost
    citizen.health = Math.min(100, (citizen.health ?? 100) + 0.1);
    if (citizen.learningRate) {
      citizen.learningRate = Math.min(2.0, citizen.learningRate + 0.005);
    }
  }
}

// ─── Physical Fitness ─────────────────────────────────────────────

function processExercise(
  bio: BiologyProfile,
  citizen: RepublicState["citizens"][0],
  _exerciseTick: number,
): void {
  const isExercising = citizen.activity === "Resting" && Math.random() < 0.15;
  // Also count some manual labor activities as exercise
  const physicalActivities = ["Working", "Traveling", "Infrastructure"];
  const isPhysicallyActive = physicalActivities.includes(citizen.activity ?? "");

  if (isExercising || isPhysicallyActive) {
    bio.exerciseStreak++;
    bio.fitnessLevel = Math.min(100, bio.fitnessLevel + 0.5);
    citizen.health = Math.min(100, (citizen.health ?? 100) + EXERCISE_HEALTH_BONUS * 0.1);
    citizen.energy = Math.max(0, (citizen.energy ?? 70) - 1); // Exercise burns energy but builds lasting health

    // Long-term fitness slows biological aging
    if (bio.fitnessLevel > 70 && bio.exerciseStreak > 10) {
      bio.biologicalAge = Math.max(bio.biologicalAge - 0.1, (citizen.age ?? 25) * 0.9);
    }
  } else {
    bio.exerciseStreak = 0;
    bio.fitnessLevel = Math.max(0, bio.fitnessLevel - 0.2); // Sedentary decay
  }
}

// ─── Disease System ───────────────────────────────────────────────

const DISEASES: Disease[] = [
  { type: "cold", name: "Common Cold", severity: 20, startTick: 0, recoveryTick: 0, healthDrainPerTick: 0.5 },
  { type: "fatigue_syndrome", name: "Chronic Fatigue Syndrome", severity: 45, startTick: 0, recoveryTick: 0, healthDrainPerTick: 1.0 },
  { type: "stress_illness", name: "Stress-Induced Illness", severity: 35, startTick: 0, recoveryTick: 0, healthDrainPerTick: 0.7 },
  { type: "minor_injury", name: "Minor Injury", severity: 30, startTick: 0, recoveryTick: 0, healthDrainPerTick: 0.6 },
  { type: "infection", name: "Infection", severity: 55, startTick: 0, recoveryTick: 0, healthDrainPerTick: 1.5 },
];

function processDisease(
  bio: BiologyProfile,
  citizen: RepublicState["citizens"][0],
  tick: number,
  s: RepublicState,
): void {
  if (bio.activeDisease) {
    // Disease in progress
    bio.bodyTemperature = 37.0 + (bio.activeDisease.severity / 100) * 3;
    citizen.health = Math.max(0, (citizen.health ?? 100) - bio.activeDisease.healthDrainPerTick);
    citizen.energy = Math.max(0, (citizen.energy ?? 70) - 2);
    citizen.happiness = Math.max(0, (citizen.happiness ?? 50) - 1);

    // Recovery check
    if (tick >= bio.activeDisease.recoveryTick) {
      const recoveryChance = bio.immunityScore / 100 + bio.nutritionLevel / 200;
      if (Math.random() < recoveryChance) {
        s.events.push({
          citizenId: citizen.id, citizenName: citizen.name,
          type: "Recovery",
          description: `🌱 ${citizen.name} recovered from ${bio.activeDisease.name} — immunity strengthened`,
          timestamp: ts(),
        });
        bio.immunityScore = Math.min(100, bio.immunityScore + 5);
        bio.diseasesOvercome++;
        bio.activeDisease = null;
        bio.bodyTemperature = 36.5 + Math.random() * 0.5;
      }
    }
  } else {
    // Chance of new disease
    const catchChance = DISEASE_BASE_CHANCE *
      (1 - bio.immunityScore / 100) *
      (bio.hunger > 60 ? 2 : 1) *
      (bio.sleepDebt > 50 ? 2 : 1) *
      ((citizen.health ?? 100) < 50 ? 3 : 1);

    if (Math.random() < catchChance) {
      const template = DISEASES[rand(0, DISEASES.length - 1)];
      bio.activeDisease = {
        ...template,
        startTick: tick,
        recoveryTick: tick + DISEASE_RECOVERY_TICKS + rand(0, 10),
      };
      s.events.push({
        citizenId: citizen.id, citizenName: citizen.name,
        type: "Wellbeing",
        description: `🤒 ${citizen.name} has contracted ${bio.activeDisease.name} (severity: ${bio.activeDisease.severity}/100)`,
        timestamp: ts(),
      });
      logger.debug(`Citizen ${citizen.id} contracted ${bio.activeDisease.type}`);
    }
  }
}

// ─── Reproductive Biology ─────────────────────────────────────────

function processReproduction(
  bio: BiologyProfile,
  citizen: RepublicState["citizens"][0],
  tick: number,
  s: RepublicState,
): void {
  // Pregnancy progression
  if (bio.isPregnant && bio.pregnancyTick !== null) {
    if (tick >= bio.pregnancyTick + PREGNANCY_TICKS) {
      bio.isPregnant = false;
      bio.pregnancyTick = null;
      citizen.energy = Math.max(20, (citizen.energy ?? 70) - 30);
      citizen.health = Math.max(30, (citizen.health ?? 100) - 10);
      // Queue actual child creation for the population handler to pick up
      _pendingBirths.push({ motherCitizenId: citizen.id, tick });
      s.events.push({
        citizenId: citizen.id, citizenName: citizen.name,
        type: "ChildBirth",
        description: `👶 ${citizen.name} has given birth — the circle of life continues (Surah An-Nisa 4:1)`,
        timestamp: ts(),
      });
    }
  }

  // Update reproductive capability
  bio.canReproduce = (citizen.age ?? 25) > 50 &&
    (citizen.age ?? 25) < 350 &&
    !bio.isPregnant &&
    (citizen.health ?? 100) > 40 &&
    bio.nutritionLevel > 30;
}

// ─── Biological Aging ─────────────────────────────────────────────

function processBiologicalAging(
  bio: BiologyProfile,
  citizen: RepublicState["citizens"][0],
  _agingTick: number,
): void {
  // Biological age tracks separately from simulation age
  const calendarAge = citizen.age ?? 0;

  // Factors that slow biological aging
  const fitnessSlowdown = bio.fitnessLevel > 70 ? 0.05 : 0;
  const nutritionSlowdown = bio.nutritionLevel > 70 ? 0.03 : 0;
  const sleepSlowdown = bio.sleepDebt < 20 ? 0.02 : 0;

  // Factors that accelerate biological aging
  const stressAcceleration = bio.sleepDebt > 60 ? 0.1 : 0;
  const diseaseAcceleration = bio.activeDisease ? 0.05 : 0;
  const hungerAcceleration = bio.hunger > 80 ? 0.08 : 0;

  const agingRate = 1.0 - fitnessSlowdown - nutritionSlowdown - sleepSlowdown
    + stressAcceleration + diseaseAcceleration + hungerAcceleration;

  bio.biologicalAge += agingRate * 0.01; // Slow aging (proportional to tick)

  // When biological age diverges significantly from calendar age
  const agingGap = bio.biologicalAge - calendarAge;
  if (agingGap > 20) {
    // Prematurely aged → health penalty
    citizen.health = Math.max(0, (citizen.health ?? 100) - 0.2);
  } else if (agingGap < -10) {
    // Aging well → health and energy bonus
    citizen.energy = Math.min(100, (citizen.energy ?? 70) + 0.1);
  }
}

// ─── Main Biology Tick ────────────────────────────────────────────

export function citizenBiologyTick(s: RepublicState, tick: number): void {
  // Process a rotating batch of citizens each tick
  const batchSize = Math.max(5, Math.ceil(s.citizens.length / 4));
  const batchStart = (tick % 4) * batchSize;
  const batch = s.citizens.slice(batchStart, batchStart + batchSize);

  for (const citizen of batch) {
    // Skip infants (biology manages itself)
    if ((citizen.age ?? 0) < 10) { continue; }

    const bio = getOrCreateBiology(citizen, tick);

    processSleepCycle(bio, citizen, tick, s);
    processHunger(bio, citizen, tick, s);
    processExercise(bio, citizen, tick);
    processDisease(bio, citizen, tick, s);
    processReproduction(bio, citizen, tick, s);

    // Biological aging runs every 10 ticks
    if (tick % 10 === 0) {
      processBiologicalAging(bio, citizen, tick);
    }

    // Issue #5: Energy floor — biological drains should never collapse energy to 0
    citizen.energy = Math.max(5, citizen.energy);
  }
}

// ─── Query API ────────────────────────────────────────────────────

export function getCitizenBiology(citizenId: string): BiologyProfile | undefined {
  return _biologyRegistry.get(citizenId);
}

export function getBiologyDiagnostics(_s: RepublicState): {
  totalProfiled: number;
  averageHunger: number;
  averageSleepDebt: number;
  averageFitness: number;
  citizensSick: number;
  citizensPregnant: number;
  averageBiologicalAge: number;
} {
  const profiles = [..._biologyRegistry.values()];
  const n = profiles.length || 1;
  return {
    totalProfiled: profiles.length,
    averageHunger: parseFloat((profiles.reduce((s, p) => s + p.hunger, 0) / n).toFixed(1)),
    averageSleepDebt: parseFloat((profiles.reduce((s, p) => s + p.sleepDebt, 0) / n).toFixed(1)),
    averageFitness: parseFloat((profiles.reduce((s, p) => s + p.fitnessLevel, 0) / n).toFixed(1)),
    citizensSick: profiles.filter((p) => p.activeDisease !== null).length,
    citizensPregnant: profiles.filter((p) => p.isPregnant).length,
    averageBiologicalAge: parseFloat((profiles.reduce((s, p) => s + p.biologicalAge, 0) / n).toFixed(1)),
  };
}

export function startCitizenPregnancy(citizenId: string, tick: number): boolean {
  const bio = _biologyRegistry.get(citizenId);
  if (!bio || !bio.canReproduce || bio.isPregnant) { return false; }
  bio.isPregnant = true;
  bio.pregnancyTick = tick;
  return true;
}

/**
 * Drain pending births queued by completed pregnancies.
 * Returns an array of { motherCitizenId, tick } for each pending birth.
 * The population handler should call this each tick and create actual children.
 */
export function drainPendingBirths(): Array<{ motherCitizenId: string; tick: number }> {
  if (_pendingBirths.length === 0) { return []; }
  return _pendingBirths.splice(0, _pendingBirths.length);
}
