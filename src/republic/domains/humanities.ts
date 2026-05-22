import type { SeedDomain } from "./seed-data.js";

export const humanitiesDomains: SeedDomain[] = [
  {
    path: "Humanities",
    name: "Humanities",
    description: "Study of human culture, history, philosophy, and creative expression",
    coreSkills: [
      "critical-analysis",
      "research-methodology",
      "academic-writing",
      "cultural-awareness",
      "philosophical-reasoning",
    ],
    minPracticeLevel: "certificate",
  },
  {
    path: "Humanities.Psychology",
    name: "Psychology",
    description:
      "Scientific study of mind and behavior, including clinical and research applications",
    coreSkills: [
      "behavioral-analysis",
      "psychometrics",
      "research-design",
      "statistical-analysis",
      "therapeutic-techniques",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Humanities.Education",
    name: "Education",
    description: "Pedagogy, curriculum design, and instructional methodology",
    coreSkills: [
      "curriculum-design",
      "assessment-creation",
      "instructional-design",
      "learning-theory",
      "student-evaluation",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Humanities.Linguistics",
    name: "Linguistics",
    description: "Study of language structure, semantics, and computational linguistics",
    coreSkills: [
      "syntax-analysis",
      "semantics",
      "phonology",
      "computational-linguistics",
      "nlp-development",
    ],
    minPracticeLevel: "bachelor",
  },
];
