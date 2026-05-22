import type { SeedDomain } from "./seed-data.js";

export const dentistryDomains: SeedDomain[] = [
  {
    path: "Dentistry",
    name: "Dentistry",
    description:
      "Oral health care encompassing prevention, diagnosis, and treatment of dental conditions",
    coreSkills: [
      "dental-examination",
      "oral-radiology",
      "treatment-planning",
      "patient-communication",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Dentistry.GeneralDentistry",
    name: "General Dentistry",
    description: "Comprehensive oral healthcare including restorations, extractions, and hygiene",
    coreSkills: [
      "cavity-restoration",
      "tooth-extraction",
      "prophylaxis",
      "dental-x-ray-interpretation",
      "crown-bridge",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Dentistry.Orthodontics",
    name: "Orthodontics",
    description: "Correction of teeth and jaw alignment using braces and appliances",
    coreSkills: [
      "cephalometric-analysis",
      "treatment-planning-ortho",
      "braces-management",
      "clear-aligner-therapy",
      "orthognathic-surgery-planning",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Dentistry.Periodontics",
    name: "Periodontics",
    description: "Prevention and treatment of gum diseases and supporting tooth structures",
    coreSkills: [
      "periodontal-examination",
      "scaling-root-planing",
      "gingival-surgery",
      "implant-placement",
      "bone-grafting",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Dentistry.OralMaxillofacialSurgery",
    name: "Oral & Maxillofacial Surgery",
    description: "Surgical treatment of diseases and defects of the mouth, jaws, and face",
    coreSkills: [
      "wisdom-tooth-extraction",
      "jaw-reconstruction",
      "facial-trauma",
      "tmj-surgery",
      "orthognathic-surgery",
    ],
    minPracticeLevel: "doctorate",
  },
  {
    path: "Dentistry.Endodontics",
    name: "Endodontics",
    description: "Root canal therapy and treatment of dental pulp diseases",
    coreSkills: [
      "root-canal-treatment",
      "endodontic-retreatment",
      "apicoectomy",
      "endodontic-imaging",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Dentistry.Prosthodontics",
    name: "Prosthodontics",
    description: "Design and fitting of dentures, implants, and tooth replacements",
    coreSkills: [
      "complete-dentures",
      "implant-prosthodontics",
      "fixed-prosthodontics",
      "maxillofacial-prosthetics",
      "cad-cam-dentistry",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Dentistry.PediatricDentistry",
    name: "Pediatric Dentistry",
    description: "Dental care for children and adolescents",
    coreSkills: [
      "child-behavioral-management",
      "fluoride-therapy",
      "sealants",
      "pediatric-restorations",
    ],
    minPracticeLevel: "master",
  },
];
