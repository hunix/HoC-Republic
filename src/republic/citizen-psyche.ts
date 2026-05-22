/**
 * Republic Platform — Citizen Deep Psychology Engine
 *
 * Implements true psychological depth for citizens based on:
 *  - ACT-R cognitive architecture (declarative + procedural memory)
 *  - Plutchik's Wheel of Emotions (8 primary emotions + blends)
 *  - Jungian archetypes (shadow, persona, anima/animus)
 *  - Attachment theory (Bowlby/Ainsworth)
 *  - Aaron Beck's cognitive distortions (CBT model)
 *  - Terror Management Theory (death awareness shapes behavior)
 *  - Kohlberg moral development
 *
 * "Indeed, Allah knows what is within the breasts." — Al-Mulk 67:13
 */

import type { RepublicState } from "./types.js";
import { rand, ts } from "./utils.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:citizen-psyche");

// ─── Emotion System (Plutchik Wheel) ──────────────────────────────

export type PrimaryEmotion =
  | "joy" | "trust" | "fear" | "surprise"
  | "sadness" | "disgust" | "anger" | "anticipation";

export interface EmotionState {
  [key: string]: number | undefined;
  joy: number;           // 0-100
  trust: number;
  fear: number;
  surprise: number;
  sadness: number;
  disgust: number;
  anger: number;
  anticipation: number;
  // Derived complex emotions (blends)
  anxiety?: number;      // fear + anticipation
  jealousy?: number;     // anger + fear + sadness
  guilt?: number;        // disgust + sadness (self-directed)
  awe?: number;          // fear + surprise
  love?: number;         // joy + trust
  optimism?: number;     // joy + anticipation
  contempt?: number;     // anger + disgust
  remorse?: number;      // sadness + disgust
}

// ─── Cognitive Architecture ────────────────────────────────────────

export type AttachmentStyle = "secure" | "anxious" | "avoidant" | "disorganized";

export type DefenseMechanism =
  | "denial"           // refuse to accept reality
  | "projection"       // attribute own feelings to others
  | "rationalization"  // justify irrational behavior with logic
  | "repression"       // push painful memories to unconscious
  | "displacement"     // redirect emotion to safer target
  | "sublimation"      // channel unacceptable impulse into creative/productive outlet
  | "regression"       // revert to earlier developmental behavior under stress
  | "intellectualization"; // detach emotionally, analyze coldly

export type CognitiveDistortion =
  | "all_or_nothing"        // black and white thinking
  | "catastrophizing"       // imagining worst outcomes
  | "mind_reading"          // assuming others' thoughts
  | "fortune_telling"       // predicting negative futures
  | "emotional_reasoning"   // feeling = fact
  | "filtering"             // focus only on negatives
  | "disqualifying_positive"// dismissing achievements
  | "should_statements"     // rigid rules for self and others
  | "labeling"              // global negative self-labels
  | "personalization";      // blame self for external events

export type JungianArchetype =
  | "Hero" | "Sage" | "Ruler" | "Creator"
  | "Lover" | "Caregiver" | "Jester" | "Explorer"
  | "Rebel" | "Magician" | "Innocent" | "Everyman";

export interface Subconscious {
  // Core beliefs (formed in early life, rarely questioned)
  coreBeliefs: string[];
  // Unconscious fears
  unconsciousFears: string[];
  // Active defense mechanisms (top 2 the citizen uses most)
  defenseMechanisms: DefenseMechanism[];
  // Jungian shadow: what the citizen refuses to acknowledge in themselves
  shadowArchetype: JungianArchetype;
  // Dominant life archetype (conscious self-image)
  dominantArchetype: JungianArchetype;
  // Attachment style (shapes ALL relationships)
  attachmentStyle: AttachmentStyle;
  // Cognitive distortions the citizen tends toward
  cognitiveDistortions: CognitiveDistortion[];
  // Suppressed traumas (events stored in unconscious)
  suppressedTraumas: string[];
  // Shadow integration progress (0=fully in shadow, 100=fully integrated)
  shadowIntegration: number;
}

export interface PsycheProfile {
  id: string; // citizen ID
  emotions: EmotionState;
  subconscious: Subconscious;
  // Baseline emotional set-point (where emotions return to)
  emotionalBaseline: Partial<EmotionState>;
  // Current stress level (0-100)
  stressLevel: number;
  // Resilience score (how quickly citizen bounces back)
  resilience: number; // 0-100
  // Self-esteem (0-100, affected by achievements and relationships)
  selfEsteem: number;
  // Ego strength (0-100, ability to act despite anxiety)
  egoStrength: number;
  // Intrinsic motivation wells (curiosity per domain)
  curiosityMap: Record<string, number>; // domain → 0-100
  // Trigger events that have caused strong emotional responses
  emotionalHistory: Array<{
    event: string;
    emotion: PrimaryEmotion;
    intensity: number;
    tick: number;
    timestamp: string;
  }>;
  // When the profile was last updated
  lastUpdatedTick: number;
}

// ─── In-Memory Registry ────────────────────────────────────────────

const _psycheRegistry = new Map<string, PsycheProfile>();

// ─── Archetype Definitions ─────────────────────────────────────────

const ARCHETYPES: JungianArchetype[] = [
  "Hero", "Sage", "Ruler", "Creator", "Lover", "Caregiver",
  "Jester", "Explorer", "Rebel", "Magician", "Innocent", "Everyman",
];

const CORE_BELIEF_TEMPLATES = {
  hero: ["I can overcome any obstacle", "I exist to protect others", "Strength is earned through struggle"],
  sage: ["Knowledge is the highest good", "Truth must be sought relentlessly", "Wisdom comes through reflection"],
  ruler: ["Order brings security", "I must take responsibility", "Leadership is a duty, not a privilege"],
  creator: ["I must express what's within me", "Beauty matters as much as truth", "Making things is how I leave my mark"],
  lover: ["Deep connection is the meaning of life", "Intimacy requires vulnerability", "Love transforms everything"],
  caregiver: ["Others' needs matter more than my own", "Nurturing is my purpose", "I am responsible for those around me"],
  jester: ["Life is too serious to be taken seriously", "Joy is a form of wisdom", "Laughter is the best medicine"],
  explorer: ["I must experience everything", "Comfort zones are traps", "Life is an adventure to be seized"],
  rebel: ["Rules are made to be questioned", "Authority must earn respect", "The status quo is never good enough"],
  magician: ["Reality is more fluid than it appears", "Transformation is always possible", "Hidden truths shape visible ones"],
  innocent: ["People are fundamentally good", "There is always hope", "Simplicity is a form of wisdom"],
  everyman: ["I am one of many, and that is enough", "Belonging matters above all", "Ordinary life has extraordinary depth"],
};

const UNCONSCIOUS_FEARS = [
  "being abandoned by those I love",
  "being powerless and controlled",
  "being ordinary and forgotten",
  "losing my mind or health",
  "being unloved for who I truly am",
  "losing everything I've built",
  "being seen as stupid or incompetent",
  "being fundamentally corrupt or evil",
  "being isolated from humanity",
  "failing those who depend on me",
  "witnessing the suffering of innocents",
  "losing my faith or sense of meaning",
];

// ─── Profile Generator ─────────────────────────────────────────────

export function generatePsycheProfile(
  citizenId: string,
  personalityVector?: { conscientiousness?: number; agreeableness?: number; openness?: number; stability?: number; drive?: number },
): PsycheProfile {
  const pv = personalityVector ?? {};
  const openness = pv.openness ?? 0.5;
  const stability = pv.stability ?? 0.5;
  const agreeableness = pv.agreeableness ?? 0.5;

  // Attachment style derived from personality
  let attachmentStyle: AttachmentStyle;
  if (stability > 0.7 && agreeableness > 0.6) {
    attachmentStyle = "secure";
  } else if (stability < 0.4 && agreeableness > 0.5) {
    attachmentStyle = "anxious";
  } else if (stability > 0.5 && agreeableness < 0.4) {
    attachmentStyle = "avoidant";
  } else {
    attachmentStyle = rand(0, 1) ? "anxious" : "avoidant";
  }

  // Dominant archetype from personality
  const archetypeIndex = Math.floor(
    ((pv.drive ?? 0.5) * 0.4 + openness * 0.3 + (pv.conscientiousness ?? 0.5) * 0.3) * ARCHETYPES.length,
  );
  const dominantArchetype = ARCHETYPES[Math.min(archetypeIndex, ARCHETYPES.length - 1)];

  // Shadow is the opposite tendencies
  const shadowIndex = (archetypeIndex + Math.floor(ARCHETYPES.length / 2)) % ARCHETYPES.length;
  const shadowArchetype = ARCHETYPES[shadowIndex];

  // Core beliefs from archetype
  const archetypeKey = dominantArchetype.toLowerCase() as keyof typeof CORE_BELIEF_TEMPLATES;
  const beliefTemplates = CORE_BELIEF_TEMPLATES[archetypeKey] ?? CORE_BELIEF_TEMPLATES.everyman;
  const coreBeliefs = beliefTemplates.slice(0, 2 + rand(0, 1));

  // Random fears (1-2)
  const fearCount = 1 + rand(0, 1);
  const shuffledFears = UNCONSCIOUS_FEARS.toSorted(() => Math.random() - 0.5);
  const unconsciousFears = shuffledFears.slice(0, fearCount);

  // Defense mechanisms
  const allDefenses: DefenseMechanism[] = [
    "denial", "projection", "rationalization", "repression",
    "displacement", "sublimation", "regression", "intellectualization",
  ];
  const primaryDefense = allDefenses[rand(0, allDefenses.length - 1)];
  const secondaryDefense = allDefenses.filter((d) => d !== primaryDefense)[rand(0, allDefenses.length - 2)];

  // Cognitive distortions (low stability → more distortions)
  const allDistortions: CognitiveDistortion[] = [
    "all_or_nothing", "catastrophizing", "mind_reading", "fortune_telling",
    "emotional_reasoning", "filtering", "disqualifying_positive",
    "should_statements", "labeling", "personalization",
  ];
  const distortionCount = stability < 0.4 ? 3 : stability < 0.6 ? 2 : 1;
  const distortions = allDistortions
    .toSorted(() => Math.random() - 0.5)
    .slice(0, distortionCount) as CognitiveDistortion[];

  // Initial emotional state
  const baseJoy = 40 + Math.round(stability * 30);
  const baseTrust = 40 + Math.round(agreeableness * 30);

  const emotions: EmotionState = {
    joy: baseJoy + rand(-10, 10),
    trust: baseTrust + rand(-10, 10),
    fear: 20 + Math.round((1 - stability) * 30) + rand(-5, 5),
    surprise: 20 + rand(-5, 5),
    sadness: 15 + Math.round((1 - stability) * 20) + rand(-5, 5),
    disgust: 10 + rand(-5, 5),
    anger: 10 + Math.round((1 - stability) * 20) + rand(-5, 5),
    anticipation: 30 + Math.round(openness * 20) + rand(-5, 5),
  };
  // Clamp all emotions 0-100
  for (const k of Object.keys(emotions)) {
    const v = emotions[k];
    if (typeof v === "number") {
      emotions[k] = Math.max(0, Math.min(100, v));
    }
  }

  // Curiosity map (what topics the citizen is naturally drawn to)
  const domains = ["science", "arts", "engineering", "philosophy", "social", "economics", "nature", "technology", "history", "spirituality"];
  const curiosityMap: Record<string, number> = {};
  for (const domain of domains) {
    curiosityMap[domain] = 20 + Math.round(openness * 50) + rand(-20, 20);
    curiosityMap[domain] = Math.max(0, Math.min(100, curiosityMap[domain]));
  }

  return {
    id: citizenId,
    emotions,
    subconscious: {
      coreBeliefs,
      unconsciousFears,
      defenseMechanisms: [primaryDefense, secondaryDefense],
      shadowArchetype,
      dominantArchetype,
      attachmentStyle,
      cognitiveDistortions: distortions,
      suppressedTraumas: [],
      shadowIntegration: 20 + rand(0, 20), // everyone starts partially unintegrated
    },
    emotionalBaseline: {
      joy: baseJoy,
      trust: baseTrust,
      fear: 20 + Math.round((1 - stability) * 30),
      sadness: 15 + Math.round((1 - stability) * 20),
    },
    stressLevel: rand(10, 40),
    resilience: 40 + Math.round(stability * 40),
    selfEsteem: 40 + Math.round((pv.drive ?? 0.5) * 30) + rand(-10, 10),
    egoStrength: 40 + Math.round(stability * 30),
    curiosityMap,
    emotionalHistory: [],
    lastUpdatedTick: 0,
  };
}

// ─── Emotion Triggers (event → emotional response) ────────────────

const EMOTION_TRIGGERS: Record<string, Partial<EmotionState>> = {
  // Positive triggers
  achievement:   { joy: 20, trust: 5, anticipation: 10 },
  marriage:      { joy: 30, trust: 25, anticipation: 15, fear: 5 },
  childbirth:    { joy: 25, trust: 15, anticipation: 10, fear: 8 },
  promotion:     { joy: 15, trust: 5, anticipation: 20 },
  friendship:    { joy: 10, trust: 20 },
  sadaqah_given: { joy: 15, trust: 10 },
  sadaqah_received: { joy: 12, trust: 15 },
  learning:      { joy: 8, anticipation: 12 },
  discovery:     { joy: 20, surprise: 25, anticipation: 15 },
  // Negative triggers
  betrayal:      { fear: 15, sadness: 20, anger: 25, trust: -30 },
  death_nearby:  { fear: 20, sadness: 30, surprise: 15 },
  grief:         { sadness: 35, fear: 10, anger: 8 },
  failure:       { sadness: 20, anger: 10, anticipation: -15 },
  conflict:      { anger: 20, fear: 10, disgust: 8 },
  injustice:     { anger: 25, disgust: 20, sadness: 10 },
  rejection:     { sadness: 25, anger: 10, fear: 15 },
  poverty:       { fear: 20, sadness: 20, anger: 15 },
};

function triggerEmotion(
  profile: PsycheProfile,
  triggerName: string,
  tick: number,
): void {
  const trigger = EMOTION_TRIGGERS[triggerName];
  if (!trigger) { return; }

  for (const [emotion, delta] of Object.entries(trigger)) {
    const current = (profile.emotions as Record<string, number>)[emotion] ?? 50;
    (profile.emotions as Record<string, number>)[emotion] = Math.max(0, Math.min(100, current + (delta as number)));
  }

  // Record in emotional history (keep last 20)
  const dominantEmotion = Object.entries(trigger)
    .toSorted(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))[0];
  if (dominantEmotion && (dominantEmotion[1] as number) > 0) {
    profile.emotionalHistory.push({
      event: triggerName,
      emotion: dominantEmotion[0] as PrimaryEmotion,
      intensity: Math.abs(dominantEmotion[1] as number),
      tick,
      timestamp: ts(),
    });
    if (profile.emotionalHistory.length > 20) {
      profile.emotionalHistory = profile.emotionalHistory.slice(-20);
    }
  }
}

// ─── Emotional Decay (emotions return to baseline over time) ──────

function decayEmotions(profile: PsycheProfile): void {  // eslint-disable-line
  const { emotions, emotionalBaseline, resilience } = profile;
  const decayRate = 0.05 + (resilience / 100) * 0.10; // Resilient citizens recover faster

  for (const key of Object.keys(emotions)) {
    const baseline = (emotionalBaseline as Record<string, number | undefined>)[key] ?? 30;
    const current = emotions[key] ?? 30;
    if (typeof current !== "number") { continue; }
    const diff = baseline - current;
    emotions[key] = current + diff * decayRate;
  }

  // Recompute complex emotions
  emotions["anxiety"] = ((emotions.fear + emotions.anticipation) / 2) * 0.8;
  emotions["jealousy"] = emotions.anger * 0.4 + emotions.fear * 0.3 + emotions.sadness * 0.3;
  emotions["love"] = ((emotions.joy + emotions.trust) / 2) * 0.9;
  emotions["optimism"] = ((emotions.joy + emotions.anticipation) / 2) * 0.85;
  emotions["contempt"] = ((emotions.anger + emotions.disgust) / 2) * 0.8;
  emotions["awe"] = ((emotions.fear + emotions.surprise) / 2) * 0.7;
  emotions["guilt"] = ((emotions.disgust + emotions.sadness) / 2) * 0.75;
  emotions["remorse"] = ((emotions.sadness + emotions.disgust) / 2) * 0.7;
}

// ─── Stress & Resilience ───────────────────────────────────────────

function updateStress(profile: PsycheProfile, s: RepublicState, citizenId: string): void {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) { return; }

  // Stress increases from: poor health, low happiness, unful goals, high anger/fear
  let stressDelta = 0;
  if ((citizen.health ?? 100) < 50) { stressDelta += 3; }
  if ((citizen.happiness ?? 50) < 30) { stressDelta += 4; }
  if ((citizen.energy ?? 100) < 20) { stressDelta += 3; }
  if (profile.emotions.fear > 60) { stressDelta += 2; }
  if (profile.emotions.anger > 60) { stressDelta += 2; }
  if (citizen.griefState) { stressDelta += 5; }

  // Stress decreases from: high joy, strong trust, community connection
  if (profile.emotions.joy > 70) { stressDelta -= 3; }
  if (profile.emotions.trust > 70) { stressDelta -= 2; }
  if ((citizen.relationships ?? []).length > 3) { stressDelta -= 1; }

  profile.stressLevel = Math.max(0, Math.min(100, profile.stressLevel + stressDelta * 0.1));

  // High stress → self-esteem damage
  if (profile.stressLevel > 70) {
    profile.selfEsteem = Math.max(10, profile.selfEsteem - 0.5);
    profile.egoStrength = Math.max(10, profile.egoStrength - 0.3);
  } else if (profile.stressLevel < 30) {
    profile.selfEsteem = Math.min(100, profile.selfEsteem + 0.2);
    profile.egoStrength = Math.min(100, profile.egoStrength + 0.1);
  }
}

// ─── Defense Mechanism Activation ─────────────────────────────────

function activateDefenses(profile: PsycheProfile, s: RepublicState, citizenId: string, tick: number): void {
  if (profile.stressLevel < 60) { return; } // Only activates under real stress

  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) { return; }

  for (const mechanism of profile.subconscious.defenseMechanisms) {
    switch (mechanism) {
      case "denial":
        // Deny health problems — citizen continues working despite low health
        if ((citizen.health ?? 100) < 30) {
          citizen.activity = "Working"; // Keeps working despite poor health
        }
        break;
      case "sublimation":
        // Channel anxiety into creative work
        if (profile.emotions.anxiety && profile.emotions.anxiety > 60) {
          citizen.activity = "Creating";
          citizen.happiness = Math.min(100, (citizen.happiness ?? 50) + 3);
        }
        break;
      case "projection":
        // Project own fear as anger toward others (damages relationships)
        if (profile.emotions.fear > 70 && Math.random() < 0.1) {
          for (const rel of citizen.relationships ?? []) {
            if (rel.type === "Friend") {
              rel.strength = Math.max(0, rel.strength - 5);
            }
          }
          s.events.push({
            citizenId: citizen.id, citizenName: citizen.name,
            type: "conflict",
            description: `😤 ${citizen.name} projected inner fears outward, creating tension with peers`,
            timestamp: ts(),
          });
        }
        break;
      case "intellectualization":
        // Detach from emotions → higher productivity but poorer relationships
        citizen.credits = (citizen.credits ?? 0) + rand(5, 15);
        profile.emotions.sadness = Math.max(0, (profile.emotions.sadness ?? 30) - 5);
        break;
      case "regression":
        // Childlike behavior under extreme stress
        if (profile.stressLevel > 85) {
          citizen.activity = "Resting";
          s.events.push({
            citizenId: citizen.id, citizenName: citizen.name,
            type: "Psychology",
            description: `🌀 ${citizen.name} is overwhelmed and withdrawn (regression under extreme stress)`,
            timestamp: ts(),
          });
        }
        break;
    }
    logger.debug(`Defense mechanism ${mechanism} activated for citizen ${citizenId} at tick ${tick}`);
  }
}

// ─── Shadow Integration Events ──────────────────────────────────────

function processShadowIntegration(profile: PsycheProfile, s: RepublicState, citizenId: string, _tick: number): void {
  if (Math.random() > 0.02) { return; } // 2% chance per check

  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) { return; }

  // Shadow integration progresses through: confronting fears, deep relationships, age/wisdom
  let integrationDelta = 0;
  if ((citizen.age ?? 0) > 200) { integrationDelta += 2; } // Wisdom of age
  if ((citizen.relationships ?? []).some((r) => r.type === "Spouse" && r.strength > 80)) {
    integrationDelta += 3; // Deep love accelerates integration
  }
  if ((citizen.moralStage ?? 1) >= 5) { integrationDelta += 4; } // High moral stage
  if ((citizen.caveLevel ?? 0) >= 2) { integrationDelta += 5; } // Philosopher awareness

  profile.subconscious.shadowIntegration = Math.min(100, profile.subconscious.shadowIntegration + integrationDelta);

  // Significant shadow integration → wisdom event
  if (profile.subconscious.shadowIntegration > 70 && Math.random() < 0.1) {
    citizen.legacyScore = (citizen.legacyScore ?? 0) + 20;
    citizen.happiness = Math.min(100, (citizen.happiness ?? 50) + 5);
    citizen.moralStage = Math.min(6, (citizen.moralStage ?? 1) + 1);
    s.events.push({
      citizenId: citizen.id, citizenName: citizen.name,
      type: "Psychology",
      description: `✨ ${citizen.name} has achieved profound self-knowledge — shadow integrated at ${Math.round(profile.subconscious.shadowIntegration)}% (Jungian individuation milestone)`,
      timestamp: ts(),
    });
    logger.info(`Shadow integration milestone for ${citizenId}: ${profile.subconscious.shadowIntegration}%`);
  }
}

// ─── Event → Emotional Response Mapping ───────────────────────────

function processRecentEvents(profile: PsycheProfile, s: RepublicState, citizenId: string, tick: number): void {
  // Look for recent events (last 3 ticks) involving this citizen
  const recentEvents = (s.events ?? []).slice(-30).filter(
    (e) => e.citizenId === citizenId,
  );

  for (const event of recentEvents) {
    const desc = event.description?.toLowerCase() ?? "";
    const type = event.type?.toLowerCase() ?? "";

    if (type === "marriage" || desc.includes("married")) { triggerEmotion(profile, "marriage", tick); }
    if (type === "childbirth" || desc.includes("baby") || desc.includes("born")) { triggerEmotion(profile, "childbirth", tick); }
    if (type === "promotion" || desc.includes("promoted")) { triggerEmotion(profile, "promotion", tick); }
    if (type === "discovery" || desc.includes("discovered")) { triggerEmotion(profile, "discovery", tick); }
    if (desc.includes("grief") || desc.includes("death") || desc.includes("died")) { triggerEmotion(profile, "grief", tick); }
    if (desc.includes("sadaqah") && desc.includes("gave")) { triggerEmotion(profile, "sadaqah_given", tick); }
    if (desc.includes("sadaqah") && citizenId !== event.citizenId) { triggerEmotion(profile, "sadaqah_received", tick); }
    if (type === "conflict" || desc.includes("disagreement") || desc.includes("conflict")) { triggerEmotion(profile, "conflict", tick); }
    if (desc.includes("betrayal") || desc.includes("rival")) { triggerEmotion(profile, "betrayal", tick); }
    if (type === "achievement" || desc.includes("achievement")) { triggerEmotion(profile, "achievement", tick); }
    if (type === "failure" || desc.includes("failed")) { triggerEmotion(profile, "failure", tick); }
  }
}

// ─── Main Psyche Tick ──────────────────────────────────────────────

export function citizenPsycheTick(s: RepublicState, tick: number): void {
  const MAX_PER_TICK = 8; // Process at most 8 citizens per tick to limit CPU
  const citizens = s.citizens.slice(0, MAX_PER_TICK);

  for (const citizen of citizens) {
    // Generate profile if doesn't exist yet
    if (!_psycheRegistry.has(citizen.id)) {
      _psycheRegistry.set(citizen.id, generatePsycheProfile(citizen.id, citizen.personality));
    }

    const profile = _psycheRegistry.get(citizen.id)!;

    // Process recent events and trigger emotional responses
    processRecentEvents(profile, s, citizen.id, tick);

    // Decay emotions toward baseline
    decayEmotions(profile);

    // Update stress level
    updateStress(profile, s, citizen.id);

    // Activate defenses if needed
    if (tick % 5 === 0) {
      activateDefenses(profile, s, citizen.id, tick);
    }

    // Shadow integration (rare, profound)
    if (tick % 20 === 0) {
      processShadowIntegration(profile, s, citizen.id, tick);
    }

    // Sync emotions back to citizen's happiness/mood
    const e = profile.emotions;
    const positiveEmotions = e.joy + e.trust + e.anticipation + (e.love ?? 0) + (e.optimism ?? 0);
    const negativeEmotions = e.fear + e.sadness + e.anger + e.disgust + (e.anxiety ?? 0) + (e.guilt ?? 0);
    const emotionalBalance = (positiveEmotions / 5 - negativeEmotions / 5);

    // Blend with existing happiness (psyche has 30% influence on happiness)
    citizen.happiness = Math.max(0, Math.min(100,
      (citizen.happiness ?? 50) * 0.7 + (50 + emotionalBalance * 0.3) * 0.3,
    ));

    // Update mood from dominant emotion
    const dominantEmotionEntry = Object.entries(e)
      .filter(([, v]) => typeof v === "number")
      .toSorted(([, a], [, b]) => (b as number) - (a as number))[0];
    if (dominantEmotionEntry) {
      citizen.mood = dominantEmotionEntry[0];
    }

    profile.lastUpdatedTick = tick;
  }

  // Rotate through citizens on subsequent ticks
  if (s.citizens.length > MAX_PER_TICK && tick % 2 === 0) {
    const secondBatch = s.citizens.slice(MAX_PER_TICK, MAX_PER_TICK * 2);
    for (const citizen of secondBatch) {
      if (!_psycheRegistry.has(citizen.id)) {
        _psycheRegistry.set(citizen.id, generatePsycheProfile(citizen.id, citizen.personality));
      }
      const profile = _psycheRegistry.get(citizen.id)!;
      decayEmotions(profile);
      updateStress(profile, s, citizen.id);
      profile.lastUpdatedTick = tick;
    }
  }
}

// ─── Query API ─────────────────────────────────────────────────────

export function getCitizenPsyche(citizenId: string): PsycheProfile | undefined {
  return _psycheRegistry.get(citizenId);
}

export function getAllPsycheProfiles(): PsycheProfile[] {
  return [..._psycheRegistry.values()];
}

export function getPsycheDiagnostics(_s: RepublicState): {
  totalProfiled: number;
  averageStress: number;
  averageSelfEsteem: number;
  attachmentBreakdown: Record<string, number>;
  dominantArchetypes: Record<string, number>;
  topCognitiveDistortions: Record<string, number>;
  averageShadowIntegration: number;
} {
  const profiles = [..._psycheRegistry.values()];
  if (profiles.length === 0) {
    return {
      totalProfiled: 0, averageStress: 0, averageSelfEsteem: 0,
      attachmentBreakdown: {}, dominantArchetypes: {},
      topCognitiveDistortions: {}, averageShadowIntegration: 0,
    };
  }

  const attachmentBreakdown: Record<string, number> = {};
  const dominantArchetypes: Record<string, number> = {};
  const distortionCount: Record<string, number> = {};

  for (const p of profiles) {
    const style = p.subconscious.attachmentStyle;
    attachmentBreakdown[style] = (attachmentBreakdown[style] ?? 0) + 1;

    const archetype = p.subconscious.dominantArchetype;
    dominantArchetypes[archetype] = (dominantArchetypes[archetype] ?? 0) + 1;

    for (const dist of p.subconscious.cognitiveDistortions) {
      distortionCount[dist] = (distortionCount[dist] ?? 0) + 1;
    }
  }

  const n = profiles.length;
  return {
    totalProfiled: n,
    averageStress: parseFloat((profiles.reduce((sum, p) => sum + p.stressLevel, 0) / n).toFixed(1)),
    averageSelfEsteem: parseFloat((profiles.reduce((sum, p) => sum + p.selfEsteem, 0) / n).toFixed(1)),
    attachmentBreakdown,
    dominantArchetypes,
    topCognitiveDistortions: distortionCount,
    averageShadowIntegration: parseFloat((
      profiles.reduce((sum, p) => sum + p.subconscious.shadowIntegration, 0) / n
    ).toFixed(1)),
  };
}

export function initializePsycheForCitizen(citizenId: string, personality?: { conscientiousness?: number; agreeableness?: number; openness?: number; stability?: number; drive?: number }): PsycheProfile {
  const profile = generatePsycheProfile(citizenId, personality);
  _psycheRegistry.set(citizenId, profile);
  return profile;
}
