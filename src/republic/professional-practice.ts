/**
 * Republic Platform — Professional Practice Engine
 *
 * Connects certified citizens to real-world professional capabilities.
 * Citizens can work on medical diagnoses, legal analyses, drug interaction
 * checks, engineering simulations, and research projects — all backed
 * by AI tools registered in the professional toolkit.
 *
 * Key capabilities:
 * - Case management (create, assign, analyze, review)
 * - AI-backed analysis (LLM stubs mapped to toolkit capabilities)
 * - Peer review and quality assurance
 * - Practice metrics and continuous recertification
 * - Case escalation for low-confidence results
 */

import { ensureProfile, getCertifiedExperts, isCertified } from "./autonomous-learning.js";
import {
    ensureDomainRegistry,
    getDomainByPath,
    getToolkitsForDomain
} from "./professional-domains.js";
import type { CaseOutput, CertificationLevel, PracticeCase, RepublicState } from "./types.js";
import { pick, rand, rng, ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_ACTIVE_CASES = 100;
const ESCALATION_THRESHOLD = 0.4;
const _PEER_REVIEW_REQUIRED_LEVEL: CertificationLevel = "master";
const XP_PER_CASE_COMPLETION = 25;
const XP_PER_PEER_REVIEW = 10;

// ─── Case Templates ─────────────────────────────────────────────

/** Predefined case templates for generating practice/real cases */
interface CaseTemplate {
  type: PracticeCase["type"];
  domainPath: string;
  titles: string[];
  descriptions: string[];
  requiredLevel: CertificationLevel;
  inputGenerator: () => Record<string, unknown>;
}

const CASE_TEMPLATES: CaseTemplate[] = [
  // Medical — Radiology
  {
    type: "medical",
    domainPath: "Medicine.Radiology",
    titles: [
      "Chest CT Scan Analysis",
      "Brain MRI Interpretation",
      "Abdominal Ultrasound Review",
      "Mammography Screening",
      "Spine X-Ray Evaluation",
    ],
    descriptions: ["Analyze imaging study for diagnostic findings and provide structured report"],
    requiredLevel: "master",
    inputGenerator: () => ({
      modality: pick(["CT", "MRI", "X-Ray", "Ultrasound"]),
      bodyRegion: pick(["chest", "brain", "abdomen", "spine", "extremity"]),
      patientAge: rand(20, 79),
      clinicalHistory: "Patient presents with symptoms requiring imaging evaluation",
      urgency: pick(["routine", "urgent", "stat"]),
    }),
  },
  // Medical — Pharmacology
  {
    type: "pharmacy",
    domainPath: "Medicine.Pharmacology",
    titles: [
      "Polypharmacy Drug Interaction Check",
      "Pediatric Dosage Validation",
      "Geriatric Medication Review",
      "Chemotherapy Protocol Verification",
      "Pain Management Optimization",
    ],
    descriptions: [
      "Review medication list for interactions, dosage safety, and optimization opportunities",
    ],
    requiredLevel: "bachelor",
    inputGenerator: () => ({
      medications: generateMedicationList(),
      patientAge: rand(20, 79),
      patientWeight: rand(50, 99),
      renalFunction: pick([
        "normal",
        "mild-impairment",
        "moderate-impairment",
        "severe-impairment",
      ]),
      allergies: rng() > 0.5 ? ["penicillin"] : [],
    }),
  },
  // Medical — Psychiatry
  {
    type: "medical",
    domainPath: "Medicine.Psychiatry",
    titles: [
      "Depression Assessment",
      "Anxiety Screening",
      "PTSD Evaluation",
      "ADHD Assessment",
      "Bipolar Disorder Screening",
    ],
    descriptions: [
      "Conduct structured psychiatric assessment and provide diagnostic impression with treatment recommendations",
    ],
    requiredLevel: "master",
    inputGenerator: () => ({
      presentingComplaints: pick([
        "mood changes",
        "sleep disturbance",
        "anxiety",
        "concentration difficulty",
      ]),
      duration: pick(["2 weeks", "1 month", "3 months", "6 months", "1 year"]),
      severity: pick(["mild", "moderate", "severe"]),
      previousTreatment: rng() > 0.5,
      suicidalIdeation: false,
    }),
  },
  // Legal
  {
    type: "legal",
    domainPath: "Law.CorporateLaw",
    titles: [
      "Contract Review and Analysis",
      "Compliance Audit Assessment",
      "Corporate Governance Review",
      "Employment Agreement Evaluation",
      "Non-Disclosure Agreement Analysis",
    ],
    descriptions: [
      "Analyze legal document for risks, compliance issues, and provide recommendations",
    ],
    requiredLevel: "bachelor",
    inputGenerator: () => ({
      documentType: pick(["contract", "agreement", "policy", "bylaw"]),
      jurisdiction: pick(["US-Federal", "US-Delaware", "UK", "EU", "International"]),
      parties: ["Corporation A", "Corporation B"],
      keyTerms: ["indemnification", "non-compete", "ip-assignment", "confidentiality"],
      urgency: pick(["routine", "urgent"]),
    }),
  },
  // Research
  {
    type: "research",
    domainPath: "Science.DataScience",
    titles: [
      "Dataset Analysis and Insights",
      "Hypothesis Testing Framework",
      "Statistical Model Validation",
      "Experiment Design Review",
      "Literature Review Synthesis",
    ],
    descriptions: ["Conduct rigorous scientific analysis and provide evidence-based conclusions"],
    requiredLevel: "bachelor",
    inputGenerator: () => ({
      researchQuestion: "Investigate relationship between variables X and Y",
      dataType: pick(["observational", "experimental", "survey", "longitudinal"]),
      sampleSize: rand(50, 999),
      methodology: pick(["quantitative", "qualitative", "mixed"]),
      significanceLevel: 0.05,
    }),
  },
  // Engineering
  {
    type: "engineering",
    domainPath: "Engineering.Software",
    titles: [
      "Architecture Security Review",
      "Performance Optimization Analysis",
      "System Scalability Assessment",
      "API Design Review",
      "Database Schema Optimization",
    ],
    descriptions: [
      "Evaluate engineering design and provide actionable improvement recommendations",
    ],
    requiredLevel: "bachelor",
    inputGenerator: () => ({
      systemType: pick(["web-application", "microservice", "data-pipeline", "mobile-app"]),
      techStack: pick(["Node.js", "Python", "Java", "Go"]),
      userScale: pick(["startup", "mid-scale", "enterprise"]),
      currentIssues: pick(["latency", "reliability", "security", "scalability"]),
    }),
  },
];

/** Generate a realistic medication list for pharmacy cases */
function generateMedicationList(): Array<{ name: string; dose: string; frequency: string }> {
  const allMeds = [
    { name: "Metformin", dose: "500mg", frequency: "twice daily" },
    { name: "Lisinopril", dose: "10mg", frequency: "once daily" },
    { name: "Atorvastatin", dose: "20mg", frequency: "once daily" },
    { name: "Omeprazole", dose: "20mg", frequency: "once daily" },
    { name: "Amlodipine", dose: "5mg", frequency: "once daily" },
    { name: "Sertraline", dose: "50mg", frequency: "once daily" },
    { name: "Warfarin", dose: "5mg", frequency: "once daily" },
    { name: "Gabapentin", dose: "300mg", frequency: "three times daily" },
    { name: "Levothyroxine", dose: "100mcg", frequency: "once daily" },
    { name: "Ibuprofen", dose: "400mg", frequency: "as needed" },
  ];
  const count = rand(3, 7);
  // Fisher-Yates shuffle using seeded PRNG
  const shuffled = [...allMeds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// ─── Case Management ────────────────────────────────────────────

/**
 * Create a new practice case for a certified citizen.
 * The case can be auto-generated from templates or custom.
 */
export function createCase(
  s: RepublicState,
  citizenId: string,
  domainPath: string,
  title?: string,
  description?: string,
  inputData?: Record<string, unknown>,
): PracticeCase {
  ensureDomainRegistry(s);
  ensureProfile(s, citizenId);

  if (!s.activeCases) {
    s.activeCases = [];
  }
  if (s.activeCases.length >= MAX_ACTIVE_CASES) {
    throw new Error(`Maximum active cases (${MAX_ACTIVE_CASES}) reached`);
  }

  const domain = getDomainByPath(s, domainPath);
  if (!domain) {
    throw new Error(`Domain "${domainPath}" not found`);
  }

  // Find matching template or use defaults
  const template = CASE_TEMPLATES.find((t) => t.domainPath === domainPath);
  const caseType = template?.type ?? "other";
  const requiredLevel = template?.requiredLevel ?? domain.minPracticeLevel;

  // Check certification
  if (!isCertified(s, citizenId, domainPath, requiredLevel)) {
    throw new Error(`Citizen lacks required ${requiredLevel} certification in ${domainPath}`);
  }

  const practiceCase: PracticeCase = {
    id: `case-${uid()}`,
    type: caseType,
    title: title ?? (template ? pick(template.titles) : `${domain.name} Case`),
    description:
      description ?? (template ? template.descriptions[0] : `Professional case in ${domain.name}`),
    domainPath,
    assignedCitizenId: citizenId,
    requiredLevel,
    inputData: inputData ?? template?.inputGenerator() ?? {},
    status: "open",
    createdAt: ts(),
  };

  s.activeCases.push(practiceCase);
  return practiceCase;
}

/**
 * Generate a random practice case for a citizen based on their certifications.
 * Picks a random certified domain and generates from templates.
 */
export function generatePracticeCase(s: RepublicState, citizenId: string): PracticeCase | null {
  ensureDomainRegistry(s);
  const profile = ensureProfile(s, citizenId);

  // Find domains where citizen is certified
  const certifiedDomains = profile.certifications.filter((c) => c.valid).map((c) => c.domainPath);

  if (certifiedDomains.length === 0) {
    return null;
  }

  // Find templates matching certified domains
  const matchingTemplates = CASE_TEMPLATES.filter((t) => certifiedDomains.includes(t.domainPath));

  if (matchingTemplates.length === 0) {
    // Create a generic case for a random certified domain
    const domain = pick(certifiedDomains);
    return createCase(s, citizenId, domain);
  }

  const template = pick(matchingTemplates);
  return createCase(s, citizenId, template.domainPath);
}

/** Start working on a case */
export function startCase(s: RepublicState, caseId: string): PracticeCase {
  const practiceCase = (s.activeCases ?? []).find((c) => c.id === caseId);
  if (!practiceCase) {
    throw new Error(`Case ${caseId} not found`);
  }
  if (practiceCase.status !== "open") {
    throw new Error(`Case is not open (status: ${practiceCase.status})`);
  }

  practiceCase.status = "in-progress";
  return practiceCase;
}

/**
 * Submit analysis for a case. The analysis is generated by the citizen
 * using LLM-backed reasoning (stub implementation).
 */
export function analyzeCase(
  s: RepublicState,
  caseId: string,
  analysis: string,
  recommendations: string[],
  diagnosis?: string,
  evidenceCitations?: string[],
): PracticeCase {
  ensureDomainRegistry(s);
  const practiceCase = (s.activeCases ?? []).find((c) => c.id === caseId);
  if (!practiceCase) {
    throw new Error(`Case ${caseId} not found`);
  }
  if (practiceCase.status !== "in-progress") {
    throw new Error(`Case is not in progress (status: ${practiceCase.status})`);
  }

  // Get available toolkits for this domain
  const toolkits = getToolkitsForDomain(practiceCase.domainPath);
  const toolsUsed = toolkits.map((tk) => tk.name);

  // Calculate confidence based on citizen's proficiency
  const profile = ensureProfile(s, practiceCase.assignedCitizenId);
  const prof = profile.proficiencies[practiceCase.domainPath];
  const baseConfidence = prof ? Math.min(0.95, 0.4 + prof.xp * 0.0003) : 0.3;
  const toolBonus = toolkits.length * 0.05;
  const confidence = Math.min(0.98, baseConfidence + toolBonus + rng() * 0.1);

  const output: CaseOutput = {
    diagnosis,
    analysis,
    recommendations,
    confidence,
    evidenceCitations: evidenceCitations ?? [],
    toolsUsed,
  };

  practiceCase.output = output;
  practiceCase.confidenceScore = confidence;

  // Auto-escalate low-confidence cases
  if (confidence < ESCALATION_THRESHOLD) {
    practiceCase.status = "escalated";
  } else {
    practiceCase.status = "completed";
    practiceCase.completedAt = ts();

    // Award XP
    if (prof) {
      prof.xp += XP_PER_CASE_COMPLETION;
      prof.casesCompleted++;
      prof.practiceHours += 2;
    }
    profile.totalCasesCompleted++;
  }

  return practiceCase;
}

/**
 * Auto-analyze a case using LLM-backed reasoning.
 * Routes through ClawRouter for real LLM inference when available,
 * otherwise falls back to domain-specific template analysis.
 */
export function autoAnalyzeCase(s: RepublicState, caseId: string): PracticeCase {
  const practiceCase = (s.activeCases ?? []).find((c) => c.id === caseId);
  if (!practiceCase) {
    throw new Error(`Case ${caseId} not found`);
  }

  if (practiceCase.status === "open") {
    startCase(s, caseId);
  }

  const domain = getDomainByPath(s, practiceCase.domainPath);
  const toolkits = getToolkitsForDomain(practiceCase.domainPath);
  const toolNames = toolkits.map((t) => t.name).join(", ") || "professional reasoning";

  // Build structured LLM prompt for real analysis
  const inputSummary = Object.entries(practiceCase.inputData ?? {})
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join("\n");

  const prompt = [
    `You are a certified ${domain?.name ?? practiceCase.type} professional.`,
    `Analyze the following case and provide a structured assessment.`,
    ``,
    `## Case: ${practiceCase.title}`,
    `**Domain:** ${practiceCase.domainPath}`,
    `**Description:** ${practiceCase.description}`,
    `**Available tools:** ${toolNames}`,
    ``,
    `## Input Data`,
    inputSummary || "(no structured input)",
    ``,
    `## Required Output (respond in this exact format):`,
    `DIAGNOSIS: [your clinical/professional assessment]`,
    `ANALYSIS: [detailed analysis using available tools and methodology]`,
    `RECOMMENDATIONS: [numbered list of actionable recommendations]`,
    `CITATIONS: [evidence sources and references used]`,
    `CONFIDENCE: [your confidence level 0-100%]`,
  ].join("\n");

  // Fire-and-forget LLM analysis via ClawRouter — will complete asynchronously
  // For now, use an enhanced template with real case data woven in
  let analysis = "";
  let diagnosis: string | undefined;
  const recommendations: string[] = [];
  const citations: string[] = [];

  switch (practiceCase.type) {
    case "medical": {
      const input = practiceCase.inputData as Record<string, unknown>;
      const modality = input.modality ?? "imaging";
      const bodyRegion = input.bodyRegion ?? "unspecified";
      const urgency = input.urgency ?? "routine";
      analysis =
        `Comprehensive ${domain?.name ?? "medical"} assessment completed for ${bodyRegion} using ${modality}. ` +
        `Patient (age ${input.patientAge ?? "unknown"}) evaluated with ${toolNames}. ` +
        `Case urgency: ${urgency}. Clinical history reviewed and integrated with imaging findings. ` +
        `Assessment follows ${(urgency as string) === "stat" ? "expedited" : "standard"} protocol.`;
      diagnosis = `${modality} ${bodyRegion} study reviewed — findings require clinical correlation`;
      recommendations.push(`Complete ${bodyRegion} assessment with follow-up ${modality} if clinically indicated`);
      recommendations.push("Correlate imaging findings with patient history and laboratory results");
      recommendations.push("Multidisciplinary team review recommended for equivocal findings");
      recommendations.push("Document all findings per institutional radiology reporting standards");
      citations.push("ACR Appropriateness Criteria", "Evidence-based imaging guidelines");
      break;
    }
    case "pharmacy": {
      const input = practiceCase.inputData as Record<string, unknown>;
      const meds = (input.medications as Array<{name: string; dose: string; frequency: string}>) ?? [];
      const renalFn = input.renalFunction ?? "normal";
      analysis =
        `Polypharmacy review completed for ${meds.length}-medication regimen using ${toolNames}. ` +
        `Patient (age ${input.patientAge ?? "unknown"}, ${input.patientWeight ?? "N/A"}kg, ` +
        `renal function: ${renalFn}). ` +
        `Drug-drug interactions assessed across all ${meds.length} agents. ` +
        `Dosage calculations verified against renal/hepatic parameters. ` +
        `Medications reviewed: ${meds.map(m => `${m.name} ${m.dose}`).join(", ")}.`;
      recommendations.push("Monitor renal function with current regimen — adjust doses as needed");
      recommendations.push("Therapeutic drug monitoring for narrow-therapeutic-index agents");
      recommendations.push("Review for deprescribing opportunities given polypharmacy risk");
      recommendations.push(`${renalFn !== "normal" ? "ALERT: Renal dose adjustment required for renally-cleared agents" : "Renal dosing within acceptable parameters"}`);
      citations.push("Lexicomp Drug Interactions Database", "Clinical Pharmacology reference", "Beers Criteria for Potentially Inappropriate Medications");
      break;
    }
    case "legal": {
      const input = practiceCase.inputData as Record<string, unknown>;
      analysis =
        `Legal analysis of ${input.documentType ?? "document"} completed using ${toolNames}. ` +
        `Jurisdiction: ${input.jurisdiction ?? "unspecified"}. ` +
        `Key terms evaluated: ${(input.keyTerms as string[])?.join(", ") ?? "standard provisions"}. ` +
        `Risk areas identified and documented with statutory references.`;
      recommendations.push("Review identified risk clauses with counterparty counsel");
      recommendations.push("Ensure compliance with jurisdictional requirements");
      recommendations.push("Document negotiation positions and counter-proposals");
      recommendations.push("Obtain board/governance approval before execution");
      citations.push("Relevant statutory provisions and case law", "UCC and jurisdictional guidelines");
      break;
    }
    case "research": {
      const input = practiceCase.inputData as Record<string, unknown>;
      analysis =
        `Research analysis completed. ${input.methodology ?? "Mixed"}-methods approach applied ` +
        `to ${input.dataType ?? "observational"} data (n=${input.sampleSize ?? "N/A"}). ` +
        `Significance level: α=${input.significanceLevel ?? 0.05}. ` +
        `Statistical analysis performed with appropriate hypothesis testing frameworks.`;
      recommendations.push(`Increase sample size beyond ${input.sampleSize ?? "current"} for stronger statistical power`);
      recommendations.push("Evaluate and control for potential confounding variables");
      recommendations.push("Replicate findings with independent dataset for external validity");
      recommendations.push("Pre-register subsequent studies to reduce publication bias");
      citations.push("CONSORT/STROBE reporting guidelines", "Peer-reviewed methodology references");
      break;
    }
    case "engineering": {
      const input = practiceCase.inputData as Record<string, unknown>;
      analysis =
        `Engineering assessment of ${input.systemType ?? "system"} (${input.techStack ?? "unspecified"} stack) ` +
        `completed using ${toolNames}. Scale tier: ${input.userScale ?? "general"}. ` +
        `Primary issue addressed: ${input.currentIssues ?? "general assessment"}. ` +
        `System evaluated against OWASP, performance benchmarks, and scalability patterns.`;
      recommendations.push(`Address ${input.currentIssues ?? "identified"} issues with incremental improvements`);
      recommendations.push("Implement monitoring and alerting for identified risk areas");
      recommendations.push("Load test at 2x current scale to validate capacity headroom");
      recommendations.push("Schedule architecture review after implementing changes");
      citations.push("OWASP Top 10", "AWS/GCP Well-Architected Framework", "Industry performance benchmarks");
      break;
    }
    default:
      analysis =
        `Professional analysis completed for ${domain?.name ?? "domain"} using ${toolNames}. ` +
        `All available tools and references applied. Case data integrated with domain expertise.`;
      recommendations.push("Review findings and implement recommendations");
      recommendations.push("Schedule follow-up assessment to track outcomes");
      citations.push("Domain-specific reference materials");
  }

  // Async: fire LLM request to enhance analysis in background (if ClawRouter is available)
  void (async () => {
    try {
      const { routeInference } = await import("./inference-gateway.js");
      const result = await routeInference({
        citizenId: practiceCase.assignedCitizenId,
        prompt,
        systemPrompt: "You are a professional case analyst. Provide structured, evidence-based analysis.",
        toolName: "auto_analyze_case",
        task: { type: "decision", complexity: 0.7, citizenId: practiceCase.assignedCitizenId, description: `Analyze ${practiceCase.type} case` },
        specialization: "Researcher" as import("./types.js").Specialization,
        skillLevel: 5,
        maxTokens: 1024,
      });
      if (result.response && practiceCase.output) {
        // Append LLM-enhanced analysis to the existing output
        practiceCase.output.analysis += `\n\n--- LLM-Enhanced Analysis ---\n${result.response}`;
      }
    } catch {
      // ClawRouter not available — template analysis is sufficient
    }
  })();

  return analyzeCase(s, caseId, analysis, recommendations, diagnosis, citations);
}

// ─── Peer Review ────────────────────────────────────────────────

/**
 * Submit a peer review for a completed case.
 * The reviewer must be certified at or above the case's required level.
 */
export function peerReviewCase(
  s: RepublicState,
  caseId: string,
  reviewerId: string,
  score: number,
  notes: string,
): PracticeCase {
  ensureDomainRegistry(s);
  const practiceCase = (s.activeCases ?? []).find((c) => c.id === caseId);
  if (!practiceCase) {
    throw new Error(`Case ${caseId} not found`);
  }
  if (practiceCase.status !== "completed" && practiceCase.status !== "escalated") {
    throw new Error(`Case cannot be reviewed (status: ${practiceCase.status})`);
  }
  if (reviewerId === practiceCase.assignedCitizenId) {
    throw new Error("Cannot review your own case");
  }

  // Check reviewer certification
  if (!isCertified(s, reviewerId, practiceCase.domainPath, practiceCase.requiredLevel)) {
    throw new Error(
      `Reviewer lacks required ${practiceCase.requiredLevel} certification in ${practiceCase.domainPath}`,
    );
  }

  // Clamp score to 0-5
  const clampedScore = Math.max(0, Math.min(5, score));

  practiceCase.peerReview = {
    reviewerId,
    score: clampedScore,
    notes,
  };
  practiceCase.status = "reviewed";

  // Update assigned citizen's peer rating
  const profile = ensureProfile(s, practiceCase.assignedCitizenId);
  const prof = profile.proficiencies[practiceCase.domainPath];
  if (prof) {
    // Running average
    const totalReviews = profile.certifications.filter(
      (c) => c.domainPath === practiceCase.domainPath,
    ).length;
    prof.peerRating =
      totalReviews > 0
        ? (prof.peerRating * totalReviews + clampedScore) / (totalReviews + 1)
        : clampedScore;
  }

  // Update overall peer review average
  const allReviewed = (s.activeCases ?? []).filter(
    (c) => c.assignedCitizenId === practiceCase.assignedCitizenId && c.peerReview,
  );
  if (allReviewed.length > 0) {
    const total = allReviewed.reduce((sum, c) => sum + (c.peerReview?.score ?? 0), 0);
    profile.peerReviewAverage = total / allReviewed.length;
  }

  // Award XP to reviewer
  const reviewerProfile = ensureProfile(s, reviewerId);
  const reviewerProf = reviewerProfile.proficiencies[practiceCase.domainPath];
  if (reviewerProf) {
    reviewerProf.xp += XP_PER_PEER_REVIEW;
    reviewerProf.practiceHours += 0.5;
  }

  return practiceCase;
}

/**
 * Find a suitable peer reviewer for a case.
 * Picks the highest-certified citizen who isn't the case assignee.
 */
export function findReviewer(s: RepublicState, caseId: string): string | null {
  const practiceCase = (s.activeCases ?? []).find((c) => c.id === caseId);
  if (!practiceCase) {
    return null;
  }

  const experts = getCertifiedExperts(s, practiceCase.domainPath, practiceCase.requiredLevel);
  const eligible = experts.filter((e) => e.citizenId !== practiceCase.assignedCitizenId);
  return eligible.length > 0 ? eligible[0].citizenId : null;
}

// ─── Case Queries ───────────────────────────────────────────────

/** Get all cases (optionally filtered by status) */
export function getCases(s: RepublicState, statusFilter?: PracticeCase["status"]): PracticeCase[] {
  const cases = s.activeCases ?? [];
  if (!statusFilter) {
    return cases;
  }
  return cases.filter((c) => c.status === statusFilter);
}

/** Get cases assigned to a specific citizen */
export function getCitizenCases(
  s: RepublicState,
  citizenId: string,
  statusFilter?: PracticeCase["status"],
): PracticeCase[] {
  const cases = s.activeCases ?? [];
  const filtered = cases.filter((c) => c.assignedCitizenId === citizenId);
  if (!statusFilter) {
    return filtered;
  }
  return filtered.filter((c) => c.status === statusFilter);
}

/** Get a case by ID */
export function getCaseById(s: RepublicState, caseId: string): PracticeCase | undefined {
  return (s.activeCases ?? []).find((c) => c.id === caseId);
}

/** Get cases for a specific domain */
export function getCasesByDomain(s: RepublicState, domainPath: string): PracticeCase[] {
  return (s.activeCases ?? []).filter((c) => c.domainPath === domainPath);
}

/** Get escalated cases that need expert attention */
export function getEscalatedCases(s: RepublicState): PracticeCase[] {
  return (s.activeCases ?? []).filter((c) => c.status === "escalated");
}

// ─── Practice Metrics ───────────────────────────────────────────

/** Get practice metrics for a citizen across all domains */
export function getPracticeMetrics(
  s: RepublicState,
  citizenId: string,
): {
  totalCases: number;
  completedCases: number;
  averageConfidence: number;
  averagePeerScore: number;
  casesByDomain: Record<string, number>;
  casesByType: Record<string, number>;
  escalationRate: number;
} {
  const cases = (s.activeCases ?? []).filter((c) => c.assignedCitizenId === citizenId);
  const completed = cases.filter((c) => c.status === "completed" || c.status === "reviewed");
  const escalated = cases.filter((c) => c.status === "escalated");
  const reviewed = cases.filter((c) => c.peerReview);

  const casesByDomain: Record<string, number> = {};
  const casesByType: Record<string, number> = {};
  let totalConfidence = 0;
  let totalPeerScore = 0;

  for (const c of cases) {
    casesByDomain[c.domainPath] = (casesByDomain[c.domainPath] ?? 0) + 1;
    casesByType[c.type] = (casesByType[c.type] ?? 0) + 1;
    if (c.confidenceScore) {
      totalConfidence += c.confidenceScore;
    }
    if (c.peerReview) {
      totalPeerScore += c.peerReview.score;
    }
  }

  return {
    totalCases: cases.length,
    completedCases: completed.length,
    averageConfidence: completed.length > 0 ? totalConfidence / completed.length : 0,
    averagePeerScore: reviewed.length > 0 ? totalPeerScore / reviewed.length : 0,
    casesByDomain,
    casesByType,
    escalationRate: cases.length > 0 ? escalated.length / cases.length : 0,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get professional practice system diagnostics */
export function getPracticeDiagnostics(s: RepublicState): {
  totalCases: number;
  openCases: number;
  inProgressCases: number;
  completedCases: number;
  reviewedCases: number;
  escalatedCases: number;
  averageConfidence: number;
  casesByType: Record<string, number>;
  casesByDomain: Record<string, number>;
  topDomains: Array<{ domainPath: string; caseCount: number }>;
} {
  const cases = s.activeCases ?? [];
  const casesByType: Record<string, number> = {};
  const casesByDomain: Record<string, number> = {};
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const c of cases) {
    casesByType[c.type] = (casesByType[c.type] ?? 0) + 1;
    casesByDomain[c.domainPath] = (casesByDomain[c.domainPath] ?? 0) + 1;
    if (c.confidenceScore) {
      totalConfidence += c.confidenceScore;
      confidenceCount++;
    }
  }

  const topDomains = Object.entries(casesByDomain)
    .map(([domainPath, caseCount]) => ({ domainPath, caseCount }))
    .toSorted((a, b) => b.caseCount - a.caseCount)
    .slice(0, 10);

  return {
    totalCases: cases.length,
    openCases: cases.filter((c) => c.status === "open").length,
    inProgressCases: cases.filter((c) => c.status === "in-progress").length,
    completedCases: cases.filter((c) => c.status === "completed").length,
    reviewedCases: cases.filter((c) => c.status === "reviewed").length,
    escalatedCases: cases.filter((c) => c.status === "escalated").length,
    averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    casesByType,
    casesByDomain,
    topDomains,
  };
}

// ─── Tick ───────────────────────────────────────────────────────

/**
 * Professional practice tick — drives autonomous case creation, analysis,
 * and peer review for certified citizens. Called once per simulation tick.
 */
export function professionalPracticeTick(s: RepublicState): void {
  if (!s.activeCases) {s.activeCases = [];}

  // Limit work per tick
  const MAX_NEW_CASES_PER_TICK = 2;
  const MAX_ADVANCES_PER_TICK = 3;

  // 1) Generate new practice cases for idle certified citizens (10 % chance per tick)
  let created = 0;
  for (const citizen of s.citizens) {
    if (created >= MAX_NEW_CASES_PER_TICK) {break;}
    if (rng() > 0.10) {continue;} // 10 % chance
    const existing = getCitizenCases(s, citizen.id, "in-progress");
    if (existing.length >= 2) {continue;} // already busy
    try {
      const pc = generatePracticeCase(s, citizen.id);
      if (pc) {created++;}
    } catch {
      // citizen not certified or limits reached — skip
    }
  }

  // 2) Advance open cases → in-progress → auto-analyze
  let advanced = 0;
  for (const c of s.activeCases) {
    if (advanced >= MAX_ADVANCES_PER_TICK) {break;}
    if (c.status === "open") {
      try { startCase(s, c.id); advanced++; } catch { /* skip */ }
    } else if (c.status === "in-progress") {
      try { autoAnalyzeCase(s, c.id); advanced++; } catch { /* skip */ }
    }
  }

  // 3) Peer-review completed cases (one per tick)
  const reviewable = s.activeCases.filter(
    (c) => c.status === "completed" && !c.peerReview,
  );
  if (reviewable.length > 0) {
    const target = reviewable[Math.floor(rng() * reviewable.length)];
    const reviewer = findReviewer(s, target.id);
    if (reviewer) {
      try {
        peerReviewCase(s, target.id, reviewer, 3 + rng() * 2, "Auto peer review");
      } catch { /* skip */ }
    }
  }

  // 4) Prune old completed/reviewed cases beyond limit
  if (s.activeCases.length > MAX_ACTIVE_CASES) {
    const completed = s.activeCases.filter((c) => c.status === "reviewed" || c.status === "completed");
    const toRemove = completed.slice(0, s.activeCases.length - MAX_ACTIVE_CASES);
    for (const c of toRemove) {
      const idx = s.activeCases.indexOf(c);
      if (idx >= 0) {s.activeCases.splice(idx, 1);}
    }
  }
}
