import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
/**
 * Toast Notification Context
 *
 * Provides a lightweight, globally-accessible toast system.
 * Usage: call `useToast().toast(...)` from any component.
 * Wrap your app root with <ToastProvider>.
 */
import React, { createContext, useCallback, useContext, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastEntry {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  durationMs: number;
}

interface ToastContextValue {
  toast: (opts: {
    title: string;
    message?: string;
    variant?: ToastVariant;
    durationMs?: number;
  }) => void;
}

// ── Context ────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// ── Toast Icons ───────────────────────────────────────────────────

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-success shrink-0" />,
  error: <AlertCircle size={16} className="text-danger shrink-0" />,
  info: <Info size={16} className="text-info shrink-0" />,
  warning: <AlertTriangle size={16} className="text-warning shrink-0" />,
};

const BORDER_COLORS: Record<ToastVariant, string> = {
  success: "border-success/40",
  error: "border-danger/40",
  info: "border-info/40",
  warning: "border-warning/40",
};

// ── Provider ───────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const toast = useCallback(
    ({
      title,
      message,
      variant = "info",
      durationMs = 4000,
    }: {
      title: string;
      message?: string;
      variant?: ToastVariant;
      durationMs?: number;
    }) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, variant, title, message, durationMs }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 bg-bg-card border ${BORDER_COLORS[t.variant]} rounded-xl px-4 py-3 shadow-xl animate-slide-in-right`}
          >
            {ICONS[t.variant]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">{t.title}</p>
              {t.message && (
                <p className="text-xs text-text-muted mt-0.5 break-words">{t.message}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="text-text-muted hover:text-text-secondary transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
