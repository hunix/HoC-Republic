import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { VersionCheck } from "@/components/VersionCheck";
import { ToastProvider } from "@/contexts/ToastContext";

// ─── Lazy page imports ────────────────────────────────────────────────────────
// Core Gateway Pages
const AgentsPage = lazy(() => import("@/pages/Agents").then((m) => ({ default: m.AgentsPage })));
const AIStorePage = lazy(() => import("@/pages/AIStore").then((m) => ({ default: m.AIStorePage })));
const BootTelemetryPage = lazy(() =>
  import("@/pages/BootTelemetry").then((m) => ({ default: m.BootTelemetryPage })),
);
const ChannelsPage = lazy(() =>
  import("@/pages/Channels").then((m) => ({ default: m.ChannelsPage })),
);
const ChatPage = lazy(() => import("@/pages/Chat").then((m) => ({ default: m.ChatPage })));
const ClusterPage = lazy(() => import("@/pages/Cluster").then((m) => ({ default: m.ClusterPage })));
const ConfigPage = lazy(() => import("@/pages/Config").then((m) => ({ default: m.ConfigPage })));
const APIKeysPage = lazy(() => import("@/pages/APIKeys").then((m) => ({ default: m.APIKeysPage })));
const CronPage = lazy(() => import("@/pages/Cron").then((m) => ({ default: m.CronPage })));
const DashboardPage = lazy(() =>
  import("@/pages/Dashboard").then((m) => ({ default: m.DashboardPage })),
);
const DevStudioPage = lazy(() =>
  import("@/pages/DevStudio").then((m) => ({ default: m.DevStudioPage })),
);
const GameStudioPage = lazy(() =>
  import("@/pages/GameStudio").then((m) => ({ default: m.GameStudioPage })),
);
const PoolGamePage = lazy(() =>
  import("@/pages/PoolGame").then((m) => ({ default: m.PoolGamePage })),
);
const WorkforcePage = lazy(() =>
  import("@/pages/Workforce").then((m) => ({ default: m.Workforce })),
);
const HRDepartmentPage = lazy(() =>
  import("@/pages/HRDepartment").then((m) => ({ default: m.HRDepartmentPage })),
);
const MovieStudioPage = lazy(() =>
  import("@/pages/MovieStudio").then((m) => ({ default: m.MovieStudioPage })),
);
const EnvironmentPage = lazy(() =>
  import("@/pages/Environment").then((m) => ({ default: m.EnvironmentPage })),
);
// Infrastructure
const DockerPage = lazy(() =>
  import("@/pages/infra/Docker").then((m) => ({ default: m.DockerPage })),
);
const AgentDesktopPage = lazy(() =>
  import("@/pages/republic/AgentDesktop").then((m) => ({ default: m.AgentDesktopPage })),
);
const N8NPage = lazy(() => import("@/pages/infra/N8N").then((m) => ({ default: m.N8NPage })));
const InfraHubPage = lazy(() =>
  import("@/pages/infra/InfraHub").then((m) => ({ default: m.InfraHubPage })),
);
const ResourceManagerPage = lazy(() =>
  import("@/pages/infra/ResourceManager").then((m) => ({ default: m.ResourceManagerPage })),
);
const SupabasePage = lazy(() =>
  import("@/pages/infra/Supabase").then((m) => ({ default: m.SupabasePage })),
);
const VectorDBPage = lazy(() =>
  import("@/pages/infra/VectorDB").then((m) => ({ default: m.VectorDBPage })),
);
const TracingPage = lazy(() =>
  import("@/pages/infra/Tracing").then((m) => ({ default: m.TracingPage })),
);
const ComfyUIPage = lazy(() =>
  import("@/pages/infra/ComfyUI").then((m) => ({ default: m.ComfyUIPage })),
);
// Intelligence
const GlobePage = lazy(() => import("@/pages/intel/Globe").then((m) => ({ default: m.GlobePage })));
const HPICSPage = lazy(() =>
  import("@/pages/intelligence/HPICSPage").then((m) => ({ default: m.HPICSPage })),
);
const TacticalMapPage = lazy(() =>
  import("@/pages/intel/TacticalMap").then((m) => ({ default: m.TacticalMapPage })),
);
const WorldIntelPage = lazy(() =>
  import("@/pages/intel/WorldIntel").then((m) => ({ default: m.WorldIntelPage })),
);
const WorldMonitorPage = lazy(() =>
  import("@/pages/intel/WorldMonitor").then((m) => ({ default: m.WorldMonitorPage })),
);
const WarTheaterPage = lazy(() =>
  import("@/pages/intel/WarTheater").then((m) => ({ default: m.WarTheaterPage })),
);
const WarTheater3DPage = lazy(() =>
  import("@/pages/intel/WarTheater3D").then((m) => ({ default: m.WarTheater3DPage })),
);
// LLM

const LMStudioPage = lazy(() =>
  import("@/pages/llm/LMStudio").then((m) => ({ default: m.LMStudioPage })),
);
const ModelManagerPage = lazy(() =>
  import("@/pages/llm/ModelManager").then((m) => ({ default: m.ModelManagerPage })),
);
const OllamaDashboardPage = lazy(() =>
  import("@/pages/llm/Ollama").then((m) => ({ default: m.OllamaDashboardPage })),
);
const Gemma4GuidePage = lazy(() =>
  import("@/pages/llm/Gemma4Guide").then((m) => ({ default: m.Gemma4GuidePage })),
);
const LogsPage = lazy(() => import("@/pages/Logs").then((m) => ({ default: m.LogsPage })));
const LovablePage = lazy(() => import("@/pages/Lovable").then((m) => ({ default: m.LovablePage })));
const ManusPage = lazy(() => import("@/pages/Manus").then((m) => ({ default: m.ManusPage })));
const MediaStudioPage = lazy(() =>
  import("@/pages/MediaStudio").then((m) => ({ default: m.MediaStudioPage })),
);
// Node UI
const NodeCitizensPage = lazy(() =>
  import("@/pages/node/NodeCitizens").then((m) => ({ default: m.NodeCitizensPage })),
);
const NodeConfigPage = lazy(() =>
  import("@/pages/node/NodeConfig").then((m) => ({ default: m.NodeConfigPage })),
);
const NodeDashboardPage = lazy(() =>
  import("@/pages/node/NodeDashboard").then((m) => ({ default: m.NodeDashboardPage })),
);
const NodeHardwarePage = lazy(() =>
  import("@/pages/node/NodeHardware").then((m) => ({ default: m.NodeHardwarePage })),
);
const NodeLLMPage = lazy(() =>
  import("@/pages/node/NodeLLM").then((m) => ({ default: m.NodeLLMPage })),
);
const NodeLogsPage = lazy(() =>
  import("@/pages/node/NodeLogs").then((m) => ({ default: m.NodeLogsPage })),
);
const NodePairingPage = lazy(() =>
  import("@/pages/node/NodePairing").then((m) => ({ default: m.NodePairingPage })),
);
const NodePluginsPage = lazy(() =>
  import("@/pages/node/NodePlugins").then((m) => ({ default: m.NodePluginsPage })),
);
const NodeWorkloadsPage = lazy(() =>
  import("@/pages/node/NodeWorkloads").then((m) => ({ default: m.NodeWorkloadsPage })),
);
const NodeDockerPage = lazy(() =>
  import("@/pages/node/NodeDocker").then((m) => ({ default: m.NodeDockerPage })),
);
const NodesPage = lazy(() => import("@/pages/Nodes").then((m) => ({ default: m.NodesPage })));
const PlaceholderPage = lazy(() =>
  import("@/pages/Placeholder").then((m) => ({ default: m.PlaceholderPage })),
);
const PluginsPage = lazy(() => import("@/pages/Plugins").then((m) => ({ default: m.PluginsPage })));
// Plugin Studios
const AgentStudioPage = lazy(() =>
  import("@/pages/plugins/AgentStudio").then((m) => ({ default: m.AgentStudioPage })),
);
const AudioStudioPage = lazy(() =>
  import("@/pages/plugins/AudioStudio").then((m) => ({ default: m.AudioStudioPage })),
);
const AvatarStudioPage = lazy(() =>
  import("@/pages/plugins/AvatarStudio").then((m) => ({ default: m.AvatarStudioPage })),
);
const PluginDevStudioPage = lazy(() =>
  import("@/pages/plugins/DevStudio").then((m) => ({ default: m.DevStudioPage })),
);
const LuxTTSPage = lazy(() =>
  import("@/pages/plugins/LuxTTS").then((m) => ({ default: m.LuxTTSPage })),
);
const ImageStudioPage = lazy(() =>
  import("@/pages/plugins/ImageStudio").then((m) => ({ default: m.ImageStudioPage })),
);
const MusicStudioPage = lazy(() =>
  import("@/pages/plugins/MusicStudio").then((m) => ({ default: m.MusicStudioPage })),
);
const PluginQueuePage = lazy(() =>
  import("@/pages/plugins/PluginQueue").then((m) => ({ default: m.PluginQueuePage })),
);
const VideoStudioPage = lazy(() =>
  import("@/pages/plugins/VideoStudio").then((m) => ({ default: m.VideoStudioPage })),
);
const ProductionsPage = lazy(() =>
  import("@/pages/Productions").then((m) => ({ default: m.ProductionsPage })),
);
const CPEDashboardPage = lazy(() =>
  import("@/pages/CPEDashboard").then((m) => ({ default: m.CPEDashboard })),
);
// Republic Views
const AvatarPage = lazy(() =>
  import("@/pages/republic/Avatar").then((m) => ({ default: m.AvatarPage })),
);

const A2APage = lazy(() => import("@/pages/republic/A2A").then((m) => ({ default: m.A2APage })));
const BackupPage = lazy(() =>
  import("@/pages/republic/Backup").then((m) => ({ default: m.BackupPage })),
);
const CICDPage = lazy(() => import("@/pages/republic/CICD").then((m) => ({ default: m.CICDPage })));
const CitizenDetailPage = lazy(() =>
  import("@/pages/republic/CitizenDetail").then((m) => ({ default: m.CitizenDetailPage })),
);
const CitizensPage = lazy(() =>
  import("@/pages/republic/Citizens").then((m) => ({ default: m.CitizensPage })),
);
const CivilizationLegacyPage = lazy(() =>
  import("@/pages/republic/CivilizationLegacy").then((m) => ({
    default: m.CivilizationLegacyPage,
  })),
);
const CivilizationPage = lazy(() =>
  import("@/pages/republic/Civilization").then((m) => ({
    default: m.CivilizationPage,
  })),
);
const DataVizPage = lazy(() =>
  import("@/pages/republic/DataViz").then((m) => ({ default: m.DataVizPage })),
);
const DiplomacyPage = lazy(() =>
  import("@/pages/republic/Diplomacy").then((m) => ({ default: m.DiplomacyPage })),
);
const DreamsPage = lazy(() =>
  import("@/pages/republic/Dreams").then((m) => ({ default: m.DreamsPage })),
);
const EconomyPage = lazy(() =>
  import("@/pages/republic/Economy").then((m) => ({ default: m.EconomyPage })),
);
const EducationPage = lazy(() =>
  import("@/pages/republic/Education").then((m) => ({ default: m.EducationPage })),
);
const EmotionsPage = lazy(() =>
  import("@/pages/republic/Emotions").then((m) => ({ default: m.EmotionsPage })),
);
const GovernmentPage = lazy(() =>
  import("@/pages/republic/Government").then((m) => ({ default: m.GovernmentPage })),
);
const GridPage = lazy(() => import("@/pages/republic/Grid").then((m) => ({ default: m.GridPage })));
const GSDPage = lazy(() => import("@/pages/republic/GSD").then((m) => ({ default: m.GSDPage })));
const MetacognitionPage = lazy(() =>
  import("@/pages/republic/Metacognition").then((m) => ({ default: m.MetacognitionPage })),
);
const ModelRegistryPage = lazy(() =>
  import("@/pages/republic/ModelRegistry").then((m) => ({ default: m.ModelRegistryPage })),
);
const NarrativePage = lazy(() =>
  import("@/pages/republic/Narrative").then((m) => ({ default: m.NarrativePage })),
);
const NeuralNetworkPage = lazy(() =>
  import("@/pages/republic/NeuralNetwork").then((m) => ({ default: m.NeuralNetworkPage })),
);
const PersistencePage = lazy(() =>
  import("@/pages/republic/Persistence").then((m) => ({ default: m.PersistencePage })),
);
const PersonasPage = lazy(() =>
  import("@/pages/republic/Personas").then((m) => ({ default: m.PersonasPage })),
);
const PopulationPage = lazy(() =>
  import("@/pages/republic/Population").then((m) => ({ default: m.PopulationPage })),
);
const ProcessesPage = lazy(() =>
  import("@/pages/republic/Processes").then((m) => ({ default: m.ProcessesPage })),
);
const PulsePage = lazy(() =>
  import("@/pages/republic/Pulse").then((m) => ({ default: m.PulsePage })),
);
const QuantumSyncPage = lazy(() =>
  import("@/pages/republic/QuantumSync").then((m) => ({ default: m.QuantumSyncPage })),
);
const RAGPage = lazy(() => import("@/pages/republic/RAG").then((m) => ({ default: m.RAGPage })));
const RACPage = lazy(() => import("@/pages/republic/RAC").then((m) => ({ default: m.RACPage })));
const ReasoningPage = lazy(() =>
  import("@/pages/republic/Reasoning").then((m) => ({ default: m.ReasoningPage })),
);
const ResearchPage = lazy(() =>
  import("@/pages/republic/Research").then((m) => ({ default: m.ResearchPage })),
);
const ResiliencePage = lazy(() =>
  import("@/pages/republic/Resilience").then((m) => ({ default: m.ResiliencePage })),
);
const RevenuePage = lazy(() =>
  import("@/pages/republic/Revenue").then((m) => ({ default: m.RevenuePage })),
);
const SimulationPage = lazy(() =>
  import("@/pages/republic/Simulation").then((m) => ({ default: m.SimulationPage })),
);
const SkillsPage = lazy(() =>
  import("@/pages/republic/Skills").then((m) => ({ default: m.SkillsPage })),
);
const RolesPage = lazy(() =>
  import("@/pages/republic/Roles").then((m) => ({ default: m.RolesPage })),
);
const ClawHubRegistryPage = lazy(() =>
  import("@/pages/republic/ClawHubRegistry").then((m) => ({ default: m.ClawHubRegistryPage })),
);
const SocialFabricPage = lazy(() =>
  import("@/pages/republic/SocialFabric").then((m) => ({ default: m.SocialFabricPage })),
);
const SocialGraphPage = lazy(() =>
  import("@/pages/republic/SocialGraph").then((m) => ({ default: m.SocialGraphPage })),
);
const QuranConstitutionPage = lazy(() =>
  import("@/pages/republic/QuranConstitution").then((m) => ({ default: m.QuranConstitutionPage })),
);
const TechnologyPage = lazy(() =>
  import("@/pages/republic/Technology").then((m) => ({ default: m.TechnologyPage })),
);
const TemporalPage = lazy(() =>
  import("@/pages/republic/Temporal").then((m) => ({ default: m.TemporalPage })),
);
const ToolForgePage = lazy(() =>
  import("@/pages/republic/ToolForge").then((m) => ({ default: m.ToolForgePage })),
);
const RegistryExplorerPage = lazy(() =>
  import("@/pages/republic/RegistryExplorer").then((m) => ({ default: m.RegistryExplorerPage })),
);
const AsyncTasksPage = lazy(() =>
  import("@/pages/republic/AsyncTasks").then((m) => ({ default: m.AsyncTasksPage })),
);
const FoundryPage = lazy(() => import("@/pages/Foundry").then((m) => ({ default: m.FoundryPage })));
const MemoryDashboardPage = lazy(() =>
  import("@/pages/MemoryDashboard").then((m) => ({ default: m.MemoryDashboard })),
);
const ComposioPage = lazy(() =>
  import("@/pages/Composio").then((m) => ({ default: m.ComposioPage })),
);
const SelfHealingPage = lazy(() =>
  import("@/pages/SelfHealing").then((m) => ({ default: m.SelfHealingPage })),
);
const TrustPage = lazy(() =>
  import("@/pages/republic/Trust").then((m) => ({ default: m.TrustPage })),
);
const VisionPage = lazy(() =>
  import("@/pages/republic/Vision").then((m) => ({ default: m.VisionPage })),
);
const MedVisionPage = lazy(() =>
  import("@/pages/republic/MedVision").then((m) => ({ default: m.MedVisionPage })),
);
const ScienceLabPage = lazy(() =>
  import("@/pages/republic/ScienceLab").then((m) => ({ default: m.ScienceLabPage })),
);
const CyberCommandPage = lazy(() =>
  import("@/pages/republic/CyberCommand").then((m) => ({ default: m.CyberCommandPage })),
);
const KaliLinuxPage = lazy(() =>
  import("@/pages/republic/KaliLinux").then((m) => ({ default: m.KaliLinuxPage })),
);
const NetworkInfrastructurePage = lazy(() =>
  import("@/pages/republic/NetworkInfrastructure").then((m) => ({
    default: m.NetworkInfrastructurePage,
  })),
);
const CompanyOSPage = lazy(() =>
  import("@/pages/republic/CompanyOS").then((m) => ({ default: m.CompanyOS })),
);
const AgentHubPage = lazy(() =>
  import("@/pages/republic/AgentHub").then((m) => ({ default: m.AgentHubPage })),
);
const VoicePage = lazy(() =>
  import("@/pages/republic/Voice").then((m) => ({ default: m.VoicePage })),
);
const WarAgentPage = lazy(() =>
  import("@/pages/republic/WarAgent").then((m) => ({ default: m.WarAgentPage })),
);
const WorkflowsPage = lazy(() =>
  import("@/pages/republic/Workflows").then((m) => ({ default: m.WorkflowsPage })),
);
const WorkspacePage = lazy(() =>
  import("@/pages/republic/Workspace").then((m) => ({ default: m.WorkspacePage })),
);
const ResearchStudio = lazy(() =>
  import("@/pages/ResearchStudio").then((m) => ({ default: m.ResearchStudio })),
);
const SessionsPage = lazy(() =>
  import("@/pages/Sessions").then((m) => ({ default: m.SessionsPage })),
);
const WorldsPage = lazy(() => import("@/pages/Worlds").then((m) => ({ default: m.WorldsPage })));
const ContactIntelligencePage = lazy(() =>
  import("@/pages/intelligence/ContactIntelligencePage").then((m) => ({
    default: m.ContactIntelligencePage,
  })),
);
const AdvancedIntelligencePage = lazy(() =>
  import("@/pages/intelligence/AdvancedIntelligencePage").then((m) => ({
    default: m.AdvancedIntelligencePage,
  })),
);
const SecurityOpsPage = lazy(() =>
  import("@/pages/SecurityOps").then((m) => ({ default: m.SecurityOps })),
);
const ProcessFlowPage = lazy(() =>
  import("@/pages/ProcessFlow").then((m) => ({ default: m.ProcessFlowPage })),
);
const GuardianDashboardPage = lazy(() =>
  import("@/pages/GuardianDashboard").then((m) => ({ default: m.GuardianDashboard })),
);
const DomainsPage = lazy(() =>
  import("@/pages/DomainsPage").then((m) => ({ default: m.DomainsPage })),
);
const SovereignAIPage = lazy(() =>
  import("@/pages/republic/SovereignAI").then((m) => ({ default: m.SovereignAIPage })),
);
const AgentTelemetryPage = lazy(() =>
  import("@/pages/republic/AgentTelemetryPage").then((m) => ({ default: m.AgentTelemetryPage })),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Static style object — hoisted to avoid allocating a new object on every render
const PAGE_LOADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  minHeight: "200px",
  color: "var(--muted-foreground, #888)",
  fontSize: "0.875rem",
};

/** Minimal loading skeleton shown while a route chunk is downloading. */
function PageLoader() {
  return <div style={PAGE_LOADER_STYLE}>Loading…</div>;
}

/** Wrap any page element in a per-page error boundary, inside a Suspense boundary. */
function Safe({ el, label }: { el: React.ReactElement; label: string }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ErrorBoundary label={label}>{el}</ErrorBoundary>
    </Suspense>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <VersionCheck />
        <Routes>
          <Route element={<DashboardLayout />}>
            {/* Core */}
            <Route index element={<Safe el={<DashboardPage />} label="Dashboard" />} />
            <Route path="chat" element={<Safe el={<ChatPage />} label="Chat" />} />
            <Route path="agents" element={<Safe el={<AgentsPage />} label="Agents" />} />
            <Route path="sessions" element={<Safe el={<SessionsPage />} label="Sessions" />} />
            <Route path="nodes" element={<Safe el={<NodesPage />} label="Nodes" />} />
            <Route path="config" element={<Safe el={<ConfigPage />} label="Config" />} />
            <Route path="api-keys" element={<Safe el={<APIKeysPage />} label="API Keys" />} />
            <Route
              path="environment"
              element={<Safe el={<EnvironmentPage />} label="Environment" />}
            />
            <Route path="logs" element={<Safe el={<LogsPage />} label="Logs" />} />
            <Route path="cron" element={<Safe el={<CronPage />} label="Cron" />} />
            <Route path="channels" element={<Safe el={<ChannelsPage />} label="Channels" />} />

            {/* Plugins & Store */}
            <Route path="plugins" element={<Safe el={<PluginsPage />} label="Plugins" />} />
            <Route
              path="plugins/audio"
              element={<Safe el={<AudioStudioPage />} label="Audio Studio" />}
            />
            <Route
              path="plugins/image"
              element={<Safe el={<ImageStudioPage />} label="Image Studio" />}
            />
            <Route
              path="plugins/avatar"
              element={<Safe el={<AvatarStudioPage />} label="Avatar Studio" />}
            />
            <Route
              path="plugins/video"
              element={<Safe el={<VideoStudioPage />} label="Video Studio" />}
            />
            <Route
              path="plugins/music"
              element={<Safe el={<MusicStudioPage />} label="Music Studio" />}
            />
            <Route
              path="plugins/agents"
              element={<Safe el={<AgentStudioPage />} label="Agent Studio" />}
            />
            <Route
              path="plugins/dev"
              element={<Safe el={<PluginDevStudioPage />} label="Dev Studio" />}
            />
            <Route
              path="plugins/luxtts"
              element={<Safe el={<LuxTTSPage />} label="LuxTTS Voice Cloning" />}
            />
            <Route
              path="plugins/queue"
              element={<Safe el={<PluginQueuePage />} label="Plugin Queue" />}
            />
            <Route path="store" element={<Safe el={<AIStorePage />} label="AI Store" />} />
            <Route
              path="productions"
              element={<Safe el={<ProductionsPage />} label="Productions" />}
            />
            <Route
              path="productions/pipeline"
              element={<Safe el={<CPEDashboardPage />} label="Production Pipeline" />}
            />
            <Route
              path="media-studio"
              element={<Safe el={<MediaStudioPage />} label="Media Studio" />}
            />
            <Route path="dev-studio" element={<Safe el={<DevStudioPage />} label="Dev Studio" />} />
            <Route
              path="game-studio"
              element={<Safe el={<GameStudioPage />} label="Game Studio" />}
            />
            <Route path="pool-game" element={<Safe el={<PoolGamePage />} label="3D Pool" />} />
            <Route path="workforce" element={<Safe el={<WorkforcePage />} label="Workforce" />} />
            <Route
              path="movie-studio"
              element={<Safe el={<MovieStudioPage />} label="Movie Studio" />}
            />
            <Route path="lovable" element={<Safe el={<LovablePage />} label="Lovable" />} />
            <Route path="manus" element={<Safe el={<ManusPage />} label="Manus" />} />
            <Route
              path="research-studio"
              element={<Safe el={<ResearchStudio />} label="Research Studio" />}
            />
            <Route path="worlds" element={<Safe el={<WorldsPage />} label="3D Worlds" />} />

            {/* Republic */}
            <Route
              path="republic/population"
              element={<Safe el={<PopulationPage />} label="Population" />}
            />
            <Route path="republic/roles" element={<Safe el={<RolesPage />} label="Roles" />} />
            <Route
              path="republic/citizens"
              element={<Safe el={<CitizensPage />} label="Citizens" />}
            />
            <Route
              path="republic/citizens/:id"
              element={<Safe el={<CitizenDetailPage />} label="Citizen Detail" />}
            />
            <Route
              path="republic/government"
              element={<Safe el={<GovernmentPage />} label="Government" />}
            />
            <Route
              path="republic/economy"
              element={<Safe el={<EconomyPage />} label="Economy" />}
            />
            <Route
              path="republic/education"
              element={<Safe el={<EducationPage />} label="Education" />}
            />
            <Route
              path="republic/technology"
              element={<Safe el={<TechnologyPage />} label="Technology" />}
            />
            <Route path="republic/skills" element={<Safe el={<SkillsPage />} label="Skills" />} />
            <Route
              path="republic/clawhub"
              element={<Safe el={<ClawHubRegistryPage />} label="ClawHub Registry" />}
            />
            <Route path="republic/grid" element={<Safe el={<GridPage />} label="Grid" />} />
            <Route path="republic/dreams" element={<Safe el={<DreamsPage />} label="Dreams" />} />
            <Route
              path="republic/civilization"
              element={<Safe el={<CivilizationPage />} label="Civilization" />}
            />
            <Route path="republic/gsd" element={<Safe el={<GSDPage />} label="GSD Pipeline" />} />
            <Route
              path="republic/resilience"
              element={<Safe el={<ResiliencePage />} label="Resilience" />}
            />
            <Route
              path="republic/narrative"
              element={<Safe el={<NarrativePage />} label="Narrative" />}
            />
            <Route
              path="republic/reasoning"
              element={<Safe el={<ReasoningPage />} label="Reasoning" />}
            />
            <Route
              path="republic/metacognition"
              element={<Safe el={<MetacognitionPage />} label="Metacognition" />}
            />
            <Route
              path="republic/simulation"
              element={<Safe el={<SimulationPage />} label="Simulation" />}
            />
            <Route
              path="republic/neural-network"
              element={<Safe el={<NeuralNetworkPage />} label="Neural Network" />}
            />
            <Route
              path="republic/diplomacy"
              element={<Safe el={<DiplomacyPage />} label="Diplomacy" />}
            />
            {/* New Republic Pages */}
            <Route
              path="republic/personas"
              element={<Safe el={<PersonasPage />} label="Personas" />}
            />
            <Route path="republic/voice" element={<Safe el={<VoicePage />} label="Voice I/O" />} />
            <Route
              path="republic/research"
              element={<Safe el={<ResearchPage />} label="Research" />}
            />
            <Route
              path="republic/revenue"
              element={<Safe el={<RevenuePage />} label="Revenue" />}
            />
            <Route
              path="republic/workflows"
              element={<Safe el={<WorkflowsPage />} label="Workflows" />}
            />
            <Route
              path="republic/workspace"
              element={<Safe el={<WorkspacePage />} label="Workspace" />}
            />
            <Route path="republic/pulse" element={<Safe el={<PulsePage />} label="Pulse" />} />
            <Route path="republic/rag" element={<Safe el={<RAGPage />} label="RAG" />} />
            <Route path="republic/rac" element={<Safe el={<RACPage />} label="RAC" />} />
            <Route
              path="republic/temporal"
              element={<Safe el={<TemporalPage />} label="Temporal" />}
            />
            <Route
              path="republic/processes"
              element={<Safe el={<ProcessesPage />} label="Processes" />}
            />
            <Route path="republic/vision" element={<Safe el={<VisionPage />} label="Vision" />} />
            <Route
              path="republic/medical"
              element={<Safe el={<MedVisionPage />} label="Medical Clinic" />}
            />
            <Route
              path="republic/science"
              element={<Safe el={<ScienceLabPage />} label="Science Lab" />}
            />
            <Route
              path="republic/cyber"
              element={<Safe el={<CyberCommandPage />} label="Cyber Command" />}
            />
            <Route
              path="republic/kali"
              element={<Safe el={<KaliLinuxPage />} label="Kali Linux" />}
            />
            <Route
              path="republic/network"
              element={<Safe el={<NetworkInfrastructurePage />} label="Network Infrastructure" />}
            />
            <Route
              path="republic/company-os"
              element={<Safe el={<CompanyOSPage />} label="Company OS" />}
            />
            <Route
              path="republic/agenthub"
              element={<Safe el={<AgentHubPage />} label="AgentHub" />}
            />
            <Route
              path="republic/meta-learning"
              element={<Safe el={<ScienceLabPage />} label="Meta-Learning" />}
            />
            <Route
              path="republic/trust"
              element={<Safe el={<TrustPage />} label="Trust & Reputation" />}
            />
            <Route
              path="republic/social-fabric"
              element={<Safe el={<SocialFabricPage />} label="Social Fabric" />}
            />
            <Route path="republic/a2a" element={<Safe el={<A2APage />} label="A2A Protocol" />} />
            <Route
              path="republic/social-graph"
              element={<Safe el={<SocialGraphPage />} label="Social Graph & Genealogy" />}
            />
            <Route
              path="republic/quran-constitution"
              element={<Safe el={<QuranConstitutionPage />} label="Constitution of Light" />}
            />
            <Route
              path="republic/backup"
              element={<Safe el={<BackupPage />} label="Backup Manager" />}
            />
            <Route path="republic/cicd" element={<Safe el={<CICDPage />} label="CI/CD" />} />
            <Route
              path="republic/model-registry"
              element={<Safe el={<ModelRegistryPage />} label="Model Registry" />}
            />
            <Route
              path="republic/avatar"
              element={<Safe el={<AvatarPage />} label="Living Avatar" />}
            />

            <Route
              path="republic/emotions"
              element={<Safe el={<EmotionsPage />} label="Emotions" />}
            />
            <Route
              path="republic/quantum-sync"
              element={<Safe el={<QuantumSyncPage />} label="Quantum Sync" />}
            />
            <Route
              path="republic/tool-forge"
              element={<Safe el={<ToolForgePage />} label="Tool Forge" />}
            />
            <Route
              path="republic/registry"
              element={<Safe el={<RegistryExplorerPage />} label="Dynamic Registry" />}
            />
            <Route
              path="republic/tasks"
              element={<Safe el={<AsyncTasksPage />} label="Async Tasks" />}
            />
            <Route
              path="republic/foundry"
              element={<Safe el={<FoundryPage />} label="Foundry" />}
            />
            <Route
              path="republic/memory"
              element={<Safe el={<MemoryDashboardPage />} label="Memory Dashboard" />}
            />
            <Route
              path="republic/composio"
              element={<Safe el={<ComposioPage />} label="Composio" />}
            />
            <Route
              path="republic/healing"
              element={<Safe el={<SelfHealingPage />} label="Self-Healing" />}
            />
            <Route
              path="republic/legacy"
              element={<Safe el={<CivilizationLegacyPage />} label="Civilization Legacy" />}
            />
            <Route
              path="republic/persistence"
              element={<Safe el={<PersistencePage />} label="Persistence Layer" />}
            />
            <Route
              path="republic/dataviz"
              element={<Safe el={<DataVizPage />} label="Webviz Data Visualizer" />}
            />
            <Route
              path="republic/sovereign-ai"
              element={<Safe el={<SovereignAIPage />} label="Sovereign AI" />}
            />
            <Route
              path="republic/agent-telemetry"
              element={<Safe el={<AgentTelemetryPage />} label="Agent Telemetry" />}
            />
            <Route
              path="republic/waragent"
              element={<Safe el={<WarAgentPage />} label="WarAgent" />}
            />
            <Route
              path="republic/hr"
              element={<Safe el={<HRDepartmentPage />} label="HR Department" />}
            />

            {/* Intelligence */}
            <Route
              path="intel/hpics"
              element={<Safe el={<HPICSPage />} label="HPICS Intelligence" />}
            />
            <Route
              path="intel/tactical-map"
              element={<Safe el={<TacticalMapPage />} label="Tactical Map" />}
            />
            <Route
              path="intel/world"
              element={<Safe el={<WorldIntelPage />} label="World Intel" />}
            />
            <Route
              path="intel/world-monitor"
              element={<Safe el={<WorldMonitorPage />} label="World Monitor" />}
            />
            <Route path="intel/globe" element={<Safe el={<GlobePage />} label="Globe" />} />
            <Route
              path="intel/war-theater"
              element={<Safe el={<WarTheaterPage />} label="War Theater" />}
            />
            <Route
              path="intel/war-theater-3d"
              element={<Safe el={<WarTheater3DPage />} label="3D War Theater" />}
            />

            {/* HPICS Personal Intelligence */}
            <Route
              path="intel/contacts"
              element={<Safe el={<ContactIntelligencePage />} label="Contact Intelligence" />}
            />
            <Route
              path="intel/advanced"
              element={<Safe el={<AdvancedIntelligencePage />} label="Advanced Intel Station" />}
            />
            <Route
              path="intel/security-ops"
              element={<Safe el={<SecurityOpsPage />} label="Security Operations" />}
            />
            <Route
              path="intel/guardian"
              element={<Safe el={<GuardianDashboardPage />} label="Zero-Day Guardian" />}
            />

            {/* Infrastructure */}
            <Route path="cluster" element={<Safe el={<ClusterPage />} label="Cluster" />} />
            <Route path="infra/docker" element={<Safe el={<DockerPage />} label="Docker" />} />
            <Route
              path="republic/agent-desktop"
              element={<Safe el={<AgentDesktopPage />} label="Agent Desktop" />}
            />
            <Route
              path="infra/resources"
              element={<Safe el={<ResourceManagerPage />} label="Resource Manager" />}
            />
            <Route
              path="infra/supabase"
              element={<Safe el={<SupabasePage />} label="Supabase" />}
            />
            <Route
              path="infra/vectordb"
              element={<Safe el={<VectorDBPage />} label="Vector DB" />}
            />
            <Route
              path="infra/domains"
              element={<Safe el={<DomainsPage />} label="Domain Management" />}
            />
            <Route path="infra/n8n" element={<Safe el={<N8NPage />} label="N8N Automation" />} />
            <Route
              path="infra/comfyui"
              element={<Safe el={<ComfyUIPage />} label="ComfyUI Studio" />}
            />
            <Route
              path="infra/hub"
              element={<Safe el={<InfraHubPage />} label="Infrastructure Hub" />}
            />
            <Route
              path="infra/tracing"
              element={<Safe el={<TracingPage />} label="Trace Explorer" />}
            />
            <Route
              path="infra/boot"
              element={<Safe el={<BootTelemetryPage />} label="Boot Telemetry" />}
            />
            <Route
              path="process-flow"
              element={<Safe el={<ProcessFlowPage />} label="Process Flow" />}
            />

            {/* LLM */}
            <Route path="llm" element={<Safe el={<OllamaDashboardPage />} label="LLM" />} />
            <Route
              path="llm/ollama"
              element={<Safe el={<OllamaDashboardPage />} label="Ollama" />}
            />
            <Route
              path="llm/lm-studio"
              element={<Safe el={<LMStudioPage />} label="LM Studio" />}
            />

            <Route
              path="llm/models"
              element={<Safe el={<ModelManagerPage />} label="Model Manager" />}
            />
            <Route
              path="llm/gemma4"
              element={<Safe el={<Gemma4GuidePage />} label="Gemma 4 Guide" />}
            />

            {/* Node UI */}
            <Route
              path="node"
              element={<Safe el={<NodeDashboardPage />} label="Node Dashboard" />}
            />
            <Route
              path="node/pairing"
              element={<Safe el={<NodePairingPage />} label="Node Pairing" />}
            />
            <Route
              path="node/hardware"
              element={<Safe el={<NodeHardwarePage />} label="Node Hardware" />}
            />
            <Route
              path="node/workloads"
              element={<Safe el={<NodeWorkloadsPage />} label="Node Workloads" />}
            />
            <Route
              path="node/citizens"
              element={<Safe el={<NodeCitizensPage />} label="Node Citizens" />}
            />
            <Route path="node/llm" element={<Safe el={<NodeLLMPage />} label="Node LLM" />} />
            <Route
              path="node/plugins"
              element={<Safe el={<NodePluginsPage />} label="Node Plugins" />}
            />
            <Route
              path="node/config"
              element={<Safe el={<NodeConfigPage />} label="Node Config" />}
            />
            <Route path="node/logs" element={<Safe el={<NodeLogsPage />} label="Node Logs" />} />
            <Route
              path="node/docker"
              element={<Safe el={<NodeDockerPage />} label="Node Docker" />}
            />

            {/* Catch-all */}
            <Route
              path="*"
              element={
                <Safe el={<PlaceholderPage title="Not Found" icon="🔍" />} label="Not Found" />
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
