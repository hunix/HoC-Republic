/**
 * republic.nemoclaw.* — RPC handlers for NVIDIA NemoClaw integration
 *
 * Exposes NemoClaw sandbox policies, NVIDIA NIM inference status,
 * and Nemotron model catalog to the hoc-ui.
 *
 * This module wires NemoClaw's declarative network policy engine
 * (nemoclaw-sandbox.ts) into the Republic's RPC surface.
 */

import { ErrorCodes, errorShape } from "../../protocol/index.js";
import type { GatewayRequestHandlers } from "../types.js";
import {
  checkEgressPolicy,
  createPolicy,
  deletePolicy,
  getActivePolicies,
  getPolicy,
  getSandboxPolicyStats,
  updatePolicy,
  type EgressEndpoint,
} from "../../../republic/nemoclaw-sandbox.js";
import { isNvidiaNimAvailable, getCloudProviderStatus } from "../../../republic/cloud-inference.js";

// ─── NVIDIA NIM Model Catalog ─────────────────────────────────────

const NVIDIA_NIM_MODELS = [
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    label: "Nemotron 3 Super 120B",
    params: "120B (12B active MoE)",
    contextWindow: 131072,
    maxOutput: 8192,
    tier: "premium" as const,
  },
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra 253B",
    params: "253B",
    contextWindow: 131072,
    maxOutput: 4096,
    tier: "premium" as const,
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    label: "Nemotron Super 49B v1.5",
    params: "49B",
    contextWindow: 131072,
    maxOutput: 4096,
    tier: "standard" as const,
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    label: "Nemotron 3 Nano 30B",
    params: "30B (3B active MoE)",
    contextWindow: 131072,
    maxOutput: 4096,
    tier: "economy" as const,
  },
];

// ─── RPC Handlers ───────────────────────────────────────────────

export const nemoClawHandlers: GatewayRequestHandlers = {
  /**
   * republic.nemoclaw.status — Overall NemoClaw integration status
   */
  "republic.nemoclaw.status": ({ respond }) => {
    const policyStats = getSandboxPolicyStats();
    const nimAvailable = isNvidiaNimAvailable();
    const providers = getCloudProviderStatus();

    respond(
      true,
      {
        ok: true,
        nemoclawVersion: "0.1.0-hoc",
        repoCloned: true,
        sandbox: {
          mode: process.platform === "linux" ? "enforceable" : "advisory",
          platform: process.platform,
          note:
            process.platform !== "linux"
              ? "Landlock+seccomp enforcement requires Linux 5.13+. Policies are advisory on this platform."
              : "Kernel-level enforcement available via Landlock LSM + seccomp",
        },
        inference: {
          nvidiaNimAvailable: nimAvailable,
          apiKeyConfigured: nimAvailable,
          defaultModel: process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b",
          endpoint: "https://integrate.api.nvidia.com/v1",
          modelsAvailable: NVIDIA_NIM_MODELS.length,
        },
        policies: policyStats,
        cloudProviders: providers,
      },
      undefined,
    );
  },

  /**
   * republic.nemoclaw.policies.list — List all sandbox egress policies
   */
  "republic.nemoclaw.policies.list": ({ respond }) => {
    const policies = getActivePolicies();
    const stats = getSandboxPolicyStats();

    respond(
      true,
      {
        ok: true,
        policies,
        stats,
      },
      undefined,
    );
  },

  /**
   * republic.nemoclaw.policies.get — Get a specific policy by ID
   */
  "republic.nemoclaw.policies.get": ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string };
    if (!p.id?.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }

    const policy = getPolicy(p.id.trim());
    if (!policy) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Policy "${p.id}" not found`),
      );
      return;
    }

    respond(true, { ok: true, policy }, undefined);
  },

  /**
   * republic.nemoclaw.policies.update — Update a sandbox policy
   */
  "republic.nemoclaw.policies.update": ({ params, respond }) => {
    const p = (params ?? {}) as {
      id?: string;
      enabled?: boolean;
      endpoints?: EgressEndpoint[];
      toolNames?: string[];
      label?: string;
    };
    if (!p.id?.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }

    const updates: Record<string, unknown> = {};
    if (p.enabled !== undefined) {updates.enabled = p.enabled;}
    if (p.endpoints) {updates.endpoints = p.endpoints;}
    if (p.toolNames) {updates.toolNames = p.toolNames;}
    if (p.label) {updates.label = p.label;}

    const updated = updatePolicy(p.id.trim(), updates as Parameters<typeof updatePolicy>[1]);
    if (!updated) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Policy "${p.id}" not found`),
      );
      return;
    }

    respond(true, { ok: true, policy: updated }, undefined);
  },

  /**
   * republic.nemoclaw.policies.create — Create a custom egress policy
   */
  "republic.nemoclaw.policies.create": ({ params, respond }) => {
    const p = (params ?? {}) as {
      id?: string;
      label?: string;
      toolNames?: string[];
      endpoints?: EgressEndpoint[];
      enabled?: boolean;
    };

    if (!p.id?.trim() || !p.label?.trim()) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "id and label required"),
      );
      return;
    }

    const existing = getPolicy(p.id.trim());
    if (existing) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Policy "${p.id}" already exists`),
      );
      return;
    }

    const policy = createPolicy({
      id: p.id.trim(),
      label: p.label.trim(),
      toolNames: p.toolNames ?? [],
      endpoints: p.endpoints ?? [],
      enabled: p.enabled ?? true,
    });

    respond(true, { ok: true, policy }, undefined);
  },

  /**
   * republic.nemoclaw.policies.delete — Delete a custom policy
   */
  "republic.nemoclaw.policies.delete": ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string };
    if (!p.id?.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }

    const deleted = deletePolicy(p.id.trim());
    if (!deleted) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Policy "${p.id}" not found or is a built-in policy (use update to disable)`,
        ),
      );
      return;
    }

    respond(true, { ok: true, deleted: true }, undefined);
  },

  /**
   * republic.nemoclaw.policies.check — Check if an egress request would be allowed
   */
  "republic.nemoclaw.policies.check": ({ params, respond }) => {
    const p = (params ?? {}) as {
      toolName?: string;
      targetHost?: string;
      targetPort?: number;
    };

    if (!p.toolName || !p.targetHost || !p.targetPort) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "toolName, targetHost, and targetPort required"),
      );
      return;
    }

    const result = checkEgressPolicy(p.toolName, p.targetHost, p.targetPort);
    respond(true, { ok: true, ...result }, undefined);
  },

  /**
   * republic.nemoclaw.models — List available NVIDIA NIM Nemotron models
   */
  "republic.nemoclaw.models": ({ respond }) => {
    respond(
      true,
      {
        ok: true,
        provider: "nvidia-nim",
        endpoint: "https://integrate.api.nvidia.com/v1",
        configured: isNvidiaNimAvailable(),
        defaultModel: process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b",
        models: NVIDIA_NIM_MODELS,
      },
      undefined,
    );
  },

  /**
   * republic.nemoclaw.inference.test — Test NVIDIA NIM inference connectivity
   */
  "republic.nemoclaw.inference.test": async ({ respond }) => {
    if (!isNvidiaNimAvailable()) {
      respond(true, {
        ok: true,
        reachable: false,
        reason: "NVIDIA_API_KEY not configured — set it in openclaw.json env vars or .env",
      }, undefined);
      return;
    }

    const model = process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b";
    const startMs = Date.now();

    try {
      const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Say 'hello' in one word." }],
          max_tokens: 10,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const latencyMs = Date.now() - startMs;

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        respond(true, {
          ok: true,
          reachable: false,
          reason: `NVIDIA NIM returned HTTP ${resp.status}: ${errText.slice(0, 200)}`,
          latencyMs,
          model,
        }, undefined);
        return;
      }

      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      respond(true, {
        ok: true,
        reachable: true,
        latencyMs,
        model,
        response: data.choices?.[0]?.message?.content ?? "",
        usage: data.usage ?? null,
      }, undefined);
    } catch (err) {
      respond(true, {
        ok: true,
        reachable: false,
        reason: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
        latencyMs: Date.now() - startMs,
        model,
      }, undefined);
    }
  },
};
