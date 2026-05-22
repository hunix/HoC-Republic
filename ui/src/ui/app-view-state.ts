import type { EventLogEntry } from "./app-events.ts";
import type { CompactionStatus } from "./app-tool-stream.ts";
import type { AvatarState, AvatarSection } from "./controllers/avatar.ts";
import type { ModelInfo } from "./controllers/chat.ts";
import type { ClawRouterState } from "./controllers/clawrouter.ts";
import type { ClusterState } from "./controllers/cluster.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { RepublicState } from "./controllers/republic.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { MLModelName } from "./republic-types.ts";
import type { UiSettings } from "./storage.ts";
import type { ThemeTransitionContext } from "./theme-transition.ts";
import type { ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ChannelsStatusSnapshot,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  NostrProfile,
  PresenceEntry,
  SessionsUsageResult,
  CostUsageSummary,
  SessionUsageTimeSeries,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
} from "./types.ts";
import type { ChatAttachment, ChatQueueItem, CronFormState } from "./ui-types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import type { SessionLogEntry } from "./views/usage.ts";

export type AppViewState = {
  settings: UiSettings;
  password: string;
  tab: Tab;
  onboarding: boolean;
  basePath: string;
  connected: boolean;
  theme: ThemeMode;
  themeResolved: "light" | "dark";
  hello: GatewayHelloOk | null;
  lastError: string | null;
  eventLog: EventLogEntry[];
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatLoading: boolean;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatMessages: unknown[];
  chatToolMessages: unknown[];
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  chatRunId: string | null;
  chatModels: ModelInfo[];
  chatModelsLoading: boolean;
  chatActiveModel: ModelInfo | null;
  chatActiveModelIsOverride: boolean;
  compactionStatus: CompactionStatus | null;
  chatAvatarUrl: string | null;
  chatThinkingLevel: string | null;
  chatQueue: ChatQueueItem[];
  nodesLoading: boolean;
  nodes: Array<Record<string, unknown>>;
  chatNewMessagesBelow: boolean;
  sidebarOpen: boolean;
  sidebarContent: string | null;
  sidebarError: string | null;
  splitRatio: number;
  scrollToBottom: () => void;
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;
  lastRotatedToken: string | null;
  execApprovalsLoading: boolean;
  execApprovalsSaving: boolean;
  execApprovalsDirty: boolean;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null;
  execApprovalsForm: ExecApprovalsFile | null;
  execApprovalsSelectedAgent: string | null;
  execApprovalsTarget: "gateway" | "node";
  execApprovalsTargetNodeId: string | null;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalBusy: boolean;
  execApprovalError: string | null;
  pendingGatewayUrl: string | null;
  configLoading: boolean;
  configRaw: string;
  configRawOriginal: string;
  configValid: boolean | null;
  configIssues: unknown[];
  configSaving: boolean;
  configApplying: boolean;
  updateRunning: boolean;
  applySessionKey: string;
  configSnapshot: ConfigSnapshot | null;
  configSchema: unknown;
  configSchemaVersion: string | null;
  configSchemaLoading: boolean;
  configUiHints: ConfigUiHints;
  configForm: Record<string, unknown> | null;
  configFormOriginal: Record<string, unknown> | null;
  configFormMode: "form" | "raw";
  configSearchQuery: string;
  configActiveSection: string | null;
  configActiveSubsection: string | null;
  configAutoSaveStatus: "pending" | "saving" | "saved" | "error" | null;
  channelsLoading: boolean;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsError: string | null;
  channelsLastSuccess: number | null;
  whatsappLoginMessage: string | null;
  whatsappLoginQrDataUrl: string | null;
  whatsappLoginConnected: boolean | null;
  whatsappBusy: boolean;
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;
  configFormDirty: boolean;
  presenceLoading: boolean;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: string | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  agentsSelectedId: string | null;
  agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron";
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileActive: string | null;
  agentFileSaving: boolean;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkillsLoading: boolean;
  agentSkillsError: string | null;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsAgentId: string | null;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
  usageLoading: boolean;
  usageResult: SessionsUsageResult | null;
  usageCostSummary: CostUsageSummary | null;
  usageError: string | null;
  usageStartDate: string;
  usageEndDate: string;
  usageSelectedSessions: string[];
  usageSelectedDays: string[];
  usageSelectedHours: number[];
  usageChartMode: "tokens" | "cost";
  usageDailyChartMode: "total" | "by-type";
  usageTimeSeriesMode: "cumulative" | "per-turn";
  usageTimeSeriesBreakdownMode: "total" | "by-type";
  usageTimeSeries: SessionUsageTimeSeries | null;
  usageTimeSeriesLoading: boolean;
  usageSessionLogs: SessionLogEntry[] | null;
  usageSessionLogsLoading: boolean;
  usageSessionLogsExpanded: boolean;
  usageQuery: string;
  usageQueryDraft: string;
  usageQueryDebounceTimer: number | null;
  usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors";
  usageSessionSortDir: "asc" | "desc";
  usageRecentSessions: string[];
  usageTimeZone: "local" | "utc";
  usageContextExpanded: boolean;
  usageHeaderPinned: boolean;
  usageSessionsTab: "all" | "recent";
  usageVisibleColumns: string[];
  usageLogFilterRoles: import("./views/usage.js").SessionLogRole[];
  usageLogFilterTools: string[];
  usageLogFilterHasTools: boolean;
  usageLogFilterQuery: string;
  cronLoading: boolean;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  cronError: string | null;
  cronForm: CronFormState;
  cronRunsJobId: string | null;
  cronRuns: CronRunLogEntry[];
  cronBusy: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsFilter: string;
  skillEdits: Record<string, string>;
  skillMessages: Record<string, SkillMessage>;
  skillsBusyKey: string | null;
  debugLoading: boolean;
  debugStatus: StatusSummary | null;
  debugHealth: HealthSnapshot | null;
  debugModels: unknown[];
  debugHeartbeat: unknown;
  debugCallMethod: string;
  debugCallParams: string;
  debugCallResult: string | null;
  debugCallError: string | null;
  logsLoading: boolean;
  logsError: string | null;
  logsFile: string | null;
  logsEntries: LogEntry[];
  logsFilterText: string;
  logsLevelFilters: Record<LogLevel, boolean>;
  logsAutoFollow: boolean;
  logsTruncated: boolean;
  logsCursor: number | null;
  logsLastFetchAt: number | null;
  logsLimit: number;
  logsMaxBytes: number;
  logsAtBottom: boolean;
  client: GatewayBrowserClient | null;
  refreshSessionsAfterChat: Set<string>;
  connect: () => void;
  setTab: (tab: Tab) => void;
  setTheme: (theme: ThemeMode, context?: ThemeTransitionContext) => void;
  applySettings: (next: UiSettings) => void;
  loadOverview: () => Promise<void>;
  loadAssistantIdentity: () => Promise<void>;
  loadCron: () => Promise<void>;
  handleWhatsAppStart: (force: boolean) => Promise<void>;
  handleWhatsAppWait: () => Promise<void>;
  handleWhatsAppLogout: () => Promise<void>;
  handleChannelConfigSave: () => Promise<void>;
  handleChannelConfigReload: () => Promise<void>;
  handleNostrProfileEdit: (accountId: string, profile: NostrProfile | null) => void;
  handleNostrProfileCancel: () => void;
  handleNostrProfileFieldChange: (field: keyof NostrProfile, value: string) => void;
  handleNostrProfileSave: () => Promise<void>;
  handleNostrProfileImport: () => Promise<void>;
  handleNostrProfileToggleAdvanced: () => void;
  handleExecApprovalDecision: (decision: "allow-once" | "allow-always" | "deny") => Promise<void>;
  handleGatewayUrlConfirm: () => void;
  handleGatewayUrlCancel: () => void;
  handleConfigLoad: () => Promise<void>;
  handleConfigSave: () => Promise<void>;
  handleConfigApply: () => Promise<void>;
  handleConfigFormUpdate: (path: string, value: unknown) => void;
  handleConfigFormModeChange: (mode: "form" | "raw") => void;
  handleConfigRawChange: (raw: string) => void;
  handleInstallSkill: (key: string) => Promise<void>;
  handleUpdateSkill: (key: string) => Promise<void>;
  handleToggleSkillEnabled: (key: string, enabled: boolean) => Promise<void>;
  handleUpdateSkillEdit: (key: string, value: string) => void;
  handleSaveSkillApiKey: (key: string, apiKey: string) => Promise<void>;
  handleCronToggle: (jobId: string, enabled: boolean) => Promise<void>;
  handleCronRun: (jobId: string) => Promise<void>;
  handleCronRemove: (jobId: string) => Promise<void>;
  handleCronAdd: () => Promise<void>;
  handleCronRunsLoad: (jobId: string) => Promise<void>;
  handleCronFormUpdate: (path: string, value: unknown) => void;
  handleSessionsLoad: () => Promise<void>;
  handleSessionsPatch: (key: string, patch: unknown) => Promise<void>;
  handleLoadNodes: () => Promise<void>;
  handleLoadPresence: () => Promise<void>;
  handleLoadSkills: () => Promise<void>;
  handleLoadDebug: () => Promise<void>;
  handleLoadLogs: () => Promise<void>;
  handleDebugCall: () => Promise<void>;
  handleRunUpdate: () => Promise<void>;
  setPassword: (next: string) => void;
  setSessionKey: (next: string) => void;
  setChatMessage: (next: string) => void;
  handleSendChat: (messageOverride?: string, opts?: { restoreDraft?: boolean }) => Promise<void>;
  handleAbortChat: () => Promise<void>;
  removeQueuedMessage: (id: string) => void;
  handleChatScroll: (event: Event) => void;
  resetToolStream: () => void;
  resetChatScroll: () => void;
  exportLogs: (lines: string[], label: string) => void;
  handleLogsScroll: (event: Event) => void;
  handleOpenSidebar: (content: string) => void;
  handleCloseSidebar: () => void;
  handleSplitRatioChange: (ratio: number) => void;

  // Republic state
  republicPopulationLoading: RepublicState["republicPopulationLoading"];
  republicPopulationStats: RepublicState["republicPopulationStats"];
  republicCitizens: RepublicState["republicCitizens"];
  republicCitizenSearch: RepublicState["republicCitizenSearch"];
  republicCitizenFilter: RepublicState["republicCitizenFilter"];
  republicCitizenPage: RepublicState["republicCitizenPage"];
  republicSelectedCitizen: RepublicState["republicSelectedCitizen"];
  republicPopulationTab: string;
  republicGovernmentLoading: RepublicState["republicGovernmentLoading"];
  republicGovernmentStatus: RepublicState["republicGovernmentStatus"];
  republicGovernmentSection: RepublicState["republicGovernmentSection"];
  republicEconomyLoading: RepublicState["republicEconomyLoading"];
  republicTreasury: RepublicState["republicTreasury"];
  republicSimulationLoading: RepublicState["republicSimulationLoading"];
  republicSimulationStatus: RepublicState["republicSimulationStatus"];
  republicEventQueue: RepublicState["republicEventQueue"];
  republicMode: RepublicState["republicMode"];
  republicTechLoading: RepublicState["republicTechLoading"];
  republicAtlantis: RepublicState["republicAtlantis"];
  republicML: RepublicState["republicML"];
  republicQuantum: RepublicState["republicQuantum"];
  republicTechSection: RepublicState["republicTechSection"];
  republicGridLoading: RepublicState["republicGridLoading"];
  republicGrid: RepublicState["republicGrid"];

  // Phase 8 – Visualization state
  republicEducationLoading: RepublicState["republicEducationLoading"];
  republicEducation: RepublicState["republicEducation"];
  republicMemoryLoading: RepublicState["republicMemoryLoading"];
  republicMemory: RepublicState["republicMemory"];
  republicCollective: RepublicState["republicCollective"];
  republicMemoryCitizenId: RepublicState["republicMemoryCitizenId"];
  republicDevLoading: RepublicState["republicDevLoading"];
  republicDevProjects: RepublicState["republicDevProjects"];
  republicExecutionLoading: RepublicState["republicExecutionLoading"];
  republicExecutionHistory: RepublicState["republicExecutionHistory"];
  republicExecutionDiagnostics: RepublicState["republicExecutionDiagnostics"];
  republicDevProjectDetail: RepublicState["republicDevProjectDetail"];
  republicDevProjectDetailLoading: RepublicState["republicDevProjectDetailLoading"];
  republicDevFileContent: RepublicState["republicDevFileContent"];
  republicDevFileLoading: RepublicState["republicDevFileLoading"];

  // Dev Studio UI state
  studioOpenFiles: RepublicState["studioOpenFiles"];
  studioActiveFile: RepublicState["studioActiveFile"];
  studioPreviewMode: RepublicState["studioPreviewMode"];
  studioPreviewUrl: RepublicState["studioPreviewUrl"];
  studioPreviewRoutes: RepublicState["studioPreviewRoutes"];
  studioPreviewActiveRoute: RepublicState["studioPreviewActiveRoute"];
  studioPreviewDevice: RepublicState["studioPreviewDevice"];
  studioPreviewInteractive: RepublicState["studioPreviewInteractive"];
  studioBottomPanel: RepublicState["studioBottomPanel"];
  studioTerminalOutput: RepublicState["studioTerminalOutput"];
  studioAiPrompt: RepublicState["studioAiPrompt"];
  studioAiSending: RepublicState["studioAiSending"];
  studioGsdTimeline: RepublicState["studioGsdTimeline"];
  studioGsdTeam: RepublicState["studioGsdTeam"];
  studioGsdQualityScore: RepublicState["studioGsdQualityScore"];
  studioSidebarCollapsed: RepublicState["studioSidebarCollapsed"];
  studioPreviewCollapsed: RepublicState["studioPreviewCollapsed"];
  studioBottomCollapsed: RepublicState["studioBottomCollapsed"];
  previewEngineLoading: RepublicState["previewEngineLoading"];
  previewEngineSelectedProjectId: RepublicState["previewEngineSelectedProjectId"];
  previewEngineSession: RepublicState["previewEngineSession"];
  previewEngineDevice: RepublicState["previewEngineDevice"];
  previewEngineConsoleOpen: RepublicState["previewEngineConsoleOpen"];
  previewEngineBlobUrl: RepublicState["previewEngineBlobUrl"];
  previewEngineWebcontainerAvailable: RepublicState["previewEngineWebcontainerAvailable"];
  republicGenomeLoading: RepublicState["republicGenomeLoading"];
  republicGenomePool: RepublicState["republicGenomePool"];
  republicSelectedGenomeId: RepublicState["republicSelectedGenomeId"];
  republicGenomeNetwork: RepublicState["republicGenomeNetwork"];
  republicGenomeDna: RepublicState["republicGenomeDna"];
  republicGenomeLineage: RepublicState["republicGenomeLineage"];
  republicGenomeLandscape: RepublicState["republicGenomeLandscape"];

  // Avatar state
  avatarLoading: AvatarState["avatarLoading"];
  avatarSection: AvatarState["avatarSection"];
  avatarSessions: AvatarState["avatarSessions"];
  avatarActiveSessionId: AvatarState["avatarActiveSessionId"];
  avatarMessages: AvatarState["avatarMessages"];
  avatarDraft: AvatarState["avatarDraft"];
  avatarFaceState: AvatarState["avatarFaceState"];
  avatarPersonality: AvatarState["avatarPersonality"];
  avatarDiagnostics: AvatarState["avatarDiagnostics"];
  avatarSending: AvatarState["avatarSending"];

  republicLocalComputeLoading: RepublicState["republicLocalComputeLoading"];
  republicLocalInstances: RepublicState["republicLocalInstances"];
  republicDownloadedBitnetModels: RepublicState["republicDownloadedBitnetModels"];
  republicDockerLoading: RepublicState["republicDockerLoading"];
  republicDockerDiagnostics: RepublicState["republicDockerDiagnostics"];
  republicDockerContainers: RepublicState["republicDockerContainers"];

  // Marketplace
  republicAIStoreLoading: RepublicState["republicAIStoreLoading"];
  republicAIStoreListings: RepublicState["republicAIStoreListings"];
  republicAIStoreProductions: RepublicState["republicAIStoreProductions"];
  republicAIStoreDiagnostics: RepublicState["republicAIStoreDiagnostics"];
  republicAIStoreTab: RepublicState["republicAIStoreTab"];
  republicAIStoreCategory: RepublicState["republicAIStoreCategory"];

  // Productions
  republicProductionLoading: RepublicState["republicProductionLoading"];
  republicProductionItems: RepublicState["republicProductionItems"];
  republicProductionStats: RepublicState["republicProductionStats"];
  republicProductionFiles: RepublicState["republicProductionFiles"];
  republicProductionCategory: RepublicState["republicProductionCategory"];

  // Cognitive frontier
  republicMetacognitionDiagnostics: RepublicState["republicMetacognitionDiagnostics"];
  republicNarrativeDiagnostics: RepublicState["republicNarrativeDiagnostics"];
  republicDreamDiagnostics: RepublicState["republicDreamDiagnostics"];
  republicReasoningDiagnostics: RepublicState["republicReasoningDiagnostics"];
  republicDiplomacyDiagnostics: RepublicState["republicDiplomacyDiagnostics"];
  republicResilienceDiagnostics: RepublicState["republicResilienceDiagnostics"];

  // Cognitive frontier sub-collections
  republicMetacognitionJournals: RepublicState["republicMetacognitionJournals"];
  republicMetacognitionCitizenId: RepublicState["republicMetacognitionCitizenId"];
  republicMetacognitionCitizenDetail: RepublicState["republicMetacognitionCitizenDetail"];
  republicNarrativeThreads: RepublicState["republicNarrativeThreads"];
  republicNarrativeArcs: RepublicState["republicNarrativeArcs"];
  republicSharedDreams: RepublicState["republicSharedDreams"];
  republicReasoningChains: RepublicState["republicReasoningChains"];
  republicDiplomacyContracts: RepublicState["republicDiplomacyContracts"];
  republicDiplomacyNorms: RepublicState["republicDiplomacyNorms"];
  republicDiplomacyTreaties: RepublicState["republicDiplomacyTreaties"];
  republicDiplomacyBreaches: RepublicState["republicDiplomacyBreaches"];
  republicResilienceCrises: RepublicState["republicResilienceCrises"];
  republicResilienceResponses: RepublicState["republicResilienceResponses"];
  republicResiliencePlans: RepublicState["republicResiliencePlans"];

  // Plugins
  republicPluginsLoading: RepublicState["republicPluginsLoading"];
  republicPlugins: RepublicState["republicPlugins"];
  republicPluginsDiagnostics: RepublicState["republicPluginsDiagnostics"];
  republicPluginsDir: RepublicState["republicPluginsDir"];
  republicPluginsExpandedId: RepublicState["republicPluginsExpandedId"];
  republicPluginsFilterCategory: RepublicState["republicPluginsFilterCategory"];
  republicPluginsSearchQuery: RepublicState["republicPluginsSearchQuery"];
  republicPluginsActivatingId: RepublicState["republicPluginsActivatingId"];

  // Manus (RL Agent Training)
  republicManusLoading: RepublicState["republicManusLoading"];
  republicManusTrainingJobs: RepublicState["republicManusTrainingJobs"];
  republicManusEvalJobs: RepublicState["republicManusEvalJobs"];
  republicManusQueueStatus: RepublicState["republicManusQueueStatus"];

  // Lovable (Website Cloning)
  republicLovableLoading: RepublicState["republicLovableLoading"];
  republicLovableJobs: RepublicState["republicLovableJobs"];
  republicLovableQueueStatus: RepublicState["republicLovableQueueStatus"];

  // World Intelligence v1
  republicWorldIntelLoading: RepublicState["republicWorldIntelLoading"];
  republicWorldIntelDashboard: RepublicState["republicWorldIntelDashboard"];
  republicWorldIntelSeverityFilter: RepublicState["republicWorldIntelSeverityFilter"];
  republicWorldIntelCountryFilter: RepublicState["republicWorldIntelCountryFilter"];
  republicWorldIntelNewsExpanded: RepublicState["republicWorldIntelNewsExpanded"];
  republicWorldIntelSignals: RepublicState["republicWorldIntelSignals"];
  republicWorldIntelSelectedCountry: RepublicState["republicWorldIntelSelectedCountry"];
  // World Intelligence v2
  republicWarRisks: RepublicState["republicWarRisks"];
  republicArsenal: RepublicState["republicArsenal"];
  republicWarSignals: RepublicState["republicWarSignals"];
  republicEscalationVelocities: RepublicState["republicEscalationVelocities"];
  republicAlertConfig: RepublicState["republicAlertConfig"];
  republicAlertHistory: RepublicState["republicAlertHistory"];
  republicIntelReports: RepublicState["republicIntelReports"];
  republicWorldIntelTabView: RepublicState["republicWorldIntelTabView"];

  // Media Studio
  republicMediaStudioLoading: RepublicState["republicMediaStudioLoading"];
  republicMediaStudioCapabilities: RepublicState["republicMediaStudioCapabilities"];
  republicMediaStudioHistory: RepublicState["republicMediaStudioHistory"];
  republicMediaStudioGenerating: RepublicState["republicMediaStudioGenerating"];
  republicMediaStudioSelectedType: RepublicState["republicMediaStudioSelectedType"];
  republicMediaStudioPrompt: RepublicState["republicMediaStudioPrompt"];
  republicMediaStudioError: RepublicState["republicMediaStudioError"];

  // Tactical Map reactive state
  republicTacticalMapSignalIdx: number | null;
  republicTacticalMapLayers: string[];

  // Citizen Chat state
  citizenChatHistory: Record<string, Array<{ role: string; content: string; ts: number }>>;
  citizenChatSending: boolean;
  citizenChatError: string | null;

  // LitElement lifecycle
  requestUpdate: () => void;

  // Cluster state
  clusterLoading: ClusterState["clusterLoading"];
  clusterError: ClusterState["clusterError"];
  gatewayPeers: ClusterState["gatewayPeers"];
  gatewayRole: ClusterState["gatewayRole"];
  clusterNodes: ClusterState["clusterNodes"];
  dockerContainers: ClusterState["dockerContainers"];
  dockerAvailable: ClusterState["dockerAvailable"];
  runtimes: ClusterState["runtimes"];
  n8nStatus: ClusterState["n8nStatus"];
  federation: ClusterState["federation"];

  // ClawRouter state
  clawrouterLoading: ClawRouterState["clawrouterLoading"];
  clawrouterConfig: ClawRouterState["clawrouterConfig"];
  clawrouterModels: ClawRouterState["clawrouterModels"];
  clawrouterBalance: ClawRouterState["clawrouterBalance"];
  clawrouterBalanceLoading: ClawRouterState["clawrouterBalanceLoading"];
  clawrouterHealthy: ClawRouterState["clawrouterHealthy"];
  clawrouterStats: ClawRouterState["clawrouterStats"];
  clawrouterSection: ClawRouterState["clawrouterSection"];
  clawrouterModelSort: ClawRouterState["clawrouterModelSort"];
  clawrouterModelSearch: ClawRouterState["clawrouterModelSearch"];

  // ClawRouter handlers
  handleClawRouterLoad: () => Promise<void>;
  handleClawRouterRefreshBalance: () => Promise<void>;
  handleClawRouterSetProfile: (profile: string) => Promise<void>;
  handleClawRouterSetCompression: (enabled: boolean) => Promise<void>;
  handleClawRouterSetCacheTTL: (ttl: number) => Promise<void>;
  handleClawRouterSetSection: (s: ClawRouterState["clawrouterSection"]) => void;
  handleClawRouterSetModelSort: (s: ClawRouterState["clawrouterModelSort"]) => void;
  handleClawRouterSetModelSearch: (q: string) => void;

  // Republic handlers
  handleRepublicLoadPopulation: () => Promise<void>;
  handleRepublicLoadGovernment: () => Promise<void>;
  handleRepublicLoadEconomy: () => Promise<void>;
  handleRepublicLoadSimulation: () => Promise<void>;
  handleRepublicLoadTechnology: () => Promise<void>;
  handleRepublicLoadGrid: () => Promise<void>;
  handleRepublicSimulationStart: () => Promise<void>;
  handleRepublicSimulationStop: () => Promise<void>;
  handleRepublicSimulationPause: () => Promise<void>;
  handleRepublicSimulationTickRate: (rate: number) => Promise<void>;
  handleRepublicToggleHarvester: (id: string, enabled: boolean) => Promise<void>;
  handleRepublicAdjustTaxRate: (rate: number) => Promise<void>;
  handleRepublicHoldElection: (position: string) => Promise<void>;
  handleRepublicTrainModel: (name: MLModelName) => Promise<void>;
  handleRepublicCreateUniverse: (name: string) => Promise<void>;
  handleRepublicBranchUniverse: (id: string) => Promise<void>;
  handleRepublicCollapseUniverse: (id: string) => Promise<void>;
  handleRepublicAddSwarmObjective: (type: string, description: string) => Promise<void>;
  handleRepublicElectLeader: () => Promise<void>;
  handleRepublicSetCitizenSearch: (query: string) => void;
  handleRepublicSetCitizenFilter: (specialization: string | null) => void;
  handleRepublicSetCitizenPage: (page: number) => void;
  handleRepublicSelectCitizen: (citizen: RepublicState["republicSelectedCitizen"]) => void;
  handleRepublicViewMemory: (citizenId: string) => void;
  handleRepublicSetPopulationTab: (tab: string) => void;
  handleRepublicSetGovernmentSection: (section: RepublicState["republicGovernmentSection"]) => void;
  handleRepublicSetTechSection: (section: RepublicState["republicTechSection"]) => void;
  handleRepublicSetMode: (mode: "simulated" | "real") => Promise<void>;
  handleRepublicExecuteAction: (action: string, params?: Record<string, unknown>) => Promise<void>;

  // Local Compute handlers
  handleLocalModelDownload: (repoOrTag: string, computeType: "bitnet" | "ollama") => Promise<void>;
  handleLocalModelStart: (id: string, model: string) => Promise<void>;
  handleLocalModelStop: (id: string, model: string) => Promise<void>;
  handleLocalModelRemove: (id: string, model: string) => Promise<void>;
  handleStartBitnetNode: (modelPath: string) => Promise<void>;

  // Avatar handlers
  handleAvatarLoad: () => Promise<void>;
  handleAvatarCreateSession: () => Promise<void>;
  handleAvatarEndSession: (sessionId: string) => Promise<void>;
  handleAvatarSelectSession: (sessionId: string) => void;
  handleAvatarSend: () => Promise<void>;
  handleAvatarDraftChange: (text: string) => void;
  handleAvatarSectionChange: (section: AvatarSection) => void;
  handleAvatarPersonalityChange: (trait: string, value: number) => void;
  handleAvatarPersonalitySave: () => Promise<void>;

  // Cluster handlers
  handleClusterLoad: () => Promise<void>;
  handleClusterStartContainer: (id: string) => Promise<void>;
  handleClusterStopContainer: (id: string) => Promise<void>;
  handleClusterRemoveContainer: (id: string) => Promise<void>;
  handleClusterDeployPreset: (preset: string) => Promise<void>;
  handleClusterToggleN8nWorkflow: (id: string, active: boolean) => Promise<void>;
  handleClusterTriggerN8nWorkflow: (id: string) => Promise<void>;
  handleClusterAddFederationPeer: (ip: string) => Promise<void>;
  handleClusterRemoveFederationPeer: (ip: string) => Promise<void>;
};
