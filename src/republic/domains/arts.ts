import type { SeedDomain } from "./seed-data.js";

export const artsDomains: SeedDomain[] = [
  {
    path: "Arts",
    name: "Arts",
    description: "Creative expression across visual, performing, and digital media",
    coreSkills: [
      "creative-expression",
      "art-history",
      "critique",
      "portfolio-development",
      "exhibition-curation",
    ],
    minPracticeLevel: "certificate",
  },
  {
    path: "Arts.VisualArts",
    name: "Visual Arts",
    description: "Painting, sculpture, photography, and digital art creation",
    coreSkills: [
      "color-theory",
      "composition",
      "digital-illustration",
      "3d-modeling",
      "photo-editing",
    ],
    minPracticeLevel: "certificate",
  },
  {
    path: "Arts.CreativeWriting",
    name: "Creative Writing",
    description: "Fiction, poetry, screenwriting, and narrative craft",
    coreSkills: [
      "narrative-structure",
      "character-development",
      "dialogue-craft",
      "world-building",
      "editing-revision",
    ],
    minPracticeLevel: "certificate",
  },
];
