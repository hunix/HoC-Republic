/**
 * Chat Feature — Left Sidebar (Manus-style)
 *
 * Manus-inspired vertical navigation with:
 * - Top nav: New task, Agents, Search, Library
 * - Projects section
 * - All tasks: flat session list with document icons
 * - Bottom: footer area
 */

import {
  PenLine,
  Bot,
  Search,
  BookOpen,
  Plus,
  Loader2,
  Trash2,
  RefreshCw,
  FileText,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  MessageSquare,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui";
import { invalidateRpcCache, useRpc, rpc } from "@/lib/rpc";
import type { ChatState } from "./useChatState";
import { sessionLabel } from "./chat.helpers";

type Props = Pick<
  ChatState,
  | "leftPanelOpen"
  | "setLeftPanelOpen"
  | "sessions"
  | "sessionsLoading"
  | "citizens"
  | "activeKey"
  | "sidebarTab"
  | "setSidebarTab"
  | "sessionSearch"
  | "citizenSearch"
  | "setCitizenSearch"
  | "switchSession"
  | "newConversation"
  | "handleSearchChange"
  | "setConfirmDeleteKey"
  | "refetchSessions"
>;

export function ChatLeftSidebar(props: Props) {
  const {
    leftPanelOpen,
    setLeftPanelOpen,
    sessions,
    sessionsLoading,
    citizens,
    activeKey,
    sidebarTab,
    setSidebarTab,
    sessionSearch,
    citizenSearch,
    setCitizenSearch,
    switchSession,
    newConversation,
    handleSearchChange,
    setConfirmDeleteKey,
    refetchSessions,
  } = props;

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  // Fetch workspace projects
  const { data: workspaceData } = useRpc<{
    projects?: { id: string; name: string; path: string; status?: string }[];
  }>("republic.workspace.list", {}, [], { staleTimeMs: 60_000 });
  const projects = workspaceData?.projects ?? [];

  // Show citizens view or sessions view
  const showCitizens = sidebarTab === "citizens";

  return (
    <aside
      className={`shrink-0 flex flex-col glass-thick glass-specular rounded-2xl overflow-hidden liquid-morph ${leftPanelOpen ? "w-64" : "w-12"}`}
    >
      {/* Collapsed icon strip */}
      {!leftPanelOpen && (
        <div className="flex flex-col items-center gap-1 py-2">
          <button
            type="button"
            onClick={() => setLeftPanelOpen(true)}
            className="p-1.5 rounded-lg hover:bg-bg-card-hover text-text-muted hover:text-accent transition-colors"
            title="Expand sidebar (Ctrl+B)"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => void newConversation()}
            className="p-1.5 rounded-lg hover:bg-bg-card-hover text-text-muted hover:text-accent transition-colors"
            title="New conversation"
            aria-label="New conversation"
          >
            <PenLine size={14} />
          </button>
          <div className="w-6 border-t border-border my-1" />
          {sessions.slice(0, 8).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => switchSession(s.key)}
              title={sessionLabel(s)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-colors ${activeKey === s.key ? "bg-accent/20 text-accent" : "bg-bg-secondary text-text-muted hover:bg-bg-card-hover"}`}
            >
              {sessionLabel(s)[0]?.toUpperCase() ?? "?"}
            </button>
          ))}
        </div>
      )}

      {/* Expanded sidebar content */}
      {leftPanelOpen && (
        <>
          {/* ── Top Navigation ─────────────────────────────────────────── */}
          <div className="px-2 pt-3 pb-1 space-y-0.5">
            {/* New task */}
            <button
              type="button"
              onClick={() => void newConversation()}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] text-text-primary hover:bg-bg-card-hover transition-colors"
            >
              <PenLine size={16} className="text-text-muted shrink-0" />
              <span>New task</span>
            </button>

            {/* Agents */}
            <button
              type="button"
              onClick={() => setSidebarTab(showCitizens ? "sessions" : "citizens")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-colors ${
                showCitizens
                  ? "bg-accent/10 text-accent"
                  : "text-text-primary hover:bg-bg-card-hover"
              }`}
            >
              <Bot size={16} className={showCitizens ? "text-accent" : "text-text-muted"} />
              <span>Agents</span>
              {citizens.length > 0 && (
                <Badge variant="info" className="!text-[8px] !py-0 !px-1.5 ml-auto">
                  {citizens.length}
                </Badge>
              )}
            </button>

            {/* Search */}
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-colors ${
                searchOpen ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-bg-card-hover"
              }`}
            >
              <Search size={16} className={searchOpen ? "text-accent" : "text-text-muted"} />
              <span>Search</span>
            </button>

            {/* Library */}
            <button
              type="button"
              onClick={() => navigate("/memory")}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] text-text-primary hover:bg-bg-card-hover transition-colors"
            >
              <BookOpen size={16} className="text-text-muted shrink-0" />
              <span>Library</span>
            </button>
          </div>

          {/* ── Search Input (inline, shown when toggled) ───────────── */}
          {searchOpen && (
            <div className="px-3 pb-2 animate-fade-in">
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="text"
                  value={showCitizens ? citizenSearch : sessionSearch}
                  onChange={(e) => {
                    if (showCitizens) {
                      setCitizenSearch(e.target.value);
                    } else {
                      handleSearchChange(e.target.value);
                    }
                  }}
                  placeholder={showCitizens ? "Search agents…" : "Search tasks…"}
                  className="w-full bg-bg-input border border-border rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* ── Divider ─────────────────────────────────────────────── */}
          <div className="border-t border-border mx-3" />

          {/* ── Projects Section ────────────────────────────────────── */}
          <div className="px-3 pt-3 pb-1">
            <button
              type="button"
              onClick={() => setProjectsOpen((v) => !v)}
              className="w-full flex items-center justify-between text-[11px] font-medium text-text-muted uppercase tracking-wider hover:text-text-secondary transition-colors"
            >
              <span>Projects</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void newConversation();
                  }}
                  className="p-0.5 rounded hover:bg-bg-card-hover text-text-muted hover:text-accent transition-colors"
                  aria-label="New project"
                >
                  <Plus size={12} />
                </button>
                {projectsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </div>
            </button>
            {projectsOpen && (
              <div className="mt-1.5 space-y-0.5">
                {projects.length === 0 ? (
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-text-muted hover:bg-bg-card-hover transition-colors"
                    onClick={() => navigate("/dev-studio")}
                  >
                    <FolderOpen size={14} className="text-text-muted shrink-0" />
                    <span className="truncate italic">No projects — open Dev Studio</span>
                  </button>
                ) : (
                  projects.slice(0, 5).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-text-secondary hover:bg-bg-card-hover transition-colors group"
                      onClick={() => navigate(`/dev-studio?project=${p.id}`)}
                      title={p.path}
                    >
                      <FolderOpen size={14} className="text-text-muted shrink-0" />
                      <span className="truncate flex-1">{p.name}</span>
                      {p.status && (
                        <Badge
                          variant={p.status === "active" ? "success" : "neutral"}
                          className="!text-[8px] !py-0 !px-1"
                        >
                          {p.status}
                        </Badge>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── All Tasks / Sessions ────────────────────────────────── */}
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
              {showCitizens ? "All agents" : "All tasks"}
            </span>
            <button
              type="button"
              onClick={() => {
                invalidateRpcCache("sessions.list");
                void refetchSessions();
              }}
              className="p-0.5 rounded hover:bg-bg-card-hover text-text-muted hover:text-text-secondary transition-colors"
              title="Refresh"
              aria-label="Refresh list"
            >
              <SlidersHorizontal size={12} />
            </button>
          </div>

          {/* ── Session / Citizen List ──────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {!showCitizens ? (
              <>
                {sessionsLoading && sessions.length === 0 && (
                  <div className="flex items-center justify-center h-20">
                    <Loader2 size={16} className="animate-spin text-text-muted" />
                  </div>
                )}
                {!sessionsLoading && sessions.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-24 gap-2 text-center">
                    <MessageSquare size={20} className="text-text-muted" />
                    <p className="text-[11px] text-text-muted">No tasks yet</p>
                    <button
                      type="button"
                      onClick={() => void newConversation()}
                      className="text-[10px] text-accent underline"
                    >
                      Start one
                    </button>
                  </div>
                )}
                {sessions.map((s) => (
                  <div key={s.key} className="group relative">
                    <button
                      type="button"
                      onClick={() => switchSession(s.key)}
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${
                        activeKey === s.key
                          ? "bg-bg-card-hover text-text-primary"
                          : "text-text-secondary hover:bg-bg-card-hover"
                      }`}
                    >
                      <FileText size={14} className="text-text-muted shrink-0" />
                      <span className="text-[12px] truncate flex-1">{sessionLabel(s)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteKey(s.key);
                      }}
                      title="Delete session"
                      aria-label="Delete session"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded bg-danger/10 hover:bg-danger/20 text-danger opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <>
                {citizens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 gap-2 text-center">
                    <Bot size={20} className="text-text-muted" />
                    <p className="text-[11px] text-text-muted">No agents found</p>
                  </div>
                ) : (
                  citizens.map((c) => {
                    const cKey = `citizen:${c.id}`;
                    const isActive = activeKey === cKey;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => switchSession(cKey)}
                        className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${
                          isActive
                            ? "bg-accent/10 text-accent"
                            : "text-text-secondary hover:bg-bg-card-hover"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${isActive ? "bg-accent/20 text-accent" : "bg-bg-secondary text-text-muted"}`}
                        >
                          {c.name[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[12px] font-medium truncate ${isActive ? "text-accent" : "text-text-primary"}`}
                          >
                            {c.name}
                          </p>
                          <p className="text-[10px] text-text-muted truncate">{c.specialization}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div className="border-t border-border px-3 py-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                invalidateRpcCache("sessions.list");
                void refetchSessions();
              }}
              className="flex items-center gap-1.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
            >
              <RefreshCw size={10} />
              <span>Refresh</span>
            </button>
            <span className="text-[9px] text-text-muted/50">powered by HoC</span>
          </div>
        </>
      )}
    </aside>
  );
}
