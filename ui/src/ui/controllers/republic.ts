/**
 * Republic Platform — Gateway Bridge Controller
 *
 * RPC controller that talks to the .NET Republic backend through the
 * existing GatewayBrowserClient. Follows the same pattern as other
 * controllers in ui/src/ui/controllers/.
 */

import { zipSync, strToU8 } from "fflate";
import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  PopulationStats,
  CitizenSummary,
  GovernmentStatus,
  TreasuryReport,
  SimulationStatus,
  ScheduledEvent,
  AtlantisStatus,
  MLStatus,
  MLModelName,
  QuantumStatus,
  GridStatus,
  RepublicOverview,
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
  LocalInstance,
  DownloadedBitnetModel,
} from "../republic-types.ts";
import type { Listing, Production, MarketplaceDiagnostics } from "../views/aistore-view.ts";
import type { DevStudioTab, PreviewMode, BottomPanel } from "../views/dev-studio.ts";
import type {
  ProtocolDiagnostics,
  Contract,
  SocialNorm,
  Treaty,
  NormBreach,
} from "../views/diplomacy-view.ts";
import type { DockerDiagnostics, ContainerInfo } from "../views/docker-dashboard.ts";
import type { DreamDiagnostics, Dream } from "../views/dreams-view.ts";
import type { LovableJob, LovableQueueStatus } from "../views/lovable-view.ts";
import type { ManusTrainingJob, ManusEvalJob, ManusQueueStatus } from "../views/manus-view.ts";
import type {
  MetacognitionDiagnostics,
  IntrospectionEntry,
  CitizenMetacognition,
} from "../views/metacognition-view.ts";
import type { NarrativeDiagnostics, PlotThread, StoryArc } from "../views/narrative-view.ts";
import type { PluginInfo, PluginDiagnostics } from "../views/plugins-view.ts";
import type { OutputEntry, OutputStats } from "../views/productions-view.ts";
import type { ReasoningDiagnostics, ReasoningChain } from "../views/reasoning-view.ts";
import type {
  AntifragilityDiagnostics,
  ChaosEvent,
  StressResponse,
  RedundancyPlan,
} from "../views/resilience-view.ts";
import type { WorldIntelDashboard, ThreatSeverity } from "../views/worldintel-view.ts";

// ─── State slice ────────────────────────────────────────────────

export interface RepublicState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  lastError: string | null;

  // Population
  republicPopulationLoading: boolean;
  republicPopulationStats: PopulationStats | null;
  republicCitizens: CitizenSummary[];
  republicCitizenSearch: string;
  republicCitizenFilter: string | null;
  republicCitizenPage: number;
  republicSelectedCitizen: CitizenSummary | null;

  // Government
  republicGovernmentLoading: boolean;
  republicGovernmentStatus: GovernmentStatus | null;
  republicGovernmentSection:
    | "executive"
    | "legislature"
    | "judiciary"
    | "departments"
    | "elections";

  // Economy
  republicEconomyLoading: boolean;
  republicTreasury: TreasuryReport | null;

  // Simulation
  republicSimulationLoading: boolean;
  republicSimulationStatus: SimulationStatus | null;
  republicEventQueue: ScheduledEvent[];
  republicMode: "simulated" | "real";

  // Technology
  republicTechLoading: boolean;
  republicAtlantis: AtlantisStatus | null;
  republicML: MLStatus | null;
  republicQuantum: QuantumStatus | null;
  republicTechSection: "atlantis" | "ml" | "quantum";

  // Grid
  republicGridLoading: boolean;
  republicGrid: GridStatus | null;

  // Education
  republicEducationLoading: boolean;
  republicEducation: EducationStatus | null;

  // Memory
  republicMemoryLoading: boolean;
  republicMemory: CitizenMemoryView | null;
  republicMemoryCitizenId: string | null;
  republicCollective: CollectiveEntry[];

  // Dev Projects
  republicDevLoading: boolean;
  republicDevProjects: DevProjectsStatus | null;
  republicDevProjectDetail: DevProjectDetail | null;
  republicDevProjectDetailLoading: boolean;
  republicDevFileContent: DevFileContent | null;
  republicDevFileLoading: boolean;

  // Dev Studio UI state (editor, preview, terminal)
  studioOpenFiles: DevStudioTab[];
  studioActiveFile: string | null;
  studioPreviewMode: PreviewMode;
  studioPreviewUrl: string | null;
  studioPreviewRoutes: { path: string; label: string; filePath: string }[];
  studioPreviewActiveRoute: string;
  studioPreviewDevice: "desktop" | "tablet" | "mobile";
  studioPreviewInteractive: boolean;
  studioBottomPanel: BottomPanel;
  studioTerminalOutput: string[];
  studioAiPrompt: string;
  studioAiSending: boolean;
  studioGsdTimeline: { timestamp: number; type: string; citizenName?: string; detail: string }[];
  studioGsdTeam: { name: string; specialization: string; role: string; tasksCompleted: number }[];
  studioGsdQualityScore: number;
  studioSidebarCollapsed: boolean;
  studioPreviewCollapsed: boolean;
  studioBottomCollapsed: boolean;

  // Preview engines
  previewEngineLoading: boolean;
  previewEngineSelectedProjectId: string | null;
  previewEngineSession: Record<string, unknown> | null;
  previewEngineDevice: "desktop" | "tablet" | "mobile";
  previewEngineConsoleOpen: boolean;
  previewEngineBlobUrl: string | null;
  previewEngineWebcontainerAvailable: boolean;

  // Execution
  republicExecutionLoading: boolean;
  republicExecutionHistory: ExecutionHistoryEntry[];
  republicExecutionDiagnostics: ExecutionDiagnostics | null;

  // Genome
  republicGenomeLoading: boolean;
  republicGenomePool: GenomePoolEntry[];
  republicGenomeNetwork: NetworkGraph | null;
  republicGenomeDna: DnaStrand | null;
  republicGenomeLineage: LineageTree | null;
  republicGenomeLandscape: FitnessLandscape | null;
  republicSelectedGenomeId: string | null;

  republicLocalComputeLoading: boolean;
  republicLocalInstances: LocalInstance[];
  republicDownloadedBitnetModels: DownloadedBitnetModel[];

  republicDockerLoading: boolean;
  republicDockerDiagnostics: DockerDiagnostics | null;
  republicDockerContainers: ContainerInfo[];

  // Marketplace
  republicAIStoreLoading: boolean;
  republicAIStoreListings: Listing[];
  republicAIStoreProductions: Production[];
  republicAIStoreDiagnostics: MarketplaceDiagnostics | null;
  republicAIStoreTab: "listings" | "gallery" | "stats";
  republicAIStoreCategory: string | null;

  // Productions
  republicProductionLoading: boolean;
  republicProductionItems: OutputEntry[];
  republicProductionStats: OutputStats | null;
  republicProductionFiles: { name: string; category: string; size: number; path: string }[];
  republicProductionCategory: string | null;

  // Cognitive frontier diagnostics
  republicMetacognitionDiagnostics: MetacognitionDiagnostics | null;
  republicNarrativeDiagnostics: NarrativeDiagnostics | null;
  republicDreamDiagnostics: DreamDiagnostics | null;
  republicReasoningDiagnostics: ReasoningDiagnostics | null;
  republicDiplomacyDiagnostics: ProtocolDiagnostics | null;
  republicResilienceDiagnostics: AntifragilityDiagnostics | null;

  // Cognitive frontier sub-collections (used by views, populated by loadCognitive)
  republicMetacognitionJournals: IntrospectionEntry[];
  republicMetacognitionCitizenId: string | null;
  republicMetacognitionCitizenDetail: CitizenMetacognition | null;
  republicNarrativeThreads: PlotThread[];
  republicNarrativeArcs: StoryArc[];
  republicSharedDreams: Dream[];
  republicReasoningChains: ReasoningChain[];
  republicDiplomacyContracts: Contract[];
  republicDiplomacyNorms: SocialNorm[];
  republicDiplomacyTreaties: Treaty[];
  republicDiplomacyBreaches: NormBreach[];
  republicResilienceCrises: ChaosEvent[];
  republicResilienceResponses: StressResponse[];
  republicResiliencePlans: RedundancyPlan[];

  // Plugins
  republicPluginsLoading: boolean;
  republicPlugins: PluginInfo[];
  republicPluginsDiagnostics: PluginDiagnostics | null;
  republicPluginsDir: string | null;
  republicPluginsExpandedId: string | null;
  republicPluginsFilterCategory: string | null;
  republicPluginsSearchQuery: string;
  republicPluginsActivatingId: string | null;

  // Manus (RL Agent Training)
  republicManusLoading: boolean;
  republicManusTrainingJobs: ManusTrainingJob[];
  republicManusEvalJobs: ManusEvalJob[];
  republicManusQueueStatus: ManusQueueStatus | null;

  // Lovable (Website Cloning)
  republicLovableLoading: boolean;
  republicLovableJobs: LovableJob[];
  republicLovableQueueStatus: LovableQueueStatus | null;

  // World Intelligence v1
  republicWorldIntelLoading: boolean;
  republicWorldIntelDashboard: WorldIntelDashboard | null;
  republicWorldIntelSeverityFilter: ThreatSeverity | null;
  republicWorldIntelCountryFilter: string | null;
  republicWorldIntelNewsExpanded: boolean;
  republicWorldIntelSignals: unknown[];
  republicWorldIntelSelectedCountry: string | null;
  // World Intelligence v2
  republicWarRisks: unknown[];
  republicArsenal: unknown[];
  republicWarSignals: unknown[];
  republicEscalationVelocities: unknown[];
  republicAlertConfig: unknown | null;
  republicAlertHistory: unknown[];
  republicIntelReports: unknown[];
  republicWorldIntelTabView: "overview" | "map" | "arsenal" | "alerts" | "reports";

  // Media Studio
  republicMediaStudioLoading: boolean;
  republicMediaStudioCapabilities: {
    availableCapabilities: string[];
    pluginsByCapability: Record<string, string[]>;
    totalMediaPlugins: number;
  } | null;
  republicMediaStudioHistory: unknown[];
  republicMediaStudioGenerating: boolean;
  republicMediaStudioSelectedType: string;
  republicMediaStudioPrompt: string;
  republicMediaStudioError: string | null;
}

// ─── Defaults ───────────────────────────────────────────────────

export const REPUBLIC_STATE_DEFAULTS: RepublicState = {
  client: null,
  connected: false,
  lastError: null,

  republicPopulationLoading: false,
  republicPopulationStats: null,
  republicCitizens: [],
  republicCitizenSearch: "",
  republicCitizenFilter: null,
  republicCitizenPage: 0,
  republicSelectedCitizen: null,

  republicGovernmentLoading: false,
  republicGovernmentStatus: null,
  republicGovernmentSection: "executive",

  republicEconomyLoading: false,
  republicTreasury: null,

  republicSimulationLoading: false,
  republicSimulationStatus: null,
  republicEventQueue: [],
  republicMode: "simulated",

  republicTechLoading: false,
  republicAtlantis: null,
  republicML: null,
  republicQuantum: null,
  republicTechSection: "atlantis",

  republicGridLoading: false,
  republicGrid: null,

  republicEducationLoading: false,
  republicEducation: null,

  republicMemoryLoading: false,
  republicMemory: null,
  republicMemoryCitizenId: null,
  republicCollective: [],

  republicDevLoading: false,
  republicDevProjects: null,
  republicDevProjectDetail: null,
  republicDevProjectDetailLoading: false,
  republicDevFileContent: null,
  republicDevFileLoading: false,

  // Dev Studio UI defaults
  studioOpenFiles: [],
  studioActiveFile: null,
  studioPreviewMode: "none",
  studioPreviewUrl: null,
  studioPreviewRoutes: [{ path: "/", label: "Home", filePath: "index.html" }],
  studioPreviewActiveRoute: "/",
  studioPreviewDevice: "desktop",
  studioPreviewInteractive: false,
  studioBottomPanel: "ai",
  studioTerminalOutput: [],
  studioAiPrompt: "",
  studioAiSending: false,
  studioGsdTimeline: [],
  studioGsdTeam: [],
  studioGsdQualityScore: 0,
  studioSidebarCollapsed: false,
  studioPreviewCollapsed: true,
  studioBottomCollapsed: false,

  previewEngineLoading: false,
  previewEngineSelectedProjectId: null,
  previewEngineSession: null,
  previewEngineDevice: "desktop",
  previewEngineConsoleOpen: false,
  previewEngineBlobUrl: null,
  previewEngineWebcontainerAvailable: false,

  republicExecutionLoading: false,
  republicExecutionHistory: [],
  republicExecutionDiagnostics: null,

  republicGenomeLoading: false,
  republicGenomePool: [],
  republicGenomeNetwork: null,
  republicGenomeDna: null,
  republicGenomeLineage: null,
  republicGenomeLandscape: null,
  republicSelectedGenomeId: null,

  republicLocalComputeLoading: false,
  republicLocalInstances: [],
  republicDownloadedBitnetModels: [],

  republicDockerLoading: false,
  republicDockerDiagnostics: null,
  republicDockerContainers: [],

  republicAIStoreLoading: false,
  republicAIStoreListings: [],
  republicAIStoreProductions: [],
  republicAIStoreDiagnostics: null,
  republicAIStoreTab: "listings",
  republicAIStoreCategory: null,

  republicProductionLoading: false,
  republicProductionItems: [],
  republicProductionStats: null,
  republicProductionFiles: [],
  republicProductionCategory: null,

  republicMetacognitionDiagnostics: null,
  republicNarrativeDiagnostics: null,
  republicDreamDiagnostics: null,
  republicReasoningDiagnostics: null,
  republicDiplomacyDiagnostics: null,
  republicResilienceDiagnostics: null,

  // Cognitive frontier sub-collections
  republicMetacognitionJournals: [],
  republicMetacognitionCitizenId: null,
  republicMetacognitionCitizenDetail: null,
  republicNarrativeThreads: [],
  republicNarrativeArcs: [],
  republicSharedDreams: [],
  republicReasoningChains: [],
  republicDiplomacyContracts: [],
  republicDiplomacyNorms: [],
  republicDiplomacyTreaties: [],
  republicDiplomacyBreaches: [],
  republicResilienceCrises: [],
  republicResilienceResponses: [],
  republicResiliencePlans: [],

  // Plugins
  republicPluginsLoading: false,
  republicPlugins: [],
  republicPluginsDiagnostics: null,
  republicPluginsDir: null,
  republicPluginsExpandedId: null,
  republicPluginsFilterCategory: null,
  republicPluginsSearchQuery: "",
  republicPluginsActivatingId: null,

  // Manus
  republicManusLoading: false,
  republicManusTrainingJobs: [],
  republicManusEvalJobs: [],
  republicManusQueueStatus: null,

  // Lovable
  republicLovableLoading: false,
  republicLovableJobs: [],
  republicLovableQueueStatus: null,

  // World Intelligence v1
  republicWorldIntelLoading: false,
  republicWorldIntelDashboard: null,
  republicWorldIntelSeverityFilter: null,
  republicWorldIntelCountryFilter: null,
  republicWorldIntelNewsExpanded: false,
  republicWorldIntelSignals: [],
  republicWorldIntelSelectedCountry: null,
  // World Intelligence v2
  republicWarRisks: [],
  republicArsenal: [],
  republicWarSignals: [],
  republicEscalationVelocities: [],
  republicAlertConfig: null,
  republicAlertHistory: [],
  republicIntelReports: [],
  republicWorldIntelTabView: "overview" as const,

  // Media Studio
  republicMediaStudioLoading: false,
  republicMediaStudioCapabilities: null,
  republicMediaStudioHistory: [],
  republicMediaStudioGenerating: false,
  republicMediaStudioSelectedType: "",
  republicMediaStudioPrompt: "",
  republicMediaStudioError: null,
};

// ─── Helpers ────────────────────────────────────────────────────

async function rpc<T>(
  state: RepublicState,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  try {
    return await state.client.request<T>(method, params);
  } catch (err) {
    state.lastError = String(err);
    return null;
  }
}

/** Shallow JSON equality — avoids Lit re-renders when polled data hasn't changed. */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// ─── Population ─────────────────────────────────────────────────

const PAGE_SIZE = 25;

export async function loadPopulation(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicPopulationLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicPopulationLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<{ stats: PopulationStats; citizens: CitizenSummary[] }>(
      "republic.population.list",
      {
        search: state.republicCitizenSearch || undefined,
        specialization: state.republicCitizenFilter || undefined,
        limit: PAGE_SIZE,
        offset: state.republicCitizenPage * PAGE_SIZE,
      },
    );
    const nextStats = res.stats ?? null;
    const nextCitizens = Array.isArray(res.citizens) ? res.citizens : [];
    if (!jsonEqual(state.republicPopulationStats, nextStats)) {
      state.republicPopulationStats = nextStats;
    }
    if (!jsonEqual(state.republicCitizens, nextCitizens)) {
      state.republicCitizens = nextCitizens;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicPopulationLoading = false;
    }
  }
}

// ─── Government ─────────────────────────────────────────────────

export async function loadGovernment(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicGovernmentLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicGovernmentLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<{ status: GovernmentStatus }>(
      "republic.government.status",
      {},
    );
    const next = res.status ?? null;
    if (!jsonEqual(state.republicGovernmentStatus, next)) {
      state.republicGovernmentStatus = next;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicGovernmentLoading = false;
    }
  }
}

export async function holdElection(state: RepublicState, position: string): Promise<void> {
  await rpc(state, "republic.government.election.hold", { position });
  await loadGovernment(state);
}

export async function proposeBill(
  state: RepublicState,
  title: string,
  summary: string,
): Promise<void> {
  await rpc(state, "republic.government.bill.propose", { title, summary });
  await loadGovernment(state);
}

export async function voteBill(
  state: RepublicState,
  billId: string,
  approve: boolean,
): Promise<void> {
  await rpc(state, "republic.government.bill.vote", { billId, approve });
  await loadGovernment(state);
}

// ─── Economy ────────────────────────────────────────────────────

export async function loadEconomy(state: RepublicState, opts?: { quiet?: boolean }): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicEconomyLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicEconomyLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<{ treasury: TreasuryReport }>(
      "republic.economy.treasury",
      {},
    );
    const next = res.treasury ?? null;
    if (!jsonEqual(state.republicTreasury, next)) {
      state.republicTreasury = next;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicEconomyLoading = false;
    }
  }
}

export async function toggleHarvester(
  state: RepublicState,
  harvesterId: string,
  enabled: boolean,
): Promise<void> {
  await rpc(state, "republic.economy.harvester.toggle", { harvesterId, enabled });
  await loadEconomy(state);
}

export async function adjustTaxRate(state: RepublicState, rate: number): Promise<void> {
  await rpc(state, "republic.economy.tax.adjust", { rate });
  await loadEconomy(state);
}

export async function purchaseResource(
  state: RepublicState,
  resourceType: string,
  quantity: number,
): Promise<void> {
  await rpc(state, "republic.economy.resource.purchase", { resourceType, quantity });
  await loadEconomy(state);
}

// ─── Simulation ─────────────────────────────────────────────────

export async function loadSimulation(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicSimulationLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicSimulationLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<{ status: SimulationStatus; events: ScheduledEvent[] }>(
      "republic.simulation.status",
      {},
    );
    const nextStatus = res.status ?? null;
    const nextEvents = Array.isArray(res.events) ? res.events : [];
    if (!jsonEqual(state.republicSimulationStatus, nextStatus)) {
      state.republicSimulationStatus = nextStatus;
    }
    if (!jsonEqual(state.republicEventQueue, nextEvents)) {
      state.republicEventQueue = nextEvents;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicSimulationLoading = false;
    }
  }
}

export async function startSimulation(state: RepublicState): Promise<void> {
  await rpc(state, "republic.simulation.start", {});
  await loadSimulation(state);
}

export async function stopSimulation(state: RepublicState): Promise<void> {
  await rpc(state, "republic.simulation.stop", {});
  await loadSimulation(state);
}

export async function pauseSimulation(state: RepublicState): Promise<void> {
  await rpc(state, "republic.simulation.pause", {});
  await loadSimulation(state);
}

export async function setTickRate(state: RepublicState, tickRate: number): Promise<void> {
  await rpc(state, "republic.simulation.tickrate", { tickRate });
  await loadSimulation(state);
}

export async function createAgent(state: RepublicState, specialization: string): Promise<void> {
  await rpc(state, "republic.simulation.agent.create", { specialization });
  await loadSimulation(state);
}

// ─── Mode ───────────────────────────────────────────────────────

export async function loadMode(state: RepublicState): Promise<void> {
  const res = await rpc<{ mode: string }>(state, "republic.mode.get", {});
  if (res?.mode === "simulated" || res?.mode === "real") {
    state.republicMode = res.mode;
  }
}

export async function setMode(state: RepublicState, mode: "simulated" | "real"): Promise<void> {
  await rpc(state, "republic.mode.set", { mode });
  state.republicMode = mode;
}

// ─── Technology ─────────────────────────────────────────────────

export async function loadTechnology(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicTechLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicTechLoading = true;
    state.lastError = null;
  }

  try {
    const [atlantisRes, mlRes, quantumRes] = await Promise.all([
      state.client.request<{ atlantis: AtlantisStatus }>("republic.tech.atlantis.status", {}),
      state.client.request<{ ml: MLStatus }>("republic.tech.ml.status", {}),
      state.client.request<{ quantum: QuantumStatus }>("republic.tech.quantum.status", {}),
    ]);
    const nextAtlantis = atlantisRes.atlantis ?? null;
    const nextML = mlRes.ml ?? null;
    const nextQuantum = quantumRes.quantum ?? null;
    if (!jsonEqual(state.republicAtlantis, nextAtlantis)) {
      state.republicAtlantis = nextAtlantis;
    }
    if (!jsonEqual(state.republicML, nextML)) {
      state.republicML = nextML;
    }
    if (!jsonEqual(state.republicQuantum, nextQuantum)) {
      state.republicQuantum = nextQuantum;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicTechLoading = false;
    }
  }
}

// R3: ML.NET model training
export async function trainModel(state: RepublicState, modelName: MLModelName): Promise<void> {
  await rpc(state, "republic.tech.ml.train", { modelName });
  await loadTechnology(state);
}

export async function retrainAllModels(state: RepublicState): Promise<void> {
  await rpc(state, "republic.tech.ml.retrain-all", {});
  await loadTechnology(state);
}

// R3: Quantum multiverse controls
export async function createUniverse(state: RepublicState, name: string): Promise<void> {
  await rpc(state, "republic.tech.quantum.universe.create", { name });
  await loadTechnology(state);
}

export async function branchUniverse(state: RepublicState, universeId: string): Promise<void> {
  await rpc(state, "republic.tech.quantum.universe.branch", { universeId });
  await loadTechnology(state);
}

export async function collapseUniverse(state: RepublicState, universeId: string): Promise<void> {
  await rpc(state, "republic.tech.quantum.universe.collapse", { universeId });
  await loadTechnology(state);
}

export async function entangleUniverses(
  state: RepublicState,
  universeA: string,
  universeB: string,
): Promise<void> {
  await rpc(state, "republic.tech.quantum.entangle", { universeA, universeB });
  await loadTechnology(state);
}

// Atlantis crystal management
export async function storeCrystalKnowledge(
  state: RepublicState,
  crystalId: string,
  key: string,
  value: string,
): Promise<void> {
  await rpc(state, "republic.tech.atlantis.crystal.store", { crystalId, key, value });
  await loadTechnology(state);
}

export async function upgradeCrystal(state: RepublicState, crystalId: string): Promise<void> {
  await rpc(state, "republic.tech.atlantis.crystal.upgrade", { crystalId });
  await loadTechnology(state);
}

// ─── Grid ───────────────────────────────────────────────────────

export async function loadGrid(state: RepublicState, opts?: { quiet?: boolean }): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicGridLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicGridLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<{ grid: GridStatus }>("republic.grid.status", {});
    const next = res.grid ?? null;
    if (!jsonEqual(state.republicGrid, next)) {
      state.republicGrid = next;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicGridLoading = false;
    }
  }
}

// R3: Grid node orchestration & swarm management
export async function addSwarmObjective(
  state: RepublicState,
  type: string,
  description: string,
): Promise<void> {
  await rpc(state, "republic.grid.swarm.objective.add", { type, description });
  await loadGrid(state);
}

export async function removeSwarmObjective(
  state: RepublicState,
  objectiveId: string,
): Promise<void> {
  await rpc(state, "republic.grid.swarm.objective.remove", { objectiveId });
  await loadGrid(state);
}

export async function electLeader(state: RepublicState): Promise<void> {
  await rpc(state, "republic.grid.leader.elect", {});
  await loadGrid(state);
}

export async function syncGridState(state: RepublicState): Promise<void> {
  await rpc(state, "republic.grid.sync", {});
  await loadGrid(state);
}

// ─── Overview ───────────────────────────────────────────────────

export async function loadRepublicOverview(state: RepublicState): Promise<RepublicOverview | null> {
  return rpc<RepublicOverview>(state, "republic.overview", {});
}

// ─── Education ──────────────────────────────────────────────────

export async function loadEducation(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicEducationLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicEducationLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<{
      courses: unknown[];
      totalGraduations: number;
      curriculum?: unknown[];
    }>("republic.education.courses", {});
    const next: EducationStatus = {
      courses: Array.isArray(res.courses) ? (res.courses as EducationStatus["courses"]) : [],
      totalGraduations: res.totalGraduations ?? 0,
      curriculum: Array.isArray(res.curriculum)
        ? (res.curriculum as EducationStatus["curriculum"])
        : undefined,
    };
    if (!jsonEqual(state.republicEducation, next)) {
      state.republicEducation = next;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicEducationLoading = false;
    }
  }
}

// ─── Memory ─────────────────────────────────────────────────────

export async function loadMemory(
  state: RepublicState,
  citizenId: string,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicMemoryLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicMemoryLoading = true;
    state.lastError = null;
  }
  state.republicMemoryCitizenId = citizenId;

  try {
    const [episodicRes, semanticRes, relRes, collectiveRes] = await Promise.all([
      state.client.request<{ episodic: unknown[] }>("republic.memory.citizen.episodic", {
        citizenId,
        limit: 50,
      }),
      state.client.request<{ semantic: unknown[] }>("republic.memory.citizen.semantic", {
        citizenId,
      }),
      state.client.request<{ relationships: unknown[] }>("republic.memory.citizen.relationships", {
        citizenId,
      }),
      state.client.request<{ collective: unknown[] }>("republic.memory.collective", { limit: 50 }),
    ]);
    const nextMemory: CitizenMemoryView = {
      episodic: Array.isArray(episodicRes.episodic)
        ? (episodicRes.episodic as CitizenMemoryView["episodic"])
        : [],
      semantic: Array.isArray(semanticRes.semantic)
        ? (semanticRes.semantic as CitizenMemoryView["semantic"])
        : [],
      relationships: Array.isArray(relRes.relationships)
        ? (relRes.relationships as CitizenMemoryView["relationships"])
        : [],
    };
    const nextCollective = Array.isArray(collectiveRes.collective)
      ? (collectiveRes.collective as CollectiveEntry[])
      : [];
    if (!jsonEqual(state.republicMemory, nextMemory)) {
      state.republicMemory = nextMemory;
    }
    if (!jsonEqual(state.republicCollective, nextCollective)) {
      state.republicCollective = nextCollective;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicMemoryLoading = false;
    }
  }
}

// ─── Dev Projects ───────────────────────────────────────────────

export async function loadDevProjects(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicDevLoading && !opts?.quiet) {
    return;
  }
  // Only show the loading spinner on explicit (non-quiet) refreshes.
  // Quiet polls must NOT set loading=true — that would destroy open dialogs
  // and cause the hectic flicker the user sees.
  if (!opts?.quiet) {
    state.republicDevLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<DevProjectsStatus>("republic.dev.projects", {});
    const next: DevProjectsStatus = {
      projects: Array.isArray(res.projects) ? res.projects : [],
      innovations: Array.isArray(res.innovations) ? res.innovations : [],
      totalProjects: res.totalProjects ?? 0,
      totalInnovations: res.totalInnovations ?? 0,
    };
    if (!jsonEqual(state.republicDevProjects, next)) {
      state.republicDevProjects = next;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicDevLoading = false;
    }
  }
}

export async function loadDevProjectDetail(state: RepublicState, projectId: string): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.republicDevProjectDetailLoading = true;

  try {
    const res = await state.client.request<{ project: DevProjectDetail }>(
      "republic.dev.project.status",
      { projectId },
    );
    state.republicDevProjectDetail = res.project ?? null;
  } catch (err) {
    state.lastError = String(err);
    state.republicDevProjectDetail = null;
  } finally {
    state.republicDevProjectDetailLoading = false;
  }
}

/** Download all project files as a multi-file JSON bundle */
export async function downloadDevProject(state: RepublicState, projectId: string): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    const res = await state.client.request<{
      projectName: string;
      files: { path: string; language: string; content: string }[];
    }>("republic.dev.project.download", { projectId });

    if (!res.files?.length) {
      return;
    }

    // Export as a native ZIP archive
    const zipData: Record<string, Uint8Array> = {};
    for (const f of res.files) {
      if (f.path) {
        // Strip leading slash if present
        const cleanPath = f.path.startsWith("/") ? f.path.slice(1) : f.path;
        zipData[cleanPath] = strToU8(f.content || "");
      }
    }

    const zipped = zipSync(zipData);
    const safeName = (res.projectName || "project").replace(/[^a-zA-Z0-9-_]/g, "-");
    const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    state.lastError = String(err);
  }
}

/** Load a single file's content from a project */
export async function loadDevProjectFile(
  state: RepublicState,
  projectId: string,
  filePath: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.republicDevFileLoading = true;
  state.republicDevFileContent = null;

  try {
    const res = await state.client.request<DevFileContent>("republic.dev.project.file", {
      projectId,
      filePath,
    });
    state.republicDevFileContent = res;
  } catch (err) {
    state.lastError = String(err);
    state.republicDevFileContent = null;
  } finally {
    state.republicDevFileLoading = false;
  }
}

/** Download a single file as a text file */
export function downloadSingleFile(file: DevFileContent): void {
  const basename = file.path.split("/").pop() ?? file.path;
  const blob = new Blob([file.content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = basename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Clear all dev projects from state */
export async function clearDevProjects(state: RepublicState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    await state.client.request("republic.dev.project.clear", {});
    state.republicDevProjects = null;
    state.republicDevProjectDetail = null;
    await loadDevProjects(state);
  } catch (err) {
    state.lastError = String(err);
  }
}

// ─── Execution ──────────────────────────────────────────────────

export async function loadExecution(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicExecutionLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicExecutionLoading = true;
    state.lastError = null;
  }

  try {
    const [histRes, statusRes] = await Promise.all([
      state.client.request<{ history: unknown[] }>("republic.execution.history", { limit: 50 }),
      state.client.request<{ mode: string; diagnostics: ExecutionDiagnostics }>(
        "republic.execution.status",
        {},
      ),
    ]);
    const nextHistory = Array.isArray(histRes.history)
      ? (histRes.history as ExecutionHistoryEntry[])
      : [];
    const nextDiag = statusRes.diagnostics ?? null;
    if (!jsonEqual(state.republicExecutionHistory, nextHistory)) {
      state.republicExecutionHistory = nextHistory;
    }
    if (!jsonEqual(state.republicExecutionDiagnostics, nextDiag)) {
      state.republicExecutionDiagnostics = nextDiag;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicExecutionLoading = false;
    }
  }
}

// ─── Genome & Neural Network ────────────────────────────────────

export async function loadGenomePool(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicGenomeLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicGenomeLoading = true;
    state.lastError = null;
  }

  try {
    const [poolRes, lineageRes, landscapeRes] = await Promise.all([
      state.client.request<{ genomes: GenomePoolEntry[]; totalGenomes: number }>(
        "republic.genome.pool",
        {},
      ),
      state.client.request<LineageTree>("republic.genome.lineage", {}),
      state.client.request<FitnessLandscape>("republic.genome.landscape", {}),
    ]);
    const nextPool = Array.isArray(poolRes.genomes) ? poolRes.genomes : [];
    if (!jsonEqual(state.republicGenomePool, nextPool)) {
      state.republicGenomePool = nextPool;
    }
    if (!jsonEqual(state.republicGenomeLineage, lineageRes)) {
      state.republicGenomeLineage = lineageRes;
    }
    if (!jsonEqual(state.republicGenomeLandscape, landscapeRes)) {
      state.republicGenomeLandscape = landscapeRes;
    }

    // Verify selected genome still exists
    if (
      state.republicSelectedGenomeId &&
      !nextPool.some((g) => g.id === state.republicSelectedGenomeId)
    ) {
      state.republicSelectedGenomeId = null;
    }

    // Auto-select first genome if none selected
    if (!state.republicSelectedGenomeId && nextPool.length > 0) {
      state.republicSelectedGenomeId = nextPool[0].id;
    }

    // If a genome is selected, load its network + DNA
    if (state.republicSelectedGenomeId) {
      await loadGenomeDetail(state, state.republicSelectedGenomeId);
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicGenomeLoading = false;
    }
  }
}

export async function loadGenomeDetail(state: RepublicState, genomeId: string): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.republicSelectedGenomeId = genomeId;
  try {
    const [networkRes, dnaRes] = await Promise.all([
      state.client.request<NetworkGraph>("republic.genome.network", { genomeId }),
      state.client.request<DnaStrand>("republic.genome.dna", { genomeId }),
    ]);
    if (!jsonEqual(state.republicGenomeNetwork, networkRes)) {
      state.republicGenomeNetwork = networkRes;
    }
    if (!jsonEqual(state.republicGenomeDna, dnaRes)) {
      state.republicGenomeDna = dnaRes;
    }
  } catch (err) {
    state.lastError = String(err);
    // Unset the invalid selection so we don't spam requests continuously
    state.republicSelectedGenomeId = null;
  }
}

// ─── Local Compute & Docker ─────────────────────────────────────

export async function loadLocalCompute(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicLocalComputeLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicLocalComputeLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<{
      instances: LocalInstance[];
      downloadedBitnetModels?: DownloadedBitnetModel[];
    }>("republic.compute.local.status", {});
    const nextInstances = Array.isArray(res.instances) ? res.instances : [];
    if (!jsonEqual(state.republicLocalInstances, nextInstances)) {
      state.republicLocalInstances = nextInstances;
    }
    const nextDownloaded = Array.isArray(res.downloadedBitnetModels)
      ? res.downloadedBitnetModels
      : [];
    if (!jsonEqual(state.republicDownloadedBitnetModels, nextDownloaded)) {
      state.republicDownloadedBitnetModels = nextDownloaded;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicLocalComputeLoading = false;
    }
  }
}

export async function downloadLocalModel(
  state: RepublicState,
  repoOrTag: string,
  computeType: "bitnet" | "ollama",
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!state.client || !state.connected) {
    return { success: false, error: "Not connected" };
  }
  try {
    const res = await state.client.request<{ success?: boolean; path?: string }>(
      "republic.compute.local.download",
      { repoOrTag, type: computeType },
    );
    await loadLocalCompute(state, { quiet: true });
    return { success: true, path: res.path };
  } catch (err) {
    state.lastError = String(err);
    return { success: false, error: String(err) };
  }
}

export async function removeLocalModel(
  state: RepublicState,
  instanceId: string,
  model: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("republic.compute.local.remove", { instanceId, model });
    await loadLocalCompute(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  }
}

export async function startLocalModel(
  state: RepublicState,
  instanceId: string,
  model: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("republic.compute.local.start", { instanceId, model });
    await loadLocalCompute(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  }
}

export async function stopLocalModel(
  state: RepublicState,
  instanceId: string,
  model: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("republic.compute.local.stop", { instanceId, model });
    await loadLocalCompute(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  }
}

export async function startBitnetNode(
  state: RepublicState,
  modelPath: string,
): Promise<{ success: boolean; message?: string }> {
  if (!state.client || !state.connected) {
    return { success: false, message: "Not connected" };
  }
  try {
    const res = await state.client.request<{ success?: boolean; message?: string }>(
      "republic.compute.local.start",
      { modelPath },
    );
    await loadLocalCompute(state, { quiet: true });
    return { success: true, message: res.message };
  } catch (err) {
    state.lastError = String(err);
    return { success: false, message: String(err) };
  }
}

export async function loadDocker(state: RepublicState, opts?: { quiet?: boolean }): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicDockerLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicDockerLoading = true;
    state.lastError = null;
  }

  try {
    const res = await state.client.request<{
      diagnostics: DockerDiagnostics;
      containers: ContainerInfo[];
    }>("republic.docker.status", {});
    if (!jsonEqual(state.republicDockerDiagnostics, res.diagnostics)) {
      state.republicDockerDiagnostics = res.diagnostics;
    }

    const nextContainers = Array.isArray(res.containers) ? res.containers : [];
    if (!jsonEqual(state.republicDockerContainers, nextContainers)) {
      state.republicDockerContainers = nextContainers;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicDockerLoading = false;
    }
  }
}

// ─── Cognitive Frontier Loader ──────────────────────────────────

export async function loadCognitive(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const res = await state.client.request<{
      metacognition: unknown;
      narrative: unknown;
      dreams: unknown;
      reasoning: unknown;
      diplomacy: unknown;
      resilience: unknown;
      // Sub-collections
      recentJournals: unknown[];
      recentChains: unknown[];
      activeThreads: unknown[];
      storyArcs: unknown[];
      treaties: unknown[];
      conflicts: unknown[];
      diplomacyEvents: unknown[];
    }>("republic.cognitive.status", {});

    // Set state properties used by cognitive frontier views
    state.republicMetacognitionDiagnostics = (res.metacognition ??
      null) as MetacognitionDiagnostics | null;
    state.republicNarrativeDiagnostics = (res.narrative ?? null) as NarrativeDiagnostics | null;
    state.republicDreamDiagnostics = (res.dreams ?? null) as DreamDiagnostics | null;
    state.republicReasoningDiagnostics = (res.reasoning ?? null) as ReasoningDiagnostics | null;
    state.republicDiplomacyDiagnostics = (res.diplomacy ?? null) as ProtocolDiagnostics | null;
    state.republicResilienceDiagnostics = (res.resilience ??
      null) as AntifragilityDiagnostics | null;

    // Sub-collections — populate arrays that were previously always empty
    if (Array.isArray(res.recentJournals)) {
      state.republicMetacognitionJournals = res.recentJournals as IntrospectionEntry[];
    }
    if (Array.isArray(res.recentChains)) {
      state.republicReasoningChains = res.recentChains as ReasoningChain[];
    }
    if (Array.isArray(res.activeThreads)) {
      state.republicNarrativeThreads = res.activeThreads as PlotThread[];
    }
    if (Array.isArray(res.storyArcs)) {
      state.republicNarrativeArcs = res.storyArcs as StoryArc[];
    }
    if (Array.isArray(res.treaties)) {
      state.republicDiplomacyTreaties = res.treaties as Treaty[];
    }
    if (Array.isArray(res.conflicts)) {
      state.republicDiplomacyBreaches = res.conflicts as NormBreach[];
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  }
}

/** Load metacognition detail for a specific citizen when one is selected */
export async function loadMetacognitionCitizenDetail(
  state: RepublicState,
  citizenId: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const res = await state.client.request<{ detail?: CitizenMetacognition }>(
      "republic.metacognition.citizen",
      { citizenId },
    );
    if (res?.detail) {
      state.republicMetacognitionCitizenDetail = res.detail;
    }
  } catch {
    /* non-fatal */
  }
}

// ─── Marketplace ────────────────────────────────────────────────

export async function loadAIStore(state: RepublicState, opts?: { quiet?: boolean }): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicAIStoreLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicAIStoreLoading = true;
    state.lastError = null;
  }

  try {
    const [listRes, diagRes, prodRes] = await Promise.all([
      state.client.request<{ listings?: unknown[] }>("republic.marketplace.list", {}),
      state.client.request("republic.marketplace.diagnostics", {}),
      state.client.request<{ items?: unknown[] }>("republic.productions.list", { limit: 200 }),
    ]);
    state.republicAIStoreListings = Array.isArray(listRes.listings)
      ? (listRes.listings as Listing[])
      : [];
    state.republicAIStoreDiagnostics = (diagRes ?? null) as MarketplaceDiagnostics | null;
    state.republicAIStoreProductions = Array.isArray(prodRes.items)
      ? (prodRes.items as Production[])
      : [];
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicAIStoreLoading = false;
    }
  }
}

// ─── Productions ────────────────────────────────────────────────

export async function loadProductions(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicProductionLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicProductionLoading = true;
    state.lastError = null;
  }

  try {
    const [itemsRes, statsRes, filesRes] = await Promise.all([
      state.client.request<{ items?: unknown[] }>("republic.productions.list", { limit: 200 }),
      state.client.request<{ stats?: unknown }>("republic.productions.stats", {}),
      state.client.request<{ files?: unknown[] }>("republic.productions.files", {}),
    ]);
    state.republicProductionItems = Array.isArray(itemsRes.items)
      ? (itemsRes.items as OutputEntry[])
      : [];
    state.republicProductionStats = (statsRes.stats ?? statsRes ?? null) as OutputStats | null;
    state.republicProductionFiles = Array.isArray(filesRes.files)
      ? (filesRes.files as { name: string; category: string; size: number; path: string }[])
      : [];
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicProductionLoading = false;
    }
  }
}

// ─── Production File Operations ─────────────────────────────────

export interface ProductionFileResult {
  ok: boolean;
  isDirectory?: boolean;
  content?: string;
  encoding?: string;
  size?: number;
  files?: { path: string; content: string; size: number }[];
}

export async function readProductionFile(
  state: RepublicState,
  filePath: string,
): Promise<ProductionFileResult | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  try {
    return await rpc<ProductionFileResult>(state, "republic.productions.read-file", { filePath });
  } catch {
    return null;
  }
}

export async function writeProductionFile(
  state: RepublicState,
  filePath: string,
  content: string,
): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  try {
    const res = await rpc<{ ok?: boolean }>(state, "republic.productions.write-file", {
      filePath,
      content,
    });
    return !!res?.ok;
  } catch {
    return false;
  }
}

export async function deleteProduction(state: RepublicState, filePath: string): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  try {
    const res = await rpc<{ ok?: boolean }>(state, "republic.productions.delete", { filePath });
    if (res?.ok) {
      // Refresh file list
      await loadProductions(state, { quiet: true });
    }
    return !!res?.ok;
  } catch {
    return false;
  }
}

// ─── Plugins ────────────────────────────────────────────────────

export async function loadPlugins(
  state: RepublicState,
  opts?: { quiet?: boolean; force?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    // If disconnected, clear any stale loading state so the UI doesn't hang
    state.republicPluginsLoading = false;
    return;
  }
  // Guard against concurrent loads UNLESS force===true (explicit user refresh)
  if (state.republicPluginsLoading && !opts?.quiet && !opts?.force) {
    return;
  }
  if (!opts?.quiet) {
    state.republicPluginsLoading = true;
    state.lastError = null;
  }

  // Safety timeout: if the request hangs, clear loading state after 12s
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  if (!opts?.quiet) {
    safetyTimer = setTimeout(() => {
      state.republicPluginsLoading = false;
    }, 12_000);
  }

  try {
    const [listRes, diagRes] = await Promise.all([
      state.client.request<{ plugins?: unknown[]; pluginsDir?: string }>(
        "republic.plugins.list",
        {},
      ),
      state.client.request("republic.plugins.diagnostics", {}),
    ]);
    state.republicPlugins = Array.isArray(listRes.plugins) ? (listRes.plugins as PluginInfo[]) : [];
    state.republicPluginsDir = listRes.pluginsDir ?? null;
    state.republicPluginsDiagnostics = (diagRes ?? null) as PluginDiagnostics | null;
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
    }
    if (!opts?.quiet) {
      state.republicPluginsLoading = false;
    }
  }
}

/** Activate a single plugin on demand */
export async function activatePluginAction(state: RepublicState, pluginId: string): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.republicPluginsActivatingId = pluginId;
  try {
    await state.client.request("republic.plugins.activate", { id: pluginId });
    await loadPlugins(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.republicPluginsActivatingId = null;
  }
}

/** Deactivate a single plugin */
export async function deactivatePluginAction(
  state: RepublicState,
  pluginId: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("republic.plugins.deactivate", { id: pluginId });
    await loadPlugins(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  }
}

/** Scan for newly added plugins */
export async function scanPluginsAction(state: RepublicState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("republic.plugins.scan", {});
    await loadPlugins(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  }
}

// ─── World Intelligence ─────────────────────────────────────────

// ─── Manus (RL Agent Training) ──────────────────────────────────

export async function loadManus(state: RepublicState, opts?: { quiet?: boolean }): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicManusLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicManusLoading = true;
    state.lastError = null;
  }

  try {
    const queueRes = await rpc<ManusQueueStatus>(state, "openmanus.queue-status");
    state.republicManusQueueStatus = queueRes ?? null;
    // Also fetch job lists so cards render
    const jobsRes = await rpc<{ trainingJobs?: ManusTrainingJob[]; evalJobs?: ManusEvalJob[] }>(
      state,
      "openmanus.list-jobs",
    );
    if (jobsRes?.trainingJobs) {
      state.republicManusTrainingJobs = jobsRes.trainingJobs;
    }
    if (jobsRes?.evalJobs) {
      state.republicManusEvalJobs = jobsRes.evalJobs;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    state.republicManusLoading = false;
  }
}

export async function startManusTraining(
  state: RepublicState,
  config: Record<string, unknown>,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.republicManusLoading = true;
  try {
    const result = await rpc<ManusTrainingJob>(state, "openmanus.train", config);
    if (result) {
      state.republicManusTrainingJobs = [...state.republicManusTrainingJobs, result];
    }
    await loadManus(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.republicManusLoading = false;
  }
}

export async function startManusEval(
  state: RepublicState,
  config: Record<string, unknown>,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.republicManusLoading = true;
  try {
    const result = await rpc<ManusEvalJob>(state, "openmanus.evaluate", config);
    if (result) {
      state.republicManusEvalJobs = [...state.republicManusEvalJobs, result];
    }
    await loadManus(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.republicManusLoading = false;
  }
}

export async function cancelManusJob(state: RepublicState, jobId: string): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await rpc<unknown>(state, "openmanus.cancel", { jobId });
    state.republicManusTrainingJobs = state.republicManusTrainingJobs.map((j) =>
      j.id === jobId ? { ...j, status: "cancelled" as const } : j,
    );
    state.republicManusEvalJobs = state.republicManusEvalJobs.map((j) =>
      j.id === jobId ? { ...j, status: "cancelled" as const } : j,
    );
    await loadManus(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  }
}

// ─── Lovable (Website Cloning) ──────────────────────────────────

export async function loadLovable(state: RepublicState, opts?: { quiet?: boolean }): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicLovableLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicLovableLoading = true;
    state.lastError = null;
  }

  try {
    const queueRes = await rpc<LovableQueueStatus>(state, "lovable.queue-status");
    state.republicLovableQueueStatus = queueRes ?? null;
    // Also fetch job lists so cards render
    const jobsRes = await rpc<{ jobs?: LovableJob[] }>(state, "lovable.list-jobs");
    if (jobsRes?.jobs) {
      state.republicLovableJobs = jobsRes.jobs;
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    state.republicLovableLoading = false;
  }
}

export async function startLovableClone(
  state: RepublicState,
  config: Record<string, unknown>,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.republicLovableLoading = true;
  try {
    const result = await rpc<LovableJob>(state, "lovable.clone", config);
    if (result) {
      state.republicLovableJobs = [...state.republicLovableJobs, result];
    }
    await loadLovable(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.republicLovableLoading = false;
  }
}

export async function cancelLovableJob(state: RepublicState, jobId: string): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await rpc<unknown>(state, "lovable.cancel", { jobId });
    state.republicLovableJobs = state.republicLovableJobs.map((j) =>
      j.id === jobId ? { ...j, status: "cancelled" as const } : j,
    );
    await loadLovable(state, { quiet: true });
  } catch (err) {
    state.lastError = String(err);
  }
}

export async function loadWorldIntel(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicWorldIntelLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicWorldIntelLoading = true;
    state.lastError = null;
  }

  try {
    // Parallel-fetch core dashboard + all v2 intel data
    const [dashRes, sigRes, warRiskRes, arsenalRes, warSigRes, velRes, alertRes] =
      await Promise.allSettled([
        state.client.request<{ dashboard?: unknown }>("republic.worldintel.dashboard", {
          accessLevel: "government",
        }),
        state.client.request<{ signals?: unknown[] }>("republic.worldintel.signals", {}),
        state.client.request<{ risks?: unknown[] }>("republic.worldintel.war-risk", {}),
        state.client.request<{ arsenal?: unknown[] }>("republic.worldintel.arsenal", {}),
        state.client.request<{ signals?: unknown[] }>("republic.worldintel.war-signals", {}),
        state.client.request<{ velocities?: unknown[] }>("republic.worldintel.velocities", {}),
        state.client.request<{ config?: unknown; history?: unknown[] }>(
          "republic.worldintel.alerts",
          {},
        ),
      ]);

    if (dashRes.status === "fulfilled") {
      const r = dashRes.value;
      state.republicWorldIntelDashboard = (r.dashboard ?? r ?? null) as WorldIntelDashboard | null;
    }
    if (sigRes.status === "fulfilled") {
      state.republicWorldIntelSignals = sigRes.value.signals ?? [];
    }
    if (warRiskRes.status === "fulfilled") {
      state.republicWarRisks = warRiskRes.value.risks ?? [];
    }
    if (arsenalRes.status === "fulfilled") {
      state.republicArsenal = arsenalRes.value.arsenal ?? [];
    }
    if (warSigRes.status === "fulfilled") {
      state.republicWarSignals = warSigRes.value.signals ?? [];
    }
    if (velRes.status === "fulfilled") {
      state.republicEscalationVelocities = velRes.value.velocities ?? [];
    }
    if (alertRes.status === "fulfilled") {
      state.republicAlertConfig = alertRes.value.config ?? null;
      state.republicAlertHistory = alertRes.value.history ?? [];
    }
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicWorldIntelLoading = false;
    }
  }
}

export async function worldIntelControl(
  state: RepublicState,
  action: "start" | "stop",
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("republic.worldintel.control", { action });
    // Refresh after control action
    await loadWorldIntel(state);
  } catch (err) {
    state.lastError = String(err);
  }
}

// ─── Media Studio ───────────────────────────────────────────────

export async function loadMediaStudio(
  state: RepublicState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.republicMediaStudioLoading && !opts?.quiet) {
    return;
  }
  if (!opts?.quiet) {
    state.republicMediaStudioLoading = true;
    state.lastError = null;
  }

  try {
    const [capsRes, histRes] = await Promise.all([
      state.client.request<{
        ok?: boolean;
        availableCapabilities?: string[];
        pluginsByCapability?: Record<string, string[]>;
        totalMediaPlugins?: number;
      }>("republic.mediastudio.capabilities", {}),
      state.client.request<{ history?: unknown[] }>("republic.mediastudio.history", { limit: 20 }),
    ]);
    state.republicMediaStudioCapabilities = {
      availableCapabilities: capsRes.availableCapabilities ?? [],
      pluginsByCapability: capsRes.pluginsByCapability ?? {},
      totalMediaPlugins: capsRes.totalMediaPlugins ?? 0,
    };
    state.republicMediaStudioHistory = histRes.history ?? [];
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    if (!opts?.quiet) {
      state.republicMediaStudioLoading = false;
    }
  }
}

export async function generateMedia(
  state: RepublicState,
  type: string,
  prompt: string,
  options?: Record<string, unknown>,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.republicMediaStudioGenerating = true;
  state.republicMediaStudioError = null;
  try {
    const res = await state.client.request<{ ok?: boolean; generation?: unknown }>(
      "republic.mediastudio.generate",
      { type, prompt, options },
    );
    if (res.generation) {
      state.republicMediaStudioHistory = [
        res.generation,
        ...state.republicMediaStudioHistory,
      ].slice(0, 50);
    }
  } catch (err) {
    state.republicMediaStudioError = String(err);
  } finally {
    state.republicMediaStudioGenerating = false;
  }
}

// ─── Auto-refresh (tab-aware polling) ───────────────────────────

let republicPollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Auto-load data for a Republic tab.
 * Called on first navigation to a tab and by the polling system.
 */
export function autoLoadForTab(
  state: RepublicState,
  activeTab: string,
  opts?: { quiet?: boolean },
): void {
  const quiet = opts?.quiet ?? false;
  const loaderForTab: Record<string, () => Promise<void>> = {
    population: () => loadPopulation(state, { quiet }),
    government: () => loadGovernment(state, { quiet }),
    economy: () => loadEconomy(state, { quiet }),
    simulation: () => loadSimulation(state, { quiet }),
    technology: () => loadTechnology(state, { quiet }),
    grid: () => loadGrid(state, { quiet }),
    education: () => loadEducation(state, { quiet }),
    memory: () =>
      state.republicMemoryCitizenId
        ? loadMemory(state, state.republicMemoryCitizenId, { quiet })
        : Promise.resolve(),
    development: () => loadDevProjects(state, { quiet }),
    execution: () => loadExecution(state, { quiet }),
    neural: () => loadGenomePool(state, { quiet }),
    bitnet: () => loadLocalCompute(state, { quiet }),
    ollama: () => loadLocalCompute(state, { quiet }),
    lmstudio: () => loadLocalCompute(state, { quiet }),
    docker: () => loadDocker(state, { quiet }),
    metacognition: () => loadCognitive(state, { quiet }),
    narrative: () => loadCognitive(state, { quiet }),
    dreams: () => loadCognitive(state, { quiet }),
    reasoning: () => loadCognitive(state, { quiet }),
    diplomacy: () => loadCognitive(state, { quiet }),
    resilience: () => loadCognitive(state, { quiet }),
    aistore: () => loadAIStore(state, { quiet }),
    productions: () => loadProductions(state, { quiet }),
    studio: () => loadDevProjects(state, { quiet }),
    curriculum: () => loadEducation(state, { quiet }),
    plugins: () => loadPlugins(state, { quiet }),
    manus: () => loadManus(state, { quiet }),
    lovable: () => loadLovable(state, { quiet }),
    worldintel: () => loadWorldIntel(state, { quiet }),
    tacticalmap: () => loadWorldIntel(state, { quiet }),
    mediastudio: () => loadMediaStudio(state, { quiet }),
  };

  const loader = loaderForTab[activeTab];
  if (loader) {
    void loader();
  }
}

export function startRepublicPolling(
  state: RepublicState,
  activeTab: string,
  intervalMs = 15_000,
): void {
  stopRepublicPolling();

  republicPollInterval = setInterval(() => {
    // Skip polls when browser tab is backgrounded
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    // Preserve scroll position across polled re-renders
    const main = document.querySelector("main");
    const scrollBefore = main?.scrollTop ?? 0;

    autoLoadForTab(state, activeTab, { quiet: true });

    if (main && scrollBefore > 0) {
      requestAnimationFrame(() => {
        main.scrollTop = scrollBefore;
      });
    }
  }, intervalMs);
}

export function stopRepublicPolling(): void {
  if (republicPollInterval !== null) {
    clearInterval(republicPollInterval);
    republicPollInterval = null;
  }
}
