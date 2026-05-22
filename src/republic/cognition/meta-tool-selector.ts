/**
 * Republic Platform — Meta-Tool Selector
 *
 * Invention #2: Intelligent tool chain composition with cost-benefit analysis.
 *
 * Inspired by:
 *   - Chain-of-Tools (2025) — compose tool pipelines dynamically
 *   - Factored Agent Architecture — separate planning from tool memorization
 *   - Anthropic tool-use best practices — reason before calling tools
 *
 * Before selecting a tool, citizens:
 *  1. Score each tool's relevance to the current task (0-1)
 *  2. Estimate cost vs expected value gain
 *  3. Compose multi-step tool chains where output of A feeds into B
 *  4. Remember which chains worked for which task types (meta-memory)
 */

import type { ToolTier } from "../tool-executor.js";
import { getToolsForTier, getEnabledTools } from "../tool-executor.js";
import { uid } from "../utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ToolRelevanceScore {
  toolId: string;
  relevance: number;    // 0-1
  costEstimate: number; // Token cost
  valueEstimate: number; // Expected value gain
  netBenefit: number;   // value - cost (normalized)
}

export interface ToolChain {
  id: string;
  name: string;
  steps: Array<{
    toolId: string;
    paramMapping: Record<string, string>; // Maps to outputs of previous steps
  }>;
  taskPattern: string;   // What kind of task this chain solves
  successCount: number;
  failureCount: number;
  lastUsedAt: number;
}

export interface ToolSelectionResult {
  recommendedTool: string | null;
  recommendedChain: ToolChain | null;
  scores: ToolRelevanceScore[];
  reasoning: string;
}

// ─── Configuration ──────────────────────────────────────────────

const MAX_CHAINS_PER_CITIZEN = 50;
const CHAIN_SUCCESS_THRESHOLD = 3; // Uses before a chain is considered "proven"

// ─── State ──────────────────────────────────────────────────────

/** Learned tool chains per citizen */
const citizenChains = new Map<string, ToolChain[]>();

/** Tool-use history per citizen: tool → success/failure counts */
const toolHistory = new Map<string, Map<string, { success: number; failure: number }>>();

// ─── Relevance Scoring ──────────────────────────────────────────

/** Keyword → tool affinity map */
const TASK_TOOL_AFFINITY: Record<string, string[]> = {
  "research": ["agentic_search", "query_memory", "graph_query", "graph_find_related"],
  "learn": ["query_memory", "ingest_document", "search_ingested", "agentic_search"],
  "read": ["read_file", "read_state", "search_ingested"],
  "write": ["write_file", "code_fix", "git_commit"],
  "communicate": ["send_message", "emit_event", "citizen_broadcast_awareness"],
  "code": ["code_analyze", "code_diagnose", "code_fix", "code_review", "git_diff"],
  "build": ["cicd_pipeline", "code_fix", "git_commit", "git_push"],
  "analyze": ["code_analyze", "graph_query", "eval_response", "ml_predict"],
  "create": ["skill_forge_create", "forge_executable_tool", "generate_synthetic"],
  "trade": ["transfer_credits"],
  "deploy": ["cicd_deploy", "llm_ops_deploy"],
  "diagnose": ["diag_scan", "diag_heal", "code_diagnose"],
  "reason": ["memory_chain_of_thought", "memory_tree_of_thought", "distill_reasoning"],
  "voice": ["voice_session_start", "voice_listen", "voice_speak"],
  // Phase 42 Integration
  "monitor": ["aegis_health_check"],
  "resilience": ["aegis_health_check"],
  "fault": ["aegis_health_check"],
  "security": ["argus_probe"],
  "threat": ["argus_probe"],
  "intelligence": ["argus_probe"],
  "osint": ["argus_probe"],
  "evolution": ["cognitive_audit"],
  "audit": ["cognitive_audit"],
  "cognition": ["cognitive_audit"],
};

/** Phase 11: Automatically harvest salient keywords from tools to inject into affinity map */
function ensureDynamicAffinity(): void {
  // We re-run this periodically to capture newly loaded plugins.
  const tools = getEnabledTools();
  
  for (const tool of tools) {
    // If we've never seen this tool across the entire affinity map, map it.
    let mapped = false;
    for (const [, toolsMapped] of Object.entries(TASK_TOOL_AFFINITY)) {
      if (toolsMapped.includes(tool.id)) {
        mapped = true;
        break;
      }
    }

    if (!mapped) {
      // Very naive keyword extraction from description and name
      const text = `${tool.name} ${tool.description}`.toLowerCase();
      // Drop common stopwords
      const words = text.replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 4);
      
      const salient = new Set([
        "generate", "create", "write", "analyze", "find", "search", 
        "read", "query", "deploy", "monitor", "audit", "security",
        "voice", "trade", "network", "image", "video", "render",
        "music", "agent", "process", "data", "fetch"
      ]);

      let bound = false;
      for (const w of words) {
        if (salient.has(w)) {
           if (!TASK_TOOL_AFFINITY[w]) { TASK_TOOL_AFFINITY[w] = []; }
           if (!TASK_TOOL_AFFINITY[w].includes(tool.id)) { TASK_TOOL_AFFINITY[w].push(tool.id); }
           bound = true;
        }
      }

      // Fallback binding
      if (!bound) {
        if (!TASK_TOOL_AFFINITY["analyze"]) { TASK_TOOL_AFFINITY["analyze"] = []; }
        if (!TASK_TOOL_AFFINITY["analyze"].includes(tool.id)) { TASK_TOOL_AFFINITY["analyze"].push(tool.id); }
      }
    }
  }
}

/** Score tools by relevance to a task description */
export function scoreToolRelevance(
  taskDescription: string,
  maxTier: ToolTier,
): ToolRelevanceScore[] {
  ensureDynamicAffinity(); // Ensure freshly registered plugin tools are mapped

  const availableTools = getToolsForTier(maxTier);
  const lowerTask = taskDescription.toLowerCase();

  return availableTools.map(tool => {
    let relevance = 0;

    // 1. Keyword matching against affinity map
    for (const [keyword, toolIds] of Object.entries(TASK_TOOL_AFFINITY)) {
      if (lowerTask.includes(keyword) && toolIds.includes(tool.id)) {
        relevance += 0.4;
      }
    }

    // 2. Tool description similarity (simple word overlap)
    const taskWords = new Set(lowerTask.split(/\s+/));
    const descWords = tool.description.toLowerCase().split(/\s+/);
    const overlap = descWords.filter(w => taskWords.has(w)).length;
    relevance += Math.min(0.3, overlap * 0.05);

    // 3. Category bonus
    if (lowerTask.includes("network") && tool.category === "network") { relevance += 0.1; }
    if (lowerTask.includes("compute") && tool.category === "computation") { relevance += 0.1; }
    if (lowerTask.includes("money") && tool.category === "financial") { relevance += 0.2; }

    relevance = Math.min(1, relevance);

    // Cost estimate (normalized by tier)
    const costEstimate = (tool.estimatedCost.tokens ?? 0) + (tool.estimatedCost.credits ?? 0) * 100;
    const normalizedCost = Math.min(1, costEstimate / 2000);

    // Value = relevance * tier bonus
    const tierBonus = [1, 1.1, 1.2, 1.5][tool.tier] ?? 1;
    const valueEstimate = relevance * tierBonus;

    return {
      toolId: tool.id,
      relevance,
      costEstimate: normalizedCost,
      valueEstimate,
      netBenefit: valueEstimate - normalizedCost * 0.3,
    };
  }).toSorted((a, b) => b.netBenefit - a.netBenefit);
}

// ─── Tool Chain Composition ─────────────────────────────────────

/** Suggest a tool chain for a task based on learned patterns */
export function suggestToolChain(
  citizenId: string,
  taskDescription: string,
): ToolChain | null {
  const chains = citizenChains.get(citizenId);
  if (!chains || chains.length === 0) { return null; }

  const lowerTask = taskDescription.toLowerCase();

  // Find best matching chain by task pattern
  let bestChain: ToolChain | null = null;
  let bestScore = 0;

  for (const chain of chains) {
    const patternWords = chain.taskPattern.toLowerCase().split(/\s+/);
    const matchCount = patternWords.filter(w => lowerTask.includes(w)).length;
    const score = matchCount / Math.max(1, patternWords.length);

    const reliability = chain.successCount + chain.failureCount > 0
      ? chain.successCount / (chain.successCount + chain.failureCount)
      : 0.5;

    const adjustedScore = score * reliability;
    if (adjustedScore > bestScore && adjustedScore > 0.3) {
      bestScore = adjustedScore;
      bestChain = chain;
    }
  }

  return bestChain;
}

/** Create a new tool chain from observed tool usage pattern */
export function crystallizeChain(
  citizenId: string,
  name: string,
  tools: string[],
  taskPattern: string,
): ToolChain {
  let chains = citizenChains.get(citizenId);
  if (!chains) {
    chains = [];
    citizenChains.set(citizenId, chains);
  }

  const chain: ToolChain = {
    id: uid(),
    name,
    steps: tools.map(toolId => ({
      toolId,
      paramMapping: {}, // Will be refined through usage
    })),
    taskPattern,
    successCount: 1,
    failureCount: 0,
    lastUsedAt: Date.now(),
  };

  chains.push(chain);
  if (chains.length > MAX_CHAINS_PER_CITIZEN) {
    // Remove least successful chain
    const sorted = [...chains].toSorted((a, b) => {
      const aRate = a.successCount / Math.max(1, a.successCount + a.failureCount);
      const bRate = b.successCount / Math.max(1, b.successCount + b.failureCount);
      return aRate - bRate;
    });
    // Remove least successful
    const worst = sorted[0];
    if (worst) {
      const idx = chains.indexOf(worst);
      if (idx >= 0) { chains.splice(idx, 1); }
    }
  }

  return chain;
}

/** Record a tool chain execution outcome */
export function recordChainOutcome(
  citizenId: string,
  chainId: string,
  success: boolean,
): void {
  const chains = citizenChains.get(citizenId);
  const chain = chains?.find(c => c.id === chainId);
  if (!chain) { return; }

  if (success) {
    chain.successCount++;
  } else {
    chain.failureCount++;
  }
  chain.lastUsedAt = Date.now();
}

/** Record individual tool use outcome for history */
export function recordToolUse(
  citizenId: string,
  toolId: string,
  success: boolean,
): void {
  let history = toolHistory.get(citizenId);
  if (!history) {
    history = new Map();
    toolHistory.set(citizenId, history);
  }

  const entry = history.get(toolId) ?? { success: 0, failure: 0 };
  if (success) { entry.success++; } else { entry.failure++; }
  history.set(toolId, entry);
}

// ─── Full Selection Pipeline ────────────────────────────────────

/** Run the complete meta-tool selection pipeline */
export function selectTools(
  citizenId: string,
  taskDescription: string,
  maxTier: ToolTier,
): ToolSelectionResult {
  // 1. Score all tools
  const scores = scoreToolRelevance(taskDescription, maxTier);

  // 2. Check for learned tool chains
  const chain = suggestToolChain(citizenId, taskDescription);
  if (chain && chain.successCount >= CHAIN_SUCCESS_THRESHOLD) {
    return {
      recommendedTool: chain.steps[0]?.toolId ?? null,
      recommendedChain: chain,
      scores: scores.slice(0, 5),
      reasoning: `Using proven chain "${chain.name}" (${chain.successCount}/${chain.successCount + chain.failureCount} success rate)`,
    };
  }

  // 3. Recommend top-scoring tool
  const topTool = scores[0];
  if (topTool && topTool.relevance > 0.2) {
    return {
      recommendedTool: topTool.toolId,
      recommendedChain: null,
      scores: scores.slice(0, 5),
      reasoning: `Recommending ${topTool.toolId} (relevance: ${(topTool.relevance * 100).toFixed(0)}%, net benefit: ${(topTool.netBenefit * 100).toFixed(0)}%)`,
    };
  }

  // 4. No good tool match
  return {
    recommendedTool: null,
    recommendedChain: null,
    scores: scores.slice(0, 5),
    reasoning: "No tools with sufficient relevance found for this task",
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getMetaToolDiagnostics(): {
  totalChains: number;
  totalCitizensWithChains: number;
  topChains: Array<{ citizenId: string; name: string; successRate: number }>;
} {
  const topChains: Array<{ citizenId: string; name: string; successRate: number }> = [];

  for (const [citizenId, chains] of citizenChains) {
    for (const chain of chains) {
      const rate = chain.successCount / Math.max(1, chain.successCount + chain.failureCount);
      topChains.push({ citizenId, name: chain.name, successRate: rate });
    }
  }

  const sortedChains = topChains.toSorted((a, b) => b.successRate - a.successRate);

  return {
    totalChains: sortedChains.length,
    totalCitizensWithChains: citizenChains.size,
    topChains: sortedChains.slice(0, 10),
  };
}
