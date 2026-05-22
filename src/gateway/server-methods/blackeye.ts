/**
 * blackeye.ts — Gateway RPC Handlers
 *
 *   blackeye.status           - Service health + global stats
 *   blackeye.templates.list   - List all 41 phishing templates
 *   blackeye.campaign.create  - Create a new simulation campaign
 *   blackeye.campaign.list    - List campaigns (filter by citizenId)
 *   blackeye.campaign.get     - Get campaign detail + interactions
 *   blackeye.campaign.start   - Activate a campaign (starts server)
 *   blackeye.campaign.stop    - Stop an active campaign
 *   blackeye.campaign.delete  - Delete a campaign
 */

import { ErrorCodes, errorShape } from "../protocol/index.js";
import {
  createCampaign,
  deleteCampaign,
  getBlackeyeStatus,
  getCampaign,
  listCampaigns,
  startCampaign,
  stopCampaign,
  TEMPLATES,
} from "../../republic/blackeye-engine.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

const blackeyeDescriptors = defineHandlers({
  "blackeye.status": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const status = getBlackeyeStatus();
        respond(true, { ok: true, ...status }, undefined);
      } catch {
        respond(true, { ok: true, online: false, serverRunning: false, templateCount: TEMPLATES.length, totalCampaigns: 0, activeCampaigns: 0, totalInteractions: 0 }, undefined);
      }
    },
  },

  "blackeye.templates.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { category } = params as { category?: string };
      const templates = category
        ? TEMPLATES.filter(t => t.category === category)
        : TEMPLATES;
      respond(true, { ok: true, templates, total: templates.length }, undefined);
    },
  },

  "blackeye.campaign.create": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { name?: string; templateId?: string; citizenId?: string };
      if (!p.templateId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "templateId required"));
        return;
      }
      try {
        const campaign = createCampaign({
          name: p.name ?? `Campaign – ${p.templateId}`,
          templateId: p.templateId,
          citizenId: p.citizenId ?? "operator",
        });
        if (!campaign) {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Unknown templateId"));
          return;
        }
        respond(true, { ok: true, campaign }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  "blackeye.campaign.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { citizenId } = params as { citizenId?: string };
      try {
        const campaigns = listCampaigns(citizenId);
        respond(true, { ok: true, campaigns, total: campaigns.length }, undefined);
      } catch {
        respond(true, { ok: true, campaigns: [], total: 0 }, undefined);
      }
    },
  },

  "blackeye.campaign.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const campaign = getCampaign(id);
      if (!campaign) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "campaign not found"));
        return;
      }
      respond(true, { ok: true, campaign }, undefined);
    },
  },

  "blackeye.campaign.start": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      try {
        const campaign = startCampaign(id);
        if (!campaign) {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "campaign not found"));
          return;
        }
        respond(true, { ok: true, campaign, url: campaign.url }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  "blackeye.campaign.stop": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const campaign = stopCampaign(id);
      if (!campaign) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "campaign not found"));
        return;
      }
      respond(true, { ok: true, campaign }, undefined);
    },
  },

  "blackeye.campaign.delete": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const deleted = deleteCampaign(id);
      respond(true, { ok: true, deleted }, undefined);
    },
  },
});

registryRegister(blackeyeDescriptors);
export const blackeyeHandlers = toHandlerMap(blackeyeDescriptors);
