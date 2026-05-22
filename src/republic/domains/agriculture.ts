import type { SeedDomain } from "./seed-data.js";

export const agricultureDomains: SeedDomain[] = [
  {
    path: "Agriculture",
    name: "Agricultural Science",
    description: "Crop science, soil science, and precision agriculture",
    coreSkills: [
      "crop-management",
      "soil-analysis",
      "precision-agriculture",
      "pest-management",
      "irrigation-optimization",
    ],
    minPracticeLevel: "certificate",
  },
  {
    path: "Agriculture.Nutrition",
    name: "Nutritional Science",
    description: "Diet analysis, nutritional biochemistry, and dietary planning",
    coreSkills: [
      "dietary-assessment",
      "nutritional-biochemistry",
      "meal-planning",
      "nutrient-analysis",
      "clinical-nutrition",
    ],
    minPracticeLevel: "bachelor",
  },
];
