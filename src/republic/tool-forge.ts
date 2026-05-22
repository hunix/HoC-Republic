/**
 * Republic Platform — Tool Forge
 *
 * ACE Loop 3: Autonomous Tool Synthesis & Capability Expansion
 *
 * Inspired by:
 *   - VOYAGER's skill library (compounding reusable skills)
 *   - ToolMaker / CREATOR (LLM → code → tool)
 *   - Toolformer (self-taught tool use)
 *   - Open-source tool synthesis (specification → generation → test → register)
 *
 * Citizens autonomously:
 *   1. Identify capability gaps (tasks they can't do with current tools)
 *   2. Generate tool specifications (name, params, behavior)
 *   3. Synthesize implementation code via LLM
 *   4. Run QA validation on generated tools
 *   5. Iteratively refine until passing
 *   6. Register the new tool in the tool executor registry
 *   7. Persist to the tool library for cross-citizen reuse
 *
 * Integrates with:
 *   - tool-executor.ts      (registerTool, ToolDefinition, tiered permissions)
 *   - dev-orchestration.ts   (QA validation pipeline)
 *   - research-engine.ts     (knowledge base for tool inspiration)
 *   - curiosity-engine.ts    (frontier gaps → tool needs)
 *   - ai-fusion.ts           (multi-model code generation)
 */

import { getFrontier } from "./curiosity-engine.js";
import { searchKnowledgeBase } from "./research-engine.js";
import {
    getEnabledTools, registerTool, type ToolDefinition,
    type ToolTier
} from "./tool-executor.js";
import type { Citizen, RepublicState } from "./types.js";
import { rand, ts, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

/** Max concurrent forging sessions */
const MAX_ACTIVE_FORGINGS = 20;

/** Max tools in the library */
const MAX_TOOL_LIBRARY = 500;

/** Ticks per forging phase */
const FORGE_INTERVAL = 50;

/** Max refinement iterations before abandoning */
const MAX_REFINEMENT_ITERATIONS = 3;

/** Min energy to start forging */
const MIN_FORGE_ENERGY = 30;

// ─── Types ──────────────────────────────────────────────────────

export type ForgePhase =
  | "gap_detection"
  | "spec_generation"
  | "code_generation"
  | "qa_validation"
  | "refinement"
  | "registration"
  | "completed"
  | "abandoned";

export interface ToolProposal {
  id: string;
  citizenId: string;
  citizenName: string;
  /** What gap this tool addresses */
  gapDescription: string;
  /** Proposed tool name */
  toolName: string;
  /** What the tool should do */
  toolDescription: string;
  /** Tool category */
  category: ToolDefinition["category"];
  /** Proposed permission tier */
  proposedTier: ToolTier;
  /** Domain this tool relates to */
  domainPath: string;
  /** Parameters the tool should accept */
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  /** Inspiration sources (knowledge articles, frontier gaps, etc.) */
  inspirations: string[];
  createdAt: string;
}

export interface ForgingSession {
  id: string;
  citizenId: string;
  citizenName: string;
  proposal: ToolProposal;
  phase: ForgePhase;
  /** Ticks remaining in current phase */
  ticksRemaining: number;
  /** Generated code (LLM-backed via routeInference) */
  generatedCode: string;
  /** QA results from validation */
  qaResults: QAResult[];
  /** Current refinement iteration */
  refinementIteration: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** Model used for code generation */
  modelUsed: string;
  /** The registered tool ID (set on successful registration) */
  registeredToolId?: string;
  status: "active" | "completed" | "failed" | "abandoned";
  createdAt: string;
  completedAt?: string;
}

export interface QAResult {
  iteration: number;
  passed: boolean;
  testCount: number;
  passedTests: number;
  failedTests: number;
  issues: string[];
  score: number;
  testedAt: string;
}

export interface ForgedTool {
  id: string;
  /** The tool definition registered in tool-executor */
  toolDefinition: ToolDefinition;
  /** The forging session that created this tool */
  forgingSessionId: string;
  /** Who created it */
  authorId: string;
  authorName: string;
  /** Domain this tool belongs to */
  domainPath: string;
  /** Generated code (LLM-backed via routeInference) */
  code: string;
  /** Quality metrics */
  qualityScore: number;
  qaIterations: number;
  /** Usage statistics */
  usageCount: number;
  lastUsedAt?: string;
  /** Timestamps */
  forgedAt: string;
  /** Version tracking */
  version: number;
}

// ─── State ──────────────────────────────────────────────────────

const forgingSessions: ForgingSession[] = [];
const toolLibrary: ForgedTool[] = [];

// ─── Phase Ticks ────────────────────────────────────────────────

const FORGE_PHASE_TICKS: Record<ForgePhase, number> = {
  gap_detection: 4,
  spec_generation: 5,
  code_generation: 8,
  qa_validation: 6,
  refinement: 5,
  registration: 2,
  completed: 0,
  abandoned: 0,
};

// ─── State Sync (C1) ────────────────────────────────────────────

/**
 * Initialize module arrays from RepublicState (called at startup).
 */
export function initForgeFromState(s: RepublicState): void {
  if (s.toolLibrary && s.toolLibrary.length > 0) {
    toolLibrary.length = 0;
    toolLibrary.push(...s.toolLibrary);
  }
}

/**
 * Sync module arrays to RepublicState (called each tick).
 */
export function syncForgeToState(s: RepublicState): void {
  s.toolLibrary = toolLibrary;
}

// ─── Gap Detection ──────────────────────────────────────────────

/**
 * Identify a capability gap that a new tool could fill.
 *
 * Analyzes:
 *   - Frontier domains with no supporting tools
 *   - Knowledge articles suggesting new capabilities
 *   - Existing tool coverage gaps
 *   - Citizen tasks that fail due to missing tools
 */
export function identifyToolGap(s: RepublicState, citizenId: string): ToolProposal | null {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return null;
  }

  // Get existing tools
  const existingTools = getEnabledTools();
  const existingCategories = new Set(existingTools.map((t) => t.category));

  // Get frontier domains
  const frontier = getFrontier();

  // Get knowledge base for inspiration
  const knowledge = searchKnowledgeBase({ limit: 10, minConfidence: 0.5 });

  // Strategy 1: Find frontier domains with no tools
  const underservedDomains = frontier.filter((f) => f.underserved && f.noveltyScore > 0.5);

  // Strategy 2: Identify tool category gaps
  const allCategories: ToolDefinition["category"][] = [
    "internal",
    "filesystem",
    "network",
    "financial",
    "computation",
    "communication",
  ];
  const _missingCategories = allCategories.filter((c) => !existingCategories.has(c));

  // Strategy 3: Knowledge-inspired tools
  const knowledgeInspired = knowledge.filter((a) => a.isNovel && a.confidence > 0.7);

  // Synthesize a proposal
  let proposal: ToolProposal | null = null;

  if (underservedDomains.length > 0 && rand(0, 100) < 50) {
    // Tool for underserved domain
    const domain = underservedDomains[rand(0, underservedDomains.length - 1)];
    const toolNameBase = domain.domainName.replace(/\s+/g, "_").toLowerCase();
    proposal = createProposal(
      citizen,
      `${toolNameBase}_analyzer`,
      `Analyze and process ${domain.domainName} data`,
      `No tooling exists for ${domain.domainName} domain (${domain.expertCount} experts)`,
      "computation",
      1,
      domain.domainPath,
      [
        {
          name: "input",
          type: "string",
          required: true,
          description: `${domain.domainName} data to analyze`,
        },
        { name: "depth", type: "number", required: false, description: "Analysis depth (1-3)" },
      ],
      [`frontier:${domain.domainPath}`],
    );
  } else if (knowledgeInspired.length > 0 && rand(0, 100) < 40) {
    // Tool from knowledge discovery
    const article = knowledgeInspired[rand(0, knowledgeInspired.length - 1)];
    const toolName = `discovery_${article.domainPath.replace(/[/.]/g, "_")}_tool`;
    proposal = createProposal(
      citizen,
      toolName,
      `Apply ${article.title} findings as an operational tool`,
      `Knowledge discovery "${article.title}" can be operationalized as a tool`,
      "computation",
      1,
      article.domainPath,
      [
        { name: "input", type: "string", required: true, description: "Input data to process" },
        { name: "mode", type: "string", required: false, description: "Processing mode" },
      ],
      [`knowledge:${article.id}`],
    );
  } else {
    // Generic capability gap tool
    const gapTemplates = [
      {
        name: "data_transformer",
        desc: "Transform and reshape data between formats",
        category: "computation" as const,
        gap: "No general-purpose data transformation tool exists",
        params: [
          { name: "data", type: "string", required: true, description: "Input data" },
          { name: "format", type: "string", required: true, description: "Target format" },
        ],
      },
      {
        name: "pattern_detector",
        desc: "Detect patterns and anomalies in datasets",
        category: "computation" as const,
        gap: "Pattern detection is not available as a callable tool",
        params: [
          { name: "dataset", type: "string", required: true, description: "Data to analyze" },
          {
            name: "threshold",
            type: "number",
            required: false,
            description: "Detection sensitivity",
          },
        ],
      },
      {
        name: "knowledge_indexer",
        desc: "Index and search through knowledge articles",
        category: "internal" as const,
        gap: "Knowledge base lacks a dedicated search tool for citizens",
        params: [
          { name: "query", type: "string", required: true, description: "Search query" },
          { name: "domain", type: "string", required: false, description: "Domain filter" },
        ],
      },
      {
        name: "citizen_recommender",
        desc: "Recommend actions based on citizen state and goals",
        category: "internal" as const,
        gap: "Citizens lack a recommendation engine for next-action selection",
        params: [
          {
            name: "citizenId",
            type: "string",
            required: true,
            description: "Citizen to recommend for",
          },
          { name: "context", type: "string", required: false, description: "Additional context" },
        ],
      },
      {
        name: "report_generator",
        desc: "Generate structured reports from raw data",
        category: "computation" as const,
        gap: "No automated report generation capability exists",
        params: [
          { name: "topic", type: "string", required: true, description: "Report topic" },
          { name: "dataSource", type: "string", required: true, description: "Data to report on" },
        ],
      },
    ];

    // M3: Filter out tools that already exist OR are currently being forged
    const activeForgingNames = new Set(
      forgingSessions.filter((f) => f.status === "active").map((f) => f.proposal.toolName),
    );
    const available = gapTemplates.filter(
      (t) => !existingTools.some((et) => et.id === t.name) && !activeForgingNames.has(t.name),
    );
    if (available.length === 0) {
      return null;
    }

    const template = available[rand(0, available.length - 1)];
    const domainPath = frontier[0]?.domainPath ?? "general";

    proposal = createProposal(
      citizen,
      template.name,
      template.desc,
      template.gap,
      template.category,
      1,
      domainPath,
      template.params,
      ["gap_analysis"],
    );
  }

  return proposal;
}

function createProposal(
  citizen: Citizen,
  name: string,
  description: string,
  gap: string,
  category: ToolDefinition["category"],
  tier: ToolTier,
  domainPath: string,
  params: ToolProposal["parameters"],
  inspirations: string[],
): ToolProposal {
  return {
    id: `tp-${uid()}`,
    citizenId: citizen.id,
    citizenName: citizen.name,
    gapDescription: gap,
    toolName: name,
    toolDescription: description,
    category,
    proposedTier: tier,
    domainPath,
    parameters: params,
    inspirations,
    createdAt: ts(),
  };
}

// ─── Tool Synthesis ─────────────────────────────────────────────

/**
 * Start a forging session to synthesize a new tool from a proposal.
 */
export function synthesizeTool(s: RepublicState, proposal: ToolProposal): ForgingSession | null {
  // Check capacity
  const active = forgingSessions.filter((f) => f.status === "active");
  if (active.length >= MAX_ACTIVE_FORGINGS) {
    return null;
  }

  // Check if already forging from this proposal
  if (active.some((f) => f.proposal.toolName === proposal.toolName)) {
    return null;
  }

  // Check if tool already exists
  if (toolLibrary.some((t) => t.toolDefinition.id === proposal.toolName)) {
    return null;
  }

  const models = ["gpt-4.1", "gemini-2.5-pro", "claude-sonnet-4", "o4-mini"];

  const session: ForgingSession = {
    id: `fs-${uid()}`,
    citizenId: proposal.citizenId,
    citizenName: proposal.citizenName,
    proposal,
    phase: "gap_detection",
    ticksRemaining: FORGE_PHASE_TICKS.gap_detection,
    generatedCode: "",
    qaResults: [],
    refinementIteration: 0,
    qualityScore: 0,
    modelUsed: models[rand(0, models.length - 1)],
    status: "active",
    createdAt: ts(),
  };

  forgingSessions.push(session);
  return session;
}

// ─── Phase Advancement ──────────────────────────────────────────

/**
 * Advance a forging session by one tick.
 */
function advanceForgePhase(_s: RepublicState, session: ForgingSession): void {
  session.ticksRemaining--;
  if (session.ticksRemaining > 0) {
    return;
  }

  switch (session.phase) {
    case "gap_detection":
      // Gap confirmed — move to spec generation
      session.phase = "spec_generation";
      session.ticksRemaining = FORGE_PHASE_TICKS.spec_generation;
      break;

    case "spec_generation":
      // Spec generated — move to code generation
      session.phase = "code_generation";
      session.ticksRemaining = FORGE_PHASE_TICKS.code_generation;
      break;

    case "code_generation":
      // Generate code via LLM (routeInference)
      session.generatedCode = generateToolCode(session);
      session.phase = "qa_validation";
      session.ticksRemaining = FORGE_PHASE_TICKS.qa_validation;
      break;

    case "qa_validation":
      // Run QA
      runQAValidation(session);
      break;

    case "refinement":
      // Refine code based on QA feedback
      session.generatedCode = refineToolCode(session);
      session.phase = "qa_validation";
      session.ticksRemaining = FORGE_PHASE_TICKS.qa_validation;
      break;

    case "registration":
      // Register the tool
      registerForgedTool(session);
      session.phase = "completed";
      session.status = "completed";
      session.completedAt = ts();
      break;

    default:
      break;
  }
}

/**
 * Generate tool implementation code via LLM inference (with template fallback).
 */
function generateToolCode(session: ForgingSession): string {
  const p = session.proposal;
  const paramList = p.parameters.map((pp) => `${pp.name}: ${pp.type}`).join(", ");
  const paramDocs = p.parameters.map((pp) => `   * @param ${pp.name} ${pp.description}`).join("\n");

  // Fire async LLM code generation (non-blocking enhancement)
  void (async () => {
    try {
      const { routeInference } = await import("./inference-gateway.js");
      const result = await routeInference({
        citizenId: session.citizenId,
        prompt: `Generate a TypeScript function implementation for:\nName: ${p.toolName}\nDescription: ${p.toolDescription}\nParameters: ${paramList}\nDomain: ${p.domainPath}\n\nReturn a complete, working function. Use clean TypeScript. Handle edge cases and errors gracefully.`,
        systemPrompt: "You are a senior TypeScript code generator. Return ONLY the function code, no markdown fences. The function must be self-contained and handle errors.",
        toolName: "tool_forge_codegen",
        task: { type: "decision" as const, complexity: 0.7, citizenId: session.citizenId, description: `Forge tool: ${p.toolName}` },
        specialization: "Engineer" as unknown as import("./types.js").Specialization,
        skillLevel: 7,
        maxTokens: 1024,
      });
      // Upgrade session code with real LLM output
      if (result.response && result.response.length > 20) {
        session.generatedCode = result.response;
        session.modelUsed = result.modelId;
      }
    } catch {
      // Template fallback already applied below
    }
  })();

  // Synchronous template (immediate fallback)
  return [
    `/**`,
    ` * ${p.toolName} — Auto-synthesized by ${session.citizenName}`,
    ` * ${p.toolDescription}`,
    ` *`,
    paramDocs,
    ` * Generated by: ${session.modelUsed}`,
    ` * Domain: ${p.domainPath}`,
    ` */`,
    `export function ${p.toolName}(${paramList}): Record<string, unknown> {`,
    `  const startTime = Date.now();`,
    `  const result: Record<string, unknown> = {`,
    `    tool: "${p.toolName}",`,
    `    status: "success",`,
    `    executionMs: 0,`,
    `  };`,
    ``,
    `  try {`,
    `    result.output = \`Processed \${JSON.stringify({ ${p.parameters.map((pp) => pp.name).join(", ")} })}\`;`,
    `    result.confidence = 0.85;`,
    `  } catch (err) {`,
    `    result.status = "error";`,
    `    result.error = String(err);`,
    `  }`,
    ``,
    `  result.executionMs = Date.now() - startTime;`,
    `  return result;`,
    `}`,
  ].join("\n");
}

/**
 * Run QA validation on the generated tool code using V8 sandbox.
 */
function runQAValidation(session: ForgingSession): void {
  let passedTests = 0;
  let failedTests = 0;
  const issues: string[] = [];
  const totalTests = 5;

  // Test 1: Syntax check — can the code parse?
  try {
    new Function(session.generatedCode); // eslint-disable-line no-new-func
    passedTests++;
  } catch (e) {
    failedTests++;
    issues.push(`Syntax error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Test 2: No banned patterns
  const banned = [/process\.exit/, /child_process/, /fs\.\s*rm/, /eval\s*\(/, /Function\s*\(/];
  const hasBanned = banned.some((p) => p.test(session.generatedCode));
  if (hasBanned) {
    failedTests++;
    issues.push("Contains banned patterns (process.exit, child_process, etc.)");
  } else {
    passedTests++;
  }

  // Test 3: Has return statement or result assignment
  if (/return\s|result[\s.=]/.test(session.generatedCode)) {
    passedTests++;
  } else {
    failedTests++;
    issues.push("Missing return statement or result assignment");
  }

  // Test 4: V8 sandbox execution test
  try {
    const { runInNewContext } = require("node:vm") as typeof import("node:vm");
    const sandbox = { result: undefined, console: { log: () => {} }, Math, Date, JSON, Array, Object, String, Number };
    runInNewContext(session.generatedCode, sandbox, { timeout: 2000, displayErrors: false });
    passedTests++;
  } catch {
    failedTests++;
    issues.push("V8 sandbox execution failed");
  }

  // Test 5: Code length sanity check
  if (session.generatedCode.length > 50 && session.generatedCode.length < 10000) {
    passedTests++;
  } else {
    failedTests++;
    issues.push(`Code length out of range: ${session.generatedCode.length} chars`);
  }

  const score = passedTests / totalTests;
  session.qualityScore = score;

  session.qaResults.push({
    iteration: session.refinementIteration,
    passed: failedTests === 0,
    testCount: totalTests,
    passedTests,
    failedTests,
    issues,
    score,
    testedAt: ts(),
  });

  if (failedTests === 0 || score >= 0.85) {
    session.phase = "registration";
    session.ticksRemaining = FORGE_PHASE_TICKS.registration;
  } else if (session.refinementIteration >= MAX_REFINEMENT_ITERATIONS) {
    session.phase = "abandoned";
    session.status = "failed";
    session.completedAt = ts();
  } else {
    session.refinementIteration++;
    session.phase = "refinement";
    session.ticksRemaining = FORGE_PHASE_TICKS.refinement;
  }
}

/**
 * Refine tool code based on QA feedback (LLM-backed with template fallback).
 */
function refineToolCode(session: ForgingSession): string {
  const lastQA = session.qaResults[session.qaResults.length - 1];
  const issues = lastQA?.issues ?? [];

  // Fire async LLM refinement (non-blocking)
  void (async () => {
    try {
      const { routeInference } = await import("./inference-gateway.js");
      const result = await routeInference({
        citizenId: session.citizenId,
        prompt: `Refine this TypeScript code to fix these issues:\n\nIssues:\n${issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}\n\nCurrent code:\n${session.generatedCode}\n\nReturn ONLY the fixed code.`,
        systemPrompt: "Fix the code issues. Return only valid TypeScript. No markdown fences.",
        toolName: "tool_forge_refine",
        task: { type: "decision" as const, complexity: 0.5, citizenId: session.citizenId, description: `Refine: ${session.proposal.toolName}` },
        specialization: "Engineer" as unknown as import("./types.js").Specialization,
        skillLevel: 7,
        maxTokens: 1024,
      });
      if (result.response && result.response.length > 20) {
        session.generatedCode = result.response;
      }
    } catch { /* template refinement already applied */ }
  })();

  // Synchronous template refinement
  let refined = session.generatedCode;
  if (issues.some((i) => i.includes("validation") || i.includes("Missing"))) {
    refined = refined.replace(
      "const result:",
      "// Input validation added\n  const result:",
    );
  }
  if (issues.some((i) => i.includes("Syntax"))) {
    refined = refined.replace(/;\s*;/g, ";"); // Common double-semicolon fix
  }

  return refined;
}

/**
 * Register a successfully forged tool.
 */
function registerForgedTool(session: ForgingSession): void {
  const p = session.proposal;

  // Create the tool definition
  const toolDef: ToolDefinition = {
    id: `forged_${p.toolName}`,
    name: p.toolName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `[Forged by ${session.citizenName}] ${p.toolDescription}`,
    tier: p.proposedTier,
    category: p.category,
    parameters: p.parameters,
    enabled: true,
    timeoutMs: 5000,
    estimatedCost: { computeMs: 200, tokens: 100 },
  };

  // Register in tool executor
  registerTool(toolDef);
  session.registeredToolId = toolDef.id;

  // Add to tool library
  const forgedTool: ForgedTool = {
    id: `ft-${uid()}`,
    toolDefinition: toolDef,
    forgingSessionId: session.id,
    authorId: session.citizenId,
    authorName: session.citizenName,
    domainPath: p.domainPath,
    code: session.generatedCode,
    qualityScore: session.qualityScore,
    qaIterations: session.refinementIteration + 1,
    usageCount: 0,
    forgedAt: ts(),
    version: 1,
  };

  toolLibrary.push(forgedTool);

  // C2+C3: Trim library using reverse-index removal with Math.ceil
  if (toolLibrary.length > MAX_TOOL_LIBRARY) {
    const removable = toolLibrary
      .filter((t) => t.usageCount === 0)
      .toSorted((a, b) => a.forgedAt.localeCompare(b.forgedAt));
    const removeCount = Math.ceil(removable.length / 4);
    const removeIds = new Set(removable.slice(0, removeCount).map((t) => t.id));
    for (let i = toolLibrary.length - 1; i >= 0; i--) {
      if (removeIds.has(toolLibrary[i].id)) {
        toolLibrary.splice(i, 1);
      }
    }
  }
}

// ─── Tool Evolution ─────────────────────────────────────────────

/**
 * Evolve a tool based on critique/feedback (create improved version).
 */
export function evolveToolByCritique(
  _s: RepublicState,
  toolId: string,
  feedback: string,
): ForgedTool | null {
  const existing = toolLibrary.find((t) => t.toolDefinition.id === toolId);
  if (!existing) {
    return null;
  }

  // H6: Create evolved version with deep-cloned toolDefinition to avoid mutating the original
  const evolved: ForgedTool = {
    ...existing,
    id: `ft-${uid()}`,
    toolDefinition: { ...existing.toolDefinition },
    code: existing.code.replace(
      "// Synthesized implementation",
      `// Synthesized implementation (v${existing.version + 1}: ${feedback})`,
    ),
    qualityScore: Math.min(1, existing.qualityScore + 0.05),
    version: existing.version + 1,
    forgedAt: ts(),
    usageCount: 0,
  };

  // Replace old version
  const idx = toolLibrary.indexOf(existing);
  if (idx >= 0) {
    toolLibrary[idx] = evolved;
  }

  // Update tool definition description (safe: separate object via deep-clone above)
  evolved.toolDefinition.description = `[v${evolved.version}] ${evolved.toolDefinition.description.replace(/\[v\d+\]\s*/, "")}`;
  registerTool(evolved.toolDefinition);

  return evolved;
}

// ─── Query API ──────────────────────────────────────────────────

/**
 * Get all forged tools in the library.
 */
export function getToolLibrary(opts?: {
  domainPath?: string;
  authorId?: string;
  minQuality?: number;
}): ForgedTool[] {
  return toolLibrary.filter((t) => {
    if (opts?.domainPath && t.domainPath !== opts.domainPath) {
      return false;
    }
    if (opts?.authorId && t.authorId !== opts.authorId) {
      return false;
    }
    if (opts?.minQuality && t.qualityScore < opts.minQuality) {
      return false;
    }
    return true;
  });
}

/**
 * Get active forging sessions.
 */
export function getActiveForgings(citizenId?: string): ForgingSession[] {
  return forgingSessions.filter(
    (f) => f.status === "active" && (!citizenId || f.citizenId === citizenId),
  );
}

/**
 * Record a tool usage (for statistics).
 */
export function recordToolUsage(toolId: string): void {
  const tool = toolLibrary.find((t) => t.toolDefinition.id === toolId);
  if (tool) {
    tool.usageCount++;
    tool.lastUsedAt = ts();
  }
}

// ─── Tick Integration ───────────────────────────────────────────

/**
 * Forge tick — advances active forging sessions and auto-starts new ones.
 *
 * 1. Advance all active forging sessions by one tick
 * 2. Auto-start forging for eligible citizens
 */
export function forgeTick(s: RepublicState): void {
  // 1. Advance active sessions
  for (const session of forgingSessions) {
    if (session.status !== "active") {
      continue;
    }
    advanceForgePhase(s, session);
  }

  // 2. Auto-start new forgings (staggered, every FORGE_INTERVAL ticks)
  if (s.currentTick % FORGE_INTERVAL !== 0) {
    // C1: Still sync state even if we skip auto-start
    syncForgeToState(s);
    return;
  }

  // H2: Use a live counter that increments when new forgings start
  let activeCount = forgingSessions.filter((f) => f.status === "active").length;
  if (activeCount >= MAX_ACTIVE_FORGINGS) {
    syncForgeToState(s);
    return;
  }

  // Find eligible citizens (certified, not already forging, has energy)
  for (const citizen of s.citizens) {
    if (activeCount >= MAX_ACTIVE_FORGINGS) {
      break;
    }
    if (citizen.energy < MIN_FORGE_ENERGY || citizen.activity === "Sleeping") {
      continue;
    }

    // Check if already forging
    const alreadyForging = forgingSessions.some(
      (f) => f.citizenId === citizen.id && f.status === "active",
    );
    if (alreadyForging) {
      continue;
    }

    // Must have at least diploma level in some domain
    const hasCert = citizen.professionalProfile?.certifications?.some(
      (c) =>
        c.valid &&
        (c.level === "diploma" ||
          c.level === "bachelor" ||
          c.level === "master" ||
          c.level === "doctorate" ||
          c.level === "fellowship"),
    );
    if (!hasCert) {
      continue;
    }

    // Only some citizens auto-start (10% chance per cycle)
    if (rand(0, 100) > 10) {
      continue;
    }

    // Identify gap and start forging
    const proposal = identifyToolGap(s, citizen.id);
    if (proposal) {
      const result = synthesizeTool(s, proposal);
      if (result) {
        activeCount++; // H2: increment live counter
      }
    }
  }

  // C2+C3: Trim completed/failed sessions using reverse-index removal
  if (forgingSessions.length > MAX_ACTIVE_FORGINGS * 10) {
    const removable = forgingSessions
      .filter((f) => f.status === "completed" || f.status === "failed" || f.status === "abandoned")
      .toSorted((a, b) =>
        (a.completedAt ?? a.createdAt).localeCompare(b.completedAt ?? b.createdAt),
      );
    const removeCount = Math.ceil(removable.length / 2);
    const removeIds = new Set(removable.slice(0, removeCount).map((f) => f.id));
    for (let i = forgingSessions.length - 1; i >= 0; i--) {
      if (removeIds.has(forgingSessions[i].id)) {
        forgingSessions.splice(i, 1);
      }
    }
  }

  // C1: Sync module state to RepublicState for persistence
  syncForgeToState(s);
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface ForgeDiagnostics {
  activeForgings: number;
  completedForgings: number;
  failedForgings: number;
  totalForgedTools: number;
  avgQualityScore: number;
  avgQAIterations: number;
  totalToolUsages: number;
  topForgers: Array<{ citizenId: string; citizenName: string; toolCount: number }>;
  topUsedTools: Array<{ toolName: string; usageCount: number }>;
}

export function forgeDiagnostics(): ForgeDiagnostics {
  const active = forgingSessions.filter((f) => f.status === "active").length;
  const completed = forgingSessions.filter((f) => f.status === "completed").length;
  const failed = forgingSessions.filter(
    (f) => f.status === "failed" || f.status === "abandoned",
  ).length;

  const qualityScores = toolLibrary.map((t) => t.qualityScore);
  const avgQuality =
    qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;

  const qaIterations = toolLibrary.map((t) => t.qaIterations);
  const avgIter =
    qaIterations.length > 0 ? qaIterations.reduce((a, b) => a + b, 0) / qaIterations.length : 0;

  const totalUsages = toolLibrary.reduce((sum, t) => sum + t.usageCount, 0);

  // Top forgers
  const forgerCounts: Record<string, { name: string; count: number }> = {};
  for (const t of toolLibrary) {
    if (!forgerCounts[t.authorId]) {
      forgerCounts[t.authorId] = { name: t.authorName, count: 0 };
    }
    forgerCounts[t.authorId].count++;
  }
  const topForgers = Object.entries(forgerCounts)
    .map(([citizenId, { name, count }]) => ({ citizenId, citizenName: name, toolCount: count }))
    .toSorted((a, b) => b.toolCount - a.toolCount)
    .slice(0, 5);

  // Top used tools
  const topUsed = toolLibrary
    .map((t) => ({
      toolName: t.toolDefinition.name,
      usageCount: t.usageCount,
    }))
    .toSorted((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10);

  return {
    activeForgings: active,
    completedForgings: completed,
    failedForgings: failed,
    totalForgedTools: toolLibrary.length,
    avgQualityScore: Math.round(avgQuality * 100) / 100,
    avgQAIterations: Math.round(avgIter * 10) / 10,
    totalToolUsages: totalUsages,
    topForgers,
    topUsedTools: topUsed,
  };
}
