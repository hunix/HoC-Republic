/**
 * Output Manager — Types and Constants
 */

export type OutputCategory =
  | "art"
  | "music"
  | "video"
  | "docs"
  | "code"
  | "games"
  | "websites"
  | "research"
  | "screenplays"
  | "3d-models"
  | "designs"
  | "podcasts"
  | "inventions"
  | "journals"
  | "chronicles"
  | "dreams"
  | "ml-models"
  | "datasets"
  | "ads"
  | "medical"
  | "state";

export interface OutputEntry {
  id: string;
  category: OutputCategory;
  filename: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string;
  fileSize: number;
  createdAt: string;
  tick: number;
}

/** A single file within a multi-file project scaffold. */
export interface ProjectFile {
  /** Relative path within the project folder, e.g. "src/index.ts" */
  path: string;
  content: string;
}

export type SingleFileResult = {
  filename: string;
  content: string;
  title: string;
  isBinary?: true;
};
export type ProjectResult = { slug: string; files: ProjectFile[]; title: string };
export type GeneratorResult = SingleFileResult | ProjectResult;
export type GeneratorFn = (creatorName: string) => GeneratorResult;

export function isProjectResult(r: GeneratorResult): r is ProjectResult {
  return "slug" in r && "files" in r;
}

export const ALL_CATEGORIES: OutputCategory[] = [
  "art",
  "music",
  "video",
  "docs",
  "code",
  "games",
  "websites",
  "research",
  "screenplays",
  "3d-models",
  "designs",
  "podcasts",
  "inventions",
  "journals",
  "chronicles",
  "dreams",
  "ml-models",
  "datasets",
  "medical",
  "state",
];

export interface CreativeEvolution {
  totalOutputs: number;
  ticksActive: number;
  categoryExperience: Record<string, number>;
  complexityLevel: number;
}
