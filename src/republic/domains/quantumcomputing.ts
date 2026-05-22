import type { SeedDomain } from "./seed-data.js";

export const quantumcomputingDomains: SeedDomain[] = [
  {
    path: "Science.QuantumComputing",
    name: "Quantum Computing",
    description: "Quantum algorithms, quantum hardware, and quantum information science",
    coreSkills: [
      "qubit-design",
      "quantum-circuits",
      "quantum-error-correction",
      "quantum-algorithms",
      "hardware-calibration",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Science.QuantumComputing.QuantumAlgorithms",
    name: "Quantum Algorithms",
    description: "Shor's, Grover's, VQE, QAOA, and quantum simulation algorithms",
    coreSkills: [
      "algorithm-design",
      "complexity-analysis",
      "quantum-simulation",
      "variational-methods",
      "quantum-advantage-analysis",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Science.QuantumComputing.QuantumML",
    name: "Quantum Machine Learning",
    description: "Hybrid classical-quantum models, quantum kernels, and parameterized circuits",
    coreSkills: [
      "quantum-kernels",
      "parameterized-circuits",
      "hybrid-training",
      "quantum-embedding",
      "barren-plateau-mitigation",
    ],
    minPracticeLevel: "doctorate",
  },
];
