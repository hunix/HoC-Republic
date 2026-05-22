import type { SeedDomain } from "./seed-data.js";

export const psychologysubspecialtiesDomains: SeedDomain[] = [
  {
    path: "Humanities.Psychology.Clinical",
    name: "Clinical Psychology",
    description: "Assessment, diagnosis, and treatment of mental health disorders",
    coreSkills: [
      "clinical-assessment",
      "diagnostic-interviewing",
      "evidence-based-treatment",
      "crisis-intervention",
      "case-formulation",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Humanities.Psychology.Cognitive",
    name: "Cognitive Psychology",
    description: "Memory, attention, perception, language, and decision-making processes",
    coreSkills: [
      "attention-paradigms",
      "memory-assessment",
      "perception-testing",
      "decision-modeling",
      "cognitive-load-analysis",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Humanities.Psychology.Developmental",
    name: "Developmental Psychology",
    description: "Human growth, cognitive development, and lifespan psychology",
    coreSkills: [
      "developmental-assessment",
      "longitudinal-research",
      "cognitive-milestone-tracking",
      "attachment-theory",
      "aging-studies",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Humanities.Psychology.IO",
    name: "Industrial-Organizational Psychology",
    description: "Workplace behavior, talent management, and organizational design",
    coreSkills: [
      "job-analysis",
      "performance-appraisal",
      "organizational-development",
      "team-dynamics",
      "selection-assessment",
    ],
    minPracticeLevel: "master",
  },
];
