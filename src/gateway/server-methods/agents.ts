import fs from "node:fs/promises";
import path from "node:path";
import type { AgentConfig, AgentsConfig, OpenClawConfig } from "../../config/types.js";
import { listAgentIds, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
} from "../../agents/workspace.js";
import { loadConfig } from "../../config/config.js";
import { writeConfigFile } from "../../config/io.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateAgentsFilesGetParams,
  validateAgentsFilesListParams,
  validateAgentsFilesSetParams,
  validateAgentsListParams,
} from "../protocol/index.js";
import { listAgentsForGateway } from "../session-utils.js";
import { registryRegister } from "./handler-registry.js";
import { defineHandlers, toHandlerMap } from "./types.js";

const BOOTSTRAP_FILE_NAMES = [
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_USER_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
] as const;

const MEMORY_FILE_NAMES = [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME] as const;

const ALLOWED_FILE_NAMES = new Set<string>([...BOOTSTRAP_FILE_NAMES, ...MEMORY_FILE_NAMES]);

type FileMeta = {
  size: number;
  updatedAtMs: number;
};

async function statFile(filePath: string): Promise<FileMeta | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return null;
    }
    return {
      size: stat.size,
      updatedAtMs: Math.floor(stat.mtimeMs),
    };
  } catch {
    return null;
  }
}

async function listAgentFiles(workspaceDir: string) {
  const files: Array<{
    name: string;
    path: string;
    missing: boolean;
    size?: number;
    updatedAtMs?: number;
  }> = [];

  for (const name of BOOTSTRAP_FILE_NAMES) {
    const filePath = path.join(workspaceDir, name);
    const meta = await statFile(filePath);
    if (meta) {
      files.push({
        name,
        path: filePath,
        missing: false,
        size: meta.size,
        updatedAtMs: meta.updatedAtMs,
      });
    } else {
      files.push({ name, path: filePath, missing: true });
    }
  }

  const primaryMemoryPath = path.join(workspaceDir, DEFAULT_MEMORY_FILENAME);
  const primaryMeta = await statFile(primaryMemoryPath);
  if (primaryMeta) {
    files.push({
      name: DEFAULT_MEMORY_FILENAME,
      path: primaryMemoryPath,
      missing: false,
      size: primaryMeta.size,
      updatedAtMs: primaryMeta.updatedAtMs,
    });
  } else {
    const altMemoryPath = path.join(workspaceDir, DEFAULT_MEMORY_ALT_FILENAME);
    const altMeta = await statFile(altMemoryPath);
    if (altMeta) {
      files.push({
        name: DEFAULT_MEMORY_ALT_FILENAME,
        path: altMemoryPath,
        missing: false,
        size: altMeta.size,
        updatedAtMs: altMeta.updatedAtMs,
      });
    } else {
      files.push({ name: DEFAULT_MEMORY_FILENAME, path: primaryMemoryPath, missing: true });
    }
  }

  return files;
}

function resolveAgentIdOrError(agentIdRaw: string, cfg: ReturnType<typeof loadConfig>) {
  const agentId = normalizeAgentId(agentIdRaw);
  const allowed = new Set(listAgentIds(cfg));
  if (!allowed.has(agentId)) {
    return null;
  }
  return agentId;
}

const agentsDescriptors = defineHandlers({
  "agents.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      if (!validateAgentsListParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid agents.list params: ${formatValidationErrors(validateAgentsListParams.errors)}`,
          ),
        );
        return;
      }

      const cfg = loadConfig();
      const result = listAgentsForGateway(cfg);
      respond(true, result, undefined);
    },
  },
  "agents.files.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      if (!validateAgentsFilesListParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid agents.files.list params: ${formatValidationErrors(
              validateAgentsFilesListParams.errors,
            )}`,
          ),
        );
        return;
      }
      const cfg = loadConfig();
      const agentId = resolveAgentIdOrError(String(params.agentId ?? ""), cfg);
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
        return;
      }
      const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
      const files = await listAgentFiles(workspaceDir);
      respond(true, { agentId, workspace: workspaceDir, files }, undefined);
    },
  },
  "agents.files.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      if (!validateAgentsFilesGetParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid agents.files.get params: ${formatValidationErrors(
              validateAgentsFilesGetParams.errors,
            )}`,
          ),
        );
        return;
      }
      const cfg = loadConfig();
      const agentId = resolveAgentIdOrError(String(params.agentId ?? ""), cfg);
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
        return;
      }
      const name = String(params.name ?? "").trim();
      if (!ALLOWED_FILE_NAMES.has(name)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unsupported file "${name}"`),
        );
        return;
      }
      const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
      const filePath = path.join(workspaceDir, name);
      const meta = await statFile(filePath);
      if (!meta) {
        respond(
          true,
          {
            agentId,
            workspace: workspaceDir,
            file: { name, path: filePath, missing: true },
          },
          undefined,
        );
        return;
      }
      const content = await fs.readFile(filePath, "utf-8");
      respond(
        true,
        {
          agentId,
          workspace: workspaceDir,
          file: {
            name,
            path: filePath,
            missing: false,
            size: meta.size,
            updatedAtMs: meta.updatedAtMs,
            content,
          },
        },
        undefined,
      );
    },
  },
  "agents.files.set": {
    scope: "write",
    handler: async ({ params, respond }) => {
      if (!validateAgentsFilesSetParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid agents.files.set params: ${formatValidationErrors(
              validateAgentsFilesSetParams.errors,
            )}`,
          ),
        );
        return;
      }
      const cfg = loadConfig();
      const agentId = resolveAgentIdOrError(String(params.agentId ?? ""), cfg);
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
        return;
      }
      const name = String(params.name ?? "").trim();
      if (!ALLOWED_FILE_NAMES.has(name)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unsupported file "${name}"`),
        );
        return;
      }
      const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
      await fs.mkdir(workspaceDir, { recursive: true });
      const filePath = path.join(workspaceDir, name);
      const content = String(params.content ?? "");
      await fs.writeFile(filePath, content, "utf-8");
      const meta = await statFile(filePath);
      respond(
        true,
        {
          ok: true,
          agentId,
          workspace: workspaceDir,
          file: {
            name,
            path: filePath,
            missing: false,
            size: meta?.size,
            updatedAtMs: meta?.updatedAtMs,
            content,
          },
        },
        undefined,
      );
    },
  },
  "agents.create": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params;
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const name = String(p.name ?? "").trim();
      if (!name) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
        return;
      }
      const agentId = normalizeAgentId(name);
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const workspace = String(p.workspace ?? "").trim();

      const cfg = loadConfig();
      const existingIds = new Set(listAgentIds(cfg));
      if (existingIds.has(agentId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" already exists`),
        );
        return;
      }

      const agentsList: AgentsConfig = cfg.agents ?? {};
      const list: AgentConfig[] = Array.isArray(agentsList.list) ? [...agentsList.list] : [];
      const entry: AgentConfig = { id: agentId, name };
      if (workspace) {
        entry.workspace = workspace;
      }
      list.push(entry);

      const updated: OpenClawConfig = {
        ...cfg,
        agents: { ...agentsList, list },
      };
      await writeConfigFile(updated);

      if (workspace) {
        await fs.mkdir(workspace, { recursive: true }).catch(() => {});
      }

      respond(true, { ok: true, agentId, name, workspace: workspace || undefined }, undefined);
    },
  },
  "agents.update": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params;
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const agentIdRaw = String(p.agentId ?? "").trim();
      if (!agentIdRaw) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }
      const agentId = normalizeAgentId(agentIdRaw);

      const cfg = loadConfig();
      const agentsList: AgentsConfig = cfg.agents ?? {};
      const list: AgentConfig[] = Array.isArray(agentsList.list) ? [...agentsList.list] : [];

      const idx = list.findIndex(
        (e) => e && typeof e === "object" && normalizeAgentId(e.id) === agentId,
      );
      if (idx < 0) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" not found`),
        );
        return;
      }

      const existing: AgentConfig = { ...list[idx] };
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const newName = String(p.name ?? "").trim();
      if (newName) {
        existing.name = newName;
      }
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const workspace = String(p.workspace ?? "").trim();
      if (workspace) {
        existing.workspace = workspace;
      }
      list[idx] = existing;

      const updated: OpenClawConfig = {
        ...cfg,
        agents: { ...agentsList, list },
      };
      await writeConfigFile(updated);

      if (workspace) {
        await fs.mkdir(workspace, { recursive: true }).catch(() => {});
      }

      respond(
        true,
        { ok: true, agentId, name: existing.name, workspace: existing.workspace },
        undefined,
      );
    },
  },
  "agents.delete": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params;
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const agentIdRaw = String(p.agentId ?? "").trim();
      if (!agentIdRaw) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }
      const agentId = normalizeAgentId(agentIdRaw);
      const deleteFiles = p.deleteFiles !== false;

      const cfg = loadConfig();
      const agentsList: AgentsConfig = cfg.agents ?? {};
      const list: AgentConfig[] = Array.isArray(agentsList.list) ? [...agentsList.list] : [];

      const idx = list.findIndex(
        (e) => e && typeof e === "object" && normalizeAgentId(e.id) === agentId,
      );
      if (idx < 0) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" not found`),
        );
        return;
      }

      const removed = list[idx];
      const workspace = typeof removed.workspace === "string" ? removed.workspace.trim() : "";
      list.splice(idx, 1);

      const updated: OpenClawConfig = {
        ...cfg,
        agents: { ...agentsList, list },
      };
      await writeConfigFile(updated);

      if (deleteFiles && workspace) {
        await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
      }

      respond(true, { ok: true, agentId, deleted: true }, undefined);
    },
  },
});

registryRegister(agentsDescriptors);
export const agentsHandlers = toHandlerMap(agentsDescriptors);
