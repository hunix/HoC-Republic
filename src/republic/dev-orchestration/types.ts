/**
 * Dev Orchestration — Project Types and Interfaces
 */

// ─── Dev Project ────────────────────────────────────────────────

export type ProjectType =
  | "software"
  | "music"
  | "visual-art"
  | "literature"
  | "research"
  | "video"
  | "mixed";

export type TeamRole =
  | "lead"
  | "developer"
  | "designer"
  | "architect"
  | "qa"
  | "pm"
  | "specialist"
  | "musician"
  | "writer"
  | "artist"
  | "researcher"
  | "analyst";

export interface TeamMember {
  citizenId: string;
  citizenName: string;
  role: TeamRole;
  specialization: string;
  assignedAt: string;
}

export interface DevProject {
  id: string;
  name: string;
  description: string;
  projectType: ProjectType;
  ownerId: string;
  ownerName: string;
  stack: ProjectStack;
  status: ProjectStatus;
  team: TeamMember[];
  files: ProjectFile[];
  tests: TestSuite;
  deployments: Deployment[];
  buildHealth: number; // 0-1
  codeQuality: number; // 0-1
  createdAt: string;
  updatedAt: string;
  commitCount: number;
  linesOfCode: number;
  lastDeployedAt: string | null;
}

export type ProjectStatus =
  | "planning"
  | "scaffolding"
  | "active"
  | "testing"
  | "reviewing"
  | "deploying"
  | "deployed"
  | "maintenance"
  | "archived";

export interface ProjectStack {
  languages: string[];
  frameworks: string[];
  databases: string[];
  infrastructure: string[];
}

export interface ProjectFile {
  path: string;
  language: string;
  linesOfCode: number;
  lastModified: string;
  quality: number; // 0-1
  content: string; // actual file content
}

export interface TestSuite {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage: number; // 0-1
  lastRunAt: string | null;
}

export interface Deployment {
  id: string;
  environment: "dev" | "staging" | "production";
  status: "pending" | "building" | "deploying" | "live" | "failed" | "rolled-back";
  url: string | null;
  deployedAt: string;
  version: string;
}
