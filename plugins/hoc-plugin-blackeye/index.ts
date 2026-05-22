/**
 * hoc-plugin-blackeye/index.ts
 *
 * HoC plugin: BlackEye — Phishing Awareness Simulator.
 *
 * On boot:
 *  - Starts the localhost phishing simulation server on port 4200
 *  - Registers 2 citizen tools: launch_phishing_sim, analyze_phishing_results
 */

import type { HoCPluginContext } from "../../src/republic/hoc-plugin-types.ts";
import {
  getBlackeyeStatus,
  startSimServer,
  createCampaign,
  startCampaign,
  getCampaign,
  TEMPLATES,
} from "../../src/republic/blackeye-engine.ts";

export const PLUGIN_ID = "hoc-plugin-blackeye";

// ─── Plugin Lifecycle ──────────────────────────────────────────────────────────

export async function init(ctx: HoCPluginContext): Promise<void> {
  const log = ctx.logger;

  try {
    startSimServer();
    log.info("Phishing simulation server started on localhost:4200");
  } catch (err) {
    log.error(`BlackEye init failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Register citizen tools via the plugin context API
  ctx.registerTool(
    "launch_phishing_sim",
    "Create and start a phishing awareness simulation campaign. Returns a localhost URL to visit as a training exercise.",
    {
      type: "object",
      properties: {
        templateId: {
          type: "string",
          enum: TEMPLATES.map(t => t.id),
          description: "Which platform to simulate (e.g. 'github', 'google', 'linkedin')",
        },
        name: { type: "string", description: "Campaign name for tracking" },
      },
      required: ["templateId"],
    },
    async (args: Record<string, unknown>) => {
      const templateId = args.templateId as string;
      const template = TEMPLATES.find(t => t.id === templateId);
      if (!template) { return { ok: false, error: "Unknown template" }; }

      const campaign = createCampaign({
        name: (args.name as string) ?? `${template.name} Sim`,
        templateId,
        citizenId: (args as { citizenId?: string }).citizenId ?? "citizen",
      });
      if (!campaign) { return { ok: false, error: "Create failed" }; }

      const active = startCampaign(campaign.id);
      return {
        ok: true,
        campaignId: active?.id,
        url: active?.url,
        template: template.name,
        message: `Phishing simulation running at ${active?.url} — visit to see the training page`,
      };
    },
  );

  ctx.registerTool(
    "analyze_phishing_results",
    "Analyze the results of a completed phishing awareness campaign: click-through rate, submission rate, detection rate.",
    {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID to analyze" },
      },
      required: ["campaignId"],
    },
    async (args: Record<string, unknown>) => {
      const campaignId = args.campaignId as string;
      const campaign = getCampaign(campaignId);
      if (!campaign) { return { ok: false, error: "Campaign not found" }; }
      return {
        ok: true,
        stats: campaign.stats,
        interactions: campaign.interactions.length,
        analysis: {
          riskLevel: campaign.stats.submissionRate > 0.5 ? "high" : campaign.stats.submissionRate > 0.2 ? "medium" : "low",
          recommendation: campaign.stats.submissionRate > 0.5
            ? "Citizens need urgent phishing awareness training — over half submitted credentials"
            : campaign.stats.detectionRate > 0.7
            ? "Excellent! Most citizens detected the phishing attempt"
            : "Regular security training recommended to improve detection rates",
        },
      };
    },
  );

  log.info("Registered 2 citizen tools (launch_phishing_sim, analyze_phishing_results)");

  const status = getBlackeyeStatus() as { templateCount: number; totalCampaigns: number };
  log.info(`BlackEye online — ${status.templateCount} templates, ${status.totalCampaigns} campaigns in store`);
}

export async function shutdown(): Promise<void> {
  const { stopSimServer } = await import("../../src/republic/blackeye-engine.ts");
  stopSimServer();
}

export async function healthCheck(): Promise<{ ok: boolean; details: string }> {
  const status = getBlackeyeStatus() as { serverRunning: boolean; activeCampaigns: number };
  return {
    ok: true,
    details: `server=${status.serverRunning} active_campaigns=${status.activeCampaigns}`,
  };
}
