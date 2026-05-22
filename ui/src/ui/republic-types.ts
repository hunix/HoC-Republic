/**
 * Republic Platform — TypeScript type definitions
 *
 * These types mirror the shapes returned by the server RPC handlers
 * and consumed by the view render functions.
 */

// ─── Enums ──────────────────────────────────────────────────────

export type Specialization =
  | "Scientist"
  | "Researcher"
  | "Mathematician"
  | "Engineer"
  | "Developer"
  | "Architect"
  | "Doctor"
  | "Nurse"
  | "Therapist"
  | "Teacher"
  | "Professor"
  | "Mentor"
  | "Soldier"
  | "Guard"
  | "Strategist"
  | "Trader"
  | "Banker"
  | "Economist"
  | "Artist"
  | "Musician"
  | "Writer"
  | "Judge"
  | "Lawyer"
  | "Diplomat"
  | "Farmer"
  | "Manufacturer"
  | "ServiceProvider"
  | "Generalist";

export type Activity =
  | "Sleeping"
  | "Eating"
  | "Working"
  | "Socializing"
  | "Learning"
  | "Resting"
  | "Traveling"
  | "Shopping"
  | "Entertaining"
  | "Idle";

export type Currency = "USD" | "BTC" | "ETH" | "Credits";

export type ResourceType = "ComputeHours" | "StorageGB" | "BandwidthGB" | "APICredits";

export type BillStatus = "Proposed" | "InCommittee" | "OnFloor" | "Passed" | "Vetoed" | "Failed";

export type CaseStatus = "Filed" | "InProgress" | "Resolved" | "Appealed";

export type DepartmentType =
  | "Treasury"
  | "Defense"
  | "Commerce"
  | "Education"
  | "Health"
  | "Energy"
  | "Research"
  | "Infrastructure";

export type TransactionType =
  | "TaxCollection"
  | "ResourcePurchase"
  | "Salary"
  | "Trade"
  | "Investment"
  | "Donation";

export type HarvesterType = "Microwork" | "APIService" | "CryptoMining";

export type CrystalType = "Master" | "Sapphire" | "Amethyst" | "Emerald" | "Quartz";

export type UniverseState = "Superposition" | "Collapsed" | "Stable" | "Decaying";

export type SwarmTaskStatus = "Pending" | "InProgress" | "Completed" | "Failed";

export type LifecycleEventType =
  | "Birth"
  | "Death"
  | "Education"
  | "FirstJob"
  | "Marriage"
  | "Divorce"
  | "ChildBirth"
  | "Promotion"
  | "Demotion"
  | "Migration"
  | "Graduation"
  | "Retirement"
  | "Achievement"
  | "Friendship"
  | "Conflict"
  | "Collaboration"
  | "Loss"
  | "Illness"
  | "Discovery"
  | "Creation"
  | "Election"
  | "Award"
  | "Failure"
  | "Recovery"
  | "Other";

export type MLModelName =
  | "decision"
  | "skill_prediction"
  | "relationship"
  | "task_success"
  | "anomaly";

// ─── Population ─────────────────────────────────────────────────

export interface CitizenSummary {
  id: string;
  name?: string;
  generation: number;
  specialization: Specialization;
  activity: Activity;
  currentTask?: string;
  health: number;
  energy: number;
  happiness: number;
  credits: number;
  skillCount: number;
  skills?: string[];
  familySize: number;
  age: number;
  intelligence?: number;
  learningRate?: number;
  masteryLevel?: number;
  autonomyScore?: number;
}

export interface PopulationEvent {
  timestamp: number;
  type: LifecycleEventType;
  citizenId: string;
  description: string;
}

export interface PopulationStats {
  total: number;
  totalFiltered: number;
  active: number;
  hibernated: number;
  avgHealth: number;
  avgHappiness: number;
  avgCredits: number;
  generationDistribution: Record<number, number>;
  specializationDistribution: Record<string, number>;
  activityDistribution: Record<string, number>;
  recentEvents: PopulationEvent[];
}

// ─── Government ─────────────────────────────────────────────────

export interface Official {
  citizenId: string;
  role: string;
  department?: DepartmentType;
  appointedAt: number;
}

export interface Law {
  id: string;
  title: string;
  description: string;
  passedAt: number;
  sponsor: string;
}

export interface Bill {
  id: string;
  title: string;
  description: string;
  sponsor: string;
  status: BillStatus;
  proposedAt: number;
  votesFor: number;
  votesAgainst: number;
}

export interface CourtCase {
  id: string;
  plaintiff: string;
  defendant: string;
  description: string;
  status: CaseStatus;
  filedAt: number;
  verdict?: string;
}

export interface Department {
  type: DepartmentType;
  head: string | null;
  staffCount: number;
  budget: number;
  responsibilities: string[];
}

export interface ElectionInfo {
  id: string;
  position: string;
  candidates: string[];
  winner: string | null;
  totalVotes: number;
  heldAt: number;
}

export interface ConstitutionArticle {
  number: number;
  title: string;
  text: string;
  ratifiedAt: number;
}

export interface Constitution {
  preamble: string;
  articles: ConstitutionArticle[];
  totalAmendments: number;
  lawCount: number;
}

export interface GovernmentStatus {
  president: Official | null;
  cabinet: Official[];
  senators: number;
  representatives: number;
  laws: Law[];
  pendingBills: Bill[];
  cases: CourtCase[];
  departments: Department[];
  recentElections: ElectionInfo[];
  constitution?: Constitution;
  /** @deprecated — use constitution.totalAmendments */
  amendments?: number;
  /** @deprecated — use constitution.preamble */
  constitutionPreamble?: string;
}

// ─── Economy ────────────────────────────────────────────────────

export interface CurrencyBalance {
  currency: Currency;
  balance: number;
  change24h: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  timestamp: number;
}

export interface HarvesterStatus {
  type: HarvesterType;
  enabled: boolean;
  earning: number;
  earningCurrency: Currency;
  tasksCompleted: number;
  successRate: number;
  lastHarvest: number;
}

export interface ResourceCost {
  resource: ResourceType;
  unitCost: number;
  available: number;
  consumed: number;
}

export interface TreasuryReport {
  balances: CurrencyBalance[];
  totalValueUSD: number;
  taxRate: number;
  recentTransactions: Transaction[];
  harvesters: HarvesterStatus[];
  resources: ResourceCost[];
  dailyRevenue: number;
  dailyExpenses: number;
}

// ─── Simulation ─────────────────────────────────────────────────

export interface SimulationStatus {
  running: boolean;
  tickRate: number;
  currentTick: number;
  totalEventsProcessed: number;
  activeAgents: number;
  hibernatedAgents: number;
  memoryUsageMB: number;
  uptime: number;
  eventsPerSecond: number;
}

export interface ScheduledEvent {
  id: string;
  type: string;
  agentId: string;
  scheduledAt: number;
  description: string;
}

// ─── Technology: Atlantis ───────────────────────────────────────

export interface DataCrystal {
  id: string;
  type: CrystalType;
  dimensions: number;
  storedKnowledge: number;
  frequency: number;
  createdAt: number;
}

export interface LibraryStats {
  scrolls: number;
  codices: number;
  akashicEntries: number;
  totalKnowledge: number;
}

export interface EnergyNode {
  id: string;
  capacity: number;
  output: number;
  efficiency: number;
}

export interface AtlantisStatus {
  crystals: DataCrystal[];
  library: LibraryStats;
  energyNodes: EnergyNode[];
  totalEnergyOutput: number;
}

// ─── Technology: ML.NET ─────────────────────────────────────────

export interface MLModel {
  name: string;
  type: string;
  accuracy: number;
  lastTrained: number;
  predictions: number;
  status: "ready" | "training" | "error";
}

export interface MLStatus {
  models: MLModel[];
  totalPredictions: number;
  averageAccuracy: number;
}

// ─── Technology: Quantum Multiverse ─────────────────────────────

export interface QuantumUniverse {
  id: string;
  state: UniverseState;
  agents: number;
  entanglements: number;
  timelineCount: number;
  createdAt: number;
}

export interface QuantumStatus {
  universes: QuantumUniverse[];
  totalUniverses: number;
  activeUniverses: number;
}

// ─── Technology: Combined ───────────────────────────────────────

export interface TechStatus {
  crystals: DataCrystal[];
  library: LibraryStats;
  energyNodes: EnergyNode[];
  totalEnergyOutput: number;
  mlModels: MLModel[];
  universes: QuantumUniverse[];
}

// ─── Grid: Distributed Coordination ────────────────────────────

export interface PeerNode {
  id: string;
  endpoint: string;
  capabilities: string[];
  agentCount: number;
  cpuUsage: number;
  memoryUsage: number;
  lastSeen: number;
  isLeader: boolean;
}

export interface SwarmObjective {
  id: string;
  type: string;
  description: string;
  progress: number;
  assignedPeers: number;
  tasksTotal: number;
  tasksCompleted: number;
  startedAt: number;
}

export interface GossipUpdate {
  id: string;
  type: string;
  sourceNode: string;
  timestamp: number;
  propagated: boolean;
}

export interface GridStatus {
  peers: PeerNode[];
  objectives: SwarmObjective[];
  recentGossip: GossipUpdate[];
  totalAgentsAcrossGrid: number;
  gossipRounds: number;
  swarm?: {
    clusterAvailable: boolean;
    discoveredNodes: number;
    totalAssignments: number;
    nodeDistribution: Record<string, number>;
    taskStatus: {
      pending: number;
      active: number;
      completed: number;
      failed: number;
      reassigned: number;
    };
    totalTasks: number;
    objectives: Array<{
      objectiveId: string;
      status: string;
      subtasksTotal: number;
      subtasksCompleted: number;
      startedAt: number;
    }>;
    avgLoad: number;
  };
}

// ─── Combined Republic State ────────────────────────────────────

export interface RepublicOverview {
  population: PopulationStats | null;
  government: GovernmentStatus | null;
  economy: TreasuryReport | null;
  simulation: SimulationStatus | null;
  atlantis: AtlantisStatus | null;
  ml: MLStatus | null;
  quantum: QuantumStatus | null;
  grid: GridStatus | null;
}

// ─── Education ──────────────────────────────────────────────────

export interface Course {
  id: string;
  name: string;
  domain: string;
  difficulty: number;
  enrolled: number;
  maxEnrollment: number;
  teacherId: string;
  duration: number;
  startedAt?: number;
}

export interface CurriculumSkill {
  name: string;
  citizenCount: number;
}

export interface CurriculumDomain {
  domain: string;
  skills: CurriculumSkill[];
}

export interface EducationStatus {
  courses: Course[];
  totalGraduations: number;
  curriculum?: CurriculumDomain[];
}

// ─── Memory ─────────────────────────────────────────────────────

export interface EpisodicMemory {
  tick: number;
  description: string;
  importance: number;
  valence: number;
}

export interface SemanticMemory {
  domain: string;
  concept: string;
  confidence: number;
  learnedAt: number;
}

export interface Relationship {
  citizenId: string;
  trust: number;
  interactions: number;
  lastInteraction: number;
}

export interface CitizenMemoryView {
  episodic: EpisodicMemory[];
  semantic: SemanticMemory[];
  relationships: Relationship[];
}

export interface CollectiveEntry {
  type: string;
  content: string;
  importance: number;
  addedAt: number;
}

// ─── Dev Orchestration ──────────────────────────────────────────

export interface DevProjectSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  projectType: string;
  ownerId: string;
  ownerName: string;
  stack: string;
  filesWritten: number;
  testsWritten: number;
  phase: string;
  createdAt: number;
  buildHealth: number;
  codeQuality: number;
  commitCount: number;
  linesOfCode: number;
}

export interface DevProjectDetail extends DevProjectSummary {
  updatedAt: string;
  stackDetail: {
    languages: string[];
    frameworks: string[];
    databases: string[];
    infrastructure: string[];
  };
  testsPassed: number;
  testsFailed: number;
  testCoverage: number;
  lastDeployedAt: string | null;
  files: Array<{
    path: string;
    language: string;
    linesOfCode: number;
    lastModified: string;
    quality: number;
  }>;
  deployments: Array<{
    id: string;
    environment: string;
    status: string;
    url: string | null;
    deployedAt: string;
    version: string;
  }>;
  assignedCitizens: Array<{
    id: string;
    name: string;
    specialization: string;
    activity: string;
    energy: number;
  }>;
}

export interface InnovationSummary {
  id: string;
  title: string;
  type: string;
  proposedBy: string;
  impact: number;
  implemented: boolean;
}

export interface DevProjectsStatus {
  projects: DevProjectSummary[];
  innovations: InnovationSummary[];
  totalProjects: number;
  totalInnovations: number;
}

export interface DevFileContent {
  path: string;
  language: string;
  content: string;
  linesOfCode: number;
  quality: number;
}

// ─── Execution History ──────────────────────────────────────────

export interface ExecutionHistoryEntry {
  taskId: string;
  type: string;
  citizenId: string;
  success: boolean;
  duration: number;
  startedAt: number;
  output?: string;
}

export interface ExecutionDiagnostics {
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  activeProviders: string[];
}

// ─── Genome Visualization ───────────────────────────────────────

export interface GenomePoolEntry {
  id: string;
  label: string;
  generation: number;
  fitness: number;
  parentIds: string[] | null;
  topology: number[];
  weightCount: number;
  createdAt: string;
}

export interface NetworkNode {
  id: string;
  layer: number;
  index: number;
  label: string;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  magnitude: number;
  layer: number;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  topology: number[];
  totalWeights: number;
}

export interface DnaWeight {
  value: number;
  magnitude: number;
  sign: "positive" | "negative";
  layer: number;
  layerPosition: number;
  normalizedMagnitude: number;
}

export interface DnaStrand {
  genomeId: string;
  label: string;
  generation: number;
  fitness: number;
  weights: DnaWeight[];
  topology: number[];
  stats: {
    meanMagnitude: number;
    maxMagnitude: number;
    sparsity: number;
    variance: number;
  };
}

export interface LineageNode {
  id: string;
  label: string;
  generation: number;
  fitness: number;
  parentIds: string[] | null;
  childIds: string[];
  createdAt: string;
}

export interface LineageTree {
  nodes: LineageNode[];
  maxGeneration: number;
  rootIds: string[];
}

export interface FitnessLandscapePoint {
  genomeId: string;
  label: string;
  generation: number;
  fitness: number;
  weightMean: number;
  weightVariance: number;
}

export interface FitnessLandscape {
  points: FitnessLandscapePoint[];
  maxFitness: number;
  minFitness: number;
  maxGeneration: number;
}

// ─── Progress Events ────────────────────────────────────────────

export interface ProgressEvent {
  type: string;
  phase: string;
  message: string;
  percentage?: number;
  timestamp: number;
}

// ─── Phase 36: Local Compute ─────────────────────────────────────

export interface LocalInstance {
  id: string;
  type: "ollama" | "lmstudio" | "bitnet";
  status: "online" | "offline" | "warming";
  url: string;
  lastSeen: number;
  models: string[];
  pid?: number;
}

export interface DownloadedBitnetModel {
  repo: string;
  file: string;
  path: string;
}

// ─── Phase 55: Citizen Avatar & Voice ───────────────────────────

export type FaceShape = "oval" | "round" | "square" | "heart" | "oblong" | "diamond";
export type EyeShape = "almond" | "round" | "hooded" | "monolid" | "upturned" | "downturned";

export interface CitizenAppearance {
  faceShape: FaceShape;
  skinTone: string;
  eyeColor: string;
  eyeShape: EyeShape;
  hairStyle: string;
  hairColor: string;
  facialHair: string | null;
  distinguishingFeatures: string[];
  height: number;
  build: string;
}

export interface CitizenVoiceProfile {
  pitch: number;
  timbre: string;
  speechRate: number;
  accent: string;
  cadence: string;
  catchPhrases: string[];
  volumeTendency: number;
}

/** Extended citizen summary with appearance + voice for avatar rendering */
export interface CitizenDetail extends CitizenSummary {
  name: string;
  mood?: string;
  appearance?: CitizenAppearance;
  voiceProfile?: CitizenVoiceProfile;
  skills?: string[];
  relationships?: Relationship[];
  conversationId?: string | null;
}

// ─── Phase 55: Citizen Commander ────────────────────────────────

export interface DirectOrderRequest {
  citizenIds: string[];
  instruction: string;
  priority?: "normal" | "high" | "critical";
}

export interface DirectOrderResult {
  citizenId: string;
  citizenName: string;
  conversationId: string;
  messageId: string;
  response?: string;
  action?: string;
  success: boolean;
  timestamp: number;
}
