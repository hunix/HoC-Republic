/**
 * HoC Navigation Configuration — Mega Nav Edition
 *
 * 5 groups with max 8 primary items each + overflow behind "More…".
 * Each group has a `statsKeys` array for the mega panel live metrics.
 * All items remain searchable via Command Palette (Ctrl+K).
 */

import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  MonitorDot,
  Settings,
  ScrollText,
  Briefcase,
  Clock,
  Puzzle,
  Store,
  Users,
  Landmark,
  Coins,
  GraduationCap,
  Cpu,
  Swords,
  Brain,
  Layers,
  Radio,
  Container,
  Sparkles,
  Film,
  Code,
  Heart,
  Hammer,
  Network,
  Map,
  Eye,
  Shield,
  BookOpen,
  Lightbulb,
  Zap,
  Server,
  Globe,
  Globe2,
  Factory,
  Orbit,
  Workflow,
  Dna,
  Mic,
  Search,
  DollarSign,
  GitBranch,
  FolderOpen,
  Activity,
  UserCircle,
  Database,
  Package,
  Scan,
  HardDrive,
  Key,
  Crosshair,
  Stethoscope,
  FlaskConical,
  type LucideIcon,
  Microscope,
  ShieldAlert,
  Palette,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  /** If true, item is hidden by default behind "More…" expander */
  overflow?: boolean;
}

/** Describes a live stat shown in the mega panel header */
export interface NavGroupStat {
  /** Display label, e.g. "Citizens" */
  label: string;
  /** Zustand store key path, e.g. "gateway.citizenCount" */
  storeKey: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** Stable id used for localStorage collapse state persistence */
  id: string;
  label: string;
  emoji: string;
  /** Short description shown in mega panel header */
  description: string;
  items: NavItem[];
  /** Live stats to display in the mega panel */
  stats: NavGroupStat[];
}

export const navigation: NavGroup[] = [
  // ── 1. Command Center ──────────────────────────────────────────
  {
    id: "core",
    label: "Command Center",
    emoji: "⬡",
    description: "Core gateway operations and chat",
    stats: [
      { label: "Agents", storeKey: "gateway.agentCount", icon: Bot },
      { label: "Sessions", storeKey: "gateway.sessionCount", icon: Layers },
      { label: "Uptime", storeKey: "gateway.uptime", icon: Clock },
    ],
    items: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Chat", path: "/chat", icon: MessageSquare },
      { label: "Agents", path: "/agents", icon: Bot },
      { label: "Sessions", path: "/sessions", icon: Layers },
      { label: "Logs", path: "/logs", icon: ScrollText },
    ],
  },

  // ── 2. Republic ────────────────────────────────────────────────
  {
    id: "republic",
    label: "Republic",
    emoji: "🏛️",
    description: "AI civilization governance and society",
    stats: [
      { label: "Citizens", storeKey: "gateway.citizenCount", icon: Users },
      { label: "Plugins", storeKey: "gateway.pluginCount", icon: Puzzle },
      { label: "Nodes", storeKey: "gateway.nodeCount", icon: Network },
    ],
    items: [
      { label: "Population", path: "/republic/population", icon: Users },
      { label: "Citizens", path: "/republic/citizens", icon: Users },
      { label: "Government", path: "/republic/government", icon: Landmark },
      { label: "Economy", path: "/republic/economy", icon: Coins },
      { label: "Education", path: "/republic/education", icon: GraduationCap },
      { label: "GSD Pipeline", path: "/republic/gsd", icon: Workflow },
      { label: "Workforce", path: "/workforce", icon: Factory },
      { label: "HR Department", path: "/republic/hr", icon: Briefcase },
      // Overflow
      { label: "Roles", path: "/republic/roles", icon: Briefcase, overflow: true },
      { label: "Social Fabric", path: "/republic/social-fabric", icon: Heart, overflow: true },
      { label: "Diplomacy", path: "/republic/diplomacy", icon: Globe, overflow: true },
      { label: "Revenue", path: "/republic/revenue", icon: DollarSign, overflow: true },
      { label: "Trust", path: "/republic/trust", icon: Shield, overflow: true },
      { label: "Social Graph", path: "/republic/social-graph", icon: Network, overflow: true },
      {
        label: "Constitution",
        path: "/republic/quran-constitution",
        icon: BookOpen,
        overflow: true,
      },
      { label: "Backup", path: "/republic/backup", icon: Database, overflow: true },
      { label: "CI/CD", path: "/republic/cicd", icon: GitBranch, overflow: true },
      { label: "Personas", path: "/republic/personas", icon: UserCircle, overflow: true },
      { label: "Processes", path: "/republic/processes", icon: Activity, overflow: true },
      { label: "Workspace", path: "/republic/workspace", icon: FolderOpen, overflow: true },
      { label: "Persistence", path: "/republic/persistence", icon: Database, overflow: true },
      { label: "Resilience", path: "/republic/resilience", icon: Shield, overflow: true },
      { label: "Data Viz", path: "/republic/dataviz", icon: Activity, overflow: true },
      { label: "Company OS", path: "/republic/company-os", icon: Factory, overflow: true },
      { label: "WarAgent", path: "/republic/waragent", icon: Swords, overflow: true },
      { label: "A2A Protocol", path: "/republic/a2a", icon: Network, overflow: true },
      { label: "Workflows", path: "/republic/workflows", icon: Workflow, overflow: true },
    ],
  },

  // ── 3. Intelligence & AI ───────────────────────────────────────
  {
    id: "intelligence",
    label: "Intelligence & AI",
    emoji: "🧠",
    description: "Cognitive systems, research, and intel",
    stats: [
      { label: "Citizens", storeKey: "gateway.citizenCount", icon: Brain },
      { label: "Agents", storeKey: "gateway.agentCount", icon: Bot },
      { label: "Nodes", storeKey: "gateway.nodeCount", icon: Network },
    ],
    items: [
      { label: "Civilization", path: "/republic/civilization", icon: FlaskConical, badge: "40" },
      { label: "Sovereign AI", path: "/republic/sovereign-ai", icon: Brain, badge: "NEW" },
      { label: "Agent Telemetry", path: "/republic/agent-telemetry", icon: Eye, badge: "NEW" },
      { label: "Reasoning", path: "/republic/reasoning", icon: Brain },
      { label: "Vision", path: "/republic/vision", icon: Eye },
      { label: "Voice I/O", path: "/republic/voice", icon: Mic },
      { label: "Neural Network", path: "/republic/neural-network", icon: Dna },
      { label: "RAG / Knowledge", path: "/republic/rag", icon: Database },
      { label: "Simulation", path: "/republic/simulation", icon: Orbit },
      { label: "ClawRouter", path: "/republic/clawrouter", icon: Network },
      // Overflow
      { label: "Metacognition", path: "/republic/metacognition", icon: Lightbulb, overflow: true },
      { label: "Narrative", path: "/republic/narrative", icon: BookOpen, overflow: true },
      { label: "Emotions", path: "/republic/emotions", icon: Heart, overflow: true },
      { label: "Quantum Sync", path: "/republic/quantum-sync", icon: Zap, overflow: true },
      { label: "Research Hub", path: "/republic/research", icon: Search, overflow: true },
      { label: "Medical Clinic", path: "/republic/medical", icon: Stethoscope, overflow: true },
      { label: "Science Lab", path: "/republic/science", icon: FlaskConical, overflow: true },
      { label: "Cyber Command", path: "/republic/cyber", icon: ShieldAlert, overflow: true },
      { label: "Research Studio", path: "/research-studio", icon: Microscope, overflow: true },
      { label: "Meta-Learning", path: "/republic/meta-learning", icon: Brain, overflow: true },
      { label: "Skills", path: "/republic/skills", icon: Swords, overflow: true },
      {
        label: "ClawHub Registry",
        path: "/republic/clawhub",
        icon: Package,
        badge: "24K",
        overflow: true,
      },
      { label: "Tool Forge", path: "/republic/tool-forge", icon: Hammer, overflow: true },
      { label: "Dynamic Registry", path: "/republic/registry", icon: Database, overflow: true },
      { label: "AgentHub", path: "/republic/agenthub", icon: Bot, overflow: true },
      { label: "Model Registry", path: "/republic/model-registry", icon: Package, overflow: true },
      { label: "Living Avatar", path: "/republic/avatar", icon: UserCircle, overflow: true },
      { label: "Dreams", path: "/republic/dreams", icon: Sparkles, overflow: true },
      { label: "Grid", path: "/republic/grid", icon: Network, overflow: true },
      { label: "Pulse", path: "/republic/pulse", icon: Activity, overflow: true },
      { label: "RAC", path: "/republic/rac", icon: Database, overflow: true },
      { label: "Temporal", path: "/republic/temporal", icon: Clock, overflow: true },
      { label: "Legacy", path: "/republic/legacy", icon: BookOpen, overflow: true },
      { label: "Technology", path: "/republic/technology", icon: Cpu, overflow: true },
      { label: "HPICS Intel", path: "/intel/hpics", icon: Scan, overflow: true },
      { label: "Contact Intel", path: "/intel/contacts", icon: Users, overflow: true },
      { label: "Advanced Intel", path: "/intel/advanced", icon: ShieldAlert, overflow: true },
      { label: "Security Ops", path: "/intel/security-ops", icon: Shield, overflow: true },
      {
        label: "Kali Linux",
        path: "/republic/kali",
        icon: ShieldAlert,
        badge: "NEW",
        overflow: true,
      },
      {
        label: "Zero-Day Guardian",
        path: "/intel/guardian",
        icon: Shield,
        badge: "NEW",
        overflow: true,
      },
      {
        label: "Network Infra",
        path: "/republic/network",
        icon: Shield,
        badge: "NEW",
        overflow: true,
      },
    ],
  },

  // ── 3b. World Intel ────────────────────────────────────────────
  {
    id: "world-intel",
    label: "World Intel",
    emoji: "🌍",
    description: "Global intelligence, maps, and 3D war theater",
    stats: [{ label: "Citizens", storeKey: "gateway.citizenCount", icon: Globe }],
    items: [
      { label: "World Intel", path: "/intel/world", icon: Globe },
      { label: "World Monitor", path: "/intel/world-monitor", icon: Eye },
      { label: "3D Globe", path: "/intel/globe", icon: Globe2 },
      { label: "Tactical Map", path: "/intel/tactical-map", icon: Map },
      { label: "War Theater", path: "/intel/war-theater", icon: Crosshair },
      { label: "3D War Theater", path: "/intel/war-theater-3d", icon: Crosshair },
      { label: "3D Worlds", path: "/worlds", icon: Orbit },
      { label: "HPICS Intel", path: "/intel/hpics", icon: Scan },
    ],
  },

  // ── 4. Studios & Plugins ───────────────────────────────────────
  {
    id: "studios",
    label: "Studios & Plugins",
    emoji: "🎨",
    description: "Creative tools and plugin ecosystem",
    stats: [
      { label: "Plugins", storeKey: "gateway.pluginCount", icon: Puzzle },
      { label: "Sessions", storeKey: "gateway.sessionCount", icon: Layers },
    ],
    items: [
      { label: "AI Store", path: "/store", icon: Store },
      { label: "Plugins", path: "/plugins", icon: Puzzle },
      { label: "Media Studio", path: "/media-studio", icon: Sparkles },
      { label: "Dev Studio", path: "/dev-studio", icon: Code },
      { label: "Productions", path: "/productions", icon: Film },
      { label: "Game Studio", path: "/game-studio", icon: Globe2 },
      { label: "Movie Studio", path: "/movie-studio", icon: Film },
      { label: "Plugin Queue", path: "/plugins/queue", icon: Layers },
      { label: "ComfyUI", path: "/infra/comfyui", icon: Palette },
      // Overflow
      { label: "Audio Studio", path: "/plugins/audio", icon: Mic, overflow: true },
      { label: "LuxTTS Voice Cloning", path: "/plugins/luxtts", icon: Mic, overflow: true },
      { label: "Video Studio", path: "/plugins/video", icon: Film, overflow: true },
      { label: "Image Studio", path: "/plugins/image", icon: Sparkles, overflow: true },
      { label: "Avatar Studio", path: "/plugins/avatar", icon: UserCircle, overflow: true },
      { label: "Agent Studio", path: "/plugins/agents", icon: Bot, overflow: true },
      { label: "Music Studio", path: "/plugins/music", icon: Mic, overflow: true },
      { label: "Plugin Dev", path: "/plugins/dev", icon: Code, overflow: true },
      { label: "Lovable", path: "/lovable", icon: Heart, overflow: true },
      { label: "Manus", path: "/manus", icon: Hammer, overflow: true },
      { label: "3D Pool", path: "/pool-game", icon: Globe2, overflow: true },
      { label: "3D Worlds", path: "/worlds", icon: Globe2, overflow: true },
      { label: "Pipeline", path: "/productions/pipeline", icon: Workflow, overflow: true },
      { label: "Research Studio", path: "/research-studio", icon: Microscope, overflow: true },
    ],
  },

  // ── 5. System & Infrastructure ─────────────────────────────────
  {
    id: "system",
    label: "System",
    emoji: "🔧",
    description: "Models, infrastructure, and configuration",
    stats: [
      { label: "Nodes", storeKey: "gateway.nodeCount", icon: MonitorDot },
      { label: "Plugins", storeKey: "gateway.pluginCount", icon: Container },
    ],
    items: [
      { label: "Model Manager", path: "/llm/models", icon: HardDrive },
      { label: "Ollama", path: "/llm/ollama", icon: Brain },
      { label: "LM Studio", path: "/llm/lm-studio", icon: Cpu },
      { label: "Gemma 4 Guide", path: "/llm/gemma4", icon: Sparkles, badge: "NEW" },
      { label: "BitNet", path: "/llm/bitnet", icon: Zap },
      { label: "Docker", path: "/infra/docker", icon: Container },
      { label: "Agent Desktop", path: "/republic/agent-desktop", icon: MonitorDot },
      { label: "Config", path: "/config", icon: Settings },
      { label: "API Keys", path: "/api-keys", icon: Key },
      { label: "Nodes", path: "/nodes", icon: MonitorDot },
      // Overflow
      { label: "Cluster", path: "/cluster", icon: Network, overflow: true },
      { label: "Process Flow", path: "/process-flow", icon: Activity, overflow: true },
      { label: "Supabase", path: "/infra/supabase", icon: Database, overflow: true },
      { label: "Vector DB", path: "/infra/vectordb", icon: Database, overflow: true },
      { label: "Resources", path: "/infra/resources", icon: Server, overflow: true },
      { label: "N8N Automation", path: "/infra/n8n", icon: Workflow, overflow: true },
      { label: "Boot Telemetry", path: "/infra/boot", icon: Zap, overflow: true },
      { label: "Trace Explorer", path: "/infra/tracing", icon: Activity, overflow: true },
      { label: "ComfyUI Studio", path: "/infra/comfyui", icon: Palette, overflow: true },
      { label: "Environment", path: "/environment", icon: Shield, overflow: true },
      { label: "Cron", path: "/cron", icon: Clock, overflow: true },
      { label: "Channels", path: "/channels", icon: Radio, overflow: true },
      { label: "LLM Hub", path: "/llm", icon: Brain, overflow: true },
    ],
  },

  // ── 6. Node Management ────────────────────────────────────────
  {
    id: "nodes",
    label: "Node Management",
    emoji: "📡",
    description: "Remote node dashboards and workloads",
    stats: [{ label: "Nodes", storeKey: "gateway.nodeCount", icon: MonitorDot }],
    items: [
      { label: "Node Dashboard", path: "/node", icon: MonitorDot },
      { label: "Node Pairing", path: "/node/pairing", icon: Network },
      { label: "Node Hardware", path: "/node/hardware", icon: HardDrive },
      { label: "Node Workloads", path: "/node/workloads", icon: Activity },
      { label: "Node Citizens", path: "/node/citizens", icon: Users },
      { label: "Node LLM", path: "/node/llm", icon: Brain },
      { label: "Node Plugins", path: "/node/plugins", icon: Puzzle },
      { label: "Node Config", path: "/node/config", icon: Settings },
      { label: "Node Logs", path: "/node/logs", icon: ScrollText, overflow: true },
    ],
  },
];

/** Flat list of ALL navigation items for Command Palette search */
export function getAllNavItems(): Array<NavItem & { groupLabel: string }> {
  return navigation.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupLabel: group.label })),
  );
}
