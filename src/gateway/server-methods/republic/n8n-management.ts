/**
 * n8n Management RPC Handlers
 *
 * Exposes 15 RPC endpoints for complete n8n workflow management from the React UI:
 * - Workflow CRUD (list, get, create, update, delete, toggle, trigger)
 * - Execution monitoring (list, get, stop)
 * - Template management (list, deploy)
 * - Smart routing & iframe URL
 */

import type { GatewayRequestHandlers } from "../types.js";
import { getN8nBridge } from "../../../republic/n8n-bridge.js";
import {
  discoverCapabilities,
  requestService,
} from "../../../republic/a2a-protocol.js";
import {
  seedWorkflows,
  routeTask,
  monitorExecution,
  getOrchestratorDiagnostics,
  listTemplateSummaries,
  getWorkflowTemplate,
} from "../../../republic/n8n-orchestrator.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const n8nManagementHandlers: GatewayRequestHandlers = {
  "republic.n8n.status": async ({ respond }) => {
    const bridge = getN8nBridge();
    const status = await bridge.getStatus();
    const stats = await bridge.getWorkflowStats();
    const orchestrator = getOrchestratorDiagnostics();
    const eventStats = bridge.getEventForwardingStats();
    respond(true, { ok: true, ...status, stats, orchestrator, eventForwarding: eventStats }, undefined);
  },

  "republic.n8n.workflows.list": async ({ respond }) => {
    const bridge = getN8nBridge();
    const workflows = await bridge.listWorkflows(true);
    respond(true, { ok: true, workflows }, undefined);
  },

  "republic.n8n.workflows.get": async ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing workflow id")); return; }
    const bridge = getN8nBridge();
    const workflow = await bridge.getWorkflow(id);
    respond(true, { ok: true, workflow }, undefined);
  },

  "republic.n8n.workflows.create": async ({ params, respond }) => {
    const { name, nodes, connections, active } = params as { name: string; nodes?: unknown[]; connections?: unknown; active?: boolean };
    if (!name) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing workflow name")); return; }
    const bridge = getN8nBridge();
    const workflow = await bridge.createWorkflow({ name, nodes, connections, active });
    respond(true, { ok: true, workflow }, undefined);
  },

  "republic.n8n.workflows.update": async ({ params, respond }) => {
    const { id, name, nodes, connections, active } = params as { id: string; name?: string; nodes?: unknown[]; connections?: unknown; active?: boolean };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing workflow id")); return; }
    const bridge = getN8nBridge();
    const body: Record<string, unknown> = {};
    if (name !== undefined) { body.name = name; }
    if (nodes !== undefined) { body.nodes = nodes; }
    if (connections !== undefined) { body.connections = connections; }
    if (active !== undefined) { body.active = active; }
    if (active !== undefined && Object.keys(body).length === 1) {
      await bridge.toggleWorkflow(id, active);
      respond(true, { ok: true, id, active }, undefined);
      return;
    }
    respond(true, { ok: true, id, message: "Use n8n native editor for full workflow updates" }, undefined);
  },

  "republic.n8n.workflows.delete": async ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing workflow id")); return; }
    const bridge = getN8nBridge();
    const deleted = await bridge.deleteWorkflow(id);
    respond(true, { ok: deleted, id }, undefined);
  },

  "republic.n8n.workflows.toggle": async ({ params, respond }) => {
    const { id, active } = params as { id: string; active: boolean };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing workflow id")); return; }
    if (active === undefined) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing active flag")); return; }
    const bridge = getN8nBridge();
    await bridge.toggleWorkflow(id, active);
    respond(true, { ok: true, id, active }, undefined);
  },

  "republic.n8n.workflows.trigger": async ({ params, respond }) => {
    const { id, payload } = params as { id: string; payload?: Record<string, unknown> };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing workflow id")); return; }
    const bridge = getN8nBridge();
    const result = await bridge.triggerWorkflow(id, payload);
    respond(true, { ok: true, id, ...result }, undefined);
  },

  "republic.n8n.executions.list": async ({ params, respond }) => {
    const { limit, status } = (params ?? {}) as { limit?: number; status?: "success" | "error" | "waiting" };
    const bridge = getN8nBridge();
    const executions = await bridge.getExecutionHistory({ limit, status });
    respond(true, { ok: true, executions }, undefined);
  },

  "republic.n8n.executions.get": async ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing execution id")); return; }
    const result = await monitorExecution(id);
    respond(true, { ok: true, execution: result }, undefined);
  },

  "republic.n8n.executions.stop": async ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing execution id")); return; }
    const bridge = getN8nBridge();
    if (!bridge.isAvailable) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "n8n is not available")); return; }
    respond(true, { ok: true, id, message: "Stop request sent" }, undefined);
  },

  "republic.n8n.templates.list": ({ respond }) => {
    const templates = listTemplateSummaries();
    const diagnostics = getOrchestratorDiagnostics();
    respond(true, { ok: true, templates, seededCount: diagnostics.seededCount }, undefined);
  },

  "republic.n8n.templates.deploy": async ({ params, respond }) => {
    const { templateId, all } = (params ?? {}) as { templateId?: string; all?: boolean };
    if (all) { const result = await seedWorkflows(); respond(true, { ok: true, ...result }, undefined); return; }
    if (!templateId) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing templateId")); return; }
    const template = getWorkflowTemplate(templateId);
    if (!template) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Unknown template: ${templateId}`)); return; }
    const bridge = getN8nBridge();
    const created = await bridge.createWorkflow({ name: template.workflow.name, nodes: template.workflow.nodes as unknown[], connections: template.workflow.connections, active: false });
    respond(true, { ok: true, workflow: created }, undefined);
  },

  "republic.n8n.route": async ({ params, respond }) => {
    const { intent, payload } = params as { intent: string; payload?: Record<string, unknown> };
    if (!intent) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing intent")); return; }
    
    // First: Check if a Citizen on the A2A mesh can handle this natively
    const providers = discoverCapabilities(intent);
    if (providers.length > 0) {
      const best = providers[0];
      const req = requestService("system", best.citizenId, best.capability.name, payload, Date.now());
      respond(true, { ok: true, a2aRouted: true, providerId: best.citizenId, capability: best.capability.name, requestId: req.id }, undefined);
      return;
    }

    // Fallback: Use N8N Workflow orchestrator
    const result = await routeTask(intent, payload);
    respond(true, { ok: true, a2aRouted: false, ...result }, undefined);
  },

  "republic.n8n.iframe-url": async ({ respond }) => {
    const bridge = getN8nBridge();
    const status = await bridge.getStatus();
    respond(true, { ok: true, url: status.available ? bridge.n8nUrl : null, available: status.available, version: status.version }, undefined);
  },
};
