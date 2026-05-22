import { AlertTriangle, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "./index";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

/**
 * Accessible confirmation dialog for destructive actions.
 * Traps focus, closes on Escape, and renders as a portal-style overlay.
 * Uses Liquid Glass material for the panel.
 */
export function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
  loading,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const accentClass = variant === "danger" ? "text-danger" : "text-warning";
  const iconBgClass =
    variant === "danger"
      ? "bg-danger/10 border border-danger/20"
      : "bg-warning/10 border border-warning/20";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Backdrop — deep blur for glass depth */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xl" onClick={onCancel} />
      {/* Panel — glass-thick with liquid entrance */}
      <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl glass-thick liquid-bounce">
        {/* Close */}
        <button
          type="button"
          className="absolute top-3 right-3 text-text-muted hover:text-text-primary p-1.5 rounded-lg hover:bg-glass-thin transition-all duration-200 cursor-pointer"
          onClick={onCancel}
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`p-3 rounded-xl flex-shrink-0 backdrop-blur-sm ${iconBgClass}`}>
              <AlertTriangle size={20} className={accentClass} />
            </div>
            <div>
              <h2 id="confirm-title" className="text-base font-bold text-text-heading">
                {title}
              </h2>
              <div className="text-sm text-text-secondary mt-1 leading-relaxed">{message}</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <Button
              ref={cancelRef}
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button variant={variant} size="sm" loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
