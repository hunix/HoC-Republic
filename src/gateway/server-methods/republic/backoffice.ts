/**
 * Backoffice Automation Engine — RPC Gateway
 *
 * Exposes automated product maintenance capabilities via republic.backoffice.* RPC methods.
 */

import {
  bumpVersion,
  generateAnalyticsReport,
  recordRefundIssued,
  generateReviewResponse,
  getChangelog,
  getAllChangelogs,
  getEvents,
  getBackofficeStats,
} from "../../../republic/economy/backoffice-engine.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const backofficeDescriptors = defineHandlers({
  "republic.backoffice.bump-version": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { productId?: string; productTitle?: string; changes?: string[] } | null;
      if (!p?.productId || !p?.productTitle) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "productId and productTitle are required"));
        return;
      }
      const entry = bumpVersion(p.productId, p.productTitle, p.changes ?? []);
      respond(true, entry, undefined);
    },
  },

  "republic.backoffice.analytics": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as {
        products?: Array<{ id: string; title: string; revenue: number; purchaseCount: number; category: string }>;
      } | null;
      const report = generateAnalyticsReport(p?.products ?? []);
      respond(true, { report }, undefined);
    },
  },

  "republic.backoffice.record-refund": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { productId?: string; productTitle?: string; amountUsd?: number; reason?: string } | null;
      if (!p?.productId || !p?.productTitle || p?.amountUsd == null) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "productId, productTitle, and amountUsd are required"));
        return;
      }
      recordRefundIssued(p.productId, p.productTitle, p.amountUsd, p.reason ?? "No reason given");
      respond(true, { ok: true }, undefined);
    },
  },

  "republic.backoffice.review-response": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { productId?: string; productTitle?: string; reviewText?: string; rating?: number } | null;
      if (!p?.productId || !p?.productTitle || !p?.reviewText || p?.rating == null) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "productId, productTitle, reviewText, and rating are required"));
        return;
      }
      const response = generateReviewResponse(p.productId, p.productTitle, p.reviewText, p.rating);
      respond(true, { response }, undefined);
    },
  },

  "republic.backoffice.changelog": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { productId?: string; limit?: number } | null;
      if (p?.productId) {
        respond(true, { entries: getChangelog(p.productId) }, undefined);
      } else {
        respond(true, { entries: getAllChangelogs(p?.limit ?? 50) }, undefined);
      }
    },
  },

  "republic.backoffice.events": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | null;
      respond(true, { events: getEvents(p?.limit ?? 100) }, undefined);
    },
  },

  "republic.backoffice.stats": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, getBackofficeStats(), undefined);
    },
  },
});

registryRegister(backofficeDescriptors);
export const backofficeHandlers = toHandlerMap(backofficeDescriptors);
