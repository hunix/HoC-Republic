import type { SeedDomain } from "./seed-data.js";

export const lawDomains: SeedDomain[] = [
  {
    path: "Law",
    name: "Law",
    description: "Legal analysis, case law, statutory interpretation, and advocacy",
    coreSkills: [
      "legal-research",
      "case-analysis",
      "statutory-interpretation",
      "legal-writing",
      "argumentation",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Law.CorporateLaw",
    name: "Corporate Law",
    description: "Business law, corporate governance, mergers, and compliance",
    coreSkills: [
      "contract-drafting",
      "corporate-governance",
      "compliance-analysis",
      "due-diligence",
      "securities-law",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Law.CorporateLaw.MergersAcquisitions",
    name: "Mergers & Acquisitions",
    description: "M&A transaction structuring, valuation, and regulatory compliance",
    coreSkills: [
      "deal-structuring",
      "valuation-analysis",
      "antitrust-review",
      "integration-planning",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Law.CriminalLaw",
    name: "Criminal Law",
    description: "Criminal defense and prosecution, evidence analysis, and sentencing",
    coreSkills: [
      "evidence-analysis",
      "case-building",
      "plea-negotiation",
      "sentencing-guidelines",
      "constitutional-law",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Law.IntellectualProperty",
    name: "Intellectual Property",
    description: "Patents, trademarks, copyrights, and trade secret protection",
    coreSkills: [
      "patent-analysis",
      "trademark-search",
      "ip-portfolio-management",
      "licensing-negotiation",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Law.InternationalLaw",
    name: "International Law",
    description: "Treaties, cross-border disputes, and international governance",
    coreSkills: [
      "treaty-analysis",
      "jurisdictional-analysis",
      "international-arbitration",
      "diplomatic-law",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Law.ConstitutionalLaw",
    name: "Constitutional Law",
    description: "Constitutional interpretation, civil rights, and governmental authority",
    coreSkills: [
      "constitutional-interpretation",
      "civil-rights-analysis",
      "judicial-review",
      "precedent-analysis",
    ],
    minPracticeLevel: "master",
  },
];
