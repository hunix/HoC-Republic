/**
 * HoC Mega Sidebar — Liquid Glass Edition
 *
 * Three-layer navigation with glass material system:
 * 1. Icon Rail (68px) — glass-thick with specular edge
 * 2. Mega Panel (380px flyout) — glass-regular with spring entrance
 * 3. Expanded mode — full sidebar with glass surfaces
 *
 * Features:
 * - Pinned favorites ⭐ at top
 * - Live metrics from Zustand stores in mega panel
 * - Scrolling vertical ticker with system status
 * - Ctrl+K search trigger
 * - Liquid Glass transitions (spring timing, scale, blur)
 */

import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  Sun,
  Moon,
  Search,
  Star,
  X,
  ArrowRight,
  MoreHorizontal,
  Zap,
  Activity,
} from "lucide-react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getPinnedPaths, togglePin } from "@/components/CommandPalette";
import { navigation, getAllNavItems, type NavGroup } from "@/lib/navigation";
import { useGatewayStore } from "@/stores/gateway";
import { useSidebarStore } from "@/stores/sidebar";
import { useThemeStore } from "@/stores/theme";

// ─── Helper: resolve a store value from "gateway.citizenCount" format ─────────

function useStoreValue(storeKey: string): string | number {
  const gateway = useGatewayStore();
  const parts = storeKey.split(".");
  if (parts[0] === "gateway") {
    const val = (gateway as unknown as Record<string, unknown>)[parts[1] ?? ""];
    if (typeof val === "number") {
      return val;
    }
    if (typeof val === "string") {
      return val;
    }
  }
  return "—";
}

function StatBadge({
  stat,
}: {
  stat: { label: string; storeKey: string; icon: import("lucide-react").LucideIcon };
}) {
  const value = useStoreValue(stat.storeKey);
  const Icon = stat.icon;
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-thin liquid-morph"
      style={{ border: "1px solid var(--color-glass-specular)" }}
    >
      <Icon size={12} className="text-accent shrink-0" />
      <span className="text-[11px] text-text-primary font-semibold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      <span className="text-[9px] text-text-muted uppercase">{stat.label}</span>
    </div>
  );
}

// ─── Scrolling Ticker ──────────────────────────────────────────────────────────

function Ticker() {
  const gateway = useGatewayStore();
  const [tickerOffset, setTickerOffset] = useState(0);
  const tickerRef = useRef<number>(0);

  const items = useMemo(
    () => [
      { text: `${gateway.citizenCount} citizens`, color: "text-accent" },
      { text: `${gateway.agentCount} agents`, color: "text-success" },
      { text: `${gateway.nodeCount} nodes`, color: "text-info" },
      { text: `${gateway.pluginCount} plugins`, color: "text-purple" },
      {
        text: gateway.connected ? "● Online" : "○ Offline",
        color: gateway.connected ? "text-success" : "text-danger",
      },
      { text: `v${gateway.version || "—"}`, color: "text-text-muted" },
    ],
    [
      gateway.citizenCount,
      gateway.agentCount,
      gateway.nodeCount,
      gateway.pluginCount,
      gateway.connected,
      gateway.version,
    ],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      tickerRef.current = (tickerRef.current + 1) % items.length;
      setTickerOffset(tickerRef.current);
    }, 3000);
    return () => clearInterval(interval);
  }, [items.length]);

  const current = items[tickerOffset];
  if (!current) {
    return null;
  }

  return (
    <div className="px-2 overflow-hidden h-5 flex items-center">
      <span
        key={tickerOffset}
        className={`text-[9px] font-medium whitespace-nowrap animate-fade-in ${current.color}`}
      >
        {current.text}
      </span>
    </div>
  );
}

// ─── Mega Panel ────────────────────────────────────────────────────────────────

interface MegaPanelProps {
  group: NavGroup;
  onClose: () => void;
  onNavigate: () => void;
}

function MegaPanel({ group, onClose, onNavigate }: MegaPanelProps) {
  const location = useLocation();
  const [showAll, setShowAll] = useState(false);
  const primaryItems = group.items.filter((i) => !i.overflow);
  const overflowItems = group.items.filter((i) => i.overflow);
  const displayItems = showAll ? group.items : primaryItems;

  return (
    <div
      className="fixed left-[68px] top-0 bottom-0 w-[380px] z-[60]
        glass-regular border-r-0 rounded-r-2xl
        shadow-2xl shadow-black/20 animate-slide-in-left
        flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-glass-specular)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{group.emoji}</span>
            <div>
              <h2
                className="text-sm font-bold text-text-heading"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}
              >
                {group.label}
              </h2>
              <p className="text-[10px] text-text-muted">{group.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-[var(--color-glass-thin)] transition-all duration-200 cursor-pointer"
            aria-label="Close panel"
          >
            <X size={14} />
          </button>
        </div>

        {/* Live Stats Row */}
        {group.stats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {group.stats.map((stat) => (
              <StatBadge key={stat.storeKey} stat={stat} />
            ))}
          </div>
        )}
      </div>

      {/* Page Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-1">
          {displayItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-medium
                  transition-all duration-200 group relative liquid-morph
                  ${
                    isActive
                      ? "glass-thin text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-[var(--color-glass-thin)]"
                  }`}
                style={isActive ? { borderColor: "rgba(59,130,246,0.2)" } : undefined}
              >
                <item.icon size={15} className="shrink-0 opacity-70 group-hover:opacity-100" />
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/10">
                    {item.badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute right-2 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Show More / Less */}
        {overflowItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl
              text-[11px] font-medium text-text-muted hover:text-text-secondary
              hover:bg-[var(--color-glass-thin)] transition-all duration-200 cursor-pointer"
            style={{ border: "1px solid var(--color-glass-specular)" }}
          >
            <MoreHorizontal size={13} />
            {showAll ? "Show less" : `${overflowItems.length} more pages…`}
          </button>
        )}
      </div>

      {/* Footer — quick actions */}
      <div className="p-3 border-t border-[var(--color-glass-specular)]">
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <Zap size={10} className="text-accent" />
          <span>
            Press{" "}
            <kbd
              className="px-1 py-0.5 glass-thin rounded-md font-mono text-[9px]"
              style={{ border: "1px solid var(--color-glass-specular)" }}
            >
              Ctrl+K
            </kbd>{" "}
            to search all pages
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Sidebar ──────────────────────────────────────────────────────────────

interface SidebarProps {
  onOpenPalette: () => void;
}

export function Sidebar({ onOpenPalette }: SidebarProps) {
  const { collapsed: sidebarCollapsed, mobileOpen, toggle, setMobileOpen } = useSidebarStore();
  const connected = useGatewayStore((s) => s.connected);
  const agentMode = useGatewayStore((s) => s.agentMode);
  const { mode, setMode } = useThemeStore();
  const location = useLocation();
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [pinnedPaths, setPinnedPaths] = useState<string[]>(getPinnedPaths);

  const allItems = useMemo(() => getAllNavItems(), []);

  // In agent mode, only show core navigation items relevant to chat/agents/sessions
  const AGENT_MODE_PATHS = useMemo(
    () => new Set(["/chat", "/agents", "/sessions", "/config", "/logs"]),
    [],
  );
  const filteredNavigation = useMemo(() => {
    if (!agentMode) return navigation;
    return [
      {
        ...navigation.find((g) => g.id === "core")!,
        label: "Agent Mode",
        emoji: "🤖",
        description: "Chat-centric agent gateway",
        items: navigation
          .find((g) => g.id === "core")!
          .items.filter((item) => AGENT_MODE_PATHS.has(item.path)),
      },
    ];
  }, [agentMode, AGENT_MODE_PATHS]);

  // Pinned items
  const pinnedItems = useMemo(
    () =>
      pinnedPaths
        .map((path) => allItems.find((item) => item.path === path))
        .filter(Boolean) as typeof allItems,
    [pinnedPaths, allItems],
  );

  const handleUnpin = useCallback((path: string) => {
    const next = togglePin(path);
    setPinnedPaths(next);
  }, []);

  // Note: mega panel is closed via onNavigate callbacks in MegaPanel and expanded nav items

  // Close mega panel on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActivePanel(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const activePanelGroup = useMemo(
    () => filteredNavigation.find((g) => g.id === activePanel),
    [activePanel, filteredNavigation],
  );

  // Which group is the current route in?
  const activeGroupId = useMemo(() => {
    for (const group of filteredNavigation) {
      if (
        group.items.some(
          (item) =>
            item.path === location.pathname ||
            (item.path !== "/" && location.pathname.startsWith(item.path)),
        )
      ) {
        return group.id;
      }
    }
    return "core";
  }, [location.pathname, filteredNavigation]);

  const themeOptions = [
    { key: "system" as const, icon: Monitor, label: "Sys" },
    { key: "light" as const, icon: Sun, label: "Light" },
    { key: "dark" as const, icon: Moon, label: "Dark" },
  ];

  // ── COLLAPSED MODE (Icon Rail + Mega Panel) ─────────────────────────────
  if (sidebarCollapsed) {
    return (
      <>
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Icon Rail — glass-thick */}
        <aside
          className={`
            fixed lg:relative z-50 h-screen flex flex-col
            glass-thick w-[68px] rounded-r-xl contain-paint
            transition-transform duration-300 ease-in-out
            border-r border-[var(--color-glass-specular-strong)]
            ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          {/* Logo + Expand button */}
          <div className="flex flex-col items-center gap-1 py-3 border-b border-[var(--color-glass-specular)]">
            <span
              className="text-xl"
              style={{ filter: "drop-shadow(0 0 10px rgba(59,130,246,0.5))" }}
            >
              ⬡
            </span>
            <button
              type="button"
              onClick={toggle}
              className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-[var(--color-glass-thin)] transition-all duration-200 cursor-pointer"
              aria-label="Expand sidebar"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Search trigger */}
          <button
            type="button"
            onClick={onOpenPalette}
            className="mx-auto mt-2 p-2 rounded-xl text-text-muted hover:text-accent hover:bg-[var(--color-glass-thin)] transition-all duration-200 cursor-pointer"
            aria-label="Search pages (Ctrl+K)"
            title="Search (Ctrl+K)"
          >
            <Search size={16} />
          </button>

          {/* Pinned favorites icons */}
          {pinnedItems.length > 0 && (
            <div className="flex flex-col items-center gap-0.5 mt-2 pb-2 border-b border-[var(--color-glass-specular)]">
              {pinnedItems.slice(0, 3).map((item) => (
                <NavLink
                  key={`pin-${item.path}`}
                  to={item.path}
                  onClick={() => {
                    setMobileOpen(false);
                    setActivePanel(null);
                  }}
                  className={({ isActive }) =>
                    `p-2 rounded-xl transition-all duration-200 liquid-morph ${
                      isActive
                        ? "text-accent bg-accent/10"
                        : "text-text-muted hover:text-text-primary hover:bg-[var(--color-glass-thin)]"
                    }`
                  }
                  title={item.label}
                >
                  <item.icon size={16} />
                </NavLink>
              ))}
            </div>
          )}

          {/* Group Icons */}
          <nav className="flex-1 flex flex-col items-center gap-1 py-3">
            {filteredNavigation.map((group) => {
              const isActive = activeGroupId === group.id;
              const isPanelOpen = activePanel === group.id;

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActivePanel(isPanelOpen ? null : group.id)}
                  className={`
                    relative p-2.5 rounded-xl transition-all duration-200 group liquid-morph cursor-pointer
                    ${
                      isPanelOpen
                        ? "glass-thin text-accent shadow-[0_0_12px_var(--color-accent-glow)]"
                        : isActive
                          ? "text-accent bg-accent/8"
                          : "text-text-muted hover:text-text-primary hover:bg-[var(--color-glass-thin)]"
                    }
                  `}
                  title={group.label}
                  aria-label={group.label}
                >
                  <span className="text-base">{group.emoji}</span>

                  {/* Active indicator — glass pill */}
                  {isActive && !isPanelOpen && (
                    <span className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
                  )}

                  {/* Health indicator */}
                  <span
                    className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                      connected
                        ? "bg-success shadow-[0_0_4px_var(--color-success)]"
                        : "bg-danger shadow-[0_0_4px_var(--color-danger)]"
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Ticker */}
          <div className="border-t border-[var(--color-glass-specular)] py-2">
            <Ticker />
          </div>

          {/* Theme + Status */}
          <div className="p-2 border-t border-[var(--color-glass-specular)] space-y-1">
            <button
              type="button"
              onClick={() => {
                const next = mode === "dark" ? "light" : mode === "light" ? "system" : "dark";
                setMode(next);
              }}
              className="w-full p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-[var(--color-glass-thin)] transition-all duration-200 flex items-center justify-center cursor-pointer"
              aria-label="Cycle theme"
              title={`Theme: ${mode}`}
            >
              {mode === "light" ? (
                <Sun size={14} />
              ) : mode === "dark" ? (
                <Moon size={14} />
              ) : (
                <Monitor size={14} />
              )}
            </button>
            <div className="flex items-center justify-center">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected
                    ? "bg-success shadow-[0_0_8px_var(--color-success)]"
                    : "bg-danger shadow-[0_0_8px_var(--color-danger)]"
                }`}
              />
            </div>
          </div>
        </aside>

        {/* Mega Panel Flyout */}
        {activePanelGroup && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-[55]" onClick={() => setActivePanel(null)} />
            <MegaPanel
              group={activePanelGroup}
              onClose={() => setActivePanel(null)}
              onNavigate={() => {
                setActivePanel(null);
                setMobileOpen(false);
              }}
            />
          </>
        )}
      </>
    );
  }

  // ── EXPANDED MODE (Full Sidebar) ─────────────────────────────────────────
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed lg:relative z-50 h-screen flex flex-col
          glass-thick w-[260px] rounded-r-xl contain-paint
          transition-transform duration-300 ease-in-out
          border-r border-[var(--color-glass-specular-strong)]
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-glass-specular)]">
          <div className="flex items-center gap-2.5">
            <span
              className="text-2xl"
              style={{ filter: "drop-shadow(0 0 10px rgba(59,130,246,0.5))" }}
            >
              ⬡
            </span>
            <span className="text-lg font-bold gradient-text">{agentMode ? "Agent" : "HoC"}</span>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-[var(--color-glass-thin)] transition-all duration-200 cursor-pointer"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        {/* Search trigger */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="mx-3 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl
            glass-thin text-text-muted text-xs
            hover:border-[var(--color-glass-specular-strong)] hover:text-text-secondary transition-all group cursor-pointer"
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 text-left">Search pages…</span>
          <kbd
            className="text-[9px] font-mono px-1.5 py-0.5 rounded-md glass-thin group-hover:text-text-primary transition-colors"
            style={{ border: "1px solid var(--color-glass-specular)" }}
          >
            Ctrl+K
          </kbd>
        </button>

        {/* Live Stats Bar */}
        <div
          className="mx-3 mt-2 mb-1 flex items-center gap-2 px-2 py-1.5 rounded-xl glass-thin"
          style={{ border: "1px solid var(--color-glass-specular)" }}
        >
          <Activity size={10} className="text-accent shrink-0" />
          <Ticker />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {/* Pinned Favorites */}
          {pinnedItems.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-2 px-3 py-1">
                <Star size={10} className="text-warning" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Pinned
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {pinnedItems.map((item) => (
                  <NavLink
                    key={`pin-${item.path}`}
                    to={item.path}
                    end={item.path === "/"}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium
                       transition-all duration-200 group liquid-morph
                       ${
                         isActive
                           ? "text-accent glass-thin font-semibold"
                           : "text-text-secondary hover:text-text-primary hover:bg-[var(--color-glass-thin)]"
                       }`
                    }
                  >
                    <item.icon size={16} className="shrink-0" />
                    <span className="min-w-0 truncate flex-1">{item.label}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUnpin(item.path);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-warning hover:text-warning/70 transition-opacity cursor-pointer"
                      aria-label="Unpin"
                    >
                      <Star size={10} fill="currentColor" />
                    </button>
                  </NavLink>
                ))}
              </div>
              <div className="mx-3 my-1.5 border-t border-[var(--color-glass-specular)]" />
            </div>
          )}

          {/* Navigation Groups */}
          {filteredNavigation.map((group) => {
            const primaryItems = group.items.filter((i) => !i.overflow);

            return (
              <div key={group.id} className="mb-0.5">
                {/* Group Header */}
                <button
                  type="button"
                  onClick={() => setActivePanel(activePanel === group.id ? null : group.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 group cursor-pointer
                    ${activeGroupId === group.id ? "bg-[var(--color-glass-thin)]" : "hover:bg-[var(--color-glass-thin)]"}`}
                >
                  <span className="text-[11px] leading-none">{group.emoji}</span>
                  <span className="flex-1 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted group-hover:text-text-secondary">
                    {group.label}
                  </span>
                  <ArrowRight
                    size={10}
                    className="text-text-muted/40 group-hover:text-accent transition-colors"
                  />
                </button>

                {/* Primary Items (always visible for active group) */}
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {primaryItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === "/"}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium
                         transition-all duration-200 liquid-morph
                         ${
                           isActive
                             ? "text-accent glass-thin font-semibold"
                             : "text-text-secondary hover:text-text-primary hover:bg-[var(--color-glass-thin)]"
                         }`
                      }
                    >
                      <item.icon size={16} className="shrink-0" />
                      <span className="min-w-0 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/10 leading-none">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--color-glass-specular)] space-y-2">
          <div
            className="flex items-center rounded-xl glass-thin p-1"
            style={{ border: "1px solid var(--color-glass-specular)" }}
          >
            {themeOptions.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                  mode === key
                    ? "glass-thin text-accent shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
                title={label}
                aria-pressed={mode === key}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl glass-thin text-xs"
            style={{ border: "1px solid var(--color-glass-specular)" }}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                connected
                  ? "bg-success shadow-[0_0_8px_var(--color-success)]"
                  : "bg-danger shadow-[0_0_8px_var(--color-danger)]"
              }`}
            />
            <span className="text-text-muted">{connected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </aside>

      {/* Mega Panel in expanded mode */}
      {activePanelGroup && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setActivePanel(null)} />
          <div className="fixed left-[260px] top-0 bottom-0 z-[60]">
            <MegaPanel
              group={activePanelGroup}
              onClose={() => setActivePanel(null)}
              onNavigate={() => {
                setActivePanel(null);
                setMobileOpen(false);
              }}
            />
          </div>
        </>
      )}
    </>
  );
}
