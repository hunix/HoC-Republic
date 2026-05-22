/**
 * Chat Feature — Suggested Follow-ups (Manus-style)
 *
 * Context-aware follow-up suggestions shown after task completion.
 * Extracted from ChatMessages.tsx per DDD component size limits.
 */

import { RefreshCw, Lightbulb, FileText, Presentation, ArrowRight } from "lucide-react";

// ── Static follow-up data (must be separate from business logic per DDD) ────

export const MANUS_FOLLOWUPS = [
  {
    icon: <RefreshCw size={14} />,
    text: "Make the process we used here into a re-usable skill with /skill-creator",
  },
  {
    icon: <Lightbulb size={14} />,
    text: "Provide a detailed breakdown of the changes made, highlighting the improvements.",
  },
  { icon: <Presentation size={14} />, text: "Generate a presentation script for the results." },
  {
    icon: <FileText size={14} />,
    text: "Create a set of slides summarizing the key findings and contributions.",
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export function SuggestedFollowups({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="mt-4 space-y-1.5">
      <p className="text-[12px] font-medium text-text-muted mb-2">Suggested follow-ups</p>
      {MANUS_FOLLOWUPS.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(s.text)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[13px] text-text-secondary hover:bg-bg-card-hover border border-transparent hover:border-border/60 transition-all group"
        >
          <span className="text-text-muted/60 shrink-0">{s.icon}</span>
          <span className="flex-1 line-clamp-2">{s.text}</span>
          <ArrowRight
            size={14}
            className="text-text-muted/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </button>
      ))}
    </div>
  );
}
