/**
 * Republic Gateway Handlers â€” hardware
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import {
    closeConversation, getActiveConversations, getCitizenConversations, getConversation as getCitizenConv, getConversationDiagnostics, getConversationHistory, recordCitizenResponse, sendUserMessage, startConversation
} from "../../../republic/citizen-conversation.js";
import type { GatewayRequestHandlers } from "../types.js";
// Phase 36: Dynamic Compute Scaling
// Phase 35: Docker Orchestration Engine
// ─── Module Imports ─────────────────────────────────────────────
import {
    bridgeEdgeCompute, createAutomationRule, deleteAutomationRule, evaluateAutomations, getActuatorLog, getDevices, getEdgeComputeResults,
    getHardwareIoTDiagnostics, getSensorHistory, listAutomationRules, readSensor,
    recordSensorData, registerDevice,
    removeDevice, sendActuatorCommand, updateDeviceStatus
} from "../../../republic/hardware-iot.js";
// Phase 33: Infrastructure Control Plane
// Phase 34: HuggingFace Model Provisioner
import {
    applyUserDirective, assignCitizensToWorkflow, cancelWorkflow, createWorkflow,
    decomposeWorkflow, getOrchestratorDiagnostics, getWorkflowById, getWorkflows, getWorkflowStatus, pauseWorkflow,
    resumeWorkflow, startWorkflow
} from "../../../republic/orchestrator.js";
// Phase 37: Database Persistence Layer
import {
    addProcessOutput, cancelProcess,
    completeStep, createProcess, failStep, getActiveProcesses, getCitizenProcesses, getProcessById, getProcessDiagnostics, getProcesses, injectUserNote, pauseProcess, reassignStep, resumeProcess, setProcessPriority, startProcess, updateStepProgress
} from "../../../republic/process-manager.js";
import {
    getState
} from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const hardwareHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Phase 14: Hardware & IoT ─────────────────────────────────

  "republic.iot.registerDevice": ({ params, respond }) => {
    const p = params as
      | {
          name?: string;
          type?: string;
          protocol?: string;
          capabilities?: string[];
          endpoint?: string;
          metadata?: Record<string, unknown>;
          citizenId?: string;
        }
      | undefined;
    type _DT = "sensor" | "actuator" | "hybrid" | "edge_compute";
    type _DP = "mqtt" | "http" | "ws" | "ble" | "zigbee" | "custom";
    if (!p?.name || !p?.type || !p?.protocol) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name, type, and protocol required"),
      );
      return;
    }
    try {
      const s = getState();
      const device = registerDevice(
        s,
        p.name,
        p.type as _DT,
        p.protocol as _DP,
        p.capabilities ?? [],
        p.endpoint,
        p.metadata ?? {},
        p.citizenId,
      );
      respond(true, { ok: true, device }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.iot.removeDevice": ({ params, respond }) => {
    const p = params as { deviceId?: string } | undefined;
    if (!p?.deviceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "deviceId required"));
      return;
    }
    const s = getState();
    const ok = removeDevice(s, p.deviceId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Device not found"),
    );
  },

  "republic.iot.updateDeviceStatus": ({ params, respond }) => {
    const p = params as { deviceId?: string; status?: string } | undefined;
    if (!p?.deviceId || !p?.status) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "deviceId and status required"),
      );
      return;
    }
    const s = getState();
    const ok = updateDeviceStatus(
      s,
      p.deviceId,
      p.status as "online" | "offline" | "error" | "maintenance",
    );
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Device not found"),
    );
  },

  "republic.iot.getDevices": ({ params, respond }) => {
    const p = params as { typeFilter?: string } | undefined;
    const s = getState();
    respond(
      true,
      {
        ok: true,
        devices: getDevices(
          s,
          p?.typeFilter as "sensor" | "actuator" | "hybrid" | "edge_compute" | undefined,
        ),
      },
      undefined,
    );
  },

  "republic.iot.readSensor": ({ params, respond }) => {
    const p = params as { deviceId?: string; metric?: string } | undefined;
    if (!p?.deviceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "deviceId required"));
      return;
    }
    const s = getState();
    const reading = readSensor(s, p.deviceId, p.metric);
    respond(true, { ok: true, reading: reading ?? null }, undefined);
  },

  "republic.iot.recordSensorData": ({ params, respond }) => {
    const p = params as
      | { deviceId?: string; metric?: string; value?: number; unit?: string }
      | undefined;
    if (!p?.deviceId || !p?.metric || p.value === undefined || !p?.unit) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "deviceId, metric, value, and unit required"),
      );
      return;
    }
    try {
      const s = getState();
      const reading = recordSensorData(s, p.deviceId, p.metric, p.value, p.unit);
      respond(true, { ok: true, reading }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
    }
  },

  "republic.iot.getSensorHistory": ({ params, respond }) => {
    const p = params as { deviceId?: string; metric?: string; limit?: number } | undefined;
    if (!p?.deviceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "deviceId required"));
      return;
    }
    const s = getState();
    respond(
      true,
      { ok: true, readings: getSensorHistory(s, p.deviceId, p.metric, p.limit ?? 100) },
      undefined,
    );
  },

  "republic.iot.sendActuatorCommand": ({ params, respond }) => {
    const p = params as
      | { deviceId?: string; command?: string; params?: Record<string, unknown> }
      | undefined;
    if (!p?.deviceId || !p?.command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "deviceId and command required"),
      );
      return;
    }
    try {
      const s = getState();
      const cmd = sendActuatorCommand(s, p.deviceId, p.command, p.params ?? {});
      respond(true, { ok: true, command: cmd }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
    }
  },

  "republic.iot.getActuatorLog": ({ params, respond }) => {
    const p = params as { deviceId?: string; limit?: number } | undefined;
    respond(true, { ok: true, commands: getActuatorLog(p?.deviceId, p?.limit ?? 50) }, undefined);
  },

  "republic.iot.createAutomation": ({ params, respond }) => {
    const p = params as
      | {
          name?: string;
          conditionDeviceId?: string;
          conditionMetric?: string;
          conditionOperator?: string;
          conditionThreshold?: number;
          actionDeviceId?: string;
          actionCommand?: string;
          actionParams?: Record<string, unknown>;
          cooldownMs?: number;
        }
      | undefined;
    if (
      !p?.name ||
      !p?.conditionDeviceId ||
      !p?.conditionMetric ||
      !p?.conditionOperator ||
      p?.conditionThreshold === undefined ||
      !p?.actionDeviceId ||
      !p?.actionCommand
    ) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "name, condition (deviceId, metric, operator, threshold), and action (deviceId, command) required",
        ),
      );
      return;
    }
    try {
      const s = getState();
      const rule = createAutomationRule(
        s,
        p.name,
        p.conditionDeviceId,
        p.conditionMetric,
        p.conditionOperator as "gt" | "lt" | "eq" | "gte" | "lte",
        p.conditionThreshold,
        p.actionDeviceId,
        p.actionCommand,
        p.actionParams ?? {},
        p.cooldownMs ?? 60000,
      );
      respond(true, { ok: true, rule }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.iot.evaluateAutomations": ({ respond }) => {
    const s = getState();
    const results = evaluateAutomations(s);
    respond(true, { ok: true, results }, undefined);
  },

  "republic.iot.listAutomationRules": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, rules: listAutomationRules(s) }, undefined);
  },

  "republic.iot.deleteAutomation": ({ params, respond }) => {
    const p = params as { ruleId?: string } | undefined;
    if (!p?.ruleId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "ruleId required"));
      return;
    }
    const s = getState();
    const ok = deleteAutomationRule(s, p.ruleId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Rule not found"),
    );
  },

  "republic.iot.bridgeEdgeCompute": ({ params, respond }) => {
    const p = params as { deviceId?: string; taskPayload?: Record<string, unknown> } | undefined;
    if (!p?.deviceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "deviceId required"));
      return;
    }
    try {
      const s = getState();
      const result = bridgeEdgeCompute(s, p.deviceId, p.taskPayload ?? {});
      respond(true, { ok: true, ...result }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
    }
  },

  "republic.iot.getEdgeComputeResults": ({ params, respond }) => {
    const p = params as { taskId?: string } | undefined;
    if (!p?.taskId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId required"));
      return;
    }
    const result = getEdgeComputeResults(p.taskId);
    respond(true, { ok: true, result: result ?? null }, undefined);
  },

  "republic.iot.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getHardwareIoTDiagnostics(s), undefined);
  },

  // ─── Phase 15: Process Orchestration ────────────────────────

  "republic.process.create": ({ params, respond }) => {
    const p = params as
      | {
          citizenId?: string;
          title?: string;
          description?: string;
          steps?: Array<{ title: string; description: string; toolName?: string }>;
          priority?: string;
        }
      | undefined;
    if (!p?.citizenId || !p?.title) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and title required"),
      );
      return;
    }
    try {
      const s = getState();
      const process = createProcess(
        s,
        p.citizenId,
        p.title,
        p.description ?? "",
        p.steps ?? [],
        (p.priority ?? "normal") as "low" | "normal" | "high" | "critical",
      );
      respond(true, { ok: true, process }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.process.start": ({ params, respond }) => {
    const p = params as { processId?: string } | undefined;
    if (!p?.processId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "processId required"));
      return;
    }
    const s = getState();
    const ok = startProcess(s, p.processId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot start process"),
    );
  },

  "republic.process.pause": ({ params, respond }) => {
    const p = params as { processId?: string; reason?: string } | undefined;
    if (!p?.processId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "processId required"));
      return;
    }
    const s = getState();
    const ok = pauseProcess(s, p.processId, p.reason);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot pause process"),
    );
  },

  "republic.process.resume": ({ params, respond }) => {
    const p = params as { processId?: string } | undefined;
    if (!p?.processId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "processId required"));
      return;
    }
    const s = getState();
    const ok = resumeProcess(s, p.processId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot resume process"),
    );
  },

  "republic.process.cancel": ({ params, respond }) => {
    const p = params as { processId?: string } | undefined;
    if (!p?.processId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "processId required"));
      return;
    }
    const s = getState();
    const ok = cancelProcess(s, p.processId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot cancel process"),
    );
  },

  "republic.process.completeStep": ({ params, respond }) => {
    const p = params as { processId?: string; stepId?: string; output?: unknown } | undefined;
    if (!p?.processId || !p?.stepId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "processId and stepId required"),
      );
      return;
    }
    const s = getState();
    const ok = completeStep(s, p.processId, p.stepId, p.output);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot complete step"),
    );
  },

  "republic.process.failStep": ({ params, respond }) => {
    const p = params as { processId?: string; stepId?: string; error?: string } | undefined;
    if (!p?.processId || !p?.stepId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "processId and stepId required"),
      );
      return;
    }
    const s = getState();
    const ok = failStep(s, p.processId, p.stepId, p.error ?? "Step failed");
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot fail step"),
    );
  },

  "republic.process.updateProgress": ({ params, respond }) => {
    const p = params as { processId?: string; stepId?: string; progress?: number } | undefined;
    if (!p?.processId || !p?.stepId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "processId and stepId required"),
      );
      return;
    }
    const s = getState();
    const ok = updateStepProgress(s, p.processId, p.stepId, p.progress ?? 0);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Step not found"),
    );
  },

  "republic.process.injectNote": ({ params, respond }) => {
    const p = params as { processId?: string; note?: string } | undefined;
    if (!p?.processId || !p?.note) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "processId and note required"),
      );
      return;
    }
    const s = getState();
    const ok = injectUserNote(s, p.processId, p.note);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Process not found"),
    );
  },

  "republic.process.reassignStep": ({ params, respond }) => {
    const p = params as { processId?: string; stepId?: string; citizenId?: string } | undefined;
    if (!p?.processId || !p?.stepId || !p?.citizenId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "processId, stepId, citizenId required"),
      );
      return;
    }
    const s = getState();
    const ok = reassignStep(s, p.processId, p.stepId, p.citizenId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Step or citizen not found"),
    );
  },

  "republic.process.setPriority": ({ params, respond }) => {
    const p = params as { processId?: string; priority?: string } | undefined;
    if (!p?.processId || !p?.priority) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "processId and priority required"),
      );
      return;
    }
    const s = getState();
    const ok = setProcessPriority(
      s,
      p.processId,
      p.priority as "low" | "normal" | "high" | "critical",
    );
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Process not found"),
    );
  },

  "republic.process.addOutput": ({ params, respond }) => {
    const p = params as
      | { processId?: string; type?: string; title?: string; path?: string; data?: unknown }
      | undefined;
    if (!p?.processId || !p?.title) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "processId and title required"),
      );
      return;
    }
    const s = getState();
    const output = addProcessOutput(s, p.processId, {
      type: (p.type ?? "other") as
        | "file"
        | "artifact"
        | "report"
        | "screenshot"
        | "video"
        | "other",
      title: p.title,
      path: p.path,
      data: p.data,
    });
    respond(
      output !== null,
      output ? { ok: true, output } : undefined,
      output ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Process not found"),
    );
  },

  "republic.process.list": ({ params, respond }) => {
    const p = params as { citizenId?: string; status?: string; priority?: string } | undefined;
    const s = getState();
    const processes = getProcesses(
      s,
      p
        ? {
            citizenId: p.citizenId,
            status: p.status as
              | "queued"
              | "running"
              | "paused"
              | "completed"
              | "cancelled"
              | "failed"
              | undefined,
            priority: p.priority as "low" | "normal" | "high" | "critical" | undefined,
          }
        : undefined,
    );
    respond(true, { ok: true, processes }, undefined);
  },

  "republic.process.get": ({ params, respond }) => {
    const p = params as { processId?: string } | undefined;
    if (!p?.processId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "processId required"));
      return;
    }
    const s = getState();
    const process = getProcessById(s, p.processId);
    respond(
      process !== undefined,
      process ? { ok: true, process } : undefined,
      process ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Process not found"),
    );
  },

  "republic.process.active": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, processes: getActiveProcesses(s) }, undefined);
  },

  "republic.process.citizenProcesses": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    respond(true, { ok: true, processes: getCitizenProcesses(s, p.citizenId) }, undefined);
  },

  "republic.process.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getProcessDiagnostics(s), undefined);
  },

  // ─── Phase 15: Citizen Conversation ─────────────────────────

  "republic.conversation.start": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    try {
      const s = getState();
      const conversation = startConversation(s, p.citizenId);
      respond(true, { ok: true, conversation }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.conversation.send": ({ params, respond }) => {
    const p = params as { conversationId?: string; content?: string } | undefined;
    if (!p?.conversationId || !p?.content) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "conversationId and content required"),
      );
      return;
    }
    try {
      const s = getState();
      const message = sendUserMessage(s, p.conversationId, p.content);
      respond(true, { ok: true, message }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.conversation.respond": ({ params, respond }) => {
    const p = params as
      | { conversationId?: string; content?: string; reasoning?: string; actionTaken?: string }
      | undefined;
    if (!p?.conversationId || !p?.content) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "conversationId and content required"),
      );
      return;
    }
    try {
      const s = getState();
      const message = recordCitizenResponse(s, p.conversationId, p.content, {
        reasoning: p.reasoning,
        actionTaken: p.actionTaken,
      });
      respond(true, { ok: true, message }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.conversation.close": ({ params, respond }) => {
    const p = params as { conversationId?: string } | undefined;
    if (!p?.conversationId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "conversationId required"));
      return;
    }
    const s = getState();
    const ok = closeConversation(s, p.conversationId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Conversation not found"),
    );
  },

  "republic.conversation.get": ({ params, respond }) => {
    const p = params as { conversationId?: string } | undefined;
    if (!p?.conversationId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "conversationId required"));
      return;
    }
    const s = getState();
    const conversation = getCitizenConv(s, p.conversationId);
    respond(
      conversation !== undefined,
      conversation ? { ok: true, conversation } : undefined,
      conversation ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Conversation not found"),
    );
  },

  "republic.conversation.history": ({ params, respond }) => {
    const p = params as { conversationId?: string; limit?: number } | undefined;
    if (!p?.conversationId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "conversationId required"));
      return;
    }
    const s = getState();
    respond(
      true,
      { ok: true, messages: getConversationHistory(s, p.conversationId, p.limit) },
      undefined,
    );
  },

  "republic.conversation.citizenConversations": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    respond(true, { ok: true, conversations: getCitizenConversations(s, p.citizenId) }, undefined);
  },

  "republic.conversation.active": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, conversations: getActiveConversations(s) }, undefined);
  },

  "republic.conversation.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getConversationDiagnostics(s), undefined);
  },

  // ─── Phase 15: Workflow Orchestrator ────────────────────────

  "republic.workflow.create": ({ params, respond }) => {
    const p = params as { title?: string; description?: string } | undefined;
    if (!p?.title) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title required"));
      return;
    }
    try {
      const s = getState();
      const workflow = createWorkflow(s, p.title, p.description ?? "");
      respond(true, { ok: true, workflow }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.workflow.decompose": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    if (!p?.workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId required"));
      return;
    }
    try {
      const s = getState();
      const phases = decomposeWorkflow(s, p.workflowId);
      respond(true, { ok: true, phases }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.workflow.assignCitizens": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    if (!p?.workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId required"));
      return;
    }
    try {
      const s = getState();
      const citizens = assignCitizensToWorkflow(s, p.workflowId);
      respond(true, { ok: true, assignedCitizens: citizens }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.workflow.start": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    if (!p?.workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId required"));
      return;
    }
    const s = getState();
    const ok = startWorkflow(s, p.workflowId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot start workflow"),
    );
  },

  "republic.workflow.pause": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    if (!p?.workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId required"));
      return;
    }
    const s = getState();
    const ok = pauseWorkflow(s, p.workflowId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot pause workflow"),
    );
  },

  "republic.workflow.resume": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    if (!p?.workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId required"));
      return;
    }
    const s = getState();
    const ok = resumeWorkflow(s, p.workflowId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot resume workflow"),
    );
  },

  "republic.workflow.cancel": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    if (!p?.workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId required"));
      return;
    }
    const s = getState();
    const ok = cancelWorkflow(s, p.workflowId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot cancel workflow"),
    );
  },

  "republic.workflow.directive": ({ params, respond }) => {
    const p = params as { workflowId?: string; directive?: string } | undefined;
    if (!p?.workflowId || !p?.directive) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "workflowId and directive required"),
      );
      return;
    }
    const s = getState();
    const ok = applyUserDirective(s, p.workflowId, p.directive);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Workflow not found"),
    );
  },

  "republic.workflow.list": ({ params, respond }) => {
    const p = params as { status?: string } | undefined;
    const s = getState();
    const workflows = getWorkflows(
      s,
      p?.status as
        | "draft"
        | "running"
        | "paused"
        | "cancelled"
        | "completed"
        | "failed"
        | undefined,
    );
    respond(true, { ok: true, workflows }, undefined);
  },

  "republic.workflow.get": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    if (!p?.workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId required"));
      return;
    }
    const s = getState();
    const workflow = getWorkflowById(s, p.workflowId);
    respond(
      workflow !== undefined,
      workflow ? { ok: true, workflow } : undefined,
      workflow ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Workflow not found"),
    );
  },

  "republic.workflow.status": ({ params, respond }) => {
    const p = params as { workflowId?: string } | undefined;
    if (!p?.workflowId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "workflowId required"));
      return;
    }
    const s = getState();
    const status = getWorkflowStatus(s, p.workflowId);
    respond(
      status !== null,
      status ? { ok: true, ...status } : undefined,
      status ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Workflow not found"),
    );
  },

  "republic.workflow.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getOrchestratorDiagnostics(s), undefined);
  },

  // --- Hardware Resource Manager -----------------------------
  // Real-time hardware utilization, admission control &
  // lifecycle management for resource-intensive features.

  "republic.hardware.resource.snapshot": ({ respond }) => {
    import("../../../republic/hardware-manager.js").then(({ getHardwareSnapshot }) => {
      respond(true, { ok: true, snapshot: getHardwareSnapshot() }, undefined);
    }).catch((err: unknown) => {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    });
  },

  "republic.hardware.resource.canFit": ({ params, respond }) => {
    const p = params as { ramGB?: number; vramGB?: number } | undefined;
    import("../../../republic/hardware-manager.js").then(({ canFit }) =>
      canFit(p?.ramGB ?? 0.5, p?.vramGB ?? 0).then((result) => {
        respond(true, { ok: true, ...result }, undefined);
      }),
    ).catch((err: unknown) => {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    });
  },

  "republic.hardware.resource.request": ({ params, respond }) => {
    const p = params as { featureId?: string } | undefined;
    if (!p?.featureId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "featureId required"));
      return;
    }
    const fid = p.featureId;
    import("../../../republic/hardware-manager.js").then(({ requestResources }) =>
      requestResources(fid).then((alloc) => {
        respond(true, { ok: true, allocation: alloc }, undefined);
      }),
    ).catch((err: unknown) => {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    });
  },

  "republic.hardware.resource.release": ({ params, respond }) => {
    const p = params as { featureId?: string } | undefined;
    if (!p?.featureId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "featureId required"));
      return;
    }
    const fid = p.featureId;
    import("../../../republic/hardware-manager.js").then(({ releaseResources }) =>
      releaseResources(fid).then(() => {
        respond(true, { ok: true }, undefined);
      }),
    ).catch((err: unknown) => {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    });
  },

  "republic.hardware.resource.registerFeature": ({ params, respond }) => {
    const p = params as {
      featureId?: string;
      name?: string;
      category?: string;
      ramGB?: number;
      vramGB?: number;
      cpuFraction?: number;
      priority?: string;
      preemptible?: boolean;
    } | undefined;
    if (!p?.featureId || !p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "featureId and name required"));
      return;
    }
    const { featureId, name, category, ramGB, vramGB, cpuFraction, priority, preemptible } = p;
    import("../../../republic/hardware-manager.js").then(({ registerFeature }) => {
      registerFeature(featureId, {
        name: name,
        category: (category ?? "plugin") as "llm" | "plugin" | "agent" | "infra" | "other",
        ramGB: ramGB ?? 0.2,
        vramGB: vramGB ?? 0,
        cpuFraction: cpuFraction ?? 0.05,
        priority: (priority ?? "plugin") as "background" | "citizen" | "plugin" | "system" | "critical",
        preemptible: preemptible ?? true,
      });
      respond(true, { ok: true }, undefined);
    }).catch((err: unknown) => {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    });
  },

  "republic.hardware.resource.listFeatures": ({ respond }) => {
    import("../../../republic/hardware-manager.js").then(({ getHardwareSnapshot }) => {
      const snap = getHardwareSnapshot();
      respond(true, { ok: true, allocations: snap.allocations, queueDepth: snap.queueDepth, pressure: snap.pressure }, undefined);
    }).catch((err: unknown) => {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    });
  },

  "republic.hardware.resource.survey": ({ respond }) => {
    import("../../../republic/hardware-manager.js").then(({ surveyHardware }) =>
      surveyHardware().then((resources) => {
        respond(true, { ok: true, resources }, undefined);
      }),
    ).catch((err: unknown) => {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    });
  },

};
