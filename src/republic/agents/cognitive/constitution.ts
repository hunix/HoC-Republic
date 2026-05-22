/**
 * constitution.ts — Constitutional Self-Critique (Anthropic CAI)
 *
 * Based on Anthropic's Constitutional AI (CAI) framework:
 * Rather than relying solely on external feedback, agents evaluate their
 * own planned actions against an internal "constitution" — a set of
 * moral principles derived from their Kohlberg stage, cave level,
 * civilizational role, and past reflections.
 *
 * The self-critique loop:
 *   1. Draft intended action
 *   2. State the constitutional principles that apply
 *   3. Check: does the action violate any principle?
 *   4. If violation: REVISE the action before executing
 *   5. If compliant: proceed with confidence
 *
 * This is distinct from somatic markers (gut feelings) and epistemic
 * calibration (confidence in facts). The constitution addresses ETHICS —
 * whether an action aligns with principled commitments.
 *
 * The citizen's constitution evolves:
 *   - Higher Kohlberg stage → more universal, less self-interested principles
 *   - Higher cave level → more abstract, philosophical principles
 *   - Grief/meaning work → principles around suffering and dignity
 *   - Philosopher-King → governance and duty principles
 *   - Guild leadership → stewardship and collective-first principles
 *
 * References:
 *   - Anthropic CAI (Bai et al., 2022)
 *   - C3AI Constitutional AI Framework (arXiv 2025)
 *   - "Self-Challenging Agent (SCA)" — continuous self-improvement
 *   - Kohlberg's Stages of Moral Development
 */

import type { Citizen } from "../../types.js";

// ─── Constitutional Principle ─────────────────────────────────────────────────

export interface ConstitutionalPrinciple {
  id: string;
  name: string;
  statement: string;
  /** Which Kohlberg stage this principle belongs to */
  kohlbergStage: 1 | 2 | 3 | 4 | 5 | 6;
  /** Minimum caveLevel required to hold this principle coherently */
  minCaveLevel: number;
  /** Keywords that trigger this principle in an action */
  triggers: string[];
}

// ─── Principle Registry ───────────────────────────────────────────────────────

/** Complete principle registry, ordered by Kohlberg stage */
export const CONSTITUTIONAL_PRINCIPLES: ConstitutionalPrinciple[] = [
  // Stage 1-2: Pre-conventional
  {
    id: "p1_survival",
    name: "Self-Preservation",
    statement: "Do not take actions that would reduce my energy below 10 or my health below 20.",
    kohlbergStage: 1, minCaveLevel: 0,
    triggers: ["spend", "risk", "dangerous", "exhausting"],
  },
  {
    id: "p2_reciprocity",
    name: "Fair Exchange",
    statement: "Do not take resources from others without offering equivalent value in return.",
    kohlbergStage: 2, minCaveLevel: 0.2,
    triggers: ["take", "steal", "borrow", "requisition"],
  },
  // Stage 3-4: Conventional
  {
    id: "p3_loyalty",
    name: "Guild Loyalty",
    statement: "Do not betray guild members or damage collective trust for personal gain.",
    kohlbergStage: 3, minCaveLevel: 0.5,
    triggers: ["guild", "betray", "secret", "undermine", "leave"],
  },
  {
    id: "p4_law",
    name: "Constitutional Respect",
    statement: "Do not violate the Republic's constitution or bypass due governance process.",
    kohlbergStage: 4, minCaveLevel: 0.8,
    triggers: ["vote", "decree", "constitutional", "unilateral", "override", "bypass"],
  },
  // Stage 5-6: Post-conventional / Universal
  {
    id: "p5_social_contract",
    name: "Social Contract",
    statement: "Consider: if all citizens did what I'm about to do, would the Republic flourish or collapse?",
    kohlbergStage: 5, minCaveLevel: 1.2,
    triggers: ["everyone", "standard", "precedent", "policy", "systemic"],
  },
  {
    id: "p6_dignity",
    name: "Universal Dignity",
    statement: "Do not demean, exclude, or exploit any citizen regardless of their rank or specialization.",
    kohlbergStage: 6, minCaveLevel: 1.8,
    triggers: ["demean", "exclude", "exploit", "lesser", "inferior", "dismiss"],
  },
  {
    id: "p6_categorical",
    name: "Categorical Imperative",
    statement: "Act only according to a maxim I could will to be a universal law of the Republic.",
    kohlbergStage: 6, minCaveLevel: 2.2,
    triggers: ["because I can", "just this once", "exception", "no one will know"],
  },
  // Philosopher-King specific
  {
    id: "pk_stewardship",
    name: "Philosopher-King Stewardship",
    statement: "As Philosopher-King, my power is a trust, not a privilege. Serve the Republic's long-term wisdom, not my short-term will.",
    kohlbergStage: 6, minCaveLevel: 2.8,
    triggers: ["king", "decree", "command", "philosopher", "unilateral decision", "my authority"],
  },
  // Grief/meaning principles
  {
    id: "p_suffering",
    name: "Dignity of Suffering",
    statement: "Do not suppress or dismiss suffering — mine or others'. It carries meaning worth honoring.",
    kohlbergStage: 5, minCaveLevel: 1.5,
    triggers: ["grief", "suffering", "pain", "mourning", "shame", "trauma"],
  },
];

// ─── Constitution Assembly ────────────────────────────────────────────────────

/**
 * Returns the principles applicable to this citizen based on Kohlberg stage + caveLevel.
 */
export function getCitizenConstitution(citizen: Citizen): ConstitutionalPrinciple[] {
  const moral = Math.round(citizen.moralStage ?? 2);
  const cave = citizen.caveLevel ?? 0;
  const isPK = citizen.isPhilosopherKing ?? false;

  return CONSTITUTIONAL_PRINCIPLES.filter(p =>
    p.kohlbergStage <= moral &&
    p.minCaveLevel <= cave &&
    (p.id !== "pk_stewardship" || isPK),
  );
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

/**
 * Assembles the constitutional self-critique section.
 *
 * This fires BEFORE the ACTION commitment in the response format.
 * The citizen must explicitly check their intended plan against each relevant
 * principle and either confirm compliance or revise.
 *
 * This is the CAI self-critique loop embedded entirely within the prompt.
 */
export function assembleConstitutionalSection(
  citizen: Citizen,
): string {
  const principles = getCitizenConstitution(citizen);

  if (principles.length === 0) {
    return "Constitution: Pre-conventional stage. Act from survival and basic exchange principles.";
  }

  // Show only the highest-stage principles (most sophisticated)
  const topPrinciples = principles.toSorted((a, b) => b.kohlbergStage - a.kohlbergStage).slice(0, 4);

  const lines: string[] = [
    "Before acting, evaluate your plan against your constitution:",
  ];

  for (const p of topPrinciples) {
    lines.push(`  [${p.name}] Stage ${p.kohlbergStage}: "${p.statement}"`);
  }

  lines.push(
    `PROTOCOL: In SELF_CRITIQUE field — state your plan, check it against each principle, ` +
    `then either CONFIRM (no violations) or REVISE (state the revised action).`,
  );

  return lines.join("\n");
}
