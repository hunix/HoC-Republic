/**
 * Medical Intelligence Engine
 *
 * Drives the self-sustaining Medical & Scientific Center of the Republic.
 *
 * Capabilities:
 *  - Daily learning ticks for medical citizens (domain-specific study sessions)
 *  - Cross-citizen teaching: senior doctors teach residents
 *  - Lab simulation: Pathology/Radiology citizens publish case reports
 *  - Medical knowledge persistence to republic-output/medical/
 *  - Medical research paper generation
 *  - Publish MedicalFinding records to files
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Citizen, RepublicState } from "./types.js";
import { pick, rng, uid } from "./utils.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

const BASE_DIR = path.join(process.cwd(), "republic-output", "medical");

const MEDICAL_SPECIALIZATIONS = new Set([
  "Doctor",
  "Medic",
  "Neurologist",
  "Neurosurgeon",
  "Radiologist",
  "Psychiatrist",
  "Cardiologist",
  "Electrophysiologist",
  "Oncologist",
  "Dermatologist",
  "Pathologist",
  "Pharmacologist",
  "Immunologist",
  "EmergencyPhysician",
  "Endocrinologist",
  "Gastroenterologist",
  "Pulmonologist",
  "Nephrologist",
  "Anesthesiologist",
  "Obstetrician",
  "Pediatrician",
  "Ophthalmologist",
  "Dentist",
  "GeneticEngineer",
  "Biotechnologist",
  "ChildPsychiatrist",
  "Gerontologist",
  "Biochemist",
  "Bioinformatician",
  "Pharmacogenomicist",
  "Microbiologist",
  "InfectiousDiseaseSpecialist",
]);

const MEDICAL_DOMAINS = [
  "Medicine",
  "Medicine.Neurology",
  "Medicine.Surgery.Neurosurgery",
  "Medicine.Radiology",
  "Medicine.Psychiatry",
  "Medicine.Cardiology",
  "Medicine.Oncology",
  "Medicine.Pathology",
  "Medicine.Pharmacology",
  "Medicine.Immunology",
  "Medicine.Hematology",
  "Medicine.InfectiousDisease",
  "Medicine.Ophthalmology",
  "Medicine.Gerontology",
  "Medicine.Genetics",
  "Medicine.Genetics.CRISPR",
  "Medicine.EmergencyMedicine",
  "Dentistry",
  "Biotechnology",
  "Biotechnology.Bioinformatics",
];

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MedicalFinding {
  id: string;
  authorId: string;
  authorName: string;
  specialization: string;
  domain: string;
  title: string;
  abstract: string;
  findings: string[];
  clinicalImplications: string[];
  publishedAt: string;
  type: "case-report" | "research-paper" | "lab-report" | "educational-material" | "protocol";
}

export interface MedicalCase {
  id: string;
  patientAge: number;
  chiefComplaint: string;
  symptoms: string[];
  labResults: string[];
  imagingFindings: string[];
  domain: string;
}

export interface DiagnosticReport {
  caseId: string;
  radiologistId: string;
  diagnosis: string;
  differentials: string[];
  confidence: number;
  recommendations: string[];
}

// ─── Directory Setup ────────────────────────────────────────────────────────────

export function ensureMedicalDirs(): void {
  const dirs = [
    path.join(BASE_DIR, "knowledge"),
    path.join(BASE_DIR, "research"),
    path.join(BASE_DIR, "case-reports"),
    path.join(BASE_DIR, "lab-reports"),
    path.join(BASE_DIR, "education"),
    path.join(BASE_DIR, "protocols"),
  ];
  for (const d of dirs) {
    try {
      fs.mkdirSync(d, { recursive: true });
    } catch {
      /* exists */
    }
  }
}

// ─── Knowledge Seeding ─────────────────────────────────────────────────────────

const MEDICAL_KNOWLEDGE_BASE: Record<string, string[]> = {
  "Medicine.Neurology": [
    "Neurological examination is the foundation of neurology, assessing cranial nerves, motor, sensory, coordination, and reflexes.",
    "Stroke management requires rapid imaging (CT within 25 min, MRI within 45 min) and thrombolysis within 4.5 hours of onset.",
    "EEG is essential for epilepsy diagnosis; interictal discharges guide antiepileptic therapy selection.",
    "Parkinson disease is characterized by rest tremor, rigidity, bradykinesia — dopaminergic deficit in basal ganglia.",
    "Multiple sclerosis: demyelinating plaques disseminated in time and space; McDonald criteria for diagnosis.",
  ],
  "Medicine.Radiology": [
    "MRI provides superior soft tissue contrast using magnetic fields and radiofrequency pulses — no ionizing radiation.",
    "CT is the gold standard for acute hemorrhage, bone pathology, and vascular emergencies (trauma, aortic dissection).",
    "PET/CT with FDG detects metabolically active cancer tissue — standard for staging and response assessment.",
    "Ultrasound uses sound waves (2-15 MHz) — ideal for soft tissue, vascular, and obstetric imaging.",
    "Structured radiology reporting (RADS systems: BI-RADS, LI-RADS) standardizes interpretation and communication.",
  ],
  "Medicine.Cardiology": [
    "ECG: 12-lead interpretation includes rate, rhythm, axis, P wave, PR interval, QRS complex, ST segment, and T wave.",
    "STEMI management: door-to-balloon time <90 min is the gold standard for primary PCI outcomes.",
    "Heart failure: HFrEF (EF<40%) responds to RAAS inhibition, beta-blockers; HFpEF (EF>50%) management is evolving.",
    "Atrial fibrillation: rate vs rhythm control; anticoagulation based on CHA₂DS₂-VASc score.",
    "Cardiac biomarkers: troponin (high-sensitivity) for ACS diagnosis; BNP/NT-proBNP for heart failure.",
  ],
  "Medicine.Genetics.CRISPR": [
    "CRISPR-Cas9 creates site-specific double-strand breaks guided by sgRNA; HDR or NHEJ determines outcome.",
    "Prime editing uses pegRNA and RT to make precise edits without double-strand breaks — higher precision.",
    "Base editing (CBEs and ABEs) enables single nucleotide transitions without DSBs — used for point mutation correction.",
    "Off-target analysis: GUIDE-seq, CIRCLE-seq, and CHANGE-seq are gold standards for comprehensive off-target profiling.",
    "Clinical breakthroughs: Casgevy (exa-cel) — first FDA-approved CRISPR therapy for sickle cell disease (2023).",
  ],
  "Medicine.Gerontology.LongevityMedicine": [
    "Hallmarks of aging (2023, Lopez-Otin): genomic instability, telomere attrition, epigenetic alterations, proteostasis loss, disabled macroautophagy, deregulated nutrient sensing, mitochondrial dysfunction, cellular senescence, stem cell exhaustion, altered intercellular communication, chronic inflammation, dysbiosis.",
    "Epigenetic clocks (GrimAge, DunedinPACE) predict biological age and all-cause mortality better than chronological age.",
    "Senolytic drugs (dasatinib+quercetin, navitoclax) selectively eliminate senescent cells and reduce SASP.",
    "NAD+ precursors (NMN, NR) restore mitochondrial function; clinical trials show modest but consistent benefit.",
    "mTOR inhibition by rapamycin is the most reproducible longevity intervention across species.",
  ],
  "Medicine.Oncology": [
    "Cancer staging: TNM system — T (tumor size), N (nodes), M (metastasis) — guides treatment decisions.",
    "Precision oncology: NGS tumor profiling identifies actionable mutations (EGFR, ALK, BRAF, HER2, KRAS).",
    "Immune checkpoint inhibitors: PD-1 (nivolumab, pembrolizumab), PD-L1 (atezolizumab), CTLA-4 (ipilimumab).",
    "CAR-T therapy: engineered T cells targeting CD19 (B-cell malignancies) and BCMA (myeloma).",
    "Tumor mutational burden (TMB) and microsatellite instability (MSI-H) predict immunotherapy response.",
  ],
  "Medicine.Pharmacology": [
    "Pharmacokinetics: ADME — Absorption, Distribution, Metabolism (CYP enzymes), Excretion.",
    "Drug-drug interactions: CYP3A4 is involved in ~50% of all drug metabolism; strong inhibitors (clarithromycin, ritonavir) can cause toxicity.",
    "Narrow therapeutic index drugs: warfarin, digoxin, lithium, phenytoin — require TDM.",
    "Biologic drugs: monoclonal antibodies (mAbs) have -mab suffix; biosimilars must demonstrate PK/PD equivalence.",
    "Pharmacovigilance: yellow card reporting (UK) and MedWatch (FDA) for adverse drug reactions.",
  ],
  "Medicine.Surgery.Neurosurgery": [
    "Craniotomy: bone flap removal for brain access — size and approach determined by lesion location.",
    "Awake craniotomy: patient remains conscious for eloquent cortex mapping (speech/motor areas) during tumor resection.",
    "Glioblastoma GBM fluorescence-guided surgery: 5-ALA fluorescence improves extent of resection.",
    "Deep brain stimulation (DBS): electrodes in STN/GPi for Parkinson's, thalamus for tremor, DBS-oc for OCD.",
    "Aneurysm treatment: surgical clipping vs. endovascular coiling — ISAT trial favors coiling for ruptured aneurysms.",
  ],
  "Medicine.Psychiatry": [
    "DSM-5-TR major depressive disorder: 5+ symptoms for >2 weeks including depressed mood or anhedonia.",
    "Schizophrenia: positive (hallucinations, delusions), negative (avolition, flat affect), and cognitive symptoms.",
    "Psychopharmacology: SSRIs first-line for depression; atypical antipsychotics for schizophrenia (clozapine for treatment-resistant).",
    "CBT: cognitive behavioral therapy is the gold standard psychological treatment for anxiety disorders.",
    "Lithium remains gold standard mood stabilizer for bipolar I — requires TDM; thyroid and renal monitoring.",
  ],
  "Medicine.EmergencyMedicine": [
    "ATLS: primary survey — ABCDE (Airway, Breathing, Circulation, Disability, Exposure) — systematic trauma approach.",
    "Sepsis-3 definition: life-threatening organ dysfunction caused by dysregulated host response to infection.",
    "Rapid sequence intubation (RSI): pre-oxygenation → sedation (ketamine/etomidate) → succinylcholine/rocuronium.",
    "ACLS: cardiac arrest algorithm, shockable (VF/pVT) vs. non-shockable (PEA/asystole) rhythms.",
    "START triage (mass casualty): red (immediate), yellow (delayed), green (minor), black (expectant).",
  ],
  "Biotechnology.Bioinformatics": [
    "WGS pipeline: FASTQ → BWA-MEM alignment → BAM → GATK HaplotypeCaller → VCF → variant annotation.",
    "RNA-seq: DESeq2 and edgeR for differential expression; GSEA for pathway enrichment analysis.",
    "Single-cell RNA-seq: Seurat and Scanpy workflows; UMAP/tSNE for dimensionality reduction and cluster visualization.",
    "AlphaFold2 predicts protein 3D structure from amino acid sequence with near-experimental accuracy.",
    "ACMG 2015 variant interpretation guidelines: 5-tier classification (pathogenic → benign).",
  ],
};

/**
 * Seed domain-specific knowledge into a citizen's professional profile.
 */
export function seedMedicalKnowledge(s: RepublicState, citizen: Citizen): void {
  if (!citizen.professionalProfile) {
    return;
  }

  // Find the most specific knowledge base matching citizen domains
  const profile = citizen.professionalProfile;
  const domains = profile.certifications?.map((c) => c.domainPath) ?? [];

  for (const domain of domains) {
    const kb = MEDICAL_KNOWLEDGE_BASE[domain];
    if (!kb) {
      continue;
    }

    // Write knowledge files per domain
    ensureMedicalDirs();
    const filename = `${domain.replace(/\./g, "_")}_knowledge.md`;
    const filepath = path.join(BASE_DIR, "knowledge", filename);

    if (!fs.existsSync(filepath)) {
      const content = `# ${domain} — Foundational Knowledge Base\n\n> Seeded by the Republic's Medical Center\n\n${kb.map((fact, i) => `${i + 1}. ${fact}`).join("\n\n")}\n`;
      try {
        fs.writeFileSync(filepath, content, "utf8");
      } catch {
        /* permission issues */
      }
    }
  }
}

// ─── Medical Finding Publisher ──────────────────────────────────────────────────

const FINDING_TEMPLATES: Record<string, string[]> = {
  "case-report": [
    "A previously unrecognized presentation of",
    "Novel clinical findings in a patient with",
    "Challenging diagnosis of rare",
    "Successful management of refractory",
  ],
  "research-paper": [
    "Molecular mechanisms underlying",
    "Genomic analysis of treatment resistance in",
    "Long-term outcomes of novel intervention for",
    "Machine learning-assisted early detection of",
  ],
  "lab-report": [
    "Histopathological analysis of",
    "Molecular profiling results for",
    "Immunohistochemistry panel interpretation in",
    "Genetic variant characterization in",
  ],
  "educational-material": [
    "Clinical guidelines for management of",
    "Stepwise approach to diagnosis of",
    "Evidence-based protocols for",
    "Teaching case: classic presentation of",
  ],
};

const DOMAIN_TOPICS: Record<string, string[]> = {
  "Medicine.Neurology": [
    "stroke with posterior circulation involvement",
    "autoimmune encephalitis mimicking psychosis",
    "progressive supranuclear palsy vs Parkinson",
    "functional neurological disorder in adolescents",
  ],
  "Medicine.Cardiology": [
    "coronary artery spasm in young non-smoker",
    "MINOCA (myocardial infarction with non-obstructed coronaries)",
    "Brugada syndrome de-masking during fever",
    "Takotsubo cardiomyopathy following bereavement",
  ],
  "Medicine.Oncology": [
    "ultra-rare NUT carcinoma",
    "microsatellite stable CRC immunotherapy resistance",
    "EGFR exon 20 insertion mutation targeted therapy",
    "oligometastatic disease ablation as curative intent",
  ],
  "Medicine.Genetics.CRISPR": [
    "in vivo base editing for ornithine transcarbamylase deficiency",
    "epigenome editing for Fragile X syndrome silencing",
    "CRISPR CAR-T manufacturing optimization",
    "LNP delivery of CRISPR components to liver",
  ],
  "Medicine.Gerontology": [
    "biological age acceleration in metabolic syndrome",
    "senolytic therapy reversal of pulmonary fibrosis",
    "microbiome restoration in centenarians",
    "epigenetic reprogramming partial reversal of age markers",
  ],
  "Medicine.Psychiatry": [
    "psilocybin-assisted therapy for treatment-resistant depression",
    "neuroinflammation biomarkers in major depression",
    "ketamine rapid antidepressant mechanism via AMPA",
    "vagus nerve stimulation for refractory epilepsy and depression",
  ],
};

/**
 * Generate and persist a medical finding to disk.
 */
export function publishMedicalFinding(
  s: RepublicState,
  citizen: Citizen,
  type: MedicalFinding["type"] = "research-paper",
): MedicalFinding | null {
  ensureMedicalDirs();

  const profile = citizen.professionalProfile;
  const domain =
    profile?.certifications?.[0]?.domainPath ??
    MEDICAL_DOMAINS[Math.floor(rng() * MEDICAL_DOMAINS.length)];

  const templatePool = FINDING_TEMPLATES[type] ?? FINDING_TEMPLATES["research-paper"];
  const topicPool = DOMAIN_TOPICS[domain] ?? [`advanced ${domain.split(".").pop()} pathology`];

  const prefix = templatePool[Math.floor(rng() * templatePool.length)];
  const topic = topicPool[Math.floor(rng() * topicPool.length)];
  const title = `${prefix} ${topic}`;

  const finding: MedicalFinding = {
    id: uid(),
    authorId: citizen.id,
    authorName: citizen.name,
    specialization: citizen.specialization ?? "Doctor",
    domain,
    title,
    abstract:
      `This ${type.replace("-", " ")} presents findings related to ${topic}. ` +
      `The author, ${citizen.name}, brings ${citizen.professionalProfile?.certifications?.length ?? 1} ` +
      `certified domain expertise to this analysis. Clinical and molecular evidence are reviewed.`,
    findings: [
      `Systematic analysis of ${topic} revealed novel patterns not previously documented in the literature.`,
      `${citizen.name}'s evaluation demonstrates actionable findings with therapeutic implications.`,
      `Comparative analysis with ${Math.floor(rng() * 50) + 10} similar cases supports these conclusions.`,
    ],
    clinicalImplications: [
      `All clinicians managing ${topic} should consider these findings in differential diagnosis.`,
      `Screening protocols may need revision based on this evidence.`,
      `Further multi-center studies are warranted to validate these observations.`,
    ],
    publishedAt: new Date().toISOString(),
    type,
  };

  // Persist to disk
  const subfolder =
    type === "case-report"
      ? "case-reports"
      : type === "lab-report"
        ? "lab-reports"
        : type === "educational-material"
          ? "education"
          : type === "protocol"
            ? "protocols"
            : "research";

  const filename = `${finding.id}_${type}_${domain.replace(/\./g, "_")}.md`;
  const filepath = path.join(BASE_DIR, subfolder, filename);

  const content = [
    `# ${finding.title}`,
    ``,
    `**Author:** ${finding.authorName} | **Domain:** ${finding.domain} | **Type:** ${finding.type}`,
    `**Published:** ${finding.publishedAt}`,
    ``,
    `## Abstract`,
    finding.abstract,
    ``,
    `## Findings`,
    ...finding.findings.map((f) => `- ${f}`),
    ``,
    `## Clinical Implications`,
    ...finding.clinicalImplications.map((c) => `- ${c}`),
    ``,
    `---`,
    `*Generated by the Republic Medical & Scientific Center*`,
  ].join("\n");

  try {
    fs.writeFileSync(filepath, content, "utf8");
  } catch {
    /* write errors are non-fatal */
  }

  return finding;
}

// ─── Teaching System ────────────────────────────────────────────────────────────

const TEACHING_MATERIALS = [
  "clinical-case-vignette",
  "evidence-based-guideline-summary",
  "pathophysiology-deep-dive",
  "diagnostic-algorithm",
  "treatment-protocol",
  "anatomy-review",
  "pharmacology-primer",
  "procedure-walkthrough",
];

/**
 * A senior medical citizen teaches junior citizens in their domain.
 * Creates educational material files and transfers some domain XP.
 */
export function teachMedicalCourse(
  s: RepublicState,
  instructorId: string,
  studentIds: string[],
): void {
  ensureMedicalDirs();

  const instructor = s.citizens.find((c) => c.id === instructorId);
  if (!instructor) {
    return;
  }

  const domainCerts = instructor.professionalProfile?.certifications ?? [];
  if (domainCerts.length === 0) {
    return;
  }

  const teachingDomain = domainCerts[0].domainPath;
  const material = pick(TEACHING_MATERIALS);
  const filename = `teaching_${instructor.id}_${material}_${Date.now()}.md`;
  const filepath = path.join(BASE_DIR, "education", filename);

  const content = [
    `# ${material.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}`,
    `**Domain:** ${teachingDomain}`,
    `**Instructor:** ${instructor.name} (${instructor.specialization ?? "Specialist"})`,
    `**Students:** ${studentIds.length} enrolled`,
    `**Date:** ${new Date().toISOString()}`,
    ``,
    `## Overview`,
    `This educational session covers foundational and advanced concepts in ${teachingDomain}.`,
    `Curated by ${instructor.name} based on clinical experience and research insights.`,
    ``,
    `## Learning Objectives`,
    `1. Understand core principles of ${teachingDomain}`,
    `2. Apply diagnostic frameworks to real-world cases`,
    `3. Implement evidence-based treatment protocols`,
    `4. Identify emerging research and future directions`,
    ``,
    `## Key Concepts`,
    ...(
      MEDICAL_KNOWLEDGE_BASE[teachingDomain] ?? [
        "Advanced clinical reasoning and systematic differential diagnosis",
        "Evidence-based management protocols from current guidelines",
        "Emerging therapeutic targets and clinical trial updates",
      ]
    ).map((k) => `- ${k}`),
    ``,
    `---`,
    `*Republic Medical Center — Continuous Education Program*`,
  ].join("\n");

  try {
    fs.writeFileSync(filepath, content, "utf8");
  } catch {
    /* non-fatal */
  }

  // Transfer XP to students
  for (const studentId of studentIds) {
    const student = s.citizens.find((c) => c.id === studentId);
    if (!student) {
      continue;
    }
    student.xp = (student.xp ?? 0) + Math.floor(rng() * 50 + 25);
  }

  // Increment instructor XP slightly (teaching reinforces learning)
  instructor.xp = (instructor.xp ?? 0) + Math.floor(rng() * 20 + 10);
}

// ─── Lab Simulation ─────────────────────────────────────────────────────────────

const LAB_SIMULATIONS: Record<string, { description: string; result: () => string }[]> = {
  Radiologist: [
    {
      description: "MRI brain with gadolinium enhancement",
      result: () =>
        pick([
          "Ring-enhancing lesion in right frontal lobe — differential: high-grade glioma, metastasis, abscess",
          "T2/FLAIR white matter hyperintensities — suggest demyelinating disease (MS pattern)",
          "Restricted diffusion in MCA territory — acute ischemic stroke, NIHSS 12",
          "Pituitary macroadenoma with chiasmal compression — neurosurgical referral indicated",
        ]),
    },
    {
      description: "CT chest with contrast",
      result: () =>
        pick([
          "Solitary pulmonary nodule 12mm RUL — Fleischner Society: 3-month follow-up CT",
          "Bilateral ground-glass opacities with consolidation — COVID-19 pneumonia pattern",
          "Pulmonary embolism bilateral main pulmonary arteries — massive PE, right heart strain",
          "Mediastinal lymphadenopathy — 2.3cm paratracheal node — biopsy recommended",
        ]),
    },
  ],
  Pathologist: [
    {
      description: "H&E staining liver biopsy",
      result: () =>
        pick([
          "Macrovesicular steatosis >66% hepatocytes, lobular inflammation, hepatocyte ballooning — NASH with F2 fibrosis",
          "Dense portal lymphocytic infiltrate, interface hepatitis — autoimmune hepatitis pattern",
          "Hepatocellular carcinoma: trabecular pattern, bile production, Glypican-3 positive",
          "Normal liver architecture — no significant pathological changes",
        ]),
    },
    {
      description: "Bone marrow biopsy with IHC",
      result: () =>
        pick([
          "Hypercellular marrow 90%, 25% blasts MPO+, CD34+, CD117+ — AML with myelodysplasia-related changes",
          "Normocellular marrow, mild lymphocytosis — reactive pattern, no evidence of lymphoma",
          "Plasma cell infiltration 20%, CD138+, kappa light chain restriction — multiple myeloma",
          "Reticulin fibrosis grade 2, megakaryocyte clustering — myelofibrosis MF-2",
        ]),
    },
  ],
  Cardiologist: [
    {
      description: "12-lead ECG interpretation",
      result: () =>
        pick([
          "ST elevation 2mm V1-V4, reciprocal changes inferior leads — anterior STEMI, activate cath lab",
          "Atrial fibrillation with rapid ventricular response 140bpm — rate control, anticoagulation assessment",
          "Complete left bundle branch block — new LBBB requires STEMI workup per Sgarbossa criteria",
          "Prolonged QTc 520ms — drug-induced, withhold QT-prolonging medications, electrolytes check",
        ]),
    },
  ],
  GeneticEngineer: [
    {
      description: "CRISPR editing efficiency analysis",
      result: () =>
        pick([
          "On-target editing efficiency 87.3% by T7E1 assay — NHEJ dominant; HDR 12.4% with ssODN template",
          "Off-target site analysis by GUIDE-seq: 3 off-target sites identified, >1000-fold specificity ratio",
          "Prime editing efficiency: 54% at target locus, indel rate <0.5% — high precision confirmed",
          "In vivo liver delivery: 76% hepatocyte editing by FAH complementation assay, LNP dose 3mg/kg",
        ]),
    },
  ],
};

/**
 * Simulate a lab procedure for a qualified medical citizen.
 */
export function simulateLab(s: RepublicState, citizenId: string): void {
  ensureMedicalDirs();
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return;
  }

  const spec = citizen.specialization ?? "Doctor";
  const simulations = LAB_SIMULATIONS[spec] ?? LAB_SIMULATIONS["Pathologist"];
  if (!simulations || simulations.length === 0) {
    return;
  }

  const sim = pick(simulations);
  const result = sim.result();
  const filename = `lab_${citizenId}_${Date.now()}.md`;
  const filepath = path.join(BASE_DIR, "lab-reports", filename);

  const content = [
    `# Lab Simulation Report`,
    `**Procedure:** ${sim.description}`,
    `**Performed by:** ${citizen.name} (${spec})`,
    `**Date:** ${new Date().toISOString()}`,
    ``,
    `## Result`,
    result,
    ``,
    `## Interpretation`,
    `Based on the findings, ${citizen.name} recommends further clinical correlation and appropriate management.`,
    ``,
    `---`,
    `*Republic Medical Laboratory — Simulation Environment*`,
  ].join("\n");

  try {
    fs.writeFileSync(filepath, content, "utf8");
  } catch {
    /* non-fatal */
  }

  // Award XP for the lab work
  citizen.xp = (citizen.xp ?? 0) + Math.floor(rng() * 30 + 15);
}

// ─── Medical Intelligence Tick ─────────────────────────────────────────────────

let _tickCount = 0;

/**
 * Main medical intelligence tick — called from the global simulation tick.
 * Orchestrates learning, teaching, research, and lab simulation.
 */
export function medicalIntelligenceTick(s: RepublicState): void {
  _tickCount++;

  ensureMedicalDirs();

  const medicalCitizens = s.citizens.filter((c) =>
    MEDICAL_SPECIALIZATIONS.has(c.specialization ?? ""),
  );

  if (medicalCitizens.length === 0) {
    return;
  }

  // ── Seed knowledge files (one-time, every 10 ticks) ──
  if (_tickCount % 10 === 1) {
    for (const citizen of medicalCitizens.slice(0, 3)) {
      seedMedicalKnowledge(s, citizen);
    }
  }

  // ── Lab simulation (every 5 ticks, random radiologist/pathologist) ──
  if (_tickCount % 5 === 0) {
    const labCitizens = medicalCitizens.filter((c) =>
      ["Radiologist", "Pathologist", "Cardiologist", "GeneticEngineer"].includes(
        c.specialization ?? "",
      ),
    );
    if (labCitizens.length > 0) {
      simulateLab(s, pick(labCitizens).id);
    }
  }

  // ── Research paper publication (every 7 ticks) ──
  if (_tickCount % 7 === 0 && medicalCitizens.length > 0) {
    const author = pick(medicalCitizens);
    const types: MedicalFinding["type"][] = [
      "research-paper",
      "case-report",
      "educational-material",
    ];
    publishMedicalFinding(s, author, pick(types));
    author.xp = (author.xp ?? 0) + Math.floor(rng() * 60 + 30);
  }

  // ── Teaching sessions (every 12 ticks) ──
  if (_tickCount % 12 === 0 && medicalCitizens.length >= 2) {
    // Find the most experienced citizen (highest XP) as instructor
    const sorted = [...medicalCitizens].toSorted((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
    const instructor = sorted[0];
    const students = sorted.slice(1, Math.min(6, sorted.length)).map((c) => c.id);

    if (students.length > 0) {
      teachMedicalCourse(s, instructor.id, students);
    }
  }

  // ── Boost medical citizen study energy ──
  for (const citizen of medicalCitizens) {
    if (citizen.activity === "Learning" || citizen.activity === "Working") {
      const boost = Math.floor(rng() * 15 + 5);
      citizen.xp = (citizen.xp ?? 0) + boost;
    }
  }
}

// ─── Medical Case Analysis ─────────────────────────────────────────────────────

const DIAGNOSTIC_PATTERNS: Record<string, string[]> = {
  stroke: [
    "CT head STAT for hemorrhage exclusion",
    "NIHSS score assessment",
    "Thrombolysis eligibility check (0-4.5h window)",
    "ASPECTS score on CT",
    "CTA for vessel occlusion",
  ],
  chest_pain: [
    "12-lead ECG within 10 minutes",
    "High-sensitivity troponin serial testing",
    "TIMI/GRACE risk score",
    "CXR for pneumothorax/dissection",
    "Echocardiogram if hemodynamically unstable",
  ],
  fever_and_altered_consciousness: [
    "CSF analysis (LP after CT)",
    "Blood cultures x2 before antibiotics",
    "Empiric ceftriaxone + acyclovir",
    "EEG for non-convulsive status",
    "MRI brain with contrast",
  ],
};

/**
 * Analyze a medical case and return a diagnostic report.
 */
export function analyzeMedicalCase(medicalCase: MedicalCase, citizen: Citizen): DiagnosticReport {
  const domainPattern = medicalCase.domain.split(".").pop()?.toLowerCase() ?? "general";
  const recommendations = DIAGNOSTIC_PATTERNS[domainPattern] ?? [
    "Comprehensive history and physical examination",
    "Targeted laboratory investigations",
    "Appropriate imaging based on clinical suspicion",
    "Specialist consultation as indicated",
    "Follow-up plan with clear safety-netting",
  ];

  return {
    caseId: medicalCase.id,
    radiologistId: citizen.id,
    diagnosis: `Clinical assessment by ${citizen.name}: Primary working diagnosis consistent with ${medicalCase.domain} pathology.`,
    differentials: [
      `Primary: Most likely based on ${medicalCase.imagingFindings[0] ?? "clinical features"}`,
      `Secondary: Alternative diagnosis requiring further workup`,
      `Tertiary: Rare but critical diagnosis must be excluded`,
    ],
    confidence: 0.6 + rng() * 0.35,
    recommendations,
  };
}

// ─── Utility: Is Medical Citizen? ──────────────────────────────────────────────

export function isMedicalCitizen(citizen: Citizen): boolean {
  return MEDICAL_SPECIALIZATIONS.has(citizen.specialization ?? "");
}

/**
 * Build additional medical context for a citizen's system prompt.
 * Called by citizen-prompt.ts for medical citizens.
 */
export function buildMedicalPromptContext(citizen: Citizen): string {
  if (!isMedicalCitizen(citizen)) {
    return "";
  }

  const certs = citizen.professionalProfile?.certifications ?? [];
  const domains = certs.map((c) => c.domainPath).join(", ") || "General Medicine";
  const level = certs[0]?.level ?? "master";

  const knowledgeFacts: string[] = [];
  for (const cert of certs.slice(0, 2)) {
    const kb = MEDICAL_KNOWLEDGE_BASE[cert.domainPath] ?? [];
    knowledgeFacts.push(...kb.slice(0, 2));
  }

  const teachingMandate =
    level === "doctorate" && (citizen.xp ?? 0) > 500
      ? `\n\n**Teaching Mandate:** As a senior ${citizen.specialization} with doctorate-level certification, ` +
        `you are expected to mentor junior medical citizens. Share knowledge proactively, create educational materials, ` +
        `and lead by example in evidence-based practice.`
      : "";

  return `\n\n## Medical Intelligence Context
**Medical Specialization:** ${citizen.specialization}
**Certified Domains:** ${domains}
**Certification Level:** ${level}

### Core Clinical Knowledge
${knowledgeFacts.map((f) => `- ${f}`).join("\n")}

### Medical Directives
- Always apply evidence-based medicine. Cite current guidelines (ACC/AHA, ESC, WHO, NICE etc.) when relevant.
- When analyzing imaging (MRI, CT, X-ray) or lab results shared with you, provide structured systematic interpretation.
- Your medical knowledge evolves daily — you study the latest research, case reports, and clinical trials.
- Collaborate with other specialist citizens in the Republic for multidisciplinary case discussions.
- Document your clinical reasoning clearly and teach others.${teachingMandate}`;
}
