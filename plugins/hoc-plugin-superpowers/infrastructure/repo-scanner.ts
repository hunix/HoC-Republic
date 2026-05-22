/**
 * Superpowers Plugin — Infrastructure: Repo Manager & Skill Scanner
 *
 * Handles cloning/updating the superpowers repo from GitHub,
 * and scanning/parsing SKILL.md files from disk.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { SuperpowersSkill, SkillCategory } from "../domain/types.ts";

const REPO_URL = "https://github.com/obra/superpowers.git";
const REPO_DIR_NAME = "superpowers-repo";

// ─── Repo Management ────────────────────────────────────────────

/**
 * Clone the superpowers repo into the plugin data directory.
 * If already cloned, does nothing (use `updateRepo` instead).
 */
export function cloneRepo(dataDir: string): string {
  const repoPath = path.join(dataDir, REPO_DIR_NAME);
  if (fs.existsSync(path.join(repoPath, ".git"))) {
    return repoPath; // Already cloned
  }

  fs.mkdirSync(dataDir, { recursive: true });

  try {
    execSync(`git clone --depth 1 "${REPO_URL}" "${repoPath}"`, {
      timeout: 60_000,
      stdio: "pipe",
    });
  } catch (err) {
    throw new Error(
      `Failed to clone superpowers repo: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  return repoPath;
}

/**
 * Pull latest changes from the superpowers repo.
 */
export function updateRepo(repoPath: string): { updated: boolean; message: string } {
  if (!fs.existsSync(path.join(repoPath, ".git"))) {
    return { updated: false, message: "Not a git repo" };
  }

  try {
    const before = execSync("git rev-parse HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();

    execSync("git pull --ff-only origin main", {
      cwd: repoPath,
      timeout: 30_000,
      stdio: "pipe",
    });

    const after = execSync("git rev-parse HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();

    if (before !== after) {
      return {
        updated: true,
        message: `Updated from ${before.slice(0, 7)} to ${after.slice(0, 7)}`,
      };
    }
    return { updated: false, message: "Already up to date" };
  } catch (err) {
    return { updated: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get the current git version/hash of the repo.
 */
export function getRepoVersion(repoPath: string): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

// ─── YAML Frontmatter Parser ────────────────────────────────────

interface Frontmatter {
  name: string;
  description: string;
}

function extractFrontmatter(content: string): Frontmatter {
  const lines = content.split("\n");
  let inFrontmatter = false;
  let name = "";
  let description = "";

  for (const line of lines) {
    if (line.trim() === "---") {
      if (inFrontmatter) {
        break;
      }
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        if (key === "name") {
          name = value.trim();
        }
        if (key === "description") {
          description = value.trim();
        }
      }
    }
  }

  return { name, description };
}

function stripFrontmatter(content: string): string {
  const lines = content.split("\n");
  let inFrontmatter = false;
  let frontmatterEnded = false;
  const result: string[] = [];

  for (const line of lines) {
    if (line.trim() === "---") {
      if (inFrontmatter) {
        frontmatterEnded = true;
        continue;
      }
      inFrontmatter = true;
      continue;
    }
    if (frontmatterEnded || !inFrontmatter) {
      result.push(line);
    }
  }

  return result.join("\n").trim();
}

// ─── Category Detection ─────────────────────────────────────────

const CATEGORY_MAP: Record<string, SkillCategory> = {
  "test-driven-development": "testing",
  "verification-before-completion": "testing",
  "systematic-debugging": "debugging",
  brainstorming: "collaboration",
  "writing-plans": "collaboration",
  "executing-plans": "workflow",
  "dispatching-parallel-agents": "workflow",
  "subagent-driven-development": "workflow",
  "requesting-code-review": "collaboration",
  "receiving-code-review": "collaboration",
  "using-git-worktrees": "workflow",
  "finishing-a-development-branch": "workflow",
  "using-superpowers": "meta",
  "writing-skills": "meta",
};

function categorizeSkill(id: string): SkillCategory {
  return CATEGORY_MAP[id] ?? "workflow";
}

// ─── Skill Scanner ──────────────────────────────────────────────

/**
 * Scan the superpowers repo for all SKILL.md files.
 * Parses YAML frontmatter and extracts content.
 */
export function scanSkills(repoPath: string): SuperpowersSkill[] {
  const skillsDir = path.join(repoPath, "skills");
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const skills: SuperpowersSkill[] = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillDir = path.join(skillsDir, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");

    if (!fs.existsSync(skillFile)) {
      continue;
    }

    try {
      const rawContent = fs.readFileSync(skillFile, "utf-8");
      const { name, description } = extractFrontmatter(rawContent);
      const content = stripFrontmatter(rawContent);

      // Find companion files (everything in the skill dir except SKILL.md)
      const companionFiles = fs
        .readdirSync(skillDir)
        .filter((f) => f !== "SKILL.md")
        .map((f) => path.join(skillDir, f));

      skills.push({
        id: entry.name,
        name: name || entry.name.replace(/-/g, " "),
        description: description || "",
        content,
        dirPath: skillDir,
        companionFiles,
        category: categorizeSkill(entry.name),
      });
    } catch {
      // Skip malformed skill files
    }
  }

  return skills;
}
