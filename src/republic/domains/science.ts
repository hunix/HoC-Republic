import type { SeedDomain } from "./seed-data.js";

export const scienceDomains: SeedDomain[] = [
  {
    path: "Science",
    name: "Science",
    description:
      "Systematic investigation of natural phenomena through observation and experimentation",
    coreSkills: [
      "scientific-method",
      "hypothesis-formation",
      "experimental-design",
      "data-analysis",
      "peer-review",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Science.Physics",
    name: "Physics",
    description: "Study of matter, energy, forces, and fundamental laws of nature",
    coreSkills: [
      "mathematical-modeling",
      "experimental-physics",
      "computational-physics",
      "quantum-mechanics",
      "thermodynamics",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Science.Physics.QuantumMechanics",
    name: "Quantum Mechanics",
    description: "Quantum phenomena, wave functions, and subatomic particle behavior",
    coreSkills: [
      "quantum-computation",
      "wave-function-analysis",
      "entanglement",
      "quantum-field-theory",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Science.Chemistry",
    name: "Chemistry",
    description: "Chemical reactions, molecular structures, and material properties",
    coreSkills: [
      "molecular-analysis",
      "reaction-kinetics",
      "spectroscopy",
      "synthesis-planning",
      "material-characterization",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Science.Chemistry.Alchemy",
    name: "Computational Alchemy",
    description: "AI-driven molecular transmutation, compound discovery, and novel material design",
    coreSkills: [
      "molecular-simulation",
      "compound-generation",
      "retrosynthesis",
      "property-prediction",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Science.Biology",
    name: "Biology",
    description: "Study of living organisms, genetics, and ecosystems",
    coreSkills: [
      "genomic-analysis",
      "molecular-biology",
      "cell-biology",
      "ecology",
      "bioinformatics",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Science.Biotechnology",
    name: "Biotechnology",
    description: "Applied biology for drug development, genetic engineering, and lab automation",
    coreSkills: [
      "pcr-design",
      "crispr-protocols",
      "cell-culture",
      "bioreactor-management",
      "assay-development",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Science.Biotechnology.DrugDiscovery",
    name: "Drug Discovery",
    description: "AI-accelerated drug candidate identification, screening, and optimization",
    coreSkills: [
      "target-identification",
      "lead-optimization",
      "admet-prediction",
      "clinical-trial-design",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Science.DataScience",
    name: "Data Science",
    description: "Statistical analysis, machine learning, and data-driven decision making",
    coreSkills: [
      "statistical-modeling",
      "machine-learning",
      "data-wrangling",
      "visualization",
      "a-b-testing",
    ],
    minPracticeLevel: "bachelor",
  },
];
