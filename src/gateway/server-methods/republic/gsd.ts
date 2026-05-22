/**
 * Republic Gateway Handlers — GSD (Get Shit Done) Pipeline
 *
 * Exposes the GSD autonomous development pipeline via RPC so the Web UI
 * can list sessions, launch new ones, and query session details.
 */

import {
  executeGSD,
  getActiveSessions,
  getSession,
  type GSDSession,
} from "../../../republic/gsd-pipeline.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const gsdDescriptors = defineHandlers({
  /**
   * gsd.list — Returns all active GSD sessions, most recent first.
   */
  "gsd.list": {
    scope: "read",
    handler: ({ respond }) => {
      const sessions = getActiveSessions().toReversed();
      respond(true, { sessions, total: sessions.length }, undefined);
    },
  },

  /**
   * gsd.get — Returns a single GSD session by ID.
   * Params: { id: string }
   */
  "gsd.get": {
    scope: "read",
    handler: ({ params, respond }) => {
      const id = String((params as { id?: string }).id ?? "");
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      const session = getSession(id);
      if (!session) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Session ${id} not found`));
        return;
      }
      respond(true, { session }, undefined);
    },
  },

  /**
   * gsd.execute — Launch a new GSD session from a natural language prompt.
   * Params: { prompt: string, source?: "webui" | "chat" | "api" | "whatsapp" }
   */
  "gsd.execute": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { prompt?: string; source?: string };
      const prompt = String(p.prompt ?? "").trim();
      if (!prompt) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "prompt is required"));
        return;
      }
      const source = (
        ["webui", "chat", "api", "whatsapp"].includes(String(p.source ?? ""))
          ? String(p.source)
          : "webui"
      ) as GSDSession["source"];

      const session = executeGSD(prompt, source);
      respond(true, { session }, undefined);
    },
  },
});

registryRegister(gsdDescriptors);
export const gsdHandlers = toHandlerMap(gsdDescriptors);
