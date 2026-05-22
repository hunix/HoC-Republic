import { X } from "lucide-react";
/**
 * DetailModal — a slide-in right-panel modal for drill-down views.
 * Uses Liquid Glass material with spring animation.
 * Usage:
 *   <DetailModal open={!!selected} onClose={() => setSelected(null)} title="Citizen">
 *     <p>content</p>
 *   </DetailModal>
 */
import React from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function DetailModal({ open, onClose, title, subtitle, children }: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop — deep blur */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xl" onClick={onClose} />
      {/* Panel — glass-regular with slide-in */}
      <div className="relative ml-auto w-full max-w-md h-full glass-regular border-l-0 shadow-2xl flex flex-col animate-slide-in-right overflow-hidden rounded-l-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-glass-specular/20 shrink-0">
          <div>
            <h2
              className="text-sm font-bold text-text-heading"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}
            >
              {title}
            </h2>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-glass-thin text-text-muted hover:text-text-primary transition-all duration-200 cursor-pointer"
            aria-label="Close detail panel"
          >
            <X size={18} />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}
