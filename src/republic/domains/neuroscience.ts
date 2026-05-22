import type { SeedDomain } from "./seed-data.js";

export const neuroscienceDomains: SeedDomain[] = [
  {
    path: "Science.Neuroscience",
    name: "Neuroscience",
    description: "Brain structure, neural circuits, and cognitive function",
    coreSkills: [
      "neuroanatomy",
      "electrophysiology",
      "neuroimaging",
      "neural-coding",
      "synaptic-physiology",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Science.Neuroscience.ComputationalNeuro",
    name: "Computational Neuroscience",
    description: "Mathematical models of neural systems and brain computation",
    coreSkills: [
      "neural-network-modeling",
      "spike-train-analysis",
      "connectome-analysis",
      "neural-dynamics",
      "brain-simulation",
    ],
    minPracticeLevel: "doctorate",
  },
];
