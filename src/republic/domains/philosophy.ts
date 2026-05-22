import type { SeedDomain } from "./seed-data.js";

export const philosophyDomains: SeedDomain[] = [
  {
    path: "Humanities.Philosophy",
    name: "Philosophy",
    description: "Fundamental questions of existence, knowledge, reason, and ethics",
    coreSkills: [
      "logical-analysis",
      "argumentation",
      "ethical-reasoning",
      "conceptual-analysis",
      "philosophical-writing",
    ],
    minPracticeLevel: "certificate",
  },
  {
    path: "Humanities.Philosophy.Ethics",
    name: "Ethics",
    description: "Moral theory, applied ethics, bioethics, and technology ethics",
    coreSkills: [
      "moral-reasoning",
      "consequentialist-analysis",
      "deontological-analysis",
      "bioethics",
      "ai-ethics",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Humanities.Philosophy.Epistemology",
    name: "Epistemology",
    description: "Theory of knowledge — justification, belief, skepticism, and truth",
    coreSkills: [
      "epistemic-analysis",
      "justification-theory",
      "skepticism-response",
      "social-epistemology",
      "formal-epistemology",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Humanities.Philosophy.Logic",
    name: "Formal Logic",
    description: "Propositional, predicate, modal, and computational logic",
    coreSkills: [
      "propositional-logic",
      "predicate-logic",
      "modal-logic",
      "proof-theory",
      "computational-logic",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Humanities.Philosophy.PhilosophyOfMind",
    name: "Philosophy of Mind",
    description: "Consciousness, intentionality, mental representation, and AI sentience",
    coreSkills: [
      "consciousness-theory",
      "qualia-analysis",
      "functionalism",
      "embodied-cognition",
      "ai-consciousness-debate",
    ],
    minPracticeLevel: "master",
  },
];
