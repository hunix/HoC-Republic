import type { SeedDomain } from "./seed-data.js";

export const aerospaceDomains: SeedDomain[] = [
  {
    path: "Engineering.Aerospace",
    name: "Aerospace Engineering",
    description: "Aircraft, spacecraft, and missile design, propulsion, and flight dynamics",
    coreSkills: [
      "aerodynamics",
      "structural-analysis",
      "propulsion-systems",
      "flight-mechanics",
      "systems-integration",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Engineering.Aerospace.OrbitalMechanics",
    name: "Orbital Mechanics",
    description: "Satellite orbits, trajectory design, and celestial navigation",
    coreSkills: [
      "orbit-determination",
      "trajectory-optimization",
      "rendezvous-planning",
      "perturbation-analysis",
      "mission-design",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Engineering.Aerospace.Avionics",
    name: "Avionics",
    description: "Flight control systems, navigation electronics, and onboard computing",
    coreSkills: [
      "flight-control-design",
      "inertial-navigation",
      "radar-systems",
      "avionics-software",
      "do-178c-compliance",
    ],
    minPracticeLevel: "master",
  },
];
