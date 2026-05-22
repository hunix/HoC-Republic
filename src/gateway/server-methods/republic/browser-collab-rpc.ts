/**
 * Collaborative Browser Sessions — RPC Handlers
 *
 * Exposes the browser collaboration engine via gateway RPC:
 *   - republic.browser.collab.start       — start session
 *   - republic.browser.collab.status      — get session state
 *   - republic.browser.collab.pause       — agent pauses for user
 *   - republic.browser.collab.resume      — user hands back to agent
 *   - republic.browser.collab.screenshot  — take screenshot
 *   - republic.browser.collab.auth.export — export auth tokens
 *   - republic.browser.collab.auth.import — import saved tokens
 *   - republic.browser.collab.auth.list   — list all saved tokens
 *   - republic.browser.collab.stop        — end session
 */

import type { GatewayRequestHandlers } from "../types.js";

export const browserCollabHandlers: GatewayRequestHandlers = {
  "republic.browser.collab.start": async ({ params, respond }) => {
    const { url } = params as { url?: string };
    if (!url) { throw new Error("url required"); }
    const { startCollabSession } = await import("../../../republic/browser-collab.js");
    const session = await startCollabSession(url);
    respond(true, { ok: true, session }, undefined);
  },

  "republic.browser.collab.status": async ({ respond }) => {
    const { getSessionStatus } = await import("../../../republic/browser-collab.js");
    const status = getSessionStatus();
    respond(true, { ok: true, ...status }, undefined);
  },

  "republic.browser.collab.pause": async ({ params, respond }) => {
    const { reason } = params as { reason?: string };
    const { pauseForUser } = await import("../../../republic/browser-collab.js");
    const session = pauseForUser(reason || "Agent requests user intervention");
    respond(true, { ok: true, session }, undefined);
  },

  "republic.browser.collab.resume": async ({ respond }) => {
    const { resumeAgent } = await import("../../../republic/browser-collab.js");
    const session = resumeAgent();
    respond(true, { ok: true, session }, undefined);
  },

  "republic.browser.collab.screenshot": async ({ respond }) => {
    const { takeScreenshot } = await import("../../../republic/browser-collab.js");
    const path = await takeScreenshot();
    respond(true, { ok: true, screenshotPath: path }, undefined);
  },

  "republic.browser.collab.auth.export": async ({ params, respond }) => {
    const { domain } = params as { domain?: string };
    if (!domain) { throw new Error("domain required"); }
    const { exportAuthTokens } = await import("../../../republic/browser-collab.js");
    const token = await exportAuthTokens(domain);
    respond(true, {
      ok: true,
      domain: token.domain,
      cookieCount: token.cookies.length,
      savedAt: token.savedAt,
    }, undefined);
  },

  "republic.browser.collab.auth.import": async ({ params, respond }) => {
    const { domain } = params as { domain?: string };
    if (!domain) { throw new Error("domain required"); }
    const { importAuthTokens } = await import("../../../republic/browser-collab.js");
    const imported = await importAuthTokens(domain);
    respond(true, { ok: true, imported }, undefined);
  },

  "republic.browser.collab.auth.list": async ({ respond }) => {
    const { listAuthTokens } = await import("../../../republic/browser-collab.js");
    const tokens = listAuthTokens();
    respond(true, { ok: true, total: tokens.length, tokens }, undefined);
  },

  "republic.browser.collab.stop": async ({ respond }) => {
    const { stopSession } = await import("../../../republic/browser-collab.js");
    const session = stopSession();
    respond(true, { ok: true, session }, undefined);
  },
};
