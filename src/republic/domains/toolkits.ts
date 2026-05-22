import type { ProfessionalToolkit } from "../types.js";
import { uid } from "../utils.js";

// ─── Professional Toolkit Registry ──────────────────────────────

const toolkitStore: ProfessionalToolkit[] = [];

/** Seed the default professional toolkits */
function seedToolkits(): void {
  if (toolkitStore.length > 0) {
    return;
  }

  const defaultToolkits: Omit<ProfessionalToolkit, "id">[] = [
    // Medicine — Radiology
    {
      domainPath: "Medicine.Radiology",
      name: "MONAI Medical Imaging",
      description: "MONAI framework for MRI/CT segmentation, classification, and 3D analysis",
      backendType: "vision",
      capabilities: [
        "mri-analysis",
        "ct-analysis",
        "tumor-detection",
        "3d-segmentation",
        "organ-segmentation",
      ],
      available: true,
    },
    {
      domainPath: "Medicine.Radiology",
      name: "BiomedCLIP Vision-Language",
      description:
        "Microsoft BiomedCLIP for medical image understanding and zero-shot classification",
      backendType: "multimodal",
      capabilities: [
        "image-text-matching",
        "zero-shot-diagnosis",
        "radiology-report",
        "pathology-analysis",
      ],
      available: true,
    },
    {
      domainPath: "Medicine.Radiology",
      name: "Pillar-0 3D Scanner",
      description:
        "UC Berkeley/UCSF open-source model analyzing 3D CT and MRI across 350+ findings",
      backendType: "vision",
      capabilities: [
        "3d-ct-analysis",
        "3d-mri-analysis",
        "multi-finding-detection",
        "radiological-report",
      ],
      available: true,
    },
    {
      domainPath: "Medicine.Radiology",
      name: "MedGemma Multimodal",
      description:
        "Google MedGemma for report generation, visual QA, and radiological interpretation",
      backendType: "multimodal",
      capabilities: ["report-generation", "visual-question-answering", "diagnostic-support"],
      available: true,
    },
    // Medicine — Pharmacology
    {
      domainPath: "Medicine.Pharmacology",
      name: "DSN-DDI Drug Interactions",
      description:
        "Drug-drug interaction prediction with 99.9% accuracy using graph neural networks",
      backendType: "api",
      capabilities: [
        "drug-interaction-check",
        "adverse-event-prediction",
        "prescription-validation",
        "polypharmacy-analysis",
      ],
      available: true,
    },
    // Medicine — Psychiatry
    {
      domainPath: "Medicine.Psychiatry",
      name: "NLP Diagnostic Assessment",
      description:
        "NLP-powered mental health screening for depression, anxiety, PTSD, ADHD, and more",
      backendType: "llm",
      capabilities: [
        "depression-screening",
        "anxiety-assessment",
        "ptsd-detection",
        "adhd-evaluation",
        "mood-analysis",
      ],
      available: true,
    },
    {
      domainPath: "Medicine.Psychiatry",
      name: "Multimodal Mood Analyzer",
      description:
        "Integrates text, speech patterns, and behavioral cues for comprehensive mood assessment",
      backendType: "multimodal",
      capabilities: ["sentiment-analysis", "emotional-state-detection", "treatment-recommendation"],
      available: true,
    },
    // Medicine — Endocrinology
    {
      domainPath: "Medicine.Endocrinology",
      name: "Endocrine AI Diagnostic",
      description: "AI-powered endocrine cancer detection (>99% accuracy) and hormone analysis",
      backendType: "multimodal",
      capabilities: [
        "thyroid-nodule-classification",
        "diabetes-retinopathy",
        "hormone-analysis",
        "cancer-detection",
      ],
      available: true,
    },
    // Law
    {
      domainPath: "Law",
      name: "DeepSeek Legal Reasoning",
      description: "DeepSeek-R1 for legal reasoning, case analysis, and statutory interpretation",
      backendType: "llm",
      capabilities: [
        "case-analysis",
        "legal-reasoning",
        "statute-interpretation",
        "contract-review",
        "precedent-search",
      ],
      available: true,
    },
    {
      domainPath: "Law",
      name: "Case Law NLP Engine",
      description:
        "Legal NLP for judgement prediction, text classification, and information retrieval",
      backendType: "llm",
      capabilities: [
        "judgement-prediction",
        "legal-text-classification",
        "legal-qa",
        "case-summarization",
      ],
      available: true,
    },
    // Science — Physics
    {
      domainPath: "Science.Physics",
      name: "Ansys SimAI Physics Engine",
      description:
        "AI-accelerated physics simulation for fluid dynamics, thermodynamics, and structural analysis",
      backendType: "simulation",
      capabilities: [
        "fluid-simulation",
        "thermal-analysis",
        "structural-simulation",
        "materials-modeling",
      ],
      available: true,
    },
    // Science — Biotechnology
    {
      domainPath: "Science.Biotechnology",
      name: "Autonomous Lab System",
      description:
        "Self-driving lab automation for experiment design, execution, and data analysis",
      backendType: "api",
      capabilities: [
        "experiment-design",
        "protocol-generation",
        "data-analysis",
        "hypothesis-testing",
      ],
      available: true,
    },
    // Engineering — General
    {
      domainPath: "Engineering",
      name: "Engineering Co-pilot",
      description: "AI engineering assistant for system design, CAD, and optimization",
      backendType: "multimodal",
      capabilities: ["system-design", "cad-analysis", "optimization", "simulation"],
      available: true,
    },
    // Finance
    {
      domainPath: "Finance",
      name: "Financial Analysis Engine",
      description: "AI for portfolio optimization, risk assessment, and market analysis",
      backendType: "llm",
      capabilities: [
        "portfolio-optimization",
        "risk-assessment",
        "market-analysis",
        "compliance-check",
      ],
      available: true,
    },
  ];

  for (const tk of defaultToolkits) {
    toolkitStore.push({ ...tk, id: `tk-${uid()}` });
  }
}


export { toolkitStore, seedToolkits };
