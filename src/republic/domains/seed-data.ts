import type { CertificationLevel } from "../types.js";

export interface SeedDomain {
  path: string;
  name: string;
  description: string;
  coreSkills: string[];
  minPracticeLevel: CertificationLevel;
}

import { additionalengineeringDomains } from "./additionalengineering.js";
import { additionalhumanitiesDomains } from "./additionalhumanities.js";
import { aerospaceDomains } from "./aerospace.js";
import { agricultureDomains } from "./agriculture.js";
import { agricultureextensionsDomains } from "./agricultureextensions.js";
import { architecturedesignDomains } from "./architecturedesign.js";
import { artsDomains } from "./arts.js";
import { biotechnologyDomains } from "./biotechnology.js";
import { cybersecurityDomains } from "./cybersecurity.js";
import { dentistryDomains } from "./dentistry.js";
import { engineeringDomains } from "./engineering.js";
import { environmentalscienceDomains } from "./environmentalscience.js";
import { financeDomains } from "./finance.js";
import { humanitiesDomains } from "./humanities.js";
import { lawDomains } from "./law.js";
import { materialsscienceDomains } from "./materialsscience.js";
import { medicineDomains } from "./medicine.js";
import { musicDomains } from "./music.js";
import { neuroscienceDomains } from "./neuroscience.js";
import { philosophyDomains } from "./philosophy.js";
import { psychologysubspecialtiesDomains } from "./psychologysubspecialties.js";
import { quantumcomputingDomains } from "./quantumcomputing.js";
import { roboticsDomains } from "./robotics.js";
import { scienceDomains } from "./science.js";
import { urbanplanningDomains } from "./urbanplanning.js";

export const SEED_DOMAINS: SeedDomain[] = [
  ...medicineDomains,
  ...dentistryDomains,
  ...biotechnologyDomains,
  ...lawDomains,
  ...scienceDomains,
  ...engineeringDomains,
  ...financeDomains,
  ...humanitiesDomains,
  ...architecturedesignDomains,
  ...agricultureDomains,
  ...cybersecurityDomains,
  ...roboticsDomains,
  ...quantumcomputingDomains,
  ...philosophyDomains,
  ...musicDomains,
  ...urbanplanningDomains,
  ...environmentalscienceDomains,
  ...aerospaceDomains,
  ...psychologysubspecialtiesDomains,
  ...additionalengineeringDomains,
  ...neuroscienceDomains,
  ...materialsscienceDomains,
  ...additionalhumanitiesDomains,
  ...artsDomains,
  ...agricultureextensionsDomains,
];
