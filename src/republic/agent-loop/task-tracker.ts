/**
 * Task Tracker — Manus-style live TODO tracking for the agent loop.
 *
 * Creates and maintains a `/workspace/.agent-todo.md` file in the sandbox
 * that the agent writes at session start and continuously updates as
 * steps are completed. The UI renders this as a live checklist via
 * broadcaster events.
 *
 * Architecture:
 *   - Initialized from strategy decomposition phases
 *   - Each step emits formatted Markdown updates to the broadcaster
 *   - The todo file in the sandbox is kept in sync for LLM reference
 *   - On completion, writes a final summary
 */

import type { AgentBroadcaster } from "../agent-providers/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { sandboxWriteFile } from "../agent-sandbox.js";

const logger = createSubsystemLogger("task-tracker");

// ─── Types ──────────────────────────────────────────────────────

export type StepStatus = "pending" | "in-progress" | "done" | "failed" | "skipped";

export interface TrackedStep {
  id: string;
  phase: string;
  description: string;
  status: StepStatus;
  startedAt?: number;
  completedAt?: number;
  notes?: string;
}

export interface TaskTrackerSnapshot {
  taskDescription: string;
  strategy: string;
  steps: TrackedStep[];
  startedAt: number;
  completedAt?: number;
}

// ─── Status Emoji Map ───────────────────────────────────────────

const STATUS_ICON: Record<StepStatus, string> = {
  pending: "⬜",
  "in-progress": "🔄",
  done: "✅",
  failed: "❌",
  skipped: "⏭️",
};

// ─── Task Tracker ───────────────────────────────────────────────

export class TaskTracker {
  private steps: TrackedStep[];
  private taskDescription: string;
  private strategy: string;
  private startedAt: number;
  private completedAt?: number;
  private broadcaster: AgentBroadcaster;
  private lastWrittenMd = "";

  constructor(
    taskDescription: string,
    strategy: string,
    decomposition: Array<{ phase: string; description: string }>,
    broadcaster: AgentBroadcaster,
  ) {
    this.taskDescription = taskDescription.slice(0, 200);
    this.strategy = strategy;
    this.startedAt = Date.now();
    this.broadcaster = broadcaster;
    this.steps = decomposition.map((d, i) => ({
      id: `step-${i + 1}`,
      phase: d.phase,
      description: d.description,
      status: "pending" as StepStatus,
    }));
  }

  /** Initialize: write the plan to sandbox and broadcast */
  async init(): Promise<void> {
    await this.syncToSandbox();
    this.broadcastSnapshot();
  }

  /** Mark a step as in-progress */
  async startStep(phaseOrIndex: string | number): Promise<void> {
    const step = this.resolveStep(phaseOrIndex);
    if (!step || step.status === "done") {
      return;
    }
    step.status = "in-progress";
    step.startedAt = Date.now();
    this.broadcaster.send(
      `\n🔄 **Step ${this.indexOf(step) + 1}/${this.steps.length}: ${step.phase}** — ${step.description}\n`,
    );
    await this.syncToSandbox();
  }

  /** Mark a step as completed */
  async completeStep(phaseOrIndex: string | number, notes?: string): Promise<void> {
    const step = this.resolveStep(phaseOrIndex);
    if (!step) {
      return;
    }
    step.status = "done";
    step.completedAt = Date.now();
    if (notes) {
      step.notes = notes;
    }
    const durationMs = step.startedAt ? Date.now() - step.startedAt : 0;
    const durationStr = durationMs > 0 ? ` (${Math.round(durationMs / 1000)}s)` : "";
    this.broadcaster.send(
      `\n✅ **Step ${this.indexOf(step) + 1}/${this.steps.length}: ${step.phase}** — Done${durationStr}\n`,
    );
    await this.syncToSandbox();
  }

  /** Mark a step as failed */
  async failStep(phaseOrIndex: string | number, reason?: string): Promise<void> {
    const step = this.resolveStep(phaseOrIndex);
    if (!step) {
      return;
    }
    step.status = "failed";
    step.completedAt = Date.now();
    if (reason) {
      step.notes = reason;
    }
    this.broadcaster.send(
      `\n❌ **Step ${this.indexOf(step) + 1}/${this.steps.length}: ${step.phase}** — Failed${reason ? `: ${reason}` : ""}\n`,
    );
    await this.syncToSandbox();
  }

  /** Auto-advance: mark the first pending step as in-progress based on phase name */
  async advanceToPhase(phaseName: string): Promise<void> {
    // Complete the previous in-progress step(s)
    for (const s of this.steps) {
      if (s.status === "in-progress" && s.phase !== phaseName) {
        s.status = "done";
        s.completedAt = Date.now();
      }
    }
    // Start the matching step
    const next = this.steps.find((s) => s.phase === phaseName && s.status === "pending");
    if (next) {
      await this.startStep(this.indexOf(next));
    }
  }

  /** Finalize: mark all remaining as done/skipped and write summary */
  async finalize(success: boolean): Promise<void> {
    this.completedAt = Date.now();
    for (const s of this.steps) {
      if (s.status === "in-progress") {
        s.status = success ? "done" : "failed";
        s.completedAt = Date.now();
      } else if (s.status === "pending") {
        s.status = "skipped";
      }
    }
    await this.syncToSandbox();
    await this.writeSummary(success);
    this.broadcastSummary(success);
  }

  /** Get current snapshot for serialization */
  snapshot(): TaskTrackerSnapshot {
    return {
      taskDescription: this.taskDescription,
      strategy: this.strategy,
      steps: [...this.steps],
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }

  /** Get progress percentage */
  progressPct(): number {
    if (this.steps.length === 0) {
      return 100;
    }
    const done = this.steps.filter((s) => s.status === "done").length;
    return Math.round((done / this.steps.length) * 100);
  }

  // ─── Private ────────────────────────────────────────────────────

  private resolveStep(phaseOrIndex: string | number): TrackedStep | undefined {
    if (typeof phaseOrIndex === "number") {
      return this.steps[phaseOrIndex];
    }
    return this.steps.find((s) => s.phase === phaseOrIndex);
  }

  private indexOf(step: TrackedStep): number {
    return this.steps.indexOf(step);
  }

  private renderMarkdown(): string {
    const lines: string[] = [
      `# Agent Task Plan`,
      ``,
      `**Task:** ${this.taskDescription}`,
      `**Strategy:** ${this.strategy}`,
      `**Started:** ${new Date(this.startedAt).toISOString()}`,
      ``,
      `## Steps`,
      ``,
    ];

    for (const [i, step] of this.steps.entries()) {
      const icon = STATUS_ICON[step.status];
      const checkbox = step.status === "done" ? "[x]" : step.status === "failed" ? "[!]" : "[ ]";
      lines.push(`${i + 1}. ${icon} ${checkbox} **${step.phase}** — ${step.description}`);
      if (step.notes) {
        lines.push(`   _${step.notes}_`);
      }
    }

    if (this.completedAt) {
      const totalMs = this.completedAt - this.startedAt;
      lines.push(
        "",
        `---`,
        `**Completed:** ${new Date(this.completedAt).toISOString()} (${Math.round(totalMs / 1000)}s)`,
      );
    }

    return lines.join("\n");
  }

  private async syncToSandbox(): Promise<void> {
    try {
      const md = this.renderMarkdown();
      if (md === this.lastWrittenMd) {
        return;
      } // No change
      this.lastWrittenMd = md;
      await sandboxWriteFile("/workspace/.agent-todo.md", md);
    } catch (err) {
      logger.warn(
        `[TaskTracker] Failed to sync todo: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private broadcastSnapshot(): void {
    const total = this.steps.length;
    if (total <= 1) {
      return;
    } // DIRECT strategy — no checklist needed
    const items = this.steps
      .map((s, i) => `  ${STATUS_ICON[s.status]} ${i + 1}. ${s.phase}`)
      .join("\n");
    this.broadcaster.send(`\n📋 **Task Plan** (${total} steps):\n${items}\n`);
  }

  private async writeSummary(success: boolean): Promise<void> {
    try {
      const totalMs = (this.completedAt ?? Date.now()) - this.startedAt;
      const done = this.steps.filter((s) => s.status === "done").length;
      const failed = this.steps.filter((s) => s.status === "failed").length;
      const lines = [
        `# Agent Session Summary`,
        ``,
        `- **Result:** ${success ? "✅ Success" : "❌ Failed"}`,
        `- **Strategy:** ${this.strategy}`,
        `- **Steps completed:** ${done}/${this.steps.length}${failed > 0 ? ` (${failed} failed)` : ""}`,
        `- **Duration:** ${Math.round(totalMs / 1000)}s`,
        `- **Task:** ${this.taskDescription}`,
      ];
      await sandboxWriteFile("/workspace/.agent-summary.md", lines.join("\n"));
    } catch {
      // Non-critical
    }
  }

  private broadcastSummary(success: boolean): void {
    const totalMs = (this.completedAt ?? Date.now()) - this.startedAt;
    const done = this.steps.filter((s) => s.status === "done").length;
    this.broadcaster.send(
      `\n📊 **Session Complete** — ${success ? "✅" : "❌"} ${done}/${this.steps.length} steps in ${Math.round(totalMs / 1000)}s\n`,
    );
  }
}
