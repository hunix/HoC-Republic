/**
 * Command Palette — Ctrl+K Quick Navigation
 *
 * Fuzzy-searches all 94+ routes in the app. Keyboard-navigable
 * with arrow keys + Enter. Shows recent pages when input is empty.
 * Supports pinning favorites to the sidebar.
 */

import { Search, Star, Clock, CornerDownLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getAllNavItems } from "@/lib/navigation";

// ─── Pinned Favorites Persistence ──────────────────────────────────────────

const PINNED_KEY = "hoc:pinned-pages";
const RECENT_KEY = "hoc:recent-pages";
const MAX_RECENT = 8;

export function getPinnedPaths(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PINNED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function setPinnedPaths(paths: string[]): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(paths));
  } catch { /* storage full */ }
}

export function togglePin(path: string): string[] {
  const current = getPinnedPaths();
  const next = current.includes(path)
    ? current.filter((p) => p !== path)
    : [...current, path];
  setPinnedPaths(next);
  return next;
}

function getRecentPaths(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function addRecentPath(path: string): void {
  try {
    const recent = getRecentPaths().filter((p) => p !== path);
    recent.unshift(path);
    if (recent.length > MAX_RECENT) {recent.length = MAX_RECENT;}
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch { /* storage full */ }
}

// ─── Fuzzy Match ───────────────────────────────────────────────────────────

function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring match scores highest
  if (t.includes(q)) {
    const idx = t.indexOf(q);
    return { match: true, score: 100 - idx + (q.length / t.length) * 50 };
  }

  // Character-by-character fuzzy match
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches
      score += lastMatchIdx === ti - 1 ? 10 : 5;
      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi === q.length) {
    return { match: true, score };
  }
  return { match: false, score: 0 };
}

// ─── Component ─────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pinnedPaths, setPinned] = useState<string[]>(getPinnedPaths);

  const allItems = useMemo(() => getAllNavItems(), []);

  // ── Filtered results ─────────────────────────────────────────────
  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recent pages, then pinned
      const recent = getRecentPaths();
      const recentItems = recent
        .map((path) => allItems.find((item) => item.path === path))
        .filter(Boolean) as typeof allItems;

      const pinnedItems = pinnedPaths
        .filter((p) => !recent.includes(p))
        .map((path) => allItems.find((item) => item.path === path))
        .filter(Boolean) as typeof allItems;

      return [
        ...recentItems.map((item) => ({ ...item, section: "Recent" as const })),
        ...pinnedItems.map((item) => ({ ...item, section: "Pinned" as const })),
      ];
    }

    return allItems
      .map((item) => {
        const labelMatch = fuzzyMatch(query, item.label);
        const groupMatch = fuzzyMatch(query, item.groupLabel);
        const pathMatch = fuzzyMatch(query, item.path);
        const bestScore = Math.max(labelMatch.score, groupMatch.score * 0.7, pathMatch.score * 0.5);
        const isMatch = labelMatch.match || groupMatch.match || pathMatch.match;
        return { ...item, score: bestScore, isMatch, section: "Results" as const };
      })
      .filter((item) => item.isMatch)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [query, allItems, pinnedPaths]);

  // ── Focus input on open ──────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Small delay for DOM to render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ── Scroll selected item into view ───────────────────────────────
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Navigate to selected item ────────────────────────────────────
  const handleSelect = useCallback(
    (path: string) => {
      addRecentPath(path);
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  // ── Keyboard handler ─────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex].path);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [results, selectedIndex, handleSelect, onClose],
  );

  // ── Pin/unpin handler ────────────────────────────────────────────
  const handleTogglePin = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      const next = togglePin(path);
      setPinned(next);
    },
    [],
  );

  if (!open) {return null;}

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div
        className="relative w-full max-w-xl mx-4 bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        role="dialog"
        aria-label="Command palette"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={18} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search pages… (type to filter)"
            className="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-muted"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-text-muted bg-bg-card rounded border border-border font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-text-muted text-sm">
              {query ? "No pages found" : "Start typing to search…"}
            </div>
          )}

          {results.map((item, index) => {
            const isPinned = pinnedPaths.includes(item.path);
            const isActive = location.pathname === item.path;
            const isSelected = index === selectedIndex;

            // Section header
            let showSectionHeader = false;
            if (index === 0 || results[index - 1]?.section !== item.section) {
              showSectionHeader = true;
            }

            return (
              <div key={`${item.path}-${index}`}>
                {showSectionHeader && !query && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {item.section === "Recent" && <><Clock size={10} className="inline mr-1" />Recent</>}
                    {item.section === "Pinned" && <><Star size={10} className="inline mr-1" />Pinned</>}
                  </div>
                )}
                <button
                  type="button"
                  data-index={index}
                  onClick={() => handleSelect(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-bg-card hover:text-text-primary"
                  } ${isActive ? "font-semibold" : ""}`}
                >
                  <item.icon size={16} className="shrink-0 opacity-70" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm truncate block">{item.label}</span>
                    <span className="text-[10px] text-text-muted truncate block">{item.groupLabel}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                      {item.badge}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleTogglePin(e, item.path)}
                    className={`p-1 rounded transition-colors ${
                      isPinned
                        ? "text-warning hover:text-warning/80"
                        : "text-text-muted/30 hover:text-text-muted"
                    }`}
                    aria-label={isPinned ? "Unpin page" : "Pin page"}
                    title={isPinned ? "Unpin" : "Pin to sidebar"}
                  >
                    <Star size={12} fill={isPinned ? "currentColor" : "none"} />
                  </button>
                  {isSelected && (
                    <CornerDownLeft size={12} className="text-text-muted shrink-0" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-bg-card rounded border border-border font-mono">↑↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-bg-card rounded border border-border font-mono">↵</kbd>
            Open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-bg-card rounded border border-border font-mono">★</kbd>
            Pin
          </span>
        </div>
      </div>
    </div>
  );
}
