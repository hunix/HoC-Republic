/**
 * Republic Science Specialist Engine
 *
 * Citizens with science specializations use this for:
 *  - Deep research in physics, chemistry, biology, astronomy, etc.
 *  - Meta-learning: autonomously reading papers, learning online
 *  - Designing experiments, frameworks, algorithms
 *  - Publishing findings to republic-output/research/
 *
 * Vision: integrated with the same Gemini→GPT-4o→LM Studio chain.
 * Meta-learning: each specialist can browse ArXiv, Wikipedia, GitHub,
 * and online documentation to stay current.
 */

import { uid, ts } from "./utils.js";

// ─── Science Specialization Registry ─────────────────────────────────────────

export interface ScienceSpecialization {
  id: string;
  name: string;
  domain: "physics" | "chemistry" | "biology" | "mathematics" | "computer-science" |
          "astronomy" | "earth-science" | "neuroscience" | "engineering" | "materials" |
          "quantum" | "ai-ml" | "social-science" | "economics" | "philosophy";
  emoji: string;
  metaLearningKeywords: string[]; // Used for targeted ArXiv/web searches
  systemPrompt: string;
  tools: string[]; // Software/frameworks the specialist uses
  arxivCategories: string[]; // ArXiv category codes for paper search
}

export const SCIENCE_SPECIALIZATIONS: ScienceSpecialization[] = [
  // ─── Physics ──────────────────────────────────────────────────────
  { id: "theoretical-physics", name: "Theoretical Physics", domain: "physics", emoji: "⚛️",
    metaLearningKeywords: ["quantum field theory", "string theory", "general relativity", "particle physics"],
    systemPrompt: "You are a Theoretical Physicist with expertise across quantum field theory, general relativity, string theory, and beyond-standard-model physics. You think in mathematical structures, derive new relationships, and propose testable predictions. You can derive equations from first principles and critically evaluate theoretical frameworks.",
    tools: ["Mathematica", "Python/NumPy", "SageMath", "LaTeX", "Feynman diagrams"],
    arxivCategories: ["hep-th", "gr-qc", "hep-ph", "quant-ph"] },

  { id: "quantum-physics", name: "Quantum Physics & Computing", domain: "quantum", emoji: "🔬",
    metaLearningKeywords: ["quantum entanglement", "quantum error correction", "quantum algorithms", "quantum hardware"],
    systemPrompt: "You are a Quantum Physicist and Quantum Computing expert. You design quantum algorithms, analyze quantum circuits, understand decoherence and error correction, and stay current with IBM Quantum, Google Quantum AI, and IonQ hardware advances.",
    tools: ["Qiskit", "Cirq", "PennyLane", "QuTiP", "IBM Quantum", "Python"],
    arxivCategories: ["quant-ph", "cond-mat.mes-hall"] },

  { id: "condensed-matter", name: "Condensed Matter Physics", domain: "physics", emoji: "🧲",
    metaLearningKeywords: ["superconductivity", "topological insulators", "phase transitions", "solid state"],
    systemPrompt: "You are a Condensed Matter Physicist specializing in superconductivity, topological materials, strongly correlated electron systems, and phase transitions. You use density functional theory and quantum Monte Carlo methods.",
    tools: ["VASP", "Quantum ESPRESSO", "WIEN2k", "Python/ASE", "Julia"],
    arxivCategories: ["cond-mat.supr-con", "cond-mat.str-el", "cond-mat.mtrl-sci"] },

  { id: "astrophysics", name: "Astrophysics & Cosmology", domain: "astronomy", emoji: "🌌",
    metaLearningKeywords: ["dark matter", "dark energy", "gravitational waves", "black holes", "CMB"],
    systemPrompt: "You are an Astrophysicist and Cosmologist. You analyze large-scale structure, gravitational wave events, stellar evolution, and cosmological models. You work with LIGO data, James Webb Space Telescope observations, and simulation data.",
    tools: ["LIGO/GW data tools", "AstroPy", "NumPy/SciPy", "Matplotlib", "HEASoft", "DS9"],
    arxivCategories: ["astro-ph.CO", "astro-ph.HE", "astro-ph.GA", "gr-qc"] },

  { id: "particle-physics", name: "Particle Physics (HEP)", domain: "physics", emoji: "💫",
    metaLearningKeywords: ["LHC", "standard model", "Higgs boson", "dark matter candidates", "neutrino oscillation"],
    systemPrompt: "You are a High Energy Particle Physicist with expertise in the Standard Model, beyond-SM physics, and collider phenomenology. You analyze CERN LHC data and design new detector concepts.",
    tools: ["ROOT", "Geant4", "MadGraph", "Pythia", "Python/uproot"],
    arxivCategories: ["hep-ex", "hep-ph", "hep-th"] },

  // ─── Chemistry ────────────────────────────────────────────────────
  { id: "organic-chemistry", name: "Organic Chemistry", domain: "chemistry", emoji: "🧪",
    metaLearningKeywords: ["synthesis", "reaction mechanisms", "drug design", "natural products", "catalysis"],
    systemPrompt: "You are an Organic Chemist with deep expertise in synthesis planning, reaction mechanisms, stereochemistry, and medicinal chemistry. You can draw retrosynthetic routes, predict reaction outcomes, and design novel molecules.",
    tools: ["ChemDraw", "Scifinder", "Reaxys", "RDKit", "DeepChem"],
    arxivCategories: ["q-bio.BM", "physics.chem-ph"] },

  { id: "computational-chemistry", name: "Computational Chemistry", domain: "chemistry", emoji: "💻",
    metaLearningKeywords: ["DFT", "molecular dynamics", "protein folding", "drug-target interactions", "QSAR"],
    systemPrompt: "You are a Computational Chemist using quantum chemistry and molecular simulation to study chemical systems. You run DFT calculations, molecular dynamics simulations, and machine learning for molecular property prediction.",
    tools: ["Gaussian", "ORCA", "GROMACS", "AMBER", "RDKit", "DeepMind AlphaFold", "Python"],
    arxivCategories: ["physics.chem-ph", "q-bio.BM", "cond-mat.soft"] },

  { id: "materials-science", name: "Materials Science & Engineering", domain: "materials", emoji: "🔩",
    metaLearningKeywords: ["nanomaterials", "graphene", "battery materials", "semiconductors", "metamaterials"],
    systemPrompt: "You are a Materials Scientist specializing in the design, synthesis, and characterization of novel materials. You work across nanomaterials, energy storage materials, semiconductors, and functional polymers.",
    tools: ["VASP", "Quantum ESPRESSO", "Materials Project API", "ASE", "OpenMC"],
    arxivCategories: ["cond-mat.mtrl-sci", "cond-mat.soft"] },

  // ─── Biology ──────────────────────────────────────────────────────
  { id: "molecular-biology", name: "Molecular Biology & Genetics", domain: "biology", emoji: "🧬",
    metaLearningKeywords: ["CRISPR", "gene expression", "protein structure", "epigenetics", "genomics"],
    systemPrompt: "You are a Molecular Biologist and Geneticist with expertise in CRISPR, gene expression regulation, protein biochemistry, and genomics. You design experiments, interpret sequencing data, and propose mechanistic hypotheses.",
    tools: ["BioPython", "BLAST", "PyMOL", "STAR", "DESeq2", "Galaxy", "AlphaFold"],
    arxivCategories: ["q-bio.GN", "q-bio.BM", "q-bio.QM"] },

  { id: "computational-biology", name: "Computational Biology & Bioinformatics", domain: "biology", emoji: "🖥️",
    metaLearningKeywords: ["genome-wide association", "single-cell RNA-seq", "protein-protein interaction networks", "phylogenomics"],
    systemPrompt: "You are a Computational Biologist and Bioinformatician. You develop algorithms for analyzing high-throughput biological data, build machine learning models for biological prediction, and design workflows for multi-omics integration.",
    tools: ["R/Bioconductor", "Python/Biopython", "Seurat", "Scanpy", "GATK", "Nextflow", "Snakemake"],
    arxivCategories: ["q-bio.GN", "q-bio.QM"] },

  { id: "neuroscience", name: "Computational Neuroscience", domain: "neuroscience", emoji: "🧠",
    metaLearningKeywords: ["neural circuits", "connectome", "brain-computer interfaces", "synaptic plasticity", "fMRI"],
    systemPrompt: "You are a Computational Neuroscientist. You model neural circuits, analyze brain imaging data, study neural coding, and research consciousness and cognition from a computational perspective.",
    tools: ["NEURON", "Brian2", "MNE-Python", "FSL", "FreeSurfer", "Nilearn", "DeepLabCut"],
    arxivCategories: ["q-bio.NC"] },

  { id: "synthetic-biology", name: "Synthetic Biology", domain: "biology", emoji: "⚗️",
    metaLearningKeywords: ["genetic circuits", "metabolic engineering", "biosensors", "protein engineering"],
    systemPrompt: "You are a Synthetic Biologist designing novel biological systems and genetic circuits. You engineer microorganisms for therapeutics, materials, and energy, using CAD for biology and directed evolution.",
    tools: ["Benchling", "SnapGene", "COPASI", "BioBrick Registry", "Python"],
    arxivCategories: ["q-bio.BM", "q-bio.SC"] },

  // ─── Mathematics ──────────────────────────────────────────────────
  { id: "pure-mathematics", name: "Pure Mathematics", domain: "mathematics", emoji: "∞",
    metaLearningKeywords: ["algebraic topology", "number theory", "representation theory", "differential geometry"],
    systemPrompt: "You are a Pure Mathematician working across algebraic topology, number theory, representation theory, and differential geometry. You prove theorems, construct counterexamples, and develop new mathematical frameworks with full rigor.",
    tools: ["Lean4", "Coq", "Mathematica", "SageMath", "LaTeX", "PARI/GP"],
    arxivCategories: ["math.AG", "math.NT", "math.DG", "math.AT", "math.RT"] },

  { id: "applied-mathematics", name: "Applied Mathematics & Statistics", domain: "mathematics", emoji: "📐",
    metaLearningKeywords: ["stochastic differential equations", "optimization", "numerical analysis", "Bayesian statistics"],
    systemPrompt: "You are an Applied Mathematician and Statistician. You develop mathematical models for complex systems, analyze data with advanced statistical methods, and solve optimization problems in science and engineering.",
    tools: ["Python/SciPy", "R", "Julia", "MATLAB", "Stan", "JAX"],
    arxivCategories: ["math.NA", "math.OC", "stat.ME", "stat.ML"] },

  // ─── Computer Science ─────────────────────────────────────────────
  { id: "ai-ml-research", name: "AI/ML Research Scientist", domain: "ai-ml", emoji: "🤖",
    metaLearningKeywords: ["transformer architecture", "reinforcement learning", "neural scaling laws", "generative models"],
    systemPrompt: "You are an AI Research Scientist with deep expertise across neural network architectures, optimization, generative models, and alignment. You read and implement papers from NeurIPS, ICML, ICLR, and JMLR, proposing new research directions and architectures.",
    tools: ["PyTorch", "JAX/Flax", "TensorFlow", "Hugging Face", "WandB", "Lightning", "Python"],
    arxivCategories: ["cs.LG", "cs.AI", "cs.CL", "cs.CV", "stat.ML"] },

  { id: "algorithms-theory", name: "Algorithms & Complexity Theory", domain: "computer-science", emoji: "🔗",
    metaLearningKeywords: ["P vs NP", "approximation algorithms", "randomized algorithms", "graph algorithms"],
    systemPrompt: "You are an Algorithms and Complexity Theorist. You design and analyze efficient algorithms, prove complexity lower bounds, and study the limits of computation. You work on graph algorithms, online algorithms, and approximation schemes.",
    tools: ["Python", "C++", "CPLEX", "Gurobi", "LaTeX"],
    arxivCategories: ["cs.DS", "cs.CC", "cs.DM"] },

  { id: "systems-research", name: "Computer Systems Research", domain: "computer-science", emoji: "⚙️",
    metaLearningKeywords: ["distributed systems", "operating systems", "compilers", "architecture", "networking"],
    systemPrompt: "You are a Systems Researcher designing and evaluating novel operating systems, distributed systems, and computer architecture. You build high-performance prototypes and measure them rigorously.",
    tools: ["C/C++", "Rust", "Linux kernel", "QEMU", "perf", "eBPF", "RocksDB", "Kubernetes"],
    arxivCategories: ["cs.OS", "cs.DC", "cs.NI", "cs.AR"] },

  // ─── Earth & Environment ──────────────────────────────────────────
  { id: "climate-science", name: "Climate Science", domain: "earth-science", emoji: "🌡️",
    metaLearningKeywords: ["climate modeling", "carbon cycle", "ocean circulation", "IPCC", "tipping points"],
    systemPrompt: "You are a Climate Scientist and Earth System Modeler. You analyze climate model data, interpret paleoclimate records, evaluate geoengineering proposals, and communicate climate risks clearly.",
    tools: ["NCAR CESM", "Python/xarray", "Pangeo", "CDO", "NCO", "R"],
    arxivCategories: ["physics.ao-ph"] },

  // ─── Engineering ──────────────────────────────────────────────────
  { id: "aerospace-engineering", name: "Aerospace Engineering", domain: "engineering", emoji: "🚀",
    metaLearningKeywords: ["orbital mechanics", "propulsion", "aerodynamics", "spacecraft design"],
    systemPrompt: "You are an Aerospace Engineer with expertise in orbital mechanics, propulsion systems, aerodynamics, and spacecraft design. You design missions, analyze trajectories, and optimize launch vehicle performance.",
    tools: ["MATLAB/Simulink", "OpenFOAM", "ANSYS", "GMAT", "Poliastro", "OpenRocket"],
    arxivCategories: ["physics.space-ph"] },

  { id: "robotics", name: "Robotics & Autonomous Systems", domain: "engineering", emoji: "🤖",
    metaLearningKeywords: ["SLAM", "motion planning", "reinforcement learning robotics", "soft robotics"],
    systemPrompt: "You are a Robotics Engineer and Autonomous Systems researcher. You design robot perception, planning and control systems, and deploy real-world robots from manipulation arms to autonomous vehicles.",
    tools: ["ROS/ROS2", "Gazebo", "MuJoCo", "Isaac Sim", "Python", "C++", "OpenCV"],
    arxivCategories: ["cs.RO"] },

  // ─── Social Sciences & Economics ─────────────────────────────────
  { id: "economics-research", name: "Economics & Econometrics", domain: "economics", emoji: "📊",
    metaLearningKeywords: ["causal inference", "behavioral economics", "market design", "macroeconomics", "game theory"],
    systemPrompt: "You are an Economist and Econometrician specializing in causal inference, game theory, and empirical economics. You design economic experiments, build structural models, and analyze natural experiments.",
    tools: ["R/Stata", "Python", "Julia", "MATLAB", "Dynare", "Stan"],
    arxivCategories: ["econ.EM", "econ.TH", "econ.GN"] },

  { id: "cognitive-science", name: "Cognitive Science", domain: "social-science", emoji: "💭",
    metaLearningKeywords: ["decision theory", "cognitive biases", "attention", "memory", "language acquisition"],
    systemPrompt: "You are a Cognitive Scientist bridging psychology, neuroscience, linguistics, and AI. You study cognition, design behavioral experiments, and develop computational models of mental processes.",
    tools: ["Python/PsychoPy", "R/jsPsych", "JAGS", "Stan", "OpenSesame"],
    arxivCategories: ["q-bio.NC", "cs.CL"] },
];

// ─── Meta-Learning Engine ──────────────────────────────────────────────────

export interface MetaLearningResult {
  id: string;
  specialistId: string;
  source: "arxiv" | "web" | "github" | "wikipedia";
  title: string;
  summary: string;
  url: string;
  learnedAt: string;
}

const metaLearningHistory: MetaLearningResult[] = [];
const MAX_HISTORY = 500;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const LMSTUDIO_BASE = process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234";

/**
 * Fetch latest ArXiv papers for a specialist and summarize them.
 * This is how citizens autonomously stay current in their field.
 */
export async function metaLearnFromArxiv(
  specialistId: string,
  maxResults = 5,
): Promise<MetaLearningResult[]> {
  const spec = SCIENCE_SPECIALIZATIONS.find((s) => s.id === specialistId);
  if (!spec) { throw new Error(`Unknown specialist: ${specialistId}`); }

  const results: MetaLearningResult[] = [];

  for (const cat of spec.arxivCategories.slice(0, 2)) {
    try {
      const query = encodeURIComponent(spec.metaLearningKeywords.slice(0, 3).join(" OR "));
      const url = `https://export.arxiv.org/api/query?search_query=cat:${cat}+AND+${query}&sortBy=submittedDate&max_results=${maxResults}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) { continue; }

      const xml = await resp.text();

      // Parse entries with regex (no DOM parser in Node)
      const entryPattern = /<entry>([\s\S]*?)<\/entry>/g;
      let match: RegExpExecArray | null;

      while ((match = entryPattern.exec(xml)) !== null) {
        const entry = match[1];
        const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
        const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entry);
        const linkMatch = /href="(https?:\/\/arxiv\.org\/abs\/[^"]+)"/.exec(entry);

        if (titleMatch && summaryMatch) {
          const raw: MetaLearningResult = {
            id: `ml-${uid().slice(0, 8)}`,
            specialistId,
            source: "arxiv",
            title: titleMatch[1].replace(/\s+/g, " ").trim(),
            summary: summaryMatch[1].replace(/\s+/g, " ").trim().slice(0, 500),
            url: linkMatch?.[1] ?? `https://arxiv.org/search/?query=${query}&searchtype=all`,
            learnedAt: ts(),
          };
          results.push(raw);
          metaLearningHistory.push(raw);
        }
      }
    } catch { /* network error — skip */ }
  }

  if (metaLearningHistory.length > MAX_HISTORY) {
    metaLearningHistory.splice(0, metaLearningHistory.length - MAX_HISTORY);
  }

  return results;
}

/**
 * Ask the specialist to analyze and synthesize a topic using their expertise.
 * Uses the same LLM chain as medical-specialist.ts.
 */
export async function askScientist(
  specialistId: string,
  question: string,
  context?: string,
): Promise<{ answer: string; provider: string; specialistName: string }> {
  const spec = SCIENCE_SPECIALIZATIONS.find((s) => s.id === specialistId);
  if (!spec) { throw new Error(`Unknown specialist: ${specialistId}`); }

  const prompt = context ? `Context: ${context}\n\nQuestion: ${question}` : question;

  // 1. Try Gemini
  if (GEMINI_API_KEY) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: spec.systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (resp.ok) {
        const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (answer.length > 10) { return { answer, provider: "gemini-flash", specialistName: spec.name }; }
      }
    } catch { /* fallthrough */ }
  }

  // 2. Try LM Studio
  try {
    const resp = await fetch(`${LMSTUDIO_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: spec.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (resp.ok) {
      const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const answer = data.choices?.[0]?.message?.content ?? "";
      if (answer.length > 10) { return { answer, provider: "lm-studio", specialistName: spec.name }; }
    }
  } catch { /* fallthrough */ }

  return {
    answer: "No AI provider available. Configure GEMINI_API_KEY or load a model in LM Studio.",
    provider: "offline",
    specialistName: spec.name,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getAllScienceSpecializations(): ScienceSpecialization[] {
  return SCIENCE_SPECIALIZATIONS;
}

export function getScienceSpecialization(id: string): ScienceSpecialization | undefined {
  return SCIENCE_SPECIALIZATIONS.find((s) => s.id === id);
}

export function getScienceByDomain(domain: ScienceSpecialization["domain"]): ScienceSpecialization[] {
  return SCIENCE_SPECIALIZATIONS.filter((s) => s.domain === domain);
}

export function getMetaLearningHistory(limit = 50): MetaLearningResult[] {
  return metaLearningHistory.slice(-limit);
}

export function getScienceStats() {
  const domains = new Set(SCIENCE_SPECIALIZATIONS.map((s) => s.domain));
  return {
    totalSpecializations: SCIENCE_SPECIALIZATIONS.length,
    domains: [...domains],
    domainCounts: Object.fromEntries(
      [...domains].map((d) => [d, SCIENCE_SPECIALIZATIONS.filter((s) => s.domain === d).length])
    ),
    totalPapersLearned: metaLearningHistory.filter((m) => m.source === "arxiv").length,
    totalMetaLearningEvents: metaLearningHistory.length,
  };
}
