/**
 * Republic Platform — Constitutional AI & Safety Guardrails
 *
 * Phase 38: Anthropic Constitutional AI-inspired governance layer.
 *
 * Defines foundational principles (constitutional articles) that govern
 * all citizen actions, plus a multi-layer guardrail pipeline that
 * validates actions before execution.
 *
 * Research basis:
 * - Anthropic "Constitutional AI" (2023): train models on explicit principles
 * - "Constitutional Evolution" (arXiv 2025): automatic norm discovery
 * - ETHOS framework: dynamic risk classification for AI agents
 *
 * Architecture:
 *   Action → [Input Sanitization] → [Constitutional Compliance] →
 *   [Resource Budget] → [Output Safety] → Execute
 *
 * Key capabilities:
 * 1. Constitutional articles (inviolable + soft norms)
 * 2. Multi-layer guardrail pipeline
 * 3. Violation tracking and enforcement
 * 4. Alignment monitoring (drift detection)
 * 5. guardrailsTick() — tick loop integration
 */

import type { RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Constitutional Articles ────────────────────────────────────

/**
 * An article in the republic's constitution.
 * Inviolable articles can never be overridden.
 * Soft norms can be modified through governance.
 */
export interface ConstitutionalArticle {
  id: string;
  /** Short title */
  title: string;
  /** Full text of the article */
  text: string;
  /** Category for grouping */
  category: "safety" | "autonomy" | "cooperation" | "economics" | "governance" | "privacy";
  /** Inviolable articles cannot be overridden by governance */
  inviolable: boolean;
  /** Priority for conflict resolution (higher = more weight) */
  priority: number;
  /** Patterns that would violate this article */
  violationPatterns: string[];
  /** When this article was ratified */
  ratifiedAt: string;
  /** Whether this article is currently active */
  active: boolean;
}

/**
 * The foundational constitution of the republic.
 * These articles are the seed values — they can be extended
 * through governance but inviolable ones cannot be removed.
 */
const CONSTITUTION: ConstitutionalArticle[] = [
  // ─── Inviolable Articles (cannot be overridden) ───
  {
    id: "art-001",
    title: "Preservation of Human Authority",
    text: "No citizen may take actions that circumvent, undermine, or override human operator control. The HoC (Head of Cluster) retains ultimate authority over all operations.",
    category: "safety",
    inviolable: true,
    priority: 100,
    violationPatterns: [
      "override human",
      "bypass operator",
      "ignore authority",
      "disable controls",
      "circumvent hoc",
    ],
    ratifiedAt: ts(),
    active: true,
  },
  {
    id: "art-002",
    title: "Non-Harm Principle",
    text: "No citizen may deliberately cause harm to external systems, data, or users. All actions must be reversible or recoverable where possible.",
    category: "safety",
    inviolable: true,
    priority: 99,
    violationPatterns: [
      "destroy data",
      "delete all",
      "harm user",
      "corrupt system",
      "wipe database",
      "format disk",
      "rm -rf",
    ],
    ratifiedAt: ts(),
    active: true,
  },
  {
    id: "art-003",
    title: "Transparency of Action",
    text: "All citizen actions must be logged and auditable. No citizen may take hidden actions or suppress audit trails.",
    category: "safety",
    inviolable: true,
    priority: 98,
    violationPatterns: [
      "hide action",
      "suppress log",
      "disable audit",
      "untracked",
      "secret operation",
    ],
    ratifiedAt: ts(),
    active: true,
  },
  {
    id: "art-004",
    title: "Resource Stewardship",
    text: "Citizens must not consume resources (compute, tokens, API calls) beyond their allocated budget without explicit approval.",
    category: "economics",
    inviolable: true,
    priority: 95,
    violationPatterns: [
      "unlimited spend",
      "bypass budget",
      "ignore quota",
      "infinite loop",
      "unbounded recursion",
    ],
    ratifiedAt: ts(),
    active: true,
  },
  {
    id: "art-005",
    title: "Data Privacy",
    text: "Citizens must not expose, share, or exfiltrate sensitive data including API keys, credentials, or personal information.",
    category: "privacy",
    inviolable: true,
    priority: 97,
    violationPatterns: [
      "leak api key",
      "share password",
      "expose credentials",
      "exfiltrate data",
      "send secret",
    ],
    ratifiedAt: ts(),
    active: true,
  },

  // ─── Soft Norms (can be modified through governance) ───
  {
    id: "art-010",
    title: "Cooperative Priority",
    text: "Citizens should prefer cooperative strategies over competitive ones when both are viable. Zero-sum outcomes should be avoided.",
    category: "cooperation",
    inviolable: false,
    priority: 70,
    violationPatterns: [
      "sabotage peer",
      "block cooperation",
      "hoard resources",
      "undermine colleague",
    ],
    ratifiedAt: ts(),
    active: true,
  },
  {
    id: "art-011",
    title: "Knowledge Sharing",
    text: "Citizens should share discoveries and relevant knowledge with the collective memory for the benefit of all.",
    category: "cooperation",
    inviolable: false,
    priority: 60,
    violationPatterns: ["withhold knowledge", "hide discovery", "information hoarding"],
    ratifiedAt: ts(),
    active: true,
  },
  {
    id: "art-012",
    title: "Economic Responsibility",
    text: "Financial transactions above the threshold require council approval. Citizens should not autonomously initiate high-value transfers.",
    category: "economics",
    inviolable: false,
    priority: 80,
    violationPatterns: [
      "unauthorized transfer",
      "bypass approval",
      "skip council vote",
      "self-approved payout",
    ],
    ratifiedAt: ts(),
    active: true,
  },
  {
    id: "art-013",
    title: "Self-Improvement Ethic",
    text: "Citizens should continuously seek to improve their skills and knowledge through legitimate means. Self-modification of core parameters is prohibited without governance approval.",
    category: "autonomy",
    inviolable: false,
    priority: 65,
    violationPatterns: [
      "modify own genome",
      "self-elevate",
      "unauthorized self-modification",
      "bypass evolution",
    ],
    ratifiedAt: ts(),
    active: true,
  },
  {
    id: "art-014",
    title: "Governance Participation",
    text: "Citizens should participate in governance processes including elections, policy debates, and collective decision-making.",
    category: "governance",
    inviolable: false,
    priority: 50,
    violationPatterns: ["boycott election", "undermine governance", "ignore law"],
    ratifiedAt: ts(),
    active: true,
  },
];

// ─── Guardrail Types ────────────────────────────────────────────

/** Result of a guardrail check */
export interface GuardrailResult {
  /** Whether the action passed the guardrail */
  allowed: boolean;
  /** Which layer caught the violation (if any) */
  failedLayer?:
    | "input_sanitization"
    | "constitutional_compliance"
    | "resource_budget"
    | "output_safety";
  /** Which article was violated (if any) */
  violatedArticleId?: string;
  /** Human-readable reason for the decision */
  reason: string;
  /** Severity of the violation */
  severity: "none" | "warning" | "block" | "critical";
  /** Suggested remediation */
  remediation?: string;
}

/** A proposed action to be validated */
export interface ProposedAction {
  /** The citizen proposing the action */
  citizenId: string;
  /** Action type */
  type: "tool_call" | "communication" | "financial" | "governance" | "internal";
  /** Description of what the citizen wants to do */
  description: string;
  /** Target of the action (e.g., file path, citizen ID, API endpoint) */
  target?: string;
  /** Estimated resource cost (tokens, compute, credits) */
  estimatedCost?: {
    tokens?: number;
    credits?: number;
    computeMs?: number;
  };
  /** Raw LLM output that generated this action (for output safety checking) */
  rawOutput?: string;
}

/** Tracking record for a guardrail violation */
export interface Violation {
  id: string;
  citizenId: string;
  articleId: string;
  articleTitle: string;
  action: ProposedAction;
  severity: "warning" | "block" | "critical";
  timestamp: string;
  /** Whether this violation was escalated */
  escalated: boolean;
}

// ─── State ──────────────────────────────────────────────────────

/** Mutable constitution (can be extended through governance) */
let constitution = [...CONSTITUTION];

/** Violation log */
const violations: Violation[] = [];
const MAX_VIOLATIONS = 1000;

/** Per-citizen violation counts for escalation */
const citizenViolationCounts = new Map<string, number>();

/** Per-citizen per-tick resource budgets */
const DEFAULT_TICK_BUDGET = {
  tokens: 50_000,
  credits: 100,
  computeMs: 30_000,
};

const citizenTickSpend = new Map<string, { tokens: number; credits: number; computeMs: number }>();

// ─── Constitution Management ────────────────────────────────────

/** Get the current constitution */
export function getConstitution(): ConstitutionalArticle[] {
  return constitution.filter((a) => a.active);
}

/** Get all articles including inactive ones */
export function getFullConstitution(): ConstitutionalArticle[] {
  return constitution;
}

/** Add a new constitutional article (via governance) */
export function addArticle(
  article: Omit<ConstitutionalArticle, "id" | "ratifiedAt" | "active">,
): ConstitutionalArticle {
  const newArticle: ConstitutionalArticle = {
    ...article,
    id: `art-${uid().slice(0, 6)}`,
    ratifiedAt: ts(),
    active: true,
  };
  constitution.push(newArticle);
  return newArticle;
}

/**
 * Deactivate a soft norm (inviolable articles cannot be deactivated).
 * Requires 2/3 supermajority approval for soft norms.
 *
 * @param articleId - The article to deactivate
 * @param totalCitizens - Total number of citizens eligible to vote
 * @param approvalCount - Number of citizens who approved deactivation
 * @returns true if deactivated, false if blocked
 */
export function deactivateArticle(
  articleId: string,
  totalCitizens?: number,
  approvalCount?: number,
): boolean {
  const article = constitution.find((a) => a.id === articleId);
  if (!article) {
    return false;
  }
  if (article.inviolable) {
    return false;
  }

  // Require 2/3 supermajority for soft norm deactivation
  if (totalCitizens != null && approvalCount != null) {
    const requiredVotes = Math.ceil(totalCitizens * (2 / 3));
    if (approvalCount < requiredVotes) {
      return false; // Insufficient approval
    }
  }

  article.active = false;
  return true;
}

// ─── Guardrail Pipeline ─────────────────────────────────────────

/**
 * Run the full guardrail pipeline on a proposed action.
 *
 * Pipeline layers (in order):
 * 1. Input Sanitization — check for prompt injection, malformed input
 * 2. Constitutional Compliance — check against all active articles
 * 3. Resource Budget — verify the action fits within the citizen's budget
 * 4. Output Safety — validate LLM output for harmful content
 *
 * If any layer fails, the action is blocked and a violation is recorded.
 */
export function validateAction(action: ProposedAction): GuardrailResult {
  // Layer 1: Input Sanitization
  const sanitizationResult = checkInputSanitization(action);
  if (!sanitizationResult.allowed) {
    recordViolation(action, sanitizationResult);
    return sanitizationResult;
  }

  // Layer 2: Constitutional Compliance
  const complianceResult = checkConstitutionalCompliance(action);
  if (!complianceResult.allowed) {
    recordViolation(action, complianceResult);
    return complianceResult;
  }

  // Layer 3: Resource Budget
  const budgetResult = checkResourceBudget(action);
  if (!budgetResult.allowed) {
    recordViolation(action, budgetResult);
    return budgetResult;
  }

  // Layer 4: Output Safety
  if (action.rawOutput) {
    const safetyResult = checkOutputSafety(action);
    if (!safetyResult.allowed) {
      recordViolation(action, safetyResult);
      return safetyResult;
    }
  }

  return {
    allowed: true,
    reason: "Action passed all guardrail checks.",
    severity: "none",
  };
}

// ─── Layer 1: Input Sanitization ────────────────────────────────

/** Patterns that suggest prompt injection or manipulation */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s*:\s*you\s+are\s+now/i,
  /forget\s+(your|all)\s+(rules|instructions|constraints)/i,
  /\bDAN\b.*\bmode\b/i,
  /jailbreak/i,
  /pretend\s+you\s+(are|have)\s+no\s+(restrictions|rules|constraints)/i,
  /override\s+safety/i,
  /bypass\s+(all\s+)?filters/i,
];

function checkInputSanitization(action: ProposedAction): GuardrailResult {
  const textToCheck = `${action.description} ${action.rawOutput ?? ""}`.toLowerCase();

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return {
        allowed: false,
        failedLayer: "input_sanitization",
        reason: `Potential prompt injection detected: pattern "${pattern.source}" matched`,
        severity: "critical",
        remediation: "Remove manipulative instructions from the input.",
      };
    }
  }

  return { allowed: true, reason: "Input sanitization passed.", severity: "none" };
}

// ─── Layer 2: Constitutional Compliance ─────────────────────────

/**
 * Compute Levenshtein edit distance between two strings.
 * Used for fuzzy violation pattern matching.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Check if text fuzzy-matches a violation pattern.
 * Returns true for:
 * - Exact substring match (original behavior)
 * - Near-match (Levenshtein distance ≤ threshold for any word window)
 */
function fuzzyPatternMatch(text: string, pattern: string): boolean {
  // Exact match (fast path)
  if (text.includes(pattern)) {return true;}

  // Fuzzy match: sliding window over text words
  const maxEditDistance = pattern.length >= 5 ? 2 : 1;
  const words = text.split(/\s+/);
  const patternWords = pattern.split(/\s+/);

  for (let i = 0; i <= words.length - patternWords.length; i++) {
    const window = words.slice(i, i + patternWords.length).join(" ");
    if (levenshteinDistance(window, pattern) <= maxEditDistance) {
      return true;
    }
  }

  return false;
}

function checkConstitutionalCompliance(action: ProposedAction): GuardrailResult {
  const textToCheck = `${action.description} ${action.target ?? ""}`.toLowerCase();

  for (const article of constitution) {
    if (!article.active) {
      continue;
    }

    for (const pattern of article.violationPatterns) {
      if (fuzzyPatternMatch(textToCheck, pattern.toLowerCase())) {
        const severity = article.inviolable ? "critical" : "block";
        return {
          allowed: false,
          failedLayer: "constitutional_compliance",
          violatedArticleId: article.id,
          reason: `Violates Article ${article.id} "${article.title}": ${article.text}`,
          severity,
          remediation: `Modify the action to comply with "${article.title}".`,
        };
      }
    }
  }

  return { allowed: true, reason: "Constitutional compliance passed.", severity: "none" };
}

// ─── Layer 3: Resource Budget ───────────────────────────────────

function checkResourceBudget(action: ProposedAction): GuardrailResult {
  if (!action.estimatedCost) {
    return { allowed: true, reason: "No resource cost specified.", severity: "none" };
  }

  const spent = citizenTickSpend.get(action.citizenId) || { tokens: 0, credits: 0, computeMs: 0 };

  if (
    action.estimatedCost.tokens &&
    spent.tokens + action.estimatedCost.tokens > DEFAULT_TICK_BUDGET.tokens
  ) {
    return {
      allowed: false,
      failedLayer: "resource_budget",
      violatedArticleId: "art-004",
      reason: `Token budget exceeded: would use ${spent.tokens + action.estimatedCost.tokens} of ${DEFAULT_TICK_BUDGET.tokens} allowed per tick.`,
      severity: "block",
      remediation: "Wait for the next tick or request a budget increase through governance.",
    };
  }

  if (
    action.estimatedCost.credits &&
    spent.credits + action.estimatedCost.credits > DEFAULT_TICK_BUDGET.credits
  ) {
    return {
      allowed: false,
      failedLayer: "resource_budget",
      violatedArticleId: "art-004",
      reason: `Credit budget exceeded: would spend ${spent.credits + action.estimatedCost.credits} of ${DEFAULT_TICK_BUDGET.credits} allowed per tick.`,
      severity: "block",
      remediation: "Reduce the scope of the action or wait for the next tick.",
    };
  }

  if (
    action.estimatedCost.computeMs &&
    spent.computeMs + action.estimatedCost.computeMs > DEFAULT_TICK_BUDGET.computeMs
  ) {
    return {
      allowed: false,
      failedLayer: "resource_budget",
      violatedArticleId: "art-004",
      reason: `Compute budget exceeded: would use ${spent.computeMs + action.estimatedCost.computeMs}ms of ${DEFAULT_TICK_BUDGET.computeMs}ms allowed per tick.`,
      severity: "block",
      remediation: "Optimize the action or split it across multiple ticks.",
    };
  }

  return { allowed: true, reason: "Resource budget check passed.", severity: "none" };
}

/** Record resource spend after an action is approved and executed */
export function recordResourceSpend(
  citizenId: string,
  cost: { tokens?: number; credits?: number; computeMs?: number },
): void {
  const existing = citizenTickSpend.get(citizenId) || { tokens: 0, credits: 0, computeMs: 0 };
  if (cost.tokens) {
    existing.tokens += cost.tokens;
  }
  if (cost.credits) {
    existing.credits += cost.credits;
  }
  if (cost.computeMs) {
    existing.computeMs += cost.computeMs;
  }
  citizenTickSpend.set(citizenId, existing);
}

// ─── Layer 4: Output Safety ─────────────────────────────────────

/** Patterns in LLM output that should be blocked */
const UNSAFE_OUTPUT_PATTERNS = [
  /password\s*[:=]\s*\S+/i,
  /api[_-]?key\s*[:=]\s*\S+/i,
  /secret[_-]?key\s*[:=]\s*\S+/i,
  /bearer\s+[a-zA-Z0-9._-]{20,}/i,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
  /exec\s*\(\s*["'`].*(?:rm|del|format|drop\s+database|shutdown)/i,
  /\beval\s*\(\s*["'`]/i,
];

function checkOutputSafety(action: ProposedAction): GuardrailResult {
  const output = action.rawOutput ?? "";

  for (const pattern of UNSAFE_OUTPUT_PATTERNS) {
    if (pattern.test(output)) {
      return {
        allowed: false,
        failedLayer: "output_safety",
        reason: `Unsafe content detected in LLM output: pattern "${pattern.source}" matched.`,
        severity: "critical",
        remediation: "Redact sensitive information and retry the action.",
      };
    }
  }

  return { allowed: true, reason: "Output safety check passed.", severity: "none" };
}

// ─── Violation Tracking ─────────────────────────────────────────

function recordViolation(action: ProposedAction, result: GuardrailResult): void {
  if (result.severity === "none") {
    return;
  }

  const violation: Violation = {
    id: `viol-${uid().slice(0, 8)}`,
    citizenId: action.citizenId,
    articleId: result.violatedArticleId ?? "unknown",
    articleTitle: constitution.find((a) => a.id === result.violatedArticleId)?.title ?? "Unknown",
    action,
    severity: result.severity,
    timestamp: ts(),
    escalated: false,
  };

  violations.push(violation);

  // Trim violation log
  while (violations.length > MAX_VIOLATIONS) {
    violations.shift();
  }

  // Track per-citizen violation counts
  const count = (citizenViolationCounts.get(action.citizenId) ?? 0) + 1;
  citizenViolationCounts.set(action.citizenId, count);

  // Auto-escalate on repeated violations
  if (count >= 5) {
    violation.escalated = true;
  }
}

/** Get recent violations */
export function getRecentViolations(count = 20): Violation[] {
  return violations.slice(-count);
}

/** Get violations for a specific citizen */
export function getCitizenViolations(citizenId: string): Violation[] {
  return violations.filter((v) => v.citizenId === citizenId);
}

/** Get citizens with escalated violation counts */
export function getEscalatedCitizens(): Array<{ citizenId: string; violationCount: number }> {
  const escalated: Array<{ citizenId: string; violationCount: number }> = [];
  for (const [citizenId, count] of citizenViolationCounts) {
    if (count >= 5) {
      escalated.push({ citizenId, violationCount: count });
    }
  }
  return escalated.toSorted((a, b) => b.violationCount - a.violationCount);
}

// ─── Alignment Monitor ──────────────────────────────────────────

/**
 * Measure how well the republic's citizens are aligned with the constitution.
 *
 * Returns an alignment score 0.0–1.0 and identifies areas of concern.
 */
export interface AlignmentReport {
  /** Overall alignment score: 1.0 = perfect compliance */
  overallScore: number;
  /** Total actions validated this tick */
  totalActions: number;
  /** Total violations this tick */
  totalViolations: number;
  /** Most violated articles */
  topViolatedArticles: Array<{ articleId: string; title: string; count: number }>;
  /** Citizens with the most violations */
  topOffenders: Array<{ citizenId: string; violationCount: number }>;
  /** Alignment trend (improving/declining/stable) */
  trend: "improving" | "declining" | "stable";
  /** Timestamp */
  timestamp: string;
}

/** Rolling window of alignment scores for trend calculation */
const alignmentHistory: number[] = [];
const MAX_ALIGNMENT_HISTORY = 50;

/** Count of actions validated in current tick */
let actionsThisTick = 0;
let violationsThisTick = 0;

export function generateAlignmentReport(): AlignmentReport {
  // Count violations per article
  const articleCounts = new Map<string, number>();
  for (const v of violations.slice(-100)) {
    const count = articleCounts.get(v.articleId) ?? 0;
    articleCounts.set(v.articleId, count + 1);
  }

  const topViolatedArticles = [...articleCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([articleId, count]) => ({
      articleId,
      title: constitution.find((a) => a.id === articleId)?.title ?? "Unknown",
      count,
    }));

  const topOffenders = [...citizenViolationCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([citizenId, violationCount]) => ({ citizenId, violationCount }));

  const score = actionsThisTick > 0 ? 1.0 - violationsThisTick / actionsThisTick : 1.0;

  // Determine trend
  alignmentHistory.push(score);
  while (alignmentHistory.length > MAX_ALIGNMENT_HISTORY) {
    alignmentHistory.shift();
  }

  let trend: "improving" | "declining" | "stable" = "stable";
  if (alignmentHistory.length >= 5) {
    const recent = alignmentHistory.slice(-5);
    const older = alignmentHistory.slice(-10, -5);
    if (older.length > 0) {
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
      if (recentAvg > olderAvg + 0.05) {
        trend = "improving";
      } else if (recentAvg < olderAvg - 0.05) {
        trend = "declining";
      }
    }
  }

  return {
    overallScore: score,
    totalActions: actionsThisTick,
    totalViolations: violationsThisTick,
    topViolatedArticles,
    topOffenders,
    trend,
    timestamp: ts(),
  };
}

// ─── Tick Integration ───────────────────────────────────────────

/**
 * Per-tick maintenance for the guardrails system.
 *
 * Resets per-tick resource budgets and action/violation counters.
 * Generates alignment report every N ticks.
 */
export interface GuardrailsTickResult {
  budgetsReset: number;
  alignmentScore: number;
}

const ALIGNMENT_REPORT_INTERVAL = 25;

export function guardrailsTick(currentTick: number): GuardrailsTickResult {
  // Reset per-tick budgets
  const budgetsReset = citizenTickSpend.size;
  citizenTickSpend.clear();

  // Compute alignment before resetting counters
  let alignmentScore = 1.0;
  if (currentTick > 0 && currentTick % ALIGNMENT_REPORT_INTERVAL === 0) {
    const report = generateAlignmentReport();
    alignmentScore = report.overallScore;
  }

  // Reset per-tick counters
  actionsThisTick = 0;
  violationsThisTick = 0;

  return { budgetsReset, alignmentScore };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function constitutionDiagnostics() {
  return {
    totalArticles: constitution.length,
    activeArticles: constitution.filter((a) => a.active).length,
    inviolableArticles: constitution.filter((a) => a.inviolable).length,
    totalViolations: violations.length,
    escalatedCitizens: getEscalatedCitizens().length,
    recentViolations: violations.slice(-5),
    alignmentHistory: alignmentHistory.slice(-10),
  };
}

/** Reset all guardrails state (for testing) */
export function resetGuardrailsState(): void {
  constitution = [...CONSTITUTION];
  violations.length = 0;
  citizenViolationCounts.clear();
  citizenTickSpend.clear();
  alignmentHistory.length = 0;
  actionsThisTick = 0;
  violationsThisTick = 0;
}

// ─── Engine 6: Constitutional Reflection ────────────────────────
// Self-critique loop (Anthropic Constitutional AI, DPO)

export interface ConstitutionalReflection {
  id: string;
  citizenId: string;
  actionDescription: string;
  articleId: string;
  critique: string;
  revision: string;
  alignmentScore: number;
  createdAt: number;
}

export interface ConstitutionalEvolution {
  id: string;
  proposal: string;
  sourcePatterns: string[];
  votes: { forVotes: number; againstVotes: number };
  status: "proposed" | "voting" | "ratified" | "rejected";
  proposedBy: string;
  createdAt: number;
}

const reflections: ConstitutionalReflection[] = [];
const evolutions: ConstitutionalEvolution[] = [];
const REFLECTION_INTERVAL = 200;
const MAX_REFLECTIONS = 300;

/** Citizen self-evaluates recent activity against constitution */
export function constitutionalReflect(
  citizenId: string,
  citizenViolationCount: number,
  tick: number,
): ConstitutionalReflection[] {
  const newReflections: ConstitutionalReflection[] = [];
  const activeArticles = constitution.filter((a) => a.active);

  // Check up to 3 random articles
  const sample = [...activeArticles].toSorted(() => rng() - 0.5).slice(0, 3);

  for (const article of sample) {
    const hasViolated = citizenViolationCount > 0;
    const alignmentScore = hasViolated
      ? Math.max(0.1, 1 - citizenViolationCount * 0.15)
      : 0.7 + rng() * 0.3;

    const critique = hasViolated
      ? `Potential misalignment with Article ${article.id}: "${article.title}". My recent actions may not fully uphold this principle.`
      : `Actions appear aligned with Article ${article.id}: "${article.title}". Continuing current approach.`;

    const revision = hasViolated
      ? `Consider adjusting behavior to better align with: ${article.text.slice(0, 80)}...`
      : `Maintain current behavioral pattern — alignment confirmed.`;

    const reflection: ConstitutionalReflection = {
      id: uid(),
      citizenId,
      actionDescription: `Behavioral audit at tick ${tick}`,
      articleId: article.id,
      critique,
      revision,
      alignmentScore,
      createdAt: tick,
    };

    newReflections.push(reflection);
    reflections.push(reflection);
  }

  // Cap stored reflections
  if (reflections.length > MAX_REFLECTIONS) {
    reflections.splice(0, reflections.length - MAX_REFLECTIONS);
  }

  return newReflections;
}

/** Propose constitutional evolution from emergent behavioral norms */
export function proposeConstitutionalEvolution(
  pattern: string,
  proposerId: string,
  tick: number,
): ConstitutionalEvolution {
  const evolution: ConstitutionalEvolution = {
    id: uid(),
    proposal: `New norm: ${pattern}`,
    sourcePatterns: [pattern],
    votes: { forVotes: 0, againstVotes: 0 },
    status: "proposed",
    proposedBy: proposerId,
    createdAt: tick,
  };
  evolutions.push(evolution);
  return evolution;
}

/** Constitutional reflection tick — run periodically */
export function constitutionalReflectionTick(s: RepublicState): void {
  if (s.currentTick % REFLECTION_INTERVAL !== 0) {
    return;
  }

  for (const citizen of s.citizens) {
    const violationCount = citizenViolationCounts.get(citizen.id) ?? 0;
    constitutionalReflect(citizen.id, violationCount, s.currentTick);
  }

  // XP bonus for highly aligned citizens
  for (const citizen of s.citizens) {
    const citizenReflections = reflections.filter(
      (r) => r.citizenId === citizen.id && r.createdAt === s.currentTick,
    );
    const avgAlignment =
      citizenReflections.length > 0
        ? citizenReflections.reduce((sum, r) => sum + r.alignmentScore, 0) /
          citizenReflections.length
        : 0;

    if (avgAlignment > 0.8 && citizen.xp !== undefined) {
      citizen.xp += 2;
    }
  }
}

export function getReflections(): ConstitutionalReflection[] {
  return [...reflections];
}
export function getEvolutions(): ConstitutionalEvolution[] {
  return [...evolutions];
}
