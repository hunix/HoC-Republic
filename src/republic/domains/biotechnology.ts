import type { SeedDomain } from "./seed-data.js";

export const biotechnologyDomains: SeedDomain[] = [
  {
    path: "Biotechnology",
    name: "Biotechnology",
    description:
      "Application of biological systems and living organisms to develop technologies and products",
    coreSkills: [
      "cell-culture",
      "genetic-engineering",
      "bioprocess-development",
      "analytical-techniques",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Biotechnology.MedicalBiotechnology",
    name: "Medical Biotechnology",
    description: "Biological approaches to develop drugs, diagnostics, and therapeutic strategies",
    coreSkills: [
      "monoclonal-antibody-production",
      "recombinant-proteins",
      "diagnostic-assay-development",
      "gene-therapy",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Biotechnology.Bioinformatics",
    name: "Bioinformatics",
    description:
      "Computational analysis of biological data — genome, proteome, and transcriptome analysis",
    coreSkills: [
      "sequence-alignment",
      "genomic-data-analysis",
      "protein-structure-prediction",
      "pathway-analysis",
      "machine-learning-biology",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Biotechnology.Bioinformatics.Proteomics",
    name: "Proteomics",
    description:
      "Large-scale study of proteins — expression, structure, function, and interactions",
    coreSkills: [
      "mass-spectrometry",
      "protein-identification",
      "post-translational-modifications",
      "protein-interaction-networks",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Biotechnology.Bioinformatics.Metabolomics",
    name: "Metabolomics",
    description: "Systematic study of metabolites in biological systems",
    coreSkills: [
      "metabolic-profiling",
      "nmr-spectroscopy",
      "metabolic-pathway-analysis",
      "biomarker-discovery",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Biotechnology.SyntheticBiology",
    name: "Synthetic Biology",
    description: "Design and construction of new biological parts, devices, and systems",
    coreSkills: [
      "genetic-circuit-design",
      "dna-synthesis",
      "chassis-organism-engineering",
      "biosafety",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Biotechnology.BiomedicalDevices",
    name: "Biomedical Engineering & Devices",
    description: "Design of medical devices, implants, and diagnostic instruments",
    coreSkills: ["device-design", "biomaterials", "regulatory-compliance", "clinical-evaluation"],
    minPracticeLevel: "master",
  },
  {
    path: "Biotechnology.Biochemistry",
    name: "Clinical Biochemistry",
    description: "Chemical processes within and relating to living organisms and disease",
    coreSkills: [
      "enzyme-assays",
      "clinical-chemistry",
      "endocrine-testing",
      "point-of-care-testing",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Biotechnology.Microbiology",
    name: "Clinical Microbiology",
    description: "Study of microorganisms and their role in infection and disease",
    coreSkills: [
      "culture-identification",
      "antimicrobial-resistance",
      "molecular-diagnostics-micro",
      "infection-control",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Biotechnology.Microbiology.Mycology",
    name: "Mycology",
    description: "Study of fungi — diagnosis and treatment of fungal infections",
    coreSkills: [
      "fungal-culture",
      "antifungal-therapy",
      "invasive-candidiasis",
      "aspergillosis-management",
    ],
    minPracticeLevel: "doctorate",
  },
];
