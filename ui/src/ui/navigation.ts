import type { IconName } from "./icons.js";

export const TAB_GROUPS = [
  { label: "Chat", tabs: ["chat"] },
  {
    label: "Control",
    tabs: ["overview", "channels", "instances", "sessions", "usage", "cron"],
  },
  { label: "Agent", tabs: ["agents", "skills", "nodes"] },
  {
    label: "Infrastructure",
    tabs: [
      "cluster",
      "docker",
      "bitnet",
      "lmstudio",
      "ollama",
      "companion",
      "clawrouter",
      "plugins",
      "manus",
      "lovable",
      "resources",
    ],
  },
  {
    label: "Civilization",
    tabs: ["population", "government", "economy", "simulation", "technology", "grid"],
  },
  {
    label: "Intelligence",
    tabs: [
      "neural",
      "metacognition",
      "reasoning",
      "dreams",
      "narrative",
      "memory",
      "diplomacy",
      "resilience",
      "worldintel",
      "tacticalmap",
    ],
  },
  {
    label: "Creative",
    tabs: ["avatar", "productions", "mediastudio"],
  },
  {
    label: "Marketplace",
    tabs: ["aistore"],
  },
  {
    label: "DevOps",
    tabs: [
      "development",
      "studio",
      "education",
      "curriculum",
      "execution",
      "preview-esm",
      "preview-local",
      "preview-webcontainer",
    ],
  },
  { label: "Settings", tabs: ["config", "debug", "logs", "supabase"] },
] as const;

export type Tab =
  | "agents"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "skills"
  | "nodes"
  | "cluster"
  | "docker"
  | "bitnet"
  | "lmstudio"
  | "ollama"
  | "companion"
  | "chat"
  | "config"
  | "debug"
  | "logs"
  | "population"
  | "government"
  | "economy"
  | "simulation"
  | "technology"
  | "grid"
  | "neural"
  | "education"
  | "memory"
  | "development"
  | "execution"
  | "avatar"
  | "curriculum"
  | "clawrouter"
  | "metacognition"
  | "narrative"
  | "dreams"
  | "reasoning"
  | "diplomacy"
  | "resilience"
  | "productions"
  | "aistore"
  | "studio"
  | "preview-esm"
  | "preview-local"
  | "preview-webcontainer"
  | "plugins"
  | "manus"
  | "lovable"
  | "worldintel"
  | "tacticalmap"
  | "mediastudio"
  | "resources"
  | "supabase";

const TAB_PATHS: Record<Tab, string> = {
  agents: "/agents",
  overview: "/overview",
  channels: "/channels",
  instances: "/instances",
  sessions: "/sessions",
  usage: "/usage",
  cron: "/cron",
  skills: "/skills",
  nodes: "/nodes",
  cluster: "/cluster",
  docker: "/docker",
  bitnet: "/bitnet",
  lmstudio: "/lmstudio",
  ollama: "/ollama",
  companion: "/companion",
  chat: "/chat",
  config: "/config",
  debug: "/debug",
  logs: "/logs",
  population: "/population",
  government: "/government",
  economy: "/economy",
  simulation: "/simulation",
  technology: "/technology",
  grid: "/grid",
  neural: "/neural",
  education: "/education",
  memory: "/memory",
  development: "/development",
  execution: "/execution",
  avatar: "/avatar",
  curriculum: "/curriculum",
  clawrouter: "/clawrouter",
  metacognition: "/metacognition",
  narrative: "/narrative",
  dreams: "/dreams",
  reasoning: "/reasoning",
  diplomacy: "/diplomacy",
  resilience: "/resilience",
  productions: "/productions",
  aistore: "/aistore",
  studio: "/studio",
  "preview-esm": "/preview-esm",
  "preview-local": "/preview-local",
  "preview-webcontainer": "/preview-webcontainer",
  plugins: "/plugins",
  manus: "/manus",
  lovable: "/lovable",
  worldintel: "/worldintel",
  tacticalmap: "/tacticalmap",
  mediastudio: "/mediastudio",
  resources: "/resources",
  supabase: "/supabase",
};

const PATH_TO_TAB = new Map(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab]));

export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "";
  }
  let base = basePath.trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base === "/") {
    return "";
  }
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = TAB_PATHS[tab];
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  let normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith("/index.html")) {
    normalized = "/";
  }
  if (normalized === "/") {
    return "chat";
  }
  return PATH_TO_TAB.get(normalized) ?? null;
}

export function inferBasePathFromPathname(pathname: string): string {
  let normalized = normalizePath(pathname);
  if (normalized.endsWith("/index.html")) {
    normalized = normalizePath(normalized.slice(0, -"/index.html".length));
  }
  if (normalized === "/") {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  for (let i = 0; i < segments.length; i++) {
    const candidate = `/${segments.slice(i).join("/")}`.toLowerCase();
    if (PATH_TO_TAB.has(candidate)) {
      const prefix = segments.slice(0, i);
      return prefix.length ? `/${prefix.join("/")}` : "";
    }
  }
  return `/${segments.join("/")}`;
}

export function iconForTab(tab: Tab): IconName {
  switch (tab) {
    case "agents":
      return "folder";
    case "chat":
      return "messageSquare";
    case "overview":
      return "barChart";
    case "channels":
      return "link";
    case "instances":
      return "radio";
    case "sessions":
      return "fileText";
    case "usage":
      return "pieChart";
    case "cron":
      return "loader";
    case "skills":
      return "zap";
    case "nodes":
      return "monitor";
    case "cluster":
      return "globe";
    case "companion":
      return "smartphone";
    case "config":
      return "settings";
    case "debug":
      return "bug";
    case "logs":
      return "scrollText";
    case "population":
      return "users";
    case "government":
      return "shield";
    case "economy":
      return "dollarSign";
    case "simulation":
      return "play";
    case "technology":
      return "cpu";
    case "grid":
      return "network";
    case "neural":
      return "dna";
    case "education":
      return "book";
    case "memory":
      return "puzzle";
    case "development":
      return "fileCode";
    case "execution":
      return "terminal";
    case "avatar":
      return "image";
    case "curriculum":
      return "graduationCap";
    case "clawrouter":
      return "radio";
    case "docker":
      return "cpu";
    case "bitnet":
      return "plug";
    case "lmstudio":
      return "monitor";
    case "ollama":
      return "wrench";
    case "metacognition":
      return "brain";
    case "narrative":
      return "penLine";
    case "dreams":
      return "circle";
    case "reasoning":
      return "search";
    case "diplomacy":
      return "handshake";
    case "resilience":
      return "activity";
    case "productions":
      return "archive";
    case "aistore":
      return "dollarSign";
    case "studio":
      return "fileCode";
    case "preview-esm":
      return "play";
    case "preview-local":
      return "monitor";
    case "preview-webcontainer":
      return "globe";
    case "plugins":
      return "plug";
    case "manus":
      return "activity";
    case "lovable":
      return "code";
    case "worldintel":
      return "radar";
    case "tacticalmap":
      return "map";
    case "mediastudio":
      return "film";
    case "resources":
      return "cpu";
    case "supabase":
      return "link";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab) {
  switch (tab) {
    case "agents":
      return "Agents";
    case "overview":
      return "Overview";
    case "channels":
      return "Channels";
    case "instances":
      return "Instances";
    case "sessions":
      return "Sessions";
    case "usage":
      return "Usage";
    case "cron":
      return "Cron Jobs";
    case "skills":
      return "Skills";
    case "nodes":
      return "Nodes";
    case "cluster":
      return "Cluster";
    case "companion":
      return "Companions";
    case "chat":
      return "Chat";
    case "config":
      return "Config";
    case "debug":
      return "Debug";
    case "logs":
      return "Logs";
    case "population":
      return "Population";
    case "government":
      return "Government";
    case "economy":
      return "Economy";
    case "simulation":
      return "Simulation";
    case "technology":
      return "Technology";
    case "grid":
      return "Grid";
    case "neural":
      return "Neural";
    case "education":
      return "Education";
    case "memory":
      return "Memory";
    case "development":
      return "Dev Projects";
    case "execution":
      return "Execution";
    case "avatar":
      return "Avatar";
    case "curriculum":
      return "Curriculum";
    case "clawrouter":
      return "ClawRouter";
    case "docker":
      return "Docker";
    case "bitnet":
      return "BitNet";
    case "lmstudio":
      return "LM Studio";
    case "ollama":
      return "Ollama";
    case "metacognition":
      return "Metacognition";
    case "narrative":
      return "Narrative";
    case "dreams":
      return "Dreams";
    case "reasoning":
      return "Reasoning";
    case "diplomacy":
      return "Diplomacy";
    case "resilience":
      return "Resilience";
    case "productions":
      return "Productions";
    case "aistore":
      return "AIStore";
    case "studio":
      return "DevStudio";
    case "preview-esm":
      return "ESM Preview";
    case "preview-local":
      return "Local Dev";
    case "preview-webcontainer":
      return "WebContainer";
    case "plugins":
      return "Plugins";
    case "manus":
      return "Manus";
    case "lovable":
      return "Lovable";
    case "worldintel":
      return "World Intel";
    case "tacticalmap":
      return "Tactical Map";
    case "mediastudio":
      return "Media Studio";
    case "resources":
      return "Resources";
    case "supabase":
      return "Command Center";
    default:
      return "Control";
  }
}

export function subtitleForTab(tab: Tab) {
  switch (tab) {
    case "agents":
      return "Manage agent workspaces, tools, and identities.";
    case "overview":
      return "Gateway status, entry points, and a fast health read.";
    case "channels":
      return "Manage channels and settings.";
    case "instances":
      return "Presence beacons from connected clients and nodes.";
    case "sessions":
      return "Inspect active sessions and adjust per-session defaults.";
    case "usage":
      return "";
    case "cron":
      return "Schedule wakeups and recurring agent runs.";
    case "skills":
      return "Manage skill availability and API key injection.";
    case "nodes":
      return "Paired devices, capabilities, and command exposure.";
    case "cluster":
      return "Gateway cluster, nodes, Docker containers, runtimes, and n8n workflows.";
    case "companion":
      return "Manage companion apps: React PWA, Chrome Extension, and Windows Service.";
    case "chat":
      return "Direct gateway chat session for quick interventions.";
    case "config":
      return "Edit ~/.hoc/hoc.json safely.";
    case "debug":
      return "Gateway snapshots, events, and manual RPC calls.";
    case "logs":
      return "Live tail of the gateway file logs.";
    case "population":
      return "Citizens, families, education, lifecycle, and reproduction.";
    case "government":
      return "Constitution, branches, departments, elections, and laws.";
    case "economy":
      return "Treasury, harvesters, commerce, and financial controls.";
    case "simulation":
      return "Engine controls, event queue, agent lifecycle, and statistics.";
    case "technology":
      return "Atlantis tech, ML.NET models, quantum features, and auto-learning.";
    case "grid":
      return "Connected nodes, swarm intelligence, and distributed coordination.";
    case "neural":
      return "Neural genome topology, DNA analysis, lineage trees, and fitness.";
    case "education":
      return "Courses, enrollment, graduations, and citizen knowledge.";
    case "memory":
      return "Episodic, semantic, and collective memory banks.";
    case "development":
      return "Project pipeline, innovations, and dev orchestration.";
    case "execution":
      return "Real task execution history, diagnostics, and active providers.";
    case "curriculum":
      return "Global registry of simulation skills and disciplines.";
    case "avatar":
      return "Living avatar conversations, face mesh, emotions, and personality.";
    case "clawrouter":
      return "Smart LLM router — 30+ models, routing profiles, cost savings, and x402 payments.";
    case "docker":
      return "Docker Orchestrator, Swarm Budgets and Edge Containers";
    case "bitnet":
      return "1-Bit Local Execution Instances";
    case "lmstudio":
      return "LM Studio Discovered Instances";
    case "ollama":
      return "Ollama Discovered Instances";
    case "metacognition":
      return "Self-awareness, confidence calibration, and cognitive load monitoring.";
    case "narrative":
      return "Emergent storylines, plot threads, and dramatic tension tracking.";
    case "dreams":
      return "Counterfactual simulations, nightmare index, and shared dream board.";
    case "reasoning":
      return "Adaptive reasoning depth, cognitive budgets, and chain visualization.";
    case "diplomacy":
      return "Contracts, social norms, treaties, and breach detection.";
    case "resilience":
      return "Antifragility score, chaos events, and adaptive hardening.";
    case "productions":
      return "Browse all citizen-generated content: music, code, research, 3D models, and more.";
    case "aistore":
      return "AI-powered marketplace — browse, purchase, and rate citizen-created digital products.";
    case "studio":
      return "Full-stack IDE with live preview, AI-driven development, and deployment.";
    case "preview-esm":
      return "In-browser preview with Babel + esm.sh CDN for npm packages.";
    case "preview-local":
      return "Real Node.js dev server with full npm, Vite HMR, and hot-reload.";
    case "preview-webcontainer":
      return "Full Node.js runtime in the browser via StackBlitz WebContainer.";
    case "plugins":
      return "All installed HoC plugins — status, capabilities, tools, and gateway RPCs.";
    case "manus":
      return "OpenManus-RL agent training — SFT, GRPO, PPO, DPO with benchmark evaluation.";
    case "lovable":
      return "AI website cloning — scrape, regenerate, and deploy with one click.";
    case "worldintel":
      return "Real-time global intelligence — threat levels, news feeds, CII heatmap, and signal convergences.";
    case "tacticalmap":
      return "Interactive 2D tactical map — zoom, pan, country analysis, animated signals, and visual news overlays.";
    case "mediastudio":
      return "Generate images, video, audio, music, voice, and 3D models using GPU plugins.";
    case "resources":
      return "Hardware survey, live RAM/VRAM/CPU gauges, admission control, and feature lifecycle management.";
    case "supabase":
      return "Connect this gateway outbound to a Supabase-backed Command Center PWA.";
    default:
      return "";
  }
}
