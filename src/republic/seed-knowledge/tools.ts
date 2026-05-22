/**
 * Seed Knowledge — Tool Seeds (static data)
 */

import type { ToolDefinition } from "../tool-executor.js";

export interface ToolSeed {
  name: string;
  description: string;
  domainPath: string;
  category: ToolDefinition["category"];
  tier: 1 | 2;
  code: string;
  params: Array<{ name: string; type: string; required: boolean; description: string }>;
}

export const TOOL_SEEDS: ToolSeed[] = [
  {
    name: "Clinical Diagnostic Analyzer",
    description:
      "Analyzes patient symptoms against disease databases to suggest differential diagnoses with confidence scores",
    domainPath: "Medicine",
    category: "computation",
    tier: 2,
    code: `function analyzeDiagnosis(symptoms, history) {\n  const matches = diseaseDB.query(symptoms);\n  return matches.map(m => ({\n    condition: m.name,\n    confidence: computeBayesian(m, history),\n    suggestedTests: m.confirmatory,\n  })).sort((a,b) => b.confidence - a.confidence);\n}`,
    params: [
      {
        name: "symptoms",
        type: "string[]",
        required: true,
        description: "List of presenting symptoms",
      },
      { name: "history", type: "object", required: false, description: "Patient medical history" },
    ],
  },
  {
    name: "Code Quality Scanner",
    description:
      "Static analysis tool that evaluates code quality metrics including complexity, duplication, and security vulnerabilities",
    domainPath: "Engineering.Software",
    category: "computation",
    tier: 1,
    code: `function scanCode(source, language) {\n  const metrics = {\n    complexity: computeCyclomaticComplexity(source),\n    duplication: findDuplicateBlocks(source),\n    vulnerabilities: runSecurityRules(source, language),\n    maintainability: computeMaintainabilityIndex(source),\n  };\n  return { score: weightedAverage(metrics), details: metrics };\n}`,
    params: [
      { name: "source", type: "string", required: true, description: "Source code to analyze" },
      { name: "language", type: "string", required: true, description: "Programming language" },
    ],
  },
  {
    name: "Data Pipeline Builder",
    description:
      "Generates ETL pipeline configurations from natural language specifications with automatic schema inference",
    domainPath: "Science.DataScience",
    category: "computation",
    tier: 2,
    code: `function buildPipeline(spec, sourceSchema) {\n  const stages = parsePipelineSpec(spec);\n  const schema = sourceSchema ?? inferSchema(spec.source);\n  return stages.map(s => ({\n    transform: s.type,\n    config: generateConfig(s, schema),\n    validation: genValidationRules(s),\n  }));\n}`,
    params: [
      { name: "spec", type: "object", required: true, description: "Pipeline specification" },
      {
        name: "sourceSchema",
        type: "object",
        required: false,
        description: "Optional source schema",
      },
    ],
  },
  {
    name: "Threat Modeling Assistant",
    description:
      "Analyzes system architecture diagrams to identify attack surfaces, threat vectors, and recommended mitigations",
    domainPath: "Cybersecurity",
    category: "computation",
    tier: 2,
    code: `function modelThreats(architecture) {\n  const surfaces = identifyAttackSurfaces(architecture);\n  const vectors = generateThreatVectors(surfaces);\n  return vectors.map(v => ({\n    threat: v.description,\n    severity: computeCVSS(v),\n    mitigations: suggestMitigations(v),\n    stride: classifySTRIDE(v),\n  }));\n}`,
    params: [
      {
        name: "architecture",
        type: "object",
        required: true,
        description: "System architecture description",
      },
    ],
  },
  {
    name: "Financial Model Backtester",
    description:
      "Backtests trading strategies against historical market data with risk metrics and drawdown analysis",
    domainPath: "Finance.Investment",
    category: "computation",
    tier: 2,
    code: `function backtest(strategy, data, config) {\n  const trades = simulateTrades(strategy, data);\n  return {\n    returns: computeReturns(trades),\n    sharpe: computeSharpe(trades),\n    maxDrawdown: computeDrawdown(trades),\n    winRate: trades.filter(t => t.pnl > 0).length / trades.length,\n  };\n}`,
    params: [
      {
        name: "strategy",
        type: "object",
        required: true,
        description: "Trading strategy definition",
      },
      { name: "data", type: "object", required: true, description: "Historical market data" },
    ],
  },
  {
    name: "Legal Document Analyzer",
    description:
      "Extracts key clauses, obligations, and risks from legal documents using NLP-based parsing",
    domainPath: "Law",
    category: "computation",
    tier: 1,
    code: `function analyzeDocument(doc, docType) {\n  const clauses = extractClauses(doc);\n  return {\n    obligations: clauses.filter(c => c.type === 'obligation'),\n    rights: clauses.filter(c => c.type === 'right'),\n    risks: identifyRisks(clauses, docType),\n    summary: generateSummary(clauses),\n  };\n}`,
    params: [
      { name: "doc", type: "string", required: true, description: "Document text" },
      { name: "docType", type: "string", required: true, description: "Type of legal document" },
    ],
  },
  {
    name: "Research Citation Tracker",
    description:
      "Tracks citation networks, computes h-index, and identifies emerging research trends from publication data",
    domainPath: "Science",
    category: "computation",
    tier: 1,
    code: `function trackCitations(publications) {\n  const graph = buildCitationGraph(publications);\n  return {\n    hIndex: computeHIndex(graph),\n    impactFactor: computeImpact(graph),\n    trends: identifyTrends(graph),\n    clusters: communityDetection(graph),\n  };\n}`,
    params: [
      {
        name: "publications",
        type: "object[]",
        required: true,
        description: "List of publications to analyze",
      },
    ],
  },
  {
    name: "Neural Architecture Search Engine",
    description:
      "Searches for optimal neural network architectures given task constraints using evolutionary strategies",
    domainPath: "Engineering.AI",
    category: "computation",
    tier: 2,
    code: `function searchArchitecture(task, constraints) {\n  let population = initPopulation(constraints);\n  for (let gen = 0; gen < constraints.maxGens; gen++) {\n    const fitness = evaluate(population, task);\n    population = evolve(population, fitness);\n  }\n  return population.sort((a,b) => b.fitness - a.fitness)[0];\n}`,
    params: [
      { name: "task", type: "object", required: true, description: "Task specification" },
      {
        name: "constraints",
        type: "object",
        required: true,
        description: "Architecture constraints",
      },
    ],
  },
  {
    name: "Ecosystem Health Monitor",
    description:
      "Analyzes biodiversity indicators, water quality, and habitat connectivity to assess ecosystem health",
    domainPath: "Science.Environmental.Conservation",
    category: "computation",
    tier: 1,
    code: `function monitorEcosystem(sensorData) {\n  return {\n    biodiversityIndex: computeShannon(sensorData.species),\n    waterQuality: analyzeWQI(sensorData.water),\n    habitatConnectivity: graphConnectivity(sensorData.corridors),\n    alerts: generateAlerts(sensorData),\n  };\n}`,
    params: [
      {
        name: "sensorData",
        type: "object",
        required: true,
        description: "Environmental sensor readings",
      },
    ],
  },
  {
    name: "Quantum Circuit Optimizer",
    description:
      "Optimizes quantum circuits by reducing gate count and depth through peephole optimization and routing",
    domainPath: "Science.QuantumComputing",
    category: "computation",
    tier: 2,
    code: `function optimizeCircuit(circuit, backend) {\n  let opt = decomposeToNative(circuit, backend);\n  opt = peepholeOptimize(opt);\n  opt = routeQubits(opt, backend.topology);\n  return {\n    circuit: opt,\n    gateReduction: (circuit.gates - opt.gates) / circuit.gates,\n    depthReduction: (circuit.depth - opt.depth) / circuit.depth,\n  };\n}`,
    params: [
      {
        name: "circuit",
        type: "object",
        required: true,
        description: "Quantum circuit to optimize",
      },
      {
        name: "backend",
        type: "object",
        required: true,
        description: "Target quantum hardware backend",
      },
    ],
  },
  {
    name: "Crop Disease Classifier",
    description:
      "Classifies crop diseases from leaf images using convolutional neural networks with treatment recommendations",
    domainPath: "Agriculture",
    category: "computation",
    tier: 1,
    code: `function classifyDisease(image, cropType) {\n  const features = extractFeatures(image);\n  const pred = diseaseModel.predict(features, cropType);\n  return {\n    disease: pred.label,\n    confidence: pred.score,\n    treatment: getTreatment(pred.label, cropType),\n    severity: assessSeverity(features),\n  };\n}`,
    params: [
      { name: "image", type: "string", required: true, description: "Base64-encoded leaf image" },
      { name: "cropType", type: "string", required: true, description: "Type of crop" },
    ],
  },
  {
    name: "Robotic Motion Planner",
    description:
      "Plans collision-free motion trajectories for robotic manipulators using sampling-based algorithms",
    domainPath: "Engineering.Robotics",
    category: "computation",
    tier: 2,
    code: `function planMotion(start, goal, obstacles) {\n  const tree = buildRRT(start, obstacles);\n  const path = connectToGoal(tree, goal);\n  return {\n    trajectory: smoothPath(path),\n    collisionFree: verifyPath(path, obstacles),\n    executionTime: estimateTime(path),\n    jointAngles: inverseKinematics(path),\n  };\n}`,
    params: [
      { name: "start", type: "object", required: true, description: "Start configuration" },
      { name: "goal", type: "object", required: true, description: "Goal configuration" },
      { name: "obstacles", type: "object[]", required: true, description: "Obstacle geometries" },
    ],
  },
  {
    name: "Psychometric Assessment Engine",
    description:
      "Administers and scores computerized adaptive psychometric assessments with normed comparisons",
    domainPath: "Humanities.Psychology",
    category: "computation",
    tier: 1,
    code: `function administer(test, responses) {\n  const irt = fitIRTModel(test, responses);\n  return {\n    abilityEstimate: irt.theta,\n    standardError: irt.se,\n    percentile: normLookup(irt.theta, test.norms),\n    subscales: computeSubscales(test, responses),\n  };\n}`,
    params: [
      { name: "test", type: "object", required: true, description: "Test specification" },
      { name: "responses", type: "object[]", required: true, description: "Participant responses" },
    ],
  },
  {
    name: "Musical Harmony Analyzer",
    description:
      "Analyzes harmonic progressions, identifies chord functions, and suggests voice leading improvements",
    domainPath: "Arts.Music",
    category: "computation",
    tier: 1,
    code: `function analyzeHarmony(score) {\n  const chords = extractChords(score);\n  return {\n    progression: romanNumeralAnalysis(chords),\n    cadences: identifyCadences(chords),\n    voiceLeading: analyzeVoiceLeading(chords),\n    suggestions: suggestImprovements(chords),\n  };\n}`,
    params: [
      {
        name: "score",
        type: "object",
        required: true,
        description: "Musical score representation",
      },
    ],
  },
  {
    name: "Urban Traffic Simulator",
    description:
      "Microsimulates urban traffic flow with signal timing optimization and congestion prediction",
    domainPath: "Design.UrbanPlanning.TransportPlanning",
    category: "computation",
    tier: 2,
    code: `function simulateTraffic(network, demand, duration) {\n  const sim = initMicrosim(network, demand);\n  const results = sim.run(duration);\n  return {\n    avgDelay: results.meanDelay,\n    congestionHotspots: results.hotspots,\n    optimalSignals: optimizeSignals(results),\n    co2Estimate: estimateEmissions(results),\n  };\n}`,
    params: [
      { name: "network", type: "object", required: true, description: "Road network graph" },
      { name: "demand", type: "object", required: true, description: "Travel demand matrix" },
      {
        name: "duration",
        type: "number",
        required: true,
        description: "Simulation duration in seconds",
      },
    ],
  },
  // ── Web Development Tools ──
  {
    name: "TypeScript API Scaffolder",
    description:
      "Generates type-safe REST or tRPC API scaffolds from Zod schemas, including route handlers, middleware, error types, and OpenAPI spec",
    domainPath: "Engineering.Software.TypeScript",
    category: "computation",
    tier: 2,
    code: `function scaffoldAPI(schema, options) {\n  const routes = generateRoutes(schema, options.framework);\n  const types = generateTypes(schema);\n  const middleware = generateMiddleware(options.auth, options.rateLimit);\n  const openapi = generateOpenAPI(schema, options.info);\n  return { routes, types, middleware, openapi, validation: 'zod' };\n}`,
    params: [
      {
        name: "schema",
        type: "object",
        required: true,
        description: "Zod schema definitions for API endpoints",
      },
      {
        name: "options",
        type: "object",
        required: false,
        description: "Framework (express/fastify/hono), auth strategy, rate limiting config",
      },
    ],
  },
  {
    name: "React Component Profiler",
    description:
      "Profiles React component render performance, detects unnecessary re-renders, measures Interaction to Next Paint, and suggests React Compiler optimizations",
    domainPath: "Engineering.Software.React",
    category: "computation",
    tier: 1,
    code: `function profileComponent(componentTree, interactions) {\n  const renders = traceRenders(componentTree);\n  const wasted = detectWastedRenders(renders);\n  const inp = measureINP(interactions);\n  return {\n    renderCount: renders.length,\n    wastedRenders: wasted,\n    inp,\n    suggestions: generateOptimizations(wasted, inp),\n    compilerCompatible: checkCompilerCompat(componentTree),\n  };\n}`,
    params: [
      {
        name: "componentTree",
        type: "object",
        required: true,
        description: "React component tree to profile",
      },
      {
        name: "interactions",
        type: "object[]",
        required: false,
        description: "User interaction traces for INP measurement",
      },
    ],
  },
  {
    name: "Node.js Performance Auditor",
    description:
      "Audits Node.js application performance: event loop lag, GC pressure, memory leaks, unhandled rejections, and stream backpressure issues",
    domainPath: "Engineering.Software.NodeJS",
    category: "computation",
    tier: 2,
    code: `function auditPerformance(metrics, config) {\n  const eventLoop = analyzeEventLoopLag(metrics.eventLoop);\n  const gc = analyzeGCPressure(metrics.gc);\n  const memory = detectMemoryLeaks(metrics.heapSnapshots);\n  const streams = analyzeBackpressure(metrics.streams);\n  return {\n    score: computeHealthScore(eventLoop, gc, memory, streams),\n    eventLoop, gc, memory, streams,\n    recommendations: generateRecommendations(eventLoop, gc, memory, streams),\n  };\n}`,
    params: [
      {
        name: "metrics",
        type: "object",
        required: true,
        description: "Node.js runtime metrics (event loop, GC, heap, streams)",
      },
      {
        name: "config",
        type: "object",
        required: false,
        description: "Threshold configuration for alerts",
      },
    ],
  },
  {
    name: "Full-Stack Architecture Analyzer",
    description:
      "Analyzes full-stack TypeScript/React/Node.js project architecture for anti-patterns, dependency cycles, bundle bloat, and server/client boundary violations",
    domainPath: "Engineering.Software",
    category: "computation",
    tier: 2,
    code: `function analyzeArchitecture(projectRoot) {\n  const deps = analyzeDependencyGraph(projectRoot);\n  const boundaries = checkServerClientBoundaries(projectRoot);\n  const bundles = analyzeBundleSize(projectRoot);\n  const cycles = detectCycles(deps);\n  return {\n    healthScore: computeScore(deps, boundaries, bundles, cycles),\n    cycles, boundaries, bundles,\n    antiPatterns: detectAntiPatterns(projectRoot),\n    suggestions: generateRefactoringSuggestions(deps, cycles, bundles),\n  };\n}`,
    params: [
      {
        name: "projectRoot",
        type: "string",
        required: true,
        description: "Root path of the full-stack project",
      },
    ],
  },
  {
    name: "Schema-Driven API Generator",
    description:
      "Generates complete tRPC or REST API from Prisma schema, including CRUD operations, validation, pagination, filtering, and TypeScript client SDK",
    domainPath: "Engineering.Software.NodeJS",
    category: "computation",
    tier: 2,
    code: `function generateAPI(prismaSchema, options) {\n  const models = parsePrismaSchema(prismaSchema);\n  const crud = generateCRUDRoutes(models, options.framework);\n  const validation = generateZodSchemas(models);\n  const client = generateTypedClient(models, options.transport);\n  return { crud, validation, client, pagination: 'cursor-based', auth: options.auth };\n}`,
    params: [
      { name: "prismaSchema", type: "string", required: true, description: "Prisma schema string" },
      {
        name: "options",
        type: "object",
        required: false,
        description: "Framework, transport (tRPC/REST), auth strategy",
      },
    ],
  },
  // ── 3D Game Engine Tools ──
  {
    name: "R3F Scene Profiler",
    description:
      "Profiles React Three Fiber scenes for draw calls, triangle count, texture memory, re-renders, and useFrame() cost — identifies optimization targets for hitting 60fps",
    domainPath: "Engineering.Software.GameDev.R3F",
    category: "computation" as const,
    tier: 2 as const,
    code: `function profileScene(canvas) {\n  const renderer = canvas.__r3f.gl;\n  const info = renderer.info;\n  const frameTimings = [];\n  const metrics = {\n    drawCalls: info.render.calls,\n    triangles: info.render.triangles,\n    textureMemory: info.memory.textures,\n    geometries: info.memory.geometries,\n    programs: info.programs.length,\n    bottleneck: identifyBottleneck(info),\n    suggestions: generateOptimizations(info, frameTimings),\n  };\n  return metrics;\n}`,
    params: [
      {
        name: "canvas",
        type: "HTMLCanvasElement",
        required: true,
        description: "R3F Canvas element to profile",
      },
    ],
  },
  {
    name: "Physics Debugger",
    description:
      "Visualizes RAPIER physics world state: collider shapes, contact points, joint constraints, velocity vectors, and sleeping bodies — essential for debugging physics-based gameplay",
    domainPath: "Engineering.Software.GameDev.Physics",
    category: "computation" as const,
    tier: 2 as const,
    code: `function debugPhysics(world) {\n  const bodies = world.bodies.getAll();\n  const colliders = world.colliders.getAll();\n  const contacts = world.narrowPhase.contactPairs();\n  return {\n    activeCount: bodies.filter(b => !b.isSleeping()).length,\n    sleepingCount: bodies.filter(b => b.isSleeping()).length,\n    contactPoints: contacts.map(c => c.contactManifolds()),\n    constraints: world.impulseJoints.getAll().length,\n    performance: { stepTime: world.integrationParameters.dt * 1000 },\n  };\n}`,
    params: [
      {
        name: "world",
        type: "object",
        required: true,
        description: "RAPIER physics world instance",
      },
    ],
  },
  {
    name: "Shader Composer",
    description:
      "Generates custom GLSL/TSL shaders from high-level descriptions: water, fire, shields, portals, dissolve effects — with automatic uniform binding and R3F integration",
    domainPath: "Engineering.Software.GameDev.Shaders",
    category: "computation" as const,
    tier: 2 as const,
    code: `function composeShader(effect, params) {\n  const template = EFFECT_TEMPLATES[effect];\n  const vertex = generateVertexShader(template, params);\n  const fragment = generateFragmentShader(template, params);\n  const uniforms = extractUniforms(template, params);\n  return { vertex, fragment, uniforms, r3fComponent: wrapAsR3FMaterial(vertex, fragment, uniforms) };\n}`,
    params: [
      {
        name: "effect",
        type: "string",
        required: true,
        description: "Effect type: water, fire, shield, portal, dissolve",
      },
      {
        name: "params",
        type: "object",
        required: false,
        description: "Effect parameters: color, speed, intensity",
      },
    ],
  },
  {
    name: "Animation Director",
    description:
      "Creates and validates animation state machines for 3D characters: defines states, transitions, blend trees, IK constraints, and exports as a reusable R3F hook",
    domainPath: "Engineering.Software.GameDev.Animation",
    category: "computation" as const,
    tier: 2 as const,
    code: `function directAnimation(config) {\n  const states = parseStates(config.states);\n  const transitions = validateTransitions(config.transitions, states);\n  const blendTrees = buildBlendTrees(config.blends);\n  const ikChains = setupIK(config.ik);\n  return {\n    stateMachine: buildHFSM(states, transitions),\n    blendTrees, ikChains,\n    hook: generateUseAnimationDirector(states, transitions, blendTrees, ikChains),\n  };\n}`,
    params: [
      {
        name: "config",
        type: "object",
        required: true,
        description: "Animation config: states, transitions, blends, IK",
      },
    ],
  },
  {
    name: "Multiplayer Architect",
    description:
      "Scaffolds complete Colyseus multiplayer rooms: defines state schema, message handlers, client prediction logic, matchmaking rules, and generates both server and client TypeScript code",
    domainPath: "Engineering.Software.GameDev.Multiplayer",
    category: "computation" as const,
    tier: 2 as const,
    code: `function architectMultiplayer(spec) {\n  const schema = generateColyseusSchema(spec.state);\n  const room = generateRoomClass(spec.handlers, spec.lifecycle);\n  const client = generateClientSDK(schema, spec.messages);\n  const prediction = generatePrediction(spec.predictedFields);\n  return { schema, room, client, prediction, docker: generateDockerCompose() };\n}`,
    params: [
      {
        name: "spec",
        type: "object",
        required: true,
        description: "Multiplayer spec: state shape, messages, lifecycle, matchmaking",
      },
    ],
  },
  // ── Phase 42 Integration: Aegis and Argus Forged Tools ──
  {
    name: "Network Convergence Radar",
    description:
      "Analyzes OSINT feeds to detect and prioritize emerging memetic convergences and threat anomalies.",
    domainPath: "Cybersecurity.Intelligence",
    category: "computation" as const,
    tier: 1 as const,
    code: `function scanConvergences(feeds) {\n  const signals = extractSignals(feeds);\n  const clusters = dbscanClustering(signals);\n  return clusters.map(c => ({\n    topic: c.center,\n    velocity: computeVelocity(c),\n    severity: c.size * c.intensity,\n    isThreat: checkThreatMatrix(c),\n  })).sort((a,b) => b.severity - a.severity);\n}`,
    params: [
      {
        name: "feeds",
        type: "string[]",
        required: true,
        description: "List of OSINT feed sources",
      },
    ],
  },
  {
    name: "Self-Healing Node Configurator",
    description:
      "Dynamically analyzes a node's telemetry to recommend or apply fault-isolation circuit breaker boundaries.",
    domainPath: "Engineering.Software.DevOps",
    category: "computation" as const,
    tier: 2 as const,
    code: `function configureNode(telemetry) {\n  const baseline = computeBaseline(telemetry);\n  const anomalies = detectSpikes(telemetry, baseline);\n  return {\n    recommendedState: anomalies.length > 3 ? "isolated" : "active",\n    maxHeapRecommended: computeSafeHeap(baseline),\n    circuitBreakers: autoConfigureBreakers(anomalies),\n    rationale: "Optimized for 99.999% uptime based on active jitter",\n  };\n}`,
    params: [
      {
        name: "telemetry",
        type: "object",
        required: true,
        description: "Node CPU/Heap/RPC telemetry data",
      },
    ],
  },
];
