import type { CertificationLevel, DegreeTemplate } from "../types.js";

// ─── Degree Templates ───────────────────────────────────────────

/** Standard degree requirements for each certification level */
export const DEGREE_TEMPLATES: Record<CertificationLevel, DegreeTemplate> = {
  certificate: {
    level: "certificate",
    xpThreshold: 50,
    prerequisites: [],
    requiredCases: 0,
    minPeerScore: 0,
    examDifficulty: 0.2,
  },
  diploma: {
    level: "diploma",
    xpThreshold: 200,
    prerequisites: [],
    requiredCases: 3,
    minPeerScore: 2.0,
    examDifficulty: 0.35,
  },
  bachelor: {
    level: "bachelor",
    xpThreshold: 500,
    prerequisites: [],
    requiredCases: 10,
    minPeerScore: 3.0,
    examDifficulty: 0.5,
  },
  master: {
    level: "master",
    xpThreshold: 1000,
    prerequisites: [],
    requiredCases: 25,
    minPeerScore: 3.5,
    examDifficulty: 0.7,
  },
  doctorate: {
    level: "doctorate",
    xpThreshold: 2000,
    prerequisites: [],
    requiredCases: 50,
    minPeerScore: 4.0,
    examDifficulty: 0.85,
  },
  fellowship: {
    level: "fellowship",
    xpThreshold: 5000,
    prerequisites: [],
    requiredCases: 100,
    minPeerScore: 4.5,
    examDifficulty: 0.95,
  },
};

/** Ordered certification levels for comparison */
export const CERTIFICATION_ORDER: CertificationLevel[] = [
  "certificate",
  "diploma",
  "bachelor",
  "master",
  "doctorate",
  "fellowship",
];
