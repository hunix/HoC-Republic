import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { MLModelName } from "./republic-types.ts";
import type {
  PopulationStats,
  CitizenSummary,
  GovernmentStatus,
  TreasuryReport,
  SimulationStatus,
  ScheduledEvent,
  AtlantisStatus,
  MLStatus,
  QuantumStatus,
  GridStatus,
  EducationStatus,
  CitizenMemoryView,
  CollectiveEntry,
  DevProjectsStatus,
  DevProjectDetail,
  DevFileContent,
  ExecutionHistoryEntry,
  ExecutionDiagnostics,
  GenomePoolEntry,
  NetworkGraph,
  DnaStrand,
  LineageTree,
  FitnessLandscape,
} from "./republic-types.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import type { DevStudioTab, PreviewMode, BottomPanel } from "./views/dev-studio.ts";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import { shouldAppUpdate } from "./app-should-update.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
  type CompactionStatus,
} from "./app-tool-stream.ts";
import { resolveInjectedAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import {
  type AvatarState,
  AVATAR_STATE_DEFAULTS,
  loadAvatar as loadAvatarInternal,
  createAvatarSession as createAvatarSessionInternal,
  endAvatarSession as endAvatarSessionInternal,
  avatarSpeak as avatarSpeakInternal,
  loadAvatarFaceState as loadAvatarFaceStateInternal,
  updateAvatarPersonality as updateAvatarPersonalityInternal,
  // oxlint-disable-next-line no-unused-vars
  startAvatarPolling,
  // oxlint-disable-next-line no-unused-vars
  stopAvatarPolling,
  type AvatarSection,
  type AvatarMessage,
  type AvatarFaceState as AvatarFaceStateType,
  type AvatarPersonality as AvatarPersonalityType,
  type AvatarDiagnosticsInfo,
  type AvatarSessionInfo,
} from "./controllers/avatar.ts";
import {
  type ClawRouterState,
  CLAWROUTER_STATE_DEFAULTS,
  loadClawRouterData as loadClawRouterDataInternal,
  loadClawRouterBalance as loadClawRouterBalanceInternal,
  setClawRouterProfile as setClawRouterProfileInternal,
  setClawRouterCompression as setClawRouterCompressionInternal,
  setClawRouterCacheTTL as setClawRouterCacheTTLInternal,
  startClawRouter as startClawRouterInternal,
  stopClawRouter as stopClawRouterInternal,
} from "./controllers/clawrouter.ts";
import {
  type ClusterState,
  type FederationState,
  CLUSTER_STATE_DEFAULTS,
  loadCluster as loadClusterInternal,
  loadFederation as loadFederationInternal,
  setFederationPeers as setFederationPeersInternal,
  removeFederationPeer as removeFederationPeerInternal,
  startContainer as startContainerInternal,
  stopContainer as stopContainerInternal,
  removeContainer as removeContainerInternal,
  deployPreset as deployPresetInternal,
  toggleN8nWorkflow as toggleN8nWorkflowInternal,
  triggerN8nWorkflow as triggerN8nWorkflowInternal,
} from "./controllers/cluster.ts";
import {
  type CompanionState,
  COMPANION_STATE_DEFAULTS,
  // oxlint-disable-next-line no-unused-vars
  loadCompanionStatus as loadCompanionStatusInternal,
  // oxlint-disable-next-line no-unused-vars
  pingCompanion as pingCompanionInternal,
} from "./controllers/companion.ts";
import {
  type RepublicState,
  REPUBLIC_STATE_DEFAULTS,
  loadPopulation as loadPopulationInternal,
  loadGovernment as loadGovernmentInternal,
  loadEconomy as loadEconomyInternal,
  loadSimulation as loadSimulationInternal,
  loadTechnology as loadTechnologyInternal,
  loadGrid as loadGridInternal,
  startSimulation as startSimulationInternal,
  stopSimulation as stopSimulationInternal,
  pauseSimulation as pauseSimulationInternal,
  setTickRate as setTickRateInternal,
  toggleHarvester as toggleHarvesterInternal,
  adjustTaxRate as adjustTaxRateInternal,
  holdElection as holdElectionInternal,
  trainModel as trainModelInternal,
  createUniverse as createUniverseInternal,
  branchUniverse as branchUniverseInternal,
  collapseUniverse as collapseUniverseInternal,
  addSwarmObjective as addSwarmObjectiveInternal,
  electLeader as electLeaderInternal,
  setMode as setModeInternal,
  // oxlint-disable-next-line no-unused-vars
  loadMode as loadModeInternal,
  // oxlint-disable-next-line no-unused-vars
  loadExecution as loadExecutionInternal,
  loadMemory as loadMemoryInternal,
  // oxlint-disable-next-line no-unused-vars
  startRepublicPolling,
  // oxlint-disable-next-line no-unused-vars
  stopRepublicPolling,
  downloadLocalModel as downloadLocalModelInternal,
  startLocalModel as startLocalModelInternal,
  stopLocalModel as stopLocalModelInternal,
  removeLocalModel as removeLocalModelInternal,
  startBitnetNode as startBitnetNodeInternal,
} from "./controllers/republic.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";

declare global {
  interface Window {
    __HOC_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("hoc-app")
export class OpenClawApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: CompactionStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  @state() chatModels: import("./controllers/chat.ts").ModelInfo[] = [];
  @state() chatModelsLoading = false;
  @state() chatActiveModel: import("./controllers/chat.ts").ModelInfo | null = null;
  @state() chatActiveModelIsOverride = false;
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() lastRotatedToken: string | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;

  // ─── Cluster Infrastructure State ─────────────────────────
  @state() clusterLoading = false;
  @state() clusterError: string | null = null;
  @state() gatewayPeers: import("./controllers/cluster.ts").GatewayPeer[] = [];
  @state() gatewayRole: "leader" | "follower" | "standalone" = "standalone";
  @state() clusterNodes: import("./controllers/cluster.ts").ClusterNode[] = [];
  @state() dockerContainers: import("./controllers/cluster.ts").DockerContainer[] = [];
  @state() dockerAvailable = false;
  @state() runtimes: import("./controllers/cluster.ts").RuntimeInfo[] = [];
  @state() n8nStatus: import("./controllers/cluster.ts").N8nStatus | null = null;
  @state() federation: FederationState = CLUSTER_STATE_DEFAULTS.federation;

  // ─── ClawRouter State ─────────────────────────────────────────
  @state() clawrouterLoading = CLAWROUTER_STATE_DEFAULTS.clawrouterLoading;
  @state() clawrouterConfig = CLAWROUTER_STATE_DEFAULTS.clawrouterConfig;
  @state() clawrouterModels = CLAWROUTER_STATE_DEFAULTS.clawrouterModels;
  @state() clawrouterBalance = CLAWROUTER_STATE_DEFAULTS.clawrouterBalance;
  @state() clawrouterBalanceLoading = CLAWROUTER_STATE_DEFAULTS.clawrouterBalanceLoading;
  @state() clawrouterHealthy = CLAWROUTER_STATE_DEFAULTS.clawrouterHealthy;
  @state() clawrouterStats = CLAWROUTER_STATE_DEFAULTS.clawrouterStats;
  @state() clawrouterSection = CLAWROUTER_STATE_DEFAULTS.clawrouterSection;
  @state() clawrouterModelSort = CLAWROUTER_STATE_DEFAULTS.clawrouterModelSort;
  @state() clawrouterModelSearch = CLAWROUTER_STATE_DEFAULTS.clawrouterModelSearch;

  @state() configActiveSubsection: string | null = null;
  @state() configAutoSaveStatus: "pending" | "saving" | "saved" | "error" | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;
  @state() agentsSelectedId: string | null = null;
  @state() agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  @state() agentFilesLoading = false;
  @state() agentFilesError: string | null = null;
  @state() agentFilesList: AgentsFilesListResult | null = null;
  @state() agentFileContents: Record<string, string> = {};
  @state() agentFileDrafts: Record<string, string> = {};
  @state() agentFileActive: string | null = null;
  @state() agentFileSaving = false;
  @state() agentIdentityLoading = false;
  @state() agentIdentityError: string | null = null;
  @state() agentIdentityById: Record<string, AgentIdentityResult> = {};
  @state() agentSkillsLoading = false;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsAgentId: string | null = null;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() usageLoading = false;
  @state() usageResult: import("./types.js").SessionsUsageResult | null = null;
  @state() usageCostSummary: import("./types.js").CostUsageSummary | null = null;
  @state() usageError: string | null = null;
  @state() usageStartDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageSelectedSessions: string[] = [];
  @state() usageSelectedDays: string[] = [];
  @state() usageSelectedHours: number[] = [];
  @state() usageChartMode: "tokens" | "cost" = "tokens";
  @state() usageDailyChartMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  @state() usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeries: import("./types.js").SessionUsageTimeSeries | null = null;
  @state() usageTimeSeriesLoading = false;
  @state() usageSessionLogs: import("./views/usage.js").SessionLogEntry[] | null = null;
  @state() usageSessionLogsLoading = false;
  @state() usageSessionLogsExpanded = false;
  // Applied query (used to filter the already-loaded sessions list client-side).
  @state() usageQuery = "";
  // Draft query text (updates immediately as the user types; applied via debounce or "Search").
  @state() usageQueryDraft = "";
  @state() usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" = "recent";
  @state() usageSessionSortDir: "desc" | "asc" = "desc";
  @state() usageRecentSessions: string[] = [];
  @state() usageTimeZone: "local" | "utc" = "local";
  @state() usageContextExpanded = false;
  @state() usageHeaderPinned = false;
  @state() usageSessionsTab: "all" | "recent" = "all";
  @state() usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  @state() usageLogFilterRoles: import("./views/usage.js").SessionLogRole[] = [];
  @state() usageLogFilterTools: string[] = [];
  @state() usageLogFilterHasTools = false;
  @state() usageLogFilterQuery = "";

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  // ─── Republic State ──────────────────────────────────────────
  @state() republicPopulationLoading = REPUBLIC_STATE_DEFAULTS.republicPopulationLoading;
  @state() republicPopulationStats: PopulationStats | null =
    REPUBLIC_STATE_DEFAULTS.republicPopulationStats;
  @state() republicCitizens: CitizenSummary[] = REPUBLIC_STATE_DEFAULTS.republicCitizens;
  @state() republicCitizenSearch = REPUBLIC_STATE_DEFAULTS.republicCitizenSearch;
  @state() republicCitizenFilter: string | null = REPUBLIC_STATE_DEFAULTS.republicCitizenFilter;
  @state() republicCitizenPage = REPUBLIC_STATE_DEFAULTS.republicCitizenPage;
  @state() republicSelectedCitizen: CitizenSummary | null =
    REPUBLIC_STATE_DEFAULTS.republicSelectedCitizen;
  @state() republicPopulationTab = "Overview";
  @state() republicGovernmentLoading = REPUBLIC_STATE_DEFAULTS.republicGovernmentLoading;
  @state() republicGovernmentStatus: GovernmentStatus | null =
    REPUBLIC_STATE_DEFAULTS.republicGovernmentStatus;
  @state() republicGovernmentSection: RepublicState["republicGovernmentSection"] =
    REPUBLIC_STATE_DEFAULTS.republicGovernmentSection;
  @state() republicEconomyLoading = REPUBLIC_STATE_DEFAULTS.republicEconomyLoading;
  @state() republicTreasury: TreasuryReport | null = REPUBLIC_STATE_DEFAULTS.republicTreasury;
  @state() republicSimulationLoading = REPUBLIC_STATE_DEFAULTS.republicSimulationLoading;
  @state() republicSimulationStatus: SimulationStatus | null =
    REPUBLIC_STATE_DEFAULTS.republicSimulationStatus;
  @state() republicEventQueue: ScheduledEvent[] = REPUBLIC_STATE_DEFAULTS.republicEventQueue;
  @state() republicMode: "simulated" | "real" = REPUBLIC_STATE_DEFAULTS.republicMode;
  @state() republicTechLoading = REPUBLIC_STATE_DEFAULTS.republicTechLoading;
  @state() republicAtlantis: AtlantisStatus | null = REPUBLIC_STATE_DEFAULTS.republicAtlantis;
  @state() republicML: MLStatus | null = REPUBLIC_STATE_DEFAULTS.republicML;
  @state() republicQuantum: QuantumStatus | null = REPUBLIC_STATE_DEFAULTS.republicQuantum;
  @state() republicTechSection: RepublicState["republicTechSection"] =
    REPUBLIC_STATE_DEFAULTS.republicTechSection;
  @state() republicGridLoading = REPUBLIC_STATE_DEFAULTS.republicGridLoading;
  @state() republicGrid: GridStatus | null = REPUBLIC_STATE_DEFAULTS.republicGrid;

  // ─── Phase 8 Republic State (education, memory, genome, execution, dev) ───
  @state() republicEducationLoading = REPUBLIC_STATE_DEFAULTS.republicEducationLoading;
  @state() republicEducation: EducationStatus | null = REPUBLIC_STATE_DEFAULTS.republicEducation;
  @state() republicMemoryLoading = REPUBLIC_STATE_DEFAULTS.republicMemoryLoading;
  @state() republicMemory: CitizenMemoryView | null = REPUBLIC_STATE_DEFAULTS.republicMemory;
  @state() republicMemoryCitizenId: string | null = REPUBLIC_STATE_DEFAULTS.republicMemoryCitizenId;
  @state() republicCollective: CollectiveEntry[] = REPUBLIC_STATE_DEFAULTS.republicCollective;
  @state() republicDevLoading = REPUBLIC_STATE_DEFAULTS.republicDevLoading;
  @state() republicDevProjects: DevProjectsStatus | null =
    REPUBLIC_STATE_DEFAULTS.republicDevProjects;
  @state() republicDevProjectDetail: DevProjectDetail | null =
    REPUBLIC_STATE_DEFAULTS.republicDevProjectDetail;
  @state() republicDevProjectDetailLoading =
    REPUBLIC_STATE_DEFAULTS.republicDevProjectDetailLoading;
  @state() republicDevFileContent: DevFileContent | null =
    REPUBLIC_STATE_DEFAULTS.republicDevFileContent;
  @state() republicDevFileLoading = REPUBLIC_STATE_DEFAULTS.republicDevFileLoading;

  // ─── Dev Studio UI State ────────────────────────────────────
  @state() studioOpenFiles: DevStudioTab[] = REPUBLIC_STATE_DEFAULTS.studioOpenFiles;
  @state() studioActiveFile: string | null = REPUBLIC_STATE_DEFAULTS.studioActiveFile;
  @state() studioPreviewMode: PreviewMode = REPUBLIC_STATE_DEFAULTS.studioPreviewMode;
  @state() studioPreviewUrl: string | null = REPUBLIC_STATE_DEFAULTS.studioPreviewUrl;
  @state() studioPreviewRoutes: { path: string; label: string; filePath: string }[] =
    REPUBLIC_STATE_DEFAULTS.studioPreviewRoutes;
  @state() studioPreviewActiveRoute: string = REPUBLIC_STATE_DEFAULTS.studioPreviewActiveRoute;
  @state() studioPreviewDevice: "desktop" | "tablet" | "mobile" =
    REPUBLIC_STATE_DEFAULTS.studioPreviewDevice;
  @state() studioPreviewInteractive: boolean = REPUBLIC_STATE_DEFAULTS.studioPreviewInteractive;
  @state() studioBottomPanel: BottomPanel = REPUBLIC_STATE_DEFAULTS.studioBottomPanel;
  @state() studioTerminalOutput: string[] = REPUBLIC_STATE_DEFAULTS.studioTerminalOutput;
  @state() studioAiPrompt: string = REPUBLIC_STATE_DEFAULTS.studioAiPrompt;
  @state() studioAiSending: boolean = REPUBLIC_STATE_DEFAULTS.studioAiSending;
  @state() studioGsdTimeline: RepublicState["studioGsdTimeline"] =
    REPUBLIC_STATE_DEFAULTS.studioGsdTimeline;
  @state() studioGsdTeam: RepublicState["studioGsdTeam"] = REPUBLIC_STATE_DEFAULTS.studioGsdTeam;
  @state() studioGsdQualityScore: number = REPUBLIC_STATE_DEFAULTS.studioGsdQualityScore;
  @state() studioSidebarCollapsed: boolean = REPUBLIC_STATE_DEFAULTS.studioSidebarCollapsed;
  @state() studioPreviewCollapsed: boolean = REPUBLIC_STATE_DEFAULTS.studioPreviewCollapsed;
  @state() studioBottomCollapsed: boolean = REPUBLIC_STATE_DEFAULTS.studioBottomCollapsed;
  @state() republicExecutionLoading = REPUBLIC_STATE_DEFAULTS.republicExecutionLoading;
  @state() republicExecutionHistory: ExecutionHistoryEntry[] =
    REPUBLIC_STATE_DEFAULTS.republicExecutionHistory;
  @state() republicExecutionDiagnostics: ExecutionDiagnostics | null =
    REPUBLIC_STATE_DEFAULTS.republicExecutionDiagnostics;
  @state() republicGenomeLoading = REPUBLIC_STATE_DEFAULTS.republicGenomeLoading;
  @state() republicGenomePool: GenomePoolEntry[] = REPUBLIC_STATE_DEFAULTS.republicGenomePool;
  @state() republicGenomeNetwork: NetworkGraph | null =
    REPUBLIC_STATE_DEFAULTS.republicGenomeNetwork;
  @state() republicGenomeDna: DnaStrand | null = REPUBLIC_STATE_DEFAULTS.republicGenomeDna;
  @state() republicGenomeLineage: LineageTree | null =
    REPUBLIC_STATE_DEFAULTS.republicGenomeLineage;
  @state() republicGenomeLandscape: FitnessLandscape | null =
    REPUBLIC_STATE_DEFAULTS.republicGenomeLandscape;
  @state() republicSelectedGenomeId: string | null =
    REPUBLIC_STATE_DEFAULTS.republicSelectedGenomeId;

  // ─── Marketplace & Productions State ────────────────────────
  @state() republicAIStoreLoading = REPUBLIC_STATE_DEFAULTS.republicAIStoreLoading;
  @state() republicAIStoreListings = REPUBLIC_STATE_DEFAULTS.republicAIStoreListings;
  @state() republicAIStoreProductions = REPUBLIC_STATE_DEFAULTS.republicAIStoreProductions;
  @state() republicAIStoreDiagnostics = REPUBLIC_STATE_DEFAULTS.republicAIStoreDiagnostics;
  @state() republicAIStoreTab: "listings" | "gallery" | "stats" =
    REPUBLIC_STATE_DEFAULTS.republicAIStoreTab;
  @state() republicAIStoreCategory: string | null = REPUBLIC_STATE_DEFAULTS.republicAIStoreCategory;
  @state() republicProductionLoading = REPUBLIC_STATE_DEFAULTS.republicProductionLoading;
  @state() republicProductionItems = REPUBLIC_STATE_DEFAULTS.republicProductionItems;
  @state() republicProductionStats = REPUBLIC_STATE_DEFAULTS.republicProductionStats;
  @state() republicProductionFiles = REPUBLIC_STATE_DEFAULTS.republicProductionFiles;
  @state() republicProductionCategory: string | null =
    REPUBLIC_STATE_DEFAULTS.republicProductionCategory;

  // ─── Cognitive Frontier State ────────────────────────────────
  @state() republicMetacognitionDiagnostics =
    REPUBLIC_STATE_DEFAULTS.republicMetacognitionDiagnostics;
  @state() republicNarrativeDiagnostics = REPUBLIC_STATE_DEFAULTS.republicNarrativeDiagnostics;
  @state() republicDreamDiagnostics = REPUBLIC_STATE_DEFAULTS.republicDreamDiagnostics;
  @state() republicReasoningDiagnostics = REPUBLIC_STATE_DEFAULTS.republicReasoningDiagnostics;
  @state() republicDiplomacyDiagnostics = REPUBLIC_STATE_DEFAULTS.republicDiplomacyDiagnostics;
  @state() republicResilienceDiagnostics = REPUBLIC_STATE_DEFAULTS.republicResilienceDiagnostics;

  // ─── Cognitive Frontier Sub-collections ──────────────────────
  @state() republicMetacognitionJournals = REPUBLIC_STATE_DEFAULTS.republicMetacognitionJournals;
  @state() republicMetacognitionCitizenId: string | null =
    REPUBLIC_STATE_DEFAULTS.republicMetacognitionCitizenId;
  @state() republicMetacognitionCitizenDetail =
    REPUBLIC_STATE_DEFAULTS.republicMetacognitionCitizenDetail;
  @state() republicNarrativeThreads = REPUBLIC_STATE_DEFAULTS.republicNarrativeThreads;
  @state() republicNarrativeArcs = REPUBLIC_STATE_DEFAULTS.republicNarrativeArcs;
  @state() republicSharedDreams = REPUBLIC_STATE_DEFAULTS.republicSharedDreams;
  @state() republicReasoningChains = REPUBLIC_STATE_DEFAULTS.republicReasoningChains;
  @state() republicDiplomacyContracts = REPUBLIC_STATE_DEFAULTS.republicDiplomacyContracts;
  @state() republicDiplomacyNorms = REPUBLIC_STATE_DEFAULTS.republicDiplomacyNorms;
  @state() republicDiplomacyTreaties = REPUBLIC_STATE_DEFAULTS.republicDiplomacyTreaties;
  @state() republicDiplomacyBreaches = REPUBLIC_STATE_DEFAULTS.republicDiplomacyBreaches;
  @state() republicResilienceCrises = REPUBLIC_STATE_DEFAULTS.republicResilienceCrises;
  @state() republicResilienceResponses = REPUBLIC_STATE_DEFAULTS.republicResilienceResponses;
  @state() republicResiliencePlans = REPUBLIC_STATE_DEFAULTS.republicResiliencePlans;

  // ─── Manus State ────────────────────────────────────────────
  @state() republicManusLoading = REPUBLIC_STATE_DEFAULTS.republicManusLoading;
  @state() republicManusTrainingJobs = REPUBLIC_STATE_DEFAULTS.republicManusTrainingJobs;
  @state() republicManusEvalJobs = REPUBLIC_STATE_DEFAULTS.republicManusEvalJobs;
  @state() republicManusQueueStatus = REPUBLIC_STATE_DEFAULTS.republicManusQueueStatus;

  // ─── Lovable State ──────────────────────────────────────────
  @state() republicLovableLoading = REPUBLIC_STATE_DEFAULTS.republicLovableLoading;
  @state() republicLovableJobs = REPUBLIC_STATE_DEFAULTS.republicLovableJobs;
  @state() republicLovableQueueStatus = REPUBLIC_STATE_DEFAULTS.republicLovableQueueStatus;

  // ─── World Intelligence State ───────────────────────────────
  @state() republicWorldIntelLoading = REPUBLIC_STATE_DEFAULTS.republicWorldIntelLoading;
  @state() republicWorldIntelDashboard = REPUBLIC_STATE_DEFAULTS.republicWorldIntelDashboard;
  @state() republicWorldIntelSeverityFilter =
    REPUBLIC_STATE_DEFAULTS.republicWorldIntelSeverityFilter;
  @state() republicWorldIntelCountryFilter =
    REPUBLIC_STATE_DEFAULTS.republicWorldIntelCountryFilter;
  @state() republicWorldIntelNewsExpanded = REPUBLIC_STATE_DEFAULTS.republicWorldIntelNewsExpanded;
  @state() republicWorldIntelSignals = REPUBLIC_STATE_DEFAULTS.republicWorldIntelSignals;
  @state() republicWorldIntelSelectedCountry =
    REPUBLIC_STATE_DEFAULTS.republicWorldIntelSelectedCountry;

  // ─── World Intelligence v2 State ────────────────────────────
  @state() republicWarRisks = REPUBLIC_STATE_DEFAULTS.republicWarRisks;
  @state() republicArsenal = REPUBLIC_STATE_DEFAULTS.republicArsenal;
  @state() republicWarSignals = REPUBLIC_STATE_DEFAULTS.republicWarSignals;
  @state() republicEscalationVelocities = REPUBLIC_STATE_DEFAULTS.republicEscalationVelocities;
  @state() republicAlertConfig = REPUBLIC_STATE_DEFAULTS.republicAlertConfig;
  @state() republicAlertHistory = REPUBLIC_STATE_DEFAULTS.republicAlertHistory;
  @state() republicIntelReports = REPUBLIC_STATE_DEFAULTS.republicIntelReports;
  @state() republicWorldIntelTabView = REPUBLIC_STATE_DEFAULTS.republicWorldIntelTabView;

  // ─── Media Studio State ──────────────────────────────────────
  @state() republicMediaStudioLoading = REPUBLIC_STATE_DEFAULTS.republicMediaStudioLoading;
  @state() republicMediaStudioCapabilities =
    REPUBLIC_STATE_DEFAULTS.republicMediaStudioCapabilities;
  @state() republicMediaStudioHistory = REPUBLIC_STATE_DEFAULTS.republicMediaStudioHistory;
  @state() republicMediaStudioGenerating = REPUBLIC_STATE_DEFAULTS.republicMediaStudioGenerating;
  @state() republicMediaStudioSelectedType =
    REPUBLIC_STATE_DEFAULTS.republicMediaStudioSelectedType;
  @state() republicMediaStudioPrompt = REPUBLIC_STATE_DEFAULTS.republicMediaStudioPrompt;
  @state() republicMediaStudioError = REPUBLIC_STATE_DEFAULTS.republicMediaStudioError;

  // ─── Tactical Map State (reactive layer toggles) ─────────────
  @state() republicTacticalMapSignalIdx: number | null = null;
  @state() republicTacticalMapLayers: string[] = [
    "cii",
    "warrisk",
    "signals",
    "nuclear",
    "tradeRoutes",
    "convergence",
  ];

  // ─── Citizen Chat State ──────────────────────────────────────
  @state() citizenChatHistory: Record<
    string,
    Array<{ role: string; content: string; ts: number }>
  > = {};
  @state() citizenChatSending = false;
  @state() citizenChatError: string | null = null;

  // ─── Avatar State ───────────────────────────────────────────
  @state() avatarLoading = AVATAR_STATE_DEFAULTS.avatarLoading;
  @state() avatarSection: AvatarSection = AVATAR_STATE_DEFAULTS.avatarSection;
  @state() avatarSessions: AvatarSessionInfo[] = AVATAR_STATE_DEFAULTS.avatarSessions;
  @state() avatarActiveSessionId: string | null = AVATAR_STATE_DEFAULTS.avatarActiveSessionId;
  @state() avatarMessages: AvatarMessage[] = AVATAR_STATE_DEFAULTS.avatarMessages;
  @state() avatarDraft: string = AVATAR_STATE_DEFAULTS.avatarDraft;
  @state() avatarFaceState: AvatarFaceStateType | null = AVATAR_STATE_DEFAULTS.avatarFaceState;
  @state() avatarPersonality: AvatarPersonalityType | null =
    AVATAR_STATE_DEFAULTS.avatarPersonality;
  @state() avatarDiagnostics: AvatarDiagnosticsInfo | null =
    AVATAR_STATE_DEFAULTS.avatarDiagnostics;
  @state() avatarSending = AVATAR_STATE_DEFAULTS.avatarSending;

  // ─── Companion State ───────────────────────────────────────
  @state() companionLoading = COMPANION_STATE_DEFAULTS.companionLoading;
  @state() companionStatus: CompanionState["companionStatus"] =
    COMPANION_STATE_DEFAULTS.companionStatus;
  @state() companionError: CompanionState["companionError"] =
    COMPANION_STATE_DEFAULTS.companionError;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  @state() chatNewMessagesBelow = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  /**
   * Performance guard: skip re-renders when only background-tab data changes.
   * Maps each @state() property to its owning tab group. If none of the changed
   * properties are visible in the current tab → skip the render entirely.
   */
  protected shouldUpdate(changed: Map<PropertyKey, unknown>): boolean {
    return shouldAppUpdate(changed, this.tab);
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  // ─── Republic Handlers ─────────────────────────────────────

  private get _republicState(): RepublicState {
    return this as unknown as RepublicState;
  }

  async handleRepublicLoadPopulation() {
    await loadPopulationInternal(this._republicState);
  }

  async handleRepublicLoadGovernment() {
    await loadGovernmentInternal(this._republicState);
  }

  async handleRepublicLoadEconomy() {
    await loadEconomyInternal(this._republicState);
  }

  async handleRepublicLoadSimulation() {
    await loadSimulationInternal(this._republicState);
  }

  async handleRepublicLoadTechnology() {
    await loadTechnologyInternal(this._republicState);
  }

  async handleRepublicLoadGrid() {
    await loadGridInternal(this._republicState);
  }

  async handleRepublicSimulationStart() {
    await startSimulationInternal(this._republicState);
  }

  async handleRepublicSimulationStop() {
    await stopSimulationInternal(this._republicState);
  }

  async handleRepublicSimulationPause() {
    await pauseSimulationInternal(this._republicState);
  }

  async handleRepublicSimulationTickRate(rate: number) {
    await setTickRateInternal(this._republicState, rate);
  }

  async handleRepublicToggleHarvester(id: string, enabled: boolean) {
    await toggleHarvesterInternal(this._republicState, id, enabled);
  }

  async handleRepublicAdjustTaxRate(rate: number) {
    await adjustTaxRateInternal(this._republicState, rate);
  }

  async handleRepublicHoldElection(position: string) {
    await holdElectionInternal(this._republicState, position);
  }

  async handleRepublicTrainModel(name: MLModelName) {
    await trainModelInternal(this._republicState, name);
  }

  async handleRepublicCreateUniverse(name: string) {
    await createUniverseInternal(this._republicState, name);
  }

  async handleRepublicBranchUniverse(id: string) {
    await branchUniverseInternal(this._republicState, id);
  }

  async handleRepublicCollapseUniverse(id: string) {
    await collapseUniverseInternal(this._republicState, id);
  }

  async handleRepublicAddSwarmObjective(type: string, description: string) {
    await addSwarmObjectiveInternal(this._republicState, type, description);
  }

  async handleRepublicElectLeader() {
    await electLeaderInternal(this._republicState);
  }

  handleRepublicSetCitizenSearch(query: string) {
    this.republicCitizenSearch = query;
  }

  handleRepublicSetCitizenFilter(specialization: string | null) {
    this.republicCitizenFilter = specialization;
    this.republicCitizenPage = 0;
  }

  handleRepublicSetPopulationTab(tab: string) {
    this.republicPopulationTab = tab;
  }

  handleRepublicSetCitizenPage(page: number) {
    this.republicCitizenPage = page;
    void this.handleRepublicLoadPopulation();
  }

  handleRepublicSelectCitizen(citizen: CitizenSummary | null) {
    this.republicSelectedCitizen = citizen;
  }

  handleRepublicViewMemory(citizenId: string) {
    this.republicMemoryCitizenId = citizenId;
    this.tab = "memory" as typeof this.tab;
    void loadMemoryInternal(this._republicState, citizenId);
  }

  handleRepublicSetGovernmentSection(section: RepublicState["republicGovernmentSection"]) {
    this.republicGovernmentSection = section;
  }

  handleRepublicSetTechSection(section: RepublicState["republicTechSection"]) {
    this.republicTechSection = section;
  }

  async handleRepublicSetMode(mode: "simulated" | "real") {
    await setModeInternal(this._republicState, mode);
  }

  // ─── Avatar Handlers ──────────────────────────────────────

  private get _avatarState(): AvatarState {
    return this as unknown as AvatarState;
  }

  async handleAvatarLoad() {
    await loadAvatarInternal(this._avatarState);
  }

  async handleAvatarCreateSession() {
    await createAvatarSessionInternal(this._avatarState);
  }

  async handleAvatarEndSession(sessionId: string) {
    await endAvatarSessionInternal(this._avatarState, sessionId);
  }

  handleAvatarSelectSession(sessionId: string) {
    this.avatarActiveSessionId = sessionId;
    this.avatarMessages = [];
    void loadAvatarFaceStateInternal(this._avatarState);
  }

  async handleAvatarSend() {
    await avatarSpeakInternal(this._avatarState, this.avatarDraft);
  }

  handleAvatarDraftChange(text: string) {
    this.avatarDraft = text;
  }

  handleAvatarSectionChange(section: AvatarSection) {
    this.avatarSection = section;
  }

  async handleAvatarPersonalityChange(trait: string, value: number) {
    if (this.avatarPersonality) {
      this.avatarPersonality = { ...this.avatarPersonality, [trait]: value };
    }
  }

  async handleAvatarPersonalitySave() {
    if (this.avatarPersonality) {
      await updateAvatarPersonalityInternal(this._avatarState, this.avatarPersonality);
    }
  }

  // ─── Cluster Handlers ─────────────────────────────────────

  private get _clusterState(): ClusterState {
    return this as unknown as ClusterState;
  }

  async handleClusterLoad() {
    await Promise.all([
      loadClusterInternal(this._clusterState),
      loadFederationInternal(this._clusterState),
    ]);
  }

  async handleClusterStartContainer(id: string) {
    await startContainerInternal(this._clusterState, id);
  }

  async handleClusterStopContainer(id: string) {
    await stopContainerInternal(this._clusterState, id);
  }

  async handleClusterRemoveContainer(id: string) {
    await removeContainerInternal(this._clusterState, id);
  }

  async handleClusterDeployPreset(preset: string) {
    await deployPresetInternal(this._clusterState, preset);
  }

  async handleClusterToggleN8nWorkflow(id: string, active: boolean) {
    await toggleN8nWorkflowInternal(this._clusterState, id, active);
  }

  async handleClusterTriggerN8nWorkflow(id: string) {
    await triggerN8nWorkflowInternal(this._clusterState, id);
  }

  async handleClusterAddFederationPeer(ip: string) {
    const current = this.federation.tailscalePeers;
    if (!current.includes(ip)) {
      await setFederationPeersInternal(this._clusterState, [...current, ip]);
    }
  }

  async handleClusterRemoveFederationPeer(ip: string) {
    await removeFederationPeerInternal(this._clusterState, ip);
  }

  // ─── Local Compute Handlers ─────────────────────────────────

  async handleLocalModelDownload(repoOrTag: string, computeType: "bitnet" | "ollama") {
    await downloadLocalModelInternal(this._republicState, repoOrTag, computeType);
  }

  async handleLocalModelStart(id: string, model: string) {
    await startLocalModelInternal(this._republicState, id, model);
  }

  async handleLocalModelStop(id: string, model: string) {
    await stopLocalModelInternal(this._republicState, id, model);
  }

  async handleLocalModelRemove(id: string, model: string) {
    await removeLocalModelInternal(this._republicState, id, model);
  }

  async handleStartBitnetNode(modelPath: string) {
    await startBitnetNodeInternal(this._republicState, modelPath);
  }

  // ─── ClawRouter Handlers ────────────────────────────────────

  private get _clawrouterState(): ClawRouterState {
    return this as unknown as ClawRouterState;
  }

  async handleClawRouterLoad() {
    await loadClawRouterDataInternal(this._clawrouterState);
    if (!this.clawrouterBalance) {
      void loadClawRouterBalanceInternal(this._clawrouterState);
    }
  }

  async handleClawRouterRefreshBalance() {
    await loadClawRouterBalanceInternal(this._clawrouterState);
  }

  async handleClawRouterStart() {
    await startClawRouterInternal(this._clawrouterState);
  }

  async handleClawRouterStop() {
    await stopClawRouterInternal(this._clawrouterState);
  }

  async handleClawRouterSetProfile(profile: string) {
    await setClawRouterProfileInternal(this._clawrouterState, profile);
  }

  async handleClawRouterSetCompression(enabled: boolean) {
    await setClawRouterCompressionInternal(this._clawrouterState, enabled);
  }

  async handleClawRouterSetCacheTTL(ttl: number) {
    await setClawRouterCacheTTLInternal(this._clawrouterState, ttl);
  }

  handleClawRouterSetSection(s: ClawRouterState["clawrouterSection"]) {
    this.clawrouterSection = s;
  }

  handleClawRouterSetModelSort(s: ClawRouterState["clawrouterModelSort"]) {
    this.clawrouterModelSort = s;
  }

  handleClawRouterSetModelSearch(q: string) {
    this.clawrouterModelSearch = q;
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
