/**
 * n8n Orchestrator Engine
 *
 * Central orchestration layer that extends the existing N8nBridge:
 * - Seeds workflow templates on first boot (idempotent)
 * - Routes tasks to n8n workflows or falls back to agent loop
 * - Monitors execution progress and streams to Intelligence Bus
 * - Records results in citizen memory
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { getN8nBridge } from "./n8n-bridge.js";
import {
  WORKFLOW_TEMPLATES,
  type WorkflowCategory,
  listTemplateSummaries,
  getWorkflowTemplate,
} from "./n8n-workflow-templates.js";

const log = createSubsystemLogger("republic/n8n-orchestrator");

// ─── Types ──────────────────────────────────────────────────────

export interface TaskRouteResult {
  routed: boolean;
  target: "n8n" | "agent-loop" | "none";
  workflowId?: string;
  executionId?: string;
  reason: string;
}

export interface ExecutionMonitorResult {
  id: string;
  status: "running" | "success" | "error" | "waiting" | "unknown";
  startedAt?: string;
  stoppedAt?: string;
  data?: unknown;
}

interface SeededWorkflow {
  templateId: string;
  n8nWorkflowId: string;
  seededAt: number;
}

// ─── State ──────────────────────────────────────────────────────

const seededWorkflows = new Map<string, SeededWorkflow>();
let seedComplete = false;

// ─── Intent Detection ───────────────────────────────────────────

/** Map user intent keywords to workflow categories */
const INTENT_MAP: Array<{ keywords: string[]; category: WorkflowCategory }> = [
  {
    keywords: ["web app", "full-stack", "react", "next.js", "api", "website", "webapp", "frontend", "backend", "crud"],
    category: "full-stack-app",
  },
  {
    keywords: ["image", "video", "animation", "render", "comfyui", "stable diffusion", "generate image"],
    category: "media-production",
  },
  {
    keywords: ["music", "song", "audio", "beat", "melody", "sound", "mix", "master"],
    category: "music-production",
  },
  {
    keywords: ["powerpoint", "pptx", "docx", "pdf", "presentation", "document", "slide", "report"],
    category: "document-generation",
  },
  {
    keywords: ["3d", "blender", "three.js", "game", "model", "mesh", "animation 3d", "glb", "gltf"],
    category: "3d-production",
  },
  {
    keywords: ["research", "analyze", "scrape", "crawl", "investigate", "report on", "find out"],
    category: "research-analysis",
  },
  {
    keywords: ["test", "debug", "fix", "qa", "bug", "error", "lint", "validate"],
    category: "qa-debugging",
  },
  {
    keywords: ["write", "story", "article", "blog", "content", "novel", "script", "essay"],
    category: "story-writing",
  },
  {
    keywords: ["logo", "design", "ui", "mockup", "brand", "graphic", "icon", "banner"],
    category: "graphics-design",
  },
  {
    keywords: ["deploy", "docker", "ci/cd", "pipeline", "kubernetes", "devops", "infra", "monitoring"],
    category: "devops-deploy",
  },
  {
    keywords: ["data", "etl", "csv", "sql", "ml", "train", "predict", "analytics", "machine learning"],
    category: "data-pipeline",
  },
  {
    keywords: ["team", "multi-agent", "collaborate", "project", "sprint", "agile"],
    category: "multi-agent-collab",
  },
  {
    keywords: ["trending", "in-demand", "market research", "opportunity", "discover", "trend", "what's hot", "emerging", "startup idea"],
    category: "autonomous-discovery",
  },
  {
    keywords: ["full product", "product lifecycle", "build a product", "branding", "logo and website", "marketing material",
      "sales training", "identity", "brand guide", "end to end", "complete product", "startup", "fintech", "saas product"],
    category: "full-product-lifecycle",
  },
];

/**
 * Detect workflow category from user intent text.
 */
export function detectWorkflowCategory(intent: string): WorkflowCategory | null {
  const lower = intent.toLowerCase();

  // Score each category by keyword matches
  let bestCategory: WorkflowCategory | null = null;
  let bestScore = 0;

  for (const mapping of INTENT_MAP) {
    let score = 0;
    for (const kw of mapping.keywords) {
      if (lower.includes(kw)) {
        score += kw.split(" ").length; // Multi-word matches score higher
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = mapping.category;
    }
  }

  return bestScore > 0 ? bestCategory : null;
}

// ─── Seed Workflows ─────────────────────────────────────────────

/**
 * Idempotently deploy all workflow templates to n8n.
 * Checks existing workflows by name to avoid duplicates.
 */
export async function seedWorkflows(): Promise<{
  seeded: number;
  skipped: number;
  errors: string[];
}> {
  const bridge = getN8nBridge();
  const stats = { seeded: 0, skipped: 0, errors: [] as string[] };

  if (!bridge.isAvailable) {
    log.info("n8n not available — skipping workflow seeding");
    return stats;
  }

  // Get existing workflows to avoid duplicates
  const existing = await bridge.listWorkflows(true);
  const existingNames = new Set(existing.map((w) => w.name));

  for (const template of WORKFLOW_TEMPLATES) {
    const wfName = template.workflow.name;

    if (existingNames.has(wfName)) {
      // Already seeded — map the existing workflow ID
      const existingWf = existing.find((w) => w.name === wfName);
      if (existingWf) {
        seededWorkflows.set(template.id, {
          templateId: template.id,
          n8nWorkflowId: existingWf.id,
          seededAt: Date.now(),
        });
      }
      stats.skipped++;
      continue;
    }

    try {
      const created = await bridge.createWorkflow({
        name: wfName,
        nodes: template.workflow.nodes as unknown[],
        connections: template.workflow.connections,
        active: false, // Created inactive — user activates when ready
      });

      if (created) {
        seededWorkflows.set(template.id, {
          templateId: template.id,
          n8nWorkflowId: created.id,
          seededAt: Date.now(),
        });
        stats.seeded++;
        log.info(`Seeded workflow: ${wfName} → ${created.id}`);
      } else {
        stats.errors.push(`Failed to create: ${wfName}`);
      }
    } catch (err) {
      const msg = `Error seeding ${wfName}: ${err instanceof Error ? err.message : String(err)}`;
      stats.errors.push(msg);
      log.warn(msg);
    }
  }

  seedComplete = true;
  log.info(`Workflow seeding complete: ${stats.seeded} seeded, ${stats.skipped} skipped, ${stats.errors.length} errors`);
  return stats;
}

// ─── Task Routing ───────────────────────────────────────────────

/**
 * Smart router: determines whether to use an n8n workflow or fall back to agent loop.
 *
 * Priority:
 * 1. If intent matches a seeded workflow → route to n8n
 * 2. If n8n is available but no matching workflow → create from template → route
 * 3. If n8n unavailable → fall back to agent loop
 */
export async function routeTask(
  intent: string,
  payload?: Record<string, unknown>,
): Promise<TaskRouteResult> {
  const bridge = getN8nBridge();

  // Check n8n availability
  if (!bridge.isAvailable) {
    return {
      routed: false,
      target: "agent-loop",
      reason: "n8n is not available — falling back to agent loop",
    };
  }

  // Detect category
  const category = detectWorkflowCategory(intent);
  if (!category) {
    return {
      routed: false,
      target: "agent-loop",
      reason: `No matching workflow category for intent: "${intent.substring(0, 100)}"`,
    };
  }

  // Find seeded workflow for this category
  const template = WORKFLOW_TEMPLATES.find((t) => t.category === category);
  if (!template) {
    return {
      routed: false,
      target: "agent-loop",
      reason: `No template for category: ${category}`,
    };
  }

  const seeded = seededWorkflows.get(template.id);
  if (!seeded) {
    // Template exists but not seeded yet — try seeding now
    if (!seedComplete) {
      await seedWorkflows();
    }
    const retrySeeded = seededWorkflows.get(template.id);
    if (!retrySeeded) {
      return {
        routed: false,
        target: "agent-loop",
        reason: `Workflow not seeded: ${template.name}`,
      };
    }
    return triggerSeededWorkflow(retrySeeded, intent, payload);
  }

  return triggerSeededWorkflow(seeded, intent, payload);
}

async function triggerSeededWorkflow(
  seeded: SeededWorkflow,
  intent: string,
  payload?: Record<string, unknown>,
): Promise<TaskRouteResult> {
  const bridge = getN8nBridge();

  try {
    const result = await bridge.triggerWorkflow(seeded.n8nWorkflowId, {
      task: intent,
      ...payload,
    });

    return {
      routed: true,
      target: "n8n",
      workflowId: seeded.n8nWorkflowId,
      executionId: result.executionId,
      reason: `Routed to n8n workflow ${seeded.templateId} (execution: ${result.executionId})`,
    };
  } catch (err) {
    return {
      routed: false,
      target: "agent-loop",
      reason: `n8n trigger failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Execution Monitoring ───────────────────────────────────────

/**
 * Poll execution status from n8n.
 */
export async function monitorExecution(executionId: string): Promise<ExecutionMonitorResult> {
  const bridge = getN8nBridge();

  if (!bridge.isAvailable) {
    return { id: executionId, status: "unknown" };
  }

  try {
    const history = await bridge.getExecutionHistory({ limit: 50 });
    const exec = history.find((e) => e.id === executionId);

    if (!exec) {
      return { id: executionId, status: "unknown" };
    }

    return {
      id: executionId,
      status: exec.status as ExecutionMonitorResult["status"],
      startedAt: exec.startedAt,
      stoppedAt: exec.stoppedAt ?? undefined,
    };
  } catch {
    return { id: executionId, status: "unknown" };
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

/**
 * Get orchestrator diagnostics for the dashboard.
 */
export function getOrchestratorDiagnostics(): {
  seedComplete: boolean;
  seededCount: number;
  templateCount: number;
  seededWorkflows: Array<{ templateId: string; n8nWorkflowId: string }>;
  availableCategories: string[];
} {
  return {
    seedComplete,
    seededCount: seededWorkflows.size,
    templateCount: WORKFLOW_TEMPLATES.length,
    seededWorkflows: Array.from(seededWorkflows.values()).map(({ templateId, n8nWorkflowId }) => ({
      templateId,
      n8nWorkflowId,
    })),
    availableCategories: WORKFLOW_TEMPLATES.map((t) => t.category),
  };
}

// ─── Re-exports for convenience ─────────────────────────────────

export { listTemplateSummaries, getWorkflowTemplate };
