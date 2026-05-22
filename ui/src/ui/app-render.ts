import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import type { RepublicState } from "./controllers/republic.ts";
import type { UsageState } from "./controllers/usage.ts";
import type { Tab } from "./navigation.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChatAvatar } from "./app-chat.ts";
import { renderChatControls, renderTab, renderThemeToggle } from "./app-render.helpers.ts";
import { loadAgentFileContent, loadAgentFiles, saveAgentFile } from "./controllers/agent-files.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import {
  applyConfig,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config.ts";
import {
  loadCronRuns,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
} from "./controllers/cron.ts";
import { loadDebug, callDebugMethod } from "./controllers/debug.ts";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices.ts";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions.ts";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills.ts";
import { loadUsage, loadSessionTimeSeries, loadSessionLogs } from "./controllers/usage.ts";
import { icons } from "./icons.ts";
import { normalizeBasePath, TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation.ts";
import { renderDevStudio } from "./views/dev-studio.ts";
import { renderEsmPreview } from "./views/preview-esm.js";
import { renderLocalPreview } from "./views/preview-local.js";
import { renderWebContainerPreview } from "./views/preview-webcontainer.js";

// Module-scope debounce for usage date changes (avoids type-unsafe hacks on state object)
let usageDateDebounceTimeout: number | null = null;
const debouncedLoadUsage = (state: UsageState) => {
  if (usageDateDebounceTimeout) {
    clearTimeout(usageDateDebounceTimeout);
  }
  usageDateDebounceTimeout = window.setTimeout(() => void loadUsage(state), 400);
};
import type { CompanionState } from "./controllers/companion.ts";
import type { TacticalMapProps } from "./views/tacticalmap-view.ts";
import { sendCitizenMessage, clearCitizenChatHistory } from "./controllers/citizen-chat.ts";
import { loadCompanionStatus, pingCompanion } from "./controllers/companion.ts";
import {
  loadGenomeDetail,
  loadMemory,
  loadEducation,
  loadDevProjects,
  loadDevProjectDetail,
  downloadDevProject,
  clearDevProjects,
  loadDevProjectFile,
  downloadSingleFile,
  loadExecution,
  loadGenomePool,
  loadAIStore,
  loadProductions,
  readProductionFile,
  writeProductionFile,
  deleteProduction,
  loadCognitive,
  loadPlugins,
  activatePluginAction,
  deactivatePluginAction,
  scanPluginsAction,
  loadManus,
  startManusTraining,
  startManusEval,
  cancelManusJob,
  loadLovable,
  startLovableClone,
  cancelLovableJob,
  loadWorldIntel,
  worldIntelControl,
  loadMediaStudio,
  generateMedia,
} from "./controllers/republic.ts";
import {
  getDir,
  getLocale,
  setLocale,
  getAvailableLocales,
  getLocaleDisplayName,
  type Locale,
} from "./i18n.ts";
import { renderAgents } from "./views/agents.ts";
import { renderAIStore } from "./views/aistore-view.ts";
import { renderAvatar } from "./views/avatar.ts";
import { renderChannels } from "./views/channels.ts";
import { renderChat } from "./views/chat.ts";
import { renderCitizenActions } from "./views/citizen-actions.ts";
import { renderClawRouter } from "./views/clawrouter.ts";
import { renderCluster } from "./views/cluster.ts";
import { renderCompanion } from "./views/companion.ts";
import { renderConfig } from "./views/config.ts";
import { renderCron } from "./views/cron.ts";
import { renderDebug } from "./views/debug.ts";
import { renderDevProjects } from "./views/dev-projects.ts";
import { renderDiplomacy } from "./views/diplomacy-view.ts";
import { renderDreams } from "./views/dreams-view.ts";
import { renderEconomy } from "./views/economy.ts";
import { renderEducationDashboard } from "./views/education-dashboard.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";
import { renderGovernment } from "./views/government.ts";
import { renderGrid } from "./views/grid.ts";
import { renderInstances } from "./views/instances.ts";
import { renderLogs } from "./views/logs.ts";
import { renderLovable } from "./views/lovable-view.ts";
import { renderManus } from "./views/manus-view.ts";
import { renderMediaStudio } from "./views/mediastudio-view.ts";
import { renderMemoryBrowser } from "./views/memory-browser.ts";
import { renderMetacognition } from "./views/metacognition-view.ts";
import { renderNarrative } from "./views/narrative-view.ts";
import { renderNeuralNetwork } from "./views/neural-network.ts";
import { renderNodes } from "./views/nodes.ts";
import { renderOverview } from "./views/overview.ts";
import { renderPlugins } from "./views/plugins-view.ts";
import { renderPopulation } from "./views/population.ts";
import { renderProductions } from "./views/productions-view.ts";
import { renderReasoning } from "./views/reasoning-view.ts";
import { renderResilience } from "./views/resilience-view.ts";
import { renderSessions } from "./views/sessions.ts";
import { renderSimulation } from "./views/simulation.ts";
import { renderSkills } from "./views/skills.ts";
import { renderTacticalMap, initTacticalMapGlobe } from "./views/tacticalmap-view.ts";
import { renderTechnology } from "./views/technology.ts";
import { renderUsage } from "./views/usage.ts";
import { renderWorldIntel, initGlobe, type IntelSignal } from "./views/worldintel-view.ts";
import "./views/docker-dashboard.ts";
import "./views/bitnet-dashboard.ts";
import "./views/lmstudio-dashboard.ts";
import "./views/ollama-dashboard.ts";
import "./views/curriculum-dashboard.ts";
import "./views/resource-manager.ts";

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  const chatDisabledReason = state.connected ? null : "Disconnected from gateway.";
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  // oxlint-disable-next-line no-unused-vars
  const basePath = normalizeBasePath(state.basePath ?? "");
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;

  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}" dir="${getDir()}">
      <header class="topbar">
        <div class="topbar-left">
          <button type="button"
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
            aria-label="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <svg viewBox="0 0 36 36" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
                <rect width="36" height="36" rx="8" fill="var(--accent)"/>
                <text x="18" y="25" text-anchor="middle" font-family="'Space Grotesk', sans-serif" font-weight="700" font-size="18" fill="#fff" letter-spacing="-1">HoC</text>
              </svg>
            </div>
            <div class="brand-text">
              <div class="brand-title">HoC</div>
              <div class="brand-sub">Dashboard</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>Health</span>
            <span class="mono">${state.connected ? "OK" : "Offline"}</span>
          </div>
          ${renderThemeToggle(state)}
          <select
            class="locale-select"
            @change=${(e: Event) => {
              const locale = (e.target as HTMLSelectElement).value as Locale;
              void setLocale(locale).then(() => state.applySettings({ ...state.settings }));
            }}
            title="Language"
            aria-label="Language"
          >
            ${getAvailableLocales().map(
              (l) => html`
              <option value=${l} ?selected=${getLocale() === l}>${getLocaleDisplayName(l)}</option>
            `,
            )}
          </select>
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button type="button"
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${group.label}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab) => renderTab(state, tab))}
              </div>
            </div>
          `;
        })}
        <div class="nav-group nav-group--links">
          <div class="nav-label nav-label--static">
            <span class="nav-label__text">Resources</span>
          </div>
          <div class="nav-group__items">
            <a
              class="nav-item nav-item--external"
              href="https://docs.hoc.ai"
              target="_blank"
              rel="noreferrer"
              title="Docs (opens in new tab)"
            >
              <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
              <span class="nav-item__text">Docs</span>
            </a>
          </div>
        </div>
      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            ${state.tab === "usage" ? nothing : html`<div class="page-title">${titleForTab(state.tab)}</div>`}
            ${state.tab === "usage" ? nothing : html`<div class="page-sub">${subtitleForTab(state.tab)}</div>`}
          </div>
          <div class="page-meta">
            ${
              state.lastError
                ? html`<div class="pill danger" style="display:flex;align-items:center;gap:0.4rem;max-width:400px">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${state.lastError}</span>
                  <button type="button"
                    @click=${() => {
                      state.lastError = null;
                    }}
                    style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;font-size:1rem;opacity:0.7;flex-shrink:0"
                    title="Dismiss error"
                    aria-label="Dismiss error"
                  >×</button>
                </div>`
                : nothing
            }
            ${isChat ? renderChatControls(state) : nothing}
          </div>
        </section>

        ${
          state.tab === "overview"
            ? renderOverview({
                connected: state.connected,
                hello: state.hello,
                settings: state.settings,
                password: state.password,
                lastError: state.lastError,
                presenceCount,
                sessionsCount,
                cronEnabled: state.cronStatus?.enabled ?? null,
                cronNext,
                lastChannelsRefresh: state.channelsLastSuccess,
                onSettingsChange: (next) => state.applySettings(next),
                onPasswordChange: (next) => (state.password = next),
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.resetToolStream();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                },
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
                onNavigate: (tab) => state.setTab(tab as Tab),
              })
            : nothing
        }

        ${
          state.tab === "channels"
            ? renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                whatsappMessage: state.whatsappLoginMessage,
                whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
                whatsappConnected: state.whatsappLoginConnected,
                whatsappBusy: state.whatsappBusy,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                onRefresh: (probe) => loadChannels(state, probe),
                onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId, profile) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field, value) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
              })
            : nothing
        }

        ${
          state.tab === "instances"
            ? renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                statusMessage: state.presenceStatus,
                onRefresh: () => loadPresence(state),
              })
            : nothing
        }

        ${
          state.tab === "sessions"
            ? renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onDelete: (key) => deleteSession(state, key),
              })
            : nothing
        }

        ${
          state.tab === "usage"
            ? renderUsage({
                loading: state.usageLoading,
                error: state.usageError,
                startDate: state.usageStartDate,
                endDate: state.usageEndDate,
                sessions: state.usageResult?.sessions ?? [],
                sessionsLimitReached: (state.usageResult?.sessions?.length ?? 0) >= 1000,
                totals: state.usageResult?.totals ?? null,
                aggregates: state.usageResult?.aggregates ?? null,
                costDaily: state.usageCostSummary?.daily ?? [],
                selectedSessions: state.usageSelectedSessions,
                selectedDays: state.usageSelectedDays,
                selectedHours: state.usageSelectedHours,
                chartMode: state.usageChartMode,
                dailyChartMode: state.usageDailyChartMode,
                timeSeriesMode: state.usageTimeSeriesMode,
                timeSeriesBreakdownMode: state.usageTimeSeriesBreakdownMode,
                timeSeries: state.usageTimeSeries,
                timeSeriesLoading: state.usageTimeSeriesLoading,
                sessionLogs: state.usageSessionLogs,
                sessionLogsLoading: state.usageSessionLogsLoading,
                sessionLogsExpanded: state.usageSessionLogsExpanded,
                logFilterRoles: state.usageLogFilterRoles,
                logFilterTools: state.usageLogFilterTools,
                logFilterHasTools: state.usageLogFilterHasTools,
                logFilterQuery: state.usageLogFilterQuery,
                query: state.usageQuery,
                queryDraft: state.usageQueryDraft,
                sessionSort: state.usageSessionSort,
                sessionSortDir: state.usageSessionSortDir,
                recentSessions: state.usageRecentSessions,
                sessionsTab: state.usageSessionsTab,
                visibleColumns:
                  state.usageVisibleColumns as import("./views/usage.ts").UsageColumnId[],
                timeZone: state.usageTimeZone,
                contextExpanded: state.usageContextExpanded,
                headerPinned: state.usageHeaderPinned,
                onStartDateChange: (date) => {
                  state.usageStartDate = date;
                  state.usageSelectedDays = [];
                  state.usageSelectedHours = [];
                  state.usageSelectedSessions = [];
                  debouncedLoadUsage(state);
                },
                onEndDateChange: (date) => {
                  state.usageEndDate = date;
                  state.usageSelectedDays = [];
                  state.usageSelectedHours = [];
                  state.usageSelectedSessions = [];
                  debouncedLoadUsage(state);
                },
                onRefresh: () => loadUsage(state),
                onTimeZoneChange: (zone) => {
                  state.usageTimeZone = zone;
                },
                onToggleContextExpanded: () => {
                  state.usageContextExpanded = !state.usageContextExpanded;
                },
                onToggleSessionLogsExpanded: () => {
                  state.usageSessionLogsExpanded = !state.usageSessionLogsExpanded;
                },
                onLogFilterRolesChange: (next) => {
                  state.usageLogFilterRoles = next;
                },
                onLogFilterToolsChange: (next) => {
                  state.usageLogFilterTools = next;
                },
                onLogFilterHasToolsChange: (next) => {
                  state.usageLogFilterHasTools = next;
                },
                onLogFilterQueryChange: (next) => {
                  state.usageLogFilterQuery = next;
                },
                onLogFilterClear: () => {
                  state.usageLogFilterRoles = [];
                  state.usageLogFilterTools = [];
                  state.usageLogFilterHasTools = false;
                  state.usageLogFilterQuery = "";
                },
                onToggleHeaderPinned: () => {
                  state.usageHeaderPinned = !state.usageHeaderPinned;
                },
                onSelectHour: (hour, shiftKey) => {
                  if (shiftKey && state.usageSelectedHours.length > 0) {
                    const allHours = Array.from({ length: 24 }, (_, i) => i);
                    const lastSelected =
                      state.usageSelectedHours[state.usageSelectedHours.length - 1];
                    const lastIdx = allHours.indexOf(lastSelected);
                    const thisIdx = allHours.indexOf(hour);
                    if (lastIdx !== -1 && thisIdx !== -1) {
                      const [start, end] =
                        lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                      const range = allHours.slice(start, end + 1);
                      state.usageSelectedHours = [
                        ...new Set([...state.usageSelectedHours, ...range]),
                      ];
                    }
                  } else {
                    if (state.usageSelectedHours.includes(hour)) {
                      state.usageSelectedHours = state.usageSelectedHours.filter((h) => h !== hour);
                    } else {
                      state.usageSelectedHours = [...state.usageSelectedHours, hour];
                    }
                  }
                },
                onQueryDraftChange: (query) => {
                  state.usageQueryDraft = query;
                  if (state.usageQueryDebounceTimer) {
                    window.clearTimeout(state.usageQueryDebounceTimer);
                  }
                  state.usageQueryDebounceTimer = window.setTimeout(() => {
                    state.usageQuery = state.usageQueryDraft;
                    state.usageQueryDebounceTimer = null;
                  }, 250);
                },
                onApplyQuery: () => {
                  if (state.usageQueryDebounceTimer) {
                    window.clearTimeout(state.usageQueryDebounceTimer);
                    state.usageQueryDebounceTimer = null;
                  }
                  state.usageQuery = state.usageQueryDraft;
                },
                onClearQuery: () => {
                  if (state.usageQueryDebounceTimer) {
                    window.clearTimeout(state.usageQueryDebounceTimer);
                    state.usageQueryDebounceTimer = null;
                  }
                  state.usageQueryDraft = "";
                  state.usageQuery = "";
                },
                onSessionSortChange: (sort) => {
                  state.usageSessionSort = sort;
                },
                onSessionSortDirChange: (dir) => {
                  state.usageSessionSortDir = dir;
                },
                onSessionsTabChange: (tab) => {
                  state.usageSessionsTab = tab;
                },
                onToggleColumn: (column) => {
                  if (state.usageVisibleColumns.includes(column)) {
                    state.usageVisibleColumns = state.usageVisibleColumns.filter(
                      (entry) => entry !== column,
                    );
                  } else {
                    state.usageVisibleColumns = [...state.usageVisibleColumns, column];
                  }
                },
                onSelectSession: (key, shiftKey) => {
                  state.usageTimeSeries = null;
                  state.usageSessionLogs = null;
                  state.usageRecentSessions = [
                    key,
                    ...state.usageRecentSessions.filter((entry) => entry !== key),
                  ].slice(0, 8);

                  if (shiftKey && state.usageSelectedSessions.length > 0) {
                    // Shift-click: select range from last selected to this session
                    // Sort sessions same way as displayed (by tokens or cost descending)
                    const isTokenMode = state.usageChartMode === "tokens";
                    const sortedSessions = [...(state.usageResult?.sessions ?? [])].toSorted(
                      (a, b) => {
                        const valA = isTokenMode
                          ? (a.usage?.totalTokens ?? 0)
                          : (a.usage?.totalCost ?? 0);
                        const valB = isTokenMode
                          ? (b.usage?.totalTokens ?? 0)
                          : (b.usage?.totalCost ?? 0);
                        return valB - valA;
                      },
                    );
                    const allKeys = sortedSessions.map((s) => s.key);
                    const lastSelected =
                      state.usageSelectedSessions[state.usageSelectedSessions.length - 1];
                    const lastIdx = allKeys.indexOf(lastSelected);
                    const thisIdx = allKeys.indexOf(key);
                    if (lastIdx !== -1 && thisIdx !== -1) {
                      const [start, end] =
                        lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                      const range = allKeys.slice(start, end + 1);
                      const newSelection = [...new Set([...state.usageSelectedSessions, ...range])];
                      state.usageSelectedSessions = newSelection;
                    }
                  } else {
                    // Regular click: focus a single session (so details always open).
                    // Click the focused session again to clear selection.
                    if (
                      state.usageSelectedSessions.length === 1 &&
                      state.usageSelectedSessions[0] === key
                    ) {
                      state.usageSelectedSessions = [];
                    } else {
                      state.usageSelectedSessions = [key];
                    }
                  }

                  // Load timeseries/logs only if exactly one session selected
                  if (state.usageSelectedSessions.length === 1) {
                    void loadSessionTimeSeries(state, state.usageSelectedSessions[0]);
                    void loadSessionLogs(state, state.usageSelectedSessions[0]);
                  }
                },
                onSelectDay: (day, shiftKey) => {
                  if (shiftKey && state.usageSelectedDays.length > 0) {
                    // Shift-click: select range from last selected to this day
                    const allDays = (state.usageCostSummary?.daily ?? []).map((d) => d.date);
                    const lastSelected =
                      state.usageSelectedDays[state.usageSelectedDays.length - 1];
                    const lastIdx = allDays.indexOf(lastSelected);
                    const thisIdx = allDays.indexOf(day);
                    if (lastIdx !== -1 && thisIdx !== -1) {
                      const [start, end] =
                        lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                      const range = allDays.slice(start, end + 1);
                      // Merge with existing selection
                      const newSelection = [...new Set([...state.usageSelectedDays, ...range])];
                      state.usageSelectedDays = newSelection;
                    }
                  } else {
                    // Regular click: toggle single day
                    if (state.usageSelectedDays.includes(day)) {
                      state.usageSelectedDays = state.usageSelectedDays.filter((d) => d !== day);
                    } else {
                      state.usageSelectedDays = [day];
                    }
                  }
                },
                onChartModeChange: (mode) => {
                  state.usageChartMode = mode;
                },
                onDailyChartModeChange: (mode) => {
                  state.usageDailyChartMode = mode;
                },
                onTimeSeriesModeChange: (mode) => {
                  state.usageTimeSeriesMode = mode;
                },
                onTimeSeriesBreakdownChange: (mode) => {
                  state.usageTimeSeriesBreakdownMode = mode;
                },
                onClearDays: () => {
                  state.usageSelectedDays = [];
                },
                onClearHours: () => {
                  state.usageSelectedHours = [];
                },
                onClearSessions: () => {
                  state.usageSelectedSessions = [];
                  state.usageTimeSeries = null;
                  state.usageSessionLogs = null;
                },
                onClearFilters: () => {
                  state.usageSelectedDays = [];
                  state.usageSelectedHours = [];
                  state.usageSelectedSessions = [];
                  state.usageTimeSeries = null;
                  state.usageSessionLogs = null;
                },
              })
            : nothing
        }

        ${
          state.tab === "cron"
            ? renderCron({
                basePath: state.basePath,
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: state.cronJobs,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                onFormChange: (patch) => (state.cronForm = { ...state.cronForm, ...patch }),
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job) => runCronJob(state, job),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: (jobId) => loadCronRuns(state, jobId),
              })
            : nothing
        }

        ${
          state.tab === "agents"
            ? renderAgents({
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                selectedAgentId: resolvedAgentId,
                activePanel: state.agentsPanel,
                configForm: configValue,
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                channelsLoading: state.channelsLoading,
                channelsError: state.channelsError,
                channelsSnapshot: state.channelsSnapshot,
                channelsLastSuccess: state.channelsLastSuccess,
                cronLoading: state.cronLoading,
                cronStatus: state.cronStatus,
                cronJobs: state.cronJobs,
                cronError: state.cronError,
                agentFilesLoading: state.agentFilesLoading,
                agentFilesError: state.agentFilesError,
                agentFilesList: state.agentFilesList,
                agentFileActive: state.agentFileActive,
                agentFileContents: state.agentFileContents,
                agentFileDrafts: state.agentFileDrafts,
                agentFileSaving: state.agentFileSaving,
                agentIdentityLoading: state.agentIdentityLoading,
                agentIdentityError: state.agentIdentityError,
                agentIdentityById: state.agentIdentityById,
                agentSkillsLoading: state.agentSkillsLoading,
                agentSkillsReport: state.agentSkillsReport,
                agentSkillsError: state.agentSkillsError,
                agentSkillsAgentId: state.agentSkillsAgentId,
                skillsFilter: state.skillsFilter,
                onRefresh: async () => {
                  await loadAgents(state);
                  const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                },
                onSelectAgent: (agentId) => {
                  if (state.agentsSelectedId === agentId) {
                    return;
                  }
                  state.agentsSelectedId = agentId;
                  state.agentFilesList = null;
                  state.agentFilesError = null;
                  state.agentFilesLoading = false;
                  state.agentFileActive = null;
                  state.agentFileContents = {};
                  state.agentFileDrafts = {};
                  state.agentSkillsReport = null;
                  state.agentSkillsError = null;
                  state.agentSkillsAgentId = null;
                  void loadAgentIdentity(state, agentId);
                  if (state.agentsPanel === "files") {
                    void loadAgentFiles(state, agentId);
                  }
                  if (state.agentsPanel === "skills") {
                    void loadAgentSkills(state, agentId);
                  }
                },
                onSelectPanel: (panel) => {
                  state.agentsPanel = panel;
                  if (panel === "files" && resolvedAgentId) {
                    if (state.agentFilesList?.agentId !== resolvedAgentId) {
                      state.agentFilesList = null;
                      state.agentFilesError = null;
                      state.agentFileActive = null;
                      state.agentFileContents = {};
                      state.agentFileDrafts = {};
                      void loadAgentFiles(state, resolvedAgentId);
                    }
                  }
                  if (panel === "skills") {
                    if (resolvedAgentId) {
                      void loadAgentSkills(state, resolvedAgentId);
                    }
                  }
                  if (panel === "channels") {
                    void loadChannels(state, false);
                  }
                  if (panel === "cron") {
                    void state.loadCron();
                  }
                },
                onLoadFiles: (agentId) => loadAgentFiles(state, agentId),
                onSelectFile: (name) => {
                  state.agentFileActive = name;
                  if (!resolvedAgentId) {
                    return;
                  }
                  void loadAgentFileContent(state, resolvedAgentId, name);
                },
                onFileDraftChange: (name, content) => {
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
                },
                onFileReset: (name) => {
                  const base = state.agentFileContents[name] ?? "";
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: base };
                },
                onFileSave: (name) => {
                  if (!resolvedAgentId) {
                    return;
                  }
                  const content =
                    state.agentFileDrafts[name] ?? state.agentFileContents[name] ?? "";
                  void saveAgentFile(state, resolvedAgentId, name, content);
                },
                onToolsProfileChange: (agentId, profile, clearAllow) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (profile) {
                    updateConfigFormValue(state, [...basePath, "profile"], profile);
                  } else {
                    removeConfigFormValue(state, [...basePath, "profile"]);
                  }
                  if (clearAllow) {
                    removeConfigFormValue(state, [...basePath, "allow"]);
                  }
                },
                onToolsOverridesChange: (agentId, alsoAllow, deny) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (alsoAllow.length > 0) {
                    updateConfigFormValue(state, [...basePath, "alsoAllow"], alsoAllow);
                  } else {
                    removeConfigFormValue(state, [...basePath, "alsoAllow"]);
                  }
                  if (deny.length > 0) {
                    updateConfigFormValue(state, [...basePath, "deny"], deny);
                  } else {
                    removeConfigFormValue(state, [...basePath, "deny"]);
                  }
                },
                onConfigReload: () => loadConfig(state),
                onConfigSave: () => saveConfig(state),
                onChannelsRefresh: () => loadChannels(state, false),
                onCronRefresh: () => state.loadCron(),
                onSkillsFilterChange: (next) => (state.skillsFilter = next),
                onSkillsRefresh: () => {
                  if (resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                },
                onAgentSkillToggle: (agentId, skillName, enabled) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const entry = list[index] as { skills?: unknown };
                  const normalizedSkill = skillName.trim();
                  if (!normalizedSkill) {
                    return;
                  }
                  const allSkills =
                    state.agentSkillsReport?.skills?.map((skill) => skill.name).filter(Boolean) ??
                    [];
                  const existing = Array.isArray(entry.skills)
                    ? entry.skills.map((name) => String(name).trim()).filter(Boolean)
                    : undefined;
                  const base = existing ?? allSkills;
                  const next = new Set(base);
                  if (enabled) {
                    next.add(normalizedSkill);
                  } else {
                    next.delete(normalizedSkill);
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], [...next]);
                },
                onAgentSkillsClear: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  removeConfigFormValue(state, ["agents", "list", index, "skills"]);
                },
                onAgentSkillsDisableAll: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], []);
                },
                onModelChange: (agentId, modelId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "model"];
                  if (!modelId) {
                    removeConfigFormValue(state, basePath);
                    return;
                  }
                  const entry = list[index] as { model?: unknown };
                  const existing = entry?.model;
                  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                    const fallbacks = (existing as { fallbacks?: unknown }).fallbacks;
                    const next = {
                      primary: modelId,
                      ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
                    };
                    updateConfigFormValue(state, basePath, next);
                  } else {
                    updateConfigFormValue(state, basePath, modelId);
                  }
                },
                onModelFallbacksChange: (agentId, fallbacks) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "model"];
                  const entry = list[index] as { model?: unknown };
                  const normalized = fallbacks.map((name) => name.trim()).filter(Boolean);
                  const existing = entry.model;
                  const resolvePrimary = () => {
                    if (typeof existing === "string") {
                      return existing.trim() || null;
                    }
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const primary = (existing as { primary?: unknown }).primary;
                      if (typeof primary === "string") {
                        const trimmed = primary.trim();
                        return trimmed || null;
                      }
                    }
                    return null;
                  };
                  const primary = resolvePrimary();
                  if (normalized.length === 0) {
                    if (primary) {
                      updateConfigFormValue(state, basePath, primary);
                    } else {
                      removeConfigFormValue(state, basePath);
                    }
                    return;
                  }
                  const next = primary
                    ? { primary, fallbacks: normalized }
                    : { fallbacks: normalized };
                  updateConfigFormValue(state, basePath, next);
                },
              })
            : nothing
        }

        ${
          state.tab === "skills"
            ? renderSkills({
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                populationStats: state.republicPopulationStats,
                onFilterChange: (next) => (state.skillsFilter = next),
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
                onEdit: (key, value) => updateSkillEdit(state, key, value),
                onSaveKey: (key) => saveSkillApiKey(state, key),
                onInstall: (skillKey, name, installId) =>
                  installSkill(state, skillKey, name, installId),
              })
            : nothing
        }

        ${
          state.tab === "nodes"
            ? renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              })
            : nothing
        }

        ${
          state.tab === "chat"
            ? renderChat({
                sessionKey: state.sessionKey,
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.chatAttachments = [];
                  state.chatStream = null;
                  state.chatStreamStartedAt = null;
                  state.chatRunId = null;
                  state.chatQueue = [];
                  state.resetToolStream();
                  state.resetChatScroll();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                  void loadChatHistory(state);
                  void refreshChatAvatar(state);
                },
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                loading: state.chatLoading,
                sending: state.chatSending,
                compactionStatus: state.compactionStatus,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: state.chatStreamStartedAt,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                sessions: state.sessionsResult,
                focusMode: chatFocus,
                onRefresh: () => {
                  state.resetToolStream();
                  return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
                },
                onToggleFocusMode: () => {
                  if (state.onboarding) {
                    return;
                  }
                  state.applySettings({
                    ...state.settings,
                    chatFocusMode: !state.settings.chatFocusMode,
                  });
                },
                onChatScroll: (event) => state.handleChatScroll(event),
                onDraftChange: (next) => (state.chatMessage = next),
                attachments: state.chatAttachments,
                onAttachmentsChange: (next) => (state.chatAttachments = next),
                onSend: () => state.handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void state.handleAbortChat(),
                onQueueRemove: (id) => state.removeQueuedMessage(id),
                onNewSession: () => state.handleSendChat("/new", { restoreDraft: true }),
                showNewMessages: state.chatNewMessagesBelow,
                onScrollToBottom: () => state.scrollToBottom(),
                // Sidebar props for tool output viewing
                sidebarOpen: state.sidebarOpen,
                sidebarContent: state.sidebarContent,
                sidebarError: state.sidebarError,
                splitRatio: state.splitRatio,
                onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
                onCloseSidebar: () => state.handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
              })
            : nothing
        }

        ${
          state.tab === "config"
            ? renderConfig({
                raw: state.configRaw,
                originalRaw: state.configRawOriginal,
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: state.configSearchQuery,
                activeSection: state.configActiveSection,
                activeSubsection: state.configActiveSubsection,
                onRawChange: (next) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode) => (state.configFormMode = mode),
                onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
                onSearchChange: (query) => (state.configSearchQuery = query),
                onSectionChange: (section) => {
                  state.configActiveSection = section;
                  state.configActiveSubsection = null;
                },
                onSubsectionChange: (section) => (state.configActiveSubsection = section),
                onReload: () => loadConfig(state),
                onSave: () => saveConfig(state),
                onApply: () => applyConfig(state),
                onUpdate: () => runUpdate(state),
              })
            : nothing
        }

        ${
          state.tab === "debug"
            ? renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              })
            : nothing
        }

        ${
          state.tab === "logs"
            ? renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state, { reset: true }),
                onExport: (lines, label) => state.exportLogs(lines, label),
                onScroll: (event) => state.handleLogsScroll(event),
              })
            : nothing
        }

        ${
          state.tab === "population"
            ? renderPopulation({
                loading: state.republicPopulationLoading,
                stats: state.republicPopulationStats,
                citizens: state.republicCitizens,
                searchQuery: state.republicCitizenSearch,
                selectedSpecialization: state.republicCitizenFilter,
                page: state.republicCitizenPage,
                selectedCitizen: state.republicSelectedCitizen,
                onSearchChange: (q) => state.handleRepublicSetCitizenSearch(q),
                onSpecializationFilter: (s) => state.handleRepublicSetCitizenFilter(s),
                onPageChange: (p) => state.handleRepublicSetCitizenPage(p),
                onSelectCitizen: (c) => state.handleRepublicSelectCitizen(c),
                onViewMemory: (id) => state.handleRepublicViewMemory(id),
                onRefresh: () => state.handleRepublicLoadPopulation(),
                populationTab: state.republicPopulationTab || "Overview",
                onPopTabChange: (t) => state.handleRepublicSetPopulationTab(t),
                // Citizen chat
                chatHistory: state.citizenChatHistory,
                chatSending: state.citizenChatSending,
                chatError: state.citizenChatError,
                onSendMessage: (citizenId, message) => {
                  void sendCitizenMessage(
                    state as unknown as import("./controllers/citizen-chat.ts").CitizenChatState,
                    citizenId,
                    message,
                  );
                },
                onClearChat: (citizenId) => {
                  clearCitizenChatHistory(
                    state as unknown as import("./controllers/citizen-chat.ts").CitizenChatState,
                    citizenId,
                  );
                },
              })
            : nothing
        }

        ${
          state.tab === "government"
            ? renderGovernment({
                loading: state.republicGovernmentLoading,
                status: state.republicGovernmentStatus,
                activeSection: state.republicGovernmentSection,
                onSectionChange: (s) =>
                  state.handleRepublicSetGovernmentSection(
                    s as typeof state.republicGovernmentSection,
                  ),
                onHoldElection: (p) => state.handleRepublicHoldElection(p),
                onRefresh: () => state.handleRepublicLoadGovernment(),
              })
            : nothing
        }

        ${
          state.tab === "economy"
            ? renderEconomy({
                loading: state.republicEconomyLoading,
                treasury: state.republicTreasury,
                onToggleHarvester: (id, enabled) =>
                  state.handleRepublicToggleHarvester(id, enabled),
                onAdjustTaxRate: (r) => state.handleRepublicAdjustTaxRate(r),
                onRefresh: () => state.handleRepublicLoadEconomy(),
              })
            : nothing
        }

        ${
          state.tab === "simulation"
            ? renderSimulation({
                loading: state.republicSimulationLoading,
                stats: state.republicSimulationStatus as
                  | import("./views/simulation.ts").SimulationStats
                  | null,
                eventQueue:
                  state.republicEventQueue as import("./views/simulation.ts").ScheduledEvent[],
                mode: state.republicMode ?? "simulated",
                onStart: () => state.handleRepublicSimulationStart(),
                onStop: () => state.handleRepublicSimulationStop(),
                onPause: () => state.handleRepublicSimulationPause(),
                onSetTickRate: (r) => state.handleRepublicSimulationTickRate(r),
                onSetMode: (m) => state.handleRepublicSetMode(m),
                onRefresh: () => state.handleRepublicLoadSimulation(),
              })
            : nothing
        }

        ${
          state.tab === "technology"
            ? renderTechnology({
                loading: state.republicTechLoading,
                status:
                  state.republicAtlantis || state.republicML || state.republicQuantum
                    ? {
                        crystals:
                          ((state.republicAtlantis as unknown as Record<string, unknown>)
                            ?.crystals as import("./views/technology.ts").DataCrystal[]) ?? [],
                        library: ((state.republicAtlantis as unknown as Record<string, unknown>)
                          ?.library as import("./views/technology.ts").LibraryStats) ?? {
                          scrolls: 0,
                          codices: 0,
                          akashicEntries: 0,
                          totalKnowledge: 0,
                        },
                        energyNodes:
                          ((state.republicAtlantis as unknown as Record<string, unknown>)
                            ?.energyNodes as import("./views/technology.ts").EnergyNode[]) ?? [],
                        totalEnergyOutput:
                          ((state.republicAtlantis as unknown as Record<string, unknown>)
                            ?.totalEnergyOutput as number) ?? 0,
                        mlModels:
                          ((state.republicML as unknown as Record<string, unknown>)
                            ?.models as import("./views/technology.ts").MLModel[]) ?? [],
                        universes:
                          ((state.republicQuantum as unknown as Record<string, unknown>)
                            ?.universes as import("./views/technology.ts").QuantumUniverse[]) ?? [],
                      }
                    : null,
                activeSection: state.republicTechSection,
                onSectionChange: (s) =>
                  state.handleRepublicSetTechSection(s as typeof state.republicTechSection),
                onTrainModel: (m) =>
                  state.handleRepublicTrainModel(m as import("./republic-types.ts").MLModelName),
                onCreateUniverse: (name) => state.handleRepublicCreateUniverse(name),
                onBranchUniverse: (id) => state.handleRepublicBranchUniverse(id),
                onCollapseUniverse: (id) => state.handleRepublicCollapseUniverse(id),
                onRefresh: () => state.handleRepublicLoadTechnology(),
              })
            : nothing
        }

        ${
          state.tab === "grid"
            ? renderGrid({
                loading: state.republicGridLoading,
                status: state.republicGrid as import("./views/grid.ts").GridStatus | null,
                onAddSwarmObjective: (type, desc) =>
                  state.handleRepublicAddSwarmObjective(type, desc),
                onElectLeader: () => state.handleRepublicElectLeader(),
                onRefresh: () => state.handleRepublicLoadGrid(),
              })
            : nothing
        }

        ${
          state.tab === "neural"
            ? renderNeuralNetwork({
                loading: state.republicGenomeLoading,
                genomes: state.republicGenomePool,
                selectedGenomeId: state.republicSelectedGenomeId,
                network: state.republicGenomeNetwork,
                dna: state.republicGenomeDna,
                lineage: state.republicGenomeLineage,
                landscape: state.republicGenomeLandscape,
                onSelectGenome: (id) => void loadGenomeDetail(state, id),
                onRefresh: () => void loadGenomePool(state),
              })
            : nothing
        }

        ${
          state.tab === "education"
            ? renderEducationDashboard({
                loading: state.republicEducationLoading,
                education: state.republicEducation,
                onRefresh: () => void loadEducation(state),
              })
            : nothing
        }

        ${
          state.tab === "memory"
            ? renderMemoryBrowser({
                loading: state.republicMemoryLoading,
                memory: state.republicMemory,
                collective: state.republicCollective,
                citizenId: state.republicMemoryCitizenId,
                citizens: state.republicCitizens,
                activeSection:
                  ((state as unknown as { republicMemorySection?: string })
                    .republicMemorySection as import("./views/memory-browser.ts").MemorySection) ??
                  "episodic",
                searchQuery:
                  (state as unknown as { republicMemorySearchQuery?: string })
                    .republicMemorySearchQuery ?? "",
                onSectionChange: (s) => {
                  (state as unknown as Record<string, string>).republicMemorySection = s;
                },
                onCitizenChange: (id) => void loadMemory(state, id),
                onSearchChange: (query) => {
                  (state as unknown as Record<string, string>).republicMemorySearchQuery = query;
                },
                expandedMemoryId:
                  (state as unknown as { republicMemoryExpandedId?: string })
                    .republicMemoryExpandedId || null,
                onToggleMemory: (id) => {
                  const s = state as unknown as { republicMemoryExpandedId?: string | null };
                  s.republicMemoryExpandedId = s.republicMemoryExpandedId === id ? null : id;
                },
                onRefresh: () => {
                  if (state.republicMemoryCitizenId) {
                    void loadMemory(state, state.republicMemoryCitizenId);
                  }
                },
              })
            : nothing
        }

        ${
          state.tab === "development"
            ? renderDevProjects({
                loading: state.republicDevLoading,
                status: state.republicDevProjects,
                selectedProject: state.republicDevProjectDetail,
                detailLoading: state.republicDevProjectDetailLoading,
                fileContent: state.republicDevFileContent,
                fileLoading: state.republicDevFileLoading,
                onSelectProject: (projectId: string) => void loadDevProjectDetail(state, projectId),
                onCloseDetail: () => {
                  state.republicDevProjectDetail = null;
                  state.republicDevFileContent = null;
                },
                onRefresh: () => void loadDevProjects(state),
                onReRender: () => (state as unknown as { requestUpdate(): void }).requestUpdate(),
                onDownloadProject: (projectId: string) => void downloadDevProject(state, projectId),
                onClearAll: () => void clearDevProjects(state),
                onForceIdeate: async (config) => {
                  if (!state.client) {
                    return;
                  }
                  try {
                    await state.client.request("republic.dev.project.ideate", config ?? {});
                    await loadDevProjects(state);
                  } catch (e) {
                    console.error("Force ideate error", e);
                  }
                },
                onViewFile: (projectId: string, filePath: string) =>
                  void loadDevProjectFile(state, projectId, filePath),
                onCloseFile: () => {
                  state.republicDevFileContent = null;
                },
                onDownloadFile: (file) => downloadSingleFile(file),
              })
            : nothing
        }

        ${
          state.tab === "studio"
            ? renderDevStudio({
                loading: state.republicDevLoading,
                projects: state.republicDevProjects?.projects ?? [],
                selectedProject: state.republicDevProjectDetail,
                detailLoading: state.republicDevProjectDetailLoading,
                openFiles: state.studioOpenFiles,
                activeFile: state.studioActiveFile,
                fileContent: state.republicDevFileContent,
                fileLoading: state.republicDevFileLoading,
                fileDirty: false,
                previewMode: state.studioPreviewMode,
                previewUrl: state.studioPreviewUrl,
                previewRoutes: state.studioPreviewRoutes,
                previewActiveRoute: state.studioPreviewActiveRoute,
                previewDevice: state.studioPreviewDevice,
                previewInteractive: state.studioPreviewInteractive,
                bottomPanel: state.studioBottomPanel,
                terminalOutput: state.studioTerminalOutput,
                aiPrompt: state.studioAiPrompt,
                aiSending: state.studioAiSending,
                buildRunning: false,
                gsdTimeline: state.studioGsdTimeline,
                gsdTeam: state.studioGsdTeam,
                gsdQualityScore: state.studioGsdQualityScore,
                sidebarCollapsed: state.studioSidebarCollapsed,
                previewCollapsed: state.studioPreviewCollapsed,
                bottomCollapsed: state.studioBottomCollapsed,
                onSelectProject: (id: string) => void loadDevProjectDetail(state, id),
                onCloseProject: () => {
                  state.republicDevProjectDetail = null;
                  state.republicDevFileContent = null;
                  state.studioOpenFiles = [];
                  state.studioActiveFile = null;
                },
                onOpenFile: (pid: string, path: string) => {
                  const tabs = [...state.studioOpenFiles];
                  if (!tabs.find((f) => f.path === path)) {
                    const ext = path.split(".").pop()?.toLowerCase() ?? "";
                    tabs.push({ path, language: ext, dirty: false });
                    state.studioOpenFiles = tabs;
                  }
                  state.studioActiveFile = path;
                  void loadDevProjectFile(state, pid, path);
                },
                onCloseFile: (path: string) => {
                  const tabs = state.studioOpenFiles.filter((f) => f.path !== path);
                  state.studioOpenFiles = tabs;
                  if (state.studioActiveFile === path) {
                    state.studioActiveFile = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
                  }
                  state.republicDevFileContent = null;
                },
                onSaveFile: async (pid: string, path: string, content: string) => {
                  if (!state.client) {
                    return;
                  }
                  try {
                    await state.client.request("republic.dev.project.writeFile", {
                      projectId: pid,
                      filePath: path,
                      content,
                    });
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `💾 Saved ${path}`,
                    ];
                  } catch (e) {
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `❌ Save failed: ${e}`,
                    ];
                  }
                },
                onCreateFile: async (pid: string, path: string) => {
                  if (!state.client) {
                    return;
                  }
                  try {
                    await state.client.request("republic.dev.project.writeFile", {
                      projectId: pid,
                      filePath: path,
                      content: `// ${path}\n`,
                    });
                    await loadDevProjectDetail(state, pid);
                  } catch (e) {
                    console.error("Create file error", e);
                  }
                },
                onDeleteFile: async (pid: string, path: string) => {
                  if (!state.client) {
                    return;
                  }
                  try {
                    await state.client.request("republic.dev.project.deleteFile", {
                      projectId: pid,
                      filePath: path,
                    });
                    const tabs = state.studioOpenFiles.filter((f) => f.path !== path);
                    state.studioOpenFiles = tabs;
                    if (state.studioActiveFile === path) {
                      state.studioActiveFile = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
                    }
                    await loadDevProjectDetail(state, pid);
                  } catch (e) {
                    console.error("Delete file error", e);
                  }
                },
                onBuild: async (pid: string) => {
                  if (!state.client) {
                    return;
                  }
                  state.studioTerminalOutput = [
                    ...state.studioTerminalOutput,
                    `$ build ${pid}`,
                    "⏳ Building...",
                  ];
                  state.studioBottomPanel = "terminal";
                  state.studioBottomCollapsed = false;
                  try {
                    const res = (await state.client.request("republic.dev.project.build", {
                      projectId: pid,
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any;
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `✅ Build ${res.passed ? "PASSED" : "FAILED"} — score: ${Math.round((res.score as number) * 100)}%, ${res.issues} issues, ${res.autoFixed} auto-fixed`,
                    ];
                    await loadDevProjectDetail(state, pid);
                  } catch (e) {
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `❌ Build error: ${e}`,
                    ];
                  }
                },
                onRun: async (pid: string) => {
                  if (!state.client) {
                    return;
                  }
                  state.studioTerminalOutput = [
                    ...state.studioTerminalOutput,
                    `$ run ${pid}`,
                    "▶ Starting dev server...",
                  ];
                  state.studioBottomPanel = "terminal";
                  state.studioBottomCollapsed = false;
                  try {
                    const res = (await state.client.request("republic.dev.project.run", {
                      projectId: pid,
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any;
                    const testRes = res.testResults as Record<string, number>;
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `✅ Dev server running on ${res.url}`,
                      `🔨 Build: ${res.buildScore}% health${res.buildPassed ? " (passed)" : " (issues found)"}`,
                      `🧪 Tests: ${testRes.passed}/${testRes.total} passed, ${testRes.coverage}% coverage`,
                    ];
                    await loadDevProjectDetail(state, pid);
                  } catch (e) {
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `❌ Run error: ${e}`,
                    ];
                  }
                },
                onTest: async (pid: string) => {
                  if (!state.client) {
                    return;
                  }
                  state.studioTerminalOutput = [
                    ...state.studioTerminalOutput,
                    `$ test ${pid}`,
                    "🧪 Running tests...",
                  ];
                  state.studioBottomPanel = "terminal";
                  state.studioBottomCollapsed = false;
                  try {
                    const res = (await state.client.request("republic.dev.project.build", {
                      projectId: pid,
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any;
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `🧪 Tests: score ${Math.round((res.score as number) * 100)}%`,
                    ];
                    await loadDevProjectDetail(state, pid);
                  } catch (e) {
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `❌ Test error: ${e}`,
                    ];
                  }
                },
                onDeploy: async (pid: string) => {
                  if (!state.client) {
                    return;
                  }
                  state.studioTerminalOutput = [
                    ...state.studioTerminalOutput,
                    `$ deploy ${pid}`,
                    "🚀 Deploying to production...",
                  ];
                  state.studioBottomPanel = "terminal";
                  state.studioBottomCollapsed = false;
                  try {
                    const res = (await state.client.request("republic.dev.project.deploy", {
                      projectId: pid,
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any;
                    const dep = res.deployment as Record<string, unknown>;
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `✅ Deployed ${dep.version} to ${dep.environment}`,
                      `🌐 URL: ${dep.url}`,
                      `🔨 Build: ${res.buildScore}% health`,
                      `📦 Total deployments: ${res.totalDeployments}`,
                    ];
                    await loadDevProjectDetail(state, pid);
                  } catch (e) {
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `❌ Deploy error: ${e}`,
                    ];
                  }
                },
                onAiPrompt: async (pid: string, prompt: string) => {
                  if (!state.client) {
                    return;
                  }
                  state.studioAiSending = true;
                  state.studioTerminalOutput = [
                    ...state.studioTerminalOutput,
                    `🚀 GSD Army deploying for: "${prompt}"`,
                  ];
                  state.studioBottomPanel = "terminal";
                  state.studioBottomCollapsed = false;
                  try {
                    const res = (await state.client.request("republic.dev.gsd", {
                      prompt,
                      source: "webui",
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any;
                    const lines: string[] = [`👥 Team formed: ${res.teamSize} citizens`];
                    if (Array.isArray(res.team)) {
                      for (const m of res.team as {
                        name: string;
                        specialization: string;
                        role: string;
                      }[]) {
                        lines.push(`  → ${m.name} (${m.specialization}/${m.role})`);
                      }
                    }
                    lines.push(
                      `📁 ${res.filesGenerated} files generated, ${res.peerReviews} peer reviews, ${res.autoFixes} auto-fixes`,
                    );
                    lines.push(`✅ Quality: ${res.qualityScore}%`);
                    if (Array.isArray(res.timeline)) {
                      for (const ev of (res.timeline as { detail: string }[]).slice(-5)) {
                        lines.push(`  ${ev.detail}`);
                      }
                    }
                    state.studioTerminalOutput = [...state.studioTerminalOutput, ...lines];
                    state.studioGsdTeam = (res.team ?? []) as typeof state.studioGsdTeam;
                    state.studioGsdQualityScore = (res.qualityScore ?? 0) as number;
                    state.studioGsdTimeline = (res.timeline ??
                      []) as typeof state.studioGsdTimeline;
                    state.studioAiPrompt = "";
                    if (res.projectId) {
                      await loadDevProjectDetail(state, res.projectId as string);
                      try {
                        const routeRes = (await state.client.request(
                          "republic.dev.project.routes",
                          { projectId: res.projectId },
                        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                        )) as any;
                        state.studioPreviewRoutes = routeRes.routes;
                      } catch {
                        /* routes optional */
                      }
                    }
                  } catch (e) {
                    state.studioTerminalOutput = [
                      ...state.studioTerminalOutput,
                      `❌ GSD error: ${e}`,
                    ];
                  } finally {
                    state.studioAiSending = false;
                  }
                },
                onAiPromptChange: (v: string) => {
                  state.studioAiPrompt = v;
                },
                onToggleSidebar: () => {
                  state.studioSidebarCollapsed = !state.studioSidebarCollapsed;
                },
                onTogglePreview: () => {
                  state.studioPreviewCollapsed = !state.studioPreviewCollapsed;
                },
                onToggleBottom: () => {
                  state.studioBottomCollapsed = !state.studioBottomCollapsed;
                },
                onBottomPanelChange: (p) => {
                  state.studioBottomPanel = p;
                },
                onPreviewRouteChange: (route: string) => {
                  state.studioPreviewActiveRoute = route;
                },
                onPreviewDeviceChange: (device: "desktop" | "tablet" | "mobile") => {
                  state.studioPreviewDevice = device;
                },
                onPreviewInteractiveToggle: () => {
                  state.studioPreviewInteractive = !state.studioPreviewInteractive;
                },
                onRefresh: () => void loadDevProjects(state),
                onIdeate: async (config) => {
                  if (!state.client) {
                    return;
                  }
                  try {
                    await state.client.request("republic.dev.project.ideate", config ?? {});
                    await loadDevProjects(state);
                  } catch (e) {
                    console.error("Ideate error", e);
                  }
                },
                onReRender: () => state.requestUpdate(),
              })
            : nothing
        }

        ${/* ─── Docker Dashboard ─── */ ""}
        ${
          state.tab === "docker"
            ? html`<hoc-docker-dashboard
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                .diagnostics=${(state as unknown as { republicDockerDiagnostics?: unknown }).republicDockerDiagnostics ?? null}
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                .containers=${(state as unknown as { republicDockerContainers?: unknown[] }).republicDockerContainers ?? (state as unknown as { dockerContainers?: unknown[] }).dockerContainers ?? []}
                .onPresetLaunch=${(preset: string) => {
                  if (state.client) {
                    void state.client.request("republic.docker.launch", { preset });
                  }
                }}
                .onContainerStart=${(id: string) => {
                  if (state.client) {
                    void state.client.request("republic.docker.container.start", { id });
                  }
                }}
                .onContainerStop=${(id: string) => {
                  if (state.client) {
                    void state.client.request("republic.docker.container.stop", { id });
                  }
                }}
                .onContainerRestart=${(id: string) => {
                  if (state.client) {
                    void state.client.request("republic.docker.container.restart", { id });
                  }
                }}
                .onContainerRemove=${(id: string) => {
                  if (state.client) {
                    void state.client.request("republic.docker.container.remove", { id });
                  }
                }}
              ></hoc-docker-dashboard>`
            : nothing
        }

        ${/* ─── BitNet Dashboard ─── */ ""}
        ${
          state.tab === "bitnet"
            ? html`<hoc-bitnet-dashboard
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                .instances=${(state as unknown as { republicLocalInstances?: unknown[] }).republicLocalInstances ?? []}
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                .downloadedModels=${(state as unknown as { republicDownloadedBitnetModels?: unknown[] }).republicDownloadedBitnetModels ?? []}
                .onDownload=${async (repo: string) => {
                  if (state.client) {
                    await state.client.request("republic.bitnet.model.download", { repo });
                  }
                }}
                .onStart=${async (id: string, model: string) => {
                  if (state.client) {
                    await state.client.request("republic.bitnet.instance.start", { id, model });
                  }
                }}
                .onStop=${async (id: string, model: string) => {
                  if (state.client) {
                    await state.client.request("republic.bitnet.instance.stop", { id, model });
                  }
                }}
                .onStartNode=${async (modelPath: string) => {
                  if (state.client) {
                    await state.client.request("republic.bitnet.node.start", { modelPath });
                  }
                }}
              ></hoc-bitnet-dashboard>`
            : nothing
        }

        ${/* ─── Ollama Dashboard ─── */ ""}
        ${
          state.tab === "ollama"
            ? html`<hoc-ollama-dashboard
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                .status=${(state as unknown as { republicOllamaStatus?: unknown }).republicOllamaStatus ?? null}
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                .models=${(state as unknown as { republicOllamaModels?: unknown[] }).republicOllamaModels ?? []}
                .onPull=${async (model: string) => {
                  if (state.client) {
                    await state.client.request("republic.ollama.model.pull", { model });
                  }
                }}
                .onDelete=${async (model: string) => {
                  if (state.client) {
                    await state.client.request("republic.ollama.model.delete", { model });
                  }
                }}
                .onRefresh=${async () => {
                  if (state.client) {
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    const res = (await state.client.request("republic.ollama.status", {})) as any;
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    (state as any).republicOllamaStatus = res;
                  }
                }}
              ></hoc-ollama-dashboard>`
            : nothing
        }

        ${/* ─── LM Studio Dashboard ─── */ ""}
        ${
          state.tab === "lmstudio"
            ? html`<hoc-lmstudio-dashboard
                .status=${(state as unknown as { republicLmStudioStatus?: unknown }).republicLmStudioStatus ?? null}
                .models=${(state as unknown as { republicLmStudioModels?: unknown }).republicLmStudioModels ?? []}
                .onRefresh=${async () => {
                  if (state.client) {
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    const res = (await state.client.request("republic.lmstudio.status", {})) as any;
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    (state as any).republicLmStudioStatus = res;
                  }
                }}
                .onLoadModel=${async (model: string) => {
                  if (state.client) {
                    await state.client.request("republic.lmstudio.model.load", { model });
                  }
                }}
                .onUnloadModel=${async (model: string) => {
                  if (state.client) {
                    await state.client.request("republic.lmstudio.model.unload", { model });
                  }
                }}
              ></hoc-lmstudio-dashboard>`
            : nothing
        }

        ${/* ─── Hardware Resource Manager ─── */ ""}
        ${
          state.tab === "resources"
            ? html`
                <hoc-resource-manager></hoc-resource-manager>
              `
            : nothing
        }

        ${/* ─── Supabase Command Center ─── */ ""}
        ${
          state.tab === "supabase"
            ? (() => {
                import("./views/supabase-config.js").catch(() => {});
                return html`<hoc-supabase-config
                  .client=${state.client}
                ></hoc-supabase-config>`;
              })()
            : nothing
        }

        ${/* ─── Curriculum Dashboard ─── */ ""}
        ${
          state.tab === "curriculum"
            ? html`<hoc-curriculum-dashboard
                .education=${state.republicEducation ?? null}
                .citizens=${state.republicCitizens ?? []}
                .onRefresh=${async () => {
                  if (state.client) {
                    const res = (await state.client.request(
                      "republic.education.status",
                      {},
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    )) as any;
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    (state as any).republicEducation = res;
                  }
                }}
              ></hoc-curriculum-dashboard>`
            : nothing
        }

        ${/* ─── Preview Engine: ESM CDN ─── */ ""}
        ${
          state.tab === "preview-esm"
            ? renderEsmPreview({
                loading: state.previewEngineLoading,
                projects: (state.republicDevProjects?.projects ?? []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  fileCount: p.filesWritten ?? 0,
                  status: p.status ?? "active",
                })),
                selectedProjectId: state.previewEngineSelectedProjectId,
                session: state.previewEngineSession as Parameters<
                  typeof renderEsmPreview
                >[0]["session"],
                device: state.previewEngineDevice,
                consoleOpen: state.previewEngineConsoleOpen,
                blobUrl: state.previewEngineBlobUrl,
                onSelectProject: (projectId: string) => {
                  state.previewEngineSelectedProjectId = projectId;
                },
                onStart: async () => {
                  if (!state.client || !state.previewEngineSelectedProjectId) {
                    return;
                  }
                  state.previewEngineLoading = true;
                  try {
                    const res = (await state.client.request("republic.preview.start", {
                      projectId: state.previewEngineSelectedProjectId,
                      engine: "esm",
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any;
                    state.previewEngineSession = res.session;
                    const html = (res.session).generatedHtml as
                      | string
                      | null;
                    if (html) {
                      if (state.previewEngineBlobUrl) {
                        URL.revokeObjectURL(state.previewEngineBlobUrl);
                      }
                      state.previewEngineBlobUrl = URL.createObjectURL(
                        new Blob([html], { type: "text/html" }),
                      );
                    }
                  } catch (e) {
                    console.error("ESM preview error:", e);
                  } finally {
                    state.previewEngineLoading = false;
                  }
                },
                onStop: async () => {
                  const sid = (state.previewEngineSession)?.id as
                    | string
                    | undefined;
                  if (state.client && sid) {
                    try {
                      await state.client.request("republic.preview.stop", { sessionId: sid });
                    } catch {}
                  }
                  if (state.previewEngineBlobUrl) {
                    URL.revokeObjectURL(state.previewEngineBlobUrl);
                    state.previewEngineBlobUrl = null;
                  }
                  state.previewEngineSession = null;
                },
                onDeviceChange: (d: "desktop" | "tablet" | "mobile") => {
                  state.previewEngineDevice = d;
                },
                onToggleConsole: () => {
                  state.previewEngineConsoleOpen = !state.previewEngineConsoleOpen;
                },
              })
            : nothing
        }

        ${/* ─── Preview Engine: Local Dev Server ─── */ ""}
        ${
          state.tab === "preview-local"
            ? renderLocalPreview({
                loading: state.previewEngineLoading,
                projects: (state.republicDevProjects?.projects ?? []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  fileCount: p.filesWritten ?? 0,
                  status: p.status ?? "active",
                })),
                selectedProjectId: state.previewEngineSelectedProjectId,
                session: state.previewEngineSession as Parameters<
                  typeof renderLocalPreview
                >[0]["session"],
                device: state.previewEngineDevice,
                consoleOpen: state.previewEngineConsoleOpen,
                onSelectProject: (projectId: string) => {
                  state.previewEngineSelectedProjectId = projectId;
                },
                onStart: async () => {
                  if (!state.client || !state.previewEngineSelectedProjectId) {
                    return;
                  }
                  state.previewEngineLoading = true;
                  try {
                    const res = (await state.client.request("republic.preview.start", {
                      projectId: state.previewEngineSelectedProjectId,
                      engine: "local",
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any;
                    state.previewEngineSession = res.session;
                  } catch (e) {
                    console.error("Local preview error:", e);
                  } finally {
                    state.previewEngineLoading = false;
                  }
                },
                onStop: async () => {
                  const sid = (state.previewEngineSession)?.id as
                    | string
                    | undefined;
                  if (state.client && sid) {
                    try {
                      await state.client.request("republic.preview.stop", { sessionId: sid });
                    } catch {}
                  }
                  state.previewEngineSession = null;
                },
                onDeviceChange: (d: "desktop" | "tablet" | "mobile") => {
                  state.previewEngineDevice = d;
                },
                onToggleConsole: () => {
                  state.previewEngineConsoleOpen = !state.previewEngineConsoleOpen;
                },
              })
            : nothing
        }

        ${/* ─── Preview Engine: WebContainer ─── */ ""}
        ${
          state.tab === "preview-webcontainer"
            ? renderWebContainerPreview({
                loading: state.previewEngineLoading,
                projects: (state.republicDevProjects?.projects ?? []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  fileCount: p.filesWritten ?? 0,
                  status: p.status ?? "active",
                })),
                selectedProjectId: state.previewEngineSelectedProjectId,
                session: state.previewEngineSession as Parameters<
                  typeof renderWebContainerPreview
                >[0]["session"],
                device: state.previewEngineDevice,
                consoleOpen: state.previewEngineConsoleOpen,
                webcontainerAvailable: state.previewEngineWebcontainerAvailable,
                onSelectProject: (projectId: string) => {
                  state.previewEngineSelectedProjectId = projectId;
                },
                onStart: async () => {
                  if (!state.client || !state.previewEngineSelectedProjectId) {
                    return;
                  }
                  state.previewEngineLoading = true;
                  try {
                    const res = (await state.client.request("republic.preview.start", {
                      projectId: state.previewEngineSelectedProjectId,
                      engine: "webcontainer",
                    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any;
                    state.previewEngineSession = res.session;
                  } catch (e) {
                    console.error("WebContainer preview error:", e);
                  } finally {
                    state.previewEngineLoading = false;
                  }
                },
                onStop: async () => {
                  const sid = (state.previewEngineSession)?.id as
                    | string
                    | undefined;
                  if (state.client && sid) {
                    try {
                      await state.client.request("republic.preview.stop", { sessionId: sid });
                    } catch {}
                  }
                  state.previewEngineSession = null;
                },
                onDeviceChange: (d: "desktop" | "tablet" | "mobile") => {
                  state.previewEngineDevice = d;
                },
                onToggleConsole: () => {
                  state.previewEngineConsoleOpen = !state.previewEngineConsoleOpen;
                },
              })
            : nothing
        }

        ${
          state.tab === "execution"
            ? renderCitizenActions({
                loading: state.republicExecutionLoading,
                history: state.republicExecutionHistory,
                diagnostics: state.republicExecutionDiagnostics,
                simulationMode: state.republicMode,
                onRefresh: () => void loadExecution(state),
                onExecuteAction: (action, params) =>
                  state.handleRepublicExecuteAction(action, params),
                onSetMode: (mode) => state.handleRepublicSetMode(mode),
              })
            : nothing
        }

        ${
          state.tab === "avatar"
            ? renderAvatar({
                loading: state.avatarLoading,
                section: state.avatarSection,
                sessions: state.avatarSessions,
                activeSessionId: state.avatarActiveSessionId,
                messages: state.avatarMessages,
                draft: state.avatarDraft,
                faceState: state.avatarFaceState,
                personality: state.avatarPersonality,
                diagnostics: state.avatarDiagnostics,
                sending: state.avatarSending,
                onSectionChange: (s) => state.handleAvatarSectionChange(s),
                onCreateSession: () => void state.handleAvatarCreateSession(),
                onEndSession: (id) => void state.handleAvatarEndSession(id),
                onSelectSession: (id) => state.handleAvatarSelectSession(id),
                onDraftChange: (text) => state.handleAvatarDraftChange(text),
                onSend: () => void state.handleAvatarSend(),
                onPersonalityChange: (trait, value) =>
                  state.handleAvatarPersonalityChange(trait, value),
                onPersonalitySave: () => void state.handleAvatarPersonalitySave(),
                onRefresh: () => void state.handleAvatarLoad(),
              })
            : nothing
        }

        ${
          state.tab === "cluster"
            ? renderCluster({
                loading: state.clusterLoading,
                error: state.clusterError,
                peers: state.gatewayPeers,
                role: state.gatewayRole,
                nodes: state.clusterNodes,
                dockerAvailable: state.dockerAvailable,
                containers: state.dockerContainers,
                runtimes: state.runtimes,
                n8n: state.n8nStatus,
                federation: state.federation,
                onRefresh: () => state.handleClusterLoad(),
                onStartContainer: (id) => state.handleClusterStartContainer(id),
                onStopContainer: (id) => state.handleClusterStopContainer(id),
                onRemoveContainer: (id) => state.handleClusterRemoveContainer(id),
                onDeployPreset: (p) => state.handleClusterDeployPreset(p),
                onToggleN8nWorkflow: (id, active) =>
                  state.handleClusterToggleN8nWorkflow(id, active),
                onTriggerN8nWorkflow: (id) => state.handleClusterTriggerN8nWorkflow(id),
                onAddFederationPeer: (ip) => state.handleClusterAddFederationPeer(ip),
                onRemoveFederationPeer: (ip) => state.handleClusterRemoveFederationPeer(ip),
              })
            : nothing
        }

        ${
          state.tab === "companion"
            ? renderCompanion({
                loading: (state as unknown as CompanionState).companionLoading,
                error: (state as unknown as CompanionState).companionError,
                status: (state as unknown as CompanionState).companionStatus,
                onRefresh: () => void loadCompanionStatus(state as unknown as CompanionState),
                onPing: (appId) => void pingCompanion(state as unknown as CompanionState, appId),
              })
            : nothing
        }

        ${
          state.tab === "clawrouter"
            ? renderClawRouter({
                loading: state.clawrouterLoading,
                config: state.clawrouterConfig,
                models: state.clawrouterModels,
                balance: state.clawrouterBalance,
                balanceLoading: state.clawrouterBalanceLoading,
                healthy: state.clawrouterHealthy,
                stats: state.clawrouterStats,
                activeSection: state.clawrouterSection,
                modelSort: state.clawrouterModelSort,
                modelSearch: state.clawrouterModelSearch,
                onSectionChange: (s) => state.handleClawRouterSetSection(s),
                onProfileChange: (p) => void state.handleClawRouterSetProfile(p),
                onCompressionToggle: (v) => void state.handleClawRouterSetCompression(v),
                onCacheTTLChange: (v) => void state.handleClawRouterSetCacheTTL(v),
                onRefresh: () => void state.handleClawRouterLoad(),
                onRefreshBalance: () => void state.handleClawRouterRefreshBalance(),
                onModelSort: (s) => state.handleClawRouterSetModelSort(s),
                onModelSearch: (q) => state.handleClawRouterSetModelSearch(q),
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                onStart: () => void (state as any).handleClawRouterStart(),
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                onStop: () => void (state as any).handleClawRouterStop(),
              })
            : nothing
        }

        ${
          state.tab === "metacognition"
            ? renderMetacognition({
                loading: false,
                diagnostics: state.republicMetacognitionDiagnostics ?? null,
                recentJournals: state.republicMetacognitionJournals ?? [],
                selectedCitizenId: state.republicMetacognitionCitizenId ?? null,
                citizenDetail: state.republicMetacognitionCitizenDetail ?? null,
                onSelectCitizen: (id) => {
                  state.republicMetacognitionCitizenId = id;
                },
                onRefresh: () => void loadCognitive(state as unknown as RepublicState),
              })
            : nothing
        }

        ${
          state.tab === "narrative"
            ? renderNarrative({
                loading: false,
                diagnostics: state.republicNarrativeDiagnostics ?? null,
                activeThreads: state.republicNarrativeThreads ?? [],
                characterArcs: state.republicNarrativeArcs ?? [],
                onRefresh: () => void loadCognitive(state as unknown as RepublicState),
              })
            : nothing
        }

        ${
          state.tab === "dreams"
            ? renderDreams({
                loading: false,
                diagnostics: state.republicDreamDiagnostics ?? null,
                sharedDreams: state.republicSharedDreams ?? [],
                onRefresh: () => void loadCognitive(state as unknown as RepublicState),
              })
            : nothing
        }

        ${
          state.tab === "reasoning"
            ? renderReasoning({
                loading: false,
                diagnostics: state.republicReasoningDiagnostics ?? null,
                recentChains: state.republicReasoningChains ?? [],
                onRefresh: () => void loadCognitive(state as unknown as RepublicState),
              })
            : nothing
        }

        ${
          state.tab === "diplomacy"
            ? renderDiplomacy({
                loading: false,
                diagnostics: state.republicDiplomacyDiagnostics ?? null,
                contracts: state.republicDiplomacyContracts ?? [],
                norms: state.republicDiplomacyNorms ?? [],
                treaties: state.republicDiplomacyTreaties ?? [],
                breaches: state.republicDiplomacyBreaches ?? [],
                onRefresh: () => void loadCognitive(state as unknown as RepublicState),
              })
            : nothing
        }

        ${
          state.tab === "resilience"
            ? renderResilience({
                loading: false,
                diagnostics: state.republicResilienceDiagnostics ?? null,
                activeCrises: state.republicResilienceCrises ?? [],
                stressResponses: state.republicResilienceResponses ?? [],
                redundancyPlans: state.republicResiliencePlans ?? [],
                onRefresh: () => void loadCognitive(state as unknown as RepublicState),
              })
            : nothing
        }

        ${
          state.tab === "productions"
            ? renderProductions({
                loading: state.republicProductionLoading,
                items: state.republicProductionItems,
                stats: state.republicProductionStats,
                files: state.republicProductionFiles,
                selectedCategory: state.republicProductionCategory ?? null,
                onCategorySelect: (cat: string | null) => {
                  state.republicProductionCategory = cat;
                },
                onRefresh: () => void loadProductions(state as unknown as RepublicState),
                onReadFile: (p: string) => readProductionFile(state as unknown as RepublicState, p),
                onWriteFile: (p: string, c: string) =>
                  writeProductionFile(state as unknown as RepublicState, p, c),
                onDelete: (p: string) => deleteProduction(state as unknown as RepublicState, p),
              })
            : nothing
        }

        ${
          state.tab === "aistore"
            ? renderAIStore({
                loading: state.republicAIStoreLoading,
                listings: state.republicAIStoreListings,
                productions: state.republicAIStoreProductions,
                diagnostics: state.republicAIStoreDiagnostics,
                activeTab: state.republicAIStoreTab ?? "listings",
                selectedCategory: state.republicAIStoreCategory ?? null,
                searchQuery: "",
                sortBy: "newest",
                onTabChange: (tab: "listings" | "gallery" | "stats") => {
                  state.republicAIStoreTab = tab;
                },
                onCategorySelect: (cat: string | null) => {
                  state.republicAIStoreCategory = cat;
                },
                onRefresh: () => void loadAIStore(state as unknown as RepublicState),
              })
            : nothing
        }

        ${
          state.tab === "plugins"
            ? renderPlugins({
                loading: state.republicPluginsLoading,
                plugins: state.republicPlugins,
                diagnostics: state.republicPluginsDiagnostics ?? null,
                pluginsDir: state.republicPluginsDir,
                expandedId: state.republicPluginsExpandedId,
                filterCategory: state.republicPluginsFilterCategory,
                searchQuery: state.republicPluginsSearchQuery,
                activatingId: state.republicPluginsActivatingId,
                onRefresh: () => void loadPlugins(state as unknown as RepublicState),
                onExpand: (id: string | null) => {
                  state.republicPluginsExpandedId = id;
                },
                onFilterCategory: (cat: string | null) => {
                  state.republicPluginsFilterCategory = cat;
                },
                onSearch: (q: string) => {
                  state.republicPluginsSearchQuery = q;
                },
                onActivate: (id: string) =>
                  void activatePluginAction(state as unknown as RepublicState, id),
                onDeactivate: (id: string) =>
                  void deactivatePluginAction(state as unknown as RepublicState, id),
                onScan: () => void scanPluginsAction(state as unknown as RepublicState),
                onInvokeTool: (
                  _pluginId: string,
                  toolName: string,
                  params: Record<string, unknown>,
                ) => {
                  if (state.client) {
                    void state.client
                      .request("republic.plugins.invoke-tool", { toolName, params })
                      .then(
                        (res) => {
                          console.log("[PluginTool]", toolName, res);
                        },
                        (err) => {
                          state.lastError = String(err);
                        },
                      );
                  }
                },
                onCallGateway: (method: string, params: Record<string, unknown>) => {
                  if (state.client) {
                    void state.client
                      .request("republic.plugins.call-gateway", { method, params })
                      .then(
                        (res) => {
                          console.log("[PluginGateway]", method, res);
                        },
                        (err) => {
                          state.lastError = String(err);
                        },
                      );
                  }
                },
              })
            : nothing
        }

        ${
          state.tab === "manus"
            ? renderManus({
                loading: state.republicManusLoading,
                trainingJobs: state.republicManusTrainingJobs,
                evalJobs: state.republicManusEvalJobs,
                queueStatus: state.republicManusQueueStatus,
                onRefresh: () => void loadManus(state as unknown as RepublicState),
                onStartTraining: (config) =>
                  void startManusTraining(state as unknown as RepublicState, config),
                onStartEval: (config) =>
                  void startManusEval(state as unknown as RepublicState, config),
                onCancelJob: (jobId) =>
                  void cancelManusJob(state as unknown as RepublicState, jobId),
              })
            : nothing
        }

        ${
          state.tab === "lovable"
            ? renderLovable({
                loading: state.republicLovableLoading,
                jobs: state.republicLovableJobs,
                queueStatus: state.republicLovableQueueStatus,
                onRefresh: () => void loadLovable(state as unknown as RepublicState),
                onClone: (config) =>
                  void startLovableClone(state as unknown as RepublicState, config),
                onCancelJob: (jobId) =>
                  void cancelLovableJob(state as unknown as RepublicState, jobId),
              })
            : nothing
        }

        ${
          state.tab === "worldintel"
            ? (() => {
                const wiResult = renderWorldIntel({
                  loading: state.republicWorldIntelLoading,
                  dashboard: state.republicWorldIntelDashboard ?? null,
                  signals: (state.republicWorldIntelSignals ?? []) as IntelSignal[],
                  severityFilter: state.republicWorldIntelSeverityFilter ?? null,
                  countryFilter: state.republicWorldIntelCountryFilter ?? null,
                  newsExpanded: state.republicWorldIntelNewsExpanded ?? false,
                  selectedCountry: state.republicWorldIntelSelectedCountry ?? null,
                  // v2
                  warRisks: (state.republicWarRisks ??
                    []) as import("./views/worldintel-view.ts").WarRiskEntry[],
                  arsenal: (state.republicArsenal ??
                    []) as import("./views/worldintel-view.ts").ArsenalEntry[],
                  warSignals: (state.republicWarSignals ??
                    []) as import("./views/worldintel-view.ts").WarSignalEntry[],
                  velocities: (state.republicEscalationVelocities ??
                    []) as import("./views/worldintel-view.ts").EscalationVelocityEntry[],
                  alertConfig: (state.republicAlertConfig ?? null) as
                    | import("./views/worldintel-view.ts").AlertConfigData
                    | null,
                  alertHistory: (state.republicAlertHistory ??
                    []) as import("./views/worldintel-view.ts").AlertHistoryEntry[],
                  onRefresh: () => void loadWorldIntel(state as unknown as RepublicState),
                  onStartStop: (action) =>
                    void worldIntelControl(state as unknown as RepublicState, action),
                  onFilterSeverity: (s) => {
                    state.republicWorldIntelSeverityFilter = s;
                  },
                  onFilterCountry: (c) => {
                    state.republicWorldIntelCountryFilter = c;
                  },
                  onToggleNews: () => {
                    state.republicWorldIntelNewsExpanded = !state.republicWorldIntelNewsExpanded;
                  },
                  onSelectCountry: (code) => {
                    state.republicWorldIntelSelectedCountry = code;
                  },
                  onSaveAlertConfig: (cfg) => {
                    if (!state.client) {return;}
                    void state.client.request("republic.worldintel.alerts", {
                      action: "set",
                      config: cfg as Record<string, unknown>,
                    });
                  },
                  onTestAlert: (channel) => {
                    if (!state.client) {return;}
                    void state.client.request("republic.worldintel.alerts.test", { channel });
                  },
                });
                // Schedule globe init after DOM render
                requestAnimationFrame(() => {
                  const container = document.getElementById("wi-globe-mount");
                  if (container) {
                    initGlobe(container, {
                      loading: state.republicWorldIntelLoading,
                      dashboard: state.republicWorldIntelDashboard ?? null,
                      signals: (state.republicWorldIntelSignals ?? []) as IntelSignal[],
                      severityFilter: state.republicWorldIntelSeverityFilter ?? null,
                      countryFilter: state.republicWorldIntelCountryFilter ?? null,
                      newsExpanded: state.republicWorldIntelNewsExpanded ?? false,
                      selectedCountry: state.republicWorldIntelSelectedCountry ?? null,
                      // v2
                      warRisks: (state.republicWarRisks ??
                        []) as import("./views/worldintel-view.ts").WarRiskEntry[],
                      arsenal: (state.republicArsenal ??
                        []) as import("./views/worldintel-view.ts").ArsenalEntry[],
                      warSignals: (state.republicWarSignals ??
                        []) as import("./views/worldintel-view.ts").WarSignalEntry[],
                      velocities: (state.republicEscalationVelocities ??
                        []) as import("./views/worldintel-view.ts").EscalationVelocityEntry[],
                      alertConfig: (state.republicAlertConfig ?? null) as
                        | import("./views/worldintel-view.ts").AlertConfigData
                        | null,
                      alertHistory: (state.republicAlertHistory ??
                        []) as import("./views/worldintel-view.ts").AlertHistoryEntry[],
                      onRefresh: () => {},
                      onStartStop: () => {},
                      onFilterSeverity: () => {},
                      onFilterCountry: () => {},
                      onToggleNews: () => {},
                      onSelectCountry: () => {},
                      onSaveAlertConfig: () => {},
                      onTestAlert: () => {},
                    });
                  }
                });
                return wiResult;
              })()
            : nothing
        }

        ${
          state.tab === "tacticalmap"
            ? (() => {
                const tmProps: TacticalMapProps = {
                  loading: state.republicWorldIntelLoading,
                  dashboard: state.republicWorldIntelDashboard ?? null,
                  signals: (state.republicWorldIntelSignals ?? []) as IntelSignal[],
                  selectedCountry: state.republicWorldIntelSelectedCountry ?? null,
                  selectedSignalIdx: state.republicTacticalMapSignalIdx,
                  activeLayers: state.republicTacticalMapLayers,
                  warRisks: (state.republicWarRisks ??
                    []) as import("./views/worldintel-view.ts").WarRiskEntry[],
                  warSignals: (state.republicWarSignals ??
                    []) as import("./views/worldintel-view.ts").WarSignalEntry[],
                  onRefresh: () => void loadWorldIntel(state as unknown as RepublicState),
                  onStartStop: (action) =>
                    void worldIntelControl(state as unknown as RepublicState, action),
                  onSelectCountry: (code) => {
                    state.republicWorldIntelSelectedCountry = code;
                  },
                  onSelectSignal: (idx) => {
                    state.republicTacticalMapSignalIdx = idx;
                  },
                  onLayerToggle: (layer) => {
                    const current = new Set(state.republicTacticalMapLayers);
                    if (current.has(layer)) {
                      current.delete(layer);
                    } else {
                      current.add(layer);
                    }
                    state.republicTacticalMapLayers = [...current];
                  },
                };
                const tmResult = renderTacticalMap(tmProps);
                // Mount globe after DOM render — same pattern as worldintel
                requestAnimationFrame(() => {
                  const container = document.getElementById("tm2-globe-mount");
                  if (container) {initTacticalMapGlobe(container, tmProps);}
                });
                return tmResult;
              })()
            : nothing
        }

        ${
          state.tab === "mediastudio"
            ? renderMediaStudio({
                loading: state.republicMediaStudioLoading,
                capabilities: state.republicMediaStudioCapabilities ?? null,
                history: (state.republicMediaStudioHistory ??
                  []) as import("./views/mediastudio-view.ts").MediaGeneration[],
                generating: state.republicMediaStudioGenerating,
                selectedType: state.republicMediaStudioSelectedType,
                prompt: state.republicMediaStudioPrompt,
                error: state.republicMediaStudioError ?? null,
                onRefresh: () => void loadMediaStudio(state as unknown as RepublicState),
                onGenerate: (type, prompt, options) =>
                  void generateMedia(state as unknown as RepublicState, type, prompt, options),
                onTypeChange: (type) => {
                  state.republicMediaStudioSelectedType = type;
                },
                onPromptChange: (prompt) => {
                  state.republicMediaStudioPrompt = prompt;
                },
              })
            : nothing
        }
      </main>

      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}
