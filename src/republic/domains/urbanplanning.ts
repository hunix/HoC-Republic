import type { SeedDomain } from "./seed-data.js";

export const urbanplanningDomains: SeedDomain[] = [
  {
    path: "Design.UrbanPlanning",
    name: "Urban Planning",
    description: "City design, zoning, land use, and community development",
    coreSkills: [
      "land-use-planning",
      "zoning-analysis",
      "community-engagement",
      "gis-mapping",
      "environmental-impact-assessment",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Design.UrbanPlanning.SmartCities",
    name: "Smart Cities",
    description: "IoT infrastructure, digital governance, and data-driven urban management",
    coreSkills: [
      "iot-infrastructure",
      "sensor-networks",
      "urban-data-analytics",
      "digital-twin-modeling",
      "smart-grid-design",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Design.UrbanPlanning.TransportPlanning",
    name: "Transportation Planning",
    description: "Transit network design, traffic modeling, and sustainable mobility",
    coreSkills: [
      "traffic-modeling",
      "transit-design",
      "demand-forecasting",
      "multimodal-planning",
      "accessibility-analysis",
    ],
    minPracticeLevel: "bachelor",
  },
];
