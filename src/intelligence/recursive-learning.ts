import { createSubsystemLogger } from "../logging/subsystem.js";
import type { Citizen, RepublicState } from "../republic/types.js";
import { recordCognitiveEvent } from "../republic/republic-db.js";
import { ts, uid } from "../republic/utils.js";

const logger = createSubsystemLogger("recursive-learning");

export interface CurriculumRewriteResult {
  citizenId: string;
  originalDirectives: string[];
  newDirectives: string[];
  diagnosedFlaw: string;
  timestamp: string;
}

/**
 * Project Recursion: The Autonomous Curriculum Architect.
 * Scans a citizen's action history for persistent failure modes and
 * actively rewrites their internal prompt directives to avoid repeating them.
 */
export function synthesizeNewDirectives(citizen: Citizen, _state: RepublicState): CurriculumRewriteResult | null {
  const recentActions = (citizen.actionHistory ?? []).slice(-15);
  const failures = recentActions.filter((a) => !a.success);
  
  // Need a statistically significant sample of failures to rewrite prompt
  if (failures.length < 5) {
    return null;
  }

  // Identify the most common failing tool/concept
  const failureCounts = new Map<string, number>();
  for (const f of failures) {
    if (f.tool) {
      failureCounts.set(f.tool, (failureCounts.get(f.tool) || 0) + 1);
    }
  }

  let dominantFailureTool = "";
  let highestCount = 0;
  for (const [tool, count] of failureCounts.entries()) {
    if (count > highestCount) {
      highestCount = count;
      dominantFailureTool = tool;
    }
  }

  // If the failure isn't concentrated, it's just general chaos (no specific directive to write)
  if (highestCount < 3 || !dominantFailureTool) {
    return null;
  }

  logger.info(`Synthesizing new directive for ${citizen.name} due to ${highestCount} failures on '${dominantFailureTool}'`);

  const currentDirectives = citizen.dynamicDirectives || [];
  
  // MIT-inspired Recursive Self-Improvement logic:
  // Instead of just "don't do X", frame it as a positive exploration bound.
  const newDirective = `Avoid executing '${dominantFailureTool}' without verifying preconditions. Fallback to observation or alternative tools to gather more context before mutating state.`;

  // Prevent duplicate directives
  if (currentDirectives.includes(newDirective)) {
    return null;
  }

  // Keep max 5 dynamic directives so the context window isn't blown out
  const nextDirectives = [...currentDirectives, newDirective].slice(-5);
  citizen.dynamicDirectives = nextDirectives;

  const result: CurriculumRewriteResult = {
    citizenId: citizen.id,
    originalDirectives: currentDirectives,
    newDirectives: nextDirectives,
    diagnosedFlaw: `Persistent blindspot identified on tool: ${dominantFailureTool}`,
    timestamp: ts()
  };

  // Record this massive cognitive evolution in the DB so it appears in the UI
  recordCognitiveEvent(citizen.id, {
    id: `rcrsn-${uid()}`,
    citizenId: citizen.id,
    curiosityScore: 0,
    reflectionSummary: `RECURSIVE OVERRIDE: ${result.diagnosedFlaw}`,
    explorationSuggestions: [],
    newLessons: 1,
    memoriesConsolidated: 1,
    breakdown: {
      unexploredDomainRatio: 0,
      knowledgeGaps: 1, // Represents closing a gap
      recentFailures: highestCount,
      daysSinceDiscovery: 0,
      intelligenceBoost: 5 // Prompt rewriting massively boosts effective intelligence
    },
    timestamp: Date.now()
  });

  return result;
}
