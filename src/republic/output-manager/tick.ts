/**
 * Output Manager — Generator Registry and Main Tick
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { RepublicState } from "../types.js";
import type { OutputCategory, GeneratorFn, SingleFileResult } from "./types.js";
import { generateRandomGame } from "../game-generators.js";
import { medicalIntelligenceTick } from "../medical-intelligence.js";
import { generateMusicTrack } from "../music-generator.js";
import { pick, rng, ts } from "../utils.js";
import { generateRandomWorld } from "../world-generators.js";
import {
  evolveCreativity,
  recordCreation,
  evolution,
  logOutput,
  writeTextOutput,
  writeBinaryOutput,
  writeProjectOutput,
} from "./core.js";
import { isProjectResult } from "./types.js";

// ─── Delegating wrappers for generators from external deps ──────

function generateReal3DGame(creatorName: string): SingleFileResult {
  const generated = generateRandomGame(creatorName);
  return { filename: generated.filename, content: generated.html, title: generated.title };
}

function generateReal3DWorld(creatorName: string): SingleFileResult {
  const generated = generateRandomWorld(creatorName);
  return { filename: generated.filename, content: generated.html, title: generated.title };
}

// ─── Imports from domain generators ─────────────────────────────

import {
  generateCodeProject,
  generateGameProject,
  generateWebsite,
  generateDesignSystem,
} from "./gen-code-projects.js";
import {
  generateScreenplay,
  generatePodcast,
  generateVideoStoryboard,
  generateRealVideoHTML,
  generateAdvertisement,
} from "./gen-media.js";
import { generateMLPipeline, generateLLMProject, generateDataset } from "./gen-ml.js";
import { generateMusicScore, generateArtwork, generateAnimation } from "./gen-music-art.js";
import {
  generateResearchNotebook,
  generate3DModel,
  generateInvention,
  generateDocumentReport,
  generatePresentationDeck,
  generateSpreadsheetData,
} from "./gen-research-docs.js";

// ─── Emoji Map ──────────────────────────────────────────────────

const EMOJI: Record<string, string> = {
  music: "\uD83C\uDFB5",
  screenplays: "\uD83D\uDCDD",
  code: "\uD83D\uDCBB",
  games: "\uD83C\uDFAE",
  research: "\uD83D\uDD2C",
  "3d-models": "\uD83E\uDDCA",
  websites: "\uD83C\uDF10",
  podcasts: "\uD83C\uDF99\uFE0F",
  inventions: "\uD83D\uDCA1",
  designs: "\uD83C\uDFA8",
  art: "\uD83D\uDDBC\uFE0F",
  video: "\uD83C\uDFAC",
  "ml-models": "\uD83E\uDDE0",
  datasets: "\uD83D\uDCCA",
  ads: "\uD83D\uDCE2",
  docs: "\uD83D\uDCC4",
};

// ─── Generator Registry ─────────────────────────────────────────

const GENERATORS: {
  category: OutputCategory;
  weight: number;
  gen: GeneratorFn;
  specializations: string[];
}[] = [
  {
    category: "music",
    weight: 15,
    gen: generateMusicScore,
    specializations: ["Composer", "Musician", "Filmmaker", "SoundDesigner"],
  },
  {
    category: "screenplays",
    weight: 10,
    gen: generateScreenplay,
    specializations: ["Filmmaker", "Writer", "ContentCreator", "CinematicDirector"],
  },
  {
    category: "code",
    weight: 12,
    gen: generateCodeProject,
    specializations: ["Engineer", "Developer", "WebDeveloper", "DataScientist"],
  },
  {
    category: "games",
    weight: 18,
    gen: generateGameProject,
    specializations: [
      "GameDeveloper",
      "3DArtist",
      "2DArtist",
      "VFXArtist",
      "LevelDesigner",
      "SoundDesigner",
      "CinematicDirector",
      "Designer",
    ],
  },
  {
    category: "research",
    weight: 10,
    gen: generateResearchNotebook,
    specializations: ["Researcher", "Scientist", "DataScientist", "Analyst"],
  },
  {
    category: "3d-models",
    weight: 8,
    gen: generate3DModel,
    specializations: ["Architect", "Designer", "Artist", "3DArtist"],
  },
  {
    category: "websites",
    weight: 10,
    gen: generateWebsite,
    specializations: ["WebDeveloper", "Designer", "ContentCreator", "2DArtist"],
  },
  {
    category: "podcasts",
    weight: 8,
    gen: generatePodcast,
    specializations: ["ContentCreator", "Writer", "Diplomat"],
  },
  {
    category: "inventions",
    weight: 5,
    gen: generateInvention,
    specializations: ["Researcher", "Scientist", "Engineer", "Inventor"],
  },
  {
    category: "art",
    weight: 12,
    gen: generateArtwork,
    specializations: ["Artist", "2DArtist", "3DArtist", "Designer", "VFXArtist"],
  },
  {
    category: "designs",
    weight: 8,
    gen: generateAnimation,
    specializations: ["VFXArtist", "2DArtist", "Designer", "WebDeveloper"],
  },
  {
    category: "video",
    weight: 10,
    gen: generateVideoStoryboard,
    specializations: ["Filmmaker", "CinematicDirector", "ContentCreator", "Writer"],
  },
  {
    category: "designs",
    weight: 6,
    gen: generateDesignSystem,
    specializations: ["Designer", "WebDeveloper", "2DArtist", "ContentCreator"],
  },
  {
    category: "ml-models",
    weight: 14,
    gen: generateMLPipeline,
    specializations: ["DataScientist", "Scientist", "Researcher", "Engineer", "Developer"],
  },
  {
    category: "ml-models",
    weight: 12,
    gen: generateLLMProject,
    specializations: ["DataScientist", "Engineer", "Researcher", "Developer", "Scientist"],
  },
  {
    category: "datasets",
    weight: 10,
    gen: generateDataset,
    specializations: ["DataScientist", "Analyst", "Researcher", "Scientist", "Engineer"],
  },
  // ─── Document Generators ────────────────────────────────────
  {
    category: "docs",
    weight: 12,
    gen: generateDocumentReport,
    specializations: ["Writer", "Analyst", "Researcher", "ContentCreator", "Diplomat"],
  },
  {
    category: "docs",
    weight: 8,
    gen: generatePresentationDeck,
    specializations: ["ContentCreator", "Diplomat", "Writer", "Designer", "Analyst"],
  },
  {
    category: "docs",
    weight: 10,
    gen: generateSpreadsheetData,
    specializations: ["Analyst", "DataScientist", "Researcher", "Engineer", "Economist"],
  },
  // ─── Real Content Generators ────────────────────────────────
  {
    category: "games",
    weight: 20,
    gen: generateReal3DGame,
    specializations: [
      "GameDeveloper",
      "GameDesigner",
      "Developer",
      "Engineer",
      "3DArtist",
      "Animator",
    ],
  },
  {
    category: "3d-models",
    weight: 15,
    gen: generateReal3DWorld,
    specializations: [
      "Architect",
      "3DArtist",
      "GameDeveloper",
      "GameDesigner",
      "Artist",
      "Designer",
      "VFXArtist",
      "Animator",
      "Filmmaker",
    ],
  },
  {
    category: "video",
    weight: 18,
    gen: generateRealVideoHTML,
    specializations: [
      "Filmmaker",
      "CinematicDirector",
      "ContentCreator",
      "VFXArtist",
      "Animator",
      "Designer",
    ],
  },
  {
    category: "ads",
    weight: 12,
    gen: generateAdvertisement,
    specializations: ["ContentCreator", "Designer", "Writer", "Filmmaker", "Diplomat", "2DArtist"],
  },
  // ─── Medical Research Generators ────────────────────────────────
  {
    category: "research",
    weight: 25,
    gen: (creatorName: string): SingleFileResult => {
      const RESEARCH_TOPICS = [
        "Genomic drivers of treatment resistance in glioblastoma multiforme",
        "CRISPR base editing for beta-hemoglobinopathies: phase II outcomes",
        "NAD+ supplementation and epigenetic age reversal: randomized trial",
        "Multi-omics landscape of triple-negative breast cancer subtypes",
        "Novel biomarkers for early Alzheimer detection using plasma proteomics",
        "CAR-T cell therapy in solid tumors: overcoming the immunosuppressive microenvironment",
        "Long-term cardiovascular outcomes of GLP-1 receptor agonists in T2DM",
        "Gut microbiome dysbiosis as a driver of autoimmune disease progression",
        "mRNA vaccine platforms for personalized neoantigen cancer immunotherapy",
        "Senolytics and healthspan extension: meta-analysis of preclinical models",
      ];
      const METHODS = [
        "Whole-exome sequencing of 847 patient samples with matched controls",
        "Randomized double-blind placebo-controlled trial (n=312, 24-month follow-up)",
        "Single-cell RNA sequencing analysis with unsupervised clustering",
        "CRISPR-Cas9 functional genomics screen across 18 cell lines",
        "Multi-center prospective cohort study with propensity score matching",
      ];
      const topic = RESEARCH_TOPICS[Math.floor(Math.random() * RESEARCH_TOPICS.length)];
      const method = METHODS[Math.floor(Math.random() * METHODS.length)];
      return {
        title: topic,
        filename: `research_paper_${Date.now()}.md`,
        content: [
          `# ${topic}`,
          ``,
          `**Author:** ${creatorName}`,
          `**Publication Date:** ${new Date().toISOString().split("T")[0]}`,
          `**Journal:** Republic Journal of Medical Sciences`,
          ``,
          `## Abstract`,
          `This research presents a comprehensive investigation into ${topic.toLowerCase()}. `,
          `Using advanced methodologies, we analyzed molecular, clinical, and genetic data `,
          `to identify novel therapeutic targets and biomarkers.`,
          ``,
          `## Methods`,
          `${method}. Statistical analysis performed using R (v4.3) and Python (v3.12).`,
          `All procedures followed IRB-approved protocols.`,
          ``,
          `## Results`,
          `Our findings demonstrate statistically significant differences (p<0.001) `,
          `across key outcome measures. Mechanistic insights were validated in multiple `,
          `independent cohorts.`,
          ``,
          `## Discussion`,
          `These results advance our understanding of ${topic.toLowerCase()} and `,
          `have direct clinical implications for patient management and future drug development.`,
          ``,
          `## Conclusions`,
          `This work establishes a new framework for understanding and targeting `,
          `the molecular basis of disease in this field.`,
          ``,
          `---`,
          `*Republic Medical & Scientific Center — Research Division*`,
        ].join("\n"),
      };
    },
    specializations: [
      "Doctor",
      "Neurologist",
      "Neurosurgeon",
      "Cardiologist",
      "Oncologist",
      "Pathologist",
      "Immunologist",
      "Pharmacologist",
      "GeneticEngineer",
      "Biotechnologist",
      "Biochemist",
      "Bioinformatician",
      "Pharmacogenomicist",
      "Gerontologist",
      "Microbiologist",
      "InfectiousDiseaseSpecialist",
    ],
  },
  {
    category: "docs",
    weight: 20,
    gen: (creatorName: string): SingleFileResult => {
      const CASE_TOPICS = [
        {
          chief: "Sudden onset severe headache",
          dx: "Subarachnoid hemorrhage from ruptured berry aneurysm",
          domain: "Neurology",
        },
        {
          chief: "Chest pain, diaphoresis, nausea",
          dx: "ST-elevation myocardial infarction (STEMI) — inferolateral",
          domain: "Cardiology",
        },
        {
          chief: "Progressive memory loss and personality change",
          dx: "Behavioural variant frontotemporal dementia (bvFTD)",
          domain: "Neurology",
        },
        {
          chief: "Recurrent DVT with family history",
          dx: "Factor V Leiden heterozygous mutation — thrombophilia",
          domain: "Hematology",
        },
        {
          chief: "Bilateral hand tremor worsening over 10 years",
          dx: "Essential tremor vs early Parkinson — DaTSCAN negative",
          domain: "Neurology",
        },
        {
          chief: "Episodic weakness after exercise",
          dx: "Channelopathy: Hypokalemic periodic paralysis type 1 (CACNA1S)",
          domain: "Neuromuscular",
        },
        {
          chief: "Skin rash, joint pain, fatigue, photosensitivity",
          dx: "Systemic lupus erythematosus (SLE) — SLICC criteria met",
          domain: "Immunology",
        },
        {
          chief: "Shortness of breath, hypoxia in previously healthy child",
          dx: "Primary ciliary dyskinesia — ultrastructural defect confirmed",
          domain: "Pediatrics",
        },
      ];
      const cs = CASE_TOPICS[Math.floor(Math.random() * CASE_TOPICS.length)];
      return {
        title: `Case Study: ${cs.chief}`,
        filename: `case_study_${Date.now()}.md`,
        content: [
          `# Medical Case Study`,
          `**Presenting Complaint:** ${cs.chief}`,
          `**Author:** ${creatorName}`,
          `**Domain:** ${cs.domain}`,
          `**Date:** ${new Date().toISOString().split("T")[0]}`,
          ``,
          `## Clinical Presentation`,
          `Patient presenting with ${cs.chief.toLowerCase()}. Relevant history, examination `,
          `findings, and investigations were systematically collected.`,
          ``,
          `## Investigations`,
          `Standard laboratory panel, ECG, imaging (CT/MRI as appropriate), `,
          `and specialist-specific investigations were performed.`,
          ``,
          `## Diagnosis`,
          `**Final Diagnosis:** ${cs.dx}`,
          ``,
          `## Management`,
          `Evidence-based treatment was initiated per current international guidelines. `,
          `Patient response was monitored with appropriate follow-up scheduled.`,
          ``,
          `## Learning Points`,
          `1. This case demonstrates the importance of systematic differential diagnosis.`,
          `2. Early specialist consultation is crucial in complex presentations.`,
          `3. Evidence-based protocols guide management and improve outcomes.`,
          ``,
          `---`,
          `*Republic Medical Center — Case Report Library*`,
        ].join("\n"),
      };
    },
    specializations: [
      "Doctor",
      "Medic",
      "Neurologist",
      "Radiologist",
      "Psychiatrist",
      "Cardiologist",
      "Oncologist",
      "Pathologist",
      "Gastroenterologist",
      "Pulmonologist",
      "EmergencyPhysician",
      "Endocrinologist",
      "Obstetrician",
      "Pediatrician",
      "Nephrologist",
      "Anesthesiologist",
      "Ophthalmologist",
      "Dentist",
    ],
  },
];

// ─── Main Tick ──────────────────────────────────────────────────

export function outputManagerTick(s: RepublicState): void {
  evolveCreativity();

  // Medical intelligence runs on its own cadence every tick
  medicalIntelligenceTick(s);

  if (rng() > 0.1) {
    return;
  }

  const creators = s.citizens.filter(
    (c) => c.activity === "Creating" || c.activity === "Working" || c.activity === "Coding",
  );
  if (creators.length === 0) {
    return;
  }

  const citizen = pick(creators);

  // Pick a generator, biased by citizen's specialization
  const matching = GENERATORS.filter((g) =>
    g.specializations.includes(citizen.specialization ?? ""),
  );
  const pool = matching.length > 0 && rng() < 0.7 ? matching : GENERATORS;

  // Weighted random selection
  const totalWeight = pool.reduce((sum, g) => sum + g.weight, 0);
  let roll = rng() * totalWeight;
  let selected = pool[0];
  for (const g of pool) {
    roll -= g.weight;
    if (roll <= 0) {
      selected = g;
      break;
    }
  }

  // Generate and write — dispatch based on return shape
  // For music category: attempt async AI generation via HuggingFace in the background
  if (selected.category === "music") {
    // Fire async AI music generation — writes directly to disk when done
    void (async () => {
      try {
        const result = await generateMusicTrack(citizen.name, citizen.specialization);
        const outputDir = path.join(process.cwd(), "republic-output", "music");
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, result.filename);
        fs.writeFileSync(outputPath, result.audioBuffer);
        logOutput(
          "music",
          result.filename,
          citizen.id,
          citizen.name,
          result.title,
          `AI music: ${result.prompt.slice(0, 100)}`,
          result.audioBuffer.length,
          s.currentTick,
        );
        recordCreation("music");
        s.events.push({
          citizenId: citizen.id,
          citizenName: citizen.name,
          type: "Creation",
          description: `${EMOJI.music ?? "🎵"} ${citizen.name} produced music: "${result.title}" [${result.source}]`,
          timestamp: ts(),
        });
      } catch {
        // Non-fatal: music generation failing shouldn't crash the tick
      }
    })();
    return;
  }

  const result = selected.gen(citizen.name);
  let outputPath: string | null = null;

  if (isProjectResult(result)) {
    outputPath = writeProjectOutput(
      selected.category,
      result.slug,
      result.files,
      citizen.id,
      citizen.name,
      result.title,
      s.currentTick,
    );
  } else if (!isProjectResult(result) && result.isBinary) {
    // Binary content (base64-encoded) — must use writeBinaryOutput, NOT writeTextOutput
    outputPath = writeBinaryOutput(
      selected.category,
      result.filename,
      result.content,
      citizen.id,
      citizen.name,
      result.title,
      s.currentTick,
    );
  } else {
    outputPath = writeTextOutput(
      selected.category,
      result.filename,
      result.content,
      citizen.id,
      citizen.name,
      result.title,
      s.currentTick,
    );
  }

  if (outputPath) {
    recordCreation(selected.category);
    const fileCount = isProjectResult(result) ? ` (${result.files.length} files)` : "";
    s.events.push({
      citizenId: citizen.id,
      citizenName: citizen.name,
      type: "Creation",
      description: `${EMOJI[selected.category] ?? "📦"} ${citizen.name} produced ${selected.category}: "${result.title}"${fileCount} [cx:${evolution.complexityLevel.toFixed(1)}]`,
      timestamp: ts(),
    });
  }
}
