/**
 * VersionCheck — non-intrusive toast that appears when a new UI build is detected.
 * Mount once at the app root level.
 */

import { useVersionCheck } from "@/hooks/useVersionCheck";

export function VersionCheck() {
  const { updateAvailable, reload } = useVersionCheck();

  if (!updateAvailable) {
    return null;
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 rounded-xl border border-accent/30 bg-bg-card/95 px-5 py-3 shadow-2xl backdrop-blur-md animate-fade-in"
      role="alert"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-text-primary">New version available</span>
        <span className="text-xs text-text-muted">Click reload to get the latest UI</span>
      </div>
      <button
        onClick={reload}
        className="ml-2 rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-white transition-all hover:brightness-110 active:scale-95"
      >
        Reload
      </button>
    </div>
  );
}
