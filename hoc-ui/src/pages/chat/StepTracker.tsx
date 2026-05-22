/**
 * StepTracker — Manus-style bottom step progress bar
 *
 * Primary source: structured `ToolEvent[]` from the gateway's `agent.tool` WS events.
 * Fallback: regex-based extraction from streaming message content when no structured
 * events are available (backwards compatibility with non-agent flows).
 *
 * Matches Manus design: green check when done, step text, N/M counter, expand chevron.
 */

import { CheckCircle, ChevronUp, ChevronDown, Loader2, Circle, Wrench, Brain } from "lucide-react";
import { useState, useMemo } from "react";
import type { Message, ToolEvent } from "./chat.types";
import { friendlyLabel } from "./chat.constants";

// ── Step types ───────────────────────────────────────────────────────────────

export interface TrackedStep {
  label: string;
  status: "done" | "running" | "pending" | "error";
  toolName?: string;
  durationMs?: number;
}

// ── Build steps from structured ToolEvents (primary) ─────────────────────────

function stepsFromToolEvents(events: ToolEvent[], sending: boolean): TrackedStep[] {
  const steps: TrackedStep[] = [];

  // Track the last thinking event separately (collapse all into one)
  let lastThinkingEvt: ToolEvent | null = null;

  for (const evt of events) {
    if (evt.toolName === "thinking") {
      // Only keep the most recent thinking event
      lastThinkingEvt = evt;
      continue;
    }
    steps.push({
      label: friendlyLabel(evt.toolName),
      status: evt.status === "start" ? "running" : evt.status === "error" ? "error" : "done",
      toolName: evt.toolName,
      durationMs: evt.durationMs,
    });
  }

  // If there's an active thinking event (start, not yet done), prepend it
  if (lastThinkingEvt && lastThinkingEvt.status === "start") {
    steps.push({
      label: friendlyLabel("thinking"),
      status: "running",
      toolName: "thinking",
    });
  }

  // Add completion step when done
  if (!sending && steps.length > 0) {
    steps.push({ label: "Quality check and deliver to user", status: "done" });
  }

  return steps;
}

// ── Fallback: extract steps from message content (legacy) ────────────────────

function stepsFromMessages(messages: Message[], sending: boolean): TrackedStep[] {
  const steps: TrackedStep[] = [];
  const lastAssistant = messages.toReversed().find((m) => m.role === "assistant");
  if (!lastAssistant) {
    return steps;
  }

  const content = lastAssistant.content ?? "";
  const toolMatches = content.match(/🔧\s*(\S+)/g) ?? [];
  for (const match of toolMatches) {
    const toolName = match.replace(/^🔧\s*/, "").trim();
    steps.push({
      label: friendlyLabel(toolName),
      status: "done",
      toolName,
    });
  }

  if (sending && lastAssistant.streaming && steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    if (lastStep) {
      lastStep.status = "running";
    }
  }

  if (steps.length === 0 && sending && lastAssistant.streaming) {
    steps.push({ label: "Processing request", status: "running" });
  }

  if (!sending && messages.length > 0) {
    const hasCompletion =
      content.includes("✅") || content.includes("Task completed") || content.includes("✓");
    if (hasCompletion || (!lastAssistant.streaming && !lastAssistant.error)) {
      steps.push({ label: "Quality check and deliver to user", status: "done" });
    }
  }

  return steps;
}

// ── StepTracker Component ────────────────────────────────────────────────────

interface StepTrackerProps {
  messages: Message[];
  sending: boolean;
  toolEvents?: ToolEvent[];
}

export function StepTracker({ messages, sending, toolEvents }: StepTrackerProps) {
  const [expanded, setExpanded] = useState(false);

  // Use structured events when available, fallback to regex extraction
  const steps = useMemo(
    () =>
      toolEvents && toolEvents.length > 0
        ? stepsFromToolEvents(toolEvents, sending)
        : stepsFromMessages(messages, sending),
    [toolEvents, messages, sending],
  );

  if (steps.length === 0) {
    return null;
  }

  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalCount = steps.length;
  const currentStep = steps.find((s) => s.status === "running") ?? steps[steps.length - 1];
  const allDone = steps.every((s) => s.status === "done" || s.status === "error");

  return (
    <div className="border-t border-border/30 glass-thin shrink-0">
      {/* Expanded steps list */}
      {expanded && (
        <div className="px-4 py-3 border-b border-border/50 max-h-48 overflow-y-auto liquid-bounce">
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                {step.status === "done" ? (
                  <CheckCircle size={14} className="text-success shrink-0" />
                ) : step.status === "running" ? (
                  <Loader2 size={14} className="text-accent animate-spin shrink-0" />
                ) : step.status === "error" ? (
                  <Circle size={14} className="text-danger shrink-0" />
                ) : (
                  <Circle size={14} className="text-text-muted/40 shrink-0" />
                )}
                <span
                  className={`text-[12px] flex-1 ${
                    step.status === "done"
                      ? "text-text-secondary"
                      : step.status === "running"
                        ? "text-text-primary font-medium"
                        : step.status === "error"
                          ? "text-danger"
                          : "text-text-muted"
                  }`}
                >
                  {step.label}
                </span>
                {step.durationMs != null && (
                  <span className="text-[10px] text-text-muted font-mono shrink-0">
                    {step.durationMs > 1000
                      ? `${(step.durationMs / 1000).toFixed(1)}s`
                      : `${step.durationMs}ms`}
                  </span>
                )}
                {step.toolName === "thinking" ? (
                  <Brain size={10} className="text-accent/50 shrink-0" />
                ) : step.toolName ? (
                  <Wrench size={10} className="text-text-muted/50 shrink-0" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg-card-hover transition-colors text-left"
      >
        {/* Status icon */}
        {allDone ? (
          <CheckCircle size={16} className="text-success shrink-0" />
        ) : (
          <Loader2 size={16} className="text-accent animate-spin shrink-0" />
        )}

        {/* Step label */}
        <span
          className={`flex-1 text-[13px] truncate ${
            allDone ? "text-text-secondary" : "text-text-primary"
          }`}
        >
          {currentStep?.label ?? "Processing..."}
        </span>

        {/* Step counter */}
        <span className="text-[12px] text-text-muted font-mono shrink-0">
          {completedCount} / {totalCount}
        </span>

        {/* Expand chevron */}
        {expanded ? (
          <ChevronDown size={14} className="text-text-muted shrink-0" />
        ) : (
          <ChevronUp size={14} className="text-text-muted shrink-0" />
        )}
      </button>
    </div>
  );
}
