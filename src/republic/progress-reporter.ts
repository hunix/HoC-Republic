/**
 * Republic Platform — Progress Reporter
 *
 * Reports swarm progress back to users via WhatsApp/WebUI.
 * Generates formatted status messages as projects move through
 * the workforce pipeline.
 */

import type { ProjectTeam, TeamMember } from "./delegation.js";
import { getTeam } from "./delegation.js";
import type { IntakeRequest, TaskBreakdown, TaskItem } from "./project-intake.js";
import { ts, uid } from "./utils.js";
import { getWorkspace } from "./workspace-manager.js";

// ─── Types ──────────────────────────────────────────────────────

export type ProgressEventType =
  | "project_started"
  | "tasks_created"
  | "team_formed"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "review_started"
  | "review_passed"
  | "review_failed"
  | "project_delivered"
  | "project_failed"
  | "status_update";

export interface ProgressEvent {
  id: string;
  projectId: string;
  type: ProgressEventType;
  /** Human-readable message with emoji */
  message: string;
  /** Machine-readable details */
  details: Record<string, unknown>;
  timestamp: string;
}

export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>;

// ─── Event Registry ─────────────────────────────────────────────

const eventHistory: ProgressEvent[] = [];
const MAX_EVENT_HISTORY = 500;
const subscribers: ProgressCallback[] = [];

function emit(event: ProgressEvent): void {
  eventHistory.push(event);
  if (eventHistory.length > MAX_EVENT_HISTORY) {
    eventHistory.splice(0, eventHistory.length - MAX_EVENT_HISTORY);
  }
  // Notify all subscribers
  for (const cb of subscribers) {
    try {
      void cb(event);
    } catch {
      // Subscriber errors are non-fatal
    }
  }
}

/**
 * Subscribe to progress events.
 * Returns an unsubscribe function.
 */
export function onProgress(callback: ProgressCallback): () => void {
  subscribers.push(callback);
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx >= 0) {subscribers.splice(idx, 1);}
  };
}

// ─── Progress Reporters ─────────────────────────────────────────

export function reportProjectStarted(request: IntakeRequest): ProgressEvent {
  const event: ProgressEvent = {
    id: uid(),
    projectId: request.projectId ?? "",
    type: "project_started",
    message: `🔨 **Project started**: ${request.message.slice(0, 80)}`,
    details: {
      intakeId: request.id,
      source: request.source,
      projectType: request.projectType,
      confidence: request.confidence,
    },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

export function reportTasksCreated(
  projectId: string,
  breakdown: TaskBreakdown,
): ProgressEvent {
  const taskNames = breakdown.tasks.map((t) => t.title).slice(0, 5);
  const more = breakdown.tasks.length > 5 ? ` (+${breakdown.tasks.length - 5} more)` : "";

  const event: ProgressEvent = {
    id: uid(),
    projectId,
    type: "tasks_created",
    message: `📋 **Tasks created**: ${breakdown.tasks.length} tasks (${taskNames.join(", ")}${more})`,
    details: {
      taskCount: breakdown.tasks.length,
      estimatedHours: breakdown.totalEstimatedHours,
      specialistsNeeded: breakdown.specialistsNeeded,
    },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

export function reportTeamFormed(team: ProjectTeam): ProgressEvent {
  const pmName = team.pm?.citizenName ?? "unassigned";
  const memberList = team.members
    .map((m) => `${m.citizenName} (${m.role})`)
    .join(", ");

  const event: ProgressEvent = {
    id: uid(),
    projectId: team.projectId,
    type: "team_formed",
    message: `👥 **Team formed**: PM: ${pmName} | ${team.members.length} members`,
    details: {
      teamId: team.id,
      memberCount: team.members.length,
      members: memberList,
    },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

export function reportTaskStarted(
  projectId: string,
  task: TaskItem,
  member: TeamMember,
): ProgressEvent {
  const event: ProgressEvent = {
    id: uid(),
    projectId,
    type: "task_started",
    message: `⚡ **In progress**: ${member.citizenName} (${member.specialization}) working on "${task.title}"`,
    details: {
      taskId: task.id,
      citizenId: member.citizenId,
      taskType: task.type,
      priority: task.priority,
    },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

export function reportTaskCompleted(
  projectId: string,
  task: TaskItem,
  member: TeamMember,
): ProgressEvent {
  const event: ProgressEvent = {
    id: uid(),
    projectId,
    type: "task_completed",
    message: `✅ **Task complete**: "${task.title}" finished by ${member.citizenName}`,
    details: {
      taskId: task.id,
      citizenId: member.citizenId,
    },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

export function reportTaskFailed(
  projectId: string,
  task: TaskItem,
  error: string,
): ProgressEvent {
  const event: ProgressEvent = {
    id: uid(),
    projectId,
    type: "task_failed",
    message: `❌ **Task failed**: "${task.title}" — ${error.slice(0, 100)}`,
    details: {
      taskId: task.id,
      error,
    },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

export function reportReviewPassed(
  projectId: string,
  task: TaskItem,
  reviewerName: string,
): ProgressEvent {
  const event: ProgressEvent = {
    id: uid(),
    projectId,
    type: "review_passed",
    message: `🔍 **Review passed**: "${task.title}" approved by ${reviewerName}`,
    details: { taskId: task.id, reviewer: reviewerName },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

export function reportReviewFailed(
  projectId: string,
  task: TaskItem,
  reviewerName: string,
  comments: string,
): ProgressEvent {
  const event: ProgressEvent = {
    id: uid(),
    projectId,
    type: "review_failed",
    message: `🔄 **Revision needed**: "${task.title}" — ${comments.slice(0, 80)}`,
    details: { taskId: task.id, reviewer: reviewerName, comments },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

export function reportProjectDelivered(
  projectId: string,
  projectName: string,
): ProgressEvent {
  const ws = getWorkspace(projectId);
  const event: ProgressEvent = {
    id: uid(),
    projectId,
    type: "project_delivered",
    message: `📦 **Project delivered**: ${projectName}${ws ? ` — Files at \`${ws.rootDir}\`` : ""}`,
    details: {
      fileCount: ws?.fileCount ?? 0,
      totalSize: ws?.totalSizeBytes ?? 0,
    },
    timestamp: ts(),
  };
  emit(event);
  return event;
}

// ─── Status Summary ─────────────────────────────────────────────

/**
 * Generate a human-readable status summary for a project.
 */
export function generateStatusSummary(
  projectId: string,
  tasks: TaskItem[],
): string {
  const team = getTeam(projectId);
  const ws = getWorkspace(projectId);

  const completed = tasks.filter((t) => t.status === "completed").length;
  const active = tasks.filter((t) => t.status === "active").length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const lines: string[] = [
    `📊 **Project Status**: ${ws?.name ?? projectId}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📈 Progress: ${completed}/${total} tasks (${progress}%)`,
  ];

  if (active > 0) {
    lines.push(`⚡ Active: ${active} task(s) in progress`);
  }

  if (team) {
    lines.push(`👥 Team: ${team.members.length} members`);
    const activeTasks = tasks.filter((t) => t.status === "active");
    for (const task of activeTasks) {
      const member = team.members.find((m) =>
        m.assignedTasks.includes(task.id),
      );
      if (member) {
        lines.push(`  → ${member.citizenName}: "${task.title}"`);
      }
    }
  }

  if (ws) {
    lines.push(`📁 Files: ${ws.fileCount} | Size: ${formatBytes(ws.totalSizeBytes)}`);
  }

  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {return `${bytes} B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Event History ──────────────────────────────────────────────

export function getProgressEvents(
  projectId?: string,
  limit = 20,
): ProgressEvent[] {
  const filtered = projectId
    ? eventHistory.filter((e) => e.projectId === projectId)
    : eventHistory;
  return filtered.slice(-limit);
}

export function getProgressEventCount(): number {
  return eventHistory.length;
}
