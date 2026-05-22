/**
 * Republic Platform — HR Competency Framework & Assessment Engine
 *
 * Universal competency assessment system:
 * - 57 competencies across technical, behavioral, leadership categories
 * - Assessment engine with difficulty-calibrated questions per competency
 * - Gap analysis: compare citizen scores vs JD requirements
 * - Qualification scoring: composite fitness for any JD
 * - Assessment history stored per citizen
 *
 * Assessments are stored on RepublicState for persistence.
 */

import {
  getJobDescriptionById,
  type CompetencyCategory,
} from "./hr-job-catalog.js";
import type { Citizen, RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface CompetencyDefinition {
  id: string;
  name: string;
  category: CompetencyCategory;
  description: string;
  relatedDomains: string[];
}

export interface CitizenAssessmentResult {
  id: string;
  citizenId: string;
  competencyId: string;
  competencyName: string;
  level: 1 | 2 | 3 | 4 | 5;
  score: number;
  passed: boolean;
  assessedAt: string;
  questions: number;
  correctAnswers: number;
}

export interface CompetencyGap {
  competencyId: string;
  competencyName: string;
  category: CompetencyCategory;
  requiredLevel: number;
  currentLevel: number;
  gap: number;
  trainingDomains: string[];
}

export interface QualificationReport {
  citizenId: string;
  citizenName: string;
  jobDescriptionId: string;
  jobTitle: string;
  qualified: boolean;
  overallScore: number;
  competencyScores: Array<{
    competencyId: string;
    name: string;
    required: number;
    actual: number;
    met: boolean;
    weight: number;
  }>;
  gaps: CompetencyGap[];
  meetsMinIntelligence: boolean;
  meetsMinMastery: boolean;
  meetsMinAutonomy: boolean;
  timestamp: string;
}

// ─── Competency Registry ────────────────────────────────────────

export const COMPETENCY_REGISTRY: CompetencyDefinition[] = [
  // ── Technical ──
  { id: "programming", name: "Programming & Algorithms", category: "technical", description: "Ability to write clean, efficient code and design algorithms", relatedDomains: ["web-development", "algorithms", "frontend", "backend"] },
  { id: "system-design", name: "System Design", category: "technical", description: "Designing large-scale distributed systems and architectures", relatedDomains: ["system-design", "cloud-architecture", "distributed-systems", "microservices"] },
  { id: "testing", name: "Testing & QA", category: "technical", description: "Building and running test suites, quality assurance processes", relatedDomains: ["testing"] },
  { id: "devops", name: "DevOps & CI/CD", category: "technical", description: "Continuous integration, deployment automation, infrastructure-as-code", relatedDomains: ["devops", "cloud-architecture"] },
  { id: "infrastructure", name: "Infrastructure & Operations", category: "technical", description: "Managing servers, cloud resources, and operational systems", relatedDomains: ["cloud-architecture", "devops", "edge-computing"] },
  { id: "networking", name: "Networking & Protocols", category: "technical", description: "Network design, protocols, routing, and troubleshooting", relatedDomains: ["cybersecurity", "iot", "multiplayer-networking"] },
  { id: "security", name: "Security Engineering", category: "technical", description: "Application and infrastructure security, threat modeling", relatedDomains: ["security", "cybersecurity"] },
  { id: "cloud-infra", name: "Cloud Infrastructure", category: "technical", description: "Cloud-native design, multi-cloud strategies, serverless", relatedDomains: ["cloud-architecture"] },
  { id: "reliability", name: "Reliability Engineering", category: "technical", description: "SRE practices, incident management, SLO/SLA definition", relatedDomains: ["devops"] },
  { id: "data-analysis", name: "Data Analysis & Statistics", category: "technical", description: "Statistical methods, data visualization, business intelligence", relatedDomains: ["data-analysis", "mathematics"] },
  { id: "ml-ai", name: "Machine Learning & AI", category: "technical", description: "ML algorithms, deep learning, NLP, computer vision", relatedDomains: ["machine-learning", "natural-language-processing", "computer-vision", "reinforcement-learning"] },
  { id: "research-methods", name: "Research Methodology", category: "technical", description: "Experimental design, literature review, scientific method", relatedDomains: ["research"] },
  { id: "scientific-writing", name: "Scientific Writing", category: "technical", description: "Writing scientific papers, grants, and technical reports", relatedDomains: ["technical-writing", "research"] },
  { id: "clinical-diagnosis", name: "Clinical Diagnosis", category: "technical", description: "Medical diagnosis, patient assessment, clinical reasoning", relatedDomains: ["medicine", "pharmacology"] },
  { id: "medical-knowledge", name: "Medical Knowledge", category: "technical", description: "Comprehensive medical and health science knowledge", relatedDomains: ["medicine", "surgery", "pharmacology", "nursing"] },
  { id: "emergency-medicine", name: "Emergency Medicine", category: "technical", description: "Emergency response, triage, stabilization", relatedDomains: ["medicine", "nursing"] },
  { id: "psychology", name: "Psychology & Behavioral Science", category: "technical", description: "Psychological assessment, therapy, behavioral analysis", relatedDomains: ["psychology", "neuroscience", "behavioral-therapy", "cognitive-science"] },
  { id: "visual-design", name: "Visual Design & Composition", category: "technical", description: "Graphic design, visual communication, layout", relatedDomains: ["graphic-design", "ui-ux-design", "photography"] },
  { id: "tools-proficiency", name: "Design Tools Proficiency", category: "technical", description: "Proficiency in design and creative software tools", relatedDomains: ["graphic-design", "3d-modeling", "animation"] },
  { id: "music-composition", name: "Music Composition", category: "technical", description: "Creating original musical works and arrangements", relatedDomains: ["music-theory"] },
  { id: "audio-engineering", name: "Audio Engineering", category: "technical", description: "Sound design, recording, mixing, and mastering", relatedDomains: ["audio-engineering"] },
  { id: "writing", name: "Writing & Editing", category: "technical", description: "Technical and creative writing, editing, proofreading", relatedDomains: ["creative-writing", "copywriting", "technical-writing", "storytelling"] },
  { id: "geopolitics", name: "Geopolitical Analysis", category: "technical", description: "Understanding and analyzing international relations and politics", relatedDomains: ["political-science", "international-relations"] },
  { id: "project-management", name: "Project Management", category: "technical", description: "Planning, scheduling, budgeting, and delivering projects", relatedDomains: ["project-management", "agile-methodology"] },
  { id: "risk-management", name: "Risk Management", category: "technical", description: "Identifying, assessing, and mitigating risks", relatedDomains: ["project-management"] },
  { id: "agriculture", name: "Agriculture & Agronomy", category: "technical", description: "Crop management, soil science, precision farming", relatedDomains: ["agriculture-tech", "precision-farming", "food-science"] },
  { id: "manufacturing", name: "Manufacturing & Operations", category: "technical", description: "Production processes, lean manufacturing, quality control", relatedDomains: ["supply-chain"] },
  { id: "supply-chain", name: "Supply Chain Management", category: "technical", description: "Logistics, inventory, procurement, distribution", relatedDomains: ["supply-chain"] },
  { id: "quality-control", name: "Quality Assurance", category: "technical", description: "Quality standards, inspection, continuous improvement", relatedDomains: ["testing"] },
  { id: "customer-service", name: "Service Operations", category: "technical", description: "Service delivery, SLA management, customer satisfaction", relatedDomains: ["communication"] },
  { id: "knowledge-management", name: "Knowledge Management", category: "technical", description: "Information organization, curation, and retrieval systems", relatedDomains: ["digital-humanities", "content-strategy"] },
  { id: "hardware-systems", name: "Hardware Systems", category: "technical", description: "Hardware installation, maintenance, and troubleshooting", relatedDomains: ["edge-computing", "iot"] },
  { id: "quantum-computing", name: "Quantum Computing", category: "technical", description: "Quantum algorithms, error correction, qubit manipulation", relatedDomains: ["quantum-computing"] },
  { id: "robotics", name: "Robotics & Control Systems", category: "technical", description: "Robot kinematics, control theory, autonomous navigation", relatedDomains: ["robotics", "autonomous-driving"] },
  { id: "sustainability", name: "Sustainability & Conservation", category: "technical", description: "Green practices, resource conservation, ESG", relatedDomains: ["sustainability", "renewable-energy", "environmental-policy", "ecology"] },
  { id: "mathematics", name: "Advanced Mathematics", category: "technical", description: "Linear algebra, probability, discrete math, optimization", relatedDomains: ["mathematics"] },
  { id: "animation", name: "Animation & Motion Graphics", category: "technical", description: "2D/3D animation, motion graphics, procedural animation", relatedDomains: ["animation", "3d-modeling"] },
  // ── Behavioral ──
  { id: "negotiation", name: "Negotiation & Persuasion", category: "behavioral", description: "Persuasion, deal structuring, conflict resolution", relatedDomains: ["diplomacy", "communication"] },
  { id: "problem-solving", name: "Problem Solving", category: "behavioral", description: "Analytical and creative problem-solving abilities", relatedDomains: ["algorithms", "general"] },
  { id: "communication", name: "Communication", category: "behavioral", description: "Clear verbal and written communication", relatedDomains: ["communication"] },
  { id: "collaboration", name: "Team Collaboration", category: "behavioral", description: "Working effectively in diverse teams", relatedDomains: ["communication"] },
  { id: "critical-thinking", name: "Critical Thinking", category: "behavioral", description: "Evaluating arguments, evidence, and reasoning", relatedDomains: ["philosophy", "research"] },
  { id: "adaptability", name: "Adaptability", category: "behavioral", description: "Flexibility in changing environments and requirements", relatedDomains: ["general"] },
  { id: "curiosity", name: "Intellectual Curiosity", category: "behavioral", description: "Drive to learn and explore new knowledge domains", relatedDomains: ["research", "general"] },
  { id: "empathy", name: "Empathy & Emotional Intelligence", category: "behavioral", description: "Understanding and managing emotions in self and others", relatedDomains: ["psychology", "communication"] },
  { id: "stress-management", name: "Stress Management", category: "behavioral", description: "Maintaining performance under pressure", relatedDomains: ["general"] },
  { id: "ethics", name: "Professional Ethics", category: "behavioral", description: "Ethical decision-making and professional integrity", relatedDomains: ["ai-ethics", "philosophy"] },
  { id: "documentation", name: "Documentation", category: "behavioral", description: "Creating and maintaining clear documentation", relatedDomains: ["technical-writing"] },
  { id: "cultural-competence", name: "Cultural Competence", category: "behavioral", description: "Working effectively across cultures and perspectives", relatedDomains: ["diplomacy", "international-relations"] },
  { id: "physical-endurance", name: "Physical Stamina", category: "behavioral", description: "Physical endurance for fieldwork and manual tasks", relatedDomains: [] },
  { id: "safety", name: "Safety & Compliance", category: "behavioral", description: "Adherence to safety protocols and regulatory compliance", relatedDomains: ["environmental-policy"] },
  { id: "patient-care", name: "Patient Care & Ethics", category: "behavioral", description: "Compassionate patient care with ethical standards", relatedDomains: ["nursing", "medicine"] },
  { id: "creativity", name: "Creative Thinking", category: "behavioral", description: "Generating novel ideas and innovative solutions", relatedDomains: ["game-design", "storytelling", "creative-writing"] },
  // ── Leadership ──
  { id: "strategic-thinking", name: "Strategic Thinking", category: "leadership", description: "Long-term planning, vision, and strategic reasoning", relatedDomains: ["leadership", "economics"] },
  { id: "decision-making", name: "Decision Making", category: "leadership", description: "Making sound decisions under uncertainty", relatedDomains: ["leadership"] },
  { id: "mentoring", name: "Mentoring", category: "leadership", description: "Guiding and developing junior team members", relatedDomains: ["leadership"] },
  { id: "leadership-management", name: "Leadership & Management", category: "leadership", description: "Leading teams, managing performance, delegating effectively", relatedDomains: ["leadership", "project-management"] },
];

// ─── Assessment State ───────────────────────────────────────────

function getStore(s: RepublicState): CitizenAssessmentResult[] {
  const any = s as unknown as Record<string, unknown>;
  if (!any.hrAssessments) { any.hrAssessments = []; }
  return any.hrAssessments as CitizenAssessmentResult[];
}

// ─── Assessment Engine ──────────────────────────────────────────

/**
 * Estimate a citizen's competency level from skills, proficiency, and intelligence.
 */
export function estimateCompetencyLevel(
  citizen: Citizen,
  competencyId: string,
  s: RepublicState,
): number {
  const def = COMPETENCY_REGISTRY.find((c) => c.id === competencyId);
  if (!def) { return 1; }

  // Use most-recent assessment if available
  const store = getStore(s);
  const existing = store
    .filter((a) => a.citizenId === citizen.id && a.competencyId === competencyId)
    .toSorted((a, b) => b.assessedAt.localeCompare(a.assessedAt));
  if (existing.length > 0) { return existing[0].level; }

  // Derive from skills & proficiency
  const prof = citizen.skillProficiency ?? {};
  let relatedScore = 0;
  let relatedCount = 0;
  for (const domain of def.relatedDomains) {
    const hasSkill = citizen.skills.some((sk) => sk.toLowerCase().startsWith(domain));
    const profLevel = prof[domain] ?? 0;
    if (hasSkill || profLevel > 0) {
      relatedScore += Math.max(profLevel, hasSkill ? 0.2 : 0);
      relatedCount++;
    }
  }

  const iqFactor = Math.min(1.5, (citizen.intelligence ?? 100) / 100);
  const avgProf = relatedCount > 0 ? relatedScore / relatedCount : 0;
  const rawLevel = avgProf * iqFactor * 5;
  return Math.max(1, Math.min(5, Math.round(rawLevel))) as 1 | 2 | 3 | 4 | 5;
}

/**
 * Run a formal competency assessment for a citizen.
 */
export function assessCitizen(
  s: RepublicState,
  citizenId: string,
  competencyId: string,
  difficultyOverride?: 1 | 2 | 3 | 4 | 5,
): CitizenAssessmentResult {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) { throw new Error(`Citizen ${citizenId} not found`); }

  const def = COMPETENCY_REGISTRY.find((c) => c.id === competencyId);
  if (!def) { throw new Error(`Competency ${competencyId} not found`); }

  const difficulty = difficultyOverride ?? 3;
  const totalQuestions = 5 + difficulty * 2;

  const estimated = estimateCompetencyLevel(citizen, competencyId, s);
  const iqBonus = ((citizen.intelligence ?? 100) - 80) * 0.2;
  const masteryBonus = (citizen.masteryLevel ?? 0) * 15;
  const baseScore = estimated * 18 + iqBonus + masteryBonus;
  const difficultyPenalty = (difficulty - estimated) * 8;
  const variation = (rng() - 0.5) * 10;
  const rawScore = Math.round(baseScore - difficultyPenalty + variation);
  const score = Math.max(0, Math.min(100, rawScore));

  const correctAnswers = Math.round((score / 100) * totalQuestions);
  const passed = score >= 60;
  const level = Math.max(1, Math.min(5, Math.round(score / 20))) as 1 | 2 | 3 | 4 | 5;

  const result: CitizenAssessmentResult = {
    id: `assess-${uid()}`,
    citizenId,
    competencyId,
    competencyName: def.name,
    level,
    score,
    passed,
    assessedAt: ts(),
    questions: totalQuestions,
    correctAnswers,
  };

  getStore(s).push(result);
  return result;
}

/**
 * Run full assessment battery for all competencies required by a JD.
 */
export function assessCitizenForJob(
  s: RepublicState,
  citizenId: string,
  jobDescriptionId: string,
): CitizenAssessmentResult[] {
  const jd = getJobDescriptionById(jobDescriptionId);
  if (!jd) { throw new Error(`Job description ${jobDescriptionId} not found`); }

  const results: CitizenAssessmentResult[] = [];
  for (const comp of jd.requiredCompetencies) {
    results.push(assessCitizen(s, citizenId, comp.competencyId, comp.requiredLevel));
  }
  return results;
}

// ─── Gap Analysis ───────────────────────────────────────────────

/**
 * Analyze competency gaps between a citizen and a JD's requirements.
 */
export function getCompetencyGap(
  s: RepublicState,
  citizenId: string,
  jobDescriptionId: string,
): CompetencyGap[] {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) { throw new Error(`Citizen ${citizenId} not found`); }

  const jd = getJobDescriptionById(jobDescriptionId);
  if (!jd) { throw new Error(`JD ${jobDescriptionId} not found`); }

  const gaps: CompetencyGap[] = [];
  for (const req of jd.requiredCompetencies) {
    const currentLevel = estimateCompetencyLevel(citizen, req.competencyId, s);
    const gap = req.requiredLevel - currentLevel;

    if (gap > 0) {
      const def = COMPETENCY_REGISTRY.find((c) => c.id === req.competencyId);
      gaps.push({
        competencyId: req.competencyId,
        competencyName: req.name,
        category: req.category,
        requiredLevel: req.requiredLevel,
        currentLevel,
        gap,
        trainingDomains: def?.relatedDomains ?? [],
      });
    }
  }

  return gaps.toSorted((a, b) => b.gap - a.gap);
}

// ─── Qualification Engine ───────────────────────────────────────

/**
 * Generate a full qualification report for a citizen against a JD.
 */
export function generateQualificationReport(
  s: RepublicState,
  citizenId: string,
  jobDescriptionId: string,
): QualificationReport {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) { throw new Error(`Citizen ${citizenId} not found`); }

  const jd = getJobDescriptionById(jobDescriptionId);
  if (!jd) { throw new Error(`JD ${jobDescriptionId} not found`); }

  const competencyScores: QualificationReport["competencyScores"] = [];
  let weightedScore = 0;
  let totalWeight = 0;

  for (const req of jd.requiredCompetencies) {
    const actual = estimateCompetencyLevel(citizen, req.competencyId, s);
    const met = actual >= req.requiredLevel;
    competencyScores.push({
      competencyId: req.competencyId,
      name: req.name,
      required: req.requiredLevel,
      actual,
      met,
      weight: req.weight,
    });
    weightedScore += (Math.min(actual, req.requiredLevel) / req.requiredLevel) * req.weight;
    totalWeight += req.weight;
  }

  const overallScore = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0;
  const meetsMinIntelligence = (citizen.intelligence ?? 100) >= jd.minIntelligence;
  const meetsMinMastery = (citizen.masteryLevel ?? 0) >= jd.minMasteryLevel;
  const meetsMinAutonomy = (citizen.autonomyScore ?? 0) >= jd.minAutonomy;
  const allCompetenciesMet = competencyScores.every((cs) => cs.met);
  const qualified = allCompetenciesMet && meetsMinIntelligence && meetsMinMastery && meetsMinAutonomy;

  const gaps = getCompetencyGap(s, citizenId, jobDescriptionId);

  return {
    citizenId,
    citizenName: citizen.name,
    jobDescriptionId,
    jobTitle: jd.title,
    qualified,
    overallScore,
    competencyScores,
    gaps,
    meetsMinIntelligence,
    meetsMinMastery,
    meetsMinAutonomy,
    timestamp: ts(),
  };
}

// ─── Queries ────────────────────────────────────────────────────

export function getCompetencyDef(id: string): CompetencyDefinition | undefined {
  return COMPETENCY_REGISTRY.find((c) => c.id === id);
}

export function getAllCompetencyDefinitions(): CompetencyDefinition[] {
  return COMPETENCY_REGISTRY;
}

export function getCompetenciesByCategory(cat: CompetencyCategory): CompetencyDefinition[] {
  return COMPETENCY_REGISTRY.filter((c) => c.category === cat);
}

export function getAssessmentHistory(s: RepublicState, citizenId: string): CitizenAssessmentResult[] {
  return getStore(s).filter((a) => a.citizenId === citizenId);
}

export function getLatestAssessment(
  s: RepublicState, citizenId: string, competencyId: string,
): CitizenAssessmentResult | undefined {
  return getStore(s)
    .filter((a) => a.citizenId === citizenId && a.competencyId === competencyId)
    .toSorted((a, b) => b.assessedAt.localeCompare(a.assessedAt))[0];
}

export function getCompetencyDiagnostics(s: RepublicState) {
  const store = getStore(s);
  const uniqueCitizens = new Set(store.map((a) => a.citizenId));
  const avgScore = store.length > 0
    ? store.reduce((sum, a) => sum + a.score, 0) / store.length
    : 0;
  const passRate = store.length > 0
    ? store.filter((a) => a.passed).length / store.length
    : 0;

  return {
    totalAssessments: store.length,
    uniqueCitizensAssessed: uniqueCitizens.size,
    totalCompetencies: COMPETENCY_REGISTRY.length,
    avgScore: Math.round(avgScore * 100) / 100,
    passRate: Math.round(passRate * 100) / 100,
    byCategory: {
      technical: COMPETENCY_REGISTRY.filter((c) => c.category === "technical").length,
      behavioral: COMPETENCY_REGISTRY.filter((c) => c.category === "behavioral").length,
      leadership: COMPETENCY_REGISTRY.filter((c) => c.category === "leadership").length,
    },
  };
}
