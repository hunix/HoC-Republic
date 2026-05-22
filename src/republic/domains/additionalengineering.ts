import type { SeedDomain } from "./seed-data.js";

export const additionalengineeringDomains: SeedDomain[] = [
  {
    path: "Engineering.Civil",
    name: "Civil Engineering",
    description: "Infrastructure design, structural engineering, and construction management",
    coreSkills: [
      "structural-design",
      "geotechnical-analysis",
      "surveying",
      "construction-management",
      "hydraulics",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Engineering.Chemical",
    name: "Chemical Engineering",
    description: "Chemical process design, reaction engineering, and process optimization",
    coreSkills: [
      "process-design",
      "reaction-engineering",
      "heat-transfer",
      "mass-transfer",
      "process-control",
    ],
    minPracticeLevel: "bachelor",
  },
];
