/**
 * republic.clawhub.* — RPC handlers for the ClawHub skill registry
 *
 * Serves cached skills from clawhub-sync.ts to the hoc-ui ClawHubRegistry page.
 * Skills are persisted to disk in republic-output/skills/ organized by category.
 *
 * On module load, starts background sync + re-registers installed skills.
 */

import { ErrorCodes, errorShape } from "../../protocol/index.js";
import type { GatewayRequestHandlers } from "../types.js";
import {
  getClawHubCategories,
  getClawHubSkills,
  getClawHubSkill,
  getClawHubSyncStatus,
  getClawHubTopTags,
  searchClawHubSkills,
  startClawHubSync,
} from "../../../infra/clawhub-sync.js";

// ─── Auto-init on module load ─────────────────────────────────────
// Start background sync to pull 24K skills from ClawHub API
startClawHubSync();

// Load previously installed skills and re-register their executors
void import("../../../republic/clawhub-skill-manager.js")
  .then(({ loadInstalledSkills }) => loadInstalledSkills())
  .catch(() => { /* skill manager not yet available */ });


export const clawHubHandlers: GatewayRequestHandlers = {
  /**
   * republic.clawhub.list — Paginated skill listing with optional filters
   */
  "republic.clawhub.list": ({ params, respond }) => {
    const p = (params ?? {}) as {
      offset?: number;
      limit?: number;
      sort?: "downloads" | "newest" | "stars" | "name";
      tag?: string;
      category?: string;
    };
    const result = getClawHubSkills({
      offset: p.offset,
      limit: p.limit,
      sort: p.sort,
      tag: p.tag,
      category: p.category,
    });
    respond(true, result, undefined);
  },

  /**
   * republic.clawhub.search — Full-text search across displayName + summary
   */
  "republic.clawhub.search": ({ params, respond }) => {
    const p = (params ?? {}) as {
      query?: string;
      offset?: number;
      limit?: number;
    };
    if (!p.query?.trim()) {
      respond(true, getClawHubSkills({ offset: p.offset, limit: p.limit }), undefined);
      return;
    }
    const result = searchClawHubSkills(p.query, {
      offset: p.offset,
      limit: p.limit,
    });
    respond(true, result, undefined);
  },

  /**
   * republic.clawhub.detail — Single skill by slug
   */
  "republic.clawhub.detail": ({ params, respond }) => {
    const p = (params ?? {}) as { slug?: string };
    if (!p.slug?.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "slug required"));
      return;
    }
    const skill = getClawHubSkill(p.slug.trim());
    if (!skill) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Skill "${p.slug}" not found in cache`));
      return;
    }
    respond(true, { skill }, undefined);
  },

  /**
   * republic.clawhub.stats — Registry-wide stats, top tags, and categories
   */
  "republic.clawhub.stats": ({ respond }) => {
    const sync = getClawHubSyncStatus();
    const topTags = getClawHubTopTags(30);
    const categories = getClawHubCategories();

    // Include installed count via dynamic import to avoid circular dep
    let installedCount = 0;
    void import("../../../republic/clawhub-skill-manager.js")
      .then(({ getManagerStats }: { getManagerStats: () => { installed: number } }) => {
        installedCount = getManagerStats().installed;
      })
      .catch(() => { /* not yet loaded */ });

    respond(true, {
      totalSkills: sync.totalSkills,
      lastSyncAt: sync.lastSyncAt,
      syncing: sync.syncing,
      syncError: sync.syncError,
      diskPath: sync.diskPath,
      installedCount,
      topTags,
      categories,
    }, undefined);
  },

  /**
   * republic.clawhub.install — Install a skill from the registry
   */
  "republic.clawhub.install": async ({ params, respond }) => {
    const p = (params ?? {}) as { slug?: string };
    if (!p.slug?.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "slug required"));
      return;
    }

    try {
      const { installSkill } = await import("../../../republic/clawhub-skill-manager.js");
      const result = await installSkill(p.slug.trim(), "ui-user");
      if (result.ok) {
        respond(true, { installed: true, toolId: result.toolId, slug: p.slug }, undefined);
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "Unknown error"));
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /**
   * republic.clawhub.uninstall — Uninstall a previously installed skill
   */
  "republic.clawhub.uninstall": async ({ params, respond }) => {
    const p = (params ?? {}) as { slug?: string };
    if (!p.slug?.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "slug required"));
      return;
    }

    try {
      const { uninstallSkill } = await import("../../../republic/clawhub-skill-manager.js");
      const result = await uninstallSkill(p.slug.trim());
      if (result.ok) {
        respond(true, { uninstalled: true, slug: p.slug }, undefined);
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "Unknown error"));
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /**
   * republic.clawhub.installed — List all currently installed skills
   */
  "republic.clawhub.installed": async ({ respond }) => {
    try {
      const { getInstalledSkills, getManagerStats } = await import("../../../republic/clawhub-skill-manager.js");
      const skills = getInstalledSkills();
      const stats = getManagerStats();
      respond(true, {
        skills,
        totalInstalled: stats.installed,
        booted: stats.booted,
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
