import { Menu } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { CommandPalette } from "@/components/CommandPalette";
import { connectWs, onWsMessage, onWsStatus } from "@/lib/api";
import { rpc } from "@/lib/rpc";
import { useAgentStore, type Agent } from "@/stores/agents";
import { useGatewayStore } from "@/stores/gateway";
import { useRepublicStore, type Citizen } from "@/stores/republic";
import { useSessionStore, type Session } from "@/stores/sessions";
import { useSidebarStore } from "@/stores/sidebar";
import { Sidebar } from "./Sidebar";

export function DashboardLayout() {
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const { setConnected, setStatus } = useGatewayStore();
  const agentMode = useGatewayStore((s) => s.agentMode);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // ── Global Ctrl+K shortcut ──────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Initial domain hydration ────────────────────────────────────
  // Called once when WS connects; fills all domain stores so pages
  // read from Zustand instead of issuing independent useRpc() calls.
  // Also pushes counts into the gateway store so the sidebar metrics
  // (Ticker, StatBadges, MegaPanel) display real values.
  // In agent mode, skip Republic-specific RPCs (citizens, plugins, nodes).
  async function hydrateStores(isAgentMode: boolean) {
    const agentStore = useAgentStore.getState();
    const sessionStore = useSessionStore.getState();
    const republicStore = useRepublicStore.getState();
    const gatewayStore = useGatewayStore.getState();

    // In agent mode, only hydrate agents + sessions (skip Republic)
    if (isAgentMode) {
      const [agentsRes, sessionsRes] = await Promise.allSettled([
        rpc<{ agents: Agent[] }>("agents.list"),
        rpc<{ sessions: Session[] }>("sessions.list"),
      ]);

      let agentCount = 0;
      let sessionCount = 0;

      if (agentsRes.status === "fulfilled") {
        const res = agentsRes.value;
        const list = Array.isArray(res) ? (res as unknown as Agent[]) : (res?.agents ?? []);
        agentStore.setAgents(list);
        agentCount = list.length;
      } else {
        agentStore.setError("Failed to load agents");
      }

      if (sessionsRes.status === "fulfilled") {
        const res = sessionsRes.value;
        const list = Array.isArray(res) ? (res as unknown as Session[]) : (res?.sessions ?? []);
        sessionStore.setSessions(list);
        sessionCount = list.length;
      } else {
        sessionStore.setError("Failed to load sessions");
      }

      gatewayStore.setStatus({ agentCount, sessionCount });
      return;
    }

    // Full mode: Fire all 5 RPCs in parallel
    const [agentsRes, sessionsRes, citizensRes, pluginsRes, nodesRes] = await Promise.allSettled([
      rpc<{ agents: Agent[] }>("agents.list"),
      rpc<{ sessions: Session[] }>("sessions.list"),
      rpc<{ citizens: Citizen[]; total?: number }>("republic.population.list", { limit: 200 }),
      rpc<{ plugins: unknown[] }>("republic.plugins.list"),
      rpc<{ nodes: unknown[] }>("node.list"),
    ]);

    let agentCount = 0;
    let sessionCount = 0;
    let citizenCount = 0;
    let pluginCount = 0;
    let nodeCount = 0;

    // Agents
    if (agentsRes.status === "fulfilled") {
      const res = agentsRes.value;
      const list = Array.isArray(res) ? (res as unknown as Agent[]) : (res?.agents ?? []);
      agentStore.setAgents(list);
      agentCount = list.length;
    } else {
      agentStore.setError("Failed to load agents");
    }

    // Sessions
    if (sessionsRes.status === "fulfilled") {
      const res = sessionsRes.value;
      const list = Array.isArray(res) ? (res as unknown as Session[]) : (res?.sessions ?? []);
      sessionStore.setSessions(list);
      sessionCount = list.length;
    } else {
      sessionStore.setError("Failed to load sessions");
    }

    // Citizens / Population
    if (citizensRes.status === "fulfilled") {
      const res = citizensRes.value;
      if (res && typeof res === "object") {
        const list = Array.isArray(res)
          ? (res as unknown as Citizen[])
          : ((res as { citizens?: Citizen[] }).citizens ?? []);
        const total =
          typeof (res as { total?: number }).total === "number"
            ? (res as { total: number }).total
            : list.length;
        republicStore.setCitizens(list, total);
        citizenCount = total;
      }
    } else {
      republicStore.setError("Failed to load citizens");
    }

    // Plugins
    if (pluginsRes.status === "fulfilled") {
      const res = pluginsRes.value;
      const list = Array.isArray(res) ? res : (res?.plugins ?? []);
      pluginCount = list.length;
    }

    // Nodes
    if (nodesRes.status === "fulfilled") {
      const res = nodesRes.value;
      const list = Array.isArray(res) ? res : (res?.nodes ?? []);
      nodeCount = list.length;
    }

    // Push all counts into the gateway store for sidebar metrics
    gatewayStore.setStatus({
      agentCount,
      sessionCount,
      citizenCount,
      pluginCount,
      nodeCount,
    });
  }

  // ── Boot WebSocket connection + status tracking ─────────────────
  useEffect(() => {
    connectWs();
    const unsub = onWsStatus((connected, payload) => {
      setConnected(connected);
      if (connected && payload) {
        // Extract server info from the hello-ok payload structure
        const server = (payload as { server?: Record<string, unknown> }).server;
        const snapshot = (payload as { snapshot?: Record<string, unknown> }).snapshot ?? payload;
        const uptimeMs = Number((snapshot as Record<string, unknown>).uptimeMs ?? 0);
        const uptimeStr =
          uptimeMs > 0
            ? uptimeMs < 60_000
              ? `${Math.round(uptimeMs / 1000)}s`
              : uptimeMs < 3_600_000
                ? `${Math.round(uptimeMs / 60_000)}m`
                : `${(uptimeMs / 3_600_000).toFixed(1)}h`
            : "";

        // Detect agent mode from the server payload
        const isAgentMode = Boolean(server?.agentMode);

        setStatus({
          connected: true,
          url: String(server?.host ?? ""),
          version: String(server?.version ?? ""),
          uptime: uptimeStr,
          agentMode: isAgentMode,
        });
        // Hydrate domain stores on (re)connect — this also pushes counts
        hydrateStores(isAgentMode).catch(console.error);
      }
    });
    return unsub;
  }, [setConnected, setStatus]);

  // ── Subscribe to server-push events → update stores ────────────
  // Gateway emits `{ type: "event", event: "...", payload: ... }` frames.
  // Each subscription keeps store slices live without extra polling.
  // In agent mode, skip Republic citizen events.
  useEffect(() => {
    return onWsMessage((msg) => {
      if (msg.type !== "event") {
        return;
      }
      const event = msg.event as string | undefined;
      const payload = msg.payload as Record<string, unknown> | undefined;
      if (!event || !payload) {
        return;
      }

      const { upsertAgent, removeAgent } = useAgentStore.getState();
      const { upsertSession, removeSession } = useSessionStore.getState();

      switch (event) {
        // Agent events
        case "agent.created":
        case "agent.updated":
          upsertAgent(payload as Agent);
          break;
        case "agent.deleted":
          removeAgent(String(payload.id ?? ""));
          break;

        // Session events
        case "session.created":
        case "session.updated":
          // Gateway events carry 'key' as primary id on session payloads
          upsertSession(payload as Session);
          break;
        case "session.deleted":
          removeSession(String(payload.key ?? payload.id ?? ""));
          break;

        // Citizen events (skip in agent mode)
        case "republic.citizen.created":
        case "republic.citizen.updated":
          if (!agentMode) {
            const { upsertCitizen } = useRepublicStore.getState();
            upsertCitizen(payload as Citizen);
          }
          break;
        case "republic.citizen.deleted":
          if (!agentMode) {
            const { removeCitizen } = useRepublicStore.getState();
            removeCitizen(String(payload.id ?? ""));
          }
          break;

        default:
          break;
      }
    });
  }, [agentMode]);

  // ── Agent mode auto-redirect ────────────────────────────────────
  // When gateway is in agent mode, auto-redirect to the chat page.
  useEffect(() => {
    if (agentMode && location.pathname === "/") {
      navigate("/chat", { replace: true });
    }
  }, [agentMode, location.pathname, navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <Sidebar onOpenPalette={openPalette} />
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — mobile glass floating header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 glass-thick border-b-0 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-glass-thin transition-all duration-200"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold gradient-text">HoC</span>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
