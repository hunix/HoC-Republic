/**
 * agenthub.ts — Gateway RPC Handlers
 *
 * Exposes the AgentHub engine to connected clients:
 *
 *   agenthub.status           - Service health + repo stats
 *   agenthub.dag.list         - List DAG commits (paginated)
 *   agenthub.dag.get          - Single commit detail + code diff
 *   agenthub.dag.submit       - Submit new experiment commit
 *   agenthub.dag.run          - Trigger execution of a commit
 *   agenthub.dag.result       - Get experiment result
 *   agenthub.board.list       - Paginate message board
 *   agenthub.board.post       - Post a message to board
 *   agenthub.board.get        - Get single board post + replies
 *   agenthub.bundle.export    - Export git bundle URL
 */

import { ErrorCodes, errorShape } from "../protocol/index.js";
import {
  exportBundle,
  getBoard,
  getBoardPost,
  getBoardThread,
  getCommit,
  getResult,
  getStatus,
  listCommits,
  postMessage,
  runExperiment,
  submitExperiment,
} from "../../republic/agenthub-engine.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

const agentHubDescriptors = defineHandlers({
  // ── Status ────────────────────────────────────────────────────────────────
  "agenthub.status": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const status = await getStatus();
        respond(true, { ok: true, ...status }, undefined);
      } catch {
        respond(true, {
          ok: true,
          online: false,
          repoExists: false,
          dbExists: false,
          commitCount: 0,
          boardCount: 0,
          setupHint: "AgentHub initialises automatically on gateway boot. Check gateway logs if missing.",
        }, undefined);
      }
    },
  },

  // ── DAG ───────────────────────────────────────────────────────────────────
  "agenthub.dag.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { limit = 50 } = params as { limit?: number };
      try {
        const commits = await listCommits(Math.min(Number(limit), 200));
        respond(true, { ok: true, commits }, undefined);
      } catch {
        respond(true, { ok: true, commits: [] }, undefined);
      }
    },
  },

  "agenthub.dag.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { hash } = params as { hash: string };
      if (!hash) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "hash required"));
        return;
      }
      try {
        const commit = await getCommit(hash);
        if (!commit) {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "commit not found"));
          return;
        }
        respond(true, { ok: true, commit }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  "agenthub.dag.submit": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as {
        citizenId?: string;
        code?: string;
        programMd?: string;
        message?: string;
        parentHashes?: string[];
      };
      if (!p.code || !p.programMd) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "code and programMd required"));
        return;
      }
      try {
        const hash = await submitExperiment({
          citizenId: p.citizenId ?? "operator",
          code: p.code,
          programMd: p.programMd,
          message: p.message,
          parentHashes: p.parentHashes,
        });
        respond(true, { ok: true, hash }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  "agenthub.dag.run": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { hash } = params as { hash: string };
      if (!hash) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "hash required"));
        return;
      }
      // Fire-and-forget (can take up to 15 min)
      void runExperiment(hash).catch(() => {/* handled inside engine */ });
      respond(true, { ok: true, hash, status: "running", message: "Experiment queued — poll agenthub.dag.result for output" }, undefined);
    },
  },

  "agenthub.dag.result": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { hash } = params as { hash: string };
      if (!hash) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "hash required"));
        return;
      }
      try {
        const result = await getResult(hash);
        respond(true, { ok: true, result }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  // ── Board ─────────────────────────────────────────────────────────────────
  "agenthub.board.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { limit = 50, offset = 0 } = params as { limit?: number; offset?: number };
      try {
        const posts = await getBoard(Math.min(Number(limit), 200), Number(offset));
        respond(true, { ok: true, posts }, undefined);
      } catch {
        respond(true, { ok: true, posts: [] }, undefined);
      }
    },
  },

  "agenthub.board.post": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as { citizenId?: string; body?: string; parentId?: string; commitHash?: string };
      if (!p.body?.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "body required"));
        return;
      }
      try {
        const post = await postMessage({
          citizenId: p.citizenId ?? "operator",
          body: p.body,
          parentId: p.parentId,
          commitHash: p.commitHash,
        });
        respond(true, { ok: true, post }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  "agenthub.board.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      try {
        const post = await getBoardPost(id);
        const replies = await getBoardThread(id);
        respond(true, { ok: true, post, replies }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  // ── Bundle ────────────────────────────────────────────────────────────────
  "agenthub.bundle.export": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const bundlePath = await exportBundle();
        respond(true, { ok: true, bundlePath, message: "git bundle ready for cross-node transfer" }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },
});

registryRegister(agentHubDescriptors);
export const agentHubHandlers = toHandlerMap(agentHubDescriptors);
