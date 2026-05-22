import type { SeedDomain } from "./seed-data.js";

export const additionalhumanitiesDomains: SeedDomain[] = [
  {
    path: "Humanities.History",
    name: "History",
    description: "Historical research, primary source analysis, and historiography",
    coreSkills: [
      "primary-source-analysis",
      "historiography",
      "archival-research",
      "chronological-reasoning",
      "comparative-history",
    ],
    minPracticeLevel: "certificate",
  },
  {
    path: "Humanities.PoliticalScience",
    name: "Political Science",
    description: "Political systems, governance, policy analysis, and international relations",
    coreSkills: [
      "policy-analysis",
      "comparative-politics",
      "political-theory",
      "quantitative-methods",
      "institutional-analysis",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Humanities.Economics",
    name: "Economics",
    description: "Microeconomics, macroeconomics, econometrics, and economic policy",
    coreSkills: [
      "microeconomic-analysis",
      "macroeconomic-modeling",
      "econometrics",
      "game-theory",
      "welfare-analysis",
    ],
    minPracticeLevel: "bachelor",
  },
];
