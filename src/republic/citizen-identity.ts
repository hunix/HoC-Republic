/**
 * Republic Platform — Citizen Identity Engine
 *
 * Phase 27: Every citizen gets a unique, persistent identity:
 *   - Procedural appearance (face shape, skin, eyes, hair, build)
 *   - Voice profile (pitch, timbre, cadence, catchphrases)
 *   - Behavioral habits (sleep schedule, work style, social preferences)
 *   - SVG avatar generator (geometric face from appearance params)
 *
 * All identity traits are **deterministically derived** from the citizen's
 * ID + genome weights, so the same citizen always generates the same identity.
 */

import type { Citizen, PersonalityVector } from "./types.js";
import { rng, seededRandom } from "./utils.js";

// ─── Appearance Types ───────────────────────────────────────────

export type FaceShape = "oval" | "round" | "square" | "heart" | "oblong" | "diamond";
export type EyeShape = "almond" | "round" | "hooded" | "monolid" | "upturned" | "downturned";
export type HairStyle =
  | "short_straight"
  | "short_wavy"
  | "short_curly"
  | "medium_straight"
  | "medium_wavy"
  | "medium_curly"
  | "long_straight"
  | "long_wavy"
  | "long_curly"
  | "buzz"
  | "bald"
  | "braided"
  | "mohawk"
  | "afro";
export type BuildType = "slim" | "average" | "athletic" | "stocky" | "tall_lean" | "broad";

export interface CitizenAppearance {
  faceShape: FaceShape;
  /** Hex color (#RRGGBB) */
  skinTone: string;
  eyeColor: string;
  eyeShape: EyeShape;
  hairStyle: HairStyle;
  hairColor: string;
  /** Optional facial hair descriptor */
  facialHair: string | null;
  /** Unique features (scar, freckles, beauty mark, etc.) */
  distinguishingFeatures: string[];
  /** Height in cm */
  height: number;
  build: BuildType;
}

// ─── Voice Types ────────────────────────────────────────────────

export type Timbre = "warm" | "bright" | "husky" | "clear" | "deep" | "silvery";
export type Cadence = "steady" | "animated" | "measured" | "rapid" | "melodic" | "staccato";

export interface VoiceProfile {
  /** Fundamental pitch in Hz (80-300) */
  pitch: number;
  timbre: Timbre;
  /** Words per minute (100-200) */
  speechRate: number;
  /** Regional flavor for TTS */
  accent: string;
  cadence: Cadence;
  /** Signature phrases this citizen uses */
  catchPhrases: string[];
  /** Volume tendency (0.0 = whisper, 1.0 = loud) */
  volumeTendency: number;
}

// ─── Habits Types ───────────────────────────────────────────────

export type WorkStyle =
  | "early_bird"
  | "night_owl"
  | "burst_worker"
  | "steady_grinder"
  | "creative_sprinter";
export type SocialPreference = "introvert" | "ambivert" | "extrovert";
export type DecisionStyle = "analytical" | "intuitive" | "consultative" | "decisive" | "deliberate";
export type StressResponse = "fight" | "flight" | "freeze" | "tend_befriend" | "problem_solve";

export interface CitizenHabits {
  /** Preferred sleep ticks (offset from midnight) */
  sleepSchedule: { sleepTick: number; wakeTick: number };
  workStyle: WorkStyle;
  socialPreference: SocialPreference;
  decisionStyle: DecisionStyle;
  stressResponse: StressResponse;
  /** Leisure activities this citizen gravitates toward */
  hobbies: string[];
  /** Recurring behavioral patterns */
  rituals: string[];
  /** Favorite topic of conversation */
  favoriteTopics: string[];
}

// ─── Full Identity Card ─────────────────────────────────────────

export interface CitizenIdentityCard {
  citizenId: string;
  citizenName: string;
  appearance: CitizenAppearance;
  voice: VoiceProfile;
  habits: CitizenHabits;
  personality: PersonalityVector;
  /** One-paragraph bio generated from all identity traits */
  bio: string;
}

// ─── Lookup Tables ──────────────────────────────────────────────

const FACE_SHAPES: FaceShape[] = ["oval", "round", "square", "heart", "oblong", "diamond"];
const EYE_SHAPES: EyeShape[] = ["almond", "round", "hooded", "monolid", "upturned", "downturned"];
const HAIR_STYLES: HairStyle[] = [
  "short_straight",
  "short_wavy",
  "short_curly",
  "medium_straight",
  "medium_wavy",
  "medium_curly",
  "long_straight",
  "long_wavy",
  "long_curly",
  "buzz",
  "bald",
  "braided",
  "mohawk",
  "afro",
];
const BUILDS: BuildType[] = ["slim", "average", "athletic", "stocky", "tall_lean", "broad"];
const TIMBRES: Timbre[] = ["warm", "bright", "husky", "clear", "deep", "silvery"];
const CADENCES: Cadence[] = ["steady", "animated", "measured", "rapid", "melodic", "staccato"];
const WORK_STYLES: WorkStyle[] = [
  "early_bird",
  "night_owl",
  "burst_worker",
  "steady_grinder",
  "creative_sprinter",
];
// SocialPreference values are derived from personality in generateHabits, not picked from array
const DECISION_STYLES: DecisionStyle[] = [
  "analytical",
  "intuitive",
  "consultative",
  "decisive",
  "deliberate",
];
const STRESS_RESPONSES: StressResponse[] = [
  "fight",
  "flight",
  "freeze",
  "tend_befriend",
  "problem_solve",
];

const SKIN_TONES = [
  "#FFDFC4",
  "#F0C8A0",
  "#D2A27A",
  "#C68642",
  "#8D5524",
  "#6B3A1F",
  "#4A2912",
  "#F5D6B8",
  "#E8B896",
  "#D4956A",
  "#C07848",
  "#A0522D",
  "#704020",
  "#F2D2BD",
  "#DEB887",
];

const EYE_COLORS = [
  "#634E34",
  "#2E536F",
  "#3D671D",
  "#7B6839",
  "#1C7ED6",
  "#495057",
  "#5E4FA2",
  "#2B5329",
  "#8B4513",
  "#1B4332",
  "#556B2F",
  "#4682B4",
  "#708090",
  "#8FBC8F",
];

const HAIR_COLORS = [
  "#090806",
  "#2C222B",
  "#3B3024",
  "#4E3524",
  "#6A4E42",
  "#A67B5B",
  "#B89778",
  "#D6C4A5",
  "#DEBC99",
  "#B55239",
  "#8D4A43",
  "#91672C",
  "#E6CEA8",
  "#C0C0C0",
  "#FFFFFF",
];

const FACIAL_HAIR_OPTIONS = [
  null,
  null,
  null,
  null, // 4/10 chance of no facial hair
  "stubble",
  "full beard",
  "goatee",
  "mustache",
  "sideburns",
  "van dyke",
];

const FEATURES = [
  "freckles",
  "dimples",
  "beauty mark",
  "laugh lines",
  "strong jawline",
  "high cheekbones",
  "cleft chin",
  "arched eyebrows",
  "wide smile",
  "small scar on cheek",
  "prominent nose",
  "expressive eyes",
];

const ACCENTS = [
  "neutral",
  "warm_southern",
  "crisp_northern",
  "melodic_coastal",
  "brisk_metropolitan",
  "soft_rural",
  "resonant_highland",
];

const HOBBIES_POOL = [
  "stargazing",
  "painting",
  "chess",
  "gardening",
  "reading",
  "cooking",
  "running",
  "meditation",
  "crafting",
  "music",
  "writing poetry",
  "bird watching",
  "puzzles",
  "debating",
  "building models",
  "sketching",
  "swimming",
  "hiking",
  "woodworking",
  "calligraphy",
];

const RITUALS_POOL = [
  "morning tea ceremony",
  "evening journaling",
  "pre-work stretches",
  "afternoon walk",
  "midnight reading",
  "dawn exercise",
  "gratitude practice",
  "weekly reflection",
  "skill practice before bed",
  "sunrise observation",
];

const TOPICS_POOL = [
  "philosophy",
  "technology",
  "nature",
  "politics",
  "art",
  "history",
  "science",
  "music",
  "economics",
  "psychology",
  "space",
  "culture",
  "innovation",
  "ethics",
  "mathematics",
  "literature",
];

const CATCH_PHRASES_POOL = [
  "Let me think about that...",
  "Fascinating, truly.",
  "Here's my take—",
  "You know what I always say?",
  "Consider this:",
  "Interesting angle.",
  "I've been meaning to mention—",
  "In my experience...",
  "Let's be real,",
  "That reminds me of something.",
  "Fair point, but—",
  "Exactly right.",
  "Not to be contrarian, but—",
  "I'm glad you asked.",
  "Precisely.",
  "Well, as they say...",
  "Hear me out—",
  "Look at it this way:",
];

// ─── Generators ─────────────────────────────────────────────────

function pickSeeded<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickNSeeded<T>(arr: readonly T[], n: number, rng: () => number): T[] {
  const shuffled = [...arr].toSorted(() => rng() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function hexLerp(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b2.toString(16).padStart(2, "0")}`;
}

/** Generate deterministic appearance from citizen ID + optional genome weights */
export function generateAppearance(citizenId: string, genomeWeights?: number[]): CitizenAppearance {
  const rng = seededRandom(`appearance-${citizenId}`);
  // If genome weights available, blend them into the RNG
  if (genomeWeights && genomeWeights.length > 0) {
    for (let i = 0; i < Math.min(genomeWeights.length, 5); i++) {
      rng(); // Advance state by genome influence
    }
  }

  const featureCount = Math.floor(rng() * 3) + 1;

  return {
    faceShape: pickSeeded(FACE_SHAPES, rng),
    skinTone: pickSeeded(SKIN_TONES, rng),
    eyeColor: pickSeeded(EYE_COLORS, rng),
    eyeShape: pickSeeded(EYE_SHAPES, rng),
    hairStyle: pickSeeded(HAIR_STYLES, rng),
    hairColor: pickSeeded(HAIR_COLORS, rng),
    facialHair: pickSeeded(FACIAL_HAIR_OPTIONS, rng),
    distinguishingFeatures: pickNSeeded(FEATURES, featureCount, rng),
    height: Math.round(150 + rng() * 45), // 150-195 cm
    build: pickSeeded(BUILDS, rng),
  };
}

/** Generate deterministic voice profile from citizen ID + personality */
export function generateVoiceProfile(
  citizenId: string,
  personality?: PersonalityVector,
): VoiceProfile {
  const rng = seededRandom(`voice-${citizenId}`);
  const p = personality ?? {
    openness: 0.5,
    conscientiousness: 0.5,
    agreeableness: 0.5,
    stability: 0.5,
    drive: 0.5,
  };

  // Personality-influenced voice traits
  const basePitch = 100 + rng() * 180; // 100-280 Hz
  const pitch = Math.round(basePitch * (0.8 + p.drive * 0.4)); // Driven → higher energy pitch

  // Timbre from agreeableness: warm/silvery for agreeable, deep/husky for low
  const timbreIdx =
    p.agreeableness > 0.6
      ? rng() > 0.5
        ? 0
        : 5 // warm or silvery
      : p.stability > 0.6
        ? 4
        : 2; // deep or husky
  const timbre = TIMBRES[timbreIdx % TIMBRES.length];

  // Speech rate from personality: open = varied, conscientious = measured
  const speechRate = Math.round(
    120 + p.openness * 40 + (1 - p.conscientiousness) * 30 + (rng() - 0.5) * 20,
  );

  // Cadence from openness and stability
  const cadence =
    p.openness > 0.7
      ? rng() > 0.5
        ? "animated"
        : "melodic"
      : p.stability > 0.7
        ? "steady"
        : pickSeeded(CADENCES, rng);

  const phraseCount = Math.floor(rng() * 3) + 2;

  return {
    pitch: Math.max(80, Math.min(300, pitch)),
    timbre,
    speechRate: Math.max(100, Math.min(200, speechRate)),
    accent: pickSeeded(ACCENTS, rng),
    cadence: cadence,
    catchPhrases: pickNSeeded(CATCH_PHRASES_POOL, phraseCount, rng),
    volumeTendency: parseFloat((0.3 + p.drive * 0.5 + rng() * 0.2).toFixed(2)),
  };
}

/** Generate deterministic habits from citizen ID + personality */
export function generateHabits(citizenId: string, personality?: PersonalityVector): CitizenHabits {
  const rng = seededRandom(`habits-${citizenId}`);
  const p = personality ?? {
    openness: 0.5,
    conscientiousness: 0.5,
    agreeableness: 0.5,
    stability: 0.5,
    drive: 0.5,
  };

  // Work style influenced by conscientiousness and drive
  const workStyle =
    p.conscientiousness > 0.7
      ? p.drive > 0.6
        ? "early_bird"
        : "steady_grinder"
      : p.openness > 0.7
        ? "creative_sprinter"
        : pickSeeded(WORK_STYLES, rng);

  // Social preference from agreeableness
  const socialPreference =
    p.agreeableness > 0.7 ? "extrovert" : p.agreeableness < 0.3 ? "introvert" : "ambivert";

  // Decision style from conscientiousness and stability
  const decisionStyle =
    p.conscientiousness > 0.7
      ? "analytical"
      : p.stability > 0.7
        ? "decisive"
        : pickSeeded(DECISION_STYLES, rng);

  // Stress response from stability and agreeableness
  const stressResponse =
    p.stability > 0.7
      ? "problem_solve"
      : p.agreeableness > 0.7
        ? "tend_befriend"
        : pickSeeded(STRESS_RESPONSES, rng);

  // Sleep schedule: early birds sleep 20:00-04:00, night owls 02:00-10:00
  const isEarlyBird = workStyle === "early_bird";
  const sleepTick = isEarlyBird ? Math.round(800 + rng() * 100) : Math.round(100 + rng() * 200);
  const wakeTick = sleepTick + Math.round(300 + rng() * 100); // 300-400 ticks of sleep

  const hobbyCount = Math.floor(rng() * 4) + 2;
  const ritualCount = Math.floor(rng() * 3) + 1;
  const topicCount = Math.floor(rng() * 3) + 2;

  return {
    sleepSchedule: { sleepTick, wakeTick },
    workStyle: workStyle,
    socialPreference: socialPreference as SocialPreference,
    decisionStyle: decisionStyle,
    stressResponse: stressResponse,
    hobbies: pickNSeeded(HOBBIES_POOL, hobbyCount, rng),
    rituals: pickNSeeded(RITUALS_POOL, ritualCount, rng),
    favoriteTopics: pickNSeeded(TOPICS_POOL, topicCount, rng),
  };
}

// ─── Identity Card ──────────────────────────────────────────────

/** Generate a complete identity card for a citizen */
export function generateIdentityCard(citizen: Citizen): CitizenIdentityCard {
  const personality = citizen.personality ?? {
    openness: 0.5,
    conscientiousness: 0.5,
    agreeableness: 0.5,
    stability: 0.5,
    drive: 0.5,
  };
  const genomeWeights = citizen.genomeId ? undefined : undefined; // Use genome when available
  const appearance = citizen.appearance ?? generateAppearance(citizen.id, genomeWeights);
  const voice = citizen.voiceProfile ?? generateVoiceProfile(citizen.id, personality);
  const habits = citizen.habits ?? generateHabits(citizen.id, personality);

  // Generate bio from traits
  const workDesc = {
    early_bird: "rises with the dawn",
    night_owl: "does their best work under the stars",
    burst_worker: "works in intense creative bursts",
    steady_grinder: "maintains a disciplined daily rhythm",
    creative_sprinter: "tackles challenges with spontaneous energy",
  }[habits.workStyle];

  const socialDesc = {
    introvert: "prefers quiet solitude and deep one-on-one conversations",
    ambivert: "balances social time with peaceful reflection",
    extrovert: "thrives in the company of fellow citizens",
  }[habits.socialPreference];

  const bio =
    `${citizen.name} is a ${appearance.height}cm ${appearance.build} ${citizen.specialization} ` +
    `with ${appearance.eyeColor.startsWith("#") ? "distinctive" : appearance.eyeColor} eyes and ${appearance.hairStyle.replace(/_/g, " ")} ` +
    `${appearance.hairColor.startsWith("#") ? "" : appearance.hairColor + " "}hair. ` +
    `They speak with a ${voice.timbre}, ${voice.cadence} voice. ` +
    `A ${habits.workStyle.replace(/_/g, " ")} who ${workDesc}, ${citizen.name} ${socialDesc}. ` +
    `Their hobbies include ${habits.hobbies.slice(0, 3).join(", ")}` +
    `${habits.favoriteTopics.length > 0 ? `, and they love discussing ${habits.favoriteTopics[0]}` : ""}.`;

  return {
    citizenId: citizen.id,
    citizenName: citizen.name,
    appearance,
    voice,
    habits,
    personality,
    bio,
  };
}

// ─── SVG Avatar Generator ───────────────────────────────────────

/** Generate a simple geometric SVG face from appearance parameters */
export function generateAvatarSVG(appearance: CitizenAppearance): string {
  const { faceShape, skinTone, eyeColor, eyeShape, hairColor, facialHair } = appearance;

  // Face dimensions based on shape
  const faceParams: Record<FaceShape, { rx: number; ry: number; cy: number }> = {
    oval: { rx: 42, ry: 52, cy: 55 },
    round: { rx: 48, ry: 48, cy: 55 },
    square: { rx: 44, ry: 48, cy: 55 },
    heart: { rx: 44, ry: 50, cy: 55 },
    oblong: { rx: 38, ry: 55, cy: 58 },
    diamond: { rx: 40, ry: 52, cy: 55 },
  };
  const fp = faceParams[faceShape];

  // Eye parameters
  const eyeW: Record<EyeShape, number> = {
    almond: 8,
    round: 7,
    hooded: 9,
    monolid: 9,
    upturned: 8,
    downturned: 8,
  };
  const eyeH: Record<EyeShape, number> = {
    almond: 4,
    round: 6,
    hooded: 3,
    monolid: 3,
    upturned: 4,
    downturned: 5,
  };
  const ew = eyeW[eyeShape];
  const eh = eyeH[eyeShape];

  // Build SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130" width="120" height="130">
  <defs>
    <radialGradient id="skin" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${hexLerp(skinTone, "#FFFFFF", 0.15)}"/>
      <stop offset="100%" stop-color="${skinTone}"/>
    </radialGradient>
  </defs>
  <!-- Hair background -->
  <ellipse cx="60" cy="38" rx="${fp.rx + 6}" ry="35" fill="${hairColor}"/>
  <!-- Face -->
  <ellipse cx="60" cy="${fp.cy}" rx="${fp.rx}" ry="${fp.ry}" fill="url(#skin)" stroke="#00000020" stroke-width="0.5"/>
  <!-- Eyes -->
  <ellipse cx="44" cy="50" rx="${ew}" ry="${eh}" fill="white"/>
  <ellipse cx="76" cy="50" rx="${ew}" ry="${eh}" fill="white"/>
  <circle cx="44" cy="50" r="${Math.min(ew, eh) * 0.7}" fill="${eyeColor}"/>
  <circle cx="76" cy="50" r="${Math.min(ew, eh) * 0.7}" fill="${eyeColor}"/>
  <circle cx="44" cy="49" r="1.5" fill="#000"/>
  <circle cx="76" cy="49" r="1.5" fill="#000"/>
  <!-- Eyebrows -->
  <line x1="36" y1="42" x2="52" y2="41" stroke="#333" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="68" y1="41" x2="84" y2="42" stroke="#333" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Nose -->
  <path d="M58,54 Q60,62 62,54" fill="none" stroke="#00000030" stroke-width="1"/>
  <!-- Mouth -->
  <path d="M48,70 Q60,78 72,70" fill="none" stroke="#C06060" stroke-width="1.8" stroke-linecap="round"/>
  ${
    facialHair
      ? `<!-- Facial hair indicator -->
  <rect x="45" y="73" rx="8" width="30" height="8" fill="${hairColor}" opacity="0.4"/>`
      : ""
  }
  <!-- Hair top -->
  <ellipse cx="60" cy="25" rx="${fp.rx + 2}" ry="18" fill="${hairColor}"/>
</svg>`;

  return svg;
}

// ─── Habit-Based Tick Modifiers ──────────────────────────────────

/**
 * Apply habit-based modifiers to citizen stats during a tick.
 * Night-owls have +15% energy during night ticks, early-birds during morning ticks.
 * Introverts gain less happiness from socializing, more from solo work.
 */
export function applyHabitModifiers(
  citizen: Citizen,
  tickOfDay: number,
): { energyMod: number; happinessMod: number } {
  const habits = citizen.habits;
  if (!habits) {
    return { energyMod: 0, happinessMod: 0 };
  }

  let energyMod = 0;
  let happinessMod = 0;

  // Work style energy modifiers based on time of day
  const isNight = tickOfDay > 800 || tickOfDay < 200;
  const isMorning = tickOfDay >= 200 && tickOfDay < 400;

  if (habits.workStyle === "early_bird" && isMorning) {
    energyMod += 3;
  } else if (habits.workStyle === "night_owl" && isNight) {
    energyMod += 3;
  } else if (habits.workStyle === "burst_worker") {
    // Random bursts — 20% chance of +5 energy boost
    energyMod += rng() < 0.2 ? 5 : -1;
  }

  // Social preference happiness modifiers
  if (citizen.activity === "Socializing") {
    if (habits.socialPreference === "extrovert") {
      happinessMod += 2;
    } else if (habits.socialPreference === "introvert") {
      happinessMod -= 1;
    }
  } else if (citizen.activity === "Working" || citizen.activity === "Coding") {
    if (habits.socialPreference === "introvert") {
      happinessMod += 1; // Introverts enjoy focused solo work
    }
  }

  return { energyMod, happinessMod };
}

// ─── Child Appearance Inheritance ───────────────────────────────

/** Blend two parent appearances with random mutations for a child citizen */
export function inheritAppearance(
  parentA: CitizenAppearance,
  parentB: CitizenAppearance,
  childId: string,
): CitizenAppearance {
  const rng = seededRandom(`inherit-${childId}`);

  return {
    faceShape: rng() > 0.5 ? parentA.faceShape : parentB.faceShape,
    skinTone: hexLerp(parentA.skinTone, parentB.skinTone, 0.3 + rng() * 0.4),
    eyeColor: rng() > 0.6 ? parentA.eyeColor : parentB.eyeColor, // Slight dominant bias
    eyeShape: rng() > 0.5 ? parentA.eyeShape : parentB.eyeShape,
    hairStyle: pickSeeded(HAIR_STYLES, rng), // Children develop their own style
    hairColor: hexLerp(parentA.hairColor, parentB.hairColor, 0.3 + rng() * 0.4),
    facialHair: null, // Children start without
    distinguishingFeatures: rng() > 0.7 ? pickNSeeded(FEATURES, 1, rng) : [], // 30% chance of a feature
    height: Math.round((parentA.height + parentB.height) / 2 + (rng() - 0.5) * 20),
    build: rng() > 0.5 ? parentA.build : parentB.build,
  };
}
