import type { SeedDomain } from "./seed-data.js";

export const environmentalscienceDomains: SeedDomain[] = [
  {
    path: "Science.Environmental",
    name: "Environmental Science",
    description: "Earth systems, climate, ecology, and environmental management",
    coreSkills: [
      "ecosystem-analysis",
      "environmental-monitoring",
      "impact-assessment",
      "sustainability-planning",
      "field-sampling",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Science.Environmental.ClimateModeling",
    name: "Climate Modeling",
    description: "Global climate simulation, greenhouse gas modeling, and projection analysis",
    coreSkills: [
      "atmosphere-modeling",
      "ocean-circulation",
      "carbon-cycle-analysis",
      "climate-projection",
      "downscaling-techniques",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Science.Environmental.Conservation",
    name: "Conservation Biology",
    description: "Biodiversity preservation, habitat restoration, and species management",
    coreSkills: [
      "population-genetics",
      "habitat-assessment",
      "species-monitoring",
      "restoration-ecology",
      "conservation-planning",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Science.Environmental.RenewableEnergy",
    name: "Renewable Energy Systems",
    description: "Solar, wind, hydro, geothermal energy system design and optimization",
    coreSkills: [
      "solar-pv-design",
      "wind-turbine-analysis",
      "energy-storage",
      "grid-integration",
      "lifecycle-assessment",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Science.Environmental.Oceanography",
    name: "Oceanography",
    description: "Ocean physics, marine chemistry, and marine ecosystem dynamics",
    coreSkills: [
      "ocean-current-modeling",
      "marine-sampling",
      "salinity-analysis",
      "marine-ecology",
      "remote-sensing",
    ],
    minPracticeLevel: "master",
  },
];
