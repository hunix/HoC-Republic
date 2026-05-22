/**
 * Republic DevStudio — RPC Gateway
 *
 * Exposes runtime checking, library catalog, and deployment engine
 * via republic.devstudio.* RPC methods.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  checkRuntime,
  getToolStatus,
  getMissingTools,
  getRuntimeSummary,
} from "../../../republic/devstudio-runtime.js";
import {
  getLibraryDomains,
  getLibrariesForDomain,
  searchLibraries,
  getAllPackages,
  getCatalogStats,
  getInstallCommands,
} from "../../../republic/devstudio-library-catalog.js";
import {
  deployToVercel,
  deployToRailway,
  deployToNetlify,
  deployToFly,
  deployToCloudflare,
  deployAuto,
  getDeploymentStatus,
  listDeployments,
  getDeploymentStats,
} from "../../../republic/devstudio-deploy.js";

export const devStudioHandlers: Partial<GatewayRequestHandlers> = {

  // ─── Runtime ────────────────────────────────────────────────────────────────

  /** Full runtime health report — checks all 17 tools */
  "republic.devstudio.runtime.check": ({ params, respond }) => {
    const p = params as { force?: boolean } | null;
    const report = checkRuntime(p?.force === true);
    respond(true, report, undefined);
  },

  /** Single tool status by name */
  "republic.devstudio.runtime.tool": ({ params, respond }) => {
    const p = params as { name?: string } | null;
    const tool = getToolStatus(p?.name ?? "node");
    if (!tool) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Tool '${p?.name}' not in registry`));
      return;
    }
    respond(true, tool, undefined);
  },

  /** List all missing / not present tools */
  "republic.devstudio.runtime.missing": ({ respond }) => {
    respond(true, { tools: getMissingTools() }, undefined);
  },

  /** One-line human-readable runtime summary */
  "republic.devstudio.runtime.summary": ({ respond }) => {
    respond(true, { summary: getRuntimeSummary() }, undefined);
  },

  // ─── Library Catalog ────────────────────────────────────────────────────────

  /** List all 16 domain categories with package counts */
  "republic.devstudio.libraries.domains": ({ respond }) => {
    respond(true, { domains: getLibraryDomains() }, undefined);
  },

  /** Get all packages in a domain */
  "republic.devstudio.libraries.list": ({ params, respond }) => {
    const p = params as { domainId?: string } | null;
    const domain = getLibrariesForDomain(p?.domainId ?? "");
    if (!domain) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Domain '${p?.domainId}' not found`));
      return;
    }
    respond(true, domain, undefined);
  },

  /** Search packages by keyword across all domains */
  "republic.devstudio.libraries.search": ({ params, respond }) => {
    const p = params as { query?: string } | null;
    const query = (p?.query ?? "").trim();
    if (!query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    respond(true, { packages: searchLibraries(query) }, undefined);
  },

  /** Get all packages (for full reference) */
  "republic.devstudio.libraries.all": ({ respond }) => {
    respond(true, { packages: getAllPackages(), stats: getCatalogStats() }, undefined);
  },

  /** Get catalog stats: total domains, packages, react-only, server-only */
  "republic.devstudio.libraries.stats": ({ respond }) => {
    respond(true, getCatalogStats(), undefined);
  },

  /** Get npm install commands for selected domains */
  "republic.devstudio.libraries.install-commands": ({ params, respond }) => {
    const p = params as { domains?: string[] } | null;
    const domains = p?.domains ?? [];
    if (domains.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "domains array required"));
      return;
    }
    respond(true, { commands: getInstallCommands(domains) }, undefined);
  },

  // ─── Deployment ─────────────────────────────────────────────────────────────

  /** Deploy to Vercel */
  "republic.devstudio.deploy.vercel": ({ params, respond }) => {
    const p = params as { projectDir?: string; projectName?: string; environment?: "preview" | "production" } | null;
    if (!p?.projectDir || !p?.projectName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectDir and projectName required"));
      return;
    }
    deployToVercel(p.projectDir, p.projectName, { environment: p.environment ?? "production" })
      .then((rec) => respond(true, rec, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err))));
  },

  /** Deploy to Railway */
  "republic.devstudio.deploy.railway": ({ params, respond }) => {
    const p = params as { projectDir?: string; projectName?: string } | null;
    if (!p?.projectDir || !p?.projectName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectDir and projectName required"));
      return;
    }
    deployToRailway(p.projectDir, p.projectName)
      .then((rec) => respond(true, rec, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err))));
  },

  /** Deploy to Netlify */
  "republic.devstudio.deploy.netlify": ({ params, respond }) => {
    const p = params as { projectDir?: string; projectName?: string; outputDir?: string } | null;
    if (!p?.projectDir || !p?.projectName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectDir and projectName required"));
      return;
    }
    deployToNetlify(p.projectDir, p.projectName, { outputDir: p.outputDir })
      .then((rec) => respond(true, rec, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err))));
  },

  /** Deploy to Fly.io */
  "republic.devstudio.deploy.fly": ({ params, respond }) => {
    const p = params as { projectDir?: string; projectName?: string } | null;
    if (!p?.projectDir || !p?.projectName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectDir and projectName required"));
      return;
    }
    deployToFly(p.projectDir, p.projectName)
      .then((rec) => respond(true, rec, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err))));
  },

  /** Deploy to Cloudflare Pages/Workers */
  "republic.devstudio.deploy.cloudflare": ({ params, respond }) => {
    const p = params as { projectDir?: string; projectName?: string; outputDir?: string } | null;
    if (!p?.projectDir || !p?.projectName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectDir and projectName required"));
      return;
    }
    deployToCloudflare(p.projectDir, p.projectName, { outputDir: p.outputDir })
      .then((rec) => respond(true, rec, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err))));
  },

  /** Auto-deploy: picks first available platform CLI */
  "republic.devstudio.deploy.auto": ({ params, respond }) => {
    const p = params as { projectDir?: string; projectName?: string; environment?: "preview" | "production" } | null;
    if (!p?.projectDir || !p?.projectName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectDir and projectName required"));
      return;
    }
    deployAuto(p.projectDir, p.projectName, { environment: p.environment ?? "production" })
      .then((rec) => respond(true, rec, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err))));
  },

  /** Get a single deployment record by ID */
  "republic.devstudio.deploy.status": ({ params, respond }) => {
    const p = params as { id?: string } | null;
    const rec = getDeploymentStatus(p?.id ?? "");
    if (!rec) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Deployment '${p?.id}' not found`));
      return;
    }
    respond(true, rec, undefined);
  },

  /** List all deployments (optionally filtered by project name) */
  "republic.devstudio.deploy.list": ({ params, respond }) => {
    const p = params as { projectName?: string } | null;
    respond(true, { deployments: listDeployments(p?.projectName) }, undefined);
  },

  /** Deployment summary stats */
  "republic.devstudio.deploy.stats": ({ respond }) => {
    respond(true, getDeploymentStats(), undefined);
  },

  // ─── Combined Briefing ──────────────────────────────────────────────────────

  /**
   * Full citizen dev briefing: runtime + catalog stats + deployment availability.
   * Citizens use this to understand what capabilities they have before planning a project.
   */
  "republic.devstudio.briefing": ({ respond }) => {
    const runtime = checkRuntime();
    const catalogStats = getCatalogStats();
    const deployStats = getDeploymentStats();

    const availableDeployPlatforms = runtime.tools
      .filter((t) => t.category === "deployment" && t.status === "present")
      .map((t) => t.displayName);

    const briefing = {
      runtime: {
        ready: runtime.ready,
        nodeVersion: runtime.nodeVersion,
        pnpmVersion: runtime.pnpmVersion,
        gitVersion: runtime.gitVersion,
        toolsPresent: runtime.tools.filter((t) => t.status === "present").length,
        toolsTotal: runtime.tools.length,
        warnings: runtime.warnings,
      },
      libraries: catalogStats,
      deployment: {
        availablePlatforms: availableDeployPlatforms,
        totalDeployments: deployStats.total,
        liveDeployments: deployStats.live,
      },
      capabilities: [
        "Full-stack TypeScript/JavaScript (Next.js, Vite, Express, NestJS, Fastify)",
        "Python backends (FastAPI, Django, Flask)",
        "Go microservices (Gin, Echo, Fiber)",
        "Rust systems/WASM (Actix, Tauri, wasm-pack)",
        ".NET/C# (ASP.NET Core, Blazor)",
        "React 3D games (React Three Fiber, Three.js, Rapier physics)",
        "Supabase full-stack (auth, database, storage, edge functions)",
        "Real-time apps (Socket.IO, Ably, PartyKit, Yjs CRDT)",
        "AI/LLM integration (OpenAI, Anthropic, Gemini, Langchain, local Ollama)",
        "Payments (Stripe, PayPal, Lemon Squeezy, Paddle)",
        "Email/SMS (Resend, Nodemailer, Twilio)",
        "Ecommerce (MedusaJS, Commerce Layer)",
        "PWA + mobile (React Native, Flutter)",
        "Docker containerization",
        "CI/CD (GitHub Actions, auto-scaffold)",
        `Deployment to: ${availableDeployPlatforms.join(", ") || "install a CLI to unlock"}`,
      ],
      checkedAt: runtime.checkedAt,
    };

    respond(true, briefing, undefined);
  },
};
