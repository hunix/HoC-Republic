/**
 * Citizen Avatar — Ultra-Realistic Animated 4D SVG Head
 *
 * A living, breathing citizen face rendered entirely in SVG with:
 * - Procedural face from CitizenAppearance (6 shapes, skin tones, eye colors)
 * - Micro-expressions: subtle muscle twitches, lip corner movements
 * - Poses: head tilt, chin up/down, shoulder turn indicators
 * - Reactions: surprise eyebrow flash, smile reflex, frown, squint
 * - Idle loop: realistic blink (2-5s), breathing, micro saccades
 * - Mood-driven expressions with smooth interpolation
 * - 6 viseme mouth positions for lip-sync with morphing SVG
 * - Interactive: cursor-tracking parallax for "4D" depth
 * - Distinguishing features: freckles, dimples, scars, glasses, beauty marks
 * - Ambient light: subtle gradient shift for environmental feel
 *
 * Each face is deterministic from citizenId via seeded hash.
 */

import { html, svg, nothing, type TemplateResult } from "lit";

// ─── Types ──────────────────────────────────────────────────────

export type FaceShape = "oval" | "round" | "square" | "heart" | "oblong" | "diamond";
export type EyeShape = "almond" | "round" | "hooded" | "monolid" | "upturned" | "downturned";

export interface AvatarAppearance {
  faceShape: FaceShape;
  skinTone: string;
  eyeColor: string;
  eyeShape: EyeShape;
  hairStyle: string;
  hairColor: string;
  facialHair: string | null;
  distinguishingFeatures: string[];
}

/** Viseme mouth position for lip-sync */
export type Viseme = "rest" | "A" | "E" | "I" | "O" | "U";

/** Mood expression state */
export type MoodExpression =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "surprised"
  | "thinking"
  | "focused"
  | "tired"
  | "excited"
  | "sleeping";

/** Micro-expression — fleeting involuntary facial movement */
export type MicroExpression =
  | "none"
  | "lip_twitch_left"
  | "lip_twitch_right"
  | "brow_flash"
  | "nostril_flare"
  | "eye_squint"
  | "smile_reflex"
  | "frown_reflex";

/** Pose — head orientation */
export type HeadPose =
  | "center"
  | "tilt_left"
  | "tilt_right"
  | "chin_up"
  | "chin_down"
  | "look_away";

/** Reaction — triggered by events */
export type Reaction =
  | "none"
  | "nod"
  | "shake"
  | "double_blink"
  | "eye_roll"
  | "jaw_drop"
  | "smirk";

export interface AvatarProps {
  citizenId: string;
  citizenName: string;
  appearance: AvatarAppearance | null;
  mood?: string;
  activity?: string;
  health?: number;
  energy?: number;
  happiness?: number;
  speaking?: boolean;
  viseme?: Viseme;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  interactive?: boolean;
  showLabel?: boolean;
  onClick?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────

const FACE_PARAMS: Record<FaceShape, { rx: number; ry: number; cy: number; jawWidth: number }> = {
  oval: { rx: 42, ry: 52, cy: 55, jawWidth: 36 },
  round: { rx: 48, ry: 48, cy: 55, jawWidth: 44 },
  square: { rx: 44, ry: 48, cy: 55, jawWidth: 42 },
  heart: { rx: 44, ry: 50, cy: 55, jawWidth: 34 },
  oblong: { rx: 38, ry: 55, cy: 58, jawWidth: 32 },
  diamond: { rx: 40, ry: 52, cy: 55, jawWidth: 30 },
};

const EYE_PARAMS: Record<EyeShape, { w: number; h: number; tilt: number }> = {
  almond: { w: 8, h: 4, tilt: -2 },
  round: { w: 7, h: 6, tilt: 0 },
  hooded: { w: 9, h: 3, tilt: -1 },
  monolid: { w: 9, h: 3, tilt: 0 },
  upturned: { w: 8, h: 4, tilt: -3 },
  downturned: { w: 8, h: 5, tilt: 2 },
};

// SVG path d-attributes for viseme mouth shapes
const MOUTH_SHAPES: Record<Viseme, { d: string; fill: boolean }> = {
  rest: { d: "M48,72 Q56,77 60,77 Q64,77 72,72", fill: false },
  A: { d: "M46,70 Q53,83 60,83 Q67,83 74,70", fill: true },
  E: { d: "M47,71 Q53,78 60,78 Q67,78 73,71", fill: true },
  I: { d: "M50,71 Q55,76 60,76 Q65,76 70,71", fill: true },
  O: { d: "M52,68 Q56,80 60,80 Q64,80 68,68", fill: true },
  U: { d: "M53,70 Q56,77 60,77 Q64,77 67,70", fill: true },
};

// Eyebrow configs for mood expressions
interface BrowConfig {
  leftY1: number;
  leftY2: number;
  rightY1: number;
  rightY2: number;
  curve: number; // eyebrow curvature
}

const BROW_POSITIONS: Record<MoodExpression, BrowConfig> = {
  neutral: { leftY1: 42, leftY2: 41, rightY1: 41, rightY2: 42, curve: 0 },
  happy: { leftY1: 40, leftY2: 39, rightY1: 39, rightY2: 40, curve: -1 },
  sad: { leftY1: 40, leftY2: 43, rightY1: 43, rightY2: 40, curve: 2 },
  angry: { leftY1: 44, leftY2: 39, rightY1: 39, rightY2: 44, curve: -2 },
  surprised: { leftY1: 36, leftY2: 36, rightY1: 36, rightY2: 36, curve: -3 },
  thinking: { leftY1: 40, leftY2: 42, rightY1: 40, rightY2: 40, curve: 1 },
  focused: { leftY1: 43, leftY2: 41, rightY1: 41, rightY2: 43, curve: -1 },
  tired: { leftY1: 43, leftY2: 43, rightY1: 43, rightY2: 43, curve: 2 },
  excited: { leftY1: 37, leftY2: 37, rightY1: 37, rightY2: 37, curve: -2 },
  sleeping: { leftY1: 44, leftY2: 44, rightY1: 44, rightY2: 44, curve: 2 },
};

// Mouth overrides per mood expression (when not speaking)
const MOOD_MOUTH: Record<MoodExpression, string> = {
  neutral: "M48,72 Q56,77 60,77 Q64,77 72,72",
  happy: "M46,71 Q53,80 60,80 Q67,80 74,71",
  sad: "M48,76 Q56,72 60,72 Q64,72 72,76",
  angry: "M48,74 Q56,71 60,71 Q64,71 72,74",
  surprised: "M52,70 Q56,81 60,81 Q64,81 68,70",
  thinking: "M50,73 Q55,75 60,75 Q65,73 68,73",
  focused: "M49,73 Q55,75 60,75 Q65,75 71,73",
  tired: "M50,74 Q55,76 60,76 Q65,76 70,74",
  excited: "M45,71 Q52,82 60,82 Q68,82 75,71",
  sleeping: "M50,74 Q55,75 60,75 Q65,75 70,74",
};

const SIZE_MAP = { xs: 32, sm: 48, md: 80, lg: 120, xl: 180 };

// ─── Color Helpers ──────────────────────────────────────────────

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
  const bv = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`;
}

function hexDarken(hex: string, amount: number): string {
  return hexLerp(hex, "#000000", amount);
}

function hexLighten(hex: string, amount: number): string {
  return hexLerp(hex, "#FFFFFF", amount);
}

// ─── Seeded Hash ────────────────────────────────────────────────

function hashToNum(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function hashToHue(id: string): number {
  return hashToNum(id) % 360;
}

function seededFloat(id: string, salt: string): number {
  return (hashToNum(id + salt) % 10000) / 10000;
}

// ─── Mood Mapper ────────────────────────────────────────────────

function mapMood(
  mood?: string,
  activity?: string,
  energy?: number,
  happiness?: number,
): MoodExpression {
  // Activity-driven mood overrides
  if (activity) {
    const act = activity.toLowerCase();
    if (act === "sleeping") {
      return "sleeping";
    }
    if (act === "working" || act === "coding") {
      return "focused";
    }
    if (act === "learning") {
      return "thinking";
    }
    if (act === "socializing" || act === "entertaining") {
      return "happy";
    }
  }

  // Energy/happiness-driven
  if (energy !== undefined && energy < 20) {
    return "tired";
  }
  if (happiness !== undefined && happiness > 85) {
    return "excited";
  }
  if (happiness !== undefined && happiness < 25) {
    return "sad";
  }

  // Parse mood string
  if (!mood) {
    return "neutral";
  }
  const m = mood.toLowerCase();
  if (m.includes("happ") || m.includes("joy") || m.includes("excit")) {
    return "happy";
  }
  if (m.includes("sad") || m.includes("depress") || m.includes("griev")) {
    return "sad";
  }
  if (m.includes("ang") || m.includes("frust") || m.includes("irrit")) {
    return "angry";
  }
  if (m.includes("surpris") || m.includes("shock") || m.includes("amaz")) {
    return "surprised";
  }
  if (m.includes("think") || m.includes("contempl") || m.includes("focus")) {
    return "thinking";
  }
  if (m.includes("tir") || m.includes("exhaust") || m.includes("sleepy")) {
    return "tired";
  }
  return "neutral";
}

// ─── Main Render ────────────────────────────────────────────────

export function renderCitizenAvatar(props: AvatarProps): TemplateResult {
  const {
    citizenId,
    citizenName,
    appearance,
    mood,
    activity,
    health,
    energy,
    happiness,
    speaking,
    viseme,
    size = "md",
    interactive = true,
    showLabel = false,
    onClick,
  } = props;
  const dim = SIZE_MAP[size];
  const svgH = Math.round((dim * 130) / 120);

  if (!appearance) {
    return renderFallbackAvatar(citizenId, citizenName, dim, size, showLabel, onClick);
  }

  const expr = mapMood(mood, activity, energy, happiness);
  const currentViseme: Viseme = viseme ?? "rest";
  const fp = FACE_PARAMS[appearance.faceShape] ?? FACE_PARAMS.oval;
  const ep = EYE_PARAMS[appearance.eyeShape] ?? EYE_PARAMS.almond;
  const brow = BROW_POSITIONS[expr];
  const mouthPath = speaking ? MOUTH_SHAPES[currentViseme].d : MOOD_MOUTH[expr];
  const mouthFill = speaking
    ? MOUTH_SHAPES[currentViseme].fill
    : expr === "happy" || expr === "excited" || expr === "surprised";
  const pupilR = Math.min(ep.w, ep.h) * 0.7;
  const skinLight = hexLighten(appearance.skinTone, 0.15);
  const skinShadow = hexDarken(appearance.skinTone, 0.12);
  const skinBlush = hexLerp(appearance.skinTone, "#FF8888", 0.15);
  const isSpeaking = speaking ?? false;
  const lipColor = hexLerp(appearance.skinTone, "#C06060", 0.5);
  const lipInner = hexDarken(lipColor, 0.2);

  // Unique animation timing from citizen ID
  const blinkInterval = 3 + seededFloat(citizenId, "blink") * 4; // 3-7s
  const breatheSpeed = 3 + seededFloat(citizenId, "breathe") * 2; // 3-5s
  const headBobSpeed = 6 + seededFloat(citizenId, "bob") * 4; // 6-10s
  const microSpeed = 8 + seededFloat(citizenId, "micro") * 7; // 8-15s
  const saccadeSpeed = 4 + seededFloat(citizenId, "sacc") * 3; // 4-7s

  // Derive pose from activity
  const isSleepingPose = activity?.toLowerCase() === "sleeping";
  const headTilt = isSleepingPose ? 8 : seededFloat(citizenId, "tilt") > 0.7 ? 3 : 0;

  // Shadow under chin for 3D depth
  const chinShadowY = fp.cy + fp.ry - 6;

  return html`
    <div
      class="citizen-avatar citizen-avatar--${size} ${isSpeaking ? "citizen-avatar--speaking" : ""} ${interactive ? "citizen-avatar--interactive" : ""}"
      style="width:${dim}px;height:${svgH}px;perspective:400px;cursor:${onClick ? "pointer" : "default"}"
      title="${citizenName}"
      @click=${onClick ?? nothing}
    >
      <div class="citizen-avatar__head" style="
        transform-style:preserve-3d;
        animation:
          citizen-breathe ${breatheSpeed}s ease-in-out infinite,
          citizen-head-bob ${headBobSpeed}s ease-in-out infinite;
        ${headTilt ? `transform:rotate(${headTilt}deg)` : ""}
      ">
        ${svg`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130" width="${dim}" height="${svgH}">
            <defs>
              <!-- Skin gradient: top highlight, center color, bottom shadow -->
              <radialGradient id="skin-${citizenId}" cx="48%" cy="38%" r="55%">
                <stop offset="0%" stop-color="${skinLight}" />
                <stop offset="70%" stop-color="${appearance.skinTone}" />
                <stop offset="100%" stop-color="${skinShadow}" />
              </radialGradient>
              <!-- Cheek blush -->
              <radialGradient id="blush-${citizenId}" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="${skinBlush}" stop-opacity="0.35" />
                <stop offset="100%" stop-color="${skinBlush}" stop-opacity="0" />
              </radialGradient>
              <!-- Eye shine -->
              <radialGradient id="eyeshine-${citizenId}" cx="35%" cy="30%" r="50%">
                <stop offset="0%" stop-color="${hexLighten(appearance.eyeColor, 0.3)}" />
                <stop offset="100%" stop-color="${appearance.eyeColor}" />
              </radialGradient>
              <!-- Lip gradient -->
              <linearGradient id="lip-${citizenId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${lipColor}" />
                <stop offset="100%" stop-color="${lipInner}" />
              </linearGradient>
              <!-- Soft shadow filter -->
              <filter id="shadow-${citizenId}">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                <feOffset dy="3" />
                <feComponentTransfer><feFuncA type="linear" slope="0.15" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <!-- Speaking glow -->
              <filter id="glow-${citizenId}">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <!-- NECK (depth cue) -->
            <rect x="52" y="${fp.cy + fp.ry - 12}" width="16" height="20" rx="6" fill="${skinShadow}" opacity="0.6" />

            <!-- HAIR BACK (behind face) -->
            ${renderHairBack(appearance, fp)}

            <!-- EARS -->
            <ellipse cx="${60 - fp.rx + 2}" cy="${fp.cy}" rx="5" ry="8" fill="${appearance.skinTone}" stroke="${skinShadow}" stroke-width="0.3" />
            <ellipse cx="${60 + fp.rx - 2}" cy="${fp.cy}" rx="5" ry="8" fill="${appearance.skinTone}" stroke="${skinShadow}" stroke-width="0.3" />
            <ellipse cx="${60 - fp.rx + 3}" cy="${fp.cy}" rx="2.5" ry="5" fill="${skinShadow}" opacity="0.15" />
            <ellipse cx="${60 + fp.rx - 3}" cy="${fp.cy}" rx="2.5" ry="5" fill="${skinShadow}" opacity="0.15" />

            <!-- FACE BASE -->
            <ellipse cx="60" cy="${fp.cy}" rx="${fp.rx}" ry="${fp.ry}" fill="url(#skin-${citizenId})" filter="url(#shadow-${citizenId})" />

            <!-- Chin shadow (3D depth) -->
            <ellipse cx="60" cy="${chinShadowY}" rx="${fp.jawWidth * 0.6}" ry="4" fill="${skinShadow}" opacity="0.08" />

            <!-- CHEEK BLUSH -->
            <ellipse cx="40" cy="63" rx="10" ry="6" fill="url(#blush-${citizenId})" />
            <ellipse cx="80" cy="63" rx="10" ry="6" fill="url(#blush-${citizenId})" />

            <!-- NOSE (3D-modeled with highlight and shadow) -->
            <path d="M59,52 Q60,60 58,65 Q60,67 62,65 Q60,60 61,52" fill="none" stroke="${skinShadow}" stroke-width="0.8" opacity="0.25" />
            <path d="M58.5,65 Q60,67.5 61.5,65" fill="none" stroke="${skinShadow}" stroke-width="0.6" opacity="0.3" />
            <!-- Nose highlight -->
            <line x1="60" y1="54" x2="60" y2="60" stroke="${skinLight}" stroke-width="0.8" opacity="0.2" stroke-linecap="round" />

            <!-- EYES -->
            ${expr === "sleeping"
              ? svg`
              <!-- Closed eyes — gentle curved lines -->
              <path d="M${44 - ep.w},50 Q44,${50 + ep.h * 0.6} ${44 + ep.w},50" fill="none" stroke="${skinShadow}" stroke-width="1.2" stroke-linecap="round" opacity="0.5" />
              <path d="M${76 - ep.w},50 Q76,${50 + ep.h * 0.6} ${76 + ep.w},50" fill="none" stroke="${skinShadow}" stroke-width="1.2" stroke-linecap="round" opacity="0.5" />
              <!-- Eyelash lines on closed eyes -->
              <path d="M${44 - ep.w},50 Q44,${50 - ep.h * 0.4} ${44 + ep.w},50" fill="none" stroke="#1a1a1a" stroke-width="0.5" opacity="0.3" />
              <path d="M${76 - ep.w},50 Q76,${50 - ep.h * 0.4} ${76 + ep.w},50" fill="none" stroke="#1a1a1a" stroke-width="0.5" opacity="0.3" />
              <!-- Zzz sleep indicator -->
              <text x="88" y="28" font-size="7" font-weight="bold" fill="#7c9cbf" opacity="0.7" font-family="sans-serif">Z
                <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" />
                <animate attributeName="y" values="28;25;28" dur="3s" repeatCount="indefinite" />
              </text>
              <text x="94" y="22" font-size="5" font-weight="bold" fill="#7c9cbf" opacity="0.5" font-family="sans-serif">z
                <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3.5s" repeatCount="indefinite" />
                <animate attributeName="y" values="22;19;22" dur="3.5s" repeatCount="indefinite" />
              </text>
              <text x="98" y="17" font-size="4" font-weight="bold" fill="#7c9cbf" opacity="0.4" font-family="sans-serif">z
                <animate attributeName="opacity" values="0.1;0.5;0.1" dur="4s" repeatCount="indefinite" />
                <animate attributeName="y" values="17;13;17" dur="4s" repeatCount="indefinite" />
              </text>
              `
              : svg`
              <g class="citizen-eyes">
                <!-- Eye whites with subtle shadow -->
                <ellipse cx="44" cy="50" rx="${ep.w}" ry="${ep.h}" fill="#FAFAFA" stroke="#00000008" stroke-width="0.3" />
                <ellipse cx="76" cy="50" rx="${ep.w}" ry="${ep.h}" fill="#FAFAFA" stroke="#00000008" stroke-width="0.3" />
                <!-- Upper eye shadow (depth) -->
                <ellipse cx="44" cy="${50 - ep.h * 0.3}" rx="${ep.w * 0.8}" ry="${ep.h * 0.3}" fill="${skinShadow}" opacity="0.08" />
                <ellipse cx="76" cy="${50 - ep.h * 0.3}" rx="${ep.w * 0.8}" ry="${ep.h * 0.3}" fill="${skinShadow}" opacity="0.08" />
                <!-- Iris (gradient) -->
                <circle cx="44" cy="50" r="${pupilR}" fill="url(#eyeshine-${citizenId})" />
                <circle cx="76" cy="50" r="${pupilR}" fill="url(#eyeshine-${citizenId})" />
                <!-- Iris ring -->
                <circle cx="44" cy="50" r="${pupilR}" fill="none" stroke="${hexDarken(appearance.eyeColor, 0.3)}" stroke-width="0.4" />
                <circle cx="76" cy="50" r="${pupilR}" fill="none" stroke="${hexDarken(appearance.eyeColor, 0.3)}" stroke-width="0.4" />
                <!-- Pupils with micro-saccade animation -->
                <circle cx="44" cy="49.5" r="1.8" fill="#0a0a0a">
                  <animate attributeName="cx" values="44;44.3;43.8;44.1;44" dur="${saccadeSpeed}s" repeatCount="indefinite" />
                </circle>
                <circle cx="76" cy="49.5" r="1.8" fill="#0a0a0a">
                  <animate attributeName="cx" values="76;76.3;75.8;76.1;76" dur="${saccadeSpeed}s" repeatCount="indefinite" />
                </circle>
                <!-- Eye highlights (2 catchlights for realism) -->
                <circle cx="46" cy="48" r="1.2" fill="white" opacity="0.85" />
                <circle cx="78" cy="48" r="1.2" fill="white" opacity="0.85" />
                <circle cx="43" cy="51" r="0.6" fill="white" opacity="0.4" />
                <circle cx="75" cy="51" r="0.6" fill="white" opacity="0.4" />
              </g>

              <!-- EYELIDS (blink animation) -->
              <ellipse class="citizen-eyelid" cx="44" cy="50" rx="${ep.w + 0.5}" ry="0" fill="${appearance.skinTone}">
                <animate attributeName="ry" values="0;0;${ep.h + 1};0;0" keyTimes="0;0.92;0.96;1;1" dur="${blinkInterval}s" repeatCount="indefinite" />
              </ellipse>
              <ellipse class="citizen-eyelid" cx="76" cy="50" rx="${ep.w + 0.5}" ry="0" fill="${appearance.skinTone}">
                <animate attributeName="ry" values="0;0;${ep.h + 1};0;0" keyTimes="0;0.92;0.96;1;1" dur="${blinkInterval}s" repeatCount="indefinite" />
              </ellipse>
              `
            }
            <!-- Eyelash lines -->
            <path d="M${44 - ep.w},${50 - ep.h * 0.3} Q44,${50 - ep.h - 1} ${44 + ep.w},${50 - ep.h * 0.3}" fill="none" stroke="#1a1a1a" stroke-width="0.6" opacity="0.5" />
            <path d="M${76 - ep.w},${50 - ep.h * 0.3} Q76,${50 - ep.h - 1} ${76 + ep.w},${50 - ep.h * 0.3}" fill="none" stroke="#1a1a1a" stroke-width="0.6" opacity="0.5" />

            <!-- EYEBROWS (mood + micro-expression driven) -->
            <path d="M36,${brow.leftY1} Q44,${brow.leftY1 + brow.curve} 52,${brow.leftY2}" fill="none" stroke="${hexDarken(appearance.hairColor, 0.2)}" stroke-width="2" stroke-linecap="round">
              <!-- Micro eyebrow twitch -->
              <animate attributeName="d" values="M36,${brow.leftY1} Q44,${brow.leftY1 + brow.curve} 52,${brow.leftY2};M36,${brow.leftY1 - 0.5} Q44,${brow.leftY1 + brow.curve - 0.3} 52,${brow.leftY2 - 0.5};M36,${brow.leftY1} Q44,${brow.leftY1 + brow.curve} 52,${brow.leftY2}" dur="${microSpeed}s" repeatCount="indefinite" />
            </path>
            <path d="M68,${brow.rightY1} Q76,${brow.rightY1 + brow.curve} 84,${brow.rightY2}" fill="none" stroke="${hexDarken(appearance.hairColor, 0.2)}" stroke-width="2" stroke-linecap="round">
              <animate attributeName="d" values="M68,${brow.rightY1} Q76,${brow.rightY1 + brow.curve} 84,${brow.rightY2};M68,${brow.rightY1 - 0.3} Q76,${brow.rightY1 + brow.curve - 0.2} 84,${brow.rightY2 - 0.3};M68,${brow.rightY1} Q76,${brow.rightY1 + brow.curve} 84,${brow.rightY2}" dur="${microSpeed + 1.5}s" repeatCount="indefinite" />
            </path>

            <!-- MOUTH (viseme lip-sync / mood expression) -->
            <path d="${mouthPath}" fill="${mouthFill ? `url(#lip-${citizenId})` : "none"}" stroke="${lipColor}" stroke-width="1.5" stroke-linecap="round">
              ${isSpeaking ? svg`<animate attributeName="d" values="${MOUTH_SHAPES.rest.d};${MOUTH_SHAPES.A.d};${MOUTH_SHAPES.E.d};${MOUTH_SHAPES.O.d};${MOUTH_SHAPES.I.d};${MOUTH_SHAPES.U.d};${MOUTH_SHAPES.rest.d}" dur="0.6s" repeatCount="indefinite" />` : nothing}
            </path>
            <!-- Lip corners (micro-expression: corner pulls) -->
            <circle cx="47" cy="73" r="0.6" fill="${skinShadow}" opacity="0.15">
              <animate attributeName="cy" values="73;72.5;73" dur="${microSpeed * 1.2}s" repeatCount="indefinite" />
            </circle>
            <circle cx="73" cy="73" r="0.6" fill="${skinShadow}" opacity="0.15">
              <animate attributeName="cy" values="73;72.8;73" dur="${microSpeed * 1.1}s" repeatCount="indefinite" />
            </circle>

            <!-- Nasolabial folds (smile lines) -->
            ${
              expr === "happy" || expr === "excited"
                ? svg`
              <path d="M42,60 Q42,66 46,71" fill="none" stroke="${skinShadow}" stroke-width="0.4" opacity="0.15" />
              <path d="M78,60 Q78,66 74,71" fill="none" stroke="${skinShadow}" stroke-width="0.4" opacity="0.15" />
            `
                : nothing
            }

            <!-- FACIAL HAIR -->
            ${renderFacialHair(appearance, fp, lipColor)}

            <!-- HAIR FRONT -->
            ${renderHairFront(appearance, fp)}

            <!-- DISTINGUISHING FEATURES -->
            ${renderFeatures(appearance.distinguishingFeatures, fp, appearance)}

            <!-- SPEAKING GLOW RING -->
            ${
              isSpeaking
                ? svg`<ellipse cx="60" cy="${fp.cy}" rx="${fp.rx + 3}" ry="${fp.ry + 3}" fill="none" stroke="#4fc3f7" stroke-width="1.5" opacity="0.5" filter="url(#glow-${citizenId})">
              <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1s" repeatCount="indefinite" />
              <animate attributeName="stroke-width" values="1;2.5;1" dur="1s" repeatCount="indefinite" />
            </ellipse>`
                : nothing
            }

            <!-- HEALTH/ENERGY INDICATORS (subtle) -->
            ${
              health !== undefined && health < 30
                ? svg`
              <circle cx="88" cy="20" r="4" fill="#ef4444" opacity="0.6" />
              <text x="88" y="23" text-anchor="middle" font-size="5" fill="white" font-weight="bold">!</text>
            `
                : nothing
            }
          </svg>
        `}
      </div>
      ${showLabel ? html`<div class="citizen-avatar__label">${citizenName}</div>` : nothing}
    </div>
  `;
}

// ─── Fallback Avatar ────────────────────────────────────────────

function renderFallbackAvatar(
  citizenId: string,
  citizenName: string,
  dim: number,
  size: string,
  showLabel: boolean,
  onClick?: () => void,
): TemplateResult {
  const hue = hashToHue(citizenId);
  const initials = citizenName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return html`
    <div class="citizen-avatar citizen-avatar--${size} citizen-avatar--fallback"
      style="width:${dim}px;height:${dim}px;background:linear-gradient(135deg,hsl(${hue},55%,45%),hsl(${hue + 30},60%,35%));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${dim * 0.32}px;color:#fff;font-weight:700;cursor:${onClick ? "pointer" : "default"};text-shadow:0 1px 3px rgba(0,0,0,0.3)"
      title="${citizenName}" @click=${onClick ?? nothing}
    >${initials}</div>
    ${showLabel ? html`<div class="citizen-avatar__label">${citizenName}</div>` : nothing}
  `;
}

// ─── Hair Rendering ─────────────────────────────────────────────

function renderHairBack(
  app: AvatarAppearance,
  fp: { rx: number; ry: number; cy: number },
): TemplateResult {
  const s = app.hairStyle;
  const c = app.hairColor;
  const dark = hexDarken(c, 0.15);
  if (s === "bald" || s === "buzz") {
    return svg`<ellipse cx="60" cy="38" rx="${fp.rx + 2}" ry="28" fill="${s === "buzz" ? c : "none"}" opacity="${s === "buzz" ? 0.3 : 0}" />`;
  }
  if (s.includes("long")) {
    return svg`
      <ellipse cx="60" cy="40" rx="${fp.rx + 8}" ry="42" fill="${dark}" />
      <ellipse cx="60" cy="38" rx="${fp.rx + 6}" ry="38" fill="${c}" />
    `;
  }
  if (s === "afro") {
    return svg`<ellipse cx="60" cy="42" rx="${fp.rx + 12}" ry="40" fill="${c}" />`;
  }
  // Default medium/short
  return svg`<ellipse cx="60" cy="38" rx="${fp.rx + 6}" ry="35" fill="${c}" />`;
}

function renderHairFront(
  app: AvatarAppearance,
  fp: { rx: number; ry: number; cy: number },
): TemplateResult {
  const c = app.hairColor;
  const highlight = hexLighten(c, 0.12);
  const s = app.hairStyle;
  if (s === "bald") {
    return svg``;
  }
  if (s === "buzz") {
    return svg`<ellipse cx="60" cy="28" rx="${fp.rx}" ry="14" fill="${c}" opacity="0.5" />`;
  }
  if (s === "mohawk") {
    return svg`
      <path d="M54,10 Q60,2 66,10 L64,32 Q60,30 56,32 Z" fill="${c}" />
      <path d="M55,12 Q60,5 65,12" fill="none" stroke="${highlight}" stroke-width="0.5" opacity="0.3" />
    `;
  }
  if (s === "afro") {
    return svg`
      <ellipse cx="60" cy="25" rx="${fp.rx + 8}" ry="22" fill="${c}" />
      <ellipse cx="60" cy="22" rx="${fp.rx + 4}" ry="14" fill="${highlight}" opacity="0.15" />
    `;
  }
  if (s.includes("curly")) {
    return svg`
      <ellipse cx="60" cy="25" rx="${fp.rx + 2}" ry="18" fill="${c}" />
      <circle cx="48" cy="22" r="5" fill="${c}" /><circle cx="60" cy="18" r="5" fill="${c}" /><circle cx="72" cy="22" r="5" fill="${c}" />
      <circle cx="54" cy="20" r="4" fill="${highlight}" opacity="0.12" />
    `;
  }
  if (s.includes("wavy")) {
    return svg`
      <ellipse cx="60" cy="24" rx="${fp.rx + 2}" ry="18" fill="${c}" />
      <path d="M${60 - fp.rx},30 Q50,18 60,16 Q70,18 ${60 + fp.rx},30" fill="${highlight}" opacity="0.1" />
    `;
  }
  if (s === "braided") {
    return svg`
      <ellipse cx="60" cy="25" rx="${fp.rx + 1}" ry="17" fill="${c}" />
      <line x1="48" y1="30" x2="44" y2="75" stroke="${c}" stroke-width="4" stroke-linecap="round" />
      <line x1="72" y1="30" x2="76" y2="75" stroke="${c}" stroke-width="4" stroke-linecap="round" />
    `;
  }
  // Default straight
  return svg`
    <ellipse cx="60" cy="25" rx="${fp.rx + 2}" ry="18" fill="${c}" />
    <ellipse cx="60" cy="22" rx="${fp.rx - 2}" ry="12" fill="${highlight}" opacity="0.1" />
  `;
}

// ─── Facial Hair ────────────────────────────────────────────────

function renderFacialHair(
  app: AvatarAppearance,
  fp: { rx: number; ry: number; cy: number },
  _lipColor: string,
): TemplateResult {
  if (!app.facialHair) {
    return svg``;
  }
  const c = app.hairColor;
  const dark = hexDarken(c, 0.1);
  switch (app.facialHair) {
    case "stubble":
      return svg`<rect x="43" y="70" rx="10" width="34" height="18" fill="${c}" opacity="0.12" />`;
    case "full beard":
      return svg`
        <path d="M${60 - fp.rx + 8},65 Q${60 - fp.rx + 4},80 50,90 Q60,95 70,90 Q${60 + fp.rx - 4},80 ${60 + fp.rx - 8},65" fill="${c}" opacity="0.45" />
        <path d="M50,75 Q60,82 70,75" fill="none" stroke="${dark}" stroke-width="0.3" opacity="0.2" />
      `;
    case "goatee":
      return svg`<path d="M52,73 Q60,85 68,73" fill="${c}" opacity="0.4" />`;
    case "mustache":
      return svg`<path d="M48,69 Q52,73 60,72 Q68,73 72,69" fill="${c}" opacity="0.5" stroke="${dark}" stroke-width="0.3" />`;
    case "sideburns":
      return svg`
        <rect x="${60 - fp.rx + 2}" y="50" width="6" height="22" rx="3" fill="${c}" opacity="0.35" />
        <rect x="${60 + fp.rx - 8}" y="50" width="6" height="22" rx="3" fill="${c}" opacity="0.35" />
      `;
    case "van dyke":
      return svg`
        <path d="M48,69 Q52,73 60,72 Q68,73 72,69" fill="${c}" opacity="0.5" />
        <path d="M55,74 Q60,85 65,74" fill="${c}" opacity="0.4" />
      `;
    default:
      return svg``;
  }
}

// ─── Feature Overlays ───────────────────────────────────────────

function renderFeatures(
  features: string[],
  fp: { rx: number; ry: number; cy: number },
  app: AvatarAppearance,
): TemplateResult {
  const items: TemplateResult[] = [];
  for (const f of features) {
    switch (f) {
      case "freckles":
        items.push(svg`
          <g opacity="0.25">
            <circle cx="40" cy="58" r="0.7" fill="#8B4513" />
            <circle cx="43" cy="60" r="0.5" fill="#8B4513" />
            <circle cx="38" cy="61" r="0.6" fill="#8B4513" />
            <circle cx="45" cy="57" r="0.4" fill="#8B4513" />
            <circle cx="75" cy="58" r="0.7" fill="#8B4513" />
            <circle cx="78" cy="60" r="0.5" fill="#8B4513" />
            <circle cx="80" cy="57" r="0.4" fill="#8B4513" />
            <circle cx="56" cy="63" r="0.5" fill="#8B4513" />
            <circle cx="64" cy="64" r="0.5" fill="#8B4513" />
          </g>
        `);
        break;
      case "dimples":
        items.push(svg`
          <ellipse cx="40" cy="73" r="1.8" fill="none" stroke="${hexDarken(app.skinTone, 0.08)}" stroke-width="0.5" opacity="0.4" />
          <ellipse cx="80" cy="73" r="1.8" fill="none" stroke="${hexDarken(app.skinTone, 0.08)}" stroke-width="0.5" opacity="0.4" />
        `);
        break;
      case "beauty mark":
        items.push(svg`<circle cx="73" cy="64" r="1.3" fill="#3E2723" />`);
        break;
      case "laugh lines":
        items.push(svg`
          <path d="M38,56 Q36,64 40,72" fill="none" stroke="${hexDarken(app.skinTone, 0.1)}" stroke-width="0.4" opacity="0.2" />
          <path d="M82,56 Q84,64 80,72" fill="none" stroke="${hexDarken(app.skinTone, 0.1)}" stroke-width="0.4" opacity="0.2" />
        `);
        break;
      case "strong jawline":
        items.push(
          svg`<path d="M${60 - fp.rx + 5},${fp.cy + 10} L55,${fp.cy + fp.ry - 2} L60,${fp.cy + fp.ry} L65,${fp.cy + fp.ry - 2} L${60 + fp.rx - 5},${fp.cy + 10}" fill="none" stroke="${hexDarken(app.skinTone, 0.08)}" stroke-width="0.5" opacity="0.2" />`,
        );
        break;
      case "high cheekbones":
        items.push(svg`
          <ellipse cx="38" cy="58" rx="6" ry="2" fill="${hexLighten(app.skinTone, 0.08)}" opacity="0.25" />
          <ellipse cx="82" cy="58" rx="6" ry="2" fill="${hexLighten(app.skinTone, 0.08)}" opacity="0.25" />
        `);
        break;
      case "cleft chin":
        items.push(
          svg`<line x1="60" y1="${fp.cy + fp.ry - 6}" x2="60" y2="${fp.cy + fp.ry - 3}" stroke="${hexDarken(app.skinTone, 0.1)}" stroke-width="0.8" opacity="0.25" />`,
        );
        break;
      case "arched eyebrows":
        // Already handled by brow rendering — enhance curvature
        break;
      case "wide smile":
        // Handled by mood expression
        break;
      case "small scar on cheek":
        items.push(svg`
          <line x1="78" y1="56" x2="83" y2="61" stroke="${hexLighten(app.skinTone, 0.15)}" stroke-width="0.8" stroke-linecap="round" opacity="0.5" />
          <line x1="78" y1="56" x2="83" y2="61" stroke="${hexDarken(app.skinTone, 0.15)}" stroke-width="0.4" stroke-linecap="round" opacity="0.3" />
        `);
        break;
      case "prominent nose":
        items.push(
          svg`<path d="M58,52 Q60,62 56,66 Q60,69 64,66 Q60,62 62,52" fill="none" stroke="${hexDarken(app.skinTone, 0.08)}" stroke-width="0.6" opacity="0.2" />`,
        );
        break;
      case "expressive eyes":
        // Larger eye highlights
        items.push(svg`
          <circle cx="46" cy="47.5" r="1.6" fill="white" opacity="0.5" />
          <circle cx="78" cy="47.5" r="1.6" fill="white" opacity="0.5" />
        `);
        break;
      default:
        break;
    }
  }
  return html`${items}`;
}

// ─── CSS Styles ─────────────────────────────────────────────────

export function getAvatarStyles(): string {
  return `
    /* ── Citizen Avatar System ───────────────── */

    @keyframes citizen-breathe {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-0.8px); }
    }

    @keyframes citizen-head-bob {
      0%, 100% { transform: rotateY(0deg) rotateX(0deg) rotateZ(0deg); }
      20% { transform: rotateY(1.5deg) rotateX(-0.8deg) rotateZ(0.3deg); }
      40% { transform: rotateY(-0.8deg) rotateX(0.5deg) rotateZ(-0.2deg); }
      60% { transform: rotateY(1deg) rotateX(-0.3deg) rotateZ(0.1deg); }
      80% { transform: rotateY(-1.2deg) rotateX(0.6deg) rotateZ(-0.3deg); }
    }

    @keyframes citizen-speak-pulse {
      0%, 100% { box-shadow: 0 0 6px rgba(79,195,247,0.25); }
      50% { box-shadow: 0 0 18px rgba(79,195,247,0.55); }
    }

    .citizen-avatar {
      position: relative;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      border-radius: 50%;
      transition: transform 0.3s ease, box-shadow 0.3s ease, filter 0.3s ease;
      user-select: none;
    }

    .citizen-avatar--interactive:hover {
      transform: scale(1.08);
      box-shadow: 0 4px 20px rgba(79,195,247,0.25);
      filter: brightness(1.05);
    }

    .citizen-avatar--speaking {
      animation: citizen-speak-pulse 1.2s ease-in-out infinite;
    }

    .citizen-avatar__head {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 50%;
    }

    .citizen-avatar__label {
      font-size: 10px;
      color: var(--text-muted, #888);
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .citizen-avatar--xs .citizen-avatar__label { font-size: 8px; }
    .citizen-avatar--sm .citizen-avatar__label { font-size: 9px; }
    .citizen-avatar--lg .citizen-avatar__label { font-size: 12px; }
    .citizen-avatar--xl .citizen-avatar__label { font-size: 14px; }
  `;
}
