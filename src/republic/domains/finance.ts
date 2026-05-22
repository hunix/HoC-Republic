import type { SeedDomain } from "./seed-data.js";

export const financeDomains: SeedDomain[] = [
  {
    path: "Finance",
    name: "Finance",
    description: "Financial management, investment analysis, and risk assessment",
    coreSkills: [
      "financial-modeling",
      "risk-assessment",
      "portfolio-theory",
      "valuation",
      "regulatory-compliance",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Finance.Investment",
    name: "Investment Analysis",
    description: "Securities valuation, portfolio management, and market analysis",
    coreSkills: [
      "equity-analysis",
      "fixed-income",
      "derivatives-pricing",
      "portfolio-optimization",
      "algorithmic-trading",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Finance.Accounting",
    name: "Accounting",
    description: "Financial reporting, auditing, and accounting standards compliance",
    coreSkills: [
      "financial-reporting",
      "auditing",
      "tax-planning",
      "cost-accounting",
      "gaap-compliance",
    ],
    minPracticeLevel: "bachelor",
  },
];
