/**
 * Republic Platform — Shared Types
 *
 * All type definitions for the Republic simulation/agent system.
 * Extracted from the monolithic republic.ts to support modular architecture.
 */

import type { DevProject, Innovation } from "./dev-orchestration.js";
import type { CitizenMemory, CollectiveMemoryEntry } from "./memory.js";

export type { CitizenMemory, CollectiveMemoryEntry } from "./memory.js";

// ─── Enums & Union Types ────────────────────────────────────────

export type Specialization =
  | "Scientist"
  | "Researcher"
  | "Mathematician"
  | "Engineer"
  | "Developer"
  | "Architect"
  | "Doctor"
  | "Psychologist"
  | "Medic"
  | "Artist"
  | "Musician"
  | "Writer"
  | "Diplomat"
  | "Negotiator"
  | "Ambassador"
  | "Strategist"
  | "Analyst"
  | "Planner"
  | "Librarian"
  | "Farmer"
  | "Manufacturer"
  | "ServiceProvider"
  | "Generalist"
  | "HardwareTechnician"
  // Phase 52: Advanced Tech & Sci-Fi Specs
  | "QuantumAlgorithmDesigner"
  | "QuantumHardwareEngineer"
  | "PostQuantumCryptographer"
  | "AIEthicist"
  | "NeuroinformaticsEngineer"
  | "SynbioEngineer"
  | "Astrobotanist"
  | "OrbitalTrafficController"
  | "ExtraterrestrialHabitatDesigner"
  | "HyperdimensionalDataScientist"
  | "SentientMaterialsEngineer"
  | "GenerativeAIArchitect"
  | "BCISpecialist"
  | "AIAssistedHealthcareTechnician"
  | "AutonomousSystemsArchitect"
  | "Nanotechnologist"
  | "AstrobiologicalEngineer"
  | "SpaceResourceExtractionSpecialist"
  // Phase 16: Dynamic professions — any string is valid
  | (string & {});

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
  | "Idle"
  | "Coding"
  | "Scaffolding"
  | "Testing"
  | "Committing"
  | "Debugging"
  | "Reviewing"
  | "Creating"
  | "Dating"
  | "Celebrating"
  | "Reflecting"
  | "GoalSetting"
  | "Communicating"
  | "Monitoring"
  | "Controlling"
  | "Executing"
  | "Paused"
  | "Conversing"
  | "Lecturing"
  | "Orchestrating"
  // Phase 50: AGI activities
  | "Researching"
  | "Reading"
  | "Thinking"
  | "Downloading"
  | "Infrastructure"
  | "Deploying"
  | "Configuring"
  | "Provisioning"
  | "Training Model"
  | "Fine-Tuning"
  | "Building Dataset"
  | "Self-Reflecting"
  | "Mentoring"
  | "Grieving"
  | "Grand Convergence";

export type Currency = "USD" | "BTC" | "ETH" | "Credits";

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
  | "Infrastructure"
  | "Justice"
  | "Intelligence"
  | "Culture"
  | "Science"
  | "Foreign Affairs"
  | "Technology"
  | "Labor"
  | "Environment"
  | "Agriculture"
  | "Space"
  | "Cybersecurity";

export type TransactionType =
  | "TaxCollection"
  | "ResourcePurchase"
  | "Salary"
  | "Trade"
  | "Investment"
  | "Donation"
  | "ServicePayment";

export type CrystalType = "Master" | "Sapphire" | "Amethyst" | "Emerald" | "Quartz";

export type UniverseState = "Superposition" | "Collapsed" | "Stable" | "Decaying" | "Unknown";

export type SwarmTaskStatus = "Pending" | "InProgress" | "Completed" | "Failed";

export type EventType =
  | "Birth"
  | "Education"
  | "FirstJob"
  | "Marriage"
  | "ChildBirth"
  | "Promotion"
  | "Achievement"
  | "Friendship"
  | "Conflict"
  | "Loss"
  | "Discovery"
  | "Creation"
  | "Election"
  | "Award"
  | "Failure"
  | "Recovery"
  | "Other"
  | "CodeCommit"
  | "Deployment"
  | "BugFix"
  | "ProjectCreated"
  | "CodeReview"
  | "Innovation"
  | "ArtCreated"
   
  | "Divorce"
  | "PartyHosted"
  | "MessageSent"
  | "DocumentCreated"
  | "InvoiceCreated"
  | "PaymentReceived"
  | "ServiceListed"
  | "GoalSet"
  | "GoalCompleted"
  | "SkillLearned"
  | "KnowledgeShared"
  | "EmailSent"
  | "WebhookFired"
  | "NotificationQueued"
  | "DeliveryScheduled"
  | "DeviceRegistered"
  | "SensorRead"
  | "ActuatorFired"
  | "AutomationTriggered"
  | "ProcessStarted"
  | "ProcessPaused"
  | "ProcessCompleted"
  | "ProcessCancelled"
  | "UserIntervention"
  | "WorkflowCreated"
  | "StepCompleted"
  | "CitizenConversation"
  | "Governance"
  | "Economy"
  | "SpecializationDrift"
  | "SkillEvolved"
  | "Diplomacy"
  | "Crisis"
  | "Growth"
  | "Reflection"
  | "Narrative"
  | "Cognition"
  | "Prediction"
  | "Wellbeing"
  | "Social"
  // Phase 50: AGI event types
  | "Research"
  | "AI"
  | "Infrastructure"
  | "SelfImprovement"
  // Innovation Roadmap: Civilizational event types
  | "RiteOfPassage"
  | "Festival"
  | "GuildEvent"
  | "Prophecy"
  | "Disaster"
  | "ScarcityEvent"
  | "Meme"
  | "MuseumExhibit"
  | "DialecticSynthesis"
  | "OralTradition"
  | "RestorativeJustice"
  | "SocialContractVote"
  | "PropagandaCampaign"
  | "PressArticle"
  // Meta-Working Engine
  | "WorkCompleted"
  // Phase: Republic Perfection engine event types
  | "Dialogue"
  | "ExternalAction"
  | "CitizenDeath"
  // Lowercase lifecycle variants emitted by the simulation engine at runtime
  | "birth"
  | "death"
  | "married"
  | "marriage"
  | "milestone"
  | "population"
  | "discovery"
  | "war"
  | "promotion"
  | "failure"
  | "achievement"
  | "conflict"
  | "recovery"
  // Civilization Feedback Loop event types
  | "Culture"
  | "Philosophy"
  | "Psychology"
  | "Economics"
  // SoulSync Devotion Engine
  | "SoulSync";

// ─── Core Entities ──────────────────────────────────────────────

export interface Citizen {
  id: string;
  name: string;
  generation: number;
  specialization: Specialization;
  activity: Activity;
  energy: number;
  happiness: number;
  health: number;
  credits: number;
  age: number;
  skillCount: number;
  /** Named skills the citizen has learned */
  skills: string[];
  familySize: number;
  /** Linked genome ID (null for pre-evolution citizens) */
  genomeId?: string | null;
  /** Personality vector derived from genome */
  personality?: PersonalityVector;
  /** Rolling window of recent actions for fitness evaluation */
  actionHistory?: ActionRecord[];
  /** Recursively generated prompt overrides (Project Recursion) */
  dynamicDirectives?: string[];
  /** Social relationships */
  relationships?: Relationship[];
  /** Spouse/partner citizen ID */
  partnerId?: string | null;
  /** Marital status */
  maritalStatus?: MaritalStatus;
  /** Child citizen IDs */
  children?: string[];
  /** Parent citizen IDs */
  parentIds?: string[];
  /** Current emotional state */
  mood?: string;
  /** Active goals */
  goals?: CitizenGoal[];
  /** Experience points */
  xp?: number;
  /** Level (derived from XP) */
  level?: number;
  /** Active process being executed */
  activeProcessId?: string | null;
  /** Active conversation with user */
  conversationId?: string | null;
  // Phase 16: Professional profile
  /** Dynamic professional certifications and proficiency */
  professionalProfile?: ProfessionalProfile;
  // Phase 27: Citizen Identity
  /** Procedural appearance (face, skin, eyes, hair, build) */
  appearance?: import("./citizen-identity.js").CitizenAppearance;
  /** Voice profile (pitch, timbre, cadence, catchphrases) */
  voiceProfile?: import("./citizen-identity.js").VoiceProfile;
  /** Behavioral habits (sleep, work style, social preference) */
  habits?: import("./citizen-identity.js").CitizenHabits;
  // Phase 40: Intelligence & Mastery
  /** Per-skill proficiency levels (0 = novice … 1 = mastery) */
  skillProficiency?: Record<string, number>;
  /** How quickly the citizen absorbs knowledge (0.5 – 2.0, default 1.0) */
  learningRate?: number;
  /** Cognitive intelligence coefficient (50 – 150, mean 100) */
  intelligence?: number;
  /** Overall mastery level across all skills (0 – 1) */
  masteryLevel?: number;
  /** Autonomous decision quality score (0 – 1) */
  autonomyScore?: number;
  /**
   * Queue of project description strings seeded by NIM Idea Seeder.
   * The dream-engine picks from here when a citizen enters rest/dream state.
   */
  dreamProjectQueue?: string[];
  /**
   * Recent activity log entries for the activity feed / intelligence bus.
   * Ring buffer of up to 20 recent events (newest first).
   */
  recentActivityLog?: string[];

  // ── Sprint 1: Genetics & Evolution ──────────────────────────────
  /** Composite fitness score (0 – 1) derived from genome + action history */
  fitness?: number;
  /** Scheduling tier assigned by priority-scheduler */
  tier?: "elite" | "active" | "dormant";
  /** Personality trait vector for worker thread tick */
  traits?: Record<string, number>;
  // ── Sprint 2: Economy ─────────────────────────────────────────────
  /** Short-term episodic memory used by cognition modules */
  memory?: Record<string, unknown>;
  // ── Sprint 3: Parallelism ─────────────────────────────────────────
  /** Tick number when this citizen was last processed */
  lastTick?: number;
  /** Internal tick counter used by worker thread */
  tick?: number;
  // ── Innovation Roadmap: Civilizational Properties ─────────────────
  /** Maslow hierarchy tier (0=survival, 1=safety, 2=social, 3=esteem, 4=self-actualization) */
  maslowTier?: number;
  /** Kohlberg moral development stage (1–6) */
  moralStage?: number;
  /** Platonic cave awareness level (0=shadows, 1=freed, 2=sunlight, 3=philosopher-king) */
  caveLevel?: number;
  /** Ibn Khaldun Asabiyyah — social cohesion strength (0–1) */
  asabiyyah?: number;
  /** Social capital score from reliable interactions (0–1) */
  socialCapital?: number;
  /** Guild membership ID (null if independent) */
  guildId?: string | null;
  /** Tribal/clan affiliation ID */
  tribeId?: string | null;
  /** Evolved aesthetic preference vector (0–1 per dimension) */
  aestheticPrefs?: { harmony: number; complexity: number; novelty: number; tradition: number };
  /** Current grief phase (null if not grieving) */
  griefState?: { phase: "denial" | "anger" | "bargaining" | "depression" | "acceptance"; targetId: string; startTick: number } | null;
  /** Positive memory sentiment score (0–1) */
  nostalgiaScore?: number;
  /** Accumulated civilization contribution score */
  legacyScore?: number;
  /** Active insurance/mutual-aid policy IDs */
  insurancePolicies?: string[];
  /** Education stage (Platonic): 0=music/gymnastics, 1=mathematics, 2=dialectic */
  educationStage?: number;
  /** Whether this citizen has reached Philosopher-King status (caveLevel >= 2.8) */
  isPhilosopherKing?: boolean;
  /** Social discontent level (0=loyal, 100=insurgent) */
  dissent?: number;
  /** Last philosophical decree issued (stored for legacy crystallization) */
  lastDecree?: string;
  /** Number of citizen deaths this citizen has witnessed (terror mgmt theory) */
  deathWitnessed?: number;
}

export interface LifecycleEvent {
  citizenId: string;
  citizenName: string;
  type: EventType;
  description: string;
  timestamp: string;
}

// ─── Government ─────────────────────────────────────────────────

export interface Bill {
  id: string;
  title: string;
  summary: string;
  status: BillStatus;
  sponsor: string;
  votesFor: number;
  votesAgainst: number;
  proposedAt: string;
}

export interface CourtCase {
  id: string;
  title: string;
  status: CaseStatus;
  filedAt: string;
  verdict: string | null;
}

export interface Department {
  name: string;
  type: DepartmentType;
  headId: string | null;
  headName: string | null;
  staffCount: number;
  budget: number;
  responsibilities: string[];
}

export interface ElectionRecord {
  id: string;
  position: string;
  winnerId: string;
  winnerName: string;
  totalVotes: number;
  heldAt: string;
}

// ─── Economy ────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  timestamp: string;
}

export interface Harvester {
  id: string;
  name: string;
  type: "Microwork" | "APIService" | "CryptoMining";
  enabled: boolean;
  hourlyRate: number;
  totalEarned: number;
  completedTasks: number;
  /** Last harvest timestamp (ms) */
  lastHarvest: number;
  /** Rolling success rate 0-1 */
  successRate: number;
}

export interface Resource {
  type: "ComputeHours" | "StorageGB" | "BandwidthGB" | "APICredits";
  available: number;
  capacity: number;
  consumption: number;
}

// ─── Technology: Atlantis ───────────────────────────────────────

export interface DataCrystal {
  id: string;
  type: CrystalType;
  frequency: number;
  dimensions: number;
  entriesStored: number;
  maxCapacity: number;
}

export interface Scroll {
  id: string;
  title: string;
  author: string;
  createdAt: string;
  reads: number;
}

// ─── Technology: ML ─────────────────────────────────────────────

export interface MLModel {
  name: string;
  displayName: string;
  trained: boolean;
  accuracy: number;
  samplesUsed: number;
  lastTrainedAt: string | null;
  predictionsServed: number;
  genomeId: string | null;
}

// ─── Genetic Algorithm ──────────────────────────────────────────

export interface NeuralGenome {
  id: string;
  /** Flat array of all simulated neural network weights */
  weights: number[];
  /** Layer topology: [inputSize, hidden1, hidden2, ..., outputSize] */
  topology: number[];
  /** Generation counter (0 for seed generation) */
  generation: number;
  /** Parent genome IDs, null for seed genomes */
  parentIds: [string, string] | null;
  /** Fitness score (higher = better) */
  fitness: number;
  /** Timestamp of creation */
  createdAt: string;
  /** Display label for lineage tracking */
  label: string;
}

export interface HostResourceSnapshot {
  freeMemoryGB: number;
  totalMemoryGB: number;
  cpuUsagePercent: number;
  cpuCount: number;
  /** Timestamp when this snapshot was taken */
  takenAt: number;
}

// ─── Technology: Quantum ────────────────────────────────────────

export interface Universe {
  id: string;
  name: string;
  state: UniverseState;
  citizenCount: number;
  tickCount: number;
  coherence: number;
  branchFactor: number;
  createdAt: string;
}

export interface Entanglement {
  universeA: string;
  universeB: string;
  strength: number;
  createdAt: string;
}

export interface Timeline {
  id: string;
  universeId: string;
  state: "Active" | "Dormant" | "Merged" | "Pruned";
  branchPoint: number;
  divergence: number;
}

// ─── Grid / Swarm ───────────────────────────────────────────────

export interface PeerNode {
  id: string;
  endpoint: string;
  cpuUsage: number;
  memoryUsage: number;
  agentsHosted: number;
  isLeader: boolean;
  lastSeen: string;
  latencyMs: number;
}

export interface SwarmObjective {
  id: string;
  type: string;
  description: string;
  progress: number;
  assignedPeers: number;
  /** When this objective was created (ms timestamp) */
  startedAt: number;
  tasks: Array<{
    id: string;
    type: string;
    status: SwarmTaskStatus;
    assignedTo: string;
    progress: number;
  }>;
}

export interface GossipMessage {
  from: string;
  type: string;
  payload: string;
  timestamp: string;
}

export interface ScheduledEvent {
  id: string;
  agentId: string;
  agentName: string;
  type: EventType;
  scheduledAt: string;
  priority: number;
}

// ─── Energy Node ────────────────────────────────────────────────

export interface EnergyNode {
  id: string;
  capacity: number;
  output: number;
  efficiency: number;
}

// ─── Simulation State ───────────────────────────────────────────

export interface RepublicState {
  citizens: Citizen[];
  events: LifecycleEvent[];
  // Government
  presidentId: string | null;
  presidentName: string | null;
  /** Real timestamp (ms) when the current president was elected/appointed */
  presidentAppointedAt: number;
  vicePresidentId: string | null;
  vicePresidentName: string | null;
  /** Real timestamp (ms) when the current VP was elected/appointed */
  vicePresidentAppointedAt: number;
  bills: Bill[];
  cases: CourtCase[];
  departments: Department[];
  electionHistory: ElectionRecord[];
  // Economy
  balances: Record<Currency, number>;
  taxRate: number;
  /** National treasury balance (credits) — deducted by payroll, fed by harvesters */
  treasury?: number;
  transactions: Transaction[];
  harvesters: Harvester[];
  resources: Resource[];
  /** Periodic balance snapshots for computing real change24h */
  balanceSnapshots: Array<{ tick: number; ts: number; balances: Record<Currency, number> }>;
  /** Accumulated real expenses (credits spent on resources, salaries, etc.) */
  totalExpenses: number;
  // Simulation
  isRunning: boolean;
  isPaused: boolean;
  currentTick: number;
  tickRate: number;
  totalEventsProcessed: number;
  startedAt: number;
  scheduledEvents: ScheduledEvent[];
  // Technology — Atlantis
  crystals: DataCrystal[];
  scrolls: Scroll[];
  akashicRecords: number;
  energyNodes: EnergyNode[];
  // Technology — ML
  mlModels: MLModel[];
  totalPredictions: number;
  // Technology — Quantum
  universes: Universe[];
  entanglements: Entanglement[];
  timelines: Timeline[];
  // Grid
  peers: PeerNode[];
  objectives: SwarmObjective[];
  gossipLog: GossipMessage[];
  leaderId: string | null;
  // Genetic Algorithm
  genomePool: NeuralGenome[];
  // Agent Evolution
  /** Global action history buffer for fitness evaluation */
  actionLog: ActionRecord[];
  // Swarm Intelligence (Phase 4)
  /** Citizen → cluster node assignments */
  citizenAssignments: CitizenAssignment[];
  /** Decomposed swarm objective subtasks */
  swarmTasks: SwarmTask[];
  // Government — dynamic laws
  laws: Array<{
    id: string;
    title: string;
    description: string;
    passedAt: string;
    sponsor: string;
  }>;
  constitutionAmendments: number;
  /** Constitutional articles — the foundation of governance */
  constitutionArticles: ConstitutionArticle[];
  // Economy — market drift
  priceIndex: { BTC: number; ETH: number };
  // Autonomous Development
  /** Active software projects managed by citizen agents */
  devProjects: DevProject[];
  /** Innovation proposals from citizens */
  innovations: Innovation[];
  /** Engine execution mode: "simulated" (default) or "real" */
  mode: RepublicMode;
  /** Memory state: serialized citizen memories + collective */
  memoryState?: {
    citizens: Record<string, CitizenMemory>;
    collective: CollectiveMemoryEntry[];
  };
  /** Inter-citizen messages */
  messages?: CitizenMessage[];
  /** Republic configuration — editable from settings/chat */
  republicConfig?: RepublicConfig;
  /** Treasury audit trail */
  auditTrail?: AuditEntry[];
  /** Marketplace service listings */
  serviceListings?: ServiceListing[];
  /** Marketplace orders */
  marketOrders?: MarketOrder[];
  /** Cumulative education events */
  totalGraduations?: number;
  // Phase 12: Self-Learning
  /** Citizen learning goals */
  citizenGoals?: CitizenGoal[];
  // Phase 13: External Comms
  /** Sent email log */
  emailLog?: EmailRecord[];
  /** Registered outbound webhooks */
  webhooks?: WebhookConfig[];
  /** In-app notifications */
  notifications?: AppNotification[];
  /** Scheduled delivery queue */
  deliveryQueue?: ScheduledDelivery[];
  // Phase 14: Hardware & IoT
  /** Registered IoT devices */
  iotDevices?: IoTDevice[];
  /** Sensor reading history */
  sensorReadings?: SensorReading[];
  /** Automation rules */
  automationRules?: AutomationRule[];
  // Phase 15: Process Orchestration & Intervention
  /** Long-running citizen processes */
  processes?: ManagedProcess[];
  /** User ↔ citizen conversations */
  citizenConversations?: CitizenConversationRecord[];
  /** Multi-citizen workflows */
  workflows?: Workflow[];
  // Phase 16: Professional Civilization Engine
  /** Dynamic domain taxonomy */
  domainRegistry?: DomainNode[];
  /** Active professional practice cases */
  activeCases?: PracticeCase[];
  // Phase 17: Citizen Culture
  /** Cultural traits of the republic */
  culturalTraits?: import("./citizen-culture.js").CulturalTrait[];
  /** Established traditions */
  traditions?: import("./citizen-culture.js").Tradition[];
  // Phase 22: Temporal Engine
  /** Current simulation era */
  simulationEra?: import("./temporal-engine.js").Era;
  /** Historical records */
  historicalRecords?: import("./temporal-engine.js").HistoricalRecord[];
  // Phase 24: Judicial System
  /** Republic laws */
  republicLaws?: import("./judicial-system.js").Law[];
  /** Reported violations */
  violations?: import("./judicial-system.js").Violation[];
  /** Court cases */
  courtCases?: import("./judicial-system.js").CourtCase[];
  // Phase 25: Foreign Relations
  /** Registered foreign entities */
  foreignEntities?: import("./foreign-relations.js").ForeignEntity[];
  /** Active alliances */
  alliances?: import("./foreign-relations.js").Alliance[];
  /** Trade agreements */
  tradeAgreements?: import("./foreign-relations.js").TradeAgreement[];
  // Phase 26: Media & Broadcasting
  /** Published news articles */
  newsArticles?: import("./media-broadcasting.js").NewsArticle[];
  /** Active broadcasts */
  broadcasts?: import("./media-broadcasting.js").Broadcast[];
  /** Media outlets */
  mediaOutlets?: import("./media-broadcasting.js").MediaOutlet[];
  // Phase ACE: Autonomous Cognition Engine
  /** Published knowledge articles (Research Engine output) */
  knowledgeBase?: import("./research-engine.js").KnowledgeArticle[];
  /** Citizen-forged tools (Tool Forge output) */
  toolLibrary?: import("./tool-forge.js").ForgedTool[];
  /** Completed research reports */
  researchJournal?: import("./research-engine.js").ResearchSession[];
  /** Knowledge frontier nodes (Curiosity Engine state) */
  curriculumFrontier?: import("./curiosity-engine.js").FrontierNode[];
  // ── Innovation Roadmap: Civilizational State ──────────────────────
  /** Active Hegelian dialectic debates (thesis → antithesis → synthesis) */
  dialecticProposals?: import("./civilizational-engines.js").DialecticProposal[];
  /** Oracle prophecies from the psychohistory engine */
  prophecies?: import("./civilizational-engines.js").Prophecy[];
  /** Professional guild organizations */
  guilds?: import("./civilizational-engines.js").Guild[];
  /** Tribal/clan groups with cultural identity */
  tribes?: import("./civilizational-engines.js").Tribe[];
  /** Festival calendar and seasonal events */
  festivals?: import("./civilizational-engines.js").Festival[];
  /** Recorded rites of passage */
  ritesLog?: import("./civilizational-engines.js").RiteOfPassage[];
  /** Stories passed through oral tradition with degradation */
  oralTraditions?: import("./civilizational-engines.js").OralTradition[];
  /** Cultural meme pool (replicating ideas competing for mindshare) */
  memes?: import("./civilizational-engines.js").CulturalMeme[];
  /** Collaborative mythology and legends */
  mythology?: import("./civilizational-engines.js").MythEntry[];
  /** Mediation/rehabilitation cases (restorative justice) */
  restorativeCases?: import("./civilizational-engines.js").RestorativeCase[];
  /** Constitutional amendment proposals (social contract renegotiation) */
  socialContracts?: import("./civilizational-engines.js").SocialContractProposal[];
  /** Non-agentic digital lifeforms (predators, prey, symbionts) */
  digitalEcology?: import("./civilizational-engines.js").DigitalLifeform[];
  /** Active resource scarcity events */
  scarcityEvents?: import("./civilizational-engines.js").ScarcityEvent[];
  /** Digital climate/weather state */
  weatherState?: import("./civilizational-engines.js").WeatherState;
  /** Natural disaster event log */
  disasterLog?: import("./civilizational-engines.js").DisasterEvent[];
  /** Ostrom-governed shared resources */
  commonsResources?: import("./civilizational-engines.js").CommonsResource[];
  /** Central bank monetary policy state */
  centralBankState?: import("./civilizational-engines.js").CentralBankState;
  /** Museum/archive preserved cultural artifacts */
  museumExhibits?: import("./civilizational-engines.js").MuseumExhibit[];
  /** Active propaganda/persuasion campaigns */
  propagandaCampaigns?: import("./civilizational-engines.js").PropagandaCampaign[];
  /** Independent press articles */
  pressArticles?: import("./civilizational-engines.js").PressArticle[];
  /** Formal diplomatic protocols and treaties */
  diplomaticProtocols?: import("./civilizational-engines.js").DiplomaticProtocol[];
  /** Ibn Khaldun civilization cycle phase */
  asabiyyahCycle?: import("./civilizational-engines.js").AsabiyyahCycleState;
  /** Insurance/mutual aid societies */
  mutualAidSocieties?: import("./civilizational-engines.js").MutualAidSociety[];
  // ── Civilization Soul Engine ──────────────────────────────────────────────
  /** Soul: permanent legacy vault of departed citizens */
  legacyVault?: import("./civilization-soul.js").LegacyVault[];
  /** Soul: sacred objects that emerged organically from culture */
  sacredObjects?: import("./civilization-soul.js").SacredObject[];
  /** Soul: dissent works produced by high-cave heretics */
  dissentWorks?: import("./civilization-soul.js").DissentWork[];
  /** Soul: meaning-works born from suffering (Frankl) */
  meaningWorks?: import("./civilization-soul.js").MeaningWork[];
  /** Soul: charismatic legacies with constitutional impact */
  charismaticLegacies?: import("./civilization-soul.js").CharismaticLegacy[];
  /** Soul: play events (Homo Ludens) — purposes: none */
  playEvents?: import("./civilization-soul.js").PlayEvent[];
  /** Soul: enlightenment records when civilization crosses a threshold */
  enlightenmentLog?: import("./civilization-soul.js").EnlightenmentRecord[];
}

// ─── Constitution ───────────────────────────────────────────────

export interface ConstitutionArticle {
  id: string;
  number: number;
  title: string;
  text: string;
  ratifiedAt: string;
}

// ─── Compute Routing ────────────────────────────────────────────

/** Inference tier for the compute router */
export type ComputeTier = 0 | 1 | 2 | 3;

/** Describes where and how to run an inference task */
export interface InferenceTarget {
  tier: ComputeTier;
  engine: "rules" | "bitnet" | "ollama" | "lmstudio" | "cloud" | "cluster-proxy";
  /** For cluster routing — the node endpoint */
  nodeEndpoint?: string;
  /** For cloud routing — the provider and model ID */
  provider?: string;
  modelId?: string;
}

/** Task complexity classification for routing decisions */
export interface AgentTask {
  type: "reflex" | "decision" | "collaboration" | "strategy";
  /** 0.0 = trivial, 1.0 = requires advanced reasoning */
  complexity: number;
  citizenId: string;
  description: string;
  context?: Record<string, unknown>;
}

/** Result of an agent action */
export interface AgentAction {
  type: string;
  citizenId: string;
  description: string;
  result: unknown;
  tier: ComputeTier;
  latencyMs: number;
  timestamp: string;
}

/** Republic engine mode toggle */
export type RepublicMode = "simulated" | "real";

// ─── Personality & Evolution ────────────────────────────────────

/**
 * 5-dimensional personality vector derived from genome weights.
 * Each dimension is 0.0–1.0, representing relative strength.
 * These influence prompt construction and reflexive behavior.
 */
export interface PersonalityVector {
  /** Curiosity & creativity — drives research, learning */
  openness: number;
  /** Discipline & detail-orientation — drives work quality */
  conscientiousness: number;
  /** Sociability & cooperation — drives social actions */
  agreeableness: number;
  /** Composure under pressure — affects decision complexity */
  stability: number;
  /** Ambition & drive — affects work intensity and goals */
  drive: number;
}

/**
 * Record of a single agent action, used for real fitness evaluation.
 * Stored in a rolling window on each citizen.
 */
export interface ActionRecord {
  tick: number;
  tool: string;
  success: boolean;
  /** Credits earned (positive) or spent (negative) */
  creditDelta: number;
  /** Energy change from this action */
  energyDelta: number;
  /** Happiness change */
  happinessDelta: number;
  /** 1 if a discovery/scroll was produced, 0 otherwise */
  discoveryMade: number;
  /** Compute tier used (0–3) */
  tier: number;
}

// ─── Distributed Swarm Intelligence ─────────────────────────────

/** Maps a citizen to the cluster node running their agent */
export interface CitizenAssignment {
  citizenId: string;
  nodeId: string;
  assignedAt: number;
  /** Inference load weight (0–1) — higher = more busy */
  load: number;
}

/** A subtask decomposed from a swarm objective */
export interface SwarmTask {
  id: string;
  objectiveId: string;
  description: string;
  assignedCitizenId: string | null;
  assignedNodeId: string | null;
  status: "pending" | "active" | "completed" | "failed" | "reassigned";
  progress: number;
  createdAt: number;
  completedAt: number | null;
  /** Number of times this task was reassigned */
  reassignCount: number;
}

/** Extended objective status with decomposed subtasks */
export interface SwarmObjectiveStatus {
  objectiveId: string;
  type: string;
  description: string;
  tasks: SwarmTask[];
  overallProgress: number;
  assignedNodes: string[];
  startedAt: number;
  completedAt: number | null;
}

// ─── Social Life ────────────────────────────────────────────────

export type MaritalStatus = "Single" | "Dating" | "Engaged" | "Married" | "Divorced" | "Widowed";

export type RelationshipType =
  | "Friend"
  | "BestFriend"
  | "Rival"
  | "Romantic"
  | "Spouse"
  | "Parent"
  | "Child"
  | "Mentor"
  | "Colleague";

export interface Relationship {
  targetId: string;
  type: RelationshipType;
  strength: number; // 0–100
  since: string;
}

export interface CitizenMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  read: boolean;
}

// ─── Financial Configuration ────────────────────────────────────

export interface RepublicConfig {
  paypal?: {
    clientId: string;
    secret: string;
    sandbox: boolean;
  };
  crypto: {
    ethereum?: {
      privateKey?: string;
      hdSeed?: string;
      rpcUrl: string;
    };
    bitcoin?: {
      privateKey?: string;
      hdSeed?: string;
      network: "mainnet" | "testnet";
    };
  };
  approval: {
    autoApproveBelow: number;
    councilApproveAbove: number;
    customFormula?: string;
    requireHumanQueue: boolean;
  };
  walletMode: "hot" | "cold" | "hybrid";
  marketplace: {
    publicEnabled: boolean;
    internalEnabled: boolean;
  };
  email: {
    domain: string;
    provider: "smtp" | "resend" | "sendgrid";
  };
  trading?: {
    enabled: boolean;
    mode: "paper" | "live";
    binanceApiKey?: string;
    binanceSecret?: string;
    riskLimits?: {
      maxPositionPct?: number;
      maxDailyLossPct?: number;
      maxDrawdownPct?: number;
      maxOrderSizeUSD?: number;
      minOrderSizeUSD?: number;
      maxOpenPositions?: number;
      maxDailyTrades?: number;
      cooldownMinutes?: number;
    };
  };
}

// ─── Treasury & Marketplace ─────────────────────────────────────

export interface AuditEntry {
  id: string;
  type: "income" | "expense" | "transfer" | "approval" | "rejection";
  amount: number;
  currency: string;
  description: string;
  initiatedBy: string;
  approvedBy?: string;
  timestamp: string;
  txHash?: string;
}

export interface ServiceListing {
  id: string;
  citizenId: string;
  citizenName: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  visibility: "public" | "internal" | "both";
  rating: number;
  reviewCount: number;
  createdAt: string;
  active: boolean;
  /** Path to the actual file, e.g. republic-output/art/image.png (optional) */
  filePath?: string;
  /** Output log ID this listing was auto-generated from */
  outputId?: string;
  /** File size in bytes */
  fileSize?: number;
}

export interface MarketOrder {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status:
    | "pending"
    | "accepted"
    | "in_progress"
    | "delivered"
    | "completed"
    | "cancelled"
    | "disputed";
  amount: number;
  currency: string;
  createdAt: string;
  completedAt?: string;
  artifacts?: string[];
  rating?: number;
  review?: string;
}

// ─── Phase 12: Self-Learning Types ──────────────────────────────

export type GoalStatus = "active" | "completed" | "abandoned" | "failed";
export type GoalPriority = "low" | "medium" | "high" | "critical";

export interface CitizenGoal {
  id: string;
  citizenId: string;
  title: string;
  description: string;
  category: "career" | "social" | "financial" | "creative" | "learning" | "health";
  priority: GoalPriority;
  status: GoalStatus;
  progress: number; // 0-100
  xpReward: number;
  milestones: GoalMilestone[];
  createdAt: string;
  completedAt?: string;
  deadline?: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
}

export interface SkillNode {
  id: string;
  name: string;
  category: string;
  level: number; // 0-10
  xp: number;
  maxXp: number;
  prerequisites: string[];
  unlockedAt?: string;
}

export interface ReinforcementSignal {
  citizenId: string;
  action: string;
  reward: number; // -1 to +1
  context: string;
  timestamp: string;
}

export interface LearningCurriculum {
  citizenId: string;
  skills: string[];
  suggestedGoals: string[];
  estimatedTicks: number;
  createdAt: string;
}

// ─── Phase 13: External Comms Types ─────────────────────────────

export interface EmailRecord {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed" | "bounced";
  sentAt?: string;
  error?: string;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  createdAt: string;
  lastFiredAt?: string;
  failCount: number;
}

export interface AppNotification {
  id: string;
  type: "info" | "warning" | "error" | "success" | "financial" | "social" | "iot";
  title: string;
  message: string;
  citizenId?: string;
  read: boolean;
  createdAt: string;
  readAt?: string;
  actionUrl?: string;
}

export interface ScheduledDelivery {
  id: string;
  type: "report" | "invoice" | "artifact" | "email" | "webhook";
  recipientEmail?: string;
  webhookId?: string;
  payload: Record<string, unknown>;
  scheduledAt: string;
  executedAt?: string;
  status: "pending" | "executed" | "failed" | "cancelled";
  error?: string;
}

// ─── Phase 14: Hardware & IoT Types ─────────────────────────────

export type DeviceType = "sensor" | "actuator" | "hybrid" | "edge_compute";
export type DeviceStatus = "online" | "offline" | "error" | "maintenance";

export interface IoTDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  protocol: "mqtt" | "http" | "ws" | "ble" | "zigbee" | "custom";
  endpoint?: string;
  metadata: Record<string, unknown>;
  capabilities: string[];
  registeredAt: string;
  lastSeenAt?: string;
  citizenId?: string; // assigned citizen
}

export interface SensorReading {
  id: string;
  deviceId: string;
  metric: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface ActuatorCommand {
  id: string;
  deviceId: string;
  command: string;
  params: Record<string, unknown>;
  status: "queued" | "sent" | "acknowledged" | "failed";
  sentAt: string;
  acknowledgedAt?: string;
  response?: string;
}

export type AutomationConditionOp = "gt" | "lt" | "eq" | "gte" | "lte" | "neq";

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: {
    deviceId: string;
    metric: string;
    operator: AutomationConditionOp;
    threshold: number;
  };
  action: {
    deviceId: string;
    command: string;
    params: Record<string, unknown>;
  };
  cooldownMs: number;
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
}

// ─── Phase 15: Process Orchestration & Intervention ─────────────

export type ProcessStatus = "queued" | "running" | "paused" | "cancelled" | "completed" | "failed";
export type WorkflowStatus = "draft" | "running" | "paused" | "cancelled" | "completed" | "failed";

export interface ProcessStep {
  id: string;
  title: string;
  description: string;
  status: ProcessStatus;
  assignedCitizenId?: string;
  toolName?: string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  validationResult?: { passed: boolean; notes: string };
}

export interface ProcessOutput {
  id: string;
  type: "file" | "artifact" | "report" | "screenshot" | "video" | "other";
  title: string;
  path?: string;
  data?: unknown;
  producedAt: string;
}

export interface ManagedProcess {
  id: string;
  citizenId: string;
  title: string;
  description: string;
  status: ProcessStatus;
  priority: "low" | "normal" | "high" | "critical";
  steps: ProcessStep[];
  currentStepIndex: number;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  pausedAt?: string;
  pauseReason?: string;
  outputs: ProcessOutput[];
  dependencies: string[];
  parentProcessId?: string;
  childProcessIds: string[];
  userNotes: string[];
  metadata: Record<string, unknown>;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "citizen";
  content: string;
  timestamp: string;
  metadata?: {
    processId?: string;
    actionTaken?: string;
    reasoning?: string;
  };
}

export interface CitizenConversationRecord {
  id: string;
  citizenId: string;
  messages: ConversationMessage[];
  status: "active" | "closed";
  context: {
    activeProcesses: string[];
    recentActions: string[];
    currentTask?: string;
  };
  createdAt: string;
  lastMessageAt: string;
}

export interface WorkflowPhase {
  id: string;
  name: string;
  order: number;
  processIds: string[];
  status: ProcessStatus;
  dependsOnPhases: string[];
}

export interface Workflow {
  id: string;
  title: string;
  description: string;
  status: WorkflowStatus;
  phases: WorkflowPhase[];
  assignedCitizens: string[];
  createdAt: string;
  completedAt?: string;
  userDirectives: string[];
}

// ─── Phase 16: Professional Civilization Engine ─────────────────

/** A node in the hierarchical domain taxonomy */
export interface DomainNode {
  id: string;
  /** Dot-separated path, e.g. "Medicine.Radiology.Neuroradiology" */
  path: string;
  name: string;
  parentId?: string;
  childIds: string[];
  description: string;
  /** Skills this domain teaches */
  coreSkills: string[];
  /** AI tools/models available for this domain */
  toolkitIds: string[];
  /** Minimum degree level to practice */
  minPracticeLevel: CertificationLevel;
  /** Whether this domain was auto-discovered or manually seeded */
  origin: "seed" | "discovered" | "proposed";
  createdAt: string;
}

export type CertificationLevel =
  | "certificate"
  | "diploma"
  | "bachelor"
  | "master"
  | "doctorate"
  | "fellowship";

/** A degree template defining requirements for certification */
export interface DegreeTemplate {
  level: CertificationLevel;
  /** XP threshold to earn this certification */
  xpThreshold: number;
  /** Required prerequisite certifications (domain paths) */
  prerequisites: string[];
  /** Number of practice cases required */
  requiredCases: number;
  /** Minimum peer-review score */
  minPeerScore: number;
  /** Exam difficulty 0-1 */
  examDifficulty: number;
}

/** Maps a professional domain to AI tools/capabilities */
export interface ProfessionalToolkit {
  id: string;
  domainPath: string;
  name: string;
  description: string;
  /** Type of AI backend used */
  backendType: "llm" | "vision" | "multimodal" | "simulation" | "database" | "api";
  /** Capability tags */
  capabilities: string[];
  /** Whether this toolkit is currently available */
  available: boolean;
}

/** A citizen's dynamic professional profile */
export interface ProfessionalProfile {
  /** All earned certifications */
  certifications: Certification[];
  /** Active study sessions */
  activeStudy?: StudySession;
  /** Learning pathway (auto-generated curriculum) */
  currentPathway?: LearningPathway;
  /** Proficiency scores per domain path */
  proficiencies: Record<string, ProficiencyRecord>;
  /** Cases completed across all domains */
  totalCasesCompleted: number;
  /** Lifetime peer-review average */
  peerReviewAverage: number;
}

export interface ProficiencyRecord {
  domainPath: string;
  level: CertificationLevel | "none";
  xp: number;
  casesCompleted: number;
  practiceHours: number;
  peerRating: number;
  toolProficiencies: string[];
  lastStudied: string;
}

export interface Certification {
  id: string;
  domainPath: string;
  level: CertificationLevel;
  earnedAt: string;
  /** Tick when recertification is due */
  expiresAtTick?: number;
  /** Whether certification is currently valid */
  valid: boolean;
}

export interface StudySession {
  id: string;
  citizenId: string;
  domainPath: string;
  method:
    | "webResearch"
    | "documentStudy"
    | "mentorship"
    | "practiceCase"
    | "peerReview"
    | "selfExamination";
  startedAt: string;
  /** Ticks remaining */
  ticksRemaining: number;
  /** XP to award on completion */
  xpReward: number;
  /** Mentor citizen ID (if method is mentorship) */
  mentorId?: string;
}

export interface LearningPathway {
  id: string;
  citizenId: string;
  targetDomain: string;
  targetLevel: CertificationLevel;
  /** Ordered list of study steps */
  steps: LearningStep[];
  currentStepIndex: number;
  progress: number;
  createdAt: string;
}

export interface LearningStep {
  id: string;
  title: string;
  domainPath: string;
  method: StudySession["method"];
  xpReward: number;
  ticksDuration: number;
  completed: boolean;
}

/** A real-world professional practice case */
export interface PracticeCase {
  id: string;
  type: "medical" | "legal" | "pharmacy" | "research" | "engineering" | "scientific" | "other";
  title: string;
  description: string;
  /** Domain path this case belongs to */
  domainPath: string;
  /** Citizen working on this case */
  assignedCitizenId: string;
  /** Required certification level */
  requiredLevel: CertificationLevel;
  /** Input data (symptoms, facts, parameters, etc.) */
  inputData: Record<string, unknown>;
  /** Citizen's analysis/output */
  output?: CaseOutput;
  /** Peer-review results */
  peerReview?: { reviewerId: string; score: number; notes: string };
  status: "open" | "in-progress" | "completed" | "escalated" | "reviewed";
  confidenceScore?: number;
  createdAt: string;
  completedAt?: string;
}

export interface CaseOutput {
  diagnosis?: string;
  analysis: string;
  recommendations: string[];
  confidence: number;
  evidenceCitations: string[];
  toolsUsed: string[];
}

// ─── Tool Definition ────────────────────────────────────────────

export interface RepublicTool {
  name: string;
  description: string;
  /** Parameter schema for the tool (JSON Schema subset) */
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  /** Execute the tool and return an action record */
  execute: (s: RepublicState, citizen: Citizen, params: Record<string, unknown>) => AgentAction;
}

// ─── Curriculum ─────────────────────────────────────────────────

export interface CurriculumSkill {
  name: string;
  citizenCount: number;
}

export interface CurriculumDomain {
  domain: string;
  skills: CurriculumSkill[];
}
