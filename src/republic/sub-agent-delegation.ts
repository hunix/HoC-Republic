/**
 * Sub-Agent Delegation
 *
 * Enables the coordinator agent to delegate tasks to specialized sub-agents
 * running in dedicated sandbox containers. Each sub-agent has focused tools
 * and a tailored system prompt for its domain.
 *
 * Architecture:
 *   Coordinator (Claude Sonnet) → Plan → Delegate sub-tasks
 *     ├─> exec sandbox: coding, building, file operations
 *     ├─> playwright sandbox: browser automation, scraping
 *     ├─> comfyui sandbox: image/video generation
 *     └─> ml sandbox: model training, inference
 */

import {
  type SpecializedSandbox,
  selectSandboxForTask,
  execInSandbox,
  startSpecializedSandbox,
  isSandboxTypeRunning,
} from "./multi-sandbox.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("sub-agent");

// ─── Sub-Task Definition ────────────────────────────────────────

export interface SubTask {
  id: string;
  title: string;
  description: string;
  sandboxType: SpecializedSandbox;
  commands: string[];          // Shell commands to execute
  expectedOutput?: string;     // What we expect the sub-task to produce
  dependsOn?: string[];        // IDs of sub-tasks this depends on
  timeout?: number;            // Timeout in seconds (default: 300)
}

export interface SubTaskResult {
  id: string;
  sandboxType: SpecializedSandbox;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface DelegationPlan {
  projectName: string;
  description: string;
  subTasks: SubTask[];
}

// ─── Delegation Engine ──────────────────────────────────────────

/**
 * Execute a delegation plan — runs independent sub-tasks in parallel,
 * respects dependencies for sequential execution.
 */
export async function executeDelegationPlan(
  plan: DelegationPlan,
  onProgress?: (msg: string) => void,
): Promise<SubTaskResult[]> {
  const results = new Map<string, SubTaskResult>();
  const completed = new Set<string>();
  const pending = new Set(plan.subTasks.map(t => t.id));

  onProgress?.(`📋 **Delegation Plan**: ${plan.projectName}\n${plan.subTasks.length} sub-tasks across ${new Set(plan.subTasks.map(t => t.sandboxType)).size} sandboxes\n`);

  // Start required sandboxes
  const requiredTypes = new Set(plan.subTasks.map(t => t.sandboxType));
  for (const type of requiredTypes) {
    if (!isSandboxTypeRunning(type)) {
      onProgress?.(`🔧 Starting ${type} sandbox...\n`);
      await startSpecializedSandbox(type);
    }
  }

  // Execute with dependency resolution
  while (pending.size > 0) {
    // Find tasks whose dependencies are all completed
    const ready = plan.subTasks.filter(t =>
      pending.has(t.id) &&
      (!t.dependsOn || t.dependsOn.every(dep => completed.has(dep)))
    );

    if (ready.length === 0 && pending.size > 0) {
      logger.error("Deadlock detected in delegation plan — circular dependencies?");
      break;
    }

    // Execute ready tasks in parallel
    const promises = ready.map(async (task) => {
      const start = Date.now();
      onProgress?.(`▶ [${task.sandboxType}] ${task.title}\n`);

      try {
        let combinedOutput = "";
        for (const command of task.commands) {
          const result = await execInSandbox(task.sandboxType, command, task.timeout ?? 300);
          combinedOutput += result.stdout;
          if (result.stderr) {
            combinedOutput += `\nSTDERR: ${result.stderr}`;
          }
          if (!result.ok) {
            throw new Error(`Command failed: ${command}\n${result.stderr}`);
          }
        }

        const subtaskResult: SubTaskResult = {
          id: task.id,
          sandboxType: task.sandboxType,
          success: true,
          output: combinedOutput.slice(-5000), // Last 5KB
          durationMs: Date.now() - start,
        };
        results.set(task.id, subtaskResult);
        onProgress?.(`✅ [${task.sandboxType}] ${task.title} — ${Math.round(subtaskResult.durationMs / 1000)}s\n`);
        return subtaskResult;
      } catch (e) {
        const subtaskResult: SubTaskResult = {
          id: task.id,
          sandboxType: task.sandboxType,
          success: false,
          output: "",
          error: e instanceof Error ? e.message : String(e),
          durationMs: Date.now() - start,
        };
        results.set(task.id, subtaskResult);
        onProgress?.(`❌ [${task.sandboxType}] ${task.title} — ${subtaskResult.error?.slice(0, 200)}\n`);
        return subtaskResult;
      }
    });

    await Promise.all(promises);

    // Mark completed
    for (const task of ready) {
      completed.add(task.id);
      pending.delete(task.id);
    }
  }

  const allResults = Array.from(results.values());
  const successCount = allResults.filter(r => r.success).length;
  onProgress?.(`\n📊 **Results**: ${successCount}/${allResults.length} sub-tasks succeeded\n`);

  return allResults;
}

/**
 * Parse a natural language task breakdown from the Claude coordinator
 * into a structured delegation plan.
 */
export function parseDelegationPlan(rawPlan: string, projectName: string): DelegationPlan {
  // Try JSON first
  try {
    const parsed = JSON.parse(rawPlan);
    if (parsed.subTasks && Array.isArray(parsed.subTasks)) {
      return {
        projectName,
        description: parsed.description || projectName,
        subTasks: parsed.subTasks.map((t: Record<string, unknown>, i: number) => ({
          id: (t.id as string) || `task-${i}`,
          title: (t.title as string) || `Sub-task ${i + 1}`,
          description: (t.description as string) || "",
          sandboxType: selectSandboxForTask((t.description as string) || (t.title as string) || ""),
          commands: (t.commands as string[]) || [],
          expectedOutput: (t.expectedOutput as string) || undefined,
          dependsOn: (t.dependsOn as string[]) || undefined,
          timeout: (t.timeout as number) || 300,
        })),
      };
    }
  } catch {
    // Not JSON, try to parse structured text
  }

  // Fallback: treat as a single task
  return {
    projectName,
    description: rawPlan,
    subTasks: [{
      id: "task-1",
      title: projectName,
      description: rawPlan,
      sandboxType: selectSandboxForTask(rawPlan),
      commands: [],
      timeout: 300,
    }],
  };
}
