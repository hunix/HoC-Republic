import type { SeedDomain } from "./seed-data.js";

export const architecturedesignDomains: SeedDomain[] = [
  {
    path: "Design",
    name: "Design",
    description: "Visual and functional design across digital and physical media",
    coreSkills: [
      "visual-design",
      "user-research",
      "prototyping",
      "design-systems",
      "accessibility",
    ],
    minPracticeLevel: "certificate",
  },
  {
    path: "Design.UXDesign",
    name: "UX Design",
    description: "User experience research, interaction design, and usability testing",
    coreSkills: [
      "user-research",
      "wireframing",
      "usability-testing",
      "information-architecture",
      "interaction-design",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Design.Architecture",
    name: "Architecture",
    description: "Building design, structural planning, and sustainable construction",
    coreSkills: [
      "architectural-design",
      "structural-analysis",
      "sustainability",
      "building-codes",
      "3d-visualization",
    ],
    minPracticeLevel: "master",
  },
];
