import AjvPkg, { type ErrorObject } from "ajv";
import type { SessionsPatchResult } from "../session-utils.types.js";
import {
  AgentEventSchema,
  AgentIdentityParamsSchema,
  AgentIdentityResultSchema,
  AgentParamsSchema,
  AgentsFileEntrySchema,
  AgentsFilesGetParamsSchema,
  AgentsFilesGetResultSchema,
  AgentsFilesListParamsSchema,
  AgentsFilesListResultSchema,
  AgentsFilesSetParamsSchema,
  AgentsFilesSetResultSchema,
  AgentsListParamsSchema,
  AgentsListResultSchema,
  AgentSummarySchema,
  AgentWaitParamsSchema,
  ChannelsLogoutParamsSchema,
  ChannelsStatusParamsSchema,
  ChannelsStatusResultSchema,
  ChatAbortParamsSchema,
  ChatEventSchema,
  ChatHistoryParamsSchema,
  ChatInjectParamsSchema,
  ChatSendParamsSchema,
  ConfigApplyParamsSchema,
  ConfigGetParamsSchema,
  ConfigPatchParamsSchema,
  ConfigSchemaParamsSchema,
  ConfigSchemaResponseSchema,
  ConfigSetParamsSchema,
  ConfigEnvGetParamsSchema,
  ConfigEnvSetParamsSchema,
  ConnectParamsSchema,
  CronAddParamsSchema,
  CronJobSchema,
  CronListParamsSchema,
  CronRemoveParamsSchema,
  CronRunParamsSchema,
  CronRunsParamsSchema,
  CronStatusParamsSchema,
  CronUpdateParamsSchema,
  DevicePairApproveParamsSchema,
  DevicePairListParamsSchema,
  DevicePairRejectParamsSchema,
  DeviceTokenRevokeParamsSchema,
  DeviceTokenRotateParamsSchema,
  ErrorCodes,
  errorShape,
  ErrorShapeSchema,
  EventFrameSchema,
  ExecApprovalRequestParamsSchema,
  ExecApprovalResolveParamsSchema,
  ExecApprovalsGetParamsSchema,
  ExecApprovalsNodeGetParamsSchema,
  ExecApprovalsNodeSetParamsSchema,
  ExecApprovalsSetParamsSchema,
  GatewayFrameSchema,
  HelloOkSchema,
  LogsTailParamsSchema,
  LogsTailResultSchema,
  ModelsListParamsSchema,
  NodeDescribeParamsSchema,
  NodeEventParamsSchema,
  NodeInvokeParamsSchema,
  NodeInvokeResultParamsSchema,
  NodeListParamsSchema,
  NodePairApproveParamsSchema,
  NodePairListParamsSchema,
  NodePairRejectParamsSchema,
  NodePairRequestParamsSchema,
  NodePairVerifyParamsSchema,
  NodeRenameParamsSchema,
  PollParamsSchema,
  PresenceEntrySchema,
  ProtocolSchemas,
  PROTOCOL_VERSION,
  RequestFrameSchema,
  ResponseFrameSchema,
  SendParamsSchema,
  SessionsCompactParamsSchema,
  SessionsDeleteParamsSchema,
  SessionsListParamsSchema,
  SessionsPatchParamsSchema,
  SessionsPreviewParamsSchema,
  SessionsResetParamsSchema,
  SessionsResolveParamsSchema,
  SessionsUsageParamsSchema,
  ShutdownEventSchema,
  SkillsBinsParamsSchema,
  SkillsInstallParamsSchema,
  SkillsStatusParamsSchema,
  SkillsUpdateParamsSchema,
  SnapshotSchema,
  StateVersionSchema,
  TalkModeParamsSchema,
  TickEventSchema,
  UpdateRunParamsSchema,
  WakeParamsSchema,
  WebLoginStartParamsSchema,
  WebLoginWaitParamsSchema,
  WizardCancelParamsSchema,
  WizardNextParamsSchema,
  WizardNextResultSchema,
  WizardStartParamsSchema,
  WizardStartResultSchema,
  WizardStatusParamsSchema,
  WizardStatusResultSchema,
  WizardStepSchema,
  type AgentEvent,
  type AgentIdentityParams,
  type AgentIdentityResult,
  type AgentsFileEntry,
  type AgentsFilesGetParams,
  type AgentsFilesGetResult,
  type AgentsFilesListParams,
  type AgentsFilesListResult,
  type AgentsFilesSetParams,
  type AgentsFilesSetResult,
  type AgentsListParams,
  type AgentsListResult,
  type AgentSummary,
  type AgentWaitParams,
  type ChannelsLogoutParams,
  type ChannelsStatusParams,
  type ChannelsStatusResult,
  type ChatAbortParams,
  type ChatEvent,
  type ChatInjectParams,
  type ConfigApplyParams,
  type ConfigGetParams,
  type ConfigPatchParams,
  type ConfigSchemaParams,
  type ConfigSchemaResponse,
  type ConfigSetParams,
  type ConnectParams,
  type CronAddParams,
  type CronJob,
  type CronListParams,
  type CronRemoveParams,
  type CronRunLogEntry,
  type CronRunParams,
  type CronRunsParams,
  type CronStatusParams,
  type CronUpdateParams,
  type DevicePairApproveParams,
  type DevicePairListParams,
  type DevicePairRejectParams,
  type DeviceTokenRevokeParams,
  type DeviceTokenRotateParams,
  type ErrorShape,
  type EventFrame,
  type ExecApprovalRequestParams,
  type ExecApprovalResolveParams,
  type ExecApprovalsGetParams,
  type ExecApprovalsNodeGetParams,
  type ExecApprovalsNodeSetParams,
  type ExecApprovalsSetParams,
  type ExecApprovalsSnapshot,
  type GatewayFrame,
  type HelloOk,
  type LogsTailParams,
  type LogsTailResult,
  type ModelsListParams,
  type NodeDescribeParams,
  type NodeEventParams,
  type NodeInvokeParams,
  type NodeInvokeResultParams,
  type NodeListParams,
  type NodePairApproveParams,
  type NodePairListParams,
  type NodePairRejectParams,
  type NodePairRequestParams,
  type NodePairVerifyParams,
  type NodeRenameParams,
  type PollParams,
  type PresenceEntry,
  type RequestFrame,
  type ResponseFrame,
  type SessionsCompactParams,
  type SessionsDeleteParams,
  type SessionsListParams,
  type SessionsPatchParams,
  type SessionsPreviewParams,
  type SessionsResetParams,
  type SessionsResolveParams,
  type SessionsUsageParams,
  type ShutdownEvent,
  type SkillsBinsParams,
  type SkillsBinsResult,
  type SkillsInstallParams,
  type SkillsStatusParams,
  type SkillsUpdateParams,
  type Snapshot,
  type StateVersion,
  type TalkModeParams,
  type TickEvent,
  type UpdateRunParams,
  type WakeParams,
  type WebLoginStartParams,
  type WebLoginWaitParams,
  type WizardCancelParams,
  type WizardNextParams,
  type WizardNextResult,
  type WizardStartParams,
  type WizardStartResult,
  type WizardStatusParams,
  type WizardStatusResult,
  type WizardStep,
  type ConfigEnvGetParams,
  type ConfigEnvSetParams,
} from "./schema.js";

const ajv = new (AjvPkg as unknown as new (opts?: object) => import("ajv").default)({
  allErrors: true,
  strict: false,
  removeAdditional: false,
});

export const validateConnectParams = ajv.compile<ConnectParams>(ConnectParamsSchema);
export const validateRequestFrame = ajv.compile<RequestFrame>(RequestFrameSchema);
export const validateResponseFrame = ajv.compile<ResponseFrame>(ResponseFrameSchema);
export const validateEventFrame = ajv.compile<EventFrame>(EventFrameSchema);
export const validateSendParams = ajv.compile(SendParamsSchema);
export const validatePollParams = ajv.compile<PollParams>(PollParamsSchema);
export const validateAgentParams = ajv.compile(AgentParamsSchema);
export const validateAgentIdentityParams =
  ajv.compile<AgentIdentityParams>(AgentIdentityParamsSchema);
export const validateAgentWaitParams = ajv.compile<AgentWaitParams>(AgentWaitParamsSchema);
export const validateWakeParams = ajv.compile<WakeParams>(WakeParamsSchema);
export const validateAgentsListParams = ajv.compile<AgentsListParams>(AgentsListParamsSchema);
export const validateAgentsFilesListParams = ajv.compile<AgentsFilesListParams>(
  AgentsFilesListParamsSchema,
);
export const validateAgentsFilesGetParams = ajv.compile<AgentsFilesGetParams>(
  AgentsFilesGetParamsSchema,
);
export const validateAgentsFilesSetParams = ajv.compile<AgentsFilesSetParams>(
  AgentsFilesSetParamsSchema,
);
export const validateNodePairRequestParams = ajv.compile<NodePairRequestParams>(
  NodePairRequestParamsSchema,
);
export const validateNodePairListParams = ajv.compile<NodePairListParams>(NodePairListParamsSchema);
export const validateNodePairApproveParams = ajv.compile<NodePairApproveParams>(
  NodePairApproveParamsSchema,
);
export const validateNodePairRejectParams = ajv.compile<NodePairRejectParams>(
  NodePairRejectParamsSchema,
);
export const validateNodePairVerifyParams = ajv.compile<NodePairVerifyParams>(
  NodePairVerifyParamsSchema,
);
export const validateNodeRenameParams = ajv.compile<NodeRenameParams>(NodeRenameParamsSchema);
export const validateNodeListParams = ajv.compile<NodeListParams>(NodeListParamsSchema);
export const validateNodeDescribeParams = ajv.compile<NodeDescribeParams>(NodeDescribeParamsSchema);
export const validateNodeInvokeParams = ajv.compile<NodeInvokeParams>(NodeInvokeParamsSchema);
export const validateNodeInvokeResultParams = ajv.compile<NodeInvokeResultParams>(
  NodeInvokeResultParamsSchema,
);
export const validateNodeEventParams = ajv.compile<NodeEventParams>(NodeEventParamsSchema);
export const validateSessionsListParams = ajv.compile<SessionsListParams>(SessionsListParamsSchema);
export const validateSessionsPreviewParams = ajv.compile<SessionsPreviewParams>(
  SessionsPreviewParamsSchema,
);
export const validateSessionsResolveParams = ajv.compile<SessionsResolveParams>(
  SessionsResolveParamsSchema,
);
export const validateSessionsPatchParams =
  ajv.compile<SessionsPatchParams>(SessionsPatchParamsSchema);
export const validateSessionsResetParams =
  ajv.compile<SessionsResetParams>(SessionsResetParamsSchema);
export const validateSessionsDeleteParams = ajv.compile<SessionsDeleteParams>(
  SessionsDeleteParamsSchema,
);
export const validateSessionsCompactParams = ajv.compile<SessionsCompactParams>(
  SessionsCompactParamsSchema,
);
export const validateSessionsUsageParams =
  ajv.compile<SessionsUsageParams>(SessionsUsageParamsSchema);
export const validateConfigGetParams = ajv.compile<ConfigGetParams>(ConfigGetParamsSchema);
export const validateConfigSetParams = ajv.compile<ConfigSetParams>(ConfigSetParamsSchema);
export const validateConfigApplyParams = ajv.compile<ConfigApplyParams>(ConfigApplyParamsSchema);
export const validateConfigPatchParams = ajv.compile<ConfigPatchParams>(ConfigPatchParamsSchema);
export const validateConfigSchemaParams = ajv.compile<ConfigSchemaParams>(ConfigSchemaParamsSchema);
export const validateConfigEnvGetParams = ajv.compile<ConfigEnvGetParams>(ConfigEnvGetParamsSchema);
export const validateConfigEnvSetParams = ajv.compile<ConfigEnvSetParams>(ConfigEnvSetParamsSchema);
export const validateWizardStartParams = ajv.compile<WizardStartParams>(WizardStartParamsSchema);
export const validateWizardNextParams = ajv.compile<WizardNextParams>(WizardNextParamsSchema);
export const validateWizardCancelParams = ajv.compile<WizardCancelParams>(WizardCancelParamsSchema);
export const validateWizardStatusParams = ajv.compile<WizardStatusParams>(WizardStatusParamsSchema);
export const validateTalkModeParams = ajv.compile<TalkModeParams>(TalkModeParamsSchema);
export const validateChannelsStatusParams = ajv.compile<ChannelsStatusParams>(
  ChannelsStatusParamsSchema,
);
export const validateChannelsLogoutParams = ajv.compile<ChannelsLogoutParams>(
  ChannelsLogoutParamsSchema,
);
export const validateModelsListParams = ajv.compile<ModelsListParams>(ModelsListParamsSchema);
export const validateSkillsStatusParams = ajv.compile<SkillsStatusParams>(SkillsStatusParamsSchema);
export const validateSkillsBinsParams = ajv.compile<SkillsBinsParams>(SkillsBinsParamsSchema);
export const validateSkillsInstallParams =
  ajv.compile<SkillsInstallParams>(SkillsInstallParamsSchema);
export const validateSkillsUpdateParams = ajv.compile<SkillsUpdateParams>(SkillsUpdateParamsSchema);
export const validateCronListParams = ajv.compile<CronListParams>(CronListParamsSchema);
export const validateCronStatusParams = ajv.compile<CronStatusParams>(CronStatusParamsSchema);
export const validateCronAddParams = ajv.compile<CronAddParams>(CronAddParamsSchema);
export const validateCronUpdateParams = ajv.compile<CronUpdateParams>(CronUpdateParamsSchema);
export const validateCronRemoveParams = ajv.compile<CronRemoveParams>(CronRemoveParamsSchema);
export const validateCronRunParams = ajv.compile<CronRunParams>(CronRunParamsSchema);
export const validateCronRunsParams = ajv.compile<CronRunsParams>(CronRunsParamsSchema);
export const validateDevicePairListParams = ajv.compile<DevicePairListParams>(
  DevicePairListParamsSchema,
);
export const validateDevicePairApproveParams = ajv.compile<DevicePairApproveParams>(
  DevicePairApproveParamsSchema,
);
export const validateDevicePairRejectParams = ajv.compile<DevicePairRejectParams>(
  DevicePairRejectParamsSchema,
);
export const validateDeviceTokenRotateParams = ajv.compile<DeviceTokenRotateParams>(
  DeviceTokenRotateParamsSchema,
);
export const validateDeviceTokenRevokeParams = ajv.compile<DeviceTokenRevokeParams>(
  DeviceTokenRevokeParamsSchema,
);
export const validateExecApprovalsGetParams = ajv.compile<ExecApprovalsGetParams>(
  ExecApprovalsGetParamsSchema,
);
export const validateExecApprovalsSetParams = ajv.compile<ExecApprovalsSetParams>(
  ExecApprovalsSetParamsSchema,
);
export const validateExecApprovalRequestParams = ajv.compile<ExecApprovalRequestParams>(
  ExecApprovalRequestParamsSchema,
);
export const validateExecApprovalResolveParams = ajv.compile<ExecApprovalResolveParams>(
  ExecApprovalResolveParamsSchema,
);
export const validateExecApprovalsNodeGetParams = ajv.compile<ExecApprovalsNodeGetParams>(
  ExecApprovalsNodeGetParamsSchema,
);
export const validateExecApprovalsNodeSetParams = ajv.compile<ExecApprovalsNodeSetParams>(
  ExecApprovalsNodeSetParamsSchema,
);
export const validateLogsTailParams = ajv.compile<LogsTailParams>(LogsTailParamsSchema);
export const validateChatHistoryParams = ajv.compile(ChatHistoryParamsSchema);
export const validateChatSendParams = ajv.compile(ChatSendParamsSchema);
export const validateChatAbortParams = ajv.compile<ChatAbortParams>(ChatAbortParamsSchema);
export const validateChatInjectParams = ajv.compile<ChatInjectParams>(ChatInjectParamsSchema);
export const validateChatEvent = ajv.compile(ChatEventSchema);
export const validateUpdateRunParams = ajv.compile<UpdateRunParams>(UpdateRunParamsSchema);
export const validateWebLoginStartParams =
  ajv.compile<WebLoginStartParams>(WebLoginStartParamsSchema);
export const validateWebLoginWaitParams = ajv.compile<WebLoginWaitParams>(WebLoginWaitParamsSchema);

export function formatValidationErrors(errors: ErrorObject[] | null | undefined) {
  if (!errors?.length) {
    return "unknown validation error";
  }

  const parts: string[] = [];

  for (const err of errors) {
    const keyword = typeof err?.keyword === "string" ? err.keyword : "";
    const instancePath = typeof err?.instancePath === "string" ? err.instancePath : "";

    if (keyword === "additionalProperties") {
      const params = err?.params as { additionalProperty?: unknown } | undefined;
      const additionalProperty = params?.additionalProperty;
      if (typeof additionalProperty === "string" && additionalProperty.trim()) {
        const where = instancePath ? `at ${instancePath}` : "at root";
        parts.push(`${where}: unexpected property '${additionalProperty}'`);
        continue;
      }
    }

    const message =
      typeof err?.message === "string" && err.message.trim() ? err.message : "validation error";
    const where = instancePath ? `at ${instancePath}: ` : "";
    parts.push(`${where}${message}`);
  }

  // De-dupe while preserving order.
  const unique = Array.from(new Set(parts.filter((part) => part.trim())));
  if (!unique.length) {
    const fallback = ajv.errorsText(errors, { separator: "; " });
    return fallback || "unknown validation error";
  }
  return unique.join("; ");
}

export {
  ConnectParamsSchema,
  HelloOkSchema,
  RequestFrameSchema,
  ResponseFrameSchema,
  EventFrameSchema,
  GatewayFrameSchema,
  PresenceEntrySchema,
  SnapshotSchema,
  ErrorShapeSchema,
  StateVersionSchema,
  AgentEventSchema,
  ChatEventSchema,
  SendParamsSchema,
  PollParamsSchema,
  AgentParamsSchema,
  AgentIdentityParamsSchema,
  AgentIdentityResultSchema,
  WakeParamsSchema,
  NodePairRequestParamsSchema,
  NodePairListParamsSchema,
  NodePairApproveParamsSchema,
  NodePairRejectParamsSchema,
  NodePairVerifyParamsSchema,
  NodeListParamsSchema,
  NodeInvokeParamsSchema,
  SessionsListParamsSchema,
  SessionsPreviewParamsSchema,
  SessionsPatchParamsSchema,
  SessionsResetParamsSchema,
  SessionsDeleteParamsSchema,
  SessionsCompactParamsSchema,
  SessionsUsageParamsSchema,
  ConfigGetParamsSchema,
  ConfigSetParamsSchema,
  ConfigApplyParamsSchema,
  ConfigPatchParamsSchema,
  ConfigSchemaParamsSchema,
  ConfigSchemaResponseSchema,
  ConfigEnvGetParamsSchema,
  ConfigEnvSetParamsSchema,
  WizardStartParamsSchema,
  WizardNextParamsSchema,
  WizardCancelParamsSchema,
  WizardStatusParamsSchema,
  WizardStepSchema,
  WizardNextResultSchema,
  WizardStartResultSchema,
  WizardStatusResultSchema,
  ChannelsStatusParamsSchema,
  ChannelsStatusResultSchema,
  ChannelsLogoutParamsSchema,
  WebLoginStartParamsSchema,
  WebLoginWaitParamsSchema,
  AgentSummarySchema,
  AgentsFileEntrySchema,
  AgentsFilesListParamsSchema,
  AgentsFilesListResultSchema,
  AgentsFilesGetParamsSchema,
  AgentsFilesGetResultSchema,
  AgentsFilesSetParamsSchema,
  AgentsFilesSetResultSchema,
  AgentsListParamsSchema,
  AgentsListResultSchema,
  ModelsListParamsSchema,
  SkillsStatusParamsSchema,
  SkillsInstallParamsSchema,
  SkillsUpdateParamsSchema,
  CronJobSchema,
  CronListParamsSchema,
  CronStatusParamsSchema,
  CronAddParamsSchema,
  CronUpdateParamsSchema,
  CronRemoveParamsSchema,
  CronRunParamsSchema,
  CronRunsParamsSchema,
  LogsTailParamsSchema,
  LogsTailResultSchema,
  ChatHistoryParamsSchema,
  ChatSendParamsSchema,
  ChatInjectParamsSchema,
  UpdateRunParamsSchema,
  TickEventSchema,
  ShutdownEventSchema,
  ProtocolSchemas,
  PROTOCOL_VERSION,
  ErrorCodes,
  errorShape,
};
export type {
  GatewayFrame,
  ConnectParams,
  HelloOk,
  RequestFrame,
  ResponseFrame,
  EventFrame,
  PresenceEntry,
  Snapshot,
  ErrorShape,
  StateVersion,
  AgentEvent,
  AgentIdentityParams,
  AgentIdentityResult,
  AgentWaitParams,
  ChatEvent,
  TickEvent,
  ShutdownEvent,
  WakeParams,
  NodePairRequestParams,
  NodePairListParams,
  NodePairApproveParams,
  DevicePairListParams,
  DevicePairApproveParams,
  DevicePairRejectParams,
  ConfigGetParams,
  ConfigSetParams,
  ConfigApplyParams,
  ConfigPatchParams,
  ConfigSchemaParams,
  ConfigSchemaResponse,
  ConfigEnvGetParams,
  ConfigEnvSetParams,
  WizardStartParams,
  WizardNextParams,
  WizardCancelParams,
  WizardStatusParams,
  WizardStep,
  WizardNextResult,
  WizardStartResult,
  WizardStatusResult,
  TalkModeParams,
  ChannelsStatusParams,
  ChannelsStatusResult,
  ChannelsLogoutParams,
  WebLoginStartParams,
  WebLoginWaitParams,
  AgentSummary,
  AgentsFileEntry,
  AgentsFilesListParams,
  AgentsFilesListResult,
  AgentsFilesGetParams,
  AgentsFilesGetResult,
  AgentsFilesSetParams,
  AgentsFilesSetResult,
  AgentsListParams,
  AgentsListResult,
  SkillsStatusParams,
  SkillsBinsParams,
  SkillsBinsResult,
  SkillsInstallParams,
  SkillsUpdateParams,
  NodePairRejectParams,
  NodePairVerifyParams,
  NodeListParams,
  NodeInvokeParams,
  NodeInvokeResultParams,
  NodeEventParams,
  SessionsListParams,
  SessionsPreviewParams,
  SessionsResolveParams,
  SessionsPatchParams,
  SessionsPatchResult,
  SessionsResetParams,
  SessionsDeleteParams,
  SessionsCompactParams,
  SessionsUsageParams,
  CronJob,
  CronListParams,
  CronStatusParams,
  CronAddParams,
  CronUpdateParams,
  CronRemoveParams,
  CronRunParams,
  CronRunsParams,
  CronRunLogEntry,
  ExecApprovalsGetParams,
  ExecApprovalsSetParams,
  ExecApprovalsSnapshot,
  LogsTailParams,
  LogsTailResult,
  PollParams,
  UpdateRunParams,
  ChatInjectParams,
};
