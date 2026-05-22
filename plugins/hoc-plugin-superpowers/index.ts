/**
 * HoC Superpowers Plugin — Entry Point
 *
 * Integrates obra/superpowers (60k+ ★) agentic skills framework
 * into the Republic citizen intelligence layer.
 *
 * On init:
 * 1. Clones the superpowers repo (if not present)
 * 2. Scans all SKILL.md files → builds skill cache
 * 3. Registers tools & gateway methods
 * 4. Subscribes to tick events for dynamic skill injection
 *
 * DDD Structure:
 *   domain/         — Pure types (skills, matches, status)
 *   application/    — Skill matcher & prompt enhancer
 *   infrastructure/ — Git clone, disk scanning, YAML parser
 *   adapter/        — HoC integration bridge
 */

import type {
  HoCPluginContext,
  HoCPluginModule,
  HoCHealthStatus,
} from "../../src/republic/hoc-plugin-types.ts";
import {
  initAdapter,
  getAllSkills,
  getSkillById,
  getSkillMatches,
  getLibraryStatus,
  refreshCache,
} from "./adapter/hoc-bridge.ts";
import {
  cloneRepo,
  updateRepo,
  scanSkills,
  getRepoVersion,
} from "./infrastructure/repo-scanner.ts";

// ─── Plugin State ───────────────────────────────────────────────

let ctx: HoCPluginContext | null = null;
let initialized = false;
let repoPath: string | null = null;
let skillCount = 0;

// ─── Lifecycle ──────────────────────────────────────────────────

export async function init(pluginCtx: HoCPluginContext): Promise<void> {
  ctx = pluginCtx;
  ctx.logger.info("Superpowers plugin initializing...");

  // Step 1: Clone or locate the repo
  try {
    ctx.logger.info("Cloning/locating superpowers repo...");
    repoPath = cloneRepo(pluginCtx.dataDir);
    ctx.logger.info(`Superpowers repo at: ${repoPath}`);
  } catch (err) {
    ctx.logger.warn(
      `Git clone failed (offline?): ${err instanceof Error ? err.message : String(err)}`,
    );
    ctx.logger.info("Superpowers will run in degraded mode (no skills loaded).");
    initialized = true;
    return;
  }

  // Step 2: Scan and load skills
  const skills = scanSkills(repoPath);
  skillCount = skills.length;
  initAdapter(skills, repoPath);
  ctx.logger.info(`Loaded ${skillCount} Superpowers skills`);

  // Log skill summary
  const byCategory = new Map<string, number>();
  for (const s of skills) {
    byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);
  }
  for (const [cat, count] of byCategory) {
    ctx.logger.info(`  ${cat}: ${count} skill(s)`);
  }

  // Step 3: Register tools
  ctx.registerTools([
    {
      name: "superpowers_list_skills",
      description: "List all available Superpowers cognitive methodology skills",
      handler: async () => {
        return getAllSkills().map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          description: s.description,
          companionFiles: s.companionFiles.length,
        }));
      },
    },
    {
      name: "superpowers_get_skill",
      description: "Get the full content of a specific Superpowers skill by ID",
      parameters: { skillId: { type: "string", description: "Skill ID (e.g. 'brainstorming')" } },
      handler: async (params) => {
        const id = params.skillId as string;
        const skill = getSkillById(id);
        if (!skill) {
          return { error: `Skill not found: ${id}` };
        }
        return {
          id: skill.id,
          name: skill.name,
          category: skill.category,
          description: skill.description,
          content: skill.content,
          companionFiles: skill.companionFiles,
        };
      },
    },
    {
      name: "superpowers_match_skills",
      description: "Match skills to a citizen's current task/activity context",
      parameters: {
        activity: { type: "string", description: "Current activity" },
        specialization: { type: "string", description: "Citizen specialization" },
        taskDescription: { type: "string", description: "Optional task description" },
      },
      handler: async (params) => {
        const matches = getSkillMatches(
          params.activity as string,
          params.specialization as string,
          params.taskDescription as string | undefined,
        );
        return matches.map((m) => ({
          skillId: m.skill.id,
          skillName: m.skill.name,
          confidence: m.confidence,
          reason: m.reason,
          category: m.skill.category,
        }));
      },
    },
    {
      name: "superpowers_install",
      description: "Clone/install the superpowers repo from GitHub",
      handler: async () => {
        if (!ctx) {
          return { error: "Plugin not initialized" };
        }
        try {
          repoPath = cloneRepo(ctx.dataDir);
          const skills = scanSkills(repoPath);
          skillCount = skills.length;
          refreshCache(skills);
          return { success: true, skillCount, repoPath };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: "superpowers_update",
      description: "Pull latest changes from the superpowers GitHub repo",
      handler: async () => {
        if (!repoPath) {
          return { error: "Repo not installed" };
        }
        const result = updateRepo(repoPath);
        if (result.updated) {
          const skills = scanSkills(repoPath);
          skillCount = skills.length;
          refreshCache(skills);
        }
        return { ...result, skillCount };
      },
    },
  ]);

  // Step 4: Register gateway RPC methods
  // Note: The plugin manager stores handlers as `unknown` internally (hoc-plugin-manager.ts:49).
  // We cast to `any` because plugin gateway handlers use a simplified signature
  // rather than the full GatewayRequestHandlerOptions required by the type system.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerGw = ctx.registerGateway as (method: string, handler: unknown) => void;

  registerGw("superpowers.listSkills", async () => {
    const skills = getAllSkills();
    return {
      skills: skills.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
      })),
    };
  });

  registerGw("superpowers.getSkill", async () => {
    return { skills: getAllSkills().map((s) => ({ id: s.id, name: s.name })) };
  });

  registerGw("superpowers.matchSkills", async () => {
    return { message: "Use superpowers_match_skills tool with activity/specialization params" };
  });

  registerGw("superpowers.status", async () => {
    const status = getLibraryStatus();
    const version = repoPath ? getRepoVersion(repoPath) : null;
    return { ...status, version };
  });

  registerGw("superpowers.install", async () => {
    if (!ctx) {
      return { error: "Plugin not initialized" };
    }
    try {
      repoPath = cloneRepo(ctx.dataDir);
      const skills = scanSkills(repoPath);
      skillCount = skills.length;
      refreshCache(skills);
      return { success: true, skillCount };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  registerGw("superpowers.update", async () => {
    if (!repoPath) {
      return { error: "Not installed" };
    }
    const result = updateRepo(repoPath);
    if (result.updated) {
      const skills = scanSkills(repoPath);
      skillCount = skills.length;
      refreshCache(skills);
    }
    return { ...result, skillCount };
  });

  // Step 5: Subscribe to events
  ctx.on("tick:before", () => {
    // Skills are already injected via the prompt builder integration
    // This hook is for future enhancements (skill usage tracking, etc.)
  });

  ctx.on("citizen:task_assigned", (data) => {
    const d = data as { citizenName?: string; task?: string };
    if (d.citizenName && d.task) {
      ctx?.logger.debug?.(`Task assigned to ${d.citizenName}: ${d.task}`);
    }
  });

  initialized = true;
  ctx.logger.info(`Superpowers plugin ready! ${skillCount} skills loaded.`);
}

export async function shutdown(): Promise<void> {
  ctx?.logger.info("Superpowers plugin shutting down.");
  initialized = false;
  ctx = null;
}

export async function healthCheck(): Promise<HoCHealthStatus> {
  return {
    healthy: initialized,
    message: initialized ? `${skillCount} skills loaded from superpowers repo` : "Not initialized",
    details: {
      skillCount,
      repoInstalled: repoPath !== null,
      repoPath,
    },
  };
}

const superpowersPlugin: HoCPluginModule = { init, shutdown, healthCheck };
export default superpowersPlugin;
