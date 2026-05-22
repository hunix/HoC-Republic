import type { SeedDomain } from "./seed-data.js";

export const agricultureextensionsDomains: SeedDomain[] = [
  {
    path: "Agriculture.Hydroponics",
    name: "Hydroponics",
    description: "Soil-free cultivation, nutrient solution management, and controlled environments",
    coreSkills: [
      "nutrient-solution-design",
      "ph-management",
      "grow-system-design",
      "environmental-control",
      "crop-monitoring",
    ],
    minPracticeLevel: "certificate",
  },
  {
    path: "Agriculture.AgriTech",
    name: "Agricultural Technology",
    description: "Drones, sensors, AI, and automation applied to farming",
    coreSkills: [
      "drone-mapping",
      "sensor-deployment",
      "yield-prediction",
      "automated-irrigation",
      "farm-data-analytics",
    ],
    minPracticeLevel: "bachelor",
  },
];
