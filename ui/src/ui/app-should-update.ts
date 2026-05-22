/**
 * shouldUpdate() Performance Guard for OpenClawApp
 *
 * Maps every @state() property to the tab(s) that display it.
 * When a property changes that belongs to an inactive tab, the render is skipped.
 * This prevents the 2,300-line renderApp() from re-evaluating on every background poll.
 */

import type { Tab } from "./navigation.ts";

// ─── Properties that ALWAYS trigger a render (shell, auth, navigation) ───

const ALWAYS_RENDER: ReadonlySet<string> = new Set([
  // Shell / chrome
  "tab",
  "connected",
  "password",
  "lastError",
  "theme",
  "themeResolved",
  "hello",
  "settings",
  "onboarding",
  "eventLog",
  "basePath",
  // Navigation
  "pendingGatewayUrl",
  // Sidebar
  "sidebarOpen",
  "sidebarContent",
  "sidebarError",
  "splitRatio",
  // Assistant identity
  "assistantName",
  "assistantAvatar",
  "assistantAgentId",
  // Exec-approval overlay — can appear on ANY tab
  "execApproval",
]);

// ─── Tab → property-prefix mapping ──────────────────────────────

/**
 * Each entry maps a tab name to the state property prefixes it uses.
 * If a changed property starts with any of these prefixes, it belongs to that tab.
 */
const TAB_PROPERTY_PREFIXES: ReadonlyMap<Tab, readonly string[]> = new Map<Tab, readonly string[]>([
  // Chat
  [
    "chat",
    [
      "chatLoading",
      "chatSending",
      "chatMessage",
      "chatMessages",
      "chatToolMessages",
      "chatStream",
      "chatRunId",
      "chatAvatarUrl",
      "chatThinkingLevel",
      "chatQueue",
      "chatAttachments",
      "chatModels",
      "chatActiveModel",
      "chatNewMessagesBelow",
      "compactionStatus",
      "chatStreamStartedAt",
    ],
  ],

  // Control group
  ["overview", ["presenceLoading", "presenceEntries", "presenceError", "presenceStatus"]],
  [
    "channels",
    [
      "channelsLoading",
      "channelsSnapshot",
      "channelsError",
      "channelsLastSuccess",
      "whatsapp",
      "nostrProfile",
    ],
  ],
  // Instances tab shows presence beacons — not device pairings
  ["instances", ["presenceLoading", "presenceEntries", "presenceError", "presenceStatus"]],
  [
    "sessions",
    ["sessionsLoading", "sessionsResult", "sessionsError", "sessionsFilter", "sessionsInclude"],
  ],
  [
    "usage",
    [
      "usageLoading",
      "usageResult",
      "usageCost",
      "usageError",
      "usageStart",
      "usageEnd",
      "usageSelected",
      "usageChart",
      "usageDaily",
      "usageTimeSeries",
      "usageSessionLogs",
      "usageQuery",
      "usageSession",
      "usageRecent",
      "usageTimeZone",
      "usageContext",
      "usageHeader",
      "usageVisible",
      "usageLogFilter",
    ],
  ],
  [
    "cron",
    ["cronLoading", "cronJobs", "cronStatus", "cronError", "cronForm", "cronRuns", "cronBusy"],
  ],

  // Agent group
  [
    "agents",
    [
      "agentsLoading",
      "agentsList",
      "agentsError",
      "agentsSelected",
      "agentsPanel",
      "agentFiles",
      "agentFile",
      "agentIdentity",
      "agentSkills",
    ],
  ],
  [
    "skills",
    [
      "skillsLoading",
      "skillsReport",
      "skillsError",
      "skillsFilter",
      "skillEdits",
      "skillsBusy",
      "skillMessages",
    ],
  ],
  ["nodes", ["nodesLoading", "nodes"]],

  // Infrastructure group
  [
    "cluster",
    [
      "clusterLoading",
      "clusterError",
      "gatewayPeers",
      "gatewayRole",
      "clusterNodes",
      "dockerContainers",
      "dockerAvailable",
      "runtimes",
      "n8nStatus",
      "federation",
    ],
  ],
  ["docker", ["clusterLoading", "dockerContainers", "dockerAvailable"]],
  [
    "clawrouter",
    [
      "clawrouterLoading",
      "clawrouterConfig",
      "clawrouterModels",
      "clawrouterBalance",
      "clawrouterHealthy",
      "clawrouterStats",
      "clawrouterSection",
      "clawrouterModelSort",
      "clawrouterModelSearch",
    ],
  ],
  ["companion", ["companionLoading", "companionStatus", "companionError"]],
  // Plugins tab state all starts with republicPlugins
  ["plugins", ["republicPlugins"]],
  ["manus", ["republicManus"]],
  ["lovable", ["republicLovable"]],
  // Local compute tabs
  ["bitnet", ["republicLocalCompute", "republicDownloadedBitnetModels", "republicLocalInstances"]],
  ["lmstudio", ["republicLocalCompute", "republicLocalInstances"]],
  ["ollama", ["republicLocalCompute", "republicLocalInstances"]],

  // Civilization group (all share the republic prefix)
  ["population", ["republicPopulation", "republicCitizen", "republicSelected"]],
  ["government", ["republicGovernment"]],
  ["economy", ["republicEconomy", "republicTreasury"]],
  ["simulation", ["republicSimulation", "republicEventQueue", "republicMode"]],
  ["technology", ["republicTech", "republicAtlantis", "republicML", "republicQuantum"]],
  ["grid", ["republicGrid"]],

  // Intelligence group
  ["neural", ["republicGenome", "republicSelectedGenome"]],
  ["metacognition", ["republicMetacognition"]],
  ["reasoning", ["republicReasoning"]],
  ["dreams", ["republicDream", "republicSharedDreams"]],
  ["narrative", ["republicNarrative"]],
  ["memory", ["republicMemory", "republicCollective"]],
  ["diplomacy", ["republicDiplomacy"]],
  ["resilience", ["republicResilience"]],
  ["worldintel", ["republicWorldIntel"]],
  ["tacticalmap", ["republicWorldIntel"]],

  // Creative group
  [
    "avatar",
    [
      "avatarLoading",
      "avatarSection",
      "avatarSessions",
      "avatarActive",
      "avatarMessages",
      "avatarDraft",
      "avatarFace",
      "avatarPersonality",
      "avatarDiagnostics",
      "avatarSending",
    ],
  ],
  ["productions", ["republicProduction"]],
  ["aistore", ["republicAIStore"]],
  ["mediastudio", ["republicMediaStudio"]],

  // DevOps group
  ["development", ["republicDev"]],
  [
    "studio",
    [
      "studioOpen",
      "studioActive",
      "studioPreview",
      "studioBottom",
      "studioTerminal",
      "studioAi",
      "studioGsd",
      "studioSidebar",
      "republicDev",
    ],
  ],
  ["education", ["republicEducation"]],
  ["curriculum", ["republicEducation"]],
  ["execution", ["republicExecution"]],

  // Settings group
  ["config", ["config"]],
  [
    "debug",
    ["debugLoading", "debugStatus", "debugHealth", "debugModels", "debugHeartbeat", "debugCall"],
  ],
  [
    "logs",
    [
      "logsLoading",
      "logsError",
      "logsFile",
      "logsEntries",
      "logsFilter",
      "logsLevel",
      "logsAuto",
      "logsTruncated",
      "logsCursor",
      "logsLast",
      "logsLimit",
      "logsMax",
      "logsAtBottom",
    ],
  ],
  // Self-contained tabs — no app-level reactive state; empty prefix array so the
  // safety fallback in shouldAppUpdate always allows re-renders while these are active.
  ["supabase", []],
  ["resources", []],
  ["preview-esm", ["previewEngine"]],
  ["preview-local", ["previewEngine"]],
  ["preview-webcontainer", ["previewEngine"]],
]);

// ─── Public API ─────────────────────────────────────────────────

/**
 * Determine whether a Lit re-render is needed based on which @state() properties changed.
 *
 * Returns `true` if any changed property is:
 *   1. In the ALWAYS_RENDER set (shell/nav/auth)
 *   2. Belongs to the currently active tab
 *   3. Not mapped to any tab (safety: unknown props always render)
 */
export function shouldAppUpdate(changed: Map<PropertyKey, unknown>, activeTab: Tab): boolean {
  // Get the prefixes for the active tab
  const activePrefixes = TAB_PROPERTY_PREFIXES.get(activeTab);

  for (const key of changed.keys()) {
    const prop = String(key);

    // Always-render properties
    if (ALWAYS_RENDER.has(prop)) {
      return true;
    }

    // Check if this property belongs to the active tab
    if (activePrefixes) {
      for (const prefix of activePrefixes) {
        if (prop.startsWith(prefix)) {
          return true;
        }
      }
    }

    // Safety: if a property isn't mapped to ANY tab, always render
    // (prevents silent regressions for new state properties)
    let mapped = false;
    for (const [, prefixes] of TAB_PROPERTY_PREFIXES) {
      for (const prefix of prefixes) {
        if (prop.startsWith(prefix)) {
          mapped = true;
          break;
        }
      }
      if (mapped) {
        break;
      }
    }

    if (!mapped) {
      // Unknown property — render to be safe
      return true;
    }
  }

  return false;
}
