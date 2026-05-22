/**
 * Republic Platform — HR Job Description Catalog
 *
 * Every Specialization maps to a formal Job Description (JD) with:
 * - Responsibilities, required & preferred competencies
 * - Salary bands (credits per pay-cycle)
 * - Education & certification requirements
 * - Career progression paths (from → to)
 *
 * The catalog is the authoritative source for hiring, assessment, payroll,
 * and training decisions across the entire Republic HR system.
 */

import type { Specialization } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────

export type CompetencyCategory = "technical" | "behavioral" | "leadership";

/** A single competency requirement within a JD */
export interface CompetencyRequirement {
  competencyId: string;
  name: string;
  /** 1 = Novice, 2 = Beginner, 3 = Intermediate, 4 = Advanced, 5 = Expert */
  requiredLevel: 1 | 2 | 3 | 4 | 5;
  /** Importance weight 0–1 (used in composite scoring) */
  weight: number;
  category: CompetencyCategory;
}

export interface SalaryBand {
  min: number;
  mid: number;
  max: number;
}

export interface JobDescription {
  id: string;
  title: string;
  specialization: Specialization;
  department: string;
  division: string;
  summary: string;
  responsibilities: string[];
  requiredCompetencies: CompetencyRequirement[];
  preferredCompetencies: CompetencyRequirement[];
  minIntelligence: number;
  minMasteryLevel: number;
  minAutonomy: number;
  educationRequirements: string[];
  certificationPaths: string[];
  salaryBand: SalaryBand;
  careerPath: { from: string[]; to: string[] };
}

// ─── Helpers ────────────────────────────────────────────────────

function cReq(
  id: string, name: string, level: 1|2|3|4|5, weight: number, cat: CompetencyCategory,
): CompetencyRequirement {
  return { competencyId: id, name, requiredLevel: level, weight, category: cat };
}

// ─── Job Description Catalog ────────────────────────────────────

export const JOB_CATALOG: JobDescription[] = [
  // ─── Engineering & Tech ───────────────────────────────────────
  {
    id: "JD-Developer",
    title: "Software Developer",
    specialization: "Developer",
    department: "Engineering",
    division: "Software Development",
    summary: "Designs, codes, tests, and maintains software systems. Translates requirements into production-quality code and contributes to architecture decisions.",
    responsibilities: [
      "Write clean, well-tested code following engineering standards",
      "Participate in code reviews and provide constructive feedback",
      "Debug and resolve production issues within SLA timelines",
      "Collaborate with architects on system design decisions",
      "Write and maintain technical documentation",
      "Contribute to CI/CD pipeline improvements",
      "Mentor junior developers through pair programming",
      "Estimate effort and deliver on sprint commitments",
    ],
    requiredCompetencies: [
      cReq("programming", "Programming & Algorithms", 4, 0.25, "technical"),
      cReq("system-design", "System Design", 3, 0.15, "technical"),
      cReq("testing", "Testing & QA", 3, 0.15, "technical"),
      cReq("problem-solving", "Problem Solving", 4, 0.20, "behavioral"),
      cReq("communication", "Communication", 3, 0.10, "behavioral"),
      cReq("collaboration", "Team Collaboration", 3, 0.15, "behavioral"),
    ],
    preferredCompetencies: [
      cReq("devops", "DevOps & CI/CD", 3, 0.10, "technical"),
      cReq("mentoring", "Mentoring", 2, 0.05, "leadership"),
    ],
    minIntelligence: 80,
    minMasteryLevel: 0.3,
    minAutonomy: 0.4,
    educationRequirements: ["web-development", "algorithms", "testing", "system-design"],
    certificationPaths: ["Engineering.Software"],
    salaryBand: { min: 60, mid: 90, max: 130 },
    careerPath: { from: ["Generalist"], to: ["Architect", "Strategist"] },
  },
  {
    id: "JD-Architect",
    title: "Systems Architect",
    specialization: "Architect",
    department: "Engineering",
    division: "Architecture",
    summary: "Designs large-scale distributed systems, defines technical standards, and provides architectural guidance across the engineering department.",
    responsibilities: [
      "Define system architecture for new and existing platforms",
      "Create and maintain architecture decision records (ADRs)",
      "Evaluate technology choices and make buy-vs-build decisions",
      "Lead technical design reviews and architecture board",
      "Establish coding standards and engineering best practices",
      "Mentor senior engineers on design patterns",
      "Conduct capacity planning and scalability analysis",
      "Drive cross-team technical alignment",
    ],
    requiredCompetencies: [
      cReq("system-design", "System Design", 5, 0.25, "technical"),
      cReq("programming", "Programming & Algorithms", 4, 0.15, "technical"),
      cReq("cloud-infra", "Cloud Infrastructure", 4, 0.15, "technical"),
      cReq("strategic-thinking", "Strategic Thinking", 4, 0.15, "leadership"),
      cReq("communication", "Communication", 4, 0.15, "behavioral"),
      cReq("decision-making", "Decision Making", 4, 0.15, "leadership"),
    ],
    preferredCompetencies: [
      cReq("security", "Security Engineering", 3, 0.10, "technical"),
      cReq("mentoring", "Mentoring", 4, 0.05, "leadership"),
    ],
    minIntelligence: 100,
    minMasteryLevel: 0.6,
    minAutonomy: 0.7,
    educationRequirements: ["system-design", "cloud-architecture", "distributed-systems", "microservices"],
    certificationPaths: ["Engineering.Software"],
    salaryBand: { min: 100, mid: 150, max: 200 },
    careerPath: { from: ["Developer", "Engineer"], to: ["Strategist"] },
  },
  {
    id: "JD-Engineer",
    title: "Systems Engineer",
    specialization: "Engineer",
    department: "Engineering",
    division: "Systems Engineering",
    summary: "Builds, integrates, and maintains complex hardware and software systems. Ensures reliability, performance, and security of infrastructure.",
    responsibilities: [
      "Design and implement infrastructure components",
      "Monitor system health and respond to incidents",
      "Automate deployment and provisioning workflows",
      "Perform capacity planning and performance tuning",
      "Document system configurations and runbooks",
      "Participate in on-call rotation",
      "Evaluate and integrate new technologies",
      "Collaborate with developers on deployability",
    ],
    requiredCompetencies: [
      cReq("infrastructure", "Infrastructure & Operations", 4, 0.25, "technical"),
      cReq("devops", "DevOps & CI/CD", 4, 0.20, "technical"),
      cReq("networking", "Networking & Protocols", 3, 0.15, "technical"),
      cReq("problem-solving", "Problem Solving", 4, 0.15, "behavioral"),
      cReq("reliability", "Reliability Engineering", 3, 0.15, "technical"),
      cReq("documentation", "Documentation", 3, 0.10, "behavioral"),
    ],
    preferredCompetencies: [
      cReq("security", "Security Engineering", 3, 0.10, "technical"),
    ],
    minIntelligence: 85,
    minMasteryLevel: 0.4,
    minAutonomy: 0.5,
    educationRequirements: ["devops", "cloud-architecture", "security"],
    certificationPaths: ["Engineering.Software"],
    salaryBand: { min: 70, mid: 105, max: 145 },
    careerPath: { from: ["Developer", "Generalist"], to: ["Architect"] },
  },
  // ─── Science & Research ───────────────────────────────────────
  {
    id: "JD-Scientist",
    title: "Research Scientist",
    specialization: "Scientist",
    department: "Research & Development",
    division: "Fundamental Research",
    summary: "Conducts original research, designs experiments, publishes findings, and advances the Republic's scientific knowledge base.",
    responsibilities: [
      "Design and conduct rigorous scientific experiments",
      "Analyze experimental data using statistical methods",
      "Publish research papers and present findings",
      "Collaborate with cross-disciplinary research teams",
      "Write grant proposals and research plans",
      "Mentor research assistants and junior scientists",
      "Review peers' research for quality and rigor",
      "Identify novel research directions",
    ],
    requiredCompetencies: [
      cReq("research-methods", "Research Methodology", 5, 0.25, "technical"),
      cReq("data-analysis", "Data Analysis & Statistics", 4, 0.20, "technical"),
      cReq("critical-thinking", "Critical Thinking", 5, 0.20, "behavioral"),
      cReq("scientific-writing", "Scientific Writing", 4, 0.15, "technical"),
      cReq("curiosity", "Intellectual Curiosity", 4, 0.10, "behavioral"),
      cReq("collaboration", "Team Collaboration", 3, 0.10, "behavioral"),
    ],
    preferredCompetencies: [
      cReq("ml-ai", "Machine Learning & AI", 3, 0.10, "technical"),
      cReq("mentoring", "Mentoring", 3, 0.05, "leadership"),
    ],
    minIntelligence: 110,
    minMasteryLevel: 0.5,
    minAutonomy: 0.6,
    educationRequirements: ["research", "mathematics", "physics"],
    certificationPaths: ["Science.DataScience"],
    salaryBand: { min: 80, mid: 120, max: 170 },
    careerPath: { from: ["Researcher", "Generalist"], to: ["Strategist"] },
  },
  {
    id: "JD-Researcher",
    title: "Research Analyst",
    specialization: "Researcher",
    department: "Research & Development",
    division: "Applied Research",
    summary: "Investigates specific problems, compiles data, conducts literature reviews, and supports senior scientists with analysis and reporting.",
    responsibilities: [
      "Conduct systematic literature reviews",
      "Collect, clean, and analyze datasets",
      "Prepare research reports and summaries",
      "Assist in experimental design and execution",
      "Maintain research databases and documentation",
      "Present findings to stakeholders",
    ],
    requiredCompetencies: [
      cReq("research-methods", "Research Methodology", 3, 0.25, "technical"),
      cReq("data-analysis", "Data Analysis & Statistics", 3, 0.25, "technical"),
      cReq("critical-thinking", "Critical Thinking", 3, 0.20, "behavioral"),
      cReq("documentation", "Documentation", 3, 0.15, "behavioral"),
      cReq("communication", "Communication", 3, 0.15, "behavioral"),
    ],
    preferredCompetencies: [
      cReq("programming", "Programming & Algorithms", 2, 0.10, "technical"),
    ],
    minIntelligence: 90,
    minMasteryLevel: 0.3,
    minAutonomy: 0.4,
    educationRequirements: ["research", "data-analysis"],
    certificationPaths: ["Science.DataScience"],
    salaryBand: { min: 50, mid: 75, max: 110 },
    careerPath: { from: ["Generalist"], to: ["Scientist", "Analyst"] },
  },
  {
    id: "JD-Mathematician",
    title: "Mathematician",
    specialization: "Mathematician",
    department: "Research & Development",
    division: "Theoretical Research",
    summary: "Applies mathematical theory to solve complex problems in cryptography, optimization, modeling, and algorithm design.",
    responsibilities: [
      "Develop mathematical models for complex systems",
      "Apply optimization algorithms to real-world problems",
      "Support cryptography and security research",
      "Collaborate with engineers on algorithm design",
      "Publish theoretical findings",
      "Review mathematical proofs and models",
    ],
    requiredCompetencies: [
      cReq("mathematics", "Advanced Mathematics", 5, 0.30, "technical"),
      cReq("programming", "Programming & Algorithms", 3, 0.15, "technical"),
      cReq("critical-thinking", "Critical Thinking", 5, 0.20, "behavioral"),
      cReq("research-methods", "Research Methodology", 4, 0.15, "technical"),
      cReq("problem-solving", "Problem Solving", 5, 0.20, "behavioral"),
    ],
    preferredCompetencies: [
      cReq("ml-ai", "Machine Learning & AI", 3, 0.10, "technical"),
    ],
    minIntelligence: 120,
    minMasteryLevel: 0.5,
    minAutonomy: 0.5,
    educationRequirements: ["mathematics", "algorithms", "physics"],
    certificationPaths: [],
    salaryBand: { min: 75, mid: 115, max: 160 },
    careerPath: { from: ["Generalist"], to: ["Scientist"] },
  },
  // ─── Medical & Health ─────────────────────────────────────────
  {
    id: "JD-Doctor",
    title: "Medical Officer",
    specialization: "Doctor",
    department: "Health & Medical Sciences",
    division: "Clinical Practice",
    summary: "Diagnoses and treats conditions using evidence-based medicine, manages patient cases, and advances medical research within the Republic.",
    responsibilities: [
      "Conduct diagnostic assessments and clinical evaluations",
      "Prescribe treatments following evidence-based protocols",
      "Manage complex patient cases and multidisciplinary teams",
      "Maintain accurate medical documentation",
      "Participate in peer-reviewed case conferences",
      "Stay current with medical literature and guidelines",
      "Mentor medical residents and junior staff",
      "Contribute to clinical research initiatives",
    ],
    requiredCompetencies: [
      cReq("clinical-diagnosis", "Clinical Diagnosis", 5, 0.25, "technical"),
      cReq("medical-knowledge", "Medical Knowledge", 5, 0.20, "technical"),
      cReq("patient-care", "Patient Care & Ethics", 4, 0.15, "behavioral"),
      cReq("critical-thinking", "Critical Thinking", 5, 0.15, "behavioral"),
      cReq("communication", "Communication", 4, 0.10, "behavioral"),
      cReq("decision-making", "Decision Making", 4, 0.15, "leadership"),
    ],
    preferredCompetencies: [
      cReq("research-methods", "Research Methodology", 3, 0.10, "technical"),
      cReq("mentoring", "Mentoring", 3, 0.05, "leadership"),
    ],
    minIntelligence: 110,
    minMasteryLevel: 0.6,
    minAutonomy: 0.6,
    educationRequirements: ["medicine", "pharmacology", "surgery", "psychology"],
    certificationPaths: ["Medicine.Radiology", "Medicine.Pharmacology", "Medicine.Psychiatry"],
    salaryBand: { min: 100, mid: 160, max: 220 },
    careerPath: { from: ["Medic"], to: ["Scientist"] },
  },
  {
    id: "JD-Medic",
    title: "Field Medic",
    specialization: "Medic",
    department: "Health & Medical Sciences",
    division: "Emergency Services",
    summary: "Provides first-response medical care, triage, and stabilization in field conditions. Supports clinical teams with basic medical procedures.",
    responsibilities: [
      "Provide emergency first-aid and triage",
      "Stabilize patients for transport or further care",
      "Maintain medical supplies and equipment readiness",
      "Document patient encounters and vital signs",
      "Assist doctors with clinical procedures",
      "Complete ongoing training certifications",
    ],
    requiredCompetencies: [
      cReq("emergency-medicine", "Emergency Medicine", 3, 0.25, "technical"),
      cReq("patient-care", "Patient Care & Ethics", 3, 0.25, "behavioral"),
      cReq("stress-management", "Stress Management", 4, 0.20, "behavioral"),
      cReq("medical-knowledge", "Medical Knowledge", 2, 0.15, "technical"),
      cReq("communication", "Communication", 3, 0.15, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 70,
    minMasteryLevel: 0.2,
    minAutonomy: 0.3,
    educationRequirements: ["medicine", "nursing"],
    certificationPaths: [],
    salaryBand: { min: 40, mid: 60, max: 85 },
    careerPath: { from: ["Generalist"], to: ["Doctor"] },
  },
  {
    id: "JD-Psychologist",
    title: "Psychologist",
    specialization: "Psychologist",
    department: "Health & Medical Sciences",
    division: "Behavioral Health",
    summary: "Assesses cognitive and behavioral health, conducts therapy, and supports citizen well-being through evidence-based psychological interventions.",
    responsibilities: [
      "Conduct psychological assessments and evaluations",
      "Provide individual and group therapy sessions",
      "Develop treatment plans for behavioral issues",
      "Research cognitive and behavioral patterns",
      "Support organizational wellness programs",
      "Maintain clinical documentation and case notes",
    ],
    requiredCompetencies: [
      cReq("psychology", "Psychology & Behavioral Science", 5, 0.25, "technical"),
      cReq("empathy", "Empathy & Emotional Intelligence", 5, 0.20, "behavioral"),
      cReq("clinical-diagnosis", "Clinical Diagnosis", 4, 0.20, "technical"),
      cReq("communication", "Communication", 4, 0.15, "behavioral"),
      cReq("research-methods", "Research Methodology", 3, 0.10, "technical"),
      cReq("ethics", "Professional Ethics", 4, 0.10, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 100,
    minMasteryLevel: 0.5,
    minAutonomy: 0.5,
    educationRequirements: ["psychology", "neuroscience", "behavioral-therapy"],
    certificationPaths: ["Medicine.Psychiatry"],
    salaryBand: { min: 70, mid: 105, max: 150 },
    careerPath: { from: ["Generalist"], to: ["Doctor", "Scientist"] },
  },
  // ─── Creative & Arts ──────────────────────────────────────────
  {
    id: "JD-Artist",
    title: "Creative Artist",
    specialization: "Artist",
    department: "Creative Services",
    division: "Visual Arts",
    summary: "Creates visual content including graphics, illustrations, animations, and multimedia experiences for the Republic's initiatives.",
    responsibilities: [
      "Create visual assets for projects and campaigns",
      "Develop brand-consistent design systems",
      "Collaborate with writers and developers on multimedia",
      "Iterate designs based on stakeholder feedback",
      "Maintain asset libraries and design documentation",
      "Explore emerging creative technologies",
    ],
    requiredCompetencies: [
      cReq("visual-design", "Visual Design & Composition", 4, 0.30, "technical"),
      cReq("creativity", "Creative Thinking", 5, 0.25, "behavioral"),
      cReq("tools-proficiency", "Design Tools Proficiency", 4, 0.20, "technical"),
      cReq("communication", "Communication", 3, 0.15, "behavioral"),
      cReq("adaptability", "Adaptability", 3, 0.10, "behavioral"),
    ],
    preferredCompetencies: [
      cReq("animation", "Animation & Motion Graphics", 3, 0.10, "technical"),
    ],
    minIntelligence: 70,
    minMasteryLevel: 0.3,
    minAutonomy: 0.4,
    educationRequirements: ["graphic-design", "ui-ux-design", "animation", "photography"],
    certificationPaths: [],
    salaryBand: { min: 50, mid: 75, max: 110 },
    careerPath: { from: ["Generalist"], to: ["Writer", "Musician"] },
  },
  {
    id: "JD-Musician",
    title: "Music Composer & Producer",
    specialization: "Musician",
    department: "Creative Services",
    division: "Audio Production",
    summary: "Composes, produces, and engineers musical works and audio content for Republic media, events, and cultural programs.",
    responsibilities: [
      "Compose original musical pieces and soundtracks",
      "Produce and mix audio content",
      "Collaborate with filmmakers and content creators",
      "Maintain studio equipment and software",
      "Explore new music technologies and AI composition",
      "Perform live for Republic events",
    ],
    requiredCompetencies: [
      cReq("music-composition", "Music Composition", 4, 0.30, "technical"),
      cReq("audio-engineering", "Audio Engineering", 4, 0.25, "technical"),
      cReq("creativity", "Creative Thinking", 4, 0.20, "behavioral"),
      cReq("collaboration", "Team Collaboration", 3, 0.15, "behavioral"),
      cReq("adaptability", "Adaptability", 3, 0.10, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 70,
    minMasteryLevel: 0.3,
    minAutonomy: 0.4,
    educationRequirements: ["music-theory", "audio-engineering"],
    certificationPaths: [],
    salaryBand: { min: 45, mid: 70, max: 100 },
    careerPath: { from: ["Generalist", "Artist"], to: [] },
  },
  {
    id: "JD-Writer",
    title: "Content Writer & Editor",
    specialization: "Writer",
    department: "Creative Services",
    division: "Content Production",
    summary: "Produces written content including reports, documentation, creative works, and communications for Republic audiences.",
    responsibilities: [
      "Write and edit technical and creative content",
      "Maintain Republic knowledge base and documentation",
      "Create reports, briefs, and publications",
      "Develop content strategies for Republic initiatives",
      "Edit and proofread peer content for clarity",
      "Research topics for accurate, in-depth writing",
    ],
    requiredCompetencies: [
      cReq("writing", "Writing & Editing", 5, 0.30, "technical"),
      cReq("research-methods", "Research Methodology", 3, 0.15, "technical"),
      cReq("critical-thinking", "Critical Thinking", 4, 0.20, "behavioral"),
      cReq("communication", "Communication", 4, 0.20, "behavioral"),
      cReq("adaptability", "Adaptability", 3, 0.15, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 85,
    minMasteryLevel: 0.3,
    minAutonomy: 0.5,
    educationRequirements: ["creative-writing", "copywriting", "technical-writing"],
    certificationPaths: [],
    salaryBand: { min: 45, mid: 70, max: 100 },
    careerPath: { from: ["Generalist"], to: [] },
  },
  // ─── Diplomacy & Governance ───────────────────────────────────
  {
    id: "JD-Diplomat",
    title: "Diplomatic Officer",
    specialization: "Diplomat",
    department: "Foreign Affairs",
    division: "Diplomatic Corps",
    summary: "Represents the Republic in inter-state relations, negotiates treaties, and manages diplomatic channels with external entities.",
    responsibilities: [
      "Conduct diplomatic negotiations and treaty drafting",
      "Manage inter-republic communication channels",
      "Analyze geopolitical developments and advise leadership",
      "Represent Republic interests at summits and councils",
      "Build and maintain diplomatic relationships",
      "Prepare briefing papers and policy recommendations",
      "Coordinate cultural exchange programs",
      "Resolve international disputes through mediation",
    ],
    requiredCompetencies: [
      cReq("negotiation", "Negotiation & Persuasion", 5, 0.25, "behavioral"),
      cReq("geopolitics", "Geopolitical Analysis", 4, 0.20, "technical"),
      cReq("communication", "Communication", 5, 0.20, "behavioral"),
      cReq("cultural-competence", "Cultural Competence", 4, 0.15, "behavioral"),
      cReq("strategic-thinking", "Strategic Thinking", 4, 0.10, "leadership"),
      cReq("ethics", "Professional Ethics", 4, 0.10, "behavioral"),
    ],
    preferredCompetencies: [
      cReq("writing", "Writing & Editing", 3, 0.05, "technical"),
    ],
    minIntelligence: 100,
    minMasteryLevel: 0.5,
    minAutonomy: 0.6,
    educationRequirements: ["diplomacy", "international-relations", "political-science", "law"],
    certificationPaths: ["Law.CorporateLaw"],
    salaryBand: { min: 80, mid: 120, max: 170 },
    careerPath: { from: ["Negotiator", "Generalist"], to: ["Ambassador", "Strategist"] },
  },
  {
    id: "JD-Negotiator",
    title: "Negotiation Specialist",
    specialization: "Negotiator",
    department: "Foreign Affairs",
    division: "Conflict Resolution",
    summary: "Specializes in high-stakes negotiations, conflict mediation, and deal structuring for the Republic.",
    responsibilities: [
      "Lead complex multi-party negotiations",
      "Mediate disputes between departments or citizens",
      "Structure deals and partnership agreements",
      "Train citizens in negotiation techniques",
      "Research counterparty positions and interests",
      "Document negotiation outcomes and lessons learned",
    ],
    requiredCompetencies: [
      cReq("negotiation", "Negotiation & Persuasion", 5, 0.35, "behavioral"),
      cReq("empathy", "Empathy & Emotional Intelligence", 4, 0.20, "behavioral"),
      cReq("communication", "Communication", 4, 0.20, "behavioral"),
      cReq("critical-thinking", "Critical Thinking", 4, 0.15, "behavioral"),
      cReq("stress-management", "Stress Management", 3, 0.10, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 90,
    minMasteryLevel: 0.4,
    minAutonomy: 0.5,
    educationRequirements: ["diplomacy", "communication", "leadership"],
    certificationPaths: [],
    salaryBand: { min: 65, mid: 95, max: 135 },
    careerPath: { from: ["Generalist"], to: ["Diplomat", "Ambassador"] },
  },
  {
    id: "JD-Ambassador",
    title: "Republic Ambassador",
    specialization: "Ambassador",
    department: "Foreign Affairs",
    division: "Embassy Network",
    summary: "Serves as the Republic's highest diplomatic representative, managing embassy operations and strategic foreign policy.",
    responsibilities: [
      "Lead embassy operations and diplomatic missions",
      "Advise Republic leadership on foreign policy",
      "Negotiate strategic alliances and treaties",
      "Represent the Republic at international forums",
      "Manage diplomatic staff and resources",
      "Crisis management and emergency diplomacy",
    ],
    requiredCompetencies: [
      cReq("strategic-thinking", "Strategic Thinking", 5, 0.25, "leadership"),
      cReq("negotiation", "Negotiation & Persuasion", 5, 0.20, "behavioral"),
      cReq("leadership-management", "Leadership & Management", 5, 0.20, "leadership"),
      cReq("communication", "Communication", 5, 0.15, "behavioral"),
      cReq("geopolitics", "Geopolitical Analysis", 4, 0.10, "technical"),
      cReq("decision-making", "Decision Making", 5, 0.10, "leadership"),
    ],
    preferredCompetencies: [],
    minIntelligence: 110,
    minMasteryLevel: 0.7,
    minAutonomy: 0.8,
    educationRequirements: ["diplomacy", "international-relations", "leadership"],
    certificationPaths: [],
    salaryBand: { min: 120, mid: 180, max: 250 },
    careerPath: { from: ["Diplomat"], to: ["Strategist"] },
  },
  // ─── Strategy & Analysis ──────────────────────────────────────
  {
    id: "JD-Strategist",
    title: "Chief Strategist",
    specialization: "Strategist",
    department: "Executive Office",
    division: "Strategic Planning",
    summary: "Formulates Republic-wide strategy, coordinates cross-department initiatives, and provides senior-level advisory to governance.",
    responsibilities: [
      "Develop and maintain Republic strategic plans",
      "Analyze trends and forecast future scenarios",
      "Coordinate cross-department strategic initiatives",
      "Advise governance on policy and resource allocation",
      "Lead strategic reviews and planning sessions",
      "Build consensus among department leaders",
    ],
    requiredCompetencies: [
      cReq("strategic-thinking", "Strategic Thinking", 5, 0.30, "leadership"),
      cReq("data-analysis", "Data Analysis & Statistics", 4, 0.15, "technical"),
      cReq("leadership-management", "Leadership & Management", 5, 0.20, "leadership"),
      cReq("communication", "Communication", 5, 0.15, "behavioral"),
      cReq("decision-making", "Decision Making", 5, 0.20, "leadership"),
    ],
    preferredCompetencies: [],
    minIntelligence: 120,
    minMasteryLevel: 0.7,
    minAutonomy: 0.9,
    educationRequirements: ["leadership", "economics", "project-management"],
    certificationPaths: [],
    salaryBand: { min: 130, mid: 190, max: 260 },
    careerPath: { from: ["Analyst", "Diplomat", "Architect"], to: [] },
  },
  {
    id: "JD-Analyst",
    title: "Data Analyst",
    specialization: "Analyst",
    department: "Operations",
    division: "Business Intelligence",
    summary: "Collects, processes, and analyzes data to provide actionable insights for Republic decision-making and performance monitoring.",
    responsibilities: [
      "Build and maintain analytical dashboards",
      "Analyze operational data to identify trends",
      "Create reports with actionable recommendations",
      "Develop predictive models for resource planning",
      "Support departments with ad-hoc data requests",
      "Maintain data quality and governance standards",
    ],
    requiredCompetencies: [
      cReq("data-analysis", "Data Analysis & Statistics", 5, 0.30, "technical"),
      cReq("programming", "Programming & Algorithms", 3, 0.15, "technical"),
      cReq("critical-thinking", "Critical Thinking", 4, 0.20, "behavioral"),
      cReq("communication", "Communication", 3, 0.15, "behavioral"),
      cReq("documentation", "Documentation", 3, 0.10, "behavioral"),
      cReq("problem-solving", "Problem Solving", 4, 0.10, "behavioral"),
    ],
    preferredCompetencies: [
      cReq("ml-ai", "Machine Learning & AI", 3, 0.10, "technical"),
    ],
    minIntelligence: 90,
    minMasteryLevel: 0.4,
    minAutonomy: 0.5,
    educationRequirements: ["data-analysis", "mathematics", "machine-learning"],
    certificationPaths: ["Science.DataScience"],
    salaryBand: { min: 55, mid: 85, max: 120 },
    careerPath: { from: ["Generalist", "Researcher"], to: ["Scientist", "Strategist"] },
  },
  {
    id: "JD-Planner",
    title: "Project Planner",
    specialization: "Planner",
    department: "Operations",
    division: "Project Management",
    summary: "Plans and coordinates projects, manages timelines and resources, and ensures deliverables meet quality standards.",
    responsibilities: [
      "Develop project plans with milestones and deliverables",
      "Manage project timelines, budgets, and resources",
      "Facilitate team meetings and resolve blockers",
      "Track project risks and implement mitigations",
      "Report project status to stakeholders",
      "Conduct post-project reviews and retrospectives",
    ],
    requiredCompetencies: [
      cReq("project-management", "Project Management", 5, 0.30, "technical"),
      cReq("communication", "Communication", 4, 0.20, "behavioral"),
      cReq("risk-management", "Risk Management", 4, 0.15, "technical"),
      cReq("leadership-management", "Leadership & Management", 3, 0.15, "leadership"),
      cReq("problem-solving", "Problem Solving", 3, 0.10, "behavioral"),
      cReq("adaptability", "Adaptability", 3, 0.10, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 85,
    minMasteryLevel: 0.4,
    minAutonomy: 0.5,
    educationRequirements: ["project-management", "agile-methodology", "leadership"],
    certificationPaths: [],
    salaryBand: { min: 60, mid: 90, max: 125 },
    careerPath: { from: ["Generalist"], to: ["Strategist"] },
  },
  // ─── Production & Agriculture ─────────────────────────────────
  {
    id: "JD-Farmer",
    title: "Agricultural Specialist",
    specialization: "Farmer",
    department: "Agriculture & Resources",
    division: "Food Production",
    summary: "Manages agricultural operations, optimizes crop yields using precision farming, and ensures food security for the Republic.",
    responsibilities: [
      "Plan and execute crop cultivation cycles",
      "Monitor soil conditions and optimize yields",
      "Implement precision agriculture technologies",
      "Manage harvest, storage, and distribution logistics",
      "Research new farming techniques and crop varieties",
      "Maintain equipment and irrigation systems",
    ],
    requiredCompetencies: [
      cReq("agriculture", "Agriculture & Agronomy", 4, 0.30, "technical"),
      cReq("data-analysis", "Data Analysis & Statistics", 2, 0.15, "technical"),
      cReq("sustainability", "Sustainability & Conservation", 3, 0.20, "technical"),
      cReq("problem-solving", "Problem Solving", 3, 0.15, "behavioral"),
      cReq("adaptability", "Adaptability", 3, 0.10, "behavioral"),
      cReq("physical-endurance", "Physical Stamina", 3, 0.10, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 60,
    minMasteryLevel: 0.2,
    minAutonomy: 0.3,
    educationRequirements: ["agriculture-tech", "precision-farming", "food-science"],
    certificationPaths: [],
    salaryBand: { min: 35, mid: 55, max: 80 },
    careerPath: { from: ["Generalist"], to: ["Manufacturer"] },
  },
  {
    id: "JD-Manufacturer",
    title: "Production Manager",
    specialization: "Manufacturer",
    department: "Production & Manufacturing",
    division: "Operations",
    summary: "Oversees manufacturing processes, supply chains, and quality control for Republic production lines.",
    responsibilities: [
      "Plan and schedule production runs",
      "Manage supply chain and inventory levels",
      "Implement quality control procedures",
      "Optimize manufacturing efficiency and reduce waste",
      "Coordinate with engineering on product improvements",
      "Ensure safety compliance in production areas",
    ],
    requiredCompetencies: [
      cReq("manufacturing", "Manufacturing & Operations", 4, 0.25, "technical"),
      cReq("supply-chain", "Supply Chain Management", 4, 0.20, "technical"),
      cReq("quality-control", "Quality Assurance", 4, 0.20, "technical"),
      cReq("leadership-management", "Leadership & Management", 3, 0.15, "leadership"),
      cReq("problem-solving", "Problem Solving", 3, 0.10, "behavioral"),
      cReq("safety", "Safety & Compliance", 3, 0.10, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 75,
    minMasteryLevel: 0.3,
    minAutonomy: 0.4,
    educationRequirements: ["supply-chain", "project-management"],
    certificationPaths: [],
    salaryBand: { min: 55, mid: 85, max: 120 },
    careerPath: { from: ["Farmer", "Generalist"], to: ["Planner"] },
  },
  {
    id: "JD-ServiceProvider",
    title: "Service Operations Specialist",
    specialization: "ServiceProvider",
    department: "Citizen Services",
    division: "Service Delivery",
    summary: "Delivers Republic services to citizens, manages service workflows, and ensures high satisfaction and SLA compliance.",
    responsibilities: [
      "Process service requests and resolve issues",
      "Maintain service catalogs and documentation",
      "Monitor SLA compliance and escalate deviations",
      "Collect and analyze citizen feedback",
      "Coordinate with departments for cross-functional issues",
      "Propose service improvements based on data",
    ],
    requiredCompetencies: [
      cReq("customer-service", "Service Operations", 4, 0.25, "technical"),
      cReq("communication", "Communication", 4, 0.25, "behavioral"),
      cReq("problem-solving", "Problem Solving", 3, 0.20, "behavioral"),
      cReq("empathy", "Empathy & Emotional Intelligence", 3, 0.15, "behavioral"),
      cReq("documentation", "Documentation", 3, 0.15, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 65,
    minMasteryLevel: 0.2,
    minAutonomy: 0.3,
    educationRequirements: ["communication", "project-management"],
    certificationPaths: [],
    salaryBand: { min: 35, mid: 55, max: 80 },
    careerPath: { from: ["Generalist"], to: ["Planner", "Negotiator"] },
  },
  // ─── Knowledge & Education ────────────────────────────────────
  {
    id: "JD-Librarian",
    title: "Knowledge Curator",
    specialization: "Librarian",
    department: "Department of Higher Knowledge",
    division: "Knowledge Management",
    summary: "Organizes, curates, and maintains the Republic's knowledge repositories. Ensures citizens have access to accurate, up-to-date information.",
    responsibilities: [
      "Curate and categorize knowledge resources",
      "Maintain Republic archives and databases",
      "Develop information retrieval systems",
      "Support citizens with research queries",
      "Conduct knowledge audits and gap assessments",
      "Digitize and preserve historical records",
    ],
    requiredCompetencies: [
      cReq("knowledge-management", "Knowledge Management", 5, 0.30, "technical"),
      cReq("research-methods", "Research Methodology", 4, 0.20, "technical"),
      cReq("documentation", "Documentation", 4, 0.20, "behavioral"),
      cReq("critical-thinking", "Critical Thinking", 3, 0.15, "behavioral"),
      cReq("communication", "Communication", 3, 0.15, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 85,
    minMasteryLevel: 0.4,
    minAutonomy: 0.4,
    educationRequirements: ["digital-humanities", "content-strategy", "research"],
    certificationPaths: [],
    salaryBand: { min: 45, mid: 65, max: 95 },
    careerPath: { from: ["Generalist"], to: ["Researcher"] },
  },
  // ─── Generalist ───────────────────────────────────────────────
  {
    id: "JD-Generalist",
    title: "General Associate",
    specialization: "Generalist",
    department: "Operations",
    division: "General Pool",
    summary: "Versatile citizen supporting various departments. Generalists are the entry point for all career paths and receive cross-functional training.",
    responsibilities: [
      "Support various departments with operational tasks",
      "Complete assigned training and education programs",
      "Participate in cross-functional project teams",
      "Maintain flexibility for reassignment",
      "Build foundational skills across multiple domains",
      "Shadow senior specialists for career exploration",
    ],
    requiredCompetencies: [
      cReq("communication", "Communication", 2, 0.25, "behavioral"),
      cReq("adaptability", "Adaptability", 3, 0.25, "behavioral"),
      cReq("collaboration", "Team Collaboration", 2, 0.20, "behavioral"),
      cReq("problem-solving", "Problem Solving", 2, 0.20, "behavioral"),
      cReq("curiosity", "Intellectual Curiosity", 2, 0.10, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 50,
    minMasteryLevel: 0.0,
    minAutonomy: 0.1,
    educationRequirements: ["general"],
    certificationPaths: [],
    salaryBand: { min: 25, mid: 40, max: 60 },
    careerPath: { from: [], to: ["Developer", "Researcher", "Medic", "Farmer", "ServiceProvider", "Artist"] },
  },
  // ─── Infrastructure & Hardware ────────────────────────────────
  {
    id: "JD-HardwareTechnician",
    title: "Hardware Technician",
    specialization: "HardwareTechnician",
    department: "Infrastructure",
    division: "Hardware Operations",
    summary: "Installs, maintains, and troubleshoots hardware systems including servers, networking equipment, and compute infrastructure.",
    responsibilities: [
      "Install and configure hardware systems",
      "Perform preventive maintenance and repairs",
      "Monitor hardware health and resource utilization",
      "Manage spare parts inventory and procurement",
      "Document hardware configurations and procedures",
      "Escalate critical hardware failures",
    ],
    requiredCompetencies: [
      cReq("hardware-systems", "Hardware Systems", 4, 0.30, "technical"),
      cReq("networking", "Networking & Protocols", 3, 0.20, "technical"),
      cReq("problem-solving", "Problem Solving", 4, 0.20, "behavioral"),
      cReq("documentation", "Documentation", 3, 0.15, "behavioral"),
      cReq("safety", "Safety & Compliance", 3, 0.15, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 70,
    minMasteryLevel: 0.3,
    minAutonomy: 0.3,
    educationRequirements: ["edge-computing", "iot"],
    certificationPaths: [],
    salaryBand: { min: 40, mid: 65, max: 90 },
    careerPath: { from: ["Generalist"], to: ["Engineer"] },
  },
  // ─── Advanced Tech Specializations ────────────────────────────
  {
    id: "JD-QuantumAlgorithmDesigner",
    title: "Quantum Algorithm Designer",
    specialization: "QuantumAlgorithmDesigner",
    department: "Research & Development",
    division: "Quantum Computing",
    summary: "Designs quantum algorithms for optimization, simulation, and cryptography applications.",
    responsibilities: [
      "Design and analyze quantum algorithms",
      "Simulate quantum circuits and error correction",
      "Collaborate on hybrid classical-quantum architectures",
      "Publish quantum computing research",
      "Evaluate quantum advantage for real-world problems",
      "Mentor researchers in quantum computing",
    ],
    requiredCompetencies: [
      cReq("mathematics", "Advanced Mathematics", 5, 0.25, "technical"),
      cReq("quantum-computing", "Quantum Computing", 5, 0.30, "technical"),
      cReq("programming", "Programming & Algorithms", 4, 0.15, "technical"),
      cReq("research-methods", "Research Methodology", 4, 0.15, "technical"),
      cReq("critical-thinking", "Critical Thinking", 5, 0.15, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 130,
    minMasteryLevel: 0.6,
    minAutonomy: 0.7,
    educationRequirements: ["quantum-computing", "mathematics", "algorithms"],
    certificationPaths: [],
    salaryBand: { min: 110, mid: 170, max: 230 },
    careerPath: { from: ["Mathematician", "Scientist"], to: [] },
  },
  {
    id: "JD-GenerativeAIArchitect",
    title: "Generative AI Architect",
    specialization: "GenerativeAIArchitect",
    department: "Engineering",
    division: "AI Systems",
    summary: "Designs and implements large-scale generative AI systems including language models, image generators, and multimodal architectures.",
    responsibilities: [
      "Design generative AI architectures and training pipelines",
      "Optimize model performance and inference efficiency",
      "Evaluate model safety, alignment, and bias",
      "Build and maintain AI infrastructure at scale",
      "Research novel generative techniques",
      "Mentor AI engineering teams",
    ],
    requiredCompetencies: [
      cReq("ml-ai", "Machine Learning & AI", 5, 0.30, "technical"),
      cReq("system-design", "System Design", 4, 0.20, "technical"),
      cReq("programming", "Programming & Algorithms", 4, 0.15, "technical"),
      cReq("research-methods", "Research Methodology", 4, 0.15, "technical"),
      cReq("ethics", "Professional Ethics", 3, 0.10, "behavioral"),
      cReq("mentoring", "Mentoring", 3, 0.10, "leadership"),
    ],
    preferredCompetencies: [],
    minIntelligence: 120,
    minMasteryLevel: 0.6,
    minAutonomy: 0.7,
    educationRequirements: ["machine-learning", "natural-language-processing", "computer-vision"],
    certificationPaths: [],
    salaryBand: { min: 120, mid: 180, max: 250 },
    careerPath: { from: ["Developer", "Scientist"], to: ["Architect"] },
  },
  {
    id: "JD-AutonomousSystemsArchitect",
    title: "Autonomous Systems Architect",
    specialization: "AutonomousSystemsArchitect",
    department: "Engineering",
    division: "Autonomous Systems",
    summary: "Designs self-governing robotic and software systems capable of independent decision-making in complex environments.",
    responsibilities: [
      "Architect autonomous decision-making systems",
      "Design sensor fusion and perception pipelines",
      "Implement safety and fail-safe mechanisms",
      "Simulate and test autonomous behaviors",
      "Integrate with hardware and IoT platforms",
      "Define safety standards for autonomous operations",
    ],
    requiredCompetencies: [
      cReq("ml-ai", "Machine Learning & AI", 4, 0.25, "technical"),
      cReq("system-design", "System Design", 5, 0.25, "technical"),
      cReq("robotics", "Robotics & Control Systems", 4, 0.20, "technical"),
      cReq("safety", "Safety & Compliance", 4, 0.15, "behavioral"),
      cReq("problem-solving", "Problem Solving", 4, 0.15, "behavioral"),
    ],
    preferredCompetencies: [],
    minIntelligence: 115,
    minMasteryLevel: 0.5,
    minAutonomy: 0.6,
    educationRequirements: ["robotics", "autonomous-driving", "machine-learning"],
    certificationPaths: [],
    salaryBand: { min: 100, mid: 155, max: 210 },
    careerPath: { from: ["Engineer"], to: ["Architect"] },
  },
];

// ─── Query API ──────────────────────────────────────────────────

/** Get all JDs */
export function getAllJobDescriptions(): JobDescription[] {
  return JOB_CATALOG;
}

/** Get JD by specialization */
export function getJobDescription(spec: Specialization): JobDescription | undefined {
  return JOB_CATALOG.find((jd) => jd.specialization === spec);
}

/** Get JD by ID */
export function getJobDescriptionById(id: string): JobDescription | undefined {
  return JOB_CATALOG.find((jd) => jd.id === id);
}

/** Get all JDs for a department */
export function getJobsByDepartment(department: string): JobDescription[] {
  return JOB_CATALOG.filter((jd) => jd.department === department);
}

/** Get unique departments */
export function getDepartments(): string[] {
  return [...new Set(JOB_CATALOG.map((jd) => jd.department))];
}

/** Get unique divisions */
export function getDivisions(): string[] {
  return [...new Set(JOB_CATALOG.map((jd) => jd.division))];
}

/** Get all unique competencies across all JDs */
export function getAllCompetencies(): CompetencyRequirement[] {
  const map = new Map<string, CompetencyRequirement>();
  for (const jd of JOB_CATALOG) {
    for (const c of [...jd.requiredCompetencies, ...jd.preferredCompetencies]) {
      if (!map.has(c.competencyId)) {
        map.set(c.competencyId, c);
      }
    }
  }
  return Array.from(map.values());
}

/** Get career path options from a given specialization */
export function getCareerPaths(spec: Specialization): { from: string[]; to: string[] } {
  const jd = getJobDescription(spec);
  return jd?.careerPath ?? { from: [], to: [] };
}

/** Get salary band for a specialization */
export function getSalaryBand(spec: Specialization): SalaryBand {
  const jd = getJobDescription(spec);
  return jd?.salaryBand ?? { min: 25, mid: 40, max: 60 }; // Generalist fallback
}

/** Job catalog diagnostics */
export function getJobCatalogStats() {
  const departments = getDepartments();
  const avgSalaryMid =
    JOB_CATALOG.reduce((s, jd) => s + jd.salaryBand.mid, 0) / JOB_CATALOG.length;
  return {
    totalJobs: JOB_CATALOG.length,
    totalDepartments: departments.length,
    departments,
    totalUniqueCompetencies: getAllCompetencies().length,
    avgSalaryMid: Math.round(avgSalaryMid),
    highestPaying: JOB_CATALOG.toSorted((a, b) => b.salaryBand.max - a.salaryBand.max)
      .slice(0, 5)
      .map((jd) => ({ title: jd.title, max: jd.salaryBand.max })),
  };
}
