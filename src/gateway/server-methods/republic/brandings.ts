/**
 * Brandings RPC Handlers
 *
 * Gateway handlers for brand management — create, list, get, update, delete,
 * and crawl brands from website URLs.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
  crawlBrandFromUrl,
} from "../../../republic/brandings.js";

export const brandingsHandlers: GatewayRequestHandlers = {
  "republic.brandings.list": ({ respond }) => {
    const brands = listBrands();
    respond(true, { ok: true, brands }, undefined);
  },

  "republic.brandings.get": ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing brand id")); return; }
    const brand = getBrand(id);
    if (!brand) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Brand not found: ${id}`)); return; }
    respond(true, { ok: true, brand }, undefined);
  },

  "republic.brandings.create": ({ params, respond }) => {
    const p = params as { name: string; website?: string; colors?: { primary: string; secondary: string; accent: string; background: string }; fonts?: { heading: string; body: string }; tagline?: string; description?: string };
    if (!p.name) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing brand name")); return; }
    const brand = createBrand(p);
    respond(true, { ok: true, brand }, undefined);
  },

  "republic.brandings.crawl": async ({ params, respond }) => {
    const { url } = params as { url: string };
    if (!url) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing URL")); return; }
    try {
      const brand = await crawlBrandFromUrl(url);
      respond(true, { ok: true, brand }, undefined);
    } catch (e) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e instanceof Error ? e.message : String(e)));
    }
  },

  "republic.brandings.update": ({ params, respond }) => {
    const { id, ...data } = params as { id: string; [key: string]: unknown };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing brand id")); return; }
    const brand = updateBrand(id, data);
    if (!brand) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Brand not found: ${id}`)); return; }
    respond(true, { ok: true, brand }, undefined);
  },

  "republic.brandings.delete": ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing brand id")); return; }
    const deleted = deleteBrand(id);
    respond(true, { ok: deleted }, undefined);
  },
};
