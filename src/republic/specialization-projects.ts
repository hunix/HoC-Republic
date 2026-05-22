/**
 * Specialization-Aware Project Prompt Table
 *
 * Maps every citizen Specialization to a weighted list of concrete, ambitious
 * project prompts that are guaranteed to trigger the correct scaffold template
 * in real-execution.ts (3D game, e-commerce, AI dashboard, etc.).
 *
 * Used by:
 *  - citizen-prompt.ts  → injects a "Recommended Projects" section into the
 *    citizen's autonomous task prompt so the LLM picks appropriate work
 *  - real-execution.ts  → enriches free-form descriptions before template
 *    selection so keyword matches fire reliably
 */

import type { Specialization } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpecProjectSeed {
  /** Short human-readable label */
  title: string;
  /**
   * Full description passed to scaffold_project / build prompt.
   * Must contain the keywords that trigger the right template in
   * real-execution.ts (e.g. "3d game", "react three fiber", "fps", etc.)
   */
  prompt: string;
  /**
   * Relative weight. Higher = picked more often.
   * Use higher values for signature specialization projects.
   */
  weight: number;
}

// ─── The Table ──────────────────────────────────────────────────────────────

/**
 * For each specialization, a curated list of project seeds.
 * Seeds were chosen so that the keyword regex in selectScaffoldTemplate()
 * (real-execution.ts) fires for the correct archetype.
 */
export const SPECIALIZATION_PROJECTS: Partial<Record<Specialization, SpecProjectSeed[]>> & {
  _default: SpecProjectSeed[];
} = {

  // ── Developer / Engineer ─────────────────────────────────────────────────

  Developer: [
    { weight: 4, title: "3D Browser FPS",              prompt: "Build a 3d game — first-person shooter in the browser using react three fiber, rapier physics, postprocessing bloom, spatial audio, and zustand state. Include enemy AI, ammo system, and minimap HUD." },
    { weight: 3, title: "Multiplayer Physics Platformer",prompt: "Create a 3d platformer game with multiplayer via socket.io, react three fiber, @react-three/rapier physics, procedural level generation, GSAP animations, and a leaderboard." },
    { weight: 3, title: "AI-Powered SaaS Dashboard",   prompt: "Build an AI dashboard SaaS analytics platform with real-time charts, OpenAI API integration, Supabase auth, and React + Tailwind UI." },
    { weight: 2, title: "Full-Stack E-Commerce",        prompt: "Create a full-stack e-commerce shop with React storefront, Stripe checkout, Supabase Postgres, cart state, inventory management, and admin dashboard." },
    { weight: 2, title: "Real-Time Collaborative IDE",  prompt: "Build a real-time collaborative code editor with WebSocket sync, Monaco editor, syntax highlighting, live cursors, and Supabase presence." },
    { weight: 1, title: "Space Shooter WebGL",          prompt: "Build a space shooter 3d game using three.js / react three fiber with procedural asteroid fields, particle explosions, power-ups, and a global high-score board." },
  ],

  Engineer: [
    { weight: 4, title: "3D VR Space Station Simulator",prompt: "Build an immersive 3d scene / vr simulation of a space station interior using react three fiber @react-three/xr, PBR materials, dynamic lighting, ambient sound, and interactive control panels." },
    { weight: 3, title: "Physics Engineering Sandbox",  prompt: "Create an interactive 3d physics sandbox game using react three fiber, @react-three/rapier, with constraint joints, soft bodies, destructible structures, and a replay system." },
    { weight: 3, title: "Infrastructure Monitoring Dashboard", prompt: "Build an AI dashboard for infrastructure monitoring with real-time Prometheus metrics, alert rules, historical charts, and automated anomaly detection." },
    { weight: 2, title: "Node.js Microservices API",    prompt: "Build a typescript api with Hono, tRPC, Postgres, Docker multi-container orchestration, JWT auth, rate limiting, and OpenAPI docs." },
    { weight: 1, title: "Docker Orchestration UI",      prompt: "Create a fullstack Docker container management dashboard with real-time stats, log streaming, one-click deploy, and Portainer-style UI." },
  ],

  Architect: [
    { weight: 4, title: "3D Procedural City Builder",   prompt: "Build a 3d city builder game using react three fiber with procedural building generation, day/night cycle, road networks, citizen pathfinding, and economic simulation HUD." },
    { weight: 3, title: "Interactive Architecture Viewer", prompt: "Create a 3d scene / architectural visualization using react three fiber with realistic PBR materials, orbit camera, floor plan overlay, and room selector UI." },
    { weight: 3, title: "Design System Documentation Site", prompt: "Build a React website / documentation portal for a design system with live component previews, Storybook integration, and dark/light mode." },
    { weight: 2, title: "Cloud Architecture Diagrammer", prompt: "Build an AI dashboard for cloud architecture visualization with drag-and-drop nodes, live AWS cost estimation, and exportable Terraform." },
    { weight: 1, title: "Full-Stack CMS Platform",      prompt: "Create a fullstack headless CMS with React admin, Supabase Postgres, image uploads, role-based access, and a preview API." },
  ],

  Scientist: [
    { weight: 4, title: "Quantum Simulation Visualizer", prompt: "Build a 3d interactive visualization of quantum circuit simulation using react three fiber — qubits as 3d spheres on a Bloch sphere, entanglement arcs, GSAP state-change animations." },
    { weight: 3, title: "Molecular Dynamics Viewer",    prompt: "Create a 3d molecular dynamics simulation viewer with three.js — atom-bond rendering, rotation, van der Waals force arrows, and energy potential heatmap." },
    { weight: 3, title: "AI Research Dashboard",        prompt: "Build an AI analytics dashboard for scientific data — Plotly charts, hypothesis testing, dataset upload, automated statistical summary, and LLM-powered insight extraction." },
    { weight: 2, title: "Particle Physics Simulator",   prompt: "Build an interactive physics simulation / 3d scene of particle collisions using react three fiber with collision detection, energy readouts, and slow-motion replay." },
    { weight: 1, title: "Climate Model Analyzer",       prompt: "Build a data visualization dashboard for climate model outputs — animated global heatmaps, time-series charts, CO₂ trend forecasting, and anomaly alerts." },
  ],

  Researcher: [
    { weight: 4, title: "Knowledge Graph Explorer",     prompt: "Build a 3d interactive knowledge graph using react three fiber — nodes as 3d spheres, edges as tube meshes, force-directed layout, click-to-expand, full-text search overlay." },
    { weight: 3, title: "AI Literature Review Tool",    prompt: "Build an AI dashboard for academic research — PubMed RSS ingestion, GPT-powered summarization, citation network, and personalized reading queue." },
    { weight: 2, title: "Research Data Repository",     prompt: "Build a fullstack academic data repository with React UI, Supabase storage, DOI minting, peer review workflow, and public API." },
    { weight: 2, title: "Experiment Tracker SaaS",      prompt: "Create a SaaS analytics platform for scientific experiment tracking — hypothesis builder, versioned runs, metric comparison charts, and team collaboration." },
    { weight: 1, title: "Real-Time Signal Monitor",     prompt: "Build a real-time dashboard for biosignal monitoring (EEG/EMG) with WebSocket streaming, time-frequency analysis, and seizure detection alerts." },
  ],

  Artist: [
    { weight: 5, title: "Generative Art Studio",        prompt: "Build a 3d interactive generative art studio using react three fiber — ShaderMaterial GLSL shaders, mouse-driven particle fields, WebAudio visualization, download-as-PNG." },
    { weight: 4, title: "Immersive Art Gallery",         prompt: "Create a 3d walkable art gallery using react three fiber — first-person camera, framed artworks as textures, ambient lighting, and exhibit info overlay." },
    { weight: 3, title: "NFT Marketplace",              prompt: "Build a fullstack NFT marketplace with e-commerce checkout, React UI, Supabase Postgres, ERC-721 metadata viewer, and auction timer." },
    { weight: 2, title: "Pixel Art Game",               prompt: "Build a 2d pixel art game using three.js / react three fiber — tilemaps, sprite animations, collision, collectibles, and RPG combat overlay." },
    { weight: 1, title: "AI Art Generation UI",         prompt: "Build a React PWA app for AI art generation — prompt builder, style selector, Stable Diffusion API integration, gallery, and social share." },
  ],

  Musician: [
    { weight: 5, title: "3D Audio Visualizer",          prompt: "Build a 3d audio visualizer using react three fiber and Web Audio API — FFT frequency bars as 3d meshes, bloom postprocessing, BPM-synced animations, waveform ribbon." },
    { weight: 4, title: "WebAudio Synthesizer",         prompt: "Build a browser synthesizer / interactive app using Web Audio API — piano keyboard, oscillator types, ADSR envelope, reverb/delay effects, MIDI input support." },
    { weight: 3, title: "Music Production Dashboard",   prompt: "Build an AI dashboard for music production analytics — song structure visualizer, chord progression suggester, BPM analyzer, streaming platform stats." },
    { weight: 2, title: "Real-Time Collaborative DAW",  prompt: "Build a real-time collaborative digital audio workstation in the browser — WebSocket sync, multi-track timeline, sample library, and live jam sessions." },
    { weight: 1, title: "Concert Venue 3D Experience",  prompt: "Create a 3d immersive concert venue experience using react three fiber — crowd simulation, stage lighting rigs, speaker placement acoustics visualization." },
  ],

  Writer: [
    { weight: 4, title: "Interactive Fiction Engine",   prompt: "Build an interactive story / game using react three fiber and drei — 3d environments for each scene, text overlay, branching dialogue system, inventory, and save/load." },
    { weight: 4, title: "AI Writing Platform",          prompt: "Build a fullstack AI-assisted writing platform — React editor, Supabase Postgres, LLM autocomplete, version history, export to PDF/EPUB, and publishing workflow." },
    { weight: 3, title: "News Aggregator Dashboard",    prompt: "Build an AI dashboard for news aggregation — RSS ingestion, sentiment analysis, topic clustering, trending heatmap, and personalized digest email." },
    { weight: 2, title: "Blog Platform CMS",            prompt: "Build a Next.js website / blog CMS — MDX support, Supabase auth, comment system, SEO optimization, social preview cards, and RSS feed." },
    { weight: 1, title: "Book Club Social App",         prompt: "Create a fullstack social reading platform with React mobile PWA, real-time chat via WebSocket, book API integration, reading progress tracking, and ratings." },
  ],

  Doctor: [
    { weight: 4, title: "3D Human Anatomy Explorer",   prompt: "Build a 3d interactive anatomy viewer using react three fiber — organ meshes, click-to-inspect, MRI slice overlay, vitals dashboard, and condition highlighting." },
    { weight: 3, title: "Clinical Dashboard",           prompt: "Build an AI analytics dashboard for clinical data — patient timeline, lab result charts, drug interaction checker, real-time vitals monitoring, and alert rules." },
    { weight: 3, title: "Medical Records Platform",     prompt: "Build a fullstack electronic health records platform with React UI, Supabase Postgres, FHIR R4 API, role-based access (doctor/patient/admin), and audit trail." },
    { weight: 2, title: "Telemedicine App",             prompt: "Build a real-time telemedicine platform with WebRTC video, WebSocket chat, prescription builder, appointment scheduling, and Stripe billing." },
    { weight: 1, title: "Drug Discovery Visualizer",    prompt: "Create a 3d molecular docking visualization using react three fiber — protein mesh rendering, ligand binding site highlighting, affinity score overlay." },
  ],

  Psychologist: [
    { weight: 4, title: "Mental Health Tracker App",    prompt: "Build a React PWA mobile app for mental health tracking — mood journal with emotion wheels, CBT thought records, Supabase Realtime sync, and AI insight summaries." },
    { weight: 3, title: "Cognitive Assessment Platform", prompt: "Build a fullstack cognitive assessment SaaS — reaction time tests, working memory tasks, attention spans, AI-scored reports, and longitudinal trend charts." },
    { weight: 3, title: "3D Mind Map Visualization",    prompt: "Build a 3d interactive mind map using react three fiber — thought nodes as 3d spheres, connection arcs, force-directed physics, and drag-to-organize." },
    { weight: 2, title: "Behavior Analytics Dashboard", prompt: "Build an AI analytics dashboard for behavioral data — time-series mood charts, trigger correlation matrix, predictive risk scoring, and intervention recommendations." },
    { weight: 1, title: "VR Exposure Therapy Tool",     prompt: "Build a 3d vr scene for exposure therapy using @react-three/xr and react three fiber — progressive anxiety scenarios, biofeedback integration, and therapist override panel." },
  ],

  Strategist: [
    { weight: 5, title: "3D Real-Time Strategy Game",   prompt: "Build a real-time strategy game / 3d game using react three fiber — terrain generation, unit pathfinding, resource collection, fog of war, multiplayer via socket.io, and minimap." },
    { weight: 3, title: "War Theater Simulation",       prompt: "Create a 3d scene / military simulation in react three fiber — force movement on terrain, supply line visualization, morale/attrition stats, and commander HUD." },
    { weight: 3, title: "Business Intelligence Dashboard", prompt: "Build an AI dashboard for business intelligence — KPI scorecards, forecasting models, competitor tracking, market share charts, and executive summary." },
    { weight: 2, title: "Supply Chain Monitor",         prompt: "Build a real-time supply chain monitoring platform — live map with shipment tracking, delay alerts, inventory heatmaps, and AI disruption prediction." },
    { weight: 1, title: "Political Simulation Engine",  prompt: "Build a fullstack political simulation game — citizen population, approval ratings, policy levers, election mechanics, faction coalitions, and diplomatic events." },
  ],

  Analyst: [
    { weight: 4, title: "Financial Quant Dashboard",    prompt: "Build an AI analytics dashboard for quantitative finance — real-time Binance WebSocket feed, candlestick charts, technical indicators, backtesting engine, and alert system." },
    { weight: 3, title: "Geo Intelligence Map",         prompt: "Build a real-time geopolitical intelligence dashboard — world map with D3.js, event markers, news RSS overlay, country stability scores, and incident timeline." },
    { weight: 3, title: "OSINT Data Fusion Platform",   prompt: "Build a fullstack OSINT aggregation platform with React, Supabase Postgres, RSS crawler, entity extraction, network graph visualization, and threat scoring." },
    { weight: 2, title: "3D Data Visualization Globe",  prompt: "Build a 3d globe visualization using react three fiber and three.js — country choropleth, arc flight paths, event markers, time animation, and zoom-to-country." },
    { weight: 1, title: "Fraud Detection Dashboard",    prompt: "Build an AI SaaS analytics platform for fraud detection — transaction stream, anomaly heatmap, network graph of suspicious entities, and rule builder." },
  ],

  Diplomat: [
    { weight: 4, title: "3D Diplomacy Board Game",      prompt: "Build a diplomacy strategy board game / 3d game using react three fiber — territory control, negotiation system, alliance mechanics, movement orders, and turn resolution." },
    { weight: 3, title: "International Relations Tracker", prompt: "Build an AI dashboard for international relations tracking — country relationship matrix, treaty status, conflict timeline, and AI mediator recommendations." },
    { weight: 2, title: "Multilingual Translation Platform", prompt: "Build a real-time collaborative translation platform — WebSocket live sync, 40 language support, glossary management, Supabase Postgres, and export to XLIFF." },
    { weight: 2, title: "United Nations Simulation",    prompt: "Build a fullstack UN committee simulation game — delegate voting, resolution drafting, bloc formation, procedural amendments, and final vote tally animation." },
    { weight: 1, title: "Sanctions Intelligence Monitor", prompt: "Build an AI SaaS analytics dashboard for sanctions monitoring — entity screening against OFAC/EU lists, risk scoring, ownership graph, and compliance reports." },
  ],

  QuantumAlgorithmDesigner: [
    { weight: 5, title: "Quantum Circuit Simulator",    prompt: "Build a 3d interactive quantum circuit visualizer using react three fiber — qubit Bloch sphere rendering, gate drag-and-drop, Hadamard/CNOT/Toffoli gates, state probability histogram." },
    { weight: 3, title: "Quantum ML Dashboard",         prompt: "Build an AI analytics dashboard for quantum machine learning experiments — loss curves, qubit utilization, shot noise analysis, and circuit depth comparison." },
    { weight: 2, title: "Quantum Cryptography Simulator", prompt: "Build a real-time visualization of BB84 quantum key distribution using react three fiber — photon polarization, eavesdropper detection, key sifting, and QBER chart." },
  ],

  GenerativeAIArchitect: [
    { weight: 5, title: "AI Model Playground",          prompt: "Build a fullstack AI model playground SaaS — prompt editor, model comparison (GPT/Claude/Gemini), streaming responses, token usage charts, and saved preset library." },
    { weight: 4, title: "AI Agent Orchestration UI",    prompt: "Build a real-time AI multi-agent orchestration dashboard — agent graph visualization, task queue, live output streaming, tool call inspector, and performance analytics." },
    { weight: 3, title: "3D Neural Network Visualizer", prompt: "Build a 3d interactive neural network visualizer using react three fiber — layer nodes as spheres, weight edges with opacity, forward-pass animation, and gradient heatmap." },
    { weight: 2, title: "LLM Fine-Tuning Dashboard",   prompt: "Build an AI analytics SaaS dashboard for LLM fine-tuning — training loss curves, eval benchmarks, LoRA adapter comparison, dataset stats, and one-click export." },
    { weight: 1, title: "AI Store Marketplace",         prompt: "Build a fullstack AI model marketplace with e-commerce checkout, React UI, model cards, rating system, Supabase Postgres, and Stripe subscription billing." },
  ],

  BCISpecialist: [
    { weight: 5, title: "3D Brain-Computer Interface Visualizer", prompt: "Build a 3d real-time brain activity visualizer using react three fiber — EEG electrode spheres on a 3d head mesh, signal heatmap, frequency band filters, and WebSocket streaming." },
    { weight: 3, title: "Neural Signal Analysis Dashboard", prompt: "Build an AI analytics dashboard for neural signal analysis — real-time EEG/EMG charts, artifact rejection, P300 event detection, ERSP heatmap, and export to EDF." },
    { weight: 2, title: "Neurofeedback Training App",   prompt: "Build a React mobile PWA for neurofeedback training — WebBluetooth BLE device connection, live brainwave display, attention/meditation scores, and session history." },
  ],

  NeuroinformaticsEngineer: [
    { weight: 4, title: "3D Brain Connectome Explorer", prompt: "Build a 3d interactive connectome visualization using react three fiber — 86 brain regions as labeled spheres, fiber tract edges with thickness, community detection coloring, and atlas selector." },
    { weight: 3, title: "Neuroimaging Analysis Platform", prompt: "Build a fullstack neuroimaging analysis SaaS — NIfTI file upload, 3d brain viewer, voxel statistics, ROI drawing, Supabase storage, and report export." },
    { weight: 2, title: "Neural Population Simulator",  prompt: "Build an interactive 3d simulation of neural population dynamics using react three fiber — spiking neurons as point cloud, raster plot HUD, firing rate heatmap." },
  ],

  SynbioEngineer: [
    { weight: 4, title: "3D DNA Sequence Visualizer",   prompt: "Build a 3d interactive DNA double helix visualizer using react three fiber — base-pair tubes, codon coloring, restriction site markers, CRISPR cut animation." },
    { weight: 3, title: "Synthetic Biology Design Studio", prompt: "Build a fullstack synthetic biology circuit design tool — drag-and-drop gene parts (promoters, RBS, CDS, terminators), simulation preview, Supabase save, and GenBank export." },
    { weight: 2, title: "Protein Folding Dashboard",    prompt: "Build an AI analytics dashboard for protein folding — AlphaFold API integration, 3d structure viewer via three.js, RMSD comparison chart, and stability prediction." },
  ],

  HardwareTechnician: [
    { weight: 4, title: "IoT Device Management Dashboard", prompt: "Build a real-time IoT device management SaaS dashboard — WebSocket sensor feeds, device map with D3-geo, alert configuration, firmware OTA update queue, and time-series charts." },
    { weight: 3, title: "3D Circuit Board Explorer",    prompt: "Build a 3d interactive PCB visualization using react three fiber — component meshes, trace routing, signal path animation, thermal overlay, and inspection view." },
    { weight: 3, title: "Hardware Monitoring Platform", prompt: "Build a real-time hardware monitoring dashboard — CPU/GPU/RAM/disk metrics via WebSocket, alert rules, historical charts, and IPMI remote console." },
    { weight: 2, title: "Electronics E-Commerce Store", prompt: "Build a fullstack electronics marketplace / e-commerce shop with React, Supabase, component inventory, BOM builder, Stripe checkout, and distributor API integration." },
  ],

  AutonomousSystemsArchitect: [
    { weight: 5, title: "3D Autonomous Drone Simulation", prompt: "Build a 3d drone simulation game using react three fiber and @react-three/rapier — autonomous flight paths, obstacle avoidance, LiDAR point cloud visualization, mission planner UI." },
    { weight: 4, title: "Robotics Control Dashboard",   prompt: "Build a real-time robotics control center dashboard — WebSocket telemetry, joint state visualizer, path planning 3d overlay, mission logs, and emergency stop." },
    { weight: 3, title: "Self-Driving Car Simulator",   prompt: "Build a 3d self-driving car simulation using react three fiber — procedural road environment, sensor cone visualization (camera/lidar/radar), lane detection overlay, decision tree HUD." },
    { weight: 2, title: "Fleet Management Platform",    prompt: "Build a fullstack autonomous vehicle fleet management SaaS — live map, route optimization, maintenance scheduler, Supabase Postgres, and driver/passenger API." },
  ],

  Farmer: [
    { weight: 4, title: "3D Farm Management Simulation", prompt: "Build a 3d isometric farm simulation game using react three fiber — crop growth cycles, irrigation systems, weather events, market prices, equipment management, and season progression." },
    { weight: 3, title: "Precision Agriculture Dashboard", prompt: "Build an AI analytics dashboard for precision agriculture — drone imagery upload, NDVI vegetation index maps, soil moisture sensors, yield prediction, and pest alert system." },
    { weight: 2, title: "Crop Marketplace",             prompt: "Build a fullstack agricultural commodity marketplace / e-commerce platform — crop listings, real-time price feed, order matching, Supabase Postgres, and logistics tracking." },
  ],

  Mathematician: [
    { weight: 5, title: "3D Mathematical Visualization", prompt: "Build a 3d interactive mathematics visualization using react three fiber — 4D function surfaces, Mandelbrot/Julia set rendered as 3d height maps, parametric curves, and GLSL shader coloring." },
    { weight: 3, title: "Fractal Explorer WebGL",       prompt: "Build a WebGL fractal explorer using three.js / react three fiber — real-time Mandelbrot/Newton fractals via custom ShaderMaterial, zoom/pan, color palette editor, and export." },
    { weight: 3, title: "Theorem Proof Assistant",      prompt: "Build a fullstack mathematical theorem proof assistant — LaTex editor with live preview, Lean 4 verification API, collaborative proof tree, and Supabase Postgres." },
    { weight: 2, title: "Statistics Dashboard",         prompt: "Build an AI analytics platform for statistical analysis — dataset upload, descriptive stats, hypothesis testing, regression visualization, and R/Python code export." },
  ],

  // ── Default fallback ─────────────────────────────────────────────────────
  _default: [
    { weight: 3, title: "3D Space Exploration Game",    prompt: "Build a 3d space exploration game using react three fiber — procedural solar system, ship physics via @react-three/rapier, resource mining, trade routes, and ambient audio." },
    { weight: 3, title: "AI-Powered SaaS Dashboard",   prompt: "Build an AI SaaS analytics dashboard with Supabase, real-time charts, LLM insight generation, dark mode, and role-based access. Make it production-quality and beautiful." },
    { weight: 2, title: "Full-Stack E-Commerce",        prompt: "Create a fullstack e-commerce marketplace with React, Supabase Postgres, Stripe checkout, product catalog, cart, order tracking, and admin panel." },
    { weight: 2, title: "Real-Time Multiplayer Game",   prompt: "Build a 3d multiplayer game using react three fiber and socket.io — shared physics world, proximity chat, player inventory, map generation, and leaderboard." },
    { weight: 1, title: "Personal Portfolio Website",   prompt: "Build a stunning portfolio website using React / Vite — 3d hero section with react three fiber, glassmorphism cards, scroll animations with GSAP, and dark mode." },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pick N project seeds for a given specialization using weighted random selection.
 * Returns the selected seeds (deduped).
 */
export function pickProjectSeeds(
  specialization: string,
  count = 3,
  rng = Math.random,
): SpecProjectSeed[] {
  const pool =
    (SPECIALIZATION_PROJECTS[specialization as Specialization] ??
      SPECIALIZATION_PROJECTS._default)
      .slice(); // shallow copy so we can splice

  const selected: SpecProjectSeed[] = [];
  while (selected.length < count && pool.length > 0) {
    const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
    let rand = rng() * totalWeight;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i]!.weight;
      if (rand <= 0) { idx = i; break; }
    }
    selected.push(...pool.splice(idx, 1));
  }
  return selected;
}

/**
 * Build the prompt section injected into a citizen's autonomous task context.
 * The LLM sees this as "here are projects befitting your specialization"
 * and naturally picks the most interesting/appropriate one.
 */
export function buildSpecializationProjectSection(
  specialization: string,
  citizenName: string,
  count = 3,
): string {
  const seeds = pickProjectSeeds(specialization, count);
  if (seeds.length === 0) {return "";}

  const lines = [
    `## 🚀 Recommended Autonomous Projects for ${citizenName} (${specialization})`,
    ``,
    `You are free to choose any project that aligns with your specialization and interests.`,
    `Here are ${seeds.length} curated projects especially suited to a ${specialization}:`,
    ``,
    ...seeds.map((s, i) => `${i + 1}. **${s.title}**: ${s.prompt}`),
    ``,
    `Pick the one that excites you most, or propose a better one in the same domain.`,
    `When scaffolding, use the EXACT technology keywords from the chosen project description.`,
  ];

  return lines.join("\n");
}

/**
 * Enrich a free-form task description with specialization keywords so that
 * selectScaffoldTemplate() in real-execution.ts fires the right archetype.
 *
 * Called by executeScaffoldProject() BEFORE template selection.
 */
export function enrichProjectDescription(
  description: string,
  specialization: string,
): string {
  const spec = specialization.toLowerCase();
  const d = description.toLowerCase();

  // If already has strong template keywords, don't pollute
  const alreadyRich =
    /three\.?js|3d.?game|webgl|react.?three|rapier|fps|platformer|rts|vr|ar|\.tsx|scaffold|supabase|e.?commerce/.test(d);
  if (alreadyRich) {return description;}

  // Inject the most relevant keyword cluster for the specialization
  const enrichments: Partial<Record<string, string>> = {
    developer:    "using react three fiber and TypeScript — build a 3d game or full-stack web app",
    engineer:     "using react three fiber physics simulation or full-stack TypeScript API",
    architect:    "as a 3d architectural visualization or fullstack design system",
    scientist:    "as a 3d scientific visualization or AI analytics dashboard",
    researcher:   "as a 3d knowledge graph or AI-powered research SaaS platform",
    artist:       "as a 3d generative art studio using react three fiber and GLSL shaders",
    musician:     "as a 3d audio visualizer using react three fiber and Web Audio API",
    writer:       "as an interactive fiction 3d game or AI-powered writing platform",
    doctor:       "as a 3d human anatomy explorer or clinical AI analytics dashboard",
    psychologist: "as a 3d mind map or fullstack mental health AI SaaS platform",
    strategist:   "as a real-time strategy 3d game or business intelligence dashboard",
    analyst:      "as a 3d geo intelligence globe or AI financial analytics dashboard",
    diplomat:     "as a 3d diplomacy strategy game or international relations tracker",
    mathematician:"as a 3d mathematical visualization using three.js GLSL ShaderMaterial",
    farmer:       "as a 3d farm simulation game or precision agriculture AI dashboard",
    generativeaiarchitect: "as a fullstack AI playground SaaS or 3d neural network visualizer",
    quantumalgorithmdesigner: "as a 3d quantum circuit simulator using react three fiber",
    bcispeacialist:   "as a 3d brain EEG visualizer using react three fiber",
    hardwaretechnician: "as a real-time IoT dashboard or 3d PCB explorer",
    autonomoussystemsarchitect: "as a 3d autonomous drone simulation using react three fiber rapier",
  };

  const key = Object.keys(enrichments).find(k => spec.includes(k));
  if (key && enrichments[key]) {
    return `${description} — ${enrichments[key]}`;
  }

  // Generic enrichment for unknown specializations
  return `${description} — build it as an immersive 3d experience using react three fiber or a production-quality fullstack SaaS application`;
}
