/**
 * Supabase Command Center — Method Router
 *
 * Routes incoming command methods to existing HoC gateway handlers.
 * Returns a { payload, error, duration_ms } result.
 */

import { randomUUID } from "node:crypto";
import os from "node:os";
import type { MsgContext } from "../auto-reply/templating.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveSessionAgentId } from "../agents/agent-scope.js";
import { loadWorkspaceSkillEntries } from "../agents/skills.js";
import { dispatchInboundMessage } from "../auto-reply/dispatch.js";
import { createReplyDispatcher } from "../auto-reply/reply/reply-dispatcher.js";
import { createReplyPrefixOptions } from "../channels/reply-prefix.js";
import { readConfigFileSnapshot, writeConfigFile, loadConfig } from "../config/config.js";
import { applyMergePatch } from "../config/merge-patch.js";
import { redactConfigSnapshot } from "../config/redact-snapshot.js";
import {
  injectTimestamp,
  timestampOptsFromConfig,
} from "../gateway/server-methods/agent-timestamp.js";
import { loadSessionEntry } from "../gateway/session-utils.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../utils/message-channel.js";

export interface CommandResult {
  payload: unknown;
  error: string | null;
  duration_ms: number;
}

// ─── Per-method param interfaces ──────────────────────────────────────────────
// Each handler declares exactly what it reads from the incoming command params.
// This eliminates `Record<string, unknown>` guesswork for AI code generation.

/** `system.status` accepts no params. */
type SystemStatusParams = Record<string, never>;

/** `system.models` accepts no params. */
type SystemModelsParams = Record<string, never>;

/** `chat.send` — sends a message to a session and collects the reply. */
interface ChatSendHandlerParams {
  /** User message text. Required. */
  message: string;
  /** Session to send to. Default: `"supabase-default"`. */
  session_key?: string;
  /** Optional model override (e.g. `"claude-sonnet-4-5"`). */
  model?: string;
}

/** `config.get` accepts no params (returns full redacted snapshot). */
type ConfigGetParams = Record<string, never>;

/** `config.set` applies a JSON Merge Patch to the live config. */
interface ConfigSetHandlerParams {
  /** RFC 7396 patch object to merge into the current config. */
  patch: Record<string, unknown>;
}

/** `skills.list` accepts no params. */
type SkillsListHandlerParams = Record<string, never>;

/** `skills.execute` runs a named skill by ID. */
interface SkillsExecuteHandlerParams {
  /** Skill key / ID (e.g. `"web.search"`). */
  skill_id: string;
  /** Skill-specific arguments. */
  args?: Record<string, unknown>;
}

/** Union of all typed param shapes for the internal dispatch map. */
type AnyCommandParams =
  | SystemStatusParams
  | SystemModelsParams
  | ChatSendHandlerParams
  | ConfigGetParams
  | ConfigSetHandlerParams
  | SkillsListHandlerParams
  | SkillsExecuteHandlerParams;

type CommandHandler<TParams extends AnyCommandParams = AnyCommandParams> = (
  params: TParams,
) => Promise<CommandResult>;

const GATEWAY_START = Date.now();

function result(payload: unknown, durationMs: number): CommandResult {
  return { payload, error: null, duration_ms: durationMs };
}

function errResult(msg: string, durationMs: number): CommandResult {
  return { payload: null, error: msg, duration_ms: durationMs };
}

// ─── Handler: system.status ──────────────────────────────────────────────────

const systemStatus: CommandHandler<SystemStatusParams> = async (_params) => {
  const t = Date.now();
  return result(
    {
      status: "online",
      uptime: process.uptime(),
      uptime_ms: Date.now() - GATEWAY_START,
      os: {
        platform: os.platform(),
        hostname: os.hostname(),
        freemem_gb: +(os.freemem() / 1024 ** 3).toFixed(2),
        totalmem_gb: +(os.totalmem() / 1024 ** 3).toFixed(2),
      },
      node_version: process.version,
      pid: process.pid,
    },
    Date.now() - t,
  );
};

// ─── Handler: system.models ──────────────────────────────────────────────────

const systemModels: CommandHandler<SystemModelsParams> = async (_params) => {
  const t = Date.now();
  try {
    const cfg = loadConfig();
    // Get configured agents list as a proxy for available models
    const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
    const models = agents
      .filter((a) => a && typeof a === "object" && "id" in a)
      .map((a) => ({
        id: (a as { id: string }).id,
        provider: (a as { provider?: string }).provider ?? "unknown",
      }));
    return result({ models, note: "Full model catalog available via gateway UI" }, Date.now() - t);
  } catch (err) {
    return errResult(String(err), Date.now() - t);
  }
};

// ─── Handler: chat.send ──────────────────────────────────────────────────────

const chatSend: CommandHandler<ChatSendHandlerParams> = async (params) => {
  const t = Date.now();
  const message = typeof params.message === "string" ? params.message.trim() : "";
  const sessionKey =
    typeof params.session_key === "string" ? params.session_key : "supabase-default";

  if (!message) {
    return errResult("message is required", Date.now() - t);
  }

  try {
    const { cfg } = loadSessionEntry(sessionKey);
    const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
    const { onModelSelected: _onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
      cfg,
      agentId,
      channel: INTERNAL_MESSAGE_CHANNEL,
    });

    const finalParts: string[] = [];
    const dispatcher = createReplyDispatcher({
      ...prefixOptions,
      onError: () => {},
      deliver: async (payload, info) => {
        if (info.kind !== "final") {
          return;
        }
        const text = payload.text?.trim() ?? "";
        if (text) {
          finalParts.push(text);
        }
      },
    });

    const stamped = injectTimestamp(message, timestampOptsFromConfig(cfg));
    const ctx: MsgContext = {
      Body: message,
      BodyForAgent: stamped,
      BodyForCommands: message,
      RawBody: message,
      CommandBody: message,
      SessionKey: sessionKey,
      Provider: INTERNAL_MESSAGE_CHANNEL,
      Surface: INTERNAL_MESSAGE_CHANNEL,
      OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
      ChatType: "direct",
      CommandAuthorized: true,
      MessageSid: `sup-${randomUUID().slice(0, 8)}`,
      SenderId: "supabase-command-center",
      SenderName: "Command Center",
      SenderUsername: "command-center",
    };

    await dispatchInboundMessage({ ctx, cfg, dispatcher, replyOptions: {} });

    const reply = finalParts.join("\n\n").trim();
    return result({ reply, session_key: sessionKey }, Date.now() - t);
  } catch (err) {
    return errResult(String(err), Date.now() - t);
  }
};

// ─── Handler: config.get ─────────────────────────────────────────────────────

const configGet: CommandHandler<ConfigGetParams> = async (_params) => {
  const t = Date.now();
  try {
    const snapshot = await readConfigFileSnapshot();
    return result(redactConfigSnapshot(snapshot), Date.now() - t);
  } catch (err) {
    return errResult(String(err), Date.now() - t);
  }
};

// ─── Handler: config.set ─────────────────────────────────────────────────────

const configSet: CommandHandler<ConfigSetHandlerParams> = async (params) => {
  const t = Date.now();
  try {
    const patch = params.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return errResult("params.patch (object) required", Date.now() - t);
    }
    const cfg = loadConfig();
    const merged = applyMergePatch(cfg, patch);
    await writeConfigFile(merged as Parameters<typeof writeConfigFile>[0]);
    return result({ ok: true }, Date.now() - t);
  } catch (err) {
    return errResult(String(err), Date.now() - t);
  }
};

// ─── Handler: skills.list ────────────────────────────────────────────────────

const skillsList: CommandHandler<SkillsListHandlerParams> = async (_params) => {
  const t = Date.now();
  try {
    const cfg = loadConfig();
    const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
    const entries = loadWorkspaceSkillEntries(workspaceDir, { config: cfg });
    const skills = entries.map((e) => ({
      // SkillEntry.skill.name is the canonical skill name
      name: e.skill?.name ?? "unnamed",
      description: e.skill?.description ?? "",
      skillKey: e.metadata?.skillKey ?? e.skill?.name ?? "unknown",
      always: e.metadata?.always ?? false,
    }));
    return result({ skills, total: skills.length }, Date.now() - t);
  } catch (err) {
    return errResult(String(err), Date.now() - t);
  }
};

// ─── Handler: skills.execute ─────────────────────────────────────────────────

const skillsExecute: CommandHandler<SkillsExecuteHandlerParams> = async (params) => {
  const skillId = typeof params.skill_id === "string" ? params.skill_id : "";
  if (!skillId) {
    return errResult("params.skill_id required", 0);
  }
  // Route through chat.send with an implicit skill-execution prompt
  const args = params.args ?? {};
  return chatSend({
    message: `Execute skill: ${skillId}\nArgs: ${JSON.stringify(args)}`,
    session_key: "supabase-skills",
  });
};

// ─── Method Router ───────────────────────────────────────────────────────────

// Each handler is typed at definition but stored loosely in the dispatch map
// to avoid TypeScript's contravariant function parameter union issue.
// The per-handler generics still provide full type-checking at the handler level.
const HANDLERS: Record<string, (p: never) => Promise<CommandResult>> = {
  "system.status": systemStatus as (p: never) => Promise<CommandResult>,
  "system.models": systemModels as (p: never) => Promise<CommandResult>,
  "chat.send": chatSend as (p: never) => Promise<CommandResult>,
  "config.get": configGet as (p: never) => Promise<CommandResult>,
  "config.set": configSet as (p: never) => Promise<CommandResult>,
  "skills.list": skillsList as (p: never) => Promise<CommandResult>,
  "skills.execute": skillsExecute as (p: never) => Promise<CommandResult>,
};

export async function routeCommand(
  method: string,
  params: Record<string, unknown> = {},
): Promise<CommandResult> {
  const handler = HANDLERS[method];
  if (!handler) {
    return errResult(`unknown method: ${method}`, 0);
  }
  try {
    return await handler(params as never);
  } catch (err) {
    return errResult(String(err), 0);
  }
}

export function listSupportedMethods(): string[] {
  return Object.keys(HANDLERS);
}
