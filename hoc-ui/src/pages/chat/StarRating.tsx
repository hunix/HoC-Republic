/**
 * Chat Feature — Star Rating
 *
 * Interactive 5-star rating widget shown after task completion.
 * Persists feedback via memory.store RPC for training signal.
 * Extracted from ChatMessages.tsx per DDD component size limits.
 */

import { Star } from "lucide-react";
import { useState, useCallback } from "react";
import { rpc } from "@/lib/rpc";

interface StarRatingProps {
  /** Optional context (e.g., task summary) to include with the rating feedback */
  taskContext?: string;
}

export function StarRating({ taskContext }: StarRatingProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = useCallback(
    (star: number) => {
      setRating(star);
      setSubmitted(true);
      // Persist as a memory anchor for feedback-driven learning
      rpc("memory.store", {
        content: `User rated task ${star}/5.${taskContext ? ` Context: ${taskContext}` : ""}`,
        memoryType: "feedback",
        importance: star >= 4 ? 0.8 : star >= 2 ? 0.5 : 0.3,
      }).catch(() => {
        /* best-effort persistence */
      });
    },
    [taskContext],
  );

  return (
    <div className="flex items-center gap-1">
      <span className="text-[12px] text-text-muted mr-1">
        {submitted ? "Thanks for your feedback!" : "How was this result?"}
      </span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => handleRate(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="p-0 transition-colors"
          aria-label={`Rate ${star} stars`}
          disabled={submitted}
        >
          <Star
            size={16}
            className={`transition-colors ${
              star <= (hover || rating) ? "text-warning fill-warning" : "text-text-muted/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
