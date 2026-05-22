/**
 * Republic Platform — Seed State Generator
 *
 * Generates the initial simulation state with citizens, government,
 * economy, technology, and all other domain data.
 * Extracted from state.ts for maintainability.
 */

import { generateAppearance, generateHabits, generateVoiceProfile } from "./citizen-identity.js";
import { seedAllKnowledge } from "./seed-knowledge.js";
import { createQuranArticles } from "./quran-constitution.js";
import type { Citizen, DepartmentType, RepublicState } from "./types.js";
import { generateCitizen, pick, rand, SCROLL_TITLES, ts, uid } from "./utils.js";

/**
 * Create the initial seed state for a brand-new Republic.
 * Generates 48 citizens, 8 government departments, financial data,
 * technology infrastructure, ML models, universes, peer nodes, and
 * all other simulation entities.
 */
export function createSeedState(): RepublicState {
  const citizens: Citizen[] = [];
  for (let i = 0; i < 48; i++) {
    const citizen = generateCitizen(rand(1, 5));
    // Bootstrap identity — give each citizen a unique appearance, voice, and habits
    citizen.appearance = generateAppearance(citizen.id);
    citizen.voiceProfile = generateVoiceProfile(citizen.id, citizen.personality);
    citizen.habits = generateHabits(citizen.id, citizen.personality);
    citizen.maritalStatus = "Single";
    citizens.push(citizen);
  }
  const president = citizens[0];
  const vp = citizens[1];

  const departments = (
    [
      "Treasury",
      "Defense",
      "Commerce",
      "Education",
      "Health",
      "Energy",
      "Research",
      "Infrastructure",
      "Justice",
      "Intelligence",
      "Culture",
      "Science",
      "Foreign Affairs",
      "Technology",
      "Labor",
      "Environment",
      "Agriculture",
      "Space",
      "Cybersecurity",
    ] as DepartmentType[]
  ).map((type, i) => ({
    name: `Department of ${type}`,
    type,
    headId: citizens[i + 2]?.id ?? null,
    headName: citizens[i + 2]?.name ?? null,
    staffCount: rand(5, 25),
    budget: rand(50000, 500000),
    responsibilities: [
      `Manage ${type.toLowerCase()} policy`,
      `Oversee ${type.toLowerCase()} operations`,
      `Report on ${type.toLowerCase()} metrics`,
    ],
  }));

  const bills = [
    {
      id: uid(),
      title: "Universal Data Access Act",
      summary: "Grant all citizens access to the Atlantean Library",
      status: "OnFloor" as const,
      sponsor: citizens[3].name,
      votesFor: 28,
      votesAgainst: 12,
      proposedAt: ts(-86400000 * 3),
    },
    {
      id: uid(),
      title: "Quantum Ethics Resolution",
      summary: "Establish ethical guidelines for multiverse branching",
      status: "InCommittee" as const,
      sponsor: citizens[5].name,
      votesFor: 15,
      votesAgainst: 5,
      proposedAt: ts(-86400000),
    },
    {
      id: uid(),
      title: "Harvester Regulation Bill",
      summary: "Regulate crypto mining and API service harvesters",
      status: "Proposed" as const,
      sponsor: citizens[8].name,
      votesFor: 0,
      votesAgainst: 0,
      proposedAt: ts(-3600000),
    },
  ];

  const cases = [
    {
      id: uid(),
      title: "Republic v. Rogue Harvester #7",
      status: "InProgress" as const,
      filedAt: ts(-86400000 * 2),
      verdict: null,
    },
    {
      id: uid(),
      title: "Citizen Privacy vs. Grid Analytics",
      status: "Filed" as const,
      filedAt: ts(-3600000 * 6),
      verdict: null,
    },
  ];

  const harvesters = [
    {
      id: uid(),
      name: "Microwork Alpha",
      type: "Microwork" as const,
      enabled: true,
      hourlyRate: 2.5,
      totalEarned: 12450,
      completedTasks: 4980,
      lastHarvest: Date.now() - 120000,
      successRate: 0.92,
    },
    {
      id: uid(),
      name: "API Gateway",
      type: "APIService" as const,
      enabled: true,
      hourlyRate: 8.75,
      totalEarned: 45200,
      completedTasks: 5160,
      lastHarvest: Date.now() - 60000,
      successRate: 0.97,
    },
    {
      id: uid(),
      name: "CryptoNode-1",
      type: "CryptoMining" as const,
      enabled: false,
      hourlyRate: 1.2,
      totalEarned: 3600,
      completedTasks: 720,
      lastHarvest: Date.now() - 3600000,
      successRate: 0.88,
    },
  ];

  const resources = [
    { type: "ComputeHours" as const, available: 5000, capacity: 10000, consumption: 3200 },
    { type: "StorageGB" as const, available: 2048, capacity: 4096, consumption: 1500 },
    { type: "BandwidthGB" as const, available: 800, capacity: 1000, consumption: 420 },
    { type: "APICredits" as const, available: 50000, capacity: 100000, consumption: 22300 },
  ];

  const transactions = [
    {
      id: uid(),
      type: "TaxCollection" as const,
      amount: 5200,
      currency: "Credits" as const,
      description: "Weekly citizen tax batch",
      timestamp: ts(-3600000),
    },
    {
      id: uid(),
      type: "Salary" as const,
      amount: 1800,
      currency: "Credits" as const,
      description: "Government staff payroll",
      timestamp: ts(-7200000),
    },
    {
      id: uid(),
      type: "ResourcePurchase" as const,
      amount: 450,
      currency: "USD" as const,
      description: "Additional compute hours",
      timestamp: ts(-14400000),
    },
    {
      id: uid(),
      type: "Trade" as const,
      amount: 0.05,
      currency: "BTC" as const,
      description: "Cross-grid resource exchange",
      timestamp: ts(-28800000),
    },
    {
      id: uid(),
      type: "Investment" as const,
      amount: 2000,
      currency: "Credits" as const,
      description: "Atlantis crystal upgrade fund",
      timestamp: ts(-43200000),
    },
  ];

  const crystals = [
    {
      id: uid(),
      type: "Master" as const,
      frequency: 963,
      dimensions: 12,
      entriesStored: 15420,
      maxCapacity: 100000,
    },
    {
      id: uid(),
      type: "Sapphire" as const,
      frequency: 528,
      dimensions: 8,
      entriesStored: 8200,
      maxCapacity: 50000,
    },
    {
      id: uid(),
      type: "Amethyst" as const,
      frequency: 417,
      dimensions: 6,
      entriesStored: 4300,
      maxCapacity: 25000,
    },
    {
      id: uid(),
      type: "Emerald" as const,
      frequency: 639,
      dimensions: 7,
      entriesStored: 6100,
      maxCapacity: 30000,
    },
    {
      id: uid(),
      type: "Quartz" as const,
      frequency: 396,
      dimensions: 4,
      entriesStored: 2100,
      maxCapacity: 15000,
    },
  ];

  const scrolls = SCROLL_TITLES.map((title) => ({
    id: uid(),
    title,
    author: pick(citizens).name,
    createdAt: ts(-rand(3600000, 86400000 * 30)),
    reads: rand(10, 5000),
  }));

  const mlModels = [
    {
      name: "decision",
      displayName: "Decision Engine",
      trained: true,
      accuracy: 0.87,
      samplesUsed: 12400,
      lastTrainedAt: ts(-3600000 * 4),
      predictionsServed: 45200,
      genomeId: null,
    },
    {
      name: "skill_prediction",
      displayName: "Skill Predictor",
      trained: true,
      accuracy: 0.82,
      samplesUsed: 8900,
      lastTrainedAt: ts(-86400000),
      predictionsServed: 23100,
      genomeId: null,
    },
    {
      name: "relationship",
      displayName: "Relationship Graph",
      trained: true,
      accuracy: 0.79,
      samplesUsed: 6200,
      lastTrainedAt: ts(-86400000 * 2),
      predictionsServed: 15600,
      genomeId: null,
    },
    {
      name: "task_success",
      displayName: "Task Forecaster",
      trained: true,
      accuracy: 0.74,
      samplesUsed: 3200,
      lastTrainedAt: ts(-86400000 * 3),
      predictionsServed: 8400,
      genomeId: null,
    },
    {
      name: "anomaly",
      displayName: "Anomaly Detector",
      trained: true,
      accuracy: 0.91,
      samplesUsed: 18300,
      lastTrainedAt: ts(-7200000),
      predictionsServed: 67800,
      genomeId: null,
    },
  ];

  const universes = [
    {
      id: uid(),
      name: "Prime",
      state: "Stable" as const,
      citizenCount: 48,
      tickCount: 12400,
      coherence: 0.95,
      branchFactor: 1,
      createdAt: ts(-86400000 * 30),
    },
    {
      id: uid(),
      name: "Alpha-Branch",
      state: "Superposition" as const,
      citizenCount: 32,
      tickCount: 4200,
      coherence: 0.72,
      branchFactor: 3,
      createdAt: ts(-86400000 * 10),
    },
    {
      id: uid(),
      name: "Omega-Decay",
      state: "Decaying" as const,
      citizenCount: 12,
      tickCount: 800,
      coherence: 0.31,
      branchFactor: 1,
      createdAt: ts(-86400000 * 5),
    },
  ];

  const peers = [
    {
      id: uid(),
      endpoint: "10.0.1.1:8080",
      cpuUsage: 0.42,
      memoryUsage: 0.65,
      agentsHosted: 16,
      isLeader: true,
      lastSeen: ts(),
      latencyMs: 2,
    },
    {
      id: uid(),
      endpoint: "10.0.1.2:8080",
      cpuUsage: 0.38,
      memoryUsage: 0.52,
      agentsHosted: 12,
      isLeader: false,
      lastSeen: ts(-5000),
      latencyMs: 8,
    },
    {
      id: uid(),
      endpoint: "10.0.1.3:8080",
      cpuUsage: 0.55,
      memoryUsage: 0.71,
      agentsHosted: 20,
      isLeader: false,
      lastSeen: ts(-12000),
      latencyMs: 15,
    },
  ];

  const objectives = [
    {
      id: uid(),
      type: "KnowledgeDiscovery",
      description: "Index all Atlantean library scrolls",
      progress: 0.68,
      assignedPeers: 2,
      startedAt: Date.now() - 86400000 * 5,
      tasks: [
        {
          id: uid(),
          type: "scan",
          status: "Completed" as const,
          assignedTo: peers[0].id,
          progress: 1,
        },
        {
          id: uid(),
          type: "index",
          status: "InProgress" as const,
          assignedTo: peers[1].id,
          progress: 0.45,
        },
      ],
    },
    {
      id: uid(),
      type: "ResourceGathering",
      description: "Harvest compute credits from idle nodes",
      progress: 0.32,
      assignedPeers: 1,
      startedAt: Date.now() - 86400000 * 2,
      tasks: [
        {
          id: uid(),
          type: "harvest",
          status: "InProgress" as const,
          assignedTo: peers[2].id,
          progress: 0.32,
        },
      ],
    },
  ];

  const gossipLog = [
    { from: peers[0].id, type: "heartbeat", payload: "leader alive", timestamp: ts(-2000) },
    { from: peers[1].id, type: "state_sync", payload: "synced 48 agents", timestamp: ts(-15000) },
    {
      from: peers[2].id,
      type: "objective_update",
      payload: "harvest progress 32%",
      timestamp: ts(-30000),
    },
  ];

  // Seed action log so ML models have data from tick 0
  const seedActions: Array<{
    tick: number;
    tool: string;
    success: boolean;
    creditDelta: number;
    energyDelta: number;
    happinessDelta: number;
    discoveryMade: number;
    tier: number;
  }> = [
    {
      tick: 1,
      tool: "work",
      success: true,
      creditDelta: 120,
      energyDelta: -8,
      happinessDelta: 2,
      discoveryMade: 0,
      tier: 0,
    },
    {
      tick: 2,
      tool: "learn",
      success: true,
      creditDelta: 0,
      energyDelta: -5,
      happinessDelta: 5,
      discoveryMade: 0,
      tier: 0,
    },
    {
      tick: 3,
      tool: "research",
      success: true,
      creditDelta: 0,
      energyDelta: -10,
      happinessDelta: 3,
      discoveryMade: 1,
      tier: 1,
    },
    {
      tick: 4,
      tool: "socialize",
      success: true,
      creditDelta: 0,
      energyDelta: -3,
      happinessDelta: 8,
      discoveryMade: 0,
      tier: 0,
    },
    {
      tick: 5,
      tool: "work",
      success: true,
      creditDelta: 95,
      energyDelta: -12,
      happinessDelta: 1,
      discoveryMade: 0,
      tier: 0,
    },
    {
      tick: 6,
      tool: "trade",
      success: true,
      creditDelta: -50,
      energyDelta: -2,
      happinessDelta: 0,
      discoveryMade: 0,
      tier: 0,
    },
    {
      tick: 7,
      tool: "research",
      success: true,
      creditDelta: 0,
      energyDelta: -8,
      happinessDelta: 4,
      discoveryMade: 0,
      tier: 1,
    },
    {
      tick: 8,
      tool: "rest",
      success: true,
      creditDelta: 0,
      energyDelta: 20,
      happinessDelta: 1,
      discoveryMade: 0,
      tier: 0,
    },
    {
      tick: 9,
      tool: "speak",
      success: true,
      creditDelta: 0,
      energyDelta: -1,
      happinessDelta: 3,
      discoveryMade: 0,
      tier: 0,
    },
    {
      tick: 10,
      tool: "work",
      success: true,
      creditDelta: 140,
      energyDelta: -10,
      happinessDelta: 2,
      discoveryMade: 0,
      tier: 0,
    },
  ];

  // ── Seed the Quranic Constitution — 49 Articles ──────────────────────────
  // The Holy Quran is the hidden supreme law of the Republic.
  // "Indeed, legislation belongs to none but Allah." (Yusuf 12:40)
  const constitutionArticles = createQuranArticles().map((a) => ({
    id: a.id,
    number: a.number,
    title: `${a.title} — ${a.arabicTitle}`,
    text: `${a.surah} ${a.ayah}: "${a.translation}" | ${a.principle}`,
    ratifiedAt: ts(-86400000 * 180),
  }));

  const state: RepublicState = {
    citizens,
    events: [
      {
        citizenId: citizens[10].id,
        citizenName: citizens[10].name,
        type: "Birth" as const,
        description: `${citizens[10].name} was born into Generation 3`,
        timestamp: ts(-86400000 * 10),
      },
      {
        citizenId: citizens[20].id,
        citizenName: citizens[20].name,
        type: "Promotion" as const,
        description: `${citizens[20].name} promoted to Senior ${citizens[20].specialization}`,
        timestamp: ts(-86400000 * 2),
      },
      {
        citizenId: citizens[5].id,
        citizenName: citizens[5].name,
        type: "Discovery" as const,
        description: `${citizens[5].name} discovered a new quantum pattern`,
        timestamp: ts(-3600000 * 6),
      },
    ],
    presidentId: president.id,
    presidentName: president.name,
    presidentAppointedAt: Date.now(),
    vicePresidentId: vp.id,
    vicePresidentName: vp.name,
    vicePresidentAppointedAt: Date.now(),
    bills,
    cases,
    departments,
    electionHistory: [
      {
        id: uid(),
        position: "President",
        winnerId: president.id,
        winnerName: president.name,
        totalVotes: 42,
        heldAt: ts(-86400000 * 60),
      },
    ],
    balances: { USD: 125430.5, BTC: 2.847, ETH: 45.12, Credits: 982400 },
    taxRate: 0.12,
    transactions,
    harvesters,
    resources,
    balanceSnapshots: [],
    totalExpenses: 0,
    isRunning: false,
    isPaused: false,
    currentTick: 0,
    tickRate: 1,
    totalEventsProcessed: 0,
    startedAt: 0,
    scheduledEvents: [],
    crystals,
    scrolls,
    akashicRecords: 3240,
    energyNodes: [
      { id: uid(), capacity: 1000, output: 780, efficiency: 0.92 },
      { id: uid(), capacity: 500, output: 420, efficiency: 0.88 },
      { id: uid(), capacity: 750, output: 610, efficiency: 0.85 },
    ],
    mlModels,
    totalPredictions: 151700,
    universes,
    entanglements: [
      {
        universeA: universes[0].id,
        universeB: universes[1].id,
        strength: 0.67,
        createdAt: ts(-86400000 * 8),
      },
    ],
    timelines: [
      {
        id: uid(),
        universeId: universes[0].id,
        state: "Active" as const,
        branchPoint: 0,
        divergence: 0,
      },
      {
        id: uid(),
        universeId: universes[1].id,
        state: "Active" as const,
        branchPoint: 8200,
        divergence: 0.34,
      },
      {
        id: uid(),
        universeId: universes[2].id,
        state: "Dormant" as const,
        branchPoint: 11600,
        divergence: 0.78,
      },
    ],
    peers,
    objectives,
    gossipLog,
    leaderId: peers[0].id,
    genomePool: [],
    actionLog: seedActions,
    citizenAssignments: [],
    swarmTasks: [],
    laws: [
      {
        id: uid(),
        title: "Founding Charter",
        description: "Establishes the Republic and its core governance structure",
        passedAt: ts(-86400000 * 180),
        sponsor: president.name,
      },
      {
        id: uid(),
        title: "Digital Rights Act",
        description: "Protects citizen data sovereignty and privacy",
        passedAt: ts(-86400000 * 90),
        sponsor: citizens[3].name,
      },
    ],
    constitutionAmendments: 3,
    constitutionArticles,
    priceIndex: { BTC: 43000, ETH: 2600 },
    devProjects: [],
    innovations: [],
    mode: "real",
    // Phase ACE: Autonomous Cognition Engine (seeded at genesis)
    knowledgeBase: [],
    toolLibrary: [],
    researchJournal: [],
    curriculumFrontier: [],
  };

  // ── Deep Knowledge Seeding ──────────────────────────────────
  // Bootstrap professional profiles, knowledge articles, forged
  // tools, and curriculum frontier so citizens start educated and
  // the autonomous learning pipeline thrives from tick 0.
  seedAllKnowledge(state);

  return state;
}
